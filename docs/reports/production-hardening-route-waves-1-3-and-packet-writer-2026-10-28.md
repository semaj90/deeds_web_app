# Production hardening: route waves 1–3 and packet writer

Date: 2026-10-28

## Result

The `task_semantic_packets` writer now resolves `packet_key` through the shared canonical identity resolver before persistence and rejects missing or invalid authority inputs rather than inventing an identity. Wave 1–3 route hardening is covered by focused auth, request-validation, and malformed-body regressions.

## Verification

- Packet identity resolver, semantic-packet service, and `POST /api/tasks/packets`: 26/26 tests pass.
- Wave 1–3 route suite: 29/29 tests pass across eight Vitest files.
- `agents-write` regression proves malformed JSON returns 400 before Redis acquisition; an empty body retains documented defaults.
- Browser-context snapshot validates its envelope before sanitization/cache work. Batch-summary jobs has an admin guard and stable GET error shape. Packet-assemble and studio-stream have route-level user guards as defense in depth.
- Tests use mocked persistence. No live datastore write, Graphify run, service restart, branch merge, or migration was performed in this verification pass.

## Boundaries and open checks

- Local environment has `DEV_BYPASS_AUTH=true`; auth behavior is proved by route tests with mocked guards, not by a live authenticated deployment. Production must keep bypass disabled.
- Full `svelte-check` did not complete. The last TypeScript run had one unrelated diagnostic at `src/lib/server/atlas/contracts/multiruntime-worker-receipt-v1.ts:153`; no touched route diagnostic was reported.
- These tests do not prove live database admission, migration safety, or production write success. Keep canonical persistence gated on the applicable schema and revision-authority review.
- Wave 4 URL triage and historical directory-map maintenance remain separate follow-up work.

## Wave 4 triage

- Admin API handlers had no direct URL literals in fetch/URL construction. Three handlers did read environment-backed service URLs directly; those values now use the shared `ENV` contract, preserving their prior defaults. TypeScript reported no diagnostics in these files.
- Atlas clients now route Rapids, Qdrant, strict-embedding, Ollama-challenger, and Go Retrieval endpoints through `ENV`; shared Rapids and strict-embedding defaults are centralized in `env.server.ts`. Explicit client endpoint overrides remain supported. This is configuration centralization, not a live service connectivity proof.
- H4 archive: the 34 manifest candidates (430,068 bytes; unique SHA-256 values) were moved, not deleted, to the local ignored archive `deeds_labs/archive/2026-10-28-production-hardening-backups/original/`. Before/after sizes and SHA-256 values match; `docs/reports/parent-atlas-backup-archive-2026-10-28.json` maps every original path to its archived path. The source manifest remains `.tmp/atlas/archive-candidates-sha256-20261028.json` (SHA-256 `cd60ae9029bc5af5f441ae7bcfe2aaf19b9d03c14a4c0fa4f9a43416a3f821a8`). The importer previously selected `AGENTS.md.bak` for append under `--apply`; it now selects only active instruction filenames, covered by an isolated regression test. Historical reports retain their original-path references, resolvable through the receipt. The archive directory is ignored by Git and remains local-only.
- Separate security follow-up: CouchDB routes still contain hard-coded fallback credentials (`admin` / `legal_ai_pass`). The URL-centralization change intentionally did not alter authentication behavior or credentials; do not treat those routes as production-hardened until credential configuration and role authorization are reviewed.

## Follow-up: credential fallback hardening (2026-10-28)

- CouchDB writer, admin rollback/synthesis, and RabbitMQ inference-log fallback now use the centralized server environment and reject missing passwords. ACE context assembly and the GPU MapReduce worker no longer contain embedded PostgreSQL username/password defaults; both require `DATABASE_URL`.
- Focused tests: **35/35 pass** across the CouchDB writer, ACE context assembler, and soft-routing suites. No live service or datastore was accessed for these tests.
- Remaining hardcoded PostgreSQL fallback sites after the schema-dependents fix: `sveltekit-frontend/src/lib/config/env.server.ts`, `sveltekit-frontend/src/lib/config/pgvector-gpu-config.js`, and `sveltekit-frontend/src/routes/dev/file-card/[...sourceRef]/+page.server.ts`. Their config/caller contracts remain under review.
- TypeScript still reports the pre-existing TS2367 at `sveltekit-frontend/src/lib/server/atlas/contracts/multiruntime-worker-receipt-v1.ts:153`; no diagnostic was reported for these edits. No DB writes, migrations, Graphify execution, or service restart occurred.

## Follow-up: named-route RBAC acceptance (2026-10-28)

- Review found that `api/admin/batch-embeddings/embed` and `api/admin/parents-atlas/actions` checked only for a logged-in user despite being admin operations. Both now call shared `requireAdmin`; tests verify 401/403 rejection occurs before body parsing or Redis, embedding, and Qdrant work.
- Added route tests for ontology-resolution and its OAK-search sibling, covering non-admin rejection and invalid-body rejection before downstream work.
- Replayed focused suites for all 13 named worklist routes: **35 passed; 12 existing TODOs** across 13 files. This validates local mocked/route logic only; no live production auth or persistence was exercised.
- No datastore side effects occurred. `DEV_BYPASS_AUTH` may be enabled in the local app environment; these tests do not establish production deployment configuration.

## Follow-up: schema-dependents DB fallback (2026-10-28)

- `api/atlas/schema-dependents` no longer constructs a pool from an embedded PostgreSQL credential. It uses `ENV.DATABASE_URL` only; missing configuration returns a stable 503 shape for valid requests, while malformed POST input remains 400.
- Route regression suite passes **3/3**, including stable error-key checks and proof the schema-dependent resolver is not called without a configured database URL. No database connection or write was made.
- Remaining credential fallback sites include `sveltekit-frontend/src/lib/config/env.server.ts`, `sveltekit-frontend/src/lib/config/pgvector-gpu-config.js`, and the development file-card route; their config/caller contracts still need review.

## Follow-up: full named-route regression and typecheck (2026-10-28)

- Added route-specific malformed-body regressions for `api/cache/bitfrost-effectiveness` and `api/analytics/research-topics`; invalid requests are rejected before Redis access or research-index rebuilding.
- Replayed the complete 13-route worklist: **36/36 tests pass across 13 files**. Existing route implementations were exercised with mocked downstream services; this is not a live authorization or persistence test.
- Fixed the unreachable `COMPLETED` status comparison in `multiruntime-worker-receipt-v1.ts`; the worker result enum admits `COMPUTED`/`VALIDATED`, not `COMPLETED`.
- Full TypeScript check (`tsc --noEmit --incremental false`) passes, and `npm run check` reports **0 errors and 0 warnings**.
- Read-only PostgreSQL catalog inspection returned 55 `task_semantic_packets` columns, including all request insert and response projection fields. No write or migration was performed; catalog shape does not prove an end-to-end insert.
- Local auth bypass remains enabled according to the existing environment audit. No production auth claim is made.

