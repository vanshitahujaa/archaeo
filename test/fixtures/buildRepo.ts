/**
 * Deterministic synthetic git repo builder — issue #33.
 *
 * Each exported function builds a small repo into a caller-provided temporary
 * directory using `execFileSync('git', ...)` with:
 *   - Fixed AUTHOR_NAME / AUTHOR_EMAIL / COMMITTER_* identities.
 *   - Fixed GIT_AUTHOR_DATE / GIT_COMMITTER_DATE per commit → deterministic SHAs.
 *   - `git init -b main` so HEAD is always `main`.
 *   - `commit.gpgsign=false` so no GPG key is needed.
 *
 * Return value: a Record<string, string> mapping stable label → commit SHA.
 *
 * IMPORTANT: Each builder uses a DIFFERENT fixed date-sequence so that repos built
 * together never collide on SHAs even if they contain the same file content.
 *
 * Ownership: test/fixtures/ ONLY.  Do NOT edit src/.
 */

import { execFileSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const AUTHOR_NAME = 'Test Author';
const AUTHOR_EMAIL = 'test@example.com';

/** Base options passed to every execFileSync call */
function baseOpts(cwd: string, date: string): SpawnSyncOptionsWithStringEncoding {
  return {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  };
}

/** Run a git command, return trimmed stdout. */
function git(args: string[], cwd: string, date: string): string {
  return execFileSync('git', args, baseOpts(cwd, date)).trim();
}

/** Initialise a fresh repo in `dir`. */
function initRepo(dir: string): void {
  const EPOCH = '2024-01-01T00:00:00+00:00';
  git(['-c', 'init.defaultBranch=main', 'init'], dir, EPOCH);
  git(['config', 'user.email', AUTHOR_EMAIL], dir, EPOCH);
  git(['config', 'user.name', AUTHOR_NAME], dir, EPOCH);
  git(['config', 'commit.gpgsign', 'false'], dir, EPOCH);
}

/** Write a file and stage it. */
function writeFile(dir: string, relPath: string, content: string): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/** Stage one or more paths. */
function add(cwd: string, date: string, ...paths: string[]): void {
  git(['add', '--', ...paths], cwd, date);
}

/** Stage all changes. */
function addAll(cwd: string, date: string): void {
  git(['add', '-A'], cwd, date);
}

/** Commit and return the full SHA. */
function commit(cwd: string, date: string, message: string): string {
  git(['commit', '--allow-empty', '-m', message], cwd, date);
  return git(['rev-parse', 'HEAD'], cwd, date);
}

// ---------------------------------------------------------------------------
// Repo builders
// ---------------------------------------------------------------------------

/**
 * RENAME repo
 *
 * Scenario: a file is renamed from `auth.ts` to `authentication.ts`.
 * The target line (`validateToken`) is authored before the rename.
 *
 * Labels:
 *   introduce  — commit that originally added `validateToken`
 *   rename     — commit that renamed the file
 */
export function buildRenameRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  // commit 1: add auth.ts with validateToken logic
  writeFile(dir, 'auth.ts', `export function validateToken(token: string): boolean {
  if (!token) return false;
  return token.startsWith('Bearer ');
}
`);
  add(dir, '2024-01-10T10:00:00+00:00', 'auth.ts');
  shas['introduce'] = commit(dir, '2024-01-10T10:00:00+00:00', 'feat(auth): add validateToken');

  // commit 2: rename auth.ts → authentication.ts (use git mv)
  execFileSync('git', ['mv', 'auth.ts', 'authentication.ts'], baseOpts(dir, '2024-01-15T12:00:00+00:00'));
  shas['rename'] = commit(dir, '2024-01-15T12:00:00+00:00', 'refactor(auth): rename auth.ts to authentication.ts');

  return shas;
}

/**
 * MOVE-TO-UTILITY repo
 *
 * Scenario: `retry` logic is first implemented inline in `service.ts`, then
 * extracted into `util/retry.ts`.  The cross-file-stitch case.
 *
 * Labels:
 *   introduce     — commit that originally added retry() in service.ts
 *   move          — commit that moved retry() into util/retry.ts
 *   post-move-use — commit that updates service.ts to import from util
 */
