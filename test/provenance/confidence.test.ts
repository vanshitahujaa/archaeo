/**
 * Confidence scorer tests — #26 / Part E. All three tiers, with populated reasons.
 */

import { describe, expect, it } from 'vitest';
import { scoreConfidence } from '../../src/provenance/confidence.js';
import type { Candidate, Issue, PullRequest, RankedComment } from '../../src/core/index.js';

function cand(sha: string, score: number): Candidate {
  return {
    commit: { sha, authorLogin: 'a', authorName: 'A', authoredAt: '2024-01-01', message: 'm' },
    score,
    kind: 'behavioral',
    reasons: [],
  };
}
const pr: PullRequest = { number: 1, title: 't', body: 'b', authorLogin: 'a', state: 'merged' };
const issue: Issue = { number: 2, title: 't', body: 'b', state: 'closed' };
const goodComment: RankedComment = {
  author: 'priya',
  body: 'this prevents duplicate charges',
  submittedAt: '2024-01-01',
  relevance: 0.9,
};

describe('scoreConfidence (Part E)', () => {
  it('HIGH: clear winner, clean trace, PR + issue, no broken chain', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: true,
      ambiguousBoundaries: 0,
      introducingPr: pr,
      linkedIssue: issue,
      chainBroken: false,
    });
    expect(out.confidence).toBe('high');
    expect(out.reasons.length).toBeGreaterThan(0);
    expect(out.reasons.join(' ')).toMatch(/clear winning candidate/);
  });

  it('HIGH: clear winner with a substantive review comment instead of an issue', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: true,
      ambiguousBoundaries: 0,
      introducingPr: pr,
      topComment: goodComment,
      chainBroken: false,
    });
    expect(out.confidence).toBe('high');
  });

  it('MEDIUM: PR found but one ambiguous boundary (squash/cherry-pick)', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: true,
      ambiguousBoundaries: 1,
      introducingPr: pr,
      linkedIssue: issue,
      chainBroken: false,
    });
    expect(out.confidence).toBe('medium');
    expect(out.reasons.join(' ')).toMatch(/one ambiguous boundary/);
  });

  it('MEDIUM: PR found but no linked issue and no substantive review', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: true,
      ambiguousBoundaries: 0,
      introducingPr: pr,
      chainBroken: false,
    });
    expect(out.confidence).toBe('medium');
    expect(out.reasons.join(' ')).toMatch(/no linked issue/);
  });

  it('LOW: chain broken', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: true,
      ambiguousBoundaries: 0,
      chainBroken: true,
    });
    expect(out.confidence).toBe('low');
    expect(out.reasons.join(' ')).toMatch(/no PR or issue chain/);
  });

  it('LOW: candidates clustered with no clear winner', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.55), cand('b', 0.5)],
      // no primary → clustered
      cleanTrace: true,
      ambiguousBoundaries: 0,
      introducingPr: pr,
      linkedIssue: issue,
      chainBroken: false,
    });
    expect(out.confidence).toBe('low');
    expect(out.reasons.join(' ')).toMatch(/clustered/);
  });

  it('LOW: more than one ambiguous boundary', () => {
    const out = scoreConfidence({
      candidates: [cand('a', 0.9)],
      primary: cand('a', 0.9),
      cleanTrace: false,
      ambiguousBoundaries: 2,
      introducingPr: pr,
      chainBroken: false,
    });
    expect(out.confidence).toBe('low');
  });

  it('always populates reasons', () => {
    const out = scoreConfidence({
      candidates: [],
      cleanTrace: false,
      ambiguousBoundaries: 0,
      chainBroken: true,
    });
    expect(out.reasons.length).toBeGreaterThan(0);
  });
});
