/**
 * Line tracer with cross-file stitch — A2 (Tracer), issue #21 / Part D (steps 1–5).
 *
 * THE REAL ENGINE. Resolves a line backward to the commit that introduced its *behavior*,
 * following moves and renames across files.
 *
 * Algorithm:
 *  1. In-file lineage: `git log -L<line>,<line>:<path>` with -M -C (via GitClient.lineHistory),
 *     newest → oldest. Rename detection is handled natively by -M -C.
 *  2. File-introduction wall: the oldest step is a "wall" when the file/region was *added*
 *     in that commit (isFileAddition), which is frequently a MOVE, not the true origin.
 *  3. Cross-file stitch: at the wall, find the move source (the other side of the move —
 *     the old file the code came from) and pickaxe a distinctive token (filtered to the old
 *     path) to find where the code first entered the repo. Stitch that older lineage on.
 *  4. Classify each commit cosmetic/behavioral (classifier.ts); only behavioral commits
 *     become candidates.
 *  5. Build the candidate set with per-candidate scoring signals (consumed by score.ts).
 *
 * Depth is capped (Part D.8). Cross-file stitch recurses at most STITCH_DEPTH times.
 */

import type { Candidate, Commit, GitClient, LineHistoryStep } from '../core/index.js';
import { classifyChange } from './classifier.js';
import type { CandidateSignals } from './score.js';
import { tokenize } from './classifier.js';

export interface TraceResult {
  /** Behavioral commits in order (oldest → newest), shown for ambiguous cases. */
  lineage: Commit[];
  /** Every behavioral commit becomes a candidate (scored later in score.ts). */
  candidates: Candidate[];
  /** Per-candidate scoring signals keyed by SHA (fed into score.ts). */
  signals: Record<string, CandidateSignals>;
  /** Did the line resolve cleanly (no broken wall, no failed stitch)? */
  cleanTrace: boolean;
  /** Ambiguous boundaries crossed during tracing (moves, stitches). */
  ambiguousBoundaries: number;
  /** The current text of the queried line, used for token-overlap scoring. */
  lineContent: string;
}

/** Default cap on in-file history steps walked (Part D.8). */
export const MAX_HISTORY_DEPTH = 50;
/** How many times the cross-file stitch may recurse across file boundaries. */
export const STITCH_DEPTH = 3;

/** One step with its classification and the file path it lived in. */
interface ClassifiedStep {
  step: LineHistoryStep;
  isCosmetic: boolean;
  reason: string;
}

export class LineTracer {
  constructor(
    private readonly git: GitClient,
    private readonly maxDepth: number = MAX_HISTORY_DEPTH,
  ) {}

  async trace(path: string, line: number): Promise<TraceResult> {
    // ---- step 1: in-file lineage (newest → oldest) ----
    const steps = (await this.git.lineHistory(path, line)).slice(0, this.maxDepth);

    if (steps.length === 0) {
      return {
        lineage: [],
        candidates: [],
        signals: {},
        cleanTrace: false,
        ambiguousBoundaries: 0,
        lineContent: '',
      };
    }

    // The current line content is the added line at the newest step that touched it.
    const lineContent = this.currentLineContent(steps);

    // Collect (sha, path, added, removed) across all stitched lineages, oldest → newest.
    const collected: ClassifiedStep[] = [];
    for (const s of steps) collected.push(await this.classify(s));

    // ---- steps 2+3: detect the wall at the OLDEST step and stitch across files ----
    let ambiguousBoundaries = 0;
    let cleanTrace = true;

    let depth = 0;
    // The current oldest step is the candidate wall.
    let wall = steps[steps.length - 1] as LineHistoryStep;

    while (depth < STITCH_DEPTH) {
      const stitched = await this.stitchAcrossWall(wall);
      if (!stitched) break; // not a wall (true origin) — stop.

      ambiguousBoundaries += 1; // crossing a move is an ambiguous boundary.
      // Prepend the older lineage (oldest of `stitched.steps` becomes the new oldest).
      for (const s of stitched.steps) collected.push(await this.classify(s));
      if (stitched.steps.length === 0) {
        // We knew it was a wall but couldn't recover the origin → not clean.
        cleanTrace = false;
        break;
      }
      wall = stitched.steps[stitched.steps.length - 1] as LineHistoryStep;
      depth += 1;
    }

    // ---- step 4: keep behavioral commits as candidates, oldest → newest ----
    // Resolve full Commit metadata for each behavioral step. De-dup by SHA.
    const seen = new Set<string>();
    const behavioral: ClassifiedStep[] = [];
    for (const cs of collected) {
      if (seen.has(cs.step.sha)) continue;
      seen.add(cs.step.sha);
      if (!cs.isCosmetic) behavioral.push(cs);
    }

    // Order oldest → newest (collected is newest → oldest across each segment).
    const ordered = await this.toCommitsOldestFirst(behavioral);

    // ---- step 5: build candidates + scoring signals ----
    const { candidates, signals } = this.buildCandidates(ordered, lineContent);

    const lineage = ordered.map((o) => o.commit);

    return {
      lineage,
      candidates,
      signals,
      cleanTrace,
      ambiguousBoundaries,
      lineContent,
    };
  }

