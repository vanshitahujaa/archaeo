/**
 * Ground truth for synthetic fixture repos — issue #33.
 *
 * For each repo + target `path:line`, the expected introducing commit
 * (referenced by its stable label in the SHA map returned by the builder)
 * and the expected lineage order (labels, oldest-first).
 *
 * Consumers:
 *   - fixtures.test.ts  — structural / determinism checks
 *   - Tracer tests (#41) — measure engine accuracy against these ground truths
 *   - Classifier tests (#40/#61) — hand-labeled cosmetic vs behavioral examples
 *
 * Ownership: test/fixtures/ ONLY.  Do NOT edit src/.
 */

import type { Confidence, EvidenceSource } from '../../src/core/types.js';

export interface GroundTruthEntry {
  /** Which fixture repo this applies to. */
  repo: string;
  /** The file path queried (relative to repo root). */
  path: string;
  /** 1-indexed line number queried. */
  line: number;
  /**
   * The stable label (from the builder's SHA map) for the expected introducing
   * commit. The test resolves label → SHA at runtime.
   */
  introducingLabel: string;
  /**
   * Stable labels for all behavioral commits that touched this line, ordered
   * oldest-first (chronological). The engine should surface these in `lineage`.
   */
  lineageLabels: string[];
  /** The expected confidence tier the engine should emit for this entry. */
  expectedConfidence: Confidence;
  /**
   * The expected `usedSource` the engine should set (best available signal).
   * 'behavioral' = no PR/issue linkage.
   */
  expectedUsedSource: EvidenceSource;
  /** True iff no PR/issue chain can be recovered — engine must set `chainBroken`. */
  chainBroken: boolean;
  /** Human note explaining why this is the ground truth. */
  notes: string;
}

/**
 * All ground-truth entries, keyed by `${repo}:${path}:${line}`.
 *
 * Note: SHA values are NOT stored here — they are resolved at test-time from
 * the map returned by the builder, so ground truth does not need to change if
 * the underlying git SHA changes.
 */
export const GROUND_TRUTH: GroundTruthEntry[] = [
  // -------------------------------------------------------------------------
  // RENAME repo — line 2 of authentication.ts
  // validateToken was authored in auth.ts, then the file was renamed.
  // The introducing commit is 'introduce'; 'rename' is a cosmetic/move commit.
  // -------------------------------------------------------------------------
  {
    repo: 'rename',
    path: 'authentication.ts',
    line: 2,
    introducingLabel: 'introduce',
    lineageLabels: ['introduce', 'rename'],
    expectedConfidence: 'medium',
    expectedUsedSource: 'commit_message',
    chainBroken: true,
    notes:
      'The rename commit is cosmetic (content unchanged). The true origin is the commit that added validateToken in auth.ts. chainBroken because no PR is linked in this synthetic repo.',
  },

  // -------------------------------------------------------------------------
  // MOVE-TO-UTILITY repo — line 1 of util/retry.ts
  // retry() was first written in service.ts, then moved into util/retry.ts.
  // The engine must cross the file boundary via pickaxe to find 'introduce'.
  // -------------------------------------------------------------------------
  {
    repo: 'move-to-utility',
    path: 'util/retry.ts',
    line: 1,
    introducingLabel: 'introduce',
    lineageLabels: ['introduce', 'move'],
    expectedConfidence: 'low',
    expectedUsedSource: 'behavioral',
    chainBroken: true,
    notes:
      "retry() was originally authored in service.ts (label 'introduce'). The 'move' commit transplanted it into util/retry.ts. Cross-file stitch via pickaxe on 'retry' token. No PR recorded → chainBroken.",
  },

  // -------------------------------------------------------------------------
  // SQUASH repo — line 2 of payments.ts
  // The squash commit on main is what git blame sees; the original feature
  // commits are hidden. The engine should surface the squash commit and
  // set confidence to medium (squash detected, real history inferred).
  // -------------------------------------------------------------------------
  {
    repo: 'squash',
    path: 'payments.ts',
    line: 2,
    introducingLabel: 'squash',
    lineageLabels: ['squash'],
    expectedConfidence: 'medium',
    expectedUsedSource: 'commit_message',
    chainBroken: false,
    notes:
      "The squash commit (#42) is what git blame surfaces. PR reference is embedded in the commit message. The original feature-1/feature-2 commits are reachable via prCommits (host API). Confidence is medium because history was squash-merged.",
  },

  // -------------------------------------------------------------------------
  // CHERRY-PICK repo — line 2 of charge.ts
  // The cherry-pick commit on main references the original fix via the
  // canonical `(cherry picked from commit <sha>)` trailer.
  // -------------------------------------------------------------------------
  {
    repo: 'cherry-pick',
    path: 'charge.ts',
    line: 2,
    introducingLabel: 'cherry-picked',
    lineageLabels: ['cherry-picked'],
    expectedConfidence: 'medium',
    expectedUsedSource: 'commit_message',
    chainBroken: false,
    notes:
      "The cherry-pick commit on main contains the canonical trailer. The engine must parse the trailer to recover the original SHA (label 'original') and follow to its PR. Confidence medium: chain recovered through cherry-pick.",
  },

  // -------------------------------------------------------------------------
  // COSMETIC-ONLY repo — line 2 of processor.ts
  // The cosmetic commit reformatted the same line; the behavioral commit is
  // the true introduction. The engine's classifier must skip the cosmetic
  // commit and surface 'behavioral' as the introducing label.
  // -------------------------------------------------------------------------
  {
    repo: 'cosmetic-only',
    path: 'processor.ts',
    line: 2,
    introducingLabel: 'behavioral',
    lineageLabels: ['behavioral'],
    expectedConfidence: 'low',
    expectedUsedSource: 'behavioral',
    chainBroken: true,
    notes:
      "Line 2 is 'if (amount <= 0) return false;'. The cosmetic commit only reformatted whitespace. The classifier must mark it cosmetic and look past it to 'behavioral'. No PR linked → chainBroken.",
  },

  // -------------------------------------------------------------------------
  // MISSING-PR repo — line 4 of cache.ts
  // Low-info "fix stuff" commit with no PR/issue. The engine must set
  // chainBroken = true, usedSource = 'behavioral', confidence = 'low'.
  // -------------------------------------------------------------------------
  {
    repo: 'missing-pr',
    path: 'cache.ts',
    line: 4,
    introducingLabel: 'missing-pr',
    lineageLabels: ['missing-pr'],
    expectedConfidence: 'low',
    expectedUsedSource: 'behavioral',
    chainBroken: true,
    notes:
      "The commit message is 'fix stuff' — no PR, no issue, no useful message. Engine must fall back to behavioral evidence only and report LOW confidence with chainBroken=true.",
  },
];

/** Look up a ground-truth entry by repo + path + line. Returns undefined if not found. */
export function getGroundTruth(
  repo: string,
  path: string,
  line: number,
): GroundTruthEntry | undefined {
  return GROUND_TRUTH.find((e) => e.repo === repo && e.path === path && e.line === line);
}
