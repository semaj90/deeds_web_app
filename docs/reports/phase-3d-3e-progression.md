# Phase 3D → 3E Progression: Telemetry + Registry

**Status**: Phase 3D Active, Phase 3E Ready  
**Updated**: 2026-06-11  
**Bottleneck Analysis**: Observability & Lineage (not retrieval performance)

---

## The Strategic Shift

**Previous bottleneck**: Retrieval performance (solved by Phase 3A, 3B, 3C)  
**Current bottleneck**: Proving exactly WHY a packet was retrieved

The three-tier architecture solves retrieval speed. Now we need observability:
- Where did the packet come from?
- Which feature owns it?
- How can it be reconstructed from source_ref → feature_id → packet_key → card_id?

---

## Phase 3D: Retrieval Telemetry (ACTIVE)

**Goal**: Capture behavioral evidence for every retrieval

### Telemetry Fields

```typescript
{
  query: string;
  query_hash: string;           // SHA-256(query)
  retrieval_strategy: string;   // CRITICAL: vector_only | lexical_only | structural_only | fusion | cold_neschrom
  vector_hits: number;
  trigram_hits: number;
  fts_hits: number;
  fusion_score: number;
  selected_packet_key: string;
  selected_feature_id: string;
  latency_ms: number;
  cache_hit: boolean;
  surface: string;               // vscode, opencode, codex, ci
  environment: string;
}
```

### Most Important Field

**`retrieval_strategy`** — This ONE field drives most future optimization:

- `vector_only` → Dense Qdrant (768-dim embeddings)
- `lexical_only` → pg_trgm (trigram search)
- `structural_only` → JSONB payload queries
- `fusion` → Weighted combination (Phase 3B)
- `cold_neschrom` → NESCHROM97 registry fallback

### Instrumentation Points

1. **ACE Context Assembler** (`context-assembler.ts`)
   - Record after packet ranking
   - Capture strategy decision point
   - Emit on every retrieval

2. **Hybrid Search** (`hybrid-search.ts`)
   - Record hit counts per lane
   - Track latency breakdown
   - Emit strategy used

3. **RAG Pipeline** (`rag-pipeline.ts`)
   - Record fusion_score (weighted blend)
   - Track cache_hit (L1/L2/miss)
   - Emit complete signal

### Success Criteria (3D)

- [x] Schema wired in `retrieval-recorder.ts`
- [ ] Instrumentation complete (3 points)
- [ ] >1,000 queries captured
- [ ] Behavioral temperature visible (HOT/WARM/COLD)
- [ ] Surface breakdown (vscode vs opencode vs ci)

**Timeline**: 1-2 weeks

---

## Phase 3E: NESCHROM97 Registry (READY)

**Goal**: Build a replay index, not just a lookup table

### Current State (v2.0)

```json
{
  "metadata": {
    "schema_version": "2.0",
    "card_store_size": 8170,
    "mapped_count": 30,
    "mapped_percentage": "0.4",
    "mapped_packet_keys": 30,
    "mapped_feature_ids": 30,
    "mapped_source_refs": 30,
    "unresolved_cards": 8140,
    "duplicate_cards": 0,
    "orphan_cards": 8140,
    "temperature_distribution": {
      "hot": 19,
      "warm": 11,
      "cool": 0,
      "cold": 8140
    }
  },
  "mappings": [
    {
      "card_id": "...",
      "packet_key": null,                    // TBD: Postgres
      "feature_id": "graph-intelligence",    // From packet
      "source_ref": "src/lib/server/gpu/libtorch-bridge.ts",
      "source_refs": [                       // Full chain
        "src/routes/api/graph/som-topology/+server.ts",
        "src/lib/server/gpu/libtorch-bridge.ts",
        "scripts/run-hypergraph.ts"
      ],
      "directory_path": "src/lib/server/gpu",
      "card_hash": "...",
      "card_path": "src/lib/server/gpu/libtorch-bridge.ts",
      "som_cluster": 3,
      "community_id": null,                  // TBD: Neo4j
      "qdrant_point_id": null,               // TBD: Qdrant
      "retrieval_temperature": "hot",        // Inferred from reward
      "reward": "0.9",
      "latency_ms": 4200,
      "match_confidence": 0.5
    }
  ]
}
```