## Reproduction

From `sveltekit-frontend/`:

```sh
npx vitest run src/lib/server/atlas/identity/packet-identity-resolver.spec.ts src/lib/server/tasks/semantic-packets.spec.ts src/lib/server/tasks/task-packets-route.spec.ts --maxWorkers=1 --minWorkers=1 --reporter=dot
npx vitest run src/routes/api/ai/emotion/emotion.route.spec.ts src/routes/api/llm/gemma4-chat-clean/gemma4-chat-clean.route.spec.ts src/routes/api/atlas/rpc/packet-assemble/server.spec.ts src/routes/api/atlas/studio/stream/server.spec.ts src/routes/api/batch-summary/jobs.spec.ts src/routes/api/browser-context/snapshot/server.spec.ts src/routes/api/hardening-bad-body.route.spec.ts src/routes/api/codebase-index/agents-write/agents-write.route.spec.ts --maxWorkers=1 --minWorkers=1 --reporter=dot
```

`likely_cause`: The packet insert contract requires `packet_key`, and route-level request/auth boundaries needed explicit regression coverage; malformed JSON in the agents writer must not become a default write request.

`evidence`: Packet writer/resolver tests (26/26), route-wave tests (29/29), and the shared route/schema implementation.

`patch_targets`: `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`; `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.ts`; Wave 2–3 route handlers and specs listed in the reproduction commands.

`safe_next_command`: Review the packet identity resolver and route diff; keep any live persistence check separately authorized.

`smoke_command`: Run the two focused Vitest commands above.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Full Svelte check after type-error repair (2026-10-28)

- The first full `npm run check` completed and reported six TypeScript errors in two files: failed-union narrowing for animation target admission, plus inference-backend unions in the SSE chat path. Fixed the admission checks to discriminate on `ok === false`, represented the backend state as a mutable object across the async callback, accepted the existing cache/unavailable runtime states in the evaluator's metadata type, and omitted non-provider states from inference logs.
- The subsequent full `npm run check` completed successfully: **0 errors, 0 warnings**. It emitted the existing Vite option override notice only.
- Focused courtroom tests pass **18/18** across target admission, retarget runtime, bone retargeting, and clip-bank behavior. Earlier in this turn, the listed Wave 1–3 route suites passed (29 tests, plus 9 pre-existing TODO tests), and packet identity/schema suites passed (33/33).
- These are static/type and mocked-test results. The `DEV_BYPASS_AUTH` environment remains enabled; no live route authentication, model call, database write, Graphify run, GPU job, or S3 operation was performed.

`likely_cause`: The first full type-check exposed stale discriminant narrowing and service-only backend types that did not include the route's cache and unavailable states.

`evidence`: Full `cd sveltekit-frontend && npm run check` (0 errors, 0 warnings); focused route, packet identity, and courtroom Vitest results described above.

`patch_targets`: `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`; `sveltekit-frontend/src/lib/server/ace/self-prompt.ts`; `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`; this report.

`safe_next_command`: Continue with read-only verification of remaining production-hardening gates; keep route writes disabled while local auth bypass is active.

`smoke_command`: `cd sveltekit-frontend && npm run check`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Courtroom animation target admission (2026-10-28)

- Additional animation GLBs are now associated only with the animation groups imported by that request. Groups with zero targets, null targets, or targets outside the selected character root/skeleton are rejected and disposed. Playback no longer falls back to an arbitrary first group; a missing or rejected clip leaves the current valid animation untouched.
- Focused courtroom tests pass **20/20**, including five new target-admission cases. All three changed/new TypeScript files pass TypeScript syntax transpilation with zero syntax diagnostics; scoped `git diff --check` passes.
- This is a runtime-safety correction, not a retargeting or visual-motion fix. The existing asset inspection still shows Alice's `Body` mesh has no `JOINTS_0`, `WEIGHTS_0`, or skin binding, so visible body animation remains unproven and cannot be fixed by target admission alone. No GLB asset was modified; no browser animation playback test was run.
- The 13 route suites in the current H1/H2/Zod worklist also pass **40/40**; the separate batch-summary GET auth spec passes **2/2**. These are mocked/local tests, not live authorization or persistence proof.

`likely_cause`: Imported clips could be selected from unrelated scene groups and started without proving target ownership; Alice's rigid Body mesh separately prevents visible skeletal movement.

`evidence`: `courtroom-scene.svelte.ts`; `animation-target-admission-v1.ts` and its 5-test spec; ledger §6.M992 GLB inspection; 20/20 courtroom tests; 40/40 H1/H2 route tests plus 2/2 batch-summary auth tests.

`patch_targets`: `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`; `sveltekit-frontend/src/lib/courtroom/animation-target-admission-v1.ts`; `sveltekit-frontend/src/lib/courtroom/animation-target-admission-v1.spec.ts`.

`safe_next_command`: Run the standalone Babylon harness on one supported clip and record imported target ownership plus bone, skinned-mesh, vertex, and canvas changes; keep incompatible clips rejected.

`smoke_command`: `cd sveltekit-frontend && npx vitest run src/lib/courtroom/animation-target-admission-v1.spec.ts src/lib/courtroom/courtroom-emotion.spec.ts src/lib/courtroom/bone-retarget-v1.spec.ts src/lib/courtroom/rest-pose-retarget-v1.spec.ts src/lib/courtroom/animation-clip-bank.spec.ts`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Server-generation attribution correction (2026-10-28)

- Replaced new chat-routing attribution `server-ollama` with backend-neutral `server-generation`; the configured server model registry identifies `ornith-1.5-9b` on `llama-server`, while Ollama remains the separate EmbeddingGemma service. Legacy `server-ollama` is retained only for previously persisted metadata compatibility.
- Corrected `/api/sse/chat` backend attribution: a cache hit reports `cache`, the generation cascade reports `tensorrt`, `triton`, or `llama-server`, and no successful provider remains `unavailable`. Renamed the shared chat-message payload variable to remove the false implication that it is sent to Ollama's chat API.
- `/api/health/capabilities` now reports `generation` independently from Ollama health and computes `serverReady` from generation-provider availability plus PostgreSQL. Router fallback checks this generation capability; RAG still requires the Ollama embedding and retrieval capabilities.
- Focused Vitest checks pass **18/18** across model registry/router, the Ollama chat-caller guard, and the llama-server proxy route. TypeScript syntax transpilation and Svelte compilation pass for the nine touched source files; `git diff --check` passes with existing LF/CRLF warnings. Full `npm run check` was stopped after its Node process exceeded **6 GiB** without diagnostics; full Svelte type-check is therefore unverified.
- No model endpoint, database, cache, queue, or service was called by these edits or tests.

`likely_cause`: Chat attribution and readiness reused Ollama labels even though chat generation is served through the configured server-provider cascade.

