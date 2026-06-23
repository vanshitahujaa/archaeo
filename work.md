# Guffy  (working name)

**Understand why software exists, not just what it does.**

Design framing written for an engineer who has shipped real systems. No hype. Scope is deliberately small so V1 is buildable by one person and survives contact with reality.

---

## 0. The honest read (do not skip this)

This is a real pain and a real category. It is also already contested:

- **Unblocked** (~$30M raised) does the exact "why does this exist" pitch by ingesting code, PRs, issues, Slack, Jira, Confluence and telemetry into a knowledge graph and returning cited answers. Their homepage demo is an auth/JWT example.
- **Sourcegraph Deep Search** (enterprise only since 2025) now searches git history, commit ancestry and branches with cited results, and answers in Slack.
- Augment, Qodo, Greptile, and OSS semantic indexers crowd the rest.

So do not build this as "the new company that understands code." That framing is dead on arrival in any technical room.

**The wedge that is actually open:** every serious incumbent is cloud SaaS, enterprise priced, closed source, and wins by ingesting everything (Slack, Jira, Confluence). The thing nobody owns is the **self-hostable, git-history-only, bring-your-own-LLM-key, open-source** tool that does one job better than anyone: trace why a specific line exists, through its entire refactor history, back to the decision that introduced the logic, with honest confidence scoring.

That wedge is narrow on purpose. Narrow is how a solo build wins against funded teams. You are not competing on breadth. You are competing on one capability done correctly.

---

## 1. Problem statement

Code outlives the reasons it was written. People leave, teams reorg, ownership moves. The `git log` survives; the decision behind the code does not. New engineers and on-call responders waste hours reconstructing intent that already exists somewhere in PR threads and review comments, just unindexed and unlinked.

Existing AI tools answer "what does this code do" (they read the code). The unmet need is "why is this code here, who decided it, and what breaks if I touch it," answered from evidence, not from a model guessing.

---

## 2. Who it is for

**Target:** engineering teams of roughly 50 to 500 that use PRs and reviews as a normal part of shipping. They generate the historical evidence the tool depends on.

**Explicitly not for V1:** solo developers, toy repos, student projects. They do not produce enough decision history, and you would be tuning the product against the wrong distribution. (You already reasoned this correctly: teams that do not use PRs are mostly lone wolves, and lone wolves are not the customer.)

**Decision: git-history-only for V1.** Yes, most "why" partly lives in Slack and Jira, and yes the incumbents ingest those. You will not. Reasons: (a) Slack/Jira ingestion is where the funded teams already win, so do not fight there; (b) it triples integration scope and security surface; (c) a tool that nails git-only provenance is still genuinely useful and is a clean, defensible demo. State the limitation openly. Honesty about coverage is a feature, not a weakness.

---

## 3. The one capability that wins

Most tools, when you ask about a line, show you the last commit that touched it. That last commit is usually a rename, a format pass, or a whitespace change. It tells you nothing about why the logic exists. This is the credibility killer, and it is where almost everyone is mediocre.

**The capability: blame-through-time.** Given a file and line, follow the line backward through every move, rename, refactor and reformat to find the commit and PR that introduced the actual logic, not the cosmetic change on top of it. Then attach the PR description, the linked issue, and the review comments that argued about it.

This is the hard engineering problem in the whole product. It is also the thing that makes a 10-year engineer say "I would have used this last month" instead of "cool AI demo." Build this first. Everything else is packaging around it.

---

## 4. Solution approach (non-negotiable architecture principle)

The LLM never answers from its own knowledge. It only summarizes retrieved evidence.

```
Bad:   User -> LLM -> Answer                      (hallucination machine)
Good:  User -> Evidence Retrieval -> LLM Summarize -> Cited Answer
```

Every claim in an answer must point to a concrete artifact (a commit SHA, a PR number, an issue, a review comment). If there is no evidence, the answer says "no recorded decision found," not a confident guess. This single rule is what separates a tool a senior engineer trusts from a toy.

