/**
 * Candidate scoring — A2 (Tracer), issue #22 / Part D.2.
 *
 * Named, tunable weights (constants, not magic numbers). Each behavioral candidate is
 * scored in 0..1 by combining four signals:
 *   - behavioralMagnitude: how much of the current line's tokens this commit introduced
 *   - originality:         the earliest commit that established the logic ranks above tweaks,
 *                          unless a later commit substantially rewrote it
 *   - tokenOverlap:        diff overlap between the candidate and the current line content
 *   - evidenceRichness:    candidate has a linked PR/issue (corroborates a real decision)
 *
 * `primary` is set to candidates[0] only when candidates[0].score - candidates[1].score
 * exceeds SEPARATION_THRESHOLD; otherwise the answer is a lineage with no single winner.
 */

import type { Candidate } from '../core/index.js';

/** Named weights (Part D.2). Exported so the benchmark can tune them. Sum to 1. */
export const SCORE_WEIGHTS = {
  behavioralMagnitude: 0.45,
  originality: 0.25,
  tokenOverlap: 0.2,
  evidenceRichness: 0.1,
} as const;

/** Min score gap between candidates[0] and candidates[1] to declare a single winner. */
export const SEPARATION_THRESHOLD = 0.15;

/** Per-candidate raw signals in 0..1. Missing fields default to 0. */
export interface CandidateSignals {
  /** Fraction of the current line's tokens this commit introduced/changed. */
  behavioralMagnitude?: number;
  /** Originality (earliest establishing commit = 1; later tweak = lower). */
  originality?: number;
  /** Token overlap between the candidate's added lines and the current line. */
  tokenOverlap?: number;
  /** Evidence richness (has PR/issue). */
  evidenceRichness?: number;
}

export interface ScoreInput {
  candidates: Candidate[];
  /** Optional per-candidate signal map keyed by commit SHA. */
  signals?: Record<string, CandidateSignals>;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Combine a candidate's raw signals into a single 0..1 score using the named weights. */
export function combineCandidateScore(s: CandidateSignals): number {
  const score =
    SCORE_WEIGHTS.behavioralMagnitude * clamp01(s.behavioralMagnitude ?? 0) +
    SCORE_WEIGHTS.originality * clamp01(s.originality ?? 0) +
    SCORE_WEIGHTS.tokenOverlap * clamp01(s.tokenOverlap ?? 0) +
    SCORE_WEIGHTS.evidenceRichness * clamp01(s.evidenceRichness ?? 0);
  return clamp01(score);
}

export function scoreAndRank(input: ScoreInput): {
  candidates: Candidate[];
  primary?: Candidate;
} {
  const signals = input.signals ?? {};

  const scored: Candidate[] = input.candidates.map((c) => {
    const sig = signals[c.commit.sha];
    if (sig) {
      const score = combineCandidateScore(sig);
      const reasons = [...c.reasons];
      // Surface the dominant contributing signal for explainability.
      const contributions: Array<[string, number]> = [
        ['behavioral magnitude', SCORE_WEIGHTS.behavioralMagnitude * clamp01(sig.behavioralMagnitude ?? 0)],
        ['originality', SCORE_WEIGHTS.originality * clamp01(sig.originality ?? 0)],
        ['token overlap', SCORE_WEIGHTS.tokenOverlap * clamp01(sig.tokenOverlap ?? 0)],
        ['evidence richness', SCORE_WEIGHTS.evidenceRichness * clamp01(sig.evidenceRichness ?? 0)],
      ];
      contributions.sort((a, b) => b[1] - a[1]);
      const top = contributions[0];
      if (top && top[1] > 0) reasons.push(`scored ${score.toFixed(2)} (top signal: ${top[0]})`);
      return { ...c, score, reasons };
    }
    // No signals supplied → keep the candidate's pre-set score.
    return { ...c, score: clamp01(c.score) };
  });

  // Rank best-first. Tie-break by older authoredAt (originality preference).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.commit.authoredAt.localeCompare(b.commit.authoredAt);
  });

  const primary = computePrimary(scored);
  return { candidates: scored, primary };
}

/** candidates[0] is primary only when its lead over candidates[1] exceeds the threshold. */
function computePrimary(ranked: Candidate[]): Candidate | undefined {
  if (ranked.length === 0) return undefined;
  if (ranked.length === 1) return ranked[0];
  const lead = (ranked[0] as Candidate).score - (ranked[1] as Candidate).score;
  return lead > SEPARATION_THRESHOLD ? ranked[0] : undefined;
}
