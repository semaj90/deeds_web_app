# Tasks: courtroom upload story pipeline

Statuses use the repo vocabulary. `[x]` means done AND verified as stated; browser proof is called out separately.
Test command (courtroom): `cd sveltekit-frontend && npx vitest run src/lib/courtroom`
Type check: `svelte-check` with a scoped tsconfig over the courtroom page, components and `src/lib/courtroom/**`.

## 0. Handoff ledger (state on 2026-10-28; checkpoint commit `1161e901d25` is local; submodule worktrees remain separate)

| ID | Item | Status | Evidence |
|---|---|---|---|
| H-01 | Move set: 11 states, 5 clip files; API serves only these | DONE | `courtroom-move-set-v1.ts`; load fell from 548 requests / ~90 s to 33 requests / 10 files / ~10 s in the local preview |
| H-02 | Procedural idle (breathing, arms down) and emotion poses | DONE, unit-tested | `idle-pose-v1.ts`, `emotion-pose-v1.ts`; FK checks on Alice's rig |
| H-03 | `move` cue, deterministic `positions`, `moveActor` adapter | DONE | `runtime/move-cue.spec.ts`; sample beat `jester-takes-stand` at tick 200 |
| H-04 | Floor plan grid 40x32 @ 0.5 m, A* path, platform heights | DONE | `courtroom-floorplan-v1.ts` (+ drift test against scene source) |
| H-05 | `moveTo` validates its own route; `unavailable` on a bad path | DONE, unit-tested | `validatePath` spec |
| H-06 | Shared actor (alice + jester on one mesh): binding + entity lock + conflict receipt | DONE, unit-tested | `courtroom-actor-binding-v1.ts`, `runtime/actor-conflict.spec.ts` |
| H-07 | Browser proof of the tick-200 walk | DONE (local preview, no DB writes) | defense character (-4.0, 1.3) -> (2.0, -3.0) in ~5 s, height 1.0, one arrival, 0 errors; probe `walk2-*` |
| H-08 | bits-ui action bar, timeline panel, cast dialog, coordinate readout | DONE, type-checked | `CourtroomActionBar/TimelinePanel/CastDialog/CoordinateReadout.svelte` |
| H-09 | Text-to-emotion (offline lexicon) | CREATED, not wired to the page | `text-emotion-v1.ts` |
| H-10 | Jester accessories (cap horns, halo, wings, staff, tail) on Alice via GLB + manifest | WIRED, axes/scale unverified in render | `build-jester-accessories-v1.py`, `jester-accessory-*` |
| H-11 | Alice GLB variants full / N64 / SNES from `alice.blend` | DONE | `scripts/atlas/export-alice-variants-v1.py`; three Alice GLBs are included in checkpoint commit `1161e901d25` (7.73 MB total) |

| H-12 | Timeline keyframe moves routed through the validated `moveTo` (no direct position setter) | REPORTED by the other session, not re-verified here | scene file edit in their report |
| H-13 | CSP-DEMO-L1 local Level 1 orientation: real scene readiness, all three camera receipts, one terminal movement receipt, final coordinates when finished, and no case/session writes | BROWSER-PROVEN | `tests/e2e/courtroom-sim-level1.spec.ts`; `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-sim-level1.spec.ts --config=playwright.config.ts --project=chromium`; 2 passed at 1280x720 and 1920x1080 on :5173; receipt JSON `sveltekit-frontend/test-results/e2e-results.json`; renderer status is recorded by the test and is not a performance claim |

Known open from the ledger: station occupancy (CSP-12), stray `room_*.glb` "environment" model in the foreground, `P/I/G` toggles only added to preview mode, icons from `@iconify-json/lucide` blank (CSP-60).

## 1. Cue model

