## ADDED Requirements

### Requirement: Bitmap-prefiltered structural narrowing
The system SHALL narrow `atlas_packets` to a bounded candidate `packet_key` set using a
parametrized Postgres query over existing indexed columns (`feature_id`, `source_ref`, `tags`,
`concept_ids`, `domain_class`, `workspace_revision`) before any dense similarity step runs. The
query SHALL require at least one of `feature_id`, `source_ref`, `concept_id`, or `tags` to be
present in the request; a request with only `domain_class` and no other filter SHALL be rejected.

#### Scenario: Filter with feature_id and tags narrows before dense search
- **WHEN** a caller invokes `atlas.packet_dense_search` with `feature_id` and `tags` set
- **THEN** the system SHALL run the Postgres bitmap-prefilter query first and pass only the
  resulting `packet_key` set into the dense reranking stage

#### Scenario: Request with only a non-selective filter is rejected
- **WHEN** a caller invokes `atlas.packet_dense_search` with only `domain_class` set and no
  `feature_id`, `source_ref`, `concept_id`, or `tags`
- **THEN** the system SHALL return an error indicating a selective filter is required, without
  running the query

### Requirement: Candidate set size bound with truncation signaling
The system SHALL bound the Stage 1 candidate `packet_key` set to a configurable maximum (default
500) before passing it to the dense reranking stage. If the unbounded Stage 1 result exceeds the
cap, the system SHALL set `candidateSetTruncated: true` in the response rather than silently
dropping rows without indication.

#### Scenario: Candidate set within cap
- **WHEN** the Stage 1 bitmap-prefilter query returns 120 matching `packet_key`s and the cap is 500
- **THEN** the response SHALL include `candidateSetTruncated: false` and all 120 candidates SHALL
  be eligible for the dense reranking stage

#### Scenario: Candidate set exceeds cap
- **WHEN** the Stage 1 bitmap-prefilter query returns more matching `packet_key`s than the
  configured cap
- **THEN** the system SHALL truncate the candidate set to the cap before dense reranking and SHALL
  set `candidateSetTruncated: true` in the response

### Requirement: Dense reranking restricted to the prefiltered candidate set
The system SHALL perform Qdrant ANN similarity search restricted to the Stage 1 candidate
`packet_key` set (via a payload filter), not an unfiltered top-K sweep of the target collection.
The caller SHALL explicitly specify which Qdrant collection (`codebase_chunks_768` or
`codebase_chunks_768_v2`) to query; the system SHALL NOT silently default to one.

#### Scenario: Dense search filtered to candidate set
- **WHEN** Stage 1 produces a candidate `packet_key` set of 80 packets
- **THEN** the Qdrant ANN query SHALL apply a payload filter limiting results to those 80
  `packet_key`s, not an unfiltered collection-wide search

#### Scenario: Missing collection parameter is rejected
- **WHEN** a caller invokes `atlas.packet_dense_search` without specifying a target Qdrant
  collection
- **THEN** the system SHALL return an error requiring an explicit collection choice

### Requirement: Join-back to canonical Postgres identity
The system SHALL join Qdrant hit results back to `atlas_packets` by `packet_key` or `source_ref`
(never by `feature_id` alone) to attach `summary`, `reward_prior`, `community_id`, and
`page_rank_score` before returning results.

#### Scenario: Join uses packet_key, not feature_id alone
- **WHEN** the dense reranking stage returns Qdrant hits with associated `packet_key` values
- **THEN** the system SHALL join back to `atlas_packets` using `packet_key` (or `source_ref` when
  `packet_key` is absent from the Qdrant payload), and SHALL NOT join using `feature_id` alone

### Requirement: Compact packet-control-word response shape
The system SHALL return results using the packet-control-word projection shape (`packetKey`,
`title_id`, `sourceRevision`, feature-presence bits, LOD/residency class) for the full result set,
and SHALL attach full `payload`/`summary` fields only for the top-K results indicated by an
`expandTopK` parameter (default 10).

#### Scenario: Default expansion limits full payload to top 10
- **WHEN** a caller invokes `atlas.packet_dense_search` without specifying `expandTopK`
- **THEN** all returned results SHALL include the compact control-word projection fields, and only
  the top 10 ranked results SHALL include full `payload`/`summary`

#### Scenario: Caller requests a larger expansion
- **WHEN** a caller invokes `atlas.packet_dense_search` with `expandTopK: 25`
- **THEN** the top 25 ranked results SHALL include full `payload`/`summary`, and the remainder
  SHALL include only the compact projection fields
