## ADDED Requirements

### Requirement: Fail-closed parser routing
The system SHALL route a source to a code parser only when its extension is bound to a sidecar language
with a known authority revision. When sidecar capabilities are unavailable, code routes SHALL be
reported as BLOCKED. Extensions with no binding SHALL be reported as NO_PARSER_RULE.

#### Scenario: Unknown extension abstains
- **WHEN** a source has an extension with no parser binding
- **THEN** the route SHALL be NO_PARSER_RULE and no parser SHALL run

#### Scenario: Unavailable sidecar blocks code routes
- **WHEN** sidecar capabilities cannot be read
- **THEN** sidecar-routed code sources SHALL be BLOCKED, and local document routes SHALL still resolve

### Requirement: Partial syntax is not complete coverage
A sidecar AST response SHALL count as COMPLETE only when `syntax_status` is `CLEAN` and
`scan_completeness` is `COMPLETE`. Any other status SHALL be recorded as partial and SHALL NOT
contribute admitted structure or count as covered.

#### Scenario: Recovered syntax errors are partial
- **WHEN** a sidecar response reports `syntax_status` of `RECOVERED_WITH_ERRORS`
- **THEN** the source SHALL be recorded as PARTIAL_SYNTAX_ERRORS and excluded from covered totals

### Requirement: Every submitted source has one disposition
An extractor run SHALL assign each submitted source exactly one disposition, and the accounting SHALL
reconcile to the submitted count.

#### Scenario: Accounting reconciles
- **WHEN** a run receives six submitted sources
- **THEN** the dispositions SHALL sum to six and the reconciled flag SHALL be true

### Requirement: Scoped centroid cache writes
Directory centroids SHALL be written only under the `atlas:dirintel:v1:` namespace with a TTL of
86400 seconds, and SHALL NOT overwrite any existing key.

#### Scenario: Existing keys are not overwritten
- **WHEN** a centroid key already exists
- **THEN** the write SHALL skip that key and record it as skipped
