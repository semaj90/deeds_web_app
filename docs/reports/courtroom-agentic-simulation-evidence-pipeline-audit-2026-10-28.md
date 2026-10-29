# Courtroom Agentic Simulation and Evidence Pipeline Audit

**Status:** PARTIAL — focused tests and isolated headless-browser proof for local courtroom preview; no live ACE/cache/evidence-service or production persistence proof.

## Findings

| Stage | Source owner and observed behavior | Status / first blocker |
| --- | --- | --- |
| Courtroom simulation | `story/engine.ts`, `runtime/simulation.ts`, `runtime/actor-runtime.ts`, and `runtime/scene-adapter.ts` provide a deterministic story reducer, fixed-tick runtime, role/action mapping, movement cues, and accessory mood bridge. The active page offers a local scripted preview; the existing HTTP session path remains separate. The cross-examination phase now waits at tick 239 for the jester's witness-station movement receipt; `finished`, `timeout`, `interrupted`, and `unavailable` are explicit terminal outcomes. Babylon `moveTo()` also reroutes against the walkable floorplan. | Reducer and adapter behavior is unit-tested. Local preview remains separate from the server-backed session and requires user-browser visual verification; do not add XState as a second game-state owner. |
| Babylon accessories | `courtroom-scene.svelte.ts` loads `/models/courtroom/jester_accessories.manifest.json` and `.glb` for Alice in the defense role, parents pivots to named bones, and advances the spring rig in `onBeforeRenderObservable`. Story mood cues route through the scene adapter to `setAccessoryMood`. | Headless screenshot shows Alice wearing the accessories in the scene; the preview ran through scripted cues. Fine-grained clipping, spring-axis correctness, and locomotion path fidelity still need interactive review in the user's browser. |
| ACE / BitFrost | `/api/ace/stream` calls `admitAceRouteCacheIdentityV1(undefined, cacheKey)` and emits blocked cache/synthesis events before preamble, packet construction, model dispatch, or cache read/write. The route spec asserts those calls do not occur. Existing in-memory BitFrost tests cover miss → admitted write → hit and a changed source revision miss. | Correct fail-closed behavior. Cache contract fixture is covered; route has no verified server-owned manifest producer, so no production ACE cache path is admitted. |
| AI dialogue assistance | Authenticated `POST /api/courtroom/dialogue` accepts only the fixed fictional story ID/version, bounded topic, known actor/phase, and allowlisted demo exhibit. It returns schema-checked `{caseId, actorId, phase, evidenceIds, allowedIntents, modelRevision, proposalOnly}` metadata. In local story preview, the suggestion remains inert until the user clicks “Add suggestion to story”; the reducer then checks actor, phase, exact evidence snapshot, bounded text, and intent before appending replayable transcript state. | Mocked route, reducer contract, and scoped type check pass. No real model call was made in the browser test; route tests mock inference. Not connected to uploaded/case evidence. |
| Evidence upload | `/api/evidence/upload` computes a SHA-256 file hash, stores through the SeaweedFS client, and runs extraction/processing; it has Whisper fallback and LangExtract/NLP paths, plus EmbeddingGemma/Qdrant-related processing. It currently calls `file.arrayBuffer()` and buffers the complete upload (100 MiB configured maximum). `evidence-process-payload-v1` validates non-empty worker text. | Several source paths exist, but this audit did not prove canonical evidence lineage, live object retention, full upload-to-search readback, or courtroom authorization from evidence. Large-file streaming remains a memory risk. |
| Analysis cache | `/api/evidence/analysis/cache` returned cached and database results by caller-supplied evidence/case ID without ownership checks; cache lookup occurred before persistence authorization. Omitted URL parameters were passed as `null` into optional Zod fields, causing normal requests to fail validation. | Now validates omitted values as `undefined`, authorizes evidence/case ownership before memory/Redis reads, returns 404 for inaccessible IDs, and keys cache entries by owner and query limit. Three mocked route tests cover denial, authorized read, and invalid owner identity. No live cache/database access was exercised. |
| Upload case admission and vector provenance | Upload case resolution previously accepted any existing `caseId` and reused the first global fallback case. The worker already computes a file SHA-256 and stores it on the evidence row, but vector metadata and Qdrant payload omitted it. | Case selection and fallback reuse are now owner-scoped; non-integer owner identities fail closed. The existing SHA-256 is formatted as `source_revision` and included in pgvector metadata and Qdrant payloads. Helper tests cover ownership-admission outcomes and digest formatting. No upload, indexing, reindex, or readback was run. |
| Summary lifecycle | The upload route puts a truncated extracted-text preview in `evidence.ai_summary` only when null, then generates a model summary and embeds it to Qdrant `legal_documents`; the analysis job stores only `summaryLength`. | The Qdrant summary projection now carries the evidence `source_revision` and a SHA-256 `summary_revision`. No append-only canonical summary record or model/prompt recipe revision was established, so this is provenance on a projection—not durable revisioned synthesis or re-index proof. |
| Video evidence | Video ingestion uses a separate `evidence_items`/timestamped transcript-segment path. It previously checked case existence, used non-UUID Qdrant IDs, omitted the required `chunk_id`/source revision, and swallowed Qdrant errors while reporting success. | Video case access now uses the shared owner/assigned-attorney admission gate. Transcript points use deterministic UUIDv5 IDs, include source/chunk/time/model metadata, and validate 768 finite vector values; Qdrant HTTP failures are returned in `searchIndexStatus` and persisted in processing metadata. Focused point/admission tests pass. No video upload or Qdrant request was performed. |
| Upload progress | `evidence-progress.ts` keeps a bounded in-memory job map and subscriber map; `/api/evidence/realtime` streams progress over SSE and falls back to polling `analysis_jobs`. In-memory jobs are now bound to the authenticated uploader; persisted polling requires an existing evidence/case ownership match. | Focused tests cover owner match and cross-user denial. No live job or DB fallback was queried. Jobs without provable owner, including legacy rows, fail closed with 404; persisted fallback requires numeric owner IDs. |
| Agentic writes | LangGraph projection mirror nodes now return an escalated gate rather than dispatching Qdrant/Neo4j mirror writes; focused tests assert no dispatch. | Safe proposal/guard behavior in tests, not live graph workflow proof. |
| Browser / performance | Isolated Playwright loaded `/demos/courtroom-sim`, selected only `PLAY LOCAL STORY`, advanced local cues, and mocked the dialogue proposal API. The mock was reached once and the proposal rendered; Alice/jester assets returned 200; the HUD read WebGL 36 FPS and 2.85/8 MiB geometry; no simulation POST/DELETE occurred. The harness intentionally blocked the app service worker to make route mocking deterministic, generating one expected SW-registration console error; there were no page errors or failed requests. | Headless Chromium used SwiftShader, so 36 FPS is software-rendered CPU/WebGL, not hardware GPU proof. HUD FPS comes from Babylon `engine.getFps()`; geometry is an estimate, not GPU utilization. No live in-app browser, GPU utilization, Babylon shader-cache hit, SharedArrayBuffer, WebGPU BVH, or streamed LOD measurements were made. Screenshot still has partial table occlusion. |

