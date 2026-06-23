/**
 * SQLite schema — A4 (Keeper), issue #5.
 *
 * DECISIONS.md D-002: the runtime canonical schema lives here as an exported string
 * constant. `schema.sql` is the human-readable / spec-referenced mirror. A unit test
 * asserts the two never drift.
 *
 * implement.md Part L defines the tables and indexes exactly; this file matches them.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS commits (
  repo        TEXT NOT NULL,
  sha         TEXT NOT NULL,
  author_login TEXT,
  author_name  TEXT,
  authored_at  TEXT,
  message      TEXT,
  PRIMARY KEY (repo, sha)
);

CREATE TABLE IF NOT EXISTS prs (
  repo         TEXT    NOT NULL,
  number       INTEGER NOT NULL,
  title        TEXT,
  body         TEXT,
  author_login TEXT,
  merged_sha   TEXT,
  state        TEXT,
  PRIMARY KEY (repo, number)
);

CREATE TABLE IF NOT EXISTS issues (
  repo   TEXT    NOT NULL,
  number INTEGER NOT NULL,
  title  TEXT,
  body   TEXT,
  state  TEXT,
  PRIMARY KEY (repo, number)
);

CREATE TABLE IF NOT EXISTS review_comments (
  repo         TEXT    NOT NULL,
  pr_number    INTEGER NOT NULL,
  author       TEXT,
  body         TEXT,
  path         TEXT,
  line         INTEGER,
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS engineers (
  repo  TEXT NOT NULL,
  login TEXT NOT NULL,
  name  TEXT,
  PRIMARY KEY (repo, login)
);

CREATE TABLE IF NOT EXISTS edges (
  repo       TEXT NOT NULL,
  src_type   TEXT,
  src_id     TEXT,
  rel        TEXT,
  dst_type   TEXT,
  dst_id     TEXT,
  confidence REAL
);

CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(repo, src_type, src_id, rel);

CREATE TABLE IF NOT EXISTS line_provenance (
  repo           TEXT NOT NULL,
  path           TEXT NOT NULL,
  line_hash      TEXT NOT NULL,
  introducing_sha TEXT,
  introducing_pr  INTEGER,
  confidence      TEXT,
  computed_at     TEXT,
  PRIMARY KEY (repo, path, line_hash)
);
`.trim();
