# Parent Atlas End-to-End Readiness Audit

Generated: 2026-07-23

## Implementation Update

Updated after the additive V2 persistence and package-boundary work on
2026-07-23.

| Capability | Current state | Evidence |
|---|---|---|
| V2 PostgreSQL graph persistence | `LIVE_PROVEN` | `atlas_graph_*_v2` tables, immutable snapshot trigger, foreign keys, and the live `smoke-parent-atlas-graph-v2.mjs` passed. |
| Resolution issue lifecycle foundation | `LIVE_PROVEN` | The smoke created and idempotently upserted a V2 issue; it was cleaned up after verification. |
| Legacy score isolation | `LIVE_PROVEN` | The live smoke captured identical before/after witnesses for `pagerank_score`, `authority_score`, and `page_rank_score`. |
| App-side V2 Drizzle graph schema | `IMPLEMENTED` | The SvelteKit DB layer now exports the V2 graph snapshot, node, edge, relation, issue, run, exclusion, and score tables with a thin repository wrapper. |
| Package runtime boundary | `LIVE_PARTIAL` | `@deeds/atlas-contracts` and `@deeds/parent-atlas` public exports resolve at runtime; the boundary verifier passes. CI enforcement is not yet wired. |
| Full corpus snapshot | `NOT_RUN` | No production packet population has been materialized into V2 graph rows. |
| Persisted full-corpus NetworkX/GDS parity | `NOT_RUN` | Fixture parity remains separate and does not imply a live corpus result. |
| Bounded online traversal and graph RRF | `NOT_RUN` | The legacy multihop adapter is not a V2 traversal implementation. |
| Authority promotion | `BLOCKED` | V2 scores are not populated and the promotion feature remains disabled. |

The roadmap estimate moves from **76% to 81%**. This is not a release
decision. `LIVE_PROVEN`, `LIVE_PARTIAL`, `BLOCKED`, and `NOT_RUN` remain the
authoritative release states.

## Decision

The workstation is operational, but it is not near production-complete. The
principal blocker is not missing infrastructure; it is unproven ownership,
identity, and promotion boundaries between existing live data and the V2 graph
authority contract.

Use proof states, not a percentage, for release decisions:

`IMPLEMENTED`, `FIXTURE_PROVEN`, `LIVE_PROVEN`, `LIVE_PARTIAL`, `BLOCKED`,
`NOT_RUN`, and `UNAVAILABLE`.

## Live Evidence

| Area | Evidence | Status |
|---|---|---|
| Core containers | Postgres, Qdrant, Neo4j, Valkey, Go Retrieval, SearXNG, Caddy, and SeaweedFS report healthy/running. | `LIVE_PARTIAL` |
| Go Retrieval | `/health` returns 200 on port 8100; `/ready` and `/v1/manifests` are unavailable. | `LIVE_PARTIAL` |
| Llama server | `/health` returns 200 on port 8090. | `LIVE_PROVEN` |
| NLP sidecar | Port 8098 did not return a direct HTTP response during this audit. | `UNAVAILABLE` |
| Qdrant semantic lanes | `codebase_chunks_384_hybrid`: 57,395 points; `codebase_chunks_768`: 55,120 points. | `LIVE_PROVEN` |
| Qdrant routing lanes | `codebase_topology_64` and `codebase_topology_128` both have 0 points. | `BLOCKED` |
| Graph fixture foundation | OKF validation, deterministic tree replay, NetworkX reference, Neo4j GDS stream parity, and mutation witnesses passed. | `FIXTURE_PROVEN` |
| Graph authority ledger | 1 run / 50,164 scores exist, but no `graph_snapshots` table exists. Four distinct snapshot IDs appear in the score table. | `BLOCKED` |
| Authority identity | 41,458 score rows lack `packet_key`; 40,754 lack `source_ref`; only 8,706 have both. | `BLOCKED` |
| Agentic closure | Error/outcome tables exist, but `agent_runs`, `agent_run_actions`, and `outcome_ledger` currently have 0 rows. No closed-loop `ErrorResolutionIssue` contract was found. | `NOT_RUN` |
| Package ownership | `scripts/atlas` is large; `packages/parent-atlas` is a package; `packages/atlas` contains four files and no package manifest or mirror declaration. | `BLOCKED` |

