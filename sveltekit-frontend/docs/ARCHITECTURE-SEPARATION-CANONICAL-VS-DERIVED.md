# Architecture: Canonical vs Derived Topology

**Date**: July 30, 2026  
**Status**: CRITICAL SPECIFICATION  
**Author**: Session 153 Review

---

## Core Principle

Canonical facts and derived topology features must be stored and versioned separately. Confusing them causes silent data inconsistencies and prevents safe invalidation.

---

## Canonical Facts (Postgres, Immutable)

**Definition**: Deterministically extracted from source, supported by evidence, can be validated statically.

**Examples**:
- `function A calls function B` (AST static analysis, with line numbers)
- `module A imports module B` (static import statement)
- `test T covers symbol A` (test name + symbol name)
- `artifact belongs to repository_revision R` (git SHA)
- Source-level syntactic structure (AST depth, parameter count, etc.)

**Storage**: `canonical_artifact_relations` (Postgres)

```sql
CREATE TABLE canonical_artifact_relations (
  id UUID PRIMARY KEY,
  source_artifact_id VARCHAR,
  target_artifact_id VARCHAR,
  relation_type VARCHAR(50),  -- CALLS, IMPORTS, IMPLEMENTS, TESTS, USES_SCHEMA
  evidence_ref VARCHAR,       -- AST line number, import statement, etc.
  source_kind VARCHAR,        -- STATIC_ANALYSIS, REGEX, SYMBOL_RESOLUTION
  rule_version VARCHAR,       -- Rule/regex version used
  created_at TIMESTAMP,
  workspace_revision VARCHAR
);
```

**Immutability Rule**: Once inserted, a canonical fact remains unchanged. New facts are added; old ones are never modified (immutable audit trail).

---

## Derived Topology Features (Versioned Projections)

**Definition**: Computed from canonical facts + external algorithm + hyperparameters. Results depend on graph revision, model version, hyperparameters.

**Examples**:
- **PageRank score** (depends on graph edges, damping factor, iteration count, convergence tolerance)
- **K-means cluster assignment** (depends on K, initialization, random seed, convergence criterion)
- **SOM cell coordinates** (depends on map size, learning rate, neighborhood function, iteration count)
- **Community ID** (depends on detection algorithm, resolution parameter, random seed)
- **topology_128 vector** (depends on embedding model, autoencoder weights, training data)
- **Node2vec embedding** (depends on walk length, return parameter, embedding dimension)
- **Degree statistics** (depends on what relations are included in the graph)

**Storage**: `topology_projection_v1` (Postgres)

```sql
CREATE TABLE topology_projection_v1 (
  id UUID PRIMARY KEY,
  artifact_id VARCHAR,
  projection_type VARCHAR(50),  -- PAGERANK, KMEANS, SOM, COMMUNITY, EMBEDDING_LATENT, AUTHORITY
  projection_version VARCHAR,   -- e.g., "pagerank_v2", "kmeans_v3"
  algorithm_version VARCHAR,    -- Algorithm implementation version
  graph_revision VARCHAR,       -- Graph state this was computed from
  hyperparameters JSONB,        -- {damping_factor: 0.85, max_iterations: 100, ...}
  value FLOAT8 | JSONB,         -- Actual result (score or vector)
  computed_at TIMESTAMP,
  workspace_revision VARCHAR,
  UNIQUE(artifact_id, projection_type, projection_version, graph_revision)
);
```

**Reproducibility Rule**: Same input (artifact_id, graph_revision, algorithm_version, hyperparameters) → same output. Record all parameters.

**Invalidation Rule**: When graph_revision changes or algorithm_version updates, all dependent projections are marked stale and recomputed.

---

## Domain Classification (Observation, Not Canonical)

**Definition**: A domain label is a probabilistic categorization, not a structural fact.

**Examples**:
- `vector_retrieval`, `authentication`, `database`, `observability`, `ui`, `api`, `utility`

**Why Not Canonical**: 
- Multiple valid labels possible (function can retrieve AND cache)
- Depends on taxonomy version
- Depends on classification model + version
- Can be enriched/corrected by human review
- Confidence score indicates uncertainty

**Storage**: `label_observation` (Postgres)

```sql
CREATE TABLE label_observation (
  id UUID PRIMARY KEY,
  artifact_id VARCHAR,
  label_namespace VARCHAR,  -- domain, capability, technology, artifact_kind
  label_value VARCHAR,
  source_kind VARCHAR,     -- rule, structural, lexical, model, human
  source_id VARCHAR,       -- Which rule/model/human assigned it
  confidence FLOAT8,
  evidence_refs TEXT[],
  workspace_revision VARCHAR,
  taxonomy_version VARCHAR, -- Which taxonomy version
  created_at TIMESTAMP,
  UNIQUE(artifact_id, label_namespace, label_value, source_kind, source_id, workspace_revision)
);
```

**Multi-View Rule**: Same artifact can have multiple domain labels with different confidence scores. The system picks the highest-confidence one for routing, but all are visible for audit.

---

## Correct Lineage

```
Canonical Graph Facts (Postgres canonical_artifact_relations)
  ↓
Graph Revision Established (git SHA or monotonic version number)
  ↓
Derive Topology Projection (Algorithm + Hyperparameters)
  ↓
Store Projection Result (Postgres topology_projection_v1 with algorithm_version + hyperparameters)
  ↓
Apply Label Observation (Separate table, includes confidence + source)
  ↓
All join via artifact_id + workspace_revision + timestamp
```

