# Parent Atlas Leiden community projection gate

Status: `DESIGN_GATE / NO_RUNTIME_PROMOTION`

Checked 2026-08-22 against RAPIDS cuGraph stable **26.08**, canonical cuGraph source, Qdrant current vector documentation, and current Parent Atlas `main` graph materialization.

This note exists to prevent an executor convenience conversion from becoming an accidental graph-semantics contract.

## Canonical upstream API facts

### cuGraph Leiden

Canonical API:

https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.leiden/

Current stable is RAPIDS **26.08**. `cugraph.leiden()` currently:

- accepts a cuGraph `Graph`;
- **only supports undirected weighted graphs**;
- computes an adjacency list if needed;
- returns `(parts, modularity_score)`;
- returns one `vertex` and `partition` assignment per vertex;
- exposes `resolution`, where higher values produce more/smaller communities and lower values fewer/larger communities;
- accepts `random_state`; leaving it `None` does not give Parent Atlas a frozen deterministic seed contract.

The broader cuGraph algorithm overview contains looser language about Leiden/directed graphs. Parent Atlas must use the concrete function API contract as the implementation gate.

### cuGraph directed -> undirected conversion

Canonical API:

https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.graph.to_undirected/

The public API says each directed `(u,v,weight)` becomes an undirected `(u,v,weight)` in an undirected copy.

Canonical source:

https://github.com/rapidsai/cugraph/blob/528ddde979df2243bf51c116d89a0ecdf85a39ee/python/cugraph/cugraph/structure/graph_implementation/simpleGraph.py

The implementation adds an important constraint not strong enough in the short public docstring: `to_undirected()` **discards edge IDs and edge types** while preserving edge weights.

That makes direct `Graph.to_undirected()` unsuitable as the Parent Atlas provenance-bearing community projection when edge type is semantically meaningful.

### cuGraph symmetrization

Canonical stable API:

https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.symmetrize/

The graph-construction API also states that automatic symmetrization cannot be requested when edge IDs or edge types are present:

https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.graph.from_cudf_edgelist/

A documented legacy `symmetrize_df` behavior is particularly important for proof design: if reciprocal edges `(u,v,data1)` and `(v,u,data2)` disagree, that helper may retain the smaller data element rather than apply a Parent Atlas semantic aggregation rule. Therefore Parent Atlas must normalize reciprocal typed edges **before** handing a community projection to cuGraph; executor-default duplicate/symmetrization behavior cannot own the policy.

## Current Parent Atlas graph fact

Current canonical materialization on `main` is narrower than the edge schema.

`graph-snapshot-materializer.ts` currently declares its materialized `relationshipTypes` as:

```text
CONTAINS
DERIVED_FROM
```

and the currently produced edges use weight `1` and confidence `1` for both families.

The edge parser/schema is capable of richer labels such as:

```text
IMPORTS
CALLS
REFERENCES
DEPENDS_ON
IMPLEMENTS
USES_CONCEPT
SUMMARIZES
PARTICIPATES_IN
```

but schema capability is not the same as those edge families being present in the canonical frozen snapshot.

Therefore running Leiden over today's frozen graph would primarily measure **hierarchy/materialization structure**, not the richer source/dependency/program-relationship communities intended for the Parent Atlas graph head.

## Required ownership split

Do not execute:

```text
canonical directed graph
        ↓
Graph.to_undirected()
        ↓
Leiden
        ↓
communityId promoted
```

Instead require:

```text
CanonicalGraphSnapshotV2
  directed typed edges
  exact graphRevision
  exact edge table hash
        ↓
CommunityProjectionPolicyV1
  allowed relationship types
  directed→undirected rule
  reciprocal-edge aggregation rule
  edge-type weighting rule
  self-loop rule
  duplicate rule
  deterministic random seed
        ↓
UndirectedCommunityProjectionV1
  same CandidateOrdinal / gpu ordinal coordinate map
  projectionRevision
  sourceGraphRevision
  sourceEdgeTableHash
  policyChecksum
  projectionChecksum
        ↓
cuGraph Leiden executor
        ↓
LeidenCommunityReceiptV1
  vertex ordinal
  partition
  modularity
  resolution
  randomState
  algorithm/runtime revision
        ↓
CandidateOrdinal normalization
        ↓
StructuralFeatureSnapshotV1.communityId
```

`communityId` is derived feature evidence only. It is never canonical identity.

## Decisions that must be frozen before runtime wiring

### 1. Relationship eligibility

The community projection must explicitly list which directed relationship families participate. Do not implicitly include every graph edge merely because it is present.

Examples that require separate evaluation:

