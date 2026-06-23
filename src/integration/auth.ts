/**
 * Token + key resolution — A3 (Connector) with A5, issue #23 / Part G.
 * PHASE 0 STUB.
 *
 * Host token order:  --token flag → GITHUB_TOKEN / GH_TOKEN env → gh CLI config.
 * Never log the resolved secret (Part G; a test asserts this).
 */

import { NotImplemented } from '../core/index.js';

export interface HostTokenResolution {
  token: string;
  /** Where it came from, for diagnostics. Never the value. */
  source: 'flag' | 'env' | 'gh-cli';
}

/** Resolve the host token following the Part G order, or throw MissingTokenError. */
export function resolveHostToken(_flagToken?: string): HostTokenResolution {
  throw new NotImplemented('resolveHostToken (#23)');
}
