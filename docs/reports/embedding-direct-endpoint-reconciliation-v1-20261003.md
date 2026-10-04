# Embedding Direct-Endpoint Reconciliation — 2026-10-03

## Scope and result

Read-only classification and ratchet hardening only. No embedding caller, adapter, `semantic_768` runtime, OpenSpec ledger, HyperRAG, incremental runner, or shared Workboard was changed. The machine-readable per-file census is `embedding-direct-endpoint-census-v1-20261003.json` and contains endpoint line numbers, callsite/function evidence, reachability, and the assigned role for all 125 production-source hits.

| Class | Files | Interpretation |
|---|---:|---|
| `LIVE_DIRECT_CALLER` | 78 | Route/worker reachable direct endpoint callsites |
| `LIVE_WRAPPER` | 9 | 3 exported direct-call helpers; 6 callers of the app's `/api/embed` facade |
| `ROUTE_REACHABLE_NONCALLER` | 10 | Endpoint reference is reachable, but no nearby request call was found |
| `TRANSPORT_OWNER` | 6 | Explicit transport/adapter owners with endpoint references |
| `DIAGNOSTIC` | 4 | Health, semantic-health, or system-configuration surfaces |
| `DORMANT` | 18 | Not reachable from the census roots; candidate only, not declared dead |
| `FIXTURE`, `TEST` | 0 | Excluded from this production-source census |
| `LEGACY`, `DEAD` | 0 | No explicit evidence was supplied to assign either label |

The import graph scanned 5,076 source files, with 1,333 route/hook roots and 13 worker roots. This is static reachability evidence, not proof of runtime execution; dynamic imports and process-launched entry points may be missed. Callsite detection is a bounded local-source heuristic, not a TypeScript control-flow proof.

## Ratchet

`embedding-direct-endpoint-baseline.json` is now schema v2. It tolerates the 78 live direct callers and 3 live direct-call wrappers, while excluding facade-only `/api/embed` references, non-callers, dormant code, diagnostics, and transport owners. The check passed with zero new bypasses. The baseline is a ratchet, not a migration: existing tolerated callers remain until separately migrated and proven.

The 3 direct-call wrappers are `lib/ai/ollama-config.ts`, `lib/server/ai/ollama-client.ts`, and `lib/server/cache/semantic-cache.ts`. The 6 facade-only wrappers are `lib/components/ai/Gemma270MWebAssembly.svelte`, `lib/components/evidence/EvidenceCanvas.svelte`, `lib/components/modals/EvidenceCRUDModal.svelte`, `lib/components/RAGSearchComponent.svelte`, `lib/server/cache/embedding-cache-unified.ts`, and `routes/(app)/admin/dev-tools/+page.svelte`. The JSON census lists the full 78-caller and 10-noncaller sets, with line and function evidence.

## Recipe and owner proof

The existing read-only `embedding-recipe-census-v1.json` sampled 100 rows in each of four strata (400 sampled stratum rows; strata overlap). It reports:

- `content_embedding` contains `raw`, `title_relative_path`, and `title_relative_path_trimmed` samples; e.g. the `content_embedding_only` stratum sampled 6/100 raw, 27/100 title/path, 66/100 trimmed title/path, and 1/100 unknown.
- In `both_columns`, all 100 sampled `content_embedding_768` vectors were `UNKNOWN` by recipe comparison.
- In `content_embedding_768_only`, all 100 sampled vectors matched `raw`.
- The tagged task-prefix stratum's `content_embedding` sample was itself mixed: 70 trimmed title/path, 29 title/path, and 1 unknown; the 768 column did not resolve the recipe for its sampled rows.

These are corpus-stratum observations, not an exact row-level join from any of the 78 caller owners to a `semantic_768` cohort. A 768 dimension, a model name, or endpoint reachability does not establish recipe equivalence. Every direct caller therefore remains `MIGRATION_BLOCKED` pending both (a) owner evidence identifying its target corpus/column and (b) revision-bound proof that the caller's model artifact, tokenizer/pooling, input recipe/prefix, and producer revision match that cohort through the canonical adapter. Current exact blockers: `CALLER_TO_SEMANTIC_768_COHORT_JOIN_MISSING` and `CALLER_RECIPE_AND_PRODUCER_REVISION_UNPROVEN`.

No caller was migrated. The 768-dimension cache/tagging/memory callers, unknown or mixed-recipe callers, diagnostic endpoints, dormant files, and declared transport owners remain untouched. Do not run the recipe census script as part of this read-only review: it contacts the embedding service and overwrites its shared report; use a separately reviewed output path before refreshing that evidence.

## Validation

- `node --test scripts/atlas/audit-embedding-direct-endpoints-v1.test.mjs`: 8/8 passed.
- `node scripts/atlas/audit-embedding-direct-endpoints-v1.mjs --check`: passed; 0 new bypasses.
- Census output: `embedding-direct-endpoint-census-v1-20261003.json`.
- Writes: census/report files and the embedding direct-endpoint baseline only; no runtime or canonical data writes.
