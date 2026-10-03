# atlas-lod-promotion-ladder Specification

## Purpose
TBD - created by archiving change parent-atlas-bitfrost-sim-01. Update Purpose after archive.
## Requirements
### Requirement: AtlasLodLadderV1 is named to avoid the NVIDIA ACE collision
The system SHALL name every LOD promotion/demotion contract with an `AtlasLodLadder`-prefixed (or
similarly `Atlas`-prefixed) identifier, and SHALL NOT use a bare `Ace*` name, to avoid collision
with NVIDIA's unrelated cuVS "ACE" (Augmented Core Extraction) HNSW-build terminology.

#### Scenario: A ladder contract name is checked before merge
- **WHEN** a new LOD promotion/demotion contract is added under this capability
- **THEN** its exported type name begins with `Atlas`, not a bare `Ace`

### Requirement: LOD promotion/demotion follows the identity-to-prompt-ready ladder in order
The system SHALL model LOD promotion and demotion as a strictly ordered ladder (identity → glyph →
latent64 → latent128 → semantic768 → structural → source → prompt-ready), and SHALL NOT permit a
promotion or demotion transition that skips a rung without an explicit, logged override reason.

#### Scenario: A skipped-rung promotion is rejected or logged
- **WHEN** a promotion request attempts to move a candidate from `identity` directly to `semantic768`
- **THEN** the system either rejects the transition or logs an explicit override reason distinguishing it from a normal single-step promotion

#### Scenario: A single-rung promotion succeeds without an override
- **WHEN** a promotion request moves a candidate from `latent64` to `latent128`
- **THEN** the transition succeeds without requiring an override reason

### Requirement: LOD rung byte-size assumptions are explicit and documented, not measured
The system SHALL compute `bytesPromoted`/`bytesWasted` using a named, documented table of nominal
per-rung byte sizes, and SHALL record that table in the result artifact so its assumptions are
visible to any reviewer.

#### Scenario: The nominal byte-size table appears in the result artifact
- **WHEN** a residency/ladder simulation run completes and writes its result JSON
- **THEN** the JSON includes the exact per-rung byte-size constants used to compute
  `bytesPromoted`/`bytesWasted` for that run

### Requirement: LOD promotion events are triggered by the same graph-neighbor-promotion signal as WARM residency promotion, but validated independently
The system SHALL trigger LOD-rung promotion for a candidate's graph neighbors using the same
retrieval event that triggers WARM residency promotion (per `atlas-ace-residency-simulation`), and
SHALL validate LOD-ladder ordering independently of residency-tier state, such that a defect in one
state machine cannot mask a defect in the other.

#### Scenario: A ladder-ordering violation is detected even when residency promotion succeeds
- **WHEN** a candidate's residency tier promotion succeeds but its LOD-ladder transition attempts to
  skip a rung without an override reason
- **THEN** the ladder violation is reported independently of the residency promotion's own success

