## ADDED Requirements

### Requirement: Compact census precedes enrichment
The first pipeline output SHALL be a read-only `openspec-artifact-census-v1.json` derived from a fresh existing Workboard build whose task source hashes match current `tasks.md` files. It SHALL report task lifecycle counts, report disposition counts and bytes, workspace/task-population revisions, freshness, and explicit zero mutation flags; it SHALL remain below 10,000,000 bytes. Heuristic supersession labels SHALL be counted as review candidates, not confirmed superseded tasks.

#### Scenario: Workboard task source hashes drift
- **WHEN** any Workboard task-ledger hash differs from the current file
- **THEN** census generation fails closed and emits no current-population counts

#### Scenario: Workboard suggests supersession by text heuristic
- **WHEN** a task is labeled superseded/historical only by the Workboard heuristic
- **THEN** it remains a visible review candidate and the confirmed-superseded count remains unchanged

### Requirement: Revision-bound task cards
Each compact TaskCard SHALL join an existing Workboard task to the current evidence-fabric task and evidence card by source path, source coordinate, exact task-block revision, and workspace revision. The corpus SHALL verify current source-file hashes and a one-to-one task population before emission. TaskCards SHALL distinguish checkbox state from evidence proof state, expose review reasons and stable identity, and declare `canonicalAuthority=false` and `mutationAuthorized=false`.
The serialized TaskCard corpus SHALL remain below 10,000,000 bytes; corpus-level schema and revision fields may be shared rather than repeated in every card.

#### Scenario: Task block or identity differs between projections
- **WHEN** a Workboard task has no exact evidence-fabric row with the same source coordinate, block hash, and logical task key
- **THEN** compilation fails closed and emits no TaskCard corpus

#### Scenario: Checked claim lacks current proof
- **WHEN** a task checkbox is checked but its current evidence card is not `PROVEN`
- **THEN** the TaskCard preserves `CHECKED`, reports the actual proof state, and marks authority review required

### Requirement: Metadata-first report manifests
Each `ReportArtifactManifestV1` SHALL bind a report path, size, media type, workspace revision, and checksum state. A checksum reused from a prior audit SHALL be labeled as a stat-matched cache hit, not fresh proof; changed files at or below 10,000,000 bytes may be freshly hashed, while changed larger files SHALL remain unhashed and review-required. Report/task association, sensitivity, replay need, and archive eligibility SHALL remain unassessed or false until independently verified. The initial manifest builder SHALL retain local sources and perform no archive, cache, database, or vector writes.

#### Scenario: Prior audited report has matching filesystem metadata
- **WHEN** the report size and modification time match a prior audited entry
- **THEN** the manifest may reuse its checksum only with an explicit cached-checksum state and prior-audit provenance

#### Scenario: Changed oversized report is discovered
- **WHEN** a report larger than 10,000,000 bytes has changed since the prior audit
- **THEN** the builder records metadata without hashing its contents and routes it to review without archive eligibility

### Requirement: Supersession links remain review-only
`SupersessionLinkV1` candidates SHALL bind to the current source task key, task revision, source-file revision, and source reference. Text heuristics alone SHALL NOT name a successor, confirm replacement, or suppress retrieval. Unconfirmed links SHALL remain review-required, have no archive/raw pointer, and declare `canonicalAuthority=false`, `mutationAuthorized=false`, and `retrievalSuppressed=false`.

A reviewed `SupersessionLinkV1` receipt SHALL bind predecessor and successor stable keys, task revisions, source-file revisions, the exact workspace head, and the task-population revision. It SHALL include an allowed review basis, exact reason, evidence references including both exact task source coordinates, reviewer identity, canonical review timestamp, `reviewState=CONFIRMED`, and a SHA-256 checksum over the canonical receipt payload. Both tasks SHALL resolve uniquely in the current TaskCard corpus; multiple successors or cycles SHALL fail closed. Confirmation may classify only the derived predecessor card as `SUPERSEDED` for default retrieval, while preserving checkbox/evidence state and `canonicalAuthority=false`, `mutationAuthorized=false`. Confirmation SHALL NOT create an archive pointer or remove raw content; compaction remains gated on independent SeaweedFS copy/readback/replay proof.

