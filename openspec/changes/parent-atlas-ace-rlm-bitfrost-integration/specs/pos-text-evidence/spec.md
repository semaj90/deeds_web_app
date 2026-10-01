## ADDED Requirements

### Requirement: Bind optional POS output to grounded natural-language source spans
The POS evidence adapter SHALL accept only UTF-8 byte-coordinate assertions from the existing
`:8095` linguistic pass and SHALL bind them to caller-identified comments, docstrings, Markdown,
or natural-language identifier spans. It SHALL verify that each token's byte slice exactly equals
the emitted token text, include source/workspace/provider revisions and a region digest, and emit
`canonical_authority=false`. It SHALL NOT infer span kind, source identity, symbols, taxonomy
assignments, or persist/project evidence.

#### Scenario: Exact sidecar POS tokens become grounded evidence
- **WHEN** a caller supplies an exact source/workspace identity, immutable spaCy provider revision,
  UTF-8 source bytes, a caller-identified allowed text span, and token assertions matching those
  bytes
- **THEN** the adapter SHALL emit deterministic checksummed `atlas.pos-text-evidence.v1`
- **AND** it SHALL preserve token byte spans and remain noncanonical

#### Scenario: Unbound or mismatched POS assertions fail closed
- **WHEN** a provider revision is mutable/unknown, coordinates are not UTF-8 bytes, a token falls
  outside the supplied text region, or its span does not equal its text
- **THEN** the adapter SHALL reject the evidence without changing canonical state
