# Guffy: Engineering Spec and Build Plan

**Working name:** Guffy
**CLI binary:** `archaeo`
**npm package:** `archaeo`
**Audience:** the build team (1 lead agent + 6 specialist agents). This document is the source of truth. If something is not written here, the lead decides and writes it here. Do not assume.

---

## Part A. Product and scope (locked)

### A.1 What we are building
A command line tool that recovers the *decisions* behind code, not just what the code does. The anchor command answers, for any line, why it exists: the commit that introduced the logic, the PR that shipped it, the issue that caused it, and the review comment that argued it, with an honest confidence score.

### A.2 The one rule that defines the product
The LLM never answers from its own knowledge. It only summarizes retrieved evidence, and every claim cites a concrete artifact (commit SHA, PR number, issue number, review comment). If evidence is missing, the answer says "no recorded decision found." A confident guess is a defect, not a feature.

### A.3 The moat
The Line Provenance Engine: tracing a line backward through moves, renames, and refactors to the commit that introduced the *behavior*, skipping cosmetic commits, with high accuracy. Everything else is packaging around this. If this is mediocre, we have a prettier `git blame`, which ships for free.

### A.4 Scope by version (decided)
- **V1 (this plan):** `archaeo why <path>:<line>`, `archaeo risk <path>`, and `archaeo explain-commit <sha>`. GitHub only. Storage is SQLite behind a `Store` interface. No graph database. No server. No frontend. A benchmark harness ships alongside V1, not after.
- **V2 (later):** `archaeo who <path>` / `archaeo expert <area>`, `archaeo why <service>`, onboarding mode, and discovery (`archaeo search <query>` / `archaeo ask <question>`) so users who do not know where code lives can still start. May introduce a graph adapter behind the same `Store` interface.
- **V3 (later):** `archaeo impact <service>`, multi-hop expertise and dependency analysis. This is where a graph engine earns its place.

`who knows` is deliberately V2, not V1: plain `git blame` already approximates single-file ownership, so it is not jaw-dropping. `risk` is in V1 because it is the feature an engineer reacts to immediately ("am I about to break something"), and it needs no graph.

### A.5 Positioning note for the team
Users do not arrive thinking "I need software archaeology." They arrive thinking "I am scared to touch this code." `why` and `risk` both serve that emotion: they help make a change decision safely. Keep output framed around decisions and risk, not history lessons.

### A.6 Non-goals for V1 (do not build)
No Slack / Jira / Confluence ingestion. No web UI. No multi-tenant SaaS. No auth or billing. No graph database. No dependency-graph fan-in (that is V3). No GitLab or Bitbucket in V1: the `HostClient` interface stays so they plug in later, but only the GitHub implementation ships. No natural-language search or ask (that is V2). Building any of these in V1 is out of scope and PRs adding them will be closed.

---

## Part B. Architecture (locked)

### B.1 Shape
`archaeo` runs locally on an engineer's machine against a repository they have already cloned. Git history (commits, blame, line history, authors) is read from the local clone. Decision evidence that git does not store (PR bodies, issue text, review comments) is fetched from the code host API using the user's token, then cached in a local SQLite database. The LLM call is the only network dependency for output, and it uses the user's own provider key.

```
  archaeo why path:line / archaeo risk path
        |
        v
  +------------------+      CLI (Surface, A5)
  | Command router   |      parse, config, key handling, output formatting
  +------------------+
        |
        v
  +------------------------+    +---------------------------+
  | Provenance Engine (A2) |    | Risk Analyzer (A2)        |
  | blame-through-time     |    | churn, author spread,     |
  | cosmetic classifier    |    | co-change, incidents,     |
  | evidence linker        |    | recency                   |
  | confidence scorer      |    +---------------------------+
  +------------------------+
        |  uses                         |  uses
        v                               v
  +------------------------+    +---------------------------+
  | Integration (A3)       |    | Storage (A4)              |
  | GitClient (local)      |    | Store interface           |
  | HostClient (GH/GL/BB)  |    | SqliteStore (node:sqlite),|
  | rate limit, auth       |    | migrations,               |
  +------------------------+    | node/edge model, cache    |
        |                       +---------------------------+
        v
  +------------------------+
  | LLM Summarizer (A6)    |   provider-agnostic, summarize-only, cited
  +------------------------+
        |
        v
  cited answer + confidence, printed by Surface (A5)

  Benchmark + QA (A7) runs the whole chain against pinned real repos
  and reports top-1 / top-3 accuracy and confidence calibration.
```

### B.2 Why each boundary exists
- The `Store` interface is a hard seam. The engine and CLI never touch SQLite directly. This is how "same architecture from the start" is satisfied without committing to a database engine: V1 ships a `SqliteStore`; a `GraphStore` adapter can be added later with zero change to callers.
- `GitClient` and `HostClient` are interfaces too, so the tracer is testable against fixtures with no network and no real repo.
- The LLM layer is summarize-only and provider-agnostic, so swapping Claude / GPT / Gemini is a config change.

