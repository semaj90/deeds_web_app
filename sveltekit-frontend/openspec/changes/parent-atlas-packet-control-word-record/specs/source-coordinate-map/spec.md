## ADDED Requirements

### Requirement: SourceCoordinateMapV1 reconciles UTF-8 byte and UTF-16 code-unit spans
The system SHALL define `SourceCoordinateMapV1`, computed once per `sourceRevision`, carrying
`sourceByteLength`, `utf8Checksum`, `lineStartByteOffsets`, and a `spans` array where each span
carries both `utf8StartByte`/`utf8EndByte` and `utf16StartCodeUnit`/`utf16EndCodeUnit` alongside
`line` and both column forms. UTF-8 byte offsets SHALL be treated as authoritative; UTF-16 values
are a derived projection.

#### Scenario: A span's UTF-8 and UTF-16 bounds both resolve to the same source text
- **WHEN** a `SourceCoordinateMapV1` span's `utf8StartByte`/`utf8EndByte` is sliced from the raw source bytes and its `utf16StartCodeUnit`/`utf16EndCodeUnit` is sliced from the UTF-16 decoding of the same source
- **THEN** both slices decode to the identical text

#### Scenario: Map is computed once and reused across callers for the same revision
- **WHEN** two different consumers (e.g. an LSP-position lookup and an ast-grep byte-offset lookup) request coordinates for the same `sourceRevision`
- **THEN** both read from the same cached `SourceCoordinateMapV1` instance rather than each recomputing their own conversion

### Requirement: SourceCoordinateMapV1 builds on the existing structural fingerprint, not a duplicate
The system SHALL derive `SourceCoordinateMapV1`'s whole-file fields (`sourceByteLength`,
`utf8Checksum`) from the existing `fingerprintStructuralSource()` function
(`src/lib/server/atlas/indexing/structural-observation-v1.ts`) rather than recomputing them, and
SHALL treat `StructuralObservationV1`'s existing `startByte`/`endByte` fields as the source of
UTF-8 span boundaries to extend with UTF-16/line/column projections, rather than re-deriving byte
spans independently.

#### Scenario: No duplicate whole-file fingerprint is computed
- **WHEN** a `SourceCoordinateMapV1` is built for a source revision
- **THEN** its `sourceByteLength`/`utf8Checksum` fields come from `fingerprintStructuralSource()`'s output, not an independent recomputation

### Requirement: Coordinate map never becomes a second source identity
The `SourceCoordinateMapV1` contract SHALL be keyed by the existing canonical `sourceRevision`
value and SHALL NOT introduce a new identity field for the source file.

#### Scenario: Map lookup requires an existing sourceRevision
- **WHEN** a caller requests a `SourceCoordinateMapV1`
- **THEN** it must supply an already-canonical `sourceRevision`, never a bare file path with no revision binding