**Example Join**:

```sql
SELECT
  a.artifact_id,
  c.relation_type,
  t.projection_type,
  t.value AS pagerank_score,
  l.label_value AS domain,
  l.confidence AS domain_confidence
FROM canonical_artifact_relations c
JOIN topology_projection_v1 t USING (artifact_id, workspace_revision)
LEFT JOIN label_observation l USING (artifact_id, workspace_revision)
WHERE t.projection_type = 'PAGERANK'
  AND t.graph_revision = 'abc123'  -- Specific graph version
  AND l.label_namespace = 'domain'
ORDER BY l.confidence DESC;
```

---

## Hard Rules

| Rule | Rationale |
|------|-----------|
| **Never copy topology_128 as a classification** | It's a 128-dim latent code, not a semantic label |
| **Never use PageRank as a canonical fact** | It's a projection; re-compute if graph changes |
| **Never mix featureId into the taxonomy** | featureId is identity; taxonomy is classification |
| **Always record algorithm_version + hyperparameters** | Enables reproduction and safe invalidation |
| **Never make Qdrant/Redis the source of topology** | Postgres is source; Qdrant/Redis are mirrors |
| **Always version-check before using projections** | Old projections from stale graph_revision are invalid |
| **Confidence scores always included on labels** | Indicates uncertainty; system must handle multiple candidates |

---

## Migration Path

If you have topology fields in existing schema:

1. **Audit current schema**: Find all `som_cluster`, `community_id`, `pagerank_score`, `domain_label` columns
2. **Separate by type**:
   - Canonical facts (AST depth, import count) → rename to canonical prefix
   - Derived projections → move to `topology_projection_v1` with version metadata
   - Labels → move to `label_observation` with confidence + source
3. **Add versioning**: Populate `graph_revision`, `algorithm_version`, `hyperparameters`
4. **Update queries**: Use versioned joins instead of direct column access
5. **Archive old columns**: Don't delete; add deprecation markers + migration guide

---

## Reference Implementations

**Canonical fact insertion**:
```typescript
const result = await db.insert(canonicalArtifactRelations).values({
  source_artifact_id: 'file:src/auth.ts',
  target_artifact_id: 'file:src/db.ts',
  relation_type: 'IMPORTS',
  evidence_ref: 'import statement line 42',
  source_kind: 'STATIC_ANALYSIS',
  rule_version: 'ast_import_v2',
  workspace_revision: currentRevision,
  created_at: new Date()
});
```

**Derived projection insertion**:
```typescript
const result = await db.insert(topologyProjectionV1).values({
  artifact_id: 'file:src/auth.ts',
  projection_type: 'PAGERANK',
  projection_version: 'pagerank_v2',
  algorithm_version: 'networkx_v2.6',
  graph_revision: graphRevision,
  hyperparameters: {
    damping_factor: 0.85,
    max_iterations: 100,
    tolerance: 1e-6
  },
  value: 0.045,  // The actual score
  workspace_revision: currentRevision,
  computed_at: new Date()
});
```

**Label observation insertion**:
```typescript
const result = await db.insert(labelObservation).values({
  artifact_id: 'file:src/auth.ts',
  label_namespace: 'domain',
  label_value: 'authentication',
  source_kind: 'model',
  source_id: 'gemma4-v1',
  confidence: 0.94,
  evidence_refs: ['extraction_rule_42', 'keyword_match_session'],
  taxonomy_version: 'domain_taxonomy_v3',
  workspace_revision: currentRevision,
  created_at: new Date()
});
```

---

## Validation Gates

**Before Inserting Projections**:
1. ✅ graph_revision exists in canonical_artifact_relations
2. ✅ Source and target artifacts exist
3. ✅ algorithm_version is known (immutable registry)
4. ✅ hyperparameters are within safe bounds

**Before Querying Projections**:
1. ✅ Always specify graph_revision (prevents accidental stale data)
2. ✅ Always check algorithm_version matches your expectations
3. ✅ Document if falling back to old projection_version (with version number)

**Before Using Labels**:
1. ✅ Always check source_kind (rule vs model vs human)
2. ✅ Always filter by confidence threshold (depends on use case)
3. ✅ Always show confidence in UI (user knows it's uncertain)

---

## Summary

| Layer | Storage | Mutability | Versioning | Join Key |
|-------|---------|-----------|-----------|----------|
| **Canonical facts** | Postgres | Immutable append-only | rule_version | artifact_id + relation_type |
| **Topology projections** | Postgres | Immutable snapshots | algorithm_version + graph_revision + hyperparameters | artifact_id + projection_type |
| **Domain labels** | Postgres | Multi-valued (highest confidence wins) | taxonomy_version | artifact_id + label_namespace |
| **Redis cache** | Valkey/Redis | Ephemeral (TTL) | Per-key versioning | packet_key or feature_id |
| **Qdrant mirror** | Qdrant | Eventual consistency with Postgres | Payload schema_version | qdrant_point_id (mirrors Postgres artifact_id) |

This separation enables:
✅ Safe reproducibility (recompute any projection from canonical facts + algorithm version)
✅ Automatic invalidation (when graph_revision changes, stale projections are identifiable)
✅ Multi-label support (same artifact can have multiple domain labels with different scores)
✅ Audit trail (immutable canonical facts + versioned projections = full history)
