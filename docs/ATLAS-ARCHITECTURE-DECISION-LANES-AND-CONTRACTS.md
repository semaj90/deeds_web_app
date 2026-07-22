# Atlas Architecture Decision: Lanes, Contracts, and Semantic Organization

**Status**: LOCKED (Architecture specification, not implementation plan)

**Date**: July 21, 2026

**Scope**: Defines retrieval lanes, embedding contracts, lexical evidence classes, and graph authority separation for the entire Atlas pipeline and Go Retrieval service.

---

## Executive Summary

The repository already has:
- ACE packet handling (observation → complete)
- Multi-lane retrieval (Qdrant, Neo4j, Redis, BM25)
- Parent Atlas assembly (Graphify → Postgres → Neo4j/Qdrant)
- Workflow state machine (HMM OBSERVE→DIAGNOSE→RETRIEVE→PROPOSE→VALIDATE→EXECUTE)
- Semantic RPC (inbox/outbox durability)
- Gemma4 and llama-server adapters

**Decision**: Do NOT build parallel classifiers or monolithic Graphify extensions. Instead, consolidate existing lanes into explicit contracts with versioned dimensions, separated lexical evidence classes, deterministic graph authority, and a bounded Go Retrieval service as the semantic normalization boundary.

---

## 1. Embedding Contract System (LOCKED)

### Problem
Native EmbeddingGemma outputs 768 dimensions. Atlas's custom 384-dim vector is a derived projection that must be named, versioned, and distinguished from native output.

### Decision
Every embedding artifact, Qdrant collection, Redis centroid, Parquet snapshot, and model run must declare an explicit `EmbeddingContract`.

### Contract Interface
```typescript
interface EmbeddingContract {
  contractId: string;                 // e.g., "embeddinggemma-full768-v1"
  modelId: string;                    // e.g., "embeddinggemma"
  modelRevision: string;              // e.g., "latest" or semantic version
  tokenizerRevision: string;
  sourceDimensions: number;           // e.g., 768
  outputDimensions: number;           // e.g., 768, 384, 64, 128
  projectionKind: 'none' | 'prefix' | 'mrl' | 'autoencoder';
  normalization: 'none' | 'l2';
  dtype: 'float32' | 'float16' | 'int8';
  contentHash: string;                // SHA-256 of model weights
}
```

### Canonical Contracts
```typescript
const EMBEDDING_CONTRACTS = {
  // Native output (canonical)
  embeddinggemma_full_768_v1: {
    contractId: "embeddinggemma-full768-v1",
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: "none",
    tag: "CANONICAL_NATIVE",
  },

  // Atlas prefix truncation (for retrieval only, not semantic authority)
  embeddinggemma_prefix_384_v1: {
    contractId: "embeddinggemma-prefix384-v1",
    sourceDimensions: 768,
    outputDimensions: 384,
    projectionKind: "prefix",
    tag: "CANONICAL_RETRIEVAL_CONTRACT",
  },

  // Autoencoder routing (for clustering/SOM, not semantics)
  atlas_autoencoder_768x64_v1: {
    contractId: "atlas-autoencoder-768x64-v1",
    sourceDimensions: 768,
    outputDimensions: 64,
    projectionKind: "autoencoder",
    tag: "ROUTING_FEATURE",
  },

  // Future: Matryoshka Representation Learning
  embeddinggemma_mrl_256_v1: {
    contractId: "embeddinggemma-mrl256-v1",
    sourceDimensions: 768,
    outputDimensions: 256,
    projectionKind: "mrl",
    tag: "FUTURE_RESERVED",
  },
};
```

### Rules (HARD)
1. **Never combine vectors from different projection procedures merely because dimensions match.**
2. **Tag every 768-dim vector as CANONICAL, NATIVE, or LEGACY.**
3. **384-dim is retrieval-only; do NOT use for semantic authority decisions.**
4. **Autoencoder 64-dim is for routing (K-means, SOM) only, not retrieval scoring.**

---

## 2. Lexical Evidence Separation (LOCKED)

### Problem
Storing all extracted words in one `tags` array conflates POS categories, symbol types, and heuristic hints. Suffix heuristics (e.g., "-ly" for adverbs) are unreliable.

### Decision
Use separate evidence classes for each linguistic or symbolic category.

