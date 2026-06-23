/**
 * Risk signal combination tests — #28 / Part D.7. Named weights, 0..10 score.
 */

import { describe, expect, it } from 'vitest';
import { combineSignals, RISK_WEIGHTS, type RawSignals } from '../../src/risk/signals.js';

const ZERO: RawSignals = {
  distinctAuthors: 0,
  commitsLast90d: 0,
  coupledPaths: [],
  incidentLinkedCommits: 0,
  lastTouchedDaysAgo: 999,
};

describe('combineSignals (D.7)', () => {
  it('weights sum to 1', () => {
    const sum =
      RISK_WEIGHTS.churn +
      RISK_WEIGHTS.authorSpread +
      RISK_WEIGHTS.coupling +
      RISK_WEIGHTS.incidents +
      RISK_WEIGHTS.recency;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('a quiet file scores near 0', () => {
    const { score, notes } = combineSignals(ZERO);
    expect(score).toBeLessThanOrEqual(1);
    expect(notes.join(' ')).toMatch(/low historical risk/);
  });

  it('a hot, broadly-owned, incident-prone, recent file scores high', () => {
    const { score, notes } = combineSignals({
      distinctAuthors: 8,
      commitsLast90d: 30,
      coupledPaths: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      incidentLinkedCommits: 3,
      lastTouchedDaysAgo: 1,
    });
    expect(score).toBeGreaterThanOrEqual(9);
    expect(score).toBeLessThanOrEqual(10);
    expect(notes.join(' ')).toMatch(/high churn/);
    expect(notes.join(' ')).toMatch(/incident/);
  });

  it('churn is the highest-weighted signal', () => {
    const onlyChurn = combineSignals({ ...ZERO, commitsLast90d: 100 }).score;
    const onlyRecency = combineSignals({ ...ZERO, lastTouchedDaysAgo: 0 }).score;
    expect(onlyChurn).toBeGreaterThan(onlyRecency);
  });

  it('recency decays across the window', () => {
    const fresh = combineSignals({ ...ZERO, lastTouchedDaysAgo: 0 }).score;
    const stale = combineSignals({ ...ZERO, lastTouchedDaysAgo: 89 }).score;
    expect(fresh).toBeGreaterThan(stale);
  });
});
