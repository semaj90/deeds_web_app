# East Quay fictional bank case kit review

Date: 2026-11-19

Scope: review of `C:\Users\james\Downloads\parent_atlas_east_quay_fictional_bank_case\parent_atlas_bank_case_demo` for possible use in the crime-scene reconstruction workflow. The initial review was read-only; the user later requested copying the fixture subset, recorded below.

## Conclusion

Use this package as a richer synthetic training fixture with an app-owned adapter and explicit demo path. A fixture subset has now been copied into the app, but it is not wired into the live Case Scene workflow. Do not seed its identifiers or narrative records into a real case. It is not a drop-in production Three.js integration: its integration sample depends on missing humanoid modules, its case identifiers do not match the app's UUID case contract, and its client booleans cannot authorize portraits or scene writes.

## Inventory and observed checks

The package includes `data/case.json`, nine evidence synopsis JSON files, five transcript JSON/Markdown pairs, eight SVG portraits, a 42 KB sample GLB, three `.mjs` helpers, a standalone HTML explorer, and a Python fixture builder. The case JSON describes eight scenes, eleven events, eight people, nine evidence entries and five transcripts.

Exact read-only audit command:

```powershell
$root='C:\Users\james\Downloads\parent_atlas_east_quay_fictional_bank_case\parent_atlas_bank_case_demo'; $case=Get-Content -LiteralPath "$root\data\case.json" -Raw | ConvertFrom-Json; $portraitChecks=@($case.people | ForEach-Object { $p=$_; $file=Join-Path $root $p.portraitAsset.path; [pscustomobject]@{exists=(Test-Path -LiteralPath $file);matches=((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $p.portraitAsset.sha256)} }); [ordered]@{classification=$case.classification;caseId=$case.caseId;scenes=$case.scenes.Count;events=$case.events.Count;people=$case.people.Count;evidence=$case.evidence.Count;mediaPresent=@($case.evidence|Where-Object mediaPresent).Count;transcripts=$case.transcripts.Count;portraits=$portraitChecks.Count;portraitFilesExist=@($portraitChecks|Where-Object {!$_.exists}).Count -eq 0;portraitHashesMatch=@($portraitChecks|Where-Object {!$_.matches}).Count -eq 0;geoCoordinates=$case.location.geoCoordinates} | ConvertTo-Json -Compress
```

Exact observed output:

```json
{"classification":"SYNTHETIC_TRAINING_NOT_EVIDENCE","caseId":"PA-DEMO-ROBBERY-001","scenes":8,"events":11,"people":8,"evidence":9,"mediaPresent":0,"transcripts":5,"portraits":8,"portraitFilesExist":true,"portraitHashesMatch":true,"geoCoordinates":null}
```

The workspace revision at review time was `b283b7436c1`. The package README claims 18 validation tests; those tests were inspected but not run in this review. Portrait digest agreement proves only the downloaded SVG bytes match the package manifest, not source evidence or identity.

## Integration fit

- **Fixture data:** The case is explicitly `SYNTHETIC_TRAINING_NOT_EVIDENCE`; evidence entries are `SYNTHETIC_FIXTURE`, and every evidence item has `mediaPresent: false`. The ISO timestamp ranges are synthetic referenced intervals, not original recordings. Keep that distinction visible in every screen and export.
- **Identifiers:** `PA-DEMO-ROBBERY-001`, `SC-*`, `EV-*`, `POI-*`, and `E-*` are demo keys. The app's case APIs and scene persistence use UUID case/scene identities. An adapter may keep these as fixture-local IDs, but it must not use them as PostgreSQL identity or submit the fixture to production writes.
- **Time and coordinates:** The data has separate `bank_site`, interview-room, and review coordinate spaces, plus source time-coverage ranges. It does not provide a complete reviewer-approved cross-clock alignment. Preserve source time and coordinate-space IDs; leave clock offsets and cross-space transforms unresolved until separately reviewed. The local XYZ anchors are illustrative despite the package's meter convention.
- **Registry helper:** `src/case-registry.mjs` provides pure reference checks for cross-references and `src/scene-bridge.mjs` creates an explicitly illustrative event plan. They do not perform database authorization, durable identity resolution, object-store readback, or scene revision persistence. They may inform an app-owned typed adapter; they must not become a second canonical registry.
- **Portrait adapter:** `src/poi-portrait-three.mjs` uses browser-only Canvas2D/Three.js and supports portrait cards or UV paint. Its `authorized` and `sourceApproved` arguments are client booleans, so they cannot grant access. The caller must obtain an authorized asset URL from the server. It also expects `actor.joints.get(...)` and a named UV head mesh. The current `CrimeSceneViewer3D.svelte` actor is a hand-built crouched mesh group without that joint registry.
- **Missing integration dependencies:** `examples/sveltekit-integration.md` imports `humanoid-three.mjs`, `humanoid-math.js`, and `poseHumanoid`, but these files are not in this package. The app's imported face starter provides face geometry and hair cards, not the complete articulated humanoid interface assumed by the snippet. The sample GLB is a separate asset and is not currently pinned by the participant registry; its SHA-256 differs from the app's `static/models/detective-actor-v1.glb`.
- **Animation save:** `validateAnimationSaveBinding()` is a client/local-fixture helper and accepts a caller-supplied `reviewed` boolean. Production must re-read the authorized scene revision, event decision, evidence hash, and time binding on the server before accepting any animation output.

