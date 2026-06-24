/**
 * Review comment relevance ranking — A2 (Tracer), issue #24 / Part D.3.
 *
 * Deterministic (no LLM, to preserve the no-invention rule). A PR can have hundreds of
 * comments, most noise. We score each comment in 0..1 from named signals and keep the
 * top 1–2. This is the difference between surfacing "this fixes duplicate session
 * creation" and "nit: spacing."
 *
 * Signals (Part D.3):
 *  - anchored to a path touched by the introducing commit (strong)
 *  - contains causal / explanatory language (because, fixes, prevents, otherwise, race,…)
 *  - length above a threshold (one-word comments are noise)
 *  - author is a human reviewer, not a bot
 *  - downweight canned phrases (lgtm, nit, style, typo, ship it)
 */

import type { RankedComment, ReviewComment } from '../core/index.js';

/** Named weights for comment relevance (Part D.3). Tunable. */
export const COMMENT_WEIGHTS = {
  anchored: 0.3,
  causalLanguage: 0.35,
  substantialLength: 0.2,
  humanAuthor: 0.15,
} as const;

/** Penalty applied when the comment is a canned/low-signal phrase. */
export const CANNED_PENALTY = 0.6;

/**
 * Penalty applied when the comment's author is a bot (#48). Withholding the small
 * `humanAuthor` bonus is not enough: a long, causal-sounding bot review (e.g. CodeRabbit)
 * could still outrank a real reviewer. This penalty ensures a human comment of equal content
 * always wins, and a pure-noise bot comment drops out entirely.
 */
export const BOT_PENALTY = 0.5;

/** Minimum body length (chars) to count as substantial. */
export const SUBSTANTIAL_LENGTH = 40;

/** How many ranked comments to keep (Part D.3: top 1–2). */
export const KEEP_TOP = 2;

const CAUSAL_TERMS = [
  'because',
  'fixes',
  'fix ',
  'prevents',
  'prevent',
  'otherwise',
  'race',
  'deadlock',
  'regression',
  'intentionally',
  'avoid',
  'duplicate',
  'concurrent',
  'idempoten',
  'so that',
  'to ensure',
  'guard',
  'without',
];

const CANNED_PHRASES = ['lgtm', 'nit', 'style', 'typo', 'ship it', '+1', '👍', 'looks good'];

/** True when the comment body is essentially a canned phrase (after trimming). */
function isCanned(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (b.length === 0) return true;
  // Exact or near-exact match to a canned phrase, or very short.
  if (CANNED_PHRASES.includes(b)) return true;
  if (b.length <= 4) return true;
  // Starts with "nit:" / "style:" etc.
  return /^(nit|style|typo|lgtm|ship it)\b[:\s]/.test(b);
}

function hasCausalLanguage(body: string): boolean {
  const b = body.toLowerCase();
  return CAUSAL_TERMS.some((t) => b.includes(t));
}

export interface RankCommentsInput {
  comments: ReviewComment[];
  /** Paths/lines touched by the introducing commit, used to detect anchored comments. */
  introducingPaths?: string[];
}

/** Score a single comment in 0..1 against the introducing-commit context. */
export function scoreComment(comment: ReviewComment, introducingPaths: string[]): number {
  let score = 0;
  const anchored = comment.path !== undefined && introducingPaths.includes(comment.path);
  if (anchored) score += COMMENT_WEIGHTS.anchored;
  if (hasCausalLanguage(comment.body)) score += COMMENT_WEIGHTS.causalLanguage;
  if (comment.body.trim().length >= SUBSTANTIAL_LENGTH) score += COMMENT_WEIGHTS.substantialLength;
  if (isBotAuthor(comment.author)) {
    // Bots get no human-author bonus AND a hard penalty so they never outrank a human (#48).
    score -= BOT_PENALTY;
  } else {
    score += COMMENT_WEIGHTS.humanAuthor;
  }
  if (isCanned(comment.body)) score -= CANNED_PENALTY;
  return Math.max(0, Math.min(1, score));
}

/** Robust bot detection (the public name used by callers). */
export function isBotAuthor(author: string): boolean {
  const a = author.trim().toLowerCase();
  if (a.length === 0) return false;
  // [bot] suffix, a -bot / _bot / .bot segment, or the literal "bot".
  return a === 'bot' || a.endsWith('[bot]') || /[-_.]bot$/.test(a) || /\bbot\b/.test(a);
}

export function rankComments(input: RankCommentsInput): RankedComment[] {
  const introducingPaths = input.introducingPaths ?? [];
  const ranked: RankedComment[] = input.comments
    .map((c) => ({ ...c, relevance: scoreComment(c, introducingPaths) }))
    .filter((c) => c.relevance > 0)
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      // Tie-break: earlier comment first (stable, deterministic).
      return a.submittedAt.localeCompare(b.submittedAt);
    });
  return ranked.slice(0, KEEP_TOP);
}
