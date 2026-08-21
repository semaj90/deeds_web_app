# Tasks: parent-atlas-structural-hypergraph-routing

## Invariants

- Tree-sitter/Consiliency evidence is parser provenance, not canonical identity.
- GIS/Postgres remains canonical symbol/version acceptance and persistence authority.
- Qdrant/cuVS/CAGRA/TurboVec are executors inside one logical `semantic_768` lane.
- SOM/KMeans are routing/partition hints, never nearest-neighbor truth.
- Neo4j/cuGraph fanout is bounded post-top-k evidence expansion, not candidate truth.
- N-ary facts remain n-ary in the canonical event/hypergraph model; pairwise graph projections are traversal aids.

## SHG-01 exact structural coordinates

- [x] Add `AstNodeLocatorV1` with grammar revision, raw/named AST paths, parent paths/type, child ordinals, named flag, signature and exact source span.
- [x] Separate revision-local `astNodeId` from structural node identity, stable `symbolId` and `symbolVersionId`.
- [x] Extend Python provenance normalization to pass through exact AST metadata when the upstream chunker supplies it; absent values remain null.
- [ ] Extend the live 8095 response model/client to expose those fields end-to-end.
- [ ] Prove at least one real TypeScript/TSX fixture emits grammar revision + AST paths + normalized signature without synthetic fallback.

## SHG-02 canonical promotion

- [x] Add a read-only structural routing integration that refuses promotion-shaped output when grammar revision/path/signature are missing.
- [ ] Bind `GIS` resolution order: exact version -> stable symbol -> approved alias -> structural fingerprint -> AMBIGUOUS.
- [ ] Persist/read back `symbolId <-> symbolVersionId <-> astNodeId <-> packetKey[]` through the current Postgres/Drizzle owner.
- [ ] Add line-shift, overload, nested same-name function, anonymous callback, rename and move fixtures.

## SHG-03 n-ary hypergraph

- [x] Add `StructuralHyperedgeV1` with participant role + ordinal.
- [x] Support call binding, type constraint, diagnostic context, test coverage, ontology assertion and retrieval-promotion event types.
- [ ] Reuse/bridge the existing `AtlasEvent` / ontology tuple owner rather than creating a second durable hypergraph table.
- [ ] Project hyperedge/event nodes to Neo4j with participant-role edges; preserve event/hyperedge ID for round-trip.
- [ ] Add Qdrant payload references to event/hyperedge IDs only; do not duplicate full graph truth in payloads.

## SHG-04 KMeans/SOM + dense retrieval

- [x] Add `RetrievalFanoutPlanV1`: SOM cell/neighbors + KMeans centroid IDs are routing hints; KNN remains retrieval.
- [x] Preserve one logical semantic vote across Qdrant/cuVS/CAGRA/TurboVec.
- [ ] Bind real 20x20 SOM BMU/revision from current owner.
- [ ] Bind real KMeans centroid membership/revision and measure candidate reduction against exact cuVS baseline.
- [ ] Carry `som_x`, `som_y`, `cluster_id`, workspace/source/representation revisions as Qdrant payload filters after parity proof.
- [ ] Do not create collections per SOM cell, cluster, agent or domain.

## SHG-05 bounded graph fanout

- [x] Encode post-narrowing seedK, maxDepth, max-neighbors-per-seed and relation allowlist.
- [ ] Resolve Qdrant candidate -> canonical `symbolVersionId`/`astNodeId` before Neo4j lookup; no filename/string guessing.
- [ ] Run 1-hop exact structural expansion first; optional 2-hop only when RLM requests it.
- [ ] Add global PageRank + query PPR + community/path features into FE/QAS ranking features, not independent fusion votes.
- [ ] Keep cuGraph disabled until same-revision Neo4j/cuGraph projection parity is proven.

## SHG-06 RLM/ACE handoff

- [ ] Add structural locator to `QueryAdaptiveFeatureRowV1` after GIS identity acceptance.
- [ ] RLM selects AST/graph relation traversal after exact promotion.
- [ ] ACE consumes selected identities as prefetch hints and converts through existing `LodPromotionDecisionV1`.
- [ ] BitFrost/Valkey stores rebuildable revision-qualified hot references; durable promotion receipts stay in Postgres.

## Proof order

```text
8095 exact AST metadata
  -> GIS structural identity acceptance
  -> Postgres identity readback
  -> Qdrant/QAS structural locator
  -> SOM/KMeans coarse route
  -> KNN broad recall
  -> exact top-k promotion
  -> bounded Neo4j/hypergraph fanout
  -> RLM relational traversal
  -> ACE prefetch hint
  -> existing LOD/BitFrost promotion policy
  -> execution + recommendation/Kanban outcome receipt
```
