/**
 * Benchmark metrics — A7 (Auditor), issues #35 / #62 / Part H.2.
 *
 * Top-1 accuracy: the engine's chosen introducing PR equals the expected PR.
 * Top-3 accuracy: the expected PR is among the engine's top-3 candidate PRs.
 * Confidence calibration: accuracy per HIGH / MEDIUM / LOW tier — HIGH answers should be
 *   correct far more often than LOW ones.
 *
 * Only items with an `expectedPr` count toward top-1/top-3 (you can only be right about a PR
 * if there is a PR to be right about). Every item counts toward calibration, where
 * "correct" means the engine surfaced the expected PR as its chosen one when an expected PR
 * exists, and otherwise means it honestly reported no PR (chosen PR is undefined) — i.e. it
 * did not fabricate a link. This keeps the honest chainBroken/LOW fixtures meaningful in the
 * calibration table instead of silently dropping them.
 */

import type { Confidence } from '../core/index.js';

export interface BenchItemResult {
  /** Stable identifier for the question (repo:path:line), for reporting. */
  id: string;
  expectedPr?: number;
  /** Engine's chosen introducing PR (from the recovered bundle), if any. */
  chosenPr?: number;
  /** Engine's top-3 candidate PRs (deduped, best first). */
  topPrs: number[];
  confidence: Confidence;
}

export interface TierStats {
  n: number;
  correct: number;
  accuracy: number;
}

export interface Metrics {
  /** Number of items that have an expected PR (the denominator for top-1/top-3). */
  prScored: number;
  /** Total items evaluated (the denominator for calibration). */
  total: number;
  top1: number;
  top3: number;
  /** Accuracy per confidence tier (every item counts here). */
  calibration: Record<Confidence, TierStats>;
}

const TIERS: Confidence[] = ['high', 'medium', 'low'];

/** Did the engine answer this item correctly, for calibration purposes? */
export function isCalibrationCorrect(r: BenchItemResult): boolean {
  if (r.expectedPr !== undefined) {
    // There is a real PR to find: correct iff the engine chose it.
    return r.chosenPr === r.expectedPr;
  }
  // No PR expected (honest chainBroken case): correct iff the engine did NOT invent one.
  return r.chosenPr === undefined;
}

export function computeMetrics(results: BenchItemResult[]): Metrics {
  const calibration: Record<Confidence, TierStats> = {
    high: { n: 0, correct: 0, accuracy: 0 },
    medium: { n: 0, correct: 0, accuracy: 0 },
    low: { n: 0, correct: 0, accuracy: 0 },
  };

  let prScored = 0;
  let top1Hits = 0;
  let top3Hits = 0;

  for (const r of results) {
    // ---- calibration (every item) ----
    const tier = calibration[r.confidence];
    tier.n += 1;
    if (isCalibrationCorrect(r)) tier.correct += 1;

    // ---- top-1 / top-3 (only items with an expected PR) ----
    if (r.expectedPr !== undefined) {
      prScored += 1;
      if (r.chosenPr === r.expectedPr) top1Hits += 1;
      if (r.topPrs.includes(r.expectedPr)) top3Hits += 1;
    }
  }

  for (const t of TIERS) {
    const s = calibration[t];
    s.accuracy = s.n === 0 ? 0 : s.correct / s.n;
  }

  return {
    prScored,
    total: results.length,
    top1: prScored === 0 ? 0 : top1Hits / prScored,
    top3: prScored === 0 ? 0 : top3Hits / prScored,
    calibration,
  };
}
