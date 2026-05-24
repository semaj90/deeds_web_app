# Detective Mode — 3D Crime Reconstruction Lane

> Captures planning intent for the **stylized PS1-aesthetic** crime-scene
> reconstruction lane integrated with Detective Mode. Distinct from the
> photogrammetric path in [2026-05-08_3dgs-forensic-roadmap.md](2026-05-08_3dgs-forensic-roadmap.md):
> that one targets actual case-scene scans (Gaussian splatting from real
> photos); this one targets **prompt-driven low-poly reconstructions** for
> walking through a hypothesis on the evidence board.
>
> **Not** a request to implement now — this is the architecture brief for
> when the team picks up the 3D track. Phasing keeps each step
> independently shippable.

## TL;DR — what the user is asking for

```
┌─────────────────────────────────────────────────────────────────────┐
│ Detective enters: who/what/why/how + "crime at <city>" prompt       │
│   ↓                                                                  │
│ Mini-modal opens, expandable, generates short (8-30s) video         │
│ in PS1 / N64 low-res aesthetic                                      │
│   ↓                                                                  │
│ Detective drags case evidence (photos, docs) onto the 3D scene      │
│   ↓ Microsoft TRELLIS converts each evidence photo → 3D mesh        │
│   ↓ (RabbitMQ queue, ~30s/asset on RTX 3060 Ti)                     │
│   ↓                                                                  │
│ Evidence pins at world coordinates with annotations                  │
│   ↓                                                                  │
│ Save scene state → JSON manifest → exportable HTML5 canvas viewer    │
│ (works in Chrome offline, no SvelteKit runtime)                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design constraint**: backgrounds are **deliberately stylized** (PS1
low-poly, CRT post-process). Evidence must be **near-exact** (TRELLIS
reconstruction from the actual photo). Style + accuracy mismatch is the
admissibility hedge — no juror will mistake a PS1 alleyway for real
footage, but the evidence-derived objects retain their photographic
fidelity.

## Current state — already built (audit, 2026-05-08)

This is the part the user may not realize: ~70% of the renderer is
already in tree.

| Layer | File / Path | LoC | State |
|---|---|---|---|
| Demo route w/ who/what/why/how form + WebGPU scene | [`src/routes/(app)/demos/crime-reconstruction/+page.svelte`](../../sveltekit-frontend/src/routes/(app)/demos/crime-reconstruction/+page.svelte) | 690 | ✅ live, scene objects + keyframes + timeline scrubber |
| Courtroom scene state machine | [`src/lib/courtroom/courtroom-scene.svelte.ts`](../../sveltekit-frontend/src/lib/courtroom/courtroom-scene.svelte.ts) | 1070 | ✅ live, $state-based |
| Timeline animation engine | [`src/lib/courtroom/timeline-engine.svelte.ts`](../../sveltekit-frontend/src/lib/courtroom/timeline-engine.svelte.ts) | 276 | ✅ live |
| **CRT/N64 post-process shader** (PS1 aesthetic match) | [`src/lib/courtroom/crt-postprocess.ts`](../../sveltekit-frontend/src/lib/courtroom/crt-postprocess.ts) | 135 | ✅ live |
| Phoenix-Wright character/role/animation type set | [`src/lib/courtroom/courtroom-types.ts`](../../sveltekit-frontend/src/lib/courtroom/courtroom-types.ts) | 76 | ✅ live (14 anim types) |
| `courtroom_models` Drizzle table | [`schema-postgres.ts:3933`](../../sveltekit-frontend/src/lib/server/db/schema-postgres.ts#L3933) | — | ✅ schema |
| `courtroom_animations` Drizzle table | [`schema-postgres.ts:3950`](../../sveltekit-frontend/src/lib/server/db/schema-postgres.ts#L3950) | — | ✅ schema |
| Models + animations API | [`src/routes/api/courtroom/models/+server.ts`](../../sveltekit-frontend/src/routes/api/courtroom/models/+server.ts) | — | ✅ wired |
| Case timeline API | [`src/routes/api/cases/[id]/timeline/+server.ts`](../../sveltekit-frontend/src/routes/api/cases/[id]/timeline/+server.ts) | — | ✅ wired |
| POI timeline API | [`src/routes/api/persons-of-interest/[id]/timeline/+server.ts`](../../sveltekit-frontend/src/routes/api/persons-of-interest/[id]/timeline/+server.ts) | — | ✅ wired |
| Detective Mode UI components (8) | `src/lib/components/detective/`, `src/lib/components/yorha/*Detective*` | — | ✅ live (DetectiveBoard, ContextualDetectiveBoard, EvidenceTheoryBoard, EvidenceCard, YoRHaDetective*) |
| Detective Mode VLM training datasets | `scripts/unsloth-training/generate_detective_mode_*.py` | — | ✅ data exists |
| `/api/detective/analyze`, `/api/detective/connections` | — | — | ✅ wired |
| Local image generator UI | [`src/lib/components/ai/LocalImageGenerator.svelte`](../../sveltekit-frontend/src/lib/components/ai/LocalImageGenerator.svelte) | — | ✅ wired |
| LLM tool-calling agent | [`src/lib/server/ai/gemma4-agent.ts`](../../sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts) | — | ✅ 4 tools, max 5 rounds |
| MCP server (29 tools) | [`src/mcp/server.ts`](../../sveltekit-frontend/src/mcp/server.ts) | — | ✅ live |
| RabbitMQ manager (10 queues) | [`src/lib/server/queue/rabbitmq-manager-fixed.ts`](../../sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts) | — | ✅ live |

## Missing pieces

| Gap | Effort | Notes |
|---|---|---|
| **Scene compiler** (`who/what/why/how + city` JSON → Blender/Three.js scene script) | M (3-5 days) | Pure TypeScript, deterministic, Zod-validated; LLM is planner only, never writes Three.js code |
| **Mixamo asset registry** + license-safe local cache | S (1-2 days) | Allowlist 10-15 actions: walk, run, fall, strike, flee, point, kneel, search, signal, conceal |
| **Microsoft TRELLIS service** (image → 3D mesh) | M (2-3 days) | Local service or Replicate API; queue-driven; 30-60s per asset on RTX 3060 Ti |
| **`evidence.render` RabbitMQ queue** | S (1 day) | Producer = drag-drop UI; consumer = TRELLIS worker; result → MinIO + Postgres pin row |
| **Drag-drop evidence-into-scene UI** | M (2-3 days) | Bits UI Dialog + WebGPU raycaster for drop position |
| **Mini-modal scene viewer** (collapsed → expanded → fullscreen) | S (1 day) | Reuses Bits UI Dialog `child` snippet pattern (CLAUDE.md §Bits UI v2.16.2) |
| **Save/export pipeline** (scene state JSON + HTML5 viewer bundle) | M (2-3 days) | Static HTML + ESM Three.js bundle; Chrome offline; no SvelteKit dep |
| **Annotation overlay layer** for detective notes | S (1-2 days) | World-coords pins; Threlte / Three.js Label CSS2D |
| **PS1 aesthetic preset for the existing CRT shader** | XS (hours) | Pixelation pass, vertex jitter, affine texture warp; existing crt-postprocess.ts as base |

## Architecture (load-bearing principle)

**The LLM is the planner, the compiler is the renderer.** Do not let
Gemma4 (or Claude) write Three.js / Blender code directly. That is the
failure mode every team hits — the LLM is bad at low-level scene APIs and
the failures are silent (renders an empty scene). Pattern:

```
Crime narrative + "crime at <city>" prompt
   ↓ Gemma4 + ACE retrieval (existing — gemma4-agent.ts)
SceneIntent JSON (Zod-validated)
   • characters[]:    { mixamoId, role, color, position, animationSequence[] }
   • environment:     { cityPreset, timeOfDay, weather, fogColor }
   • events[]:        { t, kind, actorId, position, evidenceIds[] }
   • duration_s:      8 | 12 | 16 | 24 | 30
   • aesthetic:       'ps1' | 'n64' | 'modern-low-poly'
   ↓ deterministic TypeScript compiler  (NEW — scene-compiler.ts)
{ sceneScript: string, assetManifest: Asset[], renderConfig: RenderConfig }
   ↓ headless Blender (RabbitMQ scene.render queue)
   ↓ -OR- direct Three.js / Threlte WebGPU render in browser
PS1-styled MP4 OR live WebGPU canvas + scene-metadata.json
   ↓ courtroom-scene.svelte.ts loads both
mini-modal expandable viewer + scrubbable timeline
```

The compiler is unit-testable. Same input → same script → same render —
load-bearing for legal/audit review.

## TRELLIS evidence-to-3D pipeline

Microsoft TRELLIS (released Dec 2024) does single-image → 3D Gaussian
splat / mesh. Open-source, Apache 2.0. **The right tool for evidence
ingestion** because every photo in the case file becomes a 3D object the
detective can place in the scene.

```
User drags evidence photo onto scene
   ↓ POST /api/evidence/[id]/trellis-render { image_uri, target_format: 'glb' }
   ↓ rabbitmq.publish('evidence.render', payload)
TRELLIS worker (Python service or Replicate fallback):
   • Load image, run TRELLIS → 3D Gaussian splats
   • Convert splats → GLB mesh via SuGaR or built-in mesh export
   • Decimate to <5k tris (PS1 budget) — prefer crisp silhouettes
   • Upload to MinIO; write { evidence_id, glb_uri, sha256 } to evidence_3d_assets table
   ↓ SSE notify client
Client receives: { evidence_id, glb_uri }
   ↓ courtroom-scene loads GLB, places at drop coordinates
Annotation overlay shows: "Evidence #N — Photo from <date>, witness <id>"
```

**On RTX 3060 Ti**: TRELLIS runs in ~30-60s per image at 256×256 input
(quality acceptable for PS1-budget targets). VRAM peak ~6 GB. Coexists
with TurboQuant `gemma4-rotorquant:latest` if loaded sequentially — never both at
once. RabbitMQ queue serializes naturally.

**Fallback**: if local TRELLIS OOMs, fall back to **Replicate API** (same
model, ~$0.01 per call). Same queue, different worker.

## RabbitMQ queue layout (heap management)

The user's instinct that RabbitMQ + service workers manage heap better
than in-process work is correct — and the existing 10-queue manager
already gives us most of the pattern.

| Queue (new) | Purpose | Worker | TTL | Heap concern |
|---|---|---|---|---|
| `scene.render` | Compile SceneIntent → Blender script → MP4 | Python Blender headless worker | 1 hr | 1-3 GB while rendering; never on Node heap |
| `evidence.render` | TRELLIS image → GLB mesh | Python TRELLIS worker | 1 hr | 6 GB VRAM peak; 200 MB host RAM |
| `scene.export` | Pack scene state JSON + Three.js HTML5 bundle | Node worker | 5 min | <100 MB; safe for Node main |

Producers: SvelteKit endpoints (`/api/scene/render`, `/api/evidence/[id]/trellis-render`,
`/api/scene/[id]/export`). Consumers: Python sidecars (Blender, TRELLIS) +
one Node worker for export packing. **No 3D / GPU work runs on the
SvelteKit Node process.** The web tier stays light.

## Save state + HTML5 export contract

Detective saves a scene → JSON manifest written to `crime_scenes` (new
Drizzle table) + `MinIO`-backed asset bundle. Export produces a
**self-contained Chrome-offline HTML5 viewer**:

```
exported-scene.zip
├── index.html              ← single-file Three.js viewer
├── scene.json              ← SceneIntent + camera path + annotations
├── assets/
│   ├── characters/*.glb    ← Mixamo riggings (license-permitted local)
│   ├── evidence/*.glb      ← TRELLIS-derived per-evidence meshes
│   └── environment.glb     ← city preset (PS1 alleyway, parking lot, etc.)
├── thumbnails/             ← evidence photos in original resolution
└── manifest.txt            ← SHA-256 of every asset for chain-of-custody
```

Bundle is opened by double-click in any Chrome — no server, no SvelteKit
runtime, no internet. The `index.html` includes Three.js as a single
ESM blob (~200 KB minified). The viewer reads `scene.json`, mounts the
GLBs, replays the timeline. Pure HTML5 canvas + WebGPU.

This shape is **deliberately offline-first** because legal review often
happens on air-gapped review laptops.

## Phasing (each step independently shippable)

### Phase 0 — Inventory + cleanup (1 day)
- [ ] Audit `src/lib/courtroom/` and `/demos/crime-reconstruction` against this brief — confirm nothing is phantom-wired
- [ ] Verify the 8 detective-mode UI components are actually rendered somewhere
- [ ] Decide: keep WebGPU path (more performant) or pivot to Threlte (simpler API, broader browser support)

### Phase 1 — SceneIntent extraction (2-3 days, biggest value)
- [ ] Zod schema: `SceneIntentSchema` in `src/lib/types/scene.ts`
- [ ] LLM endpoint: `POST /api/scene/intent` — Gemma4 + ACE → `SceneIntent`
- [ ] 2D timeline viewer in `/demos/crime-reconstruction` reading `SceneIntent` (no 3D yet)
- [ ] Validates the extraction shape end-to-end before any rendering

### Phase 2 — Mixamo asset registry + scene compiler (3-5 days)
- [ ] `mixamo_assets/` local cache with 10-15 actions (license-checked)
- [ ] `scene-compiler.ts` — pure-function `SceneIntent → { blenderScript, assetManifest }`
- [ ] Unit tests on compiler output (JSON-equality for known inputs)
- [ ] No LLM in this loop — fully deterministic

### Phase 3 — Headless Blender render (5-7 days)
- [ ] Python sidecar: consumer of `scene.render` queue
- [ ] Apply CRT/PS1 post-process via Blender compositor nodes (or pass through to client shader)
- [ ] MP4 + scene-metadata JSON output to MinIO
- [ ] SSE progress to client
- [ ] One end-to-end test: hardcoded SceneIntent → MP4 in <60s

### Phase 4 — TRELLIS evidence-to-3D (3-5 days)
- [ ] Python sidecar: consumer of `evidence.render` queue
- [ ] Replicate API fallback path
- [ ] `evidence_3d_assets` Drizzle table
- [ ] Drag-drop UI in `/demos/crime-reconstruction` posts to TRELLIS queue, polls for GLB

### Phase 5 — Mini-modal viewer + annotations (3-5 days)
- [ ] Bits UI Dialog with `child` snippet for collapse → expand → fullscreen
- [ ] Threlte / WebGPU GLB viewer reading scene-metadata
- [ ] Annotation overlay (CSS2D labels) at world coords with evidence pin links

### Phase 6 — Save/export bundle (2-3 days)
- [ ] `crime_scenes` Drizzle table
- [ ] `/api/scene/[id]/export` → packs ZIP per the contract above
- [ ] Standalone `index.html` template with Three.js single-file ESM bundle
- [ ] SHA-256 manifest for chain-of-custody (extends the existing `evidenceAuditLog` pattern from CLAUDE.md §Evidence Pipeline)

### Phase 7 (optional) — Gemma4 MCP-to-Blender bridge
- [ ] `blender.*` MCP tool family in `src/mcp/server.ts` (set_scene, add_character, apply_animation, render)
- [ ] Tools internally call the deterministic compiler — agents still emit *intent*, not Blender Python
- [ ] Lets agents drive scenes, but with audit-friendly intent JSON in the tool-call log

## Hard gates (do not skip)

1. **Stylization is the admissibility hedge.** PS1/N64 aesthetic must be
   preserved on backgrounds. The moment the renderer goes photoreal on
   non-evidence elements, the team is in demonstrative-evidence territory
   that needs a Daubert hearing. Keep it pixelated.

2. **Evidence pieces are near-exact.** TRELLIS-derived meshes preserve
   the original photo's silhouette and texture; do **not** apply the
   PS1 vertex jitter to evidence GLBs. The visual contrast (sharp
   evidence, blocky environment) signals "reconstructed scene, real
   evidence."

3. **Chain of custody on every asset.** Extend `evidenceAuditLog` to
   `evidence_3d_assets` (per CLAUDE.md §Evidence Pipeline pattern).
   SHA-256 on every GLB at write time. Log model version in metadata
   (`metadata.trellis_model = 'TRELLIS-image-large@<digest>'`).

4. **No GPU work on the Node main thread.** TRELLIS, Blender, and any
   future heavy compute run as RabbitMQ-consumed Python sidecars.
   SvelteKit produces messages, never blocks on render.

5. **Export bundles are SHA-256-verifiable.** `manifest.txt` lets a
   reviewer prove the offline bundle they're watching matches what was
   exported from the case file.

## Cross-references

- **Companion lane (different tooling)**:
  [2026-05-08_3dgs-forensic-roadmap.md](2026-05-08_3dgs-forensic-roadmap.md)
  — photogrammetric 3DGS from real crime-scene photos. That's
  evidence-as-environment; this doc is **prompt-as-environment +
  evidence-as-objects**.
- **Existing detective UI**: `src/lib/components/detective/` and
  `src/lib/components/yorha/*Detective*` — 8 components, evidence
  board interaction patterns reusable for the drag-drop layer.
- **Existing courtroom 3D**: `src/lib/courtroom/` (1556 LoC) — already
  has scene state, timeline engine, CRT shader. The PS1 aesthetic is
  one shader-preset away.
- **VLM training**: `scripts/unsloth-training/generate_detective_mode_*.py`
  — when this lane ships, augment the dataset with `SceneIntent`
  examples so the VLM learns to emit valid scene plans.
- **MCP integration**:
  [next_steps/02-mcp-integration.md](../02-mcp-integration.md) — Phase 7
  here adds the `blender.*` tool family.
- **Evidence pipeline**: CLAUDE.md §"Evidence Pipeline (8 stages)" —
  TRELLIS becomes Stage 9 (or 10, after the GPU background analysis).
- **Hypergraph Lane B (just shipped)**: `shared_resource` edges from
  `code_relations` already cluster files that touch the same evidence
  table. The same ACE retrieval that surfaces those edges should
  surface evidence-3d-assets too — one cross-reference link in
  `context-assembler.ts` once the table lives.

## Why this order beats "build the renderer first"

Phase 1 (SceneIntent extraction + 2D viewer) ships in 2-3 days and
gives detectives a structured timeline view of any case narrative.
That alone is probably 60% of the daily-use value. 3D is the
demonstrative layer on top — useful for courtroom presentation, less
useful for "did I miss something on this case?" investigation work,
which is what the detective spends most of their time on.

Each phase is shippable. If Phase 1 lands and demand for full 3D
doesn't materialize, you stop there and you've still moved the case-
review experience forward. If it does materialize, every later phase
plugs into the same `SceneIntent` shape that's already validated.

## Open questions for product

1. **License audit on Mixamo**: Adobe's terms allow commercial use of
   Mixamo characters in a product, but redistribution rules are tighter.
   Confirm before bundling rigs into the export ZIP.
2. **City presets — generated or curated?** A small library (10-15
   templates: alleyway, parking lot, apartment, retail interior, gas
   station, office, warehouse, courtyard, suburban street, freeway
   shoulder) is enough for most cases and stays admissible. Generating
   per-case via text-to-3D would invite "the model invented details
   that don't exist."
3. **Detective annotation persistence**: are notes scoped to the case,
   the scene render, or the user? Probably all three — `case_id` +
   `scene_id` + `user_id` foreign keys.
4. **TURRELIS / TRELLIS local-vs-Replicate cost trade**: ~$0.01/asset
   on Replicate vs free local but ~30-60s/asset wall time. Probably
   default to local, fall back to Replicate when queue depth > 10.

When this lane activates: this doc becomes the implementation brief.

---

## Appendix — `rg / awk` codebase audit (2026-05-08)

Sweep of the live tree + `deeds_labs/` archives for anything pertaining
to detective mode, crime reconstruction, low-poly aesthetic, N64/PS1
shaders, evidence-to-3D, and timeline pipeline. **Live = wired today**;
**archive = available for cherry-pick from `deeds_labs/`**.

### Live — already in tree

**WebGPU shaders** ([`src/lib/gpu/shaders/`](../../sveltekit-frontend/src/lib/gpu/shaders/)):
- `crime-scene.wgsl` (279 LoC) — point cloud + OBJ mesh + video frame textures, instanced billboard discs, RTX 3060 Ti targeted (256-wide workgroups). **Directly load-bearing for this lane.**
- `crt-postprocess.wgsl` (133 LoC) — CRT scanlines, barrel distortion, chromatic aberration, vignette, noise. Companion GLSL port at [`src/lib/courtroom/crt-postprocess.ts`](../../sveltekit-frontend/src/lib/courtroom/crt-postprocess.ts).
- `particle-system.wgsl` (204 LoC) — particle effects (used in [`WebGPUParticleOverlay.svelte`](../../sveltekit-frontend/src/lib/components/evidence/WebGPUParticleOverlay.svelte)).

**Gaming UI library** ([`src/lib/components/ui/gaming/`](../../sveltekit-frontend/src/lib/components/ui/gaming/) — 45 files):
- `n64/` — 28 components (N64Cartridge, N64Controller, N643DContainer, N643DDialog, N643DInput, N643DPanel, N64Modal, N64Panel, N64Surface, N64Slider, N64Select, N64Progress, N64Checkbox, N64TextField, N64TextArea, N64Badge, N64Canvas, N64Toaster, N64ToastStore, N64FormGrid, N64Screen, N64LoadingRing, N64EvolutionLoader, etc.)
- `8bit/` — NES8BitButton, NES8BitContainer
- `16bit/` — SNES16BitButton
- `effects/` — `NES3DLODProcessor.svelte` (4-tier LOD: 2048/512/128/32 verts — exactly the PS1 budget)
- `core/`, `demo/`, `modals/`, `constants/`, `types/`

**Crime reconstruction infra**:
- [`src/routes/(app)/demos/crime-reconstruction/+page.svelte`](../../sveltekit-frontend/src/routes/(app)/demos/crime-reconstruction/+page.svelte) (690 LoC) — full who/what/why/how form, WebGPU canvas, orbit camera, scene objects with keyframes, timeline scrubber
- [`src/lib/courtroom/`](../../sveltekit-frontend/src/lib/courtroom/) (1556 LoC, 4 files) — scene state, timeline engine, CRT shader, Phoenix-Wright types
- [`src/lib/components/NESGraphRenderer.svelte`](../../sveltekit-frontend/src/lib/components/NESGraphRenderer.svelte) — NES-styled graph rendering
- [`src/lib/components/evidence/WebGPUParticleOverlay.svelte`](../../sveltekit-frontend/src/lib/components/evidence/WebGPUParticleOverlay.svelte) — evidence overlay using WebGPU

**Detective Mode UI** — 8 components live, all in tree:
- `src/lib/components/detective/DetectiveBoard.svelte`
- `src/lib/components/detective/ContextualDetectiveBoard.svelte`
- `src/lib/components/dashboard/DetectiveRankBadge.svelte`
- `src/lib/components/RouteInspectorDetectiveBoard.svelte`
- `src/lib/components/yorha/DetectiveEvidenceMap.svelte`
- `src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte`
- `src/lib/components/yorha/YoRHaDetectiveForm.svelte`
- `src/lib/components/yorha/YoRHaDetectiveModal.svelte`
- `src/lib/components/yorha/YoRHaDetectiveNotification.svelte`

**Detective APIs**:
- `/api/detective/analyze`
- `/api/detective/connections`

**Timeline APIs**:
- `/api/cases/[id]/timeline`
- `/api/persons-of-interest/[id]/timeline`

**DB tables**:
- `courtroom_models` (Drizzle), `courtroom_animations` (Drizzle) — already ship with type exports `CourtroomModel`, `NewCourtroomModel`, `CourtroomAnimation`, `NewCourtroomAnimation`
- `courtroom_scene_animations` (junction table referencing both)

**VLM training assets**:
- `scripts/unsloth-training/generate_detective_mode_dataset.py`
- `scripts/unsloth-training/generate_detective_mode_enhanced.py`
- 500+ training examples for detective-mode investigation patterns

### Archive — in `deeds_labs/` (cherry-pick if useful)

- `deeds_labs/archived-dead-code/dead-lib-dirs/detective-mode/comprehensive-integration.svelte.ts` + `.migration-report.md` — earlier attempt at unified detective integration
- `deeds_labs/archived-dead-code/sprint2-2026-03-15/evidence-detective.ts` — evidence-detective coupling logic
- `deeds_labs/archived-dead-code/dead-lib-dirs/websocket-client/DetectiveWebSocketManager.ts` — real-time detective WS sync
- `deeds_labs/frontend/svelte4-archive/components/stub-ui-subdirs/core/YorHADetectiveInterface.svelte` — Svelte 4 era detective interface
- `deeds_labs/frontend/svelte4-archive/components/stub-ui-subdirs/gaming/N64DetectiveUI.svelte` — **directly relevant** N64-aesthetic detective UI from the archive
- `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/state/xstate-detective-mode.js` — XState v4 detective state machine (would need v5 migration)
- `deeds_labs/frontend/sveltekit-frontend-archive/dirs/archives/unused-2026-02-14/lib/components/DetectiveLayout.svelte` — historical layout shell

### Search-result interpretation

**The 3D crime-reconstruction renderer is ~70% built.** The missing
pieces are:

1. **The bridge** between `SceneIntent` JSON and the existing WebGPU
   `crime-scene.wgsl` pipeline (the deterministic compiler — Phase 2)
2. **Mixamo asset registry** — animations are in `courtroom_animations`
   but no Mixamo asset cache exists
3. **TRELLIS service** — no image-to-3D today; this is the only fully
   net-new dependency
4. **Drag-drop evidence-to-scene UI**, **save/export bundle**,
   **annotation overlay** — all small UI tasks

**The PS1/N64 aesthetic is also already covered.** Between `crt-postprocess.wgsl`,
`NES3DLODProcessor.svelte`'s 4-tier LOD, and 28 N64-styled UI primitives,
the look-and-feel layer is ready. Phase 0 should explicitly verify that
the existing `/demos/crime-reconstruction` page renders with these
shaders enabled before any new work begins.

**Don't rebuild what's wired.** The phasing above assumes Phase 1
(SceneIntent extraction + 2D timeline) is the only Phase that doesn't
overlap with existing code. Every later phase should *extend* what's
in `src/lib/courtroom/` and the `crime-scene.wgsl` pipeline, not
replace it.

### Re-run the audit

```bash
# Live tree — direct hits
rg -li 'detective[-_ ]mode|crime[-_ ]reconstruction|crime[-_ ]tracker' sveltekit-frontend/src
rg -li '\bn64\b|low[-_ ]?poly|nes[-_ ]retro|crt[-_ ]?(post|shader|process)' sveltekit-frontend/src
rg -li 'TimelineEvent|courtroomModels|courtroomAnimations' sveltekit-frontend/src

# Shaders + WebGPU
ls sveltekit-frontend/src/lib/gpu/shaders/
ls sveltekit-frontend/src/lib/courtroom/

# Gaming UI inventory
ls sveltekit-frontend/src/lib/components/ui/gaming/

# Archive sweep (gitignored — read-only, never move)
find deeds_labs -iname '*detective*' -type f
find deeds_labs -iname '*crime*' -type f
```

