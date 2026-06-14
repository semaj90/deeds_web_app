# Phase D: TurboVec-First Whole-Codebase Indexing

**Status**: Ready to Execute  
**Date**: June 14, 2026  
**Scope**: Full-codebase packet indexing + TurboVec ANN sidecar + Qdrant mirror

---

## Pivot Summary

**Previous (Abandoned)**:
- Tree node ingestion from sveltekit-frontend only
- Drizzle JSONB support (not reliable)
- Qdrant-only ANN

**Current (TurboVec-First)**:
- Full-codebase packet identity via Postgres raw SQL
- TurboVec as canonical ANN/rerank sidecar
- Qdrant as semantic mirror (not primary index)
- No Drizzle JSONB dependencies

---

## Execution Order

### Phase 1: Scope Audit (5 min)

```bash
cd sveltekit-frontend
npm run atlas:scope:whole
```

**Output**: 
- `docs/reports/whole-codebase-index-scope.json`
- `docs/reports/whole-codebase-index-scope.md`

**Gate**: 
- ✅ Indexable files identified
- ✅ Exclusion rules applied
- ✅ Size estimate < 500MB

---

### Phase 2: Raw SQL Migrations (2 min)

Apply the manual migration for JSONB/GIN indexes:

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -f drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql
```

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packets" | head -30
```

**Gate**:
- ✅ `metadata jsonb` column exists
- ✅ GIN index on metadata exists
- ✅ All operational indexes exist

---

### Phase 3: Whole-Codebase Packet Upsert (10 min)

**Dry-run first**:
```bash
npm run atlas:packets:whole:dry
```

**Review**:
- `docs/reports/whole-codebase-atlas-packet-upsert.json`
- `docs/reports/whole-codebase-atlas-packet-upsert.md`

**Gate**:
- ✅ >1000 packets identified
- ✅ feature_id derived correctly
- ✅ No secrets in metadata

**Then apply**:
```bash
npm run atlas:packets:whole:apply
```

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) as total_packets, \
       COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id \
       FROM atlas_packets WHERE packet_universe = 'atlas';"
```

---

### Phase 4: TurboVec Corpus Export (5 min)

```bash
npm run atlas:turbovec:export
```

**Output**:
- `memory/exports/turbovec-corpus.jsonl` (one packet per line)

**Gate**:
- ✅ JSONL valid
- ✅ text_for_embedding bounded to 8KB
- ✅ Secrets excluded

**Verify**:
```bash
head -5 memory/exports/turbovec-corpus.jsonl | jq .
```

---

### Phase 5: TurboVec Smoke Test (5 min)

Ensure TurboVec sidecar is online:

```bash
npm run atlas:turbovec:smoke
```

**Output**:
- `docs/reports/turbovec-sidecar-smoke.json`
- `docs/reports/turbovec-sidecar-smoke.md`

**Gate**:
- ✅ Health endpoint responds
- ✅ Query "authentication session" returns results
- ✅ Latency < 1s

**If it fails**:
```bash
docker ps | grep turbovec
docker logs <turbovec-container>
```

---

### Phase 6: Qdrant Mirror Sync (Dry-Run) (10 min)

```bash
npm run atlas:qdrant:whole-sync:dry
```

**Review**:
- How many canonical points will be updated
- Any orphans detected

**Gate**:
- ✅ > 50% of packets have matching Qdrant points
- ✅ source_ref alignment verified

---

### Phase 7: End-to-End Retrieval Audit (5 min)

```bash
npm run atlas:retrieval:e2e
```

**Output**:
- `docs/reports/retrieval-spine-e2e.json`

**Gate**:
- ✅ Postgres packets > 1000
- ✅ Qdrant points > 1000
- ✅ Sample cross-check passes (postgres ↔ qdrant alignment)

---

## Full Stack: Apply

Once all 7 phases PASS:

```bash
npm run atlas:qdrant:whole-sync:apply
```

**Verify**:
```bash
curl http://127.0.0.1:6333/collections/codebase_chunks_768/points/count
```

---

## Retrieval Stack (After Phase D)

```
User Query
  ↓
