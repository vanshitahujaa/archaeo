/**
 * LocalGitClient — A3 (Connector), issues #10/#11/#14.
 *
 * Implements the local-git provenance primitives via `git` plumbing:
 *  - #10 resolveRepo (parse remote → host/owner/name) + lineHistory (`git log -L`)
 *  - #11 diffOfCommit, coChangedPaths, fileChurn
 *  - #14 cross-file/chain primitives: pickaxeToken (-S), pickaxeRegex (-G),
 *        findMoveSource, parseCherryPick, isFileAddition
 *
 * All git output is parsed deterministically. We use NUL/record separators where
 * possible so paths with spaces survive intact.
 */

import type {
  Commit,
  CommitDiff,
  CommitDiffFile,
  GitClient,
  LineHistoryStep,
  MoveSource,
  PickaxeHit,
  RepoRef,
} from '../../core/index.js';
import { ArchaeoError } from '../../core/index.js';
import { detectRemote } from '../hosts/detect.js';
import { git, gitSafe } from './run.js';

export interface GitClientOptions {
  /** Absolute path to the repo working tree. */
  cwd: string;
}

/** A field-delimited pretty format → Commit. Uses ASCII unit/record separators. */
const FIELD = '\x1f'; // unit separator between fields
const RECORD = '\x1e'; // record separator between commits
const COMMIT_FORMAT = `%H${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%B${RECORD}`;

function parseCommits(stdout: string): Commit[] {
  return stdout
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.trim().length > 0)
    .map((record) => {
      const [sha, authorName, authorEmail, authoredAt, ...rest] = record.split(FIELD);
      const message = rest.join(FIELD).trim();
      return {
        sha: (sha ?? '').trim(),
        // authorLogin is a host concept; locally we approximate it from the email local-part.
        authorLogin: loginFromEmail(authorEmail ?? ''),
        authorName: (authorName ?? '').trim(),
        authoredAt: (authoredAt ?? '').trim(),
        message,
      } satisfies Commit;
    })
    .filter((c) => c.sha.length > 0);
}

function loginFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return '';
  // GitHub noreply: 12345+login@users.noreply.github.com → login
  const noreply = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(trimmed);
  if (noreply) return noreply[1] as string;
  const at = trimmed.indexOf('@');
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

export class LocalGitClient implements GitClient {
  constructor(private readonly opts: GitClientOptions) {}

  private get cwd(): string {
    return this.opts.cwd;
  }

  // ---------------------------------------------------------------------------
  // #10 resolveRepo
  // ---------------------------------------------------------------------------

  async resolveRepo(cwd: string): Promise<RepoRef> {
    const root = await gitSafe(['rev-parse', '--show-toplevel'], { cwd });
    if (!root) {
      throw new ArchaeoError(`Not a git repository: ${cwd}`, {
        hint: 'Run archaeo from inside a git working tree.',
      });
    }

    // Prefer origin; fall back to the first configured remote.
    let remoteUrl = await gitSafe(['remote', 'get-url', 'origin'], { cwd: root });
    if (!remoteUrl) {
      const remotes = (await gitSafe(['remote'], { cwd: root }))
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      if (remotes.length > 0) {
        remoteUrl = await gitSafe(['remote', 'get-url', remotes[0] as string], { cwd: root });
      }
    }
    if (!remoteUrl) {
      throw new ArchaeoError('Repository has no remote to resolve host/owner/name from', {
        hint: 'Add a remote: `git remote add origin git@github.com:owner/name.git`',
      });
    }

    const { host, owner, name } = detectRemote(remoteUrl);
    const defaultBranch = await this.resolveDefaultBranch(root);

    return { host, owner, name, root, defaultBranch };
  }

  private async resolveDefaultBranch(root: string): Promise<string> {
    // origin/HEAD points at the default branch when set.
    const symbolic = await gitSafe(
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      { cwd: root },
    );
    if (symbolic) {
      const slash = symbolic.indexOf('/');
      return slash >= 0 ? symbolic.slice(slash + 1) : symbolic;
    }
    // Fall back to the current branch, then to 'main'.
    const current = await gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
    if (current && current !== 'HEAD') return current;
    return 'main';
  }

  // ---------------------------------------------------------------------------
  // #10 lineHistory — `git log -L<start>,<end>:<path>` with -M -C
  // ---------------------------------------------------------------------------

