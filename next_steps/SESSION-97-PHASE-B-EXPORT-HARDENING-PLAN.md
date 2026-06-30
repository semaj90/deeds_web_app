# Session 97: Phase B Completion → Export/Replication Hardening Plan

**Status**: Phase B in progress (6.5% complete, ~8-10 hours remaining)  
**Created**: 2026-06-30  
**Scope**: Post-Phase B integration, library selections, export/replication hardening, Docker production readiness

---

## 1. Phase B Completion Timeline & Handoff

### Current State (Checkpoint)
```
Pass 1 (Summarization):  3,727 / 57,304 (6.5%)  | ✅ ACTIVE (1.6 pkt/sec)
Pass 2 (Embedding):      150 / 57,304 (0.26%)   | ⏸️ Batch complete
Pass 3 (Cache Push):     20 / 57,304 (0.04%)    | ⏸️ Batch complete
Elapsed: ~10 minutes | Estimated total: 8-10 hours | Errors: 0
```

### Handoff Criteria (Phase B DONE)
- ✅ `analysis_pass_results`: 57,304 rows (all pass_types: summarization, embedding, cache_push)
- ✅ `atlas_summary_layers`: 57,304 rows (summaries + embeddings populated)
- ✅ Redis BitFrost: `bifrost:packet:*` + `bifrost:feature:*` keys warmed (57K entries)
- ✅ Qdrant `chrom97_context`: 57,304 points with 384-dim embeddings + payloads
- ✅ Zero failed records in `analysis_pass_results.status`

**Expected completion**: 2026-06-30 ~14:00 UTC (8-10 hours from start)

---

## 2. Post-Phase B Architecture Integration (GAP-DRIVEN)

### Neo4j GDS + Karpathy GPU Pipeline (from 15-neo4j-gds-karpathy-gpu-architecture.md)

| Priority | Gap | File | Impact | Approx Time |
|----------|-----|------|--------|-------------|
| **P0** | APOC batch upsert in karpathy-persistence | `src/lib/server/indexer/karpathy-persistence.ts` | 6s → 120ms for 1335 edges | 2 hours |
| **P0** | manifold4 sync from Postgres → Neo4j | `src/lib/server/graph/hypergraph-4d.ts` | Enable 4D-aware GDS | 1.5 hours |
| **P1** | GDS KNN + graphAuthorityScore composite | `src/lib/server/graph/neo4j-gds.ts` | Pre-computed authority in Qdrant | 2 hours |
| **P1** | D27 ontology gate (LegalEvidence / DevCode) | `scripts/audit-parity.mjs` | Prevent evidence/code pollution | 1.5 hours |
| **P2** | n10s (neosemantics) SHACL validation | Docker Neo4j plugin | Formal RDF ontology enforcement | 1 hour |
| **P2** | graphAuthorityScore to Qdrant payload | `src/lib/server/graph/karpathy-hook.ts` | Zero Neo4j RTT on retrieval | 1 hour |

**Critical Path**: P0 GAP1 + GAP2 → P1 GAP3 → Ready for Phase C (Retrieval Reranking)

---

## 3. Recommended Libraries & Time-Saving Selections

### 3.1 Neo4j / Graph Layer
| Library | Version | Use Case | Time-Save |
|---------|---------|----------|-----------|
| **neo4j-driver** | 5.30+ | Native TypeScript GDS calls, APOC batch upsert | Avoids hand-rolling Cypher; APOC 5.x has `periodic.iterate` native |
| **apoc** (Neo4j plugin) | 5.24+ | Batch upsert, manifold4 sync, path finding | Reduces 1335 serial queries → 11 batch calls |
| **graph-data-science** (Neo4j) | 2.9+ | PageRank, Louvain, KNN mutation | Already deployed; extend with KNN |
| **n10s** (neosemantics) | 5.2+ | SHACL validation, RDF ontology | **DEFER to P2** — use plain Cypher for D27 gate initially |

