/**
 * Confidence scorer — A2 (Tracer), issue #26 / Part E.
 *
 * Three tiers, always shown, with populated reasons. Inputs: candidate separation (D.2),
 * tracer certainty (did the line resolve cleanly through moves and the cross-file stitch),
 * evidence completeness, message informativeness, and chainBroken.
 *
 * HIGH:   clear winning candidate (separation above threshold) AND line resolved cleanly
 *         AND an introducing PR found AND (linked issue OR substantive top review comment)
 *         AND chain not broken.
 * MEDIUM: introducing commit + PR found but modest separation, OR thin descriptions, OR no
 *         linked issue and no substantive review, OR exactly one ambiguous boundary crossed
 *         (including one recovered squash or cherry-pick).
 * LOW:    candidates clustered with no clear winner, OR chainBroken, OR history rewritten/
 *         squashed so the origin stays uncertain, OR only low-information commit messages.
 */

import type { Candidate, Confidence, Issue, PullRequest, RankedComment } from '../core/index.js';

/** A review comment is "substantive" when its relevance clears this bar. */
export const SUBSTANTIVE_COMMENT_RELEVANCE = 0.5;

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

export function scoreConfidence(input: ConfidenceInput): {
  confidence: Confidence;
  reasons: string[];
} {
  const reasons: string[] = [];

  const hasPrimary = input.primary !== undefined;
  const hasPr = input.introducingPr !== undefined;
  const hasIssue = input.linkedIssue !== undefined;
  const substantiveComment =
    input.topComment !== undefined && input.topComment.relevance >= SUBSTANTIVE_COMMENT_RELEVANCE;
  const clustered = input.candidates.length > 1 && !hasPrimary;

  // ---- LOW conditions (any of these forces LOW) ----
  if (input.chainBroken) reasons.push('no PR or issue chain could be recovered');
  if (clustered) reasons.push('candidates are clustered with no clear winner');
  if (!hasPr && hasPrimary && !input.chainBroken) {
    // introducing commit found but no PR at all — weak.
    reasons.push('introducing commit found but no PR linkage');
  }

  if (input.chainBroken || clustered) {
    if (reasons.length === 0) reasons.push('origin remains uncertain');
    return { confidence: 'low', reasons };
  }

  // From here the chain is not broken and we have a single winner (or one candidate).

  // ---- HIGH conditions (all must hold) ----
  const highEligible =
    hasPrimary &&
    input.cleanTrace &&
    hasPr &&
    (hasIssue || substantiveComment) &&
    input.ambiguousBoundaries === 0;

  if (highEligible) {
    reasons.push('clear winning candidate above separation threshold');
    reasons.push('line resolved cleanly through history');
    reasons.push('introducing PR found');
    if (hasIssue) reasons.push(`linked issue #${input.linkedIssue?.number} recovered`);
    if (substantiveComment) reasons.push('substantive top-ranked review comment found');
    return { confidence: 'high', reasons };
  }

  // ---- otherwise MEDIUM, with the specific reason ----
  if (!hasPr) {
    reasons.push('no introducing PR found');
  }
  if (input.ambiguousBoundaries === 1) {
    reasons.push('crossed one ambiguous boundary (move/squash/cherry-pick)');
  } else if (input.ambiguousBoundaries > 1) {
    // Multiple ambiguous boundaries with an otherwise-intact chain: still uncertain → LOW.
    reasons.push(`crossed ${input.ambiguousBoundaries} ambiguous boundaries`);
    return { confidence: 'low', reasons };
  }
  if (hasPr && !hasIssue && !substantiveComment) {
    reasons.push('PR found but no linked issue and no substantive review comment');
  }
  if (!input.cleanTrace && reasons.length === 0) {
    reasons.push('line did not resolve cleanly');
  }
  if (reasons.length === 0) {
    reasons.push('modest evidence; introducing commit identified');
  }
  return { confidence: 'medium', reasons };
}
