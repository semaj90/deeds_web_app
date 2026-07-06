# Progressive Semantic Compiler: Complete Architecture

**Proposal Date**: July 4, 2026  
**Proposer**: User (architectural vision)  
**Status**: ✅ DESIGN COMPLETE + CARD 1 READY  
**Execution Start**: Session 105 (Now)

---

## Core Principle

**Each pass adds information instead of replacing the previous one.**

The compiler is a pipeline where every stage produces durable output. No pass deletes earlier results. This creates a **progressive enrichment** where later stages can always reference earlier work without conflict.

---

## The Five Passes

### Pass 1: AST / Parsing
**Extracts**: symbols, imports, function signatures, code structure  
**Tools**: ast-grep, tree-sitter, LSP symbols  
**Output**: Structural graph (syntax tree)  
**Status**: ✅ Present (ast-grep extraction wired)

### Pass 2: Lexical
**Extracts**: tokens, POS tags, n-grams, engrams  
**Tools**: lexical tokenizer, pg_fts, GIN indexes  
**Output**: Linguistic representation (terms + relationships)  
**Status**: ✅ Present (keywords, ngrams, trigrams, engrams extracted)  
**Gap**: Coverage 0.1%–2.4% on 58.3K packets → need 100%

### Pass 3: Semantic
**Extracts**: entities, concepts, intent, ontology, domain class  
**Tools**: LangExtract, entity mappers, ontology  
**Output**: Semantic meaning + title_id (canonical label)  
**Status**: ⚠️ Partial (title_id present, concepts 0.1% populated)  
**Gap**: LangExtract integration + concept_ids propagation

### Pass 4: Graph
**Extracts**: PageRank, Louvain communities, CheiRank, K-core, betweenness  
**Tools**: Neo4j GDS (PageRank, Louvain, centrality)  
**Output**: Graph topology + importance metrics  
**Status**: ⚠️ Partial (PageRank computed, only 5% synced to Postgres)  
**Gap**: Full sync + Louvain/K-core/CheiRank completion

### Pass 5: Latent Topology
**Extracts**: latent_64 (768→64 AE), KMeans clustering, SOM 20×20, SOM coordinates  
**Tools**: Autoencoder, KMeans, SOM training  
**Output**: Continuous topology (400 cells, 146 packets/cell average)  
**Status**: ❌ Incomplete (267/400 cells populated, deterministic hash not trained)  
**Gap**: Autoencoder training + true K-Means + SOM adjacency edges

---

## The Three Tables (Decomposed Schema)

**Current**: All features + metrics in overloaded `atlas_packets` (58,365 rows)

**Proposed**:

### `atlas_packets` (Identity Layer)
Canonical identity only, never changes after creation:
```sql
packet_key          (TEXT, PK)     -- stable ID
source_ref          (TEXT)         -- file path anchor
file_path           (TEXT)         -- canonical source
function_symbol     (TEXT)         -- function name
directory_path      (TEXT)         -- directory anchor
qdrant_point_id     (UUID)         -- vector DB link
tree_node_id        (TEXT)         -- Neo4j topology link
```

### `atlas_packet_features` (Feature Layer)
Semantic meaning, extracted per pass:
```sql
packet_key          (TEXT, PK/FK)  -- from atlas_packets
keywords            (TEXT[])       -- lexical pass
ngrams              (TEXT[])       -- lexical pass
trigrams            (TEXT[])       -- lexical pass
engrams             (TEXT[])       -- lexical pass
entities            (TEXT[])       -- semantic pass
concept_ids         (INT[])        -- semantic pass
used_concepts       (TEXT[])       -- semantic pass (Card 1)
verbs               (TEXT[])       -- lexical pass
nouns               (TEXT[])       -- lexical pass
ontology_label      (TEXT)         -- semantic pass
domain_class        (TEXT)         -- semantic pass
feature_label       (TEXT)         -- semantic pass
title_id            (UUID)         -- semantic pass
langextract_version (TEXT)         -- tracking
astgrep_version     (TEXT)         -- tracking
```

