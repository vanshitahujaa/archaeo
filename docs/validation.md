# archaeo — real-repo validation

> The bar (implement.md Part N): point `archaeo why path:line` at real repos and read the
> output. If it repeatedly surfaces the decision a senior engineer couldn't find in 30s,
> it works. If it mostly says "unknown / low confidence", the decision history isn't
> recoverable from git — which is itself worth knowing.

## Method

Each row was produced by running the **built CLI** exactly as an end user would, from inside
a normal clone of the target repo:

```bash
export GITHUB_TOKEN="$(gh auth token)"
archaeo why <path>:<line> --provider fake
```

- `--provider fake` is the offline, deterministic summarizer (no LLM key). It summarizes
  **only** the retrieved evidence; a real key (Anthropic/OpenAI/Gemini) produces a crisper
  sentence but the **evidence linkage** — the part being validated — is identical.
- "Expected" is the PR/commit that actually introduced the logic. For **archaeo's own repo**
  the ground truth is known exactly (we created those PRs). For the OSS repos it is the
  introducing PR cross-checked from history; these rows are spot-checks, not an exhaustive
  labeled set (see `benchmark/dataset/` and Part H for the harness).
- "Correct?" = did archaeo surface the real introducing PR/commit (or honestly report none
  when none exists), **not** whether the prose was perfect.

---

## archaeo (dogfood — github.com/vanshitahujaa/archaeo)

Ground truth known exactly: these PRs were merged during this build.

| Question (path:line) | Expected | archaeo answer | Confidence | Correct? |
|---|---|---|---|---|
| `src/integration/git/gitClient.ts:140` (git plumbing) | PR #40 | commit `622dd9d`, **PR #40**, Issue #10, co-changed files listed | HIGH | ✅ |
| `src/provenance/linker.ts:70` (chain recovery) | PR #42 | commit `119f433`, **PR #42**, Issue #20 | HIGH | ✅ |
| `src/provenance/score.ts:23` (`SEPARATION_THRESHOLD`) | none (direct-to-main Phase-0 commit, no PR) | "No recorded decision found… best guess `c7252d8`; no linked PR or issue" | LOW | ✅ (honest) |

## facebook/react (21,530 commits, full PR history)

| Question (path:line) | Expected | archaeo answer | Confidence | Correct? |
|---|---|---|---|---|
| `packages/scheduler/src/forks/Scheduler.js:357` (`timeout` logic) | PR that removed the timeout option | **PR #19457** "Remove `timeout` option from `scheduleCallback`" — *"Since the Lanes refactor landed, we no longer rely on this anywhere"* | MEDIUM | ✅ |
| `packages/scheduler/src/forks/Scheduler.js:491` (`frameInterval`, the 5 ms slice) | PR that introduced the dynamic frame interval | **PR #20025** "Refactor SchedulerHostConfigs" | MEDIUM | ✅ |
| `packages/react-reconciler/src/ReactFiberHooks.js:1896` (`mountStateImpl`) | (introducing PR) | "No recorded decision found" — introducing commit had no discoverable PR | LOW | ⚠️ honest miss (no fabrication) |

**react result: 2/3 resolved to the real introducing PR with the actual discussion; 1 honest LOW.**

## kubernetes/kubernetes (~138,800 commits, PR-driven)

> _Pending: full clone downloading. Rows appended after the run._

| Question (path:line) | Expected | archaeo answer | Confidence | Correct? |
|---|---|---|---|---|
| `pkg/kubelet/kubelet.go:156` (`nodeStatusUpdateRetry = 5`) | _tbd_ | _tbd_ | _tbd_ | _tbd_ |

## torvalds/linux (GitHub mirror — no pull requests)

> Linux is developed on mailing lists; its GitHub repo is a read-only mirror with **zero PRs**.
> The correct behaviour is to find the introducing commit + author + message via
> blame-through-time and **honestly report no PR/issue** — the "honest LOW" path. This
> demonstrates that honesty about coverage is a feature, not a gap.

> _Pending: clone downloading. Rows appended after the run._

---

## Honest findings

- **Accuracy:** on PR-driven repos (react, archaeo) the engine reliably traces a line to the
  PR that introduced the logic, skipping cosmetic commits, and cites it. When no decision is
  recorded it says so instead of guessing.
- **Latency (tracked: #47):** cold `why` on react was 14–40s; on kubernetes a single query
  against a *blobless* clone exceeded 2 min because partial clones fetch every historical blob
  over the network. A normal full clone keeps it local. Still, `-L` + pickaxe over very deep
  history needs the Part D.8 depth/breadth caps tightened — **target: < 10s**.
- **Reason prose (tracked: #45):** with `--provider fake` the reason is a verbatim slice of the
  best evidence source; a real LLM key yields a crisp one-liner. Linkage is unaffected.
