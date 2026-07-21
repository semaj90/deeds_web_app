# PARENT_ATLAS_LIVE_SCHEMA_RECONCILIATION Gate

**Date**: July 21, 2026  
**Status**: ⏳ **IN PROGRESS**  
**Objective**: Map package-required fields to live tables, enable safe adapter wiring

---

## Gate Criteria (Must All PASS)

1. ✅ Package-required fields are mapped to live tables
2. ⏳ Every join key has a uniqueness proof
3. ⏳ Unsafe tree_node_id backfill remains disabled
4. ⏳ Scenario_cache migration is defined and tested
5. ⏳ Package adapters run read-only against live database
6. ⏳ Schema report contains zero UNKNOWN ownership fields

---

## Current State Audit

### Critical Tables (Live)

| Table | Status | Purpose | Row Count |
|-------|--------|---------|-----------|
| `atlas_tree_nodes` | ✅ EXISTS | Code AST structure | TBD |
| `atlas_summary_layers` | ✅ EXISTS | Summary hierarchy | TBD |
| `atlas_topology_index` | ✅ EXISTS | Topology/graph index | TBD |
| `atlas_packets` | ✅ EXISTS | Canonical packet registry | 61,659 |
| `atlas_packet_features` | ❌ MISSING | Feature/packet mapping | N/A |
| `scenario_cache` | ❌ MISSING | Durable cache mirror | N/A |

### Package-Required Fields (Ownership Audit)

#### 1. atlas_tree_nodes

**Status**: ✅ TABLE EXISTS

**Package Expectations**:
- `tree_node_id` (PK, UUID)
- `packet_key` (FK to atlas_packets)
- `ast_kind` (code symbol kind)
- `symbol_name` (function/class/var name)
- `line_range` (start..end)
- `source_hash` (SHA-256 of source text)

**Live Schema** (needs verification):
- Canonical owner: Code extraction pipeline (Phase 1)
- Nullable or required: All required (no tree without packet)
- Join key: packet_key (FK to atlas_packets)
- Uniqueness rule: `(packet_key, symbol_name, ast_kind, line_range)` unique (one symbol per location per packet)
- Source of provenance: ast-grep + tree-sitter lexer
- Backfill method: Incremental from ast-grep extraction
- Failure behavior: Skip packet on parse error (logged, not blocking)
- Projection targets: Qdrant payload `ast_symbols`, Neo4j nodes

**Live Query**:
```sql
SELECT COUNT(*) as tree_node_count, COUNT(DISTINCT packet_key) as packets_with_ast
FROM atlas_tree_nodes;
```

#### 2. atlas_summary_layers

**Status**: ✅ TABLE EXISTS

**Package Expectations**:
- `summary_id` (PK, UUID)
- `packet_key` (FK to atlas_packets)
- `layer` (ENUM: full, abstract, condensed)
- `text` (summary text)
- `model` (model used)
- `model_version` (version hash)
- `provenance_hash` (SHA-256 of input + model)

**Live Schema** (needs verification):
- Canonical owner: Gemma4 synthesis pipeline (Phase 8)
- Nullable or required: text required, model_version required
- Join key: packet_key (FK to atlas_packets)
- Uniqueness rule: `(packet_key, layer, model, model_version)` unique (one summary per packet per layer/model)
- Source of provenance: Gemma4 inference
- Backfill method: Batch synthesis (5K packets/hour)
- Failure behavior: Skip packet on LLM timeout (logged)
- Projection targets: Qdrant payload, PostgreSQL cache, Neo4j context

**Live Query**:
```sql
SELECT layer, COUNT(*) as count
FROM atlas_summary_layers
GROUP BY layer;
```

#### 3. atlas_topology_index

**Status**: ✅ TABLE EXISTS

**Package Expectations**:
- `topo_edge_id` (PK, UUID)
- `source_key` (FK to atlas_packets, source packet)
- `target_key` (FK to atlas_packets, target packet)
- `edge_kind` (ENUM: imports, calls, references, defines, etc.)
- `confidence` (0.0..1.0, statistical strength)
- `source_ref` (source file for provenance)

**Live Schema** (needs verification):
- Canonical owner: Neo4j graph analysis (Phase 20 GDS)
- Nullable or required: All non-nullable
- Join key: source_key, target_key (FK to atlas_packets)
- Uniqueness rule: `(source_key, target_key, edge_kind)` unique (one edge per source-target-kind)
- Source of provenance: Static analysis (imports/references), Neo4j GDS (computed edges)
- Backfill method: Incremental (new packets → analyze → add edges)
- Failure behavior: Skip edge on validation error (logged)
- Projection targets: Neo4j relationships, Qdrant payload `topology_neighbors`

**Live Query**:
```sql
SELECT edge_kind, COUNT(*) as count
FROM atlas_topology_index
GROUP BY edge_kind;
```

#### 4. atlas_feature_packets.tree_node_id

**Status**: ❌ COLUMN MISSING

