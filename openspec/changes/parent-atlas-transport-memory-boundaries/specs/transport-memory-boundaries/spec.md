# Parent Atlas — Transport, Memory, and Structural Boundaries

## ADDED Requirements

### Requirement: HTTP/3 edge capability does not imply QUIC gRPC transport
The system MUST distinguish HTTP/3-capable edge ingress from a proven QUIC/gRPC backend transport. Alt-Svc, QUIC ports, service-registry metadata, and HTTP/3 listener configuration MUST NOT be treated as proof that an RPC packet was encoded, delivered, or executed over QUIC. Existing gRPC methods MUST use their verified service transport until a compatible client/server path and wire-level parity are demonstrated.

#### Scenario: An edge advertises HTTP/3 while a backend exposes gRPC
- **WHEN** Caddy or a service registry advertises H3/QUIC but the backend RPC caller is HTTP/2 gRPC or is unverified
- **THEN** report edge HTTP/3 capability separately, keep the backend transport status unverified or HTTP/2 as observed, and do not claim QUIC RPC execution.

### Requirement: Atlas RPC packet mapping preserves canonical lineage and operation safety
Any protobuf mapping of `AtlasCustomRpcPacketV1` MUST preserve canonical packet/source/workspace identity and keep transport, request, execution, and representation identifiers distinct. Read-only operations MAY be implemented first; mutation operations MUST remain behind their existing authorization and idempotency owners. Encoding, decoding, size bounds, deadlines, cancellation, duplicate handling, and typed failures MUST be covered before a mapping is called interoperable.

#### Scenario: A read-only packet is mapped to a typed RPC request
- **WHEN** GET or SEARCH is encoded and decoded through the approved service contract
- **THEN** all identity, revision, caller, request-digest, and idempotency fields round-trip exactly, and the RPC result remains subject to canonical qualification and existing SearchRuntime fusion.

#### Scenario: A mutation or unsupported operation reaches the transport adapter
- **WHEN** CREATE, PATCH, TRANSITION, ANALYZE, an oversized packet, or an unknown version is presented without its required authorized operation contract
- **THEN** the adapter rejects it with a typed failure and performs no canonical write or implicit fallback.

### Requirement: Procedural agent workflows preserve one evidence-bound execution chain
Agentic retrieval and DAG composition MUST reuse the existing SearchRuntime, ACE/ContextManifest, tool authorization, workflow, and execution-receipt owners. Source-level composition or a proposal receipt MUST NOT be described as live end-to-end execution. Every demonstrated handoff MUST preserve the request, canonical identities, source/workspace revisions, evidence references, and checksums; execution remains separately authorized.

#### Scenario: A request is traced from retrieval into a proposed workflow
- **WHEN** a bounded agent request traverses retrieval, fusion, context assembly, tool-policy validation, and DAG proposal
- **THEN** one correlated receipt records each observed handoff and any missing stage, keeps graph/model outputs advisory, and records zero writes unless an authorized execution and independent readback actually occurred.

### Requirement: HTTP/3 packet ingestion preserves request identity and bounded work
An HTTP/3-capable ingress MAY accept Atlas RPC packets only through an explicitly configured compatible protocol server. QUIC stream ordering MUST NOT be confused with global request ordering: concurrent streams and worker completions may finish in a different order. Every job MUST retain its request/correlation identity, canonical packet/source revisions, idempotency key, and explicit sequence or stable ordinal where ordering is semantically required. CPU-bound work MUST use bounded worker capacity and queue limits; `async` handlers or in-process background tasks MUST NOT be represented as CPU parallelism or durable job execution.

#### Scenario: Concurrent HTTP/3 requests complete out of order
- **WHEN** independent revision-qualified packet jobs arrive on concurrent HTTP/3 streams and complete in a different order
- **THEN** results are joined by request and canonical identity, and any order-sensitive output is explicitly reordered by its declared stable key rather than arrival or completion order.

#### Scenario: CPU worker capacity is saturated
- **WHEN** the bounded queue or worker limit is reached, or a job is cancelled or times out
- **THEN** the service applies a typed backpressure/failure result, does not create unbounded tasks, and preserves idempotent retry semantics without silently duplicating side effects.

