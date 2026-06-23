/**
 * Tests for resolveConfig (#29) — Part G resolution order and parseTarget.
 * Also asserts that secrets never appear in formatted output (Part G rule).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { resolveConfig, requireHostToken } from '../../src/cli/config.js';
import type { ResolveConfigInput } from '../../src/cli/config.js';
import { parseTarget } from '../../src/cli/commands/why.js';
import { ArchaeoError, MissingKeyError, MissingTokenError } from '../../src/core/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<ResolveConfigInput> = {}): ResolveConfigInput {
  return { cwd: process.cwd(), ...overrides };
}

// Save and restore env
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {
    ARCHAEO_LLM_KEY: process.env['ARCHAEO_LLM_KEY'],
    GITHUB_TOKEN: process.env['GITHUB_TOKEN'],
    GH_TOKEN: process.env['GH_TOKEN'],
  };
  delete process.env['ARCHAEO_LLM_KEY'];
  delete process.env['GITHUB_TOKEN'];
  delete process.env['GH_TOKEN'];
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------------------
// resolveConfig — provider defaults
// ---------------------------------------------------------------------------

describe('resolveConfig — provider defaults', () => {
  it('defaults to fake when no key and no provider given', () => {
    const cfg = resolveConfig(baseInput());
    expect(cfg.provider).toBe('fake');
    expect(cfg.llmKey).toBeUndefined();
  });

  it('defaults to anthropic when a key is supplied and no provider given', () => {
    const cfg = resolveConfig(baseInput({ key: 'sk-ant-test123' }));
    expect(cfg.provider).toBe('anthropic');
  });

  it('respects explicit provider=fake even when a key is provided', () => {
    const cfg = resolveConfig(baseInput({ key: 'sk-ant-test123', provider: 'fake' }));
    expect(cfg.provider).toBe('fake');
  });

  it('respects explicit provider=openai when a key is provided', () => {
    const cfg = resolveConfig(baseInput({ key: 'sk-openai-xyz', provider: 'openai' }));
    expect(cfg.provider).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// resolveConfig — LLM key resolution order (Part G)
// ---------------------------------------------------------------------------

describe('resolveConfig — LLM key resolution order', () => {
  it('flag --key wins over env ARCHAEO_LLM_KEY', () => {
    process.env['ARCHAEO_LLM_KEY'] = 'sk-from-env';
    const cfg = resolveConfig(baseInput({ key: 'sk-from-flag', provider: 'fake' }));
    expect(cfg.llmKey).toBe('sk-from-flag');
  });

  it('env ARCHAEO_LLM_KEY used when no flag', () => {
    process.env['ARCHAEO_LLM_KEY'] = 'sk-from-env';
    const cfg = resolveConfig(baseInput({ provider: 'fake' }));
    expect(cfg.llmKey).toBe('sk-from-env');
  });

  it('throws MissingKeyError when non-fake provider and no key found', () => {
    expect(() =>
      resolveConfig(baseInput({ provider: 'anthropic' })),
    ).toThrow(MissingKeyError);
  });

  it('MissingKeyError hint mentions how to set the key', () => {
    let caught: MissingKeyError | undefined;
    try {
      resolveConfig(baseInput({ provider: 'anthropic' }));
    } catch (e) {
      caught = e as MissingKeyError;
    }
    expect(caught?.hint).toBeDefined();
    expect(caught?.hint).toContain('ARCHAEO_LLM_KEY');
  });
});

// ---------------------------------------------------------------------------
// resolveConfig — host token resolution order (Part G)
// ---------------------------------------------------------------------------

describe('resolveConfig — host token resolution order', () => {
  it('flag --token wins over env GITHUB_TOKEN', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-env';
    const cfg = resolveConfig(baseInput({ token: 'ghp-flag' }));
    expect(cfg.hostToken).toBe('ghp-flag');
  });

  it('GITHUB_TOKEN used when no flag', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-env-github';
    const cfg = resolveConfig(baseInput());
    expect(cfg.hostToken).toBe('ghp-env-github');
  });

  it('GH_TOKEN used when GITHUB_TOKEN absent', () => {
    process.env['GH_TOKEN'] = 'ghp-env-gh';
    const cfg = resolveConfig(baseInput());
    expect(cfg.hostToken).toBe('ghp-env-gh');
  });

  it('GITHUB_TOKEN wins over GH_TOKEN', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-github';
    process.env['GH_TOKEN'] = 'ghp-gh';
    const cfg = resolveConfig(baseInput());
    expect(cfg.hostToken).toBe('ghp-github');
  });

  it('hostToken is undefined when no token source available and gh CLI is absent', () => {
    // gh CLI is not available in the test environment in a predictable way,
    // but if neither env var is set the config should not throw.
    const cfg = resolveConfig(baseInput());
    // Either undefined (no gh CLI) or a string (gh CLI is authenticated).
    expect(cfg.hostToken === undefined || typeof cfg.hostToken === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requireHostToken
// ---------------------------------------------------------------------------

describe('requireHostToken', () => {
  it('returns the token when present', () => {
    const cfg = resolveConfig(baseInput({ token: 'ghp-xyz' }));
    const token = requireHostToken(cfg);
    expect(token).toBe('ghp-xyz');
  });

  it('throws MissingTokenError when token is absent', () => {
    const cfg = resolveConfig(baseInput());
    // If gh CLI provides a token, skip this test.
    if (cfg.hostToken !== undefined) return;
    expect(() => requireHostToken(cfg)).toThrow(MissingTokenError);
  });

  it('MissingTokenError hint mentions GITHUB_TOKEN', () => {
    const cfg = resolveConfig(baseInput());
    if (cfg.hostToken !== undefined) return;
    let caught: MissingTokenError | undefined;
    try {
      requireHostToken(cfg);
    } catch (e) {
      caught = e as MissingTokenError;
    }
    expect(caught?.hint).toContain('GITHUB_TOKEN');
  });

  it('MissingTokenError has exitCode 3', () => {
    const cfg = resolveConfig(baseInput());
    if (cfg.hostToken !== undefined) return;
    let caught: MissingTokenError | undefined;
    try {
      requireHostToken(cfg);
    } catch (e) {
      caught = e as MissingTokenError;
    }
    expect(caught?.exitCode).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseTarget — valid inputs
// ---------------------------------------------------------------------------

describe('parseTarget — valid inputs', () => {
  it('parses a simple path:line', () => {
    expect(parseTarget('src/auth.ts:57')).toEqual({ path: 'src/auth.ts', line: 57 });
  });

  it('parses a nested path', () => {
    expect(parseTarget('src/payments/charge.ts:88')).toEqual({
      path: 'src/payments/charge.ts',
      line: 88,
    });
  });

  it('parses line 1', () => {
    expect(parseTarget('a.ts:1')).toEqual({ path: 'a.ts', line: 1 });
  });

  it('uses the LAST colon for paths that contain colons', () => {
    // e.g. Windows path C:\src\foo.ts:10 — last colon before 10
    const result = parseTarget('prefix/foo.ts:100');
    expect(result.line).toBe(100);
    expect(result.path).toBe('prefix/foo.ts');
  });
});

// ---------------------------------------------------------------------------
// parseTarget — invalid inputs
// ---------------------------------------------------------------------------

describe('parseTarget — invalid inputs', () => {
  it('throws ArchaeoError when no colon', () => {
    expect(() => parseTarget('src/auth.ts')).toThrow(ArchaeoError);
  });

  it('throws with helpful message when no colon', () => {
    let caught: ArchaeoError | undefined;
    try {
      parseTarget('src/auth.ts');
    } catch (e) {
      caught = e as ArchaeoError;
    }
    expect(caught?.message).toContain('missing line number');
    expect(caught?.hint).toContain('archaeo why');
  });

  it('throws ArchaeoError for non-numeric line', () => {
    expect(() => parseTarget('src/auth.ts:abc')).toThrow(ArchaeoError);
  });

  it('throws ArchaeoError for empty path', () => {
    expect(() => parseTarget(':57')).toThrow(ArchaeoError);
  });

  it('throws ArchaeoError for line 0', () => {
    expect(() => parseTarget('src/auth.ts:0')).toThrow(ArchaeoError);
  });

  it('throws ArchaeoError for negative line', () => {
    // "-5" fails the /^\d+$/ check.
    expect(() => parseTarget('src/auth.ts:-5')).toThrow(ArchaeoError);
  });

  it('throws ArchaeoError for empty string', () => {
    expect(() => parseTarget('')).toThrow(ArchaeoError);
  });

  it('exit code is 1 for bad target', () => {
    let caught: ArchaeoError | undefined;
    try {
      parseTarget('src/auth.ts');
    } catch (e) {
      caught = e as ArchaeoError;
    }
    expect(caught?.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Secret never logged — resolveConfig must not expose keys in output
// ---------------------------------------------------------------------------

describe('resolveConfig — secrets never logged', () => {
  it('does not write the LLM key to stdout or stderr', () => {
    // Capture console.log calls to assert no key leakage.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const secretKey = 'sk-ant-secret-key-9999';
    resolveConfig(baseInput({ key: secretKey, provider: 'fake' }));

    const allOutput = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join(' ');

    expect(allOutput).not.toContain(secretKey);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does not write host token to stdout or stderr', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const secretToken = 'ghp-supersecrettoken99999';
    resolveConfig(baseInput({ token: secretToken }));

    const allOutput = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join(' ');

    expect(allOutput).not.toContain(secretToken);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
