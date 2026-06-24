/**
 * Benchmark runner (`pnpm bench`) — A7 (Auditor), issues #35 / #62 / Part H.
 *
 * Loads a Part H.1 dataset and runs the REAL `Engine.explainLine` against each item, then
 * prints a top-1 / top-3 / calibration report (Part H.2/H.3).
 *
 * Two corpora:
 *  - OFFLINE FIXTURES (default, CI-safe): builds each synthetic fixture repo in a temp dir,
 *    wires a real LocalGitClient + SqliteStore(':memory:') + an offline HostClient backed by
 *    test/fixtures/loadHostResponses, runs the engine, and compares to the ground truth.
 *    No network, deterministic.
 *  - REAL REPO (opt-in): set ARCHAEO_BENCH_REAL=1, ARCHAEO_BENCH_REPO_PATH=<clone>, and
 *    GITHUB_TOKEN. Targets benchmark/dataset/vanshitahujaa__archaeo.json against a real clone.
 *    Skipped (with a printed note) when those are absent, so the default run stays offline.
 *
 * Ownership: src/benchmark/ + benchmark/dataset/ + test/fixtures/. Does NOT touch the engine.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Commit,
  EvidenceBundle,
  HostClient,
  Issue,
  PullRequest,
  ReviewComment,
} from '../core/index.js';
import { Engine } from '../provenance/engine.js';
import { LocalGitClient } from '../integration/git/gitClient.js';
import { SqliteStore } from '../storage/sqliteStore.js';

import {
  buildCherryPickRepo,
  buildCosmeticOnlyRepo,
  buildMissingPrRepo,
  buildMoveToUtilityRepo,
  buildRenameRepo,
  buildSquashRepo,
} from '../../test/fixtures/buildRepo.js';
import { loadHostResponses } from '../../test/fixtures/loadHostResponses.js';

import { computeMetrics, type BenchItemResult, type Metrics } from './metrics.js';
import { renderReport } from './report.js';

// ---------------------------------------------------------------------------
// Part H.1 dataset item
// ---------------------------------------------------------------------------

export interface DatasetItem {
  /** For fixtures, the builder name; for real repos, "owner/name". */
  repo: string;
  /** Pinned SHA (real repos) or stable label (fixtures). */
  commitPin: string;
  path: string;
  line: number;
  questionType: 'why-line';
  expected: { introducingPr?: number; introducingIssue?: number };
  notes?: string;
}

interface FixturesDatasetFile {
  items: DatasetItem[];
}

// ---------------------------------------------------------------------------
// Locate benchmark/dataset relative to this source file (works under tsx).
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = path.resolve(HERE, '../../benchmark/dataset');

// ---------------------------------------------------------------------------
// Fixture builders, keyed by the `repo` string used in fixtures.json.
// ---------------------------------------------------------------------------

type Builder = (dir: string) => Record<string, string>;

const FIXTURE_BUILDERS: Record<string, Builder> = {
  rename: buildRenameRepo,
  'move-to-utility': buildMoveToUtilityRepo,
  squash: buildSquashRepo,
  'cherry-pick': buildCherryPickRepo,
  'cosmetic-only': buildCosmeticOnlyRepo,
  'missing-pr': buildMissingPrRepo,
};

// ---------------------------------------------------------------------------
// Offline HostClient backed by recorded responses.
// ---------------------------------------------------------------------------

function recordedHost(shas: Record<string, string>): HostClient {
  const hr = loadHostResponses(shas);
  return {
    async prForCommit(sha: string): Promise<PullRequest | null> {
      return hr.prForCommit(sha);
    },
    async issuesReferencedByPr(pr: PullRequest): Promise<Issue[]> {
      return hr.issuesReferencedByPr(pr.number);
    },
    async reviewComments(prNumber: number): Promise<ReviewComment[]> {
      return hr.reviewComments(prNumber);
    },
    async prCommits(prNumber: number): Promise<Commit[]> {
      return hr.prCommits(prNumber);
    },
  };
}

// ---------------------------------------------------------------------------
// Extract the answer signals from an EvidenceBundle.
// ---------------------------------------------------------------------------

/** The engine's chosen introducing PR, if any (the recovered linkage on the primary). */
function chosenPr(bundle: EvidenceBundle): number | undefined {
  return bundle.introducingPr?.number;
}

