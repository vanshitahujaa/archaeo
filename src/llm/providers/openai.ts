/**
 * OpenAI provider — A6 (Narrator), issue #33. PHASE 0 STUB.
 * Uses the `openai` SDK (optional dependency).
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface OpenAiProviderOptions {
  apiKey: string;
  model?: string;
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  constructor(private readonly opts: OpenAiProviderOptions) {
    void this.opts;
  }
  complete(_input: LlmCompletionInput): Promise<string> {
    throw new NotImplemented('OpenAiProvider.complete (#33)');
  }
}