## Decisions

- Keep Babylon.js as the scene owner and the current deterministic courtroom story as the gameplay authority. LangGraph may research and propose; it must not directly mutate game or canonical data.
- Keep `semantic_768` / EmbeddingGemma as the existing canonical dense retrieval contract; semantic indexing is not required for upload acceptance and does not itself admit evidence.
- Keep Redis/Valkey/BitFrost as derived cache only. Do not warm production keys until a server-owned admitted packet/manifest is available and revision-bound readback is defined.
- Use transferable worker messages before considering SharedArrayBuffer; do not add COOP/COEP headers without compatibility testing. No measured need for GPU BVH, DLSS-like upscaling, or shader-cache integration was established.
- The role move LUT and deterministic actor runtime should be reconciled with the live session/timeline page before adding a second state machine or new Pokémon-style resource model.

## Validation

Command: `npx vitest run src/routes/api/ace/stream/stream.route.spec.ts src/lib/server/atlas/cache/bitfrost-residency-warming-v1.test.ts src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.test.ts src/lib/courtroom/jester-accessory-attach-v1.spec.ts src/lib/courtroom/jester-accessory-binding-v1.spec.ts src/lib/courtroom/jester-accessory-rig-v1.spec.ts src/lib/courtroom/runtime/story-runtime.spec.ts src/lib/server/evidence/evidence-process-payload-v1.spec.ts src/lib/server/langgraph/dispatcher-nodes/mirror-write-gates.spec.ts`

