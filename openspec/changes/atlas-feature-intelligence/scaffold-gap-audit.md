# Parent Atlas feature-intelligence / HyperGraphRAG gap audit

Date: 2026-08-18

Status semantics:

- `WRITTEN` — contract/reference/migration/test/proof code exists on this branch.
- `WIRED` — the intended production owner can reach the new surface, but runtime proof has not passed.
- `PROVEN` — requires executed build/runtime/database/GPU evidence. **Nothing newly added in this tranche is marked PROVEN.**
- `RED` — a required implementation or proof step is still missing/failing/unexecuted.

## Reconciled implementation inventory

| Area | Current state | Surface / remaining proof |
| --- | --- | --- |
| Canonical Feature/N-ary relationship contracts | WRITTEN | `feature-intelligence.ts` |
| Canonical relationship PostgreSQL repository | WRITTEN / RED DB PROOF | `feature-intelligence-repository.ts` |
| Canonical evidence ledger independent of Feature attachment | WRITTEN | `evidence-ledger-repository.ts` |
| Dynamic evidence-entity hyperedge index | WRITTEN / RED DB PROOF | `atlas_evidence_entities`, `dynamic-hyperedge-sql.ts` |
| Relationship `semantic_768` contract | WRITTEN / RED LIVE BACKFILL | `relationship-vector-projection.ts` |
| CPU incidence PPR oracle | WRITTEN / RED GPU PARITY | `hypergraph-ppr.ts` |
| Qdrant/cuVS/CAGRA/cuGraph execution plans | WRITTEN / RED LIVE BENCHMARK | `executor-plans.ts`, `semantic-executor-manifest.ts` |
| ACE N-ary payload + packet composition | WRITTEN | `ace-hypergraph-payload.ts`, `ace-packet-v2.ts` |
| Retrieval action receipts | WRITTEN | `retrieval-action-receipt.ts` |
| WorkflowActionEventV1 runtime contract | WRITTEN | `workflow-action-event.ts` |
| Retrieval receipt → WorkflowActionEvent adapter | WRITTEN / RED ACTIVE CALL-SITE | `workflow-action-adapters.ts` |
| AcePacketV2 → WorkflowActionEvent artifact adapter | WRITTEN / RED ACTIVE CALL-SITE | `workflow-action-adapters.ts` |

## Native structural / GIS status

| Gate | State | Evidence / next proof |
| --- | --- | --- |
| 8095 provenance-preserving facade | WIRED / RED RUNTIME PROOF | `python/miniforge_nlp_sidecar_v2.py` |
| Docker 8095 entrypoint selects provenance-v2 | WIRED / RED RUNTIME PROOF | `docker/miniforge-nlp-sidecar/Dockerfile` |
| PowerShell launcher defaults provenance-v2 | WIRED / RED RUNTIME PROOF | `scripts/launch-miniforge-nlp-sidecar.ps1` |
| Native Consiliency node/file/chunk/symbol provenance | WRITTEN / RED LIVE RESPONSE | v2 sidecar + TypeScript client |
| `identity_path` fallback degrades instead of silently promoting | WRITTEN / RED LIVE PROOF | v2 sidecar diagnostic `CONSILIENCY_IDENTITY_PATH_UNPROVEN` |
| LangExtract native `char_interval` / alignment | WRITTEN / RED LIVE PROBE | v2 facade + grounding adapters |
| ast-grep byte-grounded observations | WRITTEN | `ast-grep-extractor.ts`, `ast-grep-observation-adapter.ts` |
| Graphify normalizer preserves native provenance | WRITTEN | `atlas-ast-evidence-normalizer.ts` |
| Recovered parse blocks GIS promotion | WRITTEN | `GraphifyStructuralMaterializer` readiness gate |
| Graphify → Parent Atlas structural fabric adapter | WIRED / RED BUILD | `graphify-structural-intelligence-adapter.ts` |
| Native structural evidence ledger → GIS → evidence entities | WIRED / RED LIVE DB | `native-structural-materializer.mts` |
| Selected `graphify:daily` owner can invoke native structural path | WIRED OPT-IN / RED LIVE RUN | `GRAPHIFY_NATIVE_STRUCTURAL=1` in startup owner |
| Automatic database writes | FAIL-CLOSED | require `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` |
| Automatic new stable-symbol creation | FAIL-CLOSED | additionally require `GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS=1` |
| Legacy Batch A heuristic structural rows | COMPATIBILITY ONLY | synthetic/regex path; do not promote as native structural truth |

### Native structural apply chain

