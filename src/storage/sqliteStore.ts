/**
 * SqliteStore — A4 (Keeper), issues #5–#8.
 *
 * Implements `Store` on top of Node's built-in `node:sqlite` (DECISIONS.md D-001).
 * The DatabaseSync API is synchronous; our Store methods are async (they return
 * Promise<T>) so callers stay decoupled from the implementation backend.
 *
 * Key design choices:
 * - All DML uses prepared statements and `INSERT ... ON CONFLICT(...) DO UPDATE`
 *   upserts so every write is idempotent.
 * - `traverse` uses a recursive CTE so multi-hop graph traversal stays in a single
 *   SQL query with no round-trips.
 * - `init()` is idempotent: it runs the full schema (all `CREATE TABLE IF NOT EXISTS`)
 *   so calling it multiple times is safe.
 */

import { createRequire } from 'node:module';
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
import { SCHEMA_SQL } from './schema.js';
import {
  rowToEdge,
  rowToIssue,
  rowToProvenance,
  rowToPr,
  rowToReviewComment,
  type EdgeRow,
  type IssueRow,
  type LineProvenanceRow,
  type PrRow,
  type ReviewCommentRow,
} from './mappers.js';

// `node:sqlite` is a Node 22.5+ builtin that bundlers (esbuild/Vite) mishandle: not being
// in their hardcoded builtin list, they strip the `node:` prefix and emit a broken bare
// `sqlite` import. Load it via createRequire so the running Node resolves the real builtin
// regardless of bundler. `DatabaseSync` is declared as both a value (the class) and a type
// (its instance) so the rest of the file is unchanged. See DECISIONS.md D-001.
const DatabaseSync = (
  createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
).DatabaseSync;
type DatabaseSync = InstanceType<typeof DatabaseSync>;

export interface SqliteStoreOptions {
  /** Path to the SQLite file. ':memory:' for tests. */
  dbPath: string;
}

export class SqliteStore implements Store {
  private db: DatabaseSync | null = null;

