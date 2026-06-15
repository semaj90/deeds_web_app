# Phase 17 Semantic Topology Completion — 75-80% Done

**Date**: June 15, 2026  
**Status**: Identity spine ✅ | Storage + Bifrost ✅ | Semantic topology ⏳  
**Target**: Complete Neo4j GDS → SOM → AE → Ontology → HyperRAG fusion by June 22

## Completion Status by Lane

| Lane | Completion | Blocker | Priority |
|------|-----------|---------|----------|
| Adaptive schema reconciler | 80% | — | P0 (apply migrations) |
| Packet identity spine | 100% | — | ✅ DONE |
| Qdrant semantic index | 85% | som_cluster tag backfill | P1 |
| Redis / Bifrost cache | 90% | — | ✅ MOSTLY DONE |
| **Neo4j GDS topology** | **50%** | **schema + GDS algo** | **P1 CRITICAL** |
| **SOM topology** | **20%** | **backfill + storage** | **P2** |
| **Autoencoder latent** | **15%** | **weights + backfill** | **P2** |
| Domain ontology | 10% | schema + seed data | P3 |
| Higher-hop enrichment | 35% | topology wiring | P3 |
| HyperRAG fusion | 60% | sorted set tuning | P4 |
| **Phase 17 overall** | **75-80%** | Semantic stack | **1-2 weeks** |

---

## Lane P1: Neo4j GDS Topology (50% → 100%)

### What Exists
- `USED_CONCEPT` edges between functions (27 call sites wired)
- `source_ref` node identity (3,251 packets)
- `feature_id` community clustering
- `community_id` labels

### What's Missing
Schema table: `atlas_topology_index` (23 columns)

```sql
CREATE TABLE atlas_topology_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key varchar(100) NOT NULL UNIQUE,
  source_ref text NOT NULL,
  feature_id text NOT NULL,
  
  -- SOM grid position (20x20)
  som_cluster int NOT NULL,
  som_x smallint NOT NULL,
  som_y smallint NOT NULL,
  
  -- Autoencoder latent
  ae_cluster int,
  ae_latent_64 bytea,  -- NOT vector(64)
  ae_distance float,
  
  -- GDS centrality metrics
  pagerank float,
  betweenness float,
  eigenvector float,
  
  -- K-nearest neighbors in GDS
  nn_1 uuid,
  nn_2 uuid,
  nn_3 uuid,
  nn_4 uuid,
  
  topology_version int DEFAULT 1,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  
  CONSTRAINT fk_nn_1 FOREIGN KEY (nn_1) REFERENCES atlas_topology_index(id),
  CONSTRAINT fk_nn_2 FOREIGN KEY (nn_2) REFERENCES atlas_topology_index(id),
  CONSTRAINT fk_nn_3 FOREIGN KEY (nn_3) REFERENCES atlas_topology_index(id),
  CONSTRAINT fk_nn_4 FOREIGN KEY (nn_4) REFERENCES atlas_topology_index(id),
  CONSTRAINT fk_feature_id FOREIGN KEY (feature_id) REFERENCES atlas_packets(feature_id)
);

CREATE INDEX idx_topology_som_grid ON atlas_topology_index(som_cluster, som_x, som_y);
CREATE INDEX idx_topology_pagerank ON atlas_topology_index(pagerank DESC);
CREATE INDEX idx_topology_feature ON atlas_topology_index(feature_id);
CREATE INDEX idx_topology_version ON atlas_topology_index(topology_version);
```

### Execution Path

**Step 1: Apply adaptive schema migration** (5 min)
```bash
npm run atlas:schema:adaptive
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0045_adaptive_schema_repair.generated.sql
```

**Step 2: Backfill topology index from existing packets** (10 min)
```bash
node scripts/atlas/backfill-topology-index.mjs
# INPUT: atlas_packets (3,251 rows)
# OUTPUT: atlas_topology_index (3,251 rows with SOM stub, nulls for GDS/AE)
```

**Step 3: Run Neo4j GDS KNN graph creation** (15 min)
```bash
node scripts/atlas/neo4j-gds-knn-build.mjs
# Reads: Qdrant embeddings (codebase_chunks_768)
# Writes: Neo4j GDS KNN graph (k=4)
# Computes: pagerank, betweenness, eigenvector
# Updates: atlas_topology_index with NN references
```

**Step 4: Verify topology integrity** (5 min)
```bash
npm run atlas:topology:verify
# Gate: all 3,251 packets have nn_1, pagerank, betweenness
# Gate: Neo4j edges match Qdrant similarity
# Gate: topology_version = 1 consistent
```

**Time**: ~35 min total. **Blocker**: None (adaptive schema already generated).

---

## Lane P2: SOM + Autoencoder (20% + 15% → 100%)

