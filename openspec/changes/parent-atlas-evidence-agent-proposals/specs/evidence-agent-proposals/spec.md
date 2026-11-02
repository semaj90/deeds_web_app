## ADDED Requirements

### Requirement: Evidence claims preserve exact source grounding
The SvelteKit evidence synthesis boundary SHALL validate every claim with a versioned Zod contract bound to exact source bytes, source digest, source reference, and source/workspace revisions when available. Each populated `who`, `what`, `why`, or `how` field SHALL carry a source span whose bytes reproduce the cited text. Case identity SHALL come from authorized server context, not model output.

#### Scenario: Exact grounded claim is accepted as a proposal
- **WHEN** a claim contains a valid source digest and revisions, bounded UTF-8 byte spans, exact matching source text, and a server-authorized case binding
- **THEN** the validator returns a source-grounded proposal without promoting its assertion to canonical truth

#### Scenario: A span is out of bounds or differs from source bytes
- **WHEN** any claim span is negative, reversed, out of bounds, or does not reproduce the exact source bytes
- **THEN** the claim is rejected with a typed grounding error and no summary or downstream proposal is emitted from it

#### Scenario: Model attempts to choose a different case
- **WHEN** extracted output supplies a case ID that differs from the server-authorized upload context
- **THEN** the case ID is rejected and the authorized case binding remains unchanged

#### Scenario: LangExtract character offsets contain Unicode text
- **WHEN** the adapter converts a character-based extraction span to the contract's UTF-8 byte-range convention
- **THEN** the converted range is verified against the original bytes and mismatches fail closed

### Requirement: Evidence summaries cite validated claims
Any generated summary SHALL be derived only from validated claim IDs and SHALL retain model/provider revision, source digests, and the supporting claim references. LangExtract and AST/spaCy outputs are evidence observations; they SHALL NOT be described as verified truth or substituted for source-grounded summaries.

#### Scenario: Summary has claim provenance
- **WHEN** a summary is generated from one or more accepted claims
- **THEN** its proposal includes each supporting claim ID, source digest, model revision, and non-canonical status

#### Scenario: Summary provider is unavailable
- **WHEN** the configured provider is missing, unavailable, or returns invalid output
- **THEN** the workflow returns `BLOCKED` or `UNVERIFIED`, never an empty-success or fabricated summary

### Requirement: Four workflow proposals remain non-canonical
The evidence agent feature SHALL expose distinct evidence-synthesis, taxonomy/timeline, low-rank recommendation, and recursive-verification proposals. Each proposal SHALL retain input source/claim references, versioned algorithm/provider identity, status, and blockers; it SHALL NOT write canonical labels, vectors, search rankings, graph facts, or repair results.

#### Scenario: Taxonomy mapping has no reviewed owner
- **WHEN** OAK or a local resolver returns a classification but no approved identity/crosswalk and taxonomy revision can be proven
- **THEN** the result is shown as `UNVERIFIED` and no canonical feature label is emitted

#### Scenario: Timeline events branch or arrive concurrently
- **WHEN** events have multiple valid successors or equal observation timestamps
- **THEN** the immutable event records are preserved and display links are derived deterministically without forcing a single authoritative linked list

#### Scenario: Low-rank recommendation is evaluated
- **WHEN** SVD or a Tang-inspired sampling challenger is run
- **THEN** it uses a frozen revision-qualified input and reports held-out ranking metrics, resource use, algorithm revision, and comparison baseline without changing production ranking

#### Scenario: Recursive planner proposes a repair
- **WHEN** the Planner produces an action candidate
- **THEN** only the independent Verifier may issue a test receipt, and the workflow remains proposal-only unless a separate admission owner authorizes execution

### Requirement: SvelteKit proposal cards show evidence state clearly
The SvelteKit UI SHALL render only schema-validated proposal view models and SHALL distinguish `PROPOSED`, `UNVERIFIED`, `CONFLICTED`, and `BLOCKED`. It SHALL show provenance and blockers without exposing hidden reasoning, raw model traces, or false completion progress.

#### Scenario: Four proposals are available
- **WHEN** the proposal assembler returns the four workflow results
- **THEN** the UI renders separately labeled cards with source references, revision, generated-at time, verification status, and blockers

#### Scenario: One workflow is blocked while others complete
- **WHEN** a required sidecar, taxonomy owner, or evaluator is unavailable
- **THEN** only the affected card is marked `BLOCKED`; the UI does not report global reconciliation or agent completion

#### Scenario: Raw search or model output is supplied
- **WHEN** a route attempts to pass unvalidated raw hits or hidden reasoning directly to the UI/LLM
- **THEN** the proposal boundary rejects the payload and records no hidden reasoning or tensor state
