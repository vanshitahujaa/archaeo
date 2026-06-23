/**
 * Formatter interface — implement.md Part C.4 / Part M.
 *
 * Turns engine output into the terminal strings shown in Part M. Kept separate from the
 * engine so prose/format changes never touch provenance logic.
 *
 * OWNED BY LEAD.
 */

import type { CommitExplanation, EvidenceBundle, RiskReport } from './types.js';
import type { WhyAnswer } from './llm.interface.js';

export interface Formatter {
  why(bundle: EvidenceBundle, answer: WhyAnswer): string;
  risk(report: RiskReport): string;
  explainCommit(explanation: CommitExplanation, answer: WhyAnswer): string;
}
