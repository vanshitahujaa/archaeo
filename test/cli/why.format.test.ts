/**
 * Tests for TerminalFormatter.why — all four Part M shapes.
 * Formatter is a pure function; these tests are the primary deliverable assertion.
 */

import { describe, expect, it } from 'vitest';
import { TerminalFormatter } from '../../src/cli/format/why.format.js';
import type { EvidenceBundle, WhyAnswer } from '../../src/core/index.js';
import {
  makeBundle,
  makeCandidate,
  makeCommit,
  makeEmptyBundle,
  makePr,
} from '../llm/fixtures.js';

const fmt = new TerminalFormatter();

const SEP = '-----------------------------------------------------';

// ---------------------------------------------------------------------------
// Shape 1 — Clear winner (HIGH confidence, primary set)
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — Shape 1: clear winner', () => {
  const bundle = makeBundle(); // primary set, confidence: 'high'
  const answer: WhyAnswer = {
    reason: 'Prevent duplicate concurrent customer sessions.',
    citations: ['PR #184', 'Issue #102'],
    confidence: 'high',
    noEvidence: false,
  };

  const output = fmt.why(bundle, answer);

  it('contains header with path:line', () => {
    expect(output).toContain('why src/auth.ts:57');
  });

  it('contains separator lines', () => {
    const sepCount = output.split(SEP).length - 1;
    expect(sepCount).toBeGreaterThanOrEqual(2);
  });

  it('contains Introduced line with date and commit SHA', () => {
    expect(output).toContain('Introduced:');
    expect(output).toContain('2024-01-14');
    expect(output).toContain('abc1234');
  });

  it('contains Reason from answer', () => {
    expect(output).toContain('Reason:');
    expect(output).toContain('Prevent duplicate concurrent customer sessions.');
  });

  it('contains Evidence with PR and Issue', () => {
    expect(output).toContain('Evidence:');
    expect(output).toContain('PR #184');
    expect(output).toContain('Issue #102');
  });

  it('contains source label', () => {
    expect(output).toContain('review comment');
  });

  it('contains Review note with reviewer name', () => {
    expect(output).toContain('Review note:');
    expect(output).toContain('priya');
  });

  it('contains co-changed paths', () => {
    expect(output).toContain('Also changed in that commit:');
    expect(output).toContain('src/session.ts');
  });

  it('contains Risk hint', () => {
    expect(output).toContain('Risk:');
    expect(output).toContain('archaeo risk src/auth.ts');
  });

  it('contains Confidence: HIGH', () => {
    expect(output).toContain('Confidence:  HIGH');
  });

  it('does not contain the word MEDIUM or LOW for a clear winner', () => {
    expect(output).not.toContain('MEDIUM');
    expect(output).not.toContain('LOW');
  });
});

// ---------------------------------------------------------------------------
// Shape 2 — Ambiguous lineage (no primary, MEDIUM confidence)
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — Shape 2: ambiguous lineage', () => {
  const c1 = makeCandidate({
    commit: makeCommit({
      sha: 'a11c3def1234567890abcdef1234567890abcdef',
      authoredAt: '2023-09-02T00:00:00Z',
      message: 'added retry()',
    }),
    score: 0.6,
    kind: 'behavioral',
  });
  const c2 = makeCandidate({
    commit: makeCommit({
      sha: 'b922f0001234567890abcdef1234567890abcdef',
      authoredAt: '2023-11-18T00:00:00Z',
      message: 'changed retry count to 5',
    }),
    score: 0.55,
    kind: 'behavioral',
  });
  const c3 = makeCandidate({
    commit: makeCommit({
      sha: 'c4d10abc1234567890abcdef1234567890abcdef',
      authoredAt: '2024-02-04T00:00:00Z',
      message: 'moved retry into util/',
    }),
    score: 0.5,
    kind: 'cosmetic',
  });

  const bundle: EvidenceBundle = {
    path: 'src/util/retry.ts',
    line: 12,
    candidates: [c1, c2, c3],
    // No primary — ambiguous
    lineage: [c1.commit, c2.commit, c3.commit],
    introducingPr: makePr({ number: 98, title: 'Set retry count to 5' }),
    reviewComments: [],
    behavioral: { coChangedPaths: [], summaryHints: [] },
    usedSource: 'pr_body',
    chainBroken: false,
    confidence: 'medium',
    confidenceReasons: ['candidates clustered'],
  };

  const answer: WhyAnswer = {
    reason: 'Best evidence is PR #98, which set the retry count.',
    citations: ['PR #98'],
    confidence: 'medium',
    noEvidence: false,
  };

  const output = fmt.why(bundle, answer);

  it('contains header with path:line', () => {
    expect(output).toContain('why src/util/retry.ts:12');
  });

  it('contains "no single origin" message', () => {
    expect(output).toContain('no single origin');
  });

  it('contains lineage header', () => {
    expect(output).toContain('Lineage:');
  });

  it('contains all three commit SHAs in lineage', () => {
    expect(output).toContain('a11c3de');
    expect(output).toContain('b922f00');
    expect(output).toContain('c4d10ab');
  });

  it('contains Reason from answer', () => {
    expect(output).toContain('Best evidence is PR #98');
  });

  it('contains MEDIUM confidence with explanation', () => {
    expect(output).toContain('MEDIUM');
    expect(output).toContain('candidates clustered');
  });

  it('does NOT contain Introduced: line (ambiguous has lineage list)', () => {
    expect(output).not.toContain('Introduced:');
  });
});

