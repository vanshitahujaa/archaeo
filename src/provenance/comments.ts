/**
 * Review comment relevance ranking — A2 (Tracer), issue #44 / Part D.3. PHASE 0 STUB.
 * Deterministic (no LLM, to preserve the no-invention rule). Keep the top 1–2.
 */

import type { RankedComment, ReviewComment } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface RankCommentsInput {
  comments: ReviewComment[];
  /** Paths/lines touched by the introducing commit, used to detect anchored comments. */
  introducingPaths?: string[];
}

export function rankComments(_input: RankCommentsInput): RankedComment[] {
  throw new NotImplemented('rankComments (#44)');
}
