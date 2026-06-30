# Phase B → P3.1 Dependency Chain: No Duplication Risk

**Question**: If Phase B indexes summaries won't it prevent duplicates? Do batch scripts continue?

**Answer**: ✅ **NO DUPLICATION RISK.** Phase B and P3.1 write to different layers with idempotent guarantees.

---

## Data Layer Separation (Load-Bearing)

### Layer 1: Postgres `atlas_packets` (Identity)
```
Immutable packet identity, metadata only.
Always the source of truth.
Schema: packet_key, source_ref, summary, content, ...
Phase B reads from here, doesn't write.
```

### Layer 2: Postgres `analysis_pass_results` (Phase B Audit Log)
```
Append-only enrichment results per pass per packet.
Phase B WRITES HERE (idempotent ON CONFLICT).
Schema: packet_key, pass_key, pass_status, result_json, created_at, updated_at
Example: pass_1_summarization, pass_2_entities, pass_3_semantic
```

### Layer 3: Qdrant `codebase_chunks_768` (Vector Search Mirror)
```
Mirror of codebase_chunk_index chunks (NOT atlas_packets).
Contains 40,568 points (code chunks), NOT 58K packets.
Phase B doesn't write to this collection.
P3.1 PATCHES payloads to ADD sourceRefs field (idempotent PATCH).
Schema: vector (768-dim), payload {..., sourceRefs, summary, ...}
```

### Layer 4: Redis BitFrost (Hot Cache)
```
Phase B populates L1 embedding cache (P0) and L2 topK cache (P1).
TTLs: 7 days embedding, 24 hours topK.
Safe to rerun — older entries expire naturally.
```

---

## Phase B → P3.1 Workflow (No Conflicts)

### Phase B Execution (Days 1-3)

**Pass 1: Summarization**
```
atlas_packets.summary (already present)
  → Gemma4 summarization prompt
  → INSERT analysis_pass_results (pass_1_summarization, summary output)
  → Redis L1 embedding cache population (P0)
```

**Pass 2: Entity Extraction**
```
atlas_packets.summary
  → LLM entity extraction
  → INSERT analysis_pass_results (pass_2_entities, entities JSON)
```

**Pass 3: Semantic Enrichment**
```
atlas_packets.summary
  → Ollama embedding (with L1 cache from P0)
  → INSERT analysis_pass_results (pass_3_semantic, embedding_dim + cache_hit)
  → Redis L2 topK cache population (P1)
```

**After Phase B completes**:
```
✅ analysis_pass_results: 57K × 3 passes = 171K rows (all complete)
✅ Redis P0 cache: ~5K embedding keys warmed
✅ Redis P1 cache: ~5K topK keys warmed
✅ Qdrant: UNCHANGED (40,568 points, original payload schema)
```

---

### P3.1 Post-Synthesis Quality Review (Day 4+)

**P3.1 Backfill: sourceRefs Enrichment**
```
SELECT * FROM codebase_chunks_768 (scroll through all 40,568 points)
  → For each point, extract source_ref from atlas_packets
  → PATCH Qdrant payload: ADD sourceRefs field
  → Idempotent: if sourceRefs already exists, skip
```

**Why no duplication**:
- Qdrant PATCH (not INSERT) — modifies existing points in-place
- Idempotent check: `if 'sourceRefs' not in payload: add_it`
- Only 40,568 points (chunks), not 58K (packets)
- No new points created, just field enrichment

**After P3.1 completes**:
```
✅ Qdrant codebase_chunks_768: Still 40,568 points
   Payloads now enriched with: sourceRefs, summary, ...
✅ Postgres codebase_chunk_index: Mirror rows updated with sourceRefs
✅ Neo4j: Topology validated/refreshed
```

---

## Idempotency Guarantees (All Layers)

### Phase B Idempotency
```sql
INSERT INTO analysis_pass_results (
  packet_key, pass_key, pass_status, result_json, created_at
) VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (packet_key, pass_key) DO UPDATE SET
  result_json = EXCLUDED.result_json,
  pass_status = EXCLUDED.pass_status,
  updated_at = NOW();
```
**Effect**: Re-running Phase B on same packets skips already-complete ones, retries failures.
**No duplicates**: PRIMARY KEY (packet_key, pass_key) prevents insert duplication.

### P3.1 Idempotency
```python
# Pseudocode
for point in qdrant.scroll(collection):
  payload = point['payload']
  if 'sourceRefs' not in payload:  # Idempotent check
    payload['sourceRefs'] = fetch_source_ref(point['id'])
    qdrant.upsert(point['id'], payload=payload)  # PATCH, not INSERT
```
**Effect**: Re-running P3.1 skips already-enriched points.
**No duplicates**: UPSERT on point_id (not insert) prevents duplication.

---

## Batch Script Continuity (✅ YES, CONTINUE)