## Legacy Containment

Do not use existing `atlas_graph_authority_scores` as V2 authority evidence.
The table contains four snapshot IDs, including a promoted run, without a
canonical snapshot manifest. The scores must be classified as legacy/unverified
until a migration can prove node, edge, algorithm, and identity provenance.

The following must remain excluded from V2 ranking promotion:

- `atlas_packets.pagerank_score`: only two distinct values.
- `atlas_packets.authority_score`: legacy derived field.
- `atlas_packets.page_rank_score`: non-degenerate but writer/provenance is not
  established.

There are 315 TypeScript/ESM references to `codebase_chunks_768`. The legacy
contextual-tree adapter also directly queries that collection. No production
cutover can proceed while this bypasses the collection registry.

## Implementation Roadmap

### Phase 0: Freeze and Declare Ownership

**Goal:** prevent new legacy writes while making one source of truth explicit.

1. Create `docs/architecture/PARENT_ATLAS_PACKAGE_BOUNDARIES.md`.
2. Add `packages/atlas/package.json` or retire that directory. Do not leave it
   as an implied mirror.
3. Create `scripts/atlas/verify-atlas-package-boundaries.mjs` with a manifest
   of package exports and permitted script imports.
4. Refactor shared helpers to one owner; scripts import the package instead of
   maintaining copies.
5. Add a CI/static gate that rejects new writes to legacy PageRank fields unless
   a named compatibility exception is present.

**Accept:** `PACKAGE_OWNERSHIP_DECLARED`, `MIRROR_DRIFT_GATE_PROVEN`,
`LEGACY_RANKING_WRITE_GATE_PROVEN`.

### Phase 1: Canonical Graph Snapshot Persistence

**Goal:** make graph computation reproducible before allowing full-corpus GDS.

1. Add migrations for `graph_snapshots`, `graph_nodes`, `graph_edges`,
   `graph_algorithm_runs`, `graph_node_scores`, `graph_resolution_issues`, and
   `graph_snapshot_exclusions`.
2. Add foreign keys from V2 run/score tables to immutable snapshot records.
3. Persist the existing pure contextual-tree compiler output only after identity
   validation passes; no derived-store projection in this phase.
4. Partition candidate rows into `resolved`, `unresolved_identity_issues`, and
   `policy_exclusions`. Never synthesize a graph identity or zero score.
5. Mark existing authority ledger rows as `legacy_unverified`; do not delete or
   reinterpret them.

**Accept:** `SNAPSHOT_MANIFEST_PERSISTED`, `SNAPSHOT_HASH_STABLE`,
`UNRESOLVED_ISSUE_LEDGER_PROVEN`, `NO_LEGACY_AUTHORITY_PROMOTION`.

### Phase 2: Full-Corpus Graph Authority

**Goal:** promote only a parity-proven graph snapshot.

1. Materialize a full-corpus deterministic contextual tree and structural edge
   projection from PostgreSQL.
2. Run identity, endpoint, duplicate-key, tree collision, and coverage audits.
3. Execute NetworkX and temporary Neo4j GDS stream runs against the same
   immutable snapshot.
4. Compare node set, edge set, direction, weights, topology hash, coverage,
   top-k overlap, Spearman correlation, finite scores, and L1 normalization.
5. Capture before/after witnesses for all three legacy packet score columns and
   Valkey Karpathy state.
6. Write V2 scores only to versioned V2 tables; keep ranking feature flag off.

**Accept:** `FULL_CORPUS_GRAPH_PROVEN`, `NETWORKX_GDS_PARITY_PROVEN`,
`PRODUCTION_SCORE_UNCHANGED`, `V2_AUTHORITY_LEDGER_PROVEN`.

