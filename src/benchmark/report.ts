/**
 * Benchmark report rendering — A7 (Auditor), issues #35 / #62 / Part H.3.
 *
 * Printed by `pnpm bench` and pasted into every `provenance/` PR description (Part I.4 / H.3).
 * Plain ASCII, no color, no external deps — so it copies cleanly into a PR body and diffs
 * readably when the Lead watches for top-1 / calibration regressions.
 */

import type { Confidence } from '../core/index.js';
import type { BenchItemResult, Metrics } from './metrics.js';

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

const TIER_ORDER: Confidence[] = ['high', 'medium', 'low'];

/** A fixed-width table cell (left-aligned, padded with spaces). */
function cell(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export interface RenderOptions {
  /** Human label for the corpus, e.g. "offline fixtures". */
  corpus?: string;
  /** Per-item rows (optional detail table). */
  results?: BenchItemResult[];
}

export function renderReport(metrics: Metrics, options: RenderOptions = {}): string {
  const lines: string[] = [];
  const corpus = options.corpus ?? 'benchmark corpus';

  lines.push('archaeo provenance benchmark (Part H)');
  lines.push(`corpus: ${corpus}`);
  lines.push(`items:  ${metrics.total} total, ${metrics.prScored} with an expected PR`);
  lines.push('');

  // ---- accuracy summary ----
  lines.push('Accuracy (over items with an expected PR)');
  lines.push(`  top-1: ${pct(metrics.top1)}`);
  lines.push(`  top-3: ${pct(metrics.top3)}`);
  lines.push('');

  // ---- calibration table ----
  lines.push('Confidence calibration (every item; HIGH should beat LOW)');
  lines.push(`  ${cell('tier', 8)}${cell('n', 5)}${cell('correct', 9)}accuracy`);
  lines.push(`  ${'-'.repeat(30)}`);
  for (const tier of TIER_ORDER) {
    const s = metrics.calibration[tier];
    const acc = s.n === 0 ? 'n/a' : pct(s.accuracy);
    lines.push(
      `  ${cell(tier.toUpperCase(), 8)}${cell(String(s.n), 5)}${cell(String(s.correct), 9)}${acc}`,
    );
  }
  lines.push('');

  // ---- optional per-item detail ----
  if (options.results && options.results.length > 0) {
    lines.push('Per-item');
    lines.push(`  ${cell('id', 44)}${cell('conf', 8)}${cell('expPR', 7)}${cell('gotPR', 7)}ok`);
    lines.push(`  ${'-'.repeat(70)}`);
    for (const r of options.results) {
      const exp = r.expectedPr === undefined ? '-' : String(r.expectedPr);
      const got = r.chosenPr === undefined ? '-' : String(r.chosenPr);
      const ok =
        r.expectedPr === undefined
          ? r.chosenPr === undefined
            ? 'ok'
            : 'XX'
          : r.chosenPr === r.expectedPr
            ? 'ok'
            : 'XX';
      lines.push(
        `  ${cell(r.id, 44)}${cell(r.confidence.toUpperCase(), 8)}${cell(exp, 7)}${cell(got, 7)}${ok}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
