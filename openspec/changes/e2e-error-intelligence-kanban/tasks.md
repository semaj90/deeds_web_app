# Tasks: e2e-error-intelligence-kanban

Status values: `DONE` (evidence cited), `DRY_RUN_PROVEN` (rehearsed, not applied), `OPEN`
(not started), `NEEDS_APPROVAL` (blocked on an operator decision or write approval).
Last updated: 2026-11-19.

## 1. Server identity

- [x] **SERVER-ID-01** (2026-11-19) — `dev-gpu-runtime.mjs` publishes `logs/qa/active-server.json` from the
      launch that starts Vite only; the already-running branch exits earlier and never rewrites it.
      Evidence: `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`, `scripts/qa/active-server-manifest.mjs`.
      Live test (scratch path): PID 36612 resolved as the `:5173` listener, `/api/health` verified healthy,
      start time recorded.
- [ ] **SERVER-ID-02** (OPEN, operator) — Restart `dev:gpu` so the real manifest is written. The current
      `:5173` server predates SERVER-ID-01, so `verify-active-server` returns `MANIFEST_MISSING` until then.
      The agent did not stop the live Vite process.
- [ ] **SERVER-ID-03** (OPEN) — After SERVER-ID-02: `node scripts/qa/verify-active-server.mjs` exits 0,
      then rerun QA-SELFTEST-02.
- [x] **SERVER-ID-04** (2026-11-19) — Verifier and global setup refuse a port that is open but not the app.
      Evidence: `scripts/qa/verify-active-server.mjs`, `scripts/qa/qa-global-setup.mjs`; unit tests
      `scripts/qa/qa-pipeline.test.mjs`.

## 2. Browser and API collector

- [x] **QA-COLLECT-01** (2026-11-19) — `tests/e2e/fixtures/qa.ts` (automatic fixture) captures page
      exceptions, console errors, failed requests and 5xx responses; redacts tokens, query strings and
      emails; attaches a file path so the aggregator can read it.
- [x] **QA-RUNCFG-01** (2026-11-19) — `playwright.qa.config.ts` runs only `qa-*.spec.ts` on `:5173`
      (`--strictPort`) with JSON and HTML reporters and `logs/qa/<runId>/` output.
- [ ] **QA-COLLECT-02** (OPEN) — Popups, worker errors, request IDs and server-log correlation.

## 3. Classification and fingerprints

- [x] **QA-CLASSIFY-01** (2026-11-19) — `scripts/qa/error-fingerprint.mjs`: explicit code first, then
      HTTP and browser signals, then keyword matches flagged `needsConfirmation`. A bare `request_id` is not an error.
- [x] **QA-FP-01** (2026-11-19) — Fingerprint = sha256 of error code, feature label, route template and
      stack signature. Excludes timestamps, request IDs, UUIDs and raw messages. Test: 100 identical
      occurrences collapse to one issue. A query-string bug was found and fixed by this test.
- [x] **QA-AGG-01** (2026-11-19) — `scripts/qa/build-qa-issues.mjs <runId>` writes `issues.json`.
      Test-level status decides pass or fail; a `test.fail()` known gap is reported as `known_gap` and
      creates no issue.
- [ ] **QA-SEVERITY-01** (OPEN) — Calibrate the severity policy (P1 for 5xx and runtime exceptions, P2 for
      network and assertion failures, P3 for console) from incident history.
- [ ] **QA-SCORE-01** (OPEN) — Priority score inside each severity tier (user impact, reproducibility,
      recency, scope, regression). Today the sort is severity, then occurrences.
- [ ] **GRAPH-FRESH-01** (OPEN) — `GRAPHIFY_SNAPSHOT_STALE` as a separate operational freshness category,
      not a defect class.

## 4. Feature-scoped tests

