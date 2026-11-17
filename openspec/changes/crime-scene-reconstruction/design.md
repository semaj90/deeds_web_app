# Design: Crime-scene reconstruction

## Decisions

| ID | Decision | Status |
|---|---|---|
| DEC-A | Storyboard clip length is 20 s. The schema hard-codes it; a different length needs a new schema version. | Decided 2026-11-16 (operator) |
| DEC-B | First output is a 2D storyboard. Rendered frames and interactive 3D follow later. | Decided 2026-11-16 (operator) |
| DEC-C | Renderer for the 3D review editor: Three.js (plan) or Babylon (proposed split). | Open |
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
7. **Output:** each storyboard panel records source revisions, the SceneIntent SHA-256, render settings, and the label "Demonstrative reconstruction — not original footage".

## Tables and ownership

- Scene assets: `scene_assets`, `scene_asset_files` (declared in Drizzle; empty).
- Scene revisions and markers: `scene_markers`, `scene_document_revisions`, `scene_events`, `scene_event_outbox` (live; empty; not declared in Drizzle). Ownership is MAP-01, which must be settled before scene proposals are written.
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
| `POST /api/cases/[id]/scenes/jobs` | Create a scene job (SCENE-02) | Idempotent on `(case, evidence revisions, clipSeconds, seed)`. Body validated by Zod. Returns the existing job on replay. Writes gated. |
| `GET /api/cases/[id]/scenes/jobs/[jobId]` | Read job status and failure reason | Read only. Status vocabulary: queued, running, completed, failed, source_missing. |
| `GET /api/cases/[id]/scenes/[sceneKey]/proposals` | List proposals (SceneIntent plus provenance) | Read only. Returns proposals with `kind` and citations. |
| `POST /api/cases/[id]/scenes/[sceneKey]/proposals/[proposalId]/review` | Reviewer decision (REV-06, VR-14) | Server-side only. Checks case access, reviewer authority, the source revision and the expected scene revision, then writes an audit row. The client never sends the canonical state. Gated. |

Rules:
- Upload never creates a job. Only the explicit set-the-scene action does (SCENE-01).
- The planner runs in a worker, not in the request (SCENE-04). The request returns the job id.
- Every write goes through the existing scene-revision owner once MAP-01 is settled; no new scene table is created here.
- Routes are added only after the existing `[sceneKey]` and `[sceneId]` routes are checked for overlap.
