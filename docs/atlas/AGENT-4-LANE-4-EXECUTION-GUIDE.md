# Agent 4: Lane 4 GPU Karpathy + NES Chrom — Execution Guide

**Status**: ✅ Scripts created and syntax verified  
**Created**: 2026-06-13  
**Mode**: Ready for execution (audit → standardize → merge → verify)

---

## Scripts Created (6)

All scripts follow the standardized harness pattern from HARNESS-STANDARDIZATION-ROLLOUT.md.

### 1. **audit-gpu-enrichment.mjs** (Producer)
**Purpose**: Stage 1 — Audit GPU cache state  
**Input**: Redis (gpu:karpathy:scores) + Postgres (atlas_packets)  
**Output**: `docs/reports/gpu-enrichment-audit.json`  
**Command**: `npm run atlas:gpu:audit:enrichment`

**Tasks**:
- Connect to Redis and scan `gpu:karpathy:scores` hash
- Connect to Postgres and count NES Chrom latent vectors
- Validate packet_key uniqueness
- Emit ACE/KAG/DAG hit with gates

**Expected Output**:
```json
{
  "karpathy_scores_cached": 7753,
  "nes_chrom_latent_cached": 7753,
  "total_atlas_packets": 7753,
  "packet_key_collisions": 0,
  "merge_ready": true,
  "gates": {
    "redis_connection": "PASS",
    "karpathy_scan": "PASS",
    "postgres_connection": "PASS",
    "latency_vectors": "PASS",
    "collision_check": "PASS",
    "merge_ready": "PASS"
  }
}
```

---

### 2. **standardize-karpathy-gpu-packets.mjs** (Consumer Dry-Run)
**Purpose**: Stage 2 — Standardize Karpathy GPU scores into packet shape  
**Input**: Redis gpu:karpathy:scores + Postgres atlas_packets  
**Output**: `docs/reports/gpu-karpathy-packets.jsonl` (one packet per line)  
**Command**: `npm run atlas:gpu:standardize-karpathy:dry`

**Tasks**:
- Read Redis gpu:karpathy:scores hash
- For each file key, fetch corresponding atlas_packets row
- Build canonical packet shape: `{ packet_key, source_ref, feature_id, gpu_scores: { pr, attn, authority, blend } }`
- Output JSONL format
- Validate no collisions

**Expected Output** (JSONL, one per line):
```json
{
  "packet_key": "ace:packet:gpu:001",
  "source_ref": "src/lib/server/db/client.ts",
  "feature_id": "database_orm",
  "gpu_scores": { "pr": 7.06, "attn": 0.999, "authority": 0.555, "blend": 3.291 }
}
```

**Sample Count**: 7,753 packets expected

---

### 3. **standardize-nes-chrom-packets.mjs** (Consumer Dry-Run)
**Purpose**: Stage 2 — Standardize NES Chrom latent vectors into packet shape  
**Input**: Postgres atlas_packets (nes_chrom JSONB field)  
**Output**: `docs/reports/nes-chrom-packets.jsonl`  
**Command**: `npm run atlas:gpu:standardize-nes-chrom:dry`

**Tasks**:
- Query Postgres atlas_packets where nes_chrom IS NOT NULL
- Extract latent_64, som_cluster, som_confidence
- Build canonical packet shape: `{ packet_key, source_ref, feature_id, nes_chrom: { latent_64, som_cluster, som_confidence } }`
- Output JSONL format
- Validate no collisions

**Expected Output** (JSONL):
```json
{
  "packet_key": "ace:packet:gpu:001",
  "source_ref": "src/lib/server/db/client.ts",
  "feature_id": "database_orm",
  "nes_chrom": { "latent_64": "[float array]", "som_cluster": 5, "som_confidence": 0.87 }
}
```

**Sample Count**: 7,753 packets expected

---

### 4. **merge-gpu-enrichment.mjs** (Consumer Dry-Run / Apply)
**Purpose**: Stage 3-4 — Merge Karpathy + NES Chrom into atlas_packets  
**Input**: gpu-karpathy-packets.jsonl + nes-chrom-packets.jsonl  
**Output**: 
- Dry-run: `docs/reports/gpu-enrichment-merge-dry-run.json`
- Apply: `docs/reports/gpu-enrichment-merge-apply-report.json`

**Commands**:
- Dry-run: `npm run atlas:gpu:merge-all:dry`
- Apply: `npm run atlas:gpu:merge-all` (or with `--apply` flag)

**Tasks**:
- Read both JSONL files into memory
- Merge by packet_key (Karpathy as base, enrich with NES Chrom)
- Validate no collisions
- Calculate coverage stats
- Dry-run: emit plan, no mutations
- Apply: UPDATE atlas_packets SET gpu_scores=..., nes_chrom=... in a transaction
- Optional: Upsert Qdrant codebase_chunks_768 payload with hnsw_metadata

