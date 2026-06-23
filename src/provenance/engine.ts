/**
 * ProvenanceEngine — A2 (Tracer), issues #47/#48 / Part D. PHASE 0 STUB.
 *
 * Wires the tracer (#41), scorer (#42), classifier (#40), comment ranker (#44),
 * behavioral evidence (#45), linker (#43), and confidence (#46) with the provenance cache
 * and the Part D.8 performance budget. The engine NEVER writes prose.
 */

import type {
  CommitExplanation,
  EvidenceBundle,
  GitClient,
  HostClient,
  ProvenanceEngine,
  Store,
} from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface EngineDeps {
  git: GitClient;
  host: HostClient;
  store: Store;
  repo: string;
}

export interface EngineOptions {
  /** Cap history-walk depth / pickaxe breadth (Part D.8). */
  maxHistoryDepth?: number;
  /** Skip the provenance cache (force recompute). */
  noCache?: boolean;
}

export class Engine implements ProvenanceEngine {
  constructor(
    private readonly deps: EngineDeps,
    private readonly opts: EngineOptions = {},
  ) {
    void this.deps;
    void this.opts;
  }

  explainLine(_path: string, _line: number): Promise<EvidenceBundle> {
    throw new NotImplemented('Engine.explainLine (#47)');
  }

  explainCommit(_sha: string): Promise<CommitExplanation> {
    throw new NotImplemented('Engine.explainCommit (#48)');
  }
}
