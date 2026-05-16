# Production-Ready Audit & Feature Roadmap

## Phase 9: Pre-Production Hardening & Verification

### 1. .gitignore & Search Integrity Audit
- [ ] **Search Verification**: Audit all `rg` (ripgrep) usages in scripts (e.g., `audit-contract-map.mjs`, `index-repo.mjs`) to ensure they use `-u` or `--no-ignore` when searching diagnostic logs or data directories.
- [ ] **Directory Analysis**: Perform a deep sweep for large files mistakenly committed or ignored.
- [ ] **Ignore Clean-up**: Identify files in `.gitignore` that are critical for production diagnostics and ensure they are properly handled by the build pipeline.
- [ ] **Deep Audit**: Verify that `sveltekit-frontend/eng.traineddata` and other binary assets are accessible to the runtime even if ignored by Git.

### 2. Drizzle & PostgreSQL Schema Reconciliation
- [ ] **Migration Parity**: Run `drizzle-kit check` and `npm run audit:drizzle` to ensure zero drift between `drizzle/` SQL files and the live PostgreSQL schema.
- [ ] **Drizzle Studio Verification**: Validate that all tables (including `pgvector` columns) are correctly editable and viewable in Drizzle Studio without crashing on specialized types.
- [ ] **Schema Coverage**: Ensure all "Additional Tables" and "Ingestion Schema" are fully represented in the main `schema.ts` barrel export.

### 3. Feature-by-Feature Production Readiness
- [ ] **Warden GPU Lane**:
    - [ ] Stress test 384-dim vector retrieval under high concurrency.
    - [ ] Verify GPU cache invalidation logic during schema updates.
- [ ] **Legal Evidence Pipeline**:
    - [ ] Validate 768-dim `embeddinggemma` native dimensions across all production nodes.
    - [ ] End-to-end test of MinIO -> OCR -> Embedding -> Qdrant flow.
- [x] **Drizzle Reconciliation**: Resolve the 90+ "Shadow" tables (missing from schema) and the High-Severity UUID/Integer mismatch.
    - [x] Normalize all `user_id`, `created_by`, `assigned_to` columns to `Integer`.
    - [x] Repair live PostgreSQL schema using idempotent scripts.
    - [x] Exclude `archived-schemas` from the contract audit pipeline.

### 4. Search Glob & Retrieval Audit
- [ ] **Glob Policy**: Standardize glob patterns across the codebase to prevent "silent failures" where `.gitignore` filters out valid source files during indexing.
- [ ] **384-Dim Documentation**: Maintain the `ALLOWED_DIMS` whitelist in `audit-pgvector-schema.mjs` as the source of truth for all multi-lane retrieval models.

---
**Status**: Initialized 2026-05-16
**Goal**: Zero-drift, production-hardened retrieval stack.
