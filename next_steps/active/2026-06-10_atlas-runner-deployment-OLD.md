# Atlas-Runner Deployment & Security Setup
**Date:** 2026-06-10  
**Operator:** (to be assigned)  
**Duration:** ~45 minutes  
**Prerequisite:** `docker-compose.yml` has atlas-runner service (already added)

## Phase 1: Database User Setup (10 min)

### Step 1.1: Verify Postgres is healthy
```bash
docker exec legal-ai-postgres pg_isready
# Expected: accepting connections
```

### Step 1.2: Create atlas_worker user
```bash
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db <<'SQL'
-- Drop if exists (idempotent)
DROP USER IF EXISTS atlas_worker CASCADE;

-- Create restricted user for Atlas jobs
CREATE USER atlas_worker WITH PASSWORD 'atlas-worker-pw-change-me';

-- Grant database access
GRANT CONNECT ON DATABASE legal_ai_db TO atlas_worker;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO atlas_worker;

-- Grant table permissions (Atlas maintenance tables only)
GRANT SELECT, INSERT, UPDATE ON atlas_feature_map TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON nes_chrom_packets TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON gpu_cluster_centroids TO atlas_worker;
GRANT SELECT, INSERT, UPDATE ON parent_atlas_documents TO atlas_worker;

-- Optional: grant read-only on other tables for audits
GRANT SELECT ON information_schema.tables TO atlas_worker;
GRANT SELECT ON pg_tables TO atlas_worker;
SQL

# Expected: CREATE ROLE + GRANT statements complete silently
```

### Step 1.3: Verify user was created
```bash
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db -c "SELECT usename FROM pg_user WHERE usename = 'atlas_worker';"
# Expected: atlas_worker
```

### Step 1.4: Test atlas_worker login (optional, but recommended)
```bash
docker exec legal-ai-postgres psql -U atlas_worker -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_feature_map;"
# Expected: 14471 (or current row count)
# If error: password was rejected or grants incomplete
```

## Phase 2: Environment Configuration (10 min)

### Step 2.1: Create .env at repo root
```bash
# From Windows PowerShell or bash in the repo root:
cat > .env <<'EOF'
# Atlas worker database credentials (restricteduser for maintenance jobs)
ATLAS_DB_PASSWORD=atlas-worker-pw-change-me

# Neo4j credentials (for graph sync)
NEO4J_PASSWORD=neo4j

# Redis credentials (optional, leave empty if no password)
REDIS_PASSWORD=

# Postgres admin password (for emergency recovery, not used by atlas-runner)
POSTGRES_PASSWORD=123456
EOF
```

**Security Notes:**
- `.env` is in `.gitignore` — will NOT be committed
- Change `atlas-worker-pw-change-me` to match the password you set in Step 1.2
- Treat `.env` like a secret file (do not commit, do not share)
- Optional: add pre-commit hook to prevent accidental .env commits

### Step 2.2: Verify .env was created
```bash
ls -la .env
# Expected: file exists, not world-readable (mode 644 is fine)
```

### Step 2.3: Update docker-compose.yml atlas-runner DATABASE_URL
**Check current state:**
```bash
grep "ATLAS_DB_PASSWORD\|DATABASE_URL" docker-compose.yml | head -5
```

**Expected to see (already done in prior session):**
```yaml
DATABASE_URL: postgresql://legal_admin:${POSTGRES_PASSWORD}@legal-ai-postgres:5432/legal_ai_db
```

**Change to (if not already updated):**
```yaml
DATABASE_URL: postgresql://atlas_worker:${ATLAS_DB_PASSWORD}@legal-ai-postgres:5432/legal_ai_db
```

**If you need to update it manually:**
```bash
# Backup first
cp docker-compose.yml docker-compose.yml.bak

# Replace (use your editor or sed)
sed -i 's/legal_admin:\${POSTGRES_PASSWORD}/atlas_worker:${ATLAS_DB_PASSWORD}/g' docker-compose.yml

# Verify
grep DATABASE_URL docker-compose.yml | grep atlas-runner -A1
```

## Phase 3: Atlas-Runner Connectivity Test (10 min)

### Step 3.1: Start Docker services (if not already running)
```bash
docker compose --profile full up -d
# Expected: all services start (postgres, neo4j, qdrant, valkey, redis, atlas-runner already defined)
```

### Step 3.2: Test atlas-runner can connect to all services
```bash
npm run atlas:runner:bash
# This starts an interactive shell inside the runner container
```

**Once inside the runner shell, test each service:**

