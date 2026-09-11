# Parent Atlas core lane blocker research plan

Date: 2026-09-10  
Mode: read-only audits and code/spec work; bounded canaries require separate authorization.  
Authority: PostgreSQL is canonical. Qdrant, Neo4j, cache, GPU, SOM, GraphRAG, and model outputs are derived.

## Executive result

The system has most of the machinery, but promotion is blocked because the artifacts do not yet prove one current, revision-qualified workspace. Materialized snapshot bytes now read back exactly; the remaining source gate is that no terminal Graphify execution is bound to the admitted revision. Retrying that gate before changing the consumer would produce no new evidence.

## Gate matrix

| Lane | Current evidence | First blocker | Implementation target | State |
|---|---|---|---|---|
| Workspace / Graphify | 25,267 materialized files; 25,267 exact readbacks; consumer preflight and source descriptor proven; no terminal execution | `SNAPSHOT_BOUND_GRAPHIFY_CANARY_NOT_AUTHORIZED` | Run one separately authorized canary and independently read back execution membership | BLOCKED |
| Structural lineage | 111 bindings; 0 exact current Graphify sources and 0 packet/chunk content matches | `CURRENT_PACKET_CHUNK_IDENTITY_RECONCILIATION` | Exact source→packet→chunk→tree→symbol-version read-only join | BLOCKED |
| Semantic 768 | Qdrant shape aligned (128 sampled 768D vectors); both 8081 and Ollama returned finite 768D EmbeddingGemma vectors; PostgreSQL has 1,386/55,853 `content_embedding_768` rows; 19 writers remain; comparison fetched 0 rows; representation audit found 0/1000 source-version and symbol-version joins and no live representation ledger | `SEMANTIC_768_RUNTIME_LIVE_SHAPE_PROVEN_COHORT_PARITY_UNPROVEN` / `REPRESENTATION_LEDGER_NOT_PROVEN` | Fetch a bounded revision-qualified PostgreSQL cohort, compare against live output, then freeze one canonical owner and RepresentationManifestV1 | BLOCKED |
| Representation | 0/1,000 source-version joins and 0/1,000 symbol joins | `REPRESENTATION_LEDGER_UNPROVEN` | Record model, input, transform, checksum, ordinal, and workspace lineage | BLOCKED |
| Graph / ordinals | bounded 23-node fixture only; current edge producer unqualified | `GRAPH_MANIFEST_SEALED` | One graph revision, node/edge checksums, ordinal map, and producer execution | BLOCKED |
| Qdrant | 109,776 points; 4,351 fan-out groups; 1,616 source conflicts; 5,701 revision-unproven | `QDRANT_V2_IDENTITY_PARITY` | Exact canonical packet/chunk/symbol readback; no path or point-ID fallback | BLOCKED |
| Leiden | WSL2 RAPIDS fixture diagnostic completed; current graph snapshot and cross-store identity remain unsealed | `GRAPH_MANIFEST_AND_CURRENT_IDENTITY_UNPROVEN` | Seal graph/ordinal manifest, then run exact identity/community consistency audit; no rewrite | BLOCKED |
| RRF | 15 raw lane names map to 8 logical lanes; 0 unmapped; 2 executor aliases require caller review; 90 caller mappings remain unmapped | `CALLER_BASELINE_REPLAY` / `IDENTITY_ENVELOPE_ADMITTED` | Complete caller baseline, pre-fusion envelope, and one vote per logical lane | PARTIAL |
| Classifier | 3,352 rows; 148 revision-qualified; 3,204 missing Graphify join | `CLASSIFIER_LINEAGE_BLOCKED` | Carry source namespace/revision and checkpoint manifest through sidecar receipt | BLOCKED |
| Ontology / KAG | 346,888 records; current cohort has 1 exact source ref and 0 expected workspace matches | `DIRECTORY_INDEX_SOURCE_BINDING` | OakLib resolves/validates; PostgreSQL admits grounded tuples | BLOCKED |
| ACE / context | required ordinal, feature-snapshot, and revision-authority inputs absent; cross-contract check not reached | `ACE_REQUIRED_INPUT_ARTIFACTS_MISSING` | Supply authoritative artifacts and preserve missing metadata as null | BLOCKED |
| Judgment set | 60 queries; 313 judgments; 0 reviewed; 0 hard negatives | `JUDGMENT_SET_REVIEWED` | Review grades, reviewer metadata, forbidden IDs, and hard negatives | BLOCKED |
| Retrieval parity | exact oracle/challengers cannot be authoritative before identity/revision gates | `RETRIEVAL_IDENTITY_BLOCKED` | Exact PostgreSQL vector oracle, then Qdrant/other challenger comparison | BLOCKED |
| Projection canary | no complete authority chain | upstream identity/revision gates | Last step, explicit target list, rollback and readback | NOT_READY |

## Implementation work packages

### 1. Snapshot-bound Graphify

Use this relation:

```text
admitted WorkspaceSnapshotV1
  -> revision-addressed materialized root
  -> lifecycle opener
  -> graphify_execution_file_membership_v2
  -> terminal receipt
```

The opener must consume the admission's snapshot revision, materialized root, source count, repository count, and selection checksum. It must not call the live-origin builder. Completion is independent from `canonicalAuthority`; a completed run may honestly remain non-canonical.

Acceptance: one foreground run, expected stages equal completed stages, exit code zero, terminal status `COMPLETED`, repository-qualified membership, zero duplicate/missing/unexpected/revision/content mismatches, and fresh-connection readback.

### 2. Structural lineage

Freeze `CanonicalLineageV1`:

```text
workspaceRevision -> executionId -> repositoryId/repositoryRelativePath
-> sourceRef/sourceRevision/contentChecksum -> packetKey -> chunkId
-> treeNodeId -> symbolId/symbolVersionId
```

