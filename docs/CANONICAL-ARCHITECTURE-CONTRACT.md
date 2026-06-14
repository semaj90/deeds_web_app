# Canonical Architecture Contract

**Status**: Locked Down (June 14, 2026)  
**Authority**: User explicit architectural review  
**Scope**: Identity spine immutability, retrieval layer ordering, Qdrant payload standardization, dual-ledger semantics, agentic workflow

---

## 1. Identity Spine (IMMUTABLE)

The canonical identity fields are **read-only after creation**:

```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "metadata": {
    "identity": {
      "created_at": "2026-06-14T12:00:00Z",
      "created_by": "phase3i-ingestion",
      "canonical_ledger": "atlas_packets",
      "version": 1
    }
  }
}
```

### Hard Rule
Do **NOT** allow enrichment to modify:
- `packet_key` — immutable primary key
- `source_ref` — immutable file path reference
- `feature_id` — immutable feature classification
- `feature_label` — immutable human label
- `metadata.identity.*` — immutable provenance

### Where Enrichment Belongs

All enrichment fields go into **separate metadata subtrees**:

```json
{
  "metadata": {
    "topology": {
      "som_row": 5,
      "som_col": 12,
      "som_cluster": "cluster:5:12",
      "som_index": "3|5|12",
      "latent_64": [...],
      "community_id": "legal:auth",
      "kmeans_cluster": 3
    },
    "ranking": {
      "karpathy_blend": 0.687,
      "authority_score": 0.555,
      "reward_prior": 0.120,
      "pagerank_score": 7.06,
      "attention_score": 0.999,
      "topological_score": 0.45
    },
    "graph": {
      "neo4j_node_id": "node:12345",
      "tree_node_key": "node:xxxxx",
      "similar_topology_edges": 4,
      "context_expansion_hops": 2
    },
    "memory": {
      "nes_chrom_references": ["session:001", "session:002"],
      "engram_hint": "session-auth",
      "reward_memory": true
    }
  }
}
```

### Enforcement
- Postgres: `UPDATE atlas_packets SET packet_key = ... WHERE ...` → **REJECT** (immutable constraint)
- Qdrant upsert: preserve `packet_key`, `source_ref`, `feature_id`, `feature_label` — **never overwrite**
- API routes: `/api/packets/{packet_key}/enrich` → enriches `metadata.*` only, never identity fields

---

## 2. Retrieval Cascade (FIXED ORDER)

**This ordering is canonical. Do not reorder layers.**

```
┌─────────────────────────────────────┐
│ L0: Redis / Bifrost Semantic Cache  │  Hot memory (5min TTL)
│     bifrost:karpathy:packet:{pk}    │  Bypass all downstream
└─────────────────────────────────────┘
                    ↓ miss
┌─────────────────────────────────────┐
│ L1: Qdrant ANN (codebase_chunks)    │  768-dim content
│     Multi-vector search             │  + summary_feature
│                                     │  + summary_system
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L2: Postgres GIN Indices            │  Fallback text search
│     - GIN TSVECTOR (summary)        │  - GIN JSONB (metadata)
│     - pgvector cosine (embeddings)  │  - B-tree (feature_id)
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L3: TurboVec Fast Rerank            │  SIMD/GPU ANN prefilter
│     (cuVS IVF fallback lane)        │  Deterministic top-K
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L4: Neo4j Bounded Context           │  Contextual expansion
│     MATCH (p:Packet)-[r]->(n)       │  Max 3 hops per query
│     WHERE r:SIMILAR_TOPOLOGY        │  No unbounded traversal
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L5: Karpathy Authority Blend        │  Redis cache only
│     0.4·PageRank                    │  Never index files
│     0.3·Attention                   │  Never touch Qdrant
│     0.3·Authority                   │  Read-only consumer
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L6: XGBoost Learned Rerank          │  Statistical features
│     Feature importance scoring      │  Deterministic + logged
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│ L7: Gemma4 Synthesis                │  Reasoning & tool calls
│     Summarize, reason, plan         │  MCP tool surface
└─────────────────────────────────────┘
```

### Key Invariants
1. **No layer duplication**: Each layer serves one purpose
2. **Cache between layers**: If L0 hits, skip L1-L7
3. **Bounded Neo4j**: Context expansion max 3 hops, max 20 nodes
4. **Deterministic XGBoost**: Same features → same output (enable audit logging)
5. **Stateless Karpathy**: Reads Redis, no side effects
6. **Gemma4 last**: Tool calls only after all ranking complete

