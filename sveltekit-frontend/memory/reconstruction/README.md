# Crime Reconstruction — Phase 0B (deterministic compiler)

This directory holds compiled artifacts from the crime-scene compiler.
Files here are **generated** — do not edit by hand. The compiler is
deterministic: same input plan produces byte-identical output (modulo
the embedded `compiled_at` timestamp).

## Architecture (one principle)

**LLM is the planner, the compiler is the renderer.** Gemma4/Qwen emit
Zod-validated `CrimeScenePlan` JSON; the deterministic TypeScript
compiler turns it into Blender Python + scene metadata. The LLM never
writes Three.js or Blender code directly. Same plan → same render is
load-bearing for legal/audit review.

## Files in this directory

| File | Origin | Purpose |
|------|--------|---------|
| `demo-scene.py` | `compile-demo-scene.mjs` | Generated Blender Python — ready for `blender --background --python demo-scene.py` |
| `demo-scene-metadata.json` | `compile-demo-scene.mjs` | Annotations, actors, events, plan_hash for the WebGPU detective viewer |

## What this phase does NOT do

- ✗ Call Gemma4 / Qwen / any model
- ✗ Shell out to Blender
- ✗ Add Blender MCP tools
- ✗ Call ComfyUI
- ✗ Run TRELLIS image-to-3D
- ✗ Write to Postgres / Redis / Qdrant / Neo4j
- ✗ Download external assets

It compiles a hand-written `CrimeScenePlan` to a Blender script string +
a metadata JSON. That's it. Phase 1 (LLM extractor), Phase 2 (Mixamo
asset registry), Phase 3 (headless Blender RabbitMQ worker) build on
top of this once the compiler is stable.

## Source files

- Schema: [src/lib/server/reconstruction/crime-scene-schema.ts](../../src/lib/server/reconstruction/crime-scene-schema.ts)
  - `ACTION_ALLOWLIST` — 7 verbs (idle, walk, run, fall, strike, turn, kneel). License-safe Mixamo mapping.
  - `MIXAMO_ACTION_MAP` — verb → Mixamo asset filename. Compiler-only resolution; LLM never picks an asset.
  - `CrimeScenePlanSchema`, `CrimeSceneEventSchema`, `ActorSchema`, `AnnotationSchema`, `SceneMetadataSchema`.
- Compiler: [src/lib/server/reconstruction/scene-compiler.ts](../../src/lib/server/reconstruction/scene-compiler.ts)
  - `compileCrimeScene(planInput) → { blenderScript, sceneMetadata, planHash }`. Pure function. No I/O.
  - `COMPILER_VERSION` is embedded in metadata for chain-of-custody.
- Demo plan: [scripts/reconstruction/demo-crime-scene.json](../../scripts/reconstruction/demo-crime-scene.json)
  - 4-event alleyway scenario covering walk / idle / fall / run, with a disputed event and 5 evidence IDs.
- Runner: [scripts/reconstruction/compile-demo-scene.mjs](../../scripts/reconstruction/compile-demo-scene.mjs)
  - Loads the plan, calls `compileCrimeScene`, writes results to this directory.

## Run

```bash
cd sveltekit-frontend
npm run reconstruction:compile-demo
```

Or directly:

```bash
node scripts/reconstruction/compile-demo-scene.mjs
node scripts/reconstruction/compile-demo-scene.mjs --plan path/to/other-plan.json
```

## Determinism check

```bash
npm run reconstruction:compile-demo
sha256sum memory/reconstruction/demo-scene.py memory/reconstruction/demo-scene-metadata.json
# Re-run, then re-hash. The .py hash differs only by the `Compiled at:` ISO timestamp comment;
# strip that line and the rest is byte-identical:
grep -v '^# Compiled at' memory/reconstruction/demo-scene.py | sha256sum
```

The compiler's `plan_hash` (in metadata) is the canonical-JSON sha256 of
the input plan. Same plan → same hash regardless of input key order.

## Next phases

See `memory/reconstruction-3-tracks.md` (project memory) and the
`Reconstruction 3-Track Architecture` section in `CLAUDE.md` for the
9-phase build order. Phase 0B is the foundation; Phase 1 swaps the
hand-written JSON for an LLM-emitted `CrimeScenePlan` (Qwen JSON mode,
ACE-retrieved evidence cites). The compiler itself does not change.

## Hard gates (do not skip in later phases)

1. PS1/N64 stylization on environments is the admissibility hedge.
2. Evidence-derived GLBs (TRELLIS) stay near-exact — no PS1 vertex jitter.
3. SHA-256 every 3D asset; log model version; extend `evidenceAuditLog`.
4. No GPU/3D work on the Node main thread — RabbitMQ Python sidecars only.
5. Export bundles must be SHA-256-verifiable (`manifest.txt` in the ZIP).

These rules apply to phases 3+. Phase 0B has no rendering, so they do
not bind here yet — but the compiler is built so they can be enforced
without redesigning anything.
