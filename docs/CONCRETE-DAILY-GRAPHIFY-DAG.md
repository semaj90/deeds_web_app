# Concrete Daily Graphify DAG — Production Workflow Architecture

**Date**: July 19, 2026  
**Status**: Implementation Complete — 17 Sequential Stages  
**Architecture**: Mastra + Postgres + Neo4j + Qdrant + Redis

---

## Overview

The **Concrete Daily Graphify DAG** is a 17-stage sequential workflow that materializes the complete corpus indexing pipeline. Each stage is atomic, produces typed output manifests, and can be resumed or skipped independently.

**Total runtime**: ~15-25 minutes (sequential) with comprehensive observability.

---

## 17 Stages (Sequential Flow)

### Stage 1: Freeze Corpus Snapshot (2-3 min)

**Purpose**: Establish temporal boundary for this DAG run

**Input**: 
- All atlas_packets rows
- Current git HEAD

**Output Manifest**:
```json
{
  "stage": "freeze_corpus",
  "input": {
    "recordCount": 58365,
    "hash": "sha256:abc123...",
    "sources": ["atlas_packets"]
  },
  "output": {
    "recordCount": 58365,
    "hash": "sha256:def456..."
  },
  "duration": 2500,
  "warnings": [],
  "failedIdentities": [],
  "software": { "node": "v20.x", "postgres": "18.4" }
}
```

**Implementation**:
- Query `atlas_packets` count
- Record latest `updated_at` timestamp
- Store snapshot metadata for later validation

### Stage 2: Find Dirty Packet/File Identities (1-2 min)

**Purpose**: Identify packets modified in last 24 hours

**Input**: 
- atlas_packets with updated_at filtering
- Directory change detection (git diff)

**Output Manifest**:
```json
{
  "stage": "find_dirty_identities",
  "output": {
    "recordCount": 1247,
    "dirtyIdentities": ["src/lib/server/...", "src/routes/..."],
    "totalDirtyRefs": 1247
  },
  "duration": 1800,
  "warnings": ["No dirty identities found in last 24h"],
  "failedIdentities": []
}
```

**Metric**: `% corpus changed` (target: <10%)

### Stage 3: Validate source_ref Ownership (1 min)

**Purpose**: Ensure all identities have valid source_ref (no orphans)

**Input**: 
- atlas_packets.source_ref column
- Filesystem validation (if source_ref points to real file)

**Output Manifest**:
```json
{
  "stage": "validate_source_refs",
  "output": {
    "recordCount": 58365,
    "validSourceRefs": 58365,
    "orphanedCount": 0
  },
  "duration": 1200,
  "warnings": [],
  "failedIdentities": []
}
```

**Hard Gate**: orphanedCount must be 0 (no NULL source_refs)

### Stage 4: Parse Changed Files (Parallel by Language) (3-5 min)

**Purpose**: Extract structural facts from dirty files

**Input**: 
- Dirty file identities from Stage 2
- Language detection (file extension)

**Output Manifest**:
```json
{
  "stage": "parse_changed_files",
  "output": {
    "recordCount": 3421,
    "parsedByLanguage": {
      "typescript": 1800,
      "python": 890,
      "sql": 456,
      "css": 275
    }
  },
  "duration": 4200,
  "warnings": ["CSS parser timeout on 3 files"],
  "failedIdentities": ["src/styles/theme.css"],
  "software": { "tree-sitter": "0.20.x", "ast-grep": "0.18.x" }
}
```

**Parallelization**:
- TypeScript/TSX parser (tree-sitter)
- Python parser (tree-sitter)
- SQL parser (tree-sitter)
- CSS parser (tree-sitter)

### Stage 5: Materialize AST Facts (3-4 min)

**Purpose**: Extract symbols, definitions, imports, exports

**Input**: 
- Parsed AST from Stage 4
- atlas_packets table

