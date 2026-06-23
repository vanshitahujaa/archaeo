/**
 * SqliteStore — A4 (Keeper). Implements `Store` on top of Node's built-in `node:sqlite`
 * (DECISIONS.md D-001). PHASE 0 STUB: throws NotImplemented; issues #10–#13 fill it in.
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
} from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface SqliteStoreOptions {
  /** Path to the SQLite file. ':memory:' for tests. */
  dbPath: string;
}

export class SqliteStore implements Store {
  constructor(private readonly opts: SqliteStoreOptions) {
    void this.opts;
  }

  init(): Promise<void> {
    throw new NotImplemented('SqliteStore.init (#10)');
  }
  upsertCommits(_repo: RepoSlug, _commits: Commit[]): Promise<void> {
    throw new NotImplemented('SqliteStore.upsertCommits (#11)');
  }
  upsertPr(_repo: RepoSlug, _pr: PullRequest): Promise<void> {
    throw new NotImplemented('SqliteStore.upsertPr (#11)');
  }
  upsertIssue(_repo: RepoSlug, _issue: Issue): Promise<void> {
    throw new NotImplemented('SqliteStore.upsertIssue (#11)');
  }
  upsertReviewComments(
    _repo: RepoSlug,
    _prNumber: number,
    _comments: ReviewComment[],
  ): Promise<void> {
    throw new NotImplemented('SqliteStore.upsertReviewComments (#11)');
  }
  getPr(_repo: RepoSlug, _prNumber: number): Promise<PullRequest | null> {
    throw new NotImplemented('SqliteStore.getPr (#11)');
  }
  getIssue(_repo: RepoSlug, _issueNumber: number): Promise<Issue | null> {
    throw new NotImplemented('SqliteStore.getIssue (#11)');
  }
  getReviewComments(_repo: RepoSlug, _prNumber: number): Promise<ReviewComment[]> {
    throw new NotImplemented('SqliteStore.getReviewComments (#11)');
  }
  addEdge(_repo: RepoSlug, _e: Edge): Promise<void> {
    throw new NotImplemented('SqliteStore.addEdge (#12)');
  }
  traverse(_repo: RepoSlug, _srcType: string, _srcId: string, _rel: string): Promise<Edge[]> {
    throw new NotImplemented('SqliteStore.traverse (#12)');
  }
  getLineProvenance(
    _repo: RepoSlug,
    _path: string,
    _lineHash: string,
  ): Promise<CachedProvenance | null> {
    throw new NotImplemented('SqliteStore.getLineProvenance (#13)');
  }
  putLineProvenance(_repo: RepoSlug, _p: CachedProvenance): Promise<void> {
    throw new NotImplemented('SqliteStore.putLineProvenance (#13)');
  }
  close(): Promise<void> {
    throw new NotImplemented('SqliteStore.close (#10)');
  }
}
