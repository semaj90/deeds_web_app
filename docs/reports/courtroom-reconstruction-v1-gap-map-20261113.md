# Courtroom Reconstruction V1 — Implementation Gap Map

**Status:** design review only. The supplied proposal remains **PROPOSED**; no approval, production readiness, or OpenSpec completion is implied.

**Repository revision reviewed:** `05c45c5a896fc44087e0dd0a0c9191eb363d1b25` (current `HEAD` at review time). The working tree also contains unrelated changes; no unrelated files were edited for this review.

## Recommendation

Keep SvelteKit 2/Svelte 5 as the authenticated editor, review surface, and project API. Use the existing scene renderer for the preview. Use pinned PhotoCraft/FilmCraft Rust command-line workers for media operations that need a real image or video engine. Do not load a native GUI or run CPU-heavy synchronous N-API work on the SvelteKit event loop.

For the first acceptance slice, do not embed the entire WASM editor. FilmCraft documents a headless CLI/MCP surface that can inspect projects and commands, render frames, export, report progress, and cancel jobs. Its browser app is a separate WASM application and has its own hosting, memory, and file-handoff behavior. PhotoCraft likewise has a layered Rust image engine, CLI/MCP, and separate WASM web app. Those are candidate engines, not yet pinned Parent Atlas dependencies. Confirm exact commits, build digests, command schemas, notices, and asset licenses before integrating them.

The existing C++ N-API/radix and TurboVec surfaces address compact metadata or candidate ordering. They do not decode or edit images/video. Bring them into this workflow only if profiling identifies a specific bottleneck and a parity benchmark proves a gain.

## Current implementation map

| Area | Existing owner and evidence | State | Exact gap |
|---|---|---|---|
| Evidence preview and review | `src/lib/components/evidence/EvidenceViewModal.svelte` plays media, shows image analysis/markup, extracts a video still, and supports playback status. `evidence-markup-v1.ts` builds a review note. | Present and wired to the evidence UI | The note is not a durable V2 edit revision; exported markup is a separate local image. There is no common undoable command log, source-parent link, durable edit history, or incremental reindex receipt. |
| Image analysis | `src/lib/server/evidence/evidence-image-analysis-contract-v1.ts`, `evidence-visual-analysis-v1.ts`, their specs, and image-analysis routes exist. | Contracts and paths exist | A complete authorized image fixture has not been shown through upload → analysis → reviewed observation → exact source-region readback. “Enhance” must produce a visibly marked derivative with method/model/settings and source hash; never treat generated detail as recovered fact. |
| Video ingest | `src/routes/api/evidence/video/ingest/+server.ts` validates actor, case, request size, and invokes `ingestVideoEvidence`. `video-ingest-service.ts` stores the original and audio asset, transcribes and summarizes audio, and attempts transcript embedding/search indexing. | Wired request path; its stages run inside the awaited route/service | This path does not prove leased queue recovery or a separate durable render job. The inspected service handles audio/transcript processing; a deterministic video-frame sampler, timestamped visual observations, and scene-review handoff are not established by that path. |
| Audio/transcript | Existing FFmpeg audio extraction and `transcribeVideoAudio` calls are in `video-ingest-service.ts`; the modal has native audio/video controls and format hints. | Source-present; partial ingest path | Need durable, idempotent worker stages, transcript-review/edit receipts, exact source timestamps, restart recovery, and independent storage/database readback. |
| Synthetic courtroom project | `src/lib/courtroom/courtroom-video-project-v1.ts` and `src/routes/(app)/demos/courtroom-studio/+page.svelte` define a four-beat 240-frame draft and reuse `CourtroomScene`. | CREATED, UI wired to existing preview | The contract now uses `atlas.courtroom-reconstruction.v1`, fixture project ID, draft revision, rational 30/1 rate, sealed canonical storyboard checksum, typed observation locators and renderer/asset revision slots. The remaining gaps are durable edit history, reviewer/approval workflow, and a revision-qualified export receipt. Fixture source refs cannot pass real-evidence admission. |
| Frame-addressable scene | `courtroom-scene.svelte.ts` now exposes `renderAtFrame(frameNumber, view, speakerRole)`; the studio can download a composited PNG for its selected frame with the persistent disclosure. | Synthetic deterministic pose samples are browser-proven | The frame number drives only a small, deterministic speaker head bob/tilt within each 60-frame beat; camera state remains a fixed preset and the rest of the cast is reset to neutral. This is not a full authored actor/camera keyframe renderer. Pixel-level disclosure checks remain open. |
| FilmCraft export | The prior report records a numbered still sequence exported to a verified 240-frame MP4. A moving browser WebM was also retimed by the scratch FilmCraft CLI and probed as 8 seconds, 1280×720, 30 fps. | Synthetic CLI proof | The Svelte editor is not connected to the CLI. The retimed MP4 probe did not establish a full 240 decoded-frame count; the still-sequence export is the current exact-frame proof, but contains held views. No pinned project dependency/CLI adapter, 10-frame golden suite, export receipt, or browser-to-worker job exists. |
| Durable jobs and artifacts | Existing PostgreSQL evidence/media/job/outbox owners, SeaweedFS client, progress routes, and worker code exist elsewhere in the app. | Owners exist; this editor is not wired to them | Reconcile and reuse the canonical job/outbox/authorization owner; do not create a parallel `reconstruction_jobs` table or evidence registry. A render may publish only after source revalidation, output decode checks, object readback, and receipt commit. |
| Search/vectors | Embedding and Qdrant/TurboVec retrieval components exist in the repository. | Separate paths | Retrieval is not required for a synthetic MP4 proof. For the later real-evidence phase, preserve source ID/revision/hash plus page/region/frame/audio time on every derived chunk/vector; PostgreSQL remains canonical and Qdrant/TurboVec are rebuildable projections. |

