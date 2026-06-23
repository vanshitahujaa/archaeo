/**
 * Cosmetic vs behavioral classifier — A2 (Tracer), issue #40 / Part D.1.
 * PHASE 0 STUB. The single highest-leverage piece of code in the repo (D.1). Deterministic,
 * no LLM. Gets its own precision/recall suite against A7's hand-labeled set (#61).
 */

import { NotImplemented } from '../core/index.js';

export interface ClassificationInput {
  /** Lines added by the commit in the region of interest. */
  added: string[];
  /** Lines removed by the commit in the region of interest. */
  removed: string[];
  /** True if the file was renamed/moved (path changed) in this commit. */
  pathChanged?: boolean;
}

export interface Classification {
  isCosmetic: boolean;
  reason: string;
}

export function classifyChange(_input: ClassificationInput): Classification {
  throw new NotImplemented('classifyChange (#40)');
}
