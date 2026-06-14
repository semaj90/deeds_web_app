# Multihop Enrichment — Next Steps & Completion Plan

**Status**: Phase 1 (Canonical Spine) ✅ COMPLETE  
**In Progress**: Phase 2 (Qdrant Payload Sync) + Phase 3 (Karpathy GPU Scores)  
**Target**: Full enrichment with all optional sources by June 14, 2026

---

## Phase 1: Canonical Packet Spine (COMPLETE ✅)

**Started**: June 14, 2026  
**Status**: ✅ COMPLETE

✅ Generated canonical multihop map from Postgres atlas_packets  
✅ All 17,485 packets have: packetKey, sourceRef, featureId, communityId  
✅ Coverage gates PASS (100% on critical fields)  
✅ Outputs written to `docs/graph/multihop-codebase-map.enriched.*`  
✅ Legacy May-13 file preserved

**Command**:
```bash
npm run atlas:multihop:enriched:generate
```

**Verification**:
```bash
npm run atlas:multihop:enriched:verify
# Output: true (ready for higher-hop)
```

---

## Phase 2: Qdrant Payload Enrichment (IN PROGRESS ⏳)

**Target**: June 14, 2026  
**Duration**: ~2-5 minutes (6,370 unique refs × Qdrant concurrency=8)

**What it does**:
- Reads all 17,485 packets from Postgres atlas_packets
- Groups by canonical source_ref (6,370 unique refs)
- Looks up each ref in Qdrant codebase_chunks_768
- Enqueues UPSERT payloads: `feature_id`, `community_id`, `tags`, `bm25_text`
- Writes updated points back to Qdrant

**Command**:
```bash
# Dry-run (preview changes)
node scripts/atlas/upsert-qdrant-packet-payload.mjs --dry-run

# Apply (commit to Qdrant)
node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply
```

**Expected outcome**:
- 6,370 Qdrant points updated with feature_id + community_id + tags
- Remaining Qdrant points (no Postgres match) left untouched
- Ready for Phase 3 Karpathy enrichment

**Verification** (after completion):
```bash
# Check a sample point for enriched payload
curl -s 'http://localhost:6333/collections/codebase_chunks_768/points/scroll?limit=1' \
  | jq '.result.points[0].payload | {feature_id, community_id, tags}'

# Should show: { "feature_id": "...", "community_id": 12, "tags": [...] }
```

---

## Phase 3: Karpathy GPU Authority Blend (IN PROGRESS ⏳)

**Target**: June 14, 2026  
**Duration**: ~5-10 minutes (embedding query + GPU similarity + ranking)

**What it does**:
1. Embeds risk query (`"security_critical"` or canonical query) via Ollama
2. Fetches top-N packets from Neo4j PageRank cache or computes live
3. Computes GPU attention scores via `attentionScoreGPU()` (LibTorch N-API)
4. Blends: `0.4·PageRank + 0.3·attention + 0.3·authority`
5. Writes to Redis `gpu:karpathy:scores` (24h TTL)
6. Optionally writes `gpu:karpathy:encoded` (64-dim latent, if autoencoder available)

**Command**:
```bash
# Dry-run (preview scores, no Redis writes)
node scripts/atlas/karpathy-gpu-enrich.mjs --dry-run

# Full run (computes and caches scores)
node scripts/atlas/karpathy-gpu-enrich.mjs

# Incremental (only recompute changed packets)
node scripts/atlas/karpathy-gpu-enrich.mjs --dirty

# Top-200 (compute only top-200 by PageRank)
node scripts/atlas/karpathy-gpu-enrich.mjs --limit 200
```

**Expected outcome**:
- 17,485 Karpathy blend scores cached in Redis `gpu:karpathy:scores`
- Key format: `{packet_key}` → value: `{ "pr": X, "attn": Y, "authority": Z, "blend": W }`
- 0 encoded latents (awaiting 768→64 autoencoder training)
- Ready for Phase 4 re-generation

**Verification** (after completion):
```bash
# Check score count
docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores
# Expected: 17485 (or close, depending on which packets were scoreable)

# Sample a score
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:scores '$lib/server/db/client:...' \
  | jq '.'
# Expected: { "pr": 7.06, "attn": 0.999, "authority": 0.555, "blend": 3.291 }
```

---

## Phase 4: Re-Generate Enriched Map with All Sources (READY ✅)

**Target**: June 14, 2026 (after Phase 2 + 3 complete)  
**Duration**: ~1-2 seconds (fast read from all sources)

**What it does**:
1. Reads 17,485 canonical packets from Postgres (same as Phase 1)
2. **NEW**: Matches Qdrant points by packet_key → (enriched payloads)
3. **NEW**: Looks up Karpathy scores by packet_key → (blend scores)
4. **NEW**: Looks up encoded latents by packet_key → (64-dim vectors, if available)
5. Hydrates full canonical schema with all enrichment fields
6. Writes same 3 output files (overwriting Phase 1 outputs with full enrichment)

**Command**:
```bash
npm run atlas:multihop:enriched:generate
```

