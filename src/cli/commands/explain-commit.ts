/**
 * `archaeo explain-commit <sha>` — A5 (Surface), issue #51 / Part D.9. PHASE 0 STUB.
 * V1 command, excluded from the two-week prototype gate (Part N).
 */

import { NotImplemented } from '../../core/index.js';

export interface ExplainCommitArgs {
  sha: string;
  key?: string;
  token?: string;
  provider?: string;
  model?: string;
  cwd: string;
}

export async function runExplainCommit(_args: ExplainCommitArgs): Promise<string> {
  throw new NotImplemented('runExplainCommit (#48/#51)');
}