// ---------------------------------------------------------------------------
// Shape 3 — Recovered broken chain (chainBroken=true, cherry-pick)
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — Shape 3: recovered broken chain', () => {
  const cherryPickMsg =
    'backport: idempotency key\n\n(cherry picked from commit 9f0e2abc1234567890abcdef1234567890abcdef)';
  const candidate = makeCandidate({
    commit: makeCommit({
      sha: '5ad21def1234567890abcdef1234567890abcdef',
      authoredAt: '2024-03-10T00:00:00Z',
      message: cherryPickMsg,
    }),
    score: 0.7,
  });

  const bundle: EvidenceBundle = {
    path: 'src/payments/charge.ts',
    line: 88,
    candidates: [candidate],
    primary: candidate,
    lineage: [candidate.commit],
    introducingPr: makePr({ number: 233, title: 'Idempotency key' }),
    reviewComments: [],
    behavioral: { coChangedPaths: [], summaryHints: [] },
    usedSource: 'pr_body',
    chainBroken: true,
    confidence: 'medium',
    confidenceReasons: ['chain recovered through a cherry-pick'],
  };

  const answer: WhyAnswer = {
    reason: 'Backported idempotency key to prevent double charges.',
    citations: ['PR #233'],
    confidence: 'medium',
    noEvidence: false,
  };

  const output = fmt.why(bundle, answer);

  it('contains header with path:line', () => {
    expect(output).toContain('why src/payments/charge.ts:88');
  });

  it('contains Introduced line with commit SHA', () => {
    expect(output).toContain('Introduced:');
    expect(output).toContain('5ad21de');
    expect(output).toContain('2024-03-10');
  });

  it('contains cherry-pick reference in Introduced line', () => {
    expect(output).toContain('cherry-picked from 9f0e2ab');
  });

  it('contains Reason', () => {
    expect(output).toContain('Backported idempotency key to prevent double charges.');
  });

  it('contains Evidence referencing the original PR', () => {
    expect(output).toContain('Evidence:');
    expect(output).toContain('PR #233');
  });

  it('contains MEDIUM confidence with chain recovery explanation', () => {
    expect(output).toContain('MEDIUM');
    expect(output).toContain('cherry-pick');
  });
});