---

## 5. System architecture (local CLI, no server)

The CLI runs on the engineer's machine against a repo they have already cloned. There is no backend service and no webhooks. Evidence that does not live in git (PR bodies, issue text, review comments) is fetched from the host API on demand with the user's token, then cached locally.

```
  archaeo why path:line
        |
        v
  +------------------+
  | Command router   |
  +------------------+
        |
        v
  +------------------+        +-----------------------+
  | Git tracer       |        | Host API client       |
  | (local clone)    |        | GitHub/GitLab/BB      |
  | blame-through-   |        | PRs, issues, reviews  |
  | time             |        | (user's token)        |
  +------------------+        +-----------------------+
        |                              |
        +--------------+---------------+
                       v
            +-----------------------+
            | SQLite cache          |  evidence + provenance + relations
            | (better-sqlite3)      |  modeled as nodes + edges
            +-----------------------+
                       |
                       v
            +-----------------------+
            | Evidence assembler    |  rank + score confidence
            +-----------------------+
                       |
                       v
            +-----------------------+
            | LLM summarizer        |  BYO key, summarize-only
            +-----------------------+
                       |
                       v
            cited answer + confidence, printed
```

### Component notes
- **Git tracer:** local git plumbing, the provenance engine. No network needed for this part. Details in section 8.
- **Host API client:** fetches the decision evidence (PRs, issues, reviews) that git does not store. Mind rate limits; the cache exists largely to avoid re-fetching.
- **SQLite cache:** embedded, ships with the package, zero setup. Stores fetched evidence, computed provenance, and relations as explicit node/edge rows so a later graph backend is a load job.
- **Evidence assembler + confidence:** ranks candidate evidence and scores how strongly it supports an answer before the LLM ever sees it.
- **LLM summarizer:** stateless, summarize-only, provider-agnostic.
- **No server, no webhooks, no shared store in V1.** Consequence: each engineer indexes their own clone, so there is no cross-team knowledge base yet. `who knows` still works from git authors and reviewers. The shared, server-backed team brain is a deliberate later step, not part of the CLI.

---

## 6. Tech stack (locked to the CLI decision)

Distribution via `npm` fixes the language: the tool is Node/TypeScript end to end. That reverses the earlier Python/FastAPI suggestion, and the trade is deliberate. You give up your fastest stack; you gain one language, a frictionless `npm i -g` install, and the adoption path that actually earns GitHub stars for a tool like this. Git plumbing behaves identically from Node, so the hard part is unaffected.

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | Node + TypeScript | Forced by npm distribution; one language for the whole tool |
| CLI framework | commander or oclif | Standard, good help/UX out of the box |
| Git access | system git via child_process, plus simple-git for convenience | The provenance engine leans on real git plumbing |
| Local store | SQLite (better-sqlite3) | Embedded, ships in the package, zero setup, carries all of V1 |
| Host access | GitHub/GitLab/Bitbucket REST or GraphQL clients | Fetch PR/issue/review evidence with the user's token |
| LLM | Bring-your-own-key, provider-agnostic (Claude / GPT / Gemini) | No vendor lock, no inference bill on you |
| Graph (later) | Neo4j as an optional backend | Only when you ship relationship-heavy queries; see section 7 |

Two deliberate "not yet" calls:
- **Graph database is optional and later, not a hard dependency.** A server-based Neo4j would break the "npm install and run" promise the CLI decision was meant to buy. SQLite is the default; Neo4j is an opt-in backend for teams that want the V2/V3 relationship queries.
- **No SaaS, no shared server in V1.** The CLI is local. A hosted, team-wide service is a later step once the local tool has proven the demo.

---

## 7. Data model and the graph-database question

You want high accuracy and Neo4j soon. The important thing first: **accuracy does not come from the database.** Whether `why path:line` is correct is entirely the provenance engine's job (section 8). A graph engine just stores the result. Put Neo4j in front of a naive tracer and you get a beautiful graph of wrong answers. Spend the accuracy budget on the tracing logic.

