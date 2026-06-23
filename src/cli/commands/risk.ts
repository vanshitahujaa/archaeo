/**
 * `archaeo risk <path>` — A5 (Surface), issue #52. PHASE 0 STUB.
 */

import { NotImplemented } from '../../core/index.js';

export interface RiskArgs {
  path: string;
  token?: string;
  windowDays?: number;
  cwd: string;
}

export async function runRisk(_args: RiskArgs): Promise<string> {
  throw new NotImplemented('runRisk (#52)');
}