`evidence`: `client-router.ts`, `model-ids.ts`, `/api/sse/chat/+server.ts`, `/api/health/capabilities/+server.ts`, model-registry assertions, and the 18-test focused replay.

`patch_targets`: `sveltekit-frontend/src/lib/ai/client-router.ts`; `sveltekit-frontend/src/lib/ai/model-ids.ts`; `sveltekit-frontend/src/lib/ai/unified-generation.ts`; `sveltekit-frontend/src/lib/models/ChatSession.svelte.ts`; `sveltekit-frontend/src/lib/components/ai/ACEContextBubble.svelte`; `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`; `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`; `sveltekit-frontend/src/lib/server/models/model-registry.spec.ts`; `sveltekit-frontend/src/routes/(app)/demos/ace-pipeline/+page.svelte`.

`safe_next_command`: Review the changed inference-source and capability contract before deploying or restarting services.

`smoke_command`: `npx vitest run src/lib/server/models/model-registry.spec.ts src/lib/server/ai/ollama-chat-callers.guard.spec.ts src/routes/api/llm/gemma4-chat-clean/gemma4-chat-clean.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Browser Gemma 4 model mock/admission correction (2026-10-28)

- The browser generation owner is the pinned `onnx-community/gemma-4-E2B-it-ONNX` model through Transformers.js/WebGPU. It is a client helper, not a model that should be injected into the server `llama-server` proxy test or the image/VLM emotion endpoint. Those server-route tests retain stub model identities and stub `fetch`; no model endpoint is called.
- Fixed a stale test import: `gemma4-e2b-client.spec.ts` called a removed `evaluateE2BMemoryAdmission` helper. It now tests the current pure `inspectE2BGpuAdmissionV1` contract, including WebGPU, independently verified memory, local artifact-manifest, and explicit approval gates.
- Validation: browser model policy + Gemma4 admission Vitest suites pass **11/11**; standalone Node admission test passes **5/5**. No model weights were fetched or initialized. This proves the contract only; the E2B model remains unavailable for runtime loading until local artifact and operator memory receipts/approval are provided.
- Historical note: this router concern was resolved in the later `Server-generation attribution correction (2026-10-28)` section: generation readiness is now distinct from Ollama embedding health, and new chat attribution is backend-neutral.

`likely_cause`: The browser Gemma4 admission policy evolved, but its test still imported the removed pre-v1 helper; the broader client router also retains legacy server labels.

`evidence`: `gemma4-e2b-client.spec.ts`, `gemma4-gpu-admission-v1.ts`, `browser-model-policy.ts`, `model-ids.ts`, and the llama-server route tests; 11/11 Vitest and 5/5 Node admission tests.

`patch_targets`: `sveltekit-frontend/src/lib/ai/gemma4-e2b-client.spec.ts`; review next: `sveltekit-frontend/src/lib/ai/client-router.ts`, `sveltekit-frontend/src/lib/ai/model-ids.ts`, `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`.

`safe_next_command`: Audit server-generation capability ownership and tests before changing router labels or model defaults.

`smoke_command`: `npx vitest run src/lib/ai/browser-model-policy.spec.ts src/lib/ai/gemma4-e2b-client.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Listed API route regression suites (2026-10-28)

- Focused Vitest coverage for the 12 numbered worklist items (including both ontology-resolution endpoints under item 9) passed: **13 route suites, 40 tests**. This is test evidence for the current working tree, not full integration or production persistence proof.
- The `gemma4-chat-clean` route suite stubs `fetch` and asserts that auth failures, invalid JSON/schema, and missing server configuration do not call the model endpoint. Its success case uses a stubbed `llama-server` response; no live model was called.
- No database writes, Graphify execution, model inference, or service restart occurred during these tests.

`likely_cause`: The reviewed route gaps were addressed in the working tree and now have focused regression coverage, while production behavior remains a separate proof gate.

`evidence`: 13 focused route suites passed (40/40); `gemma4-chat-clean.route.spec.ts` explicitly stubs fetch and asserts no upstream call on rejected requests.

`patch_targets`: Route implementations and colocated tests listed in the 2026-10-28 worklist; no route code changed in this verification pass.

`safe_next_command`: Review the remaining non-route production-hardening worklist and keep external model and datastore calls disabled during offline tests.

`smoke_command`: Focused Vitest command covering the 13 listed route suites (40 tests passed in this run).

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Neo4j GDS credential fail-closed (2026-10-28)

- `Neo4jGDSOrchestrator` no longer supplies a hardcoded localhost URI or `neo4j/password` fallback. It now uses the shared `ENV` configuration and rejects missing/blank passwords with `NEO4J_PASSWORD_REQUIRED`; explicit constructor overrides remain supported.
- Focused tests pass **7/7** across the GDS orchestrator, shared Neo4j driver, and Neo4j config. Tests verify missing credentials fail before driver creation, configured values are used, and explicit overrides work.
- No GDS algorithms, database operations, service calls, or schema changes were executed. The remaining direct Neo4j constructors and auth consumers found by source search still need owner-by-owner review; this change does not claim repository-wide Neo4j credential hardening.

`likely_cause`: The GDS orchestrator bypassed the shared Neo4j environment owner and embedded fallback connection credentials.

`evidence`: `neo4j-gds-orchestrator.spec.ts`, `neo4j-driver.spec.ts`, and `neo4j-config.spec.ts` (7 passing tests); source search for hardcoded Neo4j credential fallbacks.

`patch_targets`: `sveltekit-frontend/src/lib/server/graph/neo4j-gds-orchestrator.ts`; `sveltekit-frontend/src/lib/server/graph/neo4j-gds-orchestrator.spec.ts`; `sveltekit-frontend/src/lib/config/env.server.ts`; `sveltekit-frontend/src/lib/config/neo4j-config.spec.ts`.

`safe_next_command`: Review remaining Neo4j connection owners individually; do not run graph algorithms or database writes as part of credential cleanup.

`smoke_command`: `npx vitest run src/lib/server/graph/neo4j-gds-orchestrator.spec.ts src/lib/server/neo4j-driver.spec.ts src/lib/config/neo4j-config.spec.ts`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Focused revalidation (2026-10-28)

- Re-ran the 13 named H1/H2 route suites plus task-packet route, semantic-packet service, and canonical identity resolver suites with process-level `DEV_BYPASS_AUTH=false`: **16 files, 73 tests passed**.
- The test run validates mocked request/auth/schema and packet identity/preflight behavior only. It does not prove deployed authentication configuration or live task-packet persistence; six required live values still lack authorized producers as recorded above.
- No database, cache, queue, model, or service writes occurred.

## Atlas sidecar endpoint ownership follow-up (2026-10-28)

