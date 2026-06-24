# Phase 1 Feature Extraction & Clustering TODO — Orchestration Ready

## Current State Summary

**Already Indexed & Ready:**
- ✅ 17,995 canonical packets (atlas_packets) — 97.2% summaries, 59.8% embeddings
- ✅ 8,823 tree nodes (atlas_tree_nodes) — hierarchical structure, 0% tagged
- ✅ 3,251 packets with 7-level summary hierarchy (atlas_summary_layers) — 518 with keywords
- ✅ 3,251 packets with topology/clustering (atlas_topology_index)
  - 85 distinct communities
  - 3,226 with PageRank (99.2%)
  - 0 with SOM coordinates (pending)
  - 0 with Karpathy authority scores (pending)
  - 0 with latent 64-dim autoencoder (pending)

**Gaps to Fill (6 Independent Lanes):**

| Lane | Task | Rows | Current | Target | Est. Time |
|------|------|------|---------|--------|-----------|
| **A** | Tree node feature extraction & tagging | 8,823 | 0% | 100% | 1-2h |
| **B** | Summary layer embeddings (7 levels) | 16,254 | 0% | 100% | 22.5min (4 workers) |
| **C** | SOM coordinates to topology index | 3,251 | 0% | 100% | 30s |
| **D** | Karpathy authority scores (GPU blend) | 3,251 | 0% | 100% | 15s (after B) |
| **E** | Latent 64-dim autoencoder vectors | 3,251 | 0% | 100% | 10s (after B) |
| **F** | Gemma4 keyword extraction (all levels) | 16,254 | 3% | 100% | 1.3h (4 workers) |

---

## Lane Execution Plan

### Lane A: Tree Node Feature Extraction & Tagging
**Tables:** `atlas_tree_nodes` → keywords[], tags[], domain, ontology (jsonb)

**What it does:**
- Extract keywords from node summaries via LangExtract (pattern matching)
- Classify domain/ontology per node
- Tag by feature type (class, function, interface, module, etc.)
- Enable fast keyword search across 8,823 nodes

**Scripts:**
```bash
npm run atlas:functions:index
npm run atlas:functions:backfill:apply
npm run atlas:ontology:classify:apply
```

**Expected output:** All 8,823 tree nodes tagged with domain, keywords, ontology

---

### Lane B: Summary Layer Embeddings (Critical Path)
**Tables:** `atlas_summary_layers` → embedding (vector 768)

**What it does:**
- Generate 768-dim embeddings via SvelteKit `/api/embed` for all 16,254 summaries
- 7 summary levels: chunk, community, feature, file, folder, system, gemma4_packet_summary
- Enables semantic search across summary hierarchy

**New script to create:** `scripts/atlas/orchestrate-summary-layer-embeddings.mjs`

**Pseudo-code:**
```javascript
for (const level of ['gemma4_packet_summary', 'chunk', 'community', 'feature', 'file', 'folder', 'system']) {
  const summaries = await db.query(
    `SELECT summary_id, summary_text FROM atlas_summary_layers WHERE summary_level = $1 AND embedding IS NULL`,
    [level]
  );
  for (const summary of summaries) {
    const embedding = await fetch('/api/embed', { text: summary.summary_text });
    await db.query(
      `UPDATE atlas_summary_layers SET embedding = $1::vector WHERE summary_id = $2`,
      [embedding, summary.summary_id]
    );
  }
}
```

**Performance:** 2-4 summaries/sec → 16,254 ÷ 3 = 1.5h single-threaded, 22.5 min with 4 workers

**Expected output:** All 16,254 summary rows with 768-dim embeddings

---

### Lane C: SOM Coordinate Backfill (Fast)
**Tables:** `atlas_topology_index` → som_source, z_som, y_graph, x_cosine

**What it does:**
- SOM model already trained (20×20 grid = 400 cells)
- Extract BMU (Best Matching Unit) coordinates for each of 3,251 packets
- Backfill into topology index for spatial/clustering queries
- Enable "find similar packets in same SOM cell" queries

**New script to create:** `scripts/atlas/backfill-som-coordinates.mjs`

**Pseudo-code:**
```javascript
const packets = await db.query(`
  SELECT packet_key, community_id, embedding FROM atlas_packets
