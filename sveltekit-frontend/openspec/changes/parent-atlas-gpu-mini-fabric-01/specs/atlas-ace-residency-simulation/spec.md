## ADDED Requirements

### Requirement: AtlasAceResidencyV1 is named to avoid the NVIDIA ACE collision
The system SHALL name every residency-policy contract with an `AtlasAceResidency`-prefixed
identifier (e.g. `AtlasAceResidencyV1`), and SHALL NOT use a bare `Ace*` name for any residency,
cache, or promotion contract, to avoid collision with NVIDIA's unrelated cuVS "ACE" (Augmented Core
Extraction) HNSW-build terminology.

#### Scenario: A residency contract name is checked before merge
- **WHEN** a new residency/cache/promotion contract is added under this capability
- **THEN** its exported type name begins with `AtlasAceResidency`, not a bare `Ace`

### Requirement: Residency utility score is tested against predicted reuse, not plausibility
The system SHALL evaluate `AtlasAceResidencyV1`'s utility scoring by measuring whether promoting a
retrieved candidate's graph-neighborhood to WARM residency predicts that those neighbors are
actually re-requested on the immediately following query, using a query-sequence trace over
`GraphFixtureV1`-derived adjacency. The system SHALL NOT accept a score formula as validated merely
because its output values look plausible.

#### Scenario: Prefetch precision is measured against actual next-query reuse
- **WHEN** a candidate A is retrieved at query N and its graph neighbors B, C, D are promoted to WARM
- **THEN** the simulation records whether B, C, or D were actually requested at query N+1, contributing to `precisionOfPrefetch`

#### Scenario: Reported metrics include both benefit and cost
- **WHEN** a `BITFROST-SIM-01` run completes
- **THEN** the result artifact reports `hitRate`, `precisionOfPrefetch`, `bytesPromoted`, `bytesWasted`, `promotionLatency`, `evictionRate`, and `queryLatencyDelta` — not hit rate alone

### Requirement: LOD promotion/demotion follows the identity-to-prompt-ready ladder in order
The system SHALL model LOD promotion and demotion as a strictly ordered ladder (identity → glyph →
latent64 → latent128 → semantic768 → structural → source → prompt-ready), and SHALL NOT permit a
promotion or demotion transition that skips a rung without an explicit, logged override reason.

#### Scenario: A skipped-rung promotion is rejected or logged
- **WHEN** a promotion request attempts to move a candidate from `identity` directly to `semantic768`
- **THEN** the system either rejects the transition or logs an explicit override reason distinguishing it from a normal single-step promotion