- Centralized the shared LangExtract/OAK sidecar base URL in `ENV.LANGEXTRACT_BASE_URL`, preserving the existing precedence (Miniforge URL, then LangExtract URL, then local `:8095`) and explicit test overrides. Both the LangExtract transport and OAK evidence client now use that owner instead of carrying duplicate localhost fallbacks.
- Focused client suites pass **25/25** across `langextract-transport.spec.ts` and `oak-resolution-evidence-client.spec.ts`.
- `npm run check` was stopped after the identified `svelte-check` process reached about 5.0 GB working set with under 1 GB system memory free and no diagnostics. This full check is **NOT_VERIFIED**; stopping the checker restored about 6.4 GB free memory.
- No database, cache, queue, model, or service writes occurred.

## Retrieval reranker URL ownership follow-up (2026-10-28)

- The active canonical reranker read `XGBOOST_SIDECAR_URL` directly from `process.env` and embedded its own `:8765` fallback. The endpoint now lives in `ENV.XGBOOST_SIDECAR_URL`; the reranker consumes that shared value.
- Added an assertion that the XGBoost scoring request uses the configured shared endpoint. `canonical-rerank-executor.spec.ts` passes **21/21**.
- This closes only the XGBoost sidecar URL owner. The retrieval directory still has other duplicated service defaults and direct database configuration that need separate call-chain review; no blanket replacement was made.
- No database, cache, queue, model, or service writes occurred.

## RRF Qdrant URL ownership follow-up (2026-10-28)

- The RRF integration had three Qdrant HTTP calls reading `process.env.QDRANT_URL` and maintaining their own localhost fallback. They now use `ENV.QDRANT_URL`, the shared service-configuration owner; endpoint selection and retrieval behavior are otherwise unchanged.
- Focused RRF split and canonical-identity suites pass **14/14**. `git diff --check` passes; Git reports the existing LF-to-CRLF normalization warning for the TypeScript file.
- No database, cache, queue, model, or service writes occurred. This closes only the Qdrant URL duplication in `rrf-integration.ts`; other retrieval defaults remain to be reviewed individually.

## TurboVec health URL ownership follow-up (2026-10-28)

- Two health probes read `TURBOVEC_HEALTH_URL` directly and duplicated the `:8791` fallback. `ENV.TURBOVEC_HEALTH_URL` now preserves that explicit override, then falls back to `TURBOVEC_SIDECAR`, then the existing local default; both probes use the shared value.
- Added environment-resolution tests for explicit override, sidecar fallback, and the existing default: **3/3 passed**. `git diff --check` passes with an LF-to-CRLF warning on `infrastructure-check.ts`.
- No database, cache, queue, model, or service writes occurred. This changes configuration ownership only; it does not prove the live TurboVec endpoint is healthy.

## KAG Neo4j credential hardening follow-up (2026-10-28)

- `KAGExpander` duplicated the Neo4j URI default and silently authenticated with the literal `neo4j/password`. It now uses `ENV.NEO4J_URI` and configured credentials, while retaining explicit constructor overrides; missing password fails closed with `NEO4J_PASSWORD_REQUIRED`.
- Added constructor tests for missing credentials, configured environment credentials, and explicit overrides. Combined KAG, environment, and RRF suites pass **20/20**; scoped `git diff --check` passes with line-ending warnings only.
- No Neo4j connection or datastore write was attempted. The guard is unit-tested; live Neo4j access remains unverified.

## Canonical Neo4j driver ownership follow-up (2026-10-28)

- A second driver singleton in `db/neo4j-client.ts` used separate environment names and the fallback password `neo4j`. Its only source caller, `phase109a-inverse-lookup.ts`, now reaches the canonical driver through a compatibility facade.
- The canonical `getNeo4jDriver()` now explicitly rejects a missing/blank password with `NEO4J_PASSWORD_REQUIRED`, matching the environment owner’s fail-closed credential contract. Tests cover missing credentials, configured URI/credentials, singleton reuse, and KAG explicit overrides: **6/6 passed**.
- No Neo4j connection or datastore write was attempted. Other Neo4j callers using custom direct driver construction remain outside this change and require separate review.

## Admin Atlas health Neo4j follow-up (2026-10-28)

- The authenticated admin health route previously constructed a temporary Neo4j driver with a `password` fallback. It now uses the canonical credential-gated driver and closes each health-check session without closing the shared driver.
- Route regressions cover unauthenticated rejection, successful shared-driver probing/session cleanup, and missing credentials surfaced as an unavailable dependency: **3/3 passed**; canonical driver tests pass **3/3**.
- No live Neo4j connection was attempted. Health response shape remains unchanged.

## Admin Atlas graph and search Neo4j follow-up (2026-10-28)

- The admin Atlas graph route and `/api/atlas/search` each constructed a Neo4j driver with hardcoded credentials. Both now call the canonical shared driver; graph/search behavior remains proposal/retrieval-only, and each read session closes in `finally`.
- Atlas search’s extracted read-only concept-expansion helper is tested for shared-driver use, read mode, missing-credential degradation, and query-failure cleanup. Admin graph tests cover auth, successful expansion, and missing credentials. Combined graph/search, admin-health, and canonical-driver tests pass **12/12**.
- No live Neo4j access or datastore writes occurred. Other direct Neo4j constructors in the repository remain to be audited individually.

## Shared Neo4j config credential follow-up (2026-10-28)

- `src/lib/config/env.server.ts` synthesized `neo4j123` in both `getNeo4jConfig()` and the parsed `CONFIG` object, contradicting `src/lib/server/env.server.ts`, which intentionally leaves Neo4j credentials unset unless configured.
- Removed the password fallback while retaining the optional config property. A source search found no in-repository consumer of `CONFIG.NEO4J_PASSWORD`; the four focused config/driver/admin-route specs pass **10/10**. The file already contained a separate concurrent database URL edit; only the Neo4j lines were changed here.
- No live service or database was contacted. Remaining direct Neo4j constructors using environment-provided credentials still need individual review.

## Current hardening-route verification (2026-10-28)

- Replayed all 13 focused specs covering the 12 named H1/H2 routes, including the ontology-resolution sibling: **13 files, 40 tests passed**.
- This is route-level mocked/unit evidence. It does not establish live authentication configuration, database persistence, full Svelte check/build, or production service health.

`likely_cause`: AST triage found concrete request-validation and authentication gaps in the named routes; the current focused regressions pass after their hardening changes.

`evidence`: `npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1` over the 13 route specs; 40/40 passing.

`patch_targets`: No additional route source changes in this verification pass.

`safe_next_command`: Continue with the existing feature-label-semantic-derivation OpenSpec owner; keep candidate labels proposal-only until reviewed.

