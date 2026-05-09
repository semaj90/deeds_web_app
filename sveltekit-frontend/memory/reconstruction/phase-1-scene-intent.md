# Phase 1 — SceneIntent Extraction (Detective Mode 3D Reconstruction)

> Shipped 2026-05-08. Implements the smallest meaningful slice from
> [next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md](../../../next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md):
> Gemma4/Qwen → Zod-validated SceneIntent JSON → 2D timeline viewer.
> No Blender. No ComfyUI. No TRELLIS. No Mixamo asset downloads. No DB
> writes. The compiler / Blender / WebGPU layers will plug in later
> against the same `SceneIntent` shape.

## What's in this phase

| Layer | File | Purpose |
|---|---|---|
| Schema (LLM-facing) | [`src/lib/server/reconstruction/crime-scene-schema.ts`](../../src/lib/server/reconstruction/crime-scene-schema.ts) | Added `SceneIntentSchema`, `EnvironmentSchema`, `EvidenceLinkSchema`, `SCENE_INTENT_ACTION_ALLOWLIST` (17 actions), and `sceneIntentToPlan()` projection helper alongside the existing `CrimeScenePlanSchema` (compiler input, 7 actions). |
| Prompt | [`src/lib/server/reconstruction/scene-intent-prompt.ts`](../../src/lib/server/reconstruction/scene-intent-prompt.ts) | Strict system prompt (JSON only, no Blender/Three/WGSL, preserve uncertainty), user-prompt builder, JSON-shape hint. |
| Extractor | [`src/lib/server/reconstruction/scene-intent-extractor.ts`](../../src/lib/server/reconstruction/scene-intent-extractor.ts) | `extractSceneIntent()` — calls `bifrostChat` (3-tier cache automatic), strips fences, validates against Zod, **always returns** a `SceneIntent` with degraded fallback. |
| API | [`src/routes/api/reconstruction/scene-intent/+server.ts`](../../src/routes/api/reconstruction/scene-intent/+server.ts) | `POST /api/reconstruction/scene-intent` with Zod request validation, optional ACE retrieval, Degraded Response Contract. `GET` returns the degraded fixture for schema introspection. |
| Demo fixture | [`scripts/reconstruction/demo-scene-intent.json`](../../scripts/reconstruction/demo-scene-intent.json) | Hand-written 4-event alleyway altercation, 12s, mixed confidence levels, two disputed events. |
| 2D viewer | [`src/routes/(app)/demos/scene-intent-2d/+page.svelte`](../../src/routes/%28app%29/demos/scene-intent-2d/+page.svelte) + `+page.server.ts` | Loads fixture from disk via Zod-validated server load, renders timeline + event grid + actor list + evidence links + per-event annotations. No 3D. |

## What's deliberately out of scope

- Blender headless render (Phase 3)
- ComfyUI workflow integration (Phase 2 / Track 2)
- Microsoft TRELLIS image-to-3D (Phase 4)
- Mixamo asset downloads / license dance (Phase 2)
- WebGPU / Threlte playback (Phase 5)
- ZIP / HTML5 export bundle (Phase 6)
- Gemma4 MCP-to-Blender bridge (Phase 7)

The extraction shape is the bottleneck for everything later — the deterministic compiler, Mixamo registry, scene-metadata layer, and WebGPU player all consume the same `SceneIntent`. Validating the schema end-to-end before adding renderers means later phases plug in without re-shaping the contract.

## Action vocabulary — three sets, reconciled

The codebase had two existing action vocabularies before this phase, and the 3-track architecture in CLAUDE.md asks for a third:

| Vocabulary | Where | Size | Use |
|---|---|---|---|
| `ACTION_ALLOWLIST` (compiler) | `crime-scene-schema.ts` | 7 | Mixamo-mapped, deterministic-compiler input |
| `courtroom_anim_type` (Postgres enum) | `schema-postgres.ts:3927` | 14 | Existing `courtroom_animations` table |
| `SCENE_INTENT_ACTION_ALLOWLIST` (LLM) | `crime-scene-schema.ts` (new) | 17 | LLM emits one of these per event |

`SCENE_INTENT_ACTION_ALLOWLIST` is the union: 7 compiler-mapped + the 7 dialogue/courtroom verbs that overlap with the Postgres enum (point, present_evidence, speaking, objection, sit, stand, gesture) + 3 investigation verbs (search, flee, conceal).

`sceneIntentToPlan()` projects the 17→7 by mapping unmapped actions to the closest Mixamo cousin (e.g. `flee → run`, `conceal → kneel`, `objection → strike`) and returning `warnings[]` so the operator knows which intents lost information. The original action verb is preserved on the `SceneIntent` and surfaces in scene-metadata downstream — only the compiler-bound projection narrows it.

## Failure semantics (Degraded Response Contract)

Per CLAUDE.md every failure path returns the same top-level shape:

```ts
{
  ok: boolean,
  sceneIntent: SceneIntent,         // always populated — buildDegradedFixture() on failure
  source: 'llm' | 'fixture-degraded',
  diagnostics: { durationMs, model, rawLength, parseError?, rawPreview? }
}
```

