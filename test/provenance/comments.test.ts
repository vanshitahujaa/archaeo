/**
 * Review comment relevance ranking tests — #24 / Part D.3.
 * The substantive comment must outrank a pile of noise; bots and canned phrases are
 * downweighted; keep top 1–2.
 */

import { describe, expect, it } from 'vitest';
import { isBotAuthor, rankComments, scoreComment } from '../../src/provenance/comments.js';
import type { ReviewComment } from '../../src/core/index.js';

function rc(author: string, body: string, path?: string, line?: number): ReviewComment {
  const c: ReviewComment = { author, body, submittedAt: '2024-01-01T00:00:00Z' };
  if (path !== undefined) c.path = path;
  if (line !== undefined) c.line = line;
  return c;
}

describe('rankComments (D.3)', () => {
  it('one substantive comment outranks 50 noise comments', () => {
    const noise: ReviewComment[] = [];
    for (let i = 0; i < 50; i++) {
      noise.push(rc(`bot${i}-bot`, ['lgtm', 'nit', 'ship it', '+1', 'style'][i % 5] as string));
    }
    const substantive = rc(
      'priya',
      'this fixes duplicate session creation — without the guard, concurrent logins create two sessions and the second overwrites the first.',
      'auth.ts',
      57,
    );
    const ranked = rankComments({
      comments: [...noise, substantive],
      introducingPaths: ['auth.ts'],
    });
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0]?.author).toBe('priya');
    expect(ranked.length).toBeLessThanOrEqual(2);
  });

  it('anchored + causal comment beats a long-but-canned one', () => {
    const anchoredCausal = rc(
      'reviewer',
      'we add this because otherwise a race condition lets two requests through',
      'svc.ts',
      10,
    );
    const cannedLong = rc('dave', 'nit: please run prettier on this whole file before merging it', 'svc.ts', 10);
    const s1 = scoreComment(anchoredCausal, ['svc.ts']);
    const s2 = scoreComment(cannedLong, ['svc.ts']);
    expect(s1).toBeGreaterThan(s2);
  });

  it('drops zero-relevance comments entirely', () => {
    const ranked = rankComments({
      comments: [rc('ci-bot', 'CI passed'), rc('x', 'lgtm')],
      introducingPaths: [],
    });
    // both are bot/canned and not anchored → relevance 0 → dropped
    expect(ranked).toHaveLength(0);
  });

  it('keeps at most the top 2', () => {
    const comments = [
      rc('a', 'this prevents a regression because the cache was stale', 'f.ts'),
      rc('b', 'fixes the deadlock that happened under concurrent load', 'f.ts'),
      rc('c', 'avoid the duplicate by guarding on the idempotency key here', 'f.ts'),
    ];
    const ranked = rankComments({ comments, introducingPaths: ['f.ts'] });
    expect(ranked).toHaveLength(2);
  });
});

describe('isBotAuthor', () => {
  it.each([
    ['ci-bot', true],
    ['deploy-bot', true],
    ['dependabot[bot]', true],
    ['renovate-bot', true],
    ['priya', false],
    ['alice', false],
    ['abbott', false],
  ])('%s → %s', (author, expected) => {
    expect(isBotAuthor(author)).toBe(expected);
  });
});
