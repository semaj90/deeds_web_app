# Crime Scene Reconstruction — Top 100 Quick-Hit Tasks

- **Source**: `openspec/changes/crime-scene-reconstruction/tasks.md`
- **Census**: 348 total (69 Done, 61 Partial, 218 Open)
- **Ranked Candidates**: 279 actionable (`PARTIAL` + `OPEN`) -> Top 100 listed below

## Quick-Hit Ranking System (0–100 Points)

| Dimension | Max Points | Scoring Criteria |
| :--- | :---: | :--- |
| **1. Readiness / Existing Foundation** | 30 | `[~]` Partial already exists (+22); references concrete `.ts`/`.svelte`/`.spec.ts`/`.sql` file (+8) |
| **2. Critical-Path Leverage** | 25 | P0 / `SCENE-01..08` / `CASE-SCENE-E2E-10` (+25); `ENG-*`/`MEM-*`/`CASE-SCENE-*` (+18); auth/DB/Playwright (+15) |
| **3. Low Infra Friction** | 20 | Base 16; +4 for local TS/Vitest/Three.js/Playwright; -4 for FFmpeg/depth workers; -12 for CUDA/cuVS/Dawn/QLoRA/AVX-512 |
| **4. Narrow Scope** | 15 | Base 10; +3 concise single-unit task (<220 chars); -4 broad (>500 chars); -3 full multi-service E2E |
| **5. Verification Clarity** | 10 | Base 2; +8 explicit `Test:`/`Acceptance:`/`Assert`/`Playwright`; +4 `check`/`validate`/`proof` |

## Top 100 Quick-Hit List