- [x] **QA-SPEC-ACP-01** (2026-11-19) — `qa-acp-contract.spec.ts`: malformed JSON returns 400
      `ACP_INVALID_JSON`; `constructor` and `__proto__` return 404 `ACP_TOOL_NOT_FOUND`. Both pass.
      Note: Playwright sends a string body as a JSON string, so the malformed-body case uses a Buffer.
- [x] **QA-SPEC-A2A-01** (2026-11-19) — `qa-a2a-rpc.spec.ts`: parse error returns -32700 and missing
      method returns -32602. Both pass.
- [ ] **A2A-RPC-32601** (OPEN, fix) — Unknown method returns HTTP 200 with `result.ok=false`, not a
      JSON-RPC error. The test is `test.fail()` and reports `known_gap` until fixed. Before changing it,
      check which clients read `result.ok` (the gateway serves other callers too).
- [ ] **QA-DECISION-01** (NEEDS_APPROVAL) — ACP error body shape. The design doc expects
      `{ error: { code, message } }` with `ACP_JSON_INVALID`. The route returns a top-level `code`
      (`ACP_INVALID_JSON`) next to the `error` text. The nested form breaks existing clients; decide which
      contract is canonical.
- [x] **QA-SELFTEST-01** (2026-11-19) — `qa-selftest.spec.ts` (gated by `QA_SELFTEST=1`): an uncaught
      page exception becomes `JS_RUNTIME_EXCEPTION` (P1), a failed assertion becomes `E2E_ASSERTION_FAILED`
      (P2), with the correct feature labels.
- [ ] **QA-SELFTEST-02** (OPEN, after SERVER-ID-02) — Rerun the self-test and smoke suite against the
      restarted server, with the manifest verified.
- [ ] **QA-FULLSWEEP-01** (OPEN) — Route-wide sweep through the fixture. Reconcile with the existing
      `route-sweep.spec.ts` and its tasks in `openspec/changes/crime-scene-reconstruction/tasks.md`.

## 5. Persistence (database)

- [x] **QA-DB-01** (2026-11-19) — `drizzle/manual/20261119_qa_error_intelligence_v1.sql` creates `qa_runs`,
      `qa_issues` and `qa_events`, with the partial unique index `qa_issues_one_active_task`.
      Rehearsed in `legal_ai_live_integration_scratch` inside `BEGIN … ROLLBACK`: all post-checks true,
      0 tables left afterwards. Status `DRY_RUN_PROVEN`. Live `legal_ai_db` untouched.
- [ ] **QA-DB-APPLY** (NEEDS_APPROVAL; checked 2026-11-19: NOT MIGRATED — 0 `qa_*` tables in `legal_ai_db`, no journal entry) — Apply the DDL to `legal_ai_db`. Requires explicit operator
      approval, a pre-image note, and a post-check. Not in `drizzle/meta/_journal.json`.
- [ ] **QA-DB-02** (OPEN, after QA-DB-APPLY) — Writer from `issues.json` to the tables: idempotent upsert on
      fingerprint, occurrences incremented, `qa_events` appended, no duplicate issue.
- [ ] **QA-TASK-LINK-01** (NEEDS_APPROVAL) — Identify the Kanban task table and its identity. Then link
      `qa_issues.kanban_task_id`, with a foreign key once the table is confirmed.
- [ ] **QA-DISPO-01** (OPEN) — Disposition state machine (`NEW → TRIAGED → ACCEPTED`, reopen rules,
      `RESOLVED_UNVERIFIED` vs `RESOLVED_VERIFIED`). A passing run must not silently close an unreviewed issue.

## 6. Views and schedule

- [ ] **QA-ADMIN-01** (OPEN, after QA-DB-02) — `/admin/qa`: Top 10 / Top 100 / Top 1000, grouping by feature
      label, route, code and first/last occurrence. Detail panel with trace, log excerpt, screenshot and
      linked task. Built on the existing taskboard, not a second board.
- [ ] **QA-SCHED-01** (OPEN) — Daily smoke and ACP/A2A contract suite, plus a broader sweep outside active
      development. Destructive upload and case tests stay in a seeded environment.

