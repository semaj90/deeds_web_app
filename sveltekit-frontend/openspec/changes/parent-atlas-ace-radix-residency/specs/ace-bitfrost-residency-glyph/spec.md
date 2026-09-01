## ADDED Requirements

### Requirement: PacketGlyphV1 compact candidate representation
The system SHALL define a `PacketGlyphV1` Zod contract carrying exactly the fields
`projectionOrdinal` (non-negative integer, max 4294967295), `featureBits` (non-negative integer,
max 65535), `lod` (non-negative integer, max 255), `residency` (non-negative integer, max 255),
`pagerankQuantized` (non-negative integer, max 65535), `recency` (non-negative integer, max 65535),
`somCell` (non-negative integer, max 65535), and `flags` (non-negative integer, max 65535), enforced
via `.strict()`. The contract SHALL NOT include a `packetKey` or any other canonical-identity field.

#### Scenario: Valid glyph passes validation
- **WHEN** a candidate packet's fields are all within their declared numeric bounds
- **THEN** `PacketGlyphV1Schema.parse(...)` succeeds and returns the typed object

#### Scenario: Out-of-range field is rejected
- **WHEN** any field (e.g. `featureBits`) exceeds its declared bit-width ceiling (e.g. 65536)
- **THEN** `PacketGlyphV1Schema.parse(...)` throws a Zod validation error

#### Scenario: Unknown field is rejected
- **WHEN** a candidate glyph object includes any field not in the defined shape (e.g. `packetKey`)
- **THEN** `PacketGlyphV1Schema.parse(...)` throws a Zod validation error, because the schema is `.strict()`

### Requirement: ResidencySortKeyV1 excludes canonical identity
The system SHALL define a `ResidencySortKeyV1` Zod contract carrying exactly `tier`, `lod`,
`utilityBucket`, `recencyBucket` (each a small bounded non-negative integer) and `projectionOrdinal`
(non-negative integer, max 4294967295), enforced via `.strict()`. This contract SHALL NOT include
`packetKey`, `sourceRef`, or any other field from the canonical packet identity chain defined
elsewhere in this repo's Canonical Lineage Contract.

#### Scenario: Sort key never round-trips to packet identity alone
- **WHEN** a `ResidencySortKeyV1` instance is serialized
- **THEN** no canonical `packetKey` can be recovered from it without a separate ordinal-to-packetKey lookup

#### Scenario: Sort key ordering is deterministic for equal inputs
- **WHEN** two `ResidencySortKeyV1` instances have identical field values
- **THEN** any documented comparison/packing function produces identical output for both

### Requirement: GPU primitive ownership boundary is documented
The system SHALL record, alongside the new contracts, an explicit ownership table stating that CUB
radix sort/partition/compact is the required oracle baseline for BitFrost cache reorganization,
cuTile is a challenger only (never introduced merely to have a custom kernel), cuBLASLt owns dense
candidate scoring / batched projection linear algebra, cuGraph owns PageRank/PPR/Leiden/BFS/SSSP,
cuVS owns ANN semantic search, and ACE/BitFrost is the sole legitimate consumer of
`ResidencySortKeyV1`/`PacketGlyphV1` for admission/residency/cache-tier decisions.

#### Scenario: New GPU-adjacent capability checks the ownership table first
- **WHEN** a future change proposes GPU-accelerated candidate reorganization or scoring
- **THEN** the ownership table in this capability's documentation is consulted before introducing a new owner, per this repo's "One Canonical Runtime Owner Per Capability" rule