**Rationale**: Don't add n10s yet. Use Cypher `OntologyConcept` nodes + D27 audit gate (plain Cypher). SHACL is nice-to-have after D27 passes.

### 3.2 GPU / Quantization Layer
| Library | Version | Use Case | Notes |
|---------|---------|----------|-------|
| **RotorQuant** (Scrya fork) | Mar 2026 | 3-bit weights, 5.3× faster prefill | **Defer** — requires head_dim=256 verification on Gemma4; TurboQuant q8_0 stable today |
| **bitnet.c** | GitHub artalis-io | 1-bit ternary inference, zero deps | **CPU/edge only** — no CUDA. Not primary for RTX 3060 Ti. Skip. |
| **TurboQuant** (current) | stock `llama-server` | q8_0/q8_0 KV, deterministic | Keep as baseline. No changes needed. |
| **LibTorch** + **CUDA 12.1** | Existing | GPU tensor ops (pageRankGPU, attentionScoreGPU) | Extend with KNN similarity (batchCosineSimilarity exists) |

**Rationale**: RotorQuant + bitnet are research experiments. TurboQuant q8_0 is production stable. Extend LibTorch ops instead.

### 3.3 Cache Hierarchy (TurboQuant + Bifrost Enhancement)
| Tier | Technology | TTL | Bottleneck | Time-Save |
|------|-----------|-----|-----------|-----------|
| **L0** | VRAM (8GB) | session | Eviction on prefix overflow | Implement Tier 1 NVMe warm → reduce cold-prefill from 25s |
| **L1** | Redis exact-match | 1h | 5ms round-trip for cache miss | Keep; add Redis Cluster if >100K keys (today: 57K packets) |
| **L2** | Bifrost semantic | 24h | Qdrant ANN (2–5s) for novel query | Keep; already deployed at :3040 |
| **L2.5** | NVMe KV warm (proposed) | 24h | Sequential read (200ms) vs re-prefill (25s) | **P2 work** — not blocking Phase B finish |
| **L3** | Cold inference | cold | 25s prefill on RTX 3060 Ti | Acceptable fallback |

**Recommendation**: After Phase B + Neo4j integration (P0/P1), tackle Tier 2.5 NVMe warm cache (RotorQuant + bitnet doc already sketched). Saves ~24s per cold-prefix recovery.

---

## 4. Export/Replication Hardening for Production

### 4.1 Docker Logs Collection & Analysis

**Current Setup** (docker-compose.yml):
```yaml
services:
  legal-ai-postgres:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
  legal-ai-qdrant:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
  legal-ai-neo4j:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
```

**Recommended Additions**:

1. **Centralized Logging** (docker-compose update):
```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: 100m
    max-file: 5
    labels: "service"

services:
  legal-ai-postgres:
    logging: *default-logging
    labels:
      service: "postgres"
      environment: "production"
    environment:
      POSTGRES_INITDB_ARGS: "-c log_statement=all -c log_min_duration_statement=1000"
```

2. **Log Export Script** (`scripts/export-docker-logs.sh`):
```bash
#!/bin/bash
# Collect Docker logs for all services before export/replication

EXPORT_DIR="${1:-./logs/production-export-$(date +%Y%m%d_%H%M%S)}"
mkdir -p "$EXPORT_DIR"

docker-compose logs postgres   > "$EXPORT_DIR/postgres.log"   2>&1
docker-compose logs qdrant    > "$EXPORT_DIR/qdrant.log"     2>&1
docker-compose logs neo4j     > "$EXPORT_DIR/neo4j.log"      2>&1
docker-compose logs valkey    > "$EXPORT_DIR/valkey.log"     2>&1

# Capture Docker inspect output (resource limits, mounts, env)
for service in postgres qdrant neo4j valkey; do
  CONTAINER=$(docker-compose ps -q $service)
  docker inspect $CONTAINER > "$EXPORT_DIR/inspect-$service.json" 2>&1
done

# Disk usage snapshot
du -sh * > "$EXPORT_DIR/disk-usage.txt" 2>&1

echo "Logs exported to: $EXPORT_DIR"
tar -czf "$EXPORT_DIR.tar.gz" "$EXPORT_DIR" && rm -rf "$EXPORT_DIR"
echo "Archive: $EXPORT_DIR.tar.gz"
```

