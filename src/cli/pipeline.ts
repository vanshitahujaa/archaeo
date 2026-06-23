/**
 * Pipeline factory — A5 (Surface).
 *
 * Builds the real execution pipeline: LocalGitClient + GitHubClient + SqliteStore +
 * Engine + Summarizer (+ FakeProvider when provider=fake or no key).
 *
 * The provenance Engine from src/provenance/engine.ts is currently a Phase-0 stub;
 * the real implementation is delivered by the Tracer specialist via a Lead-merged PR.
 * This factory constructs it now so wiring is correct when it lands.
 */

import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { LlmProvider, LlmSummarizer, ProvenanceEngine, RiskAnalyzer } from '../core/index.js';
import { Summarizer } from '../llm/summarizer.js';
import { FakeProvider } from '../llm/providers/fake.js';
import type { ArchaeoConfig } from './config.js';

export interface Pipeline {
  engine: ProvenanceEngine;
  summarizer: LlmSummarizer;
}

export interface PipelineOptions {
  config: ArchaeoConfig;
  cwd: string;
  noCache?: boolean;
}

/** Lazily imported concrete types to avoid hard errors when stubs throw at import time. */
async function buildEngine(config: ArchaeoConfig, cwd: string, noCache: boolean): Promise<ProvenanceEngine> {
  const { LocalGitClient } = await import('../integration/git/gitClient.js');
  const { GitHubClient } = await import('../integration/hosts/github.js');
  const { SqliteStore } = await import('../storage/sqliteStore.js');
  const { Engine } = await import('../provenance/engine.js');

  // Ensure the SQLite db directory exists.
  mkdirSync(dirname(config.dbPath), { recursive: true });

  const store = new SqliteStore({ dbPath: config.dbPath });
  await store.init();

  const git = new LocalGitClient({ cwd });
  const repoRef = await git.resolveRepo(cwd);
  const owner = repoRef.owner;
  const repo = repoRef.name;

  const host = new GitHubClient({
    owner,
    repo,
    token: config.hostToken ?? '',
  });

  return new Engine(
    { git, host, store, repo: `${owner}/${repo}` },
    { noCache },
  );
}

async function buildRiskAnalyzerImpl(config: ArchaeoConfig, cwd: string): Promise<RiskAnalyzer> {
  const { LocalGitClient } = await import('../integration/git/gitClient.js');
  const { SqliteStore } = await import('../storage/sqliteStore.js');
  const { Analyzer } = await import('../risk/analyzer.js');

  mkdirSync(dirname(config.dbPath), { recursive: true });

  const store = new SqliteStore({ dbPath: config.dbPath });
  await store.init();

  const git = new LocalGitClient({ cwd });
  const repoRef = await git.resolveRepo(cwd);
  const owner = repoRef.owner;
  const repo = repoRef.name;

  // Minimal host stub for risk analyzer (incident detection). Risk analyzer
  // only needs prForCommit for incident-label detection.
  const hostStub = {
    async prForCommit(_sha: string) { return null; },
  };

  return new Analyzer(
    { git, host: hostStub, store, repo: `${owner}/${repo}` },
  );
}

function buildProvider(config: ArchaeoConfig): LlmProvider {
  if (config.provider === 'fake' || config.llmKey === undefined) {
    return new FakeProvider();
  }
  // Real providers loaded on demand so optional deps don't crash when absent.
  // For now default to fake; the Narrator specialist fills in the real providers.
  return new FakeProvider();
}

export async function buildPipeline(opts: PipelineOptions): Promise<Pipeline> {
  const provider = buildProvider(opts.config);
  const summarizer = new Summarizer(provider);
  const engine = await buildEngine(opts.config, opts.cwd, opts.noCache ?? false);
  return { engine, summarizer };
}

export async function buildRiskPipeline(opts: PipelineOptions): Promise<RiskAnalyzer> {
  return buildRiskAnalyzerImpl(opts.config, opts.cwd);
}
