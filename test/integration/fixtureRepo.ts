/**
 * Throwaway git-repo builder for integration tests — A3 (Connector).
 *
 * Creates a real git repo in an OS temp dir with a FIXED author + committer identity
 * and a FIXED date so commit SHAs and ordering are deterministic across runs and
 * machines. Tests exercise the actual `git` binary (the spec mandates real git, not
 * mocks). Call `repo.cleanup()` in an afterEach.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const AUTHOR_ENV = {
  GIT_AUTHOR_NAME: 'Test Author',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test Author',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  // Deterministic, fixed timestamps. We bump the clock per commit via committerDate().
  GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
};

export interface FixtureRepo {
  /** Absolute path to the working tree root. */
  dir: string;
  /** Write a file (creating parent dirs) without committing. */
  write(relPath: string, content: string): void;
  /** Run a raw git command, returning trimmed stdout. */
  git(args: string[], env?: Record<string, string>): string;
  /** Stage everything and commit with `message`. Returns the new commit SHA. */
  commit(message: string, dateIso?: string): string;
  /** Set the remote `origin` URL. */
  setOrigin(url: string): void;
  cleanup(): void;
}

let clock = 0;

/** Monotonically increasing ISO timestamps so commits have a stable order. */
function nextDate(): string {
  clock += 1;
  const base = Date.UTC(2024, 0, 1, 0, 0, 0);
  return new Date(base + clock * 60_000).toISOString();
}

export function makeFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), 'archaeo-fixture-'));

  const run = (args: string[], env: Record<string, string> = {}): string =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...AUTHOR_ENV, ...env },
    }).trim();

  // Init with a fixed default branch so origin/HEAD logic is predictable.
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.name', 'Test Author']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'commit.gpgsign', 'false']);

  const write = (relPath: string, content: string): void => {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };

  const commit = (message: string, dateIso?: string): string => {
    const date = dateIso ?? nextDate();
    run(['add', '-A']);
    run(['commit', '-q', '-m', message], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    });
    return run(['rev-parse', 'HEAD']);
  };

  return {
    dir,
    write,
    git: run,
    commit,
    setOrigin: (url: string) => run(['remote', 'add', 'origin', url]),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
