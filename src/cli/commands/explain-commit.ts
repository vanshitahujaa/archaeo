/**
 * `archaeo explain-commit <sha>` — A5 (Surface), issue #30 / Part D.9.
 * V1 command, excluded from the two-week prototype gate (Part N).
 */

import { resolveConfig } from '../config.js';
import type { LlmProviderName } from '../config.js';
import { buildPipeline } from '../pipeline.js';
import { TerminalFormatter } from '../format/why.format.js';
import type { EvidenceBundle } from '../../core/index.js';

export interface ExplainCommitArgs {
  sha: string;
  key?: string;
  token?: string;
  provider?: string;
  model?: string;
  cwd: string;
}

export async function runExplainCommit(args: ExplainCommitArgs): Promise<string> {
  const config = resolveConfig({
    key: args.key,
    token: args.token,
    provider: args.provider as LlmProviderName | undefined,
    model: args.model,
    cwd: args.cwd,
  });

  const { engine, summarizer } = await buildPipeline({
    config,
    cwd: args.cwd,
  });

  const explanation = await engine.explainCommit(args.sha);

  // Build a minimal EvidenceBundle from CommitExplanation so the summarizer can run.
  const minimalBundle: EvidenceBundle = {
    path: explanation.coChangedPaths[0] ?? '(unknown)',
    line: 0,
    candidates: [],
    lineage: [explanation.commit],
    introducingPr: explanation.pr,
    linkedIssue: explanation.linkedIssue,
    reviewComments: explanation.reviewComments,
    behavioral: {
      introducingSha: explanation.commit.sha,
      coChangedPaths: explanation.coChangedPaths,
      summaryHints: [],
    },
    usedSource: explanation.pr ? 'pr_body' : 'commit_message',
    chainBroken: false,
    confidence: explanation.riskHint,
    confidenceReasons: [],
  };

  const answer = await summarizer.summarizeWhy(minimalBundle);
  const formatter = new TerminalFormatter();
  return formatter.explainCommit(explanation, answer);
}