### Requirement: Safe body-based Atlas searches use HTTP QUERY semantics where supported
An Atlas read-only search API MAY expose the standardized HTTP `QUERY` method for structured request content that is unsuitable for a URI. A QUERY request MUST be safe and idempotent, validate its declared `Content-Type`, preserve the same revision-qualified request contract as the existing search owner, and perform no canonical writes or tool execution. HTTP method semantics are independent of the negotiated HTTP version: QUERY may run over a supported HTTP/1.1, HTTP/2, or HTTP/3 connection, but method support MUST be explicitly tested across clients, proxies, and servers. If QUERY is unsupported, clients MUST use an explicitly documented compatible read-only route; they MUST NOT silently reinterpret mutation requests.

#### Scenario: Client submits a structured read-only search body
- **WHEN** a client sends a valid, bounded Atlas search representation using QUERY to an endpoint that advertises support
- **THEN** the endpoint validates media type and schema, preserves caller/request/canonical revisions, executes the existing retrieval and fusion owners, and returns a typed result without side effects.

#### Scenario: QUERY response is considered for caching
- **WHEN** a cache handles a QUERY response
- **THEN** its cache key incorporates the complete request content and relevant metadata, and authorization, tenant, workspace/source revisions, representation, and freshness dimensions cannot be omitted or conflated.

#### Scenario: Method or media type is unsupported
- **WHEN** a client uses QUERY where it is not supported, omits Content-Type, or submits an unsupported representation
- **THEN** the server returns an explicit protocol/media-type failure and does not silently route the request through a mutation or tool-execution path.

### Requirement: Tensor batch ordering preserves the canonical ordinal map
Any batch sorting, radix sorting, gather, or GPU transfer MUST carry a sealed mapping between execution ordinals and canonical candidate identities. Sorting is an execution optimization only; it MUST NOT redefine candidate identity, retrieval rank, or RRF lane votes. A sorted batch MUST be restored or joined by explicit mapping before results are returned to retrieval, ACE, or an agent.

#### Scenario: Candidate rows are reordered for batched processing
- **WHEN** candidates are sorted by shard, storage locality, or tensor offset before CPU/GPU processing
- **THEN** the mapping and its checksum are validated before and after processing, and scores/results resolve to the original canonical identities independent of completion order.

#### Scenario: Radix sorting has no measured benefit
- **WHEN** a stable comparison sort or existing order is sufficient for the bounded workload
- **THEN** radix sorting remains optional and is not added as a protocol, identity, or correctness dependency.

### Requirement: Transport Memory Boundaries stays evidence-bound and non-destructive
The system MUST keep transport memory boundaries actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.

### Requirement: tRPC is an optional TypeScript application-local control surface
The system MAY use tRPC for typed calls between TypeScript application components when a demonstrated caller benefits from it. tRPC MUST NOT become a required transport, canonical identity owner, cross-language compute bus, or parallel workflow authority; ordinary SvelteKit HTTP routes remain valid. A mounted tRPC server route without a demonstrated caller is dormant capability, not proof of an active application control plane.

#### Scenario: No in-repository tRPC caller is present
- **WHEN** a tRPC route and router are mounted but no client construction/request is found
- **THEN** the transport is classified as optional/dormant, and no client, production readiness, or canonical role is inferred.

#### Scenario: A TypeScript application-local caller is introduced
- **WHEN** a SvelteKit UI or application-local control component uses tRPC
- **THEN** it carries typed request/response contracts while source identity, durable truth, and cross-language execution remain owned by their existing authorities.

### Requirement: gRPC owns native polyglot compute contracts, not application truth
The system MUST use the service's typed gRPC contract as the canonical cross-language interface for native/polyglot compute operations when a service provides that contract. HTTP health, diagnostics, application compatibility, and explicitly classified fallback routes MAY coexist, but they MUST delegate to the same service owner and MUST NOT create a second canonical identity, write, or retrieval-fusion owner. Transport selection is operation-specific; one logical retrieval lane still contributes at most one vote.

