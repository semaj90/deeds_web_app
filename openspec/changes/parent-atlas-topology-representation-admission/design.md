# Design: Parent Atlas Topology Representation Admission

## Ownership

```text
PostgreSQL canonical identity/revisions/eligibility
        |
        v
CandidateOrdinalMapV1
        |
        +--> semantic_768 exact retrieval -> ContextManifestV1
        |
        +--> CandidateEligibilityBitmapV1
                  |
                  +--> Qdrant filter executor
                  +--> cuVS filter executor
                  +--> bounded topology fan-out

Derived topology branches:
semantic_768 -> rff_128
semantic_768 -> ae_latent_128 (future)
semantic_768 -> hidden_256 -> ae_latent_64
```

Neither Qdrant nor CouchDB creates representation identity. SearchRuntime
remains the production RRF owner; Qdrant's native RRF is parity-only.

## RepresentationArtifactV1

Each materialized artifact records:

```yaml
representationId: rff_128 | ae_latent_128 | ae_latent_64
representationRevision: sha256:...
inputRepresentationId: semantic_768
inputRepresentationRevision: sha256:...
workspaceRevision: sha256:...
candidateSnapshotRevision: candidate:...
ordinalMapChecksum: sha256:...
producerId: string
producerRevision: string
parametersDigest: sha256:...
inputDigest: sha256:...
outputDigest: sha256:...
rowCount: integer
dtype: string
normalization: string
```

`rff_128` uses a fixed kernel, gamma, component count, random seed, and
parameter digest. Its producer runs outside Qdrant. `ae_latent_64` is the
current learned branch with architecture `768 -> 256 -> 64`; `ae_latent_128`
is not inferred from a collection name or populated without a producer.

## Topology identities

`ManifoldPca4V1` is a learned continuous projection. `Topology4DCoordinateV1`
is a routing/topology coordinate. They require different representation IDs,
revisions, and input artifacts even when both contain four numbers.

Every `SOMAssignmentV1` carries CandidateOrdinal, packet identity,
workspace/source revisions, input artifact revision, SOM model digest, cell
coordinates, and an assignment digest. Existing unbound SOM coordinates are
diagnostic only.

## Admission and fan-out

The canonical eligibility set is computed in PostgreSQL, then compiled into a
bitmap indexed by CandidateOrdinal. Executor-specific forms such as Qdrant
`has_id` or indexed payload filters are derived views of that bitmap. They must
round-trip to the same ordinal set before topology results influence ranking.

CouchDB may store summaries, visualization documents, or historical topology
views. It cannot determine eligibility, representation revision, or fan-out
admission.

## Failure behavior

If any topology artifact, revision, or parity gate fails, mark topology
unavailable and continue the exact semantic path. Never substitute latent or
topology vectors for the `semantic_768` oracle.
