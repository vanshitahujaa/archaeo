/**
 * Tests for Summarizer (#17) — defensive parsing, citation enforcement (#18),
 * noEvidence path, ladder selection.
 */

import { describe, expect, it } from 'vitest';
import { Summarizer } from '../../src/llm/summarizer.js';
import { FakeProvider } from '../../src/llm/providers/fake.js';
import type { LlmProvider, LlmCompletionInput } from '../../src/core/index.js';
import { makeBundle, makeEmptyBundle } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal mock provider that returns a fixed raw string. */
function mockProvider(raw: string): LlmProvider {
  return {
    name: 'mock',
    complete: (_input: LlmCompletionInput) => Promise.resolve(raw),
  };
}

/** A provider that always throws. */
function failingProvider(): LlmProvider {
  return {
    name: 'fail',
    complete: () => Promise.reject(new Error('provider error')),
  };
}

// ---------------------------------------------------------------------------
// Summarizer integration with FakeProvider
// ---------------------------------------------------------------------------

describe('Summarizer with FakeProvider', () => {
  const summarizer = new Summarizer(new FakeProvider());

  it('returns a valid WhyAnswer for a full bundle', async () => {
    const bundle = makeBundle();
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.reason).toBeTruthy();
    expect(Array.isArray(answer.citations)).toBe(true);
    expect(['high', 'medium', 'low']).toContain(answer.confidence);
    expect(typeof answer.noEvidence).toBe('boolean');
  });

  it('noEvidence=true for empty bundle', async () => {
    const bundle = makeEmptyBundle();
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
    expect(answer.reason).toBe('No recorded decision found.');
    expect(answer.citations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Defensive parsing (#17)
// ---------------------------------------------------------------------------

describe('Summarizer — defensive parsing', () => {
  it('parses a clean JSON response', async () => {
    const raw = JSON.stringify({
      reason: 'Prevents duplicate sessions.',
      citations: ['PR #184'],
      confidence: 'high',
      noEvidence: false,
    });
    const bundle = makeBundle();
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.reason).toBe('Prevents duplicate sessions.');
    expect(answer.noEvidence).toBe(false);
  });

  it('strips ```json fences and parses', async () => {
    const raw = '```json\n{"reason":"Prevents duplicates.","citations":["PR #184"],"confidence":"high","noEvidence":false}\n```';
    const bundle = makeBundle();
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.reason).toBe('Prevents duplicates.');
  });

  it('strips plain ``` fences and parses', async () => {
    const raw = '```\n{"reason":"Prevents duplicates.","citations":[],"confidence":"medium","noEvidence":false}\n```';
    const bundle = makeBundle({ confidence: 'medium' });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.reason).toBe('Prevents duplicates.');
  });

  it('falls back to noEvidence on garbage input', async () => {
    const bundle = makeBundle();
    const summarizer = new Summarizer(mockProvider('this is not json at all!'));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
    expect(answer.reason).toBe('No recorded decision found.');
    expect(answer.confidence).toBe(bundle.confidence);
  });

  it('falls back to noEvidence on empty string', async () => {
    const bundle = makeBundle();
    const summarizer = new Summarizer(mockProvider(''));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
  });

  it('falls back to noEvidence on valid JSON but wrong shape (no reason)', async () => {
    const raw = JSON.stringify({ citations: [], confidence: 'high', noEvidence: false });
    const bundle = makeBundle();
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
  });

  it('falls back to noEvidence when provider throws', async () => {
    const bundle = makeBundle();
    const summarizer = new Summarizer(failingProvider());
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
    expect(answer.reason).toBe('No recorded decision found.');
  });

  it('uses bundle confidence as fallback when model returns invalid confidence', async () => {
    const raw = JSON.stringify({
      reason: 'Some reason.',
      citations: [],
      confidence: 'VERY_HIGH', // invalid
      noEvidence: false,
    });
    const bundle = makeBundle({ confidence: 'medium' });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.confidence).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Citation enforcement (#18) — fabricated citations are dropped
// ---------------------------------------------------------------------------

describe('Summarizer — citation enforcement', () => {
  it('keeps citations that match real bundle artifacts', async () => {
    const bundle = makeBundle(); // has PR #184, Issue #102, commit abc1234
    const sha7 = bundle.candidates[0]!.commit.sha.slice(0, 7);
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: [`PR #184`, `Issue #102`, `commit ${sha7}`],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain('PR #184');
    expect(answer.citations).toContain('Issue #102');
    expect(answer.citations).toContain(`commit ${sha7}`);
  });

  it('drops a fabricated PR number not in the bundle', async () => {
    const bundle = makeBundle(); // PR #184 is real
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: ['PR #184', 'PR #999'], // PR #999 is fabricated
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain('PR #184');
    expect(answer.citations).not.toContain('PR #999');
  });

  it('drops a fabricated issue number not in the bundle', async () => {
    const bundle = makeBundle(); // Issue #102 is real
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: ['Issue #102', 'Issue #777'],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain('Issue #102');
    expect(answer.citations).not.toContain('Issue #777');
  });

  it('drops a fabricated commit SHA not in the bundle', async () => {
    const bundle = makeBundle();
    const realSha7 = bundle.candidates[0]!.commit.sha.slice(0, 7);
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: [`commit ${realSha7}`, 'commit deadbeef'],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain(`commit ${realSha7}`);
    expect(answer.citations).not.toContain('commit deadbeef');
  });

  it('drops citations in an unknown format', async () => {
    const bundle = makeBundle();
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: ['PR #184', 'Jira TICKET-42', 'Slack #general'],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain('PR #184');
    expect(answer.citations).not.toContain('Jira TICKET-42');
    expect(answer.citations).not.toContain('Slack #general');
  });

  it('results in empty citations if all citations are fabricated', async () => {
    const bundle = makeBundle();
    const raw = JSON.stringify({
      reason: 'Some reason.',
      citations: ['PR #1', 'Issue #2', 'commit 0000000'],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toHaveLength(0);
  });

  it('allows "review by <author>" citation when author is in bundle', async () => {
    const bundle = makeBundle(); // has review by 'priya'
    const raw = JSON.stringify({
      reason: 'Prevents duplicates.',
      citations: ['review by priya', 'review by nobody'],
      confidence: 'high',
      noEvidence: false,
    });
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.citations).toContain('review by priya');
    expect(answer.citations).not.toContain('review by nobody');
  });
});

// ---------------------------------------------------------------------------
// noEvidence path
// ---------------------------------------------------------------------------

describe('Summarizer — noEvidence path', () => {
  it('propagates noEvidence=true from model response', async () => {
    const raw = JSON.stringify({
      reason: 'No recorded decision found.',
      citations: [],
      confidence: 'low',
      noEvidence: true,
    });
    const bundle = makeEmptyBundle();
    const summarizer = new Summarizer(mockProvider(raw));
    const answer = await summarizer.summarizeWhy(bundle);

    expect(answer.noEvidence).toBe(true);
    expect(answer.citations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Respect maxTokens option
// ---------------------------------------------------------------------------

describe('Summarizer — maxTokens option', () => {
  it('passes maxTokens to the provider', async () => {
    let capturedMaxTokens: number | undefined;
    const spy: LlmProvider = {
      name: 'spy',
      complete: (input: LlmCompletionInput) => {
        capturedMaxTokens = input.maxTokens;
        return Promise.resolve(
          JSON.stringify({ reason: 'x', citations: [], confidence: 'low', noEvidence: false }),
        );
      },
    };

    const summarizer = new Summarizer(spy, { maxTokens: 128 });
    await summarizer.summarizeWhy(makeBundle());
    expect(capturedMaxTokens).toBe(128);
  });

  it('uses default 256 when no maxTokens option', async () => {
    let capturedMaxTokens: number | undefined;
    const spy: LlmProvider = {
      name: 'spy',
      complete: (input: LlmCompletionInput) => {
        capturedMaxTokens = input.maxTokens;
        return Promise.resolve(
          JSON.stringify({ reason: 'x', citations: [], confidence: 'low', noEvidence: false }),
        );
      },
    };

    const summarizer = new Summarizer(spy);
    await summarizer.summarizeWhy(makeBundle());
    expect(capturedMaxTokens).toBe(256);
  });
});