## Exact acceptance work, in dependency order

### Durable project and render-owner audit — 2026-11-13

The source audit confirms that the editor cannot safely attach a courtroom render to the existing evidence ingestion worker:

- `analysis_jobs.evidence_id` is `NOT NULL`; its current `JobType` values and `stageConfig` contain no courtroom-render stage. Its worker invokes evidence-centric processors and records analysis-pass results, so inventing a fake evidence row or overloading `upload_pipeline` would violate the existing owner contract.
- `workflow_tasks` and `workflow_outbox` provide a generic PostgreSQL-first RabbitMQ dispatch path, but the finite `taskTypeSchema`/routing map has no courtroom render command and the inspected document-parse consumer accepts only `document.parse`. No FilmCraft render consumer is registered in the current SvelteKit queue sources.
- The generic `workflow_artifacts`, `workflow_action_leases`, and `workflow_action_receipts` primitives could support immutable project/export artifacts and fenced execution. Their DDL is in `drizzle/manual/parent_atlas_artifact_transport_v1.sql`, is not listed in `drizzle/sidecar-migrations.json`, and `assertArtifactTransportReady()` deliberately refuses to proceed until the artifact store is proven present. They do not by themselves define a project owner, current-revision pointer, case scope, approval, or FilmCraft consumer.
- `courtroom_keyframes` is a timeline/keyframe table keyed by an unreferenced `session_id`; it has no case/user owner, project revision, source checksum, approval, or storyboard manifest. It is not sufficient as the canonical reconstruction project record.

**Implementation consequence:** do not enqueue render requests through `analysis_jobs.upload_pipeline`, and do not claim the generic artifact transport is live-ready. The next server-side slice must first choose and test a revision-safe project persistence contract using the existing canonical artifact owner (plus a scoped current-revision/approval authority if none exists), then register one explicit render command and consumer on the existing `workflow_tasks` outbox. The worker must require artifact-store readiness, revalidate project/source revisions, claim a fenced lease, invoke the pinned FilmCraft CLI in a confined per-job directory, and publish the immutable output only after independent decode/readback. No migration was applied and no service or live database was changed during this audit.

### 0. Pin the media engine and prove its command surface

- Choose one FilmCraft release/commit and record source commit, CLI binary SHA-256, Rust/toolchain, lockfile, build flags, dependency inventory, `NOTICE`, `ATTRIBUTION.md`, and the selected MIT/Apache license.
- Run the installed CLI's version/probe and command-catalog commands; capture the actual IDs and argument schema for project create/load, image-sequence import, title/disclosure, frame rendering, export, status/progress, and cancellation. Do not invent command IDs based on prose.
- Verify offline/missing-media behavior, process exit codes, output path confinement, CPU/memory/time limits, and cancellation cleanup before allowing a worker to call it.
- Inspect PhotoCraft only for the image-edit scope: command catalog, supported formats, edit/save round-trip, and project/document metadata. Do not port its full UI or claim 256×256 tile ABI until the pinned source proves it.

**Exit proof:** a pinned binary loads the synthetic project, lists validated commands, renders a frame, and returns a clear failure for a missing-media adversarial fixture.

### 1. Freeze the source-free reconstruction contract

- Use the proposed logical schema name `atlas.courtroom-reconstruction.v1` after updating the proposal/contract deliberately; keep the current project contract as an explicit compatibility/fixture version until that migration is reviewed.
- Add stable `projectId`, monotonically revisioned draft, canonical storyboard checksum, rational `fps={num:30,den:1}`, dimensions, and exact half-open beat ranges `[0,60)`, `[60,120)`, `[120,180)`, `[180,240)`.
- Require a typed source observation for each factual label/narration claim. Hypothetical/unknown material must be labeled and cannot serialize as documented. The `WHY` beat cannot assert motive without a reviewed source observation.
- Add disclosure template revision and scene/actor/camera/font/palette/render settings revisions. Synthetic fixture references remain fixture-only and cannot pass real-case admission.
- Test invalid frame boundaries, duplicate/gapped ranges, stale source/project revisions, missing observation, unsupported documented claims, missing disclosure, malformed path/size, and tampered checksum.

**Exit proof:** a deterministic manifest serializes identically for the same fixture, and its hostile/invalid forms fail closed.

### 2. Make the scene evaluate at exact frames

- Add a renderer adapter with `renderAtFrame(frameNumber)`; it must set camera, actor pose, text, and disclosure solely from integer frame/project data.
- Do not call wall-clock `requestAnimationFrame` time as the export timebase. Browser animation may remain an interactive preview only.
- Capture deterministic PNGs at frames `0, 1, 59, 60, 119, 120, 179, 180, 238, 239`; verify beat, camera/pose, non-black render, and disclosure pixels.
- Preserve a synthetic neutral cast and do not use real likenesses for the first fixture.

