/**
 * Config + key resolution — A5 (Surface), issue #50 / Part G. PHASE 0 STUB.
 *
 * Provider key order:  --key flag → ARCHAEO_LLM_KEY env → ~/.config/archaeo/config.json.
 * Host token order:    --token flag → GITHUB_TOKEN / GH_TOKEN env → gh CLI config.
 * Never log keys or tokens (Part G; a test asserts this).
 */

import { NotImplemented } from '../core/index.js';

export type LlmProviderName = 'anthropic' | 'openai' | 'gemini' | 'fake';

export interface ArchaeoConfig {
  provider: LlmProviderName;
  model?: string;
  llmKey?: string;
  hostToken?: string;
  /** Path to the local SQLite cache. */
  dbPath: string;
}

export interface ResolveConfigInput {
  key?: string;
  token?: string;
  provider?: LlmProviderName;
  model?: string;
  cwd: string;
}

export function resolveConfig(_input: ResolveConfigInput): ArchaeoConfig {
  throw new NotImplemented('resolveConfig (#50)');
}
