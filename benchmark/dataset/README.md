# Benchmark dataset (Part H.1)

This directory holds the labeled question sets that `pnpm bench` (issue #35) measures
the provenance engine against. Each file follows the **Part H.1** JSON format:

```json
{
  "repo": "kubernetes/kubernetes",
  "commitPin": "<sha>",
  "path": "pkg/.../file.go",
  "line": 57,
  "questionType": "why-line",
  "expected": { "introducingPr": 184, "introducingIssue": 102 },
  "notes": "documented in PR discussion"
}
```

Repos are pinned to a specific commit for reproducibility (Part H.1). The harness reports
**top-1** (engine's chosen introducing PR equals expected), **top-3** (expected PR is among
the top-3 candidates' PRs), and **confidence calibration** (accuracy per HIGH / MEDIUM / LOW
tier) per Part H.2.

## Files

### `fixtures.json` — offline corpus (default, CI-safe)

The default `pnpm bench` run. Six items, one per synthetic fixture repo built deterministically
by `test/fixtures/buildRepo.ts` (rename, move-to-utility, squash, cherry-pick, cosmetic-only,
missing-pr). Here `repo` names the **fixture builder**, not a real GitHub repo, and `commitPin`
is a stable label. The harness builds each repo in a temp dir and runs the **real**
`Engine.explainLine` against it offline:

- `LocalGitClient` over the temp working tree (real `git log -L` / pickaxe),
- `SqliteStore(':memory:')` (real cache),
- a `HostClient` backed by `test/fixtures/loadHostResponses.ts` (recorded PR/issue/review JSON).

No network, deterministic, runs in CI. Ground truth mirrors `test/fixtures/groundTruth.ts`.
Only the squash and cherry-pick items have a linked PR in the recorded host responses; the
other four are honest `chainBroken` / LOW cases with no expected PR, so they count toward
calibration but not toward PR top-1/top-3 (which require an `expected.introducingPr`).

### `vanshitahujaa__archaeo.json` — real-repo seed (opt-in)

A small **seed** of KNOWN-correct entries for this repo itself, verified by the Lead against
the merged PRs:

| path:line                                | introducingPr | verified by                                   |
| ---------------------------------------- | ------------- | --------------------------------------------- |
| `src/integration/git/gitClient.ts:140`   | 40            | `git log -1 -- src/integration/git/gitClient.ts` |
| `src/provenance/linker.ts:70`            | 42            | `git log -1 -- src/provenance/linker.ts`         |

This is **opt-in**. It needs a local clone of the repo and a `GITHUB_TOKEN` (the engine calls
the GitHub host API to recover PRs), so it is not run by the default `pnpm bench` and is not
part of CI. To run it:

```bash
GITHUB_TOKEN=ghp_xxx \
ARCHAEO_BENCH_REAL=1 \
ARCHAEO_BENCH_REPO_PATH=/abs/path/to/archaeo-clone \
pnpm bench
```

If `ARCHAEO_BENCH_REAL` is unset (or the clone path / token is missing) the harness prints a
one-line note that the real-repo subset was skipped and runs only the offline fixtures.

## Coverage — honest status (Part N)

The Part H.1 target is **100 labeled questions** across five repos: `kubernetes/kubernetes`,
`next.js`, `react`, plus our two own repos. **We are not there yet, and this README does not
pretend otherwise.**

- ✅ **Fixtures (6/6):** fully populated, offline, deterministic, CI-gated. This is the
  regression harness the Lead watches on every `provenance/` PR.
- 🟡 **vanshitahujaa/archaeo (2 seeded):** two verified entries. More to be labeled as the repo
  grows; the engine can be pointed at any line here once the clone + token are available.
- ⬜ **kubernetes / next.js / react (0):** **not labeled.** Hand-labeling provenance ground
  truth in giant public repos is slow, must be done honestly (each `expected.introducingPr`
  cross-checked against the actual PR discussion), and is explicitly **ongoing work** — we will
  not fabricate labels to hit a number. Per Part N, "feels good on my repo" is not an answer and
  neither is a benchmark stuffed with guesses.

When real-repo files are added they drop in here as `<owner>__<name>.json` and are picked up by
the opt-in real-repo path automatically.