**Exit proof:** repeating the same frame render from the same source/project/asset revisions passes the documented pixel/perceptual tolerance and overlay checks.

### 3. Produce and independently verify the exact MP4

- Assemble the 240 frame sequence in the pinned FilmCraft project using only catalog-confirmed commands. Use the persistent disclosure on every frame, including final/transition frames.
- Export H.264 MP4 at 1280×720, 30/1, square pixels, SDR Rec.709, exactly 240 decoded frames and 8.000-second video duration. Record encoder/render settings and FilmCraft version/build digest.
- Use an independent decoder/prober to count all decoded frames and inspect PTS spacing, codec, dimensions, color, duration, and full-file decode. Probe selected frames for scene correctness and disclosure.
- Write the MP4 to a separate derived object path; hash/read it back and create an export receipt bound to project checksum and source/asset revisions.

**Exit proof:** exact frame count and PTS schedule from an independent decoder; no missing media; output bytes/hash and receipt independently read back.

### 4. Wire SvelteKit to the durable worker

- Keep SvelteKit responsible for authorized SSR/bootstrap, draft UI and typed API contracts. Use existing case authorization before source reads, cache lookup, job status, preview, or export retrieval.
- Submit a revision-qualified render request through the existing PostgreSQL-first job/outbox/lease owner. Recheck case access and every source revision when claimed. Make stages idempotent and bounded, with retry, heartbeat, cancellation, failure recovery, and progress events.
- Worker materializes only allowlisted input files, invokes the pinned CLI as a child process, and can only write to a per-job derived directory. Never expose the CLI's write roots/control token to the browser or arbitrary MCP clients.
- Reuse existing progress/SSE owner if it fits. Record progress as job state; don't turn each rendered frame into a database event/write.

**Exit proof:** Playwright creates a disposable synthetic project, starts/polls/cancels/exports a worker job, reloads to the same job state, and reads back an independently verified artifact. Include worker crash/restart and duplicate idempotency probes.

### 5. Add real evidence only after synthetic acceptance

- Resolve authorized case/evidence references through the existing evidence owner, preserve original SeaweedFS bytes and SHA-256, and record immutable evidence revision plus page/region/video PTS/audio time for every observation.
- Keep visual detection separate from identity. Use non-identifying object boxes and within-source track IDs only. Do not create face identity embeddings, cross-case person matching, or behavioral intent labels under this proposal.
- Keep OCR/transcript/visual observations as proposals with model/prompt/preprocess revision, confidence/uncertainty, reviewer disposition, and exact source locator. Review is explicit; no model score changes a source claim to DOCUMENTED by itself.
- Any image “enhancement” is a separate derived asset, source-hash linked and clearly labeled enhanced/illustrative. Never substitute it for the original or claim that upscaling reconstructed ground truth.

**Exit proof:** authorized PDF/image/video sample is admitted, processed, reviewed, source-located, and independently read back; stale revisions and another case's source are rejected before media or cache access.

## SvelteKit vs Rust decision

| Work | Recommended owner | Why |
|---|---|---|
| Case/source authorization, project APIs, review/approval forms, job view | SvelteKit server + Svelte 5 UI | Keeps session and canonical access checks next to existing server owners; UI remains accessible and responsive. |
| Browser preview, source playback, timeline controls, annotations | HTML media + existing scene renderer; Web Worker only for bounded browser work | Avoids loading an entire creative suite for playback and review. A worker keeps large client-side parsing/canvas tasks off the UI thread. |
| Image document edits and high-quality video timeline/export | Pinned PhotoCraft/FilmCraft Rust CLI in the existing bounded job worker | Reuses maintained media engines and their headless command surfaces instead of reimplementing codecs/compositors. |
| Fast bitset/radix/metadata kernels | Existing C++/Rust native core only after profiling | Native code can speed a measured tight loop; it does not make Svelte DOM, media decoding, or model inference automatically faster. Synchronous N-API can block Node's event loop, so use only on worker threads or the durable worker. |
| Semantic/vector search | Existing embedding + pgvector/SearchRuntime; Qdrant/TurboVec as measured projections | Retrieval is a later stage and never establishes source identity or observation truth. |

Embedding PhotoCraft/FilmCraft WASM is technically possible, but should be a later experiment: it ships a second full editor/runtime to the browser, needs memory/load testing, and requires an explicit host/save bridge. FilmCraft's official web app supports host-mode file handoff; that is a separate integration surface, not a drop-in Svelte component.

## Safety boundaries

- Do not copy proprietary Adobe code/assets. The upstream projects state MIT OR Apache-2.0 project licensing, while bundled assets may have their own licenses and notices. Pin and preserve each exact revision's attribution before bundling or redistributing.
- No face recognition or cross-case identity matching in this workflow. A future identity task needs a separate approved policy and legal/rights/evaluation review.
- Do not fine-tune on uploaded case evidence by default. Do not enable GPU execution for the first CPU/CLI proof.
- No migrations or canonical task checkboxes are changed by this report. The supplied proposal remains unapproved.

## GAN status and proof record

