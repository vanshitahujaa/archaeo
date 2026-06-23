/**
 * GitHubClient — A3 (Connector), issue #22. PHASE 0 STUB.
 * `prForCommit`, `issuesReferencedByPr`, `reviewComments`, `prCommits` via Octokit.
 */

import type { Commit, HostClient, Issue, PullRequest, ReviewComment } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface GitHubClientOptions {
  owner: string;
  repo: string;
  token: string;
  /** Override base URL for GitHub Enterprise. */
  baseUrl?: string;
}

export class GitHubClient implements HostClient {
  constructor(private readonly opts: GitHubClientOptions) {
    void this.opts;
  }

  prForCommit(_sha: string): Promise<PullRequest | null> {
    throw new NotImplemented('GitHubClient.prForCommit (#22)');
  }
  issuesReferencedByPr(_pr: PullRequest): Promise<Issue[]> {
    throw new NotImplemented('GitHubClient.issuesReferencedByPr (#22)');
  }
  reviewComments(_prNumber: number): Promise<ReviewComment[]> {
    throw new NotImplemented('GitHubClient.reviewComments (#22)');
  }
  prCommits(_prNumber: number): Promise<Commit[]> {
    throw new NotImplemented('GitHubClient.prCommits (#22)');
  }
}