```text
Consiliency / 8095 PROVEN native evidence
        ↓
atlas_evidence
        ↓
existing symbol registry resolution
        │
        ├─ canonical match → stable_symbol_id
        │
        └─ unresolved → remains nomination
                │
                └─ only with explicit allow-create + NATIVE_READY → GIS promotion
        ↓
atlas_evidence_entities
        ↓
dynamic query-scoped hyperedges
```

## Schema evidence owner

| Gate | State | Surface |
| --- | --- | --- |
| Schema object nomination/registry contract | WRITTEN | `schema-object-registry.ts` |
| Stable schema IDs separated from PostgreSQL catalog OIDs | WRITTEN | registry + version schema |
| PostgreSQL 18 catalog introspector | WRITTEN / RED LIVE DB | `postgres-schema-introspector.ts` |
| OID-invariant semantic definition hashing | WRITTEN | pure catalog-row compiler |
| `pg_class` / `pg_attribute` / `pg_constraint` / `pg_index` / `pg_policy` / `pg_proc` / `pg_trigger` discovery | WRITTEN / RED LIVE DB | introspector query |
| Stable name/deparser surfaces instead of OID-derived semantics | WRITTEN | `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_expr`, function/trigger deparsers |
| Schema registry migration | WRITTEN / RED APPLY/READBACK | `20260818_atlas_schema_object_registry_v1.sql` |
| Drizzle runtime declaration | WRITTEN | `atlas-structural-intelligence.ts` |
| Drizzle migration ownership isolation | WIRED | `drizzle.config.ts` excludes manual schema registry tables |

## Test evidence owner

| Gate | State | Surface |
| --- | --- | --- |
| Test nomination / canonical registry contract | WRITTEN | `test-case-registry.ts` |
| Cross-revision test key excludes line/column | WRITTEN | line movement creates version change, not identity change |
| Rename creates a new nomination requiring alias/review | WRITTEN | explicit registry boundary |
| Vitest JSON reporter compiler | WRITTEN / RED EXECUTION | `vitest-test-evidence-compiler.ts` |
| Runner-owned pass/fail execution receipts | WRITTEN | `TestExecutionObservationV1` |
| Unresolved tests rejected from canonical `atlas.test-evidence.v1` | WRITTEN | promotion gate |
| Test registry migration | WRITTEN / RED APPLY/READBACK | `20260818_atlas_test_registry_v1.sql` |
| Drizzle test declarations | WRITTEN | `atlas-test-intelligence.ts` |
| Manual-DDL exclusion | WIRED | `drizzle.config.ts` |
| Active Vitest invocation writes JSON report for ingestion | RED | configure/report file call-site |
| Test execution receipt repository write/readback | RED | table exists; repository method still needed |
| Assertion-level canonical identity | RED | static assertion owner not yet implemented |

## OpenSpec evidence owner

| Gate | State | Surface |
| --- | --- | --- |
| Requirement/scenario/task parser-owned identities | WRITTEN | `openspec-evidence-compiler.ts` |
| Delta ADDED/MODIFIED/REMOVED/RENAMED semantics | WRITTEN | explicit rename aliases |
| FI-style and numeric task IDs | WRITTEN | `FI-16A`, `1.2`, etc. |
| Repository traversal over explicit OpenSpec roots | WRITTEN / RED TEST EXECUTION | `openspec-repository-ingestion.ts` |
| Content-addressed document revision + separate workspace revision | WRITTEN | ingestion receipt |
| OpenSpec DB/evidence-entity materialization | RED | parser output not yet persisted into evidence ledger/entities |

## Workflow owner

| Gate | State | Surface |
| --- | --- | --- |
| Common workflow event vocabulary | WRITTEN | `WorkflowActionEventV1` |
| Existing retrieval receipt adapter | WRITTEN | action/DAG IDs must come from orchestrator |
| Existing ACE artifact adapter | WRITTEN | packet/relationship/evidence IDs preserved |
| Fake receipt→action ID derivation prohibited | WRITTEN | adapters require explicit runtime identity |
| Active retrieval executor emits event | RED | call-site wiring pending |
| Active ACE materializer emits event | RED | call-site wiring pending |
| Persistent workflow event ledger / transport | RED | select canonical runtime sink before enabling writes |

## Database proof

`node scripts/atlas/prove-feature-intelligence-database.mjs`

- default: inspection/readback only
- `--apply`: apply isolated manual Parent Atlas migrations
- `--fixture`: exercise proof rows/functions inside a transaction and roll them back

Proof surfaces now written:

- pgvector extension exists
- required Feature/Evidence/N-ary/dynamic/symbol/schema/test tables exist
- `atlas_validate_relationship()` exists
- `atlas_dynamic_hyperedge_neighborhood()` exists
- `atlas_evidence_entities.evidence_id` FK targets `atlas_evidence`
- symbol registry version preserves upstream provenance
- schema object version preserves `catalog_oid` only as revision provenance
- test execution receipt schema exists
- rollback fixture validates a binary relationship, dynamic evidence hyperedge, and symbol/schema/test registry readback