#### Scenario: Workboard marks a task historical by heuristic
- **WHEN** no exact successor and independently reviewed replacement receipt exist
- **THEN** the link is an unconfirmed review candidate and the task remains retrievable

#### Scenario: Current reviewed receipt confirms one exact successor
- **WHEN** the receipt checksum, workspace/task-population revisions, and unique predecessor/successor task and source revisions all match
- **THEN** the derived predecessor is excluded from default retrieval and remains available to explicit history retrieval without changing `tasks.md`, evidence state, or archive pointers

#### Scenario: Receipt is stale, ambiguous, cyclic, or tampered
- **WHEN** a receipt fails checksum or revision checks, resolves a task ambiguously, names multiple successors, or forms a cycle
- **THEN** corpus compilation fails closed before producing a superseded card, and no task is suppressed or archived

### Requirement: Incremental Graphify and compact retrieval
Daily Graphify output SHALL be treated as change signals, mapped through declared task read/write sets to a dirty task set. Only dirty TaskCards/features/embeddings and affected centroid memberships or Valkey hints may be refreshed. Centroids SHALL be routing hints only. The OpenSpec-specific selector SHALL return only `CURRENT`, `WAITING`, and `REVIEW_REQUIRED` by default; `SUPERSEDED` and `HISTORICAL` SHALL require an explicit history/debug flag. It SHALL preserve the compiled incumbent order, enforce a bounded result limit, and SHALL NOT claim to rank or mutate tasks.

#### Scenario: Default retrieval excludes history
- **WHEN** the OpenSpec TaskCard selector runs without an explicit history/debug option
- **THEN** it returns only the configured current lifecycle states in deterministic incumbent order, within the requested bound, without ranking or mutating task authority

### Requirement: Single TaskCard selector and advisory ranker boundary
`selectOpenSpecTaskCardsV1` SHALL be the sole owner of TaskCard retrieval/lifecycle selection. It SHALL bind the exact selected card list to workspace and task-population revisions and a candidate checksum. An optional lifecycle-state filter SHALL be recorded in that selection result and SHALL NOT imply execution readiness or authorization. A TaskCard ranker SHALL consume the selector result, verify its checksum and revisions, and preserve every selected card exactly once; it SHALL NOT add, remove, revalidate, or reselect candidates. When no revision-bound ranking features exist, it SHALL emit neutral deterministic ordering and an explicit feature blocker, not inferred priority. Raw Workboard ranking SHALL remain explicitly legacy compatibility. `ReportArtifactManifestV1` SHALL remain per-artifact metadata, separate from the Workboard shard manifest contract.

#### Scenario: Ranker receives a frozen selector result
- **WHEN** the TaskCard ranker receives a valid `atlas.openspec-task-retrieval-result.v1`
- **THEN** it verifies the candidate checksum and revisions, preserves the exact card population, reports advisory-only status, and performs no writes

#### Scenario: Selector result is tampered or stale
- **WHEN** the card list differs from its candidate checksum or the selector revision binding is absent
- **THEN** ranking fails closed without dropping or substituting cards

#### Scenario: Ranking features are absent
- **WHEN** the selected TaskCards have no revision-bound ranking features
- **THEN** the ranker uses neutral deterministic identity ordering and reports `NO_REVISION_BOUND_TASKCARD_RANK_FEATURES`

#### Scenario: No task source intersects a Graphify delta
- **WHEN** a daily Graphify pass contains no source change referenced by a task read/write set
- **THEN** the task card and embedding remain unchanged and no centroid/cache invalidation is emitted

#### Scenario: Query asks for current actionable work
- **WHEN** a query does not request history or debugging
- **THEN** superseded/historical cards are excluded from default candidates