**Expected outcome**:
- 17,485 nodes with complete schema:
  - ✅ packetKey (100% from Postgres)
  - ✅ sourceRef (100% from Postgres)
  - ✅ featureId (100% from Postgres)
  - ✅ qdrantPointId (6,370+ from Qdrant, if Phase 2 completed)
  - ✅ qdrantTags (6,370+ from Qdrant payloads)
  - ✅ karpathyBlend (17,485 from Redis, if Phase 3 completed)
  - ✅ encodedLatent (0 unless autoencoder trained)
  - ✅ somCell (from Postgres SOM columns)
  - ✅ redisKey, ginMetadata (always present)

**Verification**:
```bash
# Check updated report stats
cat docs/graph/multihop-codebase-map.enriched.report.json | jq '.gates'

# Expected (after Phase 2+3):
# {
#   "packetKeyCoverage": "100.0%",
#   "sourceRefCoverage": "100.0%",
#   "featureIdCoverage": "100.0%",
#   "qdrantMatchRate": "~37.0%",        ← up from 0%
#   "karpathyEnrichRate": "~100.0%",    ← up from 0%
#   "readyForHigherHop": true
# }
```

---

## Phase 5: Autoencoder Training (DEFERRED)

**Target**: Post-Phase-4  
**Status**: ⏳ DEFERRED (not blocking higher-hop enrichment)

**What it does**:
1. Trains 768→64 autoencoder on existing 768-dim embeddings
2. Encodes all packet embeddings to 64-dim latent
3. Caches in Redis `gpu:karpathy:encoded`
4. Re-generates enriched map to include `encodedLatent` fields

**Commands** (when ready):
```bash
npm run graphify:autoencoder:train
# Then:
npm run atlas:multihop:enriched:generate  # Re-generate with latents
```

**Expected outcome**:
- All 17,485 nodes with 64-dim `encodedLatent` vectors
- Enables efficient memory-path routing in SOM
- Reduces cache footprint by 8× (768 → 64 floats)

---

## Monitoring & Troubleshooting

### Phase 2 (Qdrant Payload) Stuck?

**Symptom**: Script still running after 10 minutes  
**Diagnosis**:
```bash
# Check Qdrant is responsive
curl -s http://localhost:6333/health | jq '.status'

# Check scroll cursor (script uses pagination)
curl -s 'http://localhost:6333/collections/codebase_chunks_768?details=true' \
  | jq '.result.points_count'

# Check for timeouts in script logs
```

**Fix**:
- Reduce concurrency: edit script `QDRANT_CONCURRENCY = 4` (was 8)
- Increase timeout: edit script `timeout: 30000` (was 20000ms)
- Run script again: `node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply`

---

### Phase 3 (Karpathy GPU) Stuck?

**Symptom**: Script running, Ollama embedding not progressing  
**Diagnosis**:
```bash
# Check Ollama is up
curl -s http://localhost:11434/api/tags | jq '.models | length'

# Check GPU memory (RTX 3060 Ti ~8GB)
nvidia-smi  # or: docker exec legal-ai-postgres nvidia-smi

# Check Redis is accepting writes
docker exec legal-ai-redis redis-cli PING
```

**Fix**:
- Restart Ollama: `docker restart ollama` (if running in container)
- Reduce batch size: edit script `BATCH_SIZE = 32` (was 64)
- Run script again: `node scripts/atlas/karpathy-gpu-enrich.mjs`

---

## Timeline & Checklist

**Phase 1** (Canonical spine):
- ✅ Generate from Postgres
- ✅ Verify 100% coverage
- ✅ Preserve legacy file
- ✅ Document schema

**Phase 2** (Qdrant sync):
- ⏳ Run upsert-qdrant-packet-payload.mjs --apply
- ⏳ Verify Qdrant points updated (~6.3K)
- ⏳ Ready for Phase 4 re-gen

**Phase 3** (Karpathy scores):
- ⏳ Run karpathy-gpu-enrich.mjs
- ⏳ Verify Redis scores (~17.5K entries)
- ⏳ Ready for Phase 4 re-gen

**Phase 4** (Full enrichment):
- ⏳ Run atlas:multihop:enriched:generate again
- ⏳ Verify all optional sources matched
- ⏳ Check gates: qdrantMatchRate > 30%, karpathyEnrichRate > 95%

**Phase 5** (Autoencoder, optional):
- ⏳ Train 768→64 encoder
- ⏳ Encode all packets to Redis
- ⏳ Re-generate with latents

---

## Commands Summary (Copy-Paste)

```bash
# Phase 2: Sync Qdrant payloads
node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply

# Phase 3: Compute Karpathy scores
node scripts/atlas/karpathy-gpu-enrich.mjs

# Phase 4: Re-generate enriched map
npm run atlas:multihop:enriched:generate

# Phase 4: Verify completion
npm run atlas:multihop:enriched:verify
cat sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.report.json | jq '.'
```

---

**Status**: Waiting for Phase 2 & 3 to complete. Check back in 5-10 minutes.