export function buildMoveToUtilityRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  // commit 1: add service.ts with inline retry function
  writeFile(dir, 'service.ts', `export function retry(fn: () => void, times: number): void {
  for (let i = 0; i < times; i++) {
    try { fn(); return; } catch (_) { /* retry */ }
  }
  throw new Error('max retries exceeded');
}

export function callRemote(url: string): void {
  retry(() => { /* fetch url */ }, 3);
}
`);
  add(dir, '2024-02-01T09:00:00+00:00', 'service.ts');
  shas['introduce'] = commit(dir, '2024-02-01T09:00:00+00:00', 'feat(service): add retry helper inline');

  // commit 2: extract retry to util/retry.ts
  writeFile(dir, 'util/retry.ts', `export function retry(fn: () => void, times: number): void {
  for (let i = 0; i < times; i++) {
    try { fn(); return; } catch (_) { /* retry */ }
  }
  throw new Error('max retries exceeded');
}
`);
  // remove retry from service.ts
  writeFile(dir, 'service.ts', `import { retry } from './util/retry.js';

export function callRemote(url: string): void {
  retry(() => { /* fetch url */ }, 3);
}
`);
  addAll(dir, '2024-02-10T11:00:00+00:00');
  shas['move'] = commit(dir, '2024-02-10T11:00:00+00:00', 'refactor(service): move retry into util/retry.ts');

  // commit 3: minor update post-move
  writeFile(dir, 'service.ts', `import { retry } from './util/retry.js';

export function callRemote(url: string): void {
  retry(() => { /* fetch url */ }, 5);
}
`);
  add(dir, '2024-02-20T14:00:00+00:00', 'service.ts');
  shas['post-move-use'] = commit(dir, '2024-02-20T14:00:00+00:00', 'fix(service): increase retry count to 5');

  return shas;
}

/**
 * SQUASH repo
 *
 * Scenario: two feature commits are squash-merged into main as a single
 * merge commit.  The squash commit is the one git blame will surface.
 *
 * Labels:
 *   feature-1  — original commit 1 (squashed away)
 *   feature-2  — original commit 2 (squashed away)
 *   squash     — the resulting squash-merge commit on main
 */
export function buildSquashRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  // initial commit on main so we have a base
  writeFile(dir, 'payments.ts', `export function charge(amount: number): void {
  // placeholder
}
`);
  add(dir, '2024-03-01T08:00:00+00:00', 'payments.ts');
  commit(dir, '2024-03-01T08:00:00+00:00', 'chore: init payments.ts');

  // create a feature branch
  git(['checkout', '-b', 'feature/idempotency'], dir, '2024-03-02T08:00:00+00:00');

  // feature commit 1
  writeFile(dir, 'payments.ts', `export function charge(amount: number, idempotencyKey: string): void {
  if (!idempotencyKey) throw new Error('idempotency key required');
}
`);
  add(dir, '2024-03-02T09:00:00+00:00', 'payments.ts');
  shas['feature-1'] = commit(dir, '2024-03-02T09:00:00+00:00', 'feat(payments): require idempotency key');

  // feature commit 2
  writeFile(dir, 'payments.ts', `export function charge(amount: number, idempotencyKey: string): void {
  if (!idempotencyKey) throw new Error('idempotency key required');
  if (amount <= 0) throw new Error('amount must be positive');
}
`);
  add(dir, '2024-03-03T10:00:00+00:00', 'payments.ts');
  shas['feature-2'] = commit(dir, '2024-03-03T10:00:00+00:00', 'feat(payments): validate amount is positive');

  // squash-merge onto main
  git(['checkout', 'main'], dir, '2024-03-04T12:00:00+00:00');
  git(['merge', '--squash', 'feature/idempotency'], dir, '2024-03-04T12:00:00+00:00');
  shas['squash'] = commit(dir, '2024-03-04T12:00:00+00:00', 'feat(payments): add idempotency key + amount validation (#42)');

  return shas;
}

