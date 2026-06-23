/**
 * Live provider tests (#19) — skipped in CI unless the relevant key env var is set.
 *
 * To run locally:
 *   ARCHAEO_ANTHROPIC_KEY=sk-ant-... pnpm test test/llm/providers.live.test.ts
 *   ARCHAEO_OPENAI_KEY=sk-... pnpm test test/llm/providers.live.test.ts
 *   ARCHAEO_GEMINI_KEY=AIza... pnpm test test/llm/providers.live.test.ts
 *
 * Never log keys — tests must not print them.
 */

import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../../src/llm/providers/anthropic.js';
import { OpenAiProvider } from '../../src/llm/providers/openai.js';
import { GeminiProvider } from '../../src/llm/providers/gemini.js';
import { Summarizer } from '../../src/llm/summarizer.js';
import { makeBundle } from './fixtures.js';

const ANTHROPIC_KEY = process.env['ARCHAEO_ANTHROPIC_KEY'];
const OPENAI_KEY = process.env['ARCHAEO_OPENAI_KEY'];
const GEMINI_KEY = process.env['ARCHAEO_GEMINI_KEY'];

describe('AnthropicProvider live', () => {
  it.skipIf(!ANTHROPIC_KEY)('summarizeWhy returns a valid WhyAnswer', async () => {
    const provider = new AnthropicProvider({ apiKey: ANTHROPIC_KEY! });
    const summarizer = new Summarizer(provider);
    const answer = await summarizer.summarizeWhy(makeBundle());

    expect(answer.reason).toBeTruthy();
    expect(['high', 'medium', 'low']).toContain(answer.confidence);
    expect(Array.isArray(answer.citations)).toBe(true);
    expect(typeof answer.noEvidence).toBe('boolean');
    // Ensure no key leakage.
    expect(answer.reason).not.toContain(ANTHROPIC_KEY!.slice(0, 8));
  });
});

describe('OpenAiProvider live', () => {
  it.skipIf(!OPENAI_KEY)('summarizeWhy returns a valid WhyAnswer', async () => {
    const provider = new OpenAiProvider({ apiKey: OPENAI_KEY! });
    const summarizer = new Summarizer(provider);
    const answer = await summarizer.summarizeWhy(makeBundle());

    expect(answer.reason).toBeTruthy();
    expect(['high', 'medium', 'low']).toContain(answer.confidence);
    expect(Array.isArray(answer.citations)).toBe(true);
    expect(typeof answer.noEvidence).toBe('boolean');
    expect(answer.reason).not.toContain(OPENAI_KEY!.slice(0, 8));
  });
});

describe('GeminiProvider live', () => {
  it.skipIf(!GEMINI_KEY)('summarizeWhy returns a valid WhyAnswer', async () => {
    const provider = new GeminiProvider({ apiKey: GEMINI_KEY! });
    const summarizer = new Summarizer(provider);
    const answer = await summarizer.summarizeWhy(makeBundle());

    expect(answer.reason).toBeTruthy();
    expect(['high', 'medium', 'low']).toContain(answer.confidence);
    expect(Array.isArray(answer.citations)).toBe(true);
    expect(typeof answer.noEvidence).toBe('boolean');
    expect(answer.reason).not.toContain(GEMINI_KEY!.slice(0, 8));
  });
});
