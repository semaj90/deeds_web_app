# Phase 9 — Production-Ready Audit, `.gitignore` Visibility, and Drizzle Reconciliation

Status: **operator checklist / next_steps**  
Suggested repo path: `next_steps/production-ready-gitignore-drizzle-audit.md`

This checklist continues the Parent Atlas / Programming Docs Atlas hardening work and prepares the repository for production-grade testing. It focuses on:

1. **Search blindness** — `rg` respects `.gitignore` by default, so audits can silently miss ignored files unless they intentionally use `-u` or `--no-ignore`.
2. **Drizzle/live database drift** — Drizzle snapshots can be clean while the live PostgreSQL database still contains shadow/legacy/manual tables.
3. **Feature stress readiness** — Warden/GPU-cache, evidence, retrieval, and contract-audit lanes need bounded production-grade stress tests.

---

## Current Verified State

### Phase 6E Cross-Layer Contract Audit

- `scripts/atlas/audit-contract-map.mjs` is live.
- `scripts/atlas/audit-pgvector-schema.mjs` is live.
- `scripts/atlas/audit-drizzle-meta-hygiene.mjs` is live.
- Contract audits now use unrestricted `rg -u` where complete visibility is required.
- Layer status:
  - Layers 1–3: PASS
  - Layer 4 migrations: WARN, documented sidecars are recognized
  - Layer 5 live DB: FAIL, live Postgres contains drift/shadow tables
  - Layers 6–8: PASS

### Vector Dimension Policy

`audit-pgvector-schema.mjs` now recognizes:

| Dimension | Meaning |
|---:|---|
| 768 | Canonical codebase/evidence lane using `embeddinggemma:latest` |
| 1536 | External OpenAI `text-embedding-3-small` compatibility |
| 384 | Warden / GPU-cache / Nomic / legacy compact ingestion |
| 512 | Vision-related embeddings |
| 128 | Autoencoder / reduced manifold experiments |
| 64 | Compressed topology / glyph lanes |
| 32 | Fingerprinting / compact routing |

### `.gitignore` Updates

The repository intentionally ignores several large diagnostic artifacts and binary files:

- `sveltekit-frontend/docs_readme/deeds_labs_archive/`
- `sveltekit-frontend/tsconfig.check.tsbuildinfo`
- `sveltekit-frontend/tsc_after_fix_docs1.txt`
- `sveltekit-frontend/svelte-server-errors.json`
- `sveltekit-frontend/eng.traineddata`
- `sveltekit-frontend/static/yorha-celestial.png`
- `*.traineddata`
- `*.profraw`

Important: audits that need complete visibility must use `rg -u`, `rg --no-ignore`, or explicit file enumeration.

---

# Phase 9A — `.gitignore` and Search Visibility Audit

## Goal

Prevent production audits from silently missing ignored files, generated reports, diagnostic logs, temporary route files, or locally generated schema artifacts.

## TODO

- [ ] Create `scripts/atlas/audit-rg-search-integrity.mjs`.
- [ ] Scan all audit/indexing/search scripts for raw `rg` usage.
- [ ] Classify each `rg` call as:
  - `source_only`
  - `complete_visibility_required`
  - `generated_artifacts_allowed`
  - `safe_to_respect_gitignore`
- [ ] Require `-u` or `--no-ignore` for:
  - contract audits
  - schema audits
  - form audits
  - route audits
  - migration audits
  - generated report reconciliation
  - Playwright/network report reconciliation
- [ ] Allow default `rg` behavior for:
  - source-only code search
  - user-facing quick symbol search
  - performance-sensitive UI search
- [ ] Produce:
  - `docs/reports/rg-search-integrity-report.md`
  - `docs/reports/rg-search-integrity-report.json`

## Detection Rules

Flag audit script `rg` usage without unrestricted mode when scanning:

```txt
sveltekit-frontend/src
sveltekit-frontend/drizzle
docs/reports
docs/graph
```

Recommended helper:

```js
function rgComplete(pattern, args = []) {
  return spawnSync('rg', ['-u', '--hidden', pattern, ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
}

function rgSourceOnly(pattern, args = []) {
  return spawnSync('rg', [pattern, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
}
```

