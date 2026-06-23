/**
 * Row <-> domain mappers — A4 (Keeper), issue #6.
 *
 * Each function converts a raw SQLite row object (column names as returned by
 * `node:sqlite`) into a typed domain object from `src/core/types.ts`, and
 * vice-versa where needed.  No business logic here — pure data reshaping.
 */

import type { CachedProvenance, Commit, Edge, Issue, PullRequest, ReviewComment } from '../core/index.js';

// ---------------------------------------------------------------------------
// Row shapes returned by node:sqlite (all values may be null at runtime)
// ---------------------------------------------------------------------------

export interface CommitRow {
  repo: string;
  sha: string;
  author_login: string | null;
  author_name: string | null;
  authored_at: string | null;
  message: string | null;
}

export interface PrRow {
  repo: string;
  number: number;
  title: string | null;
  body: string | null;
  author_login: string | null;
  merged_sha: string | null;
  state: string | null;
}

export interface IssueRow {
  repo: string;
  number: number;
  title: string | null;
  body: string | null;
  state: string | null;
}

export interface ReviewCommentRow {
  repo: string;
  pr_number: number;
  author: string | null;
  body: string | null;
  path: string | null;
  line: number | null;
  submitted_at: string | null;
}

export interface EdgeRow {
  repo: string;
  src_type: string | null;
  src_id: string | null;
  rel: string | null;
  dst_type: string | null;
  dst_id: string | null;
  confidence: number | null;
}

export interface LineProvenanceRow {
  repo: string;
  path: string;
  line_hash: string;
  introducing_sha: string | null;
  introducing_pr: number | null;
  confidence: string | null;
  computed_at: string | null;
}

// ---------------------------------------------------------------------------
// Row -> domain
// ---------------------------------------------------------------------------

export function rowToCommit(row: CommitRow): Commit {
  return {
    sha: row.sha,
    authorLogin: row.author_login ?? '',
    authorName: row.author_name ?? '',
    authoredAt: row.authored_at ?? '',
    message: row.message ?? '',
  };
}

export function rowToPr(row: PrRow): PullRequest {
  return {
    number: row.number,
    title: row.title ?? '',
    body: row.body ?? '',
    authorLogin: row.author_login ?? '',
    mergedSha: row.merged_sha ?? undefined,
    state: row.state ?? '',
  };
}

export function rowToIssue(row: IssueRow): Issue {
  return {
    number: row.number,
    title: row.title ?? '',
    body: row.body ?? '',
    state: row.state ?? '',
  };
}

export function rowToReviewComment(row: ReviewCommentRow): ReviewComment {
  return {
    author: row.author ?? '',
    body: row.body ?? '',
    path: row.path ?? undefined,
    line: row.line ?? undefined,
    submittedAt: row.submitted_at ?? '',
  };
}

export function rowToEdge(row: EdgeRow): Edge {
  return {
    srcType: row.src_type ?? '',
    srcId: row.src_id ?? '',
    rel: (row.rel ?? 'introduced_by') as Edge['rel'],
    dstType: row.dst_type ?? '',
    dstId: row.dst_id ?? '',
    confidence: row.confidence ?? undefined,
  };
}

export function rowToProvenance(row: LineProvenanceRow): CachedProvenance {
  return {
    path: row.path,
    lineHash: row.line_hash,
    introducingSha: row.introducing_sha ?? undefined,
    introducingPr: row.introducing_pr ?? undefined,
    confidence: (row.confidence ?? 'low') as CachedProvenance['confidence'],
    computedAt: row.computed_at ?? '',
  };
}
