/**
 * Prompt construction — A6 (Narrator), issue #17 / Part F.1.
 *
 * The summarizer receives ONLY the EvidenceBundle, serialized. The system prompt enforces:
 * summarize using only the evidence, cite each artifact, set noEvidence when insufficient,
 * never add facts. Output is strict JSON matching WhyAnswer.
 */

import type { EvidenceBundle } from '../core/index.js';
import { BUNDLE_TAG } from './providers/fake.js';

export const SYSTEM_PROMPT = `You are a code-archaeology summarizer. Your ONLY job is to explain WHY a line of code exists, using ONLY the evidence provided in the user message. Rules:
1. Summarize — do NOT invent or infer facts not present in the evidence.
2. Every claim must cite a concrete artifact from the bundle: a commit SHA, PR number, issue number, or review comment.
3. If the evidence is insufficient to explain the decision, set noEvidence to true and reason to "No recorded decision found."
4. Confidence must match the bundle's confidence field — never upgrade it.
5. citations must list ONLY artifacts that actually appear in the provided evidence (PR numbers, issue numbers, commit SHAs, review authors).
6. Respond with ONLY valid JSON (no markdown fences, no prose) matching this shape:
   {"reason":"<1-3 sentences>","citations":["PR #N","Issue #N","commit <sha7>"],"confidence":"high"|"medium"|"low","noEvidence":false}`;

/**
 * Build the user prompt from the bundle. We embed the raw JSON under a known tag
 * so the FakeProvider can extract and deterministically derive the answer, and so
 * real providers have the full structured evidence.
 */
export function buildWhyPrompt(bundle: EvidenceBundle): { system: string; user: string } {
  const user = buildUserSection(bundle);
  return { system: SYSTEM_PROMPT, user };
}

// ---------------------------------------------------------------------------
// Internal serialization helpers
// ---------------------------------------------------------------------------

function buildUserSection(bundle: EvidenceBundle): string {
  const lines: string[] = [];

  lines.push(`# Evidence bundle for ${bundle.path}:${bundle.line}`);
  lines.push(`Confidence tier: ${bundle.confidence}`);
  if (bundle.confidenceReasons.length > 0) {
    lines.push(`Confidence reasons: ${bundle.confidenceReasons.join('; ')}`);
  }
  lines.push(`Used source: ${bundle.usedSource}`);
  lines.push(`Chain broken: ${bundle.chainBroken}`);
  lines.push('');

  // Candidates.
  if (bundle.candidates.length > 0) {
    lines.push('## Candidates (ranked best first)');
    for (const c of bundle.candidates) {
      lines.push(`- commit ${c.commit.sha.slice(0, 7)} by ${c.commit.authorLogin} on ${c.commit.authoredAt}`);
      lines.push(`  message: ${c.commit.message.trim()}`);
      lines.push(`  score: ${c.score}, kind: ${c.kind}`);
      if (c.reasons.length > 0) {
        lines.push(`  reasons: ${c.reasons.join('; ')}`);
      }
    }
    lines.push('');
  }

  // Introducing PR.
  if (bundle.introducingPr) {
    const pr = bundle.introducingPr;
    lines.push(`## Introducing PR #${pr.number}: ${pr.title}`);
    lines.push(`Author: ${pr.authorLogin}, State: ${pr.state}`);
    if (pr.body.trim()) {
      lines.push(`Body: ${pr.body.trim()}`);
    }
    lines.push('');
  }

  // Linked issue.
  if (bundle.linkedIssue) {
    const issue = bundle.linkedIssue;
    lines.push(`## Linked Issue #${issue.number}: ${issue.title}`);
    lines.push(`State: ${issue.state}`);
    if (issue.body.trim()) {
      lines.push(`Body: ${issue.body.trim()}`);
    }
    lines.push('');
  }

  // Review comments.
  if (bundle.reviewComments.length > 0) {
    lines.push('## Review comments (ranked best first)');
    for (const rc of bundle.reviewComments.slice(0, 3)) {
      lines.push(`- ${rc.author} (relevance ${rc.relevance}): ${rc.body.trim()}`);
    }
    lines.push('');
  }

  // Behavioral evidence.
  if (bundle.behavioral.summaryHints.length > 0 || bundle.behavioral.coChangedPaths.length > 0) {
    lines.push('## Behavioral evidence');
    if (bundle.behavioral.introducingSha) {
      lines.push(`Introducing SHA: ${bundle.behavioral.introducingSha}`);
    }
    if (bundle.behavioral.summaryHints.length > 0) {
      lines.push(`Hints: ${bundle.behavioral.summaryHints.join('; ')}`);
    }
    if (bundle.behavioral.coChangedPaths.length > 0) {
      lines.push(`Co-changed paths: ${bundle.behavioral.coChangedPaths.join(', ')}`);
    }
    lines.push('');
  }

  // Lineage (for ambiguous cases).
  if (bundle.lineage.length > 0) {
    lines.push('## Commit lineage');
    for (const c of bundle.lineage.slice(0, 5)) {
      lines.push(`- ${c.sha.slice(0, 7)} ${c.authoredAt}: ${c.message.trim()}`);
    }
    lines.push('');
  }

  // Embed the raw bundle JSON so FakeProvider can extract it deterministically.
  lines.push(`${BUNDLE_TAG}${JSON.stringify(bundle)}`);

  return lines.join('\n');
}
