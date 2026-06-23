/**
 * RiskAnalyzer — A2 (Tracer), issue #28 / Part D.7.
 *
 * For a file over a 90-day default window: distinct authors (spread), commit count (churn),
 * coupled paths via co-change, incident-linked commits (message markers or linked PRs), and
 * days since last touched. Combined into a 0..10 score with documented named weights
 * (signals.ts). True module fan-in via an import graph is V3 — NOT attempted here.
 */

import type { GitClient, RiskAnalyzer, RiskReport, Store } from '../core/index.js';
import {
  combineSignals,
  DEFAULT_WINDOW_DAYS,
  INCIDENT_MARKERS,
  type RawSignals,
} from './signals.js';

export interface RiskAnalyzerDeps {
  git: GitClient;
  host: HostClientLike;
  store: Store;
  repo: string;
}

/** Minimal host surface the analyzer needs (incident detection via linked PRs). */
export interface HostClientLike {
  prForCommit(sha: string): Promise<{ title: string; body: string } | null>;
}

/** How many commits must co-change with the target file to count it as "coupled". */
export const COUPLING_MIN_SHARED = 2;

export class Analyzer implements RiskAnalyzer {
  constructor(
    private readonly deps: RiskAnalyzerDeps,
    private readonly windowDays = DEFAULT_WINDOW_DAYS,
  ) {}

  async analyze(path: string): Promise<RiskReport> {
    const { commits, authors } = await this.deps.git.fileChurn(path, this.windowDays);

    const distinctAuthors = authors.length;
    const commitsInWindow = commits.length;

    // Co-change: count how often each other path appears in the same commits as `path`.
    const coupleCounts = new Map<string, number>();
    for (const c of commits) {
      const paths = await this.deps.git.coChangedPaths(c.sha);
      for (const p of paths) {
        if (p === path) continue;
        coupleCounts.set(p, (coupleCounts.get(p) ?? 0) + 1);
      }
    }
    const coupledPaths = [...coupleCounts.entries()]
      .filter(([, n]) => n >= COUPLING_MIN_SHARED)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);

    // Incident-linked commits: message markers, or a linked PR whose title/body mentions one.
    let incidentLinkedCommits = 0;
    for (const c of commits) {
      if (messageMarksIncident(c.message)) {
        incidentLinkedCommits += 1;
        continue;
      }
      const pr = await this.deps.host.prForCommit(c.sha);
      if (pr && messageMarksIncident(`${pr.title}\n${pr.body}`)) {
        incidentLinkedCommits += 1;
      }
    }

    // Recency: days since the most recent commit in the window.
    const lastTouchedDaysAgo = daysSinceMostRecent(commits.map((c) => c.authoredAt));

    const signals: RawSignals = {
      distinctAuthors,
      commitsLast90d: commitsInWindow,
      coupledPaths,
      incidentLinkedCommits,
      lastTouchedDaysAgo,
    };

    const { score, notes } = combineSignals(signals, this.windowDays);

    return { path, score, signals, notes };
  }
}

/** True when text contains any incident marker (revert/hotfix/rollback/incident/outage). */
export function messageMarksIncident(text: string): boolean {
  const lower = text.toLowerCase();
  return INCIDENT_MARKERS.some((m) => lower.includes(m));
}

/** Days between the most-recent ISO timestamp and now. Returns the window if none/invalid. */
export function daysSinceMostRecent(timestamps: string[], now: Date = new Date()): number {
  let mostRecent = -Infinity;
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (!Number.isNaN(t) && t > mostRecent) mostRecent = t;
  }
  if (mostRecent === -Infinity) return Number.MAX_SAFE_INTEGER;
  const ms = now.getTime() - mostRecent;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
