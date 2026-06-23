/**
 * Summarizer — A6 (Narrator), issues #17/#18.
 *
 * Wraps an LlmProvider: builds the prompt (prompts.ts), calls the provider, parses strict
 * JSON defensively (strip code fences, validate shape, fall back to noEvidence on failure),
 * and enforces citations (drop any citation not present in the bundle — Part F.3).
 */

import type { EvidenceBundle, LlmProvider, LlmSummarizer, WhyAnswer } from '../core/index.js';
import type { Confidence } from '../core/types.js';
import { buildWhyPrompt } from './prompts.js';

/** Fixed small token budget for summarization (not generation). */
const DEFAULT_MAX_TOKENS = 256;

export interface SummarizerOptions {
  maxTokens?: number;
}

export class Summarizer implements LlmSummarizer {
  constructor(
    private readonly provider: LlmProvider,
    private readonly opts: SummarizerOptions = {},
  ) {}

  async summarizeWhy(bundle: EvidenceBundle): Promise<WhyAnswer> {
    const { system, user } = buildWhyPrompt(bundle);
    const maxTokens = this.opts.maxTokens ?? DEFAULT_MAX_TOKENS;

    let raw: string;
    try {
      raw = await this.provider.complete({ system, user, maxTokens });
    } catch {
      return fallbackAnswer(bundle);
    }

    const parsed = parseWhyAnswer(raw, bundle.confidence);
    if (parsed === null) {
      return fallbackAnswer(bundle);
    }

    // Citation enforcement: drop any citation not present in the bundle (Part F.3).
    const allowed = buildAllowedSet(bundle);
    const enforcedCitations = parsed.citations.filter((c) => isCitationAllowed(c, allowed));

    return {
      reason: parsed.reason,
      citations: enforcedCitations,
      confidence: parsed.confidence,
      noEvidence: parsed.noEvidence,
    };
  }
}

// ---------------------------------------------------------------------------
// Defensive JSON parser (#17)
// ---------------------------------------------------------------------------

/**
 * Parse a raw provider response into a WhyAnswer.
 * - Strips ```json … ``` fences.
 * - Validates shape.
 * - Returns null on any parse/validation failure.
 */
function parseWhyAnswer(raw: string, fallbackConfidence: Confidence): WhyAnswer | null {
  let text = raw.trim();

  // Strip code fences (```json … ``` or ``` … ```).
  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null) return null;

  const o = obj as Record<string, unknown>;

  const reason = typeof o['reason'] === 'string' ? o['reason'] : null;
  if (!reason) return null;

  const citations = Array.isArray(o['citations'])
    ? (o['citations'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const confidence = isConfidence(o['confidence']) ? o['confidence'] : fallbackConfidence;
  const noEvidence = typeof o['noEvidence'] === 'boolean' ? o['noEvidence'] : false;

  return { reason, citations, confidence, noEvidence };
}

function isConfidence(v: unknown): v is Confidence {
  return v === 'high' || v === 'medium' || v === 'low';
}

function fallbackAnswer(bundle: EvidenceBundle): WhyAnswer {
  return {
    reason: 'No recorded decision found.',
    citations: [],
    confidence: bundle.confidence,
    noEvidence: true,
  };
}

// ---------------------------------------------------------------------------
// Citation enforcement (#18)
// ---------------------------------------------------------------------------

interface AllowedSet {
  prNumbers: Set<number>;
  issueNumbers: Set<number>;
  commitShas: Set<string>; // normalized to lower-case 7-char prefix + longer forms
  reviewAuthors: Set<string>;
}

/**
 * Build the allowed citation set from all artifacts actually present in the bundle.
 */
function buildAllowedSet(bundle: EvidenceBundle): AllowedSet {
  const prNumbers = new Set<number>();
  const issueNumbers = new Set<number>();
  const commitShas = new Set<string>();
  const reviewAuthors = new Set<string>();

  if (bundle.introducingPr) {
    prNumbers.add(bundle.introducingPr.number);
  }
  if (bundle.linkedIssue) {
    issueNumbers.add(bundle.linkedIssue.number);
  }
  for (const c of bundle.candidates) {
    // Index all prefix lengths from 7 onward so short references match.
    const sha = c.commit.sha.toLowerCase();
    for (let len = 7; len <= sha.length; len++) {
      commitShas.add(sha.slice(0, len));
    }
  }
  for (const rc of bundle.reviewComments) {
    reviewAuthors.add(rc.author.toLowerCase());
  }
  // Also index behavioral introducing SHA if present.
  if (bundle.behavioral.introducingSha) {
    const sha = bundle.behavioral.introducingSha.toLowerCase();
    for (let len = 7; len <= sha.length; len++) {
      commitShas.add(sha.slice(0, len));
    }
  }
  // Lineage commits.
  for (const c of bundle.lineage) {
    const sha = c.sha.toLowerCase();
    for (let len = 7; len <= sha.length; len++) {
      commitShas.add(sha.slice(0, len));
    }
  }

  return { prNumbers, issueNumbers, commitShas, reviewAuthors };
}

/**
 * Returns true if the citation string refers to a real artifact in the bundle.
 *
 * Recognizes patterns:
 *   "PR #N"            → check prNumbers
 *   "Issue #N"         → check issueNumbers
 *   "commit <sha>"     → check commitShas (prefix match)
 *   "review by <name>" → check reviewAuthors
 */
function isCitationAllowed(citation: string, allowed: AllowedSet): boolean {
  const text = citation.trim();

  // PR #N
  const prMatch = /^PR\s+#(\d+)$/i.exec(text);
  if (prMatch?.[1] !== undefined) {
    return allowed.prNumbers.has(parseInt(prMatch[1], 10));
  }

  // Issue #N
  const issueMatch = /^Issue\s+#(\d+)$/i.exec(text);
  if (issueMatch?.[1] !== undefined) {
    return allowed.issueNumbers.has(parseInt(issueMatch[1], 10));
  }

  // commit <sha>
  const commitMatch = /^commit\s+([0-9a-f]+)$/i.exec(text);
  if (commitMatch?.[1] !== undefined) {
    const sha = commitMatch[1].toLowerCase();
    // Allow if any prefix of the citation sha is in our set, or vice versa.
    for (const allowed7 of allowed.commitShas) {
      const minLen = Math.min(sha.length, allowed7.length);
      if (sha.slice(0, minLen) === allowed7.slice(0, minLen)) {
        return true;
      }
    }
    return false;
  }

  // review by <author>
  const reviewMatch = /^review\s+by\s+(.+)$/i.exec(text);
  if (reviewMatch?.[1] !== undefined) {
    return allowed.reviewAuthors.has(reviewMatch[1].trim().toLowerCase());
  }

  // Unknown citation format — drop it (safe default).
  return false;
}
