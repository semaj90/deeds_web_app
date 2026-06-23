# P3g Classification Report (June 23, 2026)

**Status**: Classification complete. Real work identified. Ready for execution.

---

## Classification Results

**15,507 packets missing qdrant_point_id** were analyzed and bucketed:

| Bucket | Count | Action | Priority |
|--------|-------|--------|----------|
| **needs_embedding** | 13,545 | Embed via Ollama | 🔴 HIGH |
| **qdrant_payload_match_possible** | 154 | Join repair (skip for now) | 🟡 LOW |
| **non_vector_identity** | 1,385 | Skip (schema_stub/mcp_tool_stub) | ✅ OK |
| **generated_or_docs** | 120 | Skip (documentation) | ✅ OK |
| **missing_text** | 7 | Skip (no content) | ✅ OK |
| **ambiguous** | 296 | Manual review (deferred) | 🟡 LOW |
| **TOTAL** | 15,507 | - | - |

---

## Key Finding

**13,545 packets actually need embedding** (87% of missing set).

The previous estimate of "15,507 embeddings needed" was conservative. After classification:
- **Skip**: 1,512 packets (non-vector stubs, docs, empty)
- **Embed**: 13,545 packets (real work)
- **Deferred**: 450 packets (join repair + ambiguous, can wait)

---

## Real P3g Work

### Priority 1: Embedding (13,545 packets)
```bash
npm run atlas:backfill:qdrant:embeddings:apply \
  --workers=4 \
  --batch-size=100 \
  --checkpoint-interval=500
```

**Expected outcome**:
- Duration: 78 minutes (at 175 packets/min throughput)
- Result: 13,545 new Qdrant points + Postgres qdrant_point_id updates
- Coverage after: (2,488 + 13,545) = 16,033 / 17,995 = 89.2%

### Priority 2: Join Repair (154 packets)
**Deferred** — Qdrant scroll hangs on large collections. Mark these as manual review for now.

The 154 packets have:
- Qdrant payload exists (via prior ingestion)
- Postgres qdrant_point_id IS NULL
- packet_key matches payload

**Resolution**: After embedding completes, revisit with direct SQL query instead of Qdrant scroll.

### Priority 3: Ambiguous (296 packets)
**Deferred** — Manual classification required. Extract sample and review:
```sql
SELECT packet_id, packet_key, feature_label, summary
FROM atlas_packets
WHERE qdrant_point_id IS NULL
  AND packet_key NOT IN (
    SELECT DISTINCT packet_key FROM atlas_packets WHERE qdrant_point_id IS NOT NULL
  )
ORDER BY RANDOM()
LIMIT 10;
```

---

## ACP Health (All Green)

| Service | Status | Details |
|---------|--------|---------|
| Postgres | ✅ | Writable, connection OK |
| Qdrant | ✅ | Collection exists, dim=768 |
| Ollama | ✅ | embeddinggemma:latest available |
| Embedding Model | ✅ | Ready for inference |
| Recommended Batch Size | ✅ | 100 (optimal for RTX 3060 Ti) |

---

## What NOT to Do

❌ Do NOT embed all 15,507 packets  
❌ Do NOT assume all missing = need embedding  
❌ Do NOT skip classification (wastes GPU cycles on non-vectors)  
❌ Do NOT force Qdrant scroll (hangs on large datasets)  

---

## What TO Do

✅ Run embedding backfill: `npm run atlas:backfill:qdrant:embeddings:apply`  
✅ Monitor progress (78 min estimated)  
✅ Defer join repair to post-embedding verification  
✅ Keep 154 "payload match possible" as known debt  

---

## Files Generated

- `docs/reports/qdrant-p3g-missing-classification.json` — Structured results
- `docs/reports/qdrant-p3g-missing-classification.md` — Human-readable report
- `docs/P3G-CLASSIFICATION-REPORT.md` — This file

---

## Next Steps (Session 71)

1. **Start embedding**: `npm run atlas:backfill:qdrant:embeddings:apply`
2. **Monitor**: Watch for checkpoint output every 500 packets
3. **After completion**: Verify P3 readiness gates pass
4. **Parallel work**: P4–P5 can proceed independently

---

**Bottom line**: 13,545 real embedding tasks identified. 1,512 can be safely skipped. Ready to execute.

**ETA**: 78 minutes for embedding backfill + 10 min verification = 90 minutes total.
