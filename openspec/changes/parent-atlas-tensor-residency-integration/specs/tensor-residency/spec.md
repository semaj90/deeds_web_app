# Tensor Residency Specification

## ADDED Requirements

### Requirement: TR-1 canonical identity
`packet_key` SHALL remain canonical. Tensor tile IDs, Arrow row offsets, Qdrant/HNSW IDs, CAGRA internal IDs, CUDA pointers, SOM coordinates, and visualization glyph IDs SHALL be treated as derived identifiers only, never as a substitute canonical identity.

#### Scenario: A derived identifier is produced
- **WHEN** a tensor tile ID, Arrow row offset, Qdrant/HNSW ID, CAGRA internal ID, CUDA pointer, SOM coordinate, or visualization glyph ID is created
- **THEN** it is treated strictly as a derived identifier
- **AND** `packet_key` remains the canonical identity it maps back to.

### Requirement: TR-2 artifact lineage
Every bulk numeric artifact SHALL record artifact type, workspace/source revision, representation ID/revision when applicable, schema version, dtype, shape, byte length, content hash, producer, producer revision, and creation time.

#### Scenario: A bulk numeric artifact is written
- **WHEN** a bulk numeric artifact (tensor, vector batch, feature matrix) is produced
- **THEN** it carries artifact type, workspace/source revision, representation ID/revision (when applicable), schema version, dtype, shape, byte length, content hash, producer, producer revision, and creation time.

### Requirement: TR-3 sparse topology
`TopologyCoordinate4 = [som_x, som_y, authority_norm, entropy_utility_norm]` SHALL be stored as an `N x 4` table plus a sparse tile directory. A dense `X × Y × A × E` allocation SHALL NOT be used unless an experiment proves density and value.

#### Scenario: Topology coordinates are stored
- **WHEN** `TopologyCoordinate4` values are persisted
- **THEN** they are stored as an `N x 4` table plus a sparse tile directory
- **AND** a dense `X × Y × A × E` allocation is not used unless an experiment has already proven its density and value.

### Requirement: TR-4 cache ownership
ACE SHALL choose logical residency. Valkey/BitFrost SHALL store only metadata and invalidation state. CUDA/PyTorch allocators SHALL own physical GPU memory. No cache layer SHALL mint semantic identity.

#### Scenario: A cache layer handles residency
- **WHEN** ACE, Valkey/BitFrost, or a CUDA/PyTorch allocator participates in residency management
- **THEN** ACE decides logical residency, Valkey/BitFrost stores only metadata/invalidation state, and CUDA/PyTorch allocators own physical GPU memory
- **AND** none of them mints new semantic identity.

### Requirement: TR-5 ANN hierarchy
HNSW internal levels and CAGRA graph structure are implementation details. Atlas LOD levels are explicit application policy and SHALL NOT be inferred from HNSW layer number.

#### Scenario: LOD is assigned
- **WHEN** an Atlas LOD level is assigned to a candidate or artifact
- **THEN** it comes from explicit application policy
- **AND** it is never inferred from an HNSW internal layer number or CAGRA graph structure detail.

### Requirement: TR-6 exact-before-approximate
An approximate index SHALL be evaluated only against the same-matrix exact oracle with frozen representation revision.

#### Scenario: An approximate index is evaluated
- **WHEN** an approximate (ANN) index's quality is being evaluated
- **THEN** it is compared against the same-matrix exact oracle at a frozen representation revision
- **AND** it is not evaluated against a different matrix, a moving revision, or itself.
