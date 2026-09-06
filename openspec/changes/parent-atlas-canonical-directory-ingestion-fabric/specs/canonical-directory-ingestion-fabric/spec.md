# canonical-directory-ingestion-fabric Specification

## ADDED Requirements

### Requirement: Canonical source identity precedes every retrieval representation
The system SHALL assign or resolve a revision-qualified canonical source identity before creating lexical, semantic, structural, NLP, ontology, graph, summary, LOD, task, cache, or transport projections.

#### Scenario: Unchanged source bytes
- **GIVEN** a source path whose bytes and canonical source revision are unchanged
- **WHEN** the directory ingestion fabric scans the path again
- **THEN** it MUST resolve the same `SourceArtifactV1` logical identity
- **AND** MUST NOT create a new source revision based only on `mtime`
- **AND** SHOULD perform zero representation writes unless an independent producer revision requires rematerialization.

#### Scenario: Changed source bytes
- **GIVEN** a previously admitted source whose bytes change
- **WHEN** the directory ingestion fabric processes the new content
- **THEN** it MUST produce or resolve a new `sourceRevision`
- **AND** all derived representations MUST bind to that new source revision
- **AND** older source revisions MUST remain distinguishable for provenance/history according to the canonical source owner.

### Requirement: Canonical chunks preserve byte-accurate provenance
The system SHALL derive `CanonicalChunkV1` records from a canonical source revision using deterministic, language-aware segmentation and byte-accurate source spans.

#### Scenario: Repeated deterministic chunking
- **GIVEN** identical source bytes, chunker revision, and segmentation policy
- **WHEN** chunking executes twice
- **THEN** chunk IDs, source refs, source revisions, byte spans, text checksums, and structural/heading provenance MUST be identical.

#### Scenario: Structural ownership exists
- **GIVEN** source code for which Tree-sitter/GIS/Graphify already owns symbol identity
- **WHEN** directory chunking emits a code chunk
- **THEN** the chunk MAY reference the existing stable symbol/tree provenance
- **BUT** MUST NOT mint a competing canonical symbol identity.

### Requirement: Derived representations share one representation registry
The system SHALL register each derived representation with a revision-qualified descriptor bound to one canonical source/chunk identity.

#### Scenario: Projection-local identifier
- **GIVEN** a Qdrant point ID, Neo4j element ID, GPU ordinal, Valkey key, or transport artifact ID
- **WHEN** that value is recorded on a representation
- **THEN** it MUST be treated as a replaceable projection reference
- **AND** MUST NOT replace `sourceRef`, `sourceRevision`, `chunkId`, or an already-canonical packet/symbol identity.

#### Scenario: Repeated materialization
- **GIVEN** the same `chunkId`, `sourceRevision`, representation kind, and producer revision
- **WHEN** a materializer retries
- **THEN** it MUST be idempotent at the logical representation level
- **AND** MUST NOT create a second active owner for the same representation semantics.

### Requirement: PostgreSQL remains the durable lexical reference boundary
The system SHALL use PostgreSQL-native full-text search as the canonical/local lexical reference path for admitted directory chunks and SHALL preserve PostgreSQL's ownership of planner/AIO implementation details.

#### Scenario: FTS query
- **GIVEN** admitted chunks with a weighted lexical document and GIN index
- **WHEN** SearchRuntime requests a PostgreSQL lexical candidate cohort
- **THEN** returned candidates MUST resolve to canonical source/chunk identity and revision
- **AND** planner choices such as bitmap scans or PostgreSQL 18 AIO MUST remain server-side implementation details rather than Parent Atlas transport/executor identities.

### Requirement: One semantic representation cannot gain votes through executor multiplicity
The system SHALL treat `semantic_768` as one logical retrieval representation regardless of which exact or approximate executor serves it.

#### Scenario: Multiple semantic executors are available
- **GIVEN** pgvector exact, Qdrant, cuVS brute force, CAGRA, IVF-PQ, or TurboVec results for the same logical semantic lane
- **WHEN** SearchRuntime constructs fusion inputs
- **THEN** one canonical candidate MUST contribute at most one vote for the semantic lane
- **AND** executor choice MUST be recorded only as diagnostics/execution provenance.

### Requirement: Sparse serving projections do not own lexical semantics
The system SHALL revision-qualify sparse-vector production independently from the serving store.

