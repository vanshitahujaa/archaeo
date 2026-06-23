/**
 * Behavioral evidence — A2 (Tracer), issue #25 / Part D.6.
 *
 * From the introducing commit diff, record co-changed paths and derive short structural
 * hints from added lines via simple token pattern matching. No LLM. Feeds the Narrator,
 * especially when PR and issue are missing ("fix bug" commits).
 */

import type { BehavioralEvidence, CommitDiff } from '../core/index.js';

/** Structural hint rules: a regex over added lines → a short human hint. Ordered by priority. */
const HINT_RULES: Array<{ re: RegExp; hint: string }> = [
  { re: /\bretry\b|\bbackoff\b|max retries|retries\b/i, hint: 'added retry logic' },
  { re: /\btimeout\b|setTimeout|deadline|AbortController/i, hint: 'added timeout handling' },
  { re: /\bidempoten/i, hint: 'added idempotency handling' },
  { re: /\bcatch\b|\bthrow\b|try\s*\{|throw new Error|\.catch\(/i, hint: 'added error handling' },
  { re: /\block\b|mutex|semaphore|synchroniz/i, hint: 'added locking/synchronization' },
  { re: /\bvalidate|invalid\b|must be|required\b|<=\s*0|>=|<\s*0/i, hint: 'added input validation' },
  { re: /\bcache\b|memoiz|\bttl\b/i, hint: 'added caching' },
  { re: /\bauth|token|permission|forbidden|unauthor/i, hint: 'added auth/permission check' },
  { re: /\bif\s*\(|\?\s*.*:|switch\s*\(/, hint: 'added conditional branch' },
  { re: /\bnull\b|undefined|\?\?|optional chaining|\?\./i, hint: 'added null/undefined guard' },
];

/**
 * Extract behavioral evidence from a commit diff.
 * @param diff the introducing commit's diff
 * @param targetPath optional path of the line being explained; excluded from coChangedPaths
 */
export function extractBehavioralEvidence(diff: CommitDiff, targetPath?: string): BehavioralEvidence {
  const coChangedPaths = [
    ...new Set(
      diff.files
        .map((f) => f.path)
        .filter((p) => p.length > 0 && (targetPath === undefined || p !== targetPath)),
    ),
  ];

  // Concatenate all added lines for hint scanning.
  const addedText = diff.files.flatMap((f) => f.added).join('\n');
  const summaryHints: string[] = [];
  for (const rule of HINT_RULES) {
    if (rule.re.test(addedText) && !summaryHints.includes(rule.hint)) {
      summaryHints.push(rule.hint);
    }
  }

  const evidence: BehavioralEvidence = {
    coChangedPaths,
    summaryHints,
  };
  if (diff.sha) evidence.introducingSha = diff.sha;
  return evidence;
}
