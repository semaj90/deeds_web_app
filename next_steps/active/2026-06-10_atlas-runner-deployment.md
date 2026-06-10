# Atlas-Runner Deployment & Validation
**Date:** 2026-06-10  
**Operator:** (assigned)  
**Duration:** ~90 minutes total (setup + validation + full pipeline)

## 1. Objective

Move all Atlas maintenance jobs from Windows host execution to Docker-network execution via `atlas-runner`.

### Success Criteria

- ✅ atlas-runner container starts
- ✅ Postgres reachable via `legal-ai-postgres`
- ✅ Neo4j reachable via `legal-ai-neo4j`
- ✅ Qdrant reachable via `legal-ai-qdrant`
- ✅ Redis reachable via `legal-ai-valkey`
- ✅ Materializer completes: 14,471 packets created
- ✅ Identity chain audit passes: 0 key mismatches
- ✅ Full pipeline completes end-to-end

---

## 2. Preflight

### Verify Docker Services Running

```bash
docker compose ps
```

Expected healthy services:
- `legal-ai-postgres` — status: healthy
- `legal-ai-neo4j` — status: healthy
- `legal-ai-qdrant` — status: healthy
- `legal-ai-valkey` — status: healthy
- `legal-ai-rabbitmq` — status: healthy

**If any service unhealthy:**
```bash
docker compose up -d <service-name>
docker compose logs <service-name>
```

### Verify atlas-runner Service Definition

```bash
docker compose --profile tools config | grep -A 20 "atlas-runner:"
```

Expected:
- Image: `node:22-alpine`
- Working directory: `/workspace`
- Volumes: `./:/workspace`
- Networks: `legal-ai-network`
- Depends on: postgres, neo4j, qdrant, valkey (all healthy)

---

## 3. Security Hardening

### Create Narrower Database User

**Current State:** Scripts use `legal_admin` (full permissions)  
**Target State:** Use `atlas_worker` (maintenance-only permissions)

```bash
# Create user
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db <<'SQL'
DROP USER IF EXISTS atlas_worker CASCADE;

CREATE USER atlas_worker WITH PASSWORD 'strong-random-password-here';

GRANT CONNECT ON DATABASE legal_ai_db TO atlas_worker;
GRANT USAGE ON SCHEMA public TO atlas_worker;

-- Atlas maintenance tables only
GRANT SELECT, INSERT, UPDATE ON atlas_feature_map TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON nes_chrom_packets TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON gpu_cluster_centroids TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON parent_atlas_documents TO atlas_worker;
SQL

# Verify
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db \
  -c "SELECT usename FROM pg_user WHERE usename = 'atlas_worker';"
# Expected: atlas_worker
```

### Create Environment Configuration

```bash
# Create .env at repo root (will NOT be committed)
cat > .env <<'EOF'
ATLAS_DB_PASSWORD=strong-random-password-here
NEO4J_PASSWORD=neo4j
REDIS_PASSWORD=
POSTGRES_PASSWORD=123456
EOF

# Verify file created and not world-readable
ls -la .env
# Expected: -rw-r--r-- (644 or similar)
```

**Critical:** The password in `.env` must match the `atlas_worker` password you created above.

---

## 4. Connectivity Validation

### Start Interactive Shell in atlas-runner

```bash
npm run atlas:runner:bash
```

You should now be inside the runner container at `/workspace`.

### Test Each Service

**PostgreSQL:**
```bash
psql -h legal-ai-postgres -U atlas_worker -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_feature_map;"
# Expected: 14471
```

**Neo4j (if cypher-shell available):**
```bash
cypher-shell -a neo+s://legal-ai-neo4j:7687 -u neo4j -p neo4j \
  "MATCH (n) RETURN count(n) LIMIT 1;"
# Expected: <integer>
```

**Qdrant:**
```bash
curl -s http://legal-ai-qdrant:6333/collections | jq '.result | length'
# Expected: <number of collections>
```

**Redis/Valkey:**
```bash
redis-cli -h legal-ai-valkey -p 6379 PING
# Expected: PONG
```

### If Any Service Unreachable

Common issues:
- Service name typo (should be lowercase, hyphenated: `legal-ai-postgres` not `legal_ai_postgres`)
- Service not running: `docker compose ps` from host to check
- Service not healthy: Check logs with `docker compose logs <service>`
- Network issue: Try `ping legal-ai-postgres` from inside runner

