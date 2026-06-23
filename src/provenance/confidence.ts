/**
 * Confidence scorer — A2 (Tracer), issue #46 / Part E. PHASE 0 STUB.
 * Inputs: candidate separation, tracer certainty, evidence completeness, message
 * informativeness, chainBroken. Always populates `confidenceReasons`.
 */

import type { Candidate, Confidence, Issue, PullRequest, RankedComment } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface ConfidenceInput {
  candidates: Candidate[];
  primary?: Candidate;
  /** Did the line resolve cleanly through moves and the cross-file stitch? */
  cleanTrace: boolean;
  /** Number of ambiguous boundaries crossed (squash/cherry-pick count as one each). */
  ambiguousBoundaries: number;
  introducingPr?: PullRequest;
  linkedIssue?: Issue;
  topComment?: RankedComment;
  chainBroken: boolean;
}

export function scoreConfidence(_input: ConfidenceInput): {
  confidence: Confidence;
  reasons: string[];
} {
  throw new NotImplemented('scoreConfidence (#46)');
}
