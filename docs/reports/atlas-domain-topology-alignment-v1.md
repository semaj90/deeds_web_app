# Atlas Domain, Ontology, Topology, and GPU Alignment

Status: read-only gap review, 2026-08-24.

## Ownership Map

| Concern | Existing owner | Current state | Gap to close |
|---|---|---|---|
| Domain hierarchy/taxonomy | `.okf/domains/*`, domain prediction contracts | CREATED/WIRED | Validate every label against declared taxonomy, provenance, trust, and lifecycle. |
| Ontology linked tuples | `ontology-proposal.ts`, classification ledger, ORF masks/tags | CREATED/WIRED | Produce grounded tuples from AST/entity evidence; no live tuple materialization is proven. |
| Engram memory | Engram API spec, MCP tools, Redis adapter | PARTIAL | Valkey-vs-Redis ownership, revisioned memory envelope, and one-to-many metadata lookup are not unified. Engram remains coordination/memory, not canonical truth. |
| JSON acceleration | `simdjson-bridge.ts`, native N-API addon | WIRED | JSON/NDJSON only. It must not parse protobuf, gRPC frames, tensors, or source ASTs. Native availability and fallback telemetry need a live receipt. |
| Feature map | `feature-extraction-v1.ts`, `build-codebase-feature-map.mjs`, 25-column candidate matrix | CREATED/PARTIAL | CandidateOrdinal join, feature revision, and live 512-to-96 ranking receipt are missing. |
| Low-rank selection | `python/atlas_compute/low_rank.py` | Unit-proven only | No live CandidateFeatureMatrix snapshot, 512-to-96 selection, or exact-rerank quality proof. |
| gRPC boundary | Parent Atlas client and proto/index audit | WIRED/PARTIAL | No single typed RPC receipt for feature-map batches, ordinal maps, topology features, and memory budgets. |
| Four-dimensional topology | `TopologyFeature4`, SOM 20x20 contracts | Contract/fixture level | No production assignment snapshot with feature revision, prototype checksum, and CandidateOrdinal checksum. |
| RTX/cuGraph execution | WSL2 RAPIDS and native CUDA/LibTorch surfaces | Algorithm-specific proof | CPU/RTX parity, free VRAM, worker cap, dtype layout, and no-silent-fallback receipt remain open. |
| Tricubic / cuTile / SIMT | No verified canonical owner found | UNRESOLVED | “7 x 3”, “12/24”, and cache-tile meanings need a source, parameter schema, and benchmark before entering Atlas contracts. |

## Meaning of “One-to-Many”

One canonical packet or entity may reference many derived values:

```text
packet_key
  -> many domain labels
  -> many ontology tuples
  -> many AST symbols
  -> many graph edges/hyperedges
  -> many feature key/value pairs
  -> one semantic_768 vector
  -> zero or more derived MRL/latent/topology projections
```

The key/value metadata is an indexed projection, not identity. Use typed columns
for joins and JSONB/flattened tags for bounded discovery. Every derived value
needs `feature_revision`, `source_revision`, and `evidence_refs`.

## Four-Dimensional Topology Contract

The four coordinates are continuous routing features, not IDs:

```text
[semantic_locality, structural_locality, graph_locality, ontology_locality]
```

They may feed PyTorch/SOM/cosine or L2 geometry. Domain IDs, ontology IDs,
community IDs, PageRank ranks, and SOM neuron IDs remain categorical or
revisioned references beside the vector. A quaternion/manifold4 value is a
derived topology/ontology feature only; it cannot replace semantic_768 or
canonical identity.

## GPU and Transport Boundary

- simdjson: large JSON/NDJSON manifests and receipts.
- protobuf/gRPC: typed cross-process tensors, ordinal maps, and receipts.
- Arrow/typed arrays: bounded numeric matrix transport.
- NetworkX/cuGraph: graph algorithms over integer ordinals.
- PyTorch/LibTorch: feature math and encoder execution.
- Valkey: hot membership/centroid/cache projections.
- Postgres: canonical packets, revisions, evidence, and promotion ledger.

