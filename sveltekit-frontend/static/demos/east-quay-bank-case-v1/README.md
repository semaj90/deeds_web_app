# Parent Atlas — East Quay fictional robbery training case

**Entirely fictional:** case `PA-DEMO-ROBBERY-001`. Eight scenes, eleven events, eight people, nine synthetic evidence records, five interview transcripts, eight illustrated avatars. No city GPS or real media. No accused person's portrait is real, and no portrait constitutes identification evidence.

## Quick start

```bash
npm test
npm run test:python
npm run serve
```

Browse `http://localhost:8000/examples/case-explorer.html`. The explorer works without any CDN: case loader, mapped scene anchors, persons, events, linked evidence, full transcript viewer and prosecutor review checklist. Use a local HTTP server; opening `file://` prevents JSON module loading in many browsers.

## Key files

- `data/case.json`: single canonical synthetic case fixture with named persons, timelines, scenes, coordinate spaces, event refs, evidence, character tracks, source/review flags.
- `data/fixture-summary.json`: expected counts for smoke testing.
- `portraits/*.svg`: eight distinct *synthetic* avatar illustrations, never photographs.
- `evidence/*.json`: nine fabricated evidence **synopses**, not actual recordings.
- `transcripts/*.json`: five complete synthetic interview records with line IDs and timestamps.
- `transcripts/*.md`: readable transcript copies.
- `docs/SCENARIO_AND_PROSECUTOR_REVIEW.md`: detailed story, prosecutor issue-spotting, conflicts and next investigative actions.
- `src/case-registry.mjs`: reads/validates case person/event/evidence records.
- `src/scene-bridge.mjs`: builds event-bound, illustrative character plans; optional check before save.
- `src/poi-portrait-three.mjs`: optional `three` browser module: head-attached portrait card or UV-mapped preview.
- `examples/case-explorer.html`: self-contained UI (no Three.js dependency).
- `examples/sveltekit-integration.md`: copy/adapt into your existing scene manager; does not create a new renderer.
- `tests/`: Python artifact-integrity tests and Node fixture/readback tests.

## Data boundaries

The entire package is `SYNTHETIC_TRAINING_NOT_EVIDENCE`. A written synthetic camera synopsis is **not** a real CCTV file. An SHA-256 digest on a synthetic file confirms only fixture-byte integrity. There is no measured geographic transform; local world anchors are arbitrary and deliberately separate from case-authoritative geo fields.

To use in a real case: require authenticated case-scoped artifact reads, individual source/media hashes, original evidence and revision IDs, manual linkage and review. Preserve source media separately from generated/edited meshes. Never add prosecutor allegations as actor attributes that the renderer treats as facts.

## Relationship to the preceding starter kit

The previously generated `parent_atlas_humanoid_mesh_logic_v2.zip` has the body/face generator and sample GLBs; this case kit adds a separate event/evidence-aware fixture and optional portrait UV bridge, and **does not replace** your existing `ScenePrimitiveManager`, canvas, BVH, animations, evidence board, PostgreSQL, or SeaweedFS. The visual case explorer is independent of the Three.js scene.

**Coordinate convention:** +Y up, +Z forward, meters, independent local coordinate spaces for bank/interview rooms. No inferred latitude/longitude. Event animation must be bound to reviewed event ID, case ID, evidence ID, scene revision and overlapping source-time window.
