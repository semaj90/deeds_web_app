# Phase 106 Stage 4: Quick Start Card

**Print this. Run this. Complete Phase 106.**

---

## Pre-Flight (2 minutes)

```bash
# Verify all systems GO
echo "✅ Ollama?" && curl -s http://127.0.0.1:11434/api/tags | jq '.models | length'
echo "✅ EmbeddingGemma 768-dim?" && curl -s http://127.0.0.1:11434/api/embeddings -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'
echo "✅ Postgres?" && docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets" 2>/dev/null | tail -1
echo "✅ Qdrant?" && curl -s http://127.0.0.1:6333/collections | jq '.result | length'
```

**All show ✅? PROCEED.**

---

## Stage 4: Dry-Run (5 minutes)

```bash
cd sveltekit-frontend
npm run atlas:backfill:embedding:dry --limit=100
```

**Expected output:**
```
✓ 100 packets in 32 batches
✓ All 768-dim
✓ No errors
✓ Lineage tracked (source=ollama or onnx)
```

**Pass?** → Proceed to full execution.  
**Fail?** → Check error log, escalate to operator.

---

## Stage 4: Full Execution (~1 hour)

```bash
npm run atlas:backfill:embedding:apply --batch-size=32 --concurrency=4
```

**Watch for:**
- ✅ 40,000+ embeddings
- ✅ >99% coverage (40K+ of 40.7K)
- ✅ All 768-dim
- ✅ Zero validation failures

**Pass?** → Stage 4 complete, proceed to Stages 5-13.  
**Fail?** → See ROLLBACK section below.

---

## Validation Gates (All Three Must Pass)

| Gate | Check | Threshold |
|------|-------|-----------|
| **Dimension** | Exactly 768 | 100% |
| **L2 Norm** | 1.0 ± 0.01 | 100% |
| **Idempotency** | SHA-256 reproducible | 100% |

**Any gate fails?** → Permanent error, Mastra review task. Do NOT write to Postgres.

---

## Monitoring (During Execution)

```bash
# Check progress (run in separate terminal)
watch -n 5 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  \"SELECT COUNT(*) as total, \
          COUNT(CASE WHEN embedding_status='success' THEN 1 END) as embedded \
   FROM atlas_packets;\""
```

---

## Error Handling

### Transient Errors (Retry Automatically)
- Network timeout → automatic retry (3x)
- Rate limit → automatic backoff
- Sidecar unavailable → fallback to Tier 5 ONNX

### Permanent Errors (Manual Review Required)
- Dimension mismatch (not 768) → STOP, create Mastra task
- L2 norm invalid → STOP, create Mastra task
- Content hash mismatch → STOP, create Mastra task

**Action**: Check `atlas_packets.embedding_status = 'failed'` for failed packets.

---

## Rollback (If Catastrophic Failure)

```bash
# 1. Stop execution
^C  # Press Ctrl+C

# 2. Restore Postgres
docker cp backup.dump legal-ai-postgres:/tmp/restore.dump
docker exec legal-ai-postgres pg_restore -d legal_ai_db -U legal_admin -Fc /tmp/restore.dump

# 3. Rebuild Qdrant
npm run atlas:qdrant:384:restore:apply

# 4. Restart Phase 106
npm run atlas:phase106:execute
```

**Recovery time**: 30-60 minutes.

---

## After Stage 4: Stages 5-13

Once Stage 4 passes:

```bash
# Execute remaining stages in parallel
npm run atlas:phase106:execute --stages=5-13

# This runs:
#   Lane A: GPU acceleration (AE 768→64, SOM)
#   Lane B: Neo4j topology (PageRank, clustering)
#   Lane C: Search ranking (6-signal blend)
#   Lane D: Compilation (HMM semantic compiler)

# Estimated time: 8-10 hours
```

---

## Success Checklist

After full completion:

- [ ] Stage 4: 40K+ embeddings, 99%+ coverage
- [ ] Stages 5-13: All lanes complete
- [ ] Qdrant synced from Postgres
- [ ] Redis cache warmed
- [ ] Neo4j topology built
- [ ] Search ranking operational
- [ ] Compilation complete
- [ ] Zero data loss
- [ ] Zero corruption

**All checked?** → Phase 106 COMPLETE. Ready for production.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Total packets | 40,754 |
| Eligible for embedding | 40,754 |
| Target coverage | >99% (40K+) |
| Embedding dimension | 768 (canonical) |
| L2 norm tolerance | 1.0 ± 0.01 |
| Stage 4 duration | ~1 hour |
| Stages 5-13 duration | ~8-10 hours |
| **Total Phase 106** | **~12-15 hours** |
| Confidence level | 95%+ |

---

## Reference Docs

| Doc | Purpose |
|-----|---------|
| PHASE-106-FINAL-READINESS.md | Complete status before execution |
| PHASE-106-CANONICAL-INGESTION-ARCHITECTURE.md | Architecture deep dive |
| PHASE-106-EXECUTION-DECISION.md | Why 768-dim, not 384-dim |
| EMBEDDING-DIMENSION-CONSOLIDATION.md | Dimension audit (technical) |

---

**GO/NO-GO**: ✅ **GO** — All systems operational, proceed to Stage 4.

**Date**: July 20, 2026  
**Confidence**: 95%+  
**Blockers**: NONE  

