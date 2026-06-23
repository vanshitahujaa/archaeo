/**
 * `why` / `explain-commit` formatter — A5 (Surface), issue #51 / Part M. PHASE 0 STUB.
 * Must match the exact output shapes in Part M (clear winner, ambiguous lineage,
 * recovered chain, honest LOW).
 */

import type {
  CommitExplanation,
  EvidenceBundle,
  Formatter,
  RiskReport,
  WhyAnswer,
} from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export class TerminalFormatter implements Formatter {
  why(_bundle: EvidenceBundle, _answer: WhyAnswer): string {
    throw new NotImplemented('TerminalFormatter.why (#51)');
  }
  risk(_report: RiskReport): string {
    throw new NotImplemented('TerminalFormatter.risk (#52)');
  }
  explainCommit(_explanation: CommitExplanation, _answer: WhyAnswer): string {
    throw new NotImplemented('TerminalFormatter.explainCommit (#51)');
  }
}
