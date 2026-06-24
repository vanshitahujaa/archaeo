/**
 * Fake LLM provider — A6 (Narrator), issue #16.
 *
 * Deterministic output derived ONLY from the prompt (no randomness, no clocks), so
 * the entire system is testable with no network and no key (Part F.2).
 *
 * Strategy: parse the serialized EvidenceBundle out of the user prompt, then derive
 * `reason` from the strongest source via the ladder:
 *   review → pr_body → issue → commit_message → behavioral
 * `citations` come only from artifacts present in the bundle.
 * `confidence` echoes bundle.confidence.
 * `noEvidence` = true when there are no candidates and no sources.
 */

import type { LlmCompletionInput, LlmProvider } from '../../core/index.js';
import type { WhyAnswer } from '../../core/llm.interface.js';
import type { EvidenceBundle } from '../../core/types.js';

/** Tag the summarizer embeds so the fake provider can extract the bundle. */
export const BUNDLE_TAG = '__BUNDLE__:';

export class FakeProvider implements LlmProvider {
  readonly name = 'fake';

  complete(input: LlmCompletionInput): Promise<string> {
    const answer = deriveAnswer(input.user);
    return Promise.resolve(JSON.stringify(answer));
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deriveAnswer(userPrompt: string): WhyAnswer {
  // Extract the serialized bundle injected by buildWhyPrompt.
  const tagIdx = userPrompt.indexOf(BUNDLE_TAG);
  if (tagIdx === -1) {
    return noEvidenceAnswer('low');
  }

  let bundle: EvidenceBundle;
  try {
    const jsonStart = userPrompt.indexOf('{', tagIdx);
    const jsonEnd = userPrompt.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return noEvidenceAnswer('low');
    }
    bundle = JSON.parse(userPrompt.slice(jsonStart, jsonEnd + 1)) as EvidenceBundle;
  } catch {
    return noEvidenceAnswer('low');
  }

  // No evidence at all.
  if (bundle.candidates.length === 0 && bundle.reviewComments.length === 0 && !bundle.introducingPr && !bundle.linkedIssue) {
    return noEvidenceAnswer(bundle.confidence);
  }

  const citations = buildCitations(bundle);
  const reason = buildReason(bundle);

  return {
    reason,
    citations,
    confidence: bundle.confidence,
    noEvidence: false,
  };
}

function noEvidenceAnswer(confidence: EvidenceBundle['confidence']): WhyAnswer {
  return {
    reason: 'No recorded decision found.',
    citations: [],
    confidence,
    noEvidence: true,
  };
}

/**
 * Reduce a free-text evidence body (PR/issue body, commit message, review comment) to a
 * crisp first prose sentence, stripping markdown/bot noise (#45). The fake provider is not a
 * real LLM, but it should still read like a summary, not a raw paste of `## Summary`, blockquote
 * "tips", code fences, or HTML comments (e.g. CodeRabbit output).
 */
export function clean(text: string, maxLen = 160): string {
  let prose = '';
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#')) continue; // markdown heading
    if (l.startsWith('>')) continue; // blockquote (bot tips / quoted text)
    if (l.startsWith('<')) continue; // HTML comment / tag
    if (l.startsWith('```')) continue; // code fence
    if (l.startsWith('---') || l.startsWith('===')) continue; // rules / separators
    prose = /^[-*+]\s/.test(l) ? l.replace(/^[-*+]\s/, '') : l; // first bullet or first prose line
    break;
  }
  if (!prose) prose = text.trim().replace(/\s+/g, ' ');
  // Prefer the first sentence.
  const m = prose.match(/^(.*?[.!?])(\s|$)/);
  let out = (m?.[1] ?? prose).replace(/\s+/g, ' ').trim();
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
  return out;
}

/**
 * Build the reason string by walking the evidence ladder:
 *   review → pr_body → issue → commit_message → behavioral
 */
function buildReason(bundle: EvidenceBundle): string {
  const usedSource = bundle.usedSource;

  // 1. Review comment (highest signal).
  if (usedSource === 'review' && bundle.reviewComments.length > 0) {
    const top = bundle.reviewComments[0]!;
    const prPart = bundle.introducingPr ? ` (PR #${bundle.introducingPr.number})` : '';
    return `${clean(top.body)}${prPart}`;
  }

  // 2. PR body.
  if (usedSource === 'pr_body' && bundle.introducingPr) {
    const pr = bundle.introducingPr;
    return `${clean(pr.body)} (PR #${pr.number}: ${pr.title})`;
  }

  // 3. Linked issue.
  if (usedSource === 'issue' && bundle.linkedIssue) {
    const issue = bundle.linkedIssue;
    return `${clean(issue.body)} (Issue #${issue.number}: ${issue.title})`;
  }

  // 4. Commit message.
  if (usedSource === 'commit_message' && bundle.candidates.length > 0) {
    const top = bundle.candidates[0]!;
    return `${clean(top.commit.message)} (commit ${top.commit.sha.slice(0, 7)})`;
  }

  // 5. Behavioral hints.
  if (usedSource === 'behavioral') {
    const hints = bundle.behavioral.summaryHints;
    if (hints.length > 0) {
      const sha = bundle.behavioral.introducingSha ?? (bundle.candidates[0]?.commit.sha ?? '');
      const shaStr = sha ? ` (commit ${sha.slice(0, 7)})` : '';
      return `${hints.join('; ')}${shaStr}`;
    }
  }

  // Fallback: best available.
  if (bundle.candidates.length > 0) {
    const top = bundle.candidates[0]!;
    return `${clean(top.commit.message)} (commit ${top.commit.sha.slice(0, 7)})`;
  }

  return 'No recorded decision found.';
}

/**
 * Build citations from artifacts actually present in the bundle.
 * Only emit identifiers for artifacts that exist.
 */
function buildCitations(bundle: EvidenceBundle): string[] {
  const citations: string[] = [];

  if (bundle.introducingPr) {
    citations.push(`PR #${bundle.introducingPr.number}`);
  }
  if (bundle.linkedIssue) {
    citations.push(`Issue #${bundle.linkedIssue.number}`);
  }
  // Top candidate commit.
  if (bundle.candidates.length > 0) {
    const sha = bundle.candidates[0]!.commit.sha;
    citations.push(`commit ${sha.slice(0, 7)}`);
  }
  // Top review comment author (as corroborating citation).
  if (bundle.reviewComments.length > 0) {
    const rc = bundle.reviewComments[0]!;
    citations.push(`review by ${rc.author}`);
  }

  return citations;
}