#### Scenario: Qdrant server-side sparse inference is unavailable
- **GIVEN** a deployment without the desired server-side sparse inference feature
- **WHEN** the directory ingestion fabric produces BM25 sparse representations
- **THEN** it MUST be able to materialize the sparse representation outside Qdrant
- **AND** MUST record the algorithm/tokenizer/producer revisions before projection.

### Requirement: Enrichments are incremental and fail independently
The system SHALL run AST, NLP, ontology, graph, summary, LOD, and task/OpenSpec enrichments as revision-qualified derived materializers.

#### Scenario: NLP enrichment fails
- **GIVEN** a valid canonical source/chunk and a failing NLP producer
- **WHEN** enrichment executes
- **THEN** the system MUST record a typed failure/diagnostic for the NLP representation
- **AND** MUST NOT invalidate or rewrite the canonical source/chunk identity solely because NLP failed.

### Requirement: Candidate ordinals are frozen before GPU/ranking execution
The system SHALL build a deterministic `CandidateOrdinalMapV1` for a revision-qualified admitted population before GPU ANN/exact/ranking algorithms consume ordinals.

#### Scenario: ANN parity test
- **GIVEN** a frozen candidate population and ordinal map
- **WHEN** cuVS brute force, CAGRA, or IVF-PQ are compared
- **THEN** all executors MUST use the same population revision and ordinal map checksum
- **AND** Recall@K/MRR results MUST resolve back to the same canonical candidate identities.

### Requirement: Context assembly is reference-oriented and bounded
The system SHALL compile `ContextManifestV2`, ACE selection, `SmartRpcPacketV1`, and `PromptPlanV1` from selected revision-qualified evidence rather than injecting whole directories by default.

#### Scenario: Lower LOD is sufficient
- **GIVEN** a candidate whose LOD1 or LOD2 evidence is sufficient for the current query
- **WHEN** ACE compiles selected evidence
- **THEN** the packet SHOULD reference the lowest sufficient LOD
- **AND** MUST preserve the checksum/reference needed to promote to the exact source span when required.

### Requirement: Incremental invalidation is the default update model
The system SHALL update directory-derived representations from content/revision changes rather than normalizing a daily full rebuild as the correctness mechanism.

#### Scenario: Source removal
- **GIVEN** a source that existed in the previous admitted inventory and is now absent
- **WHEN** the new inventory revision is admitted
- **THEN** the system MUST create revision-qualified removal/tombstone evidence
- **AND** derived projections MUST be invalidated or deleted only after canonical identity/readback rules are satisfied.

### Requirement: GPU tensor identity is distinct from execution identity
The system SHALL distinguish immutable `GpuTensorArtifactV1` identity from the GPU environment/executor identity that produced or consumed it.

#### Scenario: CUDA toolchain or execution context changes
- **GIVEN** identical logical inputs executed under a different CUDA toolkit/library revision or a different default-vs-Green execution context identity
- **WHEN** a GPU execution receipt is emitted
- **THEN** the execution identity MUST reflect the changed environment
- **BUT** the tensor semantic identity MUST change only if its bytes/layout/representation semantics differ.

#### Scenario: CUDA IPC handle exists
- **GIVEN** a process-local CUDA IPC/VMM handle used for execution
- **WHEN** a durable Parent Atlas packet or receipt is emitted
- **THEN** the raw handle MUST NOT become a canonical source, tensor, packet, A2A, or gRPC identity
- **AND** the durable record MUST use artifact/lease/execution-receipt references instead.

### Requirement: A2A and gRPC are adapters, not canonical identity owners
The system SHALL preserve Parent Atlas canonical identity and checksum semantics across transport mappings.

#### Scenario: Parent Atlas result crosses A2A
- **GIVEN** a durable Parent Atlas result or receipt
- **WHEN** it is exposed through A2A task/message/artifact semantics
- **THEN** the adapter MUST preserve the canonical evidence/revision identifiers
- **AND** MUST NOT make protobuf bytes, A2A task IDs, message IDs, or artifact IDs the Parent Atlas canonical checksum authority.

#### Scenario: Streaming reconnect
- **GIVEN** critical prefill or GPU evidence was reported during a streaming operation
- **WHEN** the stream disconnects and a client reconnects
- **THEN** the evidence MUST remain recoverable from durable Parent Atlas task/artifact/receipt state
- **AND** ephemeral progress messages MUST NOT be its sole persistence location.