## Success Criteria

- [ ] Every audit script documents whether it respects or bypasses `.gitignore`.
- [ ] No production audit depends on default `rg` behavior when complete visibility is required.
- [ ] `audit-rg-search-integrity.mjs` writes report artifacts.
- [ ] `npm run audit:contracts` still passes.

---

# Phase 9B — Drizzle / Live PostgreSQL Reconciliation

## Goal

Resolve or classify live database tables that are present in PostgreSQL but absent from the SvelteKit Drizzle schema.

## Current Known Issue

`drizzle-kit check` can pass while Layer 5 live DB audit fails. This means Drizzle snapshots are internally consistent, but the live DB contains additional legacy/shadow/manual tables.

## TODO

- [ ] Create or update:
  - `docs/reports/drizzle-live-db-reconciliation.md`
  - `docs/reports/drizzle-live-db-reconciliation.json`
- [ ] Classify live-only tables:
  - `adopt_into_drizzle_schema`
  - `document_as_legacy_shadow`
  - `document_as_manual_sidecar`
  - `drop_candidate_requires_review`
  - `external_service_owned`
- [ ] Add `sveltekit-frontend/drizzle/live-db-table-policy.json`.
- [ ] Update `audit-contract-map.mjs` Layer 5:
  - FAIL only on unknown live-only tables
  - WARN/LOW on documented shadow tables
  - PASS on adopted/schema-owned tables
- [ ] Link each table to:
  - owner
  - reason
  - source migration if known
  - source feature if known
  - validation command
  - deletion/adoption decision

## Example Policy File

```json
{
  "tables": [
    {
      "table": "code_retrieval_chunks",
      "status": "manual_sidecar",
      "owner": "Parent Atlas / Retrieval",
      "reason": "Used by Atlas indexing and retrieval audits.",
      "adoptIntoDrizzle": false,
      "dropCandidate": false,
      "validationCommand": "npm run audit:contracts"
    }
  ]
}
```

## Success Criteria

- [ ] Every live-only table is classified.
- [ ] Unknown live-only tables are FAIL.
- [ ] Documented sidecar/shadow tables are WARN or LOW.
- [ ] No table is dropped automatically.
- [ ] Drizzle Studio confirms table state.
- [ ] `audit:contracts` reports zero unclassified live DB objects.

---

# Phase 9C — Drizzle Studio and Migration Safety

## Goal

Ensure Drizzle Studio and Drizzle Kit commands work from predictable paths without corrupting migration state.

## TODO

- [ ] Confirm Studio runs from frontend:
  ```powershell
  cd sveltekit-frontend
  npx drizzle-kit studio --config=drizzle.config.ts --host=127.0.0.1 --port=4983
  ```
- [ ] Confirm root wrapper works:
  ```powershell
  npm run db:studio
  ```
- [ ] If `http://localhost:4983` returns 404:
  - [ ] Check terminal output for actual Studio URL.
  - [ ] Check listening ports:
    ```powershell
    Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Format-Table LocalAddress,LocalPort,OwningProcess
    ```
- [ ] Keep `sveltekit-frontend/drizzle/meta` JSON-only.
- [ ] Prevent `LLMS.md`, `AGENTS.md`, and Markdown notes in `drizzle/meta`.
- [ ] Use:
  - `drizzle-kit check`
  - `drizzle-kit generate`
  - audits
- [ ] Avoid:
  - `drizzle-kit push` unless explicitly approved.

## Success Criteria

- [ ] Studio starts with correct config.
- [ ] Studio URL is documented.
- [ ] `npm run db:check` works.
- [ ] `npm run audit:drizzle-meta` passes.
- [ ] No non-JSON files are inside `drizzle/meta`.

---

# Phase 9D — HNSW Index Application Gate

## Goal

Apply pgvector HNSW indexes only after review and healthy Postgres confirmation.

## Current State

`docs/reports/pgvector-index-plan.md` contains reviewed SQL candidates. They should not be applied automatically.

## TODO