Do not JSON-parse a protobuf frame, send full tensors through JSON, or let a
GPU vertex ID become canonical identity. The required GPU receipt must include
dtype, shape, row-major/column-major convention, device, free VRAM, host RAM,
worker count, fallback state, and checksum of the ordinal map.

## Bit Encoding Correction

Protocol Buffers varints use one continuation bit, the most significant bit,
and seven payload bits per byte. That continuation bit is not an Atlas
allow/stop bit. Protobuf field tags separately encode the field number and a
three-bit wire type. Model execution control explicitly, for example:

```text
allow_execution: bool
candidate_validity_mask: packed uint32[]
fallback_state: enum
```

MessagePack and JSON remain descriptor/receipt formats. simdjson may accelerate
JSON and NDJSON parsing, but it cannot replace protobuf decoding. Numeric GPU
matrices should use Arrow/typed arrays or protobuf `bytes` with a declared
dtype, shape, layout, and checksum.

## Tang and L2 Normalization Correction

Ewin Tang's quantum-inspired work depends on data structures that provide
`l2`-norm sampling/query access to matrix rows and entries. It does not define
embedding L2 normalization. Keep these separate:

```text
embedding geometry: x / max(||x||2, eps), then cosine or inner product
Tang-inspired sampling: row_norm_squared, sampler, row/entry query
```

The Tang-inspired lane remains `INSPIRED_ONLY` until those sampling access
structures and a 512-to-96 CandidateOrdinal receipt exist.

## Proposed Wire Decomposition

```text
Postgres canonical packet/revision/evidence
  -> JSON/NDJSON export and simdjson validation
  -> ast-grep/NLP/domain/ontology prefill
  -> typed feature rows and CandidateOrdinal map
  -> Arrow/typed numeric matrix
  -> protobuf/gRPC envelope and receipt
  -> NetworkX CPU or cuGraph RTX graph execution
  -> PyTorch/LibTorch feature math and L2 normalization
  -> SOM/low-rank/ANN admission
  -> exact semantic_768 rerank
  -> ACE/Engram context descriptor
```

Every boundary preserves `packet_key`, `CandidateOrdinal`, source and
representation revisions, checksums, and fallback state.

## Nibble, Wire Type, and PostgreSQL Storage

These are different concepts:

| Term | Correct meaning | Atlas use |
|---|---|---|
| Nibble | 4 bits | Quantized weight/code storage only, with a scale/zero-point or codebook. |
| Protobuf wire type `3` | Deprecated start-group wire type | Never treat as a 3-bit feature or allow flag. |
| Protobuf varint | 7 payload bits plus continuation bit | Integer lengths, enum/bool fields, counters. |
| PostgreSQL AIO | Queued I/O for scans, bitmap heap scans, vacuum | Storage execution improvement, not a vector format. |
| PostgreSQL bitmap | Index/heap block membership representation | Filter masks and exact membership, not cosine geometry. |

For the current 768-dimensional lanes, the pgvector storage math is roughly:

```text
vector(768):   4 * 768 + 8 = 3,080 bytes
halfvec(768):  2 * 768 + 8 = 1,544 bytes
bit(768):      768 / 8 = 96 bytes
```

These sizes fit the ordinary PostgreSQL page scale, but index tuples,
visibility, alignment, and surrounding row data still matter. Do not call
`bit(768)` a semantic embedding: it is a binary routing or Hamming/Jaccard
representation. Keep `semantic_768` as the canonical float representation and
use halfvec/bit/nibble forms only as explicitly revisioned projections.

## Existing Runtime Alignment

- TurboVec already has a packed-byte reference, but its 4-bit quantization
  requires a real codebook/scale and quality receipt before promotion.
- The repository already has `packbits` contextual feature planes for boolean
  masks; these are suitable for membership/filtering, not dense similarity.
- The Node N-API/LibTorch path uses row-major `Float32Array` matrices and CPU
  fallback. Interpolation is not a proven shared operation and must not be
  inserted between embeddings and ranking without a parity test.
- simdjson can validate/parse packet descriptors and metadata, but numeric
  matrices stay typed and binary.
