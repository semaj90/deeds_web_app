# Scene Generation Job Contract · 2026-11-20

## Result

Added a candidate-only, case-and-scene-scoped durable job contract for future scene generation. The stored request is a validated `SceneGenerationPlanV1`, not arbitrary JSON. Its case, scene, revision, and source references must match the job columns and exact source snapshot. `BLOCKOUT` requires an empty source snapshot; `EVIDENCE_BACKED` requires one or more source snapshots with evidence ID, source revision, and SHA-256. Canonical request hashes and idempotency keys include case, scene, input kind, expected scene revision, the validated plan, and source snapshot.

The job row carries bounded retry and lease fields, progress, terminal failure/source states, and artifact references. An append-only event table records status transitions. The 1 MiB request snapshot limit keeps media/mesh payloads out of the job row. The job stores orchestration only; the existing `scene_document_revisions` owner remains canonical for saved scene content, and `scene_assets` remains the owner for derived bytes. `analysis_jobs.evidence_id` remains required and unchanged.

## Files

- `sveltekit-frontend/drizzle/manual/scene_generation_jobs_v1.sql` — candidate DDL, not applied.
- `sveltekit-frontend/drizzle/sidecar-migrations.json` — registers the migration as `active_candidate` / `not-applied`.
- `sveltekit-frontend/src/lib/server/db/schema/scene-generation-jobs.ts` and `schema.ts` — Drizzle declarations and export.
- `sveltekit-frontend/src/lib/reconstruction/scene-generation-job-contract-v1.ts` — input-kind/source-snapshot validation and bounded status transition rules.
- `sveltekit-frontend/src/lib/server/reconstruction/scene-generation-job-keys-v1.ts` — deterministic SHA-256 request and idempotency keys.
- Focused schema and contract tests cover SQL/Drizzle parity, no fabricated evidence ID, idempotency, request size, retries, and terminal states.

## Verification

- The enqueue service reuses the authorized case plan resolver inside its write transaction. It requires the resolved hash to match the reviewed preview, selects the input kind from the source snapshot, and records the queued job and its first event together. Seven focused enqueue and resolver tests passed with mocked database access. The candidate schema remains unapplied by this work.

- Job lifecycle functions now claim eligible scoped jobs, record a verified recipe result while its lease is valid, and recover expired leases within the attempt budget. The status update and event append share a transaction. Three mocked transaction tests passed. They verify the predicates and transition calls. PostgreSQL transaction isolation and concurrent lease recovery still need a scratch run.

- The recipe worker can now call the existing SeaweedFS client. It issues `If-None-Match: *`, handles a 412 as a possible replay, and in both cases verifies a separate bounded read before returning the bucket, object key, length and SHA-256. Six focused worker/storage tests passed with a mocked S3 transport. The deployed gateway's conditional write behavior still needs a live check.

- The worker handoff now publishes the runtime JSON recipe through an injected storage interface and returns a result after verifying length and SHA-256 on a separate read. The manifest includes the spatial placement index. Ten focused tests passed with in-memory storage, including same-length corruption rejection and exact manifest replay. Live SeaweedFS and PostgreSQL operations remain unverified.

- The procedural compiler accepts the job snapshot and its stored request hash. It recomputes the request and plan hashes and produces bounded recipe bytes with their own SHA-256 receipt. It accepts registered procedural primitives and rejects inputs that require the asset compiler. Ten focused job and runtime recipe tests passed, including deterministic byte replay and rejection of changed hashes and unknown primitives. Worker dispatch and storage readback remain open.

- Focused Vitest: **3 files, 11 tests passed**.
- PostgreSQL 18 scratch rehearsal: **not run**.
- `npm run check:native`: **2181 files, 11 errors, 1 warning**. The errors remain in `StorybookAuthorities.svelte` and `storybook-authorities/+server.ts`; the warning remains in `curfew-beach-scene/+page.svelte`. No diagnostics were reported for the new job contract files.
- No live schema apply, route write, queue publish, worker, or job row was created. No scene persistence feature gate was changed.
- OpenSpec strict validation passed.

## Remaining before durable jobs are operational

1. Rehearse this candidate on an isolated PostgreSQL 18 database and obtain schema admission before applying it.
2. Implement an authorized, idempotent job-admission/read service using the existing case access owner and validate source snapshots atomically at admission.
3. Implement bounded worker claim/lease/retry/cancel behavior and status-event writes; use transactional PostgreSQL state and polling or a reliable outbox before optional RabbitMQ wakeups.
4. Revalidate source revisions before work and before result registration; write only final content through existing asset and scene-revision owners.
5. Prove signed-in browser queue/status/cancel, cross-case denial, independent database/object readback, and fresh-session scene reopen in authorized staging.

**likely_cause:** Scene plans and previews are currently stateless, while the existing evidence-analysis job table requires an evidence ID and cannot represent an evidence-free blockout.

**evidence:** `analysis_jobs.evidence_id` is non-null; plan/parameter routes do not create jobs; the candidate contract tests passed 12/12 and explicitly separate empty blockout snapshots from source-pinned evidence jobs.

