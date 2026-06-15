# Parent Atlas Plugin: Schema Design for Postgres-First Semantic Indexing

**Date**: June 15, 2026 (Session 66 continued)  
**Status**: ✅ **SCHEMA DEFINED, READY FOR INTEGRATION**

---

## Overview

Parent Atlas as a library plugin uses **Postgres as the single source of truth** for semantic indexing. The architecture is:

```
ast-grep / Rust parser / TS compiler
  ↓ (extract source_ref + symbols + imports)
Postgres (4 layers)
  ├─ Layer 1: atlas_codebase_packets (identity, frozen)
  ├─ Layer 2: atlas_tree_nodes (hierarchy)
  ├─ Layer 3: atlas_summary_layers (semantics + JSONB metadata)
  └─ Layer 4: atlas_topology_index (graph relationships)
  ↓
Qdrant (vectors)
Redis (BitFrost cache)
Neo4j (bounded relationships)
Gemma4 / Karpathy / ACE
```

---

## Current Database State

**Extensions** (verified 2026-06-15):
- ✅ pgcrypto v1.4
- ✅ vector v0.8.2
- ✅ pg_trgm v1.6
- ✅ btree_gin v1.3 (newly added)
- ✅ unaccent v1.1 (newly added)

**Existing Tables** (pre-existing, different schema):
- ✅ `atlas_codebase_packets` (packet_key is PK, not packet_id)
- ✅ `atlas_tree_nodes` (exists, may need reconciliation)
- ✅ `atlas_summary_layers` (exists, may need reconciliation)
- ✅ `atlas_topology_index` (exists, may need reconciliation)
- ✅ `error_clusters` (exists, different schema: uses `kind` enum, not `fingerprint`)
- ⏳ `error_recommendations` (not yet created)
- ⏳ `atlas_tasks` (Kanban board, not yet created)

**Schema Gap**: The existing tables were created earlier in the project with a different design. The new schema definitions in `0043_parent_atlas_plugin_core_schema.sql` and `0044_agentic_error_fixing_schema.sql` represent the **plugin-friendly layer** that should be reconciled with live tables before the next backfill.

---

## 4-Layer Plugin Schema (Design)

### Layer 1: Codebase Packets (Identity)

```sql
atlas_codebase_packets
├─ packet_id (UUID PK) — new identity layer
├─ source_ref (TEXT UNIQUE) — canonical identity (frozen)
├─ packet_key (TEXT UNIQUE) — ace:packet:* reference
├─ feature_id + feature_label — logical grouping
├─ tree_node_id (FK) — link to Layer 2
├─ qdrant_point_id — link to Qdrant mirror
├─ redis_key — link to BitFrost cache
├─ indexed_at, verified_at — lifecycle timestamps
└─ Indexes: source_ref, feature_id, packet_key, directory_path

7 Indexes:
  - idx_atlas_packets_source_ref (canonical identity lookup)
  - idx_atlas_packets_feature_id (feature grouping)
  - idx_atlas_packets_packet_key (ACE reference)
  - idx_atlas_packets_directory (hierarchical queries)
  - idx_atlas_packets_indexed_at (backfill queue)
```

### Layer 2: Tree Nodes (Hierarchy)

```sql
atlas_tree_nodes
├─ tree_node_id (UUID PK)
├─ packet_id (FK → Layer 1)
├─ parent_node_id (FK self-reference)
├─ depth, path (for traversal)
├─ node_type ('directory', 'file', 'function', 'class')
├─ content_hash (dedup)
├─ complexity_score
├─ indexed, verified (flags)
└─ Indexes: parent, packet_id, path (GIN), depth, indexed

8 Indexes:
  - idx_atlas_tree_parent (parent-child traversal)
  - idx_atlas_tree_packet (packet → nodes)
  - idx_atlas_tree_path (GIN for array queries)
  - idx_atlas_tree_depth (depth-based queries)
  - idx_atlas_tree_indexed (backfill queue)
```

### Layer 3: Summary Layers (Semantics)

```sql
atlas_summary_layers
├─ summary_id (UUID PK)
├─ packet_id (FK → Layer 1)
├─ tree_node_id (FK → Layer 2)
├─ summary_type ('brief', 'detailed', 'executive')
├─ summary_text
├─ summary_model (e.g., 'gemma4-rotorquant')
├─ metadata (JSONB)
│  ├─ domain: 'retrieval|reasoning|inference'
│  ├─ confidence: 0.85
│  ├─ tags: ['async', 'error-handling']
│  ├─ karpathy_score: 7.2
│  ├─ som_cluster: 15
│  └─ grpo_reward_score: 0.72
├─ token_count, embedding_dim
└─ Indexes: packet_id, summary_type, metadata (GIN), domain

6 Indexes:
  - idx_atlas_summary_packet
  - idx_atlas_summary_type
  - idx_atlas_summary_metadata_gin (flexible JSONB queries)
  - idx_atlas_summary_domain (domain-specific filtering)
```