## 7. Verification

- [x] **QA-VERIFY-01** (2026-11-19) — `node --test scripts/qa/qa-pipeline.test.mjs`: 9 of 9 pass.
- [x] **QA-VERIFY-02** (2026-11-19) — `playwright test -c playwright.qa.config.ts` against the live `:5173`:
      smoke-3 run: 5 passed, 1 skipped, 1 known gap (A2A-RPC-32601), 0 issues.
- [x] **QA-VERIFY-03** (2026-11-19) — `svelte-check-native --workspace .`: 2,162 files, 1 error, which is
      the pre-existing `multimodal-analysis/+server.ts` contract mismatch in another session's work. None
      of the new QA files report errors.
- [ ] **QA-VERIFY-04** (OPEN) — Full `npm run check` gate (not run for this change).
- [ ] **QA-VERIFY-05** (OPEN, end-to-end acceptance) — Run twice against one active server; trigger a known
      failure; confirm one issue, its evidence and exactly one linked task. Then a passing run must not
      close the issue. This needs QA-DB-APPLY and QA-TASK-LINK-01 first.

## Next actions (in order)

1. Operator restarts `dev:gpu` (SERVER-ID-02); then SERVER-ID-03 and QA-SELFTEST-02.
2. Operator decides QA-DECISION-01 and whether to approve QA-DB-APPLY.
3. Fix A2A-RPC-32601 after checking its callers.
4. Identify the task table for QA-TASK-LINK-01.

## 8. Reconciliation of earlier 2026-11-19 work

Migration status, checked live 2026-11-19: **not migrated.** `legal_ai_db` has 0 `qa_*` tables; `drizzle/meta/_journal.json` and `drizzle/sidecar-migrations.json` do not list the file. Only the scratch database was used, inside a rolled-back transaction.

- [x] **STARTUP-ALREADY-RUNNING-01** (2026-11-19) — `dev-gpu-runtime.mjs` exits 0 when Vite already answers on `:5173`, with the message "not starting a second instance". It checks the port first, then probes HTTP; a port that is open but not answering still fails with exit 1. Test run: exit 0, PID 36612 untouched.
- [x] **SERVER-LOG-01** (2026-11-19) — `run-detached.mjs` writes each launch to its own `dev-gpu.<timestamp>.{out,err}.log`, leaves a pointer in the canonical log, and prints the first 20 seconds of that launch only. `DETACHED_TAIL_SECONDS` falls back to 20 when non-numeric. Fixed an unused variable, a file-descriptor leak, and the NaN tail input. The VS Code task description in `.vscode/tasks.json` is updated. Note: two timestamped launches (four files) now exist, and nothing prunes them.
- [x] **ACP-CODES-01** (2026-11-19) — `/api/acp/execute` error bodies carry `code`: `ACP_UNAUTHORIZED`, `ACP_INVALID_JSON`, `ACP_INVALID_INPUT`, `ACP_TOOL_NOT_FOUND`, `ACP_PERMISSION_DENIED`, `ACP_EXECUTION_FAILED`. The 500 path logs one JSON line with code, tool, error name, truncated message and duration; arguments are never logged. Evidence: the three new tests in `authorization-boundary.spec.ts`, with 20 of 20 ACP and registry tests passing.
- [x] **ACP-REGISTRY-01** (2026-11-19) — `getACPToolSchema` and `executeACPTool` use own-property lookup (`Object.hasOwn`), so `constructor` and `__proto__` are not tools. The bug was found by reading code, not by a failing test first. The regression tests pass after the fix; the pre-fix failure was not demonstrated.
- [ ] **SIMDJSON-REVIEW-01** (OPEN, decision) — Findings in `src/lib/server/gpu/simdjson-bridge.ts` and `src/lib/utils/simd-json-parser.ts`, not yet acted on: (a) cached results are shared objects, so a caller that mutates one changes what later callers get for up to 30 s; cloning costs time, so this needs a decision. (b) `benchmark()` times cache hits after its first iteration. (c) Telemetry labels native for payloads under 1 KB, which take the V8 path. (d) Each cache miss stringifies the whole result to estimate its size.
- [x] **SCN-01** (2026-11-19) — `svelte-check-native` reported 3 type errors. Fixed with `HTMLSelectElement` casts in `CaseStorybook.svelte` (line 201) and `StorybookRegionReview.svelte` (lines 121, 124). Both files are untracked and belong to another session. `CaseStorybook.svelte` changed on disk after this edit; the latest check shows no error there, but I have not re-read the file.
- [ ] **SCN-02** (OPEN, owner: crime-scene session, decision needed) — `src/routes/api/evidence/[id]/multimodal-analysis/+server.ts:219` passes silhouette objects with `maskObjectKey`, `maskSha256`, `targetBoxIndex`, and similar fields. The declared type is `Sam2SilhouetteResultV1['masks']`, which is `Sam2SegmentationMaskSchemaV1 & { label }`. The two shapes disagree. The route file is modified and under active work elsewhere, so this is not changed here. Decide which shape is canonical.
- [ ] **CLASSIFY-MAP-01** (OPEN) — The design doc's canonical codes are not in `scripts/qa/error-fingerprint.mjs` yet: `ACP_PARSE_MISCLASSIFIED`, `ACP_REGISTRY_UNSAFE`, `A2A_PARSE_ERROR`, `QA_FIXTURE_MISSING`, `GRAPHIFY_SNAPSHOT_STALE`. The classifier currently emits only the five codes in `CODES`.

