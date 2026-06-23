/**
 * Loader for recorded host responses — issue #33.
 *
 * Reads the JSON files under `hostResponses/` and returns typed, in-memory
 * maps that a fake HostClient implementation can use for offline testing.
 *
 * SHA placeholders (`__PLACEHOLDER_<label>__`) in JSON values are replaced at
 * load-time with real SHAs from a builder's SHA map so the recorded responses
 * remain valid regardless of the actual commit SHAs.
 *
 * Usage:
 *   const shas = buildSquashRepo(dir);
 *   const hr = loadHostResponses(shas);
 *   // hr.prForCommit(shas.squash)  →  PullRequest | null
 *
 * Ownership: test/fixtures/ ONLY.  Do NOT edit src/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Commit, Issue, PullRequest, ReviewComment } from '../../src/core/types.js';

const RESPONSES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'hostResponses');

// ---------------------------------------------------------------------------
// Raw JSON shape helpers
// ---------------------------------------------------------------------------

interface RawPrForCommitFile {
  responses: Record<string, PullRequest | null>;
}

interface RawIssuesByPrFile {
  responses: Record<string, Issue[]>;
}

interface RawReviewCommentsFile {
  responses: Record<string, Array<ReviewComment & { path: string | null; line: number | null }>>;
}

interface RawPrCommitsFile {
  responses: Record<string, Commit[]>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HostResponses {
  /**
   * Returns the PR for a given commit SHA, or null if none.
   * Mirrors `HostClient.prForCommit`.
   */
  prForCommit(sha: string): PullRequest | null;

  /**
   * Returns the issues referenced by a PR.
   * Mirrors `HostClient.issuesReferencedByPr`.
   */
  issuesReferencedByPr(prNumber: number): Issue[];

  /**
   * Returns the review comments for a PR.
   * Mirrors `HostClient.reviewComments`.
   */
  reviewComments(prNumber: number): ReviewComment[];

  /**
   * Returns the original commits of a PR (used for squash recovery).
   * Mirrors `HostClient.prCommits`.
   */
  prCommits(prNumber: number): Commit[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all recorded host responses, substituting real SHAs for placeholders.
 *
 * @param shaMap  The label→SHA map returned by a repo builder.  All
 *                `__PLACEHOLDER_<label>__` tokens in the JSON are replaced
 *                with the corresponding SHA.
 */
export function loadHostResponses(shaMap: Record<string, string>): HostResponses {
  const rawPrForCommit = JSON.parse(
    fs.readFileSync(path.join(RESPONSES_DIR, 'prForCommit.json'), 'utf8'),
  ) as RawPrForCommitFile;
  const rawIssues = JSON.parse(
    fs.readFileSync(path.join(RESPONSES_DIR, 'issuesReferencedByPr.json'), 'utf8'),
  ) as RawIssuesByPrFile;
  const rawReviews = JSON.parse(
    fs.readFileSync(path.join(RESPONSES_DIR, 'reviewComments.json'), 'utf8'),
  ) as RawReviewCommentsFile;
  const rawPrCommits = JSON.parse(
    fs.readFileSync(path.join(RESPONSES_DIR, 'prCommits.json'), 'utf8'),
  ) as RawPrCommitsFile;

  // Substitute placeholders in the JSON serialisation, then re-parse.
  function substitute(obj: unknown): unknown {
    const json = JSON.stringify(obj);
    // Labels contain only word chars and hyphens (no underscores), so [\w-]+ is safe.
    const resolved = json.replace(/__PLACEHOLDER_([\w-]+)__/g, (_match, label: string) => {
      return shaMap[label] ?? _match;
    });
    return JSON.parse(resolved) as unknown;
  }

  const prForCommitData = substitute(rawPrForCommit.responses) as Record<string, PullRequest | null>;
  const issuesData = substitute(rawIssues.responses) as Record<string, Issue[]>;
  const reviewsData = substitute(rawReviews.responses) as Record<
    string,
    Array<ReviewComment & { path: string | null; line: number | null }>
  >;
  const prCommitsData = substitute(rawPrCommits.responses) as Record<string, Commit[]>;

  // Build a reverse map: SHA → PR for prForCommit lookups.
  const shaTopr = new Map<string, PullRequest | null>();
  for (const [_key, pr] of Object.entries(prForCommitData)) {
    if (pr?.mergedSha) {
      shaTopr.set(pr.mergedSha, pr);
    }
  }
  // Also index null entries explicitly: if the JSON key contains a SHA-label
  // we know about, record that SHA as having no PR.
  for (const [key, pr] of Object.entries(prForCommitData)) {
    if (pr === null) {
      // The key format is "<repo>__<label>" — resolve label to SHA if present.
      const parts = key.split('__');
      const label = parts[parts.length - 1];
      if (label && shaMap[label]) {
        shaTopr.set(shaMap[label], null);
      }
    }
  }

  function normaliseComment(
    c: ReviewComment & { path: string | null; line: number | null },
  ): ReviewComment {
    const out: ReviewComment = {
      author: c.author,
      body: c.body,
      submittedAt: c.submittedAt,
    };
    if (c.path !== null) out.path = c.path;
    if (c.line !== null) out.line = c.line;
    return out;
  }

  return {
    prForCommit(sha: string): PullRequest | null {
      if (shaTopr.has(sha)) return shaTopr.get(sha) ?? null;
      return null;
    },

    issuesReferencedByPr(prNumber: number): Issue[] {
      return issuesData[String(prNumber)] ?? [];
    },

    reviewComments(prNumber: number): ReviewComment[] {
      const raw = reviewsData[String(prNumber)] ?? [];
      return raw.map(normaliseComment);
    },

    prCommits(prNumber: number): Commit[] {
      return prCommitsData[String(prNumber)] ?? [];
    },
  };
}