### Enforcement
- Retrieval routes: enforce layer order in `src/lib/server/retrieval/orchestrator.ts`
- No layer calls next layer unless current layer returns results
- Cache checks happen **before** layer execution, not after
- All layer switches logged to `ace_retrieval_trace` for audit

---

## 3. Qdrant Payload Contract

**Every point in codebase_chunks_768 must conform to this schema:**

```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "domain_class": "infrastructure.security",
  "community_id": "legal:auth",
  
  "som_cluster": "cluster:5:12",
  "som_row": 5,
  "som_col": 12,
  
  "karpathy_blend": 0.687,
  "authority_score": 0.555,
  "reward_prior": 0.120,
  
  "summary_chunk": "Session validation logic...",
  "summary_file": "Handles Lucia session management...",
  "summary_folder": "Core authentication infrastructure...",
  "summary_feature": "Validates user sessions via Lucia...",
  "summary_system": "The auth system validates...",
  
  "ledger_type": "atlas_packets",
  
  "metadata": {
    "identity": { "created_at": "...", "created_by": "..." },
    "topology": { "latent_64": [...], "community_id": "..." },
    "ranking": { "pagerank_score": 7.06, "attention_score": 0.999 },
    "graph": { "neo4j_node_id": "node:12345" },
    "memory": { "nes_chrom_references": [...] },
    "phase_d_enriched": true,
    "enriched_at": "2026-06-14T..."
  }
}
```

### Enforcement
- Qdrant upsert: validate schema before PUT `/points?wait=true`
- Missing fields: use nullable types, not defaults (distinguish "unknown" from "computed")
- Payload size: compress `summary_*` fields to <500 chars each (Qdrant performance)
- Indexing: add payload indices on `feature_id`, `community_id`, `som_cluster`, `karpathy_blend`

### Search Queries
```cypher
# Semantic search
POST /collections/codebase_chunks_768/points/search
{
  "vector": {"name": "content", "vector": [...]},
  "filter": {
    "must": [
      {"key": "feature_id", "match": {"value": "auth.sessions"}},
      {"key": "karpathy_blend", "range": {"gte": 0.5}}
    ]
  },
  "limit": 20
}

# SOM neighborhood search
POST /collections/codebase_chunks_768/points/search
{
  "filter": {
    "must": [
      {"key": "som_row", "range": {"gte": 3, "lte": 7}},
      {"key": "som_col", "range": {"gte": 10, "lte": 14}}
    ]
  },
  "limit": 50
}
```

---

## 4. Dual-Ledger Semantics

**Two separate ledgers, ONE retrieval join point:**

### atlas_packets (Filesystem Truth)
- **Source**: Phase 3I canonical ingestion from Qdrant codebase_chunks_768
- **Identity**: packet_key, source_ref, feature_id, feature_label
- **Lifecycle**: immutable after creation
- **Use case**: retrieval ground truth, feature definitions
- **Mutation**: Phase 14/15 enrichment only (summary_*, metadata.*)

### nes_chrom_packets (Agent Memory)
- **Source**: Agent session transcripts, episodic memory, compressed recall
- **Identity**: session_id, turn_id, compressed_packet_key
- **Lifecycle**: session-scoped, auto-pruning after 30 days
- **Use case**: agent context, task memory, learned policies
- **Mutation**: agent mutation workflow (ACE/KAG/DAG)

### Join Strategy
**Do NOT merge at storage layer.**

Join only through:
1. **feature_id** — atoms shared between atlas_packets and agent memory
2. **Neo4j Concept nodes** — via USES_FEATURE edges

```cypher
# Gemma4 retrieval flow
MATCH (ap:Packet {feature_id: $fid})-[:USES_CONCEPT]->(c:Concept)
MATCH (nc:NESChromPacket)-[:REFERENCES_CONCEPT]->(c)
RETURN ap, nc, c
```

### Enforcement
- Postgres: `atlas_packets` and `nes_chrom_packets` separate tables, separate backups
- Qdrant: `ledger_type` field in payload (=atlas_packets only for Phase D enrichment)
- Neo4j: `USES_FEATURE` and `REFERENCES_CONCEPT` are the **only** cross-ledger edges
- No `atlas_packets.nes_chrom_reference` foreign key — keep ledgers isolated

