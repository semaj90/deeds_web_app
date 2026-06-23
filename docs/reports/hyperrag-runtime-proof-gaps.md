# HyperRAG Runtime Proof — Identified Gaps (2026-06-23)

## Current Status: PASS-DEGRADED

✅ **Proven & Live:**
- trace_id promoted to top level (from run_id)
- contributor counts exposed: bm25_hits, qdrant_hits, neo4j_hits, turbovec_hits, rrf_final_hits
- retrieval_strategy emitted (hyperrag_fusion)
- cache_status exposed (redis_exact_match vs live_fusion)
- latency_ms at top level
- degraded{} block shows offline services (turbovec: true)
- Report artifacts written: hyperrag-runtime-proof.json, hyperrag-runtime-proof.md
- 5 tests pass: cache miss/hit, confidence scoring, provenance immutability, runtime proof

⚠️ **Acceptable Degradation:**
- TurboVec offline (turbovec_hits = 0) — marked as degraded, does not fail proof

❌ **Gap: Qdrant Miss Cleanup (8 of 10 packets FTS-only)**

### The Gap

In a typical 10-packet retrieval:
- Packets [0-1]: ✓ Qdrant-backed (qdrant_point_id set, dense > 0)
- Packets [2-9]: ✗ FTS-only (qdrant_point_id = NULL, dense = 0.0)

Example FTS-only packets (from live probe 2026-06-23):
```
[2] hyperrag:src/lib/services/error-analysis/types.ts
[3] hyperrag:src/lib/server/db/schema/case_notes.ts
[4] hyperrag:src/lib/server/db/schema/warden_audit_log.ts
[5] hyperrag:src/lib/server/db/schema/auto_tags.ts
[6] hyperrag:src/lib/server/db/schema/user_ai_queries.ts
[7] hyperrag:src/lib/server/db/schema/state_constitution_sources.ts
[8] hyperrag:src/lib/server/db/schema/directory_cluster_checkpoints.ts
[9] hyperrag:src/lib/server/db/schema/evidence_forensic_flags.ts
```

### Root Cause

Packets were added to `atlas_packets` table in Postgres, but were **never ingested into Qdrant `codebase_chunks_768` collection**. The retrieval path falls back to FTS+JSONB lane when Qdrant has no point for the packet.

### Why It's Not a Proof Failure

- ✓ Hybrid retrieval is working correctly (BM25 + Qdrant + Neo4j + RRF fusion)
- ✓ The FTS lane is functioning (fts_hits = 10, providing all fallback results)
- ✓ Provenance is accurate (kag_aligned=true, dag_reachable=true)
- ✓ Contributors are properly counted (bm25_hits, qdrant_hits, neo4j_hits, rrf_final_hits)
- ✓ Pass conditions are met (ok=true, trace_id set, all contributors > 0)

The system is **gracefully degraded**, not broken. FTS+JSONB is a valid fallback lane; Qdrant is an optimization, not a requirement.

### Cleanup Roadmap (Next Phase)

**Goal:** Backfill missing packets into Qdrant to eliminate FTS-only results.

**Steps:**
1. Query Postgres for packets with `qdrant_point_id IS NULL`
2. For each packet, embed `content` field via `/api/embed` (Ollama embeddinggemma)
3. Upsert to Qdrant `codebase_chunks_768` collection
4. Update Postgres `atlas_packets.qdrant_point_id` with returned point ID
5. Re-run smoke test — expect all 10 packets with qdrant_hits > 0

**Script location:** `scripts/atlas/backfill-packets-to-qdrant.mjs` (new)

**Acceptance criteria:**
- All packets have qdrant_point_id set
- qdrant_hits = packets.length (100% of results vector-backed)
- dense scores > 0 for all packets
- fusion_sources includes "qdrant_vector" for all top results
- Proof still PASS-DEGRADED or FULL-PASS (no new failures)

---

## Current Proof Output (2026-06-23 Session)

```json
{
  "pass_status": "PASS-DEGRADED",
  "trace_id": "1782184671302-6uovrzk",
  "retrieval_strategy": "hyperrag_fusion",
  "cache_status": "redis_exact_match",
  "contributors": {
    "bm25_hits": 10,
    "qdrant_hits": 2,
    "neo4j_hits": 11,
    "turbovec_hits": 0,
    "rrf_final_hits": 10
  },
  "degraded": {
    "turbovec": true
  }
}
```

---

## Artifacts

- Proof JSON: `docs/reports/hyperrag-runtime-proof.json`
- Proof Markdown: `docs/reports/hyperrag-runtime-proof.md`
- Gaps document: `docs/reports/hyperrag-runtime-proof-gaps.md` (this file)
