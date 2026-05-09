# Reconstruction Track — Production-Ready Status (2026-05-08)

Honest audit of what's actually shipped in the Detective-Mode 3D
reconstruction track vs. what's still scaffolding vs. what's not yet
implemented. Reviewed against the live tree on 2026-05-08.

## Complete

### Phase 0B — Deterministic compiler

- [`src/lib/server/reconstruction/crime-scene-schema.ts`](../../src/lib/server/reconstruction/crime-scene-schema.ts) — Zod schemas for `CrimeScenePlan`, `CrimeSceneEvent`, `Actor`, `Annotation`, `SceneMetadata`, plus the LLM-facing `SceneIntent`/`Environment`/`EvidenceLink` extension and the `sceneIntentToPlan()` projection (17-action SceneIntent → 7-action compiler subset).
- [`src/lib/server/reconstruction/scene-compiler.ts`](../../src/lib/server/reconstruction/scene-compiler.ts) — pure function `compileCrimeScene(plan) → { blenderScript, sceneMetadata, planHash }`. Canonical-JSON sha256 hash, byte-identical re-runs (verified `2240019055…`).
- [`scripts/reconstruction/demo-crime-scene.json`](../../scripts/reconstruction/demo-crime-scene.json) — 4-event demo plan.
- [`scripts/reconstruction/compile-demo-scene.mjs`](../../scripts/reconstruction/compile-demo-scene.mjs) + npm `reconstruction:compile-demo` — runner.
- Generated artifacts: `memory/reconstruction/demo-scene.py`, `demo-scene-metadata.json`.

**Determinism gate:** strip the `Compiled at:` timestamp comment, sha256 — same hash across runs. Confirmed.

### Phase 1 — SceneIntent extractor + 2D viewer foundation

- [`scene-intent-prompt.ts`](../../src/lib/server/reconstruction/scene-intent-prompt.ts) — strict JSON-only system prompt + user-prompt builder.
- [`scene-intent-extractor.ts`](../../src/lib/server/reconstruction/scene-intent-extractor.ts) — `extractSceneIntent()` calls `bifrostChat` (3-tier cache automatic), strips fences, validates against Zod, **always returns** a `SceneIntent` (degraded fallback fixture on failure).
- [`POST /api/reconstruction/scene-intent`](../../src/routes/api/reconstruction/scene-intent/+server.ts) — Zod request validation, optional ACE retrieval, Degraded Response Contract.
- `GET /api/reconstruction/scene-intent` — returns the degraded fixture for schema introspection.
- [`scripts/reconstruction/demo-scene-intent.json`](../../scripts/reconstruction/demo-scene-intent.json) — hand-written 4-event alleyway, 2 disputed events.
- [`/demos/scene-intent-2d`](../../src/routes/(app)/demos/scene-intent-2d/+page.svelte) — Phase 1 viewer (fixture-loaded today; live extractor + Compile loop wired in this commit).

### ComfyUI HTTP Bridge — Phase 0

- [`comfyui-client.ts`](../../src/lib/server/comfyui/comfyui-client.ts) — `ComfyUIClient` (`healthCheck` / `submitPrompt` / `getHistory` / `getViewUrl` / `waitForCompletion`). Network failures return degraded `{ ok: false, error }` — never throws on unreachability.
- [`GET /api/comfyui/health`](../../src/routes/api/comfyui/health/+server.ts), [`POST /api/comfyui/render`](../../src/routes/api/comfyui/render/+server.ts).
- [`scripts/comfyui/smoke-comfyui-client.mjs`](../../scripts/comfyui/smoke-comfyui-client.mjs) + npm `comfyui:smoke` / `comfyui:smoke:strict`.
- [`scripts/comfyui/workflow_api.example.json`](../../scripts/comfyui/workflow_api.example.json) — placeholder workflow shape.

The bridge is HTTP-only. It does not start ComfyUI Desktop, does not download models, does not install custom node packs.

## Scaffold-only