  async lineHistory(path: string, line: number): Promise<LineHistoryStep[]> {
    if (line < 1) {
      throw new ArchaeoError(`Invalid line number: ${line}`, {
        hint: 'Line numbers are 1-based.',
      });
    }
    // -L<line>,<line> traces a single line; -M -C follow renames/copies.
    // We embed our own record/field separators in the pretty header so each
    // commit's hunk block is self-delimiting and survives multi-line diffs.
    const header = `${RECORD}%H${FIELD}`;
    let stdout = '';
    try {
      const res = await git(
        ['log', `-L${line},${line}:${path}`, '-M', '-C', `--format=${header}`],
        { cwd: this.cwd },
      );
      stdout = res.stdout;
    } catch {
      // -L fails if the path/line doesn't exist in history; surface as empty lineage.
      return [];
    }

    const steps: LineHistoryStep[] = [];
    const blocks = stdout.split(RECORD).filter((b) => b.trim().length > 0);
    for (const block of blocks) {
      // Block layout: <sha>\x1f<rest including diff>
      const sep = block.indexOf(FIELD);
      if (sep < 0) continue;
      const sha = block.slice(0, sep).trim();
      const rest = block.slice(sep + 1);
      const { added, removed, path: stepPath } = parseUnifiedHunk(rest, path);
      steps.push({
        sha,
        path: stepPath,
        isCosmetic: null, // classification is A2's job
        added,
        removed,
      });
    }
    return steps; // already newest → oldest (git log default order)
  }

  // ---------------------------------------------------------------------------
  // #11 diffOfCommit
  // ---------------------------------------------------------------------------

  async diffOfCommit(sha: string): Promise<CommitDiff> {
    // -m expands merges; --first-parent keeps a single side for merge commits so the
    // diff reflects what landed on the branch. Rename detection via -M -C.
    let stdout = '';
    try {
      const res = await git(
        [
          'show',
          sha,
          '--first-parent',
          '-M',
          '-C',
          '--format=',
          '--unified=0',
          '--no-color',
        ],
        { cwd: this.cwd, maxBuffer: 128 * 1024 * 1024 },
      );
      stdout = res.stdout;
    } catch {
      return { sha, files: [] };
    }
    return { sha, files: parseDiffFiles(stdout) };
  }

  // ---------------------------------------------------------------------------
  // #11 coChangedPaths
  // ---------------------------------------------------------------------------

  async coChangedPaths(sha: string): Promise<string[]> {
    const out = await gitSafe(
      ['show', sha, '--first-parent', '-M', '-C', '--name-only', '--format=', '--no-color'],
      { cwd: this.cwd },
    );
    const seen = new Set<string>();
    for (const raw of out.split('\n')) {
      const p = raw.trim();
      if (p) seen.add(p);
    }
    return [...seen];
  }

  // ---------------------------------------------------------------------------
  // #11 fileChurn
  // ---------------------------------------------------------------------------

  async fileChurn(
    path: string,
    sinceDays: number,
  ): Promise<{ commits: Commit[]; authors: string[] }> {
    const since = `${Math.max(0, Math.floor(sinceDays))}.days.ago`;
    const out = await gitSafe(
      [
        'log',
        `--since=${since}`,
        '--follow',
        '-M',
        `--format=${COMMIT_FORMAT}`,
        '--',
        path,
      ],
      { cwd: this.cwd },
    );
    const commits = parseCommits(out);
    const authors = [...new Set(commits.map((c) => c.authorName).filter(Boolean))];
    return { commits, authors };
  }

  // ---------------------------------------------------------------------------
  // #11 getCommit
  // ---------------------------------------------------------------------------

