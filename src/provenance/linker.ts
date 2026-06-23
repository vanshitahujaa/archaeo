/**
 * Evidence linker + chain recovery — A2 (Tracer), issue #23 / Part D.4.
 *
 * Recovers commit → PR → issue → review for the introducing commit, with fallbacks:
 *  - Squash-merge: a PR maps to multiple original commits (via host prCommits). We detect
 *    this and flag it as one ambiguous boundary, but the PR/issue/reviews still resolve.
 *  - Cherry-pick / backport: `(cherry picked from commit <sha>)` in the message → follow to
 *    the source commit and recover its PR/issue.
 *  - No linkage: fall back down the ladder review → pr_body → issue → commit_message →
 *    behavioral and set chainBroken.
 *
 * Sets `usedSource` (highest-signal source actually available) and `chainBroken` (true when
 * no PR or issue could be recovered). Host responses are cached in the Store so repeat runs
 * do not refetch (D.8).
 */

import type {
  Commit,
  EvidenceSource,
  GitClient,
  HostClient,
  Issue,
  PullRequest,
  RankedComment,
  Store,
} from '../core/index.js';
import { rankComments } from './comments.js';

export interface LinkedDecision {
  introducingPr?: PullRequest;
  linkedIssue?: Issue;
  reviewComments: RankedComment[];
  usedSource: EvidenceSource;
  chainBroken: boolean;
  /** Human-readable notes about how the chain was recovered (e.g. via cherry-pick). */
  notes: string[];
  /** The commit the chain ultimately resolved to (after following cherry-picks). */
  resolvedSha: string;
  /** True when an ambiguous recovery happened (squash/cherry-pick) — feeds confidence. */
  recoveredViaBoundary: boolean;
}

export class EvidenceLinker {
  constructor(
    private readonly git: GitClient,
    private readonly host: HostClient,
    private readonly store: Store,
    private readonly repo: string,
  ) {}

  /** Recover the decision chain for the introducing commit `sha`. */
  async link(sha: string): Promise<LinkedDecision> {
    const notes: string[] = [];
    let recoveredViaBoundary = false;
    let resolvedSha = sha;

    // 1) Try the PR directly for this commit.
    let pr = await this.host.prForCommit(sha);

    // 2) Cherry-pick / backport recovery: if no PR (or even if there is one), follow the
    //    canonical trailer to the source commit and prefer its PR.
    const cherrySource = await this.git.parseCherryPick(sha);
    if (cherrySource) {
      const srcPr = await this.host.prForCommit(cherrySource);
      if (srcPr) {
        pr = srcPr;
        resolvedSha = cherrySource;
        recoveredViaBoundary = true;
        notes.push(`chain recovered through cherry-pick from ${cherrySource.slice(0, 7)}`);
      } else if (!pr) {
        resolvedSha = cherrySource;
        recoveredViaBoundary = true;
        notes.push(`cherry-pick source ${cherrySource.slice(0, 7)} found but no PR linked`);
      }
    }

    // No PR at all → chain is broken; fall back to commit message / behavioral.
    if (!pr) {
      const commit = await this.git.getCommit(resolvedSha);
      const usedSource = this.fallbackSource(commit);
      if (usedSource === 'commit_message') {
        notes.push('no PR/issue; using commit message');
      } else {
        notes.push('no PR/issue and low-information commit message; using behavioral evidence');
      }
      return {
        reviewComments: [],
        usedSource,
        chainBroken: true,
        notes,
        resolvedSha,
        recoveredViaBoundary,
      };
    }

    // We have a PR. Cache it.
    await this.store.upsertPr(this.repo, pr);

    // 3) Squash detection: a PR with >1 original commits was squash-merged. The chain is
    //    intact but coarser, so we flag it as a recovered boundary.
    const prCommits = await this.host.prCommits(pr.number);
    if (prCommits.length > 1) {
      recoveredViaBoundary = true;
      notes.push(`squash-merge detected: PR #${pr.number} collapsed ${prCommits.length} commits`);
      await this.store.upsertCommits(this.repo, prCommits);
    }

    // 4) Linked issue(s) from the PR body / linked-issue API.
    const issues = await this.host.issuesReferencedByPr(pr);
    const linkedIssue = issues[0];
    if (linkedIssue) await this.store.upsertIssue(this.repo, linkedIssue);

    // 5) Review comments, ranked. Anchor on the paths the introducing commit touched.
    const rawComments = await this.host.reviewComments(pr.number);
    if (rawComments.length > 0) {
      await this.store.upsertReviewComments(this.repo, pr.number, rawComments);
    }
    const introducingPaths = await this.git.coChangedPaths(sha);
    const reviewComments = rankComments({ comments: rawComments, introducingPaths });

    // 6) Choose the highest-signal source actually available (the ladder, top-down).
    const usedSource = this.chooseSource(reviewComments, pr, linkedIssue);

    // Record the introduced_by edge for the graph seam.
    await this.store.addEdge(this.repo, {
      srcType: 'commit',
      srcId: resolvedSha,
      rel: 'introduced_by',
      dstType: 'pr',
      dstId: String(pr.number),
    });

    const result: LinkedDecision = {
      introducingPr: pr,
      reviewComments,
      usedSource,
      chainBroken: false,
      notes,
      resolvedSha,
      recoveredViaBoundary,
    };
    if (linkedIssue) result.linkedIssue = linkedIssue;
    return result;
  }