### Layer 4: Topology Index (Relationships)

```sql
atlas_topology_index
├─ edge_id (UUID PK)
├─ source_packet_id (FK → Layer 1)
├─ target_packet_id (FK → Layer 1)
├─ relation_type ('imports', 'calls', 'uses', 'extends')
├─ relation_strength (0.0-1.0 confidence)
├─ metadata (JSONB)
│  ├─ bidirectional: true
│  ├─ cyclic: false
│  ├─ hops: 1
│  └─ som_adjacent: true
└─ Indexes: source_packet_id, target_packet_id, relation_type, strength, metadata (GIN)

6 Indexes:
  - idx_atlas_topo_source (outbound edges)
  - idx_atlas_topo_target (inbound edges)
  - idx_atlas_topo_relation (relationship filtering)
  - idx_atlas_topo_strength (ranking)
  - idx_atlas_topo_metadata_gin (flexible metadata queries)
```

---

## Error Fixing Schema

### Error Clusters (Grouping)

```sql
error_clusters
├─ cluster_id (UUID PK)
├─ error_category (VARCHAR from error_logs)
├─ fingerprint (TEXT UNIQUE) — hash(category + message pattern)
├─ occurrence_count
├─ packet_key, source_ref, feature_id (linkage to Layer 1)
├─ metadata (JSONB)
│  ├─ affected_routes: ['/api/embed', '/api/rag/search']
│  ├─ severity_distribution: {'CRITICAL': 2, 'ERROR': 5}
│  ├─ root_cause_hypotheses: ['Ollama timeout', 'GPU OOM']
│  └─ fix_confidence: 0.75
├─ first_seen, last_seen
└─ Indexes: fingerprint, category, packet_key, source_ref, metadata (GIN)

5 Indexes:
  - idx_error_clusters_fingerprint (unique grouping)
  - idx_error_clusters_category (error type filtering)
  - idx_error_clusters_packet_key (codebase linkage)
  - idx_error_clusters_source_ref (canonical identity)
  - idx_error_clusters_metadata_gin (flexible metadata)
```

### Error Recommendations (Fixes)

```sql
error_recommendations
├─ recommendation_id (UUID PK)
├─ cluster_id (FK → error_clusters)
├─ packet_key, source_ref, feature_id
├─ recommendation_text
├─ fix_strategy ('pattern', 'ast', 'semantic', 'manual')
├─ confidence (0.0-1.0)
├─ status ('planned', 'in_progress', 'applied', 'rejected', 'needs_review')
├─ priority ('P0', 'P1', 'P2', 'P3')
├─ metadata (JSONB)
│  ├─ roi_score: 0.85
│  ├─ effort_minutes: 15
│  ├─ estimated_impact: 'high'
│  ├─ applied_at: '2026-06-16T10:30:00Z'
│  ├─ validation_gates_passed: 4
│  └─ regression_detected: false
├─ applied_at, reviewed_at
└─ Indexes: cluster_id, status, priority, packet_key, source_ref, metadata (GIN), confidence

7 Indexes:
  - idx_error_recommendations_cluster (cluster grouping)
  - idx_error_recommendations_status (workflow state)
  - idx_error_recommendations_priority (prioritization)
  - idx_error_recommendations_packet_key (codebase linkage)
  - idx_error_recommendations_source_ref
  - idx_error_recommendations_metadata_gin
  - idx_error_recommendations_confidence (ranking)
```

### Task Board (Kanban)

```sql
atlas_tasks
├─ task_id (UUID PK)
├─ title, description, task_type, status, priority
├─ packet_key, source_ref, feature_id, feature_label, tree_node_id
├─ lane ('retrieval', 'inference', 'storage', 'verification')
├─ blocker (reference to blocking task)
├─ metadata (JSONB)
│  ├─ estimated_hours: 2
│  ├─ assigned_to: 'claude'
│  ├─ pr_number: 142
│  ├─ related_issues: [123, 456]
│  ├─ rollback_plan: 'revert commit abc123'
│  └─ success_criteria: ['all tests pass', 'no regressions']
├─ created_at, started_at, completed_at, updated_at
└─ Indexes: status, priority, task_type, lane, packet_key, source_ref, feature_id, metadata (GIN), status+priority

9 Indexes:
  - idx_atlas_tasks_status
  - idx_atlas_tasks_priority
  - idx_atlas_tasks_task_type
  - idx_atlas_tasks_lane
  - idx_atlas_tasks_packet_key
  - idx_atlas_tasks_source_ref
  - idx_atlas_tasks_feature_id
  - idx_atlas_tasks_metadata_gin
  - idx_atlas_tasks_status_priority (Kanban view)
```

---

## Views (Common Query Patterns)

