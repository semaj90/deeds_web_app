# Parent Atlas Workstation Alignment

- Generated: 2026-10-13T16:45:45.9640980-07:00
- Overall status: **BLOCKED**
- Read-only: **True**

## Gate summary

| ID | Area | Gate | Status | Evidence |
|---|---|---|---|---|
| PA-HOST-001 | HOST | Docker runtime | PASS | RUNTIME_SMOKE_PROVEN |
| PA-GPU-001 | GPU | NVIDIA GPU visibility | PASS | RUNTIME_SMOKE_PROVEN |
| PA-PY-001 | PYTHON | Miniforge/Conda runtime | FAIL | NOT_PROVEN |
| PA-SVC-001 | SIDECAR | Python NLP / graph sidecar | PASS | RUNTIME_SMOKE_PROVEN |
| PA-PG-001 | POSTGRES | PostgreSQL runtime | PASS | RUNTIME_SMOKE_PROVEN |
| PA-PG-002 | POSTGRES | Postgres extensions and vector support | PASS | PRODUCTION_DATA_PROVEN |
| PA-PG-003 | POSTGRES | Canonical atlas_packets schema surface | PARTIAL | PRODUCTION_DATA_PROVEN |
| PA-ID-001 | IDENTITY | Canonical packet identity coverage | FAIL | PRODUCTION_DATA_PROVEN |
| PA-REP-001 | REPRESENTATION | latent_64 BYTEA contract | PASS | PRODUCTION_DATA_PROVEN |
| PA-TOPO-001 | TOPOLOGY | SOM 4D topology schema | PARTIAL | PRODUCTION_DATA_PROVEN |
| PA-PG-004 | POSTGRES | Canonical and topology index coverage | FAIL | PRODUCTION_DATA_PROVEN |
| PA-QD-001 | QDRANT | Qdrant runtime | PASS | RUNTIME_SMOKE_PROVEN |
| PA-QD-003 | QDRANT | Qdrant payload identity coverage | FAIL | PRODUCTION_DATA_PROVEN |
| PA-N4J-001 | NEO4J | Neo4j runtime | PASS | RUNTIME_SMOKE_PROVEN |
| PA-REDIS-001 | CACHE | Redis/Valkey runtime | FAIL | NOT_PROVEN |
| PA-SVC-002 | MODEL | Embedding service | FAIL | NOT_PROVEN |
| PA-SVC-003 | MODEL | LLM orchestration server | PASS | RUNTIME_SMOKE_PROVEN |
| PA-REP-002 | REPRESENTATION | Representation lane separation | PARTIAL | STATIC_WIRING_PROVEN |
| PA-DAG-001 | DAG | Revision-qualified analysis DAG | PASS | STATIC_WIRING_PROVEN |
| PA-DAG-002 | DAG | Mutation safety and schema validation | PARTIAL | STATIC_WIRING_PROVEN |
| PA-RET-001 | RETRIEVAL | Semantic reranker wiring | PARTIAL | SOURCE_PRESENT |
| PA-OPS-001 | OPERATIONS | Graph artifact freshness | FAIL | PRODUCTION_DATA_PROVEN |
| PA-OPS-002 | OPERATIONS | Graphify stage isolation | PARTIAL | STATIC_WIRING_PROVEN |

## Recommendations

### P0 PA-ID-ALIGN - Reconcile live Postgres and application schema

Runtime schema and application declarations are not fully aligned.

**Action:** Generate a complete live-vs-Drizzle diff, classify active writers, and patch only the application mapping first.

**Validation:**
- npm run check
- schema import smoke
- read-only information_schema diff

**Prohibited scope:**
- No ALTER TABLE
- No representation_id invention
- No production backfill

### P0 PA-ID-COVERAGE - Repair canonical identity coverage

Canonical packet rows are missing packet, source, or workspace identity.

**Action:** Classify missing rows by writer/provenance, quarantine ambiguous rows, and correct the canonical writer before projection repair.

**Validation:**
- packet_key coverage = total rows
- source_ref coverage = total rows
- workspace_id coverage = qualified rows

**Prohibited scope:**
- Do not derive workspace identity from unrelated fields
- Do not use Qdrant point IDs as canonical identity

### P1 PA-DAG-MUTATION - Enforce validated DAG mutations

Agentic repair must not write without schema validation, revision checks, and durable receipts.

**Action:** Require read-only analysis, typed repair plan, dry-run, stale-revision guard, explicit approval boundary, mutation, and validation receipt.

**Validation:**
- invalid transition rejected
- stale revision rejected
- dry-run performs zero mutations
- mutation receipt contains before/after revisions

**Prohibited scope:**
- No autonomous production mutation
- No mutation without canonical packet identity

### P1 PA-PROJ-QDRANT - Prove and repair Qdrant projection identity

Production Qdrant payloads are not fully canonical or revision-qualified.

**Action:** Run the isolated write/read/join fixture, patch the active writer, then deterministically re-upsert or rebuild production points.

**Validation:**
- isolated upsert count = selected count
- readback count = upsert count
- packet_key join failures = 0
- production payload sample coverage = 100%

**Prohibited scope:**
- No HyperRAG promotion before projection proof
- No production mutation before isolated fixture passes

### P1 PA-TOPO-4D - Define the canonical 4D topology contract

SOM/topology coordinates are missing or only partially modeled.

**Action:** Choose one versioned coordinate schema, define indexing/query semantics, and keep topology separate from semantic vectors.

**Validation:**
- coordinate coverage
- coordinate range checks
- topology revision ownership
- bounded nearest-cell retrieval

**Prohibited scope:**
- No retraining until the schema and writer are proven
- No topology score folded into semantic vector dimensions

### P2 PA-OPS-GRAPHIFY - Repair graphify freshness and stage isolation

The code graph is stale or missing.

**Action:** Make graph extraction independently resumable and keep optional SOM/GPU stages from blocking graph refresh.

**Validation:**
- codebase-graph.json age below threshold
- stage receipt written
- failed optional topology stage does not block graph output

**Prohibited scope:**
- No broad topology rerun during graph-only validation

## Kanban

- **BLOCKED:** PA-PY-001, PA-ID-001, PA-PG-004, PA-QD-003, PA-REDIS-001, PA-SVC-002, PA-OPS-001
- **READY:** PA-ID-ALIGN, PA-ID-COVERAGE, PA-PROJ-QDRANT, PA-TOPO-4D, PA-DAG-MUTATION
- **VERIFY:** PA-PG-003, PA-TOPO-001, PA-REP-002, PA-DAG-002, PA-RET-001, PA-OPS-002
- **DONE:** PA-HOST-001, PA-GPU-001, PA-SVC-001, PA-PG-001, PA-PG-002, PA-REP-001, PA-QD-001, PA-N4J-001, PA-SVC-003, PA-DAG-001
- **DEFERRED:** derived graph enhancements, CAGRA promotion, latent lane promotion to ANN, autonomous production mutations

## Daily operating policy

### Fast read-only
- Docker/GPU/service health
- Postgres identity coverage
- Qdrant payload sample
- latent_64 byte-size validation
- graph artifact freshness

### Nightly bounded
- isolated Qdrant write/read/join
- bounded HyperRAG route proof
- summary exact-source resolution sample
- PageRank attachment sample

### Weekly or manual
- exact cuVS vs Qdrant HNSW parity
- cuGraph snapshot analytics
- production projection rebuild
- SOM retraining
- derived graph enhancement jobs

