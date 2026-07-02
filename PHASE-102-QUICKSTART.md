# Phase 102 + Potentials — Quick Start Guide

**TL;DR**: Execute 12 npm commands in sequence. ~2 hours total. No skips.

---

## Pre-Flight Checklist

```bash
# 1. Verify Neo4j is running
curl -s http://127.0.0.1:7474/ | grep -q "Neo4j" && echo "✅ Neo4j OK" || echo "❌ Neo4j DOWN"

# 2. Verify Postgres is running
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;" && echo "✅ Postgres OK" || echo "❌ Postgres DOWN"

# 3. Verify Qdrant is running
curl -s http://127.0.0.1:6333/ | jq '.version' && echo "✅ Qdrant OK" || echo "❌ Qdrant DOWN"

# 4. Verify Ollama/Gemma4 is running
curl -s http://127.0.0.1:8090/health | jq '.status' && echo "✅ Gemma4 OK" || echo "❌ Gemma4 DOWN"

# 5. Verify Go Retrieval is running (optional but recommended)
curl -s http://127.0.0.1:8100/health | jq '.status' && echo "✅ Go Retrieval OK" || echo "⚠️  Go Retrieval DOWN (optional)"
```

If any critical service is DOWN, start it before proceeding.

---

## 12-Step Execution Pipeline

### Phase A: Identity Foundation (10-15 min)

```bash
# STEP 1: Code Features Edges
cd sveltekit-frontend
npm run atlas:code-features:edges:backfill --dry-run
# Review output, verify 10K+ edges
npm run atlas:code-features:edges:backfill --apply
echo "✅ Step 1: Identity foundation established"
```

---

### Phase B: Statistics Layer (10-20 min)

```bash
# STEP 2: Neo4j GDS Pipeline
npm run atlas:code-features:pagerank --dry-run
# Review output, verify PageRank scores
npm run atlas:code-features:pagerank --apply

npm run atlas:code-features:hits --apply

npm run atlas:code-features:louvain --apply

echo "✅ Step 2: Statistics computed"
```

---

### Phase C: Statistics Mirror (10-15 min)

```bash
# STEP 3: Feature Statistics Sync
npm run atlas:feature-statistics:sync --dry-run --batch=100
# Review output, verify 40K+ payloads
npm run atlas:feature-statistics:sync --apply --batch=100

# STEP 4: Qdrant Payload Tags
npm run atlas:qdrant:payload-tags:sync --dry-run --batch=100
# Review output, verify semantic_tags
npm run atlas:qdrant:payload-tags:sync --apply --batch=100

echo "✅ Steps 3-4: Qdrant enriched"
```

---

### Phase D: Ranking Layer (5-10 min)

```bash
# STEP 5: Go Retrieval Smoke Test
npm run go-retrieval:feature-search:smoke --query="authentication session"
# Review output, verify RRF scores, latency < 2s
# Expected: 6 signals (semantic, summary, lexical, noun, pagerank, topology)

echo "✅ Step 5: RRF blend validated"
```

---

### Phase E: Explanation Layer (15-20 min)

```bash
# STEP 6: Batch Summaries
npm run batch:summaries:test10 --query="authentication session"
# Review output, verify 10 summaries, 2-3 sentences each, < 150 words
# Expected: ~1-2s per summary

echo "✅ Step 6: Explanation layer validated"
```

---

### Phase F: Potentials Layer (15-20 min) — NEW

```bash
# STEP 7: Apply Potentials Schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -f ../sveltekit-frontend/drizzle/0102_feature_statistics_and_potentials.sql
# Verify tables created:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt packet_potentials packet_promotion_log fallback_routing_audit"

# STEP 8: Populate Potentials
npm run atlas:potentials:populate:dry --batch=100
# Review output, verify title_like aliases and potential_scores
npm run atlas:potentials:populate:apply --batch=100

# STEP 9: Fallback Routing Validation
npm run atlas:fallback:lexical:smoke
# Expected: Lexical fallback works (low semantic, high noun)

npm run atlas:fallback:deep-research:smoke
# Expected: Deep research gate fires (unknown query)

echo "✅ Steps 7-9: Potentials layer validated"
```

---

### Phase G: External Research (Optional, 20-30 min)

```bash
# STEP 10: External Research Pipeline (OPTIONAL)
# Only run if fallback routing audit reveals gaps

# npm run atlas:external-research:firecrawl:import --query="test query" --limit=5
# npm run atlas:external-research:langextract:parse --dry-run
# npm run atlas:external-research:validate:tricubic --dry-run

echo "⏭️  Step 10: External research (optional, skipped)"
```

---

### Phase H: Full Validation (5 min)

```bash
# STEP 11: End-to-End Validation
npm run atlas:unified:validate:full
# Review report, all layers should show ✅

echo "✅ Step 11: Full pipeline validated"
```

---

### Phase I: Production Readiness (2 min)

