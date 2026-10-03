# Svelte check remediation and ParadeDB status — 2026-09-26

## Outcome

- Full SvelteKit check with Node `v22.23.3` and `NODE_OPTIONS=--max-old-space-size=8192`: **0 errors, 291 warnings, 100 files** (exit 0).
- Baseline before remediation: **36 errors, 291 warnings, 119 files**. The 36 errors are itemized below by owning file and diagnostic count; the checker is clean of errors now, but the warning backlog was intentionally not broadened into this fix.
- The exact SvelteKit application `DATABASE_URL` resolves to host `127.0.0.1:5434`, database `legal_ai_db`, role `legal_admin` (password suppressed). Its live read-only fingerprint reports PostgreSQL 18.4, container-side address `172.18.0.13:5432`, data directory `/var/lib/postgresql/18/docker`, config `/var/lib/postgresql/18/docker/postgresql.conf`, and `shared_preload_libraries=pg_search`.
- The current `legal-ai-postgres` container is image `pgvector-pgsearch:pg18-local`, image digest `sha256:86aadc922d7117ce8b396f67c98353183f80fe3ca7f7a4d58d3aa444e3452839`; container ID `8fbe6d338f88ceba632ec79c18835b20f3e8bf46af494e2288754a2fe710f7ca`; current start time `2026-09-26T14:56:54Z`; host mapping is `5434 -> 5432`.
- The exact application connection reports installed `pg_search 0.25.1` in schema `paradedb`, `vector 0.8.3`, and `pg_trgm 1.6`; `pg_available_extensions` reports those same installed versions. `paradedb.version_info()` returns `(0.25.1,release)`, and `public.idx_codebase_chunk_pgsearch_bm25` resolves. `pg_config` points to PostgreSQL 18 directories and the `pg_search.control` / `pg_search.so` files are present.
- The prior “extension absent” conclusion was a false negative: its filter searched extension names with `ILIKE '%parade%'`, but the catalog name is `pg_search`, which does not contain `parade`. The current exact-name query against the application connection proves the extension is installed and operational; there is no environment-identity contradiction to resolve from that result. No extension installation, image rebuild, or database mutation was attempted.

## Baseline error inventory (36)

| File | Count | Baseline diagnostic |
|---|---:|---|
| `sveltekit-frontend/src/lib/server/document-processor.ts` | 1 | Missing optional `nodejs-whisper` declarations |
| `sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts` | 1 | Candidate tuple inferred as unknown; `candidateId` unavailable |
| `sveltekit-frontend/src/lib/server/ai/error-agent/execution-receipt.ts` | 1 | Reconciliation status widened to `string` |
| `sveltekit-frontend/src/lib/server/analysis/duckdb-registry.ts` | 1 | Incorrect relative path to `packages/atlas-duckdb` |
| `sveltekit-frontend/src/lib/server/atlas/classification/query-feature-projection-v1.ts` | 2 | Two `includes` calls narrowed to `never` |
| `sveltekit-frontend/src/lib/server/atlas/neural-routing/query-feature-projection-v1.ts` | 2 | Two `includes` calls narrowed to `never` |
| `sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-lineage-receipt-v1.ts` | 3 | Three missing package exports for the existing Oak lineage owner |
| `sveltekit-frontend/src/lib/server/langextract/mcp-langextract.ts` | 1 | `Headers.entries` missing from configured DOM library |
| `sveltekit-frontend/src/mcp/server.ts` | 3 | Missing `form-data` module/types |
| `sveltekit-frontend/src/lib/server/pdf/generateLegalPacketPDF.ts` | 1 | Missing `pdf-lib` module/types |
| `sveltekit-frontend/src/lib/server/pdf/legalPacketGenerator.ts` | 1 | Missing `pdf-lib` module/types |
| `sveltekit-frontend/src/lib/server/queue/valkey-event-stream.ts` | 2 | Producer ID not common to event union; Redis response typed unknown/non-iterable |
| `sveltekit-frontend/src/mcp/server-fastmcp.ts` | 1 | Missing `fastmcp` module/types |
| `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts` | 1 | Prompt-plan packet-key optionality mismatch across package boundary |
| `sveltekit-frontend/src/routes/api/upload/+server.ts` | 2 | `FormData.keys` library typing and optional `nodejs-whisper` declaration |
| `sveltekit-frontend/src/routes/api/upload/test/+server.ts` | 3 | `Headers.entries` / `FormData.keys` library typings |
| `sveltekit-frontend/src/routes/api/transcribe/whisper/+server.ts` | 1 | Missing optional `nodejs-whisper` declaration |
| `sveltekit-frontend/src/lib/components/FileUploadSection.svelte` | 1 | `FileList` not iterable under configured DOM library |
| `sveltekit-frontend/src/routes/(dev)/demos/+page.svelte` | 2 | Missing D3 namespace declarations |
| `sveltekit-frontend/src/routes/(dev)/demos/+page.svelte` | 6 | Graph node type omitted `vx`, `vy`, `x`, and `y` fields used by the view |
| **Total** | **36** | |

