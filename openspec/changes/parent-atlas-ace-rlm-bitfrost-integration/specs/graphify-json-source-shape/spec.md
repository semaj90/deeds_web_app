## ADDED Requirements

### Requirement: Bound JSON structural observations without expanding data arrays
The Graphify JSON observation producer SHALL apply the versioned JSON source-shape policy before constructing location observations. The policy SHALL defer source files larger than 4 MiB and files whose depth-bounded object-key observations exceed 2,000. It SHALL treat array values as opaque property values rather than emitting one observation per array member. It SHALL preserve exact parser spans for emitted object-key observations and represent valid scalar/root-array documents as zero-observation outcomes, not parse failures.

#### Scenario: Generated JSON artifacts are excluded from symbol-source coverage
- **WHEN** a frozen source manifest contains a path excluded by the shared generated-artifact policy
- **THEN** candidate planning SHALL classify it as excluded before it consumes an extraction batch slot
- **AND** the source SHALL remain in its admitted workspace without being counted as an unprocessed symbol source

#### Scenario: Authored object JSON is extracted within the bound
- **WHEN** an authored JSON object is at most 4 MiB and has at most 2,000 eligible object-key observations within depth 2
- **THEN** each eligible property SHALL produce one location-bearing structural observation
- **AND** nested array members SHALL remain opaque
- **AND** spans SHALL resolve to the exact property/value bytes through the existing source-envelope mapping

#### Scenario: JSON source exceeds a resource bound
- **WHEN** JSON exceeds 4 MiB or its eligible observation count exceeds 2,000
- **THEN** the extractor SHALL return `RESOURCE_LIMIT_DEFERRED` with the bound reason
- **AND** it SHALL NOT truncate the traversal or mark the source processed

#### Scenario: Valid JSON has no object-key observations
- **WHEN** JSON is a scalar, null, or root array
- **THEN** extraction SHALL report a valid zero-observation result rather than a parse failure

### Requirement: Stream JSONL records with bounded memory and explicit failures
The JSONL transport helper SHALL frame records from a byte stream, enforce a maximum record byte size before decoding/parsing, and yield object-valued records in bounded batches. It SHALL preserve backpressure by yielding each batch before accumulating the next, accept CRLF and UTF-8 records split across input chunks, and fail explicitly on malformed JSON, invalid UTF-8, or non-object records. It SHALL NOT silently drop malformed nonblank records or perform classification, persistence, embedding, or projection writes.

#### Scenario: Valid JSONL is processed in bounded batches
- **WHEN** a byte stream contains valid object records with LF or CRLF delimiters
- **THEN** the reader SHALL emit batches no larger than the configured bounded record count
- **AND** each batch SHALL include line range, count, and a deterministic SHA-256 checksum
- **AND** records split across transport chunks SHALL parse identically to contiguous input

#### Scenario: JSONL row exceeds the limit or is malformed
- **WHEN** a row exceeds the configured byte limit, is invalid UTF-8/JSON, or is not an object
- **THEN** the reader SHALL fail with a line-qualified reason
- **AND** it SHALL NOT emit a partial batch for the invalid row or silently mark it processed

### Requirement: Build bounded AST mini-record features from existing rows
The AST mini-record adapter SHALL consume an existing AST row plus exact source, workspace, content-digest, span, and producer revisions. It SHALL preserve the existing tree-node locator as a locator only, emit deterministic syntax-kind flags, and mark the record noncanonical. It SHALL reject missing/malformed revision evidence and invalid byte/line spans. It SHALL NOT persist parser trees, derive a new identity, or write to a graph/vector/cache store.

#### Scenario: Revision-qualified AST row becomes a mini feature record
- **WHEN** an existing AST row has exact source/workspace revisions, source digest, producer revision, and valid span
- **THEN** the adapter SHALL return the bounded AST fields and deterministic flags
- **AND** it SHALL retain the existing tree-node ID only as a locator with `canonicalAuthority=false`

#### Scenario: AST row lacks authority or span evidence
- **WHEN** source/workspace revision is missing or the span is empty/reversed
- **THEN** the adapter SHALL reject the row rather than infer revisions or identities

### Requirement: Compile a revision-bound structural relation graph without imposing acyclicity
The structural relation graph adapter SHALL join only existing revision-qualified AST mini-records and structural reference facts. Both endpoints SHALL resolve uniquely by existing upstream node locator within the same workspace snapshot; source facts SHALL match the exact source reference/revision of their source node. Missing, ambiguous, stale, or unsupported facts SHALL be diagnostics, not edges. Output ordering and checksum SHALL be deterministic, duplicate evidence for one relation SHALL coalesce, and cycles SHALL be permitted. The graph SHALL remain noncanonical and SHALL NOT persist or project data. The existing Graphify structural-intelligence compiler MAY expose it as a derived output only when canonical source-revision authority is proven, the full source-byte digest equals that revision, the workspace revision is checksum-qualified, every included node has a native upstream locator, and each chunk-span digest matches the exact source bytes. Otherwise compilation SHALL be deferred with a typed reason. The existing structural-stage receipt SHALL bind the graph checksum when present; this in-process receipt SHALL NOT be represented as durable snapshot/replay proof.

#### Scenario: Exact endpoints compile into a deterministic relation graph
- **WHEN** a structural reference fact and both mini-record endpoints match the same admitted workspace and exact source revision
- **THEN** the relation graph SHALL include one edge with the existing evidence references
- **AND** repeated equivalent evidence SHALL coalesce without losing evidence refs
- **AND** the graph checksum SHALL be invariant to input order

#### Scenario: Stale or ambiguous endpoints do not become edges
- **WHEN** a source revision differs, an endpoint is missing, or an upstream locator resolves to multiple mini-records
- **THEN** the relation SHALL be reported as unresolved and omitted from graph edges
- **AND** the output SHALL remain `canonicalAuthority=false`

#### Scenario: Structural compiler defers unqualified source evidence
- **WHEN** canonical source-revision authority is unproven, revisions are not checksum-qualified,
  source bytes do not match the source revision, a
  compatibility node ID is present, or a chunk digest differs from its exact span
- **THEN** the existing structural-intelligence adapter SHALL report a typed deferred reason
- **AND** it SHALL expose no relation graph or guessed edge for that input
- **AND** the structural-stage receipt SHALL bind the graph checksum only when a graph was compiled
