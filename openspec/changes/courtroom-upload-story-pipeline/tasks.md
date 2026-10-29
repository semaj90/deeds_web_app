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

- [ ] CSP-10 Index cues by tick (`Map<tick, Cue[]>`) so `step()` stops scanning every cue every tick; keep output identical (property test against the current engine).
- [ ] CSP-11 Add `music` cue kind (`value` = track id from a manifest); validation rejects unknown ids.
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

- [ ] CSP-20 Parse/chunk uploaded text off the main thread. REUSE FIRST (found by rg 2026-10-28): upload UI already exists (`components/evidence/EvidenceBulkUploadDialog.svelte`, `components/detective/UploadZone.svelte`, `components/ai/EnhancedDocumentUploader.svelte`); server chunker `server/indexer/legal-chunker.ts`; worker pattern `workers/browser-context-embed.worker.ts`, `workers/packet-cache.worker.ts`. Decide per piece: reuse the upload dialog for file picking, and only add a thin worker if the server chunker cannot be called. Do not write a second uploader.
- [ ] CSP-21 Loading bar bound to worker progress and clip loading (real counts, not per-model steps); keep `LoadingAssistant` tips.
- [ ] CSP-22 Size and type limits, rejection receipts. The upload route still buffers up to 100 MB; streaming is a separate gate.

## 3. Embedding

- [ ] CSP-30 SUPERSEDED: do NOT build an ONNX embedding worker. `src/lib/ai/client-embed.ts` records that the browser ONNX path was abandoned (vectors not in the `embeddinggemma:latest` space, cosine ~0; ONNX-ROOTCAUSE-01 in `legal-corpus-california-codes/tasks.md`). Embed through `client-embed.ts` (`embedText`, server `POST /api/embed`, versioned browser cache). Reopen an ONNX lane only after a cosine parity receipt >= 0.99 against stored vectors.
- [ ] CSP-31 Reduced: `client-embed.ts` is the single path. Keep only the parity test that proves vectors are 768-d and the same recipe the corpus used; no second path.
- [ ] CSP-32 Record the recipe and model id with every vector; refuse to mix recipes in one run.

## 4. IndexedDB run store

- [ ] CSP-40 Extend the EXISTING IndexedDB `courtroom-story-v1` (`courtroom/story/store.ts`, currently one `stories` store, version 1) with `runs` and `chunks` stores via a version bump; do not open a second database. Chunks keep vectors as `Float32Array` blobs. Other IndexedDB owners to check before adding a store: `components/evidence/board-persistence.svelte.ts`, `ai/client-cache.ts`. No hidden reasoning, no KV cache.
- [ ] CSP-41 Replay: re-step the deterministic engine from `inputs[]` to any tick; test equality with the live state. PARTIAL: `story/replay-v1.ts` `compileStory` (sort by tick then id) and `replayStory(story, admitted, toTick)` give a deterministic receipt (fired cue ids, transcript length, phase, FNV-1a state hash; not cryptographic). The IndexedDB `inputs[]` re-step and live-vs-replay equality are not built.
- [ ] CSP-42 Quota and eviction rules; the store is a cache, never the record.

## 5. Inverse retrieval and grounded cues