Exit shell if all tests pass:
```bash
exit
```

---

## 5. Materialization Validation

### Dry-Run (No Database Writes)

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:dry"
```

Expected output:
```
[materialize-nes-packets] Starting (dry_run=true ...)
[DRY RUN] Sample rows:
  ../scripts/atlas/materialize-nes-packets.mjs → feat:materialize-nes-packets:... cluster:...
  ... (5 more rows)
[materialize-nes-packets] Done
```

### Limited Test Run (100 Rows)

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:limit -- 100 --verbose"
```

Expected output:
```
[materialize-nes-packets] Starting (dry_run=false only_missing=false limit=100)
[materialize-nes-packets] atlas_feature_map rows to process: 14471
  materialized 100 / ~14471  errors=0
[materialize-nes-packets] Done
  Materialized : 100
  Redis cached : <0-100 depending on redis availability>
  Errors       : 0
```

### Verify Packets Were Created

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as materialized FROM nes_chrom_packets WHERE lane = 'atlas_materialized';"
# Expected: 100
```

### Full Materializer Run

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:missing --verbose"
```

**Expected:**
- Time: 5-15 minutes
- Output: `Materialized : 14471`
- Errors: 0

**Verify in database:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT 
    (SELECT COUNT(*) FROM nes_chrom_packets WHERE lane = 'atlas_materialized') as materialized,
    (SELECT COUNT(*) FROM atlas_feature_map WHERE packet_id IS NOT NULL) as linked_atoms;
   "
# Expected: both 14471
```

---

## 6. Summarization Validation

**Prerequisite:** Gemma4 must be running
```bash
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0].id'
# OR
curl -s http://127.0.0.1:11434/api/tags | jq '.models[0].name'
```

If Gemma4 not available: skip this section, continue to Identity Chain Audit

### Limited Summarizer Run (10 Packets)

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing -- --limit=10 --verbose"
```

Expected output:
```
[gemma4-batch-summarize] Starting (only_missing=true limit=10)
... [Gemma4 summaries being streamed]
[gemma4-batch-summarize] Done
  Summarized: 10
  Errors: 0
```

Time: 30-60 seconds depending on Gemma4 speed

### Verify Summaries Were Written

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as with_summary FROM nes_chrom_packets WHERE summary IS NOT NULL;"
# Expected: 10+
```

### Full Summarizer Run (Optional, Only After Limited Run Succeeds)

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing"
```

**Expected:**
- Time: 1-2 hours (batch=1, sequential Gemma4 calls)
- Output: `Summarized: 14471`

**Tip:** Run in `screen` or `tmux` session to avoid interruption on SSH disconnect

---

## 7. Identity Chain Audit

**This is the critical validation step.** It ensures the deterministic identity chain is maintained:

```
source_ref → feature_id → packet_id → packet_key → centroid_id
```

### Run Audit Script

```bash
npm run atlas:runner -- "cd sveltekit-frontend && node scripts/atlas/audit-packets.mjs"
```

Expected output:
```
[audit-packets] Starting (sample_size=100, repair=false)

[Stats]
  atlas_feature_map:        14471 total, 14471 linked
  nes_chrom_packets:        14471 total
    - materialized:        14471
    - summarized:          <N/A or 14471 if summarizer ran>

[Identity Chain Audit] Checking 100 random packets...
  100/100 packets match identity chain

[Orphaned Check]
  0 packets without atlas_feature_map link (expected: ~27 seeds)

[Summary]
✅ PASS: Identity chain is aligned. Pipeline ready for next stage.
```

### If Audit Fails

**Error: Misaligned packets**

```bash
npm run atlas:runner -- "cd sveltekit-frontend && node scripts/atlas/audit-packets.mjs --full"
```

This audits all rows (slow, but identifies mismatch pattern). If mismatches exist:
1. Check materializer logs for skipped rows
2. Verify packet_key generation in `packet-materializer-lib.mjs`
3. Run cleanup: `DELETE FROM nes_chrom_packets WHERE lane = 'atlas_materialized'`
4. Rerun materializer

---

## 8. Full Pipeline Smoke Test

### Run Complete Index Pipeline

```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run index:full-loop:docker"
```