| Rank | Score | Status | Line | Task ID | Summary |
| :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | **95.61** | PARTIAL | L859 | `CASE-SCENE-LIVE-04` | CASE-SCENE-LIVE-04 · Activity-aware memory and LOD · CREATED and WIRED (partial). The case Three.js runtime now consumes the existing Mor... |
| 2 | **95.16** | PARTIAL | L40 | `SCENE-20` | SCENE-20 Primitive vocabulary and composition: reuse `scene-primitive-registry-v1.ts`, `scene-prefab-registry-v1.ts`, and the proposed 50... |
| 3 | **94.66** | PARTIAL | L857 | `CASE-SCENE-LIVE-03-` | CASE-SCENE-LIVE-03-video-clock · CREATED and WIRED, worktree base `4ae8253ab6e`. The scene preview can follow the selected lane's revisio... |
| 4 | **94.55** | PARTIAL | L860 | `CASE-SCENE-LIVE-05` | CASE-SCENE-LIVE-05 · Memory and performance modal · CREATED and WIRED (partial). The scene preview dialog samples at 750 ms while open. I... |
| 5 | **93.86** | PARTIAL | L846 | `CASE-SCENE-LIVE-01` | CASE-SCENE-LIVE-01 · Assistant chat and editable proposals · CREATED and WIRED (partial). The case scene builder now sends an explicit us... |
| 6 | **91.52** | PARTIAL | L874 | `CASE-SCENE-E2E-11-` | CASE-SCENE-E2E-11-character-v2-alignment · CREATED and WIRED (partial, 2026-11-20). Reconciled the Parent Atlas Character Creator v2 refe... |
| 7 | **89.95** | PARTIAL | L816 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-5-edit-reopened CREATED and WIRED at worktree base `4ae8253ab6e`: reopening an editor-compatible draft restores its en... |
| 8 | **88.82** | PARTIAL | L852 | `CASE-SCENE-LIVE-01-` | CASE-SCENE-LIVE-01-selection-inspector · CREATED, WIRED, and synthetic-browser-proven (partial, 2026-11-20). Selecting a scene object now... |
| 9 | **88.8** | PARTIAL | L853 | `CASE-SCENE-LIVE-01-` | CASE-SCENE-LIVE-01-overlapping-cue-conflicts · CREATED, WIRED, and synthetic-browser-proven (partial, 2026-11-20). Runtime evaluation det... |
| 10 | **87.94** | PARTIAL | L817 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-5-reviewed-video CREATED and WIRED at worktree base `4ae8253ab6e`: the case builder imports approved events from selec... |
| 11 | **87.94** | PARTIAL | L818 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-5-procedural-draft CREATED and WIRED at worktree base `4ae8253ab6e`: save and reopen the illustrative plan and event/t... |
| 12 | **86.74** | PARTIAL | L855 | `CASE-SCENE-LIVE-02-` | CASE-SCENE-LIVE-02-preview · CREATED and WIRED (partial). The case builder shows evidence and plan preparation stages, aborts both fetch ... |
| 13 | **86.29** | PARTIAL | L865 | `CASE-SCENE-LIVE-08` | CASE-SCENE-LIVE-08 · Searchable scene recipe catalog · CREATED and WIRED (partial). Added a deterministic local search index over the exi... |
| 14 | **85.68** | PARTIAL | L870 | `CASE-SCENE-E2E-09-` | CASE-SCENE-E2E-09-report · CREATED and WIRED (partial, 2026-11-20). Added `scene-revision-report-v1.ts` and an authorized `GET /api/cases... |
| 15 | **85.2** | PARTIAL | L872 | `CASE-SCENE-E2E-10-` | CASE-SCENE-E2E-10-blockout-staging Playwright scenario authored for an evidence-free cue and object annotation. It compares the save rece... |
| 16 | **82.84** | PARTIAL | L851 | `CASE-SCENE-LIVE-01-` | CASE-SCENE-LIVE-01-event-targets · CREATED and WIRED (partial). Editable event cues now accept one primary and up to 63 additional actor/... |
| 17 | **80.95** | PARTIAL | L794 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-staging-evidence-proof The companion Playwright scenario imports a preapproved event from an authorized staging vide... |
| 18 | **80.91** | PARTIAL | L834 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-chapter-entry The case page can open a saved illustrative scene with reviewed contours even if it has no procedural dr... |
| 19 | **79.95** | PARTIAL | L783 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-job-lifecycle Added PostgreSQL transaction functions for scoped job claim, completion and recovery. Completion checks ... |
| 20 | **79.95** | PARTIAL | L784 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-job-enqueue The internal enqueue service shares the case and evidence resolver with the read-only preview route. It re... |
| 21 | **79.95** | PARTIAL | L788 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-worker-entry The existing analysis worker tick can recover up to eight expired scene leases and dispatch one eligibl... |
| 22 | **79.95** | PARTIAL | L789 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-builder The case builder exposes an explicit queue action for the resolved proposal when generation jobs are enabled... |
| 23 | **79.95** | PARTIAL | L790 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-recipe-read The case jobs route can return the completed recipe after current case/source/review and scene-revision ... |
| 24 | **79.95** | PARTIAL | L801 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-plan-actions Preserve optional visibility, movement, and timed-light presentation actions from the typed generation ... |
| 25 | **79.95** | PARTIAL | L804 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-camera Add an optional preset camera cue on the same source-clock interval as the existing object action. The scene ... |
| 26 | **79.95** | PARTIAL | L806 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-lane-playback The case preview can play the entire selected clock lane through gaps and overlapping cues, stop at th... |
| 27 | **79.9** | PARTIAL | L835 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-contour-notes Reviewers can add notes directly to a selected source-pixel contour without authoring a timed event. The... |
| 28 | **78.95** | PARTIAL | L799 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-2-runtime-recipe-consumer Add a browser-side Three.js consumer for the validated runtime recipe. `createSceneRuntimeTh... |
| 29 | **78.95** | PARTIAL | L809 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-curfew-fixture Add a separate fictional curfew/beach event fixture: the stated 22:00 curfew is unverified jurisdicti... |
| 30 | **78.95** | PARTIAL | L810 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-curfew-fixture Add a separate fictional curfew/beach event fixture: the stated 22:00 curfew is unverified jurisdicti... |
| 31 | **77.95** | PARTIAL | L770 | `CASE-SCENE-E2E-01C` | CASE-SCENE-E2E-01C Typed East Quay Scene Bridge + Case Workspace Readback: port fixture helpers to TypeScript; render a synthetic actor a... |
| 32 | **76.95** | PARTIAL | L793 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-staging-proof Playwright defines an opt-in staging round trip for an evidence-free job. It queues through the case b... |
| 33 | **75.95** | PARTIAL | L779 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-4 Durable job contract · schema candidate created, runtime path gated, live operation unproven. The Drizzle/SQL owner ... |
| 34 | **75.95** | PARTIAL | L782 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5 Implement the worker/compiler adapter for admitted plans and immutable scene outputs. The worker now uses the existi... |
| 35 | **75.95** | PARTIAL | L786 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-dispatch The server runner connects one explicitly dispatched job to the lease owner and verified artifact compiler.... |
| 36 | **75.95** | PARTIAL | L787 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-completion The job owner now locks the claimed row and rechecks canonical inputs inside the serializable completion ... |
| 37 | **75.95** | PARTIAL | L791 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-cancel The case job panel can request cancellation for queued or running jobs. The API validates session identity an... |
| 38 | **75.95** | PARTIAL | L792 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-recover The case job panel reloads the session user's recent job from the case-scoped database owner and resumes sta... |
| 39 | **75.95** | PARTIAL | L805 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-captions The scene preview can display currently cited transcript excerpts at the playhead of a selected, approved v... |
| 40 | **75.95** | PARTIAL | L814 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-4-house-preview Wire the four-bedroom house into the existing case plan, runtime recipe and browser preview. The roofl... |
| 41 | **75.93** | PARTIAL | L830 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-reviewed-mask-preview Project accepted image-storyboard mask polygons into selectable Three.js image-plane meshes only... |
| 42 | **75.92** | PARTIAL | L833 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-scene-edit Save source-pixel contour edits as optional unreviewed derivatives in the existing procedural scene revisio... |
| 43 | **74.95** | PARTIAL | L808 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-case-preview-lanes Add source-lane selection, event selection, play/pause, and absolute-time scrubbing to the author... |
| 44 | **74.9** | OPEN | L25 | `SCENE-13` | SCENE-13 Metric marker sizing: after calibration, size markers in meters of the real object, not screen pixels. Screen-constant size appl... |
| 45 | **74.77** | PARTIAL | L854 | `CASE-SCENE-LIVE-02` | CASE-SCENE-LIVE-02 · Cancelable parameter and plan requests. Use the builder's async parameter → authorized plan path. Only start it on a... |
| 46 | **73.95** | PARTIAL | L773 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02a Preserve case-intake WHO/WHAT/WHEN/WHERE/WHY/HOW as versioned, explicitly unverified JSONB and prepare case-authorized... |
| 47 | **73.95** | PARTIAL | L797 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-1-case-builder-preview Add an explicit builder to the authorized crime-scene case page with blockout-first/evidence-fi... |
| 48 | **73.95** | PARTIAL | L811 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-cue-manifest Add backward-compatible event cues to saved scene revisions so actor/prop targets, source-clock lanes, ... |
| 49 | **73.95** | PARTIAL | L812 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-dev Add a development-only cue panel to the synthetic scene manager preview. It edits a registered scene target, sou... |
| 50 | **72.95** | PARTIAL | L769 | `CASE-SCENE-E2E-01B` | CASE-SCENE-E2E-01B Verified mesh seed + five-scene fixture: separate fictional Morrow Bay `State v. Unidentified Participants` from East ... |
| 51 | **72.74** | PARTIAL | L177 | `TASK-L177` | 14.6 COCO-17 index visualization and source frame: the supplied pose reference uses the same 0–16 joint order as `humanCoco17PoseSchemaV1... |
| 52 | **71.95** | PARTIAL | L777 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-2 Resolve plan refs through case access, current scene revision, current evidence-row SHA-256, latest accepted Storybo... |
| 53 | **71.95** | PARTIAL | L785 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02b-5-seaweed The worker has a SeaweedFS entry point using the configured derived-artifact bucket, a conditional object wr... |
| 54 | **71.95** | PARTIAL | L803 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-prop-rotation Add illustrative rotation around a registered prop's local vertical pivot with an angle bounded to ±18... |
| 55 | **71.93** | PARTIAL | L831 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-local-vertex-editor The existing scene preview loads the original image through the case-authorized download route pin... |
| 56 | **71.92** | PARTIAL | L832 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c-recipe-contract Extend the existing browser-safe scene-object recipe with optional source-pixel coordinate space, imag... |
| 57 | **71.89** | PARTIAL | L838 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06e-instanced-preview Wire camera-driven 32 m residency into the browser demo; render deterministic urban building/vehicle... |
| 58 | **70.59** | PARTIAL | L877 | `CASE-SCENE-E2E-13` | CASE-SCENE-E2E-13 Optional GOAP what-if simulation: keep source-backed/reviewed case events separate from simulated actions. Define a ren... |
| 59 | **68.95** | PARTIAL | L765 | `CASE-SCENE-E2E-01` | CASE-SCENE-E2E-01 Admit the synthetic seed through an explicit fixture/demo path. Map case, scene, participant, evidence, interview, even... |
| 60 | **68.52** | OPEN | L15 | `SCENE-06` | SCENE-06 Artifact and activation gate: register immutable derived assets, case association, source revisions, scene revision, rights/mode... |
| 61 | **68.04** | PARTIAL | L224 | `TASK-L224` | 15.D1 PARTIAL: `src/lib/splat/one-bone-rigid-skin-validator-v1.ts` (per-vertex rigid influence: one bone, weight 1, no blending; bone ind... |
| 62 | **67.95** | PARTIAL | L807 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-pulse-readback The case builder restores a procedural draft's pulse color, intensity range, and period when editing ... |
| 63 | **67.56** | OPEN | L411 | `SWEEP-RESUME-03` | SWEEP-RESUME-03 Restart: `cd sveltekit-frontend && ROUTE_SWEEP=1 npx playwright test tests/e2e/route-sweep.spec.ts`. Needs the dev server... |
| 64 | **65.52** | OPEN | L17 | `SCENE-08` | SCENE-08 Verification: an isolated worker/browser run proves authorized upload → explicit Set the scene → durable job/progress/failure → ... |
| 65 | **64.7** | OPEN | L856 | `CASE-SCENE-LIVE-03` | CASE-SCENE-LIVE-03 · Video-first editing. Use the selected video's source-local presentation time as the lane playhead. Keep evidence, re... |
| 66 | **63.34** | OPEN | L10 | `SCENE-01` | SCENE-01 Explicit case action: add Set the scene to the authorized evidence board. The user selects evidence for the scene; the action is... |
| 67 | **61.46** | OPEN | L871 | `CASE-SCENE-E2E-10` | CASE-SCENE-E2E-10 Prove the authorized browser round trip on the fictional fixture: choose case and path, add/select evidence, review one... |
| 68 | **61.1** | OPEN | L24 | `SCENE-12` | SCENE-12 Splat calibration receipt (Lane E): an SPZ has no real-world units. Solve a similarity transform (uniform scale, yaw about Y, tr... |
| 69 | **60.99** | OPEN | L38 | `SCENE-18` | SCENE-18 PARTIAL (2026-11-16): deterministic selector implemented in `sveltekit-frontend/src/lib/server/scene/clip-window-v1.ts` (policy ... |
| 70 | **60.95** | OPEN | L815 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-5 Complete revisioned save/reopen through existing authorized scene/asset owners and prove in Playwright from a fresh ... |
| 71 | **60.39** | OPEN | L20 | `SCENE-01` | SCENE-01 follow-up (2026-11-19): uploads initiated from the case board now refresh the exhibit list but preserve the current board view. ... |
| 72 | **60.39** | OPEN | L863 | `CASE-SCENE-LIVE-07` | CASE-SCENE-LIVE-07 · Browser and persistence proof. In a signed-in staging case, stream a proposal while scrubbing, apply only selected f... |
| 73 | **60.31** | OPEN | L16 | `SCENE-07` | SCENE-07 Evidence interaction and failure behavior: support dragging/placing case evidence cards on scene markers with evidence ID and im... |
| 74 | **59.59** | PARTIAL | L97 | `AUD-07` | AUD-07 CORRECTED 2026-11-16: a production crime-scene page exists at `src/routes/(app)/cases/[id]/crime-scene/`. Its server load reads `s... |
| 75 | **59.13** | OPEN | L37 | `SCENE-17` | SCENE-17 PARTIAL (2026-11-16): schema, validator and canonical SHA-256 implemented in `sveltekit-frontend/src/lib/server/scene/scene-inte... |
| 76 | **58.95** | OPEN | L500 | `CASE-01` | CASE-01 Inventory the existing case, statute, canonical-document, and legal-PDF owners before adding indexes or tables. Verify current Po... |
| 77 | **58.6** | OPEN | L26 | `SCENE-14` | SCENE-14 Lane C mesh master and FBX checklist: keep a Blender master file as the source of truth. Before any FBX export, record unit scal... |
| 78 | **58.29** | OPEN | L192 | `TASK-L192` | 14.11 Text-grounded person-role proposals use the existing `python/atlas_role_evidence_v1.py` and `python/atlas_keyframe_analysis_v1.py` ... |
| 79 | **58.0** | OPEN | L21 | `SCENE-09` | SCENE-09 Typed 3D asset loading: qualify the viewer's GLB/glTF mesh path, FBX/OBJ import or normalization path, and SPZ Gaussian-splat pa... |
| 80 | **57.84** | OPEN | L95 | `AUD-05` | AUD-05 API gaps for the set-the-scene flow: a case-scoped `/api/cases/[id]/scene-reconstruction/jobs` route now provides POST admission, ... |
| 81 | **57.17** | OPEN | L866 | `CASE-SCENE-E2E-07` | CASE-SCENE-E2E-07 Persist a derived mesh/GLB through the existing case-scoped asset registry and scene-revision writer. PostgreSQL assign... |
| 82 | **56.47** | OPEN | L861 | `CASE-SCENE-LIVE-06` | CASE-SCENE-LIVE-06 · SvelteKit boundaries and acceleration. SSR loads authorized case and revision metadata and the shell. Mount Three.js... |
| 83 | **55.99** | OPEN | L72 | `VR-08` | VR-08 Investigator review gate: nothing moves into the scene-revision authority without an explicit reviewer action. Reuse the source-bou... |
| 84 | **55.95** | OPEN | L802 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-3-multitrack Add a declarative, deterministic multi-track event presentation model for actor motion, props/environment... |
| 85 | **55.76** | OPEN | L11 | `SCENE-02` | SCENE-02 Durable job lifecycle: distinguish bounded read-only plan/preview requests from work that is actually queued. The parameter and ... |
| 86 | **54.59** | OPEN | L566 | `PRX-05` | PRX-05 Test: an OBJ and an FBX each convert to GLB with the hash recorded and the budget checked. The original file is never modified. |
| 87 | **54.59** | OPEN | L716 | `MEM-07` | MEM-07 Acceptance Test: Multi-Scene Shared Texture & Persistence Gate: |
| 88 | **54.39** | OPEN | L191 | `TASK-L191` | 14.10 Persistent local depth worker added at `python/atlas_depth_anything_worker_v1.py`: loads only the pinned snapshot once per process,... |
| 89 | **54.33** | OPEN | L45 | `SCENE-21` | SCENE-21 Evidence placement: markers and drag-and-drop evidence cards (SCENE-07, SCENE-11) create `evidenceAnchors`. An anchor is `measur... |
| 90 | **54.1** | OPEN | L482 | `SYN-07` | SYN-07 Adversarial cases: off-screen event, occluded actor, similar-looking background motion, conflicting scripted labels, timestamp dri... |
| 91 | **53.95** | OPEN | L796 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c-1 Build the case-bound HTML5 workspace shell with explicit blockout-first/evidence-first entry, authorized SSR metadat... |
| 92 | **53.88** | OPEN | L839 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06d Choose and implement canonical persistence for editable recipes using existing scene revision ownership, including sta... |
| 93 | **53.68** | OPEN | L365 | `TASK-L365` | Add a reviewed motion/event path and note editor in the workspace backed by the existing case revision owner. Keep source-pixel paths and... |
| 94 | **53.26** | OPEN | L36 | `SCENE-16` | SCENE-16 Beat extraction (who/what/why/how): derive beats from the authorized timeline (`timeline-reconstruction-bridge.ts`, which alread... |
| 95 | **52.99** | OPEN | L14 | `SCENE-05` | SCENE-05 Streamed asset derivation: for a rights-qualified splat admitted to streaming, run pinned SplatTransform steps separately to pro... |
| 96 | **52.95** | OPEN | L775 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-02c Deliver the complete browser-based HTML5 reconstruction experience in the existing SvelteKit + Three.js scene: populat... |
| 97 | **52.93** | OPEN | L829 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06c Wire polygon mesh selection and vertex editing into the existing Detective Mode scene, with explicit image-plane/uncal... |
| 98 | **52.89** | OPEN | L590 | `STORYBOOK-04` | STORYBOOK-04 Build a chapter from a reviewed interval or storyboard revision and persist the exact observation citations through the scen... |
| 99 | **52.87** | OPEN | L840 | `CASE-SCENE-E2E-` | CASE-SCENE-E2E-06e Connect tile/Morton/LOD helpers to the existing scene residency/render path with bounded load, grace-period unload, an... |
| 100 | **52.65** | OPEN | L73 | `VR-09` | VR-09 Database: the draft adds five new tables (`video_reconstruction_runs`, `_tracks`, `_samples`, `_artifact_links`, `_scene_proposals`... |
