/**
 * Evidence cache tests — issue #6.
 *
 * Covers: commit upsert, PR round-trip + upsert idempotency, issue round-trip,
 * review comment upsert/replace, getReviewComments.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Commit, Issue, PullRequest, ReviewComment } from '../../src/core/index.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';

const REPO = 'owner/repo';

function makeStore(): SqliteStore {
  return new SqliteStore({ dbPath: ':memory:' });
}

const COMMIT: Commit = {
  sha: 'abc123',
  authorLogin: 'alice',
  authorName: 'Alice Smith',
  authoredAt: '2024-01-01T00:00:00Z',
  message: 'feat: add retry logic',
};

const PR: PullRequest = {
  number: 42,
  title: 'Add retry',
  body: 'Adds retry logic',
  authorLogin: 'alice',
  mergedSha: 'abc123',
  state: 'merged',
};

const ISSUE: Issue = {
  number: 7,
  title: 'Retry on failure',
  body: 'We need retry',
  state: 'closed',
};

const REVIEW_COMMENT: ReviewComment = {
  author: 'bob',
  body: 'this fixes concurrent login races',
  path: 'src/auth.ts',
  line: 57,
  submittedAt: '2024-01-02T10:00:00Z',
};

describe('evidence cache (#6)', () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = makeStore();
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  // ---------- commits ----------

  it('upsertCommits does not throw for an empty array', async () => {
    await expect(store.upsertCommits(REPO, [])).resolves.toBeUndefined();
  });

  it('upsertCommits stores a commit and does not throw on re-insert', async () => {
    await store.upsertCommits(REPO, [COMMIT]);
    // Second upsert with updated message — should not throw (ON CONFLICT DO UPDATE)
    const updated = { ...COMMIT, message: 'feat: updated message' };
    await expect(store.upsertCommits(REPO, [updated])).resolves.toBeUndefined();
  });

  // ---------- PRs ----------

  it('getPr returns null when the PR does not exist', async () => {
    const result = await store.getPr(REPO, 999);
    expect(result).toBeNull();
  });

  it('upsertPr + getPr round-trips all fields', async () => {
    await store.upsertPr(REPO, PR);
    const result = await store.getPr(REPO, PR.number);
    expect(result).not.toBeNull();
    expect(result?.number).toBe(PR.number);
    expect(result?.title).toBe(PR.title);
    expect(result?.body).toBe(PR.body);
    expect(result?.authorLogin).toBe(PR.authorLogin);
    expect(result?.mergedSha).toBe(PR.mergedSha);
    expect(result?.state).toBe(PR.state);
  });

  it('upsertPr is idempotent — second upsert updates fields', async () => {
    await store.upsertPr(REPO, PR);
    const updated: PullRequest = { ...PR, title: 'Updated title', state: 'closed' };
    await store.upsertPr(REPO, updated);
    const result = await store.getPr(REPO, PR.number);
    expect(result?.title).toBe('Updated title');
    expect(result?.state).toBe('closed');
  });

  it('upsertPr handles optional mergedSha being absent', async () => {
    const nomerge: PullRequest = { ...PR, mergedSha: undefined };
    await store.upsertPr(REPO, nomerge);
    const result = await store.getPr(REPO, PR.number);
    expect(result?.mergedSha).toBeUndefined();
  });

  it('getPr is scoped to repo — different repos are isolated', async () => {
    await store.upsertPr(REPO, PR);
    const result = await store.getPr('other/repo', PR.number);
    expect(result).toBeNull();
  });

  // ---------- issues ----------

  it('getIssue returns null when the issue does not exist', async () => {
    const result = await store.getIssue(REPO, 999);
    expect(result).toBeNull();
  });

  it('upsertIssue + getIssue round-trips all fields', async () => {
    await store.upsertIssue(REPO, ISSUE);
    const result = await store.getIssue(REPO, ISSUE.number);
    expect(result).not.toBeNull();
    expect(result?.number).toBe(ISSUE.number);
    expect(result?.title).toBe(ISSUE.title);
    expect(result?.body).toBe(ISSUE.body);
    expect(result?.state).toBe(ISSUE.state);
  });

  it('upsertIssue is idempotent — second upsert updates fields', async () => {
    await store.upsertIssue(REPO, ISSUE);
    await store.upsertIssue(REPO, { ...ISSUE, state: 'open' });
    const result = await store.getIssue(REPO, ISSUE.number);
    expect(result?.state).toBe('open');
  });

  it('getIssue is scoped to repo', async () => {
    await store.upsertIssue(REPO, ISSUE);
    const result = await store.getIssue('other/repo', ISSUE.number);
    expect(result).toBeNull();
  });

  // ---------- review comments ----------

  it('getReviewComments returns [] when no comments exist', async () => {
    const result = await store.getReviewComments(REPO, 42);
    expect(result).toEqual([]);
  });

  it('upsertReviewComments + getReviewComments round-trips all fields', async () => {
    await store.upsertReviewComments(REPO, 42, [REVIEW_COMMENT]);
    const result = await store.getReviewComments(REPO, 42);
    expect(result).toHaveLength(1);
    const c = result[0];
    expect(c?.author).toBe(REVIEW_COMMENT.author);
    expect(c?.body).toBe(REVIEW_COMMENT.body);
    expect(c?.path).toBe(REVIEW_COMMENT.path);
    expect(c?.line).toBe(REVIEW_COMMENT.line);
    expect(c?.submittedAt).toBe(REVIEW_COMMENT.submittedAt);
  });

  it('upsertReviewComments replaces all comments for the PR', async () => {
    await store.upsertReviewComments(REPO, 42, [REVIEW_COMMENT]);
    const second: ReviewComment = {
      author: 'carol',
      body: 'looks good',
      submittedAt: '2024-01-03T00:00:00Z',
    };
    await store.upsertReviewComments(REPO, 42, [second]);
    const result = await store.getReviewComments(REPO, 42);
    expect(result).toHaveLength(1);
    expect(result[0]?.author).toBe('carol');
  });

  it('upsertReviewComments with empty array clears existing comments', async () => {
    await store.upsertReviewComments(REPO, 42, [REVIEW_COMMENT]);
    await store.upsertReviewComments(REPO, 42, []);
    const result = await store.getReviewComments(REPO, 42);
    expect(result).toEqual([]);
  });

  it('getReviewComments is scoped to repo and pr_number', async () => {
    await store.upsertReviewComments(REPO, 42, [REVIEW_COMMENT]);
    expect(await store.getReviewComments('other/repo', 42)).toEqual([]);
    expect(await store.getReviewComments(REPO, 99)).toEqual([]);
  });

  it('review comment with no path/line stores and retrieves undefined for both', async () => {
    const bare: ReviewComment = {
      author: 'dan',
      body: 'nit',
      submittedAt: '2024-01-04T00:00:00Z',
    };
    await store.upsertReviewComments(REPO, 1, [bare]);
    const result = await store.getReviewComments(REPO, 1);
    expect(result[0]?.path).toBeUndefined();
    expect(result[0]?.line).toBeUndefined();
  });
});
