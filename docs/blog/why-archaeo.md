---
title: "git blame tells you who. I built a tool that tells you why."
published: false
description: "archaeo traces any line of code back through every move, rename, and refactor to the PR, issue, and review that introduced the logic — locally, git-only, with honest confidence. Here's how it works, and 150+ real results from kubernetes, react, and more."
tags: git, opensource, devtools, productivity
canonical_url: https://archaeo.dev/blog/why-archaeo
---

# git blame tells you who. I built a tool that tells you *why*.

You open a file you didn't write. There's a line that looks wrong — a retry count of 5, a 30-second timeout, a weird guard clause. You want to change it. But first you need to know: **why is this here, and what breaks if I touch it?**

So you run `git blame`. It points at a commit from three weeks ago: *"refactor: tidy up imports."* Useless. The line's *real* origin — the PR where someone argued for it, the incident that caused it, the issue it closed — is buried under years of renames, moves, and formatting passes. You spend twenty minutes spelunking through GitHub and give up.

`archaeo` is a small open-source CLI that answers that question directly:

```
$ archaeo why pkg/scheduler/backend/queue/pending_pod_group_pods.go:44

why pkg/scheduler/backend/queue/pending_pod_group_pods.go:44
-----------------------------------------------------
Introduced:  2026-04-24   commit 8eb66b7
Reason:      This logic is pretty complicated — the priority of PodGroups would
             become dynamic here, and because of that we have to track Pod
             creations/deletions to update that priority — this sounds
             error-prone and difficult to track observability-wise.
Evidence:    PR #138567, review by tosi3k   (source: review comment)
Confidence:  HIGH
-----------------------------------------------------
```

That's a real run against **kubernetes/kubernetes**. In about six seconds it found the PR that introduced the line *and surfaced the actual design debate from code review* — the thing you'd otherwise spend an afternoon digging out. That review comment is the gold. It's what turns "I think this is load-bearing" into "I know exactly why this is here."

## The one rule

There are a hundred "chat with your codebase" tools. Most of them hallucinate. `archaeo` has exactly one rule that makes it different:

> **The LLM never answers from its own knowledge. It only summarizes retrieved evidence, and every claim cites a concrete artifact — a commit, a PR, an issue, a review comment. If the evidence isn't there, it says "no recorded decision found." A confident guess is a defect, not a feature.**

Trust is the whole game. A tool that *sometimes* invents a plausible-sounding reason is worse than no tool, because you can't tell the good answers from the bad ones. So `archaeo` would rather tell you it doesn't know.

## The hard part: blame-through-time

Here's where almost every tool is mediocre, and where `archaeo` spends its entire complexity budget.

`git blame` shows the **last commit that touched a line**. That commit is usually cosmetic — a rename, a reformat, a file move. It tells you nothing about why the logic exists.

`archaeo` follows the line *backward*:

```
git blame  →  last touching commit         (rename / format / move — useless)

archaeo    →  renames → moves → refactors → squash merges → cherry-picks
                                  ↓
                    the commit that introduced the BEHAVIOR
```

It uses `git log -L` to trace the line through its in-file history, detects the "file-introduction wall" (where code was *moved in* from elsewhere), and then uses git's pickaxe (`-S`/`-G` across all history) to jump across files and find where the logic *originally* entered the repository — even if it was first written in a different file and moved later. A deterministic classifier skips the cosmetic commits. Then it recovers the decision chain: commit → merged PR → linked issue → the review comments that argued about it, handling squash-merges and cherry-picks along the way.

That cross-file **behavioral-origin trace** is the moat. Everything else — storage, the LLM, the CLI — is packaging around it.

## Does it actually work? 150+ real runs.

