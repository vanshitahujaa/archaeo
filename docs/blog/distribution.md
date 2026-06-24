# archaeo — launch distribution kit

Copy-paste posts per platform. **Replace `https://archaeo.dev/...` with your real Vercel URL** once the site is live. Lead with the article link on Dev.to/Hashnode/Medium; lead with the GitHub repo on HN/Reddit (communities prefer source over a blog).

Golden rules: post during weekday US mornings (ET); reply to every early comment within the first hour; never argue, always concede honest limitations (it's the brand). Don't blast all platforms in the same hour — stagger over a few days so you can actually engage.

---

## Hacker News — "Show HN"

**Title** (HN strips fluff; ≤80 chars, no emoji):
```
Show HN: Archaeo – trace why a line of code exists, back to the PR that made it
```
**URL:** `https://github.com/vanshitahujaa/archaeo`

**First comment** (post immediately after submitting):
```
Author here. git blame shows the last commit that touched a line — usually a
rename or a reformat that tells you nothing. archaeo follows the line backward
through moves, renames, refactors, squash-merges and cherry-picks to the commit
that introduced the *behavior*, then attaches the PR, the linked issue, and the
review comments that argued about it.

The one rule: the LLM only summarizes retrieved evidence and cites every artifact.
If there's no recorded decision, it says so instead of guessing — a confident
wrong answer is the only unacceptable outcome.

It's local, git-history-only, bring-your-own-LLM-key, MIT. The hard part is the
cross-file "blame-through-time" trace, not the LLM.

I ran 150+ real queries on kubernetes/react/cognee before posting — on PR-driven
repos it resolved 85/87 lines (97.7%) to the real introducing PR; on a repo built
via direct-to-main commits it correctly returned "no recorded decision" for all 19.
Full per-line evidence: <evidence link>.

Honest limits: git-only (won't see Slack/Jira), GitHub-only for now, slow on
partial/shallow clones. Would love feedback on where it fails on your repos.
```

---

## r/programming

r/programming downvotes overt self-promo. Lead with the *idea*, not "I made a thing."

**Title:**
```
git blame tells you who last touched a line. I built an open-source tool that traces it back to the PR, issue, and review that introduced the logic.
```
**Body:**
```
The last commit that touched a line is almost always cosmetic — a rename, a
formatting pass — so `git blame` rarely tells you *why* code exists. I wanted the
actual decision: the PR that shipped it, the issue that caused it, the review
comment where someone argued for it.

So I built `archaeo` (MIT, local, git-only). It follows a line backward through
moves/renames/refactors/squash-merges to the commit that introduced the behavior,
skipping cosmetic commits, then recovers the PR → issue → review chain. The LLM
only summarizes the retrieved evidence and cites every artifact; if nothing is
recorded it says "no recorded decision found" rather than hallucinate.

The interesting engineering is the cross-file trace (git -L + pickaxe across all
history to find where logic *originated*, even if it was later moved to another
file), and an honest confidence score.

I validated it on 150+ real lines across kubernetes/react/cognee before posting —
write-up + every result here: <article link>. Repo: <repo link>.

Curious where it breaks on codebases other than the ones I tested.
```

---

## r/opensource

**Title:**
```
[MIT] archaeo — a local CLI that explains *why* any line of code exists (commit → PR → issue → review), bring-your-own-LLM-key
```
**Body:** (warmer; community is fine with "I built")
```
Released V1 of archaeo today. It answers "why is this line here, and can I safely
change it?" by tracing the line back through its real history to the PR/issue/review
that introduced the logic — not the last cosmetic commit git blame shows you.

Fully local, git-history-only, bring-your-own-LLM-key (or run offline with a
deterministic summarizer). No SaaS, no telemetry. The non-negotiable rule: it only
summarizes retrieved evidence and cites it; missing evidence = "no recorded decision
found." Honesty about coverage is a feature.

npm i -g git-archaeo  (the command is `archaeo`). 150+ real-repo results in the
write-up. Issues/PRs/feedback very welcome — it's built fully in the open.

Repo: <repo>   Article + evidence: <article>
```

---

## r/devops

**Angle: incident response / on-call.**
**Title:**
```
For on-call: a CLI that tells you why a line exists (the PR + the review debate) instead of the cosmetic commit git blame points at
```
**Body:**
```
3am, an incident, you're staring at a config value or a retry count in a service you
didn't write. `git blame` points at "chore: lint." Useless. archaeo traces the line
back through moves/renames/refactors to the PR that introduced it and surfaces the
review comments where the behavior was argued — e.g. on kubernetes it pulled a
reviewer's note that a piece of scheduler priority logic was "error-prone and hard
to track observability-wise." That's the context you actually need to decide whether
to touch it.

Also does `archaeo risk <file>` — a 0–10 blast-radius score from churn / author
spread / co-change / incident-linked commits. Local, git-only, MIT, BYO key.

Repo + 150 real results: <links>
```

---

## r/softwarearchitecture

**Angle: decision recovery + the seams.**
**Title:**
```
Recovering architectural decisions from git history: tracing a line to the PR/issue/review that introduced it (open source)
```
**Body:**
```
Architecture decisions decay: the ADR was never written, the people left, the
reasoning lives unindexed in old PR threads. archaeo recovers the decision behind a
specific line by tracing it (through moves/renames/refactors/squash) to the
introducing commit and its PR → issue → review chain, with an honest confidence
tier — and "no recorded decision found" when the history is genuinely undocumented
(which itself tells you where your knowledge risk is).

Built around hard interface seams so it stays honest and swappable: a Store
interface (SQLite now, graph engine later, zero caller change), abstracted git/host
clients, and a summarize-only, provider-agnostic LLM layer that can never invent
evidence. Local, git-only, MIT.

Design notes + 150 real-repo results: <links>
```

---

## LinkedIn

```
Code outlives the reasons it was written. People leave, teams reorg, and the "why"
behind a line of code gets buried — git blame just shows you the last person who
reformatted it.

So I built archaeo (open source): point it at any line and it traces back through
every move, rename and refactor to the commit, PR, issue, and review comment that
actually introduced the logic — with an honest confidence score, and a flat "no
recorded decision found" when the history doesn't support an answer. No hallucinated
explanations.

I tested it on 150+ real lines in kubernetes, react and others before shipping: on
PR-driven repos it found the real introducing PR ~98% of the time, including pulling
the original reviewer's design critique out of a years-old thread.

Local, git-only, bring-your-own-LLM-key, MIT-licensed.

npm i -g git-archaeo
Repo + write-up in comments 👇

#opensource #developertools #softwareengineering #git
```
(Put the links in the first comment — LinkedIn suppresses posts with outbound links in the body.)

---

## Dev.to / Hashnode / Medium

Publish `why-archaeo.md` as the main post and `evidence.md` as a follow-up/linked post.
- **Dev.to:** front-matter tags already set (`git, opensource, devtools, productivity`). Set the canonical_url to the Vercel page so SEO consolidates.
- **Hashnode:** same content; add a cover image; cross-post with canonical → Vercel.
- **Medium:** import via "Import a story" from the Vercel URL so the canonical is set automatically, or paste and set canonical in story settings.
Publish order: Vercel (canonical) → Dev.to → Hashnode → Medium, a day or two apart.

---

## GitHub Discussions (your repo)

Enable Discussions (Settings → Features → Discussions), category **Announcements**.
**Title:** `archaeo v0.1.0 — trace why a line of code exists`
**Body:** short version of the article intro + the install block + links to the article and evidence. (I can post this for you on request.)
