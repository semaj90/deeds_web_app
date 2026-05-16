# Phase 9 — Production-Ready Audit, .gitignore Visibility, and Drizzle Reconciliation

Status: **In Progress**
Last Updated: 2026-05-16

This checklist tracks the hardening of the retrieval and contract-audit pipelines.

## 1. Search Visibility (Phase 9A) - COMPLETED ✅
Ensures audits don't miss files hidden by .gitignore.
- [x] Implement `scripts/atlas/audit-rg-search-integrity.mjs`.
- [x] Refine `rg` detection to avoid false positives (comments/variables).
- [x] Fix visibility violations in `audit-contract-map.mjs`.
- [x] Fix visibility violations in `audit-sveltekit-form-contracts.mjs`.
- [x] Fix visibility violations in `audit-drizzle-postgres-contracts.mjs`.
- [x] Verify total compliance via `node scripts/atlas/audit-rg-search-integrity.mjs`.

## 2. TurboQuant & Path Cleanup - COMPLETED ✅
Standardize environment paths and remove personal artifacts.
- [x] Consolidate `package.json` scripts (removed redundant rotorquant/lora entries).
- [x] Refactor `scripts/launch-turboquant.ps1` to use environment variables for model/binary paths.
- [x] Support workspace-relative defaults (`bin/`, `models/`) before falling back to system paths.
- [x] Ensure `-Detached` mode correctly captures stderr for post-mortem analysis.

## 3. Drizzle & Live DB Reconciliation - IN PROGRESS 🏗️
Resolve shadow tables and type mismatches.
- [ ] Execute `npm run audit:drizzle` to identify drift.
- [x] Verify HNSW index coverage (14 indexes confirmed live).
- [ ] Resolve 90+ shadow tables (manual drop or import to schema).
- [ ] Fix High-Severity UUID vs Integer type mismatches.

## 4. Feature Stress Tests (Phase 9B) - PENDING ⏳
- [ ] Warden/GPU-cache concurrency test.
- [ ] Evidence pipeline (768-dim) high-load ingestion.
- [ ] Retrieval lane latency benchmarking.

## 5. LangGraph VLM Orchestration (Phase 9C) - PENDING ⏳
- [ ] Define VLM lifecycle in LangGraph.
- [ ] Orchestrate Gemma 4 / TurboQuant state transitions.