/**
 * Top-3 candidate PRs. The engine recovers exactly one introducing PR per bundle (it links
 * the top candidate, not every candidate), so the realistic "top-3 PRs" here is the single
 * recovered PR if present. We keep the array shape so the metric generalizes once the engine
 * exposes per-candidate linkage; today top-1 and top-3 coincide on the fixtures.
 */
function topPrs(bundle: EvidenceBundle): number[] {
  const out: number[] = [];
  if (bundle.introducingPr) out.push(bundle.introducingPr.number);
  return out;
}

// ---------------------------------------------------------------------------
// Run one item against an already-built engine.
// ---------------------------------------------------------------------------

async function runItem(engine: Engine, item: DatasetItem): Promise<BenchItemResult> {
  const bundle = await engine.explainLine(item.path, item.line);
  const result: BenchItemResult = {
    id: `${item.repo}:${item.path}:${item.line}`,
    topPrs: topPrs(bundle),
    confidence: bundle.confidence,
  };
  const got = chosenPr(bundle);
  if (got !== undefined) result.chosenPr = got;
  if (item.expected.introducingPr !== undefined) result.expectedPr = item.expected.introducingPr;
  return result;
}

// ---------------------------------------------------------------------------
// OFFLINE FIXTURES corpus.
// ---------------------------------------------------------------------------

export function loadFixturesDataset(): DatasetItem[] {
  const file = path.join(DATASET_DIR, 'fixtures.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as FixturesDatasetFile;
  return raw.items;
}

export async function runFixturesBenchmark(): Promise<{
  results: BenchItemResult[];
  metrics: Metrics;
}> {
  const items = loadFixturesDataset();
  const results: BenchItemResult[] = [];
  const tmpDirs: string[] = [];

  try {
    for (const item of items) {
      const builder = FIXTURE_BUILDERS[item.repo];
      if (!builder) {
        throw new Error(
          `Unknown fixture builder '${item.repo}' in fixtures.json (item ${item.path}:${item.line})`,
        );
      }
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archaeo-bench-'));
      tmpDirs.push(dir);
      const shas = builder(dir);

      const git = new LocalGitClient({ cwd: dir });
      const store = new SqliteStore({ dbPath: ':memory:' });
      await store.init();
      const engine = new Engine({ git, host: recordedHost(shas), store, repo: item.repo });

      results.push(await runItem(engine, item));
      await store.close();
    }
  } finally {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  }

  return { results, metrics: computeMetrics(results) };
}

// ---------------------------------------------------------------------------
// REAL-REPO corpus (opt-in). Skipped unless explicitly enabled + configured.
// ---------------------------------------------------------------------------

export interface RealRepoConfig {
  /** Absolute path to a local clone of the repo under test. */
  repoPath: string;
  /** GitHub token (the engine's host calls need it). */
  token: string;
}

/** Read real-repo config from the environment, or null if not opted in / not configured. */
export function realRepoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RealRepoConfig | null {
  if (env['ARCHAEO_BENCH_REAL'] !== '1') return null;
  const repoPath = env['ARCHAEO_BENCH_REPO_PATH'];
  const token = env['GITHUB_TOKEN'];
  if (!repoPath || !token) return null;
  return { repoPath, token };
}

// ---------------------------------------------------------------------------
// Top-level entry: print the offline report; note the opt-in real-repo subset.
// ---------------------------------------------------------------------------

export async function runBenchmark(): Promise<Metrics> {
  const { results, metrics } = await runFixturesBenchmark();
  const report = renderReport(metrics, { corpus: 'offline fixtures', results });
  process.stdout.write(report + '\n');

  const real = realRepoConfigFromEnv();
  if (real) {
    process.stdout.write(
      'Note: real-repo subset is opt-in and runs the engine against a live GitHub clone.\n' +
        `      Configured clone: ${real.repoPath}. Run it with the full integration setup;\n` +
        '      it is intentionally not executed in the default offline `pnpm bench` path.\n',
    );
  } else {
    process.stdout.write(
      'Note: real-repo subset skipped (offline default). Enable with ARCHAEO_BENCH_REAL=1,\n' +
        '      ARCHAEO_BENCH_REPO_PATH=<clone>, and GITHUB_TOKEN. See benchmark/dataset/README.md.\n',
    );
  }

  return metrics;
}

// Allow `tsx src/benchmark/run.ts` / `pnpm bench`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
