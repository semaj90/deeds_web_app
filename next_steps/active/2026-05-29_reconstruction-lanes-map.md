# 3-Track Reconstruction Architecture Map
**Status**: Infrastructure audit complete. Lane A 70% complete, Lane B partially wired, Lane C–E at 0%.  
**Date**: 2026-05-29  
**Critical Path**: Lane A → B → C → D parallel, E deferred to Phase 2.

---

## Executive Summary

The reconstruction system (crime-scene timeline → visual media) has **three layers of existing infrastructure**:

1. **TimelineEvent type** (used in `/api/cases/[id]/timeline`) — 7-month-old foundation  
2. **SceneIntent schema + compiler** (Zod + Blender script generator) — committed May 14  
3. **ComfyUI HTTP bridge** (minimal, phase 0) — operational  
4. **WebGPU + Babylon.js scene graph** (courtroom sim, CRT shader, timeline engine) — 1556 LoC live  
5. **Database tables**: `courtroom_models`, `courtroom_animations`, `courtroom_anim_type` enum — schema ready  

**What's MISSING** (blocking each lane):
- Lane A: Polish (export, citation rendering, mobile responsive)
- Lane B: Adapter (timeline event → ComfyUI workflow builder)
- Lane C: Blender RabbitMQ consumer + Mixamo asset registry
- Lane D: Actor mesh + path animation + evidence labels + scrubber
- E: TRELLIS model pipeline + training (defer)

---

## Lane-by-Lane Inventory

### **Lane A: 2D Legal Timeline Viewer** (70% complete)

**Status**: SHIPPING READY (with polish)

**Existing files**:
- **Route**: `/api/cases/[id]/timeline/+server.ts` — aggregates case activity, returns `TimelineEvent[]`
  - Interface: `{ id, time, location, who[], what, confidence, evidence_ids[] }`
  - Queries: `casesTable`, `caseNotesTable`, `evidenceTable`, `hearingsTable`
  - **Query returns all 7 required fields** ✅

- **Frontend route**: `/demos/crime-reconstruction/+page.svelte` (690 LoC)
  - Form: who/what/why/how inputs → submits to `/api/reconstruction/scene-intent`
  - Timeline display panel: placeholder, NOT wired to API timeline yet
  - WebGPU scene wired, CRT shader active
  - **Status**: Form is POC; timeline display needs integration

- **Timeline engine**: `src/lib/courtroom/timeline-engine.svelte.ts` (276 LoC)
  - Playback state machine (loading, playing, paused, error)
  - Scrubber widget
  - Keyframe interpolation
  - **Ready to use**, needs UI component wrapping

**Gaps** (est. 4–6 hours):
- [ ] Integrate `/api/cases/[id]/timeline` fetch into front-end page
- [ ] Render TimelineEvent list with citation badges (evidence_ids → statute links)
- [ ] Mobile-responsive timeline timeline (current is desktop-only)
- [ ] Export button → ZIP (JSON + metadata + media refs)
- [ ] Error handling for missing case / empty timeline
- [ ] Keyboard shortcuts (space=play/pause, arrow=scrub, S=save)

**File paths**:
```
src/routes/api/cases/[id]/timeline/+server.ts          (backend)
src/routes/(app)/demos/crime-reconstruction/+page.svelte  (frontend POC)
src/lib/courtroom/timeline-engine.svelte.ts            (playback state machine)
src/lib/courtroom/courtroom-types.ts                   (CourtroomView, CourtroomAnimType)
src/lib/courtroom/crt-postprocess.ts                   (N64/PS1 shader)
```

---

### **Lane B: ComfyUI Still Frame Generation** (5% complete)

**Status**: HTTP bridge operational, adapter missing

**Existing files**:
- **ComfyUI HTTP client**: `src/lib/server/comfyui/comfyui-client.ts` (minimal, phase 0)
  - `probeHealth()` — checks reachability
  - `submitPrompt(workflow_api)` — POST /prompt → returns prompt_id
  - `pollHistory(prompt_id)` — GET /history/{id}
  - `buildViewUrl()` — outputs file path
  - Auto-retry, structured error returns (no exceptions)
  - **Env**: `COMFYUI_BASE_URL=http://comfyui:8188`

