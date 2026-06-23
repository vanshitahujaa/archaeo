/**
 * Anthropic provider — A6 (Narrator), issue #33. PHASE 0 STUB.
 * Uses `@anthropic-ai/sdk` (optional dependency). Default V1 provider.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  constructor(private readonly opts: AnthropicProviderOptions) {
    void this.opts;
  }
  complete(_input: LlmCompletionInput): Promise<string> {
    throw new NotImplemented('AnthropicProvider.complete (#33)');
  }
}