### Lexical Evidence Classes
```typescript
type LexicalEvidenceClass =
  | "lexical_noun"                // concepts, entities
  | "lexical_proper_noun"         // specific names, brands
  | "lexical_noun_phrase"         // multi-word concepts
  | "lexical_verb"                // operations, actions
  | "lexical_adjective"           // properties, constraints
  | "lexical_adverb"              // execution characteristics
  | "lexical_identifier"          // code symbols (exact match)
  | "lexical_path_token"          // filesystem/module paths
  | "lexical_api_symbol"          // function, class, route names
  | "lexical_technology"          // framework, library names
  | "lexical_error_term";         // error messages, exception names

interface LexicalFact {
  word: string;
  evidenceClass: LexicalEvidenceClass;
  extractorMethod: "parser" | "nlp" | "suffix_heuristic" | "exact_regex";
  confidence: number;              // [0, 1]
  source: "code" | "comment" | "docstring" | "prose" | "identifier";
  sourceRef: string;               // file or chunk identity
}
```

### Extraction Priority (Hierarchical)
1. **Parser-derived code symbols** (Tree-sitter, ast-grep) → `lexical_identifier`, `lexical_api_symbol`
2. **Identifier segmentation** (camelCase, snake_case split) → `lexical_identifier`
3. **NLP POS/lemma extraction** (spacy, TreeTagger, or Gemma4) for prose/comments → `lexical_noun`, `lexical_verb`, etc.
4. **Suffix heuristics** as fallback only → reduced confidence

### Semantic Mapping
| Lexical Class | Semantic Purpose | Use Case |
|---|---|---|
| `lexical_noun` | Concepts, technologies, entities | Domain concept retrieval |
| `lexical_proper_noun` | Specific names, organizations | Authority identification |
| `lexical_noun_phrase` | Domain and capability candidates | Phrase-level retrieval |
| `lexical_verb` | Operations and graph predicates | Action/workflow retrieval |
| `lexical_adjective` | Properties and constraints | Feature/constraint queries |
| `lexical_adverb` | Execution characteristics | Performance/behavior hints |
| `lexical_identifier` | Exact code retrieval | Direct symbol lookup |
| `lexical_error_term` | HMM diagnosis and recovery | Error context retrieval |

### Rules (HARD)
1. **Store the word and confidence, not the POS tag alone.**
2. **Do NOT use a POS tag alone to set a production domain.**
3. **LangExtract processes prose; Tree-sitter processes code. Do not conflate.**

---

## 3. Extractor Role Separation (LOCKED)

### Decision
Each extraction tool has one specific job. Do not use them interchangeably.

| Tool | Job | Output |
|------|-----|--------|
| **ripgrep** | File discovery, exact identifiers, fast preliminary lexical search | `indexed_file_candidates.ndjson` |
| **Tree-sitter** | Syntax tree, declarations, spans, scopes, imports, calls | `structural_facts` table |
| **ast-grep** | Reproducible language-aware rules over Tree-sitter trees | `structural_facts` with rule provenance |
| **LangExtract** | Long prose, design reports, markdown, specs, issue descriptions | `documentation_grounding_facts` table |
| **Gemma4** | Summaries, unresolved semantic classification—NOT primary syntax extraction | `ai_summaries`, `domain_classifications` |

### Rules (HARD)
1. **LangExtract does NOT parse TypeScript call graphs.**
2. **Tree-sitter and ast-grep do NOT attempt to infer architectural intent from design documents.**
3. **Gemma4 is a consumer of extracted facts, not an extractor.**

---

## 4. PageRank as Derived Authority (LOCKED)

### Problem
PageRank is stored and queried as if it were semantic meaning. It is not. It is a derived routing feature.

### Decision
Split PageRank into two artifacts:

**Raw Score** (graph structural metric):
```sql
ALTER TABLE graph_projection_nodes
ADD COLUMN pagerank_raw REAL,
ADD COLUMN pagerank_iteration INT,
ADD COLUMN pagerank_converged BOOLEAN;
```

**Normalized Authority** (for retrieval fusion):
```sql
ALTER TABLE graph_projection_nodes
ADD COLUMN authority_score REAL,
ADD COLUMN authority_timestamp BIGINT;
```

### Graph Authority Contract
```typescript
interface GraphAuthoritySnapshot {
  snapshotId: string;
  graphVersion: string;
  nodeCount: number;
  edgeCount: number;
  pageranksComputed: number;
  pageranksNull: number;
  convergence: number;
  iterations: number;
  // Derived metric (for ranking, not semantics)
  authorityNorm: "none" | "sigmoid" | "minmax";
  createdAt: number;
}
```

