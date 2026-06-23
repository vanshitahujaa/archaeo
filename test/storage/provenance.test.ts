/**
 * Provenance cache tests — issue #8.
 *
 * Covers: cache miss, put + get round-trip, upsert on re-put,
 * scoping by repo / path / lineHash.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CachedProvenance } from '../../src/core/index.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';

const REPO = 'owner/repo';

function makeStore(): SqliteStore {
  return new SqliteStore({ dbPath: ':memory:' });
}

const PROVENANCE: CachedProvenance = {
  path: 'src/auth.ts',
  lineHash: 'deadbeef',
  introducingSha: 'abc123',
  introducingPr: 42,
  confidence: 'high',
  computedAt: '2024-06-01T00:00:00Z',
};

describe('provenance cache (#8)', () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = makeStore();
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it('cache miss: getLineProvenance returns null when not stored', async () => {
    const result = await store.getLineProvenance(REPO, 'src/auth.ts', 'deadbeef');
    expect(result).toBeNull();
  });

  it('putLineProvenance + getLineProvenance round-trips all fields', async () => {
    await store.putLineProvenance(REPO, PROVENANCE);
    const result = await store.getLineProvenance(REPO, PROVENANCE.path, PROVENANCE.lineHash);
    expect(result).not.toBeNull();
    expect(result?.path).toBe(PROVENANCE.path);
    expect(result?.lineHash).toBe(PROVENANCE.lineHash);
    expect(result?.introducingSha).toBe(PROVENANCE.introducingSha);
    expect(result?.introducingPr).toBe(PROVENANCE.introducingPr);
    expect(result?.confidence).toBe(PROVENANCE.confidence);
    expect(result?.computedAt).toBe(PROVENANCE.computedAt);
  });

  it('putLineProvenance is idempotent — second put updates fields', async () => {
    await store.putLineProvenance(REPO, PROVENANCE);
    const updated: CachedProvenance = {
      ...PROVENANCE,
      introducingSha: 'updated_sha',
      confidence: 'low',
      computedAt: '2024-07-01T00:00:00Z',
    };
    await store.putLineProvenance(REPO, updated);
    const result = await store.getLineProvenance(REPO, PROVENANCE.path, PROVENANCE.lineHash);
    expect(result?.introducingSha).toBe('updated_sha');
    expect(result?.confidence).toBe('low');
    expect(result?.computedAt).toBe('2024-07-01T00:00:00Z');
  });

  it('getLineProvenance is scoped to repo', async () => {
    await store.putLineProvenance(REPO, PROVENANCE);
    const result = await store.getLineProvenance('other/repo', PROVENANCE.path, PROVENANCE.lineHash);
    expect(result).toBeNull();
  });

  it('getLineProvenance is scoped to path', async () => {
    await store.putLineProvenance(REPO, PROVENANCE);
    const result = await store.getLineProvenance(REPO, 'src/other.ts', PROVENANCE.lineHash);
    expect(result).toBeNull();
  });

  it('getLineProvenance is scoped to lineHash', async () => {
    await store.putLineProvenance(REPO, PROVENANCE);
    const result = await store.getLineProvenance(REPO, PROVENANCE.path, 'different_hash');
    expect(result).toBeNull();
  });

  it('stores provenance with no introducingSha or introducingPr', async () => {
    const minimal: CachedProvenance = {
      path: 'src/legacy.ts',
      lineHash: 'aabbccdd',
      confidence: 'low',
      computedAt: '2024-01-01T00:00:00Z',
    };
    await store.putLineProvenance(REPO, minimal);
    const result = await store.getLineProvenance(REPO, minimal.path, minimal.lineHash);
    expect(result).not.toBeNull();
    expect(result?.introducingSha).toBeUndefined();
    expect(result?.introducingPr).toBeUndefined();
    expect(result?.confidence).toBe('low');
  });

  it('stores multiple entries for different paths/hashes independently', async () => {
    const p2: CachedProvenance = {
      path: 'src/retry.ts',
      lineHash: '11223344',
      introducingSha: 'xyz789',
      confidence: 'medium',
      computedAt: '2024-02-01T00:00:00Z',
    };
    await store.putLineProvenance(REPO, PROVENANCE);
    await store.putLineProvenance(REPO, p2);

    const r1 = await store.getLineProvenance(REPO, PROVENANCE.path, PROVENANCE.lineHash);
    const r2 = await store.getLineProvenance(REPO, p2.path, p2.lineHash);
    expect(r1?.introducingSha).toBe('abc123');
    expect(r2?.introducingSha).toBe('xyz789');
  });
});
