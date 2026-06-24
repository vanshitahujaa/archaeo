/**
 * `archaeo init` onboarding (Surface / npm packaging). Runs against a temp HOME so it never
 * touches the real ~/.config/archaeo/config.json, and asserts secrets never leak into output.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/cli/commands/init.js';
import { configFilePath } from '../../src/cli/config.js';

let savedHome: string | undefined;
let tmp: string;

beforeEach(() => {
  savedHome = process.env['HOME'];
  tmp = mkdtempSync(join(tmpdir(), 'archaeo-init-'));
  process.env['HOME'] = tmp;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = savedHome;
  rmSync(tmp, { recursive: true, force: true });
});

describe('archaeo init', () => {
  it('writes a config file (non-interactive --yes)', async () => {
    const out = await runInit({ provider: 'fake', yes: true });
    expect(existsSync(configFilePath())).toBe(true);
    const cfg = JSON.parse(readFileSync(configFilePath(), 'utf-8'));
    expect(cfg.provider).toBe('fake');
    expect(out).toContain('Saved config');
  });

  it('stores provider/model/key/token but never prints the secret values', async () => {
    const out = await runInit({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      key: 'sk-super-secret-123',
      token: 'ghp_super_secret_456',
      yes: true,
    });
    const cfg = JSON.parse(readFileSync(configFilePath(), 'utf-8'));
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-3-5-haiku-20241022');
    expect(cfg.llmKey).toBe('sk-super-secret-123');
    expect(cfg.hostToken).toBe('ghp_super_secret_456');
    // The confirmation output must NOT contain the secret values.
    expect(out).not.toContain('sk-super-secret-123');
    expect(out).not.toContain('ghp_super_secret_456');
    expect(out).toContain('stored');
  });

  it('rejects an unknown provider', async () => {
    await expect(runInit({ provider: 'bogus', yes: true })).rejects.toThrow(/Unknown provider/);
  });

  it('config file is written with owner-only (0600) permissions', async () => {
    await runInit({ provider: 'fake', yes: true });
    const { statSync } = await import('node:fs');
    const mode = statSync(configFilePath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
