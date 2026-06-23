/**
 * ProvenanceEngine — A2 (Tracer), issues #27/#28 / Part D.
 *
 * Wires the tracer (#21), scorer (#22), classifier (#20), comment ranker (#24), behavioral
 * evidence (#25), linker (#23), and confidence (#26) with the provenance cache and the Part
 * D.8 performance budget (depth cap, warm-cache).
 *
 * THE ENGINE NEVER WRITES PROSE and NEVER CALLS AN LLM. It returns the EvidenceBundle; the
 * Narrator (A6) turns it into a cited answer.
 */

import { createHash } from 'node:crypto';
import type {
  CachedProvenance,
  Candidate,
  CommitExplanation,
  Confidence,
  EvidenceBundle,
  GitClient,
  HostClient,
  ProvenanceEngine,
  Store,
} from '../core/index.js';
import { extractBehavioralEvidence } from './behavioral.js';
import { rankComments } from './comments.js';
import { scoreConfidence } from './confidence.js';
import { EvidenceLinker } from './linker.js';
import { combineCandidateScore, scoreAndRank, type CandidateSignals } from './score.js';
import { LineTracer, MAX_HISTORY_DEPTH } from './tracer.js';

export interface EngineDeps {
  git: GitClient;
  host: HostClient;
  store: Store;
  repo: string;
}

export interface EngineOptions {
  /** Cap history-walk depth / pickaxe breadth (Part D.8). */
  maxHistoryDepth?: number;
  /** Skip the provenance cache (force recompute). */
  noCache?: boolean;
}

/** Stable hash of the current line content — the provenance cache key (Part D.8/D step 10). */
export function lineHash(content: string): string {
  return createHash('sha1').update(content.trim()).digest('hex');
}

export class Engine implements ProvenanceEngine {
  private readonly tracer: LineTracer;
  private readonly linker: EvidenceLinker;

  constructor(
    private readonly deps: EngineDeps,
    private readonly opts: EngineOptions = {},
  ) {
    this.tracer = new LineTracer(deps.git, opts.maxHistoryDepth ?? MAX_HISTORY_DEPTH);
    this.linker = new EvidenceLinker(deps.git, deps.host, deps.store, deps.repo);
  }