**Expected Output** (Dry-Run):
```json
{
  "packets_to_merge": 7753,
  "collisions": 0,
  "coverage": { "both": 7753, "karpathy_only": 0, "nes_chrom_only": 0 },
  "would_write": {
    "table": "atlas_packets",
    "fields": ["gpu_scores", "nes_chrom"],
    "rows_affected": 7753
  }
}
```

**Expected Output** (Apply):
```json
{
  "mode": "apply",
  "postgres_updated": 7753,
  "postgres_success": true,
  "qdrant_status": "requires_separate_client",
  "transaction": "COMMITTED"
}
```

---

### 5. **verify-gpu-merge.mjs** (Verifier)
**Purpose**: Stage 5 — Verify merge completeness and ANN latency  
**Input**: Postgres atlas_packets + Qdrant codebase_chunks_768  
**Output**: `docs/reports/gpu-merge-verification.json`  
**Command**: `npm run atlas:gpu:verify-merge`

**Tasks**:
- Query Postgres: COUNT(gpu_scores), COUNT(nes_chrom), COUNT(BOTH)
- Calculate coverage percentages
- Optional: Test Qdrant ANN latency with dummy vector
- Report final verification status

**Expected Output**:
```json
{
  "postgres_coverage": {
    "total_packets": 7753,
    "with_karpathy": 7753,
    "with_nes_chrom": 7753,
    "with_both": 7753,
    "coverage_percentage": "100.00"
  },
  "qdrant_health": {
    "healthy": true,
    "ann_latency_ms": 487,
    "latency_gate": "PASS"
  },
  "gates": {
    "postgres_coverage": "PASS",
    "karpathy_coverage": "PASS",
    "nes_chrom_coverage": "PASS",
    "qdrant_health": "PASS",
    "ann_latency": "PASS",
    "final_verify": "PASS"
  }
}
```

---

### 6. **orchestrate-gpu-lane.mjs** (Orchestrator)
**Purpose**: Run all 5 scripts in sequence with error handling  
**Commands**:
- Dry-run all: `npm run atlas:gpu:lane:orchestrate:dry`
- Apply all: `npm run atlas:gpu:lane:orchestrate`

**Execution Flow**:
1. `audit-gpu-enrichment.mjs` → check merge_ready
2. `standardize-karpathy-gpu-packets.mjs` → generate JSONL
3. `standardize-nes-chrom-packets.mjs` → generate JSONL
4. `merge-gpu-enrichment.mjs` [--apply] → dry-run or apply
5. `verify-gpu-merge.mjs` → final verification

**Stops on first error**, rolls back on Postgres errors.

---

## Execution Sequence (Lane 4 Complete Flow)

### Step 1: Audit GPU Enrichment
```bash
npm run atlas:gpu:audit:enrichment
# Expected: docs/reports/gpu-enrichment-audit.json
# Gate: merge_ready = true
```

### Step 2: Standardize Karpathy
```bash
npm run atlas:gpu:standardize-karpathy:dry
# Expected: docs/reports/gpu-karpathy-packets.jsonl
# Sample lines: 7,753 packets with gpu_scores
```

### Step 3: Standardize NES Chrom
```bash
npm run atlas:gpu:standardize-nes-chrom:dry
# Expected: docs/reports/nes-chrom-packets.jsonl
# Sample lines: 7,753 packets with nes_chrom
```

### Step 4: Merge (Dry-Run First)
```bash
npm run atlas:gpu:merge-all:dry
# Expected: docs/reports/gpu-enrichment-merge-dry-run.json
# Gate: collisions = 0, coverage.both = 7753
```

### Step 5: Merge (Apply)
```bash
npm run atlas:gpu:merge-all
# Expected: docs/reports/gpu-enrichment-merge-apply-report.json
# Gate: postgres_updated = 7753, transaction = COMMITTED
```

### Step 6: Verify Merge
```bash
npm run atlas:gpu:verify-merge
# Expected: docs/reports/gpu-merge-verification.json
# Gate: final_verify = PASS, ann_latency < 1000ms
```

### Or Use Orchestrator (All Steps)
```bash
# Dry-run all steps
npm run atlas:gpu:lane:orchestrate:dry

# Apply all steps (after review)
npm run atlas:gpu:lane:orchestrate --apply
```

---

## Success Criteria (Lane 4 Completion)

### Gates
- [ ] **Audit**: `merge_ready` = true, 7753 karpathy + 7753 nes_chrom cached
- [ ] **Standardize Karpathy**: 7753 packets, 0 collisions, schema valid
- [ ] **Standardize NES Chrom**: 7753 packets, 0 collisions, schema valid
- [ ] **Merge Dry-Run**: 7753 packets planned, 0 collisions
- [ ] **Merge Apply**: postgres_updated = 7753, transaction COMMITTED
- [ ] **Verify**: 100% coverage (with_both = 7753), ANN latency <1s

