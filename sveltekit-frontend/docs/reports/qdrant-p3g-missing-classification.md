# P3g Missing Packet Classification

**Date**: 2026-06-23T16:03:55.519Z

## Health Status

| Service | Status | Details |
|---------|--------|---------|
| Postgres | ✅ | OK |
| Qdrant | ✅ | OK (dim: 768) |
| Ollama | ✅ | OK |
| Embedding Model | ✅ | embeddinggemma found |
| Valkey | ℹ️ | Optional |
| GPU | ℹ️ | Optional |
| Recommended Batch Size | - | 100 |

## Classification Breakdown

| Category | Count | Action |
|----------|-------|--------|
| **needs_embedding** | 13545 | **EMBED** — Valid packets, text present, not yet in Qdrant |
| **qdrant_payload_match_possible** | 154 | **JOIN REPAIR** — Qdrant point exists, Postgres row missing qdrant_point_id |
| **join_repair_possible** | 0 | **JOIN REPAIR** — Higher-hop ledger has qdrant_point_id |
| **non_vector_identity** | 1385 | **SKIP** — schema_stub / mcp_tool_stub (non-vector) |
| **generated_or_docs** | 120 | **SKIP** — Auto-generated / documentation packets |
| **missing_text** | 7 | **SKIP** — No content to embed |
| **ambiguous** | 296 | **REVIEW** — Unclear classification |
| **TOTAL** | 15507 | - |

## Recommendation

1. **Embedding Work**: 13545 packets
   - Use: `npm run atlas:backfill:qdrant:embeddings:apply --batch-size=100`
   - Expected time: 78 minutes

2. **Join Repair Work**: 154 packets
   - Qdrant already has the vectors; just need Postgres sync
   - Use: `npm run atlas:repair:qdrant-postgres-match`

3. **Skip (No Action)**: 1512 packets
   - These are structural stubs, documentation, or empty (expected)

## Next Steps

```bash
# If health status is OK:
npm run atlas:backfill:qdrant:embeddings:apply

# If payload match issues found:
npm run atlas:repair:qdrant-postgres-match --dry-run
npm run atlas:repair:qdrant-postgres-match --apply

# Verify after completion:
npm run atlas:verify:p3-readiness
```