Not added to this change: the courtroom and storybook plan pasted into the session (scene context, Storybook chapters, cell streaming). Those items belong to `openspec/changes/crime-scene-reconstruction/tasks.md` and another session's work.

## 9. Gaps from the E2E design review (2026-11-19)

Source: the E2E error-intelligence design paste reviewed on 2026-11-19. Items already tracked elsewhere in this file are not repeated here.

- [ ] **FEATURE-LABEL-MAP-01** (OPEN) — Map the design labels (`auth.session`, `evidence.upload`, `evidence.viewer`, `scene.marker`, `scene.motion`, `agent.acp.execute`, `agent.a2a.rpc`, `infra.vite`, `infra.graphify`) to the existing feature registry (`openspec/specs/atlas-feature-registry/spec.md`). Only three labels are in use today.
- [ ] **KANBAN-STATE-01** (OPEN, decision) — Reconcile the design workflow (New → Triaged → Approved → In Progress → Verify → Done) with the disposition states in section 5 (NEW, TRIAGED, ACCEPTED, SUPPRESSED, RESOLVED_*). Keep task state and issue disposition as separate fields.
- [ ] **QA-EVENT-SCHEMA-01** (OPEN) — Add `schema_version`, `expected_status`, `actual_status`, `server_log_ref`, and evidence references to each normalized event.
- [ ] **QA-ARTIFACT-01** (OPEN) — Store large logs and traces as SeaweedFS artifacts. PostgreSQL keeps only indexed metadata and references.
- [ ] **QA-TAGS-01** (OPEN) — Support secondary tags alongside the primary feature label.
- [ ] **QA-SUPPRESS-01** (OPEN) — Suppress expected validation failures from issues, but keep them queryable for audit.
- [ ] **QA-SEED-01** (OPEN) — Run destructive upload, delete, and case-modification tests only in a seeded environment with authorized fixtures.
- [ ] **QA-CROSSRUN-01** (OPEN, needs QA-DB-APPLY) — Deduplicate across runs, not only within one run. This is required for the acceptance test "run twice, one issue".
- [ ] **QA-WEBSERVER-ENV-01** (OPEN) — `playwright.qa.config.ts` starts Vite without `DEV_BYPASS_AUTH`. Authenticated tests must reuse the `dev:gpu` server. Either document that rule or pass the env to the webServer command.
- [x] **QA-REPORTER-DECISION-01** (2026-11-19) — The design's custom Playwright reporter is replaced by `scripts/qa/build-qa-issues.mjs`, which reads the JSON report and its attachments. Decision recorded here; no reporter is needed.