### What Exists
- `pytorch-graph.ts`: `trainSOM()` + `pcaProject()` implemented (578 LoC, 27 call sites)
- RTX 3060 Ti GPU available (8GB VRAM)
- Qdrant collection `codebase_chunks_768` (52k vectors)

### What's Missing

**SOM Training**:
- 20×20 grid initialization
- Vector quantization per cell
- BMU (Best Matching Unit) assignment for 3,251 packets
- Centroid storage in Redis `som:cell:*`

**Autoencoder**:
- 768 → 386 → 64 latent compression
- Trained weights (currently random Xavier init)
- Bytea encoding for `ae_latent_64` column
- Distance metric (MSE vs cosine)

### Execution Path

**Step 1: Train 20×20 SOM on Qdrant vectors** (30 min)
```bash
node scripts/atlas/train-som-20x20.mjs
# INPUT: Qdrant embeddings (52k vectors, 768-dim)
# OUTPUT: 
#   - Redis som:cell:* (400 cells, 768-dim centroids)
#   - som_cluster, som_x, som_y columns in atlas_topology_index
# Performance: ~2 min on RTX 3060 Ti
```

**Step 2: Train autoencoder 768→64** (45 min)
```bash
node scripts/atlas/train-autoencoder-768-to-64.mjs
# INPUT: Qdrant embeddings + SOM clusters
# OUTPUT:
#   - Model weights saved to models/autoencoder_768_64.pt
#   - ae_latent_64 (bytea), ae_distance (float) in atlas_topology_index
#   - Redis ae:centroid:* for cluster centers
# Performance: ~5 min on RTX 3060 Ti
```

**Step 3: Backfill SOM + AE into Qdrant payloads** (10 min)
```bash
node scripts/atlas/backfill-qdrant-som-ae.mjs
# CRITICAL: Updates codebase_chunks_768 payload with:
#   - som_cluster (int)
#   - som_x, som_y (smallint)
#   - ae_latent_64 (base64 bytea as string in JSON)
# Qdrant filter now works: som_cluster == 15 AND som_x < 10
```

**Step 4: Verify SOM + AE consistency** (5 min)
```bash
npm run atlas:som:verify
# Gate: 3,251 packets have som_cluster (0-399)
# Gate: ae_latent_64 decodes to float32[64]
# Gate: Redis som:cell:* matches Qdrant tags
# Gate: ae_distance < 0.5 (model quality check)
```

**Time**: ~90 min total. **Blocker**: Autoencoder training (compute-bound, not blocking downstream).

---

## Lane P3: Domain Ontology (10% → 100%)

### What's Missing

Schema:
```sql
CREATE TABLE atlas_domain_ontology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain varchar(100) NOT NULL,
  subdomain varchar(100),
  parent_domain uuid REFERENCES atlas_domain_ontology(id),
  canonical_label varchar(200) NOT NULL UNIQUE,
  aliases jsonb DEFAULT '[]'::jsonb,
  description text,
  evidence_mode varchar(50),
  lineage_version int DEFAULT 1,
  created_at timestamp DEFAULT now()
);

CREATE TABLE atlas_domain_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES atlas_domain_ontology(id),
  child_id uuid NOT NULL REFERENCES atlas_domain_ontology(id),
  relation_type varchar(50),
  weight float DEFAULT 1.0,
  created_at timestamp DEFAULT now(),
  UNIQUE(parent_id, child_id)
);
```

Seed data (legal domain tree):
```
Evidence
  ├─ Documentary
  │   ├─ Written (contracts, letters, logs)
  │   ├─ Digital (emails, messages, metadata)
  │   └─ Visual (photos, screenshots, diagrams)
  ├─ Testimonial
  │   ├─ Expert (forensics, medical, financial)
  │   ├─ Lay Witness (observation, hearsay exceptions)
  │   └─ Party (plaintiff, defendant)
  ├─ Physical
  │   ├─ Tangible (weapons, objects, property)
  │   └─ Biological (DNA, blood, tissue)
  └─ Pattern
      ├─ Financial (transactions, wire transfers)
      ├─ Behavioral (text patterns, timing)
      └─ Location (GPS, cell tower, CCTV)

Criminal Conduct
  ├─ Assault
  │   ├─ Simple
  │   ├─ Aggravated
  │   └─ Domestic Violence
  ├─ Theft / Fraud
  ├─ Sexual Misconduct
  └─ Homicide
      ├─ Murder
      ├─ Manslaughter
      └─ Negligent Homicide
```

### Execution Path

**Step 1: Create schema + seed ontology** (5 min)
```bash
node scripts/atlas/seed-domain-ontology.mjs
# Inserts 50+ domain nodes + 80+ edges
# Evidence → Criminal → Assault → Domestic Violence tree
# Evidence → Image Evidence → Medical subtree
```

