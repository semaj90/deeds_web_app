# Fanout end-to-end gap audit — 2026-08-23

Status: `CONTRACTS_PRESENT / READONLY_ADMISSION_BLOCKED`

## Evidence run

Read-only command:

`cd sveltekit-frontend && node_modules\\.bin\\tsx scripts/atlas/prove-fanout-admission-readonly.mts`

Observed receipt: `docs/reports/fanout-admission-readonly.json`

- `status`: `GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED`
- collection: `codebase_chunks_768_v2`
- Postgres writes: `false`
- Qdrant writes: `false`
- Neo4j writes: `false`
- missing snapshot columns: `workspace_revision`,
  `source_inventory_revision`, `graph_revision`,
  `identity_contract_version`, `parser_contract_version`, `revision_checksum`
- graph node `source_revision` column: absent

The separate read-only migration preflight completed with
`GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_NEW_TABLES_SAFE`: neither
`graphify_runs` nor `graphify_files` exists and no incompatible base-schema
conflict was detected. This means the additive migration is structurally safe
for a deliberately selected non-production database; it does not authorize
applying it to the shared `5434` proxy or to production.

The revision-owner proof now supports an explicit bounded source scope and was
rerun against one source file. It completed in `6.4s` with
`BLOCKED_SCHEMA_MISSING`, `productionWriterPresent=true`,
`productionWriterV2Compatible=true`, `persistedMatchingRows=0`, and
`fanoutMayConsumeAsCanonical=false`. This is a useful bounded diagnostic, not
workspace completeness or owner proof.

Focused static contracts exist for snapshot revision, graph/Qdrant identity
alignment, candidate ordinals, and fail-closed admission. This is not yet an
end-to-end runtime proof.

## Complete dependency chain

| Gate | Current state | What is still missing |
|---|---|---|
| 1. Workspace/source owner | `BLOCKED` | Apply only in a named disposable database; create `graphify_runs`/`graphify_files`; prove one writer and one-row readback. |
| 2. Graph snapshot revision | `BLOCKED` | Add the six snapshot revision fields and node `source_revision`; bind writer output to the source-inventory receipt. |
| 3. Snapshot readback | `PARTIAL` | Existing snapshot/node/edge rows read back, but revision fields are not complete or authoritative. |
| 4. Graph node identity | `PARTIAL` | Selected node/edge binding exists; prove packet key, symbol version, tree occurrence, source ref, and source revision together. `tree_node_id` remains occurrence evidence, not stable identity. |
| 5. Qdrant v2 projection | `PARTIAL` | Prove active writer payloads carry `source_ref`, `packet_key`, canonical identity, `representation_id=semantic_768`, dimension 768, representation revision, repository/source/graph revisions, taxonomy revision, domain class, and concepts. |
| 6. CandidateOrdinal map | `CONTRACT_PRESENT` | Materialize one complete revision-qualified map for the frozen candidate snapshot; prove identical checksum across Postgres, Qdrant, Neo4j, cuVS/CAGRA/TurboVec adapters. |
| 7. Graph algorithm parity | `FIXTURE_PROVEN / LIVE_JOIN_OPEN` | NetworkX/cuGraph full-snapshot parity exists; same frozen identity/config/ordinal receipt through Neo4j GDS and selected graph fanout remains open. |
| 8. Bounded fanout execution | `NOT_WIRED_END_TO_END` | Execute Qdrant candidate read plus bounded Neo4j traversal/PageRank using the admitted ordinals, with depth/edge/type/row budgets and no writes. |
| 9. Fusion and canonical join | `PARTIAL` | SearchRuntime must consume one logical candidate per identity, preserve one vote per lane, join Postgres truth, and emit a receipt containing all revisions/checksums. |
| 10. Derived feature materialization | `UNPROVEN` | Persist graph authority/community/latent features only through the approved derived-artifact path; no direct Qdrant/Neo4j mutation from an orchestration node. |
| 11. Replay/idempotency | `UNPROVEN` | Repeat the same snapshot/query/action and prove no duplicate graph work, no extra semantic vote, and deterministic receipt reuse. |
| 12. Production promotion | `BLOCKED` | Durable receipts, isolated database proof, live service health, rollback evidence, and explicit promotion approval are still absent. |

## Important implementation gaps after the migration gate

- `packages/parent-atlas-runtime/src/facade/retrieval-facade.ts` still has
  incomplete Qdrant candidate and Neo4j k-hop paths; package presence does not
  constitute fanout wiring.
- `packages/parent-atlas-runtime/src/adapters/qdrant-recall.adapter.ts` now
  targets `codebase_chunks_768_v2`, but its package typecheck has existing
  `drizzle-orm Database` and facade typing failures.
- Existing graph/PageRank receipts prove algorithms on frozen inputs, not that
  SearchRuntime admits their rows after the source/Qdrant identity join.
- `latent_128`/`latent_64` remain derived routing representations and must not
  become independent RRF votes or identity keys.
- ACE/RLM/KAG/BitFrost/TurboVec are downstream evidence, caching, or executor
  lanes; none can repair a missing source or graph revision owner.

## Safe order to finish

1. Provision a disposable Postgres target distinct from the shared `5434`
   proxy; apply the source-inventory and graph-snapshot migrations there only.
2. Run source-owner canary, snapshot readback, and selected node/edge readback.
3. Run the Qdrant v2 payload/identity census against the same revisions.
4. Build the full CandidateOrdinal map and compare checksums across all
   read-only executors.
5. Run bounded Qdrant → graph fanout with Neo4j stream-only operations.
6. Emit and verify one fusion/fanout receipt; replay it and require identical
   checksum and zero duplicate work.
7. Only then consider derived feature persistence or promotion.

No migration, Qdrant update, Neo4j write, Postgres write, or canonical data
mutation was performed by this audit.
