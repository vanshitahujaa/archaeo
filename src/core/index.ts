/**
 * Core barrel — the single import surface for `src/core`.
 *
 * Specialists import contracts from here: `import type { Store } from '../core/index.js'`.
 * OWNED BY LEAD.
 */

export * from './types.js';
export * from './errors.js';
export type { Store, Edge, EdgeRel, CachedProvenance } from './store.interface.js';
export type {
  GitClient,
  LineHistoryStep,
  CommitDiff,
  CommitDiffFile,
  PickaxeHit,
  MoveSource,
} from './git.interface.js';
export type { HostClient } from './host.interface.js';
export type {
  LlmSummarizer,
  LlmProvider,
  LlmCompletionInput,
  WhyAnswer,
} from './llm.interface.js';
export type { Formatter } from './formatter.interface.js';
export type { ProvenanceEngine, RiskAnalyzer } from './engine.interface.js';