### Graph Validation Gates (MUST ALL PASS)
```
GRAPH_SNAPSHOT_MANIFEST           ✅ SHA-256 verified
GRAPH_NODE_PARITY                 100% (Postgres ↔ Neo4j)
GRAPH_EDGE_PARITY                 100% (Postgres ↔ Neo4j)
ORPHAN_EDGE_COUNT                 0
NETWORKX_GDS_TOPK_OVERLAP         >= 0.95
PAGERANK_FINITE_COVERAGE          >= 0.99
POSTGRES_PROMOTION_PARITY         100% (Neo4j → Postgres sync)
```

### Rules (HARD)
1. **PageRank is a derived feature, NOT canonical meaning.**
2. **Do NOT run PageRank before graph projection parity passes all gates.**
3. **Do NOT use PageRank alone to make retrieval relevance decisions.**

---

## 5. Autoencoder, Clustering, and Meaning (LOCKED)

### Decision
Three independent purposes. Do NOT conflate.

```
EmbeddingGemma 768 (canonical dense semantic)
    │
    ├── dense retrieval (Qdrant ANN)
    │
    ├── optional Atlas prefix-384 (retrieval contract)
    │
    └── autoencoder 768 → 64 (routing layer)
             │
             ├── K-means 400 clusters (topic routing)
             ├── SOM 20×20 cells (navigation)
             ├── Redis centroid cache (hot lookup)
             └── visualization hints
```

### Semantic Distinctions (LOCKED)
| Concept | Is NOT | Purpose |
|---|---|---|
| **K-means cluster** | a domain | topic/routing signal |
| **SOM cell** | an ontology node | navigation grid |
| **PageRank** | relevance | graph structural importance |
| **embedding similarity** | proof | evidence candidate ranking |
| **summary label** | canonical fact | derived interpretation |

All are **derived evidence**, not ground truth.

### Rules (HARD)
1. **Store 768-dim embeddings in Postgres and Qdrant as canonical semantic layer.**
2. **Autoencoder 64-dim is for K-means/SOM routing only.**
3. **Do NOT use 64-dim for ANN retrieval.**
4. **Do NOT use K-means cluster ID as a domain classification.**
5. **Do NOT use SOM cell as a semantic feature.**

---

## 6. Retrieval Lanes (LOCKED)

### Decision
Go Retrieval service owns bounded fan-out across seven independent lanes.

```typescript
type RetrievalLane =
  | "lexical"           // PostgreSQL FTS/GIN
  | "dense"             // Qdrant dense vector
  | "sparse"            // Qdrant sparse/BM42
  | "topology"          // Neo4j expansion
  | "documentation"     // exact prose grounding
  | "centroid"          // Redis cluster routing
  | "temporal";         // outcome/error history
```

### Fan-Out Architecture
```
Query normalization
       │
       ├── PostgreSQL FTS/GIN (lexical lane)
       ├── Qdrant dense (dense lane)
       ├── Qdrant sparse/BM42 (sparse lane)
       ├── Neo4j topology expansion (topology lane)
       ├── Redis centroid routing (centroid lane)
       ├── documentation grounding (documentation lane)
       └── outcome/error history (temporal lane)
       │
       ▼
Identity normalization (deduplicate by packet_key/content_hash)
       ▼
RRF + calibrated feature fusion
       ▼
Optional reranker (GPU similarity, XGBoost)
       ▼
ACE evidence packet
```

### Go Retrieval HTTP API
```
POST /v1/retrieve                    -- unified multi-lane search
POST /v1/retrieve/error-context      -- error-specific evidence
POST /v1/retrieve/documentation      -- prose-aware grounding
POST /v1/retrieve/topology           -- graph expansion
POST /v1/retrieve/centroid-route     -- cluster membership
GET  /v1/manifests                   -- contract/snapshot inventory
GET  /health                         -- service health
```

### Evidence Candidate Contract
```typescript
interface EvidenceCandidate {
  packetKey: string;                 // canonical identity
  sourceRef: string;                 // file or documentation reference
  chunkId: string;                   // specific span or chunk
  evidenceType: string;              // "code" | "doc" | "test" | "error"
  lane: RetrievalLane;               // which retrieval lane found this
  rawScore: number;                  // lane-specific score [0, 1]
  normalizedScore: number;           // fused score after calibration
  pageRank?: number;                 // optional authority boost
  clusterId?: number;                // optional K-means cluster
  somCell?: number;                  // optional SOM cell ID
  citation?: CitationReference;      // line/span for documentation
  metadata: Record<string, unknown>; // lane-specific metadata
}
```

