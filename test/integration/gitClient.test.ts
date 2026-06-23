/**
 * LocalGitClient against REAL git — issues #10/#11/#14.
 *
 * Builds throwaway repos with the actual `git` binary (fixed author/date for
 * determinism) and exercises lineHistory, diffOfCommit, coChangedPaths, fileChurn,
 * pickaxe, findMoveSource, parseCherryPick, isFileAddition. No mocks of git.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGitClient } from '../../src/integration/git/gitClient.js';
import { makeFixtureRepo, type FixtureRepo } from './fixtureRepo.js';

describe('LocalGitClient against real git (#10/#11/#14)', () => {
  let repo: FixtureRepo;
  let client: LocalGitClient;

  beforeEach(() => {
    repo = makeFixtureRepo();
    client = new LocalGitClient({ cwd: repo.dir });
  });

  afterEach(() => {
    repo.cleanup();
  });

  // ---------------------------------------------------------------------------
  // #10 resolveRepo
  // ---------------------------------------------------------------------------

  it('resolveRepo parses the origin remote into host/owner/name + root', async () => {
    repo.write('readme.md', 'hi');
    repo.commit('init');
    repo.setOrigin('git@github.com:acme/widgets.git');

    const ref = await client.resolveRepo(repo.dir);
    expect(ref.host).toBe('github');
    expect(ref.owner).toBe('acme');
    expect(ref.name).toBe('widgets');
    // root is the real toplevel (resolve symlinks like /private on macOS).
    expect(ref.root.endsWith(repo.dir.replace(/^\/private/, '')) || ref.root === repo.dir).toBe(
      true,
    );
    expect(ref.defaultBranch).toBe('main');
  });

  // ---------------------------------------------------------------------------
  // #10 lineHistory — walks behavioral edits + a cosmetic edit on top
  // ---------------------------------------------------------------------------

  it('lineHistory walks a line through edits, newest→oldest, with added/removed', async () => {
    repo.write('a.js', 'line1\nline2\nfunction retry(n) { return n; }\nline4\n');
    const introduced = repo.commit('feat: add retry');

    repo.write('a.js', 'line1\nline2\nfunction retry(n) { return n * 2; }\nline4\n');
    const behavioral = repo.commit('fix: double the result');

    // Cosmetic-only commit on top: add trailing whitespace to the line.
    repo.write('a.js', 'line1\nline2\nfunction retry(n) { return n * 2; }  \nline4\n');
    const cosmetic = repo.commit('style: trailing whitespace');

    const steps = await client.lineHistory('a.js', 3);
    const shas = steps.map((s) => s.sha);
    // Newest first.
    expect(shas[0]).toBe(cosmetic);
    expect(shas).toContain(behavioral);
    expect(shas).toContain(introduced);
    expect(shas.indexOf(behavioral)).toBeLessThan(shas.indexOf(introduced));

    // isCosmetic is left for the classifier (A2).
    expect(steps.every((s) => s.isCosmetic === null)).toBe(true);

    // The introducing step adds the line and removes nothing.
    const introStep = steps.find((s) => s.sha === introduced);
    expect((introStep?.added ?? []).join('')).toContain('function retry(n) { return n; }');
    expect(introStep?.removed ?? []).toHaveLength(0);

    // The behavioral step shows the before/after of the change.
    const behavioralStep = steps.find((s) => s.sha === behavioral);
    expect((behavioralStep?.added ?? []).join('')).toContain('return n * 2');
    expect((behavioralStep?.removed ?? []).join('')).toContain('return n;');
  });

  it('lineHistory follows a rename (-M) back to the original path', async () => {
    repo.write('a.js', 'alpha\nbeta\nkeyLine = compute()\ngamma\n');
    const introduced = repo.commit('feat: add keyLine');
    repo.git(['mv', 'a.js', 'b.js']);
    repo.commit('refactor: rename a.js to b.js');
    // Edit the same line AFTER the rename so we get a step in b.js too.
    repo.write('b.js', 'alpha\nbeta\nkeyLine = compute(2)\ngamma\n');
    const edited = repo.commit('fix: pass arg to compute');

    // Trace line 3 in the new path; -M must cross the rename back into a.js.
    const steps = await client.lineHistory('b.js', 3);
    const shas = steps.map((s) => s.sha);
    // The post-rename edit is attributed to b.js, the introduction back to a.js.
    expect(shas).toContain(edited);
    expect(shas).toContain(introduced);
    expect(steps.find((s) => s.sha === edited)?.path).toBe('b.js');
    expect(steps.find((s) => s.sha === introduced)?.path).toBe('a.js');
  });

  // ---------------------------------------------------------------------------
  // #11 diffOfCommit / coChangedPaths / fileChurn / getCommit
  // ---------------------------------------------------------------------------

  it('diffOfCommit returns added/removed per file and detects a rename previousPath', async () => {
    repo.write('a.js', 'one\ntwo\n');
    repo.commit('init a');
    repo.git(['mv', 'a.js', 'b.js']);
    // also append a line so the rename commit has a content change too
    repo.write('b.js', 'one\ntwo\nthree\n');
    const sha = repo.commit('refactor: rename + extend');

    const diff = await client.diffOfCommit(sha);
    expect(diff.sha).toBe(sha);
    const b = diff.files.find((f) => f.path === 'b.js');
    expect(b).toBeDefined();
    expect(b?.previousPath).toBe('a.js');
    expect(b?.added.join('')).toContain('three');
  });

  it('coChangedPaths lists every path touched by the commit', async () => {
    repo.write('x.js', 'x\n');
    repo.write('y.js', 'y\n');
    repo.write('z.js', 'z\n');
    const sha = repo.commit('feat: three files');
    const paths = await client.coChangedPaths(sha);
    expect(paths.sort()).toEqual(['x.js', 'y.js', 'z.js']);
  });

  it('fileChurn returns the commits + distinct authors for a path within the window', async () => {
    repo.write('hot.js', 'v1\n');
    repo.commit('feat: hot v1');
    repo.write('hot.js', 'v2\n');
    repo.commit('fix: hot v2');
    repo.write('cold.js', 'c\n');
    repo.commit('feat: unrelated');

    const churn = await client.fileChurn('hot.js', 3650);
    expect(churn.commits).toHaveLength(2);
    expect(churn.authors).toEqual(['Test Author']);
    // commit messages confirm only hot.js commits came back
    expect(churn.commits.map((c) => c.message)).toEqual(
      expect.arrayContaining(['feat: hot v1', 'fix: hot v2']),
    );
  });

  it('getCommit resolves a single commit and null for an unknown sha', async () => {
    repo.write('f.txt', 'data\n');
    const sha = repo.commit('feat: add f');
    const commit = await client.getCommit(sha);
    expect(commit?.sha).toBe(sha);
    expect(commit?.authorName).toBe('Test Author');
    expect(commit?.message).toBe('feat: add f');
    expect(await client.getCommit('0'.repeat(40))).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // #14 pickaxe across --all
  // ---------------------------------------------------------------------------

  it('pickaxeToken (-S) finds commits that changed a token occurrence count, newest→oldest', async () => {
    repo.write('a.js', 'noop\n');
    repo.commit('init');
    repo.write('a.js', 'noop\nconst MAGIC_TOKEN = 1\n');
    const added = repo.commit('feat: add MAGIC_TOKEN');
    repo.write('a.js', 'noop\n');
    const removed = repo.commit('chore: drop MAGIC_TOKEN');

    const hits = await client.pickaxeToken('MAGIC_TOKEN');
    const shas = hits.map((h) => h.sha);
    expect(shas).toContain(added);
    expect(shas).toContain(removed);
    // newest first
    expect(shas.indexOf(removed)).toBeLessThan(shas.indexOf(added));
    // attributes the hit to the file
    expect(hits.every((h) => h.path === 'a.js')).toBe(true);
  });

  it('pickaxeRegex (-G) matches diff content by regex', async () => {
    repo.write('a.js', 'start\n');
    repo.commit('init');
    repo.write('a.js', 'start\nretry(5)\n');
    const sha = repo.commit('feat: retry five');

    const hits = await client.pickaxeRegex('retry\\([0-9]+\\)');
    expect(hits.map((h) => h.sha)).toContain(sha);
  });

  it('pickaxe searches across all branches (--all)', async () => {
    repo.write('base.js', 'base\n');
    repo.commit('init');
    repo.git(['checkout', '-q', '-b', 'side']);
    repo.write('side.js', 'UNIQUE_ON_SIDE\n');
    const sideSha = repo.commit('feat: side only');
    repo.git(['checkout', '-q', 'main']);

    // The token only exists on the `side` branch; --all must still find it.
    const hits = await client.pickaxeToken('UNIQUE_ON_SIDE');
    expect(hits.map((h) => h.sha)).toContain(sideSha);
  });

  // ---------------------------------------------------------------------------
  // #14 findMoveSource — a logic move into a util/ file
  // ---------------------------------------------------------------------------

  it('findMoveSource detects code moved from another file in the same commit', async () => {
    const fn = 'function retry(n) { return n * 2; }';
    repo.write('caller.js', `before\n${fn}\nafter\n`);
    repo.commit('feat: inline retry');

    // Move the exact line out of caller.js into util/retry.js in ONE commit.
    repo.write('caller.js', 'before\nafter\n');
    repo.write('util/retry.js', `${fn}\n`);
    const moveSha = repo.commit('refactor: extract retry to util');

    const source = await client.findMoveSource(moveSha, 'util/retry.js', [fn]);
    expect(source).not.toBeNull();
    expect(source?.sha).toBe(moveSha);
    expect(source?.path).toBe('caller.js');
  });

  it('findMoveSource returns the previousPath for a git-detected rename', async () => {
    repo.write('old.js', 'payload-aaa\npayload-bbb\npayload-ccc\n');
    repo.commit('init');
    repo.git(['mv', 'old.js', 'new.js']);
    const sha = repo.commit('refactor: rename');

    const source = await client.findMoveSource(sha, 'new.js', ['payload-aaa']);
    expect(source?.path).toBe('old.js');
  });

  it('findMoveSource returns null when there is no matching deletion', async () => {
    repo.write('only.js', 'unique-content-xyz\n');
    const sha = repo.commit('feat: standalone add');
    const source = await client.findMoveSource(sha, 'only.js', ['unique-content-xyz']);
    expect(source).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // #14 parseCherryPick + isFileAddition
  // ---------------------------------------------------------------------------

  it('parseCherryPick reads the (cherry picked from commit <sha>) trailer', async () => {
    repo.write('base.txt', 'base\n');
    repo.commit('init');
    repo.git(['checkout', '-q', '-b', 'feature']);
    repo.write('feat.txt', 'feature\n');
    const srcSha = repo.commit('feat: add feat.txt');
    repo.git(['checkout', '-q', 'main']);
    // -x records the source sha in the message.
    repo.git(['cherry-pick', '-x', srcSha], {
      GIT_AUTHOR_DATE: '2024-02-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2024-02-01T00:00:00Z',
    });
    const picked = repo.git(['rev-parse', 'HEAD']);

    const parsed = await client.parseCherryPick(picked);
    // The trailer records the full source sha; our srcSha is the full HEAD sha.
    expect(srcSha.startsWith(parsed ?? 'nope')).toBe(true);
  });

  it('parseCherryPick returns null when there is no trailer', async () => {
    repo.write('a.txt', 'a\n');
    const sha = repo.commit('feat: plain commit');
    expect(await client.parseCherryPick(sha)).toBeNull();
  });

  it('isFileAddition is true only for the commit that added the file', async () => {
    repo.write('added.js', 'one\n');
    const addSha = repo.commit('feat: add added.js');
    repo.write('added.js', 'one\ntwo\n');
    const editSha = repo.commit('fix: edit added.js');

    expect(await client.isFileAddition(addSha, 'added.js')).toBe(true);
    expect(await client.isFileAddition(editSha, 'added.js')).toBe(false);
  });

  it('lineHistory returns [] for a path/line that has no history', async () => {
    repo.write('real.js', 'x\n');
    repo.commit('init');
    expect(await client.lineHistory('ghost.js', 1)).toEqual([]);
  });
});