### B.3 Module layout (exact)
```
archaeo/
  package.json
  tsconfig.json
  src/
    core/            # OWNED BY LEAD (A1). Domain types + interfaces. Defined in Phase 0.
      types.ts
      store.interface.ts
      git.interface.ts
      host.interface.ts
      llm.interface.ts
      formatter.interface.ts
      errors.ts
    cli/             # A5 Surface
      index.ts       # bin entry
      commands/
        why.ts
        risk.ts
      format/
        why.format.ts
        risk.format.ts
      config.ts      # config + provider key resolution
    provenance/      # A2 Tracer
      engine.ts      # ProvenanceEngine implementation
      tracer.ts      # blame-through-time
      classifier.ts  # cosmetic vs behavioral commit classifier
      linker.ts      # commit -> PR -> issue -> review
      behavioral.ts  # same-commit change extraction
      confidence.ts  # confidence scorer
    risk/            # A2 Tracer (analysis, separate module)
      analyzer.ts
      signals.ts     # churn, author spread, co-change, incidents, recency
    integration/     # A3 Connector
      git/
        gitClient.ts
      hosts/
        github.ts
        gitlab.ts
        bitbucket.ts
        detect.ts    # infer host + repo slug from remote
      ratelimit.ts
      auth.ts        # token resolution (env, gh config, flag)
    storage/         # A4 Keeper
      sqliteStore.ts
      schema.sql
      migrations/
      mappers.ts     # row <-> domain mapping
      graph/         # STUB ONLY in V1: GraphStore skeleton, not wired
    llm/             # A6 Narrator
      summarizer.ts
      providers/
        anthropic.ts
        openai.ts
        gemini.ts
        fake.ts      # deterministic provider for tests
      prompts.ts
    benchmark/       # A7 Auditor
      run.ts
      dataset/        # pinned questions per repo
      metrics.ts
      report.ts
  test/
    fixtures/        # synthetic repos + recorded host responses
    ...
```

### B.4 Tech stack (locked, no substitutions without a lead-approved `contract` issue)
| Concern | Choice | Notes |
|---|---|---|
| Language / runtime | Node 22+ and TypeScript 5+ | one language end to end; Node 22+ for built-in `node:sqlite` (see DECISIONS.md D-001) |
| Package manager | pnpm | lockfile committed |
| CLI framework | commander | simple, well documented |
| Git access | `simple-git` plus `git` via child_process for plumbing | tracer needs raw plumbing |
| Local store | `node:sqlite` (built-in) | synchronous, embedded, zero native build; behind the `Store` seam (DECISIONS.md D-001, supersedes the original `better-sqlite3` choice) |
| Host clients | `@octokit/rest` (GitHub), GitLab and Bitbucket REST via `undici` fetch | start with GitHub, others behind same interface |
| LLM providers | `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` | all behind `LlmSummarizer` |
| Tests | Vitest | unit + integration |
| Build | tsup | single bundled bin |
| Lint / format | ESLint + Prettier | enforced in CI |
| Graph (later) | LadybugDB (embedded, Cypher) or Neo4j (server) | NOT in V1; `GraphStore` is a stub only |

---

## Part C. Contracts (Phase 0 deliverable, owned by the Lead)

These interfaces are written by the Lead first and committed to `src/core/` before any specialist agent starts. They are the API every agent codes against. Only the Lead edits these files; any change goes through a `contract` issue.

### C.1 Domain types (`core/types.ts`)
```ts
export type HostKind = 'github' | 'gitlab' | 'bitbucket';

export interface RepoRef { host: HostKind; owner: string; name: string; root: string; defaultBranch: string; }

export interface Commit { sha: string; authorLogin: string; authorName: string; authoredAt: string; message: string; }
export interface PullRequest { number: number; title: string; body: string; authorLogin: string; mergedSha?: string; state: string; }
export interface Issue { number: number; title: string; body: string; state: string; }
export interface ReviewComment { author: string; body: string; path?: string; line?: number; submittedAt: string; }
export interface Engineer { login: string; name?: string; }

export type Confidence = 'high' | 'medium' | 'low';

// Provenance is probabilistic, not deterministic. The tracer produces ranked
// candidates for the commit that introduced the logic, never a single guess.
export interface Candidate {
  commit: Commit;
  score: number;                   // 0..1, see Part D.2
  kind: 'behavioral' | 'cosmetic';
  reasons: string[];               // why it scored this way
}

export interface RankedComment extends ReviewComment {
  relevance: number;               // 0..1, see Part D.3
}

export type EvidenceSource = 'review' | 'pr_body' | 'issue' | 'commit_message' | 'behavioral';

// Result of "why path:line", before the LLM touches it.
export interface EvidenceBundle {
  path: string;
  line: number;
  candidates: Candidate[];         // ranked, best first
  primary?: Candidate;             // candidates[0] when separation is clear enough
  lineage: Commit[];               // behavioral commits in order, shown for ambiguous cases
  introducingPr?: PullRequest;
  linkedIssue?: Issue;
  reviewComments: RankedComment[]; // ranked, best first
  behavioral: BehavioralEvidence;  // what else changed in the same commit
  usedSource: EvidenceSource;      // highest-signal source actually available
  chainBroken: boolean;            // true if PR/issue linkage could not be recovered
  confidence: Confidence;
  confidenceReasons: string[];     // why this tier, human readable
}

export interface BehavioralEvidence {
  introducingSha?: string;
  coChangedPaths: string[];           // other files touched in the introducing commit
  summaryHints: string[];             // e.g. "added retry logic", derived from diff
}

// Result of "explain-commit sha". Reuses the linker, behavioral, and summarizer.
export interface CommitExplanation {
  commit: Commit;
  pr?: PullRequest;
  linkedIssue?: Issue;
  reviewComments: RankedComment[];
  filesTouched: number;
  coChangedPaths: string[];
  riskHint: Confidence;               // crude blast-radius read from files touched + churn
}

export interface RiskReport {
  path: string;
  score: number;                      // 0..10
  signals: {
    distinctAuthors: number;
    commitsLast90d: number;
    coupledPaths: string[];           // files that historically change together
    incidentLinkedCommits: number;    // commits referencing revert/hotfix/incident
    lastTouchedDaysAgo: number;
  };
  notes: string[];
}
```

