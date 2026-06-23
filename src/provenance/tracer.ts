/**
 * Line tracer with cross-file stitch — A2 (Tracer), issue #41 / Part D (steps 1–5).
 * PHASE 0 STUB. THE REAL ENGINE: in-file `-L` lineage, file-introduction wall detection,
 * pickaxe cross-file origin, candidate-set construction. Build first, benchmark relentlessly.
 */

import type { Candidate, Commit, GitClient } from '../core/index.js';
import { NotImplemented } from '../core/index.js';

export interface TraceResult {
  /** Behavioral commits in order (oldest → newest), shown for ambiguous cases. */
  lineage: Commit[];
  /** Every behavioral commit becomes a candidate (scored later in score.ts). */
  candidates: Candidate[];
  /** Did the line resolve cleanly (no broken wall, no failed stitch)? */
  cleanTrace: boolean;
  /** Ambiguous boundaries crossed during tracing (moves, stitches). */
  ambiguousBoundaries: number;
}

export class LineTracer {
  constructor(private readonly git: GitClient) {
    void this.git;
  }

  trace(_path: string, _line: number): Promise<TraceResult> {
    throw new NotImplemented('LineTracer.trace (#41)');
  }
}
