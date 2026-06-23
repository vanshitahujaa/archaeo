/**
 * Test fixtures for the LLM module tests.
 */

import type {
  Candidate,
  EvidenceBundle,
  Issue,
  PullRequest,
  RankedComment,
} from '../../src/core/types.js';

export function makeCommit(overrides: Partial<Candidate['commit']> = {}): Candidate['commit'] {
  return {
    sha: 'abc1234567890abcdef1234567890abcdef123456',
    authorLogin: 'alice',
    authorName: 'Alice Dev',
    authoredAt: '2024-01-14T10:00:00Z',
    message: 'fix: prevent duplicate concurrent sessions',
    ...overrides,
  };
}

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    commit: makeCommit(),
    score: 0.9,
    kind: 'behavioral',
    reasons: ['introduced retry logic'],
    ...overrides,
  };
}

export function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 184,
    title: 'Prevent duplicate concurrent customer sessions',
    body: 'This PR adds a lock to prevent duplicate concurrent customer sessions.',
    authorLogin: 'alice',
    state: 'merged',
    ...overrides,
  };
}

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 102,
    title: 'Duplicate session bug',
    body: 'Users can end up with duplicate sessions under concurrent load.',
    state: 'closed',
    ...overrides,
  };
}

export function makeReviewComment(overrides: Partial<RankedComment> = {}): RankedComment {
  return {
    author: 'priya',
    body: 'This fixes concurrent login races — the lock prevents duplicate session creation.',
    submittedAt: '2024-01-13T12:00:00Z',
    relevance: 0.95,
    ...overrides,
  };
}

export function makeBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const candidate = makeCandidate();
  return {
    path: 'src/auth.ts',
    line: 57,
    candidates: [candidate],
    primary: candidate,
    lineage: [candidate.commit],
    introducingPr: makePr(),
    linkedIssue: makeIssue(),
    reviewComments: [makeReviewComment()],
    behavioral: {
      introducingSha: candidate.commit.sha,
      coChangedPaths: ['src/session.ts'],
      summaryHints: ['added session lock'],
    },
    usedSource: 'review',
    chainBroken: false,
    confidence: 'high',
    confidenceReasons: ['clear winning candidate', 'PR and issue found'],
    ...overrides,
  };
}

/** A bundle with NO evidence at all. */
export function makeEmptyBundle(): EvidenceBundle {
  return {
    path: 'src/legacy/cache.ts',
    line: 31,
    candidates: [],
    lineage: [],
    reviewComments: [],
    behavioral: { coChangedPaths: [], summaryHints: [] },
    usedSource: 'behavioral',
    chainBroken: true,
    confidence: 'low',
    confidenceReasons: ['no candidates found', 'chain broken'],
  };
}