**Current state: RED — proof runner has not been executed against the workstation database.**

## P0 validation gates

- [ ] Build `packages/parent-atlas`.
- [ ] Run `npm --prefix packages/parent-atlas run test:feature-intelligence:all`.
- [ ] Run `python python/test_atlas_structural_provenance.py` in the 8095 environment.
- [ ] Run `node scripts/atlas/audit-structural-provenance-wiring.mjs`; expected static state is now `WIRED_UNPROVEN_RUNTIME`, not the old scaffold-only state.
- [ ] Launch provenance-v2 8095 and run `node scripts/atlas/prove-ast-sidecar.mjs`.
- [ ] Run native structural materializer dry-run on a bounded directory.
- [ ] Run database proof inspection.
- [ ] On approved DB target, run database proof `--apply --fixture` and capture receipt.
- [ ] Run schema introspector against a bounded schema and prove OID-invariant replay.
- [ ] Generate a real Vitest JSON report and feed it through the test compiler.
- [ ] Run OpenSpec repository ingestion fixture/real root and capture receipt.

## Remaining P1 live integration reds

### Evidence / promotion

- [ ] Persist OpenSpec parser outputs through `atlas_evidence` and canonical evidence-entity adapters.
- [ ] Persist schema introspection nominations/evidence and resolve through schema registry.
- [ ] Persist Vitest execution observations and canonical test mappings.
- [ ] Add reviewed schema/test rename/move alias APIs.
- [ ] Add explicit dynamic-hyperedge → canonical `FeatureRelationshipV1` promotion review/materializer.

### Workflow / HyperRAG

- [ ] Wire existing retrieval loop call-site to `retrievalReceiptToWorkflowAction()`.
- [ ] Wire ACE packet materializer call-site to `acePacketToWorkflowArtifact()`.
- [ ] Add frontend first-stage HyperRAG hit → canonical candidate adapter where still missing.
- [ ] Run `runHypergraphFusionFacade()` in live request flow and attach validated ACE hypergraph metadata.
- [ ] Prove sufficient-context stop/budget/contradiction semantics in live request traces.

### Graph

- [ ] Materialize relationship-node incidence projection to Neo4j.
- [ ] Materialize dense ordinal incidence projection to NetworkX/cuGraph.
- [ ] Run CPU PPR vs cuGraph personalized PageRank with matching alpha/tolerance semantics.
- [ ] Store `GraphProjectionParityReceiptV1` from a frozen graph snapshot.
- [ ] Add query-seeded PPR receipt to ACE lineage.

### Semantic/vector

- [ ] Backfill canonical relationship `semantic_768` vectors.
- [ ] Upsert relationship vectors to Qdrant with canonical/revision/type payload filters.
- [ ] Freeze one exact cuVS brute-force relationship snapshot.
- [ ] Build CAGRA from the same snapshot.
- [ ] Record graph degree/intermediate degree/build algorithm/memory placement/peak VRAM.
- [ ] Evaluate Qdrant HNSW and CAGRA Recall@K against exact KNN.
- [ ] Prove executor-level dedup still yields one logical semantic vote.

### Feature matrix / learning

- [ ] Materialize pinned feature/evidence/AST/graph/state matrix keyed by `feature_id`.
- [ ] Emit live model-signal receipts for low-rank/SVD/KMeans/SOM/XGBoost/CrossEncoder challengers.
- [ ] Run exact multi-view rerank evaluation before any FDE/MUVERA-like promotion.
- [ ] Freeze verified-evidence QLoRA dataset split/checksum and join final adapter receipt.

## Explicit invariants

- Consiliency IDs are upstream provenance/candidate join keys; GIS owns canonical Atlas symbol identity.
- PostgreSQL catalog OIDs are revision-local provenance, never stable schema identity.
- Vitest/JUnit status owns execution truth but does not own stable Atlas test identity.
- OpenSpec parser structure owns OpenSpec requirement/scenario/task identity; LangExtract does not.
- ast-grep and LangExtract observations cannot mint canonical identity or relationships.
- HNSW/CAGRA proximity edges are not application relationships.
- Qdrant point IDs, CAGRA ordinals, Neo4j node IDs and feature-matrix row numbers are not canonical IDs.
- Dynamic SQL hyperedges are candidates, never canonical facts until explicit promotion.
- PageRank/PPR, TurboVec, SVD, clustering, SOM/manifold and learned rankers change ranking/routing, not truth/completion.
- `CanonicalAcePacketEnvelope` remains packet identity owner; `AcePacketV2` attaches validated N-ary evidence without replacing that owner.