### Rules (HARD)
1. **Go Retrieval normalizes evidence; it does NOT generate edits.**
2. **ACE and Gemma4 propose edits; authorization gates apply them.**
3. **Each lane must validate its contracts independently.**
4. **Do NOT generate ACE packets directly from retrieval results; normalize first.**

---

## 7. PostgreSQL Schema Specialization (LOCKED)

### Problem
One broad JSONB packet table becomes a kitchen sink.

### Decision
Use specialized canonical tables, not one universal JSONB envelope.

### Canonical Tables
```sql
indexed_files           -- file identity, path, content_hash, language
indexed_chunks          -- chunk spans, language, type, summaries
lexical_facts           -- extracted words, POS, evidence class, confidence
structural_facts        -- declarations, calls, imports, precise spans
document_grounding_facts-- documentation chunks, claims, citations
domain_classifications  -- domain, topic, category, confidence
knowledge_terms         -- canonical term definitions
knowledge_term_aliases  -- variant names and synonyms
knowledge_relations     -- term-to-term relationships
graph_projection_nodes  -- Neo4j node mirror (file, chunk, symbol, etc.)
graph_projection_edges  -- Neo4j edge mirror (CONTAINS, CALLS, etc.)
artifact_registry       -- model weights, embeddings, artifacts
graph_run_manifests     -- GraphQL execution history
embedding_run_manifests -- embedding generation history
```

### Search Index Strategy
```sql
-- For exact code identifiers and full-text prose:
ALTER TABLE indexed_chunks
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(symbol_text, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'C')
) STORED;

CREATE INDEX indexed_chunks_search_gin ON indexed_chunks USING gin(search_vector);

-- For metadata/payload filters (rare, justified cases only):
CREATE INDEX indexed_chunks_metadata_path_gin
ON indexed_chunks USING gin(metadata jsonb_path_ops);
```

**Note**: Use `simple` configuration for code identifiers (English stemming damages symbol names like "apply", "family").

### Rules (HARD)
1. **Use tsvector GIN indexes for prose and symbol search.**
2. **Use JSONB GIN indexes only for actual JSON containment or path filters.**
3. **Do NOT store everything in a single JSONB blob.**
4. **Create specialized tables for each semantic domain.**

---

## 8. Documentation Grounding Lane (LOCKED)

### Problem
Code and documentation are treated identically. They need the same identity framework but different chunking and evidence strategies.

### Decision
Use separate chunking strategies and a dedicated grounding fact table.

### Code Chunk Boundaries
- Declaration
- Function/method body
- Class definition
- Route definition
- Schema/table
- SQL statement
- Tool definition
- Test case

### Documentation Chunk Boundaries
- Heading path (hierarchical)
- Paragraph group (logical unit)
- Code block (with language)
- Table (structured data)
- Requirement (user story or constraint)
- Decision (ADR, design decision)
- Acceptance criterion (testable condition)

### Documentation Grounding Fact Interface
```typescript
interface DocumentationGroundingFact {
  documentId: string;               // doc identity
  sourceRef: string;                // normalized path
  headingPath: string[];            // breadcrumb hierarchy
  startLine: number;
  endLine: number;
  contentHash: string;              // SHA-256 of chunk text
  text: string;
  extractedClaims: string[];        // parsed assertions
  referencedSymbols: string[];      // code symbols mentioned
  referencedFiles: string[];        // files mentioned
  citationLabel: string;            // structured ref like "RFC-2: Section 3.2"
  extractorVersion: string;         // reproducibility
}
```

### Go Retrieval Documentation Lane
```typescript
POST /v1/retrieve/documentation
{
  query: string;
  headingContext?: string;          // filter by heading hierarchy
  referencedSymbols?: string[];     // find docs that mention these
}
→ [DocumentationGroundingFact]
```

### Rules (HARD)
1. **Every documentation chunk must include exact source spans (line, heading path).**
2. **Go Retrieval can return line-aware evidence for error fixing.**
3. **Do NOT use documentation chunks interchangeably with code chunks.**

---

## 9. Graphify Ingestion Boundary: Rust/simdjson (LOCKED)

### Problem
Simdjson is called for every retrieval request; Rust layers are added without measured justification.

### Decision
Use Rust/simdjson only at the ingestion boundary when there is a measured bottleneck.

### Justified Boundaries
- Consuming very large NDJSON Graphify outputs (>1GB)
- Validating UTF-8 correctness at scale
- Decoding millions of records
- Compiling artifacts into Arrow or Parquet
- Parsing large external corpora (GitHub archives, etc.)

