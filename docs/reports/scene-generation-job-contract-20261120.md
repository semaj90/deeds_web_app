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
