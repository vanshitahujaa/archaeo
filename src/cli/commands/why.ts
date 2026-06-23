/**
 * `archaeo why <path>:<line>` — A5 (Surface), issue #51. PHASE 0 STUB.
 * Parses the target, builds the engine + summarizer + formatter, prints the Part M output.
 */

import { NotImplemented } from '../../core/index.js';

export interface WhyArgs {
  /** "path:line", e.g. "src/auth.ts:57". */
  target: string;
  key?: string;
  token?: string;
  provider?: string;
  model?: string;
  noCache?: boolean;
  cwd: string;
}

export async function runWhy(_args: WhyArgs): Promise<string> {
  throw new NotImplemented('runWhy (#51)');
}

/** Parse "path:line" into its parts; throws ArchaeoError on bad input. */
export function parseTarget(_target: string): { path: string; line: number } {
  throw new NotImplemented('parseTarget (#51)');
}
