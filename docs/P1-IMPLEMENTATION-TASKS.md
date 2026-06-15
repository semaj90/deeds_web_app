# P1 Implementation Tasks (Locked)

## Prerequisite: Read First

- `PARENT-ATLAS-IDENTITY-OS-LOCKED.md` (canonical design)
- `NEXT-ACTIONS.md` (immediate startup)

---

## Task 1: Fix Qdrant Transport

**Priority: P0 (must-have before P1 features)**

### 1.1 Set Environment Variables

```env
# .env
QDRANT_TRANSPORT=rest
QDRANT_URL=http://127.0.0.1:6333
QDRANT_USE_GRPC=false
QDRANT_GRPC_HOST=127.0.0.1
QDRANT_GRPC_PORT=6334
QDRANT_PREFER_GRPC=false
```

### 1.2 Verify Connectivity

```bash
npm run atlas:qdrant:connectivity
```

Expected:
```
REST transport: http://127.0.0.1:6333  ✅ OK
gRPC transport: 127.0.0.1:6334         ⚠️ Optional (expected to fail)
Active transport: REST
```

### 1.3 Test Qdrant Collections

```bash
curl http://127.0.0.1:6333/collections
# Should return JSON with collections list
```

---

## Task 2: Freeze Baseline Clustering

**Priority: P0 (measurement before changes)**

### 2.1 Capture Current State

```bash
npm run atlas:clustering:health
```

Expected output:
```
SOM Baseline
  Cells: 400 (20x20 grid)
  Occupied: 272/400 (68%)
  Packets: 3,251
  Coverage: 100%

Identity Status
  Packets with source_ref: 3,251/3,251 ✅
  Packets with feature_id: 3,251/3,251 ✅
  Orphaned packets: 0 ✅
  Lineage version: packet-identity-v2

Next milestone: Create Phase 2A tables (tree_nodes)
```

### 2.2 Document Results

```bash
git add reports/baseline-clustering-p1.json
git commit -m "P1: Baseline clustering snapshot (3,251 packets, 100% coverage)"
```

---

## Task 3: Create Phase 2A Table (Tree Nodes)

**Priority: P1 (load-bearing)**

### 3.1 Write Migration

```bash
# Generate migration
npx drizzle-kit generate --name create_atlas_tree_nodes

# Edit: drizzle/migrations/0NNN_create_atlas_tree_nodes.sql
```

### 3.2 Migration SQL

```sql
CREATE TABLE atlas_tree_nodes (
  node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,
  source_ref      VARCHAR(512),

  parent_id       UUID,
  root_id         UUID,
  depth           INT DEFAULT 0,
  node_type       VARCHAR(50),
  label           TEXT,

  start_offset    INT,
  end_offset      INT,
  text_preview    TEXT,
  
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (parent_id) REFERENCES atlas_tree_nodes(node_id),
  UNIQUE(packet_key, parent_id)
);

CREATE INDEX idx_tree_packet_key ON atlas_tree_nodes(packet_key);
CREATE INDEX idx_tree_parent ON atlas_tree_nodes(parent_id);
CREATE INDEX idx_tree_root ON atlas_tree_nodes(root_id);
CREATE INDEX idx_tree_type ON atlas_tree_nodes(node_type);
CREATE INDEX idx_tree_depth ON atlas_tree_nodes(depth);
```

### 3.3 Apply Migration

```bash
npx drizzle-kit migrate
# Verify: SELECT COUNT(*) FROM atlas_tree_nodes;  → 0 (empty, ready for backfill)
```

---

## Task 4: Create Phase 2B Table (Topology Index)

**Priority: P1 (4D routing space)**

### 4.1 Write Migration

```sql
CREATE TABLE atlas_topology_index (
  packet_key      VARCHAR(255) PRIMARY KEY,

  x_cosine        REAL,
  y_graph         INT,
  z_som           INT,
  w_authority     REAL,

  som_source      VARCHAR(50),
  karpathy_score  REAL,
  latent_64       BYTEA,

  community_id    BIGINT,
  tree_node_id    UUID,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key),
  FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id)
);

CREATE INDEX idx_topo_x ON atlas_topology_index(x_cosine);
CREATE INDEX idx_topo_y ON atlas_topology_index(y_graph);
CREATE INDEX idx_topo_z ON atlas_topology_index(z_som);
CREATE INDEX idx_topo_w ON atlas_topology_index(w_authority);
CREATE INDEX idx_topo_karpathy ON atlas_topology_index(karpathy_score DESC);
```

### 4.2 Apply Migration

```bash
npx drizzle-kit migrate
```

---

## Task 5: Create Phase 2C Table (SVG Glyphs)

