# Graphify Daily Owner and Semantic Proof Audit

Date: 2026-10-16  
Mode: source and contract audit; no daily workflow or live embedder executed.  
Status: `OWNER_CLASSIFIED_AND_COLLECTION_OWNER_CORRECTED; TEST_STALLED; LIVE_SMOKE_BLOCKED_ON_EMBEDDER_ENDPOINT`

## Owner map

| Entry point | Classification | Observed boundary |
|---|---|---|
| `graphify:daily` | Canonical startup coordinator; apply-capable | Materializes admitted local snapshot, runs Phase 109B dry workflow with `--live-embedder`, writes local receipts, opens/closes Graphify lifecycle, and ordinarily dispatches `:chain`. Terminal authorization selects `:dry` instead, but lifecycle/receipt side effects still exist. |
| `graphify:daily:chain` | Apply-chain executor | Admission, dedup apply, materialize apply, cold processor, Phase 8 fanout apply, Qdrant tag mirror apply, feature-map apply, ACE packet step. |
| `graphify:daily:full` | Compatibility alias | Direct alias to `:chain`; not a distinct owner. |
| `graphify:daily:fast` | Apply-capable specialized path | Admission + validation + materialize apply + cold processor. |
| `graphify:daily:cold` | Composite apply workflow | Calls default `:daily`, then cluster summaries and full-repo indexing; do not treat as cold-only/read-only. |
| `graphify:daily:parent` | Composite apply workflow | Calls default `:daily`, then Parent Atlas memory apply. |
| `graphify:daily:skip-validation` | Admission + cold-processing wrapper | Still calls canonical projection admission; cold processor receives no apply flags in this alias. Its name does not mean all gates are bypassed. |
| `graphify:daily:dry` | Dry-run composite | Validation, materializer default (no `--apply`), cold-processing default, Phase 8 dry-run, and feature-map-sync alias that explicitly passes `--dry-run`. Child scripts can still emit local reports. |
| `graphify:daily:audit` | Model-backed bounded audit | Runs Gemma4 audit with limit 100; distinct from the canonical coordinator and not a GPU execution proof. |
| `graphify:daily:inspect` | Discovery helper | Uses the bounded daily-discovery helper in inspect mode. |
| `graphify:daily:search` | Discovery helper | Uses bounded candidate-first source search. |
| `graphify:daily:helpers:test` | Test entry point | Node test for daily-discovery helpers. |
| `graphify:daily:gates:test` | Test entry point | Tests canonical projection admission summary, failure guards, and discovery helpers. |

## Corrected collection contract

The active semantic production collection is `codebase_chunks_768_v2` in the vector index registry, vector contracts, and Qdrant collection contract. `embedding-contract-768.ts` incorrectly declared `codebase_chunks_768`; the Qdrant semantic projection duplicated that stale value. This caused the workflow's declared collection and projection collection to diverge. The canonical embedding contract now declares `_v2`, and `QDRANT_SEMANTIC_COLLECTION` aliases that owner. The focused projection spec now compares against the shared constant.

This is a source-contract correction, not a live Qdrant readback or a collection migration. Both physical collections may still contain historical/mixed cohorts; the correction does not qualify payload lineage or projection parity.

## Live embedder boundary

The daily startup forwards `--live-embedder` to the Phase 109B dry workflow. Its Ollama embedder throws on HTTP errors and empty vectors, so failure is counted rather than silently replaced by deterministic hash embeddings. The daily flag is opt-in for the separate bounded embedding-index dry-run and is not the same as the Phase 109B semantic sample. A prior 8-file sample is not the required 24-file proof.

## Qualification and next steps

- Owner classification is based on package scripts and their child command declarations; no package alias was executed.
- `graphify:daily` is not a harmless audit: its normal path can reach apply operations and has lifecycle/local-report side effects.
- The focused Vitest invocation was attempted for the projection and Phase 109B workflow specs, but produced no output for about 45 seconds; only that invocation was interrupted. The specs remain unverified in this run.
- The 24-file Phase 109B dry smoke was invoked into `.tmp/graphify-live-embedder-smoke-20261016`, but no connection to the normalized loopback Ollama endpoint on `:11434` was established. The sequential workflow was stopped before a final receipt; no canonical apply was requested.
- Run the focused projection/workflow specs first.
- Then run the requested 24-file live EmbeddingGemma smoke into scratch output. Receipt must record model/source, sample/success/failure counts, zero deterministic fallback, exact output checksum, and no canonical write attempt.
- Keep GPU proof, source-binding readback, full-corpus indexing, projection promotion, and ContextManifest admission separate and open.

## Required closeout fields

- `likely_cause`: Daily entry-point aliases obscured their side effects, and two semantic collection constants disagreed with the existing production collection registry.
- `evidence`: `sveltekit-frontend/package.json`; `scripts/startup/run-graphify-daily-startup.mjs`; `scripts/atlas/phase109b-repository-provenance-workflow.mts`; `sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts`; `sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts`; vector index/collection registries.
- `patch_targets`: collection contract and projection helper/tests; owning OpenSpec tasks ledger.
- `safe_next_command`: `cd sveltekit-frontend; npx vitest run src/lib/server/atlas/retrieval/qdrant-semantic-projection.test.ts src/lib/server/atlas/repository-provenance-workflow.spec.ts`
- `smoke_command`: `cd sveltekit-frontend; npx vitest run src/lib/server/atlas/retrieval/qdrant-semantic-projection.test.ts src/lib/server/atlas/repository-provenance-workflow.spec.ts`
- `report_path`: `docs/reports/graphify-daily-owner-and-semantic-proof-20261016.md`
