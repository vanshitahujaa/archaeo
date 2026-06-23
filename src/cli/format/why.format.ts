/**
 * `why` / `explain-commit` formatter — A5 (Surface), issue #30 / Part M.
 *
 * Implements ALL FOUR Part M output shapes:
 *   1. Clear winner (primary set, high/medium confidence)
 *   2. Ambiguous lineage (no primary, candidates clustered)
 *   3. Recovered broken chain (chainBroken=true but commits found)
 *   4. Honest LOW (no evidence / very low confidence)
 *
 * The formatter is a pure function — no side effects, no I/O.
 * Match Part M layout closely.
 */

import type {
  CommitExplanation,
  EvidenceBundle,
  Formatter,
  RiskReport,
  WhyAnswer,
} from '../../core/index.js';
import { formatRisk } from './risk.format.js';

const SEP = '-----------------------------------------------------';

/** Format a date string to YYYY-MM-DD. */
function fmtDate(isoDate: string): string {
  // Accepts ISO-8601 (full or date-only) and returns YYYY-MM-DD.
  return isoDate.slice(0, 10);
}

/** Truncate a commit SHA to 7 characters. */
function sha7(sha: string): string {
  return sha.slice(0, 7);
}

/** Join an array of strings with ", " — used for citations / evidence. */
function joinCitations(citations: string[]): string {
  return citations.join(', ');
}

/**
 * Determine which of the four shapes to render:
 *  - 'clear'     → primary is set and confidence is HIGH
 *  - 'recovered' → chainBroken is true but there is at least one candidate
 *  - 'ambiguous' → no primary, confidence is MEDIUM or HIGH (candidates clustered)
 *  - 'low'       → confidence is LOW or no candidates at all
 */
type Shape = 'clear' | 'ambiguous' | 'recovered' | 'low';

function resolveShape(bundle: EvidenceBundle, answer: WhyAnswer): Shape {
  const confidence = answer.confidence;
  const hasCandidates = bundle.candidates.length > 0;

  // Honest LOW: noEvidence flag, low confidence, or no candidates at all.
  if (answer.noEvidence || confidence === 'low' || !hasCandidates) {
    return 'low';
  }

  // Recovered chain: broken chain but some commits found.
  if (bundle.chainBroken && hasCandidates) {
    return 'recovered';
  }

  // Clear winner: primary is set (separation was clear enough).
  if (bundle.primary !== undefined && confidence === 'high') {
    return 'clear';
  }

  // Ambiguous: medium confidence, or no single primary despite having candidates.
  return 'ambiguous';
}

// ---------------------------------------------------------------------------
// Shape renderers
// ---------------------------------------------------------------------------

/**
 * Shape 1 — Clear winner.
 *
 * ```
 * why src/auth.ts:57
 * -----------------------------------------------------
 * Introduced:  2024-01-14   commit 7f2a9c1
 * Reason:      Prevent duplicate concurrent customer sessions.
 * Evidence:    PR #184, Issue #102   (source: review comment)
 * Review note: "this fixes concurrent login races"  (reviewer: priya)
 * Also changed in that commit: session-store.ts, login.controller.ts
 * Risk:        High  (run: archaeo risk src/auth.ts)
 * Confidence:  HIGH
 * -----------------------------------------------------
 * ```
 */