- **API routes**:
  - `GET /api/comfyui/health` — probe endpoint ✅
  - `POST /api/comfyui/render` — async workflow executor ✅

- **RabbitMQ queue**: `comfyui.render` (declared in `rabbitmq-manager-fixed.ts`)
  - **Status**: Not yet wired (no producer, no consumer)

**Gaps** (est. 2–3 hours):
- [ ] **Adapter**: TimelineEvent → ComfyUI workflow_api.json builder
  - Input: `{ location, who[], what, confidence }`
  - Output: Workflow JSON with sampler configs, LoRA paths, prompt text
  - Library of prompt templates per role (prosecutor, witness, judge avatar)
  
- [ ] **Producer**: Lane A export → RabbitMQ `comfyui.render` queue
- [ ] **Consumer**: Express handler polling `/history` with status page
- [ ] **Workflow files**: Operator drops `workflow_*.json` templates in `static/comfyui/`
- [ ] **LoRA model registry**: Map evidence_ids → LoRA weights (e.g., "prosecutor_formal.safetensors")

**File paths**:
```
src/lib/server/comfyui/comfyui-client.ts               (HTTP bridge)
src/routes/api/comfyui/{health,render}/+server.ts     (endpoints)
src/lib/server/reconstruction/comfyui-adapter.ts       (MISSING — to write)
src/lib/server/reconstruction/comfyui-producer.ts      (MISSING — to write)
static/comfyui/workflows/                               (operator config, NOT in repo)
```

---

### **Lane C: Blender + Mixamo Animation** (0% complete)

**Status**: Schema ready, no RabbitMQ consumer, no Mixamo registry, no script generation

**Database**:
- `courtroom_models` table (schema-postgres.ts:4078)
  - Fields: id, model_path (GLB/FBX), role (prosecutor/defense/judge/witness), metadata JSONB
  - Index on role
  - **Status**: Schema only, no seed data

- `courtroom_animations` table (schema-postgres.ts:4095)
  - Fields: id, model_id FK, action (animation type), clip_path (GLB with embedded armature)
  - Enum: `courtroom_anim_type = ['idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand', 'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head']` ✅

**Mixamo License Status**:
- Stock license allows **redistribution of video/rendered outputs**, NOT source FBX files
- **Solution**: Seed DB with FBX URLs → Operator downloads via Mixamo API → Blender CLI converts to GLB + embeds actions
- **Action allowlist** (crime-scene-schema.ts): `['idle', 'walk', 'run', 'fall', 'strike', 'turn', 'kneel']`
  - Larger than courtroom enum; Blender pipeline projects down

**Gaps** (est. 8–10 hours):
- [ ] **Mixamo asset registry** (CSV/JSON): action ID → (model_id, clip_path, confidence)
- [ ] **RabbitMQ consumer** (`blender.render` queue)
  - Worker: `scripts/blender-render-worker.py` (invoke Blender via CLI)
  - Input: `{ scene_intent, actor_ids, output_bucket }`
  - Output: MP4 + metadata JSON to MinIO + DB record
  
- [ ] **Blender script generator** (`scene-compiler.ts` extension)
  - Input: SceneIntent + courtroom_models/animations
  - Output: Python script that:
    - Loads GLBs for actors
    - Applies Mixamo actions sequentially
    - Paths from SceneIntent (walk from crime scene to witness stand)
    - Camera follows action
    - Renders to frame sequence → FFmpeg MP4
  
- [ ] **Operator task**: Download Mixamo clips for 5 stock roles (prosecutor, defense, judge, witness, suspect)
- [ ] **GPU pool**: Blender with CUDA acceleration (separate `ffmpeg-render` queue for MP4 post-process)

**File paths**:
```
src/lib/server/db/schema-postgres.ts                   (courtroom_models, courtroom_animations)
src/lib/server/reconstruction/scene-compiler.ts        (Blender script generation)
scripts/blender-render-worker.py                       (MISSING — to write)
scripts/mixamo-registry.json                           (MISSING — to write)
src/lib/server/reconstruction/blender-adapter.ts       (MISSING — to write)
```

---

### **Lane D: WebGPU Low-Poly Viewer** (40% complete)

**Status**: Scene graph + timeline engine ready, integration + animation missing

