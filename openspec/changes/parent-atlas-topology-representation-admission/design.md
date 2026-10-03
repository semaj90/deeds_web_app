# Design: Parent Atlas Topology Representation Admission

## Ownership

```text
PostgreSQL canonical identity/revisions/eligibility CandidateOrdinalMapV1 +--> semantic_768 exact retrieval -> ContextManifestV1  +--> CandidateEligibilityBitmapV1  +--> Qdrant filter executor +--> cuVS filter executor  +--> bounded topology fan-out
Derived topology branches:
semantic_768 -> semantic_mrl_512 | semantic_mrl_256 | semantic_mrl_128
semantic_768 -> rff_128 semantic_768 -> latent_256 (learned AE stage)
latent_256 -> latent_128 (learned AE stage) latent_128 -> latent_64 (normalized prefix view) frozen candidate snapshot + admitted input representation -> KMeans/SOM assignment
candidate/source revisions -> Topology4DCoordinateV1 (routing projection)
```
These are separate representation families, not one dimensional truncation
ladder. MRL outputs remain semantic representations; autoencoder outputs are
learned/derived routing representations; KMeans/SOM assignments and 4D
coordinates are topology projections, not vectors or identities. Residency is
an independent ACE/BitFrost concern, and model execution state is outside this
representation DAG.

The current Python model is a candidate definition, not a trained or promoted
producer: it learns the 256- and 128-dimensional stages, then derives
`latent_64` as a normalized prefix of `latent_128`. Historical persisted v3
artifacts use a different 768 -> 384 -> 256 checkpoint: `latent_256` is its
learned bottleneck and the 128/64 views are prefixes. The shared `latent_*`
names do not make these lineages interchangeable. Existing persisted rows
remain diagnostic until representation revisions and registry/alias treatment
separate the historical artifacts from any future candidate output. Do not
rename them to `ae_latent_*` or promote the candidate without that
reconciliation. The existing vector manifest owns `semantic_mrl_*`; do not add
bare `mrl_*` aliases as a second representation namespace.

KMeans and SOM produce assignment artifacts, not dense representations.
`ManifoldPca4V1` is a deterministic projection with its own basis and input
revision; `Topology4DCoordinateV1` is a routing coordinate. Neither can be
substituted for semantic or AE vectors. A complete static derivation DAG must
reference these existing owners; it must not become a second vector registry.
`evidenceDepth` remains the evidence-expansion axis, ACE's `residencyTier`
remains the physical-residency axis, and model execution state is separate.

Neither Qdrant nor CouchDB creates representation identity. SearchRuntime
remains the production RRF owner; Qdrant's native RRF is parity-only.

## RepresentationArtifactV1
Each materialized artifact records: representationId: rff_128 | latent_256 | latent_128 | latent_64 | semantic_mrl_512 | semantic_mrl_256 | semantic_mrl_128 representationRevision: sha256:... inputRepresentationId: exact declared parent representation ID inputRepresentationRevision: sha256:... workspaceRevision: sha256:... candidateSnapshotRevision: candidate:... ordinalMapChecksum: sha256:... producerId: string producerRevision: string
parametersDigest: sha256:... inputDigest: sha256:... outputDigest: sha256:... rowCount: integer dtype: string normalization: string
```
`artifactDigest` is `sha256:` plus `canonicalSha256V1` over the complete artifact body, excluding `artifactDigest` itself and domain-separated by `atlas.representation-artifact-digest.v1`. A child artifact's input representation revision, input digest, and input population checksum must match the parent artifact's representation revision, output digest, and output population checksum.
Family members must share workspace/source revisions, candidate/ordinal coordinates, and output population. This seals descriptor integrity; it does not create source authority or prove a live producer.

`rff_128` uses a fixed kernel, gamma, component count, random seed, and
parameter digest. Its producer runs outside Qdrant. The AE lineage is governed
by the candidate staged chain above; a stored column or cache entry cannot
change a member's derivation class or make historical rows candidate output.
MRL, AE, deterministic projection, clustering, topology, and residency must retain separate identities and
revision/checksum contracts. Residency is not a representation node in this
DAG.

## Topology identities
`ManifoldPca4V1` is a deterministic PCA projection with revision-bound basis
and input provenance. `Topology4DCoordinateV1` is a routing/topology
coordinate. They require different representation IDs, revisions, and input
artifacts even when both contain four numbers.

Every `SOMAssignmentV1` carries CandidateOrdinal, packet identity,
workspace/source revisions, input artifact revision, SOM model digest, cell
coordinates, and an assignment digest. Existing unbound SOM coordinates are
diagnostic only.

## Admission and fan-out
The canonical eligibility set is computed in PostgreSQL, then compiled into a
bitmap indexed by CandidateOrdinal. Executor-specific forms such as Qdrant
`has_id` or indexed payload filters are derived views of that bitmap. They must round-trip to the same ordinal set before topology results influence ranking. CouchDB may store summaries, visualization documents, or historical topology views. It cannot determine eligibility, representation revision, or fan-out admission.

## Failure behavior

If any topology artifact, revision, or parity gate fails, mark topology
unavailable and continue the exact semantic path. Never substitute latent or
topology vectors for the `semantic_768` oracle.