`smoke_command`: `npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1 src/routes/api/ai/emotion/emotion.route.spec.ts src/routes/api/llm/gemma4-chat-clean/gemma4-chat-clean.route.spec.ts src/routes/api/atlas/rpc/packet-assemble/server.spec.ts src/routes/api/atlas/studio/stream/server.spec.ts src/routes/api/batch-summary/jobs.spec.ts src/routes/api/codebase-index/agents-write/agents-write.route.spec.ts src/routes/api/cache/bitfrost-effectiveness/bitfrost-effectiveness.route.spec.ts src/routes/api/browser-context/snapshot/server.spec.ts src/routes/api/admin/atlas/ontology-resolution/ontology-resolution.route.spec.ts src/routes/api/admin/atlas/ontology-resolution/oak-search/oak-search.route.spec.ts src/routes/api/admin/batch-embeddings/embed/embed.route.spec.ts src/routes/api/admin/parents-atlas/actions/actions.route.spec.ts src/routes/api/analytics/research-topics/research-topics.route.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## ACE health model ownership correction (2026-10-28)

- Corrected `/api/ace/health`: chat model discovery now uses `resolveLlamaInferenceTarget()` against the configured llama-server; Ollama `/api/tags` reports only the EmbeddingGemma embedding lane. The route does not issue chat inference requests.
- Removed duplicate Qdrant and LangGraph URL fallbacks from the route. `LANGGRAPH_URL` now has its local development default in the central `ENV` contract, matching the existing analysis sidecar defaults.
- Regression tests verify active model reporting, Ollama embedding-only fields, no chat endpoint calls, configured service URLs, and the unauthenticated 401 boundary. Focused route test: **2/2 passed**. `git diff --check` has no whitespace errors; Git reports the existing LF-to-CRLF warning.
- This is mocked route-level evidence only; no live model, Ollama, Qdrant, database, Redis, or LangGraph probe was performed.

`likely_cause`: The health route conflated Ollama embeddings with the llama-server chat model, making the UI imply an Ollama chat dependency.

`evidence`: `sveltekit-frontend/src/routes/api/ace/health/+server.ts`; `health.route.spec.ts` (2 passing tests); centralized `ENV` defaults.

`patch_targets`: `sveltekit-frontend/src/routes/api/ace/health/+server.ts`; `sveltekit-frontend/src/routes/api/ace/health/health.route.spec.ts`; `sveltekit-frontend/src/lib/server/env.server.ts`.

`safe_next_command`: Review the health response consumer and confirm it tolerates the new `checks.llamaServer` field while treating `checks.ollama` as embedding-only.

`smoke_command`: `npx vitest run src/routes/api/ace/health/health.route.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Analysis worker DB and analysis-sidecar configuration (2026-10-28)

- The feature-registry pool already used `getConfiguredDatabaseUrl()`, but the worker's PostgreSQL LISTEN client read only `process.env.DATABASE_URL`. It now uses the same config owner; when neither supported URL is configured, the existing catch preserves polling-only behavior.
- Experiment/model analysis sidecars previously read dedicated service URLs directly from `process.env` and each carried a `127.0.0.1:8091` fallback. Their URLs now belong to `ENV`; the existing TurboVec caller also relies solely on the centralized `ENV.TURBOVEC_SIDECAR` default rather than duplicating `:8791`.
- The adjacent analysis-contract test exposed a stale fixture that called `compileExperimentFeatureMatrix()` without a representation revision, then expected the resulting null-revision matrix to form an event bundle. The fixture now supplies `semantic-768-v1`; production lineage guards remain unchanged.
- `database-url.spec.ts`, `analysis-contracts.spec.ts`, and `nlp-feature-compiler.spec.ts` passed **18/18** after the worker/fixture update. After URL centralization, `database-url.spec.ts` and `analysis-contracts.spec.ts` passed **11/11**. Source checks confirm no direct DB URL read in the worker and no duplicate `:8091`/`:8791` URLs in the three analysis clients. No live database, queue, service, or model operation occurred.

`likely_cause`: Analysis-sidecar configuration was split between `process.env`, duplicate URL fallbacks, and the central env owner; one test fixture also omitted a now-required representation revision.

`evidence`: `sveltekit-frontend/src/lib/server/analysis/worker.ts`; analysis sidecar clients; `env.server.ts`; focused 18-test and 11-test runs; source scans for direct env and duplicate URL use.

`patch_targets`: `sveltekit-frontend/src/lib/server/env.server.ts`; `sveltekit-frontend/src/lib/server/analysis/worker.ts`; `sveltekit-frontend/src/lib/server/analysis/experiment-analysis-sidecar.ts`; `sveltekit-frontend/src/lib/server/analysis/model-analysis-sidecar.ts`; `sveltekit-frontend/src/lib/server/analysis/kmeans-latent-progression.ts`; `sveltekit-frontend/src/lib/server/analysis/analysis-contracts.spec.ts`.

`safe_next_command`: Review remaining H3 URL and credential candidates using the shared env and caller contracts before editing.

`smoke_command`: `npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1 src/lib/config/database-url.spec.ts src/lib/server/analysis/analysis-contracts.spec.ts src/lib/server/analysis/nlp-feature-compiler.spec.ts`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Admin chat authentication and model identity (2026-10-28)

- `/api/admin/chat` previously accepted requests without an admin guard and sent the literal model ID `gemma4`, despite calling the local llama-server OpenAI-compatible endpoint. It also used `parse()` on unbounded request values.
- The route now requires `requireAdmin`, safely validates bounded request fields, resolves the loaded model through `resolveLlamaInferenceTarget()`, and returns 503 before inserting a user message if the local model cannot be resolved. The admin chat label now reads `Ornith 1.5 / TRACE Oracle`.
- Focused admin-chat tests pass **5/5**; the complete 14-file hardening replay now passes **45/45**. The replay exposed that the emotion-route test had mocked `requireUser` as a no-op; its mock now enforces authentication and a regression verifies rejection before parsing. The subsequent `npm run check` was stopped after its Svelte-check Node process reached approximately 5 GB RSS without emitting diagnostics; full typecheck is therefore **NOT VERIFIED**.
- No live model request, database write, service restart, or production configuration change was performed. Runtime model selection is exercised with a mocked resolver; live `/v1/models` state remains unverified in this turn.

`likely_cause`: Admin chat had no route-level authorization and sent a stale model alias instead of the runtime-selected llama-server model.

`evidence`: `sveltekit-frontend/src/routes/api/admin/chat/+server.ts`; `chat.route.spec.ts` (5/5); emotion auth regression; current 14-file route replay (45/45); Svelte-check stopped at approximately 5 GB RSS.

`patch_targets`: `sveltekit-frontend/src/routes/api/admin/chat/+server.ts`; `sveltekit-frontend/src/routes/api/admin/chat/chat.route.spec.ts`; `sveltekit-frontend/src/lib/components/admin/AdminChatAssistant.svelte`.

`safe_next_command`: Re-run the focused route test, then a bounded TypeScript check when workstation memory is available.

`smoke_command`: `npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1 src/routes/api/admin/chat/chat.route.spec.ts`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Database URL fallback and active chat model follow-up (2026-10-28)

