## ADDED Requirements

### Requirement: Prefill and tournament descriptors SHALL carry the shared domain palette as advisory metadata
Prefill and tournament packets MAY carry the versioned domain `lutByte` and NES `nesHex` from the shared palette artifact. The fields SHALL remain distinct and advisory: neither value authorizes source scope, graph traversal, cache writes, identity, or model activation. Candidate content still requires the admitted ContextManifest and existing prefill owner.

#### Scenario: A qualified prefill candidate carries palette parameters
- **WHEN** a prefill packet is assembled from an admitted ContextManifest and its domain mapping is available
- **THEN** the packet carries the shared `lutByte`, separate `nesHex`, and palette revision, while preserving the canonical candidate and source identities

#### Scenario: Palette metadata cannot bypass prefill admission
- **WHEN** a candidate has palette metadata but lacks an admitted ContextManifest or trusted workspace context
- **THEN** prefill and tournament execution remain blocked and the palette contributes no authority
