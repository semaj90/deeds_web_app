# Synthetic skeletal-rig recipe v1 — isolated bridge gate

Status: **CONTRACT_AND_TESTS_COMMITTED — NOT_EXECUTED — NOT_INTEGRATED**.

This proposal is separate from the primitive-object transform animation recipe and the case-scene authorization PR #134. It is a new *synthetic* schema contract only; it must not be routed to case upload, SeaweedFS, database, evidence index, or the live courtroom.

## Source owner and intended use

- Validation owner: `sveltekit-frontend/src/lib/courtroom/synthetic-skeletal-rig-recipe-v1.ts`.
- Runtime rig-math owner: `rest-pose-retarget-v1.ts` and `character-retarget-runtime-v1.ts`. Do not duplicate bone mapping or retargeting code.
- Scene compiler owner: existing SceneIntent and deterministic compiler. An LLM emits proposals, never a Blender script without validation and operator control.
- Existing object-transform clips and local Blender MCP outputs are unchanged.

## Fixture contract

The new strict Zod schema accepts only original `synthetic_fixture` assets with `non_evidence` authority and `isolated_scratch` output scope; meters, explicit right-handed Y-up coordinates, 24/30/60 FPS, exactly one parents-first root, unique bones, unit quaternions, bounded finite transforms, ordered keyframes, known target bones and bounded clips. Optional root translation must be explicitly declared. It validates an eight-second fixture (192 output frames at 24 FPS), but **no Blender/GLB generation or GPU render has been executed** by this PR.

## Follow-on gates (not included)

1. In the **local Blender MCP workspace**, inspect the exact current primitive schema and Python bridge, then add a separate skeletal recipe tool, never reinterpret existing object-transform keyframes.
2. Make the Blender Python bridge construct an Armature with explicit rest transforms, weights, inverse-bind matrices and keyed pose bones; use deterministic export settings. Record axis/unit conversion explicitly and fail on missing targets.
3. Export a **new synthetic** GLB under a unique isolated scratch path (do not overwrite existing `codex-animation-mcp-20261105.glb` or the animation receipt). Generate SHA-256 and a manifest identifying Blender version, source revision, clip names and coordinate transforms.
4. In the actual playground/courtroom renderer, prove named animation clips, skinned mesh bindings and timeline sampling at 0/4/8 seconds. Compare visible vertex poses, including child-bone motion, not just clip existence.
5. Perform a bounded browser E2E test and record deterministic frame-by-frame results at 24 FPS, screenshot diffs, disposal/no GPU leaks and expected memory bounds.
6. Only after PR #134 and *all* additional case-scoped retrieval/storage authorization gates pass, design case save/reload of calibrated anchors and marker references.
7. Qualify SPZ v4/SOG LOD **in the renderer that actually owns the case viewer**, using real fixture decode, calibration, view correctness, disposal, repeated load/unload and measured GPU memory/frame timings. An 8 MiB file-size target is not visual-quality or GPU-performance evidence.

## Local verification

```sh
cd sveltekit-frontend
npx vitest run src/lib/courtroom/synthetic-skeletal-rig-recipe-v1.spec.ts
npm run check:fast
```

These commands are **suggested, not run** via the GitHub connector. Verify the resulting branch against local uncommitted changes before cherry-picking.

## Blockers

- The provided `.tmp/atlas/blender-scene-recipe-animation-2026-11-05.json` and `.tmp/blender-mcp-workspace/smoke/codex-animation-mcp-20261105.glb` are workstation-local and were **not inspected**.
- No GitHub-tracked Blender primitive recipe/MCP Python bridge corresponding to these local files was located in `main`; cannot attest integration.
- `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md` was not found in the current GitHub `main` checkout.
- PR #134 remains draft, with no CI workflow result observed at review time. Do not merge or imply a secure case-scene rollout.
