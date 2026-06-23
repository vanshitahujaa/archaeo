/**
 * Host + repo-slug detection from the git remote — A3 (Connector), issue #20.
 * PHASE 0 STUB.
 */

import type { HostKind } from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface DetectedRemote {
  host: HostKind;
  owner: string;
  name: string;
}

/** Infer `{ host, owner, name }` from a remote URL (ssh or https). */
export function detectRemote(_remoteUrl: string): DetectedRemote {
  throw new NotImplemented('detectRemote (#20)');
}
