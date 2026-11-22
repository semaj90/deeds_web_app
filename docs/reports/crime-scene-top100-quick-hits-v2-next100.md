# Crime Scene Reconstruction — Quick-Hit Ranks 101–200 (v2)

- **Source**: `openspec/changes/crime-scene-reconstruction/tasks.md` (re-scored by script, same rubric as v1)
- **Candidates scored**: 277 actionable lines (`[ ]` / `[~]`, DONE items excluded)
- **Key**: `change#Lnn` (line-anchored; bare IDs are ambiguous across changes)
- **Scope/clarity**: estimated from the full line text. Sub-tasks written as one long line score lower.
- **Approval flag**: line text mentions approval, live write, human-only, operator, decision, migration or schema. These need a gate before work starts; they are not quick hits until cleared.

## Ranks 101–200

| Rank | Score | Status | Key | ID | Approval | R/L/F/S/C | Summary |
| :---: | :---: | :---: | :--- | :--- | :---: | :---: | :--- |
| 101 | **61** | OPEN | crime-scene-reconstruction#L14 | `SCENE-05` |  | 8/25/16/6/6 | SCENE-05 Streamed asset derivation: for a rights-qualified splat admitted to streaming, run pinned SplatTransf… |
| 102 | **57** | OPEN | crime-scene-reconstruction#L13 | `SCENE-04` |  | 8/25/16/6/2 | SCENE-04 Reconstruction handoff: use the existing reconstruction lane (`timeline-reconstruction-bridge.ts`, `:… |
| 103 | **54** | OPEN | crime-scene-reconstruction#L775 | `CASE-SCENE-E2E-02c` |  | 8/18/20/6/2 | CASE-SCENE-E2E-02c Deliver the complete browser-based HTML5 reconstruction experience in the existing SvelteKi… |
| 104 | **49** | OPEN | crime-scene-reconstruction#L12 | `SCENE-03` |  | 0/25/12/6/6 | SCENE-03 Qualified inputs: verify exact source bucket/key, readback, SHA-256, source revision, admission/right… |
| 105 | **49** | OPEN | crime-scene-reconstruction#L674 | `ENG-05` |  | 0/18/16/13/2 | ENG-05 Parent Atlas Memory Engine (6-Tier Byte-Budgeted Residency & Shared Asset Manager):… |
| 106 | **49** | OPEN | crime-scene-reconstruction#L701 | `MEM-03` |  | 0/18/16/13/2 | MEM-03 Web Worker Decoding & Transferable Texture Streaming:… |
| 107 | **49** | OPEN | crime-scene-reconstruction#L747 | `ENG-09` |  | 0/18/16/13/2 | ENG-09 Asset Provenance & Retro Palette Verification:… |
| 108 | **49** | OPEN | crime-scene-reconstruction#L829 | `CASE-SCENE-E2E-06c` |  | 0/18/16/13/2 | CASE-SCENE-E2E-06c Wire polygon mesh selection and vertex editing into the existing Detective Mode scene, with… |
| 109 | **49** | OPEN | crime-scene-reconstruction#L840 | `CASE-SCENE-E2E-06e` |  | 0/18/16/13/2 | CASE-SCENE-E2E-06e Connect tile/Morton/LOD helpers to the existing scene residency/render path with bounded lo… |
| 110 | **48** | OPEN | crime-scene-reconstruction#L71 | `VR-07` |  | 8/5/20/13/2 | VR-07 Proposed GLB and scene manifest: write a GLB proposal and a manifest that cites the source revision, sam… |
| 111 | **48** | OPEN | crime-scene-reconstruction#L521 | `RND-06` |  | 8/5/20/13/2 | RND-06 Three.js viewer test: load the rendered scene's GLB, place placeholders from the observations, and veri… |
| 112 | **48** | OPEN | crime-scene-reconstruction#L529 | `SHOT-03` |  | 8/5/20/13/2 | SHOT-03 Cutscene modal: shot list from the CSV, play, pause, step to next shot, and a timeline scrubber. It us… |
| 113 | **48** | OPEN | crime-scene-reconstruction#L570 | `MAT-01` |  | 8/5/20/13/2 | MAT-01 Object transforms use 4x4 matrices (translation, rotation, scale) composed in one fixed order. Three.js… |
| 114 | **47** | OPEN | crime-scene-reconstruction#L582 | `STORYBOOK-01` |  | 0/15/16/10/6 | STORYBOOK-01 WIRED: the authorized Crime Scene page lists image and video exhibits as chapters. Video chapters… |
| 115 | **46** | OPEN | crime-scene-reconstruction#L118 | `MARK-05` |  | 0/15/16/13/2 | MARK-05 Verification: a real marker placed on a real image and on a real mesh must read back with its anchor f… |
| 116 | **46** | OPEN | crime-scene-reconstruction#L377 | `LOC-UI-01` | yes | 0/15/16/13/2 | LOC-UI-01 Add a case dossier location panel showing capture/text candidates separately from “Confirmed crime l… |
| 117 | **46** | OPEN | crime-scene-reconstruction#L400 | `REG-INST-02` | yes | 0/15/16/13/2 | REG-INST-02 Persisting instances into `scene_assets` metadata is a live database write and needs explicit appr… |
| 118 | **46** | OPEN | crime-scene-reconstruction#L505 | `CASE-06` |  | 0/15/16/13/2 | CASE-06 Enforce tenant/case authorization in both retrieval and readback. An unauthorized case or cross-tenant… |
| 119 | **46** | OPEN | crime-scene-reconstruction#L772 | `CASE-SCENE-E2E-02` |  | 0/18/16/10/2 | CASE-SCENE-E2E-02 Add the optional case-bound Scene Workspace entry after case selection. Offer “Build a block… |
| 120 | **46** | OPEN | crime-scene-reconstruction#L774 | `CASE-SCENE-E2E-02b` |  | 0/18/16/6/6 | CASE-SCENE-E2E-02b Upgrade parameter preparation into a versioned `SceneGenerationPlanV1` using only case-auth… |
| 121 | **46** | OPEN | crime-scene-reconstruction#L798 | `CASE-SCENE-E2E-02c-2` |  | 0/18/16/10/2 | CASE-SCENE-E2E-02c-2 Compile seeded city, beach, indoor, and custom recipes into a navigable populated world. … |
| 122 | **46** | OPEN | crime-scene-reconstruction#L813 | `CASE-SCENE-E2E-02c-4` |  | 0/18/16/10/2 | CASE-SCENE-E2E-02c-4 Add selection/inspection and authoring controls for actors, props, primitives, polygons, … |
| 123 | **46** | OPEN | crime-scene-reconstruction#L823 | `CASE-SCENE-E2E-03` |  | 0/18/16/10/2 | CASE-SCENE-E2E-03 Add a source timeline view that retains each camera, dispatch, alarm, and interview clock do… |
| 124 | **46** | OPEN | crime-scene-reconstruction#L824 | `CASE-SCENE-E2E-04` |  | 0/18/16/10/2 | CASE-SCENE-E2E-04 Connect the workspace to Evidence Board uploads and existing source-bound observations/revie… |
| 125 | **46** | OPEN | crime-scene-reconstruction#L825 | `CASE-SCENE-E2E-05` | yes | 0/18/16/10/2 | CASE-SCENE-E2E-05 Add a case-scoped actor registry for pseudonymous scene actors and visual placeholders. Pres… |
| 126 | **46** | OPEN | crime-scene-reconstruction#L826 | `CASE-SCENE-E2E-06` |  | 0/18/16/10/2 | CASE-SCENE-E2E-06 Complete the blockout edit path: create scene cells/primitives without evidence, then option… |
| 127 | **46** | OPEN | crime-scene-reconstruction#L867 | `CASE-SCENE-E2E-08` |  | 0/18/16/10/2 | CASE-SCENE-E2E-08 Add prosecutor/reviewer controls for claims and event proposals: accept, dispute, edit, or l… |
| 128 | **46** | OPEN | crime-scene-reconstruction#L868 | `CASE-SCENE-E2E-09` | yes | 0/18/16/10/2 | CASE-SCENE-E2E-09 Export a revision-pinned event report containing scene chapters, source-specific times and o… |
| 129 | **46** | OPEN | crime-scene-reconstruction#L873 | `CASE-SCENE-E2E-11` |  | 0/18/16/10/2 | CASE-SCENE-E2E-11 Add versioned animation indexing as an optional presentation capability after the saved bloc… |
| 130 | **45** | OPEN | crime-scene-reconstruction#L382 | `MAP-03` |  | 8/5/20/10/2 | MAP-03 Polygon and proxy helpers: extend the existing Three.js/TypeScript primitive and polygon owners first. … |
| 131 | **45** | OPEN | crime-scene-reconstruction#L388 | `MAP-06` |  | 8/5/20/10/2 | MAP-06 Renderer and rasterizer choice: keep Three.js/WebGL2 as the existing interactive renderer. Treat a CPU … |
| 132 | **44** | OPEN | crime-scene-reconstruction#L397 | `REG-DEQ-01` |  | 8/5/16/13/2 | REG-DEQ-01 Dequeue exists only in residency (`server/atlas/residency/residency-controller-v1.ts`) and packet b… |
| 133 | **44** | OPEN | crime-scene-reconstruction#L412 | `SWEEP-RESUME-04` |  | 8/5/16/13/2 | SWEEP-RESUME-04 Results to read when done: `.tmp/route-sweep/manifest.json` (HTTP status, page errors, console… |
| 134 | **44** | OPEN | crime-scene-reconstruction#L418 | `SWEEP-NEXT-02` |  | 8/5/16/13/2 | SWEEP-NEXT-02 When finished, read `.tmp/route-sweep/manifest.json` and record: visited count, HTTP status coun… |
| 135 | **44** | OPEN | crime-scene-reconstruction#L459 | `PARK-01` |  | 8/5/16/13/2 | PARK-01 Start with SWEEP-TRIAGE-01 (effect loop on the graph and cache-monitor routes). Reproduce in Chromium,… |
| 136 | **44** | OPEN | crime-scene-reconstruction#L480 | `SYN-05` |  | 0/5/16/13/10 | SYN-05 Acceptance: detections, masks, and keyframe selection compared with ground truth; false positives and m… |
| 137 | **44** | OPEN | crime-scene-reconstruction#L531 | `SHOT-05` |  | 0/5/16/13/10 | SHOT-05 Test: each shot renders both meshes at the CSV positions, and the modal steps through all shots withou… |
| 138 | **44** | OPEN | crime-scene-reconstruction#L540 | `PUP-06` |  | 0/5/16/13/10 | PUP-06 Test: proximity opens the modal, leaving closes it, a tip without a citation is not shown, and a marker… |
| 139 | **44** | OPEN | crime-scene-reconstruction#L548 | `DET-05` |  | 0/5/16/13/10 | DET-05 Test: load a scene revision, select an object, open its cutscene from a marker, and confirm no evidence… |
| 140 | **44** | OPEN | crime-scene-reconstruction#L558 | `POP-07` |  | 0/5/16/13/10 | POP-07 Test: a shot that exceeds the object or triangle budget hides the expected objects and records which on… |
| 141 | **43** | OPEN | crime-scene-reconstruction#L126 | `TRANSCRIPT-UI-01` |  | 0/15/16/6/6 | TRANSCRIPT-UI-01 (2026-11-18) The transcript panel polls the authorized transcript read route with bounded bac… |
| 142 | **43** | OPEN | crime-scene-reconstruction#L392 | `MAP-10` |  | 0/15/16/10/2 | MAP-10 Verification gates: add focused fixtures for deterministic polygon output, transform round-trip, malfor… |
| 143 | **43** | OPEN | crime-scene-reconstruction#L487 | `RLM-01` |  | 0/15/16/10/2 | RLM-01 Define one versioned, bounded JSON prompt/output contract over authorized, revision-bound observations.… |
| 144 | **43** | OPEN | crime-scene-reconstruction#L501 | `CASE-02` |  | 0/15/16/10/2 | CASE-02 Build retrieval from authorized case facts and the existing indexed case/law corpus. Filter by access … |
| 145 | **43** | OPEN | crime-scene-reconstruction#L595 | `STORYBOOK-05` | yes | 0/15/16/10/2 | STORYBOOK-05 Still-image review: allow review of labels, masks, scene context, and source-bound OCR spans with… |
| 146 | **43** | OPEN | crime-scene-reconstruction#L600 | `STORYBOOK-06` |  | 0/15/16/10/2 | STORYBOOK-06 Legal analysis: connect storybook questions to the existing case/statute search and ACE context a… |
| 147 | **42** | OPEN | crime-scene-reconstruction#L800 | `CASE-SCENE-E2E-02c-3` |  | 0/18/16/6/2 | CASE-SCENE-E2E-02c-3 Implement the event runtime and timeline lanes. Select an event to focus its scene, actor… |
| 148 | **41** | OPEN | crime-scene-reconstruction#L83 | `DEC-D` | yes | 8/5/16/10/2 | DEC-D Pose model and keypoint format: COCO-17 is already defined in the repo (`pose-skeleton-schema-v1.ts`). T… |
| 149 | **41** | OPEN | crime-scene-reconstruction#L345 | `REG-OPT-05` | yes | 8/5/16/10/2 | REG-OPT-05 COCO: no COCO dataset is on disk. Repo references are the YOLOX COCO-class label set (`docker/docli… |
| 150 | **41** | OPEN | crime-scene-reconstruction#L449 | `SWEEP-TRIAGE-06` |  | 8/5/16/10/2 | SWEEP-TRIAGE-06 Cover the 38 parameterised routes with seeded IDs. Partly done 2026-11-18: read-only visit of … |
| 151 | **40** | OPEN | crime-scene-reconstruction#L182 | `14.2` | yes | 0/5/16/13/6 | 14.2 Choose and install a SAM 2 runtime and checkpoint (license and model-weight decision).… |
| 152 | **40** | OPEN | crime-scene-reconstruction#L349 | `REG-OPT-09` |  | 0/5/16/13/6 | REG-OPT-09 Browser proof of the crime page placeholder button and "Placeholder · not evidence" label is not do… |
| 153 | **40** | OPEN | crime-scene-reconstruction#L404 | `UX-TOOLBAR-03` |  | 0/5/16/13/6 | UX-TOOLBAR-03 Browser check of the new toolbar in Chromium, including keyboard focus order and the marker-mode… |
| 154 | **40** | OPEN | crime-scene-reconstruction#L463 | `PARK-05` |  | 0/5/16/13/6 | PARK-05 Nothing is committed. The working tree is dirty with work from several sessions; check `git status` be… |
| 155 | **40** | OPEN | crime-scene-reconstruction#L471 | `SYN-01` | yes | 0/5/16/13/6 | SYN-01 Write a cutscene CSV schema: start_ms, end_ms, actor, action, line, camera, prop. One row per shot. The… |
| 156 | **40** | OPEN | crime-scene-reconstruction#L520 | `RND-05` |  | 0/5/16/13/6 | RND-05 Alignment check: project a known 3D object into the frame and compare with its detected box. Record the… |
| 157 | **40** | OPEN | crime-scene-reconstruction#L522 | `RND-07` |  | 0/5/16/13/6 | RND-07 Multi-view splat (later): render from several known cameras, then check whether the 2.5D relief and a m… |
| 158 | **40** | OPEN | crime-scene-reconstruction#L537 | `PUP-03` |  | 0/5/16/13/6 | PUP-03 AI tips: the summary model may offer tips for the cutscene, but each tip must cite a fact ID from the s… |
| 159 | **40** | OPEN | crime-scene-reconstruction#L564 | `PRX-03` |  | 0/5/16/13/6 | PRX-03 Check the converted mesh against the POP-01 triangle budget. Over budget, simplify or reject, and recor… |
| 160 | **40** | OPEN | crime-scene-reconstruction#L618 | `ACE-EXEC-04` |  | 0/5/20/13/2 | ACE-EXEC-04 Run one registered CPU procedure with a TypeScript reference and measure parity before activating … |
| 161 | **39** | OPEN | crime-scene-reconstruction#L22 | `SCENE-10` |  | 0/15/16/6/2 | SCENE-10 Contextual Detective Mode assistant: add a compact chat composer that expands without replacing the v… |
| 162 | **39** | OPEN | crime-scene-reconstruction#L74 | `VR-10` | yes | 0/15/16/6/2 | VR-10 PARTIAL (read-only recount 2026-11-16, multi-line parser over `src/lib/server/db`, 224 files): 570 table… |
| 163 | **39** | OPEN | crime-scene-reconstruction#L389 | `MAP-07` |  | 0/15/16/6/2 | MAP-07 Transport and compute boundary: inspect current protobuf/gRPC, MessagePack, and Node-API owners before … |
| 164 | **37** | OPEN | crime-scene-reconstruction#L66 | `VR-03` |  | 8/5/16/6/2 | VR-03 Tracking: one stable track ID per person across frames. Partial: `src/lib/server/features/evidence/video… |
| 165 | **37** | OPEN | crime-scene-reconstruction#L75 | `VR-11` | yes | 0/5/16/10/6 | VR-11 Verification on investigator-reviewed case evidence. The normal signed-in workflow has synthetic scratch… |
| 166 | **37** | OPEN | crime-scene-reconstruction#L350 | `REG-OPT-10` |  | 0/5/16/10/6 | REG-OPT-10 Blender placeholder set via the Blender MCP recipe path is not generated. Memory was low (0.93 GB f… |
| 167 | **37** | OPEN | crime-scene-reconstruction#L391 | `MAP-09` |  | 0/5/16/10/6 | MAP-09 Cache and packed-budget proof: reuse the existing byte-budgeted LRU and 8 MiB packed-asset accounting. … |
| 168 | **37** | OPEN | crime-scene-reconstruction#L448 | `SWEEP-TRIAGE-05` | yes | 8/5/16/6/2 | SWEEP-TRIAGE-05 Decide the `/couchdb-analytics` service (`:8001` is not running). Findings 2026-11-18, decisio… |
| 169 | **37** | OPEN | crime-scene-reconstruction#L461 | `PARK-03` |  | 0/5/16/10/6 | PARK-03 Crime-scene items still open: browser check of the placeholder proxy button and the new scene toolbar … |
| 170 | **37** | OPEN | crime-scene-reconstruction#L490 | `RLM-04` |  | 0/5/20/10/2 | RLM-04 Keep the 2D cell mapping deterministic and outside the model: pass the accepted grid origin, cell size,… |
| 171 | **37** | OPEN | crime-scene-reconstruction#L492 | `RLM-06` |  | 0/5/16/10/6 | RLM-06 Add adversarial prompt checks for missing calibration, stale source/run revision, frame-size mismatch, … |
| 172 | **37** | OPEN | crime-scene-reconstruction#L502 | `CASE-03` | yes | 0/5/16/10/6 | CASE-03 Rank legal authorities with explicit labels: potentially controlling, persuasive, out-of-jurisdiction,… |
| 173 | **37** | OPEN | crime-scene-reconstruction#L503 | `CASE-04` |  | 0/5/16/10/6 | CASE-04 Draft a separate bounded case-research RLM prompt: propose related cases and statutes, explain the cit… |
| 174 | **37** | OPEN | crime-scene-reconstruction#L584 | `STORYBOOK-02` |  | 0/5/16/10/6 | STORYBOOK-02 WIRED: the existing SceneIntent route resolves the selected video frame against the current case … |
| 175 | **37** | OPEN | crime-scene-reconstruction#L615 | `ACE-EXEC-01` | yes | 0/5/16/10/6 | ACE-EXEC-01 Validate the packet key and preserve zero-valued topology fields. The local assembler now enforces… |
| 176 | **37** | OPEN | crime-scene-reconstruction#L616 | `ACE-EXEC-02` |  | 0/5/16/10/6 | ACE-EXEC-02 Verify versioned packed records. Fanout emits a V2 byte slab with checksummed per-record offsets a… |
| 177 | **37** | OPEN | crime-scene-reconstruction#L622 | `ACE-EXEC-06` | yes | 0/5/16/10/6 | ACE-EXEC-06 Prove signed-in source → procedure → checksum-verified artifact → reviewer decision → scene save a… |
| 178 | **36** | OPEN | crime-scene-reconstruction#L65 | `VR-02` |  | 0/5/16/13/2 | VR-02 Person detection and 2D pose: YOLO for boxes (existing). Pose model not yet admitted (see DEC-D). Output… |
| 179 | **36** | OPEN | crime-scene-reconstruction#L68 | `VR-05` |  | 0/5/16/13/2 | VR-05 Motion analysis: displacement, joint angles, velocity, and visibility per track, with uncertainty kept p… |
| 180 | **36** | OPEN | crime-scene-reconstruction#L79 | `VR-12` |  | 0/5/16/13/2 | VR-12 Entry point: the video evidence modal gets a "Generate 3D blockout" action that creates a run for the cu… |
| 181 | **36** | OPEN | crime-scene-reconstruction#L84 | `DEC-E` |  | 0/5/16/13/2 | DEC-E Clip scope: the 10 s pilot is a test input for the reconstruction pipeline. DEC-A (20 s) still governs s… |
| 182 | **36** | OPEN | crime-scene-reconstruction#L127 | `E2E-05` |  | 0/5/16/13/2 | E2E-05 FAILED: frames. Zero `evidence_frames` rows for this evidence. The job still reports completed.… |
| 183 | **36** | OPEN | crime-scene-reconstruction#L128 | `E2E-06` |  | 0/5/16/13/2 | E2E-06 Gap in the job status: a job can be `completed` while transcription and frame extraction have failed. M… |
| 184 | **36** | OPEN | crime-scene-reconstruction#L181 | `14.1` | yes | 0/5/16/13/2 | 14.1 Start the VLM server on `:8085`. Human-only under the service-lifecycle rules.… |
| 185 | **36** | OPEN | crime-scene-reconstruction#L183 | `14.3` |  | 0/5/16/13/2 | 14.3 Choose a pose estimator for COCO-17 keypoints, or confirm manual keypoints for now.… |
| 186 | **36** | OPEN | crime-scene-reconstruction#L184 | `14.4` | yes | 0/5/16/13/2 | 14.4 Backfill the 9 uncovered image evidence items through the existing writer (live writes; needs approval).… |
| 187 | **36** | OPEN | crime-scene-reconstruction#L185 | `14.5` | yes | 0/5/16/13/2 | 14.5 Live test uploads of the screenshots (live writes; needs approval and a case choice).… |
| 188 | **36** | OPEN | crime-scene-reconstruction#L213 | `15.A4` |  | 0/5/16/13/2 | 15.A4 Native-to-Node TypedArray benchmark. Not started.… |
| 189 | **36** | OPEN | crime-scene-reconstruction#L342 | `REG-OPT-02` |  | 0/5/16/13/2 | REG-OPT-02 Registry is authoring vocabulary only. It is not a classifier, not evidence, and not object identit… |
| 190 | **36** | OPEN | crime-scene-reconstruction#L346 | `REG-OPT-06` |  | 0/5/16/13/2 | REG-OPT-06 Coordinate labeling: the crime page should label image-derived points as image coordinates, not wor… |
| 191 | **36** | OPEN | crime-scene-reconstruction#L347 | `REG-OPT-07` |  | 0/5/16/13/2 | REG-OPT-07 Case-event timeline: spline markers for who/what/why/how events need a reviewed-event source. A min… |
| 192 | **36** | OPEN | crime-scene-reconstruction#L355 | `REG-OPT-13` |  | 0/5/16/13/2 | REG-OPT-13 Mode-7 is a contract only. The affine floor shader is not written.… |
| 193 | **36** | OPEN | crime-scene-reconstruction#L396 | `REG-LS4Z-01` |  | 0/5/16/13/2 | REG-LS4Z-01 "LS4Z compression" has no definition or reference in the repo (searched docs, openspec, src). Need… |
| 194 | **36** | OPEN | crime-scene-reconstruction#L401 | `REG-INST-03` |  | 0/5/16/13/2 | REG-INST-03 `sequenceId` for animation clips: not added. Only needed if a clip requires one (the Blender DAG i… |
| 195 | **36** | OPEN | crime-scene-reconstruction#L403 | `UX-TOOLBAR-02` |  | 0/5/16/13/2 | UX-TOOLBAR-02 The Detective Mode action toolbar (select, link, bounding box, grid, add node, auto-layout, comm… |
| 196 | **36** | OPEN | crime-scene-reconstruction#L417 | `SWEEP-NEXT-01` |  | 0/5/16/13/2 | SWEEP-NEXT-01 Wait for the full run to complete (`.tmp/route-sweep/run.log` ends with `exit 0` or `exit 1`). A… |
| 197 | **36** | OPEN | crime-scene-reconstruction#L419 | `SWEEP-NEXT-03` |  | 0/5/16/13/2 | SWEEP-NEXT-03 Triage any HTTP 500+ or page errors first; then the console-error routes. Record each finding as… |
| 198 | **36** | OPEN | crime-scene-reconstruction#L420 | `SWEEP-NEXT-04` |  | 0/5/16/13/2 | SWEEP-NEXT-04 If the run stopped early, restart with `ROUTE_SWEEP=1 ROUTE_SWEEP_RESUME=1` (see SWEEP-RESUME-03… |
| 199 | **36** | OPEN | crime-scene-reconstruction#L432 | `SWEEP-TRIAGE-01` |  | 0/5/16/13/2 | SWEEP-TRIAGE-01 Fix the Svelte effect loop on `/admin/codebase-graph`, `/command-center/codebase/graph`, `/cac… |
| 200 | **36** | OPEN | crime-scene-reconstruction#L441 | `SWEEP-TRIAGE-03` | yes | 0/5/16/13/2 | SWEEP-TRIAGE-03 Investigate 500s on `/admin/explorer` and `/command-center/retrieval`. Findings 2026-11-18 (no… |

## Reproducibility of v1

- v1 rows matched in tasks.md: 100/100
- v1 rows whose score changed under the same rubric: 71
- Rows that enter the global top 100 but were absent from v1: 19 (crime-scene-reconstruction#L14, crime-scene-reconstruction#L13, crime-scene-reconstruction#L775, crime-scene-reconstruction#L12, crime-scene-reconstruction#L674, crime-scene-reconstruction#L701, crime-scene-reconstruction#L747, crime-scene-reconstruction#L829, crime-scene-reconstruction#L840, crime-scene-reconstruction#L71, crime-scene-reconstruction#L521, crime-scene-reconstruction#L529, crime-scene-reconstruction#L570, crime-scene-reconstruction#L582, crime-scene-reconstruction#L118, crime-scene-reconstruction#L377, crime-scene-reconstruction#L400, crime-scene-reconstruction#L505, crime-scene-reconstruction#L772)

v1 should be regenerated from this rubric before its ranks are cited.
