/**
 * Anthropic provider — A6 (Narrator), issue #19.
 *
 * Uses `@anthropic-ai/sdk` via lazy dynamic import so the fake path and tests
 * work with no SDK installed (it is an optionalDependency). Default V1 provider.
 * Never logs API keys.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Default: claude-3-5-haiku-20241022 — cheap, fast, good enough for summarization. */
  model?: string;
}

const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(private readonly opts: AnthropicProviderOptions) {}

  async complete(input: LlmCompletionInput): Promise<string> {
    // Lazy import so the fake path never requires the SDK.
    let sdk: typeof import('@anthropic-ai/sdk');
    try {
      sdk = await import('@anthropic-ai/sdk');
    } catch {
      throw new Error(
        'AnthropicProvider requires @anthropic-ai/sdk. Install it: pnpm add @anthropic-ai/sdk',
      );
    }

    const client = new sdk.default({ apiKey: this.opts.apiKey });
    const model = this.opts.model ?? DEFAULT_MODEL;

    const message = await client.messages.create({
      model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
    });

    // Extract text from the first content block.
    const block = message.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('AnthropicProvider: unexpected response shape — no text block');
    }
    return block.text;
  }
}