**Existing infrastructure** (1556 LoC total):

- **Scene machine** (`src/lib/courtroom/courtroom-scene.svelte.ts`, 1070 LoC)
  - Babylon.js scene graph with state machine (loading → ready → playing)
  - Actor spawning, camera presets (prosecution/defense/judge/witness/wide views)
  - Timeline slider (scrubber)
  - CRT post-process shader
  - **Status**: Operational, needs courtroom_models GLB integration

- **Timeline engine** (`src/lib/courtroom/timeline-engine.svelte.ts`, 276 LoC)
  - Keyframe interpolation (Catmull-Rom)
  - Playback state (loading, playing, paused, error)
  - **Ready to feed from Lane A `TimelineEvent[]`**

- **CRT shader** (`src/lib/courtroom/crt-postprocess.ts`, 160 LoC)
  - N64/PS1 scanline + phosphor bloom + vintage feel
  - **Load-bearing for admissibility** (pixelated aesthetic signals "reconstructed")

- **Frontend components**:
  - `src/lib/components/courtroom/CourtroomHUD.svelte` — UI overlay (role badges, timeline, controls)
  - `src/lib/components/courtroom/StrategyWizard.svelte` — RAG→KAG→Synthesis 4-step form
  - `/demos/crime-reconstruction/+page.svelte` — container (690 LoC, mostly POC form)

- **Route**: `/demos/crime-reconstruction` (should wire to `/cases/[id]/reconstruction` later)

**Gaps** (est. 6–8 hours):
- [ ] **Actor mesh loading**: courtroom_models GLB → Babylon.js actor spawn
  - Import `MODEL_REGISTRY` from DB
  - Load GLB via BabylonJS `SceneLoader.ImportMesh()`
  - Apply skeleton/armature

- [ ] **Path animation**: SceneIntent path points → Bezier curves → skeleton IK
  - Input: `[{ t, x, y, z }, ...]`
  - Interpolate: actor.position = bezier(t / duration)
  - Skeleton IK constraints (feet on ground)

- [ ] **Action/animation playback**: Map TimelineEvent.action → courtroom_animations clip
  - Load clip GLB (armature only)
  - Layer onto actor mesh
  - Blend in → play → blend out

- [ ] **Evidence label overlay**: Badge for each evidence item
  - 3D world position → screen 2D label
  - Click to zoom to evidence detail panel

- [ ] **Scrubber widget**: Mirror timeline-engine state
  - Drag → seek to t
  - Click markers (hearings, key moments) → jump

- [ ] **Mobile responsive**: WebGPU canvas resizing, touch controls

**File paths**:
```
src/lib/courtroom/courtroom-scene.svelte.ts            (Babylon.js scene, needs GLB loader)
src/lib/courtroom/timeline-engine.svelte.ts            (playback, ready to integrate)
src/lib/courtroom/courtroom-types.ts                   (CourtroomView, CourtroomAnimType)
src/lib/components/courtroom/CourtroomHUD.svelte       (UI overlay)
src/routes/(app)/demos/crime-reconstruction/+page.svelte (container, needs refactor)
src/routes/api/courtroom/models/+server.ts            (list courtroom_models from DB) ✅
src/lib/server/reconstruction/model-registry.ts        (MISSING — to write)
src/lib/courtroom/animation-blender.svelte.ts          (MISSING — skeletal animation)
```

---

### **Lane E: Gaussian Splatting (Environments Only)** (0% complete)

**Status**: DEFERRED to Phase 2. Research-only, no immediate blocker.

**Scope** (NOT for actors, NOT for text-to-3D, NOT for claimed-real spaces):
- Pre-scanned courtroom/street/house photogrammetry
- TRELLIS model fine-tuning pipeline (May 2026, Replicate API)
- Capture photogrammetry → Colmap → Gaussian splatting
- **Use case**: Immersive environment, actors + Mixamo animations rendered on top

**Gaps**:
- [ ] Scene capture / photogrammetry pipeline (iPhone + Polycam / Metashape)
- [ ] TRELLIS fine-tuning on legal-scene dataset (Replicate: ~$10–30/run)
- [ ] GS rendering integration (gsplat.tech JavaScript library)
- [ ] Environment-only constraints (do NOT GS actors or evidence)

