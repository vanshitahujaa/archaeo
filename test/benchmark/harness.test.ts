/**
 * Benchmark harness tests — #35 / Part H.
 *
 * Exercises the REAL harness end to end (it builds the fixture repos, runs the REAL engine,
 * and computes metrics) plus the pure metrics/report functions in isolation.
 *
 * Ownership: test/benchmark/ + src/benchmark/.
 */

import { describe, expect, it } from 'vitest';

import {
  loadFixturesDataset,
  realRepoConfigFromEnv,
  runFixturesBenchmark,
} from '../../src/benchmark/run.js';
import {
  computeMetrics,
  isCalibrationCorrect,
  type BenchItemResult,
} from '../../src/benchmark/metrics.js';
import { renderReport } from '../../src/benchmark/report.js';

describe('fixtures dataset (Part H.1)', () => {
  it('loads six well-formed items', () => {
    const items = loadFixturesDataset();
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.questionType).toBe('why-line');
      expect(item.path.length).toBeGreaterThan(0);
      expect(item.line).toBeGreaterThan(0);
      expect(item.expected).toBeDefined();
    }
  });

  it('the squash and cherry-pick items carry the expected PRs', () => {
    const items = loadFixturesDataset();
    const squash = items.find((i) => i.repo === 'squash');
    const cherry = items.find((i) => i.repo === 'cherry-pick');
    expect(squash?.expected.introducingPr).toBe(42);
    expect(cherry?.expected.introducingPr).toBe(55);
  });
});

describe('runFixturesBenchmark — REAL engine over the offline corpus', () => {
  it('recovers PR #42 for squash and #55 for cherry-pick, honest LOW elsewhere', async () => {
    const { results, metrics } = await runFixturesBenchmark();
    expect(results).toHaveLength(6);

    const byId = new Map(results.map((r) => [r.id, r]));
    const squash = byId.get('squash:payments.ts:2');
    const cherry = byId.get('cherry-pick:charge.ts:2');
    expect(squash?.chosenPr).toBe(42);
    expect(squash?.confidence).toBe('medium');
    expect(cherry?.chosenPr).toBe(55);
    expect(cherry?.confidence).toBe('medium');

    // The no-PR cases must NOT fabricate a PR.
    const missing = byId.get('missing-pr:cache.ts:4');
    expect(missing?.chosenPr).toBeUndefined();
    expect(missing?.confidence).toBe('low');

    // Top-1 and top-3 are over the two items that have an expected PR.
    expect(metrics.prScored).toBe(2);
    expect(metrics.top1).toBe(1);
    expect(metrics.top3).toBe(1);
  });

  it('is deterministic — two runs produce identical metrics', async () => {
    const a = await runFixturesBenchmark();
    const b = await runFixturesBenchmark();
    expect(b.metrics).toEqual(a.metrics);
  });

  it('calibration is honest: HIGH never claims more than it earns', async () => {
    const { metrics } = await runFixturesBenchmark();
    // No fixture is HIGH (no linked-issue + clean-trace + strong-separation case in the corpus),
    // so HIGH must be empty rather than padded.
    expect(metrics.calibration.high.n).toBe(0);
    // Every MEDIUM/LOW answer in this clean corpus is correct.
    expect(metrics.calibration.medium.accuracy).toBe(1);
    expect(metrics.calibration.low.accuracy).toBe(1);
  });
});

describe('computeMetrics', () => {
  it('counts top-1 only over items with an expected PR', () => {
    const results: BenchItemResult[] = [
      { id: 'a', expectedPr: 1, chosenPr: 1, topPrs: [1], confidence: 'high' },
      { id: 'b', expectedPr: 2, chosenPr: 9, topPrs: [9, 2], confidence: 'medium' },
      { id: 'c', topPrs: [], confidence: 'low' }, // no expected PR → not PR-scored
    ];
    const m = computeMetrics(results);
    expect(m.prScored).toBe(2);
    expect(m.total).toBe(3);
    expect(m.top1).toBe(0.5); // a correct, b wrong
    expect(m.top3).toBe(1); // b's expected PR (2) is in its topPrs
  });

  it('calibration: a fabricated PR on a no-PR item is incorrect', () => {
    const results: BenchItemResult[] = [
      { id: 'honest', topPrs: [], confidence: 'low' }, // correctly no PR
      { id: 'liar', chosenPr: 7, topPrs: [7], confidence: 'low' }, // invented a PR
    ];
    const m = computeMetrics(results);
    expect(m.calibration.low.n).toBe(2);
    expect(m.calibration.low.correct).toBe(1);
    expect(m.calibration.low.accuracy).toBe(0.5);
  });

  it('isCalibrationCorrect rewards honesty and penalizes fabrication', () => {
    expect(isCalibrationCorrect({ id: 'x', topPrs: [], confidence: 'low' })).toBe(true);
    expect(isCalibrationCorrect({ id: 'x', chosenPr: 5, topPrs: [5], confidence: 'low' })).toBe(
      false,
    );
    expect(
      isCalibrationCorrect({ id: 'x', expectedPr: 5, chosenPr: 5, topPrs: [5], confidence: 'high' }),
    ).toBe(true);
    expect(
      isCalibrationCorrect({ id: 'x', expectedPr: 5, chosenPr: 6, topPrs: [6], confidence: 'high' }),
    ).toBe(false);
  });

  it('empty input is well-defined (no NaN)', () => {
    const m = computeMetrics([]);
    expect(m.top1).toBe(0);
    expect(m.top3).toBe(0);
    expect(m.calibration.high.accuracy).toBe(0);
  });
});

describe('renderReport', () => {
  it('renders top-1/top-3 and a calibration table', () => {
    const m = computeMetrics([
      { id: 'a', expectedPr: 1, chosenPr: 1, topPrs: [1], confidence: 'medium' },
      { id: 'b', topPrs: [], confidence: 'low' },
    ]);
    const out = renderReport(m, { corpus: 'unit' });
    expect(out).toContain('top-1: 100.0%');
    expect(out).toContain('Confidence calibration');
    expect(out).toContain('MEDIUM');
    expect(out).toContain('LOW');
    expect(out).toContain('corpus: unit');
  });

  it('includes a per-item table when results are passed', () => {
    const results: BenchItemResult[] = [
      { id: 'repo:file.ts:1', expectedPr: 1, chosenPr: 1, topPrs: [1], confidence: 'high' },
    ];
    const out = renderReport(computeMetrics(results), { results });
    expect(out).toContain('Per-item');
    expect(out).toContain('repo:file.ts:1');
  });
});

describe('realRepoConfigFromEnv (opt-in gating)', () => {
  it('returns null when not opted in', () => {
    expect(realRepoConfigFromEnv({})).toBeNull();
  });

  it('returns null when opted in but missing path/token', () => {
    expect(realRepoConfigFromEnv({ ARCHAEO_BENCH_REAL: '1' })).toBeNull();
    expect(
      realRepoConfigFromEnv({ ARCHAEO_BENCH_REAL: '1', ARCHAEO_BENCH_REPO_PATH: '/x' }),
    ).toBeNull();
  });

  it('returns config when fully configured', () => {
    const cfg = realRepoConfigFromEnv({
      ARCHAEO_BENCH_REAL: '1',
      ARCHAEO_BENCH_REPO_PATH: '/abs/clone',
      GITHUB_TOKEN: 'tok',
    });
    expect(cfg).toEqual({ repoPath: '/abs/clone', token: 'tok' });
  });
});