  // ---------------------------------------------------------------------------
  // Cross-file stitch
  // ---------------------------------------------------------------------------

  /**
   * Given the current oldest step (the candidate wall), decide if it is a file-introduction
   * wall (a move), and if so recover the older lineage from the source file.
   *
   * Returns null when `wall` is a genuine origin (not a move). Returns a list of older steps
   * (newest → oldest, in the source file) when it stitched across a boundary.
   */
  private async stitchAcrossWall(
    wall: LineHistoryStep,
  ): Promise<{ steps: LineHistoryStep[] } | null> {
    // Is the file/region an addition in this commit? If the file itself wasn't added here,
    // -L would have continued, so this is the true origin — not a wall.
    const fileAdded = await this.git.isFileAddition(wall.sha, wall.path);
    if (!fileAdded) return null;

    // Find the move source — the other side of the move within the SAME commit.
    const addedLines = wall.added ?? [];
    const moveSource = await this.git.findMoveSource(wall.sha, wall.path, addedLines);
    if (!moveSource) {
      // The file was added but it's not a recognizable move (a genuine first introduction).
      return null;
    }

    // Pickaxe a distinctive token from the wall's added lines, filtered to the OLD path,
    // to find where the code first entered the repo in that file.
    const token = pickDistinctiveToken(addedLines);
    if (!token) return null;

    const hits = await this.git.pickaxeToken(token, moveSource.path);
    // Keep hits in the source file, older than the wall commit. The OLDEST is the origin.
    const wallTime = await this.commitTime(wall.sha);
    const sourceHits = hits
      .filter((h) => h.path === moveSource.path && h.sha !== wall.sha)
      .filter((h) => !wallTime || h.authoredAt <= wallTime)
      .sort((a, b) => a.authoredAt.localeCompare(b.authoredAt)); // oldest first

    if (sourceHits.length === 0) return null;

    // Build steps for the source-file lineage (newest → oldest to match -L ordering).
    const reversed = [...sourceHits].reverse(); // newest → oldest
    const steps: LineHistoryStep[] = [];
    for (const h of reversed) {
      const diff = await this.git.diffOfCommit(h.sha);
      const file = diff.files.find((f) => f.path === moveSource.path || f.previousPath === moveSource.path);
      steps.push({
        sha: h.sha,
        path: moveSource.path,
        isCosmetic: null,
        added: file?.added ?? [],
        removed: file?.removed ?? [],
      });
    }
    return { steps };
  }