**File paths** (deferred):
```
scripts/trellis-pipeline.py                            (MISSING — Phase 2)
src/lib/webgpu/gaussian-splat-renderer.ts              (skeleton exists, 0 consumers)
```

---

## Critical Path & Build Order

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Lane A (2D Timeline) — 4–6 hours                       │
│ • Integrate /api/cases/[id]/timeline into front-end             │
│ • Render TimelineEvent list with evidence badges                │
│ • Mobile responsive + keyboard shortcuts                        │
│ • Export to ZIP                                                 │
│ BLOCKS: Lane B, Lane D                                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2A: Lane B (ComfyUI Stills) — 2–3 hours                   │
│ • Adapter: TimelineEvent → workflow_api.json                    │
│ • RabbitMQ producer + consumer                                  │
│ • Workflow templates (operator config)                          │
│ • LoRA registry (statute → style)                               │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ├─ PARALLEL ────────────────────────────────────────┐
               │                                                   │
┌──────────────┴──────────────┐        ┌──────────────────────────┴────┐
│ PHASE 2B: Lane C (Blender)   │        │ PHASE 2D: Lane D (WebGPU)      │
│ 8–10 hours                   │        │ 6–8 hours                      │
│                              │        │                                │
│ • Mixamo registry            │        │ • GLB loader (courtroom_models)│
│ • Blender script generator   │        │ • Path interpolation (Bezier)  │
│ • RabbitMQ consumer          │        │ • Skeletal animation blending  │
│ • FFmpeg MP4 post-process    │        │ • Evidence label overlay       │
│                              │        │ • Scrubber integration         │
│                              │        │ • Mobile responsive            │
└──────────────────────────────┘        └────────────────────────────────┘
               │                                        │
               └─── CONVERGE (4–6 hours integration) ──┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: End-to-End Assembly & Testing                          │
│ • /cases/[id]/reconstruction unified route                      │
│ • Lane A → B → C → D pipeline orchestration                     │
│ • Demo case + video output verification                         │
│ • Legal admissibility review (confidence badges, uncertainty)   │
└─────────────────────────────────────────────────────────────────┘

DEFERRED:
  Lane E (Gaussian Splats) → Phase 4 (Q3 2026)
```

---

## File Inventory & Dependencies

### Lane A Files
```
✅ DONE
  src/routes/api/cases/[id]/timeline/+server.ts
  src/lib/courtroom/timeline-engine.svelte.ts
  src/lib/courtroom/courtroom-types.ts
  src/lib/courtroom/crt-postprocess.ts

⚠️  PARTIAL
  src/routes/(app)/demos/crime-reconstruction/+page.svelte  (form only, no timeline)

❌ MISSING
  src/lib/components/crime-reconstruction/TimelineDisplay.svelte
  src/lib/components/crime-reconstruction/EvidenceMarker.svelte
  src/lib/reconstruction/timeline-exporter.ts
```

### Lane B Files
```
✅ DONE
  src/lib/server/comfyui/comfyui-client.ts
  src/routes/api/comfyui/health/+server.ts
  src/routes/api/comfyui/render/+server.ts

❌ MISSING
  src/lib/server/reconstruction/comfyui-adapter.ts
  src/lib/server/reconstruction/comfyui-producer.ts
  src/lib/server/reconstruction/workflow-registry.ts
  src/lib/server/reconstruction/lora-registry.ts
```

### Lane C Files
```
✅ SCHEMA
  src/lib/server/db/schema-postgres.ts  (courtroom_models, courtroom_animations tables + enum)

✅ COMPILER
  src/lib/server/reconstruction/scene-compiler.ts

❌ MISSING
  scripts/blender-render-worker.py
  scripts/mixamo-registry.json
  src/lib/server/reconstruction/blender-adapter.ts
  src/lib/server/reconstruction/blender-producer.ts
```

### Lane D Files
```
✅ CORE ENGINE
  src/lib/courtroom/courtroom-scene.svelte.ts
  src/lib/courtroom/timeline-engine.svelte.ts
  src/lib/courtroom/crt-postprocess.ts

✅ API
  src/routes/api/courtroom/models/+server.ts

