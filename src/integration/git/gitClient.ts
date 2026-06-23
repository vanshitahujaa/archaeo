/**
 * GitClient — A3 (Connector), issues #20/#21/#25. PHASE 0 STUB.
 * Implements the local-git provenance primitives via `git` plumbing.
 */

import type {
  Commit,
  CommitDiff,
  GitClient,
  LineHistoryStep,
  MoveSource,
  PickaxeHit,
  RepoRef,
} from '../../core/index.js';
import { NotImplemented } from '../../core/index.js';

export interface GitClientOptions {
  /** Absolute path to the repo working tree. */
  cwd: string;
}

export class LocalGitClient implements GitClient {
  constructor(private readonly opts: GitClientOptions) {
    void this.opts;
  }

  resolveRepo(_cwd: string): Promise<RepoRef> {
    throw new NotImplemented('LocalGitClient.resolveRepo (#20)');
  }
  lineHistory(_path: string, _line: number): Promise<LineHistoryStep[]> {
    throw new NotImplemented('LocalGitClient.lineHistory (#20)');
  }
  diffOfCommit(_sha: string): Promise<CommitDiff> {
    throw new NotImplemented('LocalGitClient.diffOfCommit (#21)');
  }
  coChangedPaths(_sha: string): Promise<string[]> {
    throw new NotImplemented('LocalGitClient.coChangedPaths (#21)');
  }
  fileChurn(
    _path: string,
    _sinceDays: number,
  ): Promise<{ commits: Commit[]; authors: string[] }> {
    throw new NotImplemented('LocalGitClient.fileChurn (#21)');
  }
  getCommit(_sha: string): Promise<Commit | null> {
    throw new NotImplemented('LocalGitClient.getCommit (#21)');
  }
  pickaxeToken(_token: string, _path?: string): Promise<PickaxeHit[]> {
    throw new NotImplemented('LocalGitClient.pickaxeToken (#25)');
  }
  pickaxeRegex(_regex: string, _path?: string): Promise<PickaxeHit[]> {
    throw new NotImplemented('LocalGitClient.pickaxeRegex (#25)');
  }
  findMoveSource(
    _sha: string,
    _path: string,
    _addedLines: string[],
  ): Promise<MoveSource | null> {
    throw new NotImplemented('LocalGitClient.findMoveSource (#25)');
  }
  parseCherryPick(_sha: string): Promise<string | null> {
    throw new NotImplemented('LocalGitClient.parseCherryPick (#25)');
  }
  isFileAddition(_sha: string, _path: string): Promise<boolean> {
    throw new NotImplemented('LocalGitClient.isFileAddition (#25)');
  }
}
