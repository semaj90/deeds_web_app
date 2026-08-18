# Parent Atlas Hypergraph / ACE scaffold gap audit

Date: 2026-08-18
Status rule: `WRITTEN` means a contract/reference/scaffold exists on this branch. It does **not** mean build, runtime, database, GPU, or parity proof passed.

## Implemented/reference surfaces

| Area | Status | Surface |
| --- | --- | --- |
| Canonical Feature/N-ary relation contracts | WRITTEN | `feature-intelligence.ts` |
| Canonical Postgres relation repository | WRITTEN / LIVE PROOF PENDING | `feature-intelligence-repository.ts` |
| Relationship semantic_768 projection contract | WRITTEN | `relationship-vector-projection.ts` |
| Entity/relationship/evidence candidate fabric | WRITTEN | `hypergraph-retrieval.ts` |
| Query-conditioned greedy traversal | WRITTEN | `hypergraph-query-policy.ts` |
| Adaptive deterministic beam reference | WRITTEN | `adaptive-hypergraph-chain.ts` |
| Incidence PPR CPU reference | WRITTEN | `hypergraph-ppr.ts` |
| cuGraph/Qdrant/CAGRA pure plans | WRITTEN | `executor-plans.ts` |
| Graph parity receipt | WRITTEN | `graph-projection-parity.ts` |
| Dynamic SQL hyperedge reader | WRITTEN / BACKFILL PENDING | `dynamic-hyperedge-sql.ts` |
| Evidence→entity extraction contract | WRITTEN | `evidence-entity-backfill.ts` |
| Consiliency/8095 evidence compatibility adapter | WRITTEN / NATIVE-ID SIDECAR UPGRADE PENDING | `treesitter-chunker-evidence-adapter.ts` |
| ast-grep byte-grounded observation adapter | WRITTEN | `ast-grep-observation-adapter.ts` |
| LangExtract char-grounding gate/adapter | WRITTEN | `langextract-grounding-adapter.ts` |
| Structural three-producer fabric | WRITTEN | `structural-extraction-fabric.ts` |
| GIS canonicalization orchestration | WRITTEN | `gis-canonicalization.ts` |
| Canonical symbol registry + explicit promotion/readback | WRITTEN / DB PROOF PENDING | `symbol-registry-repository.ts`, `20260818_atlas_symbol_registry_v1.sql` |
| Structural reference resolver | WRITTEN / DB PROOF PENDING | `structural-reference-resolver.ts` |
| Evidence-entity persistence/readback | WRITTEN / DB PROOF PENDING | `evidence-entity-repository.ts` |
| Runtime Drizzle declarations for manual structural tables | WRITTEN | `atlas-structural-intelligence.ts`, `drizzle.config.ts` exclusions |
| Structural production receipt | WRITTEN | `structural-production-receipt.ts` |
| Structural vertical fixture | WRITTEN / NOT EXECUTED | `structural-vertical.integration.test.mjs` |
| Sufficient-context gate | WRITTEN | `hypergraph-retrieval.ts` |
| Retrieval action receipt | WRITTEN | `retrieval-action-receipt.ts` |
| ACE N-ary payload | WRITTEN | `ace-hypergraph-payload.ts` |
| ACE canonical envelope composition | WRITTEN | `ace-packet-v2.ts`, `ace-runtime-adapter.ts` |
| Feature matrix contract | WRITTEN | `feature-matrix.ts` |
| Feature matrix materializer reference | WRITTEN | `feature-matrix-materializer.ts` |
| Derived model signal receipt | WRITTEN | `model-signal-receipt.ts` |
| Multi-view exact rerank reference | WRITTEN | `multiview-rerank.ts` |
| Verified-evidence QLoRA dataset contract | WRITTEN | `qlora-dataset-export.ts` |

## P0 proof gates — run before claiming runtime integration

