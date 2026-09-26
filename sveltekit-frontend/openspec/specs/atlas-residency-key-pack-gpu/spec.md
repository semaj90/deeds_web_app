# atlas-residency-key-pack-gpu Specification

## Purpose
TBD - created by archiving change parent-atlas-cutile-ace-level2. Update Purpose after archive.
## Requirements
### Requirement: GPU key-packing computes the same formula as the existing CPU oracle, not a new one
The system SHALL compute the packed `ResidencySortKeyV1` on GPU using the exact formula already
implemented in `scripts/atlas/ace-radix-01/fixture-v1.mjs`
(`(tier<<56)|(lod<<48)|(utilityBucket<<40)|(recencyBucket<<32)|projectionOrdinal`, with
`utilityBucket=floor(pagerankQuantized/257)` and `recencyBucket=floor(recency/257)`), and SHALL NOT
introduce a second, different packing formula.

#### Scenario: GPU-packed keys exactly match the existing CPU oracle's packed keys
- **WHEN** the GPU kernel packs the same fixture `fixture-v1.mjs`'s `generateAceRadix01FixtureV1()`
  already generated packed keys for
- **THEN** every GPU-computed packed key equals the corresponding CPU-computed packed key exactly

### Requirement: The GPU kernel computes packing from raw glyph fields, not pre-packed input
The system SHALL compute the packed key on GPU directly from the raw `PacketGlyphV1` fields
(`residency`, `lod`, `pagerankQuantized`, `recency`, `projectionOrdinal`), not from an
already-packed value passed in.

#### Scenario: The kernel's input is unpacked glyph fields
- **WHEN** the GPU key-packing kernel is invoked
- **THEN** its input consists of the raw glyph field values, not a precomputed packed key

