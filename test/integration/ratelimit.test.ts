/**
 * Rate-limit backoff + Store-backed caching — issue #13.
 *
 * The cache test uses the REAL SqliteStore (`:memory:`) and asserts the SECOND call
 * does NOT re-invoke the network fn.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  withRateLimit,
  cached,
  cachedPr,
  cachedIssue,
} from '../../src/integration/ratelimit.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';
import type { Issue, PullRequest } from '../../src/core/index.js';

const REPO = 'acme/widgets';

function rateLimitError(headers: Record<string, string> = {}, message = 'rate limit'): Error {
  const err = new Error(message) as Error & {
    status: number;
    response: { headers: Record<string, string> };
  };
  err.status = 403;
  err.response = { headers };
  return err;
}

describe('withRateLimit (#13)', () => {
  it('retries on a 403 rate-limit error then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimitError({ 'x-ratelimit-remaining': '0' }))
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    const out = await withRateLimit(fn, { sleep, baseDelayMs: 1 });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('honors a Retry-After header for the backoff delay', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimitError({ 'retry-after': '2' }))
      .mockResolvedValueOnce('done');
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRateLimit(fn, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after maxRetries and rethrows', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(rateLimitError({ 'x-ratelimit-remaining': '0' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRateLimit(fn, { sleep, maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow();
    // initial try + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a non-rate-limit error (e.g. 404)', async () => {
    const notFound = new Error('Not Found') as Error & { status: number };
    notFound.status = 404;
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(notFound);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRateLimit(fn, { sleep })).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('Store-backed cache (#13)', () => {
  let store: SqliteStore;

  beforeEach(async () => {
    store = new SqliteStore({ dbPath: ':memory:' });
    await store.init();
  });
  afterEach(async () => {
    await store.close();
  });

  it('cachedPr fetches once; the second call hits the Store and does NOT refetch', async () => {
    const pr: PullRequest = {
      number: 184,
      title: 'Add retry',
      body: 'Fixes #102',
      authorLogin: 'alice',
      mergedSha: 'deadbeef',
      state: 'merged',
    };
    const fetch = vi.fn<() => Promise<PullRequest>>().mockResolvedValue(pr);

    const first = await cachedPr(store, REPO, 184, fetch);
    const second = await cachedPr(store, REPO, 184, fetch);

    expect(first.number).toBe(184);
    expect(second.title).toBe('Add retry');
    // The crux of #13: the network fn ran exactly once.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cachedIssue caches through the Store (second call does not refetch)', async () => {
    const issue: Issue = { number: 102, title: 'Retry', body: 'need retry', state: 'closed' };
    const fetch = vi.fn<() => Promise<Issue>>().mockResolvedValue(issue);

    await cachedIssue(store, REPO, 102, fetch);
    const again = await cachedIssue(store, REPO, 102, fetch);

    expect(again.number).toBe(102);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cached re-fetches for a different key', async () => {
    const fetch = vi
      .fn<() => Promise<PullRequest>>()
      .mockImplementation(async () => ({
        number: 1,
        title: 't',
        body: '',
        authorLogin: 'a',
        state: 'merged',
      }));
    await cachedPr(store, REPO, 1, fetch);
    await cachedPr(store, REPO, 2, () =>
      Promise.resolve({ number: 2, title: 't2', body: '', authorLogin: 'a', state: 'merged' }),
    );
    // first key fetched once; the second key used its own fetch.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cached generic helper writes through and reads back', async () => {
    let reads = 0;
    let writes = 0;
    const store2 = new Map<string, number>();
    const fetch = vi.fn<() => Promise<number>>().mockResolvedValue(42);
    const opts = {
      read: async () => {
        reads += 1;
        return store2.has('k') ? (store2.get('k') as number) : null;
      },
      fetch,
      write: async (v: number) => {
        writes += 1;
        store2.set('k', v);
      },
    };
    expect(await cached(opts)).toBe(42);
    expect(await cached(opts)).toBe(42);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reads).toBe(2);
    expect(writes).toBe(1);
  });
});