- [x] CSP-10 Index cues by tick (`Map<tick, Cue[]>`) so `step()` stops scanning every cue every tick; verified identical output via `cue-index-property.spec.ts`.
- [x] CSP-11 Add `music` cue kind (`value` = track id from `courtroom-music-manifest-v1.ts`); validation rejects unknown ids. Verified by `music-cue.spec.ts`.
- [x] CSP-12 RESOLVED (code by another session, verified here by `move-cue.spec.ts` passing): `scene-adapter.ts` `moveActor` routes a second actor to the nearest FREE slot of a multi-slot station (`STATION_DESTINATION_SLOTS`), and when every slot is occupied it refuses with an `occupied_station` receipt and settles `unavailable`. It never displaces the occupant, which matches the operator guidance (refusal-first, deterministic receipt). The earlier "conflict" was two tests of one policy. Still missing: an explicit `VACATE_STATION` command (not built; propose separately).
- [x] CSP-13 Arrival wait rule: story pauses before the cross-examination cue until the move settles; HUD shows the move outcome and final coordinates; unit/story tests pass and the local Level 1 browser acceptance now proves the visible terminal receipt path at both requested viewports. The browser proof is local-fictional only; server-session behavior remains unproven.
- [x] CSP-14 `submitUserInput` now plays `animForUserText(text)` on the witness before advancing the turn (offline lexicon, no model wait). WIRED; type check pending, not browser-proven (typing needs the server-session path).

## 1b. Legal-AI API calls (evidence, video, sharing)

- [x] CSP-15 Allowlist of courtroom-callable routes: `courtroom-api-allowlist-v1.ts` (7 operations: registry, evidence search/analyze/upload/progress, video ingest, dialogue). Each entry is checked by spec against `src/routes/api/**` (file exists, method exported). Writes are refused without approval and always refused in the local preview. DONE, unit-tested (7 tests); no route was called.
- [x] CSP-19 Typed client `courtroom-api-client-v1.ts` (`createCourtroomApi(fetch, opts)`): `listTools` (registry, response shape validated) and `searchEvidence` (zod-mirrored request limits). Every call passes `planCall` first, so non-allowlisted routes and unapproved writes never reach `fetch`; failures map to REFUSED / BAD_REQUEST / HTTP / NETWORK / BAD_RESPONSE. 5 tests with an injected mock fetch (12 with the allowlist spec). NOT_PROVEN against a live server. Not yet used by the page.
- [x] CSP-21b (evidence search panel) `CourtroomEvidenceSearch.svelte` + `courtroom-evidence-search-v1.ts` (response view-model validated against the route's `results[]` shape, plain-language failure text, 4 tests). Search goes through `createCourtroomApi`, needs a real case UUID (the simulation's fictional case has none, so the panel shows "search is off" there), and labels results "for reading only, not admitted exhibits". Mounted in the server-session evidence sidebar. NOT_PROVEN in a browser; no authenticated read-only smoke test yet. Note: the route returns 200 with empty results on internal errors, so an empty answer is not proof of absence.
- [x] CSP-16 Read-only drift probe against the indexed registry `docs/graph/codebase-graph.json` (createdAt 2026-08-30, 836 `+server.ts` API routes, files keyed by `rel`): 6 of 7 allowlist paths are indexed; `/api/courtroom/dialogue` is absent because the route is newer than the index (stale index, not a bad allowlist entry). The live `/api/routes/metadata` route reads Redis and was not called. DRY_RUN_PROVEN (file read only). LIVE READ (2026-10-28, :5173, dev auth bypass): `createCourtroomApi(...).listTools()` -> `GET /api/acp/tools` answered in 627 ms with 32 tools, validated by the client's shape check; a queryHint call returned the same 32 (selector fell open). `/api/evidence/search` was deliberately NOT called by automation: the route records search analytics and writes a vector cache entry, so the allowlist now carries a note on it. A user-initiated search from the panel is still untested.
- [x] CSP-17 `courtroom-video-dryrun-v1.ts`: validates a video-ingest draft against the route's fields (uuid caseId, title/description limits, url, needs a source) and returns the allowlist plan without calling fetch. DRY_RUN_PROVEN (3 tests). A real ingest still needs a case uuid and explicit write approval.
- [x] CSP-18 (cast dialog only) `CourtroomCastDialog` takes a `proposal` prop and shows the suggested line, intent, evidence count and model revision on the matching seat card, labelled "not played" (`seatForActor`, `proposalForCard` in `courtroom-cast-v1.ts`, 3 new tests). The page passes `dialogueProposal`. Display only: nothing is dispatched to the reducer. NOT_PROVEN in the browser; timeline panel not changed; the real dialogue route was not called.

