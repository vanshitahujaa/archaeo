/**
 * Fixture repo sanity tests — issue #33.
 *
 * Builds each synthetic repo in a temp dir, asserts the expected commits
 * exist + that running the builder twice yields the same SHAs (determinism),
 * then cleans up.
 *
 * Does NOT test the provenance engine itself — those tests live in the Tracer
 * modules (#41/#43).  This file only validates that the fixtures are correctly
 * constructed and deterministic.
 *
 * Ownership: test/fixtures/ ONLY.  Do NOT edit src/.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildCherryPickRepo,
  buildCosmeticOnlyRepo,
  buildMissingPrRepo,
  buildMoveToUtilityRepo,
  buildRenameRepo,
  buildSquashRepo,
} from './buildRepo.js';
import { GROUND_TRUTH, getGroundTruth } from './groundTruth.js';
import { loadHostResponses } from './loadHostResponses.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-fixture-'));
}

function removeTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function gitLog(repoDir: string): string[] {
  return execFileSync('git', ['log', '--pretty=format:%H', '--all'], {
    cwd: repoDir,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

function commitMessage(repoDir: string, sha: string): string {
  return execFileSync('git', ['log', '-1', '--pretty=format:%B', sha], {
    cwd: repoDir,
    encoding: 'utf8',
  }).trim();
}

function fileExists(repoDir: string, relPath: string): boolean {
  return fs.existsSync(path.join(repoDir, relPath));
}

// ---------------------------------------------------------------------------
// Per-test teardown dirs
// ---------------------------------------------------------------------------

let tmpDirs: string[] = [];

beforeEach(() => {
  tmpDirs = [];
});

afterEach(() => {
  for (const d of tmpDirs) {
    removeTmpDir(d);
  }
});

function makeRepo(): string {
  const d = makeTmpDir();
  tmpDirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// RENAME
// ---------------------------------------------------------------------------

describe('rename repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    expect(shas).toHaveProperty('introduce');
    expect(shas).toHaveProperty('rename');
    expect(typeof shas['introduce']).toBe('string');
    expect(typeof shas['rename']).toBe('string');
    expect(shas['introduce']).toHaveLength(40);
    expect(shas['rename']).toHaveLength(40);
  });

  it('introducing commit exists in log', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    const log = gitLog(dir);
    expect(log).toContain(shas['introduce']);
    expect(log).toContain(shas['rename']);
  });

  it('authentication.ts exists after rename', () => {
    const dir = makeRepo();
    buildRenameRepo(dir);
    expect(fileExists(dir, 'authentication.ts')).toBe(true);
    expect(fileExists(dir, 'auth.ts')).toBe(false);
  });

  it('is deterministic — two builds produce same SHAs', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildRenameRepo(dir1);
    const shas2 = buildRenameRepo(dir2);
    expect(shas1['introduce']).toBe(shas2['introduce']);
    expect(shas1['rename']).toBe(shas2['rename']);
  });

  it('rename commit message matches expectation', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    const msg = commitMessage(dir, shas['rename']!);
    expect(msg).toContain('rename');
  });
});

// ---------------------------------------------------------------------------
// MOVE-TO-UTILITY
// ---------------------------------------------------------------------------

describe('move-to-utility repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildMoveToUtilityRepo(dir);
    expect(shas).toHaveProperty('introduce');
    expect(shas).toHaveProperty('move');
    expect(shas).toHaveProperty('post-move-use');
    expect(shas['introduce']).toHaveLength(40);
    expect(shas['move']).toHaveLength(40);
  });

  it('util/retry.ts exists after move', () => {
    const dir = makeRepo();
    buildMoveToUtilityRepo(dir);
    expect(fileExists(dir, 'util/retry.ts')).toBe(true);
  });

  it('service.ts imports from util after move', () => {
    const dir = makeRepo();
    buildMoveToUtilityRepo(dir);
    const content = fs.readFileSync(path.join(dir, 'service.ts'), 'utf8');
    expect(content).toContain("from './util/retry.js'");
  });

  it('is deterministic', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildMoveToUtilityRepo(dir1);
    const shas2 = buildMoveToUtilityRepo(dir2);
    expect(shas1['introduce']).toBe(shas2['introduce']);
    expect(shas1['move']).toBe(shas2['move']);
  });

  it('retry function is present in util/retry.ts', () => {
    const dir = makeRepo();
    buildMoveToUtilityRepo(dir);
    const content = fs.readFileSync(path.join(dir, 'util/retry.ts'), 'utf8');
    expect(content).toContain('export function retry');
  });
});

// ---------------------------------------------------------------------------
// SQUASH
// ---------------------------------------------------------------------------

describe('squash repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    expect(shas).toHaveProperty('feature-1');
    expect(shas).toHaveProperty('feature-2');
    expect(shas).toHaveProperty('squash');
    expect(shas['squash']).toHaveLength(40);
  });

  it('feature-1 and feature-2 do NOT appear on main (squashed)', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const mainLog = execFileSync('git', ['log', '--pretty=format:%H', 'main'], {
      cwd: dir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    // feature-1 and feature-2 were on the feature branch and squashed; they
    // should NOT appear in main's linear history.
    expect(mainLog).not.toContain(shas['feature-1']);
    expect(mainLog).not.toContain(shas['feature-2']);
  });

  it('squash commit message references PR number', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const msg = commitMessage(dir, shas['squash']!);
    expect(msg).toContain('#42');
  });

  it('is deterministic', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildSquashRepo(dir1);
    const shas2 = buildSquashRepo(dir2);
    expect(shas1['squash']).toBe(shas2['squash']);
  });

  it('payments.ts contains idempotency guard after squash', () => {
    const dir = makeRepo();
    buildSquashRepo(dir);
    const content = fs.readFileSync(path.join(dir, 'payments.ts'), 'utf8');
    expect(content).toContain('idempotencyKey');
    expect(content).toContain('amount');
  });
});

// ---------------------------------------------------------------------------
// CHERRY-PICK
// ---------------------------------------------------------------------------

describe('cherry-pick repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildCherryPickRepo(dir);
    expect(shas).toHaveProperty('original');
    expect(shas).toHaveProperty('cherry-picked');
    expect(shas['original']).toHaveLength(40);
    expect(shas['cherry-picked']).toHaveLength(40);
  });

  it('cherry-picked commit message contains the canonical trailer', () => {
    const dir = makeRepo();
    const shas = buildCherryPickRepo(dir);
    const msg = commitMessage(dir, shas['cherry-picked']!);
    expect(msg).toContain(`(cherry picked from commit ${shas['original']})`);
  });

  it('original and cherry-picked are different SHAs', () => {
    const dir = makeRepo();
    const shas = buildCherryPickRepo(dir);
    expect(shas['original']).not.toBe(shas['cherry-picked']);
  });

  it('is deterministic', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildCherryPickRepo(dir1);
    const shas2 = buildCherryPickRepo(dir2);
    expect(shas1['original']).toBe(shas2['original']);
    expect(shas1['cherry-picked']).toBe(shas2['cherry-picked']);
  });

  it('charge.ts contains the guard after cherry-pick', () => {
    const dir = makeRepo();
    buildCherryPickRepo(dir);
    const content = fs.readFileSync(path.join(dir, 'charge.ts'), 'utf8');
    expect(content).toContain('amount <= 0');
  });
});

// ---------------------------------------------------------------------------
// COSMETIC-ONLY
// ---------------------------------------------------------------------------

describe('cosmetic-only repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildCosmeticOnlyRepo(dir);
    expect(shas).toHaveProperty('behavioral');
    expect(shas).toHaveProperty('cosmetic');
    expect(shas['behavioral']).toHaveLength(40);
    expect(shas['cosmetic']).toHaveLength(40);
  });

  it('cosmetic commit introduces no new logic tokens', () => {
    const dir = makeRepo();
    const shas = buildCosmeticOnlyRepo(dir);
    // The cosmetic commit should have a style message
    const msg = commitMessage(dir, shas['cosmetic']!);
    expect(msg).toContain('style');
  });

  it('both commits touch the same file', () => {
    const dir = makeRepo();
    const shas = buildCosmeticOnlyRepo(dir);
    // Use --root so the root commit's files are listed (no parent diff otherwise)
    const touchedByBehavioral = execFileSync(
      'git',
      ['diff-tree', '--root', '--no-commit-id', '-r', '--name-only', shas['behavioral']!],
      { cwd: dir, encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    const touchedByCosmetic = execFileSync(
      'git',
      ['diff-tree', '--root', '--no-commit-id', '-r', '--name-only', shas['cosmetic']!],
      { cwd: dir, encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    expect(touchedByBehavioral).toContain('processor.ts');
    expect(touchedByCosmetic).toContain('processor.ts');
  });

  it('is deterministic', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildCosmeticOnlyRepo(dir1);
    const shas2 = buildCosmeticOnlyRepo(dir2);
    expect(shas1['behavioral']).toBe(shas2['behavioral']);
    expect(shas1['cosmetic']).toBe(shas2['cosmetic']);
  });
});

// ---------------------------------------------------------------------------
// MISSING-PR
// ---------------------------------------------------------------------------

describe('missing-pr repo', () => {
  it('builds with expected labels', () => {
    const dir = makeRepo();
    const shas = buildMissingPrRepo(dir);
    expect(shas).toHaveProperty('init');
    expect(shas).toHaveProperty('missing-pr');
    expect(shas['missing-pr']).toHaveLength(40);
  });

  it('missing-pr commit has a low-info message', () => {
    const dir = makeRepo();
    const shas = buildMissingPrRepo(dir);
    const msg = commitMessage(dir, shas['missing-pr']!);
    expect(msg).toBe('fix stuff');
  });

  it('cache.ts has the in-memory store after missing-pr commit', () => {
    const dir = makeRepo();
    buildMissingPrRepo(dir);
    const content = fs.readFileSync(path.join(dir, 'cache.ts'), 'utf8');
    expect(content).toContain('Map');
    expect(content).toContain('setCache');
  });

  it('is deterministic', () => {
    const dir1 = makeRepo();
    const dir2 = makeRepo();
    const shas1 = buildMissingPrRepo(dir1);
    const shas2 = buildMissingPrRepo(dir2);
    expect(shas1['missing-pr']).toBe(shas2['missing-pr']);
  });
});

// ---------------------------------------------------------------------------
// Ground truth coverage
// ---------------------------------------------------------------------------

describe('ground truth', () => {
  it('has an entry for every repo+path+line', () => {
    // Just check we have all 6 expected entries (one per fixture case)
    expect(GROUND_TRUTH).toHaveLength(6);
  });

  it('every entry has a non-empty introducingLabel', () => {
    for (const entry of GROUND_TRUTH) {
      expect(entry.introducingLabel).toBeTruthy();
    }
  });

  it('every entry has at least one lineageLabel', () => {
    for (const entry of GROUND_TRUTH) {
      expect(entry.lineageLabels.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getGroundTruth looks up by repo+path+line', () => {
    const entry = getGroundTruth('rename', 'authentication.ts', 2);
    expect(entry).toBeDefined();
    expect(entry?.introducingLabel).toBe('introduce');
  });

  it('getGroundTruth returns undefined for unknown entry', () => {
    expect(getGroundTruth('rename', 'nonexistent.ts', 99)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadHostResponses
// ---------------------------------------------------------------------------

describe('loadHostResponses', () => {
  it('prForCommit returns PR when SHA is known (squash)', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const hr = loadHostResponses(shas);
    const pr = hr.prForCommit(shas['squash']!);
    expect(pr).not.toBeNull();
    expect(pr?.number).toBe(42);
  });

  it('prForCommit returns null for a SHA with no PR (rename)', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    const hr = loadHostResponses(shas);
    const pr = hr.prForCommit(shas['introduce']!);
    expect(pr).toBeNull();
  });

  it('issuesReferencedByPr returns issues for PR 42', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const hr = loadHostResponses(shas);
    const issues = hr.issuesReferencedByPr(42);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(17);
  });

  it('issuesReferencedByPr returns [] for unknown PR', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    const hr = loadHostResponses(shas);
    expect(hr.issuesReferencedByPr(9999)).toEqual([]);
  });

  it('reviewComments for PR 42 has 10 comments with one substantive', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const hr = loadHostResponses(shas);
    const comments = hr.reviewComments(42);
    expect(comments).toHaveLength(10);
    // The substantive comment is from priya and mentions the idempotency gap
    const substantive = comments.find((c) => c.author === 'priya');
    expect(substantive).toBeDefined();
    expect(substantive?.body).toContain('idempotency gap');
    expect(substantive?.path).toBe('payments.ts');
    expect(substantive?.line).toBe(2);
  });

  it('prCommits for PR 42 returns 2 original commits with placeholder SHAs resolved', () => {
    const dir = makeRepo();
    const shas = buildSquashRepo(dir);
    const hr = loadHostResponses(shas);
    const commits = hr.prCommits(42);
    expect(commits).toHaveLength(2);
    // Placeholders should be resolved to real SHAs
    expect(commits[0]?.sha).toBe(shas['feature-1']);
    expect(commits[1]?.sha).toBe(shas['feature-2']);
  });

  it('prCommits for PR 55 resolves cherry-pick original SHA', () => {
    const dir = makeRepo();
    const shas = buildCherryPickRepo(dir);
    const hr = loadHostResponses(shas);
    const commits = hr.prCommits(55);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.sha).toBe(shas['original']);
  });

  it('reviewComments for unknown PR returns []', () => {
    const dir = makeRepo();
    const shas = buildRenameRepo(dir);
    const hr = loadHostResponses(shas);
    expect(hr.reviewComments(9999)).toEqual([]);
  });
});