- **CREATED:** synthetic four-beat project contract, studio route, deterministic scene-capture method, tests, and a scratch FilmCraft export artifact exist.
- **WIRED:** studio preview and exact PNG download call the existing procedural courtroom scene. The WebM preview now evaluates every integer project frame through `renderAtFrameInto` and copies the rendered scene directly to the recording canvas, avoiding PNG encode/decode per frame. The video upload route calls the existing video-ingestion service. Neither path submits a durable reconstruction render job.
- **PROVEN:** project and FilmCraft adapter unit suites pass 14/14. The local Chromium Playwright run passes 1 test: repeated frame 0 PNGs are byte-identical, frame 1 differs, the specified segment boundary samples produce valid PNGs, the disclosure is visible, and there are no page errors. It also records the browser preview, decodes it in Chromium, and counts exactly 240 frames. The latest run took about 2.1 minutes and writes the WebM only to ignored scratch space. It uses `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true` because the default global database cleanup setup received `CONNECTION_REFUSED`; no database mutation occurred. The preview uses wall-clock WebM timestamps and is slower than real time, so it is not the target deliverable by itself. A separate scratch-only FilmCraft experiment retimed this studio-derived WebM into the target H.264 profile; evidence and limits are recorded below.
- **DONE:** no. There is not yet a frame-varying renderer keyed by project frame data, source-authorized project approval, editor-to-CLI worker, revisioned export receipt, crash-recovery proof, or real-evidence end-to-end readback.

Atlas MCP discovery was attempted read-only at the same workspace revision. The retrieval context returned 0 cards and the SourceRef lookup returned `TRACE_TOOL_ERROR`; those results are not evidence for implementation status. The findings above are from current local source and test inspection.

### Structured handoff

- **likely_cause:** The evidence modal, video transcription service, procedural courtroom preview, and scratch FilmCraft CLI export are separate owners without a shared revision-bound project, worker, and export receipt.
- **evidence:** The source paths and proof commands in this report; repository `HEAD` was `05c45c5a896fc44087e0dd0a0c9191eb363d1b25` during review.
- **patch_targets:** `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, and this report. Durable-worker candidate owners remain `sveltekit-frontend/src/lib/server/queue/artifact-work-dispatch-v1.ts` and `action-single-flight-v1.ts`; their manual schema prerequisite and missing render consumer remain open.
- **safe_next_command:** `rg -n "workflow_artifacts|workflow_action_leases|workflow_action_receipts|courtroom|render" sveltekit-frontend/src/lib/server/queue sveltekit-frontend/drizzle/manual sveltekit-frontend/drizzle/sidecar-migrations.json`
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts -t "revision drift"`
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`

## Phase 1 contract follow-up

The synthetic project now uses the proposal's logical schema identifier `atlas.courtroom-reconstruction.v1`, carries a fixture project ID and draft revision, and records the output frame rate as the rational `30/1`. Editing a segment camera/title/narration increments the draft revision. The project download is sealed with a canonical JSON SHA-256 storyboard checksum; a verifier rejects a changed manifest. Segment records now have typed document-span, image-region, video-PTS, audio-time, and synthetic-fixture locators. `DOCUMENTED` and `DISPUTED` claims require a non-fixture observation bound to an exact source reference; malformed/out-of-bounds locators fail validation. Fixture-only projects intentionally cannot satisfy that real-evidence gate.

Added `frameBoundaryToTicksV1`, which converts integer frame boundaries to caller-supplied integer ticks-per-second using `BigInt` arithmetic and rejects fractional frames, out-of-range presentation boundaries, invalid timebases, and non-integral tick results. The local portable FilmCraft CLI reports `254016000000` ticks per second; the focused fixture verifies boundaries 0, 1, 239, and 240, including exactly eight seconds at the exclusive end for that timebase.

The local scratch bundle at `.tmp/filmcraft-v0.20.1-courtroom-proof/` was inspected without changing its project or output. `filmcraft-cli.exe --version` reports `0.20.1`; its SHA-256 is `97B045D39D0E8463FE83F0445E649D63B73AD10027089FCADC0C5F10A3B35B45`, and the portable ZIP SHA-256 is `BFB00E2089DF5F13E6F76AAB117A4572A8D005D009C5818989688B140A502710`. The bundle contains `LICENSE-APACHE`, `LICENSE-MIT`, and `NOTICE`; the license text and NOTICE identify FilmCraft source as MIT or Apache-2.0 at the recipient's option. The NOTICE also lists separately licensed bundled material, including OFL-1.1 fonts and other asset notices; preserve the complete NOTICE and perform a release-specific inventory before redistribution. `--help` documents headless project operations, `render`, `export`, `probe`, command scripts, and the tick rate. The runtime command catalog reports `file.exportMedia` with H.264 support, but the catalog's enabled state depends on an active project/sequence. This is a local binary/version pin candidate, not a source Git commit, lockfile, complete dependency/license review, or SvelteKit worker integration.

License clarification from upstream and the local FilmCraft bundle: FilmCraft and PhotoCraft source code is offered under MIT **or** Apache-2.0. The ArtCraft name, wordmark, and logos are trademarks outside those code licenses; do not use them in Parent Atlas branding. Third-party fonts/media/assets retain their own terms and attribution requirements. Keep the pinned bundle's NOTICE and review its exact asset inventory before distributing bundled binaries or assets; this does not prevent invoking the CLI as an internal worker.

Validation at the initial contract checkpoint: `npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts` passed 8/8 tests, including stable checksum across object-key order; scoped trailing-whitespace check passed. At that checkpoint, the full `svelte-check` command was stopped after it remained silent for over a minute. The later focused `check:fast` result and browser capture proof are recorded below. This checkpoint did not establish an append-only edit history, approval workflow, deterministic `renderAtFrame`, or editor-generated MP4 receipt.

**GAN at the initial contract checkpoint:** CREATED — revisioned/checksummed synthetic manifest, typed observation-locator contract, render-input revision fields, and exact frame-boundary arithmetic helper. WIRED — studio draft export seals the manifest and records edits as revisions. PROVEN — 8 focused unit tests, including factual-claim observation gates, malformed locator rejection, checksum tamper/order behavior, and integer timing bounds. DONE — no; later capture progress and remaining worker/export gaps are recorded below.

### Updated handoff

- **likely_cause:** The initial studio represented a four-beat storyboard but lacked a revision-qualified, sealed manifest and an integer frame-to-tick contract.
- **evidence:** `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts`, its eight-test spec, the sealed project download, and the local FilmCraft CLI version/help/catalog probe recorded above.
- **patch_targets:** `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts`, `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.spec.ts`, `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, and this report.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.spec.ts 'sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte' docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts`
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`