## Recommended adoption sequence

1. Copy only the case JSON, synthetic evidence synopses, transcripts, and SVGs into a versioned fixture-only directory. Preserve their relative artifact paths and checksums. Add an app-owned Zod contract that checks all IDs, references, source clocks, coordinate spaces, provenance labels, and `mediaPresent: false` status.
2. Add a demo-only case selector/view that displays the eight scenes, source intervals, eight participants, evidence links, five transcripts, conflicts, and unknowns. Keep it separate from real case records and the authenticated evidence board.
3. Adapt scene plans into the existing viewer and actor registry. Reuse the current renderer; add a deliberate head attachment contract if portraits are previewed. Label all meshes and tracks `ILLUSTRATIVE` and never infer person identity from portrait similarity.
4. Only after the demo path is reviewed, map the workflow onto authenticated case/evidence IDs and existing scene revision/asset owners. Server-side authorization, reviewer decisions, immutable artifact hashes and fresh readback remain required.

This package advances **fixture content** and provides reference logic, but it does not advance the app's live scene save/reopen, authorized evidence binding, cross-clock review, or GLB animation export gates.

## Typed demo integration (2026-11-19)

The fixture registry and scene planner now have TypeScript declaration files. `case-fixture-v1.ts` validates the downloaded case with a Zod contract and then runs the package's referential-integrity checks. The existing `scene-intent-2d` server loader parses the fixture, and `EastQuayFixturePanel.svelte` lets a user select a scene and event, inspect source times/status, see linked synthetic portraits, and view the deterministic actor-placement result. The panel is read-only and labels all placements as illustrative; it does not use client flags to authorize access or write scene state.

The local smoke readback passed: 8 people, 8 scenes, 11 events, 9 evidence summaries, and 5 transcripts; selecting `SC-02` / `EV-005` produced one actor and retained `ILLUSTRATIVE_ONLY` / `ILLUSTRATIVE_BLOCKOUT_NOT_OBSERVED`. Final `npm run check:native` completed with 11 existing errors and 0 warnings, all errors in `StorybookAuthorities.svelte` and the `storybook-authorities` API route; the new integration files had no diagnostics. The static demo GLB was structurally readable as GLB 2.0 (42,096 bytes; 21 meshes; no skin, animation, materials, or images).

The CanvasTexture portrait helper remains unused because it expects a joint/head interface the existing Detective Mode actor does not expose. The download contains no TypeScript implementation, PostgreSQL/Drizzle migration, C++/N-API, WASM, or Cython source to compile. No new database schema is warranted for this fixture; production persistence still belongs to the existing authorized scene asset and revision routes, currently gated by `SCENE_PERSISTENCE_ENABLED`.

## Copy follow-up

At the user's request, the runtime fixture subset was copied without changing its contents:

- Static synthetic demo bundle: `sveltekit-frontend/static/demos/east-quay-bank-case-v1/` (data, evidence synopses, transcripts, portraits, docs, examples, and README).
- App source helper bundle: `sveltekit-frontend/src/lib/scene/procedural/parent-atlas-east-quay-case-v1/` (`case-registry.mjs`, `scene-bridge.mjs`, and `poi-portrait-three.mjs`).
- Existing `scene-intent-2d` demo now links to `/demos/east-quay-bank-case-v1/examples/case-explorer.html`, making the copied scenario and its scene/evidence/transcript panels reachable inside the app.
- The standalone package runner, package manifest, fixture builder, and package test files were not copied. The three package helpers remain reference modules; typed declarations and an app-owned fixture parser now consume the registry/planner in the synthetic demo, while the CanvasTexture portrait helper remains unconsumed.

