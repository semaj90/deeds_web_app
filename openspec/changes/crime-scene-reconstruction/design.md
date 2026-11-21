# Design: Crime-scene reconstruction

## Decisions

| ID | Decision | Status |
|---|---|---|
| DEC-A | Storyboard clip length is 20 s. The schema hard-codes it; a different length needs a new schema version. | Decided 2026-11-16 (operator) |
| DEC-B | The primary delivered scene is a browser-based, interactive HTML5 reconstruction experience in the existing SvelteKit app. A 2D storyboard remains an optional review/export view, not a prerequisite before interactive 3D. | Updated 2026-11-20 (operator direction) |
| DEC-C | Three.js is the primary browser renderer, using the existing scene and streaming owners. Unreal/Blender are optional authoring or native-export lanes; they are not required to build or run the web scene. | Decided 2026-11-20 (operator direction) |
| DEC-D | Pose format: COCO-17 (already in the repo) or MediaPipe / RTMPose. | Open |
| DEC-E | The 10 s pilot is a separate perception test, not a storyboard default. | Open (recommended) |
| DEC-F | Pose ownership: `evidence_pose_*` own pose analysis; reviewed authority stays in the evidence revision until a migration is designed. | Recorded (operator reply, read as acceptance) |

## Pipeline

1. **Gate:** verify the evidence ID, immutable source revision and SHA-256 before any work. Original bytes are never modified.
2. **Beats:** derive beats from the authorized timeline, transcript segments and summaries. Summaries are derived features; a beat that cites only a summary is marked hypothesis. The planner's output is validated against SceneIntent v1, and every uncited beat is rejected. Raw model output and rejected beats are kept for audit.
3. **Clip window:** a deterministic selector (policy `atlas.scene-clip-window.v1`) scores each 20 s window by transcript words and scene cuts, with earliest-start tie-break. For the 3D pilot, the selector is replaced by a rule that requires a visible person and usable camera geometry.
4. **Camera track:** keyframes `{t, position, lookAt, fov}` stored in the manifest. The renderer interpolates them; no runtime code chooses camera moves.
5. **Primitives:** `src/lib/splat/scene-primitive-registry-v1.ts` (box, sphere, cylinder, cone, torus, rectangle, circle, and the sword's polygon-prism parts). A courtroom kit is a parent/child tree with positions in meters. Each kit entry needs a measured or documented size before it is used as evidence.
6. **Anchors:** markers and evidence cards create anchors. An anchor is `measured` only when its source is a calibrated measurement; otherwise it is `hypothesis`. Placement never comes from FFT, cosine similarity, Hilbert transforms, PageRank or top-k ranking.
7. **Output:** the primary output is a revision-pinned browser scene and event timeline; optional storyboard panels record source revisions, the SceneIntent SHA-256, render settings, and the label "Demonstrative reconstruction — not original footage".

## Browser scene experience and event model

The user-facing reconstruction target is a complete, interactive HTML5 scene experience hosted by the existing SvelteKit application. It may feel game-like through navigation, selection, scene controls, timeline playback, and event-triggered presentation; it is still an evidence-review visualization, not a game that turns allegations into established facts. The deliverable includes a populated environment, reusable actors/props, navigation and inspection controls, an event/timeline interface, and deterministic replay from a saved scene revision. It must work through the procedural Three.js path without Blender, Unreal, Ollama, or an AI call.

Scene generation is driven by a versioned, reviewable plan built from the case intake, explicitly selected evidence, reviewed observations, and source-clock intervals. The plan distinguishes authored blockout parameters, source-backed observations, hypotheses, and unknowns. Every visual event carries its source ID, clock domain, source interval, uncertainty, evidence references, review status, and scene revision. Events only appear or animate on their own source-time lane until a reviewer accepts an explicit clock mapping; a cross-clock comparison must fail closed when no reviewed mapping exists. `why` remains unknown unless a reviewer accepts a cited hypothesis; no model or procedural rule may infer motive.

The browser renderer streams a populated city, beach, or other user-selected environment through bounded spatial cells. Repeated buildings, vegetation, and props use shared geometry and per-cell instancing; the existing 256-slot primitive manager remains for actively edited objects. Timed effects (for example, a bonfire) are visible only for the matching event/source interval. The active authored-scene budget is reported separately from GPU textures, render targets, original evidence, decoded media, and inference memory. Unreal executable packaging and Blender optimization are optional derived outputs, never dependencies of the HTML5 experience.

## Tables and ownership

- Scene assets: `scene_assets`, `scene_asset_files` (declared in Drizzle; empty).
- Scene revisions and markers: `scene_markers`, `scene_document_revisions`, `scene_events`, `scene_event_outbox` (live; empty; declared in Drizzle). Owners: `scene-document-revisions-v1.ts` and `scene-markers/` (MAP-01 corrected).
- Timeline input: `timeline_events` (read only).
- Pose: `evidence_pose_tracks`, `evidence_pose_observations` (draft, not applied).
- Reconstruction runs: `video_reconstruction_runs` (draft, not created). Live catalog recheck (VR-10) is required first.

## Constraints

- The LLM never renders. It emits SceneIntent JSON only; the existing deterministic compiler (src/lib/server/reconstruction/scene-compiler.ts) renders. Same input and seed give the same bytes.
- No GPU or 3D work runs in the upload request or on the Node main thread.
- GPU use stays under the VRAM rule (`:8090` holds about 6.2–6.7 GiB of the 8 GiB card).
- Renderer frame hashes are tested under SwiftShader in CI; hardware GPU is checked separately.

## Open verification

- SceneIntent emission through the planner route, and evidence-revision readback (SCENE-16/17 partial).
- Clip window: budget check against the selected model's token budget (SCENE-18).
- Renderer and frame-hash determinism (SCENE-24).
- Browser run of upload → set the scene → job → artifact → Detective Mode load (SCENE-08).

## API contract (AUD-05, proposed, no code)

Follows the existing scene routes under `src/routes/api/cases/[id]/scenes/`: the `{ success, data, message }` envelope, case access through `getAuthorizedCase` (`src/lib/server/case-access.ts`), and writes gated by `ENV.SCENE_PERSISTENCE_ENABLED`, which stays off until MAP-01 and the schema are admitted.

| Method and path | Purpose | Notes |
|---|---|---|
| `POST /api/cases/[id]/scenes/jobs` | Create work that must outlive the HTTP request (SCENE-02) | Idempotent on `(case, scene, expected revision, input kind, canonical input hash)`. `BLOCKOUT` has an empty source snapshot; `EVIDENCE_BACKED` requires exact source IDs/revisions/hashes. Never create an `analysis_jobs` row for an evidence-free blockout. Writes gated. |
| `GET /api/cases/[id]/scenes/jobs/[jobId]` | Read job status and failure reason | Case-authorized read only. Candidate status vocabulary: queued, running, completed, failed, canceled, source_missing, source_stale. |
| `GET /api/cases/[id]/scenes/[sceneKey]/proposals` | List proposals (SceneIntent plus provenance) | Read only. Returns proposals with `kind` and citations. |
| `POST /api/cases/[id]/scenes/[sceneKey]/proposals/[proposalId]/review` | Reviewer decision (REV-06, VR-14) | Server-side only. Checks case access, reviewer authority, the source revision and the expected scene revision, then writes an audit row. The client never sends the canonical state. Gated. |

Rules:
- Upload never creates a scene-generation job. Only an explicit user action can queue long-running work (SCENE-01).
- Bounded parameter preparation, deterministic plan validation, and interactive procedural preview may remain request/response; they must not claim durable job state. The current `/scene-reconstruction/parameters` and `/scene-reconstruction/plans` routes are read-only and do not create jobs.
- When work must continue after the request, persist orchestration in a case-and-scene-scoped `scene_generation_jobs` owner. Its input snapshot is explicitly `BLOCKOUT` with no evidence refs or `EVIDENCE_BACKED` with exact authorized source revisions/hashes. Do not use `analysis_jobs` as the scene aggregate; its `evidence_id` is required and it remains owned by source analysis.
- A scene job stores status, retries, idempotency, and references only. Final scene content continues through the existing `scene_document_revisions` writer; derived bytes continue through the existing scene asset registry. A job completion must not itself mean reviewed or saved.
- The planner/reconstruction worker runs outside the request for queued jobs (SCENE-04); the create response returns the durable job ID. RabbitMQ is only a wake-up transport, not job state.
- Candidate-only `scene_generation_jobs_v1.sql` and matching Drizzle declarations now define the job/state-event contract. They have not been rehearsed or applied; no route, writer, or worker exists. Admit through the existing database migration and feature-gate process before enabling writes.
- Routes are added only after the existing `[sceneKey]` and `[sceneId]` routes are checked for overlap.

## Uploaded-image storybook to scene workflow

The reference images illustrate separate capabilities (palette-indexed textures, dense detector/segmentation overlays, character UV/rigging, an exhibit/storyboard interface, and multi-view image reconstruction). They are design references, not evidence of Parent Atlas behavior or requirements to reproduce another product. One image and one detector pass cannot promise an exhaustive object inventory or a measured 3D reconstruction.

1. **Admit source.** Preserve the uploaded bytes and exact SHA-256 as canonical evidence. Read image dimensions/orientation and any capture metadata from original bytes. Derived crops, thumbnails, OCR inputs, masks, and depth maps get their own hashes and source-to-derivative transform; never overwrite or re-identify the original.
2. **Run bounded image analyses.** YOLOX proposes boxes/labels; SAM 2 proposes masks linked to their originating detections; the image-caption/VLM lane proposes scene context separately; OCR proposes text spans; monocular depth proposes relative depth only. Record per-stage model/revision, parameters, status, examined extent, omitted/failed items, and source revision in the observation/coverage manifest. A failed or unrun stage is not a negative finding.
3. **Review observations.** Show source image beside overlays, confidence and model, detection/mask links, context, OCR, and unknown/unreviewed regions. Let the reviewer correct labels, mark an area unknown or no-object-observed, or reject a proposal. Keep identity, legal role, event, causality, and crime/location conclusions out of visual prominence heuristics.
4. **Prepare grounded text.** 8095 NLP can extract entities/roles from OCR, transcript, or reviewer text with exact spans; it is not an image detector. For legal research, retrieve statutes/cases through the existing canonical search/ACE pathway, assemble and validate an admitted ContextManifest, and cite exact authority spans. If context admission, source revisions, jurisdiction, or citations are missing, return an unavailable/needs-review state. Do not send raw MCP/Qdrant hits to the model and do not present retrieval or generated text as a legal conclusion.
5. **Draft the storybook.** Build a bounded SceneIntent/story proposal from exact admitted observation IDs plus any separately admitted OCR/transcript/legal citations. Every beat labels whether it is a source observation, model hypothesis, reviewer statement, or legal research note. Zod validates shape; server-side source/revision, case membership, artifact, and citation checks establish admissibility. Reviewer edits/decisions remain explicit and append-only.
6. **Compile scene cells.** Keep detected boxes/marks in original-image pixel coordinates first. Render reviewed observations as selectable image-space cells/markers. A relative-depth relief is a separately labeled 2.5D estimate. Shared ground/world coordinates require accepted calibration and an explicit reviewed transform. Independent images stay in independent frames until a qualified multi-view alignment exists. Only then derive primitive/mesh or Gaussian-splat scene assets, each with source, transform, model/tool, hash, and review provenance.
7. **Persist and stream.** PostgreSQL owns evidence identity, analysis/review revisions, chapter/scene manifests, and scene objects. SeaweedFS stores larger immutable images, masks, depth, mesh, and splat artifacts. Redis/Valkey holds bounded progress/cache descriptors keyed by source and revision; it is not authoritative. The browser receives bounded JSON metadata and authorized binary artifact URLs, never base64-encoded large image/tensor/mesh payloads. SSR renders the dossier shell; Three.js/WebGL2 displays the scene; BVH handles scene picking/collision queries, not semantic search.
8. **Optimize only the measured bottleneck.** Reuse the existing 4bpp indexed-palette codec and tile cache for retro textures when their visual fidelity is acceptable. LUT entries represent palette colors, not scene labels or a scene database. Use bounded workers/transferable typed arrays for CPU work that blocks the UI. Keep YOLOX/SAM 2/depth GPU jobs under the existing VRAM scheduler. N-API/WASM/SIMD, BVH variants, and extra codecs require parity tests and representative profiling before adoption; a hex editor is a debugging tool for binary formats, not a runtime pipeline stage.

The current implementation reaches the saved, source-bound 2D image chapter. It does not yet provide a complete editable per-image label review, accepted legal ContextManifest/DAG integration, or cross-image 3D alignment. Those are separate gates below; do not label the whole pipeline complete because one chapter round-trips.