Result: 9 test files passed, 73 tests passed. These are focused unit/route tests with fixtures and mocks; they do not prove live auth, SSE transport, Valkey, upload persistence, rendered accessory appearance, or browser animation.

Additional courtroom-preview validation: runtime/movement/async scene-adapter/accessory suites passed (26 tests); dialogue route/story proposal/HUD suites passed (22 tests). Latest scoped Svelte check completed 4,474 files with 0 errors and 0 warnings. Playwright report: `.tmp/atlas/courtroom-local-preview-check.json`; screenshot: `.tmp/atlas/courtroom-local-preview-move.png`. The browser check monitored simulation writes and mocked the proposal API; it proves local preview interaction in headless SwiftShader only, not real-GPU behavior or live inference/persistence.

Movement timeline gate follow-up: `story/engine.ts` now records replayable `MOVE_SETTLED` outcomes and pauses tick advancement immediately before a cue with `waitForArrival` until that actor reaches the requested station or movement terminates with an explicit non-success outcome. The page feeds Babylon movement settlements back into the reducer. Focused movement/story suites pass 20/20; floorplan, movement, and actor-conflict suites pass 23/23; the scoped Svelte check reports 4,475 files, 0 errors, 0 warnings. This does not replace browser verification of arrival time, collision clearance, or visual animation.

Latest local-browser run: the preview reached `VERDICT · TICK 479`, returned 200 for Alice N64 and the jester accessory manifest/GLB, and recorded no non-GET `/api/simulation` requests. The harness used headless SwiftShader and mocked the dialogue proposal; its service-worker registration error is expected because the harness blocks service workers. The screenshot did not expose the movement outcome, so verdict progress alone is not proof of successful arrival (a terminal failure also releases the gate). I added a local-story HUD movement receipt with outcome and final scene coordinates. A follow-up harness attempt could not reach its AI button because that control was disabled in the page state, so the new receipt is not browser-verified. Final scoped Svelte check: 4,476 files, 0 errors, 0 warnings; movement/story focused suites: 20/20.

Active-session timeline hardening: `CourtroomScene.executeKeyframe()` no longer assigns arbitrary keyframe positions through a direct tween. Positional keyframes now use the scene's floorplan-validated `moveTo()` path, ignore uploaded Y as a navigation authority, and do not apply a conflicting direct yaw while walking. Same-cell paths settle without constructing an invalid one-point spline. Floorplan, move-cue, and story suites pass 30/30; scoped Svelte check remains 4,476 files with 0 errors and 0 warnings. This closes a movement bypass but does not yet make server-session phase/dialogue state the deterministic story reducer's state owner; that integration remains open.

Active-session animation projection: server-session timeline animation keyframes for known courtroom roles now dispatch through a separate deterministic presentation reducer and the existing scene adapter before Babylon applies the clip. The projection contains stable scene actor IDs and presentation assets only; it does not copy or replace server-owned session, phase, dialogue, or evidence state. Unknown roles and the pre-runtime initialization window preserve the prior direct scene fallback. Three focused presentation/story/movement suites pass 19/19, and the scoped Svelte check reports 4,477 files, 0 errors, and 0 warnings. This is unit/type-check evidence only: no live session playback or browser-observed skeletal animation was performed, and full session/story ownership remains ununified.

Human-approved AI dialogue integration: local preview now exposes an explicit accept action. Acceptance is replayable through `ACCEPT_DIALOGUE_PROPOSAL` and is rejected if the story phase, ordered evidence snapshot, actor, intent, or text no longer satisfies the reducer contract. The reducer—not the model response—appends transcript state; the page then presents the accepted line through its existing typewriter UI. Runtime suites pass 21/21 and scoped Svelte check reports 4,477 files, 0 errors, and 0 warnings. No live inference occurred, and uploaded evidence is still not an input to this demo proposal route.

Latest isolated Playwright acceptance run: clicked `PLAY LOCAL STORY`, mocked only `POST /api/courtroom/dialogue`, accepted the returned fixture suggestion, and observed “Added to the local story transcript.” All other non-GET API requests were blocked; simulation writes and other writes were both 0. Route returned 200, the HUD reported 33 FPS with WebGL, and the browser reported no page/console errors or model/shader asset failures. This was headless Chromium, not hardware-GPU telemetry or the user's in-app browser. No server session was created or advanced. Earlier retries before Vite dependency optimization settled returned to the lobby with the AI button disabled; the successful run confirms this flow now works in the isolated headless fixture.

