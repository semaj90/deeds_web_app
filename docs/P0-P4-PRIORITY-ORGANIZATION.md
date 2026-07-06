# P0–P4 Priority File Organization & Feature-Tracking Layer

**Status**: Audit complete, reorganization blueprint ready  
**Date**: July 5, 2026  
**Goal**: Wire missing feature-tracking layer into canonical identity contract (packet_key, source_ref, feature_id, qdrant_point_id, som_cluster, community_id, ontology_label, topology_label, retrieval_strategy)

---

## The Problem: Field Parity Mismatch

**Current State**:
- Postgres: 58,304 atlas_packets with identity fields (packet_key, source_ref, feature_id)
- Qdrant: 40,568 codebase_chunks_768 points with partial metadata
- Neo4j: Topology vertices without canonical identity bridge
- Missing: Unified searchable field set across all three stores

**Consequence**: Retrieval fusion (RRF, MMR, E2B reranking) can't correlate results across Postgres/Qdrant/Neo4j without manual joining.

**Solution**: Feature-tracking layer materializes a canonical subset of fields (9 core + 2 derived) that every store exposes consistently.

---

## P0: Identity & Provenance (Canonical Source of Truth)

### Core Files (MUST READ FIRST)

**1. `packages/atlas-core/src/packet/identity.ts`**
- Type definitions for packet identity (packet_key, source_ref, feature_id, etc.)
- Read this to understand canonical shape
- Status: Likely exists but needs audit for completeness

**2. `packages/atlas-core/src/langgraph/worker.ts`**
- LangGraph orchestrator that calls identity-aware tools
- Verifies packet_key before any operation
- Status: Wired but may lack feature-tracking integration

**3. `packages/atlas-core/src/tools/acp-tool-contracts.ts`**
- MCP tool signatures that all ACP callables must satisfy
- Defines what "canonical packet" looks like to the agent
- Status: Likely incomplete (missing feature_tracking fields)

**4. `scripts/atlas/audit-acp-gpu-readiness.mjs`**
- Validates that GPU + ACP services have identical identity views
- Smoke gate for orchestration readiness
- Status: Exists, but audit scope may not include feature-tracking

### What Needs Wiring

```typescript
// CANONICAL IDENTITY SHAPE (must exist in ALL stores)
interface CanonicalPacket {
  // Core identity (immutable)
  packet_key: string;          // 'ace:packet:auth:001'
  source_ref: string;          // 'src/lib/server/auth.ts'
  feature_id: string;          // 'auth.sessions'
  
  // Derived identity (computed once, immutable)
  tree_node_id: UUID;          // From codebase AST
  domain_class: string;        // From Phase 1
  title_id: UUID;              // From Phase 1
  
  // Topology layer (Phase 2A output)
  topolog_cluster: number;     // 0-15 (K-means result)
  som_cluster?: number;        // SOM grid cell (Phase 3)
  community_id?: number;       // Louvain community (Phase 3)
  
  // Retrieval metadata (computed per query)
  qdrant_point_id?: string;    // Qdrant point UUID
  retrieval_strategy?: string; // 'dense_qdrant' | 'sparse_bm25' | 'topology_neo4j'
  ontology_label?: string;     // From Neo4j or Qdrant payload
  
  // Provenance
  embedding_model: string;     // 'embeddinggemma:latest'
  embedding_dim: number;       // 384 (canonical)
  created_at: ISO8601;
  updated_at: ISO8601;
}
```

### Action Items (P0)

- [ ] **Audit `identity.ts`** — Verify canonical shape includes all 11 fields above
- [ ] **Extend `acp-tool-contracts.ts`** — Add `retrieval_strategy`, `topolog_cluster`, `som_cluster`, `community_id` to contract
- [ ] **Wire `worker.ts`** — Verify worker loads full canonical packet before routing to MCP tools
- [ ] **Create `feature-tracking-layer.ts`** (NEW) — Provides unified getter `getCanonicalPacket(packet_key)` that:
  - Reads from Postgres (truth layer)
  - Enriches from Qdrant payload (topology labels)
  - Enriches from Neo4j (community_id, ontology_label)
  - Returns consistent shape across all call sites