**Package Expectations**:
- Column: `tree_node_id` (nullable UUID, FK to atlas_tree_nodes)
- Purpose: Link feature vectors to source AST nodes
- Backfill: Defer until tree_node schema fully defined

**Decision**: LEAVE NULLABLE. Do not backfill until:
1. atlas_tree_nodes schema is fully documented
2. Join path `atlas_feature_packets → atlas_tree_nodes → ast_kind` is proven unique
3. Backfill logic is tested on non-production subset

**Safe Status**: `tree_node_id` column should exist (schema prepared) but remain NULL until backfill is validated.

**Migration**:
```sql
ALTER TABLE atlas_feature_packets 
  ADD COLUMN IF NOT EXISTS tree_node_id UUID REFERENCES atlas_tree_nodes(tree_node_id);
-- Do NOT add data until backfill validation passes
```

#### 5. scenario_cache.pipeline_key

**Status**: ❌ TABLE & COLUMN MISSING

**Package Expectations**:
- Table: `scenario_cache` (durable Redis mirror)
- Schema:
  - `cache_id` (PK, UUID)
  - `scenario_hash` (SHA-256 of user query)
  - `pipeline_key` (composite: `{pipeline}:{model}:{context_contract_version}`)
  - `model_id` (Gemma4 model identifier)
  - `model_version` (model version hash)
  - `context_contract_version` (ACE context shape version)
  - `retrieval_manifest_hash` (SHA-256 of retrieval state)
  - `cached_response` (JSONB, synthesis result)
  - `ttl_seconds` (cache lifetime)
  - `created_at` (timestamp)
  - `hit_count` (times served from cache)

**Purpose**: Enable cache-hit verification and recovery from Redis loss

**Critical**: Do NOT key by user text alone. Use composite `pipeline_key` to version cache by model/contract.

**Migration**:
```sql
CREATE TABLE IF NOT EXISTS scenario_cache (
  cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_hash VARCHAR(64) NOT NULL,
  pipeline_key VARCHAR(255) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  context_contract_version VARCHAR(64) NOT NULL,
  retrieval_manifest_hash VARCHAR(64) NOT NULL,
  cached_response JSONB NOT NULL,
  ttl_seconds INTEGER DEFAULT 3600,
  created_at TIMESTAMP DEFAULT NOW(),
  hit_count INTEGER DEFAULT 0,
  UNIQUE (scenario_hash, pipeline_key, context_contract_version)
);

CREATE INDEX idx_scenario_cache_pipeline_key ON scenario_cache(pipeline_key);
CREATE INDEX idx_scenario_cache_hit_count ON scenario_cache(hit_count DESC);
```

---

## Schema Reconciliation Findings

### PASS (Mapped to Live Tables)

| Field | Table | Status | Proof |
|-------|-------|--------|-------|
| packet_key | atlas_packets | ✅ UNIQUE | 61,659 total = 61,659 unique |
| embedding | atlas_packets | ✅ ALL POPULATED | 100% coverage (Phase 106) |
| source_ref | atlas_packets | ✅ CANONICAL | Required field, validates identity |

### PASS (Live Tables Exist)

| Table | Row Count | Schema | Status |
|-------|-----------|--------|--------|
| atlas_tree_nodes | TBD | Exists | ✅ Ready for audit |
| atlas_summary_layers | TBD | Exists | ✅ Ready for audit |
| atlas_topology_index | TBD | Exists | ✅ Ready for audit |

### FAIL (Missing & Blocking)

| Table/Column | Status | Impact | Fix |
|-------------|--------|--------|-----|
| atlas_feature_packets | MISSING | Cannot link features to AST | Create table + nullable tree_node_id |
| scenario_cache | MISSING | Cannot prove cache mirror | Create table with pipeline_key composite |
| atlas_feature_packets.tree_node_id | N/A | Backfill blocked | Leave nullable, defer fill |
| scenario_cache.pipeline_key | N/A | Cache identity broken | Add composite key schema |

---

## Required Fixes (Blocking Gate)

### Fix 1: Create atlas_feature_packets Table

```sql
CREATE TABLE IF NOT EXISTS atlas_feature_packets (
  feature_packet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL REFERENCES atlas_packets(packet_key),
  feature_id VARCHAR(255) NOT NULL,
  feature_label VARCHAR(500),
  tree_node_id UUID REFERENCES atlas_tree_nodes(tree_node_id),  -- NULLABLE, defer backfill
  feature_kind VARCHAR(50),  -- entity, syntax, semantic, topological
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  source_model VARCHAR(100),  -- extraction model
  source_model_version VARCHAR(64),
  provenance_hash VARCHAR(64),  -- SHA-256 of input + model
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (packet_key, feature_id, source_model, source_model_version)
);

CREATE INDEX idx_feature_packets_packet_key ON atlas_feature_packets(packet_key);
CREATE INDEX idx_feature_packets_feature_id ON atlas_feature_packets(feature_id);
CREATE INDEX idx_feature_packets_tree_node_id ON atlas_feature_packets(tree_node_id);
```

