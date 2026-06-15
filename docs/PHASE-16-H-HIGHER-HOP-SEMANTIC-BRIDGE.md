# Phase 16-H — Higher-Hop Semantic Bridge Repair

**Date**: June 15, 2026  
**Status**: Identity spine ✅ | Qdrant/Neo4j partial | **Higher-hop handles ❌**  
**Scope**: File_path → SOM → Qdrant → Redis → Neo4j → Glyph handles  
**Target**: Build the join/bridge table that connects packet identity to all topology surfaces

---

## The Disconnect (Audit Reality)

**What exists:**
- ✅ Postgres packet identity: `packet_key`, `source_ref`, `feature_id`, `community_id` (3,251 rows, 100% coverage)
- ✅ Qdrant dense vectors: `codebase_chunks_768` (52,606 points)
- ✅ Neo4j USED_CONCEPT edges: Function call graph
- ✅ Redis L1/L2 cache: Bifrost semantic cache operational

**What's broken:**
- ❌ `file_path` missing from Qdrant payload (59% coverage in Postgres, 0% in Qdrant)
- ❌ `som_cluster` tags absent (Postgres has `z_som`, Qdrant has nothing)
- ❌ No bridge between Qdrant hit → packet identity → tree node → Neo4j node
- ❌ No index for `qdrantHit` discovery (which Qdrant point maps to which packet?)
- ❌ No registry for `redisHotKey` lookups (is this in bifrost:* or gpu:karpathy:*?)
- ❌ No Neo4j node bridge (which packet_key maps to which Neo4j :Packet node?)
- ❌ No glyph handles (no link to atlas_svg_glyphs)

**Result**: 
- Qdrant returns vector similarity + confidence score
- But cannot answer: "What packet is this point? What feature? What file? Which tree node?"
- Neo4j has the graph but isn't connected to the dense retrieval spine
- SOM topology exists but isn't indexed for cluster routing
- HyperRAG tries to rerank but has no authoritative join to sort by

---

## Phase 16-H Solution: atlas_higher_hop_index

**Not a truth table** — this is a **derived join/index table** that caches the bridges.