function renderClear(bundle: EvidenceBundle, answer: WhyAnswer): string {
  const lines: string[] = [];
  const primary = bundle.primary ?? bundle.candidates[0]!;
  const commit = primary.commit;

  lines.push(`why ${bundle.path}:${bundle.line}`);
  lines.push(SEP);
  lines.push(`Introduced:  ${fmtDate(commit.authoredAt)}   commit ${sha7(commit.sha)}`);
  lines.push(`Reason:      ${answer.reason}`);

  // Evidence line: citations + source.
  const evidenceParts: string[] = [];
  if (bundle.introducingPr) evidenceParts.push(`PR #${bundle.introducingPr.number}`);
  if (bundle.linkedIssue) evidenceParts.push(`Issue #${bundle.linkedIssue.number}`);

  // Extra citations from LLM answer not already listed.
  for (const c of answer.citations) {
    const isAlreadyListed =
      (bundle.introducingPr && c === `PR #${bundle.introducingPr.number}`) ||
      (bundle.linkedIssue && c === `Issue #${bundle.linkedIssue.number}`);
    if (!isAlreadyListed) {
      // Only include commit citations not already covered.
      if (!c.startsWith('commit ') || evidenceParts.length === 0) {
        evidenceParts.push(c);
      }
    }
  }

  const sourceLabel = sourceToLabel(bundle.usedSource);
  if (evidenceParts.length > 0) {
    lines.push(`Evidence:    ${joinCitations(evidenceParts)}   (source: ${sourceLabel})`);
  }

  // Top review comment.
  if (bundle.reviewComments.length > 0) {
    const rc = bundle.reviewComments[0]!;
    lines.push(`Review note: "${rc.body.trim()}"  (reviewer: ${rc.author})`);
  }

  // Co-changed paths.
  if (bundle.behavioral.coChangedPaths.length > 0) {
    lines.push(`Also changed in that commit: ${bundle.behavioral.coChangedPaths.join(', ')}`);
  }

  // Risk hint — crude "high/medium/low" derived from confidence.
  const riskHint = confidenceToRiskHint(answer.confidence);
  lines.push(`Risk:        ${riskHint}  (run: archaeo risk ${bundle.path})`);

  lines.push(`Confidence:  ${answer.confidence.toUpperCase()}`);
  lines.push(SEP);

  return lines.join('\n');
}

/**
 * Shape 2 — Ambiguous lineage.
 *
 * ```
 * why src/util/retry.ts:12
 * -----------------------------------------------------
 * This logic has no single origin. Lineage:
 *   2023-09-02  a11c3   added retry()                 PR #77
 *   2023-11-18  b922f   changed retry count to 5      PR #98
 *   2024-02-04  c4d10   moved retry into util/        (move)
 * Reason:      Best evidence is PR #98, which set the retry count.
 * Confidence:  MEDIUM  (candidates clustered, showing lineage)
 * -----------------------------------------------------
 * ```
 */
function renderAmbiguous(bundle: EvidenceBundle, answer: WhyAnswer): string {
  const lines: string[] = [];

  lines.push(`why ${bundle.path}:${bundle.line}`);
  lines.push(SEP);
  lines.push('This logic has no single origin. Lineage:');

  // Show lineage from bundle (behavioral commits in order).
  // Fall back to candidates if lineage is empty.
  const lineageCommits = bundle.lineage.length > 0 ? bundle.lineage : bundle.candidates.map((c) => c.commit);
  for (const commit of lineageCommits) {
    const date = fmtDate(commit.authoredAt);
    const shaStr = sha7(commit.sha);
    // Shorten the commit message to fit.
    const msg = commit.message.split('\n')[0] ?? commit.message;
    const truncated = msg.length > 36 ? msg.slice(0, 33) + '…' : msg;
    // Find a matching candidate with PR info.
    const candidate = bundle.candidates.find((c) => c.commit.sha === commit.sha);
    const prRef =
      candidate && bundle.introducingPr && candidate.commit.sha === bundle.candidates[0]?.commit.sha
        ? `PR #${bundle.introducingPr.number}`
        : candidate?.kind === 'cosmetic'
          ? '(move)'
          : '';
    lines.push(`  ${date}  ${shaStr}   ${truncated.padEnd(36)}${prRef}`);
  }

  lines.push(`Reason:      ${answer.reason}`);
  lines.push(`Confidence:  ${answer.confidence.toUpperCase()}  (candidates clustered, showing lineage)`);
  lines.push(SEP);

  return lines.join('\n');
}

