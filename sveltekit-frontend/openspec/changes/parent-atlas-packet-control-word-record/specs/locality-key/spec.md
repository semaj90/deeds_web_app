## ADDED Requirements

### Requirement: AtlasLocalityKeyV1 is a physical locality key, never a semantic or identity claim
The system SHALL define `AtlasLocalityKeyV1` carrying `domainId`, `lodClass`, `residencyClass`,
`clusterId`, `somCell`, `hilbertKey`, `hammingSig`, and `packetOrdinal`. This contract SHALL NOT
be usable as a substitute for `packetKey`/`sourceRef` canonical identity, and SHALL NOT be treated
as a semantic-similarity or KNN-truth result.

#### Scenario: Locality key alone cannot resolve canonical identity
- **WHEN** only an `AtlasLocalityKeyV1` is available
- **THEN** resolving the underlying packet still requires a separate ordinal-to-packetKey lookup, exactly as `ResidencySortKeyV1` already requires elsewhere in this repo

#### Scenario: Hilbert proximity is not treated as retrieval relevance
- **WHEN** two packets have nearby `hilbertKey` values
- **THEN** no ranking code path treats that proximity as evidence of semantic similarity — it is used only for physical storage/batch locality

### Requirement: Hilbert and Hamming computations reuse existing repo primitives
The system SHALL compute `hilbertKey` via the existing `hilbertIndexND()` function
(`src/lib/server/atlas/tensors/tetris-6d-hilbert-step1.ts`) and SHALL compare `hammingSig` values
via the existing `hammingDistance1Bit`/`hammingSimilarity1Bit` functions
(`src/lib/server/search/mla-kv-compress.ts`) or the existing Redis-`BITCOUNT` pattern
(`src/lib/server/cache/packet-bitmap.ts`) when operands already live in Redis. No new Hilbert or
Hamming/popcount implementation SHALL be introduced by this capability.

#### Scenario: No duplicate Hilbert implementation is introduced
- **WHEN** `AtlasLocalityKeyV1`'s `hilbertKey` is computed
- **THEN** the computation delegates to the existing `hilbertIndexND()` function rather than a new Hilbert-curve implementation

#### Scenario: No duplicate Hamming/popcount implementation is introduced
- **WHEN** two `hammingSig` values are compared
- **THEN** the comparison delegates to an existing Hamming-distance function already in the repo rather than a new popcount implementation

### Requirement: Hamming filtering is a pre-filter, not an additional RRF vote
The system SHALL use `hammingSig` comparisons (`popcount(a XOR b)`) only to shrink a candidate set
before expensive dense/graph/lexical work, never as an independent scored lane fused via
reciprocal-rank fusion alongside cuVS/cuGraph/lexical results.

#### Scenario: Hamming-filtered candidates still go through the real retrieval lanes
- **WHEN** a candidate set is narrowed via Hamming-radius filtering
- **THEN** the narrowed set is still scored by the existing exact retrieval lanes before ranking, not treated as already-ranked output