Failure modes that route to degraded:
- bifrostChat throws (Bifrost down, Ollama down, network issue)
- LLM returns malformed JSON
- JSON parses but fails Zod
- Action enum violation (defense-in-depth — Zod gates this first)
- Auth missing (status 401, body still degraded shape)
- Body not parseable / fails request Zod (status 400, body still degraded shape)

Clients can always destructure `response.sceneIntent.events` etc. without `?.` guards on top-level keys.

## ACE retrieval

Phase 1 wiring is opt-in via `useAce: true` + `caseId`. When set, the route lazy-imports `assembleACEContext`, takes the top 3 KB chunks + top 3 RAG chunks, capped at ~1.5KB of plain prose, passes to the prompt as `aceContext`. ACE failures are non-fatal — the extractor still runs without case context. This is intentionally minimal; richer ACE integration (graph context, hyperedge boosting, persona hints) lands in a later phase once the basic shape is proven.

## Refresh / regression sequence

```bash
# Schema + prompt + extractor (no model call, no DB)
node --check sveltekit-frontend/src/routes/api/reconstruction/scene-intent/+server.ts  # SvelteKit handles compile
# (svelte-check is the canonical TS gate — runs in CI; skip per-turn unless suspicious)

# 4-lane hypergraph + vault smoke (the existing 8-probe gate)
npm run smoke:hypergraph:vault                                                          # ~45ms

# Optional: hit the fixture viewer locally once dev server is up
#   open http://localhost:5173/demos/scene-intent-2d
```

The 2D viewer needs no model and no Redis — `+page.server.ts` reads the JSON fixture via `node:fs/promises` and validates it against `SceneIntentSchema` before rendering. If someone hand-edits the fixture into something invalid, the page falls back to the degraded fixture (same Degraded Response Contract as the API), surfaces `loadError` in a yellow banner, and never 500s.

## What plugs into Phase 1 next

In rough order:

1. **ComfyUI still-frame per event** (Track 2 — Lane B in CLAUDE.md). One workflow_api.json that takes `event.what + event.environment` text, generates a stylized still, attaches `evidence_id` overlay. POST to `/prompt`, poll `/history/{prompt_id}`, attach result to event.annotations with `kind: 'evidence_pin'` and a CDN URL.
2. **Deterministic Blender compiler** (Lane C). Already exists at [`scene-compiler.ts`](../../src/lib/server/reconstruction/scene-compiler.ts) — feed it `sceneIntentToPlan(intent).plan` and it emits Blender Python + `SceneMetadata`.
3. **Mixamo asset registry**. Add the 17→asset-id mapping for the 10 currently-unmapped action verbs (point, present_evidence, speaking, objection, sit, stand, gesture, search, flee, conceal). Phase-1 projection currently routes them to the 7-mapped subset; that's a quality-loss the registry resolves.
4. **`/api/reconstruction/compile`** wraps the compiler behind an HTTP surface so the existing Blender queue workers can consume it.
5. **WebGPU GLB viewer in the existing `/demos/crime-reconstruction` page**. Extend the existing 690-line demo route — don't rewrite. The CRT/PS1 shader at `src/lib/courtroom/crt-postprocess.ts` is already wired.

## Cross-references

- Architecture: [next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md](../../../next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md)
- Hypergraph state (4 lanes + vault, smoke green): [memory/hypergraph-4-lanes-vault.md](../hypergraph-4-lanes-vault.md)
- 3-track architecture in CLAUDE.md §"Reconstruction 3-Track Architecture (May 8, 2026)"
- Companion (different lane): [next_steps/active/2026-05-08_3dgs-forensic-roadmap.md](../../../next_steps/active/2026-05-08_3dgs-forensic-roadmap.md)
- Existing renderer scaffolding (don't rebuild): `src/lib/courtroom/`, `src/lib/gpu/shaders/crime-scene.wgsl`, `src/lib/components/ui/gaming/n64/`

## Diff summary

**Added**:
- `src/lib/server/reconstruction/scene-intent-prompt.ts`
- `src/lib/server/reconstruction/scene-intent-extractor.ts`
- `src/routes/api/reconstruction/scene-intent/+server.ts`
- `src/routes/(app)/demos/scene-intent-2d/+page.server.ts`
- `src/routes/(app)/demos/scene-intent-2d/+page.svelte`
- `scripts/reconstruction/demo-scene-intent.json`
- `memory/reconstruction/phase-1-scene-intent.md` (this file)

**Modified**:
- `src/lib/server/reconstruction/crime-scene-schema.ts` — appended `SceneIntentSchema` + `EnvironmentSchema` + `EvidenceLinkSchema` + `SCENE_INTENT_ACTION_ALLOWLIST` + `sceneIntentToPlan()`. Existing `CrimeScenePlanSchema` and `MIXAMO_ACTION_MAP` unchanged.

**Untouched** (deliberately):
- `src/routes/(app)/demos/crime-reconstruction/+page.svelte` (690 LoC) — the new Phase-1 viewer is a separate route; the existing 3D demo keeps working.
- `src/lib/courtroom/*` — scene state machine, timeline engine, CRT shader.
- `src/lib/gpu/shaders/*.wgsl` — WebGPU pipelines.
- DB schema, Drizzle migrations, RabbitMQ queues, Redis layout.