  async getCommit(sha: string): Promise<Commit | null> {
    const out = await gitSafe(
      ['show', '-s', `--format=${COMMIT_FORMAT}`, sha],
      { cwd: this.cwd },
    );
    const commits = parseCommits(out);
    return commits[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // #14 pickaxeToken — `git log -S'<token>' --all`
  // ---------------------------------------------------------------------------

  async pickaxeToken(token: string, path?: string): Promise<PickaxeHit[]> {
    return this.pickaxe(['-S', token], path);
  }

  // ---------------------------------------------------------------------------
  // #14 pickaxeRegex — `git log -G'<regex>' --all`
  // ---------------------------------------------------------------------------

  async pickaxeRegex(regex: string, path?: string): Promise<PickaxeHit[]> {
    // `-G` already interprets its argument as a regex; `--pickaxe-regex` only applies
    // to `-S` and git rejects the two together.
    return this.pickaxe(['-G', regex], path);
  }

  /**
   * Shared pickaxe runner. Uses `--name-only` so we can attribute each hit to the
   * file(s) it touched. `--all` searches every ref so we find code that has since
   * moved branches. Ordered newest → oldest; callers usually want the oldest (origin).
   */
  private async pickaxe(searchArgs: string[], path?: string): Promise<PickaxeHit[]> {
    const args = [
      'log',
      '--all',
      '-M',
      '-C',
      ...searchArgs,
      `--format=${RECORD}%H${FIELD}%aI`,
      '--name-only',
    ];
    if (path) args.push('--', path);

    const out = await gitSafe(args, { cwd: this.cwd, maxBuffer: 128 * 1024 * 1024 });
    const hits: PickaxeHit[] = [];
    for (const block of out.split(RECORD)) {
      const trimmed = block.replace(/^\n/, '');
      if (!trimmed.trim()) continue;
      const lines = trimmed.split('\n');
      const headerLine = lines.shift() ?? '';
      const [sha, authoredAt] = headerLine.split(FIELD);
      if (!sha) continue;
      const files = lines.map((l) => l.trim()).filter(Boolean);
      if (files.length === 0) {
        // No path attribution available; still record the commit.
        hits.push({ sha: sha.trim(), path: path ?? '', authoredAt: (authoredAt ?? '').trim() });
        continue;
      }
      for (const file of files) {
        hits.push({ sha: sha.trim(), path: file, authoredAt: (authoredAt ?? '').trim() });
      }
    }
    return hits;
  }

  // ---------------------------------------------------------------------------
  // #14 findMoveSource — matching deletion elsewhere in the same commit = a move
  // ---------------------------------------------------------------------------

  async findMoveSource(
    sha: string,
    path: string,
    addedLines: string[],
  ): Promise<MoveSource | null> {
    const diff = await this.diffOfCommit(sha);

    // 1) An explicit rename recorded by git: the file we landed in has a previousPath.
    const renamed = diff.files.find((f) => f.path === path && f.previousPath);
    if (renamed?.previousPath) {
      return { sha, path: renamed.previousPath };
    }

    // 2) A content move: the same lines that were ADDED to `path` were REMOVED from
    //    another file in this very commit. Match on non-trivial added content.
    const targets = normalizeForMatch(addedLines);
    if (targets.length === 0) return null;
    const targetSet = new Set(targets);

    let best: { path: string; overlap: number } | null = null;
    for (const file of diff.files) {
      if (file.path === path) continue;
      const removed = normalizeForMatch(file.removed);
      if (removed.length === 0) continue;
      let overlap = 0;
      for (const r of removed) {
        if (targetSet.has(r)) overlap += 1;
      }
      if (overlap > 0 && (!best || overlap > best.overlap)) {
        best = { path: file.previousPath ?? file.path, overlap };
      }
    }

    // Require a majority of the added lines to be accounted for as a move.
    if (best && best.overlap >= Math.ceil(targets.length / 2)) {
      return { sha, path: best.path };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // #14 parseCherryPick — `(cherry picked from commit <sha>)`
  // ---------------------------------------------------------------------------

  async parseCherryPick(sha: string): Promise<string | null> {
    const commit = await this.getCommit(sha);
    if (!commit) return null;
    return parseCherryPickFromMessage(commit.message);
  }

  // ---------------------------------------------------------------------------
  // #14 isFileAddition — was `path` itself added in this commit?
  // ---------------------------------------------------------------------------

  async isFileAddition(sha: string, path: string): Promise<boolean> {
    // --diff-filter=A lists only files added in this commit. --name-only for paths.
    const out = await gitSafe(
      [
        'show',
        sha,
        '--first-parent',
        '--diff-filter=A',
        '--name-only',
        '--format=',
        '--no-color',
      ],
      { cwd: this.cwd },
    );
    const added = new Set(out.split('\n').map((l) => l.trim()).filter(Boolean));
    return added.has(path);
  }
}

// =============================================================================
// Pure parsing helpers (exported for unit testing)
// =============================================================================

/** Parse `(cherry picked from commit <sha>)` from a commit message. */
export function parseCherryPickFromMessage(message: string): string | null {
  const m = /\(cherry picked from commit ([0-9a-f]{7,40})\)/i.exec(message);
  return m ? (m[1] as string) : null;
}

/** Normalize lines for move/content matching: trim, drop blanks. */
function normalizeForMatch(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

/**
 * Parse a `git log -L` block's unified diff into added/removed line content and the
 * file path of this step. `-L` emits a `diff --git`/`--- a/`/`+++ b/` header plus
 * one or more `@@ ... @@` hunks; we collect `+`/`-` body lines (excluding headers).
 */
export function parseUnifiedHunk(
  block: string,
  fallbackPath: string,
): { added: string[]; removed: string[]; path: string } {
  const added: string[] = [];
  const removed: string[] = [];
  let path = fallbackPath;
  let inHunk = false;

  for (const line of block.split('\n')) {
    if (line.startsWith('+++ b/')) {
      path = line.slice('+++ b/'.length).trim();
      continue;
    }
    if (line.startsWith('--- a/') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      added.push(line.slice(1));
    } else if (line.startsWith('-')) {
      removed.push(line.slice(1));
    }
  }
  return { added, removed, path };
}

/**
 * Parse `git show --unified=0` output into per-file added/removed lines, handling
 * renames (`rename from`/`rename to`). One `CommitDiffFile` per touched file.
 */
export function parseDiffFiles(stdout: string): CommitDiffFile[] {
  const files: CommitDiffFile[] = [];
  let current: CommitDiffFile | null = null;
  let pendingRenameFrom: string | null = null;
  let inHunk = false;

  const push = (): void => {
    if (current) files.push(current);
  };

  for (const line of stdout.split('\n')) {
    if (line.startsWith('diff --git ')) {
      push();
      // `diff --git a/<path> b/<path>` — derive path from the b-side, refined below.
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      const bPath = m ? (m[2] as string) : '';
      current = { path: bPath, added: [], removed: [] };
      pendingRenameFrom = null;
      inHunk = false;
      continue;
    }
    if (!current) continue;

    if (line.startsWith('rename from ')) {
      pendingRenameFrom = line.slice('rename from '.length).trim();
      current.previousPath = pendingRenameFrom;
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.path = line.slice('rename to '.length).trim();
      continue;
    }
    if (line.startsWith('copy from ')) {
      current.previousPath = line.slice('copy from '.length).trim();
      continue;
    }
    if (line.startsWith('copy to ')) {
      current.path = line.slice('copy to '.length).trim();
      continue;
    }
    if (line.startsWith('+++ b/')) {
      const p = line.slice('+++ b/'.length).trim();
      if (p && p !== '/dev/null') current.path = p;
      continue;
    }
    if (line.startsWith('--- ')) {
      // a-side header — path is taken from the b-side / rename lines instead.
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') || line.startsWith('new mode') || line.startsWith('similarity ') || line.startsWith('dissimilarity ')) {
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      current.added.push(line.slice(1));
    } else if (line.startsWith('-')) {
      current.removed.push(line.slice(1));
    }
  }
  push();
  return files;
}

// ---------------------------------------------------------------------------
// Clone health (#47) — partial/shallow clones make `-L`/pickaxe fetch blobs over the
// network on demand, which is pathologically slow on deep histories. Detect it so the CLI
// can warn the user instead of leaving them staring at a hang.
// ---------------------------------------------------------------------------

export interface CloneHealth {
  /** A partial clone (e.g. `--filter=blob:none`) — blobs fetched lazily over the network. */
  partial: boolean;
  /** A shallow clone (`--depth`) — history is truncated, so provenance is incomplete. */
  shallow: boolean;
}

export async function detectCloneHealth(cwd: string): Promise<CloneHealth> {
  const shallow = (await gitSafe(['rev-parse', '--is-shallow-repository'], { cwd })) === 'true';
  const filter = await gitSafe(['config', '--get', 'remote.origin.partialclonefilter'], { cwd });
  const promisor = await gitSafe(['config', '--get', 'remote.origin.promisor'], { cwd });
  return { partial: filter.length > 0 || promisor === 'true', shallow };
}

/** A one-line user warning for an unhealthy clone, or null when the clone is full. */
export function cloneHealthWarning(h: CloneHealth): string | null {
  if (h.shallow) {
    return 'warning: shallow clone detected — provenance history is truncated and may be incomplete. Run `git fetch --unshallow` for accurate results.';
  }
  if (h.partial) {
    return 'warning: partial (blobless) clone detected — history blobs are fetched over the network on demand, which can make tracing very slow on large repos. A full clone is much faster.';
  }
  return null;
}