## Phase 2 browser capture follow-up

Added a deterministic synthetic PNG capture path to the studio. `CourtroomScene.renderAtFrame` rejects frames outside `[0,240)`, refuses imported/model actors, pauses its render-loop retargets, resets the procedural cast to neutral positions, applies a fixed camera preset and a small speaker head pose derived from the integer frame, renders synchronously, then resets the cast and restores the procedural idle loop. The studio snapshots the selected beat and output dimensions and disables editing/playback controls during capture, then composites the beat caption and persistent synthetic disclosure onto a 1280×720 PNG. A Playwright test on the already-running local SvelteKit app exercised all ten specified frame numbers: 0, 1, 59, 60, 119, 120, 179, 180, 238, and 239. Two frame-0 PNGs were byte-identical; frame 1 differed; and every sample had a valid PNG signature and non-empty image bytes. It also checked visible disclosure text and observed no page errors. `npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts` passed 8/8. The final focused Playwright test passed 1/1 in 45.1 seconds after capture-state restoration. No app service was started or restarted and no database, SeaweedFS, real evidence, GPU, or canonical task state was touched.

This remains a limited deterministic still-frame renderer, not a complete scene timeline: the integer frame selects a small synthetic speaker head pose while the camera uses one fixed preset per beat; it does not evaluate authored camera paths, body/actor animation, or source-synchronized motion. The current browser test exercises all ten specified frame numbers (0, 1, 59, 60, 119, 120, 179, 180, 238, 239), proves repeatability at frame 0 and a frame-driven image change at frame 1, and checks valid non-empty PNG output at each sample. Pixel-level disclosure verification remains open. It downloads PNGs to the browser user; it does not queue, persist, assemble, or independently decode an editor-generated MP4.

The analysis worker has a `FOR UPDATE SKIP LOCKED` queue, but its `analysis_jobs.evidence_id` is required and the supported job-type registry has no reconstruction render handler. This does not establish that this queue is a safe owner for case-scoped render projects; further owner/lease/idempotency review is needed before wiring a render job. Do not insert a render as an unrelated upload job or create a parallel job table.

**GAN update:** CREATED — project manifest plus deterministic synthetic PNG capture. WIRED — studio button → existing scene → disclosure-composited PNG download; preview idle motion is restored afterward. PROVEN — 8 contract tests and one local Chromium test (repeat frame identity, frame-driven pose change, all ten selected samples, disclosure text, no page errors). An earlier `npm run check:fast` run reported 24 parser errors in the unrelated kanban DAG file; a fresh rerun after concurrent worktree updates completed with 0 errors and 0 warnings. DONE — no; authored actor/camera keyframes, pixel-level disclosure verification, editor-to-FilmCraft durable job, artifact storage/readback, and real-evidence authorization/review remain open.