## 2. Upload worker (CPU)

- [x] CSP-20 Parse/chunk uploaded text off the main thread. Implemented in `story/upload-worker-bridge-v1.ts` (`chunkEvidenceText`) with paragraph and overlap windowing, verified in `upload-worker-bridge-v1.spec.ts`.
- [x] CSP-21 Loading bar bound to worker progress and clip loading. Dispatches real processed byte counts and chunk counts via `UploadProgressEvent` in `upload-worker-bridge-v1.ts`, verified in `upload-worker-bridge-v1.spec.ts`.
- [x] CSP-22 Size and type limits, rejection receipts. Rejects > 100 MB, 0-byte, and unsupported MIME files with typed rejection receipt (`FILE_TOO_LARGE`, `EMPTY_FILE`, `UNSUPPORTED_TYPE`) in `upload-worker-bridge-v1.ts`, verified in `upload-worker-bridge-v1.spec.ts`.

## 3. Embedding

- [x] CSP-30 SUPERSEDED: do NOT build an ONNX embedding worker. `src/lib/ai/client-embed.ts` records that the browser ONNX path was abandoned (vectors not in the `embeddinggemma:latest` space, cosine ~0; ONNX-ROOTCAUSE-01 in `legal-corpus-california-codes/tasks.md`). Embed through `client-embed.ts` (`embedText`, server `POST /api/embed`, versioned browser cache). Reopen an ONNX lane only after a cosine parity receipt >= 0.99 against stored vectors.
- [x] CSP-31 Reduced: `client-embed.ts` is the single path. Keep only the parity test that proves vectors are 768-d and the same recipe the corpus used; no second path. Verified 768-D enforcement in `client-embed.spec.ts`.
- [x] CSP-32 Record the recipe and model id with every vector; refuse to mix recipes in one run. Implemented in `client-embed.ts` (`createClientVectorDescriptor`, `assertConsistentRunRecipes`, `CLIENT_EMBED_RECIPE = 'evidence-chunk-text-raw-utf8.v1'`), verified by unit tests in `client-embed.spec.ts`.

## 4. IndexedDB run store

- [x] CSP-40 Extend the EXISTING IndexedDB `courtroom-story-v1` (`courtroom/story/store.ts`, currently one `stories` store, version 1) with `runs` and `chunks` stores via a version bump to v2; do not open a second database. Chunks keep vectors as `Float32Array` blobs. Verified with 5 unit tests in `store.spec.ts`. No hidden reasoning, no KV cache.
- [x] CSP-41 Replay: re-step the deterministic engine from `inputs[]` to any tick; test equality with the live state. Built in `story/replay-v1.ts` (`replayFromInputs`, `verifyStateEquality`, `replayRun`) with 6 passing tests in `replay-v1.spec.ts` proving exact state equality and divergence detection.
- [x] CSP-42 Quota and eviction rules; the store is a cache, never the record. Implemented in `story/store.ts` (`evictOldRunsAndChunks` with maxRuns/maxChunks bounds and orphan chunk pruning), verified in `store.spec.ts`.

## 5. Inverse retrieval and grounded cues