### v_atlas_packets_enriched
```sql
SELECT packet_id, source_ref, packet_key, feature_id,
       directory_path, file_path, node_label, node_type,
       summary_text, summary_type, metadata,
       indexed_at, verified_at, relation_count
FROM packets JOIN tree_nodes JOIN summary_layers LEFT JOIN topology_index
```
**Use**: ACE context assembly, packet inspection

### v_atlas_backfill_queue
```sql
SELECT packet_id, source_ref, packet_key, feature_id,
       tree_nodes, summaries, relations
FROM packets WHERE indexed_at IS NULL
GROUP BY packet_id
ORDER BY created_at ASC
```
**Use**: Identify next backfill targets

### v_atlas_kanban_board
```sql
SELECT task_id, title, status, priority, lane, assigned_to,
       estimated_hours, created_at, updated_at
FROM atlas_tasks
ORDER BY status, priority
```
**Use**: Work queue visualization

### v_error_clusters_summary
```sql
SELECT cluster_id, error_category, fingerprint, occurrence_count,
       recommendation_count, applied_count, avg_confidence,
       first_seen, last_seen
FROM error_clusters LEFT JOIN error_recommendations
GROUP BY cluster_id
ORDER BY last_seen DESC
```
**Use**: Error trend analysis

---

## Integration Strategy

**Before the next backfill:**

1. **Reconcile existing tables** with plugin schema
   - `atlas_codebase_packets`: packet_key is PK now, but may want `packet_id` UUID PK for FK references
   - `atlas_tree_nodes`: may need column renaming (e.g., `parent_node_id` if not present)
   - `atlas_summary_layers`: verify metadata JSONB structure
   - `atlas_topology_index`: verify schema matches design

2. **Create missing tables**
   - `error_recommendations` (not yet created)
   - `atlas_tasks` (Kanban board)

3. **Add missing views**
   - `v_atlas_packets_enriched`
   - `v_atlas_backfill_queue`
   - `v_atlas_kanban_board`
   - `v_error_clusters_summary`

4. **Verify indexes**
   - All BTRE indexes for exact lookups
   - All GIN indexes for JSONB metadata queries
   - All DESC indexes for ranking/ordering

---

## Query Examples

### Find unindexed packets (backfill queue)
```sql
SELECT source_ref, feature_id, COUNT(*) as tree_nodes
FROM v_atlas_backfill_queue
GROUP BY source_ref, feature_id
ORDER BY source_ref;
```

### Error trends by category
```sql
SELECT error_category, occurrence_count, avg_confidence
FROM v_error_clusters_summary
WHERE last_seen > now() - interval '7 days'
ORDER BY occurrence_count DESC;
```

### Kanban work queue
```sql
SELECT * FROM v_atlas_kanban_board WHERE status != 'done';
```

### Enrich a packet with all context
```sql
SELECT * FROM v_atlas_packets_enriched WHERE packet_key = 'ace:packet:auth:001';
```

### Find related packets via topology
```sql
WITH related AS (
  SELECT target_packet_id
  FROM atlas_topology_index
  WHERE source_packet_id = $1 AND relation_type = 'imports'
)
SELECT p.* FROM atlas_codebase_packets p
WHERE p.packet_id IN (SELECT target_packet_id FROM related);
```

---

## Files Created (Session 66 continued)

1. `sveltekit-frontend/drizzle/manual/0042_parent_atlas_plugin_extensions.sql`
   - Adds btree_gin and unaccent extensions
   - Verifies all 5 required extensions

2. `sveltekit-frontend/drizzle/manual/0043_parent_atlas_plugin_core_schema.sql`
   - 4-layer core schema (packets, tree_nodes, summary_layers, topology_index)
   - 26 indexes total
   - 4 views for common patterns

3. `sveltekit-frontend/drizzle/manual/0044_agentic_error_fixing_schema.sql`
   - error_clusters (fingerprint-based grouping)
   - error_recommendations (LLM-powered fixes)
   - atlas_tasks (Kanban board)
   - 22 indexes total
   - 2 views for reporting

4. `docs/PARENT-ATLAS-PLUGIN-SCHEMA.md`
   - This document
   - Design rationale + query examples

---

## Next Steps

1. **Reconcile with existing schema** (before next backfill)
   - Audit column names and types
   - Create migration scripts to align if needed
   - Add missing columns for plugin model

2. **Create missing tables**
   - Apply `0044_agentic_error_fixing_schema.sql` (after error_clusters reconciliation)
   - Verify all FKs and indexes

3. **Wire into backfill pipeline**
   - Update `backfill-*.mjs` scripts to use plugin schema
   - Update `verify-*.mjs` scripts to validate plugin data

4. **Enable OpenCode integration**
   - Create MCP bridge for Parent Atlas queries
   - Export plugin views as OpenCode skill context
   - Wire VSCode tasks to plugin operations

---

**Status**: Schema defined, extensions added, ready for reconciliation  
**Blocker**: Existing tables may conflict with plugin schema — audit first  
**Target**: Next backfill with plugin model enabled  