#### Scenario: Task ledger changes after card compilation
- **WHEN** the current Git revision or any task-ledger checksum differs from the triage corpus
- **THEN** retrieval rejects the corpus as stale instead of serving outdated task cards

### Requirement: Existing optional compute owners
Centroid/KMeans routing SHALL wait until compact TaskCards exist and SHALL reuse the existing cuML KMeans owner/environment; no parallel PyTorch KMeans SHALL be added. TurboVec SHALL be limited to a small current hot corpus. simdjson benchmarking SHALL be limited to metadata JSON/JSONL, not vectors or Arrow tensors.

#### Scenario: Compact corpus is not yet stable
- **WHEN** TaskCard lifecycle and population checks have not passed
- **THEN** embeddings, KMeans, TurboVec, and Valkey activation remain deferred

### Requirement: Revision-bound task snapshot
The triage pipeline SHALL derive its task population from current OpenSpec `tasks.md` files and bind every task observation to the workspace revision, source path, source-file checksum, task-span checksum, and snapshot manifest checksum. Generated Workboard or TODO reports with a different source revision SHALL be labeled stale and SHALL NOT replace current ledger observations.

#### Scenario: Current ledger snapshot differs from prior Workboard
- **WHEN** a generated Workboard references a different task-ledger revision or checksum than the current snapshot
- **THEN** the pipeline marks that Workboard `STALE_INPUT`, rebuilds task observations from the current ledgers, and preserves the prior report as comparison-only evidence

#### Scenario: A task ledger changes during snapshot construction
- **WHEN** a source task file changes between its initial stat/checksum and completed read
- **THEN** the pipeline rejects that snapshot as `SOURCE_CHANGED_DURING_READ` and emits no candidate population from it

### Requirement: Bounded streaming extraction
The parser SHALL stream ledgers and large report inputs in bounded batches, preserve task boundaries and exact source spans, and enforce configured limits on per-task context, batch size, and emitted evidence references. Parser/sidecar output SHALL remain an observation and SHALL NOT become task authority.

#### Scenario: Oversized ledger corpus is processed
- **WHEN** the current task corpus exceeds the configured in-memory task or byte budget
- **THEN** the parser emits bounded, checksummed task records without loading the complete corpus or prompt context at once

#### Scenario: Optional parser sidecar is unavailable
- **WHEN** simdjson or a Python sidecar is missing, incompatible, or unhealthy
- **THEN** the CPU/Node baseline continues or returns an explicit bounded failure, and no task is dropped or promoted because of the optional dependency

### Requirement: Fail-closed lifecycle and supersession classification
The pipeline SHALL distinguish open/actionable, blocked, stale-reference, supersession-candidate, reviewed-superseded, completed-with-evidence, and human-review states. Text similarity, recency, checkbox state, model output, missing files, and rank scores SHALL NOT independently close, suppress, or rewrite a task. A superseded classification SHALL require an explicit successor/supersedes reference or a separately reviewed receipt bound to the current task and successor revisions.

#### Scenario: Similar tasks have no explicit supersession relation
- **WHEN** two task claims are textually or semantically similar but neither declares a successor relation and no reviewed receipt exists
- **THEN** both remain visible and the pair is emitted only as a `SUPERSESSION_CANDIDATE` for review

#### Scenario: Supersession receipt is stale or ambiguous
- **WHEN** a supersession receipt does not match the current source checksums or resolves to multiple successor tasks
- **THEN** the lifecycle remains `REVIEW_REQUIRED` and the receipt cannot hide or close either task

#### Scenario: Checkbox is checked without current proof
- **WHEN** a task is checked but lacks its required current revision-bound proof evidence
- **THEN** the task remains a claim with an unresolved proof state and is not ranked as completed-with-evidence

### Requirement: Shared frozen-population ranking tournament
All deterministic and challenger rankers SHALL consume the same checksum-bound candidate population and feature definitions. The deterministic eligibility/readiness gate SHALL remain authoritative for candidate inclusion. Tournament results SHALL be advisory, explainable, replayable, and SHALL NOT grant scheduler selection, alter `tasks.md`, or change evidence state.