**Output Manifest**:
```json
{
  "stage": "materialize_ast_facts",
  "output": {
    "recordCount": 18234,
    "packetsWithAst": 1247,
    "averageSymbolsPerPacket": 14.6,
    "symbolTypes": {
      "function": 4200,
      "class": 2100,
      "export": 3400,
      "import": 5600,
      "type_definition": 2934
    }
  },
  "duration": 3800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "tree-sitter": "0.20.x" }
}
```

**Canonical Storage**: `atlas_packets.tree_node_ids` (JSONB array of symbols)

### Stage 6: Resolve Imports/Calls/Symbol References (4-6 min)

**Purpose**: Establish directional dependency graph

**Input**: 
- AST import/call statements
- Symbol definitions from Stage 5
- Canonical packet_key registry

**Output Manifest**:
```json
{
  "stage": "resolve_symbol_references",
  "output": {
    "recordCount": 8934,
    "filesWithRefs": 1200,
    "referenceTypes": {
      "import": 5600,
      "call": 2100,
      "type_reference": 800,
      "dynamic_require": 434
    }
  },
  "duration": 5200,
  "warnings": ["1200 dynamic requires; some unresolvable at static time"],
  "failedIdentities": [],
  "software": { "reference-resolver": "1.0.x" }
}
```

**Canonical Output**: Edge list tuples: (from_packet_key, to_packet_key, edge_type, confidence)

### Stage 7: Build Canonical Directed Edge List (2-3 min)

**Purpose**: Materialize complete directed dependency graph

**Input**: 
- Reference tuples from Stage 6
- Confidence scores per edge type

**Output Manifest**:
```json
{
  "stage": "build_edge_list",
  "output": {
    "recordCount": 8934,
    "edgesBuilt": 8934,
    "edgeTypeDistribution": {
      "imports": 5600,
      "calls": 2100,
      "type_refs": 800,
      "dynamic": 434
    }
  },
  "duration": 2100,
  "warnings": [],
  "failedIdentities": []
}
```

**Canonical Store**: Neo4j relationship writes + Postgres edge_list table

### Stage 8: Validate Dangling Edges (1-2 min)

**Purpose**: Ensure no edges point to non-existent packets

**Input**: 
- Edge list from Stage 7
- atlas_packets registry

**Output Manifest**:
```json
{
  "stage": "validate_edges",
  "output": {
    "recordCount": 8934,
    "danglingEdges": 12,
    "validEdges": 8922,
    "validityRate": 0.9987
  },
  "duration": 1800,
  "warnings": ["12 dangling edges detected (likely external dependencies)"],
  "failedIdentities": ["src/lib/external-api.ts -> unknown_service"],
  "software": { "validator": "1.0.x" }
}
```

**Hard Gate**: validityRate must be ≥99.5% (optional soft grace for external deps)

### Stage 9: Derive Undirected Weighted Community Projection (3-4 min)

**Purpose**: Compute undirected community structure from directed graph

**Input**: 
- Directed edge list from Stage 7
- Edge weights (confidence/frequency)

**Output Manifest**:
```json
{
  "stage": "derive_community_projection",
  "output": {
    "recordCount": 45,
    "communitiesFound": 45,
    "largestCommunity": 1823,
    "smallestCommunity": 8,
    "averageCommunitySize": 1297
  },
  "duration": 3600,
  "warnings": [],
  "failedIdentities": [],
  "software": { "leiden_algorithm": "python-leidenalg@0.10.x" }
}
```

**Algorithm**: Leiden (undirected weighted graph clustering)

### Stage 10: Run PageRank + Leiden + Degree/Core Metrics (5-8 min)

**Purpose**: Compute all graph analytics in one pass

**Input**: 
- Undirected community projection from Stage 9
- Directed edge list from Stage 7