- **likely_cause:** The studio previously relied on wall-clock preview capture and had no repeatable still-frame capture path; the existing durable analysis queue is not yet established as an appropriate owner for reconstruction exports.
- **evidence:** `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`, `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, and `sveltekit-frontend/src/lib/server/analysis/analysis-jobs.ts`.
- **patch_targets:** `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`, `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.
- **safe_next_command:** `rg -n "analysis_jobs|leaseToken|fencingToken|idempotency|render" sveltekit-frontend/src/lib/server/analysis sveltekit-frontend/src/lib/server/queue sveltekit-frontend/src/lib/server/db`.
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/courtroom/courtroom-video-project-v1.spec.ts && $env:PLAYWRIGHT_SKIP_GLOBAL_SETUP='true'; npx playwright test tests/e2e/courtroom-studio-deterministic-frame.spec.ts --reporter=line`.
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.

## Synthetic draft persistence and rendered disclosure gate

The studio now exposes account-scoped **Save draft** and **Load saved draft** controls backed in source by the existing content-addressed `workflow_artifacts` transport. Draft payloads are strict synthetic-fixture contracts only; the API binds the owner to the authenticated user, verifies the sealed storyboard checksum and project revision, rejects stale/conflicting revisions, and returns a stable 503 while the artifact transport readiness gate is closed. The sidecar DDL remains `proposal_only`; no migration was applied and no database write was made. This is an implemented fail-closed path, not proof that save/load works against PostgreSQL.

The draft schema initially failed the Svelte type check because the parsed observation locator type did not satisfy the shared required-locator project contract. The schema now parses the locator explicitly into the domain type; malformed or missing locators still fail Zod validation before the domain validator runs.

The deterministic-frame Playwright test has been extended to inspect the exported WebM itself: in addition to decoding exactly 240 frames, it seeks to frames 0, 59, 60, 119, 120, 179, 180, and 239 and checks the disclosure band's rendered yellow text pixels at every sampled segment edge. Playwright test discovery/type transpilation succeeds. The browser test has not been executed in this turn because `127.0.0.1:5173` is unavailable and the app's normal startup launches queue consumers; avoiding that startup also avoids unintended background queue processing.

**Latest verification:** focused Vitest suites passed 25/25 (project contract, FilmCraft profile gate, draft artifact contract, and draft route); the new required-locator regression is included. `npm run check:fast` completed with 0 errors and 2 warnings in one file; Playwright `--list` found the updated browser test. Pixel-level browser assertions, authenticated database save/load, the render queue/worker, and the editor-to-FilmCraft export remain unproven. No task checkbox/status was changed; no live or scratch database, service, GPU, or canonical artifact was modified.

- **likely_cause:** The synthetic editor can save drafts through a guarded API in source, but the generic artifact schema is not admitted and the required browser runtime is stopped, leaving persistence and rendered-frame disclosure unverified.
- **evidence:** `sveltekit-frontend/src/lib/server/courtroom/courtroom-draft-artifacts-v1.ts`, `sveltekit-frontend/src/routes/api/courtroom/studio/draft/+server.ts`, `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, 24 passing focused tests, and the Svelte check summary.
- **patch_targets:** `sveltekit-frontend/src/lib/server/courtroom/courtroom-draft-artifacts-v1.ts`, `sveltekit-frontend/src/lib/server/courtroom/courtroom-draft-artifacts-v1.spec.ts`, `sveltekit-frontend/src/routes/api/courtroom/studio/draft/+server.ts`, `sveltekit-frontend/src/routes/api/courtroom/studio/draft/draft.route.spec.ts`, `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, and this report.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/server/courtroom sveltekit-frontend/src/routes/api/courtroom sveltekit-frontend/src/routes/\(app\)/demos/courtroom-studio sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`
- **smoke_command:** `cd sveltekit-frontend && PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-studio-deterministic-frame.spec.ts --config=playwright.config.ts --project=chromium` (run only when the app is available under a reviewed worker-safe startup configuration).
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.

## Phase 2 export-profile and owner audit follow-up — 2026-11-13

The bounded FilmCraft export adapter now requires the selected `bt709` SDR profile when an expected profile is provided. It rejects missing or mismatched matrix, primaries, or transfer metadata in addition to the existing codec, dimensions, frame rate, pixel aspect, duration, file-size, and checksum checks. This matches the FilmCraft 0.20.1 probe fields observed on the local scratch MP4. The adapter still cannot prove the complete decoded-frame count because FilmCraft's probe output does not expose it; the prior browser/CLI 240-frame receipt remains the separate fixture proof.

The same inspection confirmed there is no compatible existing canonical courtroom project/revision owner or render consumer: `analysis_jobs` requires `evidence_id` and has no render stage; the document Rabbit consumer is typed only for `document.parse`; `courtroom_keyframes` has no project/case/source-revision authority; and generic artifact transport DDL remains unregistered/unproven at runtime. The detailed owner findings are recorded in the earlier “Durable project and render-owner audit” section. No migrations, database writes, services, or GPU work were performed.

Focused validation after the export-profile change: FilmCraft adapter + courtroom project contract, **16 tests passed**; `npm run check:fast`, **0 errors / 0 warnings**. The Playwright render flow was not rerun in this checkpoint because the changed code is server-side profile validation only.

**Latest GAN status:** CREATED — synthetic project, deterministic renderer, FilmCraft adapter and report. WIRED — current editor captures to a scratch WebM; adapter invokes pinned local FilmCraft CLI when called. PROVEN — 240-frame browser/CLI synthetic export receipts and exact BT.709 profile validation; focused tests/type check pass. DONE — no; no persisted project owner, project approval/revision store, app-driven durable render job/consumer, authorized SeaweedFS export, independent artifact receipt readback, or recovery proof.

