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

  it('SqliteStore implements the Store seam (init() no longer throws — #10 done)', async () => {
    const store = new SqliteStore({ dbPath: ':memory:' });
    // init() now runs the real schema migration; it must not throw.
    await expect(store.init()).resolves.toBeUndefined();
    await store.close();
  });

  it('Engine is constructable from its deps (#27 implemented — wiring is real)', () => {
    // The point is that the wiring compiles and the seam is real. explainLine is now
    // implemented (#27), so we only assert constructability here; behavior is covered by
    // test/provenance/engine.e2e.test.ts against real git + a real store.
    const engine = new Engine({
      git: {} as never,
      host: {} as never,
      store: {} as never,
      repo: 'owner/name',
    });
    expect(engine).toBeInstanceOf(Engine);
  });

  it('classifier is implemented (#20): classifies a behavioral change', () => {
    const out = classifyChange({ added: ['if (x <= 0) return false;'], removed: [] });
    expect(out.isCosmetic).toBe(false);
    expect(out.reason.length).toBeGreaterThan(0);
  });
});