```sql
CREATE TABLE IF NOT EXISTS atlas_higher_hop_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity spine (copy from atlas_packets for JOIN speed)
  packet_key text NOT NULL UNIQUE,
  source_ref text NOT NULL,
  feature_id text,
  file_path text,
  
  -- Tree topology (link to atlas_tree_nodes)
  tree_node_id uuid,
  community_id bigint,
  
  -- SOM topology (from atlas_topology_index or pending)
  som_cluster int,
  som_x smallint,
  som_y smallint,
  
  -- Qdrant discovery
  qdrant_collection text,      -- always 'codebase_chunks_768' for now
  qdrant_point_id text,         -- UUID as string
  qdrant_score double precision, -- from search result
  qdrant_payload_hash text,     -- SHA256 of payload for sync verification
  
  -- Redis hot key registry
  bifrost_key text,             -- bifrost:sem:packet:{packet_key} or NULL
  bifrost_score double precision,
  gpu_karpathy_key text,        -- gpu:karpathy:scores or NULL
  gpu_karpathy_rank int,
  redis_centroid_key text,      -- centroid:packet:{packet_key} or NULL
  
  -- Neo4j node bridge
  neo4j_node_id text,           -- Neo4j internal ID or NULL
  neo4j_labels jsonb,           -- ['Packet', 'Feature', 'Community']
  neo4j_pagerank float,
  neo4j_betweenness float,
  neo4j_eigenvector float,
  
  -- Glyph/visualization bridge
  glyph_record_id uuid,         -- FK to atlas_svg_glyphs if exists
  glyph_render_type text,       -- 'packet', 'feature', 'community', 'som_cell'
  
  -- Repair metadata
  evidence_mode text NOT NULL DEFAULT 'native',
  repair_status text NOT NULL DEFAULT 'pending',
  -- pending: placeholder, unverified
  -- verified: all bridges linked and tested
  -- partial: some links missing but row is usable
  -- error: one or more bridges failed
  
  lineage_version int DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { "source": "qdrant_sync|gds_run|som_backfill|redis_discovery", "last_verified": "2026-06-15T..." }
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT fk_tree_node FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id),
  CONSTRAINT fk_glyph FOREIGN KEY (glyph_record_id) REFERENCES atlas_svg_glyphs(id)
);

-- Identity scalar indexes (fast lookup)
CREATE INDEX idx_higher_hop_packet_key ON atlas_higher_hop_index(packet_key);
CREATE INDEX idx_higher_hop_source_ref ON atlas_higher_hop_index(source_ref);
CREATE INDEX idx_higher_hop_feature_id ON atlas_higher_hop_index(feature_id);

-- File path fuzzy search (trigram for "which packet contains this file substring?")
CREATE INDEX idx_higher_hop_file_path_trgm
  ON atlas_higher_hop_index USING gin (file_path gin_trgm_ops);

-- SOM cluster routing (find all packets in som_cluster 5)
CREATE INDEX idx_higher_hop_som_cluster ON atlas_higher_hop_index(som_cluster);
CREATE INDEX idx_higher_hop_som_grid ON atlas_higher_hop_index(som_x, som_y);

-- Qdrant discovery (reverse lookup: point_id → packet_key)
CREATE UNIQUE INDEX idx_higher_hop_qdrant_point ON atlas_higher_hop_index(qdrant_point_id);

-- Redis/Neo4j scoring (find top-K by pagerank, bifrost_score, etc.)
CREATE INDEX idx_higher_hop_pagerank ON atlas_higher_hop_index(neo4j_pagerank DESC);
CREATE INDEX idx_higher_hop_bifrost_score ON atlas_higher_hop_index(bifrost_score DESC);

-- Repair/metadata queries (GIN for JSONB path searches)
CREATE INDEX idx_higher_hop_metadata_gin ON atlas_higher_hop_index USING gin (metadata jsonb_path_ops);
CREATE INDEX idx_higher_hop_repair_status ON atlas_higher_hop_index(repair_status);

-- Range/time scans (BRIN for efficient table scans)
CREATE INDEX idx_higher_hop_created_brin ON atlas_higher_hop_index USING brin (created_at);
CREATE INDEX idx_higher_hop_lineage_brin ON atlas_higher_hop_index USING brin (lineage_version);
```

---

## Repair Implementation Order

### Phase 16-H.1: Schema + Initial Backfill (20 min)

**Script**: `phase-16-h-schema-backfill.mjs`

```javascript
// Step 1: Create atlas_higher_hop_index table
await pool.query(CREATE TABLE ... );

// Step 2: Backfill from atlas_packets (identity spine only)
INSERT INTO atlas_higher_hop_index (
  packet_key, source_ref, feature_id, file_path, community_id
)
SELECT
  p.packet_key,
  p.source_ref,
  p.feature_id,
  p.file_path,
  p.community_id
FROM atlas_packets p
ON CONFLICT (packet_key) DO NOTHING;

// Output: 3,251 rows with identity spine, nulls for topology handles
// Repair status: 'pending' (not yet linked to any topology surface)
```

### Phase 16-H.2: File Path Repair (10 min)

**Truth source**: Postgres `atlas_packets.file_path` (59% coverage, 1,919 rows)

**Script**: `phase-16-h-file-path-repair.mjs`

```javascript
// Sync file_path from atlas_packets where it exists
UPDATE atlas_higher_hop_index
SET file_path = (
  SELECT file_path FROM atlas_packets p
  WHERE p.packet_key = atlas_higher_hop_index.packet_key
)
WHERE file_path IS NULL
  AND EXISTS (SELECT 1 FROM atlas_packets p WHERE p.packet_key = atlas_higher_hop_index.packet_key AND p.file_path IS NOT NULL);

// Output: 1,919/3,251 rows now have file_path (59% coverage)
// Remaining 1,332 rows: mark repair_status = 'partial' (file_path missing from source)
```

