/**
 * Candidate scoring tests — #22 / Part D.2.
 * Named weights, primary only above separation threshold, lineage always available, and an
 * ambiguous multi-commit case that returns no single winner.
 */

import { describe, expect, it } from 'vitest';
import {
  combineCandidateScore,
  scoreAndRank,
  SCORE_WEIGHTS,
  SEPARATION_THRESHOLD,
} from '../../src/provenance/score.js';
import type { Candidate, Commit } from '../../src/core/index.js';

function commit(sha: string, authoredAt: string): Commit {
  return { sha, authorLogin: 'a', authorName: 'A', authoredAt, message: `m ${sha}` };
}
function cand(sha: string, authoredAt: string): Candidate {
  return { commit: commit(sha, authoredAt), score: 0, kind: 'behavioral', reasons: [] };
}

describe('combineCandidateScore (D.2 named weights)', () => {
  it('weights sum to 1', () => {
    const sum =
      SCORE_WEIGHTS.behavioralMagnitude +
      SCORE_WEIGHTS.originality +
      SCORE_WEIGHTS.tokenOverlap +
      SCORE_WEIGHTS.evidenceRichness;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('all signals at 1 → score 1', () => {
    expect(
      combineCandidateScore({
        behavioralMagnitude: 1,
        originality: 1,
        tokenOverlap: 1,
        evidenceRichness: 1,
      }),
    ).toBeCloseTo(1, 10);
  });

  it('behavioral magnitude is the highest-weighted signal', () => {
    const onlyMagnitude = combineCandidateScore({ behavioralMagnitude: 1 });
    const onlyOriginality = combineCandidateScore({ originality: 1 });
    const onlyOverlap = combineCandidateScore({ tokenOverlap: 1 });
    const onlyEvidence = combineCandidateScore({ evidenceRichness: 1 });
    expect(onlyMagnitude).toBeGreaterThan(onlyOriginality);
    expect(onlyOriginality).toBeGreaterThan(onlyOverlap);
    expect(onlyOverlap).toBeGreaterThan(onlyEvidence);
  });

  it('clamps out-of-range inputs', () => {
    expect(combineCandidateScore({ behavioralMagnitude: 5 })).toBeLessThanOrEqual(1);
    expect(combineCandidateScore({ behavioralMagnitude: -5 })).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreAndRank', () => {
  it('sets primary when separation exceeds the threshold', () => {
    const out = scoreAndRank({
      candidates: [cand('aaa', '2024-01-01'), cand('bbb', '2024-02-01')],
      signals: {
        aaa: { behavioralMagnitude: 1, originality: 1, tokenOverlap: 1, evidenceRichness: 1 },
        bbb: { behavioralMagnitude: 0.1 },
      },
    });
    expect(out.primary).toBeDefined();
    expect(out.primary?.commit.sha).toBe('aaa');
    expect(out.candidates[0]?.score).toBeGreaterThan(out.candidates[1]!.score + SEPARATION_THRESHOLD);
  });

  it('AMBIGUOUS multi-commit case: clustered scores → NO single winner', () => {
    // Three candidates with near-identical scores — the retry(5) lineage scenario.
    const out = scoreAndRank({
      candidates: [
        cand('added-retry', '2023-09-02'),
        cand('count-to-5', '2023-11-18'),
        cand('moved-util', '2024-02-04'),
      ],
      signals: {
        'added-retry': { behavioralMagnitude: 0.5, originality: 1, tokenOverlap: 0.5 },
        'count-to-5': { behavioralMagnitude: 0.55, originality: 0.6, tokenOverlap: 0.55 },
        'moved-util': { behavioralMagnitude: 0.45, originality: 0.3, tokenOverlap: 0.45 },
      },
    });
    // Lineage is always available even with no winner.
    expect(out.candidates).toHaveLength(3);
    // The top two are within the separation threshold → no primary.
    const lead = out.candidates[0]!.score - out.candidates[1]!.score;
    expect(lead).toBeLessThanOrEqual(SEPARATION_THRESHOLD);
    expect(out.primary).toBeUndefined();
  });

  it('a single candidate is always primary', () => {
    const out = scoreAndRank({
      candidates: [cand('solo', '2024-01-01')],
      signals: { solo: { behavioralMagnitude: 0.3 } },
    });
    expect(out.primary?.commit.sha).toBe('solo');
  });

  it('falls back to the candidate score when no signals supplied', () => {
    const c = cand('x', '2024-01-01');
    c.score = 0.42;
    const out = scoreAndRank({ candidates: [c] });
    expect(out.candidates[0]?.score).toBeCloseTo(0.42, 5);
  });

  it('ranks best-first and tie-breaks by older authoredAt', () => {
    const out = scoreAndRank({
      candidates: [cand('newer', '2024-05-01'), cand('older', '2024-01-01')],
      signals: {
        newer: { behavioralMagnitude: 0.5 },
        older: { behavioralMagnitude: 0.5 },
      },
    });
    // equal score → older first
    expect(out.candidates[0]?.commit.sha).toBe('older');
  });
});
