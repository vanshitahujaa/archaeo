/**
 * Benchmark metrics — A7 (Auditor), issue #62 / Part H.2. PHASE 0 STUB.
 * Top-1, top-3 (over candidates), confidence calibration per tier.
 */

import type { Confidence } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface BenchItemResult {
  expectedPr?: number;
  /** Engine's chosen introducing PR (candidates[0]). */
  chosenPr?: number;
  /** Engine's top-3 candidate PRs. */
  topPrs: number[];
  confidence: Confidence;
}

export interface Metrics {
  top1: number;
  top3: number;
  /** accuracy per confidence tier */
  calibration: Record<Confidence, { n: number; correct: number; accuracy: number }>;
}

export function computeMetrics(_results: BenchItemResult[]): Metrics {
  throw new NotImplemented('computeMetrics (#62)');
}