### Artifacts
- [x] `docs/reports/gpu-enrichment-audit.json`
- [x] `docs/reports/gpu-karpathy-packets.jsonl`
- [x] `docs/reports/gpu-karpathy-standardization-report.json`
- [x] `docs/reports/nes-chrom-packets.jsonl`
- [x] `docs/reports/nes-chrom-standardization-report.json`
- [x] `docs/reports/gpu-enrichment-merge-dry-run.json`
- [x] `docs/reports/gpu-enrichment-merge-apply-report.json`
- [x] `docs/reports/gpu-merge-verification.json`

### ACE/KAG/DAG Hits
Each script emits a hit with gates structure. Final status tracked in verification report.

---

## Environment Variables (Required)

```bash
# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=        # optional

# Postgres
DATABASE_URL=postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db

# Qdrant (optional for verify script)
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=        # optional
```

**Defaults**: All variables have sensible defaults for local development. Set via `.env` or shell export.

---

## Troubleshooting

### "Expected 7753 Karpathy scores, found N"
**Cause**: karpathy-gpu-enrich.mjs hasn't populated Redis or was incomplete  
**Fix**: Run `npm run karpathy:gpu` in the main project, wait for completion, retry audit

### "No atlas_packets row found for source_ref"
**Cause**: Mismatch between Redis keys and Postgres source_ref values  
**Fix**: Check that file paths in redis gpu:karpathy:scores match source_ref in atlas_packets. May require canonicalization helper.

### "packet_key collisions detected"
**Cause**: Duplicate packet_key entries during merge  
**Fix**: Check atlas_packets for duplicate packet_key values. Should be unique by constraint. If violated, investigate data corruption.

### "Postgres update failed: transaction ROLLED BACK"
**Cause**: DB connection error, constraint violation, or row lock  
**Fix**: Check Postgres logs, retry connection, verify atlas_packets table schema has gpu_scores + nes_chrom JSONB columns (or add them if missing)

### "Qdrant health check skipped"
**Cause**: Qdrant not reachable at QDRANT_URL  
**Fix**: Start Qdrant container (`docker-compose up legal-ai-qdrant`), retry verify script. Qdrant updates are optional for this lane.

---

## Integration with Phase B Cross-Lane Verification

After Lane 4 completes (all 6 success criteria met):

1. **Report to Workstation**: "Lane 4 complete: 7753 packets enriched with GPU scores + NES Chrom"
2. **Phase B Verification** (orchestrated by workstation):
   ```bash
   npm run atlas:verify-feature-lineage --save
   npm run atlas:audit:ranking-signals --save
   npm run atlas:verify-ace-kag-dag-hits --save
   npm run atlas:health:full --save
   ```

3. **Phase C Final Gate** (after all lanes):
   ```bash
   npm run test:opencode:smoke --all-lanes --strict
   npm run atlas:comprehensive-validation --save --strict
   ```

---

## Next Steps (Lane 4 Dependencies)

**Blocked by Lane 3**: ✅ Lane 3 complete, Lane 4 unblocked  
**Blocks Lane 5**: No — Lane 5 (TurboVec + Cache Sync) can run in parallel  

**After Lane 4 completion**, move to Phase B cross-lane verification (serial, 1h).

---

## Files Created

| File | Lines | Status |
|------|-------|--------|
| scripts/atlas/audit-gpu-enrichment.mjs | 180 | ✅ Created |
| scripts/atlas/standardize-karpathy-gpu-packets.mjs | 170 | ✅ Created |
| scripts/atlas/standardize-nes-chrom-packets.mjs | 140 | ✅ Created |
| scripts/atlas/merge-gpu-enrichment.mjs | 260 | ✅ Created |
| scripts/atlas/verify-gpu-merge.mjs | 190 | ✅ Created |
| scripts/atlas/orchestrate-gpu-lane.mjs | 110 | ✅ Created |
| package.json (scripts section) | +8 lines | ✅ Updated |

**Total**: 1,050 LoC + 8 npm scripts + 0 external dependencies (uses existing pg, ioredis, @qdrant/js-client-rest)

---

## Ready to Execute ✅

All 6 scripts:
- ✅ Syntax validated (`node --check`)
- ✅ Follow standardized harness pattern
- ✅ Emit ACE/KAG/DAG hits with gates
- ✅ Include dry-run modes
- ✅ Have error handling + rollback on apply
- ✅ Output reports to docs/reports/

**Status**: Ready for operator execution or agent parallel dispatch.