Copy command scope: validate both new destinations are under the repository and absent, create them, `Copy-Item` the six fixture directories and README to the static demo directory, then copy the three helpers to their isolated source directory. The command reported `COPY_COMPLETE`, 35 static files, and 3 helper modules.

Exact post-copy audit command:

```powershell
$source='C:\Users\james\Downloads\parent_atlas_east_quay_fictional_bank_case\parent_atlas_bank_case_demo'; $dest='C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\static\demos\east-quay-bank-case-v1'; $sourceJson=Join-Path $source 'data\case.json'; $destJson=Join-Path $dest 'data\case.json'; $sourceCase=Get-Content -LiteralPath $sourceJson -Raw|ConvertFrom-Json; $destCase=Get-Content -LiteralPath $destJson -Raw|ConvertFrom-Json; $portraitMatch=@($sourceCase.people | ForEach-Object { $person=$_; $src=Join-Path $source $person.portraitAsset.path; $dst=Join-Path $dest $person.portraitAsset.path; (Test-Path -LiteralPath $dst) -and ((Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash) }).Where({$_ -eq $false}).Count -eq 0; [ordered]@{staticFileCount=(Get-ChildItem -LiteralPath $dest -Recurse -File).Count;helperModuleCount=(Get-ChildItem -LiteralPath 'C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\scene\procedural\parent-atlas-east-quay-case-v1' -File).Count;caseJsonHashMatches=((Get-FileHash -LiteralPath $sourceJson -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $destJson -Algorithm SHA256).Hash);portraitHashesMatch=$portraitMatch;sceneCount=$destCase.scenes.Count;evidenceCount=$destCase.evidence.Count;classification=$destCase.classification} | ConvertTo-Json -Compress
```

Exact output:

```json
{"staticFileCount":35,"helperModuleCount":3,"caseJsonHashMatches":true,"portraitHashesMatch":true,"sceneCount":8,"evidenceCount":9,"classification":"SYNTHETIC_TRAINING_NOT_EVIDENCE"}
```

No package tests or app checks were run. The tracked task ledger passed `git diff --check`; Git printed only its LF-to-CRLF normalization warning.

## OpenCode structured status

- `likely_cause`: The downloaded kit adds a richer synthetic scenario but its IDs, actor interface and trust assumptions do not match the production app contracts.
- `evidence`: The audit output above; `src/case-registry.mjs`; `src/scene-bridge.mjs`; `src/poi-portrait-three.mjs`; `examples/sveltekit-integration.md`; app `CrimeSceneViewer3D.svelte` `createDetectiveActor()`.
- `patch_targets`: `sveltekit-frontend/src/lib/scene/procedural/parent-atlas-east-quay-case-v1/case-fixture-v1.ts`; `sveltekit-frontend/src/lib/scene/procedural/parent-atlas-east-quay-case-v1/case-registry.d.mts`; `sveltekit-frontend/src/lib/scene/procedural/parent-atlas-east-quay-case-v1/scene-bridge.d.mts`; `sveltekit-frontend/src/routes/(app)/demos/scene-intent-2d/EastQuayFixturePanel.svelte`; `sveltekit-frontend/src/routes/(app)/demos/scene-intent-2d/+page.server.ts`; `sveltekit-frontend/src/routes/(app)/demos/scene-intent-2d/+page.svelte`; `openspec/changes/crime-scene-reconstruction/tasks.md`; `docs/reports/east-quay-fictional-case-kit-review-20261119.md`.
- `safe_next_command`: `cd sveltekit-frontend; npm run check:native`
- `smoke_command`: `node --input-type=module -e "import {readFile} from 'node:fs/promises'; import {parseEastQuayCaseFixtureV1} from './src/lib/scene/procedural/parent-atlas-east-quay-case-v1/case-fixture-v1.ts'; import {planIllustrativeEvent} from './src/lib/scene/procedural/parent-atlas-east-quay-case-v1/scene-bridge.mjs'; const c=parseEastQuayCaseFixtureV1(JSON.parse(await readFile('./static/demos/east-quay-bank-case-v1/data/case.json','utf8'))); console.log(planIllustrativeEvent(c,'SC-02','EV-005').actors.length)"`
- `report_path`: `docs/reports/east-quay-fictional-case-kit-review-20261119.md`
