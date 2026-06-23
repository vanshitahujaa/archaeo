/**
 * Phase 0 smoke test (Maestro). Proves the contracts load, the wiring is real, and stubs
 * throw NotImplemented as designed. Specialists add real coverage in their own areas.
 */

import { describe, expect, it } from 'vitest';
import { ArchaeoError, NotImplemented } from '../src/core/index.js';
import { SqliteStore } from '../src/storage/sqliteStore.js';
import { Engine } from '../src/provenance/engine.js';
import { classifyChange } from '../src/provenance/classifier.js';

describe('phase 0 contracts', () => {
  it('NotImplemented carries the subject', () => {
    const e = new NotImplemented('thing (#99)');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain('thing (#99)');
    expect(e.name).toBe('NotImplemented');
  });

  it('ArchaeoError carries an exit code and optional hint', () => {
    const e = new ArchaeoError('boom', { exitCode: 3, hint: 'set X' });
    expect(e.exitCode).toBe(3);
    expect(e.hint).toBe('set X');
  });

  it('SqliteStore implements the Store seam (stub throws until #10)', () => {
    const store = new SqliteStore({ dbPath: ':memory:' });
    expect(() => store.init()).toThrow(NotImplemented);
  });

  it('Engine is constructable from its deps (stub throws until #47)', () => {
    // The point is that the wiring compiles and the seam is real, not behavior yet.
    const engine = new Engine({
      // deps are not exercised by the stub; cast through unknown for the smoke test only.
      git: {} as never,
      host: {} as never,
      store: {} as never,
      repo: 'owner/name',
    });
    expect(() => engine.explainLine('a.ts', 1)).toThrow(NotImplemented);
  });

  it('classifier stub is wired (throws until #40)', () => {
    expect(() => classifyChange({ added: [], removed: [] })).toThrow(NotImplemented);
  });
});