### Phase 16-H.3: SOM Cluster Repair (15 min)

**Truth source**: Postgres `atlas_topology_index.z_som` (if exists) OR Qdrant tags

**Script**: `phase-16-h-som-repair.mjs`

```javascript
// Option A: Pull from atlas_topology_index if it exists
UPDATE atlas_higher_hop_index h
SET
  som_cluster = t.z_som,
  som_x = (t.z_som / 20)::smallint,
  som_y = (t.z_som % 20)::smallint,
  metadata = jsonb_set(metadata, '{som_source}', '"topology_index"')
FROM atlas_topology_index t
WHERE h.packet_key = t.packet_key AND t.z_som IS NOT NULL;

// Option B: If Qdrant payload has som_cluster tag, pull from there
// (after Qdrant payload canonicalization in H.5)

// Output: som_cluster filled where available
// Remaining: mark metadata.som_status = 'pending_training' (waiting for SOM run)
```

### Phase 16-H.4: Qdrant Discovery (20 min)

**Truth source**: Qdrant `codebase_chunks_768` (52,606 points)

**Script**: `phase-16-h-qdrant-discovery.mjs`

```javascript
// Fetch all Qdrant points with their payloads
const points = await qdrant.getPoints('codebase_chunks_768', { limit: 100_000 });

// For each point, find matching packet_key in atlas_higher_hop_index
for (const point of points) {
  const packetKey = point.payload?.packet_key;
  if (!packetKey) {
    log.warn(`Point ${point.id} missing packet_key in payload — skip`);
    continue;
  }

  // Update the join table with Qdrant discovery
  UPDATE atlas_higher_hop_index
  SET
    qdrant_point_id = $1,
    qdrant_collection = 'codebase_chunks_768',
    qdrant_score = $2,
    qdrant_payload_hash = sha256($3),
    metadata = jsonb_set(metadata, '{qdrant_synced_at}', to_jsonb(NOW()))
  WHERE packet_key = $4;
}

// Output: 52,606 rows should have qdrant_point_id populated
// Gap analysis: any packet_key in atlas_higher_hop_index without qdrant_point_id → missing from Qdrant
```

### Phase 16-H.5: Qdrant Payload Canonicalization (30 min)

**Before HyperRAG reranking works, Qdrant payload MUST have these fields:**

```javascript
// For each point in codebase_chunks_768:
const canonicalPayload = {
  packet_key: packetKey,
  source_ref: sourceRef,
  feature_id: featureId,
  feature_label: featureLabel,
  file_path: filePath,
  community_id: communityId,
  som_cluster: somCluster,
  lineage_version: lineageVersion,
  // existing fields below
  summary: point.payload.summary,
  embedding: point.payload.embedding,
  // ... etc
};

// Upsert back to Qdrant
await qdrant.upsertPoints('codebase_chunks_768', {
  points: [{
    id: point.id,
    vector: point.vector,
    payload: canonicalPayload
  }]
});

// Output: All 52,606 points have canonical payload fields
// Gates: packet_key (100%), source_ref (100%), feature_id (?%), file_path (?%), som_cluster (if SOM trained)
```

### Phase 16-H.6: Redis Hot Key Registry (25 min)

**Truth sources**: 
- Bifrost cache: `bifrost:sem:packet:*` keys
- GPU Karpathy: `gpu:karpathy:scores` hash
- Centroid cache: `centroid:packet:*` keys

**Script**: `phase-16-h-redis-discovery.mjs`

```javascript
// Query Redis for keys matching Bifrost pattern
const bifrostKeys = await redis.keys('bifrost:sem:packet:*');
for (const key of bifrostKeys) {
  const packetKey = key.split(':').pop(); // extract packet_key
  const score = await redis.get(key);
  
  UPDATE atlas_higher_hop_index
  SET bifrost_key = $1, bifrost_score = $2
  WHERE packet_key = $3;
}

// Query GPU Karpathy scores
const karpathyScores = await redis.hgetall('gpu:karpathy:scores');
for (const [file, scoreJson] of Object.entries(karpathyScores)) {
  const { blend } = JSON.parse(scoreJson);
  
  UPDATE atlas_higher_hop_index
  SET gpu_karpathy_key = $1, gpu_karpathy_rank = ...
  WHERE packet_key ~ $2;  // fuzzy match on file path
}

// Output: bifrost_key, gpu_karpathy_key populated for cached packets
// Gap: uncached packets have NULL keys (expected — not all packets in hot cache)
```