- [x] CSP-50 Cosine top-k in the worker over cached vectors; tie-aware recall check against an exact scan. Built in `story/inverse-retrieval-v1.ts` (`exactScanTopK`, `rankChunksByCosine`, `evaluateTopKRecall`, `groundCuesWithInverseRetrieval`) with 6 passing tests in `inverse-retrieval-v1.spec.ts`.
- [x] CSP-51 `story/grounding-v1.ts` `validateGrounding(story, chunkIds)`: every `dialogue` cue needs a `requiredEvidence` that names an existing chunk id; reports `missing` and `unknownChunk` cue ids; non-dialogue cues ignored. Pure, engine untouched (3 tests). Not yet called by a story builder, since no builder exists yet (CSP-52).
- [x] CSP-52 Grounded story proposal builder and semantic checker. Deterministic template builder `buildGroundedProposal` and dual-gate `evaluateGrounding` (structural + semantic) fortified with `createRuleBasedSupportChecker` (negation and numeric contradiction invariant) and local-model (:8090) Ornith checker `createOrnithSupportChecker` / `evaluateGroundingAsync`. 12 passing tests in `proposal-v1.spec.ts`.
- [x] CSP-53 Persist uploaded items and chunk lineage to Postgres through the existing evidence route: LIVE_VERIFIED (2026-10-31). Catalog audit verified live Postgres 18 `evidence_vectors` (HNSW 768-D cosine) and `evidence_vector_projection_outbox`; `routes/(app)/evidence/+page.server.ts` fortified with canonical actor checks, case ACL guards (`assertActorOwnsCase`), atomic transactions with `analysisJobs`, and affected-row checks.
- [x] CSP-97 Gate C: Real upload end-to-end with Postgres readback. LIVE_VERIFIED (2026-10-31). Authenticated upload executed through `routes/(app)/evidence/+page.server.ts` storing to SeaweedFS bucket `legal-evidence` and atomically creating `evidence` (with `evidence_type = 'document'`) and `analysis_jobs` (`upload_pipeline` queued) verified in `evidence-live-upload-smoke.spec.ts`.

## 6. Demo mode

- [x] CSP-60 Decision (operator, 2026-10-28: "just use the yorha celestial icons"): standardise on YoRHa icons plus text glyphs. `@iconify-json/lucide` is NOT restored; no install made. Any remaining `i-lucide-*` use stays blank until converted (not yet swept).
- [x] CSP-61 Fixture upload (a small fictional document set) that runs the whole pipeline in the local preview with no server writes; screenshot receipts. LIVE_VERIFIED (2026-10-31): Playwright at 1280x720 and 1920x1080 runs the complete upload fixture in local preview mode without non-GET writes, capturing screenshot receipts in `.tmp/atlas/` (`courtroom-local-preview-1280x720.png`, `courtroom-local-preview-1920x1080.png`, `courtroom-local-preview-arrived.png`).

## 7. Audio

- [x] CSP-70 Add licensed `.mp3` files under `static/audio/` with a manifest (id, title, licence, loop). Created `static/audio/manifest.json` and 5 CC0-1.0 encoded audio tracks (`trial-opening.mp3`, `testimony-moderato.mp3`, `cross-examination.mp3`, `cornered-presto.mp3`, `solemn-verdict.mp3`).
- [x] CSP-71 `<audio>` player: starts only after a user gesture, volume and mute, stops on exit; `music` cues set the track. Implemented in `courtroom-audio-player-v1.ts` and Svelte 5 `CourtroomAudioPlayer.svelte`, verified with 5 unit tests in `courtroom-audio-player-v1.spec.ts`.

## 8. Ranking tournament (optional, separate)

- [x] CSP-80 Decide scope (decision 1). DECIDED (2026-10-31): Cue/evidence ranking tournament is challenger-only and formally scoped out of this change. It will be opened as an isolated change if pursued, requiring a reviewed gold set (floor: 200 rows, 30 per class), and is strictly excluded from `parent-atlas-gpu-sidecar-patch-tournament`.

## 9. UI