- `api/atlas/file-understanding` no longer constructs a PostgreSQL pool from an implicit localhost URL. It uses the shared database URL resolver, constructs the pool only after configuration is present, validates POST bodies before attempting a connection, and returns 503 for missing/invalid database configuration.
- Its new isolated route spec passes **2/2**. The 13 named hardening-route suites were rerun with `DEV_BYPASS_AUTH=false` and pass **39/39**. Combined verification: 41 passing tests across 14 files.
- Live read-only `GET http://127.0.0.1:8090/v1/models` returned `ornith-1.5-9b`, owner `llamacpp`. This is the model currently loaded by the llama.cpp server, not Ollama Chat. `/api/llm/gemma4-chat-clean` is a historical route name and resolves the loaded model server-side. Ollama is not the chat backend.
- Replayed the 13 route-hardening suites plus the three packet-writer/identity suites with process-level `DEV_BYPASS_AUTH=false`: **16 files, 72 tests passed**. The full `npm run check` initially found eight type errors in this route's pool-client variable; importing `PoolClient` directly fixed the inference issue. The follow-up route test passes **2/2**, and `npm run check` now reports **0 errors and 0 warnings**.
- No DB, cache, queue, model, or service writes were performed. Live authorization and database persistence remain unproven.

## Task-packet required metadata follow-up (2026-10-28)

- Both task-packet INSERT owners now supply `metadata: {}` explicitly, matching the former Drizzle empty-object default while respecting the live table's lack of a default. The schema preflight now includes `metadata` as provided and separately rejects explicitly null values for required columns.
- A fresh PostgreSQL `BEGIN READ ONLY` catalog query confirms ten `NOT NULL` columns without defaults. After explicit empty metadata, the remaining unavailable values are `feature_label`, `alias_id`, `qdrant_score`, `cluster_score`, `topological_score`, and `fusion_score`.
- The REST request schema rejects blank `feature_id` values and overlong `source_ref` values before identity resolution; `file_path` fallback values are also checked against the 512-character `source_ref` limit. `task-packets-route.spec.ts`, `semantic-packets.spec.ts`, and `packet-identity-resolver.spec.ts` pass **33/33**. No INSERT, migration, or other datastore write was performed.
- The feature-label authority table/view is absent in the current database; `atlas_fi_features` is only a candidate source in the existing reader contract. Alias tables do not provide a task-packet alias identifier contract. Scores have no producer on either packet writer. These values remain unfilled; do not use basename labels, null sentinels, or fabricated zero scores.

## Latest H3 follow-up: config and dev file-card (2026-10-28)

- `pgvector-gpu-config.js` previously failed Node syntax validation and contained PostgreSQL credential/URL defaults plus a stale `ollama.models.chat` declaration. The repaired compatibility config delegates DB/CUDA/Ollama URLs to `config/env.server.ts`, has no built-in DB credential, and retains Ollama only for EmbeddingGemma. Repository source search found no active imports of this legacy module outside archived reports.
- The development file-card route now uses the shared `ENV`, fails with 503 before pool creation when `DATABASE_URL` is absent, and does not try Neo4j without explicitly configured credentials. Pre-generated cards still work without DB configuration.
- Validation: the two focused Vitest files pass **3/3**; `node --check src/lib/config/pgvector-gpu-config.js` passes. No service, database, or model request occurred.
- Follow-up source review found that `/api/atlas/file-understanding` already uses the shared `getDatabaseUrl()` resolver; the earlier remaining-site note was stale. `analysis/worker.ts` also used the shared resolver for its feature pool, but its PostgreSQL LISTEN connection read only `process.env.DATABASE_URL`, bypassing the legacy `POSTGRES_URL` alias. The listener now uses the same `getConfiguredDatabaseUrl()` owner; missing configuration remains caught and falls back to polling. Other H3 areas remain unaudited, so no broader completion is claimed.

## Latest verification (2026-10-28)

- With `DEV_BYPASS_AUTH=false` set only for the test process, the 13 named hardening-route regression suites plus packet-route, task-semantic-packet, and packet-identity suites passed: **16 files, 70 tests**. The checked-in `.env` and `.env.local` values were not changed.
- A fresh `BEGIN READ ONLY` PostgreSQL catalog query still finds ten `NOT NULL` columns without defaults in `task_semantic_packets`: `packet_key`, `source_ref`, `feature_id`, `feature_label`, `alias_id`, `qdrant_score`, `cluster_score`, `topological_score`, `fusion_score`, and `metadata`. No insert or schema change was performed in this verification. The writer remains blocked until each required value has a legitimate producer or a separately reviewed schema contract changes the requirement.
- The Phase 17 alternative was checked at its persistence function: it builds parameters, logs the intended packet, and leaves the actual SQL execution commented out. It is not a live writer or an authorized value-provenance owner for this task-summary route.
- Source review confirms `/api/llm/gemma4-chat-clean` posts to the configured llama-server `/v1/chat/completions` endpoint and resolves the loaded model through `resolveLoadedLlamaModel`. The route name is historical; this is not an Ollama chat route. Ollama's `embeddinggemma:latest` use is a distinct embedding lane. No model was inferred from the route name.
- Removed guessed localhost fallbacks from the llama chat route and both OAK ontology routes. The llama route returns `503 llama_server_not_configured`; OAK search returns `503 oak_kernel_not_configured`; the ontology health response distinguishes an unconfigured kernel from a configured-but-unreachable one. Regressions verify no network request is made when the corresponding endpoint is unset.

`likely_cause`: Required live task-packet columns still lack authorized value owners; the route itself uses configured llama-server for chat, not Ollama.

`evidence`: Focused Vitest run (16 files/70 tests); read-only `information_schema.columns` query; the llama and OAK route source files and their route specs.

`patch_targets`: `sveltekit-frontend/src/routes/api/llm/gemma4-chat-clean/+server.ts`; its route spec; `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/+server.ts`; its route spec; `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/oak-search/+server.ts`; its route spec. Also review the task-packet writer and schema owner before enabling writes.

`safe_next_command`: Trace authoritative producers for `feature_label`, `alias_id`, the four scores, and `metadata`; otherwise keep inserts blocked pending a separately reviewed schema decision.