- [ ] CSP-50 Cosine top-k in the worker over cached vectors; tie-aware recall check against an exact scan.
- [x] CSP-51 `story/grounding-v1.ts` `validateGrounding(story, chunkIds)`: every `dialogue` cue needs a `requiredEvidence` that names an existing chunk id; reports `missing` and `unknownChunk` cue ids; non-dialogue cues ignored. Pure, engine untouched (3 tests). Not yet called by a story builder, since no builder exists yet (CSP-52).
- [ ] CSP-52 PARTIAL. DONE: deterministic template builder `story/proposal-v1.ts` `buildGroundedProposal` (one cited dialogue cue per chunk, line = the chunk's first sentence, a chunk the snapshot lacks is skipped, same input gives the same proposal) plus `evaluateGrounding` with two separate gates: STRUCTURAL (story validates, snapshot digest and case scope match, every dialogue cue cites a chunk in the snapshot) and SEMANTIC (injected `SupportChecker`; with none, every line is UNKNOWN so status stays PROPOSED, never VERIFIED). 8 tests. NOT DONE: the local-model proposal path (:8090) and a real semantic checker; embedding similarity alone must not answer SUPPORTED.
- [ ] CSP-53 Persist uploaded items and chunk lineage to Postgres through the existing evidence route (needs explicit write approval); live upload-to-search readback is NOT_PROVEN today. FINDINGS (read-only, 2026-10-28): no table exists for stories or proposals; simulation sessions are stored only in Redis (`SESSION_PREFIX` keys in `api/simulation/+server.ts`), not canonical Postgres; the courtroom tables are `courtroom_models`, `courtroom_animations`, `courtroom_keyframes`. A story/proposal store therefore needs a NEW reviewed migration (`drizzle/manual/*.sql`: pre-image note, rollback test, explicit approval). Nothing drafted into the repo or applied.

## 6. Demo mode

- [x] CSP-60 Decision (operator, 2026-10-28: "just use the yorha celestial icons"): standardise on YoRHa icons plus text glyphs. `@iconify-json/lucide` is NOT restored; no install made. Any remaining `i-lucide-*` use stays blank until converted (not yet swept).
- [ ] CSP-61 Fixture upload (a small fictional document set) that runs the whole pipeline in the local preview with no server writes; screenshot receipts.

## 7. Audio

- [ ] CSP-70 Add licensed `.mp3` files under `static/audio/` with a manifest (id, title, licence, loop). None exist today.
- [ ] CSP-71 `<audio>` player: starts only after a user gesture, volume and mute, stops on exit; `music` cues set the track.

## 8. Ranking tournament (optional, separate)

- [ ] CSP-80 Decide scope (decision 1). If a cue/evidence ranking tournament is wanted, open its own change; it is a challenger with no retrieval vote until a reviewed gold set exists (floor: 200 rows, 30 per class). Do not add it to `parent-atlas-gpu-sidecar-patch-tournament`.

## 9. UI

- [ ] CSP-90 Convert evidence sidebar, dialogue box, user input bar and top bar to bits-ui + UnoCSS tokens (page still carries ~800 lines of scoped CSS).
- [ ] CSP-91 Fix the stray `room_bathroom.glb` / `room_myroom.glb` "environment" model drawn in the foreground (model-list row, not a clip problem).
- [ ] CSP-92 Verify at 1280x720 and 1920x1080: timeline inside the viewport, independent scrolling, slider accessible name. PARTIAL, BROWSER-PROVEN at 1280x720 on :5173 (2026-10-28, `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-sim-local-preview.spec.ts --project=chromium`: 1 passed in 7.5 s): action bar bottom edge inside the viewport (wrapper now sized to the space below the app header), timeline slider found by the name "Timeline position" (name added to the thumb, which carries role slider), cast dialog opens with the YOU seat, no page errors, no non-GET requests. 1920x1080 ALSO PASSED (2 passed in 11.7 s, same spec, two viewports). NOT done: independent scrolling of the sidebar and dialogue log. Headless run; the 3D canvas rendered black in the screenshot, so this proves layout, not scene rendering.

## 10. Verification gates

- [ ] CSP-95 Gate A: all courtroom specs and a scoped type check green. PARTIAL: focused Level 1/adapter suites pass (3 files, 16 tests); the full `npm run check -- --output human` invocation timed out without diagnostics in this session, so do not mark the gate complete. Prior preserved log `docs/.tmp/atlas/svelte-check-full-20261028n.log` records a separate 0-error run and is not a substitute for a fresh completion receipt.
- [ ] CSP-96 Gate B: local preview probe (no DB writes) shows the full upload fixture to a grounded story with the loading bar and positions readout.
- [ ] CSP-97 Gate C (needs approval): one real upload end to end, with Postgres readback.
