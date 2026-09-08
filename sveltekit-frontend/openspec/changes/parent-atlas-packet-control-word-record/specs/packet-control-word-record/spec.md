## ADDED Requirements

### Requirement: PacketControlWordV1 is a compiled projection, never a source of truth
The system SHALL define `PacketControlWordV1` as a deterministic 64-bit feature-presence bitset
plus small fixed-width control fields (LOD nibble, residency nibble, domain byte, routing byte),
computed only from already-canonical packet state. The contract SHALL NOT include a raw source
excerpt, embedding vector, or summary text — only presence flags and small enumerations. The
contract and every module implementing it SHALL NOT import from or depend on the unrelated,
different-domain evidence-cartridge system (`src/lib/server/cartridge/glyph-record.ts`,
`chr97-builder.ts`).

#### Scenario: Same inputs produce the same checksum
- **WHEN** `PacketControlWordEncoderV1` encodes the same packet revision, feature revision, and
  control-word schema revision twice
- **THEN** the resulting `PacketControlWordV1` checksum is identical both times

#### Scenario: A schema revision bump changes the checksum
- **WHEN** the control-word schema revision changes while packet and feature revisions stay the same
- **THEN** the resulting checksum differs from the prior schema revision's checksum

#### Scenario: No dependency on the unrelated evidence-cartridge system
- **WHEN** the `PacketControlWordV1` contract module or its encoder/decoder are inspected for imports
- **THEN** none of them import anything from `src/lib/server/cartridge/`

### Requirement: PacketControlWordDecoderV1 recovers only encoded control values
The system SHALL define `PacketControlWordDecoderV1` as the exact inverse of
`PacketControlWordEncoderV1` for typed control fields only. It SHALL NOT expose any method that
returns an embedding, AST, source text, or summary from a `PacketControlWordV1` alone.

#### Scenario: Decoding never returns artifact content
- **WHEN** `PacketControlWordDecoderV1` decodes a `PacketControlWordV1`
- **THEN** the returned object contains only bit flags, LOD/residency/domain/routing values, and no artifact content field

### Requirement: Optional debug render is a projection, not an encoding
The system MAY provide an 8x8 bitmap rendering of a `PacketControlWordV1` for human/debug display.
This render SHALL NOT be named or documented using the terms "Glyph" or "CHR97" (both already
denote the unrelated evidence-cartridge system). Any such renderer SHALL be lossy-safe in one
direction only: it MUST be derivable from the control word, and no code path SHALL attempt to
reconstruct a `PacketControlWordV1` from bitmap pixels.

#### Scenario: Render is one-directional
- **WHEN** a `PacketControlWordV1` is rendered to an 8x8 bitmap
- **THEN** no decoder function accepts a bitmap as input to reconstruct control-word fields

### Requirement: PacketGlyphV1 naming collision is explicitly reconciled
The system SHALL document that `PacketGlyphV1` (defined in the `ace-bitfrost-residency-glyph`
capability) is one instantiation of `PacketControlWordV1`, scoped to BitFrost's GPU-local
candidate scan, with its existing field layout and `ACE-RADIX-01` proof gate unchanged by this
capability.

#### Scenario: No second competing control-word contract is introduced
- **WHEN** a future change needs a BitFrost-GPU-scan-shaped compact record
- **THEN** it uses the existing `PacketGlyphV1` contract, not a newly duplicated one, per this repo's "One Canonical Runtime Owner Per Capability" rule
