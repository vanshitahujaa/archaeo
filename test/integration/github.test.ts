/**
 * GitHubClient with an injected fake Octokit — issue #12. No live network.
 */

import { describe, expect, it } from 'vitest';
import {
  GitHubClient,
  referencedIssueNumbers,
  type OctokitLike,
} from '../../src/integration/hosts/github.js';

/** A hand-rolled OctokitLike returning recorded JSON. Records call counts. */
function fakeOctokit(overrides: Partial<{
  associated: unknown[];
  prCommits: unknown[];
  reviewComments: unknown[];
  issues: Record<number, unknown>;
}> = {}): { gh: OctokitLike; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const bump = (k: string): void => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  const gh: OctokitLike = {
    repos: {
      async listPullRequestsAssociatedWithCommit() {
        bump('associated');
        return { data: (overrides.associated ?? []) as never };
      },
    },
    pulls: {
      async get({ pull_number }) {
        bump('pulls.get');
        return { data: { number: pull_number, state: 'open' } as never };
      },
      async listCommits() {
        bump('listCommits');
        return { data: (overrides.prCommits ?? []) as never };
      },
      async listReviewComments() {
        bump('listReviewComments');
        return { data: (overrides.reviewComments ?? []) as never };
      },
    },
    issues: {
      async get({ issue_number }) {
        bump('issues.get');
        const i = overrides.issues?.[issue_number];
        if (!i) {
          const err = new Error('Not Found') as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: i as never };
      },
    },
  };
  return { gh, calls };
}

const OPTS = { owner: 'acme', repo: 'widgets', token: 'secret-token-value' };

describe('GitHubClient (#12)', () => {
  it('prForCommit returns the merged PR mapped to PullRequest', async () => {
    const { gh } = fakeOctokit({
      associated: [
        { number: 7, title: 'open one', state: 'open', user: { login: 'x' } },
        {
          number: 184,
          title: 'Add retry',
          body: 'Fixes #102',
          state: 'closed',
          user: { login: 'alice' },
          merged_at: '2024-01-02T00:00:00Z',
          merge_commit_sha: 'deadbeef',
        },
      ],
    });
    const client = new GitHubClient(OPTS, gh);
    const pr = await client.prForCommit('abc');
    expect(pr).not.toBeNull();
    expect(pr?.number).toBe(184);
    expect(pr?.state).toBe('merged');
    expect(pr?.mergedSha).toBe('deadbeef');
    expect(pr?.authorLogin).toBe('alice');
  });

  it('prForCommit returns null when no PR is associated', async () => {
    const { gh } = fakeOctokit({ associated: [] });
    const client = new GitHubClient(OPTS, gh);
    expect(await client.prForCommit('abc')).toBeNull();
  });

  it('issuesReferencedByPr resolves #N refs from title+body and skips non-issues', async () => {
    const { gh, calls } = fakeOctokit({
      issues: {
        102: { number: 102, title: 'Retry on failure', body: 'need retry', state: 'closed' },
        // 999 deliberately absent → 404 → skipped
      },
    });
    const client = new GitHubClient(OPTS, gh);
    const issues = await client.issuesReferencedByPr({
      number: 184,
      title: 'Fixes #102',
      body: 'also see #999',
      authorLogin: 'alice',
      state: 'merged',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(102);
    expect(calls['issues.get']).toBe(2); // tried both, one 404'd
  });

  it('reviewComments maps line/path/author and falls back to original_line', async () => {
    const { gh } = fakeOctokit({
      reviewComments: [
        {
          user: { login: 'bob' },
          body: 'this prevents a deadlock',
          path: 'src/auth.ts',
          line: 57,
          created_at: '2024-01-02T10:00:00Z',
        },
        {
          user: { login: 'carol' },
          body: 'outdated thread',
          path: 'src/x.ts',
          line: null,
          original_line: 12,
          created_at: '2024-01-03T10:00:00Z',
        },
      ],
    });
    const client = new GitHubClient(OPTS, gh);
    const comments = await client.reviewComments(184);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ author: 'bob', path: 'src/auth.ts', line: 57 });
    expect(comments[1]?.line).toBe(12); // fell back to original_line
  });

  it('prCommits maps the original commits (squash recovery)', async () => {
    const { gh } = fakeOctokit({
      prCommits: [
        {
          sha: 'c1',
          commit: { message: 'feat: a', author: { name: 'Alice', date: '2024-01-01T00:00:00Z' } },
          author: { login: 'alice' },
        },
        {
          sha: 'c2',
          commit: { message: 'fix: b', author: { name: 'Bob', date: '2024-01-01T01:00:00Z' } },
          author: null,
        },
      ],
    });
    const client = new GitHubClient(OPTS, gh);
    const commits = await client.prCommits(184);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ sha: 'c1', authorLogin: 'alice', authorName: 'Alice' });
    expect(commits[1]?.authorLogin).toBe(''); // null author → empty login, no throw
  });
});

describe('referencedIssueNumbers', () => {
  it('extracts and de-duplicates #N references', () => {
    expect(referencedIssueNumbers('Closes #12, fixes #5, see #12 again')).toEqual([12, 5]);
  });
  it('returns [] when there are no references', () => {
    expect(referencedIssueNumbers('no refs here')).toEqual([]);
  });
});
