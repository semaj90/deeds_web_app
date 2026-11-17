# Analysis Center production-hardening snapshot

Date: 2026-11-16  
Scope: `/analysis-center`, its server actions, `/api/evidence/search`, the configured llama-server, Bifrost model discovery, and the `dev:gpu` port handoff. This is not a whole-application route or layout audit.

## Current behavior and changes

- The Analysis Center now loads only cases the signed-in actor owns or is assigned to, excludes archived evidence, and requires a case selection for both search and analysis.
- The case selector defaults to a case represented in the authorized recent-evidence list. Changing cases clears stale results and selections. Evidence cards remain paged at 12 per page.
- AI analysis verifies the model actually loaded on the configured llama-server, requires the Gemma 4 Legal identity, retrieves case-scoped passages, and admits only the five highest-ranked passages scoring at least `0.5`. That score floor is a conservative interim gate, not a calibrated production threshold.
- Model output uses a strict JSON schema. Server code constructs the displayed answer, rejects unsupported source references and reasoning-shaped output, and does not invent a confidence percentage. The UI displays the model and server-derived source references.
- The route uses the Dossier cream surface with a Bits UI "Did you mean another case?" dialog.
  Empty search results and analysis abstentions can route to another already-authorized case or
  to the existing `/cases/new` form. The return target is an allowlisted sentinel, and the server
  selects the created case on return only after confirming it appears in the actor's authorized
  case list. No new case API or database owner was added.
- `dev:gpu` now passes its dynamically selected Vite port to `PORT`, `VITE_PORT`, and `PUBLIC_API_URL`. This change applies on the next ordinary `dev:gpu` start; the current server was not restarted.
- Empty search results and low-relevance analysis abstentions now offer a Dossier-styled “Did you
  mean another case?” flow. The choices come only from the existing server-authorized case list;
  selecting another case clears stale results. The flow can navigate to the existing `/cases/new`
  form and return to Analysis Center with the new case selected. The return target is a fixed
  allowlisted value, not a client-provided URL. A newly created empty case offers “Open this case”
  instead of prompting the user to create it again.
- The case-create round trip is WIRED but not yet PROVEN through submission: verification did not
  create a real case or write to PostgreSQL. The contextual ranker is not repurposed to rank cases;
  the current “did you mean” guidance is deterministic routing based on authorized case choices
  and retrieval state. Its modular contract is now tracked separately at
  `openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/specs/authorized-case-routing/spec.md`
  with implementation and proof tasks 10.11–10.14. The current page still contains inline dialog
  markup; component extraction and provider abstraction remain open.

## Port and model/gateway findings

- VS Code task `Dev Server (GPU, detached)` is configured for `runOn: folderOpen` and launches `npm run dev:gpu`.
- The user's startup log shows `dev:gpu` selected `5174` because `5173` was occupied. Inspection identified the `5173` listener as the plain Vite server started earlier for this task; that process was stopped. The `dev:gpu` Vite process on `5174` remains available and `/api/health` returned HTTP 200.
- The currently running Vite process still inherited `PUBLIC_API_URL=http://127.0.0.1:5173`; this explains the OpenTelemetry startup line naming 5173. The startup-script correction has not been exercised until the next restart.
- `http://127.0.0.1:8090/health` returned HTTP 200; `/v1/models` reported `gemma4-legal-iq4xs-direct.gguf`.
- Bifrost `:3040` returned HTTP 200 for `/health` and `/v1/models`, but it advertises only `openai/ornith-1.5-9b` and `ollama/embeddinggemma:latest`; there is no Gemma 4 Legal gateway model alias.
- The checked-in Bifrost semantic-cache config uses a global default cache key. Bifrost model registration and case/revision-scoped cache admission are not established. No Docker config was changed, no Valkey data was written, and no BitFrost warming job was run. Do not warm case-analysis answers until cache identity includes the authorized scope, exact source/retrieval revisions, model identity, and prompt recipe.

## Verification evidence

- Live browser on `http://127.0.0.1:5174/analysis-center`: search for `video` in `General Evidence Uploads` returned five results; page errors: zero.
- Live browser analysis for `rent due grace period`: action returned success, loaded model ID was `gemma4-legal-iq4xs-direct.gguf`, and the answer cited server-issued `[S1]` linked to one retrieved evidence/chunk reference. The result displayed `UNVERIFIED` confidence rather than a fabricated percentage.
- Live browser analysis for `video`: no passage met the interim `0.5` floor; action returned 422 before model inference and showed no generated answer.
- Adversarial invalid case ID on the analysis action returned 403 before retrieval or inference.
- The latest `npm run check:fast` completed with five TypeScript errors and seven warnings. The
  errors are outside this case-routing patch: `opfs-video-cache.ts`,
  `nes-fsm-native-runtime-v1.ts`, `generated-scene-asset-provenance-v1.ts`, and two diagnostics in
  `scene-primitive-registry-v1.ts`. The three Analysis Center rune-state warnings from the previous
  check were fixed; the latest output showed no diagnostics in the edited route pages.
