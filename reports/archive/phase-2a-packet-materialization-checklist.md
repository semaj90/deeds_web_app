# Packet Materialization Alignment & Atlas-Runner Setup

**Status:** PARTIALLY SUPERSEDED  
**Active checklist:** `reports/parent-atlas-open-lanes-todo.md`  
**Archived from:** `next_steps/active/2026-06-10_packet-materialization-alignment.md`

This checklist remains useful as a historical Phase 2A / packet-materialization reference, but it is no longer the canonical active board.

Completed since this document:
- packet key alignment
- SOM coordinate coverage
- graph refresh
- feature-id derivation review
- Postgres contract drift review
- task registry consolidation
- hidden packet surface discovery
- Parent Atlas overlay crosswalk

Still relevant for:
- packet identity audits
- atlas-runner safety
- Gemma4 enrichment order
- Neo4j sync ordering
- final HyperRAG smoke tests

No longer canonical for:
- production-readiness status
- directory-level mapping
- neschrom97 hidden surface scan
- SeaweedFS cold-storage manifests
- temporal task registry

Current follow-up order:
1. active-production-topology-mirror
2. Parent Atlas overlay reconciliation
3. sourceRef topology verification
4. MCP allowlist mapping
5. auth guard coverage
6. circular dependency cleanup
7. synthetic evidence concept cards
8. provenance parity
9. trust-tier editing

Core invariant preserved here:

```text
directory_path
  -> source_ref
  -> feature_id
  -> packet_id
  -> packet_key
  -> Redis
  -> Neo4j
  -> HyperRAG
  -> cold_storage_manifest
```

---

**Date:** 2026-06-10  
**Original status:** READY FOR IMPLEMENTATION  
**Priority:** P1 (blocks full Atlas pipeline)

## Problem Statement

The codebase semantic indexing pipeline is 85-90% complete, but the execution path is broken:

- **Windows host** → 127.0.0.1:5434 → WSL2 Docker Desktop proxy → Postgres
  - Result: `Connection terminated unexpectedly` (repeated connection resets)
  - Root cause: Windows loopback forwarding fails for long-running Atlas jobs

- **Materialization scripts** (materialize-nes-packets.mjs, gemma4-batch-summarize-qdrant.mjs)
  - Can only run via `docker compose --profile tools run atlas-runner`
  - Direct npm scripts from Windows fail on DB connection

- **Packet key generation mismatch** (FIXED this session)
  - Materializer: `nes:<slug>:<sha8(source_ref)>` (deterministic)
  - Summarizer: `nes:<slug>:<sha8(source_ref)>:<queryHash.slice(0,8)>` (non-deterministic)
  - Result: atlas_feature_map.packet_id won't match nes_chrom_packets.packet_key
  - **FIXED**: Both now use shared `buildPacketKey()` from `packet-materializer-lib.mjs`

## What Was Done (This Session)

### 1. Packet Key Alignment ✅
- Created `packet-materializer-lib.mjs` with shared helpers:
  - `buildPacketKey(sourceRef, featureId)` — deterministic, global
  - `buildPacketPayload(row)` — compact Qdrant/Postgres storage
  - `validatePacketKey(packet)` — audit identity chain
  - `validateIdentityChain(atlasRow, packet)` — full chain validation
- Updated `materialize-nes-packets.mjs` to use shared lib
- Updated `gemma4-batch-summarize-qdrant.mjs` to use shared lib
- Removed duplicate helper functions from both scripts

### 2. Docker Atlas-Runner ✅
- Added `atlas-runner` service to `docker-compose.yml`:
  - Profile: `tools` (opt-in: `docker compose --profile tools`)
  - Image: `node:22-alpine`
  - Volumes: entire repo mounted at `/workspace`
  - Env: Docker DNS names for Postgres/Neo4j/Qdrant/Redis
  - Ollama/llama-server via `host.docker.internal`
- Added npm scripts:
  - `atlas:runner` — low-level docker compose command
  - `atlas:runner:bash` — interactive shell in runner
  - `atlas:sync:docker` — run `atlas:sync:neo4j` via runner
  - `index:full-loop:docker` — run full pipeline via runner

### 3. Verification Completed ✅
- ✅ `nes_chrom_packets` table exists (27 columns, UNIQUE packet_key)
- ✅ `atlas_feature_map.packet_id` column exists (TEXT type)
- ✅ schema matches INSERT statements
- ✅ 14,471 rows in atlas_feature_map ready for materialization
- ✅ 27 existing packets (seed) in nes_chrom_packets

## Current Active Critical Path

This document no longer defines the active critical path. The active board is `reports/parent-atlas-open-lanes-todo.md`, with task state mirrored through `.opencode/tasks/task-state.md`.

### Phase A
- active-production-topology-mirror
- Parent Atlas overlay reconciliation
- sourceRef topology verification

