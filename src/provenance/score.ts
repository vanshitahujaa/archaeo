/**
 * Candidate scoring — A2 (Tracer), issue #42 / Part D.2. PHASE 0 STUB.
 * Named, tunable weights (constants, not magic numbers). `primary` only above the
 * separation threshold; `lineage` always populated.
 */

import type { Candidate } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

/** Named weights (Part D.2). Exported so the benchmark can tune them. */
export const SCORE_WEIGHTS = {
  behavioralMagnitude: 0.45,
  originality: 0.25,
  tokenOverlap: 0.2,
  evidenceRichness: 0.1,
} as const;

/** Min score gap between candidates[0] and candidates[1] to declare a single winner. */
export const SEPARATION_THRESHOLD = 0.15;

export interface ScoreInput {
  candidates: Candidate[];
}

export function scoreAndRank(_input: ScoreInput): {
  candidates: Candidate[];
  primary?: Candidate;
} {
  throw new NotImplemented('scoreAndRank (#42)');
}
