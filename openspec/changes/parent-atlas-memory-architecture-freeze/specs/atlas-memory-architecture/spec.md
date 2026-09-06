## ADDED Requirements

### Requirement: Evidence packet projections preserve the existing context owner

Evidence-type packets MUST layer onto or project from ContextCandidate/ContextLane.
They MUST NOT replace that model or establish a second ContextManifest compiler.

#### Scenario: An evidence-type packet is proposed
- **WHEN** a structural or source evidence packet is added by its implementation owner
- **THEN** it preserves the admitted candidate and manifest identity of the existing model

### Requirement: Memory classes and new axes remain distinct

New axes MUST use evidenceDepth and residencyTier rather than a fourth LOD meaning.
Model execution state, exact cache, ACE control, retrieval evidence, statistical
features, external observations, and durable outcomes MUST retain their own owners.

#### Scenario: Cache or model state is available
- **WHEN** a consumer assembles context or records a workflow outcome
- **THEN** runtime state and cache presence do not confer evidence authority


### Requirement: Structural evidence authority SHALL follow the regex → ripgrep → ast-grep → Tree-sitter → Graphify → model ordering
A model/RLM/NLP classifier SHALL NOT be treated as authoritative for structural facts (is this a
function, is this the caller, is this the parent). It MAY propose candidates; ast-grep/Tree-sitter/
Graphify evidence decides.

#### Scenario: A regex-based classifier flags a candidate function boundary
- **WHEN** a regex or NLP pass identifies a possible function/caller/parent relationship
- **THEN** that relationship is treated as a proposal only, and is confirmed or rejected by
  ast-grep/Tree-sitter/Graphify structural evidence before being persisted as fact

### Requirement: Bulk numeric arrays SHALL NOT be serialized through MessagePack or JSON
Matrices and vectors (e.g. `semantic_768` rows, feature matrices) SHALL be transported and stored
via Arrow IPC, raw FP32 mmap, or PyTorch/CUDA tensors. JSON and MessagePack SHALL be used only for
logical/descriptor packets (ordinals, revisions, routing flags, policy hints) — never as the
encoding for numeric matrix payloads.

#### Scenario: A packet descriptor references a semantic vector
- **WHEN** an `AcePacket`-shaped descriptor needs to reference a candidate's `semantic_768` vector
- **THEN** the descriptor carries an ordinal/reference to the vector's location (mmap offset,
  Qdrant point id, etc.), not the vector's float values inline

#### Scenario: A new codec is introduced for packet descriptors
- **WHEN** MessagePack (or any other codec) is added as a transport codec for `AcePacket`-shaped
  descriptors
- **THEN** it is added as an alternate encoding of the same logical schema already used for JSON,
  not a new schema, and it is not applied to numeric matrix data

## Historical undecided designs (2.3/2.4 resolved 2026-09-05)

The first two questions below are retained as historical context and resolved by the
requirements above: evidence packets layer/project from existing context types and
new axes use evidenceDepth/residencyTier. Their implementation remains delegated.
The remaining algorithm, bitmap and staging questions are still unimplemented here:

- Whether `IntentPacket`/`SourceEvidencePacket`/`AstEvidencePacket`/`GraphEvidencePacket`/
  `HyperedgePacket`/`DiagnosticPacket`/`ExecutionReceiptPacket`/`ConstraintPacket` become the
  canonical DAG synthesis packet model, replacing or layering onto the existing
  `ContextCandidate`/`ContextLane` model in `context-compiler.parent-atlas.ts`.
- Whether the proposed LOD0-LOD6 evidence-type residency scheme replaces or layers onto the
  existing LOD0-LOD3 cache-destination scheme in `packet-lod-manifest.ts`.
- The `TANG_INSPIRED_LOW_RANK_SHORTLIST` sampling algorithm's actual implementation.
- The candidate-ordinal-indexed Valkey membership bitmap key naming and `BITOP AND` admission-mask
  mechanism (low risk, no existing conflict, but not yet scoped as a concrete task).
- The pinned-staging `mmap → index_select → CPU stage → pin → async H2D` chain's relationship to
  existing code in `python/parent_atlas_tensor/*`.