**Output Manifest**:
```json
{
  "stage": "compute_graph_analytics",
  "output": {
    "recordCount": 58365,
    "pageRankComputed": 58365,
    "degreeMetrics": {
      "in_degree_avg": 2.4,
      "out_degree_avg": 2.1,
      "max_degree": 847
    },
    "coreDecomposition": {
      "k_core_max": 18,
      "central_nodes": 234
    },
    "pageRankStats": {
      "max_score": 0.0087,
      "p95_score": 0.0034,
      "median_score": 0.00017
    }
  },
  "duration": 7200,
  "warnings": [],
  "failedIdentities": [],
  "software": { "pagerank": "pytorch_geometric@2.x", "cuda": "12.1" }
}
```

**GPU Acceleration**: 5-8× speedup via CUDA (PyTorch Geometric)

### Stage 11: Write Postgres Canonical Derived-Feature Rows (2-3 min)

**Purpose**: Persist all computed analytics to canonical truth store

**Input**: 
- All metrics from Stage 10
- All manifests and metadata from Stages 1-10

**Output Manifest**:
```json
{
  "stage": "write_canonical_features",
  "output": {
    "recordCount": 58365,
    "featuresWritten": 58365,
    "newRows": 1247,
    "updatedRows": 57118
  },
  "duration": 2800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "postgres": "18.4", "drizzle-orm": "0.44.x" }
}
```

**Atomic**: Single transaction per batch (1000 rows) to allow rollback

### Stage 12: Project Neo4j Topology (2-3 min)

**Purpose**: Write edge/relationship graph to Neo4j

**Input**: 
- Edge list from Stage 7
- PageRank scores from Stage 10
- Community assignments from Stage 9

**Output Manifest**:
```json
{
  "stage": "project_neo4j_topology",
  "output": {
    "recordCount": 58365,
    "topologyProjected": 58365,
    "relationshipTypes": ["IMPORTS", "CALLS", "BELONGS_TO_CLUSTER", "SIMILAR_TOPOLOGY"],
    "relationshipsWritten": 8934
  },
  "duration": 3200,
  "warnings": [],
  "failedIdentities": [],
  "software": { "neo4j": "5.x", "py2neo": "2021.2.x" }
}
```

**Parallel**: Write nodes + relationships concurrently

### Stage 13: Update Qdrant Payload Metadata (1-2 min)

**Purpose**: Enrich Qdrant vectors with latest computed metadata

**Input**: 
- codebase_chunk_index vectors
- atlas_packets metadata
- Computed features from Stage 11

**Output Manifest**:
```json
{
  "stage": "update_qdrant_metadata",
  "output": {
    "recordCount": 40568,
    "qdrantUpdated": 40568,
    "payloadFields": [
      "packet_key", "source_ref", "domain", "community_id", "page_rank",
      "degree_in", "degree_out", "k_core", "timestamp"
    ]
  },
  "duration": 1800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "qdrant": "0.11.x" }
}
```

**Payload Schema**: Every point now carries community, PageRank, degree, k-core, domain classification

### Stage 14: Invalidate Redis Cluster Caches (500ms - 1s)

**Purpose**: Clear all derived caches to force recomputation

**Input**: 
- Redis key patterns for invalidation

**Output Manifest**:
```json
{
  "stage": "invalidate_redis_caches",
  "output": {
    "recordCount": 4,
    "invalidatedPatterns": [
      "bitfrost:packet:*",
      "bitfrost:cluster:*",
      "karpathy:scores",
      "centroid:*"
    ]
  },
  "duration": 800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "ioredis": "5.x" }
}
```

**Non-Blocking**: Async invalidation, doesn't block later stages

### Stage 15: Generate Recommendations (2-3 min)

**Purpose**: Synthesize typed actionable recommendations

**Input**: 
- All computed features from Stage 11
- Graph analytics from Stage 10
- Qdrant similarity data

