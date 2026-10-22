# Offline artifact chain (v1)

Covers matrix capability #20 (bulk tensor transport) and the offline path that feeds it. Offline processing only. Nothing in this chain runs in a request path.

## ADDED Requirements

### Requirement: Fixed stage order
The chain SHALL run in this order and SHALL NOT skip a stage:
1. **Index**: identity rows from the codebase index and AST. Source of truth stays in PostgreSQL.
2. **Reduce**: CouchDB MapReduce views produce derived aggregates. The views are rebuildable from stage 1 and are never canonical.
3. **Bulk artifact**: numeric data (embeddings, matrices, tensors) is written to an Apache Arrow IPC file. Bulk numeric data SHALL NOT enter RPC packets or prompts.
4. **Descriptor**: an RPC packet references the artifact by path, checksum, row range, schema revision and producer revision. It carries no values.

#### Scenario: Descriptor without values
- **WHEN** an RPC packet is created for an artifact
- **THEN** it SHALL contain the reference fields and SHALL NOT contain any array of numeric values

### Requirement: Arrow IPC artifact contract
An artifact SHALL be an Arrow IPC file with:
- an explicit schema and a schema revision
- at least 8-byte buffer alignment (the Arrow IPC format minimum), with 64-byte alignment and padding recommended for SIMD-friendly reads. This is a layout recommendation, not a guarantee that every consumer is faster.
- a SHA-256 checksum of the file bytes, recorded in the descriptor
- zero-copy readability through memory mapping

#### Scenario: Checksum mismatch
- **WHEN** a reader computes a different checksum from the descriptor
- **THEN** the reader SHALL refuse the artifact and SHALL NOT fall back to a partial read

### Requirement: CPU reader is the oracle
Every GPU consumer of an artifact SHALL have a CPU reader that produces the same values within a stated tolerance. A GPU result is promotable only after that parity check passes.

### Requirement: Prompt budget
Prompts SHALL receive only the descriptor and the ContextManifest summary. A prompt that carries a bulk array is a failure of this chain.

### Requirement: No bulk writes outside the offline job
Bulk artifacts are written only by the offline job. Request paths SHALL read descriptors only. Writing to PostgreSQL, Valkey, Qdrant or Neo4j from the chain is a separate gated step, and CouchDB view pushes are gated the same way.

### Requirement: Receipt per stage
Each stage SHALL write a receipt that names its input receipt, its output checksum and its producer revision. The four receipts together SHALL form one chain that a reviewer can replay.

## Existing owners (reuse, do not duplicate)

| Stage | Owner | Language |
|---|---|---|
| Index | `scripts/index-codebase-fast.mjs`, PostgreSQL identity rows | Node, SQL |
| Reduce | `src/lib/server/atlas/projections/mapreduce-view-v1.ts`, `scripts/couchdb-push-feature-card-views.mjs` | TypeScript, Node |
| Bulk artifact | `python/atlas_structured_value_arrow.py`, `python/parent_atlas_ontology/arrow_adapter.py`, `src/lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.ts` | Python, TypeScript |
| Descriptor | `src/lib/server/atlas/contracts/atlas-custom-rpc-packet-v1.ts`, `rpc-packet-registry-client-v1.ts` | TypeScript |

## Gaps (no owner yet)
- No single offline job that runs all four stages in order.
- No chained receipt that links the four stages.
- No checksum check on Arrow files at read time.