`);
for (const packet of packets) {
  const somCluster = await computeSOMCluster(packet.embedding, somModel);
  await db.query(
    `UPDATE atlas_topology_index 
     SET z_som = $1, som_source = 'trained-model' 
     WHERE packet_key = $2`,
    [somCluster.z, packet.packet_key]
  );
}
```

**Performance:** ~30 seconds (lookup only, no ML)

**Expected output:** 3,251/3,251 topology rows with SOM coordinates

---

### Lane D: Karpathy Authority Blend (GPU, Depends on B)
**Tables:** `atlas_topology_index` → karpathy_score

**What it does:**
- Compute Karpathy blend = 0.4·PageRank + 0.3·semantic_attention + 0.3·authority
- PageRank already exists (3,226/3,251 = 99.2%)
- Semantic attention computed via GPU from embeddings (requires Lane B)
- Authority extracted from graph structure

**Use existing:**
```bash
npm run karpathy:gpu --apply
```

**Or create custom:** `scripts/atlas/compute-karpathy-scores.mjs`

**Pseudo-code:**
```javascript
const packets = await db.query(`
  SELECT t.*, p.embedding FROM atlas_topology_index t
  JOIN atlas_packets p ON t.packet_key = p.packet_key
  WHERE t.karpathy_score IS NULL OR t.karpathy_score = 0
`);

// Batch GPU attention computation
const attentionScores = await gpu.computeAttention(packets.map(p => p.embedding));

for (let i = 0; i < packets.length; i++) {
  const karpathyScore = 
    0.4 * packets[i].pagerank +
    0.3 * attentionScores[i] +
    0.3 * packets[i].authority_score;
  
  await db.query(
    `UPDATE atlas_topology_index SET karpathy_score = $1 WHERE packet_key = $2`,
    [karpathyScore, packets[i].packet_key]
  );
}
```

**Performance:** ~15s GPU + <1s blending

**Expected output:** 3,251/3,251 karpathy_score values (0.0-1.0 range)

---

### Lane E: Latent 64-dim Autoencoder (Depends on B)
**Tables:** `atlas_topology_index` → latent_64 (bytea)

**What it does:**
- AutoEncoder: 768-dim → 64-dim compression
- Enables efficient clustering, approximate nearest-neighbor search
- Memory-efficient variant of full embeddings

**New script to create:** `scripts/atlas/backfill-latent-vectors.mjs`

**Pseudo-code:**
```javascript
const packets = await db.query(`
  SELECT packet_key, embedding FROM atlas_packets WHERE embedding IS NOT NULL
`);

// Load pretrained AE encoder weights
const aeModel = loadAutoencoder('./models/ae-768-to-64.pt');

for (const packet of packets) {
  const latent64 = aeModel.encode(packet.embedding); // 768 → 64
  const serialized = Buffer.from(latent64); // Convert to bytea
  
  await db.query(
    `UPDATE atlas_topology_index SET latent_64 = $1 WHERE packet_key = $2`,
    [serialized, packet.packet_key]
  );
}
```

**Performance:** ~1ms per embedding × 3,251 = ~10s total (GPU-accelerated)

**Expected output:** 3,251/3,251 latent_64 values

---

### Lane F: Gemma4 Keyword Extraction (Long-running, Independent)
**Tables:** `atlas_summary_layers` → keywords (text[])

**What it does:**
- Extract 3-5 key terms per summary via Gemma4
- Current: 518/16,254 (3%) — gemma4_packet_summary level only
- Fill in remaining 15,736 summaries across 6 levels

**New script to create:** `scripts/atlas/orchestrate-summary-keywords-gemma4.mjs`

**Pseudo-code:**
```javascript
const levels = ['gemma4_packet_summary', 'chunk', 'community', 'feature', 'file', 'folder', 'system'];

for (const level of levels) {
  const summaries = await db.query(`
    SELECT summary_id, summary_text FROM atlas_summary_layers
    WHERE summary_level = $1 AND (keywords IS NULL OR array_length(keywords, 1) = 0)
  `, [level]);
  
  for (const summary of summaries) {
    const keywords = await callGemma4(`
      Extract 3-5 key terms from this summary:
      ${summary.summary_text}
      
      Format: comma-separated list
    `);
    
    await db.query(
      `UPDATE atlas_summary_layers SET keywords = $1::text[] WHERE summary_id = $2`,
      [keywords.split(',').map(k => k.trim()), summary.summary_id]
    );
  }
}
```

**Performance:** 1-2s per summary × 16,254 = 5.2h single-threaded, 1.3h with 4 workers