⚠️  PARTIAL
  src/lib/components/courtroom/CourtroomHUD.svelte  (UI only, no animation logic)

❌ MISSING
  src/lib/courtroom/animation-blender.svelte.ts
  src/lib/courtroom/path-interpolation.ts
  src/lib/reconstruction/model-registry.ts
  src/lib/components/crime-reconstruction/ScrubberWidget.svelte
  src/lib/components/crime-reconstruction/EvidenceLabel3D.svelte
```

### Lane E Files
```
DEFERRED — No files.
```

---

## Database & Environment

**Tables**:
```sql
-- Exists ✅
CREATE TABLE courtroom_models (
  id uuid PRIMARY KEY,
  model_path text NOT NULL,                    -- "glb://path/model.glb"
  role courtroom_anim_type NOT NULL,            -- actor role
  metadata jsonb DEFAULT '{}'::jsonb             -- actor traits
);

CREATE TABLE courtroom_animations (
  id uuid PRIMARY KEY,
  model_id uuid FK → courtroom_models.id,
  action courtroom_anim_type NOT NULL,          -- 'idle', 'speaking', ...
  clip_path text NOT NULL                       -- "glb://path/action.glb"
);

CREATE ENUM courtroom_anim_type AS (
  'idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand',
  'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head'
);
```

**Environment variables**:
```bash
COMFYUI_BASE_URL=http://comfyui:8188                  # Lane B
BLENDER_PATH=/usr/bin/blender                         # Lane C
MIXAMO_API_KEY=<operator-only, Phase 2>               # Lane C
```

**RabbitMQ queues** (declared, not yet populated):
```
comfyui.render      — Lane B producer/consumer
blender.render      — Lane C producer/consumer (not yet declared)
ffmpeg.encode       — Lane C post-process (not yet declared)
```

---

## npm Scripts (to be created)

```json
{
  "reconstruct:lane-a": "node scripts/test-timeline-integration.mjs",
  "reconstruct:lane-b": "node scripts/test-comfyui-adapter.mjs",
  "reconstruct:lane-c": "python scripts/blender-render-worker.py",
  "reconstruct:lane-d": "npm run dev -- --open /demos/crime-reconstruction",
  "reconstruct:e2e": "npm run reconstruct:lane-a && npm run reconstruct:lane-b && npm run reconstruct:lane-c && npm run reconstruct:lane-d",
  "reconstruct:demo": "curl -X POST http://localhost:5173/api/cases/demo-id/reconstruction --data @demo-case.json"
}
```

---

## Blockers & Risks

1. **ComfyUI operator workflow files**: Operator must export `workflow_*.json` from ComfyUI Desktop → place in `static/comfyui/`. **Blocking Lane B, not a code blocker.**

2. **Mixamo asset download**: Operator downloads Mixamo clips → Blender CLI converts to GLB + armature. **Blocking Lane C, not a code blocker.**

3. **Blender CUDA**: Lane C renders need CUDA for speed. RTX 3060 Ti available. **No blocker.**

4. **Mobile WebGPU**: Safari WebGPU support still patchy (May 2026). Fallback to canvas 2D for mobile. **Document, not a blocker.**

5. **GS photogrammetry**: Lane E needs iPhone + Polycam license ($20/month). **Defer to Phase 2.**

---

## Success Criteria

- [ ] Lane A: `/cases/[id]/view` shows clickable timeline with evidence badges, exports ZIP
- [ ] Lane B: Timeline event → ComfyUI still frame in <30s (end-to-end)
- [ ] Lane C: SceneIntent → Blender MP4 in <2min (CPU), <30s (GPU)
- [ ] Lane D: WebGPU viewer shows actors walking on paths, with correct animations
- [ ] E2E: Legal case → 3-part video (timeline + stills + animation) with admissibility overlays

---

## References

- `CLAUDE.md` § Reconstruction 3-Track Architecture (May 8, 2026)
- `memory/reconstruction-3-tracks.md`
- `src/lib/server/reconstruction/crime-scene-schema.ts` (Zod schemas)
- `src/lib/server/reconstruction/scene-intent-extractor.ts` (LLM extraction)
- `src/lib/server/reconstruction/scene-compiler.ts` (Blender script generation)