## Safe Next Step

### Fresh source recheck

- The local scripted runtime **is connected to the active page**: `startScriptedPreview()` starts `CourtroomSimulation`; `createSceneAdapter()` binds it to Babylon; the subscription updates page state; advancing dispatches `TICK`; movement settlements dispatch `MOVE_SETTLED`. Story mood cues reach `setAccessoryMood()` through `scene-adapter.ts` and `courtroom-scene.svelte.ts`. The earlier wording that the new runtime was “not connected to the page” is stale for local-preview mode.
- Server-backed sessions remain a separate state owner by design. Timeline animations are projected through `sessionPresentationSimulation`; positional timeline keyframes are applied by `CourtroomScene.executeKeyframe()` and its validated `moveTo()` path. This is not full server-session/story-reducer unification and must not copy canonical session state into the local demo reducer.
- Fresh focused runtime/accessory run: 9 test files, 50 tests passed. No browser, live service, cache, database, upload, or GPU operation was run in this recheck.
- Upload has a concrete scalability concern: `/api/evidence/upload` permits 100 MiB and calls `file.arrayBuffer()`, retaining the complete file in memory. It then stores the object and processes extracted text; the worker payload builder rejects empty text. These source paths do not prove object/database durability, case-scoped search readback, immutable source-revision lineage, or a usable ACE manifest.
- Keep the implementation aligned to existing owners: SvelteKit/Svelte 5 for controls and upload progress; Babylon for local scene, movement, and animation; existing upload/extraction and video timeline services for document/media processing; PostgreSQL for canonical case/evidence/revision state; existing embedding gRPC/EmbeddingGemma and vector executors for their established roles. Do not add N-API/C++, WebAssembly, XState, or a second GPU/render lane without a measured requirement. PostgreSQL AIO/bitmap scans remain planner behavior, not an application abstraction.

Next, inspect the exact chunk/vector metadata contract read-only, then define the missing case-scoped revision/readback proof. Do not upload a fixture: that would write to SeaweedFS and PostgreSQL and was not authorized. Keep `/api/ace/stream` blocked until a verified server-owned admission manifest exists.

## Evidence progress ownership recheck — 2026-10-28

- `/api/evidence/realtime` previously authenticated callers but did not bind a requested `jobId` to that user. It now returns 404 for a job owned by another user before subscribing or querying storage.
- Upload, file/PDF workflow, and video-ingest paths pass the authenticated owner into the in-memory progress registry. The owner is held separately from the public progress payload.
- Persisted-job fallback uses existing evidence/case ownership columns; it does not infer ownership from a guessed job ID. Unprovable or legacy ownership remains inaccessible (404). The fallback currently requires numeric owner IDs, matching existing integer columns; other identity forms fail closed.
- Focused validation: realtime route, progress registry, and PDF workflow tests pass 5/5. Scoped `svelte-check` passes 795 files with 0 errors and 0 warnings.
- A broader analysis test run had two failures outside this change: `duckdb-registry.test.ts` reports `profileRegistryRowsWithDuckDb` unavailable, and `k-best-viterbi.spec.ts` has an expected/received path mismatch. The other 23 files passed (113 tests); these failures are not claimed as fixed.
- No live SSE job, database query, upload, object-store operation, cache action, or ACE admission was performed. This is mocked/local authorization evidence only.

## Evidence cache authorization recheck — 2026-10-28

- Added an ownership gate before all cache tiers in `/api/evidence/analysis/cache`. Evidence IDs require ownership through the evidence row or its case; case-only queries require case ownership/assignment. An evidence+case query must match both IDs.
- Cache key now includes the authenticated integer owner and result limit, preventing cache-key collision across owners or different requested limits.
- Fixed optional query parsing so absent search parameters become `undefined`, not `null` (the previous route schema rejected requests with omitted optional fields).
- Focused evidence route/progress/PDF tests pass 8/8; scoped Svelte check passes 795 files, 0 errors, 0 warnings.
- No live Redis/Valkey read, database read, upload, reindex, or ACE request was run. Production cache and upload-to-search behavior remain unproven.