### Phase B Scripts (Days 1-3)
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000
```
**Outcome**: analysis_pass_results fully populated, P0+P1 cache warm

### P2.14 Script (Task Semantic Packets) — ✅ CONTINUE
```bash
# P2.14 reads from:
# - atlas_packets (summary field now ENRICHED by Phase B Pass 1)
# - analysis_pass_results (pass status available for filtering)
# - Qdrant (unchanged topology)
#
# SAFE TO RUN after Phase B Pass 1 completes
# Benefit: summaries are now available for Kanban promotion
```

### P3.1 Script (sourceRefs Backfill) — ✅ CONTINUE
```bash
# P3.1 reads from:
# - codebase_chunk_index (40.7K chunks, all have embeddings)
# - atlas_packets (to join source_ref)
#
# Writes to:
# - Qdrant codebase_chunks_768 (PATCH payloads, not insert)
#
# SAFE TO RUN after Phase B completes
# No conflicts: Phase B doesn't touch Qdrant, P3.1 doesn't touch analysis_pass_results
```

### P3.2 Script (Throughput Optimization) — ✅ CONTINUE
```bash
# P3.2 builds file-path-to-point-id index (one scroll)
# Then patches payloads in batches (not one-per-file)
#
# Depends on: P3.1 completion (sourceRefs in place)
# Safe to run: Idempotent PATCH operation
```

### P3.3 Script (Repo Coverage Metric) — ✅ CONTINUE
```bash
# P3.3 filters chunks by source_ref prefix "src/"
# Reports coverage separately from mixed sample
#
# Depends on: P3.1 sourceRefs backfill complete
# Safe to run: Read-only query against Qdrant + Postgres
```

### P4.1-P4.5 Scripts (UI & Admin) — ✅ CONTINUE
```bash
# All P4.* scripts read from:
# - Qdrant (payloads now enriched with sourceRefs + summary)
# - Neo4j (topology from P3.1 refresh)
# - Postgres analysis_pass_results (for audit trail)
#
# Write to: Redis cache, Postgres admin audit tables
# Safe to run: All prior phases complete, data layers aligned
```

---

## Summary: Phase Execution Order & Safety

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE B (Days 1-3)                                              │
│ Pass 1: Summary enrichment → analysis_pass_results              │
│ Pass 2: Entity extraction → analysis_pass_results              │
│ Pass 3: Semantic embedding → analysis_pass_results + P0+P1    │
│ Result: Postgres enriched, Redis warmed, Qdrant UNCHANGED     │
└─────────────────────────────────────────────────────────────────┘
         ↓ (no data conflicts, safe to continue)
┌─────────────────────────────────────────────────────────────────┐
│ P2.14 (Day 4+)                                                  │
│ Task semantic packets: promote Kanban → durable packets        │
│ Reads: atlas_packets (now with Phase B summaries)             │
│ Writes: Postgres packet bundles + Redis hot nudge            │
│ Result: Semantic task layer ready for agent pickup           │
└─────────────────────────────────────────────────────────────────┘
         ↓ (no data conflicts, safe to continue)
┌─────────────────────────────────────────────────────────────────┐
│ P3.1 (Day 5+)                                                   │
│ sourceRefs backfill: enrich Qdrant payloads                   │
│ Reads: codebase_chunk_index, atlas_packets                   │
│ Writes: Qdrant payloads (PATCH, idempotent)                 │
│ Result: Qdrant payloads enriched with sourceRefs            │
└─────────────────────────────────────────────────────────────────┘
         ↓ (no data conflicts, safe to continue)
┌─────────────────────────────────────────────────────────────────┐
│ P3.2-P3.3 (Day 6+)                                              │
│ Throughput + Coverage metrics                                  │
│ Reads: Qdrant (now enriched), Postgres (for validation)      │
│ Writes: Postgres audit tables                                 │
│ Result: Quality gate passes, phase 3 metrics stable          │
└─────────────────────────────────────────────────────────────────┘
         ↓ (no data conflicts, safe to continue)
┌─────────────────────────────────────────────────────────────────┐
│ P4.1-P4.5 (Day 7+)                                              │
│ Admin copilot + UI synthesis                                  │
│ Reads: Qdrant (enriched), Neo4j (refreshed), Postgres       │
│ Writes: Redis cache, Postgres admin audit                    │
│ Result: Operator-facing synthesis & trust tier control      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Answer to Your Question

**Q: If it indexes the summaries won't it prevent duplicates? Do batch scripts continue?**

**A**: 
1. **No duplication risk** — Phase B writes to `analysis_pass_results` (Postgres audit log), not to Qdrant. P3.1 writes to Qdrant payloads (PATCH, idempotent). Different layers, different operations.

2. **Yes, batch scripts continue** — Each downstream phase reads only what it needs, writes to its own layer. Phase B → P2.14 → P3.1 → P3.2-P3.3 → P4.* form a strict dependency DAG with no circular writes.

3. **Idempotency guaranteed** — All layers use ON CONFLICT / UPSERT with idempotent checks. Safe to re-run any phase if a later phase fails.

4. **Data layer separation is load-bearing** — Postgres (truth), Qdrant (search mirror), Redis (hot cache), Neo4j (topology mirror). No layer overwrites another; only additive enrichment.

**TL;DR**: Phase B and P3.1 are independent pipelines writing to different tables/collections. Run all batch scripts in sequence without modification. Idempotency guarantees ensure re-runs are safe.
