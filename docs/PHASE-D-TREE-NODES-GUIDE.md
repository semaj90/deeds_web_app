# Phase D: Tree Node Ingestion & Qdrant Enrichment

**Status**: ✅ Phase D foundation ready  
**Date**: 2026-06-14  
**Scope**: Tree nodes + canonical Qdrant cohort enrichment (no orphans/legacy)

## What is Phase D?

Parent Atlas "Packet Identity OS" foundation layer:

1. **Tree Nodes** — FileSystem hierarchy (files, folders, packages)
   - Stable node IDs (deterministic hash)
   - Links to atlas_packets via source_ref
   - Supports page index tree structure

2. **Canonical Qdrant Enrichment** — Phase D fields on matched points only
   - somCluster, treeNodeKey, neo4jNodeId
   - authorityScore, karpathyBlend
   - metadata.phase_d_enriched = true

3. **Hard Scope Boundary** — No legacy/orphan contamination
   - SKIP orphaned Qdrant points
   - SKIP legacy-only points
   - SKIP missing source_ref/packet_key

## Quick Start

### Step 1: Ingest Tree Nodes

```bash
cd sveltekit-frontend

# Dry-run (safe preview)
npm run atlas:ingest:tree-nodes:dry

# Apply (persistent)
npm run atlas:ingest:tree-nodes:apply
```

### Step 2: Verify Gate Pass

```bash
# Run audit gate
npm run atlas:tree:audit

# Expected output:
# ✅ GATE PASS — Tree nodes ready for Phase D Qdrant enrichment
```

### Step 3: Enrich Qdrant (Canonical Only)

```bash
# Dry-run canonical enrichment
npm run atlas:phase-d:qdrant:dry

# Apply enrichment
npm run atlas:phase-d:qdrant:apply
```

## What Gets Created

### Postgres Tables

**atlas_tree_nodes** (primary)
```
node_id (PK)          — sha256(source_ref:node_type)
parent_id             — for hierarchy
root_id               — tree root identifier
node_type             — 'file' | 'directory'
title                 — filename or dirname
source_ref            — relative path from SVELTEKIT_ROOT
file_path             — same as source_ref
page_index_path       — /{source_ref} for tree nav
packet_key            — linked from atlas_packets
feature_id            — inherited from packets
feature_label         — inherited from packets
metadata JSONB        — type, extension, is_code, etc.
created_at            — ingestion timestamp
updated_at            — last update timestamp
```

**atlas_tree_edges** (relationships)
```
source_id, target_id, edge_type (PK)
edge_type             — 'CONTAINS' (file in dir)
weight                — edge strength (1.0)
created_at            — creation timestamp
```

### Qdrant Payload Enrichment

Fields added to codebase_chunks_768 points (canonical only):
```json
{
  "somCluster": "cluster:row:col",        // SOM grid coordinate
  "treeNodeKey": "node:xxxxx",            // Link to tree_nodes
  "qdrantHit": true,                      // Marker for enriched
  "metadata": {
    "phase_d_enriched": true,
    "enriched_at": "2026-06-14T..."
  }
}
```

## Gate Conditions

Phase D PASS when **ALL** conditions met:

```
✅ atlas_tree_nodes row_count > 0
✅ node_id uniqueness verified (no duplicates)
✅ source_ref → packet_key links valid
✅ tree structure integrity (no orphans)
✅ max depth ≤ 50 (no cycles)
✅ canonical Qdrant cohort enriched
✅ no orphan/legacy points touched
```

## Strict Scope Rules

### ENRICH (Canonical Cohort)
```
✅ Qdrant points with source_ref + packet_key
✅ Matched atlas_packets rows (canonical ledger)
✅ All 5 summary layers (if from Phase 14/15)
```

### SKIP (No Enrichment)
```
✗ Legacy-only points (source_ref only, no packet_key)
✗ Orphaned points (in Qdrant, not in Postgres)
✗ Missing source_ref
✗ Missing packet_key
```

## Example Flow

```
User Input
  ↓
npm run atlas:ingest:tree-nodes:apply
  ↓ (creates atlas_tree_nodes + atlas_tree_edges)
  ↓
npm run atlas:tree:audit
  ↓ (verifies gate conditions)
  ✓ GATE PASS
  ↓
npm run atlas:phase-d:qdrant:apply
  ↓ (enriches canonical points only)
  ↓
Phase D Complete
  ↓
Ready for Phase D Feature Cards (next stage)
```

## Monitoring

```bash
# Check tree node count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_tree_nodes"

# Check edges
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_tree_edges"

# Verify linkage to packets
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*), COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) \
      FROM atlas_tree_nodes WHERE source_ref IS NOT NULL"

# Check Qdrant enrichment
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -d '{"limit": 5}' -H "Content-Type: application/json" | \
  jq '.result.points[0].payload | {source_ref, packet_key, phase_d_enriched}'
```

## Troubleshooting

### Tree nodes not ingesting

```bash
# Check DATABASE_URL
echo $env:DATABASE_URL

# Verify postgres connection
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"

# Check SVELTEKIT_ROOT path in script
grep SVELTEKIT_ROOT scripts/atlas/ingest-tree-nodes.mjs
```

### Gate audit fails

```bash
# Verbose audit
npm run atlas:tree:audit:verbose

# Check for orphaned nodes
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_tree_nodes t \
   WHERE t.parent_id IS NOT NULL \
   AND t.parent_id NOT IN (SELECT node_id FROM atlas_tree_nodes)"

# Check for duplicate node_ids
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT node_id, COUNT(*) FROM atlas_tree_nodes \
   GROUP BY node_id HAVING COUNT(*) > 1"
```

### Qdrant enrichment incomplete

```bash
# Check enrichment status in Qdrant
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -d '{"limit": 100}' -H "Content-Type: application/json" | \
  jq '[.result.points[] | select(.payload.phase_d_enriched == true)] | length'

# Compare to canonical cohort size
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets \
   WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL"
```

## Next After Phase D

Once gate PASS:

1. **Phase D Feature Cards** — Enrich feature card metadata
   - Run: `npm run atlas:phase-d:feature-cards`
   - Gate: ≥90% feature cards with Phase D fields

2. **Phase D Validation** — Full cross-ledger consistency
   - Run: `npm run atlas:phase-d:gate`
   - Gate: Postgres/Qdrant/Neo4j alignment

3. **Phase 14 Resume** — Continue offline summarization
   - Already complete; rerun Phase 14/15 on new packets

## Reference

- **Implementation**: `scripts/atlas/ingest-tree-nodes.mjs`
- **Audit**: `scripts/atlas/audit-tree-nodes.mjs`
- **Enrichment**: `scripts/atlas/phase-d-enrich-qdrant.mjs`
- **Architecture**: `docs/architecture/atlas-operating-system.md`
- **Hard Rules**: `CLAUDE.md` § Canonical Lineage Contract

---

**Phase D execution sequence: tree-nodes → audit → qdrant → feature-cards → gate**
