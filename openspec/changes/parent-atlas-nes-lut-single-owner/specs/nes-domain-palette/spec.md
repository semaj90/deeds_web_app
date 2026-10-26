## ADDED Requirements

### Requirement: Domain palette bytes and NES color values SHALL remain distinct
The shared versioned palette SHALL assign unique nonzero `lutByte` values to the ten domain entries, reserve `0x00` exclusively for `UNRESOLVED`, and represent the NES color independently as `nesHex`. The generated palette artifact SHALL carry a revision and verifiable checksum. Consumers SHALL use the same artifact and SHALL NOT treat either value as source, packet, workspace, or candidate identity.

#### Scenario: Svelte rune sub-label routes through the UI domain
- **WHEN** AST routing observes a Svelte 5 rune such as `$state` and no stronger resolved domain overrides it
- **THEN** it emits the UI domain ordinal `lutByte=0x02` and separate `nesHex=0x2A`, without using `0x2A` as a domain ordinal

#### Scenario: Unknown label remains unresolved
- **WHEN** a consumer cannot exactly resolve a domain label
- **THEN** it emits `lutByte=0x00` as `UNRESOLVED`, and never labels the result as `general`

#### Scenario: ACE proposal uses the shared palette without admission
- **WHEN** ACE compiles an evidence-whitelisted proposal for a known domain
- **THEN** its descriptor returns the shared domain `lutByte`, matching `nesHex`, and `canonical_authority=false` with no persistence