  constructor(private readonly opts: SqliteStoreOptions) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.db) return; // already initialised — idempotent
    this.db = new DatabaseSync(this.opts.dbPath);
    // Execute each statement in the schema individually.
    // node:sqlite's exec() accepts a string with multiple statements.
    this.db.exec(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helper
  // ---------------------------------------------------------------------------

  private get conn(): DatabaseSync {
    if (!this.db) {
      throw new Error('SqliteStore: call init() before using the store');
    }
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Evidence cache — commits (#6)
  // ---------------------------------------------------------------------------

  async upsertCommits(repo: RepoSlug, commits: Commit[]): Promise<void> {
    const stmt = this.conn.prepare(`
      INSERT INTO commits (repo, sha, author_login, author_name, authored_at, message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo, sha) DO UPDATE SET
        author_login = excluded.author_login,
        author_name  = excluded.author_name,
        authored_at  = excluded.authored_at,
        message      = excluded.message
    `);
    for (const c of commits) {
      stmt.run(repo, c.sha, c.authorLogin, c.authorName, c.authoredAt, c.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Evidence cache — PRs (#6)
  // ---------------------------------------------------------------------------

  async upsertPr(repo: RepoSlug, pr: PullRequest): Promise<void> {
    this.conn
      .prepare(`
        INSERT INTO prs (repo, number, title, body, author_login, merged_sha, state)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo, number) DO UPDATE SET
          title        = excluded.title,
          body         = excluded.body,
          author_login = excluded.author_login,
          merged_sha   = excluded.merged_sha,
          state        = excluded.state
      `)
      .run(
        repo,
        pr.number,
        pr.title,
        pr.body,
        pr.authorLogin,
        pr.mergedSha ?? null,
        pr.state,
      );
  }

  async getPr(repo: RepoSlug, prNumber: number): Promise<PullRequest | null> {
    const row = this.conn
      .prepare('SELECT * FROM prs WHERE repo = ? AND number = ?')
      .get(repo, prNumber) as unknown as PrRow | undefined;
    return row ? rowToPr(row) : null;
  }

  // ---------------------------------------------------------------------------
  // Evidence cache — issues (#6)
  // ---------------------------------------------------------------------------

  async upsertIssue(repo: RepoSlug, issue: Issue): Promise<void> {
    this.conn
      .prepare(`
        INSERT INTO issues (repo, number, title, body, state)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(repo, number) DO UPDATE SET
          title = excluded.title,
          body  = excluded.body,
          state = excluded.state
      `)
      .run(repo, issue.number, issue.title, issue.body, issue.state);
  }

  async getIssue(repo: RepoSlug, issueNumber: number): Promise<Issue | null> {
    const row = this.conn
      .prepare('SELECT * FROM issues WHERE repo = ? AND number = ?')
      .get(repo, issueNumber) as unknown as IssueRow | undefined;
    return row ? rowToIssue(row) : null;
  }

  // ---------------------------------------------------------------------------
  // Evidence cache — review comments (#6)
  // ---------------------------------------------------------------------------

  async upsertReviewComments(
    repo: RepoSlug,
    prNumber: number,
    comments: ReviewComment[],
  ): Promise<void> {
    // review_comments has no unique constraint: replace the whole set for the PR.
    this.conn
      .prepare('DELETE FROM review_comments WHERE repo = ? AND pr_number = ?')
      .run(repo, prNumber);

    const stmt = this.conn.prepare(`
      INSERT INTO review_comments (repo, pr_number, author, body, path, line, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of comments) {
      stmt.run(
        repo,
        prNumber,
        c.author,
        c.body,
        c.path ?? null,
        c.line ?? null,
        c.submittedAt,
      );
    }
  }

  async getReviewComments(repo: RepoSlug, prNumber: number): Promise<ReviewComment[]> {
    const rows = this.conn
      .prepare('SELECT * FROM review_comments WHERE repo = ? AND pr_number = ?')
      .all(repo, prNumber) as unknown as ReviewCommentRow[];
    return rows.map(rowToReviewComment);
  }

  // ---------------------------------------------------------------------------
  // Edges (#7)
  // ---------------------------------------------------------------------------

  async addEdge(repo: RepoSlug, e: Edge): Promise<void> {
    this.conn
      .prepare(`
        INSERT INTO edges (repo, src_type, src_id, rel, dst_type, dst_id, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(repo, e.srcType, e.srcId, e.rel, e.dstType, e.dstId, e.confidence ?? null);
  }

  /**
   * Recursive-CTE traversal over `edges`.
   *
   * Starting from (repo, srcType, srcId, rel), follows outgoing edges of the same
   * relationship transitively, returning all reachable edges as `Edge[]`.
   *
   * Example: traverse('owner/repo', 'line', 'abc123', 'introduced_by') returns all
   * edges reachable via `introduced_by`, which may then chain into `fixes`, etc.
   *
   * Note: the CTE traverses only edges whose `rel` matches the initial `rel` argument.
   * Cross-rel traversal (e.g. introduced_by → fixes) requires callers to call
   * traverse twice, or the caller may use the returned Edge destinations to seed a
   * second traversal.  The recursive step intentionally keeps a single rel to avoid
   * runaway traversal.  See the traverse test for the multi-rel pattern.
   */
  async traverse(
    repo: RepoSlug,
    srcType: string,
    srcId: string,
    rel: string,
  ): Promise<Edge[]> {
    const rows = this.conn
      .prepare(`
        WITH RECURSIVE reach(src_type, src_id, rel, dst_type, dst_id, confidence) AS (
          -- seed: direct neighbours
          SELECT src_type, src_id, rel, dst_type, dst_id, confidence
          FROM   edges
          WHERE  repo = ? AND src_type = ? AND src_id = ? AND rel = ?
          UNION ALL
          -- recursive step: follow edges from the previous dst
          SELECT e.src_type, e.src_id, e.rel, e.dst_type, e.dst_id, e.confidence
          FROM   edges e
          JOIN   reach r ON e.repo = ? AND e.src_type = r.dst_type AND e.src_id = r.dst_id AND e.rel = r.rel
        )
        SELECT src_type, src_id, rel, dst_type, dst_id, confidence
        FROM   reach
      `)
      .all(repo, srcType, srcId, rel, repo) as unknown as Omit<EdgeRow, 'repo'>[];

    return rows.map((r) =>
      rowToEdge({ repo, ...r }),
    );
  }

  // ---------------------------------------------------------------------------
  // Provenance cache (#8)
  // ---------------------------------------------------------------------------

  async getLineProvenance(
    repo: RepoSlug,
    path: string,
    lineHash: string,
  ): Promise<CachedProvenance | null> {
    const row = this.conn
      .prepare(
        'SELECT * FROM line_provenance WHERE repo = ? AND path = ? AND line_hash = ?',
      )
      .get(repo, path, lineHash) as unknown as LineProvenanceRow | undefined;
    return row ? rowToProvenance(row) : null;
  }

  async putLineProvenance(repo: RepoSlug, p: CachedProvenance): Promise<void> {
    this.conn
      .prepare(`
        INSERT INTO line_provenance
          (repo, path, line_hash, introducing_sha, introducing_pr, confidence, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo, path, line_hash) DO UPDATE SET
          introducing_sha = excluded.introducing_sha,
          introducing_pr  = excluded.introducing_pr,
          confidence      = excluded.confidence,
          computed_at     = excluded.computed_at
      `)
      .run(
        repo,
        p.path,
        p.lineHash,
        p.introducingSha ?? null,
        p.introducingPr ?? null,
        p.confidence,
        p.computedAt,
      );
  }
}
