# Embedding Caller Convergence Adapter — 2026-10-03

## Scope

Wired the existing EmbeddingGemma task formatter into `POST /api/embed` as an explicit opt-in. Requests without `taskMode` retain the prior raw-input behavior. The route reports the selected task mode, prompt revision, and formatted-input checksum for opted-in requests. Task modes reject mock embeddings and non-native dimensions; no live retrieval query defaults or persisted corpus representations were changed.

## Evidence

- The task-prefix formatter has one owner in `embedding-contract-768.ts`; task representation formatting delegates to it.
- `/api/embed` now applies the formatter before either the configured ONNX executor or the existing embedding cascade.
- Focused tests: 4 files passed, 23 tests passed, covering raw legacy input, explicit prompt formatting, response recipe metadata, unsafe task-mode rejection, shared 768-D validation, and task-representation checks.
- `svelte-check --tsconfig ./tsconfig.json --output machine` completed with 1 error and 291 warnings. The only error is in the already-modified `src/lib/server/db/schema/analysis-pass-results.ts:278` (`executionStatus` widened to `string`); no embedding adapter or migrated-route errors remain.
- The embedding recipe census remains mixed across persisted cohorts. Query/document prefixes must not be enabled against an unqualified corpus.
- A read-only direct-endpoint scan found 136 same-line `/api/embed(s)` request sites in 127 files: 71 sites across 63 SvelteKit source files and 64 sites across 63 script files. This is a candidate inventory, not a final live-caller count; each hit still needs role classification before migration.
- `api/glossary/search`, `api/precedents/search`, and `api/statutes/search` now pass raw legacy query text through the shared execution/validation adapter while preserving `ollamaFetch`, `embeddinggemma:latest`, and the existing 8-second timeout. This is input-path convergence, not a transport-owner replacement or corpus-prefix migration.

## Still Open

- The 136-hit direct endpoint inventory remains a candidate census; other embedding callers have not yet been classified or migrated through this adapter.
- The response metadata is an input-recipe receipt, not proof that a matching document cohort exists or that a canonical vector write occurred.
- No database, cache, vector-index, Workboard, Graphify, or SeaweedFS writes were performed.

## DB Readiness Follow-Through

- The existing shared classifier already distinguishes STARTING, HEALTHY, and UNAVAILABLE and is wired into `/api/health/database`, `/api/health/ready`, SvelteKit Playwright global setup, and analysis-job retry handling.
- `/api/health/database` now returns a stable top-level JSON shape for healthy, STARTING (including SQLSTATE 57P03), UNAVAILABLE, and unauthorized responses. The probe remains read-only (`SELECT 1`).
- Readiness contract and route smoke tests pass: 13 tests across 2 files. The route test covers three response paths and stable keys; it does not create a repair task or touch a live database.
- The existing GPU-compute OpenSpec owner records this as partial DB readiness proof. `/api/health/ready` route behavior, Retry-After, real `pg_isready` startup waiting, and a production agentic-repair task creator calling `shouldCreateRepairTask` remain unproven.
- Strict OpenSpec validation passes for `parent-atlas-openspec-task-triage-pipeline`; the nested GPU-compute change's strict validation still fails because it has no delta specs/requirement scenarios. No new OpenSpec change or spec delta was created in this slice.

## Next Safe Step

Classify the remaining direct callers by owner/role, then migrate the eligible callers through the shared adapter without changing transport semantics. Bind any prefixed query/document recipe to a verified corpus cohort before using task prefixes against persisted vectors.