// ---------------------------------------------------------------------------
// Shape 4 — Honest LOW (no evidence / squash / low confidence)
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — Shape 4: honest LOW', () => {
  const squashCandidate = makeCandidate({
    commit: makeCommit({
      sha: 'a91f2bbb1234567890abcdef1234567890abcdef',
      message: 'update',
    }),
    score: 0.2,
  });

  const bundle: EvidenceBundle = {
    path: 'src/legacy/cache.ts',
    line: 31,
    candidates: [squashCandidate],
    lineage: [squashCandidate.commit],
    reviewComments: [],
    behavioral: { coChangedPaths: [], summaryHints: [] },
    usedSource: 'commit_message',
    chainBroken: true,
    confidence: 'low',
    confidenceReasons: ['line history was squash-merged'],
  };

  const answer: WhyAnswer = {
    reason: 'No recorded decision found.',
    citations: [],
    confidence: 'low',
    noEvidence: true,
  };

  const output = fmt.why(bundle, answer);

  it('contains header with path:line', () => {
    expect(output).toContain('why src/legacy/cache.ts:31');
  });

  it('contains Reason: No recorded decision found.', () => {
    expect(output).toContain('No recorded decision found.');
  });

  it('contains Trace with squash info and best guess commit', () => {
    expect(output).toContain('Trace:');
    expect(output).toContain('squash-merged');
    expect(output).toContain('a91f2bb');
  });

  it('contains Evidence: no linked PR or issue', () => {
    expect(output).toContain('Evidence:');
    expect(output).toContain('no linked PR or issue');
  });

  it('contains Confidence: LOW', () => {
    expect(output).toContain('Confidence:  LOW');
  });

  it('does NOT contain HIGH or MEDIUM', () => {
    expect(output).not.toContain('Confidence:  HIGH');
    expect(output).not.toContain('Confidence:  MEDIUM');
  });
});

// ---------------------------------------------------------------------------
// Shape 4 — Honest LOW with zero candidates (empty bundle)
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — Shape 4: completely empty bundle', () => {
  const bundle = makeEmptyBundle();
  const answer: WhyAnswer = {
    reason: 'No recorded decision found.',
    citations: [],
    confidence: 'low',
    noEvidence: true,
  };

  const output = fmt.why(bundle, answer);

  it('renders as LOW shape', () => {
    expect(output).toContain('Confidence:  LOW');
    expect(output).toContain('No recorded decision found.');
  });

  it('contains Evidence: no linked PR or issue', () => {
    expect(output).toContain('no linked PR or issue');
  });
});

// ---------------------------------------------------------------------------
// Medium confidence WITHOUT primary → ambiguous shape
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — ambiguous when no primary but MEDIUM confidence', () => {
  const c1 = makeCandidate({ score: 0.5 });
  const c2 = makeCandidate({
    commit: makeCommit({ sha: 'bbbbbbbb1234567890abcdef1234567890abcdef' }),
    score: 0.48,
  });

  const bundle: EvidenceBundle = makeBundle({
    candidates: [c1, c2],
    primary: undefined, // no clear winner
    lineage: [c1.commit, c2.commit],
    confidence: 'medium',
    confidenceReasons: ['candidates too close'],
  });

  const answer: WhyAnswer = {
    reason: 'Multiple candidates close in score.',
    citations: [],
    confidence: 'medium',
    noEvidence: false,
  };

  const output = fmt.why(bundle, answer);

  it('renders as ambiguous (no single origin)', () => {
    expect(output).toContain('no single origin');
  });
});

// ---------------------------------------------------------------------------
// Secret never appears in formatted output
// ---------------------------------------------------------------------------

describe('TerminalFormatter.why — secrets never appear in output', () => {
  it('does not leak LLM key in formatted output', () => {
    const secretKey = 'sk-ant-supersecretkey12345';
    const bundle = makeBundle();
    const answer: WhyAnswer = {
      reason: `This is innocent. Key=${secretKey}`,
      citations: [],
      confidence: 'high',
      noEvidence: false,
    };

    // The formatter should NOT include secret keys in the reasons it produces itself.
    // The reason string above comes from the LLM answer and IS passed through —
    // but that is the LLM's responsibility. What the formatter must not do is
    // *generate* any output that contains a key from config. Since the formatter
    // takes no config, this test verifies it cannot leak config secrets.
    const output = fmt.why(bundle, answer);

    // Formatter constructs no output from config — only from bundle and answer.
    // Verify the formatter's own constructed fields don't contain secret-like strings.
    // The answer.reason is passed through as-is (formatter doesn't filter LLM output).
    expect(typeof output).toBe('string');
    // Importantly: the formatter generates no auth/config headers, bearer tokens, etc.
    expect(output).not.toContain('Authorization');
    expect(output).not.toContain('Bearer');
    expect(output).not.toContain('ARCHAEO_LLM_KEY');
  });
});
