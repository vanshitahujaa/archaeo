/**
 * GraphStore stub tests — issue #9.
 *
 * GraphStore is a V1 stub (implement.md B.3 / A.6). Every method throws NotImplemented.
 * This file documents the seam: when a graph engine is wired in V2, these skipped tests
 * become the acceptance criteria. The single non-skipped test confirms the stub compiles
 * and satisfies the `Store` interface contract at the type level.
 */

import { describe, expect, it } from 'vitest';
import { NotImplemented } from '../../src/core/index.js';
import { GraphStore } from '../../src/storage/graph/graphStore.js';
import type { Store } from '../../src/core/index.js';

describe('GraphStore stub (#9)', () => {
  it('GraphStore is assignable to Store (interface satisfied at the type level)', () => {
    // This test is purely structural: if it compiles, the seam is valid.
    const store: Store = new GraphStore();
    expect(store).toBeInstanceOf(GraphStore);
  });

  it('GraphStore.init() throws NotImplemented', () => {
    const store = new GraphStore();
    expect(() => store.init()).toThrow(NotImplemented);
  });

  // The tests below are skipped in V1 and serve as acceptance criteria for V2.

  it.skip('V2: init() creates graph schema without error', async () => {
    const store = new GraphStore();
    await store.init();
  });

  it.skip('V2: upsertCommits stores commits in the graph backend', async () => {
    const store = new GraphStore();
    await store.init();
    await store.upsertCommits('owner/repo', [
      {
        sha: 'abc123',
        authorLogin: 'alice',
        authorName: 'Alice',
        authoredAt: '2024-01-01T00:00:00Z',
        message: 'feat: initial',
      },
    ]);
  });

  it.skip('V2: upsertPr + getPr round-trip via graph backend', async () => {
    const store = new GraphStore();
    await store.init();
    await store.upsertPr('owner/repo', {
      number: 1,
      title: 'PR',
      body: '',
      authorLogin: 'alice',
      state: 'merged',
    });
    const pr = await store.getPr('owner/repo', 1);
    expect(pr?.number).toBe(1);
  });

  it.skip('V2: addEdge + traverse returns the stored edge via graph backend', async () => {
    const store = new GraphStore();
    await store.init();
    await store.addEdge('owner/repo', {
      srcType: 'line',
      srcId: 'L1',
      rel: 'introduced_by',
      dstType: 'commit',
      dstId: 'C1',
    });
    const edges = await store.traverse('owner/repo', 'line', 'L1', 'introduced_by');
    expect(edges).toHaveLength(1);
  });

  it.skip('V2: putLineProvenance + getLineProvenance round-trip via graph backend', async () => {
    const store = new GraphStore();
    await store.init();
    await store.putLineProvenance('owner/repo', {
      path: 'src/auth.ts',
      lineHash: 'deadbeef',
      confidence: 'high',
      computedAt: '2024-01-01T00:00:00Z',
    });
    const p = await store.getLineProvenance('owner/repo', 'src/auth.ts', 'deadbeef');
    expect(p).not.toBeNull();
  });

  it.skip('V2: close() cleans up the graph connection without error', async () => {
    const store = new GraphStore();
    await store.init();
    await store.close();
  });
});
