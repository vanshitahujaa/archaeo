/**
 * LLM interface — implement.md Part C.4 / Part F.
 *
 * Summarize-only and provider-agnostic. The summarizer receives only the EvidenceBundle
 * and never adds facts. Swapping Claude / GPT / Gemini is a config change. `fake.ts`
 * gives deterministic output so the whole system is testable with no network and no key.
 *
 * OWNED BY LEAD.
 */

import type { Confidence, EvidenceBundle } from './types.js';

export interface WhyAnswer {
  /** One to three sentences, evidence-grounded. */
  reason: string;
  /** e.g. ["PR #184", "Issue #102", "commit 7f2a9c1"]. */
  citations: string[];
  confidence: Confidence;
  /** True if the model had nothing to summarize. */
  noEvidence: boolean;
}

/** High-level summarizer used by the engine/CLI. */
export interface LlmSummarizer {
  summarizeWhy(bundle: EvidenceBundle): Promise<WhyAnswer>;
}

/** Low-level provider abstraction (Part F.2). One per vendor, plus `fake`. */
export interface LlmProvider {
  readonly name: string;
  /**
   * Given a fully-rendered prompt, return the model's raw text. The summarizer is
   * responsible for prompt construction, JSON parsing, and citation enforcement.
   */
  complete(input: LlmCompletionInput): Promise<string>;
}

export interface LlmCompletionInput {
  system: string;
  user: string;
  maxTokens: number;
}