```bash
# Test Postgres
psql -h legal-ai-postgres -U atlas_worker -d legal_ai_db -c "SELECT version();"
# Expected: PostgreSQL 18.4 ... message

# Test Neo4j
cypher-shell -a neo+s://legal-ai-neo4j:7687 -u neo4j -p neo4j "RETURN 1;"
# Expected: 1 (if cypher-shell installed; if not, this will fail silently)

# Test Qdrant
curl -s http://legal-ai-qdrant:6333/health | jq .
# Expected: {"status":"ok"}

# Test Redis/Valkey
redis-cli -h legal-ai-valkey -p 6379 PING
# Expected: PONG

# Exit the shell
exit
```

### Step 3.3: If any service fails
- Check Docker logs: `docker logs legal-ai-postgres` (replace with service name)
- Verify services are running: `docker compose ps`
- Verify network: `docker network ls` (should show `legal-ai-network`)
- Ping from runner: `docker compose --profile tools run --rm atlas-runner ping -c1 legal-ai-postgres`

## Phase 4: Materializer Test Run (10 min)

### Step 4.1: Dry-run the materializer (no DB writes)
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:dry"
# Expected output:
# [materialize-nes-packets] Starting (dry_run=true ...)
# [DRY RUN] Sample rows:
#   ../scripts/atlas/materialize-nes-packets.mjs → feat:... cluster:... 
#   ... (5 more rows)
# [materialize-nes-packets] Done
```

### Step 4.2: If dry-run fails with connection error
**Error example:** `Error: connect ECONNREFUSED 127.0.0.1:5434`
- **Cause**: Script is trying to use host connection instead of Docker DNS
- **Fix**: Make sure you're using `npm run atlas:runner --` prefix
- Verify the command was typed exactly: `npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:dry"`

### Step 4.3: Limited test run (100 rows)
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:limit -- 100 --verbose"
# Expected output:
# [materialize-nes-packets] Starting (dry_run=false only_missing=false limit=100)
# [materialize-nes-packets] atlas_feature_map rows to process: 14471
# ... [progress bar]
# [materialize-nes-packets] Done
#   Materialized : 100
#   Redis cached : <0-100 depending on redis availability>
#   Errors       : 0
```

**Verify in DB:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as materialized FROM nes_chrom_packets WHERE lane = 'atlas_materialized';"
# Expected: 100+
```

### Step 4.4: Full materializer run
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:materialize-packets:missing --verbose"
# Expected: 14,000+ rows processed
# Time: ~5-15 min depending on DB load
```

**Verify in DB (full result):**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as materialized FROM nes_chrom_packets WHERE lane = 'atlas_materialized'; \
   SELECT COUNT(*) as total_packets FROM nes_chrom_packets; \
   SELECT COUNT(*) as atlas_linked FROM atlas_feature_map WHERE packet_id IS NOT NULL;"
# Expected: 
#   materialized: 14471
#   total_packets: 14471 + 27 (seed)
#   atlas_linked: 14471
```

## Phase 5: Summarizer Test Run (10 min)

### Step 5.1: Verify Gemma4 is available
```bash
# Check if Gemma4 is running on host
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0].id'
# OR check llama-server on port 8090 (if using TurboQuant)
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'

# Expected: gemma4-legal-iq4xs-direct.gguf or gemma4-rotorquant:latest
```

### Step 5.2: Limited summarizer run
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing -- --limit=10 --verbose"
# Expected output:
# [gemma4-batch-summarize] Starting (only_missing=true limit=10)
# ... [Gemma4 summaries being generated]
# [gemma4-batch-summarize] Done
#   Summarized: 10
#   Errors: 0
# Time: ~30-90s depending on Gemma4 speed
```

**Verify summaries were written:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as with_summary FROM nes_chrom_packets WHERE summary IS NOT NULL LIMIT 5;"
# Expected: 10+
```

### Step 5.3: Full summarizer run (if Step 5.2 succeeds)
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run gemma4:summarize:missing"
# Time: 1-2 hours depending on Gemma4 throughput (batch=1)
# Note: Run in screen/tmux session to avoid interruption
```

## Phase 6: Identity Chain Audit (5 min)

### Step 6.1: Audit packet key alignment
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
-- Pick 10 random packets and verify chain
SELECT 
  afm.source_ref,
  afm.feature_id,
  afm.packet_id,
  ncp.packet_key,
  CASE 
    WHEN afm.packet_id = ncp.packet_key THEN '✓ MATCH'
    ELSE '✗ MISMATCH'
  END as alignment,
  ncp.lane
FROM atlas_feature_map afm
INNER JOIN nes_chrom_packets ncp ON afm.packet_id = ncp.packet_key
ORDER BY RANDOM()
LIMIT 10;
SQL

# Expected: all 10 rows show ✓ MATCH in alignment column
```

### Step 6.2: Check for orphaned entries
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
-- atlas_feature_map rows without packets (should be 0 after full run)
SELECT COUNT(*) as unlinked
FROM atlas_feature_map
WHERE packet_id IS NULL;

