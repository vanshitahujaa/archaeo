/**
 * `archaeo why <path>:<line>` — A5 (Surface), issue #30.
 * Parses the target, builds the engine + summarizer + formatter, prints the Part M output.
 */

import { ArchaeoError } from '../../core/index.js';
import { resolveConfig } from '../config.js';
import type { LlmProviderName } from '../config.js';
import { buildPipeline } from '../pipeline.js';
import { TerminalFormatter } from '../format/why.format.js';

export interface WhyArgs {
  /** "path:line", e.g. "src/auth.ts:57". */
  target: string;
  key?: string;
  token?: string;
  provider?: string;
  model?: string;
  noCache?: boolean;
  cwd: string;
}

export async function runWhy(args: WhyArgs): Promise<string> {
  const { path, line } = parseTarget(args.target);

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
    noCache: args.noCache,
  });

  const bundle = await engine.explainLine(path, line);
  const answer = await summarizer.summarizeWhy(bundle);

  const formatter = new TerminalFormatter();
  return formatter.why(bundle, answer);
}

/** Parse "path:line" into its parts; throws ArchaeoError on bad input. */
export function parseTarget(target: string): { path: string; line: number } {
  if (!target || typeof target !== 'string') {
    throw new ArchaeoError(
      'Target must be in the format "path:line", e.g. "src/auth.ts:57".',
      { exitCode: 1, hint: 'Provide a file path followed by a colon and a line number.' },
    );
  }

  // Find the last colon to allow paths containing colons (e.g. Windows paths).
  const lastColon = target.lastIndexOf(':');
  if (lastColon === -1) {
    throw new ArchaeoError(
      `Invalid target "${target}": missing line number. Expected format: path:line.`,
      { exitCode: 1, hint: 'Example: archaeo why src/auth.ts:57' },
    );
  }

  const path = target.slice(0, lastColon);
  const lineStr = target.slice(lastColon + 1);

  if (path.length === 0) {
    throw new ArchaeoError(
      `Invalid target "${target}": path is empty. Expected format: path:line.`,
      { exitCode: 1, hint: 'Example: archaeo why src/auth.ts:57' },
    );
  }

  if (!/^\d+$/.test(lineStr)) {
    throw new ArchaeoError(
      `Invalid target "${target}": line number "${lineStr}" is not a positive integer.`,
      { exitCode: 1, hint: 'Example: archaeo why src/auth.ts:57' },
    );
  }

  const line = parseInt(lineStr, 10);
  if (line <= 0) {
    throw new ArchaeoError(
      `Invalid target "${target}": line number must be >= 1, got ${line}.`,
      { exitCode: 1, hint: 'Line numbers start at 1.' },
    );
  }

  return { path, line };
}
