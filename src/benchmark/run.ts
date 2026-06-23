/**
 * Benchmark runner (`pnpm bench`) — A7 (Auditor), issue #62 / Part H. PHASE 0 STUB.
 * Loads benchmark/dataset/<repo>.json, runs the engine with the fake LLM, computes metrics,
 * prints the report. Runs on the own-repos subset by default.
 */

import { NotImplemented } from '../core/index.js';

export interface DatasetItem {
  repo: string;
  commitPin: string;
  path: string;
  line: number;
  questionType: 'why-line';
  expected: { introducingPr?: number; introducingIssue?: number };
  notes?: string;
}

export async function runBenchmark(_datasetGlob?: string): Promise<void> {
  throw new NotImplemented('runBenchmark (#62)');
}

// Allow `tsx src/benchmark/run.ts` / `pnpm bench`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
