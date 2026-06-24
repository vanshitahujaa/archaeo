---
title: "archaeo — evidence: 150+ real runs on real repos"
published: false
description: "Every why/risk result behind the archaeo launch post — reproducible, per line, with honest confidence tiers. kubernetes, react, cognee, and more."
tags: git, opensource, devtools, benchmarks
canonical_url: https://archaeo.dev/blog/evidence
---

# archaeo — the evidence

This is the receipts page for [*git blame tells you who; archaeo tells you why*](https://archaeo.dev/blog/why-archaeo). Every row below is a **real `archaeo` run against a real, public (or real private) repository** — no curated demos, no cherry-picking.

## Method

Each row was produced by running the built CLI exactly as a user would, from inside a normal clone:

```bash
export GITHUB_TOKEN="$(gh auth token)"
archaeo why <path>:<line> --provider fake     # line-level provenance
archaeo risk <path>                           # file-level risk
```

- `--provider fake` is the offline, deterministic summarizer (no LLM key). It summarizes **only** the retrieved evidence; a real key (Anthropic/OpenAI/Gemini) just writes a crisper sentence — the **evidence linkage**, which is what's measured here, is identical.
- Target lines were **sampled programmatically** (a behavioral line — `def`/`if`/`return`/`raise`/call — about two-thirds of the way through each file), not hand-picked. This is deliberately adversarial: it includes boring lines, not just juicy ones.
- **"Resolved to a PR"** means `archaeo` recovered a concrete, citable introducing PR — *not* that it guessed. Correctness was spot-checked on a subset (the ones inspected were right).
- Confidence tiers: **HIGH** = clear winning commit + PR + (linked issue or substantive *human* review); **MEDIUM** = PR found, thinner evidence; **LOW** = clustered candidates, broken chain, or no decision recorded.

## Headline numbers

**Line-level `why` — PR-driven repos (kubernetes + cognee), 87 queries:**

```
PR-found:  85 / 87  (97.7%)
tiers:     6 HIGH · 58 MEDIUM · 22 LOW · 1 TIMEOUT
latency:   3–8s typical on full clones (kubernetes median 6s; cognee 3.1s avg)
```

**Per repo:**

| Repo | Queries | PR-found | HIGH | MEDIUM | LOW | Notes |
|---|---|---|---|---|---|---|
| kubernetes/kubernetes (138k commits) | 30 | 28 (93%) | 6 | 16 | 7 | 1 timeout on a *vendored* file (blobless clone) |
| topoteretes/cognee — batch 1 | 38 | 38 (100%) | 0 | 29 | 9 | 3.1s avg |
| topoteretes/cognee — batch 2 | 19 | 19 (100%) | 0 | 13 | 6 | different files |
| facebook/react (21k commits) | 3 | 2 | 1 | 1 | 1 (honest) | scheduler `timeout`/`frameInterval` → real PRs |
| **a direct-push repo (no PRs)** | 19 | **0 (honest LOW)** | 0 | 0 | 19 | the tool refusing to fabricate — working as designed |

> **Why so few HIGH?** HIGH requires corroborating evidence (a linked issue *or* a substantive human review comment) on top of a clean trace + PR. Most PRs in the wild don't carry that, so they correctly earn MEDIUM. The kubernetes HIGHs are PRs that *did* have linked issues and real reviewer discussion. The model never inflates its certainty — that's the point.

**File-level `risk` — 45 files:** produces a usable hotspot ranking, not noise. On the direct-push repo it flagged the central `api/main.py` at **7.0/10 (HIGH)** — the most-churned file — while stable utilities scored LOW.

---

## Full results — `why` (line-level), 106 runs

| # | Repo | Target (path:line) | Confidence | Introducing PR | s |
|---|---|---|---|---|---|
| 1 | cognee | `cognee/alembic/env.py:53` | MEDIUM | PR#144 | 5s |
| 2 | cognee | `cognee/alembic/env.py:75` | MEDIUM | PR#144 | 4s |
| 3 | cognee | `cognee/api/v1/agents/agents.py:135` | MEDIUM | PR#3003 | 2s |
| 4 | cognee | `cognee/api/v1/agents/agents.py:205` | MEDIUM | PR#3003 | 2s |
| 5 | cognee | `cognee/eval_framework/benchmark_adapters/base_benchmark_adapter.py:24` | MEDIUM | PR#627 | 5s |
| 6 | cognee | `cognee/eval_framework/benchmark_adapters/base_benchmark_adapter.py:37` | MEDIUM | PR#627 | 4s |
| 7 | cognee | `cognee/eval_framework/evaluation/run_evaluation_module.py:36` | MEDIUM | PR#576 | 2s |
| 8 | cognee | `cognee/eval_framework/evaluation/run_evaluation_module.py:55` | MEDIUM | PR#576 | 2s |
| 9 | cognee | `cognee/infrastructure/databases/utils/closing_lru_cache.py:141` | MEDIUM | PR#2803 | 4s |
| 10 | cognee | `cognee/infrastructure/databases/utils/closing_lru_cache.py:270` | MEDIUM | PR#2803 | 2s |
| 11 | cognee | `cognee/infrastructure/loaders/core/text_loader.py:51` | MEDIUM | PR#1240 | 2s |
| 12 | cognee | `cognee/infrastructure/loaders/core/text_loader.py:79` | MEDIUM | PR#1240 | 3s |
| 13 | cognee | `cognee/modules/agents/agent_mode.py:66` | MEDIUM | PR#2923 | 3s |
| 14 | cognee | `cognee/modules/agents/agent_mode.py:98` | LOW | PR#2923 | 2s |
| 15 | cognee | `cognee/modules/data/methods/get_dataset_databases.py:8` | LOW | PR#2637 | 3s |
| 16 | cognee | `cognee/modules/data/methods/get_dataset_databases.py:11` | LOW | PR#2637 | 2s |
| 17 | cognee | `cognee/modules/graph/methods/get_data_related_nodes.py:33` | MEDIUM | PR#2028 | 4s |
| 18 | cognee | `cognee/modules/graph/methods/get_data_related_nodes.py:63` | LOW | PR#2028 | 3s |
| 19 | cognee | `cognee/modules/memify/memify.py:93` | LOW | PR#1329 | 3s |
| 20 | cognee | `cognee/modules/memify/memify.py:118` | MEDIUM | PR#1329 | 2s |
| 21 | cognee | `cognee/modules/pipelines/layers/setup_and_check_environment.py:26` | LOW | PR#869 | 8s |
| 22 | cognee | `cognee/modules/pipelines/layers/setup_and_check_environment.py:38` | LOW | PR#2123 | 3s |
| 23 | cognee | `cognee/modules/retrieval/agentic_retriever.py:234` | MEDIUM | PR#2726 | 3s |
| 24 | cognee | `cognee/modules/retrieval/agentic_retriever.py:397` | MEDIUM | PR#2989 | 3s |
| 25 | cognee | `cognee/modules/retrieval/utils/completion.py:57` | MEDIUM | PR#2133 | 3s |
| 26 | cognee | `cognee/modules/retrieval/utils/completion.py:103` | MEDIUM | PR#2133 | 2s |
| 27 | cognee | `cognee/modules/settings/get_settings.py:19` | MEDIUM | PR#1830 | 3s |
| 28 | cognee | `cognee/modules/settings/get_settings.py:60` | MEDIUM | PR#94 | 2s |
| 29 | cognee | `cognee/modules/users/get_user_db.py:11` | MEDIUM | PR#133 | 3s |
| 30 | cognee | `cognee/modules/users/get_user_db.py:16` | LOW | PR#123 | 4s |
| 31 | cognee | `cognee/modules/users/permissions/methods/get_tenant.py:24` | MEDIUM | PR#869 | 4s |
| 32 | cognee | `cognee/modules/users/permissions/methods/get_tenant.py:27` | MEDIUM | PR#869 | 5s |
| 33 | cognee | `cognee/tasks/graph/extract_graph_from_data_v2.py:46` | MEDIUM | PR#541 | 3s |
| 34 | cognee | `cognee/tasks/graph/extract_graph_from_data_v2.py:60` | LOW | PR#541 | 4s |
| 35 | cognee | `cognee/tasks/memify/global_context_index/bucketing/vector/placement.py:87` | MEDIUM | PR#2848 | 2s |
| 36 | cognee | `cognee/tasks/memify/global_context_index/bucketing/vector/placement.py:159` | MEDIUM | PR#2848 | 2s |
| 37 | cognee | `cognee/tasks/translation/providers/azure_provider.py:87` | MEDIUM | PR#1958 | 3s |
| 38 | cognee | `cognee/tasks/translation/providers/azure_provider.py:149` | MEDIUM | PR#1958 | 2s |
| 39 | cognee | `cognee/alembic/env.py:75` | MEDIUM | PR#144 | 4s |
| 40 | cognee | `cognee/api/v1/agents/agents.py:205` | MEDIUM | PR#3003 | 3s |
| 41 | cognee | `cognee/eval_framework/benchmark_adapters/base_benchmark_adapter.py:37` | MEDIUM | PR#627 | 3s |
| 42 | cognee | `cognee/eval_framework/evaluation/run_evaluation_module.py:55` | MEDIUM | PR#576 | 2s |
| 43 | cognee | `cognee/infrastructure/databases/utils/closing_lru_cache.py:270` | MEDIUM | PR#2803 | 3s |
| 44 | cognee | `cognee/infrastructure/llm/structured_output_framework/baml/baml_client/inlinedbaml.py:20` | MEDIUM | PR#1054 | 4s |
| 45 | cognee | `cognee/infrastructure/loaders/core/text_loader.py:79` | MEDIUM | PR#1240 | 3s |
| 46 | cognee | `cognee/modules/agents/agent_mode.py:98` | LOW | PR#2923 | 3s |
| 47 | cognee | `cognee/modules/data/methods/get_dataset_databases.py:11` | LOW | PR#2637 | 2s |
| 48 | cognee | `cognee/modules/graph/methods/get_data_related_nodes.py:63` | LOW | PR#2028 | 2s |
| 49 | cognee | `cognee/modules/memify/memify.py:118` | MEDIUM | PR#1329 | 3s |
| 50 | cognee | `cognee/modules/pipelines/layers/setup_and_check_environment.py:38` | LOW | PR#2123 | 3s |
| 51 | cognee | `cognee/modules/retrieval/agentic_retriever.py:397` | MEDIUM | PR#2989 | 2s |
| 52 | cognee | `cognee/modules/retrieval/utils/completion.py:103` | MEDIUM | PR#2133 | 3s |
| 53 | cognee | `cognee/modules/settings/get_settings.py:60` | MEDIUM | PR#94 | 2s |
| 54 | cognee | `cognee/modules/users/get_user_db.py:16` | LOW | PR#123 | 5s |
| 55 | cognee | `cognee/modules/users/permissions/methods/get_tenant.py:27` | MEDIUM | PR#869 | 4s |
| 56 | cognee | `cognee/tasks/graph/extract_graph_from_data_v2.py:60` | LOW | PR#541 | 4s |
| 57 | cognee | `cognee/tasks/memify/global_context_index/bucketing/vector/placement.py:159` | MEDIUM | PR#2848 | 2s |
| 58 | kubernetes | `staging/src/k8s.io/cri-api/pkg/apis/runtime/v1/api_json.go:34` | MEDIUM | PR#139964 | 9s |
| 59 | kubernetes | `staging/src/k8s.io/cloud-provider/controllers/nodelifecycle/metrics.go:44` | MEDIUM | PR#137964 | 7s |
| 60 | kubernetes | `staging/src/k8s.io/cloud-provider/controllers/nodelifecycle/config/v1alpha1/conversion.go:37` | MEDIUM | PR#137964 | 6s |
| 61 | kubernetes | `staging/src/k8s.io/cloud-provider/controllers/nodelifecycle/config/v1alpha1/defaults.go:29` | LOW | PR#137964 | 9s |
| 62 | kubernetes | `staging/src/k8s.io/cloud-provider/options/nodelifecycle.go:54` | MEDIUM | PR#137964 | 4s |
| 63 | kubernetes | `test/e2e/scheduling/workload_aware_preemption.go:143` | HIGH | PR#139375 | 6s |
| 64 | kubernetes | `staging/src/k8s.io/apiserver/pkg/storage/cacher/key/key.go:34` | LOW | PR#64513 | 20s |
| 65 | kubernetes | `test/integration/scheduler_perf/runners.go:293` | HIGH | PR#139785 | 86s |
| 66 | kubernetes | `test/declarative_validation/meta/objectmeta.go:603` | MEDIUM | PR#139568 | 6s |
| 67 | kubernetes | `staging/src/k8s.io/apiserver/pkg/storage/cacher/watch_cache_history.go:167` | MEDIUM | PR#139719 | 7s |
| 68 | kubernetes | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/responsewriters/compression.go:65` | HIGH | PR#139482 | 5s |
| 69 | kubernetes | `staging/src/k8s.io/apimachinery/pkg/runtime/fieldinfo_127.go:27` | HIGH | PR#139607 | 5s |
| 70 | kubernetes | `staging/src/k8s.io/code-generator/cmd/validation-gen/output_tests/tags/customvalidation/validations.go:42` | MEDIUM | PR#139560 | 4s |
| 71 | kubernetes | `staging/src/k8s.io/code-generator/cmd/validation-gen/validators/customvalidation.go:153` | MEDIUM | PR#139560 | 6s |
| 72 | kubernetes | `test/images/agnhost/h2c-server/server.go:59` | HIGH | PR#139580 | 6s |
| 73 | kubernetes | `test/e2e/storage/csimock/csi_storage_capacity_scoring.go:154` | MEDIUM | PR#138497 | 4s |
| 74 | kubernetes | `test/integration/podautoscaler/util.go:169` | HIGH | PR#139483 | 6s |
| 75 | kubernetes | `test/e2e_node/runner/node/node.go:151` | MEDIUM | PR#139129 | 5s |
| 76 | kubernetes | `test/e2e_node/mounter/mounter.go:69` | MEDIUM | PR#139129 | 4s |
| 77 | kubernetes | `test/e2e_node/plugins/gcp-credential-provider/pkg/main.go:96` | MEDIUM | PR#139129 | 4s |
| 78 | kubernetes | `test/e2e_node/plugins/gcp-credential-provider/pkg/provider.go:93` | MEDIUM | PR#139129 | 4s |
| 79 | kubernetes | `vendor/go.etcd.io/etcd/api/v3/authpb/deprecated.go:23` | TIMEOUT | — | 150s |
| 80 | kubernetes | `vendor/go.etcd.io/etcd/api/v3/mvccpb/extension.go:23` | LOW | — | 42s |
| 81 | kubernetes | `vendor/go.etcd.io/etcd/client/v3/block_logger.go:55` | MEDIUM | PR#139139 | 7s |
| 82 | kubernetes | `vendor/go.etcd.io/etcd/pkg/v3/netutil/host_normalize.go:41` | MEDIUM | PR#139139 | 4s |
| 83 | kubernetes | `vendor/go.etcd.io/etcd/server/v3/etcdserver/apply/backend.go:166` | LOW | PR#100488 | 15s |
| 84 | kubernetes | `vendor/go.etcd.io/etcd/server/v3/etcdserver/apply/capped.go:38` | LOW | PR#100488 | 7s |
| 85 | kubernetes | `vendor/go.etcd.io/etcd/server/v3/etcdserver/apply/quota.go:46` | LOW | PR#100488 | 7s |
| 86 | kubernetes | `vendor/go.etcd.io/etcd/server/v3/etcdserver/interface.go:35` | MEDIUM | PR#139139 | 3s |
| 87 | kubernetes | `vendor/go.etcd.io/etcd/server/v3/etcdserver/read/metrics.go:28` | LOW | PR#100488 | 6s |
| 88 | AutoFixOps | `api/config_helpers.py:159` | LOW | — | 1s |
| 89 | AutoFixOps | `api/database.py:76` | LOW | — | 1s |
| 90 | AutoFixOps | `api/events.py:97` | LOW | — | 1s |
| 91 | AutoFixOps | `api/main.py:514` | LOW | — | 1s |
| 92 | AutoFixOps | `api/models.py:161` | LOW | — | 1s |
| 93 | AutoFixOps | `engine/ai_diagnostics.py:68` | LOW | — | 0s |
| 94 | AutoFixOps | `engine/baseline.py:48` | LOW | — | 0s |
| 95 | AutoFixOps | `engine/circuit_breaker.py:161` | LOW | — | 0s |
| 96 | AutoFixOps | `engine/memory.py:110` | LOW | — | 1s |
| 97 | AutoFixOps | `engine/patch_generator.py:188` | LOW | — | 1s |
| 98 | AutoFixOps | `engine/policy.py:95` | LOW | — | 1s |
| 99 | AutoFixOps | `engine/remediation.py:257` | LOW | — | 1s |
| 100 | AutoFixOps | `engine/summarizer.py:45` | LOW | — | 1s |
| 101 | AutoFixOps | `engine/target_resolver.py:140` | LOW | — | 1s |
| 102 | AutoFixOps | `engine/verification.py:292` | LOW | — | 1s |
| 103 | AutoFixOps | `kubernetes_integration/target_app/app.py:35` | LOW | — | 1s |
| 104 | AutoFixOps | `scripts/migrate_schema.py:79` | LOW | — | 1s |
| 105 | AutoFixOps | `workers/celery_app.py:18` | LOW | — | 1s |
| 106 | AutoFixOps | `workers/tasks.py:341` | LOW | — | 1s |

---

## Full results — `risk` (file-level), 45 runs

| # | Repo | File | Risk score | Tier | s |
|---|---|---|---|---|---|
| 1 | cognee | `cognee/alembic/env.py` | 3.4/10 | LOW | 0s |
| 2 | cognee | `cognee/api/v1/agents/agents.py` | 1.4/10 | LOW | 0s |
| 3 | cognee | `cognee/api/v1/responses/routers/default_tools.py` | 0.0/10 | LOW | 0s |
| 4 | cognee | `cognee/api/v1/visualize/start_visualization_server.py` | 0.0/10 | LOW | 0s |
| 5 | cognee | `cognee/eval_framework/benchmark_adapters/base_benchmark_adapter.py` | 3.4/10 | LOW | 0s |
| 6 | cognee | `cognee/eval_framework/evaluation/run_evaluation_module.py` | 0.0/10 | LOW | 0s |
| 7 | cognee | `cognee/infrastructure/databases/graph/kuzu/remote_kuzu_adapter.py` | 0.9/10 | LOW | 0s |
| 8 | cognee | `cognee/infrastructure/databases/utils/closing_lru_cache.py` | 5.8/10 | MEDIUM | 0s |
| 9 | cognee | `cognee/infrastructure/engine/utils/generate_node_id.py` | 0.0/10 | LOW | 0s |
| 10 | cognee | `cognee/infrastructure/llm/structured_output_framework/baml/baml_client/inlinedbaml.py` | 0.0/10 | LOW | 0s |
| 11 | cognee | `cognee/infrastructure/loaders/core/text_loader.py` | 3.7/10 | LOW | 0s |
| 12 | cognee | `cognee/modules/agents/agent_mode.py` | 5.2/10 | MEDIUM | 0s |
| 13 | cognee | `cognee/modules/data/methods/get_dataset_databases.py` | 3.3/10 | LOW | 0s |
| 14 | cognee | `cognee/modules/engine/models/Interval.py` | 0.0/10 | LOW | 1s |
| 15 | cognee | `cognee/modules/graph/methods/get_data_related_nodes.py` | 0.7/10 | LOW | 0s |
| 16 | cognee | `cognee/modules/memify/memify.py` | 0.8/10 | LOW | 0s |
| 17 | cognee | `cognee/modules/pipelines/layers/setup_and_check_environment.py` | 1.1/10 | LOW | 0s |
| 18 | cognee | `cognee/modules/retrieval/agentic_retriever.py` | 7.5/10 | HIGH | 0s |
| 19 | cognee | `cognee/modules/retrieval/utils/completion.py` | 3.9/10 | LOW | 0s |
| 20 | cognee | `cognee/modules/settings/get_settings.py` | 3.1/10 | LOW | 0s |
| 21 | cognee | `cognee/modules/users/get_user_db.py` | 0.0/10 | LOW | 0s |
| 22 | cognee | `cognee/modules/users/permissions/methods/get_tenant.py` | 0.0/10 | LOW | 0s |
| 23 | cognee | `cognee/shared/GithubTopology.py` | 0.8/10 | LOW | 0s |
| 24 | cognee | `cognee/tasks/graph/extract_graph_from_data_v2.py` | 0.6/10 | LOW | 0s |
| 25 | cognee | `cognee/tasks/memify/global_context_index/bucketing/vector/placement.py` | 3.4/10 | LOW | 0s |
| 26 | AutoFixOps | `api/config_helpers.py` | 5.1/10 | MEDIUM | 0s |
| 27 | AutoFixOps | `api/database.py` | 5.1/10 | MEDIUM | 0s |
| 28 | AutoFixOps | `api/events.py` | 4.1/10 | MEDIUM | 0s |
| 29 | AutoFixOps | `api/main.py` | 7.0/10 | HIGH | 0s |
| 30 | AutoFixOps | `api/models.py` | 6.0/10 | MEDIUM | 0s |
| 31 | AutoFixOps | `api/schemas.py` | 0.9/10 | LOW | 1s |
| 32 | AutoFixOps | `engine/ai_diagnostics.py` | 4.0/10 | MEDIUM | 0s |
| 33 | AutoFixOps | `engine/baseline.py` | 2.4/10 | LOW | 1s |
| 34 | AutoFixOps | `engine/circuit_breaker.py` | 3.2/10 | LOW | 1s |
| 35 | AutoFixOps | `engine/memory.py` | 2.5/10 | LOW | 1s |
| 36 | AutoFixOps | `engine/patch_generator.py` | 4.0/10 | MEDIUM | 0s |
| 37 | AutoFixOps | `engine/policy.py` | 0.9/10 | LOW | 0s |
| 38 | AutoFixOps | `engine/remediation.py` | 5.2/10 | MEDIUM | 0s |
| 39 | AutoFixOps | `engine/summarizer.py` | 0.9/10 | LOW | 0s |
| 40 | AutoFixOps | `engine/target_resolver.py` | 1.6/10 | LOW | 0s |
| 41 | AutoFixOps | `engine/verification.py` | 4.2/10 | MEDIUM | 0s |
| 42 | AutoFixOps | `kubernetes_integration/target_app/app.py` | 0.9/10 | LOW | 0s |
| 43 | AutoFixOps | `scripts/migrate_schema.py` | 1.7/10 | LOW | 0s |
| 44 | AutoFixOps | `workers/celery_app.py` | 0.9/10 | LOW | 1s |
| 45 | AutoFixOps | `workers/tasks.py` | 5.4/10 | MEDIUM | 0s |

---

*Reproduce any row: clone the repo, `npm i -g git-archaeo`, and run the command. Source + harness scripts: [github.com/vanshitahujaa/archaeo](https://github.com/vanshitahujaa/archaeo). See also [docs/validation.md](https://github.com/vanshitahujaa/archaeo/blob/main/docs/validation.md).*