/**
 * Shape 3 — Recovered broken chain.
 *
 * ```
 * why src/payments/charge.ts:88
 * -----------------------------------------------------
 * Introduced:  2024-03-10   commit 5ad21  (cherry-picked from 9f0e2)
 * Reason:      Backported idempotency key to prevent double charges.
 * Evidence:    original PR #233 recovered via cherry-pick reference
 * Confidence:  MEDIUM  (chain recovered through a cherry-pick)
 * -----------------------------------------------------
 * ```
 */
function renderRecovered(bundle: EvidenceBundle, answer: WhyAnswer): string {
  const lines: string[] = [];

  lines.push(`why ${bundle.path}:${bundle.line}`);
  lines.push(SEP);

  const primary = bundle.primary ?? bundle.candidates[0]!;
  const commit = primary.commit;

  // Detect cherry-pick note in confidence reasons or commit message.
  const cherryPickReason = bundle.confidenceReasons.find(
    (r) => r.toLowerCase().includes('cherry-pick') || r.toLowerCase().includes('cherry pick'),
  );
  const cherryPickSha = extractCherryPickSha(commit.message);
  const cherryPickSuffix = cherryPickSha ? `  (cherry-picked from ${sha7(cherryPickSha)})` : '';

  lines.push(`Introduced:  ${fmtDate(commit.authoredAt)}   commit ${sha7(commit.sha)}${cherryPickSuffix}`);
  lines.push(`Reason:      ${answer.reason}`);

  // Evidence.
  if (bundle.introducingPr) {
    const how = cherryPickReason ?? 'cherry-pick reference';
    lines.push(`Evidence:    original PR #${bundle.introducingPr.number} recovered via ${how}`);
  } else if (answer.citations.length > 0) {
    lines.push(`Evidence:    ${joinCitations(answer.citations)}`);
  }

  // Confidence with reason.
  const recoveryReason = bundle.confidenceReasons[0] ?? 'chain recovered';
  lines.push(`Confidence:  ${answer.confidence.toUpperCase()}  (${recoveryReason})`);
  lines.push(SEP);

  return lines.join('\n');
}

/**
 * Shape 4 — Honest LOW.
 *
 * ```
 * why src/legacy/cache.ts:31
 * -----------------------------------------------------
 * Reason:      No recorded decision found.
 * Trace:       line history was squash-merged; best guess commit a91f2 ("update").
 * Evidence:    no linked PR or issue.
 * Confidence:  LOW
 * -----------------------------------------------------
 * ```
 */