### `atlas_packet_metrics` (Metric Layer)
Graph + latent topology, computed per pass:
```sql
packet_key          (TEXT, PK/FK)  -- from atlas_packets
page_rank           (REAL)         -- graph pass
cheirank            (REAL)         -- graph pass
betweenness         (REAL)         -- graph pass
closeness           (REAL)         -- graph pass
k_core              (INT)          -- graph pass
graph_community_id  (INT)          -- graph pass (Louvain)
kmeans_cluster      (INT)          -- latent pass
som_row             (INT)          -- latent pass (0-19)
som_col             (INT)          -- latent pass (0-19)
som_cluster         (INT)          -- latent pass (0-399, derived)
latent_64           (BYTEA/VECTOR) -- latent pass
latent_128          (BYTEA/VECTOR) -- latent pass
```

---

## Execution Cards (Dependency Order)

### Card 1: Envelope Extraction ✅ READY
**Work**: Backfill tree_node_id + used_concepts  
**Duration**: 1 hour  
**Scripts**:
- `propagate-tree-node-ids.mjs` (tree_node_id 5%→100%)
- `wire-used-concepts-lane.mjs` (used_concepts 0.1%→80%+)
- `validate-envelope-extraction.mjs` (all gates pass)

**Gates**:
- tree_node_id ≥95%
- used_concepts ≥80%
- All canonical fields stable + non-null

**Unblocks**: Cards 2–5

**Status**: ✅ Scripts written, ready to execute

---

### Card 2: Qdrant Bridge ⏳ Design Ready
**Work**: Resolve qdrant_point_id, durable payload sync  
**Duration**: 2–3 hours  
**Blocker**: Card 1 (needs complete envelopes)

**Key Tasks**:
- One-time lookup: Qdrant point ID → Postgres column
- Durable sync: feature_id, domain_class, title_id, som_row/col
- Payload updates: idempotent by content hash

**Acceptance**: All 40,568 chunks have resolvable qdrant_point_id

**Status**: ✏️ Design phase, execution plan ready

---

### Card 3: SOM Topology ⏳ Design Ready
**Work**: Fill missing 133 SOM cells, train on latent vectors  
**Duration**: 3–4 hours  
**Blocker**: Card 1 (needs complete envelopes)

**Key Tasks**:
- Train autoencoder 768→64 (prerequisite)
- Run true K-Means on latent_64 (replace 10×10 hash)
- Assign all 58,365 packets to 400 SOM cells
- Compute tricubic adjacency edges (2,400–3,000)

**Acceptance**: 400 cells populated, mean 146 packets/cell, CV <0.15

**Status**: ✏️ Design phase, validation gates ready

---

### Card 4: Binary Registry ⏳ Design Ready
**Work**: mmap hot registry for packet payloads  
**Duration**: 2–3 hours  
**Blocker**: Card 3 (needs SOM coordinates)

**Key Tasks**:
- Build sequential mmap layout (`atlas_packets_mmap.dat`)
- Create offset index for byte lookup
- Keep Arrow for bulk export/import only
- Keep Postgres as canonical truth

**Acceptance**: mmap read <1ms (vs Postgres 5–15ms)

**Status**: ✏️ Design phase

---

### Card 5: ACP Routing ⏳ Design Ready
**Work**: Wire ACP as workflow engine (not just router)  
**Duration**: 4–6 hours  
**Blocker**: Cards 2–4 (needs bridge + SOM + registry)

**Key Tasks**:
- Redesign ACP: planner → retrieval → merge → rerank → verify
- Integrate HMM for error-state diagnosis
- Wire RRF (rank-reciprocal-fusion) candidate merger
- Gemma4 reranking + verification loop

**Acceptance**: ACP query + error signal both work end-to-end

**Status**: ✏️ Design phase

---

## Timeline