> Routes that exist as honest 501/503 stubs so callers can wire optimistic
> UI today and the implementation can land later without breaking shape.

*None right now.* If/when an `/api/evidence/[id]/glb` stub lands, it must:

- Return **501 Not Implemented** if no TRELLIS workflow JSON exists at the configured path.
- Return **503 Service Unavailable** if ComfyUI is unreachable.
- Make zero MinIO writes, zero Postgres writes, zero Qdrant/Neo4j mutations.
- Emit zero TRELLIS conversions or fake GLB bytes.
- Carry an explicit `"status": "scaffold"` field in the response body so the client can render a "not implemented" affordance instead of pretending success.

If a stub deviates from any of those rules, **revert it**. We'd rather have no route than a route that pretends.

## Not implemented

| Capability | Notes |
|---|---|
| TRELLIS image→GLB workflow_api.json | Operator must install ComfyUI-3D-Pack via Manager and save the API graph |
| Evidence-photo substitution into the workflow | Swap LoadImage node's path before submission |
| GLB output parsing + decimation to <5k tris | PS1-budget |
| GLB SHA-256 + chain-of-custody | Extend `evidence_audit_log` |
| MinIO upload of finished GLB | Bucket `evidence-3d`, content-addressed by SHA-256 |
| `evidence_3d_assets` Drizzle table | `(id, evidence_id, glb_uri, sha256, trellis_model, decimated_tris, created_at)` |
| `evidence_audit_log` write for 3D assets | New event_type `'evidence_3d_render'` |
| RabbitMQ `evidence.render` queue producer + consumer | Python TRELLIS sidecar |
| RabbitMQ `scene.render` queue (Blender headless MP4) | Phase 3 |
| RabbitMQ `scene.export` queue (Node ZIP packer) | Phase 6 |
| Drag-drop evidence-photo UI on the WebGPU canvas | Bits UI Dialog + raycaster |
| IndexedDB scene-state cache | L1 client memory, full scene JSON + asset URIs |
| Web Worker — Fuse.js fuzzy index over scene elements | Off main thread |
| Service Worker — offline cache for the export bundle | Air-gapped review |
| WebGPU scene reducer + `scene.*` MCP tool family | Read-only Gemma4 tool calls; reducer applies validated patches |
| `crime_scenes` Drizzle table + `/api/scene/[id]/export` ZIP | Phase 6 |
| Standalone offline `index.html` viewer template | Three.js single-file ESM, Chrome offline |
| `blender.*` MCP tool family | Phase 7, agents emit intent only |
| Mixamo asset registry + license-safe local cache | Phase 2 |
| Headless Blender Python sidecar | Phase 3 |

## Hard gates (apply to every phase that touches GLB/MP4/render)

1. PS1/N64 stylization on environments (admissibility hedge).
2. Evidence-derived GLBs stay near-exact (no PS1 jitter on TRELLIS output).
3. SHA-256 every 3D asset, log model digest in `evidence_audit_log`.
4. No GPU/3D work on the Node main thread — RabbitMQ Python sidecars only.
5. Export ZIPs are SHA-256-verifiable (`manifest.txt`).

## What changed in this commit

- Added [`POST /api/reconstruction/compile`](../../src/routes/api/reconstruction/compile/+server.ts) — accepts a `SceneIntent`, projects to `CrimeScenePlan`, runs `compileCrimeScene()`, returns `{ sceneMetadata, planHash, projectionWarnings }`. Pure function endpoint, no I/O.
- Wired the Compile loop into [`/demos/scene-intent-2d`](../../src/routes/(app)/demos/scene-intent-2d/+page.svelte): a button that posts the current SceneIntent to the compile endpoint, displays plan_hash + projection warnings + scene metadata preview.
- This document.

## Verification

```bash
npm run reconstruction:compile-demo     # Phase 0B determinism
npm run smoke:hypergraph:vault          # 4-lane + vault index
npm run comfyui:smoke                   # ComfyUI bridge (passes whether ComfyUI is up or down)
```
