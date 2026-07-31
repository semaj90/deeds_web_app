# Phase 110: Agentic Code Index — Implementation Prompt

## Objective

Implement Phase 110 as a **revision-aware acquisition, indexing, retrieval, graph, context, and sourced synthesis system**.

### Canonical Owner Preservation

The following owners must be preserved and verified:

- **PostgreSQL 18**: Canonical authority (Drizzle ORM schema mapping, atomic commits, immutable append-only)
- **SeaweedFS**: Raw and large object storage (S3 gateway port 8333)
- **Qdrant**: Online dense and sparse retrieval projection (not canonical authority)
- **Neo4j**: Bounded interactive topology projection (not canonical fact storage)
- **Valkey**: Ephemeral hot cache, cursor state, context cards
- **Arrow IPC**: Offline array interchange and GPU benchmark input
- **cuVS**: Isolated GPU ANN benchmarking (never online production)
- **Gemma4**: Structured synthesis through llama-server only (never direct model calls from retrieval)

**Hard rule**: Do not introduce a second source of truth. All identity, lineage, and ACL flows through Postgres.

---

## Completion State and Gate Evidence Requirements

### Current Phase 110 Status

```
PHASE_110: NOT_PROVEN
MILESTONE_1: PARTIAL
MILESTONE_2: NOT_RUN
MILESTONE_3: NOT_RUN
MILESTONE_4: NOT_RUN
```

### Gate Evidence Strictness

**Do not report gates 1-5 as PROVEN unless independent runtime evidence exists for each gate.**

- Gate 4 is NOT_PROVEN until canonical chunk readback is independently implemented
- Gate 5 is NOT_PROVEN until:
  - A real 768-dimensional embedding is generated from a live embedding endpoint
  - The embedding is persisted to Postgres atlas_chunks
  - The immutable model artifact (not "latest") is resolved and recorded
  - The embedding is read back and verified to match the persisted value
  - The model digest (SHA-256) is captured and immutable

**Gates 6-16 are NOT_RUN, BLOCKED, or NOT_IMPLEMENTED until executed.**

### Stop Conditions (Hard Blockers)

Do not proceed with implementation if any of these are unresolved:

1. ❌ Workspace identity type is ambiguous (UUID vs integer vs string)
2. ❌ Embedding endpoint does not return exactly 768 finite values
3. ❌ Model artifact cannot be resolved to an immutable digest
4. ❌ Existing schema ownership conflicts (duplicate document/chunk tables)
5. ❌ Existing module likely owns a requested capability but is unresolved (uncontacted barrel export)
6. ❌ Barrel export cannot be resolved through TypeScript module path
7. ❌ Migration includes an unapproved DROP statement
8. ❌ Live database would be modified during discovery or testing
9. ❌ Qdrant collection identity or representation revision is ambiguous
10. ❌ ACL scope cannot be proven (private/workspace/public boundaries unclear)
11. ❌ Source revision cannot be established (web fetch timestamp or git commit SHA)
12. ❌ SeaweedFS object readback fails (write hash ≠ read hash)
13. ❌ Projection parity fails (Qdrant ≠ Postgres, Neo4j ≠ Postgres)
14. ❌ Feature ID ordering is nondeterministic (feature_id_order_hash varies)
15. ❌ GPU memory contention invalidates the benchmark

**Do not replace a blocked state with a mock and call it complete.**

---

## Mandatory Existing Owner Discovery

**Before creating or replacing any module**, search the repository for definitions, re-exports, imports, callers, tests, documentation, and OKF records for:

### Embedding and Retrieval Lanes

- `embedQueryForLane`
- `combineRRFLanes`
- `resolveParentAtlasContext`
- `reciprocal_rank_fusion`
- `denseScoringLane`
- `lexicalScoringLane`
- `graphScoringLane`
- `topologyScoringLane`

### Graph and Topology

- `hypergraphStore`
- `hyperragExpand`
- `graphExpand`
- `topoNeighbors`
- `boundedExpansion`

### Context Compression

- `compressFileToCard`
- `compressTraceToCard`
- `compressResearchToCard`
- `buildAttentionToc`
- `contextCard`
- `FileCard` | `TraceCard` | `ResearchCard`

### Acquisition and Ingestion

- `autoTagDocument`
- `Crawl4AI`
- `crawl4ai`
- `crawled_document`
- `CrawledDocument`
- `acquisition_envelope`
- `AcquisitionEnvelope`
- `projection_outbox`
- `document_ingestion`
- `chunk_ingestion`
- `atlas_documents`
- `atlas_chunks`

### Fact and Fact Arguments

- `atlas_facts`
- `atlas_fact_arguments`
- `fact_persistence`
- `nary_fact`

### Commands

```bash
cd /c/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Search for embedding/RRF lane implementations
rg -n "embedQueryForLane|combineRRFLanes|resolveParentAtlasContext|reciprocal.*rank|RRF" \
  src/ scripts/ tests/ --glob="*.ts" --glob="*.mts" --glob="*.mjs"

# Search for graph/topology implementations
rg -n "hypergraphStore|hyperragExpand|graphExpand|boundedExpansion" \
  src/ scripts/ tests/ --glob="*.ts" --glob="*.mts"

# Search for context compression
rg -n "compressFileToCard|compressTraceToCard|compressResearchToCard|buildAttentionToc" \
  src/ scripts/ --glob="*.ts" --glob="*.mts"

# Search for acquisition/ingestion
rg -n "Crawl4AI|crawl4ai|acquisition.*envelope|AcquisitionEnvelope" \
  src/ scripts/ --glob="*.ts" --glob="*.mts"

# Search for fact storage
rg -n "atlas_facts|atlas_fact_arguments|nary_fact" \
  src/ scripts/ drizzle/ --glob="*.ts" --glob="*.sql"

# Find all imports and re-exports
rg -n "export.*from.*embedding|export.*RRF|export.*context.*compress" \
  src/lib/ --glob="*.ts"
```

