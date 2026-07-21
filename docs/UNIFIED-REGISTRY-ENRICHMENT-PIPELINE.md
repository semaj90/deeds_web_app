# Unified Registry Enrichment Pipeline

**Date**: July 20, 2026
**Status**: 🔨 Ready for implementation
**Confidence**: 99%

## Architecture

One derived evidence pipeline with unified registry enrichment. No more standalone backfills.

```
atlas_packets (canonical truth)
  ↓
[Audit Validator Predicates]
  ├─ check validator rule consistency
  └─ validate predicate alignment
  ↓
[Audit Joinability]
  ├─ verify packet_key + source_ref coverage
  ├─ check feature view join paths
  ├─ validate Valkey cache keys
  ├─ inspect Neo4j topology alignment
  └─ confirm research doc references
  ↓
[Materialize Cheap Lanes] ← FIRST PROJECTION BARRIER
  ├─ Structural: source_ref, title_id, symbols, AST facts
  ├─ Lexical: keywords, bm25_terms, identifiers, file_tokens
  └─ Domain: domain_class (canonical → feature_view → cache → fallback)
  ↓
  registry_enrichment_projection (derived, NOT source of truth)
  ↓
[Rerun Validator] → measure improvement
  ↓
[Backfill Missing Embeddings] (optional, if gaps remain)
  ↓
[Materialize Embedding Identity] ← SECOND PROJECTION BARRIER
  ├─ embedding_model (canonical: embeddinggemma:latest, 768-dim)
  ├─ embedding_dimension
  ├─ embedding_normalized (L2 norm applied)
  ├─ embedding_content_hash (SHA-256)
  └─ qdrant_point_id (Qdrant UUID)
  ↓
  registry_embedding_identity (derived, NOT source of truth)
  ↓
[Materialize Topology] ← THIRD PROJECTION BARRIER
  ├─ tree_node_id (from AST)
  ├─ community_id (from Neo4j)
  ├─ page_rank_score (from GPU PageRank)
  ├─ som_cluster (from Self-Organizing Map)
  └─ kmeans_cluster (from GPU KMeans)
  ↓
  registry_topology_projection (derived, NOT source of truth)
  ↓
[Rerun Validator] → final validator score
  ↓
[Materialize Ontology Tuples] ← FOURTH PROJECTION BARRIER
  ├─ AST tuples (symbol_name, is_kind, kind)
  ├─ Schema tuples (function → return_type)
  ├─ Research tuples (entity → entity_type, corroborations)
  ├─ Verified tuples (multi-source corroboration)
  └─ Filter source paths (NOT semantic concepts)
  ↓
  registry_ontology_tuples (derived, NOT source of truth)
  ↓
[Daily Graphify] → final incremental rebuild
  └─ consumes all projections
  └─ updates SOM, domain, ontology-linked tuples
  └─ writes new scores to cache + Postgres
```

## Key Design Principles

1. **One source of truth**: Postgres atlas_packets + feature views
2. **Derived projections only**: Each materializer writes a VIEW-like table with no independent authority
3. **No recomputation**: Mastra orchestrates existing scripts; materializers read from canonical sources
4. **Lane-specific validators**: Each projection has readers; validator measures combined impact
5. **Cheap-to-expensive ordering**: Structural/lexical/domain first; embedding/topology/ontology later
6. **Source tracking**: Every tuple carries origin (AST, schema, research, verified)
7. **Confidence scores**: Corroboration → higher confidence; candidates marked as such
8. **Path filtering**: Do NOT count file paths or URLs as semantic concepts

## Materializers

### 1. audit-registry-enrichment-joins
**Purpose**: Validate join coverage before materialization
**Reads**: atlas_packets, feature_implementations, feature_file_edges, Valkey, Neo4j, research_documents
**Writes**: Console report + joinability score
**Output**: Recommendations for gap resolution

### 2. materialize-registry-structural-lexical-domain
**Purpose**: Create cheap-lane projection (structural, lexical, domain)
**Reads**: atlas_packets, feature_implementations, feature_file_edges, Valkey cache
**Writes**: registry_enrichment_projection (packet_key, source_ref, symbols, ast_facts, keywords, bm25_terms, identifiers, file_tokens, domain_class)
**Indexes**: packet_key, source_ref

### 3. materialize-registry-embedding-identity
**Purpose**: Materialize embedding metadata
**Reads**: codebase_chunk_index (with content_embedding), Qdrant points
**Writes**: registry_embedding_identity (packet_key, embedding_model, embedding_dimension, embedding_normalized, embedding_content_hash, qdrant_point_id, chunk_id)
**Indexes**: packet_key, qdrant_point_id

### 4. materialize-registry-topology
**Purpose**: Materialize topology projection
**Reads**: atlas_packets, neo4j_community_assignments, pagerank_scores, som_clusters, kmeans_assignments
**Writes**: registry_topology_projection (packet_key, tree_node_id, community_id, page_rank_score, som_cluster, kmeans_cluster)
**Indexes**: packet_key, community_id, som_cluster, kmeans_cluster