  private async commitTime(sha: string): Promise<string | null> {
    const c = await this.git.getCommit(sha);
    return c?.authoredAt ?? null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Classify a lineage step cosmetic/behavioral. The narrow `-L` hunk can misclassify a
   * pure reformat as behavioral (the hunk straddles a reflowed function), so when the hunk
   * looks behavioral we cross-check against the WHOLE-FILE diff of the step's commit: if the
   * file-level change is cosmetic (whitespace/rename/comment-only), the step is cosmetic.
   */
  private async classify(step: LineHistoryStep): Promise<ClassifiedStep> {
    const hunk = classifyChange({
      added: step.added ?? [],
      removed: step.removed ?? [],
      pathChanged: false,
    });
    if (hunk.isCosmetic) return { step, isCosmetic: true, reason: hunk.reason };

    // Cross-check at file granularity for reformats the narrow hunk can't see.
    const diff = await this.git.diffOfCommit(step.sha);
    const file = diff.files.find((f) => f.path === step.path || f.previousPath === step.path);
    if (file) {
      const fileClass = classifyChange({
        added: file.added,
        removed: file.removed,
        pathChanged: file.previousPath !== undefined && file.previousPath !== file.path,
      });
      if (fileClass.isCosmetic) {
        return { step, isCosmetic: true, reason: `${fileClass.reason} (file-level)` };
      }
    }
    return { step, isCosmetic: false, reason: hunk.reason };
  }

  /** The current text of the queried line: the newest step's first added line. */
  private currentLineContent(steps: LineHistoryStep[]): string {
    for (const s of steps) {
      const added = (s.added ?? []).filter((l) => l.trim().length > 0);
      if (added.length > 0) return added[0] as string;
    }
    return '';
  }

  private async toCommitsOldestFirst(
    behavioral: ClassifiedStep[],
  ): Promise<Array<{ commit: Commit; cs: ClassifiedStep }>> {
    const out: Array<{ commit: Commit; cs: ClassifiedStep }> = [];
    for (const cs of behavioral) {
      const commit = (await this.git.getCommit(cs.step.sha)) ?? {
        sha: cs.step.sha,
        authorLogin: '',
        authorName: '',
        authoredAt: '',
        message: '',
      };
      out.push({ commit, cs });
    }
    out.sort((a, b) => a.commit.authoredAt.localeCompare(b.commit.authoredAt));
    return out;
  }

  private buildCandidates(
    ordered: Array<{ commit: Commit; cs: ClassifiedStep }>,
    lineContent: string,
  ): { candidates: Candidate[]; signals: Record<string, CandidateSignals> } {
    const lineTokens = new Set(tokenize(lineContent));
    const candidates: Candidate[] = [];
    const signals: Record<string, CandidateSignals> = {};

    const n = ordered.length;
    ordered.forEach((entry, idx) => {
      const added = entry.cs.step.added ?? [];
      const addedTokens = new Set(added.flatMap((l) => tokenize(l)));

      // token overlap with the current line content
      let overlap = 0;
      for (const t of addedTokens) if (lineTokens.has(t)) overlap += 1;
      const tokenOverlap = lineTokens.size > 0 ? overlap / lineTokens.size : 0;

      // behavioral magnitude: share of the current line's tokens this commit introduced.
      const behavioralMagnitude = tokenOverlap;

      // originality: the earliest behavioral commit establishing the logic ranks highest.
      // idx 0 = oldest. Decay gently for later tweaks.
      const originality = n <= 1 ? 1 : 1 - idx / n;

      const sig: CandidateSignals = {
        behavioralMagnitude,
        originality,
        tokenOverlap,
        evidenceRichness: 0, // filled by the engine after linking the top candidate
      };
      signals[entry.commit.sha] = sig;

      candidates.push({
        commit: entry.commit,
        score: 0, // assigned by score.ts
        kind: 'behavioral',
        reasons: [entry.cs.reason],
      });
    });

    return { candidates, signals };
  }
}

/**
 * Pick a distinctive token from the added lines for pickaxe: prefer a function/identifier
 * with a string literal, otherwise the longest identifier-bearing line trimmed. Falls back
 * to the first non-blank line.
 */
export function pickDistinctiveToken(addedLines: string[]): string | null {
  const nonBlank = addedLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonBlank.length === 0) return null;
  // Prefer a line declaring a function/class/const with a name — highly distinctive.
  const decl = nonBlank.find((l) => /\b(function|class|const|let|var|def|func)\b/.test(l));
  const chosen = decl ?? longest(nonBlank);
  // Use the whole trimmed line as the pickaxe needle (git -S matches occurrence count of the
  // exact string). It is distinctive and survives indentation differences poorly, so trim.
  return chosen;
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => (b.length > a.length ? b : a), lines[0] as string);
}