### Deliverables (3E)

1. **Registry JSON** (`docs/reports/neschrom97-card-registry.json`)
   - 8,170 mappings, fully fleshed
   - Size: 7.33 MB (commit-safe)
   - Status: ✅ READY

2. **Registry Summary** (`docs/reports/neschrom97-card-registry-summary.md`)
   - Narrative analysis
   - Orphan card breakdown
   - Top features by temperature
   - Status: 🔧 TODO

### Hard Rules (3E)

- ✅ **Read-only** — no mutations
- ✅ **No backfills** — accept orphan_cards as-is
- ✅ **No packet rewrites** — registry is evidence only
- ✅ **No ingestion** — registry is the gate (verify before Qdrant/Neo4j)

### Success Criteria (3E)

- [x] Registry built (8,170 mappings)
- [x] Quality metrics computed (orphan_cards, temperature_distribution)
- [ ] Summary report generated
- [ ] Narrow smoke test passes (6/6 PASS)

**Timeline**: 1 week (parallel with 3D)

---

## Phase 3F: Qdrant Tag Enrichment (READY)

**Goal**: Add metadata filters without touching embeddings

### Payload Enhancement

For each point in `codebase_chunks_768`, add to metadata:

```json
{
  "surface": "neschrom97",
  "card_id": "00f40d2dcdb83d70",
  "packet_key": "pkt:graph-intelligence:som-topology",
  "feature_id": "graph-intelligence",
  "directory_path": "sveltekit-frontend/src/lib/server/gpu",
  "temperature": "hot"
}
```

### Benefits

- **Semantic search** + **metadata filters** (no embedding change)
- **Temperature-aware retrieval** (prioritize hot, deprioritize cold)
- **Feature-scoped queries** (retrieve only packets for feature X)
- **Surface filtering** (NESCHROM97 cold layer explicitly marked)

### Implementation

1. Load registry (7.33 MB, fast)
2. Iterate Qdrant points (batch query)
3. Match card_id in registry
4. Merge metadata fields
5. Upsert back to Qdrant

**Timeline**: 1 week (after 3E registry verified)

---

## Phase 3G: Neo4j Lineage Graph (READY)

**Goal**: Enable traversal instead of brute-force joins

### Edge Structure

```cypher
(:NesChromCard {card_id: "00f40d2dcdb83d70"})
  -[:MATERIALIZES]->
(:Packet {feature_id: "graph-intelligence"})
  -[:DERIVED_FROM]->
(:SourceRef {path: "src/lib/server/gpu/libtorch-bridge.ts"})
  -[:BELONGS_TO]->
(:Feature {feature_id: "graph-intelligence"})
  -[:IN_DIRECTORY]->
(:Directory {path: "src/lib/server/gpu"})
  -[:IN_COMMUNITY]->
(:Community {community_id: "cluster:graph-analysis"})
```

### Traversal Patterns

```cypher
// Find cold card evidence for a feature
MATCH (card:NesChromCard)-[:MATERIALIZES]->(p:Packet {feature_id: $feature})
WHERE p.temperature = "cold"
RETURN card, p

// Reconstruct feature lineage
MATCH (card:NesChromCard)-[:MATERIALIZES]->(p:Packet)-[:DERIVED_FROM]->(s:SourceRef)
RETURN card.card_id, p.feature_id, s.path

// Find all features in a community (for grouped retrieval)
MATCH (d:Directory)-[:IN_COMMUNITY]->(c:Community),
      (f:Feature)-[:IN_DIRECTORY]->(d)
RETURN f.feature_id, c.community_id
```

### Timeline

1. Load registry (7.33 MB)
2. Create `:NesChromCard` nodes (8,170)
3. Create `:MATERIALIZES` edges (30 mapped + 8,140 orphan pointers)
4. Create `:DERIVED_FROM` edges (from source_refs[])
5. Validate completeness

**Timeline**: 1 week (after 3F Qdrant enrichment)

---

## Phase 3H: Lifecycle Automation (READY)

**Goal**: Auto-manage HOT/WARM/COLD tiers

### Cold Storage Policy