- **likely_cause:** The synthetic render is proven locally, but the repo lacks an admitted canonical project revision owner and a matching durable FilmCraft render consumer.
- **evidence:** `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.ts`, its 8-test suite, `sveltekit-frontend/src/lib/courtroom/courtroom-video-project-v1.ts`, `sveltekit-frontend/src/lib/server/analysis/analysis-jobs.ts`, `sveltekit-frontend/src/lib/server/queue/library-document-parse-consumer-v1.ts`, `sveltekit-frontend/src/lib/server/queue/commands.ts`, and the durable-owner audit section above.
- **patch_targets:** `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.ts`, `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.spec.ts`, and next the existing canonical artifact/project plus Rabbit render-task owners after their migration/readiness gates are resolved.
- **safe_next_command:** `rg -n "workflow_artifacts|workflow_action_leases|workflow_action_receipts|courtroom|render" sveltekit-frontend/src/lib/server/queue sveltekit-frontend/drizzle/manual sveltekit-frontend/drizzle/sidecar-migrations.json`
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/server/courtroom/filmcraft-cli-adapter-v1.spec.ts src/lib/courtroom/courtroom-video-project-v1.spec.ts`
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.

### Current studio frames to scratch H.264 export

The current Playwright test now saves the rendered preview to ignored scratch storage as `.tmp/courtroom-studio-browser-proof/current-studio-preview.webm`. The latest run passed 1/1 in 2.1 minutes and decoded all 240 requested project frames. Because scene rendering is slower than real time, this WebM lasts 23.175 seconds; it is only an interchange artifact, not the required output profile.

I used the pinned FilmCraft 0.20.1 CLI on a scratch copy of an existing local project: import the Svelte-generated WebM, replace the fixture clip, set its speed to 289.6875%, extend it to 240 frames, and export with `--gpu-rendering off --format h264 --no-audio`. The CLI reported 240 rendered frames and no offline media. Its probe reports H.264 High, 1280×720, 30/1 fps, square pixels, and exactly 8 seconds. The output is 4,777,445 bytes with SHA-256 `A19EE74D9C2191DDA71E4D03383F93BB9B96623BB38359DB2E450C0A3D084DB5`.

Independent Microsoft Edge headless verification read the MP4 metadata and successfully sought to 240 distinct positions from 0 through 239/30 seconds. Natural playback emitted 235 `requestVideoFrameCallback` notifications; this headless playback count is not used as the encoded frame-count proof because frames can be skipped by the presentation loop. FilmCraft's export receipt reports 240 frames, the output probe reports the exact target timing, and Edge's seek audit reached every target frame time.

The scratch receipt is `.tmp/courtroom-studio-browser-proof/current-studio-render-receipt.json`. This proves a CPU-rendered, current-studio-derived synthetic MP4 can be made locally. It does not wire the SvelteKit route to a durable job, persist the output to SeaweedFS, commit a PostgreSQL artifact receipt, or prove authorization, project revision approval, recovery, or real-evidence behavior. The project settings and retiming were assembled manually in a scratch FilmCraft project; they are not yet generated from the sealed project manifest by an application adapter.

**Latest Phase 2 status:** CREATED — deterministic Svelte scene and local FilmCraft output. WIRED — Playwright preview artifact → pinned FilmCraft CLI through scratch-only manual project preparation. PROVEN — 240-frame WebM decode, CLI H.264 240-frame/8-second export, media probe, SHA-256, and independent Edge seek audit. DONE — no; application-owned project materialization, durable worker/lease, source revision and authorization fences, immutable SeaweedFS artifact storage, PostgreSQL receipt, and crash/idempotency proof remain open.

- **likely_cause:** The Svelte editor can now yield deterministic scene frames, but the project/materialization and durable render worker handoff are still manual scratch steps.
- **evidence:** `.tmp/courtroom-studio-browser-proof/current-studio-preview.webm`, `.tmp/courtroom-studio-browser-proof/current-studio-retime.fcproj`, `.tmp/courtroom-studio-browser-proof/current-studio-render.mp4`, `.tmp/courtroom-studio-browser-proof/current-studio-render-receipt.json`, and the focused Playwright, FilmCraft CLI, and Edge checks above.
- **patch_targets:** `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, `sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts`, `sveltekit-frontend/tests/e2e/courtroom-studio-deterministic-frame.spec.ts`, and the reviewed durable render-task owner.
- **safe_next_command:** `rg -n "workflow_artifacts|workflow_action_leases|workflow_action_receipts|render|courtroom" sveltekit-frontend/src/lib/server/queue sveltekit-frontend/drizzle/manual sveltekit-frontend/drizzle/sidecar-migrations.json`.
- **smoke_command:** `cd sveltekit-frontend && PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-studio-deterministic-frame.spec.ts --config=playwright.config.ts --project=chromium`.
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.

## Phase 2 scratch artifact verification follow-up

Revisited the hidden scratch artifacts and verified `.tmp/courtroom-studio-browser-proof/parent-atlas-procedural-courtroom-8s.mp4` with both the local FilmCraft 0.20.1 `probe` command and an independent Microsoft Edge HTML video decode. Edge reached `ended` after 8 seconds and reported 1280×720 dimensions and 240 `requestVideoFrameCallback` presentations. FilmCraft reports H.264 High, 30/1 fps, square pixels, Rec.709, and an 8-second video track. The artifact SHA-256 is `0697D2B0C9BDE0698A83F2B2F8425A3655ADC47A9E8419D69E70FC07C85F5A16`.

The inspected FilmCraft v2/v3 projects use a 240-frame image-sequence clip whose four 60-frame blocks repeat one image each. The first and last source stills visibly carry the synthetic reconstruction disclosure. That earlier MP4 was a standalone synthetic still-sequence proof. A newer scratch-only MP4 now derives from the current Svelte studio's 240-frame WebM, but the route still has no direct FilmCraft export control, durable render job, or stored canonical artifact receipt. Do not describe this scratch file as a durable or case-evidence export.

