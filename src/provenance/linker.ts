/**
 * Evidence linker + chain recovery — A2 (Tracer), issue #43 / Part D.4. PHASE 0 STUB.
 * commit → PR → issue → review, plus squash / cherry-pick / backport recovery and the
 * source ladder. Sets `usedSource` and `chainBroken`.
 */

import type {
  EvidenceSource,
  GitClient,
  HostClient,
  Issue,
  PullRequest,
  RankedComment,
  Store,
} from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface LinkedDecision {
  introducingPr?: PullRequest;
  linkedIssue?: Issue;
  reviewComments: RankedComment[];
  usedSource: EvidenceSource;
  chainBroken: boolean;
  /** Human-readable notes about how the chain was recovered (e.g. via cherry-pick). */
  notes: string[];
}

export class EvidenceLinker {
  constructor(
    private readonly git: GitClient,
    private readonly host: HostClient,
    private readonly store: Store,
    private readonly repo: string,
  ) {
    void this.git;
    void this.host;
    void this.store;
    void this.repo;
  }

  /** Recover the decision chain for the introducing commit `sha`. */
  link(_sha: string): Promise<LinkedDecision> {
    throw new NotImplemented('EvidenceLinker.link (#43)');
  }
}