-- nes_chrom_packets without atlas link (fine, some are seeds)
SELECT COUNT(*) as orphaned_packets
FROM nes_chrom_packets ncp
WHERE NOT EXISTS (
  SELECT 1 FROM atlas_feature_map afm WHERE afm.packet_id = ncp.packet_key
);
SQL

# Expected:
#   unlinked: 0 (after full materializer)
#   orphaned_packets: 27 (the seed packets before Phase 2)
```

## Phase 7: Full Pipeline Smoke Test (5 min)

### Step 7.1: Run the full index:full-loop:docker
```bash
npm run atlas:runner -- "cd sveltekit-frontend && npm run index:full-loop:docker"
# This chains:
#   codebase:index → atlas:sync-qdrant → atlas:materialize-packets:missing
#   → gemma4:summarize:missing → atlas:sync:neo4j → karpathy:gpu
# Time: 30 min - 2 hours depending on Gemma4 and GPU availability
```

### Step 7.2: Monitor progress
- In separate terminal: `docker compose logs -f atlas-runner`
- Watch for errors, connection resets, or OOM kills
- If process hangs >5min with no output, interrupt with Ctrl+C and check logs

### Step 7.3: Verify final state
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT 
    (SELECT COUNT(*) FROM atlas_feature_map WHERE packet_id IS NOT NULL) as afm_linked,
    (SELECT COUNT(*) FROM nes_chrom_packets WHERE lane = 'atlas_materialized') as packets_materialized,
    (SELECT COUNT(*) FROM nes_chrom_packets WHERE summary IS NOT NULL) as packets_summarized,
    (SELECT COUNT(*) FROM gpu_cluster_centroids) as centroids;"
```

**Expected (successful run):**
```
 afm_linked | packets_materialized | packets_summarized | centroids
----------+---------------------+-------------------+----------
    14471 |              14471 |            14471 |    <N>
```

## Rollback Plan

If any phase fails and you need to rollback:

### Clear materialized packets only
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
DELETE FROM nes_chrom_packets WHERE lane = 'atlas_materialized';
UPDATE atlas_feature_map SET packet_id = NULL WHERE packet_id LIKE 'nes:%';
SQL
```

### Clear everything (nuclear option)
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
DELETE FROM nes_chrom_packets WHERE lane IN ('atlas_materialized', 'gemma4_summary');
UPDATE atlas_feature_map SET packet_id = NULL;
SQL
```

### Remove atlas_worker user (if recreating)
```bash
docker exec legal-ai-postgres psql -U postgres -d legal_ai_db -c \
  "DROP USER IF EXISTS atlas_worker CASCADE;"
```

## Success Checklist

- [ ] atlas_worker Postgres user created and tested
- [ ] `.env` file created with ATLAS_DB_PASSWORD
- [ ] docker-compose.yml atlas-runner uses atlas_worker credentials
- [ ] atlas-runner interactive shell connects to all services
- [ ] Materializer dry-run completes without errors
- [ ] Materializer 100-row test creates 100 packets in nes_chrom_packets
- [ ] Full materializer run completes (14,471 packets)
- [ ] atlas_feature_map.packet_id matches nes_chrom_packets.packet_key for all rows
- [ ] Summarizer 10-row test completes (with Gemma4 running)
- [ ] Full summarizer run completes (all 14,471 packets have summaries)
- [ ] Identity chain audit passes (10/10 rows show ✓ MATCH)
- [ ] Final state query shows all three counts > 0

## Troubleshooting

**Q: atlas-runner fails to start**
- A: Check `docker compose logs atlas-runner`
- Common: Volume mount path is wrong, or image not downloaded yet

**Q: Connection refused to legal-ai-postgres**
- A: Check `docker compose ps` to verify postgres is running and healthy
- Verify network: `docker exec atlas-runner ping legal-ai-postgres`

**Q: atlas_worker password rejected**
- A: Verify password in .env matches the one set in Step 1.2
- Resync: Edit .env and restart atlas-runner with `docker compose --profile tools run --rm atlas-runner bash`

**Q: Gemma4 summarizer times out**
- A: Check GPU VRAM: `nvidia-smi`
- Increase timeout: Edit `gemma4-batch-summarize-qdrant.mjs` timeout from 90s to 120s

**Q: Redis writes fail (redis cache skipped message)**
- A: OK to ignore if REDIS_PASSWORD is empty or Redis unavailable
- If critical: set REDIS_PASSWORD in .env to enable caching

## References

- Configuration: `.env` (created this step)
- Credentials: docker-compose.yml atlas-runner section
- Database: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db`
- Logs: `docker compose logs -f <service>`
- NPM scripts: `sveltekit-frontend/package.json` (atlas:* commands)