```sql
-- Identify COLD packets (0 retrievals in 30 days)
SELECT DISTINCT packet_key
FROM retrieval_telemetry
WHERE selected_packet_key IS NOT NULL
  AND created_at > NOW() - INTERVAL '30 days'
EXCEPT
SELECT DISTINCT packet_key
FROM retrieval_telemetry
WHERE created_at > NOW() - INTERVAL '30 days';

-- Archive to SeaweedFS with manifest
INSERT INTO seaweedfs_manifest (packet_key, archive_path, created_at)
VALUES ($1, $2, NOW());
```

### Promotion Flow

1. **3D (1-2 weeks)**: Collect telemetry (behavioral evidence)
2. **3E (1 week)**: Build registry (structural mapping)
3. **3F (1 week)**: Enrich Qdrant (metadata filters)
4. **3G (1 week)**: Create Neo4j edges (lineage)
5. **3H (1 week)**: Auto-promote COLD to SeaweedFS (lifecycle)

---

## The Three-Tier Architecture (Complete)

| Tier | Layer | Source | Query Pattern | Purpose |
|------|-------|--------|----------------|---------|
| **HOT** | Postgres + Qdrant | retrieval_telemetry | Semantic + behavioral | Active, fast-changing packets |
| **WARM** | NES packet ledger + Neo4j | feature registry + topology maps | Graph traversal + joins | Curated, feature-mapped packets |
| **COLD** | neschrom97/cards + SeaweedFS | historical reports + manifests | Registry replay + archive | Structural evidence, lineage reconstruction |

---

## Current Status

**Exit Criteria for Phase 3C** (all ✅):
- [x] Directory topology (10,951 mappings)
- [x] Hidden surface registry (5 layers)
- [x] Packet temperature classification (9,484 HOT / 427 WARM / 0 COLD)
- [x] SeaweedFS manifest ready
- [x] Identity spine complete (directory_path → source_ref → feature_id → som_cluster)

**Phase 3D Progress** (in progress):
- [x] Telemetry schema wired
- [ ] ACE context assembler instrumented
- [ ] Hybrid search instrumented
- [ ] RAG pipeline instrumented
- [ ] >1,000 queries captured

**Phase 3E Progress** (ready):
- [x] Registry v2.0 built (8,170 mappings)
- [x] Quality metrics computed
- [x] Smoke tests pass (6/6)
- [x] Commit-safe output (7.33 MB)
- [ ] Summary report

---

## The Observability Gap

Current state: **Retrieval works, but WHY it works is opaque.**

Phase 3D → 3E closure:

```
Query: "ui component error handling"
  ↓
[3D Telemetry] vector_only hit: 12 matches
  ↓
[3E Registry] card_id: 00f40d2dcdb83d70 → feature_id: error-analysis
  ↓
[3F Qdrant Tags] temperature: hot, packet_key: pkt:error-analysis:v2
  ↓
[3G Neo4j] Feature → SourceRef → Directory → Community
  ↓
[3H Lifecycle] Promote COLD to SeaweedFS if unused in 30 days
  ↓
Complete lineage chain visible in logs/traces
```

---

## Action Items

### This Sprint (3D + 3E)

1. **Instrument ACE, hybrid-search, RAG pipeline** (3D)
2. **Generate neschrom97-card-registry-summary.md** (3E)
3. **Deploy telemetry → run >1,000 queries** (3D)
4. **Validate registry matches reality** (3E)

### Next Sprint (3F + 3G + 3H)

1. **Enrich Qdrant with registry metadata** (3F)
2. **Wire Neo4j lineage edges** (3G)
3. **Implement cold storage promotion** (3H)
4. **Unified retrieval trace output** (all phases)

---

## Why This Order Matters

- **3D first**: Telemetry informs policy (can't optimize what you don't measure)
- **3E second**: Registry validates telemetry (structural + behavioral evidence)
- **3F third**: Qdrant filters accelerate cold queries (metadata without re-embedding)
- **3G fourth**: Neo4j edges replace expensive joins (graph speed > SQL speed)
- **3H fifth**: Automation completes the cycle (observe → optimize → promote)

**No phase skips.** Each phase builds observability incrementally.

---

**Next: Instrument Phase 3D retrieval points and collect baseline telemetry.**