Every join is exact and revision-qualified. File chunks need not have symbols; symbol-level evidence must resolve to exactly one current symbol version. Path fallback is diagnostic only.

### 3. Semantic and representation ownership

Audit all 768D surfaces without mutation. Exactly one logical `semantic_768` owner may be canonical. Each manifest records representation ID/revision, workspace and cohort checksums, input digest, model/producer revisions, dimensions, dtype, normalization, ordinal checksum, and output digest. Centroids, summaries, MRL views, and latent prefixes use distinct representation IDs.

### 4. Graph, Qdrant, and Leiden

After lineage, seal one `GraphProjectionManifestV1` owning graph revision, node/edge checksums, ordinal checksum, counts, edge families, source membership, and producer execution. Qdrant and Leiden audits then compare canonical packet/chunk/symbol identity plus source/workspace/representation/content revisions. Admission requires zero ambiguity, mismatch, and path fallback.

### 5. RRF, classifier, ontology, and ACE

Complete the RRF census before caller changes. Classify each number by semantic class, application stage, policy scope, logical lane, and executor; executors do not create extra votes. Candidates enter fusion only with the canonical identity envelope.

LangExtract owns grounded observations; Ornith may propose; NB/LR/PyTorch may predict; OakLib resolves ontology identifiers; `.okf` validates schemas; PostgreSQL admits canonical tuples. ACE receives only validated revision-bound context manifests.

### 6. Evaluation and parity

The authoritative judgment set needs reviewed 0–3 grades, reviewer/judgment revision, acceptable and forbidden IDs, required evidence kinds, and hard negatives across exact, symbol, path, error, conceptual, relational, ontology, multi-hop, and hybrid queries. Exact PostgreSQL vector search is the semantic oracle; Qdrant/HNSW/GPU systems are challengers. Separate identity mismatch, ANN recall difference, and ranking difference.

## Dependency and switching policy

```text
snapshot/admission -> terminal Graphify/readback -> structural lineage
       -> semantic/representation and graph/ordinal manifests
       -> Qdrant/Leiden -> RRF identity envelope
       -> reviewed judgment set -> exact-oracle parity
       -> bounded projection canary
```

On a blocker: emit the first invariant, keep authority false, update the owning ledger, and switch to the next independent lane. Do not retry until that invariant's evidence changes.

## Safe order and exclusions

1. Correct materialized-root consumption.
2. Run one newly authorized terminal Graphify execution and independent membership readback.
3. Advance structural lineage.
4. Audit semantic/representation ownership.
5. Seal graph/ordinal manifest.
6. Read back Qdrant and Leiden identity.
7. Complete RRF census and envelope replay.
8. Review the judgment set.
9. Produce parity receipt.
10. Run the final bounded projection canary.

No direct rewrite of legacy execution rows, Qdrant repair, Leiden rewrite, classifier retraining, ontology promotion, new RRF ranking policy, SOM/GPU promotion, or unscoped Graphify apply is part of this tranche.

## External grounding

- PostgreSQL 18 composite primary/unique constraints provide uniqueness and supporting B-tree indexes; foreign keys require a primary key, unique constraint, or suitable unique index. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- PostgreSQL documents `ALTER TABLE` and concurrent index construction as distinct operations; use repository migrations and preserve immutable evidence. [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- Qdrant separates vector search from payload filtering and recommends payload indexes only for filter fields. [Qdrant filtering](https://qdrant.tech/documentation/search/filtering/) and [payload indexing](https://qdrant.tech/documentation/manage-data/indexing/)
- GraphRAG's standard pipeline extracts entities, relationships, claims, communities, summaries, and embeddings. [Microsoft GraphRAG overview](https://microsoft.github.io/graphrag/index/overview/)
- OakLib supports ontology lookup, traversal, alignment, and annotation; it is an ontology operation layer. [OakLib introduction](https://incatools.github.io/ontology-access-kit/introduction.html)

## Local evidence

`docs/reports/graphify-workspace-snapshot-binding-v1.json`, `current-graphify-run-owner-v1.json`, `current-workspace-packet-chunk-join-v1.json`, `semantic-768-writer-ownership-v1.json`, `latent-representation-identity-audit-2026-09-10.json`, `current-graph-artifact-readiness-v1.json`, `qdrant-packet-fanout-v1.json`, `rrf-lane-weight-census-v1.json`, `rrf-real-caller-identity-envelope-v1.json`, `domain-classifier-lineage-v1.json`, `parent-atlas-concept-fabric-audit-v1.json`, `ace-live-dry-input-readiness-v2.json`, `golden-relevance-review-queue-validation-v1.json`, and `parent-atlas-promotion-gates-v1.json`.

Current aggregate: `BLOCKED`; first unresolved gate: `CURRENT-SOURCE-TERMINAL-EXECUTION-01`; canonical authority: `false`.

likely_cause: Authority and cross-store lineage remain incomplete even though the core lane machinery exists.
evidence: Local receipts above plus primary PostgreSQL, Qdrant, GraphRAG, and OakLib documentation.
patch_targets: scripts/startup/run-graphify-daily-startup.mjs; scripts/atlas/graphify-daily-lifecycle-open-v1.mjs; sveltekit-frontend/src/lib/server/atlas/repository-provenance-workflow.ts; owning OpenSpec ledgers.
safe_next_command: npm run atlas:graphify:snapshot-binding:audit
smoke_command: npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --type change --strict --json
report_path: docs/reports/parent-atlas-core-lane-blocker-research-plan-v1.md
writes_performed: false for canonical stores, projections, models, caches, and indices; this is a local derived report.