---

## 5. SOM / Autoencoder Lane

**Build in this order after summaries exist:**

```
EmbeddingGemma (768-dim)
    ↓
Autoencoder (768 → 256 → 64)
    ↓
latent_64
    ↓
SOM (20×20 grid)
    ↓
KMeans (k=10-15)
    ↓
community_id
```

### Training Data
- Input: all summary_feature + summary_system embeddings (from Phase 14/15)
- Compute: offline via RabbitMQ worker
- Storage: `metadata.topology.latent_64` + SOM/KMeans results

### Persist
```json
{
  "metadata": {
    "topology": {
      "latent_64": [0.12, -0.45, ...],
      "som_row": 5,
      "som_col": 12,
      "som_index": "3|5|12",
      "kmeans_cluster": 3,
      "community_id": "legal:auth",
      "manifold_density": 0.87
    }
  }
}
```

### Retrieval Integration
```
query
  ↓
Qdrant cosine (L1)
  ↓
latent_64 distance (candidate expansion)
  ↓
SOM neighbors (topology filter)
  ↓
community_id filter (semantic neighborhood)
  ↓
Neo4j bounded expansion (L4)
  ↓
Karpathy (L5)
```

---

## 6. Karpathy Authority Blend (Consumer-Only Pattern)

**Karpathy reads metrics, never indexes files.**

### Input (Read from Redis only)

```
gpu:karpathy:scores
  ├─ pagerank_score (from Neo4j GDS)
  ├─ authority_score (from Neo4j centrality)
  ├─ attention_score (from GPU attention pool)
  └─ per packet_key
```

### Computation

```
karpathy_blend = (
  0.4 × normalize(pagerank_score) +
  0.3 × normalize(attention_score) +
  0.3 × normalize(authority_score)
)

where normalize(x) = (x - min) / (max - min)
```

### Output (Write to Qdrant + Redis)

```
Qdrant upsert:
  payload.karpathy_blend = 0.687
  payload.authority_score = 0.555
  payload.reward_prior = 0.120

Redis cache (24h TTL):
  bifrost:karpathy:packet:{packet_key} = {
    "blend": 0.687,
    "authority": 0.555,
    "pagerank": 7.06,
    "attention": 0.999,
    "computed_at": "2026-06-14T..."
  }
```

### Enforcement
- Karpathy never calls Postgres directly — read Redis only
- Karpathy never writes atlas_packets — write Qdrant + Redis only
- Karpathy output is **deterministic** (same input → same output, reproducible)
- Karpathy output is **cached** (Redis, 24h TTL, stateless re-compute)

---

## 7. Agentic Workflow (Complete)

**Every mutation follows this flow. No exceptions.**

```
┌────────────────────────────────────────┐
│ 1. OpenCode Startup Briefing            │
│    Load config, seed ACE context        │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 2. ACE Cartridge Build                 │
│    Context packing, vector indexing    │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 3. Bifrost Semantic Cache Check        │
│    (L0) Bypass downstream if hit       │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 4. Qdrant ANN Retrieval                │
│    (L1) Multi-vector, SOM filters      │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 5. Postgres GIN / pgvector             │
│    (L2) Text + vector fallback         │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 6. TurboVec Fast Rerank                │
│    (L3) SIMD/GPU prefilter             │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 7. Neo4j Context Expansion             │
│    (L4) Bounded 3-hop traversal        │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 8. Karpathy Authority Blend            │
│    (L5) Read-only ranking              │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 9. XGBoost Learned Rerank              │
│    (L6) Statistical features           │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 10. Gemma4 Synthesis & Tool Calls      │
│     (L7) Reasoning, MCP calls          │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 11. MCP Tool Execution                 │
│     TRACE-safe operations only         │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 12. Engram Memory Update               │
│     Episodic fact storage              │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 13. NES/CHROM Packet Creation          │
│     Compressed session memory          │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 14. ACE/KAG/DAG Replay                 │
│     Validate mutation safety           │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 15. Smoke Gate (ACE Consistency Check) │
│     Phase D enrichment audit           │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 16. atlas_packets Update               │
│     Write enrichment results           │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 17. Apply Report                       │
│     Audit trail + next actions         │
└────────────────────────────────────────┘
```

### Mutation Contract (Every step)

