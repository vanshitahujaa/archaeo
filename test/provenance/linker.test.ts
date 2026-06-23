/**
 * Evidence linker + chain recovery tests — #23 / Part D.4.
 *
 * Uses recorded host responses (loadHostResponses) via a small in-test HostClient, a REAL
 * LocalGitClient over a fixture repo, and a REAL in-memory SqliteStore. Covers:
 *  - squash recovery (PR maps to >1 commits; flagged as a boundary, chain intact)
 *  - cherry-pick recovery (broken chain recovered via the cherry-pick trailer)
 *  - missing-PR (chain broken → behavioral source)
 *  - the source ladder (review chosen when a substantive comment exists)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildCherryPickRepo,
  buildSquashRepo,
  buildMissingPrRepo,
} from '../fixtures/buildRepo.js';
import { loadHostResponses } from '../fixtures/loadHostResponses.js';
import { LocalGitClient } from '../../src/integration/git/gitClient.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';
import { EvidenceLinker, isLowInformationMessage } from '../../src/provenance/linker.js';
import type { Commit, HostClient, Issue, PullRequest, ReviewComment } from '../../src/core/index.js';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-linker-'));
  dirs.push(d);
  return d;
}
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** In-test HostClient backed by the recorded responses. */
function recordedHost(shas: Record<string, string>): HostClient {
  const hr = loadHostResponses(shas);
  return {
    async prForCommit(sha: string): Promise<PullRequest | null> {
      return hr.prForCommit(sha);
    },
    async issuesReferencedByPr(pr: PullRequest): Promise<Issue[]> {
      return hr.issuesReferencedByPr(pr.number);
    },
    async reviewComments(prNumber: number): Promise<ReviewComment[]> {
      return hr.reviewComments(prNumber);
    },
    async prCommits(prNumber: number): Promise<Commit[]> {
      return hr.prCommits(prNumber);
    },
  };
}

async function newStore(): Promise<SqliteStore> {
  const store = new SqliteStore({ dbPath: ':memory:' });
  await store.init();
  return store;
}

describe('EvidenceLinker (D.4)', () => {
  it('SQUASH: recovers PR + issue + review, flags the squash boundary, caches the PR', async () => {
    const dir = tmp();
    const shas = buildSquashRepo(dir);
    const git = new LocalGitClient({ cwd: dir });
    const store = await newStore();
    const linker = new EvidenceLinker(git, recordedHost(shas), store, 'test/repo');

    const linked = await linker.link(shas.squash as string);

    expect(linked.introducingPr?.number).toBe(42);
    expect(linked.linkedIssue?.number).toBe(17);
    expect(linked.chainBroken).toBe(false);
    expect(linked.recoveredViaBoundary).toBe(true); // squash collapsed 2 commits
    expect(linked.notes.join(' ')).toMatch(/squash-merge detected/);
    // top review comment is the substantive one (priya), not a bot/nit
    expect(linked.reviewComments[0]?.author).toBe('priya');
    expect(linked.usedSource).toBe('review');
    // PR was cached in the store
    const cachedPr = await store.getPr('test/repo', 42);
    expect(cachedPr?.number).toBe(42);
    await store.close();
  });

  it('CHERRY-PICK: recovers a broken chain via the cherry-pick trailer', async () => {
    const dir = tmp();
    const shas = buildCherryPickRepo(dir);
    const git = new LocalGitClient({ cwd: dir });
    const store = await newStore();
    const linker = new EvidenceLinker(git, recordedHost(shas), store, 'test/repo');

    // The cherry-pick commit on main: prForCommit returns the PR (recorded), but the proof
    // of recovery is following the trailer to the original SHA.
    const linked = await linker.link(shas['cherry-picked'] as string);

    expect(linked.introducingPr?.number).toBe(55);
    expect(linked.linkedIssue?.number).toBe(23);
    expect(linked.chainBroken).toBe(false);
    expect(linked.recoveredViaBoundary).toBe(true);
    expect(linked.resolvedSha).toBe(shas.original);
    expect(linked.notes.join(' ')).toMatch(/cherry-pick/);
    await store.close();
  });

  it('MISSING-PR: no PR → chainBroken, behavioral source', async () => {
    const dir = tmp();
    const shas = buildMissingPrRepo(dir);
    const git = new LocalGitClient({ cwd: dir });
    const store = await newStore();
    const linker = new EvidenceLinker(git, recordedHost(shas), store, 'test/repo');

    const linked = await linker.link(shas['missing-pr'] as string);

    expect(linked.introducingPr).toBeUndefined();
    expect(linked.chainBroken).toBe(true);
    expect(linked.usedSource).toBe('behavioral'); // "fix stuff" is low-information
    await store.close();
  });
});

describe('isLowInformationMessage', () => {
  it.each([
    ['fix stuff', true],
    ['update', true],
    ['wip', true],
    ['feat(auth): prevent duplicate sessions', false],
    ['Add idempotency key to prevent double charges', false],
  ])('%s → %s', (msg, expected) => {
    expect(isLowInformationMessage(msg)).toBe(expected);
  });
});
