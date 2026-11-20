# CASE-SCENE-E2E-01B — Verified Mesh Seed + Five-Scene Fixture

**Scope:** isolated fictional Morrow Bay demo fixture only. No production case/evidence/asset writes, no SeaweedFS writes, no real source media, and no authorized staging scene.  
**Repository HEAD at verification:** `b283b7436c1ecc5d8a380784a8ec974b64f6c7ab` (working tree had unrelated pre-existing changes).

## GAN status

- **CREATED — PASS:** `scripts/reconstruction/build-case-scene-e2e-01b.py` generates the placeholder GLB first, hashes the produced bytes, then serializes the five-scene JSON using that hash and byte length. The generated GLB is 6,476 bytes with SHA-256 `1b504412f5a38abf30a5b7522a203495eb237743b8a4c4a7c451a7e784bef076`.
- **WIRED — PASS (static/app route):** the JSON is stored in `src/lib/server/reconstruction/fixtures/state-v-unidentified-participants-e2e-01b.json`; the GLB is stored under the synthetic-only `static/demos/morrow-bay-case-scene-e2e-01b/assets/` path. `case-scene-e2e-01b-v1.ts` validates fixture shape, references, clocks, read-only status, GLB magic/length/SHA-256, and returns only a fixture-scoped public asset URL. `/demos/morrow-bay-case-scene-e2e-01b` loads scenes through the existing `ScenePrimitiveManager` and displays separate event source clocks. Browser rendering/reload has not been observed.
- **PROVEN — PASS (offline scope):** generator output, fixture validator, server readback and Three.js GLTF parsing matched. The fixture has 5 scenes, 6 people, 7 events, 8 unmaterialized evidence metadata stubs, 2 synthetic transcripts, 6 unresolved review questions and 1 unresolved identity-link proposal. Scene origins are `[0,0,0]`; `CLK-BANK-CAM` and `CLK-BANK-SYS` are separate registry entries; the transit offset remains provisional and unapplied. The placeholder is 1 scene, 1 mesh and 124 triangles. Package tests: 13 Python and 5 Node passed. The adversarial cases include altered asset hash/bytes and fixture promotion/write denial in the supplied package tests.
- **DONE — PARTIAL:** the 01B offline seed/readback milestone is implemented, but the UI has not been browser-rendered or reloaded in a browser. Do not close 01B until that focused browser proof is captured. This does not close the broader CASE-SCENE-E2E-01 task or prove 01C production persistence.

## Key corrections applied

- The Morrow Bay fixture uses its own `CASE-MB-2026-001` demo namespace and title; it is separate from East Quay.
- The package used a fixture-local UUID-shaped key. The generated asset manifest now labels it `DEMO_FIXTURE_LOCAL_NOT_DATABASE_ID`; PostgreSQL remains the owner of real asset UUIDs.
- Added an alarm-log metadata stub using `CLK-BANK-SYS` and kept camera footage on `CLK-BANK-CAM`. The camera event and system event are not merged. The 90-second transit offset remains an unapproved hypothesis.
- Fixture reads do not depend on `SCENE_PERSISTENCE_ENABLED`; this route has no save/write control and calls no DB or object-store writer. Production asset read/write routes remain unchanged and gated.

## Exact commands and observations

1. `python scripts/reconstruction/build-case-scene-e2e-01b.py`

   Output:

   ```text
   Wrote sveltekit-frontend\static\demos\morrow-bay-case-scene-e2e-01b\assets\neutral-contour-placeholder.glb 6476 bytes sha256=1b504412f5a38abf30a5b7522a203495eb237743b8a4c4a7c451a7e784bef076
   Wrote sveltekit-frontend\src\lib\server\reconstruction\fixtures\state-v-unidentified-participants-e2e-01b.json: 5 scenes, 6 people, 6 review questions
   ```

2. `python scripts/reconstruction/validate-case-scene-e2e-01b.py`

   Output: `PASS: hashes, GLB header, 5 scenes, 6 people, cross-references, clocks, transcripts and demo-only boundaries`.

