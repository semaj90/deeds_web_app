# Parent Atlas — Transport, Memory, and Structural Boundaries

## ADDED Requirements

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
