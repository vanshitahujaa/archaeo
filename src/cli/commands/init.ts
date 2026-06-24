/**
 * `archaeo init` — A5 (Surface). One-time onboarding: write provider + LLM key + GitHub
 * token to ~/.config/archaeo/config.json (mode 0600). Flag-driven, with interactive prompts
 * (hidden for secrets) as a fallback when run in a TTY. Never logs secret values.
 */

import * as readline from 'node:readline';
import { writeConfigFile, type LlmProviderName } from '../config.js';
import { ArchaeoError } from '../../core/index.js';

export interface InitArgs {
  provider?: string;
  key?: string;
  token?: string;
  model?: string;
  /** Skip all prompts (CI / scripted). Only flag-provided values are written. */
  yes?: boolean;
}

const VALID: LlmProviderName[] = ['anthropic', 'openai', 'gemini', 'fake'];

/** Prompt once; `hidden` suppresses echo for secrets. Returns '' if not a TTY. */
function prompt(query: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Suppress echo of typed characters (standard readline mute trick).
      const iface = rl as unknown as { _writeToOutput: (s: string) => void };
      const orig = iface._writeToOutput.bind(rl);
      iface._writeToOutput = (s: string) => {
        if (s.includes('\n') || s.includes(query)) orig(s);
      };
      rl.question(query, (ans) => {
        process.stdout.write('\n');
        rl.close();
        resolve(ans.trim());
      });
    } else {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

export async function runInit(args: InitArgs): Promise<string> {
  const interactive = !args.yes && process.stdin.isTTY === true;

  // --- provider ---
  let provider = args.provider;
  if (!provider && interactive) {
    const ans = await prompt('LLM provider [anthropic] (anthropic/openai/gemini/fake): ');
    provider = ans || 'anthropic';
  }
  provider = provider ?? 'anthropic';
  if (!VALID.includes(provider as LlmProviderName)) {
    throw new ArchaeoError(`Unknown provider '${provider}'.`, {
      hint: `Choose one of: ${VALID.join(', ')}.`,
    });
  }

  // --- model (optional) ---
  let model = args.model;
  if (model === undefined && interactive && provider !== 'fake') {
    const ans = await prompt('Model (blank = provider default): ');
    model = ans || undefined;
  }

  // --- LLM key (skip for fake) ---
  let llmKey = args.key;
  if (llmKey === undefined && interactive && provider !== 'fake') {
    llmKey = (await prompt(`${provider} API key (blank to skip, store later): `, true)) || undefined;
  }

  // --- GitHub token (optional — env / gh CLI is preferred & more secure) ---
  let hostToken = args.token;
  if (hostToken === undefined && interactive) {
    hostToken =
      (await prompt('GitHub token (blank = use GITHUB_TOKEN / gh CLI instead): ', true)) || undefined;
  }

  const path = writeConfigFile({ provider: provider as LlmProviderName, model, llmKey, hostToken });

  // Confirmation — NEVER print the secret values themselves.
  const lines = [
    `Saved config to ${path} (permissions 0600).`,
    `  provider:      ${provider}${model ? ` (model: ${model})` : ''}`,
    `  LLM key:       ${llmKey ? 'stored' : provider === 'fake' ? 'n/a (offline fake provider)' : 'not set — set ARCHAEO_LLM_KEY or re-run init'}`,
    `  GitHub token:  ${hostToken ? 'stored' : 'not set — will use GITHUB_TOKEN / GH_TOKEN / gh CLI'}`,
    '',
    'Next: archaeo why <path>:<line>',
  ];
  return lines.join('\n');
}