The queue audit also found that the canonical workflow outbox accepts a finite task-type set and routes the existing document parser to its dedicated consumer; the generic outbox publisher is not itself a render worker. The analysis job queue remains evidence-bound and lacks a registered reconstruction handler. No current queue owner is yet proven suitable for a synthetic render task, so no command type, schema, or job row was added. The next implementation gate is to establish the intended render-task owner and pinned CLI invocation contract, then connect an authorized synthetic draft through that owner and verify its stored artifact independently.

**Current Phase 2 proof:** CREATED — a scratch-only four-still sequence and H.264 MP4 exist. WIRED — the FilmCraft CLI imports/renders/exports its own project; it is not wired to the Svelte studio or a durable Parent Atlas worker. PROVEN — the scratch MP4 is 8 seconds, 1280×720, 30/1 H.264 and Edge presented 240 frames through end-of-stream. DONE — no; no studio-generated MP4, frame-to-project provenance receipt, durable render worker, persistent artifact, or real-evidence authorization/review flow.

- **likely_cause:** The existing scratch MP4 is a standalone still-sequence export, while the Svelte studio's deterministic captures and the repository's durable task owners have no integration path between them.
- **evidence:** Scratch MP4 `.tmp/courtroom-studio-browser-proof/parent-atlas-procedural-courtroom-8s.mp4`; FilmCraft 0.20.1 CLI probe; Edge decode result (240 presented frames, 8 seconds, 1280×720); fixed 240-frame v2/v3 project sequence; `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`; `sveltekit-frontend/src/lib/server/queue/commands.ts`; `sveltekit-frontend/src/lib/server/queue/library-document-parse-consumer-v1.ts`.
- **patch_targets:** `sveltekit-frontend/src/routes/(app)/demos/courtroom-studio/+page.svelte`, the reviewed canonical render-task/worker owner once identified, and this report.
- **safe_next_command:** `rg -n "render|courtroom|worker|claim|lease|heartbeat|idempotency" sveltekit-frontend/src/lib/server/queue sveltekit-frontend/src/lib/server/workflows sveltekit-frontend/src/lib/server/analysis sveltekit-frontend/src/lib/server/db`.
- **smoke_command:** `cd sveltekit-frontend && PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-studio-deterministic-frame.spec.ts --reporter=line`.
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.

### Bounded FilmCraft adapter proof

Added `src/lib/server/courtroom/filmcraft-cli-adapter-v1.ts`. It launches a caller-pinned CLI with `shell: false`, enforces a 1-second to 15-minute timeout and AbortSignal cancellation, caps captured process output, requires a non-empty output file, runs the CLI's independent `probe`, checks H.264/dimensions/frame rate/square pixels/exact duration when an expected profile is supplied, compares probed file size to filesystem stat, and streams a SHA-256 receipt. The module explicitly does not provide queueing, authorization, source-revision admission, or artifact persistence; those remain worker responsibilities.

The focused Vitest run passed 14/14 across the project contract and adapter profile gate. I then invoked the adapter against the already-pinned local FilmCraft 0.20.1 portable CLI and the existing synthetic v3 project, writing only a new `.tmp/courtroom-studio-browser-proof/adapter-output-20261113.mp4`. The CLI export/probe returned H.264 High, 1280×720, 30/1, square pixels, exactly 8 seconds, 1,247,538 bytes, SHA-256 `0697d2b0c9bde0698a83f2b2f8425a3655adc47a9e8419d69e70fc07c85f5a16`. This output hash matches the previously Edge-decoded scratch artifact. It remains a four-held-image sequence; it does not contain the current Svelte editor's procedural frame captures.

**Adapter status:** CREATED — bounded server CLI adapter and profile tests. WIRED — adapter → pinned local CLI → scratch MP4 and probe → hash receipt. PROVEN — 14 focused tests and one real local CLI export with independent probe/profile/size/hash checks. DONE — no; the editor, durable job/lease, authorization gate, SeaweedFS persistence, canonical receipt write, and editor-generated frame sequence remain disconnected.

The current `npm run check:fast` also completes with **0 errors and 0 warnings**. The focused Vitest command passes 14 tests / 2 files. The latest browser test now also exports and decodes the 240-frame preview; the separate FilmCraft MP4 proof below uses that same scratch WebM.

- **likely_cause:** The renderer can now be called safely from a qualified worker, but the repository still has no admitted render task/consumer connecting editor drafts to that adapter.
- **evidence:** `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.ts`, its focused spec, and the scratch CLI receipt above.
- **patch_targets:** `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.ts`, `sveltekit-frontend/src/lib/server/courtroom/filmcraft-cli-adapter-v1.spec.ts`, the reviewed canonical render-task/worker owner, and this report.
- **safe_next_command:** `rg -n "workflow_tasks|lease|fencing|idempotency|artifact-work|render" sveltekit-frontend/src/lib/server/queue sveltekit-frontend/src/lib/server/workflows sveltekit-frontend/src/lib/server/db`
- **smoke_command:** `cd sveltekit-frontend && npx vitest run src/lib/server/courtroom/filmcraft-cli-adapter-v1.spec.ts src/lib/courtroom/courtroom-video-project-v1.spec.ts`
- **report_path:** `docs/reports/courtroom-reconstruction-v1-gap-map-20261113.md`.