`smoke_command`: `$env:DEV_BYPASS_AUTH='false'; npm test -- --run src/routes/api/ai/emotion/emotion.route.spec.ts src/routes/api/llm/gemma4-chat-clean/gemma4-chat-clean.route.spec.ts src/routes/api/atlas/rpc/packet-assemble/server.spec.ts src/routes/api/atlas/studio/stream/server.spec.ts src/routes/api/batch-summary/jobs.spec.ts src/routes/api/codebase-index/agents-write/agents-write.route.spec.ts src/routes/api/cache/bitfrost-effectiveness/bitfrost-effectiveness.route.spec.ts src/routes/api/browser-context/snapshot/server.spec.ts src/routes/api/admin/atlas/ontology-resolution/ontology-resolution.route.spec.ts src/routes/api/admin/atlas/ontology-resolution/oak-search/oak-search.route.spec.ts src/routes/api/admin/batch-embeddings/embed/embed.route.spec.ts src/routes/api/admin/parents-atlas/actions/actions.route.spec.ts src/routes/api/analytics/research-topics/research-topics.route.spec.ts src/lib/server/tasks/task-packets-route.spec.ts src/lib/server/tasks/semantic-packets.spec.ts src/lib/server/atlas/identity/packet-identity-resolver.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Full Svelte check resource stop (2026-10-28)

- Started `npm run check` (`svelte-check --tsconfig ./tsconfig.json`). It produced no diagnostics before its Node child reached approximately 4.5 GiB RSS while host free physical memory fell below 0.6 GiB.
- Interrupted the check and stopped only the identified `svelte-check` child process; free memory returned to approximately 8.8 GiB. This run is **NOT_VERIFIED**, not a pass. Focused route tests remain independently passing.

`likely_cause`: The full-project Svelte check exceeded safe workstation memory under concurrent Node workloads.

`evidence`: Process command line identified `svelte-check --threshold error --output machine`; read-only process/memory snapshots before and after stopping it.

`patch_targets`: None for this validation stop; route hardening changes remain listed above.

`safe_next_command`: Retry the full check in a lower-contention window or use the project’s captured/sharded checker workflow.

`smoke_command`: `npm run check`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Current route-worklist replay (2026-10-28)

- Re-ran all 13 named H1/H2 route suites with process-level `DEV_BYPASS_AUTH=false`: **13 files, 36 tests passed**. This verifies the current mocked route contracts and does not prove deployed auth configuration, database persistence, or cross-service behavior.
- The packet writer remains blocked from production inserts by live required columns lacking provenance-backed values; no DDL or database writes were performed.

`likely_cause`: The named route regressions pass, while the remaining production writer gap is a schema/value-provenance mismatch.

`evidence`: Exact 13-file Vitest run on 2026-10-28; prior read-only PostgreSQL catalog findings in this report.

`patch_targets`: `sveltekit-frontend/src/routes/api/ai/emotion/+server.ts`; `sveltekit-frontend/src/routes/api/llm/gemma4-chat-clean/+server.ts`; remaining named worklist routes listed in `docs/CODEBASE_DIRECTORY_MAP.md`.

`safe_next_command`: Review the required `task_semantic_packets` insert fields and select a provenance-backed value owner or separately reviewed migration before enabling persistence.

`smoke_command`: `$env:DEV_BYPASS_AUTH='false'; npx vitest run src/routes/api/ai/emotion/emotion.route.spec.ts src/routes/api/llm/gemma4-chat-clean/gemma4-chat-clean.route.spec.ts src/routes/api/atlas/rpc/packet-assemble/server.spec.ts src/routes/api/atlas/studio/stream/server.spec.ts src/routes/api/batch-summary/jobs.spec.ts src/routes/api/browser-context/snapshot/server.spec.ts src/routes/api/admin/atlas/ontology-resolution/ontology-resolution.route.spec.ts src/routes/api/admin/atlas/ontology-resolution/oak-search/oak-search.route.spec.ts src/routes/api/admin/batch-embeddings/embed/embed.route.spec.ts src/routes/api/admin/parents-atlas/actions/actions.route.spec.ts src/routes/api/cache/bitfrost-effectiveness/bitfrost-effectiveness.route.spec.ts src/routes/api/codebase-index/agents-write/agents-write.route.spec.ts src/routes/api/analytics/research-topics/research-topics.route.spec.ts --maxWorkers=1 --minWorkers=1`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Runtime model naming clarification (2026-10-28)

- Live read-only `GET http://127.0.0.1:8090/v1/models` returned `ornith-1.5-9b`, owned by `llamacpp`; `/health` returned 200. Chat and retrieval summaries use the configured llama-server endpoint and runtime model resolver, not Ollama Chat.
- `unified-orchestrator.ts` uses the Ollama provider only for the separate `embeddinggemma:latest` embedding call. The `gemma4-chat-clean` route name is historical; its handler resolves the loaded llama-server model.
- Focused retrieval, degradation, and stream tests pass 24/24. TypeScript validation was started but did not complete in the available run; it remains unverified. No database, cache, model, or service state was changed.

`likely_cause`: Legacy Gemma4 route naming and a generic Ollama provider label blurred the distinct chat and embedding runtimes.

`evidence`: Live `/v1/models` and `/health` readbacks; `unified-orchestrator.ts`; `gemma4-chat-clean/+server.ts`; 24/24 focused Vitest tests.

`patch_targets`: `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts`; `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator-degrade.spec.ts`; `sveltekit-frontend/src/routes/api/admin/retrieval/stream/+server.ts`; `sveltekit-frontend/src/routes/api/admin/retrieval/stream/server.spec.ts`.

`safe_next_command`: Keep chat routed through llama-server and use the model resolver for its current identity; do not relabel it as Ollama Chat.

`smoke_command`: `npx vitest run src/lib/server/retrieval/unified-orchestrator.spec.ts src/lib/server/retrieval/unified-orchestrator-degrade.spec.ts src/routes/api/admin/retrieval/stream/server.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Follow-up: retrieval stream executes one retrieval (2026-10-28)

- The stream route previously executed `executeUnifiedRetrieval`, then called `executeUnifiedRetrievalWithSummarization`, which executes retrieval again before summarizing. The second run could use a different config and duplicate retrieval work.
- The route now summarizes the exact ranked candidates from the first result through `summarizeRetrievalCandidates`; the event stage is model-neutral (`summary`). The route-local service configuration, including the hardcoded PostgreSQL password fallback, was removed so both stages use the unified orchestrator's single default config owner.
- Regression coverage: retrieval is called once, the same candidate list is summarized once, and the SSE summary event is present. The route plus unified orchestrator suites pass **24/24**; TypeScript check passes; scoped diff check reports only line-ending normalization.
- No database, cache, retrieval service, or model endpoint was called during these tests. Environment-to-orchestrator endpoint alignment remains a separate H3 audit; this change removes duplicate retrieval and the route-level credential literal, but does not establish production endpoint readiness.

`likely_cause`: The route invoked a full retrieval-and-summary helper after already retrieving candidates, rather than summarizing its existing result.

`evidence`: `src/routes/api/admin/retrieval/stream/server.spec.ts` (1 test); `unified-orchestrator.spec.ts` (8 tests); `unified-orchestrator-degrade.spec.ts` (15 tests); TypeScript check.

`patch_targets`: `sveltekit-frontend/src/routes/api/admin/retrieval/stream/+server.ts`; `sveltekit-frontend/src/routes/api/admin/retrieval/stream/server.spec.ts`; `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts`.

`safe_next_command`: Audit environment-backed service endpoint resolution in the unified retrieval config before live retrieval verification.

`smoke_command`: `npx vitest run src/routes/api/admin/retrieval/stream/server.spec.ts src/lib/server/retrieval/unified-orchestrator.spec.ts src/lib/server/retrieval/unified-orchestrator-degrade.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Follow-up: route-specific preflight (2026-10-28)