3. **Schema Export** (before replication):
```bash
# Postgres schema + data summary
docker exec legal-ai-postgres pg_dump -U legal_admin legal_ai_db --schema-only \
  > logs/postgres-schema-$(date +%Y%m%d).sql

# Row counts per table
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT schemaname, tablename, n_live_tup as row_count
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
" > logs/postgres-row-counts-$(date +%Y%m%d).txt

# Qdrant collection snapshot
curl -s http://127.0.0.1:6333/collections \
  | jq '.result.collections[] | {name, points_count}' \
  > logs/qdrant-collections-$(date +%Y%m%d).json
```

### 4.2 Production Hardening Checklist

#### Postgres (legal-ai-postgres)
- [ ] Enable WAL (Write-Ahead Logging) for crash recovery: `wal_level = replica`
- [ ] Set `max_connections = 200` (default 100; needed for parallel workers)
- [ ] Enable `log_statement = 'all'` for audit trail (Phase B upserts)
- [ ] Set `work_mem = 256MB` (support larger sorts in analysis_pass_results queries)
- [ ] Create backup before Phase B handoff: `docker exec legal-ai-postgres pg_dump -Fc > phase-b-checkpoint.dump`
- [ ] Verify replication slot (if replicating): `SELECT * FROM pg_replication_slots;`
- [ ] Monitor VACUUM: `autovacuum = on`, `autovacuum_naptime = 10s` (for high-insert analysis_pass_results)

#### Qdrant (legal-ai-qdrant)
- [ ] Enable snapshots before replication: `POST /collections/{collection}/snapshots`
- [ ] Verify point count matches Postgres: `SELECT COUNT(*) FROM analysis_pass_results WHERE pass_type='cache_push'`
- [ ] Set `snapshot_schedule = "0 2 * * *"` (daily 2 AM snapshots)
- [ ] Monitor disk usage: `GET /status` → `disk_usage_bytes`
- [ ] If replicating: use HTTP endpoint (gRPC has issues with multi-node snapshots)

#### Neo4j (legal-ai-neo4j)
- [ ] Enable online backup (if available): `dbms.backup.enabled = true`
- [ ] Set transaction timeout: `dbms.transaction.timeout = 60s` (for batch APOC upsert)
- [ ] Monitor heap memory: `-Xmx8g -Xms8g` (Gemma4 summary context uses memory)
- [ ] Enable query logging: `dbms.logs.query.enabled = true`, `dbms.logs.query.threshold = 1000ms`
- [ ] Before replication: `neo4j-admin database dump neo4j --to-path=/backups`

#### Valkey/Redis (legal-ai-valkey)
- [ ] Enable RDB snapshots: `SAVE 900 1` (save every 900s if ≥1 changed key)
- [ ] Set `maxmemory = 8gb` (prevent OOM on 57K packet cache)
- [ ] Set `maxmemory-policy = allkeys-lru` (evict LRU keys when full)
- [ ] Verify password auth: `requirepass redis` (already set)
- [ ] Monitor key count: `DBSIZE` (should be ~57K after Phase B)

#### Docker Volumes (CRITICAL — data durability)
- [ ] Before replication, verify all volumes are mounted on host:
```bash
docker volume inspect legal-ai-postgres_data  # Should show Mountpoint
docker volume inspect legal-ai-qdrant_data
docker volume inspect legal-ai-neo4j_data
docker volume inspect legal-ai-valkey_data
```
- [ ] Snapshot volumes: `docker run --rm -v legal-ai-postgres_data:/data -v /backups:/backups alpine tar czf /backups/postgres-vol-$(date +%Y%m%d).tar.gz /data`
- [ ] Test restore on test container before production replication

---

## 5. Export & Replication Strategy

