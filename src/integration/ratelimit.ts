/**
 * Rate limiting + caching wrapper for host calls — A3 (Connector), issue #23.
 * PHASE 0 STUB. Backoff on 403/secondary limits; cache through the Store so repeated
 * runs do not refetch (Part D.8).
 */

import { NotImplemented } from '../core/index.js';

export interface RateLimitOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/** Run `fn` with retry/backoff on rate-limit responses. */
export async function withRateLimit<T>(
  _fn: () => Promise<T>,
  _opts: RateLimitOptions = {},
): Promise<T> {
  throw new NotImplemented('withRateLimit (#23)');
}
