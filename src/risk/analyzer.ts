/**
 * RiskAnalyzer — A2 (Tracer), issue #48 / Part D.7. PHASE 0 STUB.
 * Distinct authors, churn, coupled paths, incident-linked commits, recency → 0..10 score.
 * True module fan-in via an import graph is V3 — do NOT attempt it in V1.
 */

import type { GitClient, RiskAnalyzer, RiskReport, Store } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

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

export class Analyzer implements RiskAnalyzer {
  constructor(
    private readonly deps: RiskAnalyzerDeps,
    private readonly windowDays = 90,
  ) {
    void this.deps;
    void this.windowDays;
  }

  analyze(_path: string): Promise<RiskReport> {
    throw new NotImplemented('Analyzer.analyze (#48)');
  }
}
