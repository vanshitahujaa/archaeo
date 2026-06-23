/**
 * HostClient interface — implement.md Part C.3, extended with the squash-recovery
 * primitive from D.4 (PR-commits API). GitHub is the only V1 implementation; the
 * interface stays so GitLab/Bitbucket plug in later (Part A.6 / #26 — NOT built in V1).
 *
 * OWNED BY LEAD.
 */

import type { Commit, Issue, PullRequest, ReviewComment } from './types.js';

export interface HostClient {
  /** The PR whose merge introduced this commit, or null. */
  prForCommit(sha: string): Promise<PullRequest | null>;

  /** Issues referenced from a PR body / linked-issue API (`fixes #N`, etc.). */
  issuesReferencedByPr(pr: PullRequest): Promise<Issue[]>;

  /** Review comments on a PR (line-anchored review thread comments). */
  reviewComments(prNumber: number): Promise<ReviewComment[]>;

  /**
   * The original commits of a PR (still available after branch deletion). Used to recover
   * finer provenance through a squash-merge that collapsed the real history (D.4).
   */
  prCommits(prNumber: number): Promise<Commit[]>;
}