  /** When a full chain exists, pick the best source by the ladder (review → pr → issue). */
  private chooseSource(
    reviewComments: RankedComment[],
    pr: PullRequest,
    issue: Issue | undefined,
  ): EvidenceSource {
    const top = reviewComments[0];
    if (top && top.relevance >= 0.5) return 'review';
    if (pr.body && pr.body.trim().length > 0) return 'pr_body';
    if (issue) return 'issue';
    return 'commit_message';
  }

  /**
   * When no PR exists (broken chain), pick the best remaining source. A commit message is
   * only useful as decision evidence when it carries *causal/explanatory* language — a bare
   * conventional-commit subject ("feat(x): add y") describes WHAT changed, not WHY, so we
   * fall to behavioral evidence (co-changed paths + structural hints) instead.
   */
  private fallbackSource(commit: Commit | null): EvidenceSource {
    if (!commit) return 'behavioral';
    if (isLowInformationMessage(commit.message)) return 'behavioral';
    if (messageHasCausalSignal(commit.message)) return 'commit_message';
    return 'behavioral';
  }
}

/** True when a commit message explains *why* (causal language), not just *what* changed. */
export function messageHasCausalSignal(message: string): boolean {
  const m = message.toLowerCase();
  const CAUSAL = [
    'because',
    'prevent',
    'avoid',
    'fix ',
    'fixes ',
    'race',
    'deadlock',
    'regression',
    'so that',
    'to ensure',
    'otherwise',
    'guard',
    'duplicate',
    'concurrent',
    'idempoten',
    'closes #',
    'fixes #',
    'refs #',
  ];
  return CAUSAL.some((t) => m.includes(t));
}

/** Heuristic: a commit message that carries no decision signal ("fix stuff", "update", "wip"). */
export function isLowInformationMessage(message: string): boolean {
  const first = (message.split('\n')[0] ?? '').trim().toLowerCase();
  if (first.length === 0) return true;
  const LOW_INFO = [
    'fix stuff',
    'fix',
    'fixes',
    'update',
    'updates',
    'wip',
    'misc',
    'changes',
    'cleanup',
    'tweak',
    'tweaks',
    'minor',
    'stuff',
    'temp',
    'test',
    'asdf',
  ];
  if (LOW_INFO.includes(first)) return true;
  // Very short messages with no conventional-commit scope are low-information.
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !/^[a-z]+(\([^)]+\))?:/.test(first)) return true;
  return false;
}