**Output Manifest**:
```json
{
  "stage": "generate_recommendations",
  "output": {
    "recordCount": 5837,
    "recommendationsGenerated": 5837,
    "types": {
      "missing_test": 1200,
      "dead_code": 800,
      "missing_spec": 600,
      "stale_embedding": 450,
      "high_centrality_weak_coverage": 234,
      "duplicate_helper": 189,
      "deprecated_api_caller": 145,
      "likely_implementation_neighbor": 2179
    }
  },
  "duration": 2400,
  "warnings": [],
  "failedIdentities": [],
  "software": { "gemma4-offload": "0.1.x", "rule_engine": "1.0.x" }
}
```

**Recommendation Class Breakdown**:
- **Code Recommendations** (3268): implementation neighbor, duplicate, deprecated, dead code, high-risk central, missing error handling
- **Test Recommendations** (1200): no focused test, no browser smoke, no invalid-input test
- **Spec Recommendations** (600): no governing spec, superseded spec still referenced
- **Data Recommendations** (769): missing domain, low confidence ontology, stale embedding, dangling source_ref

### Stage 16: Run Retrieval Smoke Test (2-3 min)

**Purpose**: Validate end-to-end retrieval pipeline with corpus changes

**Input**: 
- All published metadata from Stage 13
- Sample queries from test corpus

**Output Manifest**:
```json
{
  "stage": "retrieval_smoke_test",
  "output": {
    "recordCount": 5,
    "testResults": {
      "dense_search": { "passed": true, "latency_ms": 23, "results_count": 10 },
      "sparse_search": { "passed": true, "latency_ms": 15, "results_count": 8 },
      "exact_match": { "passed": true, "latency_ms": 8, "results_count": 1 },
      "ast_lookup": { "passed": true, "latency_ms": 12, "results_count": 3 },
      "graph_traversal": { "passed": true, "latency_ms": 34, "results_count": 15 }
    }
  },
  "duration": 2800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "qdrant": "0.11.x", "go-retrieval": "1.0.x", "turbovec": "1.0.x" }
}
```

**Hard Gate**: all tests must pass (no failed retrieval)

### Stage 17: Publish Evidence and Dashboard Status (500ms - 1s)

**Purpose**: Finalize DAG run and update live dashboard

**Input**: 
- All stage manifests (1-16)
- Final corpus metrics

**Output Manifest**:
```json
{
  "stage": "publish_evidence",
  "output": {
    "recordCount": 58365,
    "dashboardUpdated": true,
    "evidencePublished": true,
    "artifactCount": 17,
    "dagRunSummary": {
      "totalDuration": 1247000,
      "stagesPassed": 17,
      "stagesFailed": 0,
      "status": "SUCCESS",
      "nextRunTime": "2026-07-20T00:00:00Z"
    }
  },
  "duration": 800,
  "warnings": [],
  "failedIdentities": [],
  "software": { "dashboard": "0.1.x" }
}
```

---

## Manifest Contract

Every stage produces a JSON manifest with:

```json
{
  "stage": "stage_name",
  "timestamp": "2026-07-19T15:23:45.123Z",
  "input": {
    "recordCount": 1234,
    "hash": "sha256:...",
    "sources": ["table_name"]
  },
  "output": {
    "recordCount": 1234,
    "hash": "sha256:...",
    "artifacts": ["artifact_type"]
  },
  "duration": 2345,
  "warnings": [],
  "failedIdentities": [],
  "software": {
    "node": "v20.x",
    "postgres": "18.4",
    "custom_tool": "1.0.x"
  }
}
```

---

## Usage

### Run Complete DAG

```bash
npm run graphify:dag:concrete
```

### Dry-Run (No Side Effects)

```bash
npm run graphify:dag:concrete:dry
```

### Verbose Output with Detailed Logs

```bash
npm run graphify:dag:concrete:verbose
```

### Skip Specific Stages

```bash
node ../scripts/atlas/daily-graphify-concrete-dag.mjs --skip-stages=stage_10,stage_12
```

---

## Data Flow Diagram

