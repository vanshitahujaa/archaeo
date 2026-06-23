/**
 * Summarizer — A6 (Narrator), issues #31/#32. PHASE 0 STUB.
 *
 * Wraps an LlmProvider: builds the prompt (prompts.ts), calls the provider, parses strict
 * JSON defensively (strip code fences, validate shape, fall back to noEvidence on failure),
 * and enforces citations (drop any citation not present in the bundle — Part F.3).
 */

import type { EvidenceBundle, LlmProvider, LlmSummarizer, WhyAnswer } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface SummarizerOptions {
  maxTokens?: number;
}

export class Summarizer implements LlmSummarizer {
  constructor(
    private readonly provider: LlmProvider,
    private readonly opts: SummarizerOptions = {},
  ) {
    void this.provider;
    void this.opts;
  }

  summarizeWhy(_bundle: EvidenceBundle): Promise<WhyAnswer> {
    throw new NotImplemented('Summarizer.summarizeWhy (#31)');
  }
}
