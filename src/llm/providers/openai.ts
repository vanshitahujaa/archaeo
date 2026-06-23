/**
 * OpenAI provider — A6 (Narrator), issue #19.
 *
 * Uses the `openai` SDK via lazy dynamic import so the fake path and tests
 * work with no SDK installed (it is an optionalDependency).
 * Never logs API keys.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';

export interface OpenAiProviderOptions {
  apiKey: string;
  /** Default: gpt-4o-mini — cheap, fast, good enough for summarization. */
  model?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(private readonly opts: OpenAiProviderOptions) {}

  async complete(input: LlmCompletionInput): Promise<string> {
    // Lazy import so the fake path never requires the SDK.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any;
    try {
      // Dynamic import — optional dependency; not required at compile time.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      sdk = await import('openai' as string);
    } catch {
      throw new Error('OpenAiProvider requires openai SDK. Install it: pnpm add openai');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const client = new sdk.default({ apiKey: this.opts.apiKey });
    const model = this.opts.model ?? DEFAULT_MODEL;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = await client.chat.completions.create({
      model,
      max_tokens: input.maxTokens,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenAiProvider: unexpected response shape — no text content');
    }
    return content;
  }
}