---

## P1: Retrieval Fusion & Signal Integration

### Core Files (Read After P0)

**1. `src/lib/server/retrieval/query-eval-types.ts`**
- Type definitions for query evaluation (retrieval context, ranking signals, etc.)
- Should define the 6-signal blend (dense, fts, trigram, ast, postgres, freshness)
- Status: Likely missing `topolog_cluster` signal, community-weighted signals

**2. `src/lib/server/retrieval/go-retrieval-client.ts`**
- Client for Go retrieval service (:8100 or :8096)
- Handles embedding, ANN search, RRF fusion
- Status: Wired but may lack feature-tracking correlation

**3. `src/lib/server/grpc/retrieval-client.ts`**
- gRPC fallback for Go retrieval service
- Status: Exists, but check if it populates feature_tracking fields

**4. `src/lib/server/retrieval/rrf-integration.ts`**
- Implements Reciprocal Rank Fusion across 6 signals
- Must normalize signals to [0, 1] before blending
- Status: Core logic wired, but signals may not include topology/community

### What Needs Wiring

```typescript
// RETRIEVAL SIGNAL BLEND (6 signals → 1 score)
interface RetrievalSignals {
  dense_qdrant: number;        // Qdrant cosine similarity [0, 1]
  fts_bm25: number;            // Postgres BM25 score [0, 1]
  trigram_similarity: number;  // Postgres trigram [0, 1]
  ast_jsonb: number;           // JSONB ast_symbols match [0, 1]
  postgres_rank: number;       // Postgres native rank [0, 1]
  freshness_boost: number;     // recency multiplier [0, 1]
  
  // NEW: Topology-aware signals
  topolog_cluster_match: number;    // [0, 1] if same cluster as query origin
  community_authority: number;      // PageRank within community
  embedding_confidence: number;     // ae_quality_score or Qdrant confidence
}

// RRF Blend Weights (tunable per lane)
const RRF_WEIGHTS = {
  dense_qdrant: 0.30,
  fts_bm25: 0.20,
  trigram: 0.20,
  ast_jsonb: 0.15,
  postgres_rank: 0.10,
  freshness: 0.05,
  
  // NEW topology weights
  topolog_cluster_match: +0.05,     // Bonus for same cluster
  community_authority: +0.03        // Bonus for high PageRank within community
};
```

### Action Items (P1)

- [ ] **Extend `query-eval-types.ts`** — Add topology/community signals to RetrievalContext
- [ ] **Wire `rrf-integration.ts`** — Accept topolog_cluster + community_id in RRF blend
- [ ] **Update `go-retrieval-client.ts`** — Request qdrant_point_id + payload from Go service
- [ ] **Create `signal-normalizer.ts`** (NEW) — Normalize each signal to [0, 1] before blending
- [ ] **Integration test** — RRF blend produces consistent ordering across Postgres + Qdrant + Neo4j

---

## P2: Qdrant / Postgres Parity

### Core Files (Read After P1)

**1. `scripts/atlas/qdrant-payload-contract-repair.mjs`**
- Ensures Qdrant payload includes source_ref, feature_id, packet_key
- May also fix domain_class, tree_node_id, topology fields
- Status: Likely incomplete (missing topolog_cluster, som_cluster, community_id in payload)

**2. `scripts/atlas/backfill-packets-to-qdrant.mjs`**
- Bulk upsert of Postgres packets into Qdrant
- Status: Works for base identity, needs feature-tracking fields

**3. `scripts/atlas/audit-som-identity-cross-store.mjs`**
- Validates SOM coordinates consistent across Postgres, Qdrant, Neo4j
- Status: Needs to also audit topolog_cluster, community_id

### What Needs Wiring