### Not Justified
- Ordinary Node batch JSON parsing
- Small MCP responses
- Real-time ACE packet processing

### Suggested Boundary: `atlas-index-compiler`
```
Graphify NDJSON
     │
     ▼
atlas-index-compiler (Rust + simdjson)
     ├── simd-json or simdjson binding
     ├── schema validation
     ├── deterministic sorting
     ├── duplicate detection
     ├── hash verification
     └── Arrow/Parquet output
          │
          ▼
       PostgreSQL
```

### Rules (HARD)
1. **Do NOT add Rust without measured parser or validation bottleneck.**
2. **Use DuckDB NDJSON reader for analytical ingestion instead of custom Rust.**
3. **For Node: `JSON.parse()` is adequate for small batches.**

---

## 10. Redis Centroid Keys (LOCKED)

### Problem
Centroid keys lack identity and versioning; revisions are silent.

### Decision
Use hierarchical keys with explicit contract and snapshot identity.

### Key Patterns
```
atlas:centroid:{embeddingContract}:{snapshotId}:{clusterId}
atlas:som:{embeddingContract}:{snapshotId}:{cellId}
atlas:query:{queryEmbeddingHash}:{retrievalContract}
atlas:ace:{queryHash}:{corpusRevision}:{contextPolicy}
atlas:graph:{graphSnapshotId}:pagerank:{packetKey}
```

### Centroid Record Schema
```json
{
  "clusterId": 17,
  "embeddingContract": "atlas-autoencoder-768x64-v1",
  "snapshotId": "snapshot-2026-07-21",
  "memberCount": 382,
  "centroid": [/* 64-dim float array */],
  "medoidPacketKey": "packet:...",
  "topTerms": ["auth", "validation", "jwt"],
  "topDomains": ["security", "identity"],
  "contentHash": "sha256:...",
  "createdAt": "2026-07-21T12:34:56Z"
}
```

### Rules (HARD)
1. **Redis is the hot lookup layer, NOT the authoritative cluster registry.**
2. **Always include contract and snapshot ID in keys.**
3. **Validate contract before using a cached centroid.**

---

## 11. Daily Graphify Execution Order (LOCKED)

### Stage 0: Authority and Schema Gate
**Stop if any gate fails. Do NOT silently fall back to a different collection or dimension.**

```
✓ CANONICAL_POSTGRES              reachable
✓ QDRANT_COLLECTION_CONTRACT      valid (embedding contract matched)
✓ NEO4J_GDS                        available
✓ REDIS                            reachable
✓ EMBED_SERVER                     correct model (embeddinggemma:latest, 768-dim)
✓ GEMMA4_LLAMA_SERVER              healthy
✓ GO_RETRIEVAL                     reachable
```

### Stage 1: Incremental File Inventory
Use ripgrep's file enumeration and `.gitignore` behavior.

**Outputs**:
- `indexed_file_candidates.ndjson`
- `deleted_files.ndjson`
- `changed_files.ndjson`
- `unchanged_files.ndjson`

**Identity**: workspace_id + normalized_path + content_sha256

### Stage 2: Structural Extraction
For supported programming languages:
- Tree-sitter parse
- ast-grep rules
- Declaration extraction
- Imports/exports
- Calls
- Schema/table usage
- MCP/tool calls
- Route relationships
- Test-to-source relationships
- Precise byte and line spans

**Output**: `structural_facts` table

### Stage 3: Lexical and NLP Extraction
Process:
- Identifiers
- Comments
- Docstrings
- Filenames
- Paths
- Markdown
- SQL
- Configuration files
- Error messages

**Separate lemmas and POS classes. Store extraction method and confidence per fact.**

**Output**: `lexical_facts` table

### Stage 4: Documentation Grounding
Run LangExtract only for prose-heavy sources.

Extract:
- Claims
- Requirements
- Decisions
- Acceptance criteria
- Referenced source files
- Commands
- Technologies
- Causal statements

**Maintain exact source spans.**

**Output**: `document_grounding_facts` table

### Stage 5: Canonical PostgreSQL Upsert
All canonical facts land in PostgreSQL first.

**Hard rule**: No direct writes from extractor to Neo4j, Qdrant, Redis, or model-label tables.

Commit a canonical snapshot manifest with SHA-256 integrity.

### Stage 6: Embedding Generation
Generate only for changed or missing content hashes.

Store embedding provenance and contract.