```text
CONTAINS
DERIVED_FROM
CALLS
IMPORTS
REFERENCES
DEPENDS_ON
IMPLEMENTS
USES_CONCEPT
```

A hierarchy edge and a call edge do not necessarily have the same community meaning.

### 2. Reciprocal-edge aggregation

For an unordered pair `{u,v}` Parent Atlas must define how these cases differ:

```text
u --CALLS--> v

u --CALLS--> v
v --CALLS--> u

u --CALLS--> v
v --IMPORTS-> u
```

Candidate policies to benchmark include:

```text
MAX_PER_TYPE
SUM_PER_TYPE
MEAN_PER_TYPE
BINARY_PRESENCE_PER_TYPE
```

followed by an explicit cross-type combination rule. No policy is promoted merely because cuGraph accepts it.

### 3. Weight semantics

Current graph edge `weight` is only constrained as finite/non-negative; that does not prove all relationship families share one calibrated metric.

Therefore:

```text
raw edge weight
    != automatically
Leiden community strength
```

If type-specific coefficients are introduced, they become their own revisioned policy artifact and must be ablated/evaluated rather than hard-coded as hidden executor behavior.

### 4. Determinism

The Leiden receipt must set an explicit `randomState`. Leaving the upstream default as `None` is not a frozen Parent Atlas determinism contract.

Repeated runs over identical:

```text
graphRevision
projectionRevision
policyChecksum
resolution
randomState
```

must produce a deterministic partition checksum before promotion.

## Proposed proof gates

```text
COMMUNITY-00  SOURCE_RELATIONSHIP_SCOPE_FROZEN
COMMUNITY-01  DIRECTED_TO_UNDIRECTED_POLICY_FROZEN
COMMUNITY-02  RECIPROCAL_EDGE_AGGREGATION_FROZEN
COMMUNITY-03  EDGE_TYPE_WEIGHT_POLICY_FROZEN
COMMUNITY-04  DETERMINISTIC_PROJECTION_HASH_PASS
COMMUNITY-05  NETWORKX_CPU_ORACLE_DEFINED
COMMUNITY-06  CUGRAPH_LEIDEN_EXECUTION_PASS
COMMUNITY-07  REPEATED_PARTITION_CHECKSUM_PASS
COMMUNITY-08  MODULARITY_RECORDED
COMMUNITY-09  CANDIDATE_ORDINAL_NORMALIZATION_PASS
COMMUNITY-10  STRUCTURAL_FEATURE_SNAPSHOT_READBACK_PASS
COMMUNITY-11  COMMUNITY_ID_NOT_IDENTITY_PASS
COMMUNITY-12  NO_EXTRA_RETRIEVAL_VOTE_PASS
```

Until `COMMUNITY-00..04` are proven, GPU Leiden runtime wiring remains blocked.

## Qdrant named-vector consequence

Canonical Qdrant vector documentation:

https://qdrant.tech/documentation/manage-data/vectors/

Qdrant currently supports multiple named vectors of different sizes/types within one point and independent vector-space configuration. Current docs also expose adding/removing named vector spaces on an existing collection.

That capability does **not** alter the Parent Atlas lineage rule:

```text
Qdrant named-vector capability
    !=
shared producer/revision lineage proven
```

Keep `semantic_768` as the current semantic search representation until `latent_128` / `latent_64` have independent manifests, checksums, source-representation binding, and promotion receipts.

Community values belong in payload/feature evidence, not appended onto semantic embedding dimensions and not used as point identity.

## Current state

```text
RAPIDS_STABLE_VERSION                  26.08 VERIFIED
CUGRAPH_LEIDEN_API                     VERIFIED
LEIDEN_UNDIRECTED_WEIGHTED_REQUIREMENT VERIFIED
LEIDEN_PARTITION_MODULARITY_OUTPUT     VERIFIED
LEIDEN_RESOLUTION_CONTROL              VERIFIED
TO_UNDIRECTED_API                      VERIFIED
TO_UNDIRECTED_DROPS_EDGE_TYPE_ID       VERIFIED_FROM_CANONICAL_SOURCE

PARENT_ATLAS_RELATIONSHIP_SCOPE        CURRENTLY CONTAINS + DERIVED_FROM
PARENT_ATLAS_COMMUNITY_PROJECTION      NOT DEFINED
PARENT_ATLAS_RECIPROCAL_POLICY         NOT DEFINED
PARENT_ATLAS_TYPE_WEIGHT_POLICY        NOT DEFINED
PARENT_ATLAS_LEIDEN_RUNTIME            BLOCKED
PARENT_ATLAS_COMMUNITY_PROMOTION       BLOCKED
```

The next implementation should be the deterministic **community projection contract and fixture proof**, not a `/v1/graph/leiden` endpoint.