**patch_targets:** `sveltekit-frontend/drizzle/manual/scene_generation_jobs_v1.sql`, `sveltekit-frontend/drizzle/sidecar-migrations.json`, `sveltekit-frontend/src/lib/server/db/schema/scene-generation-jobs.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-generation-job-contract-v1.ts`, `sveltekit-frontend/src/lib/server/reconstruction/scene-generation-job-keys-v1.ts`, and OpenSpec task/design files.

**safe_next_command:** `npx vitest run src/lib/server/db/schema/scene-generation-jobs-schema-contract.spec.ts src/lib/server/reconstruction/scene-generation-job-keys-v1.spec.ts --reporter=dot`

**smoke_command:** `npx openspec validate crime-scene-reconstruction --strict`

**report_path:** `docs/reports/scene-generation-job-contract-20261120.md`
# Worker handoff follow-up

Worktree base `2ac62dafe35`. The server runner now claims one admitted job, rechecks the plan for its recorded creator, compiles through the existing artifact worker and rechecks inputs before completing the same lease attempt. Missing and stale plans record a bounded reason in the existing job history. Storage failures still use lease recovery. A recipe written during an input change stays unreferenced by the job. The input recheck and completion are separate operations, so this is a freshness guard with a concurrent-change window.

`npm exec vitest run src/lib/server/reconstruction/run-scene-generation-job-v1.spec.ts src/lib/server/reconstruction/scene-generation-job-lifecycle-v1.spec.ts src/lib/server/reconstruction/scene-generation-worker-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 11 passed (11)`. The runner test compiles and reads back real recipe bytes in memory while mocking the lease and authorization services. It also rejects a missing case before compilation and suppresses completion when the source becomes stale during compilation.

`npm run check:native` returned `COMPLETED 2183 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. From the repository root, `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.

The runner is connected to the code owners. Queue registration, schema admission, live PostgreSQL and SeaweedFS readback, and browser submission remain open.

## Completion transaction follow-up

Worktree base `2ac62dafe35`. The second freshness read moved into the completion transaction. The job owner locks the scoped leased row, verifies its plan hash against the compiled manifest, re-resolves canonical inputs using the same serializable transaction, and rechecks the lease at the update. Stale and missing inputs get a transition without attaching artifact refs. The earlier description of a separate final freshness operation applies to the preceding implementation.

`npm exec vitest run src/lib/server/reconstruction/run-scene-generation-job-v1.spec.ts src/lib/server/reconstruction/scene-generation-job-lifecycle-v1.spec.ts src/lib/server/reconstruction/scene-generation-worker-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 14 passed (14)`. Mocked transitions exercised the lock predicate, identical update fence, transaction-local input check, and rejection of stale and missing sources. Live transaction ordering, serialization failures, queue dispatch, and authorized artifact readback remain open.

`npm run check:native` returned `COMPLETED 2183 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.

## Worker and case API entry points

Worktree base `2ac62dafe35`. The default-off `SCENE_GENERATION_JOBS_ENABLED` setting gates both the case jobs API and dispatch from the existing analysis worker tick. PostgreSQL provides queue order and lease state. Each tick recovers at most eight expirations and selects one eligible job. The existing conditional claim decides ownership. The scene dispatch runs independently of other work on the tick, with one in flight per worker process.

The case jobs route accepts an explicit POST of a resolved plan. Admission re-resolves the plan for the session user in the existing enqueue transaction. GET returns only job ID, scene ID, status and progress after case authorization and a case-scoped lookup. The existing plan preview remains read-only.

`npm exec svelte-kit sync` succeeded. `npm run check:native` returned `COMPLETED 2184 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.

`npm exec vitest run scene-generation-jobs-v1.spec.ts jobs.route.spec.ts run-scene-generation-job-v1.spec.ts enqueue-scene-generation-job-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 4 passed (4)`, `Tests 11 passed (11)`. Mocked boundaries verify the dispatch limits, empty queue, disabled route, denied case access and invalid plan rejection. No staging writes were attempted. UI submission, authorized artifact readback, cancellation and live queue/lease verification remain open.

## Scene Builder submission

Worktree base `2ac62dafe35`. The authorized case loader passes the existing generation job setting to the builder. The job panel submits the exact resolved proposal only on click, retains its status while a local preview is open, and checks both IDs on each status response. Automatic checks stop after 60 attempts, when a terminal status arrives, or when the panel is destroyed. A failed status request can be retried manually. Leaving the case aborts local requests. Server job cancellation and status restoration after a full reload remain separate gaps.

`npm exec vitest run SceneGenerationJobPanel.spec.ts jobs.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 2 passed (2)`, `Tests 5 passed (5)`. Component tests cover explicit submission, status after opening the local preview, mismatched scene rejection, and abort on unmount. Live signed-in submission, cancellation, and recipe artifact opening remain unverified.

`npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.

## Durable cancellation

Worktree base `2ac62dafe35`. The case job panel sends an explicit cancel command under the existing generation gate. The server derives actor identity from the session. The transaction checks case access, locks the case/job row, clears the worker lease, changes status to canceled and appends a job event. If completion won the lock or the command is repeated, the API returns the existing terminal status. A worker that is already reading or writing storage can finish that I/O, but the existing running-status and lease condition blocks publication. Unattached content-addressed bytes may remain in storage.

`npm exec vitest run scene-generation-job-lifecycle-v1.spec.ts SceneGenerationJobPanel.spec.ts jobs.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 19 passed (19)`. The tests cover case authorization, rejection of a supplied actor, the lock and lease predicates, idempotent terminal responses and client status. Live PostgreSQL interleaving and browser cancellation were not exercised.

## Job recovery after page reload

Worktree base `2ac62dafe35`. The case jobs API returns only the most recent job created by the current user in the authorized case, including its pinned plan hash. The builder resumes polling active jobs without a local form submission or browser storage. The completed-job response includes the authorized original plan, verified recipe, and the exact base revision when persistence is enabled. The builder restores editor fields, sends the existing workflow into scene loading, and checks saved note bindings against the recovered plan before mounting the preview. A conflicting current preview prevents replacement.

This recovers one recent job per user and case. A broader job history, live signed-in reload, and independent PostgreSQL/SeaweedFS proof remain open.

`npm exec vitest run SceneGenerationJobPanel.spec.ts jobs.route.spec.ts set-the-scene-workflow-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 18 passed (18)`. Tests cover a fresh panel recovering and opening completed output, the case plus creator query predicate, and rejection of a different case in the workflow. `npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`. The Playwright staging case, session, URL, and write opt-in were absent from the process environment.

## Staging generation round trip

Worktree base `2ac62dafe35`. The existing Playwright staging lane now exercises explicit queueing, a full page reload, recovery of the same job ID, opening the worker recipe, and save/reopen/export from that preview. The generated path asserts that the revision retains the worker recipe's plan hash, the object placement, the source-local event interval, and the annotation.

The optional independent step reads the committed job and revision through a separate read-only PostgreSQL connection. It bounds an S3 GET to the registered artifact size, recalculates SHA-256 from the bytes, compares the JSON with the recipe delivered to Three.js, and attaches a compact receipt. The browser workflow and independent readback have separate opt-ins. No live persistence is inferred when the independent step is skipped.

To run on an already admitted staging case, configure `PW_SCENE_BASE_URL`, `PW_SCENE_CASE_ID`, `PW_SCENE_STORAGE_STATE`, `PW_SCENE_VERIFY_STAGING_WRITE=1`, and `PW_SCENE_VERIFY_GENERATION=1`. For independent readback also set `PW_SCENE_VERIFY_INDEPENDENT_READBACK=1`, `PW_SCENE_READBACK_DATABASE_URL`, `PW_SCENE_READBACK_S3_ENDPOINT`, `PW_SCENE_READBACK_S3_BUCKET`, `PW_SCENE_READBACK_S3_ACCESS_KEY` and `PW_SCENE_READBACK_S3_SECRET_KEY`. Use read-only credentials for the independent clients.

`npm exec playwright test -- --config=playwright.set-the-scene.config.ts set-the-scene-workflow.spec.ts --workers=1 --reporter=list` returned `Running 3 tests using 1 worker` and `3 skipped`. No signed-in browser, database, or storage proof was produced.

## Staging round trip with a reviewed video event

Worktree base `2ac62dafe35`. The same browser lane now has an evidence-backed variant. Supply `PW_SCENE_EVIDENCE_ID` and `PW_SCENE_SOURCE_EVENT_ID` for an existing staging video and an event already approved for scene proposals. The test uses the case builder's authorized timeline read to obtain its original interval, source hash and analysis revision. It checks the case evidence link, pinned source clock, author note timestamp, saved manifest and downloaded report. The independent PostgreSQL receipt distinguishes `EVIDENCE_BACKED` with the exact source snapshot from an empty `BLOCKOUT` snapshot, and independent SeaweedFS readback still checks the recipe bytes against the browser response.

`npm exec playwright test -- --config=playwright.set-the-scene.config.ts set-the-scene-workflow.spec.ts --workers=1 --reporter=list` returned `Running 4 tests using 1 worker` and `4 skipped`. The browser configuration remained absent. Live evidence playback, storage and persistence proof remain open.

`npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.

## Completed recipe readback

Worktree base `2ac62dafe35`. The gated job endpoint accepts a case-scoped recipe view. Before storage access it checks completion, current requester access, the pinned scene revision and canonical source/review inputs. Readback validates the registered derived bucket and exact case/scene/digest path, caps the object read at the recorded size up to 1 MiB, verifies SHA-256 and checks the decoded recipe against the plan. The builder mounts this result through its existing Three.js canvas only when the case, scene, revision and current proposal hash still match. The same scene annotations and revision context carry through when switching from a local preview.

`npm exec vitest run read-scene-generation-recipe-v1.spec.ts SceneGenerationJobPanel.spec.ts jobs.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 9 passed (9)`. Adversarial checks reject a stale completed job before storage access, a foreign object key, tampered bytes, and a valid digest with a different embedded revision. The storage test reads real compiler bytes through an in-memory substitute. Signed-in browser playback and live service verification remain open.

`npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.
