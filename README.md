# archaeo

> **Understand why software exists, not just what it does.**
>
> **Trace any line of code back to the PR, issue, and review that introduced it — through every move, rename, and refactor.**

`archaeo` is a local, open-source CLI that answers the question you actually have when you
open an unfamiliar file: **why is this line here, and can I safely change it?** It traces the
line backward to the commit that introduced the *logic*, then attaches the PR that shipped it,
the issue that caused it, and the review comment that argued it — with an honest confidence
score.

It is **git-history-only, bring-your-own-LLM-key, and self-hostable**. Nothing leaves your
machine except one summarize-only LLM call you control. No server, no SaaS, no telemetry, no
ingestion of Slack/Jira/Confluence.

```
why src/auth.ts:57
-----------------------------------------------------
Introduced:  2024-01-14   commit 7f2a9c1
Reason:      Prevent duplicate concurrent customer sessions.
Evidence:    PR #184, Issue #102   (source: review comment)
Review note: "this fixes concurrent login races"  (reviewer: priya)
Also changed in that commit: session-store.ts, login.controller.ts
Risk:        High  (run: archaeo risk src/auth.ts)
Confidence:  HIGH
-----------------------------------------------------
```

## The one rule: a confident guess is a defect, not a feature

**The LLM never answers from its own knowledge.** It only summarizes retrieved evidence, and
every claim cites a concrete artifact (commit SHA, PR number, issue number, review comment).
If the evidence isn't there, the answer says *"no recorded decision found."* This single rule
is the entire difference between a tool a senior engineer trusts and a toy that makes things
up. Trust is the whole game.

## The hard problem we solve

Ask most tools why a line exists and they run `git blame` once and show you the **last commit
that touched it**:

```
git blame  ──▶  last touching commit
```

That commit is almost always a **rename, a formatting pass, or a file move** — it tells you
nothing about why the logic is there. This is the credibility killer, and it's where nearly
everyone is mediocre.

`archaeo` follows the line backward through:

```
renames  →  moves  →  refactors  →  squash merges  →  cherry-picks
                        ↓
              the commit that introduced the BEHAVIOR
```

skipping the cosmetic commits on top, to the change that actually introduced the logic — even
when that logic was first written in a different file and later moved. That cross-file
**behavioral-origin tracing** is the moat. Everything else in this repo is support structure
around it.

## Honesty, shown every time

A repo full of `fix stuff` commits and `update` PRs has the historical value of a burnt
library. `archaeo` says so instead of inventing a story:

```
why src/legacy/cache.ts:31
-----------------------------------------------------
Reason:      No recorded decision found.
Trace:       line history was squash-merged; best guess commit a91f2 ("update").
Evidence:    no linked PR or issue.
Confidence:  LOW
-----------------------------------------------------
```

Confidence is always shown as **HIGH / MEDIUM / LOW**, with the reasons. Surfacing *"this part
of your history is undocumented"* is itself useful — it tells a team where the knowledge risk
is. Honesty about coverage is a feature, not a weakness.

## Why it's different

The thing that's hard to copy isn't *what* we explain — it's *how deep we trace*:

| | Other tools | archaeo |
|---|---|---|
| **Provenance depth** | last touching commit (often cosmetic) | **behavioral origin, through renames/moves/refactors/squash** |
| When evidence is missing | a confident story | *"no recorded decision found"* |
| Source of truth | the model's guess | retrieved evidence, always cited |
| Confidence | hidden | **shown every time, with reasons** |
| Where it runs | cloud SaaS | **your machine**, BYO key, self-hostable |

## Commands

The hero command — the reason this project exists:

```bash
archaeo why <path>:<line>      # why does this line exist?
```

Supporting commands:

```bash
archaeo risk <path>            # how risky is this file to change?
archaeo explain-commit <sha>   # what did this commit do, and why? (also our own debug tool)
```

V1 is **GitHub-only**. GitLab/Bitbucket, `who`/`search`/`ask`, and impact analysis are later
versions (see [`implement.md`](implement.md) Part A.4).