**Step 2: Link packets to ontology via Qdrant tags** (10 min)
```bash
node scripts/atlas/link-packets-to-domains.mjs
# Uses Qdrant `tags` field + LangExtract labels
# Matches packet summary to nearest ontology node
# Writes: atlas_packets.domain_id (FK to atlas_domain_ontology)
```

**Step 3: Wire ontology into retrieval pipeline** (5 min)
```bash
# Edit: src/lib/server/retrieval/orchestrator.ts
# Add: domain filter to search contract
# Example: search(query, { domain: 'evidence:documentary:written' })
```

**Time**: ~20 min total. **Blocker**: None.

---

## Lane P4: HyperRAG Fusion (60% → 100%)

### What Exists
- Redis sorted sets (score-based ranking)
- Bifrost L1/L2 cache hits
- RRF (Reciprocal Rank Fusion) partial

### What's Missing
- Bounded replay queue (last-N queries)
- Reward scoring integration
- Tied rank handling (multiple packets with same score)
- TTL strategy per signal

### Execution Path

**Step 1: Implement Redis sorted set queues** (10 min)
```bash
# No linked deque — use Redis ZSET instead
# Key: gpu:karpathy:scores -> HSET per file
# Key: rrf:query:* -> ZSET (rank → score)
# Key: reward:agent:* -> ZSET (reward signal)
```

**Step 2: Wire reward signal from Gemma4 feedback** (15 min)
```bash
# Route: /api/ai/feedback → reward:agent:{agentId} ZADD
# Decay: older scores decay by 0.95^hours
# Fusion: 0.5·rrf + 0.3·reward + 0.2·pagerank
```

**Step 3: Tune tied-rank handling** (10 min)
```bash
# When rrf(a) == rrf(b), secondary: pagerank
# When all equal, tertiary: recency (created_at DESC)
```

**Time**: ~35 min total. **Blocker**: None (can run in parallel with P1-P3).

---

## Overall Build Order (No Dependencies)

| Order | Lane | Time | Start After |
|-------|------|------|-------------|
| 1 | P1: Neo4j GDS KNN | 35 min | NOW |
| 2 | P2: SOM + AE | 90 min | P1 complete (parallel OK) |
| 3 | P3: Domain ontology | 20 min | P1 complete (parallel OK) |
| 4 | P4: HyperRAG fusion | 35 min | P2 complete |

**Critical path**: P1 (35 min) → P2 (90 min) → P4 (35 min) = **160 min = ~2.5 hours**

**Parallel tracks**: P1 and P3 can run simultaneously (no dependencies).

---

## Verification Gates (Phase 17 Complete)

```bash
# After all lanes done
npm run atlas:topology:verify         # Neo4j GDS + NN refs
npm run atlas:som:verify              # SOM grid + clusters
npm run atlas:ae:verify               # Autoencoder latents
npm run atlas:ontology:verify         # Domain tree + links
npm run atlas:hyperrag:verify         # Sorted set fusion

# Full integration test
npm run atlas:retrieval:e2e
# Simulates: Qdrant hit → Neo4j GDS neighborhood → SOM cluster → AE latent → Ontology filter → HyperRAG rerank
```

---

## Success Criteria

**Phase 17 COMPLETE when**:
- ✅ atlas_topology_index: 3,251 rows, all fields populated
- ✅ Neo4j: 3,251 nodes + 4N edges (KNN graph) + pagerank/betweenness/eigenvector
- ✅ SOM: 400 cells, 768-dim centroids in Redis, Qdrant tags synced
- ✅ Autoencoder: 768→64 latent, bytea encoded, ae_distance < 0.5
- ✅ Domain ontology: 50+ nodes, 80+ edges, packet links
- ✅ HyperRAG: Sorted sets operational, feedback loop wired, tied-rank tie-breaker
- ✅ E2E test: Qdrant → Neo4j → SOM → AE → Ontology → HyperRAG produces correct ranking
- ✅ Retrieval latency: <500ms (Qdrant + Neo4j + SOM lookup, excluding LLM generation)

**Phase 17 completion percentage**: 75% → 100%

---

## Resources

- GPU bridge: `packages/parent-atlas-retrieval/src/gpu/pytorch-graph.ts` (trainSOM, pcaProject)
- Neo4j client: `src/lib/server/graph/neo4j-gds.ts` (existing 1,307-line file)
- Qdrant manager: `src/lib/server/vector/qdrant-manager.ts`
- Bifrost cache: `packages/parent-atlas-retrieval/src/bifrost/bifrost-cache-manager.ts`

---

**Start**: June 15, 2026 (NOW)  
**Target**: June 22, 2026  
**Owner**: Phase 17 Semantic Topology Completion  
**Status**: Ready to execute
