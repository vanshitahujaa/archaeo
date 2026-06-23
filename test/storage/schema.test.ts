/**
 * Schema tests — issue #5.
 *
 * 1. SCHEMA_SQL can be executed multiple times without error (idempotency).
 * 2. schema.ts constant and schema.sql file never drift (D-002 drift test).
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../../src/storage/schema.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA_SQL_FILE = join(__dirname, '../../src/storage/schema.sql');

describe('schema (#5)', () => {
  it('SCHEMA_SQL executes without error on a fresh :memory: database', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });

  it('SCHEMA_SQL is idempotent — running it twice does not throw', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_SQL);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    db.close();
  });

  it('creates all required tables', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_SQL);
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      )
      .all() as { name: string }[];
    const tableNames = rows.map((r) => r.name);
    for (const expected of [
      'commits',
      'prs',
      'issues',
      'review_comments',
      'engineers',
      'edges',
      'line_provenance',
    ]) {
      expect(tableNames, `expected table "${expected}" to exist`).toContain(expected);
    }
    db.close();
  });

  it('creates the idx_edges_src index', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_SQL);
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_edges_src'`,
      )
      .all() as { name: string }[];
    expect(rows).toHaveLength(1);
    db.close();
  });

  it('schema.ts constant matches schema.sql file (D-002 drift test)', () => {
    const sqlFile = readFileSync(SCHEMA_SQL_FILE, 'utf8');
    // Normalise: strip SQL comments, collapse whitespace, trim
    const normalise = (s: string) =>
      s
        .split('\n')
        .map((l) => l.replace(/--.*$/, '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    expect(normalise(SCHEMA_SQL)).toBe(normalise(sqlFile));
  });
});
