/**
 * Polish fixes from real-repo validation (Maestro): #48 bot comments, #45 fake prose,
 * #49 co-changed cap. These guard the output-quality regressions found on cognee/kubernetes.
 */

import { describe, expect, it } from 'vitest';
import { rankComments, scoreComment, isBotAuthor } from '../src/provenance/comments.js';
import { clean } from '../src/llm/providers/fake.js';
import { TerminalFormatter } from '../src/cli/format/why.format.js';
import type { EvidenceBundle, ReviewComment } from '../src/core/index.js';
import type { WhyAnswer } from '../src/core/llm.interface.js';

describe('#48 bot review comments are downweighted below humans', () => {
  const causal = 'This is complicated because we track creations/deletions; it is error-prone.';

  it('detects [bot] authors', () => {
    expect(isBotAuthor('coderabbitai[bot]')).toBe(true);
    expect(isBotAuthor('github-actions[bot]')).toBe(true);
    expect(isBotAuthor('priya')).toBe(false);
  });

  it('a bot comment scores lower than the same comment from a human', () => {
    const paths = ['a.ts'];
    const bot = scoreComment({ author: 'coderabbitai[bot]', body: causal, submittedAt: '2024-01-01' }, paths);
    const human = scoreComment({ author: 'priya', body: causal, submittedAt: '2024-01-01' }, paths);
    expect(human).toBeGreaterThan(bot);
  });

  it('a human comment outranks a longer/causal bot comment', () => {
    const comments: ReviewComment[] = [
      { author: 'coderabbitai[bot]', body: causal + ' ' + causal, submittedAt: '2024-01-01' },
      { author: 'priya', body: 'This prevents a race condition on concurrent logins.', submittedAt: '2024-01-02' },
    ];
    const ranked = rankComments({ comments, introducingPaths: [] });
    expect(ranked[0]?.author).toBe('priya');
  });
});

describe('#45 fake-provider clean() yields crisp prose', () => {
  it('strips a markdown heading and takes the first sentence', () => {
    expect(clean('## Summary\n\nReplaces the stubs with real code. More detail here.')).toBe(
      'Replaces the stubs with real code.',
    );
  });

  it('skips blockquote/bot "tip" lines', () => {
    expect(clean('> [!TIP]\n> Codebase Verification\nThe real reason is here.')).toBe(
      'The real reason is here.',
    );
  });

  it('truncates very long single sentences', () => {
    const long = 'x'.repeat(300);
    expect(clean(long).length).toBeLessThanOrEqual(160);
    expect(clean(long).endsWith('…')).toBe(true);
  });
});

describe('#49 co-changed paths are capped in the why output', () => {
  it('shows at most 5 paths with a "+N more" suffix', () => {
    const paths = Array.from({ length: 50 }, (_, i) => `file${i}.ts`);
    const bundle = {
      path: 'a.ts',
      line: 1,
      candidates: [
        {
          commit: { sha: 'abcdef1234', authorLogin: 'p', authorName: 'P', authoredAt: '2024-01-01', message: 'm' },
          score: 0.9,
          kind: 'behavioral',
          reasons: [],
        },
      ],
      primary: undefined,
      lineage: [],
      reviewComments: [],
      behavioral: { introducingSha: 'abcdef1234', coChangedPaths: paths, summaryHints: [] },
      usedSource: 'commit_message',
      chainBroken: false,
      confidence: 'high',
      confidenceReasons: [],
    } as unknown as EvidenceBundle;
    bundle.primary = bundle.candidates[0];
    const answer: WhyAnswer = { reason: 'because', citations: [], confidence: 'high', noEvidence: false };
    const out = new TerminalFormatter().why(bundle, answer);
    const line = out.split('\n').find((l) => l.startsWith('Also changed')) ?? '';
    expect(line).toContain('(+45 more)');
    // 5 shown paths => 4 separating commas in the shown segment.
    expect(line.split('file').length - 1).toBe(5);
  });
});
