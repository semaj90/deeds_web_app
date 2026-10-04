# Lane C — HyperRAG Lineage Audit

**Overall: INCOMPLETE.** This was a read-only audit. No Graphify run, database/projection write, task-ledger edit, or application-code edit was performed in this lane. This report is the only output created by this lane; pre-existing uncommitted worktree changes were preserved.

## Population and owner map

| Population | Current owner/evidence | Revision evidence | Status |
|---|---|---|---|
| `atlas_hyperedges` — 62,802 rows; 125,604 member rows | `populate-hyperedges-from-taxonomy-edges-v1.mts` materializes the legacy `taxonomy_edges` source; `HyperedgeV1` / `atlas_hyperedges` is the typed incidence owner | All 62,802 have `graph_revision=taxonomy-edges-v1-2026-05-08`, `workspace_revision=git:0084288f26`, and a source revision. The admitted workspace is `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. | `STALE_LINEAGE` for the admitted workspace; none qualify for current expansion. All edges are binary (`arity=2`), with zero orphan members, duplicate role members, missing contract IDs, or missing checksums. |
| `atlas_relationships` — 603 rows | Feature-ontology relationship materializer and `atlas_relationships` schema | No `graph_revision` column; these rows cannot be assigned to an exact graph snapshot from this table. | `INCOMPLETE_REVISION_BINDING` |
| `atlas_graph_snapshots_v2` — 2 rows | `graphSnapshotsV2` schema is a snapshot-owner candidate; snapshots carry source/topology/policy hashes | No `graph_revision` column in the live table. Snapshot rows therefore do not provide an exact graph-revision key for incidence joins. | `INCOMPLETE_REVISION_BINDING` |
| `graph_analysis_runs` — 24 rows | Existing graph-analysis run ledger is the analysis owner | All 24 rows carry `workspace_revision=workspace:parent-atlas` across five graph revisions: `1e01c4a8adbe381f69c974cc31d77bdd017d9f1bb99f45a08d8d46ff5fe95383`, `7dd56c374f3c54dbdd7e5b13c75428d15b387be2cbbe3b29f830414c7456e5d1`, `ae0533576dcdb7cc4fc14bcbb773a4a7e935b86f854063f2149f894277ed5dc0`, `d9fb40249115d14b393b80959b36475e54577310b81645c08e60fc77bff272a9`, `fd522e94dbb6b1e13ca3f52f2886afcb4d811be6d82ee7375eaa441452f8d019`. None match the admitted workspace revision. | `INCOMPLETE_CURRENT_BINDING` |
| `atlas_ontology_tuples` / `atlas_taxonomy_assignment_candidates` | Existing schema/decision surfaces | Both returned zero rows in the owner census; neither supplies a current graph-revision bridge. | `NO_CURRENT_COHORT` |

The admitted workspace receipt is `WORKSPACE_REVISION_TOURNAMENT_ADMITTED`, proof level `BOUNDED_LIVE_PROVEN`, workspace revision above, snapshot revision `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`. It explicitly says `graphifyExecutionAuthorized=false`, `projectionWritesAuthorized=false`, and `writesPerformed=false`. No current graph revision bound to that workspace was found.

## Read-only cohort feasibility

| Stage | Evidence | Result |
|---|---|---|
| Dense candidate → canonical identity | `rankCandidates` carries `candidateId`, `packetKey`, `sourceRef`, `sourceRevision`, and `workspaceRevision`; HyperRAG's identity resolver requires `packetKey` plus `sourceRef`. | `CREATED`; the identity seam exists. No end-to-end live candidate was selected in this audit. |
| Canonical identity → incidence | The strict reader accepts canonical IDs and requires both workspace and graph revisions. Its SQL joins `atlas_hyperedges` to `atlas_hyperedge_members`, filters exact `workspace_revision` and `graph_revision`, and matches `member_id`. | `INCOMPLETE`: existing incidence rows are all on the old workspace/graph revision, so the admitted workspace has **zero eligible hyperedges**. Do not substitute revisionless relationship or snapshot rows. |
| Incidence → bounded neighbors | `executeKagQuickHopV1` delegates to the strict reader and checks returned revisions. Limits are depth 3, frontier 64, 32 hyperedges, 12 source spans; reader caps 256 IDs and 4,096 member rows, rejecting overflow. | `CREATED` / focused contract-tested; not live-proven. No production caller of the quick-hop coordinator was found. |
| Same graph/workspace revision through rerank/receipt | HyperRAG packet RPC initializes `neo4j_neighbors` empty and maps any supplied neighbors; `unified-orchestrator.ts` does not populate them. | `INCOMPLETE`; no current graph revision or wired neighbor-population lineage exists. `MULTIHOP_LINEAGE_UNPROVEN` remains. |

**Feasibility decision:** A non-empty, valid read-only cohort cannot be assembled from current persisted graph data. A zero-result exact-revision query would be safe but would not prove the requested path. A synthetic graph revision, stale-edge fallback, or timestamp-based association would invalidate the proof. Re-run a bounded cohort only after an existing authorized owner produces a graph snapshot and incidence rows bound to the admitted workspace, and provides the exact graph revision plus dense-candidate-to-canonical-ID evidence.

## Exact evidence files and commands

- `scripts/atlas/audit-graph-revision-owner-v1.mjs` — read-only schema/population/revision census. Fresh output: `%TEMP%\lane-c-hyperrag-graph-revision-owner-20261003.json`; status `GRAPH_REVISION_OWNER_DATA_PRESENT_REQUIRES_CURRENT_BINDING_CHECK`.
- `scripts/atlas/audit-hypergraph-current-arity-census-v1.mjs` — read-only edge/member/revision/integrity census. Fresh output: `%TEMP%\lane-c-hyperrag-hypergraph-census-20261003.json`; status `CENSUS_COMPLETE_CURRENTNESS_UNPROVEN`.
- `docs/reports/workspace-revision-tournament-admission-v1.json` — admitted workspace/snapshot revision and explicit no-Graphify/no-projection-write gate.
- `sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts` — `HyperedgeV1` identity and revision contract.
- `sveltekit-frontend/src/lib/server/atlas/integration/kag-hypergraph-reader-v1.ts` — exact-revision bounded PostgreSQL incidence reader.
- `sveltekit-frontend/src/lib/server/atlas/integration/kag-quick-hop-v1.ts` — bounded traversal coordinator.
- `sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts` and `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts` — packet identity mapping / missing neighbor population.
- `scripts/atlas/populate-hyperedges-from-taxonomy-edges-v1.mts`, `scripts/atlas/materialize-feature-ontology-relationships-v1.mjs`, `sveltekit-frontend/src/lib/server/db/schema/graph-authority-v2.ts`, `sveltekit-frontend/src/lib/server/db/schema/graph-analysis-runs.ts` — population and schema-owner references.

Read-only commands executed (audit outputs were directed to `%TEMP%`):

```powershell
$graphOut = Join-Path $env:TEMP 'lane-c-hyperrag-graph-revision-owner-20261003.json'
node scripts/atlas/audit-graph-revision-owner-v1.mjs "--output=$graphOut"
$out = Join-Path $env:TEMP 'lane-c-hyperrag-hypergraph-census-20261003.json'
$env:ATLAS_HYPERGRAPH_CENSUS_REPORT = $out
$env:ATLAS_EXPECTED_WORKSPACE_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'
node scripts/atlas/audit-hypergraph-current-arity-census-v1.mjs
```

Static owner/call-path checks:

```powershell
rg -n "executeKagQuickHopV1|createPostgresKagQuickHopReaderV1|readKagHyperedgesStrictV1|readKagHypergraphNeighborsStrictV1" sveltekit-frontend/src scripts --glob '!**/*.spec.ts' --glob '!**/*.test.*'
rg -n "neo4j_neighbors|hyperragPacketRpc\(|executeUnifiedRetrieval\(" sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts
```

## Gaps and next safe gate

1. Identify the authorized graph-snapshot/incidence producer that can bind one graph revision to the admitted workspace; current snapshots and relationship rows lack the necessary key.
2. Prove a bounded dense candidate's canonical identity is exactly represented in incidence `member_id` for that same workspace/graph revision.
3. Wire the existing quick-hop owner into the existing retrieval path without adding an orchestrator; prove bounded expansion, canonical dedup, rerank, and a revision-bound receipt on that frozen cohort.
4. Independently read back the receipt and report zero writes.

No Graphify refresh is recommended for this gate: the admission receipt disallows it, and this audit does not authorize a projection rebuild. No tests were run; existing reader/quick-hop tests are mock/contract evidence only, not a live cohort proof.

## Required execution fields

- `likely_cause`: Existing HyperRAG incidence and snapshot populations are not bound to the admitted workspace/graph revision, while the retrieval path does not populate neighbors.
- `evidence`: The two fresh temporary census outputs, the admitted workspace receipt, and the owner/source files listed above.
- `patch_targets`: `docs/reports/hyperrag-lineage-audit-lane-c-v1-20261003.md` only.
- `safe_next_command`: `node scripts/atlas/audit-graph-revision-owner-v1.mjs "--output=$env:TEMP\lane-c-hyperrag-graph-revision-owner-recheck.json"`.
- `smoke_command`: No live smoke is currently safe or meaningful; a bounded read-only cohort smoke is gated on a current revision-bound graph snapshot and incidence population.
- `report_path`: `docs/reports/hyperrag-lineage-audit-lane-c-v1-20261003.md`.