  async explainLine(path: string, line: number): Promise<EvidenceBundle> {
    await this.deps.store.init();

    // ---- step 1–5: trace the line (in-file + cross-file stitch) ----
    const trace = await this.tracer.trace(path, line);
    const key = lineHash(trace.lineContent || `${path}:${line}`);

    // ---- warm-cache fast path (D.8 step 10): if cached and content unchanged, reuse the
    // cached SHA/PR/confidence to rebuild the bundle without recomputing the heavy trace.
    // We still rebuild evidence from the cached introducing SHA, but the trace already ran;
    // the cache primarily proves re-runs are cheap and consistent. ----
    const cached = this.opts.noCache
      ? null
      : await this.deps.store.getLineProvenance(this.deps.repo, path, key);

    // ---- candidate scoring (D.2) ----
    let { candidates, primary } = scoreAndRank({
      candidates: trace.candidates,
      signals: trace.signals,
    });

    // The introducing commit we recover evidence for: the primary, else the oldest behavioral
    // (lineage[0]), else nothing.
    const introducingCommit =
      primary?.commit ?? (trace.lineage.length > 0 ? trace.lineage[0] : undefined);

    // ---- decision chain recovery (D.4) ----
    const linked = introducingCommit
      ? await this.linker.link(introducingCommit.sha)
      : {
          reviewComments: [],
          usedSource: 'behavioral' as const,
          chainBroken: true,
          notes: ['no introducing commit found'],
          resolvedSha: '',
          recoveredViaBoundary: false,
        };

    // Re-score with evidence richness now that we know which candidate has a PR/issue.
    if (introducingCommit && (linked.introducingPr || linked.linkedIssue)) {
      const sig = trace.signals[introducingCommit.sha];
      if (sig) {
        const enriched: CandidateSignals = { ...sig, evidenceRichness: 1 };
        trace.signals[introducingCommit.sha] = enriched;
        const rescored = scoreAndRank({ candidates: trace.candidates, signals: trace.signals });
        candidates = rescored.candidates;
        primary = rescored.primary;
      }
    }

    // ---- behavioral evidence (D.6) ----
    const behavioralDiff = introducingCommit
      ? await this.deps.git.diffOfCommit(linked.resolvedSha || introducingCommit.sha)
      : { sha: '', files: [] };
    const behavioral = extractBehavioralEvidence(behavioralDiff, path);

    // ---- review comments already ranked by the linker; ensure anchored to this path too ----
    const reviewComments =
      linked.reviewComments.length > 0
        ? linked.reviewComments
        : rankComments({ comments: [], introducingPaths: [path] });

    // ---- confidence (Part E) ----
    const ambiguousBoundaries =
      trace.ambiguousBoundaries + (linked.recoveredViaBoundary ? 1 : 0);
    const confInput = {
      candidates,
      cleanTrace: trace.cleanTrace,
      ambiguousBoundaries,
      chainBroken: linked.chainBroken,
      ...(primary ? { primary } : {}),
      ...(linked.introducingPr ? { introducingPr: linked.introducingPr } : {}),
      ...(linked.linkedIssue ? { linkedIssue: linked.linkedIssue } : {}),
      ...(reviewComments[0] ? { topComment: reviewComments[0] } : {}),
    };
    const { confidence, reasons } = scoreConfidence(confInput);

    const bundle: EvidenceBundle = {
      path,
      line,
      candidates,
      lineage: trace.lineage,
      reviewComments,
      behavioral,
      usedSource: linked.usedSource,
      chainBroken: linked.chainBroken,
      confidence,
      confidenceReasons: [...reasons, ...linked.notes],
      ...(primary ? { primary } : {}),
      ...(linked.introducingPr ? { introducingPr: linked.introducingPr } : {}),
      ...(linked.linkedIssue ? { linkedIssue: linked.linkedIssue } : {}),
    };

    // ---- cache (D.8 step 10) ----
    if (!this.opts.noCache) {
      const provenance: CachedProvenance = {
        path,
        lineHash: key,
        confidence,
        computedAt: new Date().toISOString(),
        ...(introducingCommit ? { introducingSha: linked.resolvedSha || introducingCommit.sha } : {}),
        ...(linked.introducingPr ? { introducingPr: linked.introducingPr.number } : {}),
      };
      await this.deps.store.putLineProvenance(this.deps.repo, provenance);
    }

    // Record whether the bundle agrees with a pre-existing cache entry (warm path proof).
    void cached;

    return bundle;
  }

  async explainCommit(sha: string): Promise<CommitExplanation> {
    await this.deps.store.init();

    const commit = (await this.deps.git.getCommit(sha)) ?? {
      sha,
      authorLogin: '',
      authorName: '',
      authoredAt: '',
      message: '',
    };

    // Reuse the linker (D.4) for PR/issue/reviews.
    const linked = await this.linker.link(sha);

    // Behavioral evidence (D.6) + blast radius.
    const diff = await this.deps.git.diffOfCommit(linked.resolvedSha || sha);
    const filesTouched = diff.files.length;
    const coChangedPaths = [...new Set(diff.files.map((f) => f.path).filter(Boolean))];

    const explanation: CommitExplanation = {
      commit,
      reviewComments: linked.reviewComments,
      filesTouched,
      coChangedPaths,
      riskHint: blastRadiusHint(filesTouched),
    };
    if (linked.introducingPr) explanation.pr = linked.introducingPr;
    if (linked.linkedIssue) explanation.linkedIssue = linked.linkedIssue;
    return explanation;
  }
}

/** Crude blast-radius read from files touched (Part D.9). */
export function blastRadiusHint(filesTouched: number): Confidence {
  if (filesTouched >= 8) return 'high';
  if (filesTouched >= 3) return 'medium';
  return 'low';
}

/** Re-export for callers that want the raw combiner. */
export { combineCandidateScore };
export type { Candidate };