#### Scenario: Challenger output changes candidate order
- **WHEN** an embedding, TurboVec, centroid/KMeans, low-rank, or learned challenger changes candidate ordering
- **THEN** the tournament records rank deltas, input/revision checksums, feature coverage, and evaluation metrics while preserving the deterministic incumbent and `selected=false`

#### Scenario: Challenger population or features do not match
- **WHEN** a challenger report is bound to a different task population, task revision, or feature schema
- **THEN** the comparison is rejected as `COHORT_MISMATCH` and cannot contribute to the advisory ordering

### Requirement: Evidence-grounded bounded summaries
Every recommendation or generated summary SHALL include exact task identity, source span/checksum, evidence references, freshness, blockers, and uncertainty. LangExtract/DAG and Ornith outputs SHALL be treated as proposals. The model context SHALL be bounded to selected task/evidence cards and SHALL NOT receive the full task backlog by default.

#### Scenario: Summary references selected evidence
- **WHEN** optional extraction or Ornith synthesis is run for a candidate
- **THEN** the output is accepted as a summary proposal only if each material claim resolves to a current task/evidence reference; unresolved claims remain marked uncertain

#### Scenario: Synthesis service is unavailable
- **WHEN** LangExtract or the configured Ornith llama-server endpoint is unavailable or returns invalid output
- **THEN** the pipeline returns deterministic evidence cards with synthesis marked missing/incomplete and performs no fallback model promotion

### Requirement: Revision-safe retrieval cache
Redis/Valkey SHALL store only rebuildable, bounded retrieval/cache projections keyed by the exact workspace, task-population, evidence/Graphify, embedding, ranker, and policy revisions used to create them. Cache or centroid results SHALL NOT own task identity, task lifecycle, final ranking, or scheduler permission.

#### Scenario: Exact revision cache hit
- **WHEN** a requested key matches all source, evidence, embedding, ranker, and policy revisions
- **THEN** the pipeline may reuse the bounded candidate/card references and reports the exact cache-key manifest

#### Scenario: Stale or unavailable cache
- **WHEN** any required revision differs or Redis/Valkey is unavailable
- **THEN** the result is `STALE_REJECT` or `CACHE_UNAVAILABLE` and the pipeline falls back to the deterministic local projection without treating stale values as current

### Requirement: Gated SeaweedFS archival
The initial pipeline SHALL emit an archive plan for eligible derived reports without moving or deleting source files. Any later archive execution SHALL require explicit authorization, source checksum binding, successful copy, independent object readback with matching checksum/size, and a revision-bound archive receipt before changing disposition. Source `tasks.md` files SHALL NOT be archived by this pipeline.

#### Scenario: Plan-only archive candidate
- **WHEN** a derived report is superseded or exceeds the repository report-size policy
- **THEN** the pipeline may emit a plan containing source identity, checksum, size, retention reason, and proposed object key while leaving source and destination writes at zero

#### Scenario: Archive copy or readback fails
- **WHEN** the destination copy fails or independent readback differs from the source checksum or byte size
- **THEN** the archive is not marked complete, the local source remains untouched, and the receipt reports `ARCHIVE_INCOMPLETE`

### Requirement: Optional compute acceleration
The existing cuML KMeans owner, simdjson, TurboVec, embeddings, and model synthesis SHALL remain optional challengers/accelerators. Their absence SHALL NOT prevent deterministic task parsing, lifecycle checks, evidence gating, or a baseline bounded queue.

#### Scenario: Existing WSL cuML owner is not qualified
- **WHEN** the WSL2 `atlas-rapids-cu13` cuML environment or CUDA parity proof is unavailable
- **THEN** centroid routing is marked `NOT_AVAILABLE` or `NOT_PROVEN`, the CPU/Node baseline remains usable, and no parallel PyTorch KMeans or implicit installation is attempted