### Phase 16-H.7: Neo4j Node Bridge (30 min)

**Truth source**: Neo4j `:Packet` nodes with `packet_key` property

**Script**: `phase-16-h-neo4j-bridge.mjs`

```javascript
// Query all Neo4j Packet nodes
const neoResult = await session.run(`
  MATCH (p:Packet)
  RETURN id(p) AS neo4j_id,
         labels(p) AS labels,
         p.packet_key AS packet_key,
         p.pagerank AS pagerank,
         p.betweenness AS betweenness,
         p.eigenvector AS eigenvector
`);

// Update join table
for (const record of neoResult.records) {
  UPDATE atlas_higher_hop_index
  SET
    neo4j_node_id = $1,
    neo4j_labels = $2::jsonb,
    neo4j_pagerank = $3,
    neo4j_betweenness = $4,
    neo4j_eigenvector = $5
  WHERE packet_key = $6;
}

// Output: neo4j_node_id, centrality metrics populated
// Gap: any packet without Neo4j node → topology incomplete (can still rerank via Qdrant)
```

### Phase 16-H.8: Glyph Record Bridge (10 min)

**Truth source**: `atlas_svg_glyphs` (if populated)

**Script**: `phase-16-h-glyph-bridge.mjs`

```javascript
// Link to glyphs by packet_key or feature_id match
UPDATE atlas_higher_hop_index h
SET
  glyph_record_id = g.id,
  glyph_render_type = g.render_type
FROM atlas_svg_glyphs g
WHERE (h.packet_key = g.source_key OR h.feature_id = g.feature_id)
  AND h.glyph_record_id IS NULL;

// Output: glyph_record_id populated where glyphs exist
// Expected: only 10-20% coverage (glyphs are generated on-demand, not exhaustive)
```

### Phase 16-H.9: Repair Status & Metadata (5 min)

**Final gate**: Mark each row with repair_status

```javascript
// Rows with all core bridges = 'verified'
UPDATE atlas_higher_hop_index
SET repair_status = 'verified'
WHERE packet_key IS NOT NULL
  AND qdrant_point_id IS NOT NULL
  AND neo4j_node_id IS NOT NULL;

// Rows with some bridges missing = 'partial'
UPDATE atlas_higher_hop_index
SET repair_status = 'partial'
WHERE repair_status = 'pending'
  AND (qdrant_point_id IS NOT NULL OR neo4j_node_id IS NOT NULL);

// Rows with no bridges = 'pending'
-- (already default)

// Query final audit
SELECT
  repair_status,
  COUNT(*) as count,
  COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as qdrant_linked,
  COUNT(CASE WHEN neo4j_node_id IS NOT NULL THEN 1 END) as neo4j_linked,
  COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as file_path_present
FROM atlas_higher_hop_index
GROUP BY repair_status;
```

---

## Verification & Success Criteria

### Gate 1: Identity spine (must be 100%)
```sql
SELECT COUNT(*) as missing_packet_key
FROM atlas_higher_hop_index
WHERE packet_key IS NULL;
-- Expected: 0
```

### Gate 2: Qdrant discovery (should be ≥95%)
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as with_qdrant,
  (100.0 * COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) / COUNT(*))::int as coverage_pct
FROM atlas_higher_hop_index;
-- Expected: total=3251, with_qdrant≥3088, coverage≥95%
```

### Gate 3: Neo4j bridge (should be ≥80%)
```sql
SELECT
  COUNT(CASE WHEN neo4j_node_id IS NOT NULL THEN 1 END) as with_neo4j,
  (100.0 * COUNT(CASE WHEN neo4j_node_id IS NOT NULL THEN 1 END) / COUNT(*))::int as coverage_pct
