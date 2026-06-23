/**
 * Line tracer tests — #21 / Part D steps 1–5. REAL LocalGitClient over fixture repos.
 * Covers rename (native -M -C follow), move-to-utility (cross-file stitch), and the
 * distinctive-token picker.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildMoveToUtilityRepo, buildRenameRepo } from '../fixtures/buildRepo.js';
import { getGroundTruth } from '../fixtures/groundTruth.js';
import { LocalGitClient } from '../../src/integration/git/gitClient.js';
import { LineTracer, pickDistinctiveToken } from '../../src/provenance/tracer.js';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-tracer-'));
  dirs.push(d);
  return d;
}
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('LineTracer (D steps 1–5)', () => {
  it('RENAME: -M -C follows the rename natively to the introducing commit', async () => {
    const dir = tmp();
    const shas = buildRenameRepo(dir);
    const tracer = new LineTracer(new LocalGitClient({ cwd: dir }));
    const res = await tracer.trace('authentication.ts', 2);
    const gt = getGroundTruth('rename', 'authentication.ts', 2)!;
    expect(res.lineage.some((c) => c.sha === shas[gt.introducingLabel])).toBe(true);
    // The introducing (origin) commit is the oldest in the lineage.
    expect(res.lineage[0]?.sha).toBe(shas['introduce']);
  });

  it('MOVE-TO-UTILITY: cross-file stitch crosses the move boundary to the origin', async () => {
    const dir = tmp();
    const shas = buildMoveToUtilityRepo(dir);
    const tracer = new LineTracer(new LocalGitClient({ cwd: dir }));
    const res = await tracer.trace('util/retry.ts', 1);

    // The stitch recovered the origin in service.ts.
    expect(res.lineage.map((c) => c.sha)).toContain(shas['introduce']);
    expect(res.lineage[0]?.sha).toBe(shas['introduce']); // oldest first
    // Exactly one ambiguous boundary was crossed (the move).
    expect(res.ambiguousBoundaries).toBe(1);
    expect(res.cleanTrace).toBe(true);
    // The introduce commit scores highest (originality + token overlap).
    const introCand = res.candidates.find((c) => c.commit.sha === shas['introduce']);
    expect(introCand).toBeDefined();
  });

  it('returns an empty trace for a non-existent line', async () => {
    const dir = tmp();
    buildRenameRepo(dir);
    const tracer = new LineTracer(new LocalGitClient({ cwd: dir }));
    const res = await tracer.trace('does-not-exist.ts', 1);
    expect(res.lineage).toEqual([]);
    expect(res.candidates).toEqual([]);
    expect(res.cleanTrace).toBe(false);
  });
});

describe('pickDistinctiveToken', () => {
  it('prefers a declaration line', () => {
    expect(pickDistinctiveToken(['  return x;', 'export function retry() {'])).toBe(
      'export function retry() {',
    );
  });
  it('falls back to the longest line', () => {
    expect(pickDistinctiveToken(['a', 'bbbb', 'cc'])).toBe('bbbb');
  });
  it('returns null for empty input', () => {
    expect(pickDistinctiveToken([])).toBeNull();
    expect(pickDistinctiveToken(['   ', ''])).toBeNull();
  });
});