**Priority: P2 (multimodal retrieval, can defer)**

### 5.1 Write Migration

```sql
CREATE TABLE atlas_svg_glyphs (
  glyph_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,
  source_ref      VARCHAR(512),
  file_path       VARCHAR(1024),

  svg_xml         TEXT,
  utf8_text       TEXT,
  bbox            JSONB,

  embedding_768   vector(768),

  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key)
);

CREATE INDEX idx_glyph_packet ON atlas_svg_glyphs(packet_key);
CREATE INDEX idx_glyph_embedding ON atlas_svg_glyphs 
  USING HNSW(embedding_768 vector_cosine_ops);
```

---

## Task 6: Create Phase 2D Table (Summary Layers)

**Priority: P2 (offline synthesis, can defer)**

### 6.1 Write Migration

```sql
CREATE TABLE atlas_summary_layers (
  summary_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,

  summary_level   VARCHAR(50),
  summary_text    TEXT,

  embedding       vector(768),
  keywords        TEXT[],
  metadata        JSONB DEFAULT '{}',

  generated_at    TIMESTAMP,
  model_name      VARCHAR(100),

  created_at      TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key)
);

CREATE INDEX idx_summary_packet ON atlas_summary_layers(packet_key);
CREATE INDEX idx_summary_level ON atlas_summary_layers(summary_level);
CREATE INDEX idx_summary_embedding ON atlas_summary_layers 
  USING HNSW(embedding vector_cosine_ops);
CREATE INDEX idx_summary_keywords ON atlas_summary_layers USING GIN(keywords);
```

---

## Task 7: Backfill Tree Nodes

**Priority: P1 (creates the hierarchy)**

### 7.1 Create Backfill Script

```typescript
// scripts/atlas/backfill-tree-nodes.ts

import { db } from '$lib/server/db/client.js';
import { atlasCodebasePackets, atlasTreeNodes } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';

/**
 * Create root tree node for each source_ref (file).
 * Each packet becomes a leaf node under its file root.
 */
export async function backfillTreeNodes() {
  console.log('[backfill] Creating tree node hierarchy...');

  // 1. Get all unique source_refs (files)
  const files = await db.selectDistinct({ sourceRef: atlasCodebasePackets.sourceRef })
    .from(atlasCodebasePackets);

  console.log(`[backfill] Found ${files.length} unique files`);

  let rootsCreated = 0;
  let leafsCreated = 0;

  // 2. For each file, create root node
  for (const file of files) {
    const rootNode = await db.insert(atlasTreeNodes)
      .values({
        sourceRef: file.sourceRef,
        nodeType: 'file',
        label: file.sourceRef.split('/').pop(),
        depth: 0,
        parentId: null,
        metadata: { source: 'backfill' }
      })
      .returning();

    rootsCreated++;

    // 3. Get packets for this file
    const packets = await db.select()
      .from(atlasCodebasePackets)
      .where(sql`source_ref = ${file.sourceRef}`);

    // 4. Create leaf nodes for each packet
    for (const packet of packets) {
      await db.insert(atlasTreeNodes)
        .values({
          packetKey: packet.packetKey,
          sourceRef: file.sourceRef,
          parentId: rootNode[0].nodeId,
          rootId: rootNode[0].nodeId,
          nodeType: 'chunk',
          label: packet.featureLabel || packet.packetKey,
          depth: 1,
          metadata: { packet_key: packet.packetKey }
        })
        .catch(() => {});  // Duplicate OK

      leafsCreated++;
    }

    if (rootsCreated % 100 === 0) {
      console.log(`[backfill] ${rootsCreated} roots, ${leafsCreated} leafs...`);
    }
  }

  console.log(`[backfill] Complete: ${rootsCreated} roots, ${leafsCreated} leafs`);
}

backfillTreeNodes().catch(console.error);
```

### 7.2 Run Backfill

```bash
npx tsx scripts/atlas/backfill-tree-nodes.ts
```

Expected:
```
[backfill] Found 2,847 unique files
[backfill] Creating tree node hierarchy...
[backfill] Complete: 2,847 roots, 3,251 leafs
```

---

## Task 8: Backfill Topology Index

**Priority: P1 (4D routing coordinates)**

### 8.1 Script