## Upload case and source-revision alignment — 2026-10-28

- Requested case IDs are now resolved only when the authenticated integer user owns the case or is its assigned attorney; a guessed ID returns 404 before object storage. The “General Evidence Uploads” fallback is selected/created per owner rather than globally.
- The upload-derived SHA-256 is now propagated to both `evidence_vectors.metadata.source_revision` and Qdrant `payload.source_revision`; malformed digest strings are rejected by the shared formatter. This improves revision tracing but does not add parser/model recipe revisions or prove reprocessing idempotency.
- Focused evidence/cache/progress/PDF tests pass 13/13. Scoped Svelte check passes 795 files, 0 errors, 0 warnings.
- No migrations, database writes, object uploads, vector writes, cache operations, or live retrieval/readback occurred. Existing migration snapshots disagree with the upload route's documented `evidence_vectors` shape; inspect the live schema or authoritative migration owner before adding columns or uniqueness constraints.
- Remaining pipeline gates: an idempotent re-index owner, parser/embedding recipe revisions, independent pgvector/Qdrant readback joined to evidence and case, summary revision storage, and end-to-end upload-to-search proof. Do not add a summary column before checking the existing revisioned summary owners.
- Migration ownership recheck: `sveltekit-frontend/drizzle/sidecar-migrations.json` marks `20260516_pgvector_repair.sql` as `manual_sidecar`/applied, but that script drops and recreates `evidence_vectors` as `embedding vector(384)` with no chunk index or content column. The current upload writer expects `embedding vector(768)`, `chunk_index`, and `content`; Drizzle's current `evidenceVectors` declaration instead names `vector vector(768)`. This is a concrete incompatible contract, not a safe basis for a new migration. The applied registry record is not live-schema proof; do not rerun or modify the destructive repair without operator-authorized schema reconciliation and backup/readback evidence.
- Summary behavior is not “update the synthesis column”: the initial `ai_summary` write is a fallback preview of extracted source text guarded by `COALESCE`; a later model summary is projected to Qdrant and its analysis job records only a length. The Qdrant metadata now identifies source and summary digests, but lacks an immutable canonical summary receipt, prompt/model revision, and Postgres readback.
- Video and general document upload currently have separate canonical-looking owners: `evidence_items` plus timestamped transcript segments for video, versus `evidence` plus `evidence_vectors` for general uploads. This patch hardens each path but does not unify their IDs, case-evidence browsing, retries, or indexing receipt. Video Qdrant failures are now visible rather than reported as a successful search index.

`likely_cause`: Evidence progress/cache and upload case selection did not consistently bind caller-selected job, cache, or case identifiers to the authenticated owner, while summaries lacked durable revision lineage; canonical lineage, idempotent indexing, case-scoped readback, and server-owned ACE admission remain open.

`evidence`: Evidence case/cache/progress/source-revision/video-point/PDF focused tests 17/17; scoped Svelte check 795 files, 0 errors, 0 warnings; broader analysis run 23 files passed and 2 failed (113 tests passed, 2 failed). No live evidence was written or queried.

`patch_targets`: `sveltekit-frontend/src/routes/api/evidence/analysis/cache/+server.ts`; `sveltekit-frontend/src/lib/server/evidence-progress.ts`; `sveltekit-frontend/src/lib/server/analysis/analysis-jobs.ts`; `sveltekit-frontend/src/lib/server/evidence-case-admission-v1.ts`; `sveltekit-frontend/src/lib/server/evidence-source-revision-v1.ts`; `sveltekit-frontend/src/routes/api/evidence/upload/+server.ts`; `sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts`; `sveltekit-frontend/src/lib/server/features/evidence/video/video-qdrant-point-v1.ts`; remaining review targets include idempotent re-index/readback and server-owned ACE manifest/admission.

`safe_next_command`: Inspect the authoritative `evidence_vectors` schema and existing re-index owner read-only; do not create an upload job, touch live services, or relax ACE admission.

`smoke_command`: `npx vitest run src/lib/server/evidence-case-admission-v1.spec.ts src/lib/server/evidence-source-revision-v1.spec.ts src/lib/server/features/evidence/video/video-qdrant-point-v1.spec.ts src/lib/server/evidence-analysis-cache-route.spec.ts src/lib/server/evidence-progress.spec.ts src/lib/server/evidence-realtime-route.spec.ts src/lib/server/workflows/pdf-ocr-workflow.test.ts`

