/**
 * Risk signals + named weights — A2 (Tracer), issue #48 / Part D.7. PHASE 0 STUB.
 * Documented, named weights (not magic numbers). Combined into a 0..10 score by analyzer.ts.
 */

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

/**
 * Saturation caps: the count at which a signal contributes its full weight. Above the cap,
 * the normalized signal is 1 (further churn/authors/etc. don't keep raising the score).
 */
export const SATURATION = {
  churnCommits: 20, // 20+ commits in the window = max churn signal
  authors: 6, // 6+ distinct authors = max spread signal
  coupledPaths: 8, // 8+ coupled paths = max coupling signal
  incidents: 3, // 3+ incident-linked commits = max incident signal
  recencyDays: 7, // touched within 7 days = max recency signal; decays to 0 by 90 days
} as const;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Recency → 0..1: 1 when touched today, decaying linearly to 0 at the window edge. */
function recencySignal(lastTouchedDaysAgo: number, windowDays: number): number {
  if (lastTouchedDaysAgo <= SATURATION.recencyDays) return 1;
  if (lastTouchedDaysAgo >= windowDays) return 0;
  return clamp01(1 - (lastTouchedDaysAgo - SATURATION.recencyDays) / (windowDays - SATURATION.recencyDays));
}

/** Combine raw signals into a 0..10 score with named weights. */
export function combineSignals(
  s: RawSignals,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): { score: number; notes: string[] } {
  const churn = clamp01(s.commitsLast90d / SATURATION.churnCommits);
  const authorSpread = clamp01(s.distinctAuthors / SATURATION.authors);
  const coupling = clamp01(s.coupledPaths.length / SATURATION.coupledPaths);
  const incidents = clamp01(s.incidentLinkedCommits / SATURATION.incidents);
  const recency = recencySignal(s.lastTouchedDaysAgo, windowDays);

  const weighted =
    RISK_WEIGHTS.churn * churn +
    RISK_WEIGHTS.authorSpread * authorSpread +
    RISK_WEIGHTS.coupling * coupling +
    RISK_WEIGHTS.incidents * incidents +
    RISK_WEIGHTS.recency * recency;

  const score = Math.round(clamp01(weighted) * 100) / 10; // 0..10, one decimal

  const notes: string[] = [];
  if (churn >= 0.5) notes.push(`high churn: ${s.commitsLast90d} commits in ${windowDays}d`);
  if (authorSpread >= 0.5) notes.push(`${s.distinctAuthors} distinct authors (broad ownership)`);
  if (incidents > 0) notes.push(`${s.incidentLinkedCommits} incident-linked commit(s)`);
  if (coupling >= 0.5) notes.push(`changes with ${s.coupledPaths.length} coupled path(s)`);
  if (recency >= 0.8) notes.push(`touched ${s.lastTouchedDaysAgo}d ago (recent)`);
  if (notes.length === 0) notes.push('low historical risk on this file');

  return { score, notes };
}
