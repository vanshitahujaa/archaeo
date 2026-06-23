/**
 * Host token resolution — issue #13 / Part G.
 *
 * Order: --token flag → GITHUB_TOKEN / GH_TOKEN env → gh CLI config.
 * Also asserts the resolution never leaks the token value into its diagnostics.
 */

import { describe, expect, it, vi } from 'vitest';
import { resolveHostToken, parseGhHostsYml } from '../../src/integration/auth.js';
import { MissingTokenError } from '../../src/core/index.js';

describe('resolveHostToken (#13 / Part G)', () => {
  it('prefers the --token flag above everything', () => {
    const res = resolveHostToken('flag-tok', {
      env: { GITHUB_TOKEN: 'env-tok' },
      readGhToken: () => 'gh-tok',
    });
    expect(res).toEqual({ token: 'flag-tok', source: 'flag' });
  });

  it('falls back to GITHUB_TOKEN env when no flag', () => {
    const res = resolveHostToken(undefined, {
      env: { GITHUB_TOKEN: 'env-tok' },
      readGhToken: () => 'gh-tok',
    });
    expect(res).toEqual({ token: 'env-tok', source: 'env' });
  });

  it('accepts GH_TOKEN as an env alias', () => {
    const res = resolveHostToken(undefined, {
      env: { GH_TOKEN: 'gh-env-tok' },
      readGhToken: () => '',
    });
    expect(res).toEqual({ token: 'gh-env-tok', source: 'env' });
  });

  it('falls back to the gh CLI config last', () => {
    const res = resolveHostToken(undefined, { env: {}, readGhToken: () => 'gh-cli-tok' });
    expect(res).toEqual({ token: 'gh-cli-tok', source: 'gh-cli' });
  });

  it('throws MissingTokenError with a hint when nothing is found', () => {
    try {
      resolveHostToken(undefined, { env: {}, readGhToken: () => '' });
      expect.fail('expected MissingTokenError');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingTokenError);
      expect((err as MissingTokenError).hint).toMatch(/--token|GITHUB_TOKEN|gh auth/);
    }
  });

  it('ignores blank/whitespace flag and env values', () => {
    const res = resolveHostToken('   ', {
      env: { GITHUB_TOKEN: '  ' },
      readGhToken: () => 'gh-cli-tok',
    });
    expect(res.source).toBe('gh-cli');
  });

  it('NEVER logs the secret value (Part G)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = resolveHostToken('super-secret-123', { env: {}, readGhToken: () => '' });
    // The resolution returns the token but emits no log of it.
    expect(res.token).toBe('super-secret-123');
    const logged = [...spy.mock.calls, ...errSpy.mock.calls].flat().join(' ');
    expect(logged).not.toContain('super-secret-123');
    spy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('parseGhHostsYml', () => {
  it('extracts oauth_token from a gh hosts.yml', () => {
    const yml = [
      'github.com:',
      '    user: alice',
      '    oauth_token: ghp_realtokenvalue',
      '    git_protocol: ssh',
    ].join('\n');
    expect(parseGhHostsYml(yml)).toBe('ghp_realtokenvalue');
  });

  it('returns empty string when no token is present', () => {
    expect(parseGhHostsYml('github.com:\n  user: alice\n')).toBe('');
  });
});
