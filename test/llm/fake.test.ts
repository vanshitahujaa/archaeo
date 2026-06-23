/**
 * Tests for FakeProvider (#16) — determinism, ladder selection, noEvidence path.
 */

import { describe, expect, it } from 'vitest';
import { FakeProvider, BUNDLE_TAG } from '../../src/llm/providers/fake.js';
import { buildWhyPrompt } from '../../src/llm/prompts.js';
import { makeBundle, makeEmptyBundle } from './fixtures.js';

describe('FakeProvider', () => {
  const provider = new FakeProvider();

  it('name is "fake"', () => {
    expect(provider.name).toBe('fake');
  });

  it('is deterministic — same bundle produces identical output on repeated calls', async () => {
    const bundle = makeBundle();
    const { system, user } = buildWhyPrompt(bundle);
    const input = { system, user, maxTokens: 256 };

    const first = await provider.complete(input);
    const second = await provider.complete(input);
    expect(first).toBe(second);
  });

  it('produces a parseable WhyAnswer JSON', async () => {
    const bundle = makeBundle();
    const { system, user } = buildWhyPrompt(bundle);
    const raw = await provider.complete({ system, user, maxTokens: 256 });
    const answer = JSON.parse(raw);

    expect(answer).toHaveProperty('reason');
    expect(answer).toHaveProperty('citations');
    expect(answer).toHaveProperty('confidence');
    expect(answer).toHaveProperty('noEvidence');
    expect(typeof answer.reason).toBe('string');
    expect(Array.isArray(answer.citations)).toBe(true);
  });

  it('returns noEvidence=true for empty bundle', async () => {
    const bundle = makeEmptyBundle();
    const { system, user } = buildWhyPrompt(bundle);
    const raw = await provider.complete({ system, user, maxTokens: 256 });
    const answer = JSON.parse(raw);

    expect(answer.noEvidence).toBe(true);
    expect(answer.reason).toBe('No recorded decision found.');
    expect(answer.citations).toHaveLength(0);
  });

  it('returns noEvidence=false for bundle with evidence', async () => {
    const bundle = makeBundle();
    const { system, user } = buildWhyPrompt(bundle);
    const raw = await provider.complete({ system, user, maxTokens: 256 });
    const answer = JSON.parse(raw);

    expect(answer.noEvidence).toBe(false);
  });

  it('echoes bundle confidence', async () => {
    for (const confidence of ['high', 'medium', 'low'] as const) {
      const bundle = makeBundle({ confidence });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      expect(answer.confidence).toBe(confidence);
    }
  });

  it('returns noEvidence=true when prompt has no BUNDLE_TAG', async () => {
    const raw = await provider.complete({
      system: 'sys',
      user: 'some prompt with no tag',
      maxTokens: 256,
    });
    const answer = JSON.parse(raw);
    expect(answer.noEvidence).toBe(true);
  });

  describe('evidence ladder selection', () => {
    it('uses review comment when usedSource=review', async () => {
      const bundle = makeBundle({ usedSource: 'review' });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      // Reason should include text from the top review comment.
      expect(answer.reason).toContain('concurrent login races');
    });

    it('uses PR body when usedSource=pr_body', async () => {
      const bundle = makeBundle({ usedSource: 'pr_body' });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      expect(answer.reason).toContain('PR #184');
    });

    it('uses issue body when usedSource=issue', async () => {
      const bundle = makeBundle({ usedSource: 'issue' });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      expect(answer.reason).toContain('Issue #102');
    });

    it('uses commit message when usedSource=commit_message', async () => {
      const bundle = makeBundle({ usedSource: 'commit_message' });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      // Reason should include the commit message text.
      expect(answer.reason).toContain('duplicate concurrent sessions');
    });

    it('uses behavioral hints when usedSource=behavioral', async () => {
      const bundle = makeBundle({
        usedSource: 'behavioral',
        introducingPr: undefined,
        linkedIssue: undefined,
        reviewComments: [],
      });
      const { system, user } = buildWhyPrompt(bundle);
      const raw = await provider.complete({ system, user, maxTokens: 256 });
      const answer = JSON.parse(raw);
      expect(answer.reason).toContain('session lock');
    });
  });

  it('citations only reference artifacts present in bundle', async () => {
    const bundle = makeBundle();
    const { system, user } = buildWhyPrompt(bundle);
    const raw = await provider.complete({ system, user, maxTokens: 256 });
    const answer = JSON.parse(raw) as { citations: string[] };

    // The fake provider should only emit artifacts that exist in the bundle.
    // bundle has PR #184, Issue #102, and commit abc1234.
    for (const c of answer.citations) {
      const prMatch = /^PR #(\d+)$/.exec(c);
      const issueMatch = /^Issue #(\d+)$/.exec(c);
      const commitMatch = /^commit ([0-9a-f]+)$/i.exec(c);
      const reviewMatch = /^review by (.+)$/.exec(c);

      if (prMatch) expect(bundle.introducingPr?.number).toBe(parseInt(prMatch[1]!, 10));
      else if (issueMatch) expect(bundle.linkedIssue?.number).toBe(parseInt(issueMatch[1]!, 10));
      else if (commitMatch) {
        const sha = commitMatch[1]!;
        const bundleShas = bundle.candidates.map((c) => c.commit.sha.slice(0, sha.length));
        expect(bundleShas).toContain(sha.toLowerCase());
      } else if (reviewMatch) {
        const authors = bundle.reviewComments.map((r) => r.author.toLowerCase());
        expect(authors).toContain(reviewMatch[1]!.trim().toLowerCase());
      } else {
        // Unknown format — should not happen with the fake provider.
        expect.fail(`Unknown citation format: ${c}`);
      }
    }
  });
});

describe('FakeProvider — BUNDLE_TAG is embedded in prompt', () => {
  it('buildWhyPrompt embeds BUNDLE_TAG so FakeProvider can extract bundle', () => {
    const bundle = makeBundle();
    const { user } = buildWhyPrompt(bundle);
    expect(user).toContain(BUNDLE_TAG);
  });
});