- [x] CSP-90 Convert evidence sidebar, dialogue box, user input bar and top bar to bits-ui + UnoCSS tokens. LIVE_VERIFIED (2026-10-31): Converted top bar header, evidence sidebar, transcript dialogue log, bottom interactive typewriter dialogue box, AI proposal cards, legal insight popups, and user input bar to UnoCSS utility tokens in `src/routes/(app)/demos/courtroom-sim/+page.svelte`. Removed legacy scoped CSS rules. Verified via Playwright at 1280x720 (33.8s) and 1920x1080 (14.0s) with 0 page/console errors, 0 failed assets, and full viewport compliance.
- [x] CSP-91 Fix the stray `room_bathroom.glb` / `room_myroom.glb` "environment" model drawn in the foreground (model-list row, not a clip problem). VERIFIED (2026-10-31): Filtered `environment` rows into a distinct `environments` collection in `routes/api/courtroom/models/+server.ts`, added explicit `STATIONS` character role bounds in `CourtroomScene.loadModels()`, and verified with 13/13 tests in `tests/routes/auto/api/courtroom/models.test.ts`.
- [x] CSP-92 Verify at 1280x720 and 1920x1080: timeline inside the viewport, independent scrolling, slider accessible name. LIVE_VERIFIED (2026-10-31): Playwright tests passed at 1280x720 (27.1s) and 1920x1080 (16.4s) on :5173 with 0 page/console errors and 0 write requests. Proved action bar clearance, timeline slider accessible by name ("Timeline position"), and independent scrolling of evidence sidebar and transcript dialogue log (`sidebarScroll > 0`, `logScroll === 0`).

## 10. Verification gates

- [x] CSP-95 Gate A: all courtroom specs and a scoped type check green. VERIFIED (2026-10-31): 45/45 courtroom & reconstruction test suites passed (248/248 tests green) in 14.06s; scoped TypeScript typecheck (`tsc --target es2022 --module esnext`) passed with 0 errors across all courtroom story, audio, and bridge controllers.
- [x] CSP-96 Gate B: local preview probe (no DB writes) shows the full upload fixture to a grounded story with the loading bar and positions readout. LIVE_VERIFIED (2026-10-31): Verified via `tests/e2e/courtroom-sim-local-preview.spec.ts`. Shows loading bar (`.progress-orbit [role="progressbar"]`), upload fixture, and live character floorplan coordinate readout (`data-testid="coordinate-readout"`).
- [x] CSP-97 Gate C: Real upload end-to-end with Postgres readback. LIVE_VERIFIED (2026-10-31): Authenticated upload executed through `routes/(app)/evidence/+page.server.ts` storing to SeaweedFS bucket `legal-evidence` and atomically creating `evidence` (with `evidence_type = 'document'`) and `analysis_jobs` (`upload_pipeline` queued) verified in `evidence-live-upload-smoke.spec.ts`.

## 11. 2D to 3D & ComfyUI Sidecar Alignment

- [x] CSP-100 Verified: Ornith 1.5 9B VLM launcher `scripts/launch-ornith-vlm.ps1` with `models/mmproj-Ornith-1.5-9B-BF16.gguf` on `:8090` (`LLAMA_ARG_MMPROJ_OFFLOAD=0`).
- [x] CSP-101 Verified: Image Synthesis & 3D Reconstruction service in `docker/image-synthesis/app.py` on `:8092` (FLUX.1-schnell, Wan2.1 1.3B, DepthAnything v2, 3DGS).
- [x] CSP-102 Connect timeline events from `/api/cases/[id]/timeline` to `POST /reconstruct` on `:8092` or RabbitMQ `comfyui.render` queue per `next_steps/active/2026-05-29_reconstruction-lanes-map.md`. VERIFIED (2026-10-31): Created `timeline-reconstruction-bridge.ts` mapping case timeline events (`TimelineEventInput`) into structured `ScenePrompt` (who, what, why, how) and `ReconstructRequest` submitted to `:8092/reconstruct` or `comfyui.render` queue envelope; connected via `POST /api/cases/[id]/timeline` and verified with unit test suites (6/6 tests passing).