```yaml
# QDRANT PAYLOAD SCHEMA (must match Postgres)
codebase_chunks_768:
  payload_schema:
    # Identity (matches atlas_packets)
    packet_key: Keyword
    source_ref: Keyword
    feature_id: Keyword
    tree_node_id: UUID
    domain_class: Keyword
    title_id: UUID
    
    # Topology (Phase 2A → 3 output)
    topolog_cluster: Integer          # NEW
    topolog_confidence: Float         # NEW
    som_cluster: Integer              # Phase 3
    som_row: Integer                  # Phase 3
    som_col: Integer                  # Phase 3
    
    # Community (Phase 3, Louvain)
    community_id: Integer             # NEW (Phase 3)
    community_authority: Float        # NEW (PageRank within community)
    
    # Retrieval hints
    embedding_model: Keyword
    embedding_dim: Integer
    retrieval_strategy: Keyword       # NEW
    ontology_label: Keyword           # NEW
    
    # Audit
    created_at: DateTime
    updated_at: DateTime
    
  named_vectors:
    content:          # 384-dim (primary)
      size: 384
      distance: Cosine
    signature:        # Sparse metadata filter
      size: 32
      distance: Cosine
```

### Action Items (P2)

- [ ] **Extend `qdrant-payload-contract-repair.mjs`** — Add topolog_cluster, som_cluster, community_id to repair checklist
- [ ] **Update `backfill-packets-to-qdrant.mjs`** — Include feature-tracking fields in payload
- [ ] **Extend `audit-som-identity-cross-store.mjs`** — Validate topolog_cluster, community_id across stores
- [ ] **Create `verify-qdrant-postgres-parity.mjs`** (NEW) — Audit script that:
  - Samples 1000 packets from Postgres
  - Queries Qdrant for each (by packet_key)
  - Compares 11 canonical fields (packet_key through embedding_dim)
  - Reports mismatches (field X differs in Y packets)
  - Non-blocking (logs warnings, doesn't fail)

---

## P3: Graph & Topology Integration

### Core Files (Read After P2)

**1. `scripts/atlas/ingest-topology-to-neo4j.mjs`**
- Materializes packet → topology relationships in Neo4j
- Status: May lack som_cluster, community_id relationships

**2. `scripts/atlas/neo4j-phase2-relationships-fixed.mjs`**
- Fixes broken edge definitions (e.g., dangling BELONGS_TO_TOPOLOGY_CLUSTER)
- Status: Likely outdated; needs to include Phase 3 edges

**3. `scripts/atlas/backfill-neo4j-packet-som-from-canonical.mjs`**
- Syncs SOM coordinates from Postgres → Neo4j nodes
- Status: Partial (only SOM, missing topolog_cluster + community_id)

### What Needs Wiring

```cypher
// CANONICAL NEO4J SCHEMA (must match Postgres identity)

// Nodes
(:Packet {
  packet_key: 'ace:packet:auth:001',
  source_ref: 'src/lib/server/auth.ts',
  feature_id: 'auth.sessions',
  tree_node_id: UUID,
  domain_class: 'error_handling',
  title_id: UUID,
  topolog_cluster: 7,
  som_cluster: 42,
  community_id: 15,
  created_at: ISO8601
})

// Phase 2A: Topological clustering
(p:Packet)-[:BELONGS_TO_TOPOLOGY_CLUSTER {weight: 0.82}]->(tc:TopologyCluster {cluster_id: 7})

// Phase 3: SOM topology
(p:Packet)-[:BELONGS_TO_SOM_CELL {row: 5, col: 8}]->(sc:SOMCell {cluster_id: 42})

// Phase 3: Community (Louvain)
(p:Packet)-[:BELONGS_TO_COMMUNITY {authority: 0.67}]->(c:Community {community_id: 15})

// Cross-packet similarity (higher-hop)
(p1:Packet)-[:SIMILAR_TOPOLOGY {distance: 0.15}]->(p2:Packet)
(p1:Packet)-[:SHARED_COMMUNITY {weight: 0.89}]->(p2:Packet)

// Indexes (for fast lookup)
CREATE INDEX packet_key_idx ON Packet(packet_key);
CREATE INDEX topolog_cluster_idx ON Packet(topolog_cluster);
CREATE INDEX community_id_idx ON Packet(community_id);
CREATE INDEX som_cluster_idx ON Packet(som_cluster);
```

### Action Items (P3)

- [ ] **Extend `ingest-topology-to-neo4j.mjs`** — Add topolog_cluster, som_cluster, community_id nodes + edges
- [ ] **Update `neo4j-phase2-relationships-fixed.mjs`** — Fix BELONGS_TO_TOPOLOGY_CLUSTER + add BELONGS_TO_COMMUNITY edges
- [ ] **Extend `backfill-neo4j-packet-som-from-canonical.mjs`** — Also backfill topolog_cluster, community_id from Postgres
- [ ] **Create `verify-neo4j-postgres-parity.mjs`** (NEW) — Audit script that:
  - Samples 1000 packets from Neo4j
  - Compares canonical fields with Postgres
  - Validates edge counts (BELONGS_TO_TOPOLOGY_CLUSTER, BELONGS_TO_COMMUNITY)
  - Reports edge imbalance (e.g., missing BELONGS_TO_COMMUNITY for topolog_cluster=5)

---

## P4: OpenSpec Control Plane & Feature Tracking Dashboard

### Core Files (Read After P3)

**1. `scripts/openspec/feature-tracking-dashboard.mjs`**
- Generates HTML dashboard showing feature coverage + tracking status
- Status: Likely doesn't exist or is minimal

**2. `docs/reports/agent-task-claims.json`**
- JSON record of agent task execution + verification
- Status: May be stale or incomplete

**3. `6_12atlas-open-lanes-todo-updated.md`**
- OpenSpec planning document
- Status: Outdated (session number is old)

### What Needs Wiring

```typescript
// FEATURE TRACKING SCHEMA
interface FeatureTrackingRecord {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  
  // Tracking fields (what stages have been completed?)
  phase_1_identity_complete: boolean;        // source_ref, feature_id, tree_node_id, domain_class
  phase_2a_topolog_cluster_complete: boolean; // topolog_cluster, topolog_confidence
  phase_2b_lexical_features_complete: boolean; // ast_symbols, lexical_features
  phase_2c_entities_complete: boolean;       // entities, used_concepts
  phase_3_som_topology_complete: boolean;    // som_cluster, som_row, som_col
  phase_3_community_complete: boolean;       // community_id, community_authority
  phase_4_rl_policy_complete: boolean;       // rl_reward_score, rl_action_sequence
  
  // Verification
  qdrant_synced: boolean;                    // payload matches Postgres
  neo4j_synced: boolean;                     // relationships match Postgres
  retrieval_tested: boolean;                 // RRF blend includes this packet
  
  // Audit
  last_updated: ISO8601;
  verification_errors?: string[];
}
```

### Dashboard Content

```html
<!-- Feature Tracking Dashboard -->
<dashboard>
  <summary>
    Phase 1 (Identity):        58,304 / 58,304  (100%) ✅
    Phase 2A (Topology):       58,304 / 58,304  (100%) ✅
    Phase 2B (Lexical):           0 / 58,304  (0%)   ⏳
    Phase 2C (Entities):          0 / 58,304  (0%)   ⏳
    Phase 3 (SOM):                0 / 58,304  (0%)   ⏳
    Phase 3 (Community):          0 / 58,304  (0%)   ⏳
    
    Qdrant Parity:            40,568 / 40,568  (100%) ✅
    Neo4j Parity:             58,304 / 58,304  (100%) ✅
  </summary>
  
  <coverage>
    <field name="topolog_cluster">    58,304 / 58,304 (100%) ✅</field>
    <field name="som_cluster">            0 / 58,304 (0%)   ⏳</field>
    <field name="community_id">          0 / 58,304 (0%)   ⏳</field>
    <field name="retrieval_strategy">    0 / 58,304 (0%)   ⏳</field>
  </coverage>
  
  <mismatches>
    Postgres ↔ Qdrant: 0 mismatches ✅
    Postgres ↔ Neo4j:  0 mismatches ✅
  </mismatches>
</dashboard>
```

### Action Items (P4)

- [ ] **Create `feature-tracking-schema.ts`** (NEW) — Define FeatureTrackingRecord type + queries
- [ ] **Build `feature-tracking-dashboard.mjs`** (NEW) — Generate HTML dashboard with coverage stats
- [ ] **Create `verify-feature-tracking-complete.mjs`** (NEW) — Audit script that:
  - Queries Postgres for feature completeness per phase
  - Compares Postgres ↔ Qdrant ↔ Neo4j field-by-field
  - Generates dashboard JSON + HTML
  - Produces verification report (errors + warnings)
- [ ] **Wire `agent-task-claims.json`** — Record MCP tool calls + verification results (who verified, when, status)

---

## Execution Order

### Session 109 (This Session)
1. **Audit P0** — Read identity.ts, verify canonical shape
2. **Wire P0** — Extend identity contract with topolog_cluster, community_id, retrieval_strategy
3. **Create feature-tracking-layer.ts** — Unified getter for CanonicalPacket across all stores

### Session 110
4. **Audit P1** — Read RRF integration, query-eval-types
5. **Wire P1** — Add topology/community signals to RRF blend
6. **Test P1** — Verify RRF produces consistent ranking across Postgres/Qdrant/Neo4j

### Session 111
7. **Audit P2** — Read Qdrant/Postgres sync scripts
8. **Wire P2** — Update payload contract, backfill feature-tracking fields
9. **Create verify-parity scripts** — Validate Postgres ↔ Qdrant ↔ Neo4j

### Session 112
10. **Audit P3** — Read Neo4j ingestion scripts
11. **Wire P3** — Add topolog_cluster, community_id edges to Neo4j
12. **Create Neo4j parity audit** — Verify graph consistency

### Session 113
13. **Build P4** — Feature tracking dashboard + verification scripts
14. **Final validation** — Run all parity audits, generate dashboard

---

## Quick Reference: The 9 Core Fields

Every retrieve, every store, every API response must include these:

```
Tier 1 (Identity, immutable):
  1. packet_key           — 'ace:packet:auth:001'
  2. source_ref           — 'src/lib/server/auth.ts'
  3. feature_id           — 'auth.sessions'

Tier 2 (Derived, immutable):
  4. tree_node_id         — UUID (from codebase AST)
  5. domain_class         — 'error_handling' (Phase 1)
  6. title_id             — UUID (Phase 1)

Tier 3 (Topology, immutable after computation):
  7. topolog_cluster      — 0-15 (Phase 2A K-means)
  8. som_cluster          — SOM grid cell (Phase 3)
  9. community_id         — Louvain community (Phase 3)

Tier 4 (Retrieval, per-query):
  10. qdrant_point_id     — Qdrant UUID (optional, for cache bypass)
  11. retrieval_strategy  — 'dense_qdrant' | 'sparse_bm25' | 'topology_neo4j'
```

All three stores (Postgres, Qdrant, Neo4j) must expose all 9 core + 2 retrieval fields consistently.

---

## Files to Create (Summary)

| File | Location | Purpose |
|------|----------|---------|
| feature-tracking-layer.ts | src/lib/server/topology/ | Unified canonical getter across stores |
| feature-tracking-schema.ts | src/lib/server/topology/ | Type definitions + DB queries |
| signal-normalizer.ts | src/lib/server/retrieval/ | Normalize RRF signals to [0, 1] |
| verify-qdrant-postgres-parity.mjs | scripts/atlas/ | Audit Postgres ↔ Qdrant |
| verify-neo4j-postgres-parity.mjs | scripts/atlas/ | Audit Neo4j ↔ Postgres |
| verify-feature-tracking-complete.mjs | scripts/atlas/ | Dashboard + coverage report |
| feature-tracking-dashboard.mjs | scripts/openspec/ | HTML dashboard generator |

---

**Status**: Ready to execute P0 (Session 109)  
**Risk**: LOW — All changes additive (extend types, add fields, create views)  
**Blocking**: Nothing — P1–P4 can proceed in parallel once P0 types are defined