- [ ] Build `packages/parent-atlas` with the repo's pinned TypeScript/Node dependency graph.
- [ ] Execute `test:feature-intelligence:all` (now includes structural vertical fixture).
- [ ] Apply `20260817_atlas_feature_intelligence_v1.sql` to a disposable/approved Postgres target.
- [ ] Apply `20260818_atlas_dynamic_hyperedge_entities_v1.sql`.
- [ ] Apply `20260818_atlas_symbol_registry_v1.sql`.
- [ ] Insert/read back one Feature, Evidence, N-ary Relationship and relationship embedding.
- [ ] Insert/read back one symbol registry row + alias + symbol version and verify the receipt checksum.
- [ ] Verify relationship participant count, relationship degree and typed roles after readback.
- [ ] Verify `atlas_evidence_entities` writer/readback against the existing table schema.
- [ ] Construct one `AcePacketV2` from the read-back relationship and reject an intentional identity mismatch.
- [ ] Verify manual tables stay excluded from drizzle-kit generation while runtime Drizzle declarations remain importable.

## P1 structural ingestion / GIS gaps

### Written on this branch

- [x] Consume `atlas.ast.evidence.v1` and preserve native Consiliency node/file/symbol/chunk IDs when present.
- [x] Label synthesized fallback IDs as `compat:*` provenance and prohibit them from becoming canonical identity.
- [x] Convert byte-grounded ast-grep matches into non-authoritative observations joined to overlapping chunker nodes/chunks.
- [x] Reject LangExtract observations without valid `char_interval` before canonical evidence.
- [x] Normalize chunker + ast-grep + LangExtract into one structural evidence fabric.
- [x] Add GIS resolve/promote seam; new canonical symbol creation requires explicit promotion.
- [x] Add canonical symbol registry/version/alias persistence contract and Drizzle declarations.
- [x] Add structural reference resolution from upstream node/symbol/target evidence to canonical symbols.
- [x] Add `atlas_evidence_entities` writer/readback contract aligned with the manual migration.
- [x] Add structural production receipt with native-vs-compatibility ID counts and Graphify reachability/fallback gates.

### Still live/proof pending

- [ ] Upgrade 8095 `/ast/chunk` payload to expose native Consiliency `node_id`, `file_id`, `symbol_id`, hierarchy for every supported chunk; then run with `allow_compatibility_ids=false`.
- [ ] Wire actual ast-grep rule execution into `AstGrepObservationV1` byte-range output rather than only the adapter/reference boundary.
- [ ] Expose raw LangExtract `char_interval`/alignment output through the live 8095 client path and feed `GroundedLangExtractObservationV1`.
- [ ] Define reviewed rename/move/alias evidence flow before auto-promoting path-changed nominations.
- [ ] Run symbol registry migration and readback proof.
- [ ] Run reference resolver against a bounded call/import fixture in Postgres.
- [ ] Backfill canonical symbol entity facts into `atlas_evidence_entities` and verify dynamic hyperedge joins.
- [ ] Wire `GraphifyStructuralMaterializer` output into the new structural extraction fabric/GIS seam.
- [ ] Wire the selected owner into production `graphify:daily`; do not create a parallel Graphify pipeline.
- [ ] Define and prove production fallback policy.
- [ ] Emit/read back `StructuralProductionReceiptV1`; ownership promotion requires zero compatibility node IDs, readback-verified persistence and live Graphify reachability.

## P1 live HyperRAG integration gaps

- [ ] Add a frontend adapter that converts existing `HyperRagFusionService` hits to `FirstStageCanonicalCandidateV1` without generating fake IDs.
- [ ] Call `runHypergraphFusionFacade()` after first-stage fusion and before final synthesis.
- [ ] Attach validated `atlas.ace-hypergraph-metadata.v1` to existing HyperRAG packet metadata while retaining `canonical_envelope` as identity owner.
- [ ] Emit `RetrievalActionReceiptV1` for every `NEED_* -> retrieve -> re-evaluate` iteration.
- [ ] Stop iterative retrieval on sufficient context, budget exhaustion, contradiction requiring review, or explicit terminal failure.
- [ ] Add request/workflow revision and sequence to the live DAG action event if not already available at this boundary.

