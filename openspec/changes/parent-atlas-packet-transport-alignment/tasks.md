# Parent Atlas Packet / Ontology / Transport Alignment Tasks

Status: IMPLEMENTATION_IN_PROGRESS

This change aligns already-extracted/materialized Parent Atlas documents and packets across Python ontology analysis, ACE/MessagePack, Arrow/mmap, gRPC, ACP and A2A without changing canonical packet or tuple ownership.

## PT-0 — Freeze ownership [DONE]

- Canonical packet identity/revisions: Postgres/materialization owner.
- Canonical source tuples/hyperedges: Atlas tuple/hyperedge materializers.
- Python RDFLib/NetworkX: derived analysis views only.
- JSON/MessagePack/protobuf/Arrow/mmap: wire/storage representations only.
- MCP/tRPC/ACP/A2A: capability/transport adapters only.

Proof:
- `PacketTopologyEnvelope` remains the packet shape authority.
- `CanonicalPacketTransportV1` carries but does not mint identity.

## PT-1 — Python ontology-linked tuple view [CREATED]

- [x] Add `ontology_tuple_view.py`.
- [x] Preserve tuple_id, subject/object IDs, revisions, evidence refs and hyperedge refs.
- [x] Add NetworkX binary projection for readable CPU graph analysis.
- [x] Add RDFLib Dataset projection for SPARQL/SKOS/RDFS/OWL experiments.
- [ ] Install/prove RDFLib in the persistent Python kernel environment.
- [ ] Add ontology namespace mapping from `.okf`/domain schema revision rather than hard-coded vocabulary.
- [ ] Add n-ary reconstruction proof: RDF binary view must round-trip through hyperedge_id/member roles to canonical relation evidence.

Gate: `PY_ONTOLOGY_VIEW_NON_CANONICAL_PROVEN`.

## PT-2 — Canonical packet transport [CREATED]

- [x] Add `atlas.canonical-packet-transport.v1`.
- [x] Add TypeScript JSON/MessagePack/reference adapters.
- [x] Keep transport checksum distinct from payload content checksum and canonical packet identity.
- [ ] Add runtime Zod parser mirroring the `.okf` contract.
- [ ] Add canonical checksum fixture shared by TS/Go/Python.
- [ ] Add packet batch form keyed by canonical ordinals for bulk hydration.

Gate: `PACKET_IDENTITY_SURVIVES_ALL_TRANSPORTS`.

## PT-3 — Arrow IPC / mmap snapshot handoff [PARTIAL]

- [x] Contract supports `ARROW_IPC_REF` and `MMAP_REF`.
- [ ] Materialize a real `semantic_768 + ordinals + packet_key + source_ref` Arrow IPC file.
- [ ] Read through Python `pyarrow.memory_map()` without copying the full matrix.
- [ ] Hydrate the same snapshot in the WSL2 RAPIDS worker by reference.
- [ ] Record `ExecutionDataRefV1` + checksum + revision receipt.

Gate: `ARROW_MMAP_ZERO_COPY_READ_PROVEN`.

## PT-4 — Protobuf / Go retrieval alignment [CREATED]

- [x] Add `atlas_packet_transport.proto` with PacketRef/DataRef/PacketTransport.
- [ ] Generate Go/TS/Python bindings in the existing proto registry/build pipeline.
- [ ] Add packet-reference hydration to Go retrieval results without duplicating retrieval authority.
- [ ] Preserve `packet_key`, `source_ref`, workspace/source/representation revisions through Go -> gRPC -> TS.
- [ ] For large payloads return DataRef/PacketRef rather than JSON blobs.

Gate: `GO_RETRIEVAL_PACKET_REF_ROUNDTRIP_PROVEN`.

## PT-5 — ACP / MCP integration [PARTIAL]

- Existing ACP/MCP registry remains authoritative for tool discovery/dispatch.
- [ ] Add `atlas.retrieve_evidence`, packet hydrate and bounded graph expand as canonical logical capabilities where not already registered.
- [ ] Tool outputs should return PacketRef/CanonicalPacketTransport rather than backend-specific Qdrant/GPU objects.
- [ ] Preserve evidence refs and execution receipts through gRPC ToolRouter.
- [ ] Do not allow transport fallback to weaken identity/exact-promotion requirements.

Gate: `MCP_ACP_PACKET_REF_PROVEN`.

## PT-6 — A2A v1 projection [CREATED]

- [x] Add A2A v1-style `AgentCard` adapter using `supportedInterfaces[]` and `skills[]`.
- [x] Add packet transport -> A2A Artifact/Part adapter.
- [ ] Replace/bridge legacy custom `A2AAgentDescriptor.servicePorts` discovery with current v1 AgentCard endpoint `/.well-known/agent-card.json`.
- [ ] Add schema fixture against current A2A v1 JSON schema/proto definitions.
- [ ] Prefer PacketRef/data URL/reference Part for large artifacts; do not base64 large Arrow/mmap payloads.

Gate: `A2A_V1_PACKET_ARTIFACT_PROVEN`.

## PT-7 — ACE packet compilation [PENDING]

- Retrieval remains: classify -> retrieve/fuse -> exact promote -> context compile.
- [ ] Map promoted evidence into existing ContextManifest/ACE compiler.
- [ ] Produce compact PacketRef/MessagePack packets only after semantic admission.
- [ ] Verify BitFrost/cache residency affects cost only, never rank.
- [ ] Record ContextManifest and materialization receipt IDs in CanonicalPacketTransportV1.

Gate: `PROMOTED_EVIDENCE_TO_ACE_PACKET_PROVEN`.

## PT-8 — Bulk packet assembly/materialization [PENDING]

- [ ] Use MessagePack for compact medium packets.
- [ ] Use Arrow IPC/mmap for large tensor/feature batches.
- [ ] Use SeaweedFS/S3 object refs for original documents and large immutable artifacts.
- [ ] Keep JSON/JSONL for control/debug/audit, not large tensor transfer.
- [ ] Validate every hydrated/materialized packet against `PacketTopologyEnvelope` before external projection.

Gate: `ASSEMBLE_MATERIALIZE_VALIDATE_PROVEN`.

## PT-9 — Persistent Python kernel boundary [PENDING]

- [ ] Record `python_abi` and `gil_mode` in environment receipt.
- [ ] Keep ordinary CPython production ABI until free-threaded dependency matrix is proven.
- [ ] Load RDFLib, NetworkX, PyTorch and optional LangExtract inside kernel.
- [ ] Invoke CodeQL/Soufflé out of process and ingest their outputs as evidence observations.
- [ ] No Python analyzer may promote its own derived relation/model score into canonical identity.

Gate: `PYTHON_KERNEL_ANALYZER_AUTHORITY_PROVEN`.

## PT-10 — End-to-end proof [PENDING]

Freeze one extracted/synthesized document and prove:

`SeaweedFS original -> canonical extraction/materialization -> PacketTopologyEnvelope -> semantic/AST/n-ary evidence -> exact promotion -> ContextManifest -> MessagePack/PacketRef -> gRPC Go worker -> ACP/MCP -> A2A artifact -> hydrate -> same packet_key/source_ref/revisions/checksums`.

Also prove large tensor route:

`semantic_768 Arrow IPC -> mmap ref -> Python/RAPIDS -> Top-K ordinals -> packet refs`, with no JSON tensor materialization.

Final gate: `PARENT_ATLAS_PACKET_TRANSPORT_ALIGNMENT_PROVEN`.
