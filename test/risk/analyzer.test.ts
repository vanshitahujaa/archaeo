/**
 * Risk analyzer tests — #28 / Part D.7. REAL LocalGitClient over a fixture + in-memory store.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildSquashRepo } from '../fixtures/buildRepo.js';
import { LocalGitClient } from '../../src/integration/git/gitClient.js';
import { SqliteStore } from '../../src/storage/sqliteStore.js';
import { Analyzer, daysSinceMostRecent, messageMarksIncident } from '../../src/risk/analyzer.js';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-risk-'));
  dirs.push(d);
  return d;
}
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const noHost = { async prForCommit(): Promise<null> { return null; } };

describe('Analyzer.analyze (D.7) — real git', () => {
  it('produces a 0..10 score and populated signals for a real file', async () => {
    const dir = tmp();
    buildSquashRepo(dir);
    const git = new LocalGitClient({ cwd: dir });
    const store = new SqliteStore({ dbPath: ':memory:' });
    await store.init();
    // Large window so the 2024 fixture commits fall inside it.
    const analyzer = new Analyzer({ git, host: noHost, store, repo: 'test/repo' }, 5000);

    const report = await analyzer.analyze('payments.ts');

    expect(report.path).toBe('payments.ts');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(10);
    expect(report.signals.commitsLast90d).toBeGreaterThanOrEqual(1);
    expect(report.signals.distinctAuthors).toBeGreaterThanOrEqual(1);
    expect(report.notes.length).toBeGreaterThan(0);
    await store.close();
  });
});

describe('messageMarksIncident', () => {
  it.each([
    ['Revert "feat: x"', true],
    ['hotfix: patch prod', true],
    ['rollback the bad deploy', true],
    ['incident response for outage', true],
    ['feat(auth): add login', false],
  ])('%s → %s', (msg, expected) => {
    expect(messageMarksIncident(msg)).toBe(expected);
  });
});

describe('daysSinceMostRecent', () => {
  it('returns whole days from the most recent timestamp', () => {
    const now = new Date('2024-01-11T00:00:00Z');
    expect(daysSinceMostRecent(['2024-01-01T00:00:00Z', '2024-01-10T00:00:00Z'], now)).toBe(1);
  });
  it('returns a huge number when there are no timestamps', () => {
    expect(daysSinceMostRecent([])).toBe(Number.MAX_SAFE_INTEGER);
  });
});