### 5.1 Phase B → Phase C Export (Single-node to DR/replication)

**Order of operations** (after Phase B completes):

1. **Lock writes** (5 min window):
   ```bash
   # Prevent new writes during export
   docker-compose pause legal-ai-postgres legal-ai-qdrant
   ```

2. **Capture state**:
   ```bash
   # Postgres: logical backup (smaller than physical)
   docker exec legal-ai-postgres pg_dump -U legal_admin -d legal_ai_db -Fc \
     > backups/phase-b-checkpoint-$(date +%Y%m%d_%H%M%S).dump
   
   # Qdrant: snapshot
   curl -X POST http://127.0.0.1:6333/collections/chrom97_context/snapshots
   curl http://127.0.0.1:6333/collections/chrom97_context/snapshots \
     | jq '.result[] | select(.status == "completed") | .snapshot_name' \
     > /tmp/qdrant-snapshot.txt
   
   # Neo4j: database dump
   docker exec legal-ai-neo4j neo4j-admin database dump neo4j --to-path=/backups
   
   # Valkey: RDB snapshot
   docker exec legal-ai-valkey redis-cli SAVE
   docker cp legal-ai-valkey:/data/dump.rdb backups/valkey-$(date +%Y%m%d).rdb
   ```

3. **Verify checksums**:
   ```bash
   sha256sum backups/phase-b-checkpoint-*.dump > backups/CHECKSUMS
   sha256sum backups/valkey-*.rdb >> backups/CHECKSUMS
   ```

4. **Resume writes**:
   ```bash
   docker-compose unpause legal-ai-postgres legal-ai-qdrant
   ```

5. **Transfer to DR/replicas** (if on separate infrastructure):
   ```bash
   rsync -az backups/ dr-server:/backups/
   ```

### 5.2 Replication Setup (Postgres + Qdrant streaming)

**For Postgres** (WAL-based replication):
```bash
# On primary (existing setup)
docker-compose exec -T postgres psql -U legal_admin -d legal_ai_db -c "
  CREATE PUBLICATION phase_b_replica FOR TABLE analysis_pass_results, atlas_packets, atlas_summary_layers;
"

# On replica (new container)
docker-compose exec -T postgres-replica psql -U legal_admin -d legal_ai_db -c "
  CREATE SUBSCRIPTION phase_b_replica CONNECTION 'host=postgres user=legal_admin dbname=legal_ai_db' PUBLICATION phase_b_replica;
"
```

**For Qdrant** (HTTP snapshot + restore):
```bash
# On replica:
curl -X PUT http://127.0.0.1:6333/collections/chrom97_context/snapshots/recover \
  -H "Content-Type: application/json" \
  -d '{"snapshot_url": "http://primary:6333/collections/chrom97_context/snapshots/<snapshot_name>"}'
```

---

## 6. Time-Saving Shortcuts & Trade-offs

### What NOT to do (avoid false precision):
- ❌ Don't optimize RotorQuant for Gemma4 head_dim=256 until you have 10+ hours to verify (skip this cycle)
- ❌ Don't add n10s SHACL validation yet (use D27 Cypher gate instead, 10× faster to wire)
- ❌ Don't build real parallel DAG dispatch (use sequential orchestrator — good enough for now)
- ❌ Don't add CUDA Graph capture (documented in memory/ already; skip unless prefill becomes bottleneck)

### What DOES save time (confirmed wins):
- ✅ **APOC batch upsert** (GAP1): 6s → 120ms for Neo4j edge writes. Worth 2 hours of work.
- ✅ **manifold4 sync** (GAP2): Pre-compute 4D coords in Postgres, bulk-copy to Neo4j. Worth 1.5 hours.
- ✅ **Pre-computed graphAuthorityScore in Qdrant** (GAP6): Eliminates Neo4j RTT on every retrieval. Worth 1 hour.
- ✅ **Docker logs + schema export before replication**: Prevents surprises on failover. Worth 30 min prep.
- ✅ **WAL-based Postgres replication**: Automatic streaming replication beats manual snapshot restore. Worth ~2 hours setup.