## P1 evidence / dynamic hyperedge gaps

- [ ] Implement schema/table/column/FK/policy evidence→entity extractor.
- [ ] Implement test/assertion/runtime-receipt evidence→entity extractor.
- [ ] Implement OpenSpec requirement/scenario/task evidence→entity extractor.
- [ ] Backfill a bounded fixture and prove dynamic SQL hyperedges are `promotable=false`.
- [ ] Add explicit promotion review/materializer from dynamic candidate to canonical `FeatureRelationshipV1`.

## P1 graph gaps

- [ ] Materialize relationship-node incidence projection to Neo4j.
- [ ] Materialize dense ordinal incidence projection to NetworkX/cuGraph.
- [ ] Run CPU PPR and cuGraph personalized PageRank with matching alpha/tolerance semantics.
- [ ] Declare numerical parity tolerance and store `GraphProjectionParityReceiptV1`.
- [ ] Add query-seeded PPR receipt to ACE lineage.
- [ ] Benchmark greedy query-conditioned traversal versus adaptive beam search.
- [ ] Add iterative entity↔hyperedge confidence propagation only after an ablation demonstrates benefit.

## P1 semantic/vector gaps

- [ ] Backfill canonical relationship `semantic_768` vectors.
- [ ] Upsert Qdrant relationship points with indexed canonical/revision/type payload fields.
- [ ] Build cuVS brute-force exact relationship snapshot.
- [ ] Build CAGRA relationship index from the same frozen snapshot.
- [ ] Record CAGRA graph degree, intermediate graph degree, build algorithm, dataset memory type and peak VRAM.
- [ ] Evaluate Qdrant HNSW/CAGRA Recall@K against exact relationship KNN.
- [ ] Enforce one logical semantic vote after executor-level dedup.

## P1 feature matrix / learned signals

- [ ] Join feature/evidence/AST/graph/state inputs into one pinned matrix snapshot.
- [ ] Persist/materialize `FeatureMatrixRowV1` keyed by `feature_id`, never row offset alone.
- [ ] Emit `ModelSignalReceiptV1` for TurboVec, SVD/low-rank, KMeans, SOM, XGBoost and CrossEncoder outputs.
- [ ] Add low-rank candidate generator/evaluation receipt.
- [ ] Add multi-view FDE nomination experiment only behind an evaluation gate.
- [ ] Re-rank nominated candidates with original multi-view similarity before evidence promotion.

## P2 QLoRA / learning gaps

- [ ] Select training examples only from verified non-stale evidence snapshots.
- [ ] Reject labels derived solely from vector similarity, graph centrality, low-rank association, SOM/manifold position or model scores.
- [ ] Permit derived scores only as sampling/routing features.
- [ ] Freeze train/validation/test split with dataset checksum.
- [ ] Emit `QloraDatasetExportReceiptV1` before adapter training.
- [ ] Join final adapter training receipt to the exact dataset revision and route-map before/after state.

## Explicit non-goals / invariants

- Consiliency/treesitter-chunker IDs are upstream provenance/candidate join keys; GIS owns canonical Atlas symbol identity.
- ast-grep observations and LangExtract observations cannot create canonical identity or relationships.
- HNSW/CAGRA proximity edges are not application relationships.
- Qdrant point IDs, CAGRA ordinals, Neo4j node IDs and feature-matrix row numbers are not canonical IDs.
- Dynamic SQL hyperedges are candidates, not canonical facts.
- PageRank/PPR, TurboVec, SVD, clustering, SOM/manifold and learned rankers may change ranking/routing, not truth/completion.
- FDE/MUVERA-style encodings nominate candidates; original multi-vector views remain available for exact reranking.
- `CanonicalAcePacketEnvelope` remains packet identity owner; `AcePacketV2` verifies compatible N-ary evidence attachment.
