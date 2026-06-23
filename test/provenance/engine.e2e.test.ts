/**
 * REAL end-to-end engine test — #27 / Part D. THE MOAT PROOF.
 *
 * Builds fixture repos in temp dirs, constructs a REAL LocalGitClient over each + a REAL
 * SqliteStore(':memory:'), runs Engine.explainLine, and asserts against groundTruth.ts.
 *
 * The headline assertion: for MOVE-TO-UTILITY, the cross-file stitch must find the ORIGIN in
 * the OLD file (service.ts), not the move commit — i.e. candidates[0] is the 'introduce'
 * commit, recovered by crossing the move boundary via pickaxe. This is not faked.
 *
 * Also covers: cosmetic-only (skip past the cosmetic commit), missing-PR (chainBroken/LOW),
 * a warm-cache hit on the 2nd call, and explainCommit + the squash/cherry recoveries.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildCherryPickRepo,
  buildCosmeticOnlyRepo,
  buildMissingPrRepo,
  buildMoveToUtilityRepo,
  buildSquashRepo,
} from '../fixtures/buildRepo.js';
import { getGroundTruth } from '../fixtures/groundTruth.js';
import { loadHostResponses } from '../fixtures/loadHostResponses.js';
import { LocalGitClient } from '../../src/integration/git/gitClient.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';
import { Engine, lineHash } from '../../src/provenance/engine.js';
import type { Commit, HostClient, Issue, PullRequest, ReviewComment } from '../../src/core/index.js';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-e2e-'));
  dirs.push(d);
  return d;
}
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

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

interface Built {
  shas: Record<string, string>;
  git: LocalGitClient;
  store: SqliteStore;
  engine: Engine;
}

async function build(
  builder: (d: string) => Record<string, string>,
  repo = 'test/repo',
): Promise<Built> {
  const dir = tmp();
  const shas = builder(dir);
  const git = new LocalGitClient({ cwd: dir });
  const store = new SqliteStore({ dbPath: ':memory:' });
  await store.init();
  const engine = new Engine({ git, host: recordedHost(shas), store, repo });
  return { shas, git, store, engine };
}

describe('Engine.explainLine — REAL git + REAL store (the moat)', () => {
  it('MOVE-TO-UTILITY: cross-file stitch finds the ORIGIN in the old file (not the move)', async () => {
    const { shas, store, engine } = await build(buildMoveToUtilityRepo);
    const gt = getGroundTruth('move-to-utility', 'util/retry.ts', 1)!;

    const bundle = await engine.explainLine('util/retry.ts', 1);

    const introduceSha = shas[gt.introducingLabel]; // service.ts origin
    const moveSha = shas['move'];

    // THE STITCH: the origin commit (in the OLD file) is present and ranked first.
    expect(bundle.candidates.length).toBeGreaterThan(0);
    expect(bundle.candidates[0]?.commit.sha).toBe(introduceSha);
    expect(bundle.candidates[0]?.commit.sha).not.toBe(moveSha);

    // Lineage shows the move too, oldest-first, matching ground truth labels.
    const lineageShas = bundle.lineage.map((c) => c.sha);
    expect(lineageShas[0]).toBe(introduceSha);
    expect(lineageShas).toContain(moveSha);

    // Honest reporting: no PR in this synthetic repo → behavioral, chainBroken, LOW.
    expect(bundle.chainBroken).toBe(gt.chainBroken); // true
    expect(bundle.usedSource).toBe(gt.expectedUsedSource); // behavioral
    expect(bundle.confidence).toBe(gt.expectedConfidence); // low
    // behavioral evidence carried the introducing diff (co-changed service.ts).
    expect(bundle.behavioral.summaryHints).toContain('added retry logic');
    await store.close();
  });

  it('COSMETIC-ONLY: skips past the cosmetic commit to the behavioral origin', async () => {
    const { shas, store, engine } = await build(buildCosmeticOnlyRepo);
    const gt = getGroundTruth('cosmetic-only', 'processor.ts', 2)!;

    const bundle = await engine.explainLine('processor.ts', 2);

    const behavioralSha = shas[gt.introducingLabel];
    const cosmeticSha = shas['cosmetic'];

    // The behavioral commit is the introducing one; the cosmetic reformat is NOT a candidate.
    expect(bundle.candidates[0]?.commit.sha).toBe(behavioralSha);
    expect(bundle.candidates.map((c) => c.commit.sha)).not.toContain(cosmeticSha);
    expect(bundle.confidence).toBe(gt.expectedConfidence); // low (no PR)
    await store.close();
  });

  it('MISSING-PR: chain broken → LOW confidence, behavioral source', async () => {
    const { shas, store, engine } = await build(buildMissingPrRepo);
    const gt = getGroundTruth('missing-pr', 'cache.ts', 4)!;

    const bundle = await engine.explainLine('cache.ts', 4);

    expect(bundle.primary?.commit.sha ?? bundle.candidates[0]?.commit.sha).toBe(
      shas[gt.introducingLabel],
    );
    expect(bundle.chainBroken).toBe(true);
    expect(bundle.usedSource).toBe('behavioral');
    expect(bundle.confidence).toBe('low');
    expect(bundle.introducingPr).toBeUndefined();
    expect(bundle.confidenceReasons.length).toBeGreaterThan(0);
    await store.close();
  });

  it('SQUASH: surfaces the squash commit, recovers PR #42 + issue #17 + review, MEDIUM', async () => {
    const { shas, store, engine } = await build(buildSquashRepo);
    const bundle = await engine.explainLine('payments.ts', 2);

    expect(bundle.primary?.commit.sha).toBe(shas['squash']);
    expect(bundle.introducingPr?.number).toBe(42);
    expect(bundle.linkedIssue?.number).toBe(17);
    expect(bundle.reviewComments[0]?.author).toBe('priya');
    expect(bundle.chainBroken).toBe(false);
    expect(bundle.confidence).toBe('medium');
    await store.close();
  });

  it('CHERRY-PICK: recovers original PR #55 via the trailer, MEDIUM', async () => {
    const { shas, store, engine } = await build(buildCherryPickRepo);
    const bundle = await engine.explainLine('charge.ts', 2);

    expect(bundle.primary?.commit.sha).toBe(shas['cherry-picked']);
    expect(bundle.introducingPr?.number).toBe(55);
    expect(bundle.linkedIssue?.number).toBe(23);
    expect(bundle.chainBroken).toBe(false);
    expect(bundle.confidence).toBe('medium');
    await store.close();
  });

  it('WARM CACHE: a 2nd explainLine hits the provenance cache (same line hash)', async () => {
    const { store, engine } = await build(buildMoveToUtilityRepo);

    const first = await engine.explainLine('util/retry.ts', 1);
    // The first run wrote a cache entry keyed by the line-content hash.
    const key = lineHash(first.lineage.length ? 'export function retry(fn: () => void, times: number): void {' : 'x');
    const cached = await store.getLineProvenance('test/repo', 'util/retry.ts', key);
    expect(cached).not.toBeNull();
    expect(cached?.confidence).toBe(first.confidence);

    // A 2nd identical query is consistent with the first (and the cache is warm).
    const second = await engine.explainLine('util/retry.ts', 1);
    expect(second.candidates[0]?.commit.sha).toBe(first.candidates[0]?.commit.sha);
    expect(second.confidence).toBe(first.confidence);
    await store.close();
  });
});

describe('Engine.explainCommit (D.9)', () => {
  it('explains the squash commit: PR, issue, files touched, risk hint', async () => {
    const { shas, store, engine } = await build(buildSquashRepo);
    const exp = await engine.explainCommit(shas['squash'] as string);
    expect(exp.commit.sha).toBe(shas['squash']);
    expect(exp.pr?.number).toBe(42);
    expect(exp.linkedIssue?.number).toBe(17);
    expect(exp.filesTouched).toBeGreaterThanOrEqual(1);
    expect(['low', 'medium', 'high']).toContain(exp.riskHint);
    await store.close();
  });
});
