/**
 * Domain types — implement.md Part C.1.
 *
 * OWNED BY LEAD (Maestro). Only the Lead edits this file. Any change a specialist
 * needs goes through a `contract` issue (implement.md Part I.6). These types are the
 * vocabulary every module speaks.
 */

export type HostKind = 'github' | 'gitlab' | 'bitbucket';

export interface RepoRef {
  host: HostKind;
  owner: string;
  name: string;
  /** Absolute path to the local clone root. */
  root: string;
  defaultBranch: string;
}

/** "owner/name" — the canonical repo key used everywhere in the Store. */
export type RepoSlug = string;

export interface Commit {
  sha: string;
  authorLogin: string;
  authorName: string;
  /** ISO-8601 timestamp. */
  authoredAt: string;
  message: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  authorLogin: string;
  mergedSha?: string;
  state: string;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
}

export interface ReviewComment {
  author: string;
  body: string;
  path?: string;
  line?: number;
  /** ISO-8601 timestamp. */
  submittedAt: string;
}

export interface Engineer {
  login: string;
  name?: string;
}

export type Confidence = 'high' | 'medium' | 'low';

/**
 * Provenance is probabilistic, not deterministic. The tracer produces ranked
 * candidates for the commit that introduced the logic, never a single guess.
 */
export interface Candidate {
  commit: Commit;
  /** 0..1, see implement.md Part D.2. */
  score: number;
  kind: 'behavioral' | 'cosmetic';
  /** Why it scored this way — human readable. */
  reasons: string[];
}

export interface RankedComment extends ReviewComment {
  /** 0..1, see implement.md Part D.3. */
  relevance: number;
}

export type EvidenceSource = 'review' | 'pr_body' | 'issue' | 'commit_message' | 'behavioral';

/** What else changed in the introducing commit. Feeds the Narrator (implement.md D.6). */
export interface BehavioralEvidence {
  introducingSha?: string;
  /** Other files touched in the introducing commit. */
  coChangedPaths: string[];
  /** e.g. "added retry logic", derived from the diff by token pattern matching. */
  summaryHints: string[];
}

/** Result of `why path:line`, before the LLM touches it. */
export interface EvidenceBundle {
  path: string;
  line: number;
  /** Ranked, best first. */
  candidates: Candidate[];
  /** candidates[0] when separation is clear enough (Part D.2). */
  primary?: Candidate;
  /** Behavioral commits in order, shown for ambiguous cases. */
  lineage: Commit[];
  introducingPr?: PullRequest;
  linkedIssue?: Issue;
  /** Ranked, best first. */
  reviewComments: RankedComment[];
  behavioral: BehavioralEvidence;
  /** Highest-signal source actually available. */
  usedSource: EvidenceSource;
  /** True if PR/issue linkage could not be recovered. */
  chainBroken: boolean;
  confidence: Confidence;
  /** Why this tier, human readable. */
  confidenceReasons: string[];
}

/** Result of `explain-commit sha`. Reuses the linker, behavioral, and summarizer. */
export interface CommitExplanation {
  commit: Commit;
  pr?: PullRequest;
  linkedIssue?: Issue;
  reviewComments: RankedComment[];
  filesTouched: number;
  coChangedPaths: string[];
  /** Crude blast-radius read from files touched + churn. */
  riskHint: Confidence;
}

export interface RiskReport {
  path: string;
  /** 0..10. */
  score: number;
  signals: {
    distinctAuthors: number;
    commitsLast90d: number;
    /** Files that historically change together. */
    coupledPaths: string[];
    /** Commits referencing revert/hotfix/incident. */
    incidentLinkedCommits: number;
    lastTouchedDaysAgo: number;
  };
  notes: string[];
}
