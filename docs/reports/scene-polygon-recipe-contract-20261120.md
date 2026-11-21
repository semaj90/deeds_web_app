# Scene Polygon Recipe Contract and ESLint Root Resolution

Date: 2026-11-20  
OpenSpec: `crime-scene-reconstruction`, partial `CASE-SCENE-E2E-06c`

## Polygon recipe contract

The existing scene-object recipe now optionally carries polygon holes, an explicit coordinate space (`SCENE_LOCAL` or `SOURCE_IMAGE_PIXELS`), and source image dimensions. The validator checks source-pixel bounds and polygon topology, including hole containment and intersections. These new values participate in the recipe digest when present; legacy recipes keep their prior digest behavior.

This is a contract extension only. The local vertex-editor draft is not yet serialized through the canonical `SceneDocumentV1` and scene-revision save owner. Reviewer revalidation, durable write/readback, and fresh authorized reopen remain open.

Validation:

- Focused Vitest: `scene-object-registry-v1.spec.ts`, `scene-reviewed-polygons-v1.spec.ts`, `reviewed-polygon-mesh-v1.spec.ts` — 3 files, 11 tests passed.
- `npm run check:native` — 2183 files, 0 errors, 0 warnings.
- `npx openspec validate crime-scene-reconstruction --strict` — valid.

## ESLint TypeScript project-root error

The workspace has a repository-root ESLint flat config and a second SvelteKit-local flat config. The root config applied `projectService` to JavaScript helpers as though they were all members of the TypeScript project, while the app-local config did not explicitly anchor parser options. This gave VS Code two candidate TSConfig roots in its workspace context. It is an ESLint configuration resolution issue, not a Svelte page compilation error.

Both configs now use an explicit app/root `tsconfigRootDir` where TypeScript project discovery is enabled. Root ESLint leaves frontend source JavaScript outside the typed project service; the frontend config does the same for `.js`, while anchoring TypeScript/Svelte files to the app directory.

Checked `couchdb-client.js` through both config entry points. Neither reports the `tsconfigRootDir` ambiguity or a project-service parse error. Both report two ordinary `no-unused-vars` warnings in that helper (`name` and `args`); these are not parsing failures. VS Code may need its ESLint server restarted once to reload the flat configs.

## Required status fields

- `likely_cause`: Competing root and SvelteKit ESLint configs left parser project discovery inconsistent, and the root config also applied typed project service to JavaScript helpers outside the TS project.
- `evidence`: Root and app-local `eslint.config.mjs`; the reported two candidate TSConfigRootDirs; root and app ESLint checks for `couchdb-client.js`; native check and focused polygon tests.
- `patch_targets`: `eslint.config.mjs`, `sveltekit-frontend/eslint.config.mjs`, `sveltekit-frontend/src/lib/splat/polygon-prism-validation-v1.ts`, `sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-object-contract-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-object-registry-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-object-registry-v1.spec.ts`, `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `npm exec eslint -- --print-config src/lib/services/couchdb-client.js` from `sveltekit-frontend`.
- `smoke_command`: `npm run check:native` from `sveltekit-frontend`.
- `report_path`: `docs/reports/scene-polygon-recipe-contract-20261120.md`.