For V1, model relations as explicit node and edge rows in SQLite. This is graph-shaped data in a relational store: setup stays at zero, and the later Neo4j move is a load job rather than a redesign.

```
-- nodes
repos, commits, prs, issues, reviews, review_comments, engineers

-- edges (one table, graph-ready)
edges(id, src_type, src_id, rel, dst_type, dst_id, confidence)
   rel in {introduced_by, modified_by, discussed_in, fixes, reviews, owns, depends_on}

-- the expensive cached result
line_provenance(repo, path, line_hash, introducing_commit_sha,
                introducing_pr, confidence, computed_at)
```

A recursive CTE over `edges` gives graph-style traversal in SQLite, which is plenty for `why` and `who`. Move to Neo4j when you build the multi-hop, relationship-heavy features (impact analysis, dependency chains, multi-hop ownership). That is where a graph engine pays for itself, and it is V2/V3.

Caution if you consider an embedded graph DB to stay serverless: Kuzu, the obvious in-process option with Node bindings, was archived in October 2025 after an Apple acqui-hire. Forks and a successor exist, but the space is unsettled, so do not build a dependency on it yet. Neo4j as an optional server is the more stable graph bet when you reach for one.

---

## 8. The provenance engine (the actual hard part)

This is where your distributed-systems and systems-reasoning credibility shows. Spell it out, because the naive version (`git blame` once) is what makes tools useless.

Pipeline for "why is `path:line` here":

1. **Resolve the line through moves and renames.** Use git with copy/move detection and line-range history so a function that moved files or got reformatted still traces to its origin. The goal is the commit that introduced the *logic*, skipping pure-cosmetic commits on top.
2. **Filter cosmetic commits.** Classify each candidate commit: does it change behavior (logic, control flow, conditions) or just formatting/renaming/whitespace? Walk past the cosmetic ones to the last behavioral change. This filter is most of the value.
3. **Link commit to PR to issue.** Merge commit to PR via the host API; PR to issue via "fixes #N" references and links.
4. **Pull the argument, not just the artifact.** Attach the review comments where the change was actually debated. The sentence "this fixes concurrent login races" in a review is the gold, not the PR title.
5. **Score confidence** (section 9) and cache the result in `line_provenance`. Recompute only when the line's history changes.

Honest scoping: this gets messy with squash-merges, rebases, and force-pushes that rewrite history. Handle the common cases well, mark the rest low-confidence, and never pretend. "I traced this to PR #184 (high confidence)" and "this file's history was rewritten, best guess is commit abc123 (low confidence)" are both acceptable. A confident wrong answer is the only unacceptable one.

---

## 9. Confidence scoring

Three tiers, shown to the user every time:

- **High:** clear behavioral introducing commit, linked PR, linked issue, and at least one substantive review comment.
- **Medium:** introducing commit and PR found, but thin or empty descriptions, or no linked issue.
- **Low:** history rewritten, squash-merge collapsed the trail, or only "fix stuff" commit messages exist.

A repo full of `fix stuff` commits and `minor changes` PRs has the historical value of a burnt library. The tool's job there is to say so, not to invent a story. Surfacing "this part of your history is undocumented" is itself useful: it tells a manager where the knowledge risk is.

---

## 10. Core features

### V1 (build only these)
1. **`why <path>:<line>`** the killer demo. Origin commit, introducing PR, linked issue, the key review comment, confidence. This is the litmus test feature.
2. **`who knows <path>`** primary contributor, top reviewers, most recent active engineers. Computed from the same ingested data, cheap, and managers love it. High value per unit of effort, so it ships in V1.

### V2 (after V1 proves the demo lands)
3. **`why <service>`** business purpose and original decision, synthesized from the PRs/issues that created and shaped it.
4. **Onboarding mode** "how does auth work": flow, key files, key PRs, domain experts. Pure synthesis over the same evidence.