### Phase B
- MCP allowlist mapping
- auth guard coverage
- circular dependency cleanup

### Phase C
- synthetic evidence concept cards
- provenance parity
- trust-tier editing

## Historical Critical Path

The following sections are retained for packet identity and atlas-runner reference. They are no longer the current blocker for production readiness.

### 1. Atlas-Runner Security Setup
**Historical status:** BLOCKED (needed .env configuration)

The atlas-runner service in docker-compose.yml references:
```yaml
DATABASE_URL: postgresql://legal_admin:${POSTGRES_PASSWORD}@legal-ai-postgres:5432/legal_ai_db
NEO4J_PASSWORD: ${NEO4J_PASSWORD}
REDIS_PASSWORD: ${REDIS_PASSWORD}
```

**Required Actions:**
```bash
# 1. Create narrower Postgres user (Atlas maintenance only)
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db <<SQL
CREATE USER atlas_worker WITH PASSWORD 'strong-random-password';
GRANT CONNECT ON DATABASE legal_ai_db TO atlas_worker;
GRANT USAGE ON SCHEMA public TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON atlas_feature_map TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON nes_chrom_packets TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON gpu_cluster_centroids TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON parent_atlas_documents TO atlas_worker;
SQL

# 2. Update docker-compose.yml atlas-runner service:
#    DATABASE_URL: postgresql://atlas_worker:${ATLAS_DB_PASSWORD}@legal-ai-postgres:5432/legal_ai_db

# 3. Set env vars in .env (at repo root, .gitignore'd):
ATLAS_DB_PASSWORD=<strong-random-password>
NEO4J_PASSWORD=<existing-or-new>
REDIS_PASSWORD=<existing-or-new>
POSTGRES_PASSWORD=<admin-password>
```

### 2. Test Materializer via atlas-runner
**Historical status:** BLOCKED (waiting for .env setup)

```bash
# Once .env is in place:
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:missing --verbose"

# Expected output: Batch 200-row operations creating packet_key entries
# Example: [materialize-nes-packets] Materialized: 14471
```

### 3. Test Summarizer via atlas-runner
**Historical status:** BLOCKED (materializer had to run first)

```bash
# Once materializer completes:
npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing --limit=50"

# Expected: Groups by source_ref, calls Gemma4 for each, enriches nes_chrom_packets.summary
# Careful: Gemma4 must be running (ollama serve gemma4-rotorquant:latest or llama-server)
```

### 4. Verify Identity Chain
**Historical status:** BLOCKED (depended on steps 2-3)

```bash
# After both materializer and summarizer complete:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<SQL
-- Should have 14471 rows with packet_id set
SELECT COUNT(*) as materialized FROM atlas_feature_map WHERE packet_id IS NOT NULL;

-- Should have 14471 + 27 seed rows
SELECT COUNT(*) as total_packets FROM nes_chrom_packets;

-- Audit sample: pick 10 random packet_keys and verify chain
SELECT 
  afm.source_ref,
  afm.feature_id,
  afm.packet_id,
  ncp.packet_key,
  CASE WHEN afm.packet_id = ncp.packet_key THEN '✓ MATCH' ELSE '✗ MISMATCH' END as chain_status
FROM atlas_feature_map afm
LEFT JOIN nes_chrom_packets ncp ON afm.packet_id = ncp.packet_key
WHERE afm.packet_id IS NOT NULL
LIMIT 10;
SQL
```

### 5. Full Pipeline Dry-Run
**Historical status:** BLOCKED (depended on steps 2-4)

```bash
# Dry-run the entire index:full-loop:docker
npm run atlas:runner -- "cd sveltekit-frontend && npm run index:full-loop:docker"

# If successful, this chains:
#   codebase:index → atlas:sync-qdrant → atlas:materialize-packets:missing
#   → gemma4:summarize:missing → atlas:sync:neo4j → karpathy:gpu
```

## Architectural Maturity Assessment (Updated)

| Component | Maturity | Blocker |
|-----------|----------|---------|
| Whole-codebase indexing | 85% | None (independent) |
| Atlas feature mapping | 90% | None (independent) |
| Qdrant payload normalization | 85% | Docker connection |
| NES packet materialization | COMPLETE | Historical invariant retained |
| Gemma4 packet enrichment | OPERATIONAL | Use evidence-first bounded scripts |
| Identity chain | VERIFIED | Use packet audit for regression checks |
| SOM coordinate coverage | VERIFIED | Qdrant somRow/somCol gap closed |
| Graph neighborhood refresh | VERIFIED | graph refresh ran and task closed |
| Topology mirror alignment | WARN | Active production rows still need Postgres mirror alignment |
| Overlay crosswalk | WARN | Root-contract-only lanes need reconciliation |
| Command allowlist mapping | OPEN | OpenCode/MCP routing contract still needs allowlist |
| Auth guard coverage | OPEN | API auth guard gaps remain |
| Repair-loop integration | 80% | packet_id chain verification |
| **Deterministic identity chain** | **VERIFIED** | **Keep bounded validation** |

