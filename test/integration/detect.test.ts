/**
 * Remote → host/owner/name parsing — issue #10.
 */

import { describe, expect, it } from 'vitest';
import { detectRemote } from '../../src/integration/hosts/detect.js';
import { ArchaeoError } from '../../src/core/index.js';

describe('detectRemote (#10)', () => {
  it('parses scp-style ssh github remotes', () => {
    expect(detectRemote('git@github.com:vanshitahujaa/archaeo.git')).toEqual({
      host: 'github',
      owner: 'vanshitahujaa',
      name: 'archaeo',
    });
  });

  it('parses scp-style ssh without .git suffix', () => {
    expect(detectRemote('git@github.com:owner/name')).toEqual({
      host: 'github',
      owner: 'owner',
      name: 'name',
    });
  });

  it('parses ssh:// URLs', () => {
    expect(detectRemote('ssh://git@github.com/owner/name.git')).toEqual({
      host: 'github',
      owner: 'owner',
      name: 'name',
    });
  });

  it('parses https remotes', () => {
    expect(detectRemote('https://github.com/owner/name.git')).toEqual({
      host: 'github',
      owner: 'owner',
      name: 'name',
    });
  });

  it('parses https remotes with credentials and port', () => {
    expect(detectRemote('https://user:tok@github.com:443/owner/name.git')).toEqual({
      host: 'github',
      owner: 'owner',
      name: 'name',
    });
  });

  it('detects gitlab and bitbucket hosts', () => {
    expect(detectRemote('git@gitlab.com:grp/name.git').host).toBe('gitlab');
    expect(detectRemote('https://bitbucket.org/team/name.git').host).toBe('bitbucket');
  });

  it('handles gitlab nested subgroups (owner is everything before the repo name)', () => {
    expect(detectRemote('git@gitlab.com:group/subgroup/name.git')).toEqual({
      host: 'gitlab',
      owner: 'group/subgroup',
      name: 'name',
    });
  });

  it('defaults unknown hosts (GHE) to github', () => {
    expect(detectRemote('git@github.example.com:owner/name.git').host).toBe('github');
  });

  it('throws an ArchaeoError on an empty or unparseable remote', () => {
    expect(() => detectRemote('')).toThrow(ArchaeoError);
    expect(() => detectRemote('not-a-remote')).toThrow(ArchaeoError);
  });
});