## Remediation summary

- Added the missing frontend runtime/type dependencies `form-data`, `pdf-lib`, and `fastmcp`, plus `@types/d3`.
- Added `dom.iterable` to the frontend TypeScript libraries for standards-based `Headers`, `FormData`, and `FileList` iteration.
- Added an ambient declaration only for the optional dynamically loaded `nodejs-whisper` integration; this does not install Whisper or make the runtime available.
- Corrected the DuckDB source path and exposed the existing parent-atlas Oak lineage module through its package export.
- Tightened local tuple/event/Redis response typing, repaired the regex type-narrowing expressions, and aligned the prompt-plan adapter's optional `packetKey` with the existing route contract.
- Rebuilt the excluded prompt-adapter declaration using its dedicated TypeScript config before the final app check.

## Validation and remaining risks

- Full command: `NODE_OPTIONS=--max-old-space-size=8192 npm run check` from `sveltekit-frontend`; **0 errors / 291 warnings / 100 files**, exit 0.
- Focused Mastra route spec: **3/3 passed**.
- Orchestrator TypeScript check: passed.
- Strict OpenSpec validation for `parent-atlas-agentic-file-compiler`: passed.
- The remaining 291 warnings (mostly accessibility and unused CSS) were not changed by this error-remediation pass.
- npm reported **59 advisories** after dependency reification (5 low, 22 moderate, 29 high, 3 critical). No automatic audit remediation was run. Review the lockfile audit before deployment.
- `fastmcp` resolves for compilation, but this pass did not prove compatibility with the current MCP protocol revision or exercise its runtime server path.
- AFC-17 remains open until the complete Tree-sitter/typecheck/test validation barrier is proven; the Svelte typecheck subgate alone is not the whole barrier.
- No inference request, PostgreSQL write, Qdrant/Valkey/RabbitMQ/Neo4j write, or Graphify run occurred. PostgreSQL inspection was read-only.

## Svelte warning census follow-up

Fresh machine-format replay on 2026-09-26 ran from `2026-09-26T22:29:17Z` to `2026-09-26T22:33:52Z` (275 seconds), scanning 15,943 files. Exit code 0; the terminal record was `COMPLETED 15943 FILES 0 ERRORS 291 WARNINGS 100 FILES_WITH_PROBLEMS`. The raw machine output is at `sveltekit-frontend/.tmp/atlas/svelte-check-warning-census-v1/20260926T/svelte-check.ndjson` (SHA-256 `b2518b452789715c0dc75311e49d7354a9437f1db3be0a6c71515fd7773239d3`). These are Svelte `WARNING` diagnostics, not TypeScript errors.