**Current blocker:** topology mirror and overlay reconciliation, not packet generation.

## Implementation Order (Recommended)

### Phase 1: Docker Setup (30 min)
1. [ ] Create narrower `atlas_worker` Postgres user
2. [ ] Update docker-compose.yml atlas-runner DATABASE_URL
3. [ ] Create `.env` at repo root with ATLAS_DB_PASSWORD, NEO4J_PASSWORD, REDIS_PASSWORD
4. [ ] Test atlas-runner connectivity: `npm run atlas:runner:bash`

### Phase 2: Materializer Validation (15 min)
1. [ ] Run `npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:dry"`
2. [ ] Run `npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:missing --limit=100"` (test batch)
3. [ ] Verify: `SELECT COUNT(*) FROM nes_chrom_packets WHERE lane = 'atlas_materialized'`

### Phase 3: Summarizer Validation (20 min)
1. [ ] Verify Gemma4 is running: `curl http://host.docker.internal:8090/v1/models`
2. [ ] Run `npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing --limit=10 --verbose"`
3. [ ] Verify: `SELECT COUNT(*) FROM nes_chrom_packets WHERE summary IS NOT NULL`

### Phase 4: Full Pipeline (10 min)
1. [ ] Run full materializer: `npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:missing"`
2. [ ] Run full summarizer: `npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing"`
3. [ ] Run `npm run atlas:runner -- "cd sveltekit-frontend && npm run index:full-loop:docker"` (or wait for full loop command)

### Phase 5: Audit & Closure (15 min)
1. [ ] Run identity chain audit query (see step 4 above)
2. [ ] Generate packet statistics: `npm run atlas:runner -- "cd sveltekit-frontend && node scripts/atlas/audit-packets.mjs"`
3. [ ] Document in memory: final packet counts, any gaps, next phase recommendations

## Risk Mitigation

**Risk: Postgres user creation fails due to existing atlas_worker**
- Mitigation: First check: `SELECT 1 FROM pg_user WHERE usename = 'atlas_worker'`
- If exists, drop and recreate: `DROP USER IF EXISTS atlas_worker CASCADE;`

**Risk: .env is committed to git (credential leak)**
- Mitigation: `.env` is already in `.gitignore` — verify before committing
- Pre-commit hook recommendation: reject any .env commits

**Risk: Gemma4 takes >90s and times out**
- Mitigation: Summarizer already has 90s timeout per Gemma4 hard rule
- If timeout: check `docker logs` for OOM, verify GPU VRAM available

**Risk: Database connection pool exhausted mid-pipeline**
- Mitigation: Both scripts use `batch=200` with explicit `pool.end()` on completion
- If error: check `pg_stat_activity` for hanging connections

## Success Criteria

- ✅ atlas-runner service starts without errors
- ✅ Materializer creates 14,471+ nes_chrom_packets rows (lane = 'atlas_materialized')
- ✅ Summarizer enriches packets without key mismatches (identity chain audit passes)
- ✅ Redis cache writes complete (ace:packet:*, nes:packet:* keys present)
- ✅ Full `index:full-loop:docker` completes end-to-end
- ✅ No duplicate packet keys across lanes
- ✅ atlas_feature_map.packet_id matches nes_chrom_packets.packet_key for all 14,471 rows

## Files Modified This Session

- ✅ `docker-compose.yml` — Added atlas-runner service
- ✅ `sveltekit-frontend/package.json` — Added npm scripts for docker runner
- ✅ `scripts/atlas/packet-materializer-lib.mjs` — NEW, shared packet helpers
- ✅ `scripts/atlas/materialize-nes-packets.mjs` — Refactored to use shared lib
- ✅ `scripts/atlas/gemma4-batch-summarize-qdrant.mjs` — Refactored to use shared lib
- ✅ `scripts/atlas/embed-chunks.mjs` — Added text_hash, normalized source_path
- ✅ `sveltekit-frontend/package.json` — Added atlas:materialize-packets* scripts

## Files to Create/Update Next

- [ ] `.env` (create, .gitignore'd) — ATLAS_DB_PASSWORD, NEO4J_PASSWORD, REDIS_PASSWORD
- [ ] `scripts/atlas/audit-packets.mjs` — NEW, packet statistics + identity chain validation
- [ ] `next_steps/active/2026-06-10_atlas-runner-deployment.md` — Operational runbook

## References

- Architecture: `docs/architecture/phase-101-completion-plan.md` (Block 1 — Atlas materialization)
- Packet key spec: `scripts/atlas/packet-materializer-lib.mjs` (canonical)
- Database schema: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d nes_chrom_packets"`
- Prior session: packet_id column added live via `drizzle/manual/20260610_atlas_feature_map_packet_id.sql`