`report_path`: `docs/reports/courtroom-agentic-simulation-evidence-pipeline-audit-2026-10-28.md`

## Level 1 browser proof — 2026-10-28

- The earlier Vite-wide timeout observation is superseded for this run: `http://localhost:5173/demos/courtroom-sim` returned HTTP 200 and the existing server was not restarted.
- The DB-free local-preview Playwright test now requires both `data-scene-ready=true` and `data-models-loaded=true`, checks the action bar at 1280×720 and 1920×1080, records browser console/page errors and failed courtroom/model/shader requests, and rejects non-analytics write requests.
- In the 1280×720 run, seven one-second advances triggered the tick-200 Jester movement. The test observed `WITNESS: FINISHED` and world coordinates; the visible receipt was `JESTER → WITNESS: FINISHED @ 1.2,-3.0`. The movement receipt and actor position are shown in `.tmp/atlas/courtroom-local-preview-arrived.png`.
- Validation: Playwright passed at both viewports; a separate 1280×720 arrival run passed; `git diff --check` passed. No case/session creation, non-analytics writes, live storage, database changes, or service restart occurred. Playwright ran in the configured headless environment; this is not hardware-GPU FPS evidence.
- This proves Level 1 local scene readiness and a movement receipt, not accessory alignment, collision-free body clearance, server-session/story unification, evidence retrieval, or ACE admission.

`likely_cause`: Earlier browser proof checked controls without waiting for Babylon scene/model readiness or movement completion.

`evidence`: `tests/e2e/courtroom-sim-local-preview.spec.ts`; `.tmp/atlas/courtroom-local-preview-1280x720.png`; `.tmp/atlas/courtroom-local-preview-1920x1080.png`; `.tmp/atlas/courtroom-local-preview-arrived.png`.

`patch_targets`: `sveltekit-frontend/src/routes/(app)/demos/courtroom-sim/+page.svelte`; `sveltekit-frontend/tests/e2e/courtroom-sim-local-preview.spec.ts`.

`safe_next_command`: Re-run the local-preview Playwright test against the existing server; keep the scripted preview isolated from persistent sessions.

`smoke_command`: `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-sim-local-preview.spec.ts`

`report_path`: `docs/reports/courtroom-agentic-simulation-evidence-pipeline-audit-2026-10-28.md`

## Video upload-to-analysis read-path alignment — 2026-10-28

- Source inspection found an actual integration break: video ingest writes `evidence_items` and `evidence_transcript_segments`, but both video-analysis page loaders and `GET /api/video/analysis/[evidenceId]` read the legacy `evidence` table. Newly ingested video IDs therefore could not reliably reach their transcript/summary analysis view.
- Both page loaders and the analysis API now use `evidence_items`, check case ownership through the shared admission helper, and read ordered transcript segments and stored frame rows. The read model exposes the stored transcript summary/revision and transcript timecodes to the existing analysis UI; it does not label that generated summary as ACE synthesis. No schema migration or live read was performed.
- The video upload policy now rejects declared multipart bodies above the existing 100 MiB file limit plus bounded multipart overhead before `formData()` parsing, checks actual file size afterward and before `arrayBuffer()`, and enforces the same policy in the ingest service. Requests without `Content-Length` still need a streaming/parser-level cap.
- Per-chunk embedding fan-out is now bounded to four concurrent tasks, preserving source order and ceasing to schedule queued work after an error. The value is an initial explicit bound, not a measured throughput optimum.
- The analysis view now renders persisted transcript summaries with their digest revision and shows transcript segments with their source timecodes. Video playback seeking and live frame/audio storage readback remain unverified.
- Validation: scoped Svelte check covers 1,411 files with 0 errors and 0 warnings; read-model, upload-policy, and bounded-mapper tests pass 12/12; `git diff --check` passes. A prior full 16,391-file Svelte check found four non-strict discriminant-narrowing errors in the new upload guard; those were corrected, but the full check was not rerun. No live service, database, object-store, Qdrant, Valkey, or browser operation occurred.
- The video analysis endpoint now reads the canonical video-ingest tables, but upload-to-search still lacks independent live readback, re-index receipt, append-only summary/model/prompt lineage, and a unified document/video evidence identity and browsing path. `/api/ace/stream` remains fail-closed without server-owned admission identity.

