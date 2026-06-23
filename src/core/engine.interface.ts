/**
 * Engine interfaces — implement.md Part C.5.
 *
 * The ProvenanceEngine is the moat (Part A.3). It returns ranked candidates and an honest
 * confidence; it NEVER writes prose (that is the Narrator's job).
 *
 * OWNED BY LEAD.
 */

import type { CommitExplanation, EvidenceBundle, RiskReport } from './types.js';

export interface ProvenanceEngine {
  explainLine(path: string, line: number): Promise<EvidenceBundle>;
  explainCommit(sha: string): Promise<CommitExplanation>;
}

export interface RiskAnalyzer {
  analyze(path: string): Promise<RiskReport>;
}