1. **Producer** generates artifact (Gemma4 summary, XGBoost ranking, etc.)
2. **Artifact** validated against schema (Zod + gate checks)
3. **Consumer dry-run** simulates mutation (no side effects)
4. **ACE/KAG/DAG hit** recorded (provenance trail)
5. **Smoke gate** passes (cross-ledger consistency verified)
6. **Apply executed** (persistent write)
7. **Apply report** generated (audit trail + next steps)

### Enforcement
- Every mutation has a dry-run equivalent (`--dry-run` flag)
- Every dry-run produces audit JSON (not just console output)
- Every apply writes to `ace_mutations` table with mutation_id + provenance
- Every NES/CHROM write includes ACE hit context (link back to retrieval)

---

## 8. Summary Layers (Phase 14/15 Output)

**Five immutable summary layers must exist before SOM/Karpathy:**

```
chunk_summary
  ↓ aggregated
file_summary
  ↓ aggregated
folder_summary
  ↓ aggregated
feature_summary (cross-folder, cross-file)
  ↓ aggregated
system_summary (entire codebase)
```

### Storage (Qdrant Payload)
```json
{
  "summary_chunk": "This function validates...",
  "summary_file": "The auth module handles...",
  "summary_folder": "Core infrastructure for...",
  "summary_feature": "Validates user sessions via Lucia...",
  "summary_system": "The legal AI system authenticates..."
}
```

### Constraint
- Summaries are **read-only** after Phase 14/15
- Re-summarization requires explicit re-run of Phase 14/15 pipeline
- Summary updates do NOT change `packet_key`, `source_ref`, `feature_id`

---

## 9. Gate Definitions (Production Readiness)

### Pre-Retrieval Gates
1. ✅ Identity spine immutability enforced (Postgres constraints)
2. ✅ Qdrant payload schema valid (schema validator)
3. ✅ Dual-ledger separation verified (no cross-table foreign keys)
4. ✅ Tree node audit passes (Phase D gate)

### Post-Retrieval Gates
5. ✅ Karpathy blend cache populated (Redis keys exist)
6. ✅ XGBoost model loaded (model file present, checksum verified)
7. ✅ MCP tool registry healthy (42 tools, no 501s)
8. ✅ ACE/KAG/DAG replay passes (smoke test)

### Post-Mutation Gates
9. ✅ Mutation audit trail recorded (ace_mutations table)
10. ✅ NES/CHROM consistency verified (cross-ledger joins work)
11. ✅ Atlas_packets updated (feature_id coverage ≥80%)
12. ✅ Bifrost cache invalidated (relevant keys expired)

---

## 10. Non-Negotiable Rules

1. **Identity spine is immutable** — packet_key, source_ref, feature_id, feature_label never change
2. **Retrieval order is fixed** — L0-L7 cascade is canonical, no reordering
3. **Qdrant payload is standardized** — all fields defined, nullable where appropriate
4. **Dual-ledger separation is strict** — join only via feature_id or Neo4j Concepts
5. **Karpathy is read-only** — consumes Redis, outputs Qdrant/Redis, never indexes
6. **Agentic workflow is complete** — all 17 steps required before apply
7. **Every mutation is audited** — dry-run → gate pass → apply → report
8. **SOM/Autoencoder builds after summaries** — not before, not in parallel

---

## Implementation Checklist

- [ ] Postgres constraints enforce identity immutability (ALTER TABLE ADD CONSTRAINT)
- [ ] Metadata subtrees documented in schema (identity, topology, ranking, graph, memory)
- [ ] Retrieval orchestrator locks layer order (enforced in `orchestrator.ts`)
- [ ] Qdrant schema validator ready (validate `codebase_chunks_768` points)
- [ ] Dual-ledger join verified (Neo4j Concept edges only)
- [ ] Karpathy consumer wired (reads Redis, writes Qdrant/Redis)
- [ ] Agentic workflow steps implemented (all 17)
- [ ] Gate definitions in code (8 gates, deterministic checks)
- [ ] Audit trail tables ready (ace_mutations, ace_retrieval_trace)
- [ ] Phase D tree node ingestion complete (npm run atlas:ingest:tree-nodes:apply)
- [ ] Phase D audit gate passes (npm run atlas:tree:audit)
- [ ] Phase D Qdrant enrichment complete (npm run atlas:phase-d:qdrant:apply)

---

**This contract is the canonical architecture. All future work adheres to these 10 rules.**