A demo on a toy repo proves nothing. The only honest test is: point it at real, famous codebases and read the output. So I did — **151 real queries** across kubernetes, react, [cognee](https://github.com/topoteretes/cognee), and others. Full per-line results are on the [**evidence page**](https://archaeo.dev/blog/evidence) (every row reproducible). The summary:

| Repo | Queries | Resolved to the real PR | Notes |
|---|---|---|---|
| **kubernetes/kubernetes** (138k commits) | 30 | **28 (93%)**, 6 HIGH | median 6s; the 2 misses = 1 honest LOW + 1 vendored-file timeout |
| **topoteretes/cognee** | 57 | **57 (100%)** | 3.1s avg on a full clone |
| **facebook/react** (21k commits) | 3 | 2 + 1 honest LOW | traced the scheduler's 5 ms time-slice to its PR |
| **PR-driven, combined** | **87** | **85 (97.7%)** | 6 HIGH · 58 MEDIUM · 22 LOW |

And the result I'm proudest of, on a repo developed mostly via **direct-to-`main` commits** (no PRs):

| Repo | `why` queries | Resolved to a PR |
|---|---|---|
| a small direct-push repo | 19 | **0 — every one an honest "no recorded decision found"** |

That 0% is the product *working*, not failing. When there's no recorded decision, `archaeo` says so instead of fabricating one. Honesty about coverage is a feature.

> Note on confidence: **HIGH** is deliberately rare — it requires a clear winning commit *plus* a PR *plus* a linked issue or a substantive human review comment. Most real PRs earn **MEDIUM** (PR found, thinner evidence). The model never inflates its certainty. See the [evidence page](https://archaeo.dev/blog/evidence) for the per-tier breakdown.

## It also tells you what's risky to touch

The same history that powers `why` powers `archaeo risk <file>` — a 0–10 score from churn, author spread, co-change coupling, incident-linked commits, and recency. In testing it correctly flagged the central, most-churned file in a project at **7.0/10 (HIGH)** while stable utilities scored low. It's the "should I be nervous about this file" gut-check, quantified.

## How it's built (and why that matters)

- **Local and git-only.** It runs on your machine against a repo you've already cloned. No server, no SaaS, no telemetry. The only network call is fetching PR/issue/review text from the GitHub API with *your* token, cached locally in SQLite.
- **Bring your own LLM key.** Anthropic / OpenAI / Gemini, your choice — or run fully offline with a deterministic summarizer (you still get the commit/PR/issue linkage, just not an LLM-written sentence). No inference bill on me, no vendor lock-in.
- **Self-hostable and open source (MIT).** Enterprises won't hand their git history to someone's cloud. They don't have to.
- **Node 22+**, ships with zero native builds (uses the built-in `node:sqlite`).

This is the wedge. The funded incumbents are cloud SaaS that win by ingesting everything — Slack, Jira, Confluence — into a knowledge graph. `archaeo` does the opposite: one job, locally, better than anyone, with nothing to trust but your own git history.

## Try it

```bash
npm i -g git-archaeo      # the package is git-archaeo; the command is `archaeo`
archaeo init              # set your LLM provider/key + GitHub token (or skip — runs offline)
cd ~/code/your-repo
archaeo why src/auth.ts:57
```

- **Repo:** https://github.com/vanshitahujaa/archaeo
- **npm:** https://www.npmjs.com/package/git-archaeo
- **Evidence (150+ runs):** [page two →](https://archaeo.dev/blog/evidence)

## Where this goes — V2 and V3

V1 is intentionally narrow: `why`, `risk`, and `explain-commit`, GitHub-only. The roadmap widens from there, but only where it stays honest and evidence-grounded:

**V2 — the team's memory.**
- `archaeo who <path>` / `expert <area>` — find the people who actually know a piece of code, from authorship and review history (managers love this; it needs no graph).
- `archaeo why <service>` — synthesize the *business* purpose of a module from the PRs and issues that created and shaped it.
- **Onboarding mode** — "how does auth work here?": the flow, the key files, the key PRs, the domain experts, all cited.
- **Discovery** — `archaeo search` / `archaeo ask` so engineers who *don't know where the code lives* can still start from a question.
- GitLab and Bitbucket (the host interface is already abstracted for this).

**V3 — impact and dependency reasoning.**
- `archaeo impact <service>` — "what breaks if I change or remove this?" — real call/dependency-graph fan-in. This is the most over-promised feature in the category, so it comes last, when a graph engine actually earns its place.
- Multi-hop expertise and dependency analysis.

The architecture was built for this from day one: a hard `Store` interface (SQLite today, a graph engine later — zero change to callers), abstracted git/host clients, and a provider-agnostic, summarize-only LLM layer.

## The honest part

No tool earns trust by hiding its seams, so here are `archaeo`'s:

- It's **git-history-only**. If your team's real "why" lives in Slack threads and Jira tickets, `archaeo` won't see it — and it'll tell you so (LOW confidence) rather than guess.
- A repo full of `fix stuff` commits and `update` PRs has the historical value of a burnt library. `archaeo` surfaces *"this part of your history is undocumented"* — which is itself useful: it tells you where your knowledge risk is.
- On **partial/shallow clones** large-repo traces can be slow (it warns you); on a normal full clone it's 1–8 seconds.
- V1 is **GitHub-only**.

If you've ever been scared to touch code you didn't write, I'd genuinely love for you to point this at your own repo and tell me whether it finds something a senior engineer couldn't in 30 seconds. That's the bar. Stars, issues, and brutal feedback all welcome.

*archaeo is free and open source (MIT). Built in the open — issues and PRs at [github.com/vanshitahujaa/archaeo](https://github.com/vanshitahujaa/archaeo).*