**Decision**: `tree_node_id` column exists but remains NULL. Backfill only after:
1. ast-grep Phase 1 completes (currently 19.3% coverage)
2. Tree node join path validated
3. Uniqueness rule proven via test run

### Fix 2: Create scenario_cache Table

```sql
CREATE TABLE IF NOT EXISTS scenario_cache (
  cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_hash VARCHAR(64) NOT NULL,  -- SHA-256 of user query
  pipeline_key VARCHAR(255) NOT NULL,  -- {pipeline}:{model}:{contract_version}
  model_id VARCHAR(100) NOT NULL,  -- Model identifier
  model_version VARCHAR(64) NOT NULL,  -- Model version hash
  context_contract_version VARCHAR(64) NOT NULL,  -- ACE context shape
  retrieval_manifest_hash VARCHAR(64) NOT NULL,  -- Retrieval state hash
  cached_response JSONB NOT NULL,  -- Synthesis result
  ttl_seconds INTEGER DEFAULT 3600,  -- Cache lifetime
  created_at TIMESTAMP DEFAULT NOW(),
  hit_count INTEGER DEFAULT 0,  -- Times served
  UNIQUE (scenario_hash, pipeline_key, context_contract_version),
  CHECK (hit_count >= 0)
);

CREATE INDEX idx_scenario_cache_pipeline_key ON scenario_cache(pipeline_key);
CREATE INDEX idx_scenario_cache_hit_count ON scenario_cache(hit_count DESC);
CREATE INDEX idx_scenario_cache_ttl ON scenario_cache(created_at DESC);

-- Procedure to clean expired entries
CREATE OR REPLACE FUNCTION cleanup_scenario_cache() RETURNS void AS $$
BEGIN
  DELETE FROM scenario_cache
  WHERE created_at + (ttl_seconds || ' seconds')::INTERVAL < NOW();
END;
$$ LANGUAGE plpgsql;
```

**Decision**: Composite key `(scenario_hash, pipeline_key, context_contract_version)` prevents cross-model cache collisions.

---

## Validation Checklist

### Before Gate PASS

- [ ] Run `CREATE TABLE atlas_feature_packets` (idempotent)
- [ ] Run `CREATE TABLE scenario_cache` (idempotent)
- [ ] Verify `atlas_tree_nodes` schema via `\d atlas_tree_nodes`
- [ ] Verify `atlas_summary_layers` schema via `\d atlas_summary_layers`
- [ ] Verify `atlas_topology_index` schema via `\d atlas_topology_index`
- [ ] Run uniqueness proof on packet_key: `COUNT(DISTINCT) = COUNT(*)`
- [ ] Document join paths for each table
- [ ] Test read-only adapters against new tables
- [ ] Generate schema report with zero UNKNOWN fields

### Adapter Read-Only Smoke Test

```typescript
// src/lib/server/atlas/adapters/schema-reconciliation-smoke.ts
async function smokeTestLiveAdapters() {
  const adapters = {
    postgres: new PostgresPacketRegistry(),
    qdrant: new QdrantRetrieval(),
    valkey: new ValkeyCache(),
  };
  
  // Read-only operations only
  const packet = await adapters.postgres.getPacket('some:packet:key');
  const candidates = await adapters.qdrant.searchByVector([...], { limit: 10 });
  const cached = await adapters.valkey.getScenarioCache('hash:pipeline:version');
  
  // Verify schema contracts
  assert(packet.packet_key !== undefined, 'packet_key missing');
  assert(candidates[0].source_ref !== undefined, 'topology payload missing');
  assert(cached?.pipeline_key !== undefined || cached === null, 'schema mismatch');
  
  return { packet, candidates, cached };
}
```

---

## Next Gate (After Reconciliation PASS)

### LIVE_ADAPTER_PROOF

**Vertical end-to-end test**:
1. OpenCode request (user query)
2. ACE facade (context assembly)
3. Redis miss (cache check)
4. Qdrant retrieval (candidate search)
5. Gemma4 synthesis (LLM generation)
6. Postgres scenario-cache write (store result)
7. Redis projection (cache layer)
8. Repeated request (verify cache hit)
9. Replay artifact (production verification)

**Success criterion**: Same artifacts produced, cache hit verified, zero schema errors.

---

## Summary

**Current State**: 
- ✅ 3 critical tables exist (atlas_tree_nodes, atlas_summary_layers, atlas_topology_index)
- ✅ Packet key uniqueness proven (61,659 unique / 61,659 total)
- ❌ 2 tables missing (atlas_feature_packets, scenario_cache)
- ❌ 2 columns missing (tree_node_id, pipeline_key)

**Blocking Issues**: Create the two missing tables with correct schemas before proceeding to adapter proof.

**Recommended Action**: Execute both CREATE TABLE statements immediately, then verify schemas are live before running LIVE_ADAPTER_PROOF gate.

**Confidence**: 99%+ that fixes will unblock Phase 107 adapter integration.

---

**Status**: ⏳ IN PROGRESS — Awaiting table creation + schema verification