### Resolution Decision Matrix

For each unresolved import or requested capability, produce one decision:

| Decision | When to Use |
|----------|------------|
| `REUSE_EXISTING_OWNER` | Existing implementation is correct and complete, just wire it |
| `ADAPT_EXISTING_OWNER` | Existing implementation works but needs revision (signature, types, behavior) |
| `RENAME_IMPORT` | Implementation exists under different name, update imports |
| `REMOVE_DEAD_IMPORT` | Module listed but has no callers or tests, safe to delete |
| `CAPABILITY_TRULY_MISSING` | No owner found; safe to implement new |

**Do not create a new file until the last resolution is proven.**

---

## Drizzle Migration Discovery Checklist

**Before generating or applying the Graphify schema migration, run this 10-step pre-flight:**

1. ✅ Inspect `drizzle/meta/_journal.json` — list all journaled migrations (what's been applied)
2. ✅ Locate canonical Drizzle schema owner — `src/lib/server/db/schema-postgres.ts`
3. ✅ Verify UUID and ID helpers exist — `crypto.randomUUID()` or other source
4. ✅ Check workspace_id column type in existing tables — VARCHAR, UUID, or integer?
5. ✅ Verify chunk_id/packet_id naming consistency across schema
6. ✅ Inspect atlas_documents + atlas_chunks tables — pre-existing or new?
7. ✅ Check for FK constraints pointing to Graphify tables — risk of cascading deletes
8. ✅ Verify feature_id + feature_label nullable/required — schema assumptions
9. ✅ Inspect drizzle/manual/ for sidecar migrations — may conflict with generated SQL
10. ✅ Read CLAUDE.md Drizzle Safety Rule for migration approval workflow

**Produce a migration review packet containing:**
- Discovered schema owners
- Migration sequence (file order, version numbers, what each does)
- Proposed schema (Drizzle definitions, generated SQL, indexes, constraints)
- Compatibility risks (breaking changes, data loss scenarios)
- Rollback plan (reversibility, data recovery)
- Disposable database proof commands (how to test safely)

---

## Canonical Graphify Schema

**Use existing tables where they already own the capability.**

**Otherwise, the logical minimum is:**

```sql
-- Append-only execution records (no cascade deletes)
CREATE TABLE graphify_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  run_date DATE NOT NULL,
  indexed_files INTEGER,
  symbols_found INTEGER,
  edges_created INTEGER,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- File identity (stable across runs)
CREATE TABLE graphify_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  file_hash CHAR(64),
  UNIQUE(file_path)
);

-- Run-file membership (many-to-many)
CREATE TABLE graphify_run_files (
  run_id UUID REFERENCES graphify_runs(id),
  file_id UUID REFERENCES graphify_files(id),
  PRIMARY KEY(run_id, file_id)
);

-- Symbol definitions per file
CREATE TABLE graphify_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_name VARCHAR(255) NOT NULL,
  symbol_kind VARCHAR(50),
  file_id UUID REFERENCES graphify_files(id),
  line_number INTEGER,
  UNIQUE(symbol_name, file_id)
);

-- Symbol relationships (edges, DAG only)
CREATE TABLE graphify_edges (
  source_id UUID REFERENCES graphify_symbols(id),
  target_id UUID REFERENCES graphify_symbols(id),
  edge_type VARCHAR(50),
  PRIMARY KEY(source_id, target_id, edge_type)
);

-- Append-only outbox for topology projection
CREATE TABLE graphify_projection_outbox (
  id SERIAL PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL,
  projection_type VARCHAR(50),
  payload JSONB,
  projected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Required constraints:**
- All numeric ranges enforced: `byte_length > 0`, `end_byte > start_byte`
- Exactly one resolved or unresolved edge target per row
- Outbox idempotency: unique on (packet_key, projection_type)
- Content hash required
- Representation revision required

---

## Acquisition Envelope Contract

**Version the acquisition envelope schema:**

```typescript
interface AcquisitionEnvelopeV1 {
  schema_version: 'acquisition_envelope_v1';
  workspace_id: string;                 // TRUSTED SERVER CONTEXT ONLY
  source_kind: 'web' | 'git' | 'local' | 'api';
  source_ref: string;                   // Original URL, file path, or ID
  canonical_ref: string;                // Resolved URL after redirects
  provider: 'crawl4ai' | 'firecrawl' | 'beautiful_soup' | 'docling' | 'git_reader';
  provider_revision: string;            // Version or timestamp
  retrieved_at: string;                 // ISO 8601
  media_type: string;                   // text/html, application/pdf, etc.
  raw_content_hash: string;             // SHA-256 of raw fetched content
  normalized_content_hash: string;      // SHA-256 of normalized text
  normalization_contract_revision: string;
  raw_object_uri: string;               // SeaweedFS URI (if stored)
  normalized_object_uri: string;        // SeaweedFS normalized text URI
  diagnostics: {
    extraction_status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    extraction_error?: string;
    fallback_provider?: string;
    fallback_extraction_behavior_changed?: boolean;
  };
}
```

**Trusted ACL fields** (injected by server context, never from external provider):
- `workspace_id`
- `user_id`
- `access_scope` ('private' | 'workspace' | 'public')

**Hard rule**: Do not accept workspace_id, user_id, or access_scope from Crawl4AI or any external provider.

### Crawl4AI Rules

- Crawl4AI is the preferred browser-rendered acquisition adapter
- Default behavior must be deterministic (no JavaScript execution randomization)
- Do NOT enable LLM-powered extraction by default
- Any LLM extraction must be a separately versioned enrichment stage (after acquisition, before canonical persistence)

### Beautiful Soup Rules

- Beautiful Soup is a bounded, deterministic HTML repair fallback lane
- It is NOT a JavaScript renderer
- Fallback use must record: original Crawl4AI failure, fallback provider, fallback revision, changed extraction behavior

### Docling and OCR Rules

- Use native document text extraction (PDFs, images)
- Use standard Docling layout extraction (structured table/figure detection)
- Use OCR only for pages lacking usable text
- Granite Docling for complex layouts or failed pages
- Gemma4 VLM for bounded semantic interpretation of images
- **Gemma4 VLM must NOT replace OCR or deterministic layout extraction**

### SeaweedFS Rules

- SeaweedFS replaces MinIO as the S3-compatible object storage gateway
- Canonical S3 gateway port is **8333**
- Raw and large objects must be written **before or within the canonical ingestion workflow**
- Every object write proof must include: object_uri, object_hash, byte_length, write_timestamp, readback_hash, source_authority_id
- Do NOT claim SeaweedFS integration from environment variables alone

---

## Representation Rules

**Target representation**:

```
representation_id: semantic_768
embedding_family: embeddinggemma
embedding_dimension: 768
normalization: L2 (Euclidean)
```

### Embedding Endpoint Verification

Before enabling the contract:

1. Query the active embedding endpoint
2. Resolve its concrete model artifact (not "latest")
3. Record its SHA-256 digest (immutable)
4. Generate a test embedding (≥10 vectors)
5. Assert length exactly 768
6. Assert every value is finite (no NaN, no infinity)
7. Record normalization behavior (L2, cosine, none)
8. Persist immutable `representation_revision` (model artifact digest + timestamp)

### Hard Rules

- ❌ Never persist `embeddinggemma_latest`, `latest`, `current`, or `default` as durable representation revisions
- ❌ Never derive a 384-dimensional vector by truncating a 768-dimensional vector unless a separately versioned compatibility contract explicitly permits it and tests prove retrieval quality is acceptable
- ✅ Truncation is NOT a learned projection; if attempted, it must be explicitly versioned and independently validated

---

## Qdrant Projection Rules

Qdrant remains the online production retrieval projection.

### Required Logical Named Vector Lanes

- `semantic_768`: Canonical dense semantic representation (768-dim embeddinggemma)
- `bm42_sparse`: Sparse lexical/keyword representation (optional)
- `topology_128`: Learned topology routing (optional, deferred)
- `latent_64`: Routing or clustering hint only (optional, NOT for search)

### Required Payload Fields

Every Qdrant point must include:

```json
{
  "authority_id": "postgres_atlas_chunks_{id}",
  "authority_revision": "2026-07-30T12:34:56Z",
  "workspace_id": "workspace-123",
  "content_hash": "abc123...",
  "representation_id": "semantic_768",
  "representation_revision": "embeddinggemma:2026-07-30.1",
  "source_ref": "src/lib/server/auth.ts",
  "access_scope": "private",
  "acl_user_id": 123,
  "acl_workspace_id": "workspace-123",
  "projection_timestamp": "2026-07-30T13:00:00Z"
}
```

### Projection Workflow

```
1. Postgres transaction creates/updates authority records
2. Outbox events committed within same transaction
3. Outbox consumer reads events (async, non-blocking)
4. Qdrant upsert (wait: true, verify: true)
5. Qdrant readback validates payload parity
6. Mark outbox event as processed
```

### Testing Strategy

- Do NOT write to production Qdrant collection during discovery or migration testing
- Use a disposable test collection first: `test_phase110_baseline_768`
- Run: create → upsert → readback payload verification → delete test collection

---

## Neo4j Projection Rules

Neo4j is a projection and bounded traversal layer only. **Postgres is truth.**

### Canonical Fact Model (Postgres Truth)

```sql
CREATE TABLE atlas_facts (
  id UUID PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL,
  source_ref TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  predicate_id UUID,
  confidence REAL,
  source_revision VARCHAR(100),
  extracted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE atlas_fact_arguments (
  id UUID PRIMARY KEY,
  fact_id UUID REFERENCES atlas_facts(id) ON DELETE CASCADE,
  argument_index INTEGER,
  argument_name VARCHAR(100),
  argument_value TEXT,
  argument_type VARCHAR(50)
);
```

### Neo4j Projection

```cypher
-- Create fact nodes with immutable properties
CREATE (:Fact { fact_id: $id, predicate_id: $predicate, source_revision: $revision })

-- Create relationships to arguments
CREATE (:Fact)--[r:HAS_ARGUMENT { role: $arg_name, position: $position }]-->(:Entity { entity_id: $arg_id })
```

### Bounded Expansion Limits

- Maximum graph hops: **2**
- Maximum distinct seed entities: **16**
- Maximum seed facts: **24**
- Maximum fact fan-out per seed: **5**
- Maximum resulting facts: **60**
- Maximum final cited evidence chunks: **15**

### Hard Rule

**Never use Neo4j internal node IDs as durable identifiers.** All durable identity comes from `fact_id`, `predicate_id`, or `entity_id` stored in properties.

---

## Weighted RRF Rules

### Canonical Lane Weights

```
qdrant_dense:        0.35  (primary semantic)
postgres_lexical:    0.25  (keywords, identifiers)
entity_fact:         0.15  (structured relationships)
neo4j_graph:         0.10  (bounded topology)
topology_routing:    0.05  (SOM/K-means hints)
freshness_authority: 0.10  (time-based signals)
TOTAL:               1.00
```

### Reciprocal Rank Computation

```
authority_score = Σ(lane_weight × (1 / (k + rank)))

where:
  k = 60 (reciprocal rank constant)
  rank = position in lane results (1-indexed)
  lane_weight = normalized contribution weight
```

### Hard Rules

- ✅ Use reciprocal rank **per lane** (convert raw relevance scores to ranked positions first)
- ❌ Never mix raw lane relevance scores directly with reciprocal ranks without calibration
- ❌ Never assign zero weight silently to unknown lanes (unknown lane names must fail validation)
- ✅ Validate that configured weights sum to 1.0 within tolerance (±0.001)
- ✅ Emit a per-candidate trace showing:
  - packet_key
  - source_ref
  - lane ranks (position in each lane)
  - lane contributions (weight × reciprocal rank)
  - final RRF score
  - authority state
  - representation revision
  - any exclusions or filters applied

---

## Context Compression Rules

**Before wiring context-compression.ts, prove the following:**

### Cache Key Identity

1. ✅ Cache key includes `workspace_id` (scope isolation)
2. ✅ Cache key includes `source_revision` (invalidation on source change)
3. ✅ Cache key includes `content_hash` (verification)
4. ✅ Cache key includes `compression_contract_revision` (schema versioning)

Example key shape:
```
card:{file|trace|research}:{workspace_id}:{source_ref_hash}:{source_revision}:{compression_revision}
TTL: secondary only (primary invalidation via revision mismatch)
```

### ACL and Source Preservation

5. ✅ ACL identity cannot collide across users (workspace_id + user_id in key or payload)
6. ✅ sourceRef is preserved throughout card lifecycle (no lossy compression)
7. ✅ sourceRevision is preserved (git commit SHA or web fetch timestamp)
8. ✅ content_hash is preserved (for verification against Postgres)

### Tokenization and Tooling

9. ✅ Token count uses the **actual Gemma4 tokenizer** or a documented conservative approximation (e.g., chars / 4)
10. ✅ MCP tool names exist in the live registry (`/api/mcp/tools/list`)
11. ✅ Wiki note dependencies have a real producer and readback path
12. ✅ No duplicate FileCard/TraceCard/ResearchCard implementation exists across the codebase

### Detection Command

```bash
rg -n "FileCard|TraceCard|ResearchCard" src/ scripts/ \
  --glob="*.ts" --glob="*.mts" --glob="*.mjs"
# Should return only ONE implementation per type, not multiple
```

---

## ACE Packet Rules

**ACE packets must receive hydrated canonical evidence, not raw Qdrant payload.**

### Required ACE Schema

```typescript
interface ACEPacket {
  schema_version: string;
  workspace_id: string;
  workspace_revision: string;
  query_id: string;
  query_intent: string;
  evidence: {
    text: string;
    source_ref: string;
    source_revision: string;
    content_hash: string;
  }[];
  facts: {
    id: string;
    predicate: string;
    confidence: number;
    source_revision: string;
  }[];
  exclusions: string[];          // Filtered or rejected candidates
  retrieval_trace: {
    lane: string;
    rank: number;
    score: number;
  }[];
  ranking_trace: {
    candidate: string;
    rrf_score: number;
    authority_state: string;
  }[];
  token_budget: number;          // ≤4,800 tokens
  representation_revision: string;
  source_refs: string[];
  source_revisions: string[];
  content_hashes: string[];
}
```

### Token Budgeting

- Default maximum ACE budget: **4,800 tokens**
- Per-candidate maximum: **800 tokens**
- Token estimates must use the **actual Gemma4 tokenizer** where available, or a documented conservative fallback

---

## cuVS Benchmark Rules

cuVS is not a Phase 110 online production dependency.

### Implementation Order

**Phase 0**: Snapshot proof
- Export canonical Arrow IPC snapshot from Postgres
- Required fields: row_offset, feature_id, packet_key, source_ref, content_hash, representation_id, representation_revision, embedding[768]
- Required manifest: snapshot_id, workspace_revision, representation_id, representation_revision, point_count, dimension, dataset_content_hash, feature_id_order_hash, created_at
- Validation: reject if point_count differs, dimension ≠ 768, embeddings contain NaN/infinity, row ordering nondeterministic, feature_id_hash differs, representation_revision unresolved

**Phase 1**: Exact ground truth
- Use cuVS brute-force cosine similarity or equivalent exact GPU method
- Produce exact top-k for k ∈ {10, 50}
- Run same queries twice, verify deterministic neighbor IDs

**Phase 2**: Qdrant baseline
- Benchmark existing production Qdrant collection WITHOUT configuration changes
- Measure: recall@10, recall@50, mean latency, P50/P95/P99 latency, QPS
- DO NOT modify Qdrant instance during baseline

**Phase 3**: CAGRA proof
- Perform: build → search → serialize → terminate process → cold reload → search → neighbor parity comparison
- A same-process deserialize test is **insufficient**
- Serialized index must have manifest: dataset_content_hash, feature_id_order_hash, representation_revision, workspace_revision, point_count, dimension, metric, build parameters, cuVS version, CUDA runtime, GPU model
- Verify cold reload produces identical neighbors

**Later phases**: Only after Phase 3 passes
- CAGRA parameter sweep
- IVF Flat sweep
- IVF PQ sweep
- Qdrant GPU index build experiment (Vulkan, isolated)
- Filtered retrieval comparison
- TurboVec comparison
- Downstream RRF and NDCG evaluation

### Promotion Gates (Must All PASS)

- ✅ `CUVS_RUNTIME_AVAILABLE`: Can allocate GPU for cuVS
- ✅ `EXACT_GROUND_TRUTH_REPRODUCIBLE`: Brute-force runs deterministically (bit-identical twice)
- ✅ `CAGRA_COLD_RELOAD_PARITY`: Serialized index reloads with identical neighbors
- ✅ `FEATURE_ID_MAP_PARITY`: Feature ID mapping is 100% exact and reversible
- ✅ `STALE_REVISION_REJECTION`: Old/stale representation revisions are rejected before indexing
- ✅ `RECALL_AT_10`: ≥0.95 (95% of Qdrant top-10 found in cuVS)
- ✅ `RECALL_AT_50`: ≥0.97 (97% of Qdrant top-50 found in cuVS)
- ✅ `FILTERED_RESULT_CORRECTNESS`: 100% (filter criteria produce identical result sets)
- ✅ `END_TO_END_NDCG_REGRESSION`: ≤0.01 (NDCG degradation < 1%)
- ✅ `END_TO_END_LATENCY_IMPROVEMENT`: Materially significant (measured speedup vs Qdrant)
- ✅ `GPU_MEMORY_CONTENTION`: Acceptable for active runtime mode

### Resource Modes (Three Must Pass)

- `GPU_EXCLUSIVE_CUVS`: cuVS sole GPU consumer
- `GPU_SHARED_WITH_EMBEDDING`: cuVS shares GPU with embedding service (moderate contention)
- `GPU_SHARED_WITH_GEMMA4`: cuVS shares GPU with Gemma4 (highest contention)

**Failure behavior**: A failure under the shared Gemma4 mode is a **measured result**, not an automatic infrastructure defect.

---

## Qdrant Vulkan Experiment

Qdrant GPU index build is an **isolated index build experiment only**.

### Required Preparation

- Do NOT use the production volume
- Use different ports: separate listening port, separate admin port
- Create new named Docker volume for GPU-built indexes
- Verify GPU driver and Vulkan support (`nvidia-smi`, `vulkaninfo`)
- Verify Qdrant image includes GPU support (`docker image inspect --format '...'`)
- Record verified GPU image digest

### Readiness States

- ✅ `CUDA_VISIBLE`: `nvidia-smi` detects GPU
- ✅ `VULKAN_VISIBLE`: `vulkaninfo` succeeds, reports GPU device
- ✅ `QDRANT_GPU_CREATED`: Qdrant container started with GPU flag
- ✅ `GPU_INDEX_USED`: Qdrant startup logs show "GPU mode: enabled", collection creation uses GPU index option

### Hard Proof Requirements

- ❌ `nvidia-smi` alone does NOT prove Vulkan
- ❌ Qdrant startup logs mentioning GPU do NOT prove GPU indexing was used
- ✅ Verify Qdrant API returns `gpu_config: { enabled: true }` after startup
- ✅ Verify collection creation with `index_config: { on_disk: false, hnsw_config: { gpu: true } }`
- ✅ Verify index build timing shows GPU acceleration (orders of magnitude faster than CPU)

---

## Sixteen Gate Runner

### ProofState Enum

```typescript
type ProofState = 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED' | 'GATED' | 'SKIPPED';

interface GateResult {
  gate: string;                    // G1, G2, ..., G16
  state: ProofState;
  message: string;                 // Human-readable status
  proof_references: string[];      // URLs, file paths, trace IDs
  trace_id?: string;
  authority_revision?: string;
  started_at: string;              // ISO timestamp
  completed_at: string;
  error_details?: string;
}
```

### Gate Definitions

**G1**: Acquisition provider readback (Crawl4AI or equivalent)
**G2**: Pydantic/Zod contract validation (schema pass, no ZodError)
**G3**: Postgres document commit and readback (INSERT, SELECT, parity check)
**G4**: Postgres chunk commit and readback (INSERT chunks, SELECT, count matches)
**G5**: Real semantic_768 embedding generation and lineage readback (768-dim, finite, model digest recorded)
**G6**: Qdrant upsert and readback (payload field parity check)
**G7**: ACL-filtered top-k retrieval (private docs hidden from other users)
**G8**: Domain classification (applies domain_class tags correctly)
**G9**: Entity resolution (LangExtract + Wikidata linkage)
**G10**: N-ary fact persistence (atlas_facts + atlas_fact_arguments INSERT + readback)
**G11**: Neo4j projection and readback (Fact nodes + HAS_ARGUMENT edges)
**G12**: Bounded graph expansion (k-hop traversal produces ≤60 facts)
**G13**: Weighted RRF trace (deterministic, verifiable per-candidate trace)
**G14**: ACE packet assembly (≤4,800 tokens, sourced evidence)
**G15**: ACL isolation test (access_scope filtering works end-to-end)
**G16**: Sourced Gemma4 synthesis (structured output with citations, no hallucinations)

### Hard Rules

- ✅ Every gate must have explicit state, message, and proof evidence
- ❌ A gate must NEVER be PASS when its implementation contains a TODO for the proving readback
- ❌ A configured environment variable, imported module, client construction, or mocked result is NOT proof
- ✅ Proof must be **independent runtime evidence**: actual data written and read back, actual API called and response verified

---

## Twelve Ordered Tasks

**Execute in strict order. Do not skip.**

### Task 1: Contract Freeze (30 min)
Define identity revisions, hashes, proof states, representation states, and authority states.
**Proof**: Pydantic fixtures pass, Zod fixtures pass, invalid fixtures fail.

### Task 2: Existing Owner Inventory (60 min)
Map exact owners of: embedQueryForLane, RRF, HyperRAG, context compression, Crawl4AI, projection outbox, fact tables.
**Proof**: Owner matrix complete, all barrel exports resolved, no unresolved duplicate owners.

### Task 3: Acquisition Envelope (45 min)
Reconcile Crawl4AI, Docling, OCR, and direct fetch into one versioned contract.
**Proof**: Valid fixtures pass, invalid fixtures fail, fallback behavior recorded, provider revision tracked.

### Task 4: SeaweedFS Object Lane (30 min)
Write and read raw and normalized objects through port 8333.
**Proof**: write_hash == readback_hash, write_timestamp recorded, object_uri tracked.

### Task 5: Drizzle Schema Discovery (45 min)
Run the 10-step migration discovery checklist.
**Proof**: Migration review packet approved (schema owners identified, migration sequence mapped, risks documented).

### Task 6: Graphify Schema Migration (60 min)
Apply to a **disposable PostgreSQL 18 database** (not production).
**Proof**: Migration apply succeeds, INSERT/readback works, constraint failures trigger correctly, rollback succeeds, no live database mutation.

### Task 7: Crawl Ingestion (90 min)
Wire acquisition through validation, SeaweedFS, Postgres, and outbox.
**Proof**: G1 (acquisition readback) PASS, G4 (chunk persistence) PASS.

### Task 8: Embedding and Qdrant Projection (120 min)
Generate real semantic_768, persist lineage, project through outbox, readback.
**Proof**: G5 (embedding lineage) PASS, G7 (filtered retrieval) PASS, Postgres-Qdrant parity proven.

### Task 9: Classification and Graph Facts (120 min)
Wire classification, entity resolution, N-ary facts, and Neo4j projection.
**Proof**: G8, G9, G12 PASS, Neo4j-Postgres parity proven.

### Task 10: Retrieval Orchestrator (120 min)
Run all 6 lanes (exact, lexical, dense, sparse, entity, graph, topology) with RRF fusion.
**Proof**: G13 (RRF trace) PASS, ablation report shows per-lane contribution, deterministic trace reproduced.

### Task 11: Context Compression and ACE (90 min)
Create revision-aware cards and bounded ACE assembly.
**Proof**: G14 (ACE assembly) PASS, G15 (ACL isolation) PASS, stale card rejection tested, cache isolation verified.

### Task 12: Sourced Synthesis and Deployment Proof (60 min)
Call llama-server, validate structured sourced output, test cold startup and degraded modes.
**Proof**: G16 (sourced synthesis) PASS, service registry validation, cold start proof, degraded mode fallback.

---

## Completion Claim Rules

### Allowed Claims

- ✅ `STATICALLY_PRESENT`: File exists, compiles, no syntax errors
- ✅ `IMPLEMENTED`: Function/module has non-TODO code
- ✅ `UNIT_TEST_PROVEN`: Unit tests pass with mocked dependencies
- ✅ `DISPOSABLE_DB_PROVEN`: Integration tests pass on temporary PostgreSQL instance
- ✅ `LOCAL_RUNTIME_PROVEN`: Feature works against live local services
- ✅ `PROJECTION_READBACK_PROVEN`: Qdrant/Neo4j payload verified against Postgres truth
- ✅ `END_TO_END_PROVEN`: Gates 1-16 all PASS with real data and runtime evidence

### Claim Evidence Requirements

Every claim must identify:
- Exact test or script run ID
- Workspace revision
- Representation revision
- Proof artifact path (file, URL, trace ID)
- Pass/fail state

### Prohibited Claims

- ❌ `production ready`
- ❌ `fully operational`
- ❌ `complete`
- ❌ `proven` (without specifying which gate level)
- ❌ Claiming success when a git push completes (push proves only commits, not feature)
- ❌ Claiming success from a configured port (port proves only configuration, not implementation)
- ❌ Claiming success from client object construction (object proves only type system, not execution)
- ❌ Claiming a gate PASS when its implementation contains a TODO

---

## Immediate Next Execution

### Stop Implementation Here

Do not create new embedding, RRF, HyperGraph, or context compression modules yet.

### Execute in Order

1. **Task 2: Existing Owner Inventory** (60 min)
   - Search for embedQueryForLane, RRF, HyperRAG, context compression, Crawl4AI, projection_outbox, atlas_facts
   - Produce owner matrix
   - Resolve all unresolved imports
   
2. **Task 5: Drizzle Schema Discovery** (45 min)
   - Run 10-step migration checklist
   - Produce migration review packet
   
3. **Task 6: Graphify Schema Migration** (60 min)
   - Apply to disposable database
   - Verify INSERT/readback works
   - Do NOT modify production database

### Deliverable

**PHASE_110_OWNER_AND_SCHEMA_DISCOVERY_REPORT** must contain:

- Complete owner matrix (capability → current_owner → callers → tests → status → decision)
- Missing capability list (anything truly absent)
- Unresolved import list (items to rename/wire)
- Schema owner list (which tables/functions own which capabilities)
- Migration sequence (what order, what each migration does)
- Representation compatibility report (768-dim status, embedding model digest)
- Current sixteen gate matrix (G1-G16 states: PASS/NOT_RUN/BLOCKED/NOT_IMPLEMENTED)
- Minimal patch set (if any existing code needs revision)
- Proving test plan (how each gate will be independently validated)

**Only after that report is approved may implementation modify production source files.**

---

## Next Steps

### Crawl4AI Constraints

**Concurrency**: Max 3 parallel requests (set via `crawlBatch(urls, concurrency=3)`). Crawl4AI rate-limits aggressively; sequential retries with exponential backoff (1s, 2s, 4s).

**Timeout**: 45 seconds per URL. JavaScript-heavy sites (single-page apps, lazy-loaded content) require full render time.

**Retry Policy**: Automatic retry on network failures (max 2 retries). 4xx/5xx responses → logged as degraded, no retry.

**Output Validation**: Every response must pass Pydantic `CrawledDocumentSchema` or it's rejected (hard fail, logged as DEGRADED status).

**Deduplication**: Before INSERT, check `content_hash` against `atlas_documents`. If exists → return existing document_id with `wasDuplicate: true` (do NOT re-chunk).

**Chunking Strategy**: Default is sliding_window (2000-char chunks, 200-char overlap). Semantic chunking is deferred (requires TreeSitter + TreeChunker).

### Search Constraints

**Query Embedding**: Always use embeddinggemma:latest (768-dim canonical). Never use different dimensions for query vs candidate embeddings.

**Workspace Isolation**: All queries must filter by `workspace_id` in Qdrant AND `user_id` in Postgres. No cross-workspace results.

**Access Scope Enforcement**: 
- `private` → only owner sees
- `workspace` → only workspace members see
- `public` → anyone with link sees

If a query result doesn't match the user's access scope, FILTER IT OUT before returning.

**Result Capping**: Top-10 candidates maximum per lane, deduplicated by `packet_key` after RRF fusion.

**Freshness Decay**: Documents >30 days old get a -0.02 authority penalty. Documents 7-30 days old get +0.05 boost.

### SearXNG Discovery Constraints

**Discovery Only**: SearXNG returns URLs and snippets. DO NOT fetch from SearXNG. Use Crawl4AI for all fetching.

**No Persistence**: SearchObservationV1 results are ephemeral. Do NOT insert into Postgres canonical layer.

**Fallback**: If Crawl4AI fails on a SearXNG URL, log as FAILED but continue with next URL (do not break the discovery loop).

**Snippet Length**: SearXNG snippets are ≤500 chars. Full content comes from Crawl4AI, NOT from SearXNG snippet.

### Neo4j Topology Constraints

**No Schema Mutations from Retrieval**: Topology queries are read-only. All writes come from Phase 11 (hypergraph projection).

**Bounded Expansion**: k-hop traversal with depth≤2 and max 30 entities per query. Prevent runaway traversals.

**No Cycles in Fact Graph**: `atlas_facts` is a DAG. No circular USED_BY or DEFINED_IN relationships allowed.

**Community Detection**: Communities are pre-computed clusters (SOM, K-means) stored in `kmeans_cluster_id` and `community_id` payload fields. Queries use these for topology-aware ranking, not dynamic community detection.

### Qdrant Constraints

**No Named Vector Modifications**: Named vectors (`dense_content`, `dense_summary`, `bm42_sparse`, etc.) are immutable once written. Recomputing a vector requires DELETE + INSERT (idempotent).

**Payload Indexing**: Qdrant auto-discovers payload schema from inserted points. No manual index registration needed. GIN indexes are created automatically for array/string fields.

**Consistency Guarantee**: If a point exists in Qdrant, its `source_ref` + `packet_key` MUST match a Postgres `atlas_chunks` row with the same values. If mismatch → delete from Qdrant and re-fetch from Postgres.

**Storage Format**: Vectors are stored as `Float32Array` in memory (binary protobuf wire format). NO JSON serialization of vectors inside Qdrant API calls (this causes buffer overflows on Windows cmd.exe). Use streaming REST or direct gRPC.

**Dimension**: All vectors are 768-dim (embeddinggemma canonical). No 384d or 64d vectors in Qdrant.

---

## Data Formats and Encoding

### MessagePack (Redis Values)

Redis cache values use MessagePack for compact storage (not JSON):

```typescript
import msgpack from 'msgpack';

// Encode before Redis SET
const encoded = msgpack.encode({ packet_key, authority_score, freshness_boost });
await redis.set(`bitfrost:packet:${packet_key}`, encoded);

// Decode after Redis GET
const decoded = msgpack.decode(await redis.getBuffer(`bitfrost:packet:${packet_key}`));
```

### Protobuf (gRPC Services)

gRPC services (embedding, graph ML, reranking) use Protobuf wire format for low-latency binary transfer:

```protobuf
message RetrievalRequest {
  string query = 1;
  repeated string source_refs = 2;
  float authority_threshold = 3;
  int32 top_k = 4;
}

message RetrievalResponse {
  repeated Candidate candidates = 1;
  float total_latency_ms = 2;
}
```

### Arrow (Large Matrices)

Bulk embedding operations use Arrow IPC (inter-process communication) for zero-copy tensor exchange:

```typescript
// Write 52,380 vectors as Arrow table
const table = arrow.table({
  vector: arrow.field('vector', new arrow.List(new arrow.Field('item', arrow.float32()))),
  packet_key: arrow.field('packet_key', arrow.utf8()),
  source_ref: arrow.field('source_ref', arrow.utf8())
});
```

### Hexadecimal (Hashes)

Content hashes and identity keys use hexadecimal (lowercase, 64 chars for SHA-256):

```typescript
const contentHash = crypto.createHash('sha256').update(text).digest('hex');
// Example: 'abc123def456...' (64 hex digits)
```

---

## GPU and Rust Service Integration

### TurboVec Prefilter

**Role**: CPU-friendly SIMD vector index for offline filtering (does NOT replace Qdrant).

**When to use**: 
- Client-side inference (browser, WASM, low-memory devices)
- Offline codebase analysis (no network, no Qdrant access)
- Pre-ranking before Qdrant ANN (100× faster, 4-bit quantized, ±5% recall loss)

**When NOT to use**:
- Real-time retrieval APIs (use Qdrant directly)
- Exact similarity required (TurboVec is approximate)
- Large-scale searches >10K candidates (memory overhead)

### Rust N-API Bindings (`simd-json` + `libtorch`)

Two high-performance Rust bridges:

1. **simdjson N-API** (JSON parsing):
   - AVX2/SSE4.2 SIMD acceleration
   - 2-5× faster than V8 for JSON >1KB
   - Automatic fallback to V8 if SIMD unavailable
   - Used by: Qdrant response parsing, RabbitMQ message deserialization

2. **LibTorch N-API** (tensor operations):
   - GPU cosine similarity, clustering, graph analytics
   - Zero-copy Float32Array ↔ CUDA tensors
   - 100× faster than CPU for batch operations
   - Used by: RRF ranking fusion, domain classifier confidence aggregation

### Redis Centroid Cache

Topology-aware routing uses pre-computed centroids (SOM grid + K-means clusters) cached in Redis:

```
centroid:som:{x}:{y}       → embeddings for SOM cell (x, y)
centroid:kmeans:{id}       → embeddings for K-means cluster ID
centroid:community:{id}    → embeddings for community
```

**Update frequency**: Daily (after K-means + SOM retraining).

**Cache TTL**: 24 hours.

**Fallback**: If Redis miss, compute centroid on-the-fly from Postgres (slow but correct).

### ACE Packet Structure

Final assembled context (fed to Gemma4):

```typescript
interface ACEPacket {
  queryId: string;                    // trace ID
  userQuery: string;                  // original question
  candidates: {
    packetKey: string;
    text: string;                     // ≤800 tokens per candidate
    authorityScore: number;
    sourceRef: string;                // for citation
    evidence: { type, confidence }[];
  }[];
  totalTokens: number;                // ≤4,800
  assembledAt: string;                // ISO timestamp
  laneStats: {
    qdrant_dense: number;             // contribution %
    postgres_bm25: number;
    neo4j_graph: number;
    som_topology: number;
  };
}
```

---

## Proof Validation (16 Gates)

Run the full 16-gate suite before declaring success:

```typescript
const proof = await runEndToEndProof(
  sourceUrl,    // URL to test
  userId,       // test user ID
  workspaceId   // test workspace
);

console.log(`
  PROVEN: ${proof.summary.passedGates}/16 gates
  STATUS: ${proof.summary.overallStatus}
  
  Gate breakdown:
  ${Object.entries(proof.gates)
    .map(([name, result]) => `${result.passed ? '✓' : '✗'} ${name}`)
    .join('\n  ')}
`);
```

**Expected outcome for clean run**: 5/16 PROVEN (gates 1-5), 11/16 DEFERRED (gates 6-16 require external services).

---

## Implementation Workflow

1. **Create Zod schemas** (`crawled-document.schema.ts`) ✅ DONE
2. **Wire Crawl4AI client** (`crawl4ai-client.ts`) ✅ DONE
3. **Implement Postgres boundary** (`postgres-ingest-boundary.ts`) ✅ DONE
4. **Scaffold 16-gate proof** (`end-to-end-retrieval-flow.ts`) ✅ DONE
5. **Add N-ary facts schema** (Drizzle migration for `atlas_facts` + `atlas_fact_arguments`)
6. **Implement fact extraction** (gate 10 handler calling Gemma4)
7. **Wire retrieval orchestrator** (combine all 6 lanes with RRF fusion)
8. **Build ACE assembler** (bounded context envelope)
9. **Validate full pipeline** (run 16-gate suite end-to-end)
10. **Performance tune** (optimize lane weights, freshness decay, cache TTLs)

---

## Testing Strategy

### Unit Tests
- Crawl4AI client: mock HTTP responses, validate CrawledDocument schema
- Postgres boundary: test deduplication, chunking, lineage tracking
- RRF fusion: verify ranking formula correctness

### Integration Tests
- 16-gate proof suite (runs against real services)
- Lane degradation (simulate service failures, verify fallback)
- ACL isolation (ensure user_id filtering works)

### Performance Tests
- Latency per lane (target: <5s per lane, <20s total)
- Throughput (target: 100 queries/min)
- Cache hit rate (target: >80% with warm Redis)