This chains the full pipeline:
1. `codebase:index` — Scan codebase, create chunks
2. `atlas:sync-qdrant` — Sync Qdrant payload to atlas_feature_map
3. `atlas:materialize-packets:missing` — Create base packets
4. `gemma4:summarize:missing` — Enrich with Gemma4 summaries (requires Gemma4)
5. `atlas:sync:neo4j` — Sync graph to Neo4j
6. `karpathy:gpu` — Compute PageRank + authority scores

**Expected:**
- Time: 30 min - 2 hours (depends on Gemma4)
- Each stage logs progress
- No fatal errors

### Monitor Progress

In separate terminal:
```bash
docker compose logs -f atlas-runner
```

Watch for:
- Connection errors → check Docker network
- OOM kills → check `docker stats`
- Timeouts → check Gemma4 health

### Verify Final State

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
SELECT
  (SELECT COUNT(*) FROM atlas_feature_map WHERE packet_id IS NOT NULL) as afm_linked,
  (SELECT COUNT(*) FROM nes_chrom_packets WHERE lane = 'atlas_materialized') as packets_materialized,
  (SELECT COUNT(*) FROM nes_chrom_packets WHERE summary IS NOT NULL) as packets_summarized,
  (SELECT COUNT(DISTINCT som_cluster) FROM gpu_cluster_centroids) as gpu_clusters;
SQL
```

Expected:
```
 afm_linked | packets_materialized | packets_summarized | gpu_clusters
----------+---------------------+-------------------+----------
    14471 |              14471 |            14471 |        <N>
```

---

## 9. Exit Criteria

### Minimum (Materialization Only)

- ✅ 14,471 `atlas_feature_map` rows with `packet_id` set
- ✅ 14,471+ `nes_chrom_packets` rows with `lane = 'atlas_materialized'`
- ✅ 0 packet key mismatches (audit-packets.mjs returns ✅ PASS)
- ✅ Redis cache populated with `ace:packet:*` keys

### Complete (Full Pipeline)

- ✅ All minimum criteria met
- ✅ 14,471+ packets with summaries (if Gemma4 ran)
- ✅ Neo4j graph sync completes
- ✅ Karpathy GPU scores computed
- ✅ `npm run audit-packets.mjs` returns ✅ PASS

---

## Rollback

If any step fails and needs rollback:

### Clear Just Materialized Packets

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
DELETE FROM nes_chrom_packets WHERE lane = 'atlas_materialized';
UPDATE atlas_feature_map SET packet_id = NULL;
SQL
```

### Clear Everything

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
DELETE FROM nes_chrom_packets WHERE lane IN ('atlas_materialized', 'gemma4_summary');
UPDATE atlas_feature_map SET packet_id = NULL;
SQL
```

---

## Troubleshooting

**Q: Connection refused to legal-ai-postgres**
- A: Verify service running: `docker compose ps legal-ai-postgres`
- A: Verify network: `docker network ls | grep legal-ai`
- A: Try `npm run atlas:runner:bash` then `ping legal-ai-postgres`

**Q: atlas_worker password rejected**
- A: Verify password in `.env` matches what was set in Security Hardening section
- A: Reset: `psql -U postgres ... DROP USER IF EXISTS atlas_worker` then recreate

**Q: Materializer hangs or timeouts**
- A: Check Docker memory: `docker stats legal-ai-postgres`
- A: Check logs: `docker compose logs legal-ai-postgres`
- A: Increase DB pool size in `materialize-nes-packets.mjs` (currently max: 4)

**Q: Gemma4 summarizer times out (>90s)**
- A: Check GPU VRAM: `nvidia-smi`
- A: Check Gemma4 health: `curl -s http://127.0.0.1:8090/v1/models`
- A: Increase timeout in `gemma4-batch-summarize-qdrant.mjs` from 90s to 120s

---

## Success Summary

After completing all exit criteria, the following are guaranteed:

- ✅ Deterministic packet keys across all layers (Qdrant → Postgres → Redis)
- ✅ source_ref ↔ feature_id ↔ packet_id ↔ packet_key ↔ centroid_id chain verified
- ✅ No duplicate packet keys
- ✅ All 14,471 packets reachable from any entry point
- ✅ Atlas pipeline ready for repair-loop + HyperRAG integration

The identity chain is now the load-bearing invariant. Any future changes to packet generation, materialization order, or schema must verify it still holds.
