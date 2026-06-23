/**
 * Host + repo-slug detection from the git remote — A3 (Connector), issue #10.
 *
 * Parses both SSH and HTTPS GitHub/GitLab/Bitbucket remote URLs into
 * `{ host, owner, name }`. Supports:
 *   - scp-style ssh:   git@github.com:owner/name.git
 *   - ssh:// URLs:     ssh://git@github.com/owner/name.git
 *   - https/http:      https://github.com/owner/name(.git)
 *   - with creds/port: https://user:token@github.com:443/owner/name.git
 *
 * The `.git` suffix is optional and stripped. Owners may be nested groups
 * (GitLab subgroups: `group/subgroup/name`); the final path segment is the
 * repo name and everything before it is the owner.
 */

import type { HostKind } from '../../core/index.js';
import { ArchaeoError } from '../../core/index.js';

export interface DetectedRemote {
  host: HostKind;
  owner: string;
  name: string;
}

const HOST_BY_DOMAIN: ReadonlyArray<readonly [RegExp, HostKind]> = [
  [/(^|\.)github\.com$/i, 'github'],
  [/(^|\.)gitlab\.com$/i, 'gitlab'],
  [/(^|\.)bitbucket\.org$/i, 'bitbucket'],
];

/** Map a bare hostname to a known HostKind, defaulting to github (e.g. GHE). */
function hostKindFor(hostname: string): HostKind {
  for (const [re, kind] of HOST_BY_DOMAIN) {
    if (re.test(hostname)) return kind;
  }
  // Enterprise hosts (github.example.com, gitlab.internal, …): best-effort by substring.
  const lower = hostname.toLowerCase();
  if (lower.includes('gitlab')) return 'gitlab';
  if (lower.includes('bitbucket')) return 'bitbucket';
  // Default to github — GitHub Enterprise installs use arbitrary hostnames.
  return 'github';
}

/** Strip a trailing `.git`, leading `/`, and surrounding whitespace from a path. */
function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
}

/** Split an owner/name path; owner may contain nested groups. */
function splitOwnerName(path: string): { owner: string; name: string } {
  const segments = normalizePath(path).split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new ArchaeoError(`Cannot parse owner/name from remote path: "${path}"`, {
      hint: 'Expected a remote like git@github.com:owner/name.git or https://github.com/owner/name',
    });
  }
  const name = segments[segments.length - 1] as string;
  const owner = segments.slice(0, -1).join('/');
  return { owner, name };
}

/** Infer `{ host, owner, name }` from a remote URL (ssh or https). */
export function detectRemote(remoteUrl: string): DetectedRemote {
  const url = remoteUrl.trim();
  if (!url) {
    throw new ArchaeoError('Empty remote URL', {
      hint: 'The repository has no usable origin remote. Set one with `git remote add origin <url>`.',
    });
  }

  // scp-like syntax: [user@]host:path  (no scheme, single colon before path, no slash before colon)
  // e.g. git@github.com:owner/name.git
  const scpMatch = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(url);
  const looksLikeScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  if (scpMatch && !looksLikeScheme) {
    const hostname = scpMatch[1] as string;
    const path = scpMatch[2] as string;
    const { owner, name } = splitOwnerName(path);
    return { host: hostKindFor(hostname), owner, name };
  }

  // URL with a scheme: ssh://, https://, http://, git://
  try {
    const parsed = new URL(url);
    const { owner, name } = splitOwnerName(parsed.pathname);
    return { host: hostKindFor(parsed.hostname), owner, name };
  } catch {
    throw new ArchaeoError(`Unrecognized remote URL: "${remoteUrl}"`, {
      hint: 'Supported forms: git@host:owner/name.git, ssh://git@host/owner/name.git, https://host/owner/name.git',
    });
  }
}