#### Scenario: A compute service exposes HTTP and gRPC
- **WHEN** both interfaces are available for the same service
- **THEN** gRPC is the typed native/polyglot compute contract, and other interfaces are explicitly classified by operation as health, compatibility, or fallback.

#### Scenario: A sidecar adapter is stale or has no caller
- **WHEN** a native adapter imports a missing module, calls an absent method, or has no current runtime caller
- **THEN** it remains unready/legacy/experimental and fails closed; it is not redirected to an unrelated native API or promoted based on export presence alone.

### Requirement: Structural memory cards are revision-bound projections
The system MUST represent structural memory cards as derived evidence bound to source and workspace revisions, exact source spans, syntax status, typed references, representation revision, producer revision, and an evidence checksum. Upstream Tree-sitter node/chunk IDs MUST remain provenance. Canonical identity references MUST be supplied by existing identity owners; card construction MUST NOT mint or promote IDs, write canonical stores, or claim canonical authority.

#### Scenario: A structural memory card is built from resolved evidence
- **WHEN** a card is compiled from a source observation and caller-supplied canonical identity references
- **THEN** it preserves source/span/syntax/revision provenance and typed relation references, computes a deterministic evidence checksum, and remains non-authoritative and write-free.

#### Scenario: Card evidence is malformed or attempts to claim authority
- **WHEN** a byte span is reversed, a canonical relation lacks its resolved target, canonical references are absent, or a card claims authority/writes
- **THEN** validation rejects the card and does not infer or repair missing identity or revision evidence.

### Requirement: A2A peer discovery is default deny for tools and methods
The system MUST expose only explicitly allowlisted read-only tools and methods in peer-facing A2A discovery metadata. Unknown registrations, generic tool-execution methods, and mutation/mirror operations MUST be omitted. This metadata filter does not replace authentication or authorization at execution endpoints and MUST NOT imply that advertised retrieval capabilities can write canonical Postgres or Graphify state.

#### Scenario: A peer requests the service discovery descriptor
- **WHEN** the descriptor is generated from the internal ACP registry
- **THEN** only explicitly allowlisted peer-safe tool IDs and methods are returned; all other registry entries are omitted by default.

#### Scenario: A future tool or method is registered
- **WHEN** a tool or RPC method is not present in the peer allowlist
- **THEN** it remains available only through its existing internal owner and is not advertised to peer agents.

### Requirement: ACP is a protocol-local editor-session projection, not an execution authority
The system MUST keep ACP agent, session, task, and action identifiers protocol-local. An ACP ingress MAY be mapped to an existing Atlas task attempt and workflow action only after those records are resolved by their existing owners; ACP MUST NOT mint canonical source, packet, graph, or task identity. ACP is currently accepted only through the legacy ingress contract with outbound ACP disabled and migration target A2A 1.0; this requirement defines the boundary and does not claim live ACP runtime adoption.

#### Scenario: An editor session submits an action
- **WHEN** an ACP ingress carries a session/task/action reference
- **THEN** the adapter preserves those values as external references and requires exact caller-resolved Atlas task-attempt, run, workflow-action, ContextManifest checksum, and ExecutionReceipt bindings before producing a projection.

#### Scenario: A tool action is requested or permission is absent
- **WHEN** an ACP-originated action is considered for dispatch
- **THEN** the existing tool-authorization owner decides permission; missing or denied permission fails closed, and discovery metadata or ACP ingress alone never authorizes execution.

#### Scenario: A patch or terminal output is returned
- **WHEN** an editor agent proposes a patch or returns terminal output
- **THEN** the patch remains a proposal until the existing authorized repair/apply path admits it and independently reads back the result; terminal output is bounded evidence, not identity or authorization, and must not expose credentials, hidden reasoning, prompts, or raw secret-bearing request data.

#### Scenario: Progress is reported to the editor
- **WHEN** an ACP-compatible surface reports action progress
- **THEN** it projects existing workflow events and execution receipts; it does not create a parallel run/action ledger or treat external session IDs as canonical identity.