### V3 (only with a real reason)
5. **`what breaks if I remove X`** impact analysis. Needs a call/dependency graph, which is a separate hard build. Do not start here; it is the most over-promised, under-delivered feature in this category.

Ship one feature that makes a senior engineer's jaw drop before you ship five features that each half-work.

---

## 11. Exact flow: `why auth.py:57`

```
1. User runs:  archaeo why auth.py:57

2. API receives (repo, path, line).

3. Provenance engine:
   - checks line_provenance cache; on miss, computes
   - resolves line 57 backward through renames/moves
   - skips cosmetic commits, lands on introducing behavioral commit
   - links commit -> merged PR -> referenced issue
   - pulls review comments on that PR touching this region

4. Retrieval assembles the evidence bundle:
   - commit (sha, author, date, message)
   - PR (number, title, body)
   - issue (number, title)
   - review comment(s) (author, text)
   - confidence tier

5. LLM call (summarize-only prompt):
   "Summarize why this line exists using ONLY the evidence below.
    Cite each artifact. If evidence is insufficient, say so.
    Do not add facts not present in the evidence."

6. Output:

   why auth.py:57
   ---------------------------------------------
   Introduced:  2024-01-14  (commit 7f2a9c1)
   Reason:      Prevent duplicate concurrent customer sessions.
   Evidence:    Issue #102, PR #184
   Review note: "This fixes concurrent login races." (reviewer: priya)
   Owner now:   most active recent contributor + top reviewer
   Confidence:  HIGH
   ---------------------------------------------
```

If the litmus test passes (a 10-year engineer says "I'd have used this last month"), you have something. If they say "cool AI demo," the provenance engine is not good enough yet, and that is the thing to fix, not the UI.

---

## 12. Biggest risks, in order

1. **Data quality.** Low-information commits and PRs. Cannot be fixed, only handled honestly via confidence scoring. This is the number one risk, above tech and above AI.
2. **Incumbents.** Unblocked and Sourcegraph already do the broad version with funding. Mitigation is the wedge: git-only, self-hostable, open source, BYO-key, and best-in-class provenance. Do not fight them on breadth.
3. **Trust and deployment.** Enterprises will not hand their full git history to your cloud. Single-tenant / in-VPC deployment is close to mandatory for the target customer, and it shapes the architecture from day one.
4. **Scale of initial indexing.** Large repos have huge histories. Backfill is expensive; do it once, incremental via webhooks after. Never re-blame the whole repo on every push.

---

## 13. Rookie mistakes to avoid (specific to this build)

- Pitching "AI explains code" or "chat with your repo." Commodity, dead category, instant credibility loss.
- Building the graph database first. Postgres until traversal actually hurts.
- Letting the LLM answer instead of summarize evidence. The one rule you cannot break.
- Shipping `git blame` once and showing the last cosmetic commit as "why." This is the single fastest way to look amateur to a senior engineer.
- Scoping V1 to all five features. Ship `why` + `who`, nothing else.
- Adding Slack/Jira ingestion in V1. That is the incumbents' turf and triples your surface.
- Building multi-tenant SaaS before anyone has used the single-tenant version.
- Learning a new language/runtime while also discovering whether the product works. Build in FastAPI, the stack you are fast in.

---

## 14. What to actually build first (milestones)

1. Ingest one repo (commits, PRs, issues, reviews) into Postgres. Raw + normalized.
2. Provenance engine v0: `why path:line` for the simple case (no squash/rebase weirdness), returns introducing commit + PR + issue + one review comment.
3. Confidence scoring + the "no recorded decision found" path.
4. CLI that prints the litmus-test output above.
5. Test it on a real, messy repo. Show it to an experienced engineer. Watch their face.
6. Only then: `who knows`, then the web views, then V2.

The whole project lives or dies on step 2 looking impressive on a real repo. Spend your effort there.