L0: Redis / Bifrost Cache (5ms)
  ↓
L1: TurboVec ANN Sidecar (100-500ms)
  ↓
L2: Qdrant Semantic Mirror (500ms-2s)
  ↓
L3: Postgres GIN / pgvector (1-5s)
  ↓
L4: Neo4j Bounded Context (2-10s)
  ↓
L5: Karpathy Authority Blend (Redis read, <1s)
  ↓
L6: XGBoost Learned Rerank (1-2s)
  ↓
L7: Gemma4 Synthesis (20-30s)
```

---

## Hard Rules (Non-Negotiable)

1. ✅ **Do NOT use Drizzle for JSONB/operator-class indexes** → Use raw SQL only
2. ✅ **Do NOT limit indexing to sveltekit-frontend** → Index entire repo root
3. ✅ **Do NOT run unbounded Neo4j traversal** → Max 3 hops, max 20 nodes
4. ✅ **Do NOT overwrite atlas_packets from nes_chrom_packets** → Separate ledgers
5. ✅ **Do NOT join row identity by feature_id alone** → Use packet_key + source_ref
6. ✅ **Dry-run before apply** → Every phase has a --dry-run
7. ✅ **Reports must be JSON + Markdown** → Both formats required

---

## Troubleshooting

### "TurboVec sidecar not responding"

```bash
# Is it running?
docker ps | grep turbovec

# Is it healthy?
curl http://127.0.0.1:8888/health

# Check logs
docker logs <turbovec-container>
```

### "Packets not syncing to Qdrant"

```bash
# Check Qdrant point count
curl http://127.0.0.1:6333/collections/codebase_chunks_768/points/count

# Check sample point payload
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' | jq '.result.points[0].payload'
```

### "Too many packets, performance issue"

Reduce scope in `audit-whole-codebase-index-scope.mjs`:
- Increase EXCLUDE_PATTERNS
- Reduce MAX_EMBEDDING_CHARS in `export-turbovec-corpus.mjs`
- Use `--limit=100` flag on upsert scripts

---

## Next After Phase D

1. **Phase 14/15 Summarization** — Generate summaries for all packets
2. **Phase 14/15 Embedding** — Embed summaries via Ollama
3. **SOM/Autoencoder Training** — Cluster packets into communities
4. **Karpathy Blend Computation** — Authority ranking via Redis
5. **Agentic Workflow** — Full retrieval + synthesis loop

---

## Files Created This Session

1. ✅ `drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql`
2. ✅ `scripts/atlas/audit-whole-codebase-index-scope.mjs`
3. ✅ `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`
4. ✅ `scripts/atlas/export-turbovec-corpus.mjs`
5. ✅ `scripts/atlas/turbovec-sidecar-smoke.mjs`
6. ✅ `scripts/atlas/sync-qdrant-from-whole-codebase-packets.mjs`
7. ✅ `scripts/atlas/audit-retrieval-spine-end-to-end.mjs`
8. ✅ `package.json` updated with 8 new npm aliases
9. ✅ `docs/CANONICAL-ARCHITECTURE-CONTRACT.md` (locked down architecture)

---

## Quick Start (Copy & Paste)

```bash
cd c:\Users\james\Videos\deeds-web-app\sveltekit-frontend

# 1. Scope
npm run atlas:scope:whole

# 2. Raw SQL (one-time)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -f ../drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql

# 3. Packets (dry-run)
npm run atlas:packets:whole:dry

# 4. Packets (apply)
npm run atlas:packets:whole:apply

# 5. TurboVec export
npm run atlas:turbovec:export

# 6. TurboVec smoke
npm run atlas:turbovec:smoke

# 7. Qdrant sync (dry-run)
npm run atlas:qdrant:whole-sync:dry

# 8. Qdrant sync (apply)
npm run atlas:qdrant:whole-sync:apply

# 9. End-to-end audit
npm run atlas:retrieval:e2e
```

---

**Status**: Phase D ready for execution. All hard rules locked. Drizzle-independent. TurboVec-first. Whole-codebase scope. Canonical architecture contract signed.
