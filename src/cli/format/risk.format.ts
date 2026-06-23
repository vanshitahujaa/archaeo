/**
 * `risk` formatter — A5 (Surface), issue #31 / Part M.
 * Formats a RiskReport into a terminal-friendly string.
 */

import type { RiskReport } from '../../core/index.js';

const SEP = '-----------------------------------------------------';

/** Map a 0–10 score to a label. */
function scoreLabel(score: number): string {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format a RiskReport into terminal output.
 *
 * Example:
 * ```
 * risk src/auth.ts
 * -----------------------------------------------------
 * Score:       7.4 / 10  (HIGH)
 * Authors:     8 distinct authors (last 90 days)
 * Churn:       23 commits (last 90 days)
 * Last touched: 3 days ago
 * Incident-linked commits: 2
 * Coupled paths:
 *   session-store.ts
 *   login.controller.ts
 * Notes:
 *   High churn suggests frequent changes — test coverage recommended.
 * -----------------------------------------------------
 * ```
 */
export function formatRisk(report: RiskReport): string {
  const lines: string[] = [];

  lines.push(`risk ${report.path}`);
  lines.push(SEP);

  const label = scoreLabel(report.score);
  lines.push(`Score:       ${report.score.toFixed(1)} / 10  (${label})`);

  const { distinctAuthors, commitsLast90d, coupledPaths, incidentLinkedCommits, lastTouchedDaysAgo } =
    report.signals;

  lines.push(`Authors:     ${distinctAuthors} distinct author${distinctAuthors !== 1 ? 's' : ''} (last 90 days)`);
  lines.push(`Churn:       ${commitsLast90d} commit${commitsLast90d !== 1 ? 's' : ''} (last 90 days)`);
  lines.push(`Last touched: ${lastTouchedDaysAgo} day${lastTouchedDaysAgo !== 1 ? 's' : ''} ago`);
  lines.push(`Incident-linked commits: ${incidentLinkedCommits}`);

  if (coupledPaths.length > 0) {
    lines.push('Coupled paths:');
    for (const p of coupledPaths) {
      lines.push(`  ${p}`);
    }
  }

  if (report.notes.length > 0) {
    lines.push('Notes:');
    for (const note of report.notes) {
      lines.push(`  ${note}`);
    }
  }

  lines.push(SEP);

  return lines.join('\n');
}
