# Scene Authoring Catalog Progress — 2026-11-20

## Result

Added a searchable source-code catalog over the app's existing primitive geometry registry and connected it to the case scene builder. A reviewer can search primitive names and aliases, inspect the default dimensions/collider summary, and add the chosen recipe to the current scene draft. Entries are marked illustrative.

The catalog is a retrieval/index layer. Each result shows the registry's default dimensions and collider plus estimated triangle counts at retro, balanced, and detailed levels. It does not duplicate geometry definitions, create evidence/assets, persist case data, or replace the existing primitive, prefab, scene revision, or asset owners. It is not a `.DS_Store` file: it is typed application metadata with deterministic local lookup.

## Changed files

- `sveltekit-frontend/src/lib/reconstruction/scene-authoring-catalog-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-authoring-catalog-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte`
- `openspec/changes/crime-scene-reconstruction/tasks.md`

## Verification

- Focused Vitest: 1 file, 3 tests passed.
- `npm run check:native`: scanned 2,181 files; reported 11 errors in the pre-existing `StorybookAuthorities.svelte` and its API route, plus 1 warning in the curfew beach demo. No diagnostics were reported for the new catalog or changed builder.
- Browser rendering and authorized scene save/reopen were not run.

## Remaining work

The picker currently indexes primitive recipes only. Searchable prefab assemblies and authorized asset entries need a compatible scene-plan representation and renderer path. The chosen catalog revision is not yet pinned into saved scene data, and lookup is not backed by a revision-aware cache. The corresponding OpenSpec item remains partial.

## Required status fields

- `likely_cause`: The app had geometry and prefab registries, but no searchable authoring index surfaced in the case scene builder.
- `evidence`: `scene-primitive-registry-v1.ts`, `scene-prefab-registry-v1.ts`, `scene-catalog-pack-v1.ts`, the case builder, 3/3 focused tests, and the native check output.
- `patch_targets`: The four changed files listed above.
- `safe_next_command`: `npm exec vitest run src/lib/reconstruction/scene-authoring-catalog-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`
- `smoke_command`: `npm run check:native`
- `report_path`: `docs/reports/scene-authoring-catalog-20261120.md`