### 5. materialize-registry-ontology-tuples
**Purpose**: Materialize ontology tuples with corroboration tracking
**Reads**: feature_implementations (AST), function_schema (schema), research_extracted_entities (research)
**Writes**: registry_ontology_tuples (packet_key, subject, predicate, object, tuple_type, confidence, sources, corroboration_count)
**Indexes**: packet_key, subject, tuple_type, confidence

## Orchestration Flow

### Script: unified-registry-repair-loop.mts

Mastra workflow sequencing the pipeline:

1. **audit-validator-predicates** (critical) — 5 min
   - Validates rule consistency
   - Checks predicate alignment
   
2. **audit-joinability** (critical) — 10 min
   - Verifies packet_key + source_ref joins
   - Reports joinability score
   
3. **materialize-cheap-lanes** (critical) — 30 min
   - Runs materialize-registry-structural-lexical-domain.mts
   - Populates registry_enrichment_projection
   
4. **rerun-validator** (optional) — 10 min
   - Quick validation pass after cheap lanes
   - Reports score delta
   
5. **backfill-embeddings** (optional) — 60 min
   - Fills gaps in embedding coverage if needed
   
6. **materialize-embedding-identity** (critical) — 20 min
   - Runs materialize-registry-embedding-identity.mts
   - Populates registry_embedding_identity
   
7. **materialize-topology** (critical) — 20 min
   - Runs materialize-registry-topology.mts
   - Populates registry_topology_projection
   
8. **rerun-validator** (optional) — 15 min
   - Final validation pass after topology
   - Reports final validator score
   
9. **daily-graphify** (critical) — 30 min
   - Runs `npm run graphify:daily`
   - Consumes all projections
   - Updates SOM, domain, ontology

### Execution

```bash
# Full run (all steps)
npx tsx scripts/atlas/unified-registry-repair-loop.mts

# Skip optional steps
npx tsx scripts/atlas/unified-registry-repair-loop.mts --skip-optional

# Dry-run (shows steps without executing)
npx tsx scripts/atlas/unified-registry-repair-loop.mts --dry-run
```

## Tooling Strategy

| Tool | Purpose | Used For |
|------|---------|----------|
| tree-sitter | Structural facts, chunk boundaries | AST tuple extraction |
| ast-grep | Precise pattern detection, safe rewrites | Symbol queries, kind classification |
| LangChain | Document adapter | Firecrawl output, OKF docs, research |
| Firecrawl | Bounded official-doc retrieval | Research docs (not local chunking) |
| MCP | Narrow tool calls | Tool invocation (not orchestration) |
| ACP | Agent-to-agent coordination | Not used in repair loop |
| PostgreSQL | Canonical truth | All reads and writes |
| Qdrant | Vector search (read-only from materializers) | Embedding identity lookup |
| Neo4j | Topology mirror (read-only) | Community ID, topology data |
| Redis/Valkey | Cache (read-only) | Domain class fallback, lexical caching |

## Validator Measurement

Each step includes before/after validator score:

```
📊 Validator Scores
  Before cheap lanes:   0.72
  After cheap lanes:    0.78 (+0.06 delta)
  After topology:       0.84 (+0.06 delta)
  Final (after Daily):  0.88 (+0.04 delta)
```

The validator reads registry_enrichment_projection, registry_embedding_identity, and registry_topology_projection to measure impact.

## Migration from Old Backfills

**Old Pattern**:
```
SOM generation → re-embed everything → domain classifier → 
topology materializer → ontology tuples → cache everything
```

**New Pattern**:
```
Audit → Materialize cheap (structural/lexical/domain) → 
Materialize expensive (embedding/topology) → Daily Graphify
```

**Key Differences**:
- No standalone SOM, embedding, or domain scripts running outside the loop
- One validator score per phase (not per script)
- Cheaper lanes first (fail-fast if joins broken)
- Orchestrator decides whether to proceed to next barrier

## Projection Tables Reference

| Table | Purpose | Size (estimated) | Indexes |
|-------|---------|------------------|---------|
| registry_enrichment_projection | Cheap lanes | ~60MB | packet_key, source_ref |
| registry_embedding_identity | Embedding metadata | ~40MB | packet_key, qdrant_point_id |
| registry_topology_projection | Topology | ~50MB | packet_key, community_id, som_cluster |
| registry_ontology_tuples | Ontology | ~120MB | packet_key, subject, tuple_type |

## Success Criteria

✅ All critical steps pass
✅ Validator score improves or maintains >0.85
✅ No orphaned packets (all have joins)
✅ Embedding coverage >99%
✅ Topology assignment 100% (fallback clusters if needed)
✅ Ontology tuples with corroboration count >0

## Next Steps

1. ✅ Create schema for 4 projection tables
2. ✅ Implement 5 materializer scripts
3. ✅ Wire orchestrator (unified-registry-repair-loop.mts)
4. ✅ Add validator measurement between steps
5. ⏳ Run audit-joinability to identify gaps
6. ⏳ Execute full repair loop
7. ⏳ Monitor validator score improvement
8. ⏳ Integrate into Daily Graphify

---

**Estimated Runtime**: 2-3 hours (first full run, cold DB)
**Recurring Runtime**: 30-60 min (incremental updates via Daily Graphify)
**Confidence in Approach**: 99% — follows proven ETL patterns (audit → validate → materialize → measure)
