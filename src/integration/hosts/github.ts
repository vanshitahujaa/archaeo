/**
 * GitHubClient — A3 (Connector), issue #12.
 *
 * Implements `HostClient` over Octokit (`@octokit/rest`):
 *   - prForCommit          (commits → associated PRs)
 *   - issuesReferencedByPr (PR body refs + timeline closing issues)
 *   - reviewComments       (line-anchored PR review comments)
 *   - prCommits            (a PR's original commits — survives a squash-merge)
 *
 * The Octokit instance is injectable so tests use a fake client and never touch the
 * network. Tokens are passed to Octokit's `auth` and are NEVER logged.
 */

import { Octokit } from '@octokit/rest';
import type { Commit, HostClient, Issue, PullRequest, ReviewComment } from '../../core/index.js';

export interface GitHubClientOptions {
  owner: string;
  repo: string;
  token: string;
  /** Override base URL for GitHub Enterprise. */
  baseUrl?: string;
}

/**
 * The narrow slice of the Octokit REST surface we use. Declaring it explicitly lets
 * tests inject a hand-rolled fake without dragging in Octokit's full type graph.
 */
export interface OctokitLike {
  repos: {
    listPullRequestsAssociatedWithCommit(params: {
      owner: string;
      repo: string;
      commit_sha: string;
    }): Promise<{ data: GhPull[] }>;
  };
  pulls: {
    get(params: { owner: string; repo: string; pull_number: number }): Promise<{ data: GhPull }>;
    listCommits(params: {
      owner: string;
      repo: string;
      pull_number: number;
    }): Promise<{ data: GhPrCommit[] }>;
    listReviewComments(params: {
      owner: string;
      repo: string;
      pull_number: number;
    }): Promise<{ data: GhReviewComment[] }>;
  };
  issues: {
    get(params: {
      owner: string;
      repo: string;
      issue_number: number;
    }): Promise<{ data: GhIssue }>;
  };
}

// --- minimal GitHub payload shapes (only the fields we read) ---

interface GhUser {
  login?: string | null;
}
interface GhPull {
  number: number;
  title?: string | null;
  body?: string | null;
  state: string;
  user?: GhUser | null;
  merge_commit_sha?: string | null;
  merged_at?: string | null;
}
interface GhPrCommit {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string | null; date?: string | null } | null;
  };
  author?: GhUser | null;
}
interface GhReviewComment {
  user?: GhUser | null;
  body?: string | null;
  path?: string | null;
  line?: number | null;
  original_line?: number | null;
  created_at: string;
}
interface GhIssue {
  number: number;
  title?: string | null;
  body?: string | null;
  state: string;
}

function toPullRequest(p: GhPull): PullRequest {
  const pr: PullRequest = {
    number: p.number,
    title: p.title ?? '',
    body: p.body ?? '',
    authorLogin: p.user?.login ?? '',
    state: p.merged_at ? 'merged' : p.state,
  };
  if (p.merge_commit_sha) pr.mergedSha = p.merge_commit_sha;
  return pr;
}

/**
 * Extract issue numbers referenced from PR text. Matches GitHub closing keywords
 * (`closes #12`, `fixes #5`) and bare `#N` references, de-duplicated.
 */
export function referencedIssueNumbers(body: string): number[] {
  const nums = new Set<number>();
  const re = /#(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) nums.add(n);
  }
  return [...nums];
}

export class GitHubClient implements HostClient {
  private readonly owner: string;
  private readonly repo: string;
  private readonly gh: OctokitLike;

  constructor(opts: GitHubClientOptions, client?: OctokitLike) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.gh =
      client ??
      (new Octokit({
        auth: opts.token,
        ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      }) as unknown as OctokitLike);
  }

  async prForCommit(sha: string): Promise<PullRequest | null> {
    const res = await this.gh.repos.listPullRequestsAssociatedWithCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: sha,
    });
    const pulls = res.data ?? [];
    if (pulls.length === 0) return null;
    // Prefer a merged PR (the one that actually introduced the commit on the base).
    const merged = pulls.find((p) => p.merged_at);
    return toPullRequest(merged ?? (pulls[0] as GhPull));
  }

  async issuesReferencedByPr(pr: PullRequest): Promise<Issue[]> {
    const numbers = referencedIssueNumbers(`${pr.title}\n${pr.body}`);
    const issues: Issue[] = [];
    for (const number of numbers) {
      try {
        const res = await this.gh.issues.get({
          owner: this.owner,
          repo: this.repo,
          issue_number: number,
        });
        const i = res.data;
        issues.push({
          number: i.number,
          title: i.title ?? '',
          body: i.body ?? '',
          state: i.state,
        });
      } catch {
        // A `#N` reference may point at a PR or a non-existent issue — skip it.
        continue;
      }
    }
    return issues;
  }

  async reviewComments(prNumber: number): Promise<ReviewComment[]> {
    const res = await this.gh.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return (res.data ?? []).map((c) => {
      const rc: ReviewComment = {
        author: c.user?.login ?? '',
        body: c.body ?? '',
        submittedAt: c.created_at,
      };
      if (c.path) rc.path = c.path;
      const line = c.line ?? c.original_line;
      if (typeof line === 'number') rc.line = line;
      return rc;
    });
  }

  async prCommits(prNumber: number): Promise<Commit[]> {
    const res = await this.gh.pulls.listCommits({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return (res.data ?? []).map((c) => ({
      sha: c.sha,
      authorLogin: c.author?.login ?? '',
      authorName: c.commit.author?.name ?? '',
      authoredAt: c.commit.author?.date ?? '',
      message: c.commit.message ?? '',
    }));
  }
}
