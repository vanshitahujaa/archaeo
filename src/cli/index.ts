/**
 * `archaeo` bin entry — A5 (Surface), issue #50. Wires commander and dispatches to the
 * command runners. Error handling is real from Phase 0; command bodies are filled in by
 * Surface (#51/#52). Phase 0: `archaeo --help` works and NotImplemented surfaces cleanly.
 */

import { Command } from 'commander';
import { ArchaeoError } from '../core/index.js';
import { runWhy } from './commands/why.js';
import { runRisk } from './commands/risk.js';
import { runExplainCommit } from './commands/explain-commit.js';

const program = new Command();

program
  .name('archaeo')
  .description(
    'Recover the decisions behind code. Trace why a line exists back to the commit, PR, ' +
      'issue, and review that introduced it — with honest confidence scoring.',
  )
  .version('0.1.0');

program
  .command('why')
  .argument('<target>', 'path and line, e.g. src/auth.ts:57')
  .description('Explain why a specific line of code exists')
  .option('--key <key>', 'LLM provider key (else ARCHAEO_LLM_KEY / config)')
  .option('--token <token>', 'host token (else GITHUB_TOKEN / GH_TOKEN / gh CLI)')
  .option('--provider <provider>', 'llm provider: anthropic | openai | gemini | fake')
  .option('--model <model>', 'llm model id')
  .option('--no-cache', 'bypass the provenance cache')
  .action(async (target: string, opts: Record<string, unknown>) => {
    const out = await runWhy({
      target,
      key: opts.key as string | undefined,
      token: opts.token as string | undefined,
      provider: opts.provider as string | undefined,
      model: opts.model as string | undefined,
      noCache: opts.cache === false,
      cwd: process.cwd(),
    });
    process.stdout.write(out + '\n');
  });

program
  .command('risk')
  .argument('<path>', 'file path to assess')
  .description('Assess how risky a file is to change')
  .option('--token <token>', 'host token (else GITHUB_TOKEN / GH_TOKEN / gh CLI)')
  .option('--window <days>', 'analysis window in days', '90')
  .action(async (path: string, opts: Record<string, unknown>) => {
    const out = await runRisk({
      path,
      token: opts.token as string | undefined,
      windowDays: Number(opts.window ?? 90),
      cwd: process.cwd(),
    });
    process.stdout.write(out + '\n');
  });

program
  .command('explain-commit')
  .argument('<sha>', 'commit SHA to explain')
  .description('Explain the purpose, PR, issue, and blast radius of a commit')
  .option('--key <key>', 'LLM provider key (else ARCHAEO_LLM_KEY / config)')
  .option('--token <token>', 'host token (else GITHUB_TOKEN / GH_TOKEN / gh CLI)')
  .option('--provider <provider>', 'llm provider: anthropic | openai | gemini | fake')
  .option('--model <model>', 'llm model id')
  .action(async (sha: string, opts: Record<string, unknown>) => {
    const out = await runExplainCommit({
      sha,
      key: opts.key as string | undefined,
      token: opts.token as string | undefined,
      provider: opts.provider as string | undefined,
      model: opts.model as string | undefined,
      cwd: process.cwd(),
    });
    process.stdout.write(out + '\n');
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof ArchaeoError) {
      process.stderr.write(`error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`hint: ${err.hint}\n`);
      process.exit(err.exitCode);
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

void main();
