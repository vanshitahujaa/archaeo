/**
 * Store interface — implement.md Part C.2.
 *
 * The hard seam (Part B.2). The engine and CLI NEVER touch SQLite directly; they
 * depend only on this interface. V1 ships `SqliteStore`; a `GraphStore` adapter can be
 * added later with zero change to callers. Implementation engine (node:sqlite, see
 * DECISIONS.md D-001) is a hidden detail.
 *
 * OWNED BY LEAD. Changes go through a `contract` issue.
 */

import type {
  Commit,
  Confidence,
  Issue,
  PullRequest,
  RepoSlug,
  ReviewComment,
} from './types.js';

export type EdgeRel =
  | 'introduced_by'
  | 'modified_by'
  | 'discussed_in'
  | 'fixes'
  | 'reviews'
  | 'owns'
  | 'depends_on';

export interface Edge {
  srcType: string;
  srcId: string;
  rel: EdgeRel;
  dstType: string;
  dstId: string;
  confidence?: number;
}

export interface CachedProvenance {
  path: string;
  lineHash: string;
  introducingSha?: string;
  introducingPr?: number;
  confidence: Confidence;
  /** ISO-8601 timestamp. */
  computedAt: string;
}

export interface Store {
  /** Run migrations. Idempotent. */
  init(): Promise<void>;

  // --- raw evidence cache ---
  upsertCommits(repo: RepoSlug, commits: Commit[]): Promise<void>;
  upsertPr(repo: RepoSlug, pr: PullRequest): Promise<void>;
  upsertIssue(repo: RepoSlug, issue: Issue): Promise<void>;
  upsertReviewComments(
    repo: RepoSlug,
    prNumber: number,
    comments: ReviewComment[],
  ): Promise<void>;
  getPr(repo: RepoSlug, prNumber: number): Promise<PullRequest | null>;
  getIssue(repo: RepoSlug, issueNumber: number): Promise<Issue | null>;
  getReviewComments(repo: RepoSlug, prNumber: number): Promise<ReviewComment[]>;

  // --- edges (graph-shaped, stored relationally) ---
  addEdge(repo: RepoSlug, e: Edge): Promise<void>;
  traverse(repo: RepoSlug, srcType: string, srcId: string, rel: string): Promise<Edge[]>;

  // --- provenance cache ---
  getLineProvenance(
    repo: RepoSlug,
    path: string,
    lineHash: string,
  ): Promise<CachedProvenance | null>;
  putLineProvenance(repo: RepoSlug, p: CachedProvenance): Promise<void>;

  close(): Promise<void>;
}