```typescript
// scripts/atlas/backfill-topology-index.ts

export async function backfillTopologyIndex() {
  // 1. Get all packets with SOM cluster
  const packets = await db.select()
    .from(atlasCodebasePackets)
    .where(sql`som_cluster IS NOT NULL`);

  console.log(`[backfill] Found ${packets.length} packets with SOM cluster`);

  // 2. For each packet, create topology entry
  for (const packet of packets) {
    // Get Qdrant embedding (x_cosine)
    const qdrantPoint = await qdrant.getPoint('codebase_chunks_768', packet.packetKey);
    
    // Get Neo4j depth (y_graph)
    const graphDepth = await neo4j.getDepth(packet.featureId);
    
    // Get Karpathy score (w_authority)
    const karpathy = await redis.get(`gpu:karpathy:scores:${packet.packetKey}`);

    await db.insert(atlasTopologyIndex)
      .values({
        packetKey: packet.packetKey,
        xCosine: qdrantPoint?.score ?? 0,
        yGraph: graphDepth ?? 0,
        zSom: packet.somCluster,
        wAuthority: karpathy?.blend ?? 0,
        karpathyScore: karpathy?.blend,
        treNodeId: packet.treeNodeId,
        communityId: packet.communityId,
      })
      .onConflict()
      .doUpdate({
        set: {
          xCosine: qdrantPoint?.score ?? 0,
          yGraph: graphDepth ?? 0,
          wAuthority: karpathy?.blend ?? 0,
        }
      });
  }

  console.log(`[backfill] Topology index complete`);
}
```

### 8.2 Run

```bash
npx tsx scripts/atlas/backfill-topology-index.ts
```

---

## Task 9: Backfill Summary Layers

**Priority: P2 (can defer, offline-only)**

### 9.1 Create Stubs (Empty)

```bash
# Create placeholder rows for all packets
# (actual summaries generated offline via npm run atlas:summary:generate)

npm run atlas:backfill:summary-stubs
# Creates atlas_summary_layers row per packet, summary_text NULL
```

---

## Task 10: Update Canonical Packet Table

**Priority: P1 (link to tree)**

### 10.1 Add Columns

```sql
ALTER TABLE atlas_codebase_packets
  ADD COLUMN tree_node_id UUID,
  ADD COLUMN lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2',
  ADD FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id);

CREATE INDEX idx_packet_tree_node ON atlas_codebase_packets(tree_node_id);
```

### 10.2 Backfill

```sql
UPDATE atlas_codebase_packets p
SET tree_node_id = (
  SELECT node_id FROM atlas_tree_nodes t
  WHERE t.packet_key = p.packet_key
  LIMIT 1
);

-- Verify
SELECT COUNT(*) FROM atlas_codebase_packets WHERE tree_node_id IS NULL;
-- Should be 0
```

---

## Task 11: Verify Lineage End-to-End

**Priority: P1 (quality gate)**

### 11.1 Run Verification

```bash
npm run atlas:lineage:verify
```

Expected:
```
Lineage Verification
  atlas_codebase_packets: 3,251 packets
  atlas_tree_nodes: 3,251 leaf nodes + 2,847 roots
  atlas_topology_index: 3,251 entries
  
  Linking:
    packets → tree_nodes: 3,251/3,251 ✅
    packets → topology: 3,251/3,251 ✅
    packets → summaries: 3,251/3,251 (stubs) ✅
  
  Qdrant collections:
    codebase_chunks_768: 3,251 points (payload updated)
  
  Status: ✅ PASS
```

### 11.2 Commit

```bash
git add -A
git commit -m "P1: Complete Phase 2A-2D backfill + lineage verification

- Create atlas_tree_nodes (3,251 leafs, 2,847 roots)
- Create atlas_topology_index (4D routing space)
- Create atlas_svg_glyphs (stubs, populate post-P2)
- Create atlas_summary_layers (stubs, summaries offline)
- Backfill tree_node_id in atlas_codebase_packets
- Update Qdrant payloads with tree_node_id, lineage_version
- Verify end-to-end lineage (100%)

This establishes the Packet Identity OS foundation."
```

---

## Success Criteria

All tasks complete when:

```
✅ Qdrant transport: REST-only, verified working
✅ Baseline clustering: Documented (3,251 packets, 100% coverage)
✅ Phase 2A-2D tables: Created and empty
✅ Tree nodes: 3,251 leafs + 2,847 roots
✅ Topology index: 3,251 entries with 4D coordinates
✅ Lineage: 100% packets linked (packet → tree → topology → summary)
✅ Qdrant collections: Split (codebase_chunks_768 + 4 new collections)
✅ Payloads: Standardized (packet_key, source_ref, tree_node_id, etc.)
```

At this point, you have a **real Packet Identity OS**, not a flat-chunk RAG system.

---

## Time Estimate

- Task 1-2: 30 min (transport + baseline)
- Task 3-6: 2 hours (table creation + migrations)
- Task 7-9: 3 hours (backfill scripts + runs)
- Task 10-11: 1 hour (linking + verification)

**Total: ~6-7 hours, can be done in one session.**

Next phase (P2): Implement tree traversal + offline summary generation.

