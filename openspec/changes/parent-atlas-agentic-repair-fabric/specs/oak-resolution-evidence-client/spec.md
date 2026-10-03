## ADDED Requirements

### Requirement: Fail-closed OAK evidence resolution
The client SHALL return `state: "RESOLUTION_UNAVAILABLE"` and `resolvedCurie: null` whenever the
`:8095` OAK kernel is unreachable or errors. It SHALL NOT synthesize `concept:<raw-label>` or any
other fabricated CURIE as a substitute.

#### Scenario: Sidecar unreachable
- **WHEN** the OAK kernel at `:8095` cannot be reached
- **THEN** the client returns `OakResolutionEvidenceV1` with `state: RESOLUTION_UNAVAILABLE`,
  `resolvedCurie: null`, and `canonicalAuthority: false`

### Requirement: Never authoritative for canonical identity
Every `OakResolutionEvidenceV1` record SHALL carry `canonicalAuthority: false` and SHALL NOT be
accepted by any caller as a substitute for `packetKey`/`sourceRevision`/`workspaceRevision`.

#### Scenario: Evidence record is never treated as identity
- **WHEN** a caller receives a `RESOLVED` evidence record
- **THEN** `resolvedCurie` is usable as evidence/context only, never as a packet or revision
  identifier

### Requirement: Two-tier evidence, Tier 1 never overrides Tier 2
When both the TypeScript domain resolver (Tier 1) and the OAK kernel (Tier 2) produce evidence for
the same label, the client SHALL keep both as distinct, typed evidence records rather than merging
or letting Tier 1 silently override Tier 2.

#### Scenario: Both tiers resolve the same label differently
- **WHEN** Tier 1 resolves a label to a domain bucket and Tier 2 resolves it to a richer concept
- **THEN** both evidence records are returned/logged distinctly, with no automatic precedence rule
  applied by this client
