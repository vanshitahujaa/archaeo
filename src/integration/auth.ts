/**
 * Host token resolution — A3 (Connector), issue #13 / Part G.
 *
 * Host token order:  --token flag → GITHUB_TOKEN / GH_TOKEN env → gh CLI config.
 * Never log the resolved secret (Part G; a test asserts this). The functions here
 * return only the value plus its `source` label; logging is the caller's choice and
 * it should log `source`, never `token`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MissingTokenError } from '../core/index.js';

export interface HostTokenResolution {
  token: string;
  /** Where it came from, for diagnostics. Never the value. */
  source: 'flag' | 'env' | 'gh-cli';
}

export interface ResolveOptions {
  /** Injectable env for testing. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Injectable `gh` token reader for testing. Returns the token or '' if none.
   * Defaults to reading the real gh CLI config / running `gh auth token`.
   */
  readGhToken?: () => string;
}

/** Read a token from the `gh` CLI: hosts.yml config first, then `gh auth token`. */
function readGhCliToken(): string {
  // 1) gh stores `oauth_token: <token>` in ~/.config/gh/hosts.yml. Parse it directly
  //    so we don't depend on `gh` being on PATH when the config is present.
  const candidates = [
    process.env.GH_CONFIG_DIR ? join(process.env.GH_CONFIG_DIR, 'hosts.yml') : null,
    join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
      'gh',
      'hosts.yml',
    ),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      const yml = readFileSync(path, 'utf8');
      const token = parseGhHostsYml(yml);
      if (token) return token;
    } catch {
      // missing/unreadable — try the next strategy
    }
  }

  // 2) Fall back to invoking the CLI itself.
  try {
    const out = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch {
    return '';
  }
}

/**
 * Extract the first `oauth_token:` value from a gh `hosts.yml`. We avoid a YAML dep;
 * the file is simple and the token line is unambiguous.
 */
export function parseGhHostsYml(yml: string): string {
  const m = /^\s*oauth_token:\s*(.+)\s*$/m.exec(yml);
  if (!m) return '';
  return (m[1] as string).trim().replace(/^["']|["']$/g, '');
}

/** Resolve the host token following the Part G order, or throw MissingTokenError. */
export function resolveHostToken(
  flagToken?: string,
  opts: ResolveOptions = {},
): HostTokenResolution {
  const env = opts.env ?? process.env;
  const readGh = opts.readGhToken ?? readGhCliToken;

  // 1) explicit --token flag
  const flag = flagToken?.trim();
  if (flag) return { token: flag, source: 'flag' };

  // 2) GITHUB_TOKEN / GH_TOKEN env
  const envToken = (env.GITHUB_TOKEN ?? env.GH_TOKEN ?? '').trim();
  if (envToken) return { token: envToken, source: 'env' };

  // 3) gh CLI config
  const ghToken = readGh().trim();
  if (ghToken) return { token: ghToken, source: 'gh-cli' };

  throw new MissingTokenError(
    'No GitHub token found.',
    'Pass --token, set GITHUB_TOKEN or GH_TOKEN, or run `gh auth login`.',
  );
}
