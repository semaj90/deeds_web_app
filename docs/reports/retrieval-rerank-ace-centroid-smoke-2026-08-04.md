# Retrieval Rerank → ACE → Centroid Bounded Smoke
**Status**: OVERALL PASS | **Date**: 2026-08-04 | **Session**: 188 | **JSON**: [retrieval-rerank-ace-centroid-smoke-2026-08-04.json](retrieval-rerank-ace-centroid-smoke-2026-08-04.json)

---

## TL;DR

The 163→0 candidate drop is fixed and the bounded pipeline returns packets. **Live root cause (RUNTIME_PROVEN)**: hydration — `FeatureEnvelopeSchema` used `.optional()` (accepts `undefined`) for identity fields the DB populates with explicit `null` (`workspace_revision`, `source_revision`, `representation_id`, `representation_revision`, `stable_symbol_id`, `qdrant_point_id`); every envelope failed Zod → 0 envelopes reached the reranker (`[stage:rerank] input candidateCount: 0`). The suspected cross-encoder empty-result contract and `n_concepts` were **not** the live path — both fixed as hardening. Fixed live result: 170 retrieved → 163 scored → 3 reranked → 1 post-processed → 1 packet, deterministic across runs.

## Root Cause Ledger

| Hypothesis | Verdict |
|---|---|
| Hydration null-intolerant envelope schema | **ROOT_CAUSE — RUNTIME_PROVEN** (`envelope_build_failed` in hydration proof; fixed with `.nullable()`) |
| Cross-encoder empty/partial result accepted silently | LATENT_DEFECT — fixed as hardening (`CROSS_ENCODER_EMPTY_RESULT` / `CROSS_ENCODER_INVALID_IDENTITY` → fallback) |
| `localFallbackRerank` throw → `ranked: []` | LATENT_DEFECT — fixed Session 186/188 (`retrievalOrderFallback`) |
| `n_concepts` on undefined content | POSSIBLE_CRASH — null-safe fallback `content \|\| sourceRef \|\| packetKey`; semantics preserved when content exists |
| Session 184 reranking edits | DISPROVEN |

## Status Matrix

| Gate | Status | Evidence |
|---|---|---|
| RETRIEVAL_INPUT | PASS | retrieved=170 |
| LEXICAL_CANDIDATES | PASS | postgres_trigram + qdrant_768 + exact_symbol |
| FEATURE_EXTRACTION | PASS | regression test: missing content does not throw; n_concepts falls back to sourceRef/packetKey tokens |
| XGBOOST_REMOTE | FIXTURE_PROVEN | sidecar mocked in spec (real model identity `xgboost-sidecar` retained); live sidecar not running → NOT_APPLICABLE live |
| LOCAL_FALLBACK | PASS | regression: both rerankers reject → 33-in/33-out, finite scores, identities unchanged |
| RERANK_OUTPUT | PASS | reranked=3 (crossEncoderUsed, mixedbread-ai/mxbai-rerank-base-v2) |
| POST_PROCESS_OUTPUT | PASS | postProcessed=1 |
| FINAL_PACKET_OUTPUT | PASS | packets=1, topPacketKeys=['083bf85a-…'] |
| PACKET_IDENTITY_PRESERVED | PASS | unique packet_key on every packet; identity set preserved under topK (regression) |
| DETERMINISM | PASS | two warm runs, identical counts + identical packet key order |
| ACE_SMOKE_MATERIALIZATION | PASS | 1 card, 0 undefined content, no dup packet_key+evidence_hash, 83 tokens |
| ACE_REDIS_TEMP_WRITE | PASS | `ace:packet:smoke:{requestId}` TTL 300 |
| ACE_REDIS_TEMP_READBACK | PASS | digest match |
| CENTROID_TEMP_WRITE | PASS | `atlas:centroid:smoke:{requestId}` TTL 300 |
| CENTROID_TEMP_READBACK | PASS | explicit packet order, identities match ACE cards, TTL bounded |
| KAG_PLAN | PASS | all nodes carry packet_key, bounded 2-hop, no writes |
| DAG_PLAN | PASS | 8 bounded stages |
| HYPERGRAPH_PLAN | PASS | relations reference packet_key only |
| PRODUCTION_GRAPH_WRITES | PASS | none performed |
| **OVERALL_RESULT** | **PASS** | fail=0 blocked=0 |

## Changes Applied

| File | Change |
|---|---|
| `feature-envelope.ts` | 6 identity fields `.optional()` → `.nullable().optional()` (**the live fix**) |
| `canonical-rerank-executor.ts` | `retrievalOrderFallback` helper; empty/duplicate/unknown cross-encoder results → fallback; rerank ALL candidates (`limit: candidates.length`); sidecar model identity retained; n_concepts null-safe; cache key namespaced `bitfrost:retrieval:rerank:v1` |
| `search-runtime.ts` | `[stage:hydrate]` bounded diagnostic (input/envelope counts + typed reject reasons) |
| `canonical-rerank-executor.spec.ts` | +6 fail-open regression tests (12/12 pass) |
| `scripts/tests/rerank-ace-centroid-smoke.mjs` | bounded smoke harness (temp keys only) |

## Fixtures

- Before: `docs/reports/fixtures/retrieval-search-unified-before-fix.json` (170→163→0→0, packets 0)
- After run1/run2: `docs/reports/fixtures/retrieval-search-unified-after-fix-run{1,2}.json` (170→163→3→1, packets 1, identical order)

## Stopped Here (per protocol)

Not started: Bitfrost production warming, full LOD cache, centroid routing beyond temp manifest, KAG/DAG/HyperGraphRAG production writes, Qdrant migration. Qdrant payload identity contract remains a separate lane. Stream sanitizer (`<think>` at chat boundary) remains a separate open defect.