| Diagnostic code | Count | Triage meaning |
|---|---:|---|
| `a11y_label_has_associated_control` | 121 | Labels are not programmatically associated with a form control |
| `css_unused_selector` | 58 | CSS selectors match no compiled markup; check for dead styles or markup drift |
| `a11y_click_events_have_key_events` | 48 | Clickable elements lack an equivalent keyboard interaction |
| `a11y_no_static_element_interactions` | 34 | Interactive handlers are attached to static elements without an appropriate role |
| `a11y_consider_explicit_label` | 20 | Buttons/links need accessible names |
| `a11y_interactive_supports_focus` | 9 | Interactive dialog elements need focus support |
| `a11y_no_interactive_element_to_noninteractive_role` | 1 | Interactive element has a conflicting role |
| **Total** | **291** | **233 accessibility + 58 CSS** |

By source location: 127 warnings are in app routes, 148 in shared components, 11 in dev routes, and 5 elsewhere. The top files are the demo page-layout route (17), `AnalysisPanel.svelte` (14), `EvidenceReportSummary.svelte` (10), and the case-board and evidence-report views (10 each). Treat the accessibility findings as actionable until reviewed; do not blanket-suppress them. The SvelteKit Vite-config override notice is separate from the 291 diagnostics and does not count as a Svelte warning.

## AFC-17 validation-barrier diagnosis

Current state: **typecheck subgate proven; complete AFC-17 barrier not proven**.

- The pure `aggregateValidationBarrier` unit tests pass 5/5; the Mastra route tests pass 3/3. The orchestrator TypeScript check and strict OpenSpec validation pass. These are focused checks, not evidence that the required repository-level test validator ran.
- No live Tree-sitter repository/source-set validation receipt was found. Installed parser dependencies or fixture/parity tests alone do not prove that the current target file set parsed successfully.
- Repository search finds `aggregateValidationBarrier` used only by its implementation and its spec; no runner currently executes Tree-sitter + typecheck + tests and emits a real `ValidationBarrierResultV1`.
- The current aggregator trusts caller-supplied `requiredValidators` and observation `status`. It does not runtime-parse observations, require a fixed validator set, bind `PASS` to `exitCode === 0`, require command/output digests/evidence refs, or validate warning counts/codes. `warnAccepted` is only a validator-name allowlist, so it cannot constrain which warning classes/counts were admitted. This is a contract/runner gap, not a failing test.
- The current 291-warning typecheck result therefore proves “zero errors under the present Svelte checker,” but does not establish an AFC-17 warning-admission decision. Freeze an explicit warning policy before calling the typecheck observation `PASS` or accepted `WARN`.

To close AFC-17, freeze the exact changed-file or repository-wide source set and validator versions; run a real Tree-sitter parse with parse-error counts; run the selected required test suite; bind every observation to its command, exit code, output digest, evidence reference, and tool revision; define warning admission by diagnostic code/count; then emit and replay-verify one checksummed barrier receipt requiring exactly `tree-sitter`, `typecheck`, and `test`. Until those evidence exist, keep AFC-17 open.

## Required handoff fields

`likely_cause`: The prior error set combined missing optional/package declarations, an incorrect package path/export surface, a missing iterable DOM library, and a handful of cross-owner TypeScript contract mismatches.

`evidence`: Baseline and final full-check outcomes above; PostgreSQL 18.4 extension-catalog checks; focused route test; orchestrator typecheck; strict OpenSpec validation.

`patch_targets`: `sveltekit-frontend/tsconfig.json`; `sveltekit-frontend/package.json`; the frontend files listed in the error inventory; `packages/parent-atlas/package.json`; `packages/parent-atlas/src/index.ts`; `packages/atlas-core/src/langgraph/ornith-prompt-plan-adapter.ts`; `sveltekit-frontend/src/types/optional-integrations.d.ts`; `openspec/changes/parent-atlas-agentic-file-compiler/tasks.md`.

`safe_next_command`: `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('pg_search','vector','pg_trgm') ORDER BY name;` (read-only; use the canonical catalog names, not the product name “ParadeDB”). Do not upgrade without a separate explicit decision.

`smoke_command`: `cd sveltekit-frontend; $env:NODE_OPTIONS='--max-old-space-size=8192'; npm run check`.

`report_path`: `docs/reports/svelte-check-error-remediation-20260926.md`.