- Drizzle should own schema declarations and migration metadata; vector index
  methods and expression indexes remain explicit SQL assets that require a
  read-only schema audit before adoption.

## Contract Separation Addendum

The proposed fabric is coherent only if these remain separate contracts:

`SOURCE -> AST/NLP -> EVIDENCE -> DOMAIN -> TAXONOMY -> ONTOLOGY -> FEATURE
MAP -> TOPOLOGY_4D -> LOW_RANK -> ENGRAM -> GPU MATERIALIZATION -> gRPC`.

- Domain classification is a revisioned probability distribution, not an
  ontology ID or topology coordinate.
- Taxonomy is a hierarchical path; ontology is grounded typed relations.
- A feature map is one-to-many feature entries. It must not be represented as
  duplicate JSON/protobuf map keys. The durable/GPU form should be CSR-like
  `row_offsets`, `feature_ids`, `feature_values`, plus evidence and revisions.
- Engram is a deterministic lookup/residency layer. It is not canonical
  ontology storage or a replacement for the Postgres evidence ledger.
- PyTorch owns tensor semantics and numeric validation; cuTile/SIMT are
  execution choices for bounded kernels; gRPC transports typed descriptors and
  receipts only.
- simdjson is restricted to JSON/NDJSON ingestion and validation. It does not
  parse source ASTs, protobuf frames, or tensor memory.

Tricubic terminology must not leak into the graph schema. A tricubic cell has
`4 x 4 x 4 = 64` coefficients; Hermite-style groupings may be described as
`8 + 24 + 24 + 8`. Neither `7 x 3` nor `12/24` is an intrinsic Atlas topology
dimension. `TopologyFeature4` remains a revisioned numeric artifact, not an
interpolation claim. Any interpolation challenger requires its own operator,
shape, dtype, checksum, and retrieval-parity receipt.

The existing topology and ACP CSR contracts provide the right ordinal and
row-offset direction, but a single end-to-end feature-entry receipt is still
missing. The next proof must join `canonicalId`, `CandidateOrdinal`,
`sourceRevision`, `featureRevision`, `ontologyRevision`, `graphRevision`, and
`ordinalMapChecksum` across the materialization boundary.

## Operator Lookup Steps

1. Run the OKF validator and return domain/taxonomy failures.
2. Run the ontology tuple dry audit and return grounded versus ungrounded rows.
3. Run the Engram/Valkey health check and return the actual key namespace,
   TTL, and whether writes are disabled.
4. Run the simdjson bridge audit and return native versus JSON.parse counts.
5. Run the gRPC-to-Postgres index audit with `--validate-coverage`.
6. Return the feature-map schema revision, CandidateOrdinal checksum, and
   current matrix shape.
7. Return low-rank input/output counts and whether the 512-to-96 receipt exists.
8. Return WSL2 CUDA device, free VRAM, host RAM, worker cap, and dtype sizes.
9. For “tricubic 7x3” and “12/24”, provide the originating file, paper, API,
   or benchmark. Until then they remain unresolved labels, not implementation.

## Latest Coverage Result

The read-only gRPC/index audit passed the required `Packet`,
`TaskSemanticPacket`, and `ConceptRecord` mappings and both ACP queue contracts.
The optional `RouteRuntimePacket` mapping remains incomplete: its expected
`feature_id`/`route_state` columns and two named indexes were not found. This
does not block the core packet-to-feature-map boundary, but it blocks claiming
complete runtime-route coverage.

Receipt: `docs/reports/acp-contract-validation.json`.

## Safe Commands

Run from the repository root unless noted:

```text
node scripts/atlas/audit-simd-bridge-memory.mjs
node scripts/atlas/align-grpc-proto-to-postgres-indexes.mjs --validate-coverage
node scripts/atlas/audit-atlas-indexing-surfaces.mjs
npm --prefix sveltekit-frontend run atlas:graphify:neural-prefill:preflight
```

These are audit/preflight operations. Do not run symbol promotion, feature-row
materialization, Qdrant projection, or the full daily Graphify command as part
of this gap review.
