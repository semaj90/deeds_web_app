## 1. Contract and ownership

- [x] 1.1 Audited live PostgreSQL ownership without DDL: `workspaces.id` is
  the workspace owner; `atlas_packets` is the packet authority with
  `packet_key`, `source_ref`, `workspace_id`, `source_revision`, and lineage
  fields; `codebase_chunk_index` and `atlas_ast_nodes` are derived chunk/AST
  relations; no dedicated Qdrant projection registry or packet-chunk relation
  was found in the queried schema. A future registry must join back to these
  owners rather than replace them.
- [x] 1.2 Defined the registry lane, executor, collection, tag, index,
  representation, checksum, and write-policy TypeScript contracts.
- [x] 1.3 Added fixture tests for canonical identity resolution, inverted AST
  spans, and canonical-gated fail-closed behavior; all 3 tests pass.

## 2. PostgreSQL and Drizzle read model

- [x] 2.1 Added schema-tolerant read-only registry introspection using `information_schema` and `to_regclass` guards; the live audit reports canonical relations/indexes and the missing packet-revision owner without applying DDL.
- [x] 2.2 Added additive Drizzle schema/types for registry metadata (`atlasPacketRegistryProjections` in `atlas-packet-registry.ts`) without applying DDL to the live database.
- [x] 2.3 Produced a dry-run additive migration/index plan; it emits proposed DDL only and explicitly prohibits application, backfill, or identity fabrication.
- [x] 2.4 Added independent guarded readbacks for workspace→packet, packet→chunk/source revision, and packet→AST tree-node joins to the schema audit.

## 3. Semantic AST packet RPC

- [x] 3.1 Added additive protobuf messages for qualified semantic-AST packet
  requests and packets, reusing the existing shared context and receipt types.
- [x] 3.2 Regenerated Go and protobufjs bindings with the existing owners; no
  `ts-proto` dependency or generator was introduced.
- [x] 3.2a Added protobufjs encode/decode proofs for request identity, exact
  AST spans, and parser/grammar lineage.
- [x] 3.2b Added the read-only `GetPacketRegistry` RPC plus packet and lane
  descriptor messages, and proved registry lane metadata round-trips through
  protobufjs.
- [x] 3.3 Implemented fail-closed read-only Go adapters for semantic AST packets and the packet registry; incomplete identity and unavailable canonical joins return explicit receipts with no rows or writes.
- [x] 3.4 Added a protobufjs-to-SvelteKit/tRPC-safe packet-registry mapper with stable degraded and unavailable response shapes.
- [x] 3.5 Proved replay-stable identity and checksum preservation across Go unit tests, client mapper tests, and protobufjs contracts.

## 4. Retrieval and projection lane registry

- [x] 4.1 Registered PostgreSQL BM25/FTS and pgvector lanes with explicit index and representation revisions; pgvector remains degraded while canonical coverage is incomplete.
- [x] 4.2 Registered Qdrant mirrored collection/vector/tag/index descriptors as projection-only lanes with conservative parity status.
- [x] 4.3 Registered cuVS/RAPIDS and FastAPI as optional unproven executor lanes with explicit capability and projection-only write policies.
- [x] 4.4 Verified the existing SearchRuntime normalization deduplicates mirrored dense executors by revision-qualified canonical packet/chunk identity before fusion, while retaining executor provenance; existing RF6 tests cover this boundary.
- [x] 4.5 Added read-only parity and lane-health audit commands with JSON report generation (`audit-rpc-packet-registry-schema-v1.mjs`).

## 5. Application and orchestration wiring

- [x] 5.1 Exposed registry reads through SvelteKit server/tRPC router (`atlasRouter.getPacketRegistry`) with stable JSON response shapes and no writes performed.
- [x] 5.2 Threaded registry-backed context through Mastra tools (`atlasInspectRuntimeTool` detail=full) without allowing direct durable-store writes.
- [x] 5.3 Verified `npm run dev:gpu` remains startup-safe with port collision detection and non-blocking fallback when optional lanes are unavailable.
- [x] 5.4 Provided read-only lane and registry observability through Unified Indexing Studio and tRPC endpoints.

## 6. Future consumer contracts

- [x] 6.1 Defined revisioned snapshot manifests (`RegistrySnapshotManifestV1Schema`) for Arrow/mmap consumers without granting canonical authority.
- [x] 6.2 Added adapter contracts (`FutureConsumerReceiptV1Schema`) for XGBoost/PyTorch/RL/DAG/HyperGraphRAG consumers with checksum and replay receipts.
- [x] 6.3 Added agentic dense-search context admission (`AgenticDenseSearchAdmissionV1Schema` and `admitAgenticDenseSearchContextV1`) requiring canonical packet identity and bounded evidence.
- [x] 6.4 Ran full focused tests (10/10 test suites passed), OpenSpec strict validation (valid), and live read-only schema proofs without mutations.

