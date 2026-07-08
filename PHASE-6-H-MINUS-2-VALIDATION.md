# Phase 6 H-2 Validation Checkpoint

**Session**: 123 → 124 (NOW)  
**Duration**: 30 minutes  
**Purpose**: Verify all infrastructure is ready for canary launch at H+0

---

## Pre-Flight Checks (Run in order, stop on first FAIL)

### ✓ Check 1: ACE Contract End-to-End (2 min)

**Verify**: ACE envelope builder is wired into all retrieval lanes

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Check 1a: ACE builder exists and is exported
grep -l "export.*buildCanonicalAcePacketEnvelope" src/lib/server/ace/*.ts
# Expected: src/lib/server/ace/canonical-packet-envelope.ts

# Check 1b: ACE materializer uses builder
grep "buildCanonicalAcePacketEnvelope" src/lib/server/ace/ace-materializer.ts
# Expected: Found 1+ hits

# Check 1c: HyperRAG pipeline uses ACE
grep "buildCanonicalAcePacketEnvelope" src/lib/server/hyperrag/hyperrag-packet-pipeline.ts
# Expected: Found 1+ hits

# Check 1d: RPC boundary validates envelopes
grep "CanonicalAcePacketEnvelope" src/lib/server/retrieval/hyperrag-packet-rpc.ts
# Expected: Found 2+ hits (import + type usage)

# Check 1e: Dispatcher receives envelopes
grep "canonical_envelope" src/lib/server/dispatch/dispatcher-integration.ts
# Expected: Found 3+ hits (buildDispatcherState, parity checks, etc.)
```

**Expected Result**: ✅ All 5 checks find references  
**If FAIL**: Dispatcher is not wired to receive ACE envelopes → **STOP, fix before proceeding**

---

### ✓ Check 2: Infrastructure Smoke Tests (5 min)

**Verify**: All backend services are running and healthy

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Run packet contract smoke test
npm run atlas:smoke:packet-contract 2>&1 | tee /tmp/packet-contract.log

# Expected output:
#   - ok: true
#   - structuralStatus: FAIL (expected: nes_chrom_packets missing)
#   - enrichmentStatus: WARN (expected: topology gaps)
#   - overallStatus: FAIL
#   - But atlas_packets table: exists, 58365 rows, 100% coverage on required fields
```

**Expected Result**: ✅ atlas_packets PASS (100% coverage on packet_key, source_ref, feature_id, feature_label)  
**If FAIL**: Packet identity incomplete → **STOP, run backfill before proceeding**

```bash
# Run completeness smoke test
npm run atlas:smoke:completeness 2>&1 | tee /tmp/completeness.log

# Expected output:
#   - Packet Identity: ✅ 100.0% (58365/58365)
#   - Source Lineage: ✅ 100.0% (58365/58365)
#   - Semantic Features: ✅ 100.0% (58365/58365)
#   - Canonical Labels: ✅ 100.0% (58365/58365)
#   - ...
#   - Louvain Community: ✗ 21.6% (12611/58365) [URGENT but OK for Phase 6]
#   - Critical status: PASS
```

**Expected Result**: ✅ 8/9 dimensions GREEN, 1 URGENT gap (Louvain 21.6%)  
**If FAIL**: Critical dimensions incomplete → **STOP, fix before proceeding**

---

### ✓ Check 3: Dispatcher Logic Dry-Run (3 min)

**Verify**: Dispatcher can compute routing decisions without live traffic

```bash
# Test dispatcher decision tree
npm run atlas:dispatcher:test:dry 2>&1 | tee /tmp/dispatcher-test.log

# Expected output should show:
#   - 5/5 checks pass
#   - identity_lane routing works (canonical → synthesis, quarantine → filter)
#   - parity_status calculation OK
#   - qdrant_synced flag computed
#   - neo4j_synced flag computed
```

**Expected Result**: ✅ All 5 dispatcher checks PASS  
**If FAIL**: Dispatcher logic broken → **STOP, debug before proceeding**

---

### ✓ Check 4: Redis/Valkey Connection (2 min)

**Verify**: Cache layer is accessible and warm

```bash
# Test Redis/Valkey connectivity
docker exec legal-ai-redis redis-cli PING
# Expected: PONG

# Check baseline cache key count
docker exec legal-ai-redis redis-cli DBSIZE > /tmp/redis-baseline.txt
cat /tmp/redis-baseline.txt
# Expected: db0:125+keys (partial warmup)
# Record this number for H+1 comparison

# Verify password works
docker exec legal-ai-redis redis-cli -a redis PING
# Expected: PONG (should work without -a too, meaning no auth required or default)
```

**Expected Result**: ✅ PONG, 125+ keys, password `redis` confirmed  
**If FAIL**: Cache unavailable → **STOP, restart Redis container before proceeding**

---

### ✓ Check 5: Qdrant Vector Index (2 min)

**Verify**: Vector search index is operational

```bash
# Check Qdrant collections
curl -s http://127.0.0.1:6333/collections | jq '.result | length'
# Expected: > 50 collections

# Verify codebase_chunks_768 collection
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'
# Expected: 40568 points (matches Postgres chunks)

# Test simple vector search (dummy query)
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/search \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"vector":[0.1,0.2,0.3],"limit":1}' \
  2>&1 | jq '.status'
# Expected: ok
```

**Expected Result**: ✅ 50+ collections, 40568 points in codebase_chunks_768, search OK  
**If FAIL**: Vector index down → **STOP, restart Qdrant container before proceeding**

---

### ✓ Check 6: Langfuse Trace Ingestion (3 min)

**Verify**: Observability pipeline is receiving events

```bash
# Check Langfuse API health
curl -s http://localhost:3030/api/health | jq '.status'
# Expected: ok

# Check if Langfuse is ingesting traces
curl -s http://localhost:3030/api/usage/week | jq '.traces_ingested_last_hour // 0'
# Expected: 0 or small number (will grow during Phase 6)

# Verify Langfuse web UI is up
curl -s http://localhost:3030 | head -20
# Expected: HTML response (web UI loads)
```

**Expected Result**: ✅ API health OK, web UI loads, ready for trace ingestion  
**If FAIL**: Langfuse down → **STOP, restart Langfuse container before proceeding**

---

### ✓ Check 7: Postgres Canonical Truth (2 min)

**Verify**: Database contains immutable packet identity

```bash
# Verify packet counts and coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT 
    COUNT(*) as total,
    COUNT(packet_key) as packet_key_count,
    COUNT(source_ref) as source_ref_count,
    COUNT(feature_id) as feature_id_count,
    COUNT(feature_label) as feature_label_count
  FROM atlas_packets
  LIMIT 1;"

# Expected output (all columns should equal total):
# total | packet_key_count | source_ref_count | feature_id_count | feature_label_count
# ------+------------------+------------------+------------------+--------------------
# 58365 |            58365 |            58365 |            58365 |              58365
```

**Expected Result**: ✅ All 4 identity fields at 100% (58365/58365)  
**If FAIL**: Packet identity incomplete → **STOP, run backfill before proceeding**

---

## Summary Checkpoint

**If all 7 checks PASS**:
```
✅ ACE contract wired end-to-end
✅ Packet identity 100% complete (58,365)
✅ Dispatcher logic ready
✅ Cache layer warm (125+ keys)
✅ Vector index operational (40,568 points)
✅ Observability pipeline ready
✅ Postgres canonical truth locked
```

**Next Step**: Proceed to H+0 Phase 6 Canary Start (see PHASE-6-TACTICAL-CHECKLIST.md)

---

## Abort Path

If ANY check FAILS:

1. **Note the failing check number** (1-7)
2. **Consult the failure reason** (specific error message)
3. **Look up the service** (ACE, Postgres, Redis, Qdrant, Langfuse, or Dispatcher)
4. **Restart the service** or run the corresponding fix script
5. **Re-run the failing check only** (do not proceed until it passes)
6. **Document** the failure and fix in `reports/phase6-pre-flight-issues.md`

**Do NOT proceed to Phase 6 canary if any check fails.**

---

**Run Time**: ~30 minutes  
**Expected Result**: All 7 checks ✅ PASS  
**Status**: Ready for H+0 Phase 6 Canary Launch

---

**Ready?** → Run checks now, report results