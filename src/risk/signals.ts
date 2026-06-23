/**
 * Risk signals + named weights — A2 (Tracer), issue #48 / Part D.7. PHASE 0 STUB.
 * Documented, named weights (not magic numbers). Combined into a 0..10 score by analyzer.ts.
 */

import { NotImplemented } from '../core/index.js';

/** Default analysis window (Part D.7). */
export const DEFAULT_WINDOW_DAYS = 90;

/** Named weights for the 0..10 risk score (Part D.7). Tunable. */
export const RISK_WEIGHTS = {
  churn: 0.3,
  authorSpread: 0.2,
  coupling: 0.2,
  incidents: 0.2,
  recency: 0.1,
} as const;

/** Commit-message markers that flag an incident-linked commit (Part D.7). */
export const INCIDENT_MARKERS = [
  'revert',
  'hotfix',
  'rollback',
  'incident',
  'outage',
] as const;

export interface RawSignals {
  distinctAuthors: number;
  commitsLast90d: number;
  coupledPaths: string[];
  incidentLinkedCommits: number;
  lastTouchedDaysAgo: number;
}

/** Combine raw signals into a 0..10 score with named weights. */
export function combineSignals(_s: RawSignals): { score: number; notes: string[] } {
  throw new NotImplemented('combineSignals (#48)');
}
