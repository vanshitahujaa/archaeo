/**
 * Edges + traverse tests — issue #7.
 *
 * Covers: addEdge, traverse (single hop), multi-hop recursive traversal,
 * and a cross-rel traversal pattern (introduced_by → fixes) via two calls.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Edge } from '../../src/core/index.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';

const REPO = 'owner/repo';

function makeStore(): SqliteStore {
  return new SqliteStore({ dbPath: ':memory:' });
}

describe('edges + traverse (#7)', () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = makeStore();
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it('traverse returns [] when no edges exist', async () => {
    const result = await store.traverse(REPO, 'line', 'L1', 'introduced_by');
    expect(result).toEqual([]);
  });

  it('addEdge + traverse returns the direct edge', async () => {
    const edge: Edge = {
      srcType: 'line',
      srcId: 'L1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'abc123',
      confidence: 0.9,
    };
    await store.addEdge(REPO, edge);
    const result = await store.traverse(REPO, 'line', 'L1', 'introduced_by');
    expect(result).toHaveLength(1);
    const r = result[0]!;
    expect(r.srcType).toBe('line');
    expect(r.srcId).toBe('L1');
    expect(r.rel).toBe('introduced_by');
    expect(r.dstType).toBe('commit');
    expect(r.dstId).toBe('abc123');
    expect(r.confidence).toBeCloseTo(0.9);
  });

  it('traverse is scoped to repo', async () => {
    const edge: Edge = {
      srcType: 'line',
      srcId: 'L1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'abc123',
    };
    await store.addEdge(REPO, edge);
    const result = await store.traverse('other/repo', 'line', 'L1', 'introduced_by');
    expect(result).toEqual([]);
  });

  it('traverse follows a multi-hop chain recursively', async () => {
    // L1 -introduced_by-> C1 -introduced_by-> C2
    await store.addEdge(REPO, {
      srcType: 'line',
      srcId: 'L1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'C1',
    });
    await store.addEdge(REPO, {
      srcType: 'commit',
      srcId: 'C1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'C2',
    });

    const result = await store.traverse(REPO, 'line', 'L1', 'introduced_by');
    // Both hops should be returned
    expect(result.length).toBeGreaterThanOrEqual(2);
    const dstIds = result.map((e) => e.dstId);
    expect(dstIds).toContain('C1');
    expect(dstIds).toContain('C2');
  });

  it('cross-rel traversal: introduced_by → fixes (two traverse calls)', async () => {
    // line L1 --introduced_by--> commit C1
    // commit C1 --fixes--> issue I7
    await store.addEdge(REPO, {
      srcType: 'line',
      srcId: 'L1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'C1',
    });
    await store.addEdge(REPO, {
      srcType: 'commit',
      srcId: 'C1',
      rel: 'fixes',
      dstType: 'issue',
      dstId: 'I7',
    });

    // First hop: introduced_by
    const hop1 = await store.traverse(REPO, 'line', 'L1', 'introduced_by');
    expect(hop1).toHaveLength(1);
    const commitId = hop1[0]!.dstId; // 'C1'
    expect(commitId).toBe('C1');

    // Second hop: fixes (starting from the commit we just found)
    const hop2 = await store.traverse(REPO, hop1[0]!.dstType, commitId, 'fixes');
    expect(hop2).toHaveLength(1);
    expect(hop2[0]!.dstType).toBe('issue');
    expect(hop2[0]!.dstId).toBe('I7');
  });

  it('addEdge stores optional confidence and traverse preserves it', async () => {
    await store.addEdge(REPO, {
      srcType: 'a',
      srcId: 'x',
      rel: 'depends_on',
      dstType: 'b',
      dstId: 'y',
      confidence: 0.75,
    });
    const result = await store.traverse(REPO, 'a', 'x', 'depends_on');
    expect(result[0]?.confidence).toBeCloseTo(0.75);
  });

  it('addEdge without confidence stores undefined', async () => {
    await store.addEdge(REPO, {
      srcType: 'a',
      srcId: 'x',
      rel: 'modified_by',
      dstType: 'b',
      dstId: 'y',
    });
    const result = await store.traverse(REPO, 'a', 'x', 'modified_by');
    expect(result[0]?.confidence).toBeUndefined();
  });

  it('traverse does not return edges from a different rel', async () => {
    await store.addEdge(REPO, {
      srcType: 'line',
      srcId: 'L1',
      rel: 'modified_by',
      dstType: 'commit',
      dstId: 'C9',
    });
    const result = await store.traverse(REPO, 'line', 'L1', 'introduced_by');
    expect(result).toEqual([]);
  });
});