---

## 7. Handoff Checklist → Phase C (Retrieval Reranking)

### Pre-Replication Sign-Off
- [ ] Phase B complete: 57,304 packets in analysis_pass_results
- [ ] Zero errors in analysis_pass_results.status
- [ ] BitFrost warmed: `redis-cli DBSIZE` shows ~57K entries
- [ ] Qdrant verified: `curl http://127.0.0.1:6333/collections/chrom97_context | jq '.result.points_count'` ≥ 57,000
- [ ] Neo4j synced: PageRank calculated, graphAuthorityScore cached
- [ ] Backups taken: Postgres dump, Qdrant snapshot, Neo4j backup, Valkey RDB

### Phase C Readiness (Neo4j + Reranking)
- [ ] GAP1 (APOC batch upsert) merged
- [ ] GAP2 (manifold4 sync) merged
- [ ] GAP3 (GDS KNN + graphAuthorityScore) merged
- [ ] D27 ontology gate passing (LegalEvidence / DevCode separation)
- [ ] Parallel orchestrator ready: Pass 2 embedding feeding Pass 3 cache in real-time
- [ ] Replication validated: DR site has full Phase B state

### Ready for Phase C (GPU Reranking)
- [ ] attentionScoreGPU wired into TRACE reranker
- [ ] graphAuthorityScore read from Qdrant payload (no Neo4j RTT)
- [ ] Qdrant KNN similarity available for cross-file co-authorship boost
- [ ] TRACE reranker blend: 0.4·graphPageRank + 0.3·attention + 0.3·authority + 0.1·knnSimilarity

---

## 8. Risk Mitigation & Known Unknowns

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Postgres replication lag during high-write (Phase B) | WAL-based replication handles this natively; verify lag with `pg_stat_replication` | Ops |
| Qdrant snapshot corruption (rare) | Take 2 snapshots; verify point counts before restore | Ops |
| Neo4j APOC batch timeout on 1335+ edges | Set `dbms.transaction.timeout = 120s` (up from 60s default) | Eng |
| LibTorch CUDA OOM on large KNN batch | Batch size limit: `KNN_BATCH_SIZE = 512` (tuneable per RTX memory) | Eng |
| Export/replication on same hardware as production | Test on staging first; use rsync to separate machine | Ops |

---

## 9. Timeline & Milestones

| Milestone | Est. Date | Duration | Dependencies |
|-----------|-----------|----------|--------------|
| **Phase B Complete** | 2026-06-30 ~14:00 UTC | 8-10h from start | 57K summaries + embeddings |
| **Backups + Export** | 2026-06-30 ~15:00 UTC | 1h | Phase B done |
| **Neo4j P0 (APOC + manifold4)** | 2026-06-30 ~17:00 UTC | 3.5h | Backups safe |
| **Neo4j P1 (KNN + authority)** | 2026-07-01 ~12:00 UTC | 3h | P0 merged |
| **D27 ontology gate** | 2026-07-01 ~14:00 UTC | 1.5h | P1 passing |
| **Replication validated** | 2026-07-01 ~16:00 UTC | 2h | Backups + schema verified |
| **Phase C (Retrieval Reranking)** | 2026-07-02 | Ready to start | All above done |

---

## 10. Reference Docs

- [Session 96: Provenance-First Architecture](../PHASE-B-MULTI-PASS-ENRICHMENT-COMPLETE.md)
- [Neo4j GDS + Karpathy Architecture](./15-neo4j-gds-karpathy-gpu-architecture.md)
- [RotorQuant + BitNet Cache Hierarchy](./2026-05-10_rotorquant-bitnet-cache-hierarchy.md)
- [GPU Weight Architecture](../memory/gpu-weight-architecture.md)
- [Docker Compose Reference](../../docker-compose.yml)

---

**Status**: Ready for operator review  
**Next Action**: Approve Phase B completion → proceed to Neo4j P0 integration (GAP1 + GAP2)