### C.2 Store (`core/store.interface.ts`)
```ts
export interface Store {
  init(): Promise<void>;                       // run migrations
  // raw evidence cache
  upsertCommits(repo: string, commits: Commit[]): Promise<void>;
  upsertPr(repo: string, pr: PullRequest): Promise<void>;
  upsertIssue(repo: string, issue: Issue): Promise<void>;
  upsertReviewComments(repo: string, prNumber: number, comments: ReviewComment[]): Promise<void>;
  getPr(repo: string, prNumber: number): Promise<PullRequest | null>;
  getIssue(repo: string, issueNumber: number): Promise<Issue | null>;
  // edges (graph-shaped, stored relationally)
  addEdge(e: Edge): Promise<void>;
  traverse(srcType: string, srcId: string, rel: string): Promise<Edge[]>;
  // provenance cache
  getLineProvenance(repo: string, path: string, lineHash: string): Promise<CachedProvenance | null>;
  putLineProvenance(repo: string, p: CachedProvenance): Promise<void>;
  close(): Promise<void>;
}

export interface Edge { srcType: string; srcId: string; rel: EdgeRel; dstType: string; dstId: string; confidence?: number; }
export type EdgeRel = 'introduced_by' | 'modified_by' | 'discussed_in' | 'fixes' | 'reviews' | 'owns' | 'depends_on';
export interface CachedProvenance { path: string; lineHash: string; introducingSha?: string; introducingPr?: number; confidence: Confidence; computedAt: string; }
```

### C.3 Git and Host (`core/git.interface.ts`, `core/host.interface.ts`)
```ts
export interface GitClient {
  resolveRepo(cwd: string): Promise<RepoRef>;
  // blame the current line, then walk its history through moves/renames
  lineHistory(path: string, line: number): Promise<LineHistoryStep[]>;
  diffOfCommit(sha: string): Promise<CommitDiff>;
  coChangedPaths(sha: string): Promise<string[]>;
  fileChurn(path: string, sinceDays: number): Promise<{ commits: Commit[]; authors: string[] }>;
}
export interface LineHistoryStep { sha: string; path: string; isCosmetic: boolean | null; } // null = not yet classified
export interface CommitDiff { sha: string; files: { path: string; added: string[]; removed: string[] }[]; }

export interface HostClient {
  prForCommit(sha: string): Promise<PullRequest | null>;
  issuesReferencedByPr(pr: PullRequest): Promise<Issue[]>;
  reviewComments(prNumber: number): Promise<ReviewComment[]>;
}
```

### C.4 LLM and Formatter (`core/llm.interface.ts`, `core/formatter.interface.ts`)
```ts
export interface LlmSummarizer {
  summarizeWhy(bundle: EvidenceBundle): Promise<WhyAnswer>;
}
export interface WhyAnswer {
  reason: string;            // one to three sentences, evidence-grounded
  citations: string[];       // e.g. ["PR #184", "Issue #102", "commit 7f2a9c1"]
  confidence: Confidence;
  noEvidence: boolean;       // true if the model had nothing to summarize
}

export interface Formatter {
  why(bundle: EvidenceBundle, answer: WhyAnswer): string;
  risk(report: RiskReport): string;
}
```

### C.5 ProvenanceEngine (`provenance/engine.ts`, signature in core)
```ts
export interface ProvenanceEngine {
  explainLine(path: string, line: number): Promise<EvidenceBundle>;
  explainCommit(sha: string): Promise<CommitExplanation>;
}
export interface RiskAnalyzer {
  analyze(path: string): Promise<RiskReport>;
}
```

---

## Part D. The Provenance Engine algorithm (A2, the most important spec)

Provenance is probabilistic, not deterministic. The engine produces ranked candidates and an honest confidence, never a single fabricated answer. `explainLine(path, line)` runs these steps. This is the product. Accuracy here is the only metric that matters.

