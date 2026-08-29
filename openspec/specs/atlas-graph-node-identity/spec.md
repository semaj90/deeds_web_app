# Parent Atlas Graph Node Identity — Requirements

## Requirement: Graph node identity is layered, not single-sourced

The system SHALL represent a graph node through four non-conflatable identity layers.

No single field SHALL be promoted to a universal "tree node ID". `treeNodeId` is a legacy structural hint and SHALL remain nullable; it SHALL NOT gate candidate identity or graph projection.

The four layers, in ascending authority, are:

- SOURCE / STRUCTURAL OCCURRENCE
- CANONICAL CODE IDENTITY
- GRAPH EXTERNAL IDENTITY
- GRAPH ORDINAL

### Scenario: Degraded tree link

Given a packet has no resolved `treeNodeId`,
when Atlas projects it into the graph,
then the node SHALL still carry a canonical code identity (`packetKey` / `symbolVersionId` / `chunkId`) and SHALL be assigned a stable `graphNodeKey`, and the missing `treeNodeId` SHALL NOT downgrade the node.

---

## Requirement: Source / structural occurrence layer

The system SHALL preserve real upstream Tree-sitter identities when available:

- `upstream_node_id`
- `upstream_chunk_id`
- `upstream_symbol_id`

The source occurrence SHALL be expressed as:

- `source_ref`
- `source_revision`
- `upstream_node_id`
- `upstream_chunk_id`
- `byte_start`
- `byte_end`

This layer is the structural origin. It MAY be promoted to canonical identity but SHALL NOT require it. When a fact depends on a precise byte span, the occurrence SHALL be retained even if no stable symbol identity exists.

---

## Requirement: Canonical code identity layer

The system SHALL project a canonical code identity from packet ledger truth:

- `packet_key`
- `stable_symbol_id`
- `symbol_version_id`
- `chunk_id`

`symbol_version_id` SHALL distinguish a symbol from its earlier revisions; it SHALL NOT collapse distinct versions into one identity.

This layer is the canonical code identity. It drives graph projection.

---

## Requirement: Graph external identity (GraphNodeKeyV1)

The system SHALL assign each projected graph node a durable application-generated identifier `graphNodeKey` of the form:

- symbol: `symbol:<symbolVersionId>`
- packet: `packet:<packetKey>`
- chunk: `chunk:<chunkId>`
- occurrence (unpromoted): `occurrence:sha256(sourceRef + sourceRevision + upstreamNodeId + byteStart + byteEnd)`

`graphNodeKey` SHALL be stable across retrievals for the same underlying symbol/version.

### Scenario: Same symbol, new occurrence

Given the same `symbolVersionId` is materialized at two different byte spans,
when Atlas projects both,
then each occurrence SHALL carry a distinct `occurrence:` `graphNodeKey`, but they SHALL share the `symbol:` `graphNodeKey`.

---

## Requirement: Hyperedge identity for n-ary facts

When a semantic fact depends on three or more participating entities, the system SHALL preserve it as one canonical n-ary relation/hyperedge rather than flattening it into pairwise edges.

A hyperedge SHALL be identified as:

`hyperedge:sha256(relationType + sorted participant graphNodeKeys + evidenceRevision)`

Hyperedges are projection identities over participants, not canonical source identities.

Pairwise graph edges MAY be generated as traversal projections, but they SHALL reference the canonical hyperedge ID so the original n-ary fact can be reconstructed.

### Scenario: Access-control fact

Given a feature, route, auth guard, table and ownership column jointly establish one access-control fact,
when evidence is materialized,
then Atlas SHALL preserve the five-participant relation as one canonical hyperedge with typed member roles, and any derived pairwise edges SHALL reference that hyperedge ID.

---

## Requirement: Ordinal spaces are distinct

The system SHALL maintain separate index spaces and SHALL NOT equate them:

| Index space | Meaning |
| --- | --- |
| `CandidateOrdinal` | position of a retrieval candidate within a lane's candidate set |
| `GraphOrdinal` | `0..V-1` position of a node within the materialized graph |
| cuGraph internal vertex id | engine-internal handle |
| Neo4j `elementId()` | database-internal element handle |
| `upstream_node_id` | Tree-sitter structural node id |

`CandidateOrdinal` SHALL NOT be confused with `GraphOrdinal`. A stable `graphNodeKey` SHALL be the durable link between candidate and graph node; ordinals SHALL NOT be used for identity or dedup.

### Scenario: Stable key across ordinals

Given the same `graphNodeKey` is enumerated at `CandidateOrdinal=3` in one lane and `GraphOrdinal=12` in the graph,
when the system reconciles candidates against the graph,
then it SHALL match on `graphNodeKey`, not on ordinal equality.

---

## Requirement: treeNodeId is a legacy optional hint

`treeNodeId` (and `tree_node_id`) SHALL be treated as an optional structural hint, not canonical identity.

- It SHALL be nullable.
- It MAY be present when a stable upstream node id exists.
- Its absence SHALL NOT degrade candidate identity, graph projection, or reconciliation.
- It SHALL NOT be required for a node to be materialized, ranked or retrieved.

---

## Requirement: Projection maps back to canonical identity

Postgres SHALL retain canonical evidence and relationship identity.

Neo4j, NetworkX, cuGraph and Qdrant MAY project typed edges, vectors and ranks.

Projection-specific identifiers SHALL map back to canonical `graphNodeKey` / hyperedge IDs.

Projection IDs SHALL NOT replace canonical source identities.