- [ ] Confirm Postgres is up:
  ```powershell
  docker ps --filter "name=legal-ai-postgres"
  Test-NetConnection 127.0.0.1 -Port 5434
  docker exec -it legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "select now();"
  ```
- [ ] Review every planned index:
  - table
  - vector column
  - dimension
  - opclass
  - expected query path
  - estimated storage overhead
- [ ] Create migration only after review:
  - `sveltekit-frontend/drizzle/00xx_pgvector_hnsw_indexes.sql`
- [ ] Run:
  ```powershell
  npm run audit:pgvector
  npm --prefix sveltekit-frontend run db:check
  npm run audit:contracts
  npm run atlas:validate
  ```
- [ ] Commit separately:
  ```txt
  feat(db): add reviewed hnsw indexes for vector retrieval tables
  ```

## Success Criteria

- [ ] No index is added without documented rationale.
- [ ] Every HNSW index maps to an actual query lane.
- [ ] `audit:pgvector` passes.
- [ ] Drizzle migration state remains clean.

---

# Phase 9E — Feature Stress Tests

## Goal

Test critical feature lanes under bounded concurrency before production.

## Warden / GPU-Cache 384-Dim Lane

- [ ] Confirm all 384-dim vector tables are documented.
- [ ] Confirm audit recognizes them as intentional.
- [ ] Stress with bounded batch sizes.
- [ ] Verify no accidental 384 → 768 mixing.
- [ ] Verify retrieval routes know which dimension to query.

## Evidence / Codebase 768-Dim Lane

- [ ] Confirm 768-dim canonical embedding lane.
- [ ] Stress evidence ingestion.
- [ ] Stress codebase retrieval.
- [ ] Confirm Qdrant collection names are not mixed:
  - `codebase_chunks_768`
  - `external_programming_docs_768`
  - evidence collections
- [ ] Confirm sourceRefs always include trust tier.

## Admin Copilot

- [ ] Stress query with:
  - local-only answer
  - docs-only answer
  - mixed local+docs answer
  - web fallback required
- [ ] Verify UI shows:
  - canonical local code
  - official docs
  - external_unverified web result
  - graph paths
  - command suggestions
  - validation command

## Playwright / Browser / Network

- [ ] Run:
  ```powershell
  npm run test:network-contracts
  ```
- [ ] Verify:
  - no unexpected 500s
  - JSON API shapes
  - Superforms invalid response shape
  - SSE content-type
  - no env URL leakage
  - CORS behavior
  - optional `x-protocol` or `alt-svc` when Caddy is enabled

---

# Phase 9F — Directory Analysis and Cleanup

## Goal

Break down large directories, ignored artifacts, and generated outputs so audit scripts and agents know what to include or skip.

## TODO

- [ ] Create `scripts/atlas/analyze-directory-roles.mjs`.
- [ ] Classify directories:
  - `source`
  - `tests`
  - `migrations`
  - `generated_reports`
  - `external_docs_raw`
  - `external_docs_normalized`
  - `binary_artifact`
  - `diagnostic_log`
  - `archive`
  - `build_cache`
- [ ] Write:
  - `docs/graph/directory-role-map.json`
  - `docs/reports/directory-analysis-report.md`
- [ ] Update audit scripts to use directory role map.
- [ ] Update `.gitignore` with large artifacts only after role classification.
- [ ] Document search behavior:
  - source scans may respect `.gitignore`
  - production audits must use unrestricted search
  - generated reports may be intentionally ignored but still audit-visible

## Success Criteria

- [ ] Every large directory has an owner and role.
- [ ] `.gitignore` additions are documented.
- [ ] Audit scripts intentionally choose ignore/no-ignore behavior.
- [ ] Agents can explain why a path is included or skipped.

---

# Phase 9G — Agentic Error-Fixing Workflow

## Goal

Turn audit findings into ordered, safe, source-referenced fix tasks.

## TODO

- [ ] Extend `build-error-fix-dag.mjs` to consume:
  - contract audit report
  - pgvector report
  - drizzle reconciliation report
  - Playwright network report
  - svelte-check output
- [ ] Rank errors by root-cause potential.
- [ ] Use KAG recall:
  - Redis `ace:fixer:patterns`
  - Qdrant `external_error_fixes`
  - docs atlas sourceRefs