- Scoped `git diff --check` passed. No focused route/action tests exist for the new return contract.
  `:5174` refused connections and the existing `:5173` page request timed out. A temporary plain
  Vite server on `:5175` was started to attempt read-only page proof; app boot then connected to the
  configured database and background services and started queue consumers. It was stopped shortly
  afterward. Startup logged zero expired DAG-cache documents removed, but queue consumption during
  that interval could not be independently checked. No case form was submitted or case record
  intentionally created. `:5175` is no longer listening.

## Readiness ratings for this scoped slice

These are engineering readiness estimates, not measured completion percentages for the application.

| Capability | Readiness | Basis |
|---|---:|---|
| Analysis Center case selection and evidence filtering | 75% | Case-scoped page actions and one forged-case denial were exercised; full access-matrix coverage remains open. |
| Search interaction | 70% | Live case-scoped results render; ranking quality and empty-result guidance need evaluation. |
| Gemma 4 Legal inference | 70% | Live local inference returned a schema-valid answer; broader model quality and failure-mode evaluation remain open. |
| Citation and relevance safeguards | 55% | Source references are constrained to retrieved hits and weak-score hits abstain; source-span/revision validation and threshold calibration remain open. |
| Dossier styling and 12-item layout | 72% | Cream surface, dialog, and pagination are wired; browser visual/accessibility review remains open. |
| Bifrost/BitFrost gateway and cache | 15% | Gateway is healthy but lacks the Gemma alias; safe case-scoped semantic caching and warming are not proven. |
| Recommendation-engine lifecycle | 25% | Existing ranking/context helpers remain disconnected from a durable proposal/review/readback path. |
| Case routing and create handoff | 55% | Authorized-case suggestion and existing create-form return are wired; browser/action proof and cases with no recent evidence still need focused coverage. |
| Overall Analysis Center slice | 54% | Weighted judgment across the capabilities above; not a whole-repository score. |

## Remaining ranked work

| Rank | Work | Readiness target |
|---:|---|---:|
| P0 | Freeze a case-scoped retrieval evaluation set and calibrate the `0.5` score floor with judged relevant/irrelevant passages. | 0% |
| P0 | Validate each citation against persisted source ID, exact chunk span, source hash, and evidence revision; reject stale or mismatched hits. | 15% |
| P0 | Decide whether Gemma 4 Legal should be registered in Bifrost. If so, add an explicit model alias and prove provider routing; keep semantic cache bypassed until its case/revision identity is safe. | 10% |
| P1 | Connect recommendations to the existing recommendation/context owners, then persist reviewable proposals through the current authorized owner and verify independent readback. | 20% |
| P1 | Add route-level specs for empty retrieval, low-score abstention, malformed JSON, invalid citations, model mismatch/offline, and cross-case access. | 10% |
| P1 | Add explicit progress, retry, cancellation, and reviewer accept/reject states; do not imply that displayed analysis is a saved finding. | 10% |
| P2 | Review all ten Analysis Center tool modules and their routes individually; this snapshot does not score their nested workflows. | 0% |
| P2 | Restart `dev:gpu` through the normal VS Code task when convenient and verify the startup log reports the actual selected port for Vite, telemetry, and internal callbacks. | 50% |

## GAN status

- **CREATED:** Case selector, Dossier cream routing dialog, dynamic-port environment handoff, source-constrained schema output, and interim relevance floor.
- **WIRED:** Analysis Center search and Gemma 4 Legal local inference through the authorized case action.
- **WIRED:** Empty-result case guidance and fixed-return handoff through the existing authorized case-create form.
- **PROVEN:** Earlier live inference/readback, low-score abstention, forged-case denial, and browser page with no errors. The new modal/creation handoff is not browser-proven.
- **DONE:** No. Citation-to-source-span verification, judged ranking evaluation, safe gateway/cache configuration, proposal persistence/readback, and full module audit remain open.

`likely_cause`: The workflow had no visible case scope, defaulted to a case with no qualifying retrieval passages, lacked a safe case-routing handoff, expected unsupported analysis output, and advertised a Vite fallback port inconsistently to server-side URL consumers.  
`evidence`: `analysis-center/+page.server.ts`, `analysis-center/+page.svelte`, `scripts/startup/dev-gpu-runtime.mjs`, `.vscode/tasks.json`, `docker/bifrost/config.json`, live health/model probes, and browser action probes recorded above.  
`patch_targets`: `sveltekit-frontend/src/routes/(app)/analysis-center/+page.server.ts`, `sveltekit-frontend/src/routes/(app)/analysis-center/+page.svelte`, `sveltekit-frontend/src/routes/(app)/cases/new/+page.server.ts`, `sveltekit-frontend/src/routes/(app)/cases/new/+page.svelte`, `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`, `openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/tasks.md`.  
`safe_next_command`: `git diff --check -- sveltekit-frontend/src/routes/(app)/analysis-center/+page.server.ts sveltekit-frontend/src/routes/(app)/analysis-center/+page.svelte sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs openspec/changes/parent-atlas-gpu-prellm-recommendation-v1/tasks.md`.  
`smoke_command`: `cd sveltekit-frontend; npm exec -- vitest run src/routes/api/evidence/search/__tests__/search-schema.test.ts`.  
`report_path`: `docs/reports/analysis-center-production-hardening-20261116.md`.
