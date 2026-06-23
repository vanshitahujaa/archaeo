/**
 * GitClient interface — implement.md Part C.3, extended with the cross-file / chain
 * primitives from D.4–D.5 that issue #25 must deliver and the Tracer (#41/#43) depends on.
 *
 * Defining these primitives in the Lead-owned contract up front (rather than as a later
 * `contract` issue) keeps parallel Tracer/Connector work unblocked. See DECISIONS.md D-004.
 *
 * OWNED BY LEAD.
 */

import type { Commit, RepoRef } from './types.js';

/** One step in a line's history. `isCosmetic: null` = not yet classified. */
export interface LineHistoryStep {
  sha: string;
  path: string;
  isCosmetic: boolean | null;
  /** The added line content at this step, when available (used by the classifier). */
  added?: string[];
  removed?: string[];
}

export interface CommitDiffFile {
  path: string;
  /** Path before a rename, when this file was renamed in the commit. */
  previousPath?: string;
  added: string[];
  removed: string[];
}

export interface CommitDiff {
  sha: string;
  files: CommitDiffFile[];
}

/** A commit found by pickaxe (`-S`/`-G`) that touched a token, with the matching file. */
export interface PickaxeHit {
  sha: string;
  path: string;
  authoredAt: string;
}

/** Detected source of a moved/copied region (the other side of a rename/move). */
export interface MoveSource {
  sha: string;
  path: string;
}

export interface GitClient {
  resolveRepo(cwd: string): Promise<RepoRef>;

  /**
   * Blame the current line, then walk its history through moves/renames via
   * `git log -L<start>,<end>:<path>` with `-M -C`. Ordered newest → oldest.
   */
  lineHistory(path: string, line: number): Promise<LineHistoryStep[]>;

  diffOfCommit(sha: string): Promise<CommitDiff>;
  coChangedPaths(sha: string): Promise<string[]>;
  fileChurn(path: string, sinceDays: number): Promise<{ commits: Commit[]; authors: string[] }>;

  /** Resolve a single commit's metadata. */
  getCommit(sha: string): Promise<Commit | null>;

  // --- cross-file origin + chain-break primitives (D.4/D.5, issue #25) ---

  /** Pickaxe by occurrence-count change: `git log -S'<token>' --all`. */
  pickaxeToken(token: string, path?: string): Promise<PickaxeHit[]>;

  /** Pickaxe by diff content regex: `git log -G'<regex>' --all`. */
  pickaxeRegex(regex: string, path?: string): Promise<PickaxeHit[]>;

  /**
   * Given the "file-introduction wall" commit and the path/lines added there, look for a
   * matching deletion elsewhere in the same commit (a move). Returns the source side.
   */
  findMoveSource(sha: string, path: string, addedLines: string[]): Promise<MoveSource | null>;

  /** Parse `(cherry picked from commit <sha>)` from a commit message. Returns the source sha. */
  parseCherryPick(sha: string): Promise<string | null>;

  /** True when the file itself was added in this commit (an introduction wall). */
  isFileAddition(sha: string, path: string): Promise<boolean>;
}