- [ ] Use transparent HMM states:
  - `schema_mismatch`
  - `migration_drift`
  - `route_contract_mismatch`
  - `server_client_boundary_violation`
  - `env_url_mismatch`
  - `vector_dimension_mismatch`
  - `browser_network_failure`
  - `unknown`
- [ ] For each fix task, include:
  - sourceRefs
  - suggested fix
  - validation command
  - risk tier
  - whether approval is required
- [ ] Do not auto-patch by default.
- [ ] `--fix` can generate patch files only, not apply them.

---

# Phase 9H — Production Readiness Definition

The system is production-ready only when:

- [ ] `npm run services:health:strict` passes.
- [ ] `npm run audit:contracts` has no FAIL findings.
- [ ] `npm run audit:pgvector` passes.
- [ ] `npm run audit:drizzle-meta` passes.
- [ ] `npm run atlas:validate` passes.
- [ ] `npm run atlas:root:full` passes.
- [ ] `npm run test:network-contracts` passes or has documented dev-only WARNs.
- [ ] All live DB shadow tables are classified.
- [ ] All sidecar migrations are documented.
- [ ] All vector dimensions are policy-compliant.
- [ ] Admin Copilot shows trust/provenance correctly.
- [ ] MCP command suggestions are allowlisted only.
- [ ] No unbounded synthesis writes are enabled.
- [ ] No production DB mutation command runs without explicit approval.

---

# Suggested Commit Sequence

```txt
docs(production): add phase 9 production-ready audit roadmap
feat(audit): add rg search integrity audit
docs(db): add live postgres reconciliation policy
feat(db): classify live shadow tables for drizzle reconciliation
docs(db): finalize pgvector hnsw application gate
feat(audit): add directory role analysis for production audits
feat(agent): extend error-fix dag with production audit findings
```

---

# Codex Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app

Task:
Implement Phase 9 production-ready audit planning and first safeguards for `.gitignore`/ripgrep search visibility, Drizzle live DB reconciliation, directory role analysis, and production testing.

Context:
The repo now has:
- Parent Atlas
- Programming Docs Atlas
- Feature Command Atlas
- Cross-Layer Contract Audit
- pgvector audit
- Drizzle sidecar migration policy
- 384/768 vector dimension policy
- Admin Copilot provenance
- MCP command suggestion tools

Recent findings:
- Layer 5 Live DB audit still fails due to 90+ shadow/live-only tables.
- Several SQL sidecars are documented.
- pgvector dimensions are now policy-compliant.
- `.gitignore` now excludes large diagnostics and binary artifacts.
- `rg` respects `.gitignore` by default, so production audits must use `-u` or `--no-ignore` when complete visibility is required.

Rules:
- Do not mutate production DB.
- Do not run `drizzle-kit push`.
- Do not remove ignored files blindly.
- Do not apply HNSW indexes without reviewing `pgvector-index-plan.md`.
- Do not auto-patch source files.
- Audits must be dry-run/read-only by default.
- Do not store hiddenThoughts, chainOfThought, kv_cache, tensor, cudaPointer, raw reasoning, or raw vectors in browser output.
- Every finding must include sourceRefs, severity, suggested fix, and validation command.

Implement:
1. Create `next_steps/production-ready-gitignore-drizzle-audit.md`.
2. Create `scripts/atlas/audit-rg-search-integrity.mjs`.
3. Create `scripts/atlas/analyze-directory-roles.mjs`.
4. Add `sveltekit-frontend/drizzle/live-db-table-policy.json`.
5. Update `TODO_ATLAS.md`.
6. Update `AGENTS.md`.
7. Add npm scripts:
   - `audit:rg`
   - `audit:directories`
   - `audit:production-ready`

Validation:
- `node --check scripts/atlas/audit-rg-search-integrity.mjs`
- `node --check scripts/atlas/analyze-directory-roles.mjs`
- `npm run audit:rg`
- `npm run audit:directories`
- `npm run audit:contracts`
- `npm run audit:pgvector`
- `npm run atlas:validate`
- `npm run atlas:root:full`

Return:
- files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```