**Expected output:** 16,254/16,254 summaries with keywords

---

## Master Orchestration Flow

**Create:** `scripts/atlas/orchestrate-phase1-complete.mjs`

```javascript
// Phase 1 (Independent): Can all start NOW
await Promise.all([
  laneA_treeNodeTagging(),
  laneC_somCoordinates(),
  laneF_gemma4Keywords()
]);

// Phase 1.5: Medium priority (needs no dependencies)
await laneB_summaryEmbeddings();

// Phase 2 (Depends on B): After embeddings ready
await Promise.all([
  laneD_karpathyScores(),
  laneE_latentAutoencoder()
]);

// Validation
await validateAllLanes();
console.log('✅ Feature extraction complete');
```

---

## Start Immediately (Independent Lanes)

**Terminal 1:** Tree tagging (1-2 hours)
```bash
npm run atlas:functions:index && npm run atlas:functions:backfill:apply
```

**Terminal 2:** SOM coordinates (30 seconds)
```bash
npm run atlas:phase16:som:apply && \
  node scripts/atlas/backfill-som-coordinates.mjs --apply
```

**Terminal 3:** Gemma4 keywords (1.3 hours with 4 workers)
```bash
WORKERS=4 node scripts/atlas/orchestrate-summary-keywords-gemma4.mjs --apply
```

**Then (after ~22.5 minutes):**

**Terminal 4:** Summary embeddings (22.5 min with 4 workers) + downstream
```bash
WORKERS=4 node scripts/atlas/orchestrate-summary-layer-embeddings.mjs --apply && \
  npm run karpathy:gpu --apply && \
  node scripts/atlas/backfill-latent-vectors.mjs --apply
```

---

## Total Estimated Timeline

| Phase | Duration | Parallel |
|-------|----------|----------|
| Phase 1 (A, C, F start) | 0-1.5h | All independent |
| Phase 1.5 (B embedding) | 22.5min | After A/C/F start |
| Phase 2 (D, E after B) | 25s | Both small/fast |
| **TOTAL (Full Completion)** | **~1.5 hours** | A\|C\|F then B then D+E |

If run strictly sequentially: ~5 hours  
If run with 4-worker pools on long lanes: **~1.5 hours**

---

## Validation Commands (After Each Lane)

```sql
-- Lane A: Tree nodes tagged
SELECT COUNT(*) FROM atlas_tree_nodes WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;
-- Expected: 8,823

-- Lane B: Summary embeddings
SELECT COUNT(*) FROM atlas_summary_layers WHERE embedding IS NOT NULL;
-- Expected: 16,254

-- Lane C: SOM coordinates
SELECT COUNT(*) FROM atlas_topology_index WHERE z_som IS NOT NULL;
-- Expected: 3,251

-- Lane D: Karpathy scores
SELECT COUNT(*) FROM atlas_topology_index WHERE karpathy_score > 0;
-- Expected: 3,251

-- Lane E: Latent vectors
SELECT COUNT(*) FROM atlas_topology_index WHERE latent_64 IS NOT NULL;
-- Expected: 3,251

-- Lane F: Keywords
SELECT COUNT(*) FROM atlas_summary_layers WHERE keywords IS NOT NULL AND array_length(keywords, 1) > 0;
-- Expected: 16,254
```

---

## NPM Scripts to Add

```json
{
  "atlas:feature:orchestrate:all": "node scripts/atlas/orchestrate-phase1-complete.mjs",
  "atlas:feature:tree:tag": "npm run atlas:functions:index && npm run atlas:functions:backfill:apply",
  "atlas:feature:summaries:embed": "WORKERS=4 node scripts/atlas/orchestrate-summary-layer-embeddings.mjs --apply",
  "atlas:feature:summaries:keywords": "WORKERS=4 node scripts/atlas/orchestrate-summary-keywords-gemma4.mjs --apply",
  "atlas:feature:som:backfill": "npm run atlas:phase16:som:apply && node scripts/atlas/backfill-som-coordinates.mjs --apply",
  "atlas:feature:karpathy:compute": "npm run karpathy:gpu --apply",
  "atlas:feature:latent:compute": "node scripts/atlas/backfill-latent-vectors.mjs --apply"
}
```

---

**Status:** Ready to execute  
**Date:** 2026-06-24  
**Next:** Run orchestration script or execute lanes in parallel via terminals