```
┌─ Stage 1 (Freeze) ─────────────────────────────────────────────────┐
│  all atlas_packets + git HEAD snapshot                              │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 2 (Find Dirty) ─────────────────────────────────────────────┐
│  identify packets changed in last 24h                               │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 3 (Validate Refs) ──────────────────────────────────────────┐
│  no orphaned source_refs                                            │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 4 (Parse Files) ────────────────────────────────────────────┐
│  extract AST from dirty files (parallel by language)                │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 5 (Materialize AST) ────────────────────────────────────────┐
│  symbols, imports, exports, definitions                             │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 6 (Resolve References) ─────────────────────────────────────┐
│  map imports/calls to packets, establish confidence                 │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 7 (Build Edge List) ────────────────────────────────────────┐
│  canonical directed dependency graph                                │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 8 (Validate Edges) ─────────────────────────────────────────┐
│  no dangling edges (99.5%+ valid)                                   │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 9 (Community Projection) ───────────────────────────────────┐
│  undirected weighted clustering via Leiden                          │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 10 (Graph Analytics) ───────────────────────────────────────┐
│  PageRank + degree/k-core metrics (GPU accelerated)                 │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 11 (Write Postgres) ────────────────────────────────────────┐
│  canonical derived-feature rows (atomically)                        │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 12 (Neo4j Topology) ────────────────────────────────────────┐
│  write edges + relationships (parallel)                             │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 13 (Qdrant Metadata) ───────────────────────────────────────┐
│  enrich vectors with computed features                              │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 14 (Invalidate Cache) ──────────────────────────────────────┐
│  clear Redis cluster caches (async)                                 │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 15 (Recommendations) ───────────────────────────────────────┐
│  synthesize typed recommendations                                   │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 16 (Smoke Test) ────────────────────────────────────────────┐
│  validate retrieval pipeline (5 lanes tested)                       │
└────────────────────────────────────┬────────────────────────────────┘
                                     ↓
┌─ Stage 17 (Publish Evidence) ──────────────────────────────────────┐
│  finalize DAG run + update dashboard                                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| All stages complete | 17/17 PASS | stage status |
| No orphaned identities | 0 | failedIdentities count |
| Edge validity rate | ≥99.5% | validEdges / totalEdges |
| Retrieval smoke tests | 5/5 PASS | test results |
| Total runtime | <25 min | duration_ms |
| Manifest completeness | 100% | artifact count |

---

## Reports and Artifacts

All reports written to `docs/reports/graphify-dag/`:

- `dag-{RUN_ID}.json` — Complete DAG execution report with all stage manifests
- `dag-{RUN_ID}-FAILED.json` — If any stage failed
- `stage-{STAGE_NAME}-{RUN_ID}.json` — Individual stage manifest (future)

---

## Next Steps

1. Test dry-run: `npm run graphify:dag:concrete:dry`
2. Review report: `cat docs/reports/graphify-dag/dag-*.json | jq .`
3. Run real execution: `npm run graphify:dag:concrete`
4. Monitor Postgres/Neo4j/Qdrant for updates
5. Validate retrieval smoke tests pass
6. Review recommendations in dashboard
7. Schedule nightly cron job for automated runs

---

## Integration with Mastra Workflow

The concrete DAG can be wrapped in the Mastra workflow framework for:
- **Resume capability**: checkpoint at each stage
- **Background tasks**: run as Mastra durable task
- **SSE streaming**: live stage progress to SvelteKit dashboard
- **Branching logic**: conditional stages based on gate results
- **Approval gates**: human sign-off before irreversible stages (Stage 11 write, Stage 12 Neo4j, Stage 17 publish)

---

## References

- [DAILY-GRAPHIFY-MASTRA-WORKFLOW.md](./DAILY-GRAPHIFY-MASTRA-WORKFLOW.md) — Higher-level orchestration
- [TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md](./TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md) — Error-fixing DAG reference
- `scripts/atlas/daily-graphify-concrete-dag.mjs` — Implementation source
- `docs/reports/graphify-dag/` — Execution reports (JSON)