function renderLow(bundle: EvidenceBundle, answer: WhyAnswer): string {
  const lines: string[] = [];

  lines.push(`why ${bundle.path}:${bundle.line}`);
  lines.push(SEP);
  lines.push(`Reason:      ${answer.reason}`);

  // Trace: explain the broken trail.
  if (bundle.confidenceReasons.length > 0 || bundle.candidates.length > 0) {
    const traceReason = bundle.confidenceReasons[0] ?? 'history unclear';
    const guessCommit = bundle.candidates[0];
    if (guessCommit) {
      const msg = guessCommit.commit.message.split('\n')[0] ?? guessCommit.commit.message;
      const truncated = msg.length > 40 ? msg.slice(0, 37) + '…' : msg;
      lines.push(
        `Trace:       ${traceReason}; best guess commit ${sha7(guessCommit.commit.sha)} ("${truncated}").`,
      );
    } else {
      lines.push(`Trace:       ${traceReason}.`);
    }
  }

  // Evidence: say what's missing.
  const noPr = bundle.introducingPr === undefined;
  const noIssue = bundle.linkedIssue === undefined;
  if (noPr && noIssue) {
    lines.push('Evidence:    no linked PR or issue.');
  } else if (noPr) {
    lines.push('Evidence:    no linked PR.');
  } else if (noIssue) {
    lines.push(`Evidence:    PR #${bundle.introducingPr!.number} (no linked issue).`);
  }

  lines.push('Confidence:  LOW');
  lines.push(SEP);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceToLabel(source: EvidenceBundle['usedSource']): string {
  switch (source) {
    case 'review':
      return 'review comment';
    case 'pr_body':
      return 'PR description';
    case 'issue':
      return 'linked issue';
    case 'commit_message':
      return 'commit message';
    case 'behavioral':
      return 'code change';
  }
}

function confidenceToRiskHint(confidence: WhyAnswer['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
}

/** Extract cherry-pick source SHA from a commit message if present. */
function extractCherryPickSha(message: string): string | null {
  const match = /\(cherry picked from commit ([0-9a-f]+)\)/i.exec(message);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// TerminalFormatter
// ---------------------------------------------------------------------------

export class TerminalFormatter implements Formatter {
  why(bundle: EvidenceBundle, answer: WhyAnswer): string {
    const shape = resolveShape(bundle, answer);
    switch (shape) {
      case 'clear':
        return renderClear(bundle, answer);
      case 'ambiguous':
        return renderAmbiguous(bundle, answer);
      case 'recovered':
        return renderRecovered(bundle, answer);
      case 'low':
        return renderLow(bundle, answer);
    }
  }

  risk(report: RiskReport): string {
    return formatRisk(report);
  }

  explainCommit(explanation: CommitExplanation, answer: WhyAnswer): string {
    return renderExplainCommit(explanation, answer);
  }
}

// ---------------------------------------------------------------------------
// explain-commit formatter
// ---------------------------------------------------------------------------

/**
 * Format a CommitExplanation into terminal output.
 *
 * Example:
 * ```
 * explain-commit 7f2a9c1
 * -----------------------------------------------------
 * Commit:      7f2a9c1  2024-01-14  alice
 * Message:     fix: prevent duplicate concurrent sessions
 * PR:          #184 — Prevent duplicate concurrent customer sessions
 * Issue:       #102 — Duplicate session bug
 * Files touched: 3 (session-store.ts, login.controller.ts, +1 more)
 * Risk hint:   high
 * Confidence:  HIGH
 * -----------------------------------------------------
 * ```
 */
function renderExplainCommit(explanation: CommitExplanation, answer: WhyAnswer): string {
  const lines: string[] = [];
  const commit = explanation.commit;

  lines.push(`explain-commit ${sha7(commit.sha)}`);
  lines.push(SEP);
  lines.push(
    `Commit:      ${sha7(commit.sha)}  ${fmtDate(commit.authoredAt)}  ${commit.authorLogin}`,
  );

  const msg = commit.message.split('\n')[0] ?? commit.message;
  lines.push(`Message:     ${msg}`);

  if (explanation.pr) {
    lines.push(`PR:          #${explanation.pr.number} — ${explanation.pr.title}`);
  }
  if (explanation.linkedIssue) {
    lines.push(`Issue:       #${explanation.linkedIssue.number} — ${explanation.linkedIssue.title}`);
  }

  // Files touched.
  const total = explanation.filesTouched;
  const shown = explanation.coChangedPaths.slice(0, 2);
  const extra = total - shown.length;
  const filesStr =
    shown.length > 0
      ? `${total} (${shown.join(', ')}${extra > 0 ? `, +${extra} more` : ''})`
      : String(total);
  lines.push(`Files touched: ${filesStr}`);

  // Top review comment.
  if (explanation.reviewComments.length > 0) {
    const rc = explanation.reviewComments[0]!;
    lines.push(`Review note: "${rc.body.trim()}"  (reviewer: ${rc.author})`);
  }

  // LLM reason if present.
  if (!answer.noEvidence && answer.reason) {
    lines.push(`Summary:     ${answer.reason}`);
  }

  lines.push(`Risk hint:   ${explanation.riskHint}`);
  lines.push(`Confidence:  ${answer.confidence.toUpperCase()}`);
  lines.push(SEP);

  return lines.join('\n');
}
