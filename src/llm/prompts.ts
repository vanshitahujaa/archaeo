/**
 * Prompt construction — A6 (Narrator), issue #31 / Part F.1. PHASE 0 STUB.
 *
 * The summarizer receives ONLY the EvidenceBundle, serialized. The system prompt enforces:
 * summarize using only the evidence, cite each artifact, set noEvidence when insufficient,
 * never add facts. Output is strict JSON matching WhyAnswer.
 */

import type { EvidenceBundle } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export const SYSTEM_PROMPT = `You summarize WHY a line of code exists, using ONLY the evidence provided.`;

export function buildWhyPrompt(_bundle: EvidenceBundle): { system: string; user: string } {
  throw new NotImplemented('buildWhyPrompt (#31)');
}
