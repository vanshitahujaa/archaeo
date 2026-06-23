/**
 * GraphStore — A4 (Keeper), issue #14. STUB ONLY in V1 (implement.md B.3 / A.6).
 *
 * Exists to prove the `Store` seam: a graph-backed adapter can be added later behind the
 * same interface with zero change to callers. Not wired into anything. Every method throws.
 */

import type {
  CachedProvenance,
  Commit,
  Edge,
  Issue,
  PullRequest,
  RepoSlug,
  ReviewComment,
  Store,
} from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export class GraphStore implements Store {
  init(): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  upsertCommits(_repo: RepoSlug, _commits: Commit[]): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  upsertPr(_repo: RepoSlug, _pr: PullRequest): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  upsertIssue(_repo: RepoSlug, _issue: Issue): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  upsertReviewComments(
    _repo: RepoSlug,
    _prNumber: number,
    _comments: ReviewComment[],
  ): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  getPr(_repo: RepoSlug, _prNumber: number): Promise<PullRequest | null> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  getIssue(_repo: RepoSlug, _issueNumber: number): Promise<Issue | null> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  getReviewComments(_repo: RepoSlug, _prNumber: number): Promise<ReviewComment[]> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  addEdge(_repo: RepoSlug, _e: Edge): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  traverse(_repo: RepoSlug, _srcType: string, _srcId: string, _rel: string): Promise<Edge[]> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  getLineProvenance(
    _repo: RepoSlug,
    _path: string,
    _lineHash: string,
  ): Promise<CachedProvenance | null> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  putLineProvenance(_repo: RepoSlug, _p: CachedProvenance): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
  close(): Promise<void> {
    throw new NotImplemented('GraphStore is a V1 stub (#14)');
  }
}