FROM atlas_higher_hop_index;
-- Expected: coverage≥80%
```

### Gate 4: File path (expect 59% from Postgres source)
```sql
SELECT
  COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as with_file_path,
  (100.0 * COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) / COUNT(*))::int as coverage_pct
FROM atlas_higher_hop_index;
-- Expected: coverage≈59%
```

### Gate 5: SOM topology (depends on SOM training)
```sql
SELECT
  COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as with_som,
  (100.0 * COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) / COUNT(*))::int as coverage_pct
FROM atlas_higher_hop_index;
-- Expected: coverage=0% (until SOM training completes), or 100% after
```

### Gate 6: Redis/Bifrost cache
```sql
SELECT
  COUNT(CASE WHEN bifrost_key IS NOT NULL THEN 1 END) as bifrost_cached,
  COUNT(CASE WHEN gpu_karpathy_key IS NOT NULL THEN 1 END) as gpu_cached
FROM atlas_higher_hop_index;
-- Expected: bifrost_cached ≤ 500 (subset), gpu_cached ≤ 200 (subset)
-- These are optional — uncached packets still usable
```

### Gate 7: Repair status distribution
```sql
SELECT repair_status, COUNT(*) as count
FROM atlas_higher_hop_index
GROUP BY repair_status;
-- Expected: verified ≥ 2000, partial ≥ 800, pending ≤ 451
```

---

## Time Estimate & Execution Schedule

| Phase | Task | Time | Blocker |
|-------|------|------|---------|
| H.1 | Schema + backfill | 20 min | None |
| H.2 | File path repair | 10 min | H.1 |
| H.3 | SOM repair | 15 min | H.1 (or pending SOM) |
| H.4 | Qdrant discovery | 20 min | H.1 |
| H.5 | Qdrant payload sync | 30 min | H.4 |
| H.6 | Redis registry | 25 min | H.1 |
| H.7 | Neo4j bridge | 30 min | H.1 |
| H.8 | Glyph bridge | 10 min | H.1 |
| H.9 | Repair status | 5 min | H.8 |
| **Total** | | **165 min (2.75 hrs)** | |

**Critical path**: H.1 → H.4 → H.5 → (parallel: H.6, H.7, H.8) → H.9

**Can run in parallel after H.1**: H.2, H.3, H.6, H.7, H.8

---

## Result: The Semantic Bridge Now Works

**Before Phase 16-H:**
- Qdrant hit → vector + confidence
- No way back to packet identity, file, tree node, or Neo4j

**After Phase 16-H:**
- Qdrant hit → `atlas_higher_hop_index` lookup by `qdrant_point_id`
- Instant join to: packet_key, source_ref, feature_id, file_path, tree_node_id
- Instant join to: SOM cell, Neo4j centrality, Redis cache status, glyph handle
- HyperRAG can now rerank using Neo4j pagerank + Bifrost cached score + SOM cluster affinity

---

## Files to Create

- `scripts/atlas/phase-16-h-schema-backfill.mjs`
- `scripts/atlas/phase-16-h-file-path-repair.mjs`
- `scripts/atlas/phase-16-h-som-repair.mjs`
- `scripts/atlas/phase-16-h-qdrant-discovery.mjs`
- `scripts/atlas/phase-16-h-qdrant-payload-sync.mjs`
- `scripts/atlas/phase-16-h-redis-discovery.mjs`
- `scripts/atlas/phase-16-h-neo4j-bridge.mjs`
- `scripts/atlas/phase-16-h-glyph-bridge.mjs`
- `scripts/atlas/phase-16-h-verify-bridges.mjs`

---

**Status**: Phase 16-H ready to execute  
**Next step**: Create H.1 schema + backfill script  
**Owner**: Higher-Hop Semantic Bridge Repair  
**Impact**: Enables HyperRAG reranking, Neo4j topology routing, SOM cluster expansion