3. Supplied package commands, run in the extracted review copy at `scratch/case-scene-e2e-01b-review/parent_atlas_case_scene_e2e_01b/`:

   `python scripts/validate_fixture.py; python -m unittest discover -s tests -v; node --test tests/write-gate.test.mjs`

   Result: 13/13 Python tests and 5/5 Node tests passed. These are the supplied package tests; they do not prove production routes or database writes.

4. Server readback smoke:

   `node --input-type=module -e "import {readCaseSceneE2E01BFixtureV1} from './src/lib/server/reconstruction/fixtures/case-scene-e2e-01b-v1.ts'; const r=await readCaseSceneE2E01BFixtureV1(); console.log(JSON.stringify({title:r.fixture.case.title,scenes:r.fixture.scenes.length,people:r.fixture.person_registry.length,events:r.fixture.scenes.reduce((n,s)=>n+s.timeline_proposals.length,0),asset:r.asset}));"`

   Output confirmed title, counts, 6,476 bytes, fixture-local asset UUID scope, and the same SHA-256 as the actual static file.

5. Adversarial cross-clock probe: deep-copied the fixture in memory, changed the exterior camera event clock to `CLK-BANK-SYS` while retaining its camera evidence refs, and called the repository validator.

   Output: `PASS: cross-clock event merge rejected without changing fixture files`.

6. Three.js parser smoke with installed `GLTFLoader.parseAsync`:

   Output: `{"parsed":true,"sceneCount":1,"nodeCount":1,"meshCount":1,"triangles":124,"bytes":6476}`.

7. `npm run check:native` in `sveltekit-frontend`:

   Result: 2,171 files scanned, 11 errors, 0 warnings. All 11 diagnostics are existing in `src/lib/components/evidence/StorybookAuthorities.svelte` and `src/routes/api/cases/[id]/storybook-authorities/+server.ts`; none point to the 01B files.

8. `git diff --check -- scripts/reconstruction/build-case-scene-e2e-01b.py scripts/reconstruction/validate-case-scene-e2e-01b.py sveltekit-frontend/src/lib/server/reconstruction/fixtures/case-scene-e2e-01b-v1.ts 'sveltekit-frontend/src/routes/(app)/demos/morrow-bay-case-scene-e2e-01b' openspec/changes/crime-scene-reconstruction/tasks.md`

   Result: no whitespace errors (Git emitted only the existing LF-to-CRLF normalization warning for `tasks.md`).

## Remaining proof

- Open the demo in Chromium, verify the GLB appears, switch all five scene chapters, and confirm each uses its own actor appearances/events and source clock label.
- Add a browser assertion that fixture mode exposes no save/promotion action and that the fixture UUID/hash never enter production case asset endpoints.
- CASE-SCENE-E2E-01C remains separate: use an authorized nonfixture staging scene for PostgreSQL/SeaweedFS save, revision readback and browser reopen.

## OpenCode structured status

- `likely_cause`: The downloaded 01B fixture existed only as a standalone package and did not provide an app-owned seed/readback path.
- `evidence`: Generator output and commands above; `scripts/reconstruction/build-case-scene-e2e-01b.py`; `scripts/reconstruction/validate-case-scene-e2e-01b.py`; `sveltekit-frontend/src/lib/server/reconstruction/fixtures/case-scene-e2e-01b-v1.ts`; `sveltekit-frontend/src/routes/(app)/demos/morrow-bay-case-scene-e2e-01b/+page.svelte`; native checker output above.
- `patch_targets`: `scripts/reconstruction/build-case-scene-e2e-01b.py`; `scripts/reconstruction/validate-case-scene-e2e-01b.py`; `sveltekit-frontend/src/lib/server/reconstruction/fixtures/case-scene-e2e-01b-v1.ts`; `sveltekit-frontend/src/lib/server/reconstruction/fixtures/state-v-unidentified-participants-e2e-01b.json`; `sveltekit-frontend/static/demos/morrow-bay-case-scene-e2e-01b/assets/neutral-contour-placeholder.glb`; `sveltekit-frontend/src/routes/(app)/demos/morrow-bay-case-scene-e2e-01b/`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `cd sveltekit-frontend; npm run dev`
- `smoke_command`: `cd ..; python scripts/reconstruction/validate-case-scene-e2e-01b.py`
- `report_path`: `docs/reports/case-scene-e2e-01b-verified-mesh-seed-20261120.md`
