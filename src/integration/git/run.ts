/**
 * Thin promisified `git` runner — A3 (Connector).
 *
 * We shell out to `git` directly (not through simple-git) because the provenance
 * primitives need exact control over plumbing flags (`-L`, `-S`, `-G`, `--all`,
 * `-M -C`, custom `--pretty` formats) and over how raw stdout is parsed. Arguments
 * are passed as an argv array via `execFile`, so there is no shell interpolation
 * and no injection surface from tokens or user-supplied paths.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export interface GitRunOptions {
  /** Working directory the command runs in. */
  cwd: string;
  /** Max stdout/stderr buffer; git log over --all can be large. */
  maxBuffer?: number;
}

/**
 * Run `git <args>` in `cwd` and return stdout/stderr as strings.
 * Rejects (with the underlying error) on a non-zero exit code.
 */
export async function git(args: string[], opts: GitRunOptions): Promise<GitRunResult> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: opts.cwd,
    maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
    encoding: 'utf8',
    // Keep git deterministic and non-interactive regardless of the user's config.
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  return { stdout, stderr };
}

/** Run git and return only trimmed stdout; '' on a non-zero exit instead of throwing. */
export async function gitSafe(args: string[], opts: GitRunOptions): Promise<string> {
  try {
    const { stdout } = await git(args, opts);
    return stdout.trim();
  } catch {
    return '';
  }
}