| Card | Session | Duration | Parallel? | Total |
|------|---------|----------|-----------|-------|
| 1 | 105 | 1h | N/A | 1h |
| 2 | 106 | 2–3h | With Card 3 | 3–4h |
| 3 | 106 | 3–4h | With Card 2 | 3–4h |
| 4 | 107 | 2–3h | No | 2–3h |
| 5 | 108 | 4–6h | No | 4–6h |

**Total**: 13–19 hours (2–3 days with parallelization)  
**Realistic**: 10–12 hours (1–2 days with Cards 2+3 parallel)

---

## What This Enables

### Retrieval Lanes (User Query → Ranked Candidates)

1. **Lexical lane**: Query tokens → keywords/ngrams/engrams match
2. **Graph lane**: PageRank + Louvain boost (topology-aware)
3. **Latent lane**: Qdrant ANN + TurboVec prefilter → SOM locality boost
4. **RRF merge**: Combine all three → unified candidate list
5. **Reranker**: Gemma4 + verification loop → final ranking

### Error Recovery (HMM + Recovery Packets)

1. Error signal → HMM classifier (error_class:domain mapping)
2. Tree_node_id allows Neo4j to find recovery packets by feature
3. PageRank orders candidates (high authority first)
4. ACE assembler dispatches recovery packet to retrieval context

### Adaptive Optimization (RLM + RL)

1. **Track metrics per packet**: Page_rank, community_id, KMeans_cluster, som_coordinates
2. **Accumulate evidence**: Each retrieval session records what worked
3. **Train reward model**: Preferences across 58K packets
4. **QLoRA export**: Fine-tune Gemma4 on domain-specific retrieval patterns

---

## Key Architectural Properties

### Non-Destructive Propagation
Each pass appends; nothing deletes earlier results. A packet can be re-processed without losing prior enrichment.

### Independent Rebuilding
Metrics table (atlas_packet_metrics) can be rebuilt independently from features or identity. No cascading failures.

### Composable Retrieval
Lexical + graph + latent lanes are independent. Can enable/disable any lane without breaking others.

### Observable Quality
Every packet carries version markers (langextract_version, astgrep_version) so retrieval can trust enrichment quality.

---

## Success Metrics

### Coverage Gates
| Metric | Target | Current | Gate |
|--------|--------|---------|------|
| tree_node_id | 100% | 5% | P0 (Card 1) |
| used_concepts | 80%+ | 0.1% | P0 (Card 1) |
| qdrant_point_id | 95%+ | 0% | P1 (Card 2) |
| SOM cells | 400 | 267 | P1 (Card 3) |
| PageRank sync | 100% | 5% | P2 (Graph) |

### Performance Gates
| Metric | Target | Current | Card |
|--------|--------|---------|------|
| Retrieval latency | <500ms | ~2s | 5 |
| Cache hit rate (BitFrost) | >70% | ~10% | 4 |
| SOM locality boost | 1.3–3× | 1.0× (hash) | 3 |

---

## Entry Point

**Card 1 is ready to execute now.**

```bash
cd sveltekit-frontend

# Step 1A
node scripts/atlas/propagate-tree-node-ids.mjs --dry-run
node scripts/atlas/propagate-tree-node-ids.mjs

# Step 1B
node scripts/atlas/wire-used-concepts-lane.mjs --dry-run
node scripts/atlas/wire-used-concepts-lane.mjs

# Step 1C (validation)
node scripts/atlas/validate-envelope-extraction.mjs --verbose
```

If all three exit 0, Card 1 is complete.

---

## Documents

- ✅ `CARD-1-QUICK-START.md` — Quick execution guide
- ✅ `docs/CARD-1-ENVELOPE-EXTRACTION-READY.md` — Full reference
- ✅ `memory/CARD-1-ENVELOPE-EXTRACTION-READY.md` — Session memory
- ⏳ Will create: `SESSION-105-ENVELOPE-EXTRACTION-COMPLETE.md` (after Card 1 passes)

---

**Status: Ready to begin.**
