/**
 * Gemini provider — A6 (Narrator), issue #33. PHASE 0 STUB.
 * Uses `@google/generative-ai` (optional dependency).
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  constructor(private readonly opts: GeminiProviderOptions) {
    void this.opts;
  }
  complete(_input: LlmCompletionInput): Promise<string> {
    throw new NotImplemented('GeminiProvider.complete (#33)');
  }
}