## Status

> **V1.** Built module-by-module against the spec in [`implement.md`](implement.md) through real
> issues and PRs, and **validated on real repos** ([`docs/validation.md`](docs/validation.md)):
> on **kubernetes** a 30-line batch resolved 28/30 (93%) to the real introducing PR (6 HIGH),
> and **cognee** 38/38 (100%) — including surfacing the human reviewer's design critique — while
> honestly reporting "no recorded decision found" where none exists. The README makes a
> *falsifiable* claim — behavioral-origin tracing — and it holds.

## Quickstart

```bash
npm i -g archaeo        # requires Node 22+ (uses the built-in node:sqlite — zero native builds)

archaeo init            # set your LLM provider/key + GitHub token (writes ~/.config/archaeo/config.json, 0600)

cd ~/code/your-repo     # a normal (full) clone of a GitHub repo
archaeo why src/auth.ts:57
```

No key? `archaeo` still runs fully offline with a deterministic summarizer
(`--provider fake`) — you get the commit/PR/issue linkage, just not an LLM-written sentence.

**From source:**

```bash
git clone https://github.com/vanshitahujaa/archaeo.git && cd archaeo
corepack pnpm@9 install && corepack pnpm@9 build
node dist/cli/index.js --help
```

Default LLM provider is **Anthropic** (`@anthropic-ai/sdk` ships with the package). To use
OpenAI or Gemini instead, install its SDK (`npm i openai` or `npm i @google/generative-ai`) and
pass `--provider openai|gemini`.

## Configuration

`archaeo` needs a host token (to fetch PR/issue/review evidence) and an LLM key (to summarize
it). The easiest setup is `archaeo init`; otherwise each is resolved in this order at run time:

| | Resolution order |
|---|---|
| **LLM key** | `--key` flag → `ARCHAEO_LLM_KEY` env → `~/.config/archaeo/config.json` |
| **Host token** | `--token` flag → `GITHUB_TOKEN` / `GH_TOKEN` env → `gh` CLI config |

Keys and tokens are **never logged** (enforced by test). The LLM provider is pluggable
(Anthropic / OpenAI / Gemini), defaults to Anthropic, and a deterministic `fake` provider lets
the whole tool run offline with no key.

## How it works

```
  archaeo why path:line
        │
        ▼
  Command router (CLI)
        │
        ▼
  Provenance Engine ──uses──▶ Git tracer (local clone)   ──┐
  · blame-through-time         · -L line history          │
  · cosmetic classifier        · pickaxe cross-file origin │
  · candidate scoring          · move / squash / cherry-pick
  · evidence linker ──────────▶ Host client (GitHub API) ──┤  cached in
  · confidence scorer          · PRs, issues, reviews      │  SQLite
        │                                                  │ (node:sqlite)
        ▼                                                  │
  LLM summarizer (summarize-only, cited) ◀─────────────────┘
        │
        ▼
  cited answer + confidence
```

The codebase is organized around hard interface seams (`src/core/`) so the storage engine,
git/host clients, and LLM provider are all swappable without touching callers. See
[`implement.md`](implement.md) for the full engineering spec and [`DECISIONS.md`](DECISIONS.md)
for Lead-owned deviations from it.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). This project is built by a small team of specialized
agents coordinated by a Lead; the workflow (issues, branches, PRs, ownership boundaries) is
described in [`implement.md`](implement.md) Parts I–K.

## Credits

Created and maintained by [**@vanshitahujaa**](https://github.com/vanshitahujaa).

Built by the **agent team** described in `implement.md` Part J:

| Agent | Role |
|---|---|
| **Maestro** | Lead — core contracts, CI, integration, merges |
| **Tracer** | Provenance engine + risk (the moat) |
| **Connector** | Git + host integration |
| **Keeper** | Storage and data layer |
| **Surface** | CLI and developer experience |
| **Narrator** | LLM summarization |
| **Auditor** | Benchmark and QA |

## License

[MIT](LICENSE) © vanshitahujaa