## 10. Pre-restart checklist for dev:gpu (2026-11-19)

- [ ] **RESTART-01** — Confirm `:8090` is idle (`/slots`) before restarting `dev:gpu`. The launcher can relaunch llama-server, which falls under the gated lifecycle rules.
- [ ] **RESTART-02** — Expected new output after restart: `logs/qa/active-server.json` and one new timestamped log pair under `logs/task-output/pipeline-test/`.
- [ ] **RESTART-03** — Verify, in order: `node scripts/qa/verify-active-server.mjs` (expect `VERIFIED`); then `QA_SELFTEST=1 QA_RUN_ID=selftest-3 npx playwright test -c playwright.qa.config.ts`; then `node scripts/qa/build-qa-issues.mjs selftest-3`.
- [ ] **RESTART-04** — Do not run the QA suite until RESTART-03's verifier passes.

## 11. Pre-restart review and test entry points (2026-11-19)

Review of the restart path, done without restarting anything. Syntax check passes for `dev-gpu-runtime.mjs`. The manifest is published only after the Vite spawn, and a failed verification writes `not_verified`, never `running`. The only files a launch writes are the Vite log, the manifest, and the existing startup report.

- [x] **REVIEW-RESTART-01** (2026-11-19) — Restart path reviewed; no blocking issues found.
- [ ] **STRICTPORT-01** (OPEN) — The runtime comments say dev:gpu never falls back from :5173, but the Vite spawn in `dev-gpu-runtime.mjs` passes `--port` without `--strictPort`. If the port is taken during the startup race, Vite can move to 5174. The manifest would then report `not_verified`, so the failure is visible, but the launch command should match its comment. Not changed here; it affects the running dev server.
- [x] **QA-NPM-01** (2026-11-19) — Added to `sveltekit-frontend/package.json`: `qa:verify-server`, `qa:smoke`, `qa:issues`, `qa:unit`. `qa:unit` passes 9 of 9. `qa:verify-server` returns `MANIFEST_MISSING`, as expected until the restart.
- [x] **QA-ONLOAD-DECISION-01** (2026-11-19) — Decided against running the QA suite on workspace open. It would start Playwright and a server on every open. Restart checks are run explicitly with the npm scripts instead.
- Use these in RESTART-03: `npm run qa:verify-server`, then, in PowerShell, `$env:QA_SELFTEST=1; npm run qa:smoke` (the inline `VAR=1 npm run` form does not work in npm's default cmd shell on Windows), then `npm run qa:issues -- <runId>`.

## 12. Server-side log correlation on the same machine (2026-11-19)

Question from the user, 2026-11-19: can the QA logger latch to the server on :5173, since both run on this machine?

Answer: yes. `logs/qa/active-server.json` already records the port, the listener PID, the start time, and the Vite log path (`stdout_log`). The aggregator can read that log and attach server-side errors to the same run.

- [ ] **SERVER-LOG-LINK-01** (OPEN) — `build-qa-issues.mjs` reads `stdout_log` from the manifest, takes Vite and server error lines (`[vite:error]`, 5xx request lines, stack traces) whose timestamps fall within the run window, and attaches them as `source: server` events with the same fingerprint rules.
- [ ] **SERVER-LOG-LINK-02** (OPEN) — Verify on a real run: a deliberate server 500 should produce one browser-side issue and one server-side issue linked by run ID. Needs RESTART-03 first, so the manifest exists.
- Caveat: the current server (pid 36612) was started before the manifest existed, so no manifest points at its log yet. Until the restart, correlation has no verified source.