1. **Resolve the line through in-file history.** Use `git log -L <start>,<end>:<path>` with rename and copy detection (`-M -C`) to get the commits that touched this line range within the file.
2. **Detect the file-introduction wall.** `-L` follows a path, so when code moved into this file from elsewhere, the `-L` history dead-ends at the commit that *added* the lines here. That commit is frequently a move, not the origin. Detect this case (the terminating commit's diff is a near-duplicate addition, or the file itself was added in that commit).
3. **Jump across files with pickaxe.** When step 2 hits the wall, take a distinctive token from the line (a function name plus a literal, an identifier, a string) and run `git log -S'<token>' --all` (occurrence-count change) and `git log -G'<regex>' --all` (diff content) to find where that code first entered the repository, in any file. Stitch the old-file lineage onto the new-file lineage. This cross-file stitch is the real engine and the hardest accuracy problem in the project (harder than host integration). Build it first, benchmark it relentlessly.
4. **Classify each commit cosmetic or behavioral** (D.1), then build the candidate set: every behavioral commit in the stitched lineage is a candidate.
5. **Score and rank candidates** (D.2). Do not collapse to one commit during tracing. Emit `candidates[]` ranked best first, set `primary` only when separation is clear, and always populate `lineage` so an ambiguous case shows the timeline (for `retry(5)`: the commit that added `retry`, the one that set the count, the move, the timeout) instead of forcing one answer.
6. **Recover the decision chain, with fallbacks** (D.4). For the top candidate: find the merging PR; detect squash, cherry-pick, and backport and follow them to the real source; link issues from PR body and commit messages; fetch review comments.
7. **Rank review comments by relevance** (D.3). Keep the top one or two; discard noise.
8. **Behavioral evidence** (D.6): record what else changed in the introducing commit. This saves us when humans write "fix bug" with no PR or issue.
9. **Choose the evidence source actually used** (D.4) and set `usedSource` and `chainBroken`.
10. **Score confidence** (Part E), then cache keyed by a hash of the line content so re-runs are instant and only recompute when the line changes.
11. **Return the EvidenceBundle.** The engine never writes prose. Prose is the Narrator's job (A6).

### D.1 Cosmetic vs behavioral classifier (`classifier.ts`)
Input: a commit diff restricted to the file and region of interest. Output: `isCosmetic: boolean` plus a reason. Deterministic, no LLM.
- Whitespace-only or formatting-only (compare tokens ignoring whitespace) -> cosmetic.
- Pure identifier rename with identical structure -> cosmetic.
- Move with no content change (path changed, content hash equal) -> cosmetic.
- Comment-only change -> cosmetic.
- Anything changing tokens that affect control flow, conditions, calls, or literals -> behavioral.
This is the single highest-leverage piece of code in the repo. It gets its own test suite against hand-labeled examples (A7 supplies labels), measured by precision and recall.

### D.2 Candidate scoring (`provenance/score.ts`)
Each behavioral candidate gets a score in 0..1 combining named, tunable signals (constants, not magic numbers):
- **Behavioral magnitude on the target line:** how much of the current line's tokens this commit introduced or changed. Highest weight.
- **Originality vs edit:** the earliest behavioral commit that established the current logic ranks above later tweaks, unless a later commit substantially rewrote the logic (a rewrite is a new introduction).
- **Token overlap:** diff overlap between the candidate and the current line content.
- **Evidence richness:** candidate has a linked PR and issue, which corroborates it is a real decision point.
`primary` is set to `candidates[0]` only when `candidates[0].score - candidates[1].score` exceeds a separation threshold; otherwise the answer is presented as a lineage with no single winner. Candidate separation also feeds confidence (Part E).

### D.3 Review comment relevance ranking (`provenance/comments.ts`)
A PR can have hundreds of comments, most of them noise. Rank deterministically (no LLM, to preserve the no-invention rule). Signals:
- anchored to a line inside the introducing commit's diff (strong),
- contains causal or explanatory language (because, fixes, prevents, otherwise, race, deadlock, regression, intentionally),
- length above a threshold (one-word comments are noise),
- author is a human reviewer, not a bot,
- downweight canned phrases (lgtm, nit, style, typo, ship it).
Keep the top one or two as `RankedComment[]`. This is the difference between surfacing "this fixes duplicate session creation" and "nit: spacing."

### D.4 Evidence source priority and chain recovery (`provenance/linker.ts`)
The chain commit -> PR -> issue -> review breaks often: squash merges, cherry-picks, backports, imported or migrated repos. Handle it.
- **Squash-merge:** the merge commit on `main` maps 1:1 to a PR but hides the real commits. Fetch the PR's original commits via the host PR-commits API (still available after branch deletion) for finer provenance.
- **Cherry-pick / backport:** commit messages commonly contain `(cherry picked from commit <sha>)` or reference the original PR. Parse it, follow to the source commit, and recover the real PR and issue.
- **No linkage at all:** fall back down a defined ladder and lower confidence.
Score each *available* source for decision signal and use the best for the reason, with the others corroborating. The fallback ladder when links are missing: `review` (the human argument) -> `pr_body` -> `issue` -> `commit_message` -> `behavioral`. Set `usedSource` to the source chosen and `chainBroken` to true when no PR or issue could be recovered. `chainBroken` flows into confidence.

### D.5 Git mechanics reference (for A2 and A3)
- In-file lineage: `git log -L<start>,<end>:<path>` with `-M -C`.
- Cross-file origin: pickaxe `git log -S'<token>' --all` and `git log -G'<regex>' --all`.
- Move detection: inspect the wall commit's diff for a matching deletion elsewhere, then follow the deletion side back.
- Cherry-pick: parse `(cherry picked from commit <sha>)` from messages.
- Squash: detect a 1:1 merge-commit-to-PR with multiple underlying commits; use the host PR-commits API.
These are `GitClient` (A3) primitives; the candidate logic that uses them is A2. Any new git primitive A2 needs is a `contract` issue to A3.

### D.6 Behavioral evidence (`behavioral.ts`)
From the introducing commit diff, record co-changed paths and derive short structural hints from added lines (for example "added retry logic", "added timeout handling") via simple token pattern matching. No LLM. Feeds the Narrator, especially when PR and issue are missing.

### D.7 Risk analyzer (`risk/analyzer.ts`)
Compute, for a file, over a 90 day default window: distinct authors (spread), commit count (churn), coupled paths via co-change, incident-linked commits (messages or linked PRs containing revert, hotfix, rollback, incident, outage, or an `incident` label), and days since last touched. Combine into a 0 to 10 score with documented named weights in `signals.ts`. True module fan-in via an import graph is V3, do not attempt it in V1.

### D.8 Performance budget (the litmus test is also latency)
The litmus test, beating a senior engineer's 30 second manual search, is a latency requirement, not only an accuracy one. On large histories (Kubernetes), `-L` plus pickaxe across `--all` can be slow.
- Target: under about 5 seconds warm, under about 15 seconds cold per `why` query on a large repo.
- Cap history-walk depth and pickaxe breadth; stop once a confident origin is found.
- The provenance cache (keyed by line-content hash) is mandatory, not optional. Warm queries should hit it.
- Host API calls are cached in SQLite so repeat runs do not refetch.

### D.9 explain-commit (`provenance/engine.ts`)
`explainCommit(sha)` reuses the linker (D.4), behavioral evidence (D.6), comment ranking (D.3), and the summarizer. It skips line tracing. Output is `CommitExplanation` with purpose (summarized), linked PR and issue, files touched, co-changed paths, and a crude risk hint from blast radius. It is also the team's own debugging tool for inspecting what the linker recovers. It is a V1 command but it is not part of the two-week prototype gate (Part N), which remains `why path:line` only.

---

## Part E. Confidence scoring (E, owned by A2, phrased by A6)

Three tiers, always shown. Inputs: candidate separation (D.2), tracer certainty (did the line resolve cleanly through moves and the cross-file stitch), evidence completeness, message informativeness, and `chainBroken`.

- **HIGH:** a clear winning candidate (separation above threshold) AND the line resolved cleanly AND an introducing PR was found AND (a linked issue OR a substantive top-ranked review comment) AND the chain was not broken.
- **MEDIUM:** an introducing commit and PR found but modest candidate separation, OR thin descriptions, OR no linked issue and no substantive review, OR the tracer crossed exactly one ambiguous boundary (including one recovered squash or cherry-pick).
- **LOW:** candidates are clustered with no clear winner, OR `chainBroken` is true, OR history was rewritten or squashed so the origin stays uncertain, OR only low-information commit messages exist.

`confidenceReasons` must be populated with the actual reasons (for example "history squash-merged, introducing commit inferred"). The Narrator must phrase LOW answers as uncertain and must never upgrade certainty the evidence does not support.

---

## Part F. LLM layer (A6)

### F.1 Prompt contract
The summarizer receives only the EvidenceBundle, serialized. The system prompt instructs: summarize why this line exists using only the evidence provided; cite each artifact by its identifier; if evidence is insufficient, set `noEvidence` true and say so; never add facts not present. Output is strict JSON matching `WhyAnswer`. Parse defensively (strip code fences, validate shape, fall back to `noEvidence` on parse failure).

### F.2 Provider abstraction
One `LlmProvider` interface, three implementations plus `fake.ts`. `fake.ts` returns deterministic output from the bundle so the rest of the system is testable with no network and no key. Provider and model are resolved from config (Part G). Max tokens is fixed and small; this is summarization, not generation.

### F.3 Citation enforcement
After the model returns, verify every citation in `WhyAnswer.citations` actually appears in the bundle. Drop any citation that does not. This is a guard against the model inventing references.

---

## Part G. Config and keys (A5 with A3)
- Provider key resolved in order: `--key` flag, then `ARCHAEO_LLM_KEY` env, then `~/.config/archaeo/config.json`.
- Host token resolved in order: `--token` flag, then `GITHUB_TOKEN` / `GH_TOKEN` env, then `gh` CLI config if present.
- Config file documents every option. No interactive prompts in V1 except a clear error telling the user which variable to set.
- Never log keys or tokens. A test asserts this.

---

## Part H. Benchmark and QA (A7, ships with V1)
Without this we cannot answer "how accurate is this," and "feels good on my repo" is not an answer.

### H.1 Dataset format
`benchmark/dataset/<repo>.json`, each item:
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
Repos are pinned to a specific commit for reproducibility. Target set: kubernetes, next.js, react, plus TrademarkSearchPro and ApplyOps (our own repos, where we know the ground truth). Aim for 100 labeled questions total.

### H.2 Metrics
- Top-1 accuracy: engine's chosen introducing PR equals expected.
- Top-3 accuracy: expected PR is among the engine's top three candidates.
- Confidence calibration: HIGH answers should be correct far more often than LOW answers. Report accuracy per confidence tier.
- The classifier (D.1) gets its own precision/recall against hand-labeled commits.

### H.3 Gate
`pnpm bench` runs the suite and prints a report. A PR that touches `provenance/` must include the benchmark report in its description. The lead watches for regressions in top-1 and calibration.

---

## Part I. Repository workflow and conventions (everyone follows this)

### I.1 Branches and PRs
- Branch name: `<area>/<issue>-<slug>`, for example `tracer/12-line-history-through-renames`.
- One issue, one PR. The PR description must contain: what changed, why, how it was tested, and `Closes #<issue>`.
- PR template fields: Summary, Linked issue, Tests added, Checklist (typecheck, lint, unit tests, docs).
- All PRs target `main`. Only the Lead merges to `main`.

### I.2 Commits
Conventional commits: `feat(tracer): ...`, `fix(storage): ...`, `test(llm): ...`, `chore: ...`.

### I.3 Labels
`area:tracer | area:storage | area:integration | area:cli | area:llm | area:benchmark | area:core`, `type:feature | type:bug | type:chore`, `priority:p0 | p1 | p2`, `status:blocked`, `status:needs-review`, `contract` (a request to change a `core/` interface, Lead-only to resolve).

### I.4 Definition of done (a PR is mergeable only if)
1. Typecheck passes. 2. Lint passes. 3. Unit tests pass and cover the new logic. 4. No key/token logging. 5. Docs or README updated if behavior changed. 6. Reviewed and approved by the Lead. 7. For `provenance/` PRs, benchmark report attached.

### I.5 CI gates (Lead sets up in Phase 0)
On every PR: install, typecheck, lint, unit tests, build. On PRs labeled `area:tracer`: also a benchmark smoke run on the two own-repos (fast subset). Red CI blocks merge.

### I.6 Contract changes
No specialist edits `src/core/`. If an agent needs an interface change, they open a `contract` issue describing the need. The Lead decides, ships the interface change as a small Lead-owned PR, then unblocks the dependent agents. This keeps the seams stable and parallel work safe.

---

## Part J. The 7 agents

Seven agents total: one Lead who orchestrates and integrates, and six specialists who each own a module and deliver PRs against issues. The Lead raises issues and merges PRs to `main`. Specialists pick up issues, raise PRs, and respond to review.

| # | Agent | Role | Owns (modules) | Core skills |
|---|---|---|---|---|
| A1 | **Maestro** | Lead / Orchestrator / Integration | `core/`, CI, repo config, `main` | system design, TypeScript, code review, git/GitHub workflow, decomposition, keeping the architecture coherent |
| A2 | **Tracer** | Provenance + Risk (the moat) | `provenance/`, `risk/` | git internals, diff and AST reasoning, algorithms, classification, TypeScript |
| A3 | **Connector** | Git + Host integration | `integration/` | API integration (Octokit/GitLab/Bitbucket), auth and tokens, rate limiting, caching, TypeScript |
| A4 | **Keeper** | Storage and data layer | `storage/` | SQL, schema and migration design, `node:sqlite` (D-001), relational modeling of graph data, TypeScript |
| A5 | **Surface** | CLI and DX | `cli/`, `config/`, packaging | CLI design (commander), output formatting, npm packaging and bin setup, DX, TypeScript |
| A6 | **Narrator** | LLM summarization | `llm/` | LLM and prompt engineering, provider SDKs, strict JSON parsing, citation enforcement, TypeScript |
| A7 | **Auditor** | Benchmark and QA | `benchmark/`, `test/fixtures/` | evaluation and metrics design, test fixture creation, dataset labeling, Vitest, TypeScript |

### J.1 Ownership boundaries (so PRs do not collide)
Each specialist edits only their owned directories plus shared test files inside their area. Cross-cutting types live in `core/` and only the Lead touches them. If a task needs two areas, it is split into two issues with a dependency, not one PR spanning two owners.

### J.2 The Lead's job in plain terms (A1 playbook)
1. **Phase 0, alone:** create the repo, set up pnpm + TypeScript + Vitest + tsup + ESLint/Prettier + CI, write every `core/` interface and a compiling stub for each module, and open the full issue backlog (Part K) labeled and assigned. Output: every agent can clone, install, build, and start coding against stable contracts.
2. **Daily:** triage new issues, keep the backlog ordered, review open PRs promptly, and merge in the correct order so `main` never breaks.
3. **Sequence merges by dependency.** Storage, Git/Host clients, and the fake LLM provider land before the Tracer is wired, because the Tracer depends on their interfaces (it can develop against mocks earlier, but integration merges follow the dependency order).
4. **Own all contract changes.** Any `core/` edit is a Lead PR. Resolve `contract` issues fast, because they block other agents.
5. **Guard the moat and the rule.** Reject any PR that lets the LLM invent evidence, that drops confidence honesty, or that hard-codes a database engine into a caller. Watch benchmark regressions on Tracer PRs.
6. **Protect scope.** Close PRs that build non-goals (Part A.6).

---

## Part K. Task backlog (Phase 0 issues, assigned and ordered)

Issue IDs are illustrative. Each issue lists acceptance criteria. Items marked `dep:` cannot start until the dependency is merged, but agents can develop against the interface and mocks before then.

### A1 Maestro (Lead)
- **#1 Repo + tooling skeleton.** pnpm workspace, tsconfig, ESLint/Prettier, Vitest, tsup, bin wiring. Done when `pnpm build` and `pnpm test` run green on an empty project.
- **#2 Core contracts.** All `core/` interfaces from Part C committed and compiling, with module stubs that satisfy them (throwing `NotImplemented`). Done when every module imports its interface and the project typechecks.
- **#3 CI pipeline.** GitHub Actions: typecheck, lint, test, build on PRs; benchmark smoke on `area:tracer` PRs. Done when CI is required for merge.
- **#4 Backlog + labels + templates.** All issues below created, labeled, assigned; PR and issue templates committed.

### A4 Keeper (Storage) — early, others depend on it
- **#10 SQLite schema + migrations.** Implement `schema.sql` (Part L) and a simple migration runner. Done when `store.init()` creates all tables idempotently.
- **#11 SqliteStore: evidence cache.** Implement commit/PR/issue/review upserts and getters with row<->domain mappers. Done with unit tests on a temp DB file.
- **#12 SqliteStore: edges + traverse.** Implement `addEdge` and a recursive-CTE `traverse`. Done with a test traversing introduced_by -> fixes.
- **#13 SqliteStore: provenance cache.** `getLineProvenance` / `putLineProvenance` keyed by line hash. Done with a cache hit/miss test.
- **#14 GraphStore stub.** A `GraphStore` class implementing `Store` with `NotImplemented`, to prove the seam. Not wired. Done when it compiles and a skipped test documents intent.

### A3 Connector (Integration) — early, Tracer depends on it
- **#20 GitClient: resolveRepo + lineHistory.** Implement repo detection and line-range history (`git log -L` with `-M -C`). Done with tests on a synthetic fixture repo (A7 provides) that renames and moves a file.
- **#21 GitClient: diffOfCommit + coChangedPaths + fileChurn.** Done with fixture tests.
- **#22 HostClient: GitHub.** `prForCommit`, `issuesReferencedByPr`, `reviewComments` via Octokit. Done with recorded-response tests (no live network in CI).
- **#23 Rate limiting + auth.** Token resolution (Part G), backoff and caching so repeated runs do not refetch. Done with a test that a second call hits cache.
- **#25 Cross-file origin + chain-break primitives.** Pickaxe helpers (`-S` / `-G` across `--all`), move-side detection, squash detection (1:1 merge-to-PR with multiple commits) plus PR-commits fetch, and cherry-pick parse (`cherry picked from commit <sha>`). These are the `GitClient`/`HostClient` primitives D.4 and D.5 depend on. Done with fixture tests covering a moved file, a squash, and a cherry-pick.
- **#26 GitLab + Bitbucket: REMOVED from V1.** The `HostClient` interface stays; implementations are out of scope. Do not build. Tracked as a V2 item only.

### A6 Narrator (LLM) — can start immediately against the bundle type
- **#30 LlmProvider interface + fake provider.** Deterministic `fake.ts`. Done when the engine can summarize with no network.
- **#31 Summarizer + prompt contract.** Strict JSON `WhyAnswer`, defensive parsing, `noEvidence` path. Done with tests feeding sample bundles.
- **#32 Citation enforcement.** Drop citations not present in the bundle. Done with a test where the model returns a fake citation and it is removed.
- **#33 Real providers.** Anthropic, OpenAI, Gemini implementations. Done with a thin integration test gated behind a key (skipped in CI).

### A2 Tracer (Provenance + Risk) — the core, depends on A3 and A4 interfaces
- **#40 Cosmetic vs behavioral classifier.** Implement D.1 heuristics. Done when it passes A7's hand-labeled set at an agreed precision/recall bar.
- **#41 Line tracer with cross-file stitch.** In-file `-L` lineage, file-introduction wall detection, pickaxe cross-file origin, candidate set construction (D.5). Done with fixture tests covering rename, move, and a logic-moved-to-utility case.
- **#42 Candidate scoring.** Implement D.2 with named weights; set `primary` only above the separation threshold; always populate `lineage`. Done with tests including an ambiguous multi-commit case that returns no single winner.
- **#43 Evidence linker + chain recovery.** commit -> PR -> issue -> review, plus squash, cherry-pick, and backport recovery and the source ladder (D.4). Sets `usedSource` and `chainBroken`. Done with recorded-response tests covering a broken chain recovered via cherry-pick.
- **#44 Review comment relevance ranking.** Implement D.3 deterministic signals. Done with a test where one substantive comment outranks 50 noise comments.
- **#45 Behavioral evidence.** Co-changed paths and structural hints from the introducing diff (D.6). Done with tests.
- **#46 Confidence scorer.** Implement Part E including candidate separation and `chainBroken`, with populated reasons. Done with tests across all three tiers.
- **#47 ProvenanceEngine.explainLine.** Wire 40 to 46 with the provenance cache and the Part D.8 performance budget (depth cap, warm-cache target). Done end to end against fixtures with the fake LLM and a latency assertion on the warm path.
- **#48 explainCommit + RiskAnalyzer.** `explainCommit` (D.9, reuses linker + behavioral + comment ranking) and the risk analyzer (D.7). Done with fixture tests. `explain-commit` is V1 but excluded from the prototype gate.

### A5 Surface (CLI) — can scaffold immediately, wires last
- **#50 CLI scaffold + config + key resolution.** `archaeo` bin, commander setup, Part G resolution. Done when `archaeo --help` works and config errors are clear.
- **#51 `why` command + formatter.** The killer-demo output (Part M). Done when `archaeo why path:line` prints a full result against a fixture repo with the fake LLM.
- **#52 `risk` command + formatter.** Done against a fixture repo.
- **#53 Packaging.** `npm`/`npx` install, bin, README quickstart. Done when `npx archaeo why ...` works from a packed tarball.

### A7 Auditor (Benchmark + QA) — provides fixtures early, benchmark mid
- **#60 Fixture repos.** Synthetic git repos exercising rename, move (logic relocated to a utility), squash, cherry-pick, cosmetic-only, and missing-PR cases. Recorded host responses. Done when A2 and A3 can test offline.
- **#61 Classifier + comment label sets.** Hand-labeled commits for D.1, and hand-labeled "most relevant comment" sets for D.3. Done when A2 #40 and #44 can measure against them.
- **#62 Benchmark harness.** `pnpm bench`, dataset loader, metrics (top-1, top-3 over candidates, calibration), report. Done when it runs on the own-repos subset and reports per-confidence-tier accuracy.
- **#63 Full dataset.** 100 labeled questions across the target repos, including expected introducing PR and, where known, the expected most-relevant review comment. Done when the report covers all five repos.

---

## Part L. SQLite schema (`storage/schema.sql`)
```sql
CREATE TABLE IF NOT EXISTS commits (
  repo TEXT NOT NULL, sha TEXT NOT NULL, author_login TEXT, author_name TEXT,
  authored_at TEXT, message TEXT, PRIMARY KEY (repo, sha)
);
CREATE TABLE IF NOT EXISTS prs (
  repo TEXT NOT NULL, number INTEGER NOT NULL, title TEXT, body TEXT,
  author_login TEXT, merged_sha TEXT, state TEXT, PRIMARY KEY (repo, number)
);
CREATE TABLE IF NOT EXISTS issues (
  repo TEXT NOT NULL, number INTEGER NOT NULL, title TEXT, body TEXT, state TEXT,
  PRIMARY KEY (repo, number)
);
CREATE TABLE IF NOT EXISTS review_comments (
  repo TEXT NOT NULL, pr_number INTEGER NOT NULL, author TEXT, body TEXT,
  path TEXT, line INTEGER, submitted_at TEXT
);
CREATE TABLE IF NOT EXISTS engineers (
  repo TEXT NOT NULL, login TEXT NOT NULL, name TEXT, PRIMARY KEY (repo, login)
);
-- graph-shaped, stored relationally; migrates to a graph engine later
CREATE TABLE IF NOT EXISTS edges (
  repo TEXT NOT NULL, src_type TEXT, src_id TEXT, rel TEXT,
  dst_type TEXT, dst_id TEXT, confidence REAL
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(repo, src_type, src_id, rel);
-- expensive cached result
CREATE TABLE IF NOT EXISTS line_provenance (
  repo TEXT NOT NULL, path TEXT NOT NULL, line_hash TEXT NOT NULL,
  introducing_sha TEXT, introducing_pr INTEGER, confidence TEXT, computed_at TEXT,
  PRIMARY KEY (repo, path, line_hash)
);
```

---

## Part M. The `why` output (the demo, A5 must match this shape)

Clear winner:
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

Ambiguous lineage (no single winner, candidates clustered):
```
why src/util/retry.ts:12
-----------------------------------------------------
This logic has no single origin. Lineage:
  2023-09-02  a11c3   added retry()                 PR #77
  2023-11-18  b922f   changed retry count to 5      PR #98
  2024-02-04  c4d10   moved retry into util/        (move)
Reason:      Best evidence is PR #98, which set the retry count.
Confidence:  MEDIUM  (candidates clustered, showing lineage)
-----------------------------------------------------
```

Recovered broken chain:
```
why src/payments/charge.ts:88
-----------------------------------------------------
Introduced:  2024-03-10   commit 5ad21  (cherry-picked from 9f0e2)
Reason:      Backported idempotency key to prevent double charges.
Evidence:    original PR #233 recovered via cherry-pick reference
Confidence:  MEDIUM  (chain recovered through a cherry-pick)
-----------------------------------------------------
```

Honest LOW case:
```
why src/legacy/cache.ts:31
-----------------------------------------------------
Reason:      No recorded decision found.
Trace:       line history was squash-merged; best guess commit a91f2 ("update").
Evidence:    no linked PR or issue.
Confidence:  LOW
-----------------------------------------------------
```

---

## Part N. The litmus test (how we know it works)
Build `archaeo why path:line` first, point it at kubernetes, next.js, react, TrademarkSearchPro, and ApplyOps, and read the output. If an experienced engineer repeatedly says "wait, how did it find that," keep going. If it mostly says "initial commit / unknown / low confidence," we learned that the decision history is not recoverable from git alone, which is worth knowing in two weeks instead of six months. The whole project rests on the provenance engine finding things a senior engineer cannot find in under 30 seconds. That is the bar.