**Contract validation**: Verify `embeddinggemma-full768-v1` before storing.

**Output**: `embedding_run_manifests` table

### Stage 7: Qdrant Projection
Project:
- Code chunks
- Documentation chunks
- Summaries
- Optional sparse vectors
- Exact identity metadata

**Hard rule**: Do NOT store PageRank as vector content. Store it as payload metadata.

**Output**: Qdrant `codebase_chunks_768` collection updates

### Stage 8: Graph Projection
Export deterministic node and edge sets from PostgreSQL to Neo4j.

**Suggested nodes**:
- File, Chunk, Symbol, Function, Class, Route
- DatabaseTable, Tool, Concept, Document
- Requirement, ErrorFingerprint, Test

**Suggested edges**:
- CONTAINS, DECLARES, IMPORTS, CALLS, EXPORTS
- USES_TABLE, USES_TOOL, IMPLEMENTS, TESTS, DOCUMENTS
- REFERENCES, USES_CONCEPT, FAILS_WITH, FIXED_BY, DERIVED_FROM

**Output**: Neo4j graph structure

### Stage 9: Neo4j GDS
Run:
- Graph projection (validate parity with PostgreSQL)
- PageRank (only after projection passes all gates)
- Weakly connected components
- Louvain or Leiden clustering
- Optional node similarity
- Export derived metrics

**Validation**: All seven graph gates must PASS before proceeding.

**Output**: `graph_run_manifests` table

### Stage 10: Autoencoder, K-means, and SOM
Run against a frozen embedding snapshot.

Produce:
- Model manifest
- Reconstruction metrics
- Clustering metrics
- Centroid artifacts
- SOM assignment artifacts
- Packet-to-cluster mapping
- Reproducible seeds

**Output**: `clustering_run_manifests` table, Redis centroids

### Stage 11: Redis Warmup
Warm:
- Cluster centroids
- SOM neighbors
- Graph authority
- Common retrieval plans
- Recent ACE packet summaries

### Stage 12: Go Retrieval Smoke
Validate all lanes individually and together.

### Stage 13: Agentic Error-Fixing Smoke
Use a known failing test or compile error:

```
error captured
  → fingerprint generated
  → HMM OBSERVE/DIAGNOSE
  → Go Retrieval evidence (all 7 lanes)
  → ACE packet assembly
  → Gemma4 patch proposal
  → Zod/policy validation
  → isolated patch
  → focused test
  → VERIFY
  → outcome ledger entry
```

### Stage 14: Promotion Report
**No "complete" status unless the report contains measured coverage and acceptance gates.**

Example report structure:
```
GRAPHIFY_DAILY_EXECUTION_2026_07_21

Stages: 0-14 PASS
Gate coverage:
  - CANONICAL_POSTGRES: ✓
  - QDRANT_COLLECTION_CONTRACT: ✓
  - GRAPH_NODE_PARITY: 100% (61659/61659)
  - GRAPH_EDGE_PARITY: 100% (185234/185234)
  - PAGERANK_FINITE: 99.2% (61432/61659)
  - GO_RETRIEVAL_SMOKE: 7/7 lanes PASS

Outputs:
  - Indexed files: 1,247 changed
  - Structural facts: 156,891 new
  - Lexical facts: 892,341 new
  - Embeddings: 1,247 generated (contract: embeddinggemma-full768-v1)
  - Qdrant points: 1,247 updated
  - Neo4j nodes: 5,432 new, 234 updated
  - PageRank: 61,432 computed (2.09 convergence)
  - Centroids: 400 warmed
  - Error fixing smoke: 1/1 PASS

Duration: 1h 42m 18s
```

---

## Summary: No Parallel Classifiers

**This specification LOCKS the architecture against**:
- Building a separate embedding lane (use contracts instead)
- Creating a monolithic Graphify extension (use stage orchestration)
- Conflating PageRank with relevance (it is derived authority only)
- Mixing lexical classes (use separate evidence tables)
- Generic "summaries" without extraction method (store provenance)
- Silent fallback to different vector dimensions (fail hard on contract mismatch)

**Instead, consolidate**:
- Existing ACE packet handling
- Multi-lane retrieval architecture
- Parent Atlas Graphify scripts
- Go Retrieval service as normalization boundary
- Explicit embedding contracts
- Separated lexical evidence classes
- Deterministic graph authority
- HMM error-fixing workflow (already exists)

**Next phase**: Implement the daily Graphify execution order (Stages 0-14) with measured gates. Do not deviate without architectural review.
