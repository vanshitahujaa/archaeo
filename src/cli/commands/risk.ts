/**
 * `archaeo risk <path>` — A5 (Surface), issue #31.
 */

import { resolveConfig } from '../config.js';
import type { LlmProviderName } from '../config.js';
import { buildRiskPipeline } from '../pipeline.js';
import { formatRisk } from '../format/risk.format.js';

export interface RiskArgs {
  path: string;
  token?: string;
  windowDays?: number;
  cwd: string;
}

export async function runRisk(args: RiskArgs): Promise<string> {
  // Risk command doesn't need an LLM key — default to fake provider.
  const config = resolveConfig({
    token: args.token,
    provider: 'fake' as LlmProviderName,
    cwd: args.cwd,
  });

  const analyzer = await buildRiskPipeline({
    config,
    cwd: args.cwd,
  });

  const report = await analyzer.analyze(args.path);
  return formatRisk(report);
}
