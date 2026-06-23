/**
 * Gemini provider — A6 (Narrator), issue #19.
 *
 * Uses `@google/generative-ai` via lazy dynamic import so the fake path and tests
 * work with no SDK installed (it is an optionalDependency).
 * Never logs API keys.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';

export interface GeminiProviderOptions {
  apiKey: string;
  /** Default: gemini-1.5-flash — cheap, fast, good enough for summarization. */
  model?: string;
}

const DEFAULT_MODEL = 'gemini-1.5-flash';

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(private readonly opts: GeminiProviderOptions) {}

  async complete(input: LlmCompletionInput): Promise<string> {
    // Lazy import so the fake path never requires the SDK.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any;
    try {
      // Dynamic import — optional dependency; not required at compile time.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      sdk = await import('@google/generative-ai' as string);
    } catch {
      throw new Error(
        'GeminiProvider requires @google/generative-ai. Install it: pnpm add @google/generative-ai',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const client = new sdk.GoogleGenerativeAI(this.opts.apiKey);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const model = client.getGenerativeModel({ model: this.opts.model ?? DEFAULT_MODEL });

    // Combine system + user as a single prompt (Gemini Flash doesn't have system role in
    // the generateContent API — use a chat session with a system instruction instead).
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const chat = model.startChat({
      systemInstruction: input.system,
      history: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const result = await chat.sendMessage(input.user);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const text = result.response.text();
    if (typeof text !== 'string' || text === '') {
      throw new Error('GeminiProvider: unexpected response — empty text');
    }
    return text;
  }
}
