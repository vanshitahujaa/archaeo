/**
 * Comment-ranking label-set measurement — #34 / Part D.3.
 *
 * For each hand-labeled review thread, the MERGED engine's `rankComments` must put the
 * human-labeled substantive comment FIRST. Per the spec, "one substantive comment outranks
 * 50 noise comments."
 *
 * Ownership: test/benchmark/ + test/fixtures/labels/.
 */

import { describe, expect, it } from 'vitest';
import { rankComments } from '../../src/provenance/comments.js';
import type { ReviewComment } from '../../src/core/index.js';
import { COMMENT_LABELS, type RawComment } from '../fixtures/labels/commentLabels.js';

function toReviewComment(c: RawComment): ReviewComment {
  const out: ReviewComment = { author: c.author, body: c.body, submittedAt: c.submittedAt };
  if (c.path !== undefined) out.path = c.path;
  if (c.line !== undefined) out.line = c.line;
  return out;
}

describe('rankComments vs hand-labeled "most relevant" set (#34)', () => {
  for (const scenario of COMMENT_LABELS) {
    it(`ranks the substantive comment first: ${scenario.name}`, () => {
      const ranked = rankComments({
        comments: scenario.comments.map(toReviewComment),
        introducingPaths: scenario.introducingPaths,
      });
      expect(ranked.length).toBeGreaterThanOrEqual(1);
      expect(ranked[0]?.author, scenario.rationale).toBe(scenario.mostRelevantAuthor);
    });
  }

  it('keeps at most the top two (Part D.3)', () => {
    for (const scenario of COMMENT_LABELS) {
      const ranked = rankComments({
        comments: scenario.comments.map(toReviewComment),
        introducingPaths: scenario.introducingPaths,
      });
      expect(ranked.length).toBeLessThanOrEqual(2);
    }
  });

  it('one substantive comment outranks 50 noise comments', () => {
    const noise: ReviewComment[] = [];
    for (let i = 0; i < 50; i++) {
      noise.push({
        author: `bot${i}-bot`,
        body: ['lgtm', 'nit', 'ship it', '+1', 'style'][i % 5] as string,
        submittedAt: '2024-01-01T00:00:00Z',
      });
    }
    const substantive: ReviewComment = {
      author: 'priya',
      body: 'this fixes duplicate session creation — without the guard, concurrent logins create two sessions and the second overwrites the first.',
      path: 'auth.ts',
      line: 57,
      submittedAt: '2024-01-02T00:00:00Z',
    };
    const ranked = rankComments({
      comments: [...noise, substantive],
      introducingPaths: ['auth.ts'],
    });
    expect(ranked[0]?.author).toBe('priya');
  });
});