/**
 * CHERRY-PICK repo
 *
 * Scenario: a fix is committed on a hotfix branch and cherry-picked to main.
 * The cherry-pick commit message contains the canonical trailer:
 *   `(cherry picked from commit <sha>)`
 *
 * Labels:
 *   original      — the original fix commit on the hotfix branch
 *   cherry-picked — the cherry-pick commit on main
 */
export function buildCherryPickRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  // initial state on main
  writeFile(dir, 'charge.ts', `export function charge(amount: number): string {
  return 'charged';
}
`);
  add(dir, '2024-04-01T09:00:00+00:00', 'charge.ts');
  commit(dir, '2024-04-01T09:00:00+00:00', 'feat(charge): initial implementation');

  // hotfix branch
  git(['checkout', '-b', 'hotfix/double-charge'], dir, '2024-04-10T08:00:00+00:00');

  writeFile(dir, 'charge.ts', `export function charge(amount: number): string {
  if (amount <= 0) throw new Error('positive amount required');
  return 'charged';
}
`);
  add(dir, '2024-04-10T10:00:00+00:00', 'charge.ts');
  shas['original'] = commit(dir, '2024-04-10T10:00:00+00:00', 'fix(charge): guard against non-positive amounts');

  // go back to main, cherry-pick
  git(['checkout', 'main'], dir, '2024-04-11T08:00:00+00:00');
  // cherry-pick without committing so we can set the exact date
  git(['cherry-pick', '--no-commit', shas['original']!], dir, '2024-04-11T11:00:00+00:00');
  shas['cherry-picked'] = commit(
    dir,
    '2024-04-11T11:00:00+00:00',
    `fix(charge): guard against non-positive amounts\n\n(cherry picked from commit ${shas['original']})`,
  );

  return shas;
}

/**
 * COSMETIC-ONLY repo
 *
 * Scenario: a behavioral commit adds `processPayment` logic, then a
 * cosmetic commit reformats / renames a variable on the same line.
 * The engine must identify the behavioral commit as the true introduction.
 *
 * Labels:
 *   behavioral — adds processPayment with the real logic
 *   cosmetic   — whitespace-only reformat of the same file
 */
export function buildCosmeticOnlyRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  writeFile(dir, 'processor.ts', `export function processPayment(amount:number,currency:string):boolean{
if(amount<=0)return false;
if(!currency)return false;
return true;
}
`);
  add(dir, '2024-05-01T10:00:00+00:00', 'processor.ts');
  shas['behavioral'] = commit(dir, '2024-05-01T10:00:00+00:00', 'feat(processor): add processPayment');

  // cosmetic-only: reformat to style guide (same logic, just whitespace/style)
  writeFile(dir, 'processor.ts', `export function processPayment(amount: number, currency: string): boolean {
  if (amount <= 0) return false;
  if (!currency) return false;
  return true;
}
`);
  add(dir, '2024-05-05T11:00:00+00:00', 'processor.ts');
  shas['cosmetic'] = commit(dir, '2024-05-05T11:00:00+00:00', 'style(processor): format to style guide');

  return shas;
}

/**
 * MISSING-PR repo
 *
 * Scenario: a low-info "fix stuff" commit with no linked PR or issue.
 * The chain is broken and the engine must set `chainBroken = true`, usedSource =
 * 'behavioral', confidence = 'low'.
 *
 * Labels:
 *   init         — initial file creation
 *   missing-pr   — the vague commit with no PR linkage
 */
export function buildMissingPrRepo(dir: string): Record<string, string> {
  initRepo(dir);

  const shas: Record<string, string> = {};

  writeFile(dir, 'cache.ts', `export function getCache(key: string): string | null {
  return null;
}
`);
  add(dir, '2024-06-01T09:00:00+00:00', 'cache.ts');
  shas['init'] = commit(dir, '2024-06-01T09:00:00+00:00', 'chore: add cache module');

  writeFile(dir, 'cache.ts', `const store: Map<string, string> = new Map();

export function getCache(key: string): string | null {
  return store.get(key) ?? null;
}

export function setCache(key: string, value: string): void {
  store.set(key, value);
}
`);
  add(dir, '2024-06-10T15:00:00+00:00', 'cache.ts');
  shas['missing-pr'] = commit(dir, '2024-06-10T15:00:00+00:00', 'fix stuff');

  return shas;
}