### Phase 3: Bounded Graph Retrieval

**Goal:** replace the legacy multihop adapter with snapshot-scoped traversal.

1. Define a traversal request containing `snapshotId`, policy version, seed
   node keys, edge allow-list, confidence floor, max hops, max fan-out, maximum
   results, and timeout.
2. Enforce canonical node identity, cycle suppression, snapshot isolation, and
   explicit truncation/degradation reports.
3. Implement a PostgreSQL-first traversal reference, then Neo4j execution as a
   derived adapter with result parity tests.
4. Keep PageRank as a bounded tie-break or capped prior, never candidate
   generation or embedding coordinates.

**Accept:** `TRAVERSAL_BOUND_PROVEN`, `IDENTITY_ONLY_RESULTS_PROVEN`,
`GRAPH_DEGRADATION_EXPLICIT`, `AUTHORITY_CAP_ENFORCED`.

### Phase 4: Retrieval Registry and Evaluation

**Goal:** make every online lane use an explicit contract.

1. Replace all direct collection names with a registry/alias resolver.
2. Classify the 315 `codebase_chunks_768` references: migrate, intentional
   detailed lane, test-only, or delete.
3. Do not enable 64/128 topology routing until their collections contain a
   snapshot-identified population and centroid provenance.
4. Run live exact, FTS, sparse, dense-384, dense-768, graph, and reranker
   evidence smoke tests with lane reports and identity deduplication.
5. Tune RRF only from recorded judgments. Evaluate NDCG@5/10/20, MRR@10/20,
   latency percentiles, path validity, and identity exclusion rate.

**Accept:** `COLLECTION_REGISTRY_ENFORCED`, `MULTILANE_LIVE_PROVEN`,
`TOPOLOGY_LANE_READY_OR_DISABLED`, `RERANKER_CANARY_PROVEN`.

### Phase 5: Error Resolution Runs

**Goal:** close the loop for controlled agentic repairs.

1. Add an immutable `ErrorResolutionIssue` and `error_resolution_runs` model.
2. Implement four bounded roles: triage, context retrieval, patch proposal,
   independent validation.
3. Require baseline reproduction, scope authorization, patch manifest,
   focused-test plan, adjacent contract checks, rollback artifact, and outcome
   ledger recording.
4. Start with three fixtures: TypeScript type error, Vitest assertion failure,
   and graph identity collision refusal.
5. Run one supervised known-failure canary before any autonomous mutation.

**Accept:** `ERROR_RESOLUTION_FIXTURE_PROVEN`,
`UNAUTHORIZED_MUTATION_REJECTED`, `ROLLBACK_PROVEN`,
`SUPERVISED_CANARY_PROVEN`.

### Phase 6: Release Closure

**Goal:** make near-100% an evidence-backed release decision.

1. Add service readiness endpoints for Go Retrieval manifests and NLP sidecar
   route evidence.
2. Publish an immutable release manifest covering code revision, schema
   version, collection aliases, graph snapshot, lane registry, model revisions,
   evaluation dataset, and acceptance results.
3. Test backup/restore of PostgreSQL manifests and Qdrant snapshots into a
   disposable environment.
4. Require every release gate to report one of the defined proof states; a
   skipped dependency cannot report `PASS`.

**Accept:** `END_TO_END_CANARY_PROVEN`, `RESTORE_PROVEN`,
`RELEASE_MANIFEST_PROVEN`, `NO_BLOCKED_RELEASE_GATES`.

## Order of Execution

1. Phase 0 package ownership and legacy-write containment.
2. Phase 1 graph snapshot and issue ledger migrations.
3. Phase 2 full-corpus graph projection/parity.
4. Phase 3 bounded traversal.
5. Phase 4 registry migration and retrieval evaluation.
6. Phase 5 controlled error-resolution fixtures.
7. Phase 6 release closure.

Do not begin error-fixing autonomy, graph authority promotion, or topology
routing before Phase 2 has completed. Do not use empty topology collections as
an online routing lane.