```bash
# STEP 12: Production Smoke Test
npm run atlas:unified:smoke --query="authentication session validation" --verbose
# Expected:
#   - All 5 layers working
#   - Latency: ~1,250ms
#   - Explanation: 2-3 sentences
#   - Status: ✅ PRODUCTION READY

echo "✅ Step 12: Production ready"
```

---

## Validation Gates (All Must Pass)

| Step | Gate | Expected | Command |
|------|------|----------|---------|
| 1 | Code features edges | 10K+ edges | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM code_features_edges;"` |
| 2 | Neo4j GDS | 58K+ stats | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM feature_statistics WHERE pagerank > 0;"` |
| 3 | Qdrant sync | Payloads enriched | `curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll -X POST -d '{"limit":1}' \| jq '.result[0].payload.pagerank'` |
| 4 | Tags | semantic_tags present | `curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll -X POST -d '{"limit":1}' \| jq '.result[0].payload.semantic_tags'` |
| 5 | RRF smoke | 6 signals, latency <2s | Check npm output for "PASS" |
| 6 | Summaries | 10 summaries, 2-3 sentences | Check npm output for "SUCCESS" |
| 7 | Schema | Tables exist | `\dt packet_potentials` in psql |
| 8 | Potentials | 40K+ rows | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM packet_potentials;"` |
| 9 | Fallback | Routes work | Check npm output for "PASS" |
| 11 | Full validate | All ✅ | Check npm output for "All layers operational" |
| 12 | Smoke | ✅ PRODUCTION READY | Check npm output for final status |

---

## If Any Step Fails

**DO NOT skip to the next step.** Diagnose and fix.

### Common Issues

**Step 1 fails**: Neo4j edges not created
```bash
# Check Neo4j logs
docker logs legal-ai-neo4j | tail -50
# Check if edges query succeeded
docker exec legal-ai-neo4j cypher-shell -u neo4j -p yourpassword "MATCH ()-[r:IMPORTS]->() RETURN COUNT(r);"
```

**Step 2 fails**: PageRank not computed
```bash
# Check Neo4j GDS projection
docker exec legal-ai-neo4j cypher-shell "CALL gds.graph.list();"
# Check PageRank algorithm
docker exec legal-ai-neo4j cypher-shell "CALL gds.pageRank.stream('codebase-graph') YIELD nodeId, score RETURN COUNT(*) LIMIT 1;"
```

**Step 3 fails**: Qdrant payloads not synced
```bash
# Check Qdrant collection
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'
# Check payload structure
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll -X POST -d '{"limit":1}' | jq '.result[0]'
```

**Step 5 fails**: RRF smoke test fails
```bash
# Check Go Retrieval health
npm run retrieval:go:health
# Check Postgres BM25
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM codebase_chunk_index WHERE content LIKE '%auth%';"
```

**Step 6 fails**: Summaries timeout
```bash
# Check Gemma4 health
npm run gemma4:rotorquant:props
# Check token count
npm run gemma4:rotorquant:health
```

---

## Time Tracking

Use this to monitor progress:

```bash
# At start
echo "Pipeline start: $(date)" > /tmp/phase102.log

# After each step
echo "Step N: $(date)" >> /tmp/phase102.log

# Final
echo "Pipeline end: $(date)" >> /tmp/phase102.log
cat /tmp/phase102.log
```

---

## Success Criteria (All Must Pass)

- [ ] Step 1: Code features edges created (10K+)
- [ ] Step 2: Feature statistics populated (58K+)
- [ ] Step 3: Qdrant payloads enriched (pagerank present)
- [ ] Step 4: Semantic tags added (kind, language, cluster, community)
- [ ] Step 5: RRF smoke test passes (6 signals, latency <2s)
- [ ] Step 6: Gemma4 summaries generated (10 summaries, bounded)
- [ ] Step 7: Potentials schema created
- [ ] Step 8: Potentials populated (40K+ rows)
- [ ] Step 9: Fallback routing validated
- [ ] Step 11: Full pipeline validation passes
- [ ] Step 12: Production smoke test shows ✅ READY

**If all checks pass**: 🎉 Phase 102 + Potentials is LIVE

---

## Next: Deploy to Production

Once all steps pass:

1. **Backup Postgres** (optional but recommended)
2. **Deploy to staging** (mirror pipeline to test cluster)
3. **Run production smoke test** (same as Step 12, different query)
4. **Monitor logs** (check for errors in first hour)
5. **Enable admin dashboard** (to visualize pipeline)

---

## Questions?

- Check `PHASE-102-POTENTIALS-UNIFIED-EXECUTION.md` for full details
- Check `PHASE-102-STACK-INVARIANTS.md` for architectural rules
- Check `ARCHITECTURAL-CORRECTION-PHASE-102.md` for why this shape is correct

---

**Status**: Ready to execute. Start with Step 1 when all services are UP.