- The REST packet writer now passes its actual insert-column set to the shared read-only schema checker before `db.insert`; the check is in a small module so the route does not load the task summarization, model, or vector workflow.
- A schema mismatch returns 503 before insertion. The regression proves the checker receives the route's fields and that the route does not resolve identity or call `db.insert` when required live fields are absent.
- Focused packet-route, schema-checker, and identity suites pass **31/31**. TypeScript check passes; scoped `git diff --check` reports only LF-to-CRLF normalization warnings.
- No live query, insert, migration, projection, or service call was made for this follow-up. The route is still **not live-write-ready**: the preflight intentionally blocks until the omitted required fields have an authorized provenance contract or a separately reviewed migration.

`likely_cause`: The REST writer previously checked canonical identity but did not validate its own payload against live required-column constraints.

`evidence`: `task-packets-route.spec.ts` (8 tests), `semantic-packets.spec.ts` (8 tests), `packet-identity-resolver.spec.ts` (15 tests), and TypeScript check.

`patch_targets`: `sveltekit-frontend/src/lib/server/tasks/task-semantic-packet-schema.ts`; `sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts`; `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`; `sveltekit-frontend/src/lib/server/tasks/task-packets-route.spec.ts`; `sveltekit-frontend/src/lib/server/tasks/semantic-packets.spec.ts`.

`safe_next_command`: Review the missing required values' provenance or draft a separate migration; keep live packet inserts disabled until one is approved.

`smoke_command`: `npx vitest run src/lib/server/tasks/task-packets-route.spec.ts src/lib/server/tasks/semantic-packets.spec.ts src/lib/server/atlas/identity/packet-identity-resolver.spec.ts`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Follow-up: live required-column preflight (2026-10-28)

- `assertTaskSemanticPacketSchemaCompatible()` now queries live nullability/default/identity/generated metadata, not only column names, and rejects required columns omitted by the service writer.
- Regression coverage: **29/29** across task-semantic service, canonical identity resolver, and task-packet route suites. `npx tsc --noEmit --incremental false` passes; `git diff --check` has no whitespace errors (Git reports existing LF-to-CRLF normalization warnings).
- Read-only PostgreSQL 18 catalog check found 10 `NOT NULL`/no-default columns. The service omits `feature_label`, `qdrant_score`, `cluster_score`, `topological_score`, `fusion_score`, and `metadata`, and hardcodes `alias_id: null`; the REST route omits those values too and accepts an optional `feature_id`. No write/migration was run. Both writers remain non-production-ready until values have an authorized provenance or the schema contract is separately reviewed.

## Follow-up: packet-writer live schema contract (2026-10-28)

- The current read-only PostgreSQL catalog confirms `task_semantic_packets.packet_key` is `NOT NULL` and has a unique constraint. The route resolves the key through the canonical resolver, returns 409 for duplicate identity, and returns 503 for a PostgreSQL not-null violation instead of hiding schema drift as a generic 500.
- Correction from the current read-only catalog: ten columns are `NOT NULL` with no default: `packet_key`, `source_ref`, `feature_id`, `feature_label`, `alias_id`, `qdrant_score`, `cluster_score`, `topological_score`, `fusion_score`, and `metadata`. The route supplies the first three and omits the remaining seven; `canonical` is not in this no-default set. Do not claim the route is live-write-ready; supplying invented labels/scores or changing the schema was not authorized.
- The resolver and route suites pass **22/22** after duplicate/schema error handling. Tests mock persistence; no insert was attempted. Read-only catalog queries were wrapped in `BEGIN READ ONLY` / `ROLLBACK`.
- Remaining decision: choose whether task-summary semantics have provenance-bearing values for these columns or require a separately reviewed schema migration. The feature-id-only GPU demo caller also lacks a resolvable canonical source reference and is expected to fail closed.
- The Phase 17 extractor is not a drop-in source for this route: it requires a validated reconciliation result containing an exact packet key, source reference, feature ID, alias ID, and score profile. Its `persistPhase17Output` currently logs the intended row and deliberately does not execute SQL; its `extractFeatureLabel` only title-cases the feature ID, not the separately governed human-readable semantic label. Reusing it would not by itself close the task-summary contract.

`likely_cause`: The task-packet route and live table describe different insert contracts; canonical key resolution alone cannot satisfy the legacy required scoring columns.

`evidence`: Read-only `information_schema.columns` and `pg_indexes`/`pg_constraint` queries; `task-packets-route.spec.ts` (7 tests) and `packet-identity-resolver.spec.ts` (15 tests).

`patch_targets`: `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`; `sveltekit-frontend/src/lib/server/tasks/task-packets-route.spec.ts`; `sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.ts`.

`safe_next_command`: Review task-summary ownership and choose the migration or value-provenance contract before enabling live inserts.

`smoke_command`: `npx vitest run --pool=threads --maxWorkers=1 src/lib/server/tasks/task-packets-route.spec.ts src/lib/server/atlas/identity/packet-identity-resolver.spec.ts`

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`

## Drizzle task-packet mirror alignment (2026-10-28)

- Updated `taskSemanticPackets` to reflect the live `task_semantic_packets` fields, including score columns, `semantic_vector vector(768)`, validation status/error columns, and exact live nullability/default behavior for the reviewed fields. The route itself still cannot populate seven required fields without an authorized provenance owner.
- Compared the Drizzle declaration with the live catalog in read-only transactions: **55 columns each; zero type, nullability, or default-presence mismatches** after normalizing PostgreSQL's `character varying` spelling against Drizzle's `varchar`. The declared index-name set matches all 24 live non-constraint indexes; the packet-key check and unique-constraint names also match. Index-definition and default-expression equivalence were not mechanically compared.
- Focused packet writer, task semantic packet, and identity resolver tests pass **31/31**. A targeted TypeScript program including `src/app.d.ts`, the table schema, service, and route reports **0 diagnostics**. The full Svelte check remains unverified because both attempts exceeded safe workstation memory; no DDL or data writes were performed.

`likely_cause`: The Drizzle mirror lagged the already-present live task-packet columns and nullability requirements.

`evidence`: `getTableConfig(taskSemanticPackets)` compared with read-only `information_schema.columns` and PostgreSQL `format_type`; 31 focused Vitest tests.

`patch_targets`: `sveltekit-frontend/src/lib/server/db/schema/tasks.ts`; `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`; `sveltekit-frontend/src/lib/server/tasks/task-semantic-packet-schema.ts`.

`safe_next_command`: Review live indexes/constraints separately, then trace legitimate producers for the seven omitted values.

`smoke_command`: `npx vitest run src/lib/server/tasks/task-packets-route.spec.ts src/lib/server/tasks/semantic-packets.spec.ts src/lib/server/atlas/identity/packet-identity-resolver.spec.ts --maxWorkers=1 --minWorkers=1`.

`report_path`: `docs/reports/production-hardening-route-waves-1-3-and-packet-writer-2026-10-28.md`