`likely_cause`: Video ingestion and its analysis UI/API targeted different evidence tables, separating newly stored transcripts and summaries from the user-facing read path.

`evidence`: `video-ingest-service.ts`, both video-analysis `+page.server.ts` loaders, the legacy analysis API query, and the passing read-model tests.

`patch_targets`: `sveltekit-frontend/src/lib/server/features/evidence/video/`; `sveltekit-frontend/src/routes/api/video/analysis/[evidenceId]/+server.ts`; both `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/` page files; `sveltekit-frontend/src/routes/(analysis)@/video-analysis/[evidenceId]/+page.server.ts`.

`safe_next_command`: Review the shared evidence download/read authorization owner and add a mocked route test for case-owner denial and ordered transcript retrieval.

`smoke_command`: `npx vitest run src/lib/server/features/evidence/video/video-analysis-read-model-v1.spec.ts src/lib/server/features/evidence/video/video-upload-policy-v1.spec.ts src/lib/server/features/evidence/video/map-bounded-v1.spec.ts`

`report_path`: `docs/reports/courtroom-agentic-simulation-evidence-pipeline-audit-2026-10-28.md`

## Scene occupancy and current browser readiness — 2026-10-28

- Fresh source inspection confirms the local scripted runtime is wired to the active page through `startStoryRuntime()` and Babylon's `createSceneAdapter()`. The separate server-session presentation adapter projects animation cues; it does not unify server-session evidence/phase state into the local story reducer.
- The witness-station movement cue could send Alice/Jester to the same station center as the static witness mesh. `createSceneAdapter()` now tries three explicit witness-stand slots (center and ±0.8 m on X), selects the nearest reachable unoccupied slot, and refuses with an `occupied_station` diagnostic plus an `unavailable` movement receipt only when every slot is occupied. Floorplan pathfinding supplies platform height and walkability; this does not model body-level collision or guarantee visual clearance.
- Focused movement/story/actor-conflict suites pass 24/24; direct TypeScript check of `runtime/scene-adapter.ts` passes. Tests cover nearest free slot, all slots occupied, and terminal arrival-gate outcomes. Rendered positioning remains unverified.
- The existing dev server is a Vite process (PID 2356), but read-only `HEAD /demos/courtroom-sim`, `/api/health`, `/@vite/client`, `/favicon.ico`, and the N64 GLB asset all timed out (8 seconds per static probe; health also timed out at 20 and 45 seconds). This indicates a Vite/server-wide response stall, not a courtroom-only SSR delay. No browser test was started and no server restart was attempted. Current visual/browser proof therefore remains open.
- `/api/ace/stream` still explicitly supplies no identity to the admission gate and emits `cache.blocked`/`synthesis.blocked` before retrieval or cache access. Do not remove this gate. Evidence upload/search, live ACE manifest admission, and case-scoped readback remain separate open proof gates.
- A fresh focused replay of `stream.route.spec.ts` and `ace-route-cache-admission-v1.spec.ts` passes 5/5. This confirms mocked fail-closed behavior and admission validation only; no live SSE, retrieval, model, or Valkey operation was attempted.

`likely_cause`: Station navigation validated floor geometry but not whether another scene role already occupied the destination anchor.

`evidence`: `runtime/scene-adapter.ts`, `runtime/move-cue.spec.ts` (6 tests), `runtime/story-runtime.spec.ts` (13 tests), `runtime/actor-conflict.spec.ts` (4 tests), and the timed-out read-only route probe.

`patch_targets`: `sveltekit-frontend/src/lib/courtroom/runtime/scene-adapter.ts`; `sveltekit-frontend/src/lib/courtroom/runtime/move-cue.spec.ts`.

`safe_next_command`: When the existing dev server responds, run the DB-free local-preview Playwright test; do not create or advance a persistent case/session.

`smoke_command`: `npx vitest run src/lib/courtroom/runtime/move-cue.spec.ts src/lib/courtroom/runtime/story-runtime.spec.ts src/lib/courtroom/runtime/actor-conflict.spec.ts`

`report_path`: `docs/reports/courtroom-agentic-simulation-evidence-pipeline-audit-2026-10-28.md`

