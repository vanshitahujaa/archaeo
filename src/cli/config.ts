/**
 * Config + key resolution — A5 (Surface), issue #29 / Part G.
 *
 * Provider key order:  --key flag → ARCHAEO_LLM_KEY env → ~/.config/archaeo/config.json.
 * Host token order:    --token flag → GITHUB_TOKEN / GH_TOKEN env → gh CLI config.
 * Never log keys or tokens (Part G; a test asserts this).
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ArchaeoError, MissingKeyError, MissingTokenError } from '../core/index.js';

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

/** Shape of ~/.config/archaeo/config.json */
interface ConfigFile {
  llmKey?: string;
  hostToken?: string;
  provider?: LlmProviderName;
  model?: string;
  dbPath?: string;
}

/** Read and parse the config file; returns null if it doesn't exist. */
function readConfigFile(): ConfigFile | null {
  const configPath = join(homedir(), '.config', 'archaeo', 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as ConfigFile;
  } catch {
    throw new ArchaeoError(
      `Could not parse config file at ${join(homedir(), '.config', 'archaeo', 'config.json')}`,
      {
        exitCode: 1,
        hint: 'Check that the file is valid JSON.',
      },
    );
  }
}

/**
 * Try to resolve the GitHub token via the `gh` CLI.
 * Returns null if gh is not installed or not authenticated.
 * NEVER logs the resolved value.
 */
function resolveTokenFromGhCli(): string | null {
  try {
    const result = execSync('gh auth token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const token = result.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Resolve config following Part G priority order.
 *
 * LLM key: --key → ARCHAEO_LLM_KEY → ~/.config/archaeo/config.json
 * Host token: --token → GITHUB_TOKEN / GH_TOKEN → gh CLI
 *
 * When no LLM key is found, provider defaults to 'fake' (offline mode).
 * When no host token is found, hostToken is left undefined (engine will handle degraded mode).
 */
export function resolveConfig(input: ResolveConfigInput): ArchaeoConfig {
  const configFile = readConfigFile();

  // --- LLM key resolution (Part G order) ---
  const llmKey =
    input.key ??
    process.env['ARCHAEO_LLM_KEY'] ??
    configFile?.llmKey ??
    undefined;

  // --- Provider resolution ---
  // Explicit provider wins; if a key is available default to anthropic; otherwise fake (offline).
  const provider: LlmProviderName =
    input.provider ??
    configFile?.provider ??
    (llmKey !== undefined ? 'anthropic' : 'fake');

  // If provider is NOT fake and no key was found, error out with a helpful message.
  if (provider !== 'fake' && llmKey === undefined) {
    throw new MissingKeyError(
      `LLM key required for provider '${provider}' but none was found.`,
      'Set ARCHAEO_LLM_KEY in your environment, pass --key, or add llmKey to ~/.config/archaeo/config.json. ' +
        'Alternatively, use --provider fake to run offline.',
    );
  }

  // --- Model resolution ---
  const model = input.model ?? configFile?.model ?? undefined;

  // --- Host token resolution (Part G order) ---
  const hostToken =
    input.token ??
    process.env['GITHUB_TOKEN'] ??
    process.env['GH_TOKEN'] ??
    resolveTokenFromGhCli() ??
    undefined;

  // --- DB path ---
  const dbPath =
    configFile?.dbPath ??
    join(homedir(), '.cache', 'archaeo', 'store.db');

  return {
    provider,
    model,
    llmKey,
    hostToken,
    dbPath,
  };
}

/**
 * Require that a host token is present; throw MissingTokenError with clear guidance if not.
 * Called by commands that need GitHub access.
 */
export function requireHostToken(config: ArchaeoConfig): string {
  if (config.hostToken !== undefined) return config.hostToken;
  throw new MissingTokenError(
    'GitHub token required but none was found.',
    'Set GITHUB_TOKEN or GH_TOKEN in your environment, pass --token, or authenticate with the gh CLI (`gh auth login`).',
  );
}
