/**
 * Rate limiting + caching for host calls — A3 (Connector), issue #13. Part D.8.
 *
 * `withRateLimit` retries on GitHub 403 / secondary-rate-limit / abuse responses with
 * exponential backoff, honoring `Retry-After` / `x-ratelimit-reset` when present.
 *
 * `cached` wraps a fetch fn so the result is read from / written to a Store so repeat
 * runs do not refetch (Part D.8). The host evidence types (PR/Issue/ReviewComments)
 * already have Store upsert/get methods; `cached` glues "miss → fetch → persist" so a
 * second call returns the persisted copy without invoking the network fn again.
 */

import type { Store } from '../core/index.js';

export interface RateLimitOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  /** Injectable sleep for tests (so backoff does not actually wait). */
  sleep?: (ms: number) => Promise<void>;
  /** Cap a single backoff wait so a far-future reset header cannot hang us. */
  maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Shape we read off a thrown Octokit/HTTP error to decide retryability. */
interface HttpishError {
  status?: number;
  response?: { headers?: Record<string, string | undefined> };
  message?: string;
}

function asHttpish(err: unknown): HttpishError {
  return (err ?? {}) as HttpishError;
}

/** A 403/429 that is a rate/secondary limit (not a hard auth failure) is retryable. */
function isRateLimited(err: HttpishError): boolean {
  if (err.status !== 403 && err.status !== 429) return false;
  const headers = err.response?.headers ?? {};
  const remaining = headers['x-ratelimit-remaining'];
  const msg = (err.message ?? '').toLowerCase();
  if (remaining === '0') return true;
  if (headers['retry-after']) return true;
  return (
    msg.includes('rate limit') ||
    msg.includes('secondary rate') ||
    msg.includes('abuse')
  );
}

/** Compute the wait before the next attempt from headers, else exponential backoff. */
function backoffDelayMs(
  err: HttpishError,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const headers = err.response?.headers ?? {};
  const retryAfter = headers['retry-after'];
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, maxDelayMs);
  }
  const reset = headers['x-ratelimit-reset'];
  if (reset) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) {
      const wait = resetMs - Date.now();
      if (wait > 0) return Math.min(wait, maxDelayMs);
    }
  }
  // Exponential backoff: base * 2^attempt.
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

/** Run `fn` with retry/backoff on rate-limit responses. */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  opts: RateLimitOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  // attempts = maxRetries + 1 total tries
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const httpish = asHttpish(err);
      if (attempt >= maxRetries || !isRateLimited(httpish)) {
        throw err;
      }
      const delay = backoffDelayMs(httpish, attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
      attempt += 1;
    }
  }
}

/**
 * Store-backed read-through cache for a single host entity.
 *
 * `read` returns the persisted value (or null on a miss), `fetch` hits the network,
 * and `write` persists what `fetch` returned. On a hit, `fetch` is NEVER invoked — the
 * test for #13 asserts exactly this (the second call does not re-invoke the network fn).
 */
export async function cached<T>(args: {
  read: () => Promise<T | null>;
  fetch: () => Promise<T>;
  write: (value: T) => Promise<void>;
}): Promise<T> {
  const hit = await args.read();
  if (hit !== null && hit !== undefined) return hit;
  const fresh = await args.fetch();
  await args.write(fresh);
  return fresh;
}

/**
 * Cache a PR through the Store: getPr → (miss) prForFetch → upsertPr.
 * Convenience wrapper used by the engine; kept here so caching policy lives in one place.
 */
export async function cachedPr(
  store: Store,
  repo: string,
  prNumber: number,
  fetch: () => Promise<import('../core/index.js').PullRequest>,
): Promise<import('../core/index.js').PullRequest> {
  return cached({
    read: () => store.getPr(repo, prNumber),
    fetch,
    write: (pr) => store.upsertPr(repo, pr),
  });
}

/** Cache an issue through the Store: getIssue → (miss) fetch → upsertIssue. */
export async function cachedIssue(
  store: Store,
  repo: string,
  issueNumber: number,
  fetch: () => Promise<import('../core/index.js').Issue>,
): Promise<import('../core/index.js').Issue> {
  return cached({
    read: () => store.getIssue(repo, issueNumber),
    fetch,
    write: (issue) => store.upsertIssue(repo, issue),
  });
}
