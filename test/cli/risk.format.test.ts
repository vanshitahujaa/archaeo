/**
 * Tests for formatRisk and TerminalFormatter.risk — issue #31.
 */

import { describe, expect, it } from 'vitest';
import { formatRisk } from '../../src/cli/format/risk.format.js';
import { TerminalFormatter } from '../../src/cli/format/why.format.js';
import type { RiskReport } from '../../src/core/index.js';

const SEP = '-----------------------------------------------------';

function makeRiskReport(overrides: Partial<RiskReport> = {}): RiskReport {
  return {
    path: 'src/auth.ts',
    score: 7.4,
    signals: {
      distinctAuthors: 8,
      commitsLast90d: 23,
      coupledPaths: ['src/session-store.ts', 'src/login.controller.ts'],
      incidentLinkedCommits: 2,
      lastTouchedDaysAgo: 3,
    },
    notes: ['High churn suggests frequent changes — test coverage recommended.'],
    ...overrides,
  };
}

describe('formatRisk', () => {
  it('contains path in header', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('risk src/auth.ts');
  });

  it('contains separator lines', () => {
    const out = formatRisk(makeRiskReport());
    const sepCount = out.split(SEP).length - 1;
    expect(sepCount).toBeGreaterThanOrEqual(2);
  });

  it('contains score with label', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('7.4 / 10');
    expect(out).toContain('(HIGH)');
  });

  it('labels score as MEDIUM for score 5', () => {
    const out = formatRisk(makeRiskReport({ score: 5 }));
    expect(out).toContain('(MEDIUM)');
  });

  it('labels score as LOW for score 2', () => {
    const out = formatRisk(makeRiskReport({ score: 2 }));
    expect(out).toContain('(LOW)');
  });

  it('contains distinct authors count', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('8 distinct authors');
  });

  it('contains commits count', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('23 commits');
  });

  it('contains last touched days', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('3 days ago');
  });

  it('contains incident-linked commits count', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('Incident-linked commits: 2');
  });

  it('contains coupled paths', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('Coupled paths:');
    expect(out).toContain('src/session-store.ts');
    expect(out).toContain('src/login.controller.ts');
  });

  it('contains notes', () => {
    const out = formatRisk(makeRiskReport());
    expect(out).toContain('Notes:');
    expect(out).toContain('High churn suggests frequent changes');
  });

  it('handles empty coupled paths gracefully', () => {
    const out = formatRisk(
      makeRiskReport({ signals: { ...makeRiskReport().signals, coupledPaths: [] } }),
    );
    expect(out).not.toContain('Coupled paths:');
  });

  it('handles empty notes gracefully', () => {
    const out = formatRisk(makeRiskReport({ notes: [] }));
    expect(out).not.toContain('Notes:');
  });

  it('handles singular "day" for lastTouchedDaysAgo=1', () => {
    const out = formatRisk(
      makeRiskReport({ signals: { ...makeRiskReport().signals, lastTouchedDaysAgo: 1 } }),
    );
    expect(out).toContain('1 day ago');
    expect(out).not.toContain('1 days ago');
  });

  it('handles singular "commit" for commitsLast90d=1', () => {
    const out = formatRisk(
      makeRiskReport({ signals: { ...makeRiskReport().signals, commitsLast90d: 1 } }),
    );
    expect(out).toContain('1 commit');
    expect(out).not.toContain('1 commits');
  });

  it('handles singular "author" for distinctAuthors=1', () => {
    const out = formatRisk(
      makeRiskReport({ signals: { ...makeRiskReport().signals, distinctAuthors: 1 } }),
    );
    expect(out).toContain('1 distinct author');
    expect(out).not.toContain('1 distinct authors');
  });
});

describe('TerminalFormatter.risk (delegates to formatRisk)', () => {
  const tf = new TerminalFormatter();

  it('produces same output as formatRisk', () => {
    const report = makeRiskReport();
    expect(tf.risk(report)).toBe(formatRisk(report));
  });
});
