# Contributing to archaeo

This repository is built by a small team of specialized agents coordinated by a Lead
("Maestro"). The full workflow is in [`implement.md`](implement.md) Parts I–K; this file is
the short version.

## Ground rules

1. **One language, one stack.** Node 22+ and TypeScript 5+. Package manager is `pnpm`
   (`corepack pnpm@9`). No tech substitutions without a Lead-approved `contract` issue
   (see [`DECISIONS.md`](DECISIONS.md)).
2. **The product rule is sacred.** The LLM only *summarizes retrieved evidence*. Every claim
   cites a concrete artifact. No invented references, ever. PRs that let the model guess are
   closed.
3. **Honest confidence.** Never upgrade certainty the evidence does not support.
4. **Never log keys or tokens.** A test enforces this.

## Ownership boundaries

Each area is owned by one agent. You edit only your owned directories (plus tests inside your
area). Cross-cutting types live in `src/core/` and **only the Lead edits them**.

| Area | Owner | Directories |
|---|---|---|
| Core contracts, CI, integration | Maestro (Lead) | `src/core/`, `.github/`, repo config |
| Provenance + risk | Tracer | `src/provenance/`, `src/risk/` |
| Git + host integration | Connector | `src/integration/` |
| Storage | Keeper | `src/storage/` |
| CLI + DX | Surface | `src/cli/` |
| LLM | Narrator | `src/llm/` |
| Benchmark + QA | Auditor | `src/benchmark/`, `test/fixtures/` |

If a task needs an interface change, **open a `contract` issue** — do not edit `src/core/`
yourself. The Lead ships the interface change as a small PR, then unblocks you.

## Branches, commits, PRs

- **Branch:** `<area>/<issue>-<slug>` — e.g. `tracer/41-line-history-through-renames`.
- **Commits:** Conventional Commits — `feat(tracer): …`, `fix(storage): …`, `test(llm): …`,
  `chore: …`.
- **One issue, one PR.** The PR body states what changed, why, how it was tested, and
  `Closes #<issue>`. Use the PR template.
- All PRs target `main`. **Only the Lead merges to `main`.**

## Definition of done

A PR is mergeable only if:

1. `pnpm typecheck` passes.
2. `pnpm lint` passes.
3. `pnpm test` passes and covers the new logic.
4. No key/token logging.
5. Docs/README updated if behavior changed.
6. Reviewed and approved by the Lead.
7. For `src/provenance/` PRs, the benchmark report is attached (Part H.3).

## Local commands

```bash
corepack pnpm@9 install
corepack pnpm@9 typecheck
corepack pnpm@9 lint
corepack pnpm@9 test
corepack pnpm@9 build
corepack pnpm@9 bench     # benchmark harness (Part H)
```
