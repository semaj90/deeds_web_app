# Graphify / projection admission checklist — updated 2026-09-30

## Current structural-baseline result — 2026-09-30T16:28Z

The fresh `atlas-canonical-projection-fabric-audit-2026-09-30.json` remains
`NOT_SAFE_TO_PROJECT`, **4/11 PASS**. Symbol status coverage is now **18,850/21,584 (87.33%)**,
up from 5,185 (24.02%). This is processed-source coverage, not raw symbol counts.

The existing extractor visited all 14,531 frozen exact-byte members in 59 fixed shards. A final
read-only current-producer sweep independently verified 13,195; 1,336 remain unresolved:
589 identity conflicts, 297 resource deferrals, 443 stored-observation mismatches and seven
failed members. Baseline seal remains false. The exact PostgreSQL manifest census has 13,665
PROCESSED, 859 UNPROCESSED and seven PARSE_FAILED; 470 processed members are not current-producer
readback-proven. Do not conflate these two measurements.

Global exceptions remain 1,564 UNPROCESSED (859 manifest + 705 byte-drift), 1,159 missing exact
Graphify revision rows, and 11 parse failures (four older + seven manifest). No admission
predicate was relaxed, and no physical chunks, embeddings, projections or cache were populated.
Ordinal coverage is unchanged at 14,564/16,151.

See [execution and gap report](graphify-symbol-baseline-execution-20260930.md) and the machine
gap census in `graphify-symbol-baseline-report-1790785706923/gaps.json`. The older September 29
review below is historical unless explicitly superseded here; its 194 nominations were never
the supported-source coverage numerator. The ACE legacy table remains diagnostic, not V3 grounding.

Checklist:

- [x] Freeze same-member, exact-revision source manifest; 59 deterministic shards.
- [x] Execute through existing structural owners, with guarded commits and independent readback.
- [x] Reconcile interrupted worker through exact live census; retain receipts and earlier manifests.
- [x] Visit all manifest members read-only; record exact unresolved identities/errors.
- [ ] Resolve identity/resource/old-observation/failure cohorts and prove baseline seal.
- [ ] Add claim-fenced Kanban orchestration and incremental source-revision maintenance through existing owners.
- [ ] Close the other six independent below-PASS admission predicates.

## Decision

**Latest fresh audit: `NOT_SAFE_TO_PROJECT` (7 of 11 predicates are below `PASS`).** This is a conjunction gate, not a count of missing columns. Four predicates pass; four are partial and three have no proof. Identity now passes on the fresh sample, and revision qualification now passes against the admitted `repo:root` cohort. Historical table-wide counts remain diagnostics only; neither passing predicate compensates for the remaining blockers.

### Historical count reconciliation and immediate answer (2026-09-29)

The live receipt at `docs/reports/graphify_928-audit-live-ace-store-fix/atlas-canonical-projection-fabric-audit-2026-09-29.json` was generated at `2026-09-29T03:27:56Z` and says **4 PASS / 4 PARTIAL_PROVEN / 3 NOT_PROVEN**. Therefore **7/11 are currently below PASS**, not 9/11. The 9/11 count in older OpenSpec notes describes an earlier audit state; it must not be presented as the latest result. Partial counts as below PASS for the global conjunction, but it is not the same as having no evidence.

The seven current blockers are:

- **Partial (4):** symbol nomination resolution was 194/194, not a source-coverage measurement; semantic_768 has a column but no proven unique writer/per-row provenance; latent artifacts lack canonical input binding and promotion; ordinal map covers 14,564/16,151 and lacks full coverage.
- **Unproven (3):** no per-run cross-projection checksum binding; no admitted ACE producer with identity-bound BitFrost write/readback; no grounded ACE source rows/ContextManifest readback (`ace_context_sources` has 0 rows).

These are primarily **coverage, owner, wiring, and provenance gaps**, not a request to add a bundle of columns. No migration or index has been applied.

This review is read-only with respect to application rows and schema. A recent diagnostic session ran PostgreSQL `ANALYZE` on `atlas_packet_chunk_lineage`, `atlas_packets`, and `codebase_chunk_index` to refresh planner statistics. Corrected audit runs used read-only transactions and wrote only local receipts under `docs/reports/graphify_928-audit/`, `docs/reports/graphify_928-audit-scoped/`, and `docs/reports/graphify_928-audit-cache/`; the latest reported 7/11 below `PASS`. No application-row write, index DDL, migration, projection, cache write, or model call was made in these audit runs. A previous lineage apply **did** occur on 2026-09-28; it is recorded below and must not be described as absent.

### Ordinal-query performance check (live Docker PostgreSQL, read-only)

- Re-ran the materializer's exact eligibility query shape for the admitted workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` using `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` inside `BEGIN READ ONLY` / `ROLLBACK` (`jit=off`, 45-second statement timeout).
- Result: **16,151 rows in 5,413 ms**; planning 27.9 ms; estimated 16,215 rows. The prior ~5-minute report was not reproduced on this current database/query.
- Plan: parallel sequential scan of `atlas_packets` (about 0.20 s per worker), followed by correlated lineage probes. The first two subplans each ran 16,151 times; the stale-revision subplan ran 16,151 times; the final anti-match subplan was never executed. Total buffers: 397,892 shared hits / 52,792 reads.
- Catalog check: `atlas_packets` already has `idx_atlas_packets_workspace_revision_key_source (workspace_revision_key, source_ref)` with non-null predicates. The planner selected a parallel sequential scan for this broad (16,151-row) cohort, not because the workspace-revision index is absent. `atlas_packet_chunk_lineage` has separate `packet_key` and `source_ref` indexes plus unique `(packet_key, canonical_chunk_id)`; there is no composite packet/source/revision filtered index. Its current plan uses bitmap intersections of the two single-column indexes and PK lookups into `codebase_chunk_index`.
- Decision: **no index DDL or Drizzle migration now**. The observed exact query is already below its 60-second timeout; add an index only if a reproducible production-shaped benchmark demonstrates a material benefit and confirms no owner/query rewrite is preferable. A single grouped/lateral lineage probe may eliminate repeated lookups, but it must be parity-tested against current classifications before replacing the materializer query.
- This is a query-performance result only. It does not close any of the seven below-PASS projection predicates or authorize ordinal regeneration/projection writes.

## The 11 admission predicates

| Predicate | Current result | What is missing / why it is not `PASS` |
|---|---|---|
| `IDENTITY_ALIGNED` | `PASS` (fresh audit) | Fresh 1,000-row sample had 0 missing `qdrant_point_id` and 0 duplicate packet keys. This is the audit's declared sample proof, not a full-corpus Qdrant parity proof. The earlier 289-missing result was stale relative to the current live read. |
| `REVISION_QUALIFIED` | `PASS` (fresh admitted-scope audit) | All 16,151 packet rows in the admitted `repo:root` workspace cohort map to a sealed-snapshot source and match its exact `source_revision`; mismatch/missing count is 0. The 61,718 table-wide rows and 272/1,000 historical sample are unscoped diagnostics, not the gate denominator. |
| `SYMBOLS_RESOLVED` | `PARTIAL_PROVEN` (2026-09-30) | 18,850/21,584 supported admitted source refs PROCESSED; 1,564 UNPROCESSED, 1,159 lack exact Graphify revision rows, 11 parse failures. The stronger frozen-baseline readback verifies 13,195/14,531; 1,336 remain unresolved. Nomination resolution 194/194 is a different unit. |
| `SEMANTIC_OWNER_PROVEN` | `PARTIAL_PROVEN` | `codebase_chunk_index.content_embedding_768` is present, but the unique current writer and row-level representation/input provenance are unresolved. `atlas_packets.embedding` and `codebase_chunk_index.content_embedding` remain historical/unresolved surfaces. |
| `LATENT_FAMILY_PROVEN` | `PARTIAL_PROVEN` | Registered latent artifacts have verified artifact digests, but the source `semantic_768` training/input snapshot is not bound by a per-row input-digest ledger and lifecycle promotion remains `CANDIDATE`. The corrected audit now reports `per_row_input_digest_ledger_exists: false`; artifact digest and source-input digest are distinct. |
| `GRAPH_MANIFEST_SEALED` | `PASS` | Sealed manifest is bound to the admitted workspace revision and the operator-approved scope is `repo:root`; submodules are excluded by design. This does not prove Neo4j consumes the manifest. |
| `ONTOLOGY_COHORT_NONEMPTY` | `PASS` | Audit found 63,084 ontology-related rows. Non-empty is not proof that every tuple is revision-qualified or admitted for projection. |
| `ORDINAL_MAP_SEALED` | `PARTIAL_PROVEN` | Artifact has 14,564 rows for 16,151 admitted root candidates: 1,587 missing. Its checksum recomputes and it has no reported duplicates/orphans/legacy IDs, but that is not a two-run determinism proof or full coverage. The audit also does not prove packet↔chunk↔admitted-Graphify lineage for every ordinal; the 196 previously applied lineage groups still lack an admitted-workspace Graphify row. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | `NOT_PROVEN` | `atlas_representations` exists, but has no `input_checksum` or `ordinal_map_checksum` columns; no public-table `ordinal_map_checksum` column was found. It is representation/artifact metadata, not a per-run cross-projection binding. Do not create a parallel registry by name. |
| `BITFROST_KEYS_DERIVABLE` | `NOT_PROVEN` (live; key contract test-proven) | `AceBitfrostCacheIdentityV1` deterministically derives revision/checksum-qualified keys and its focused test passes 2/2. The live audit found 0 keys under both `atlas:bitfrost:v1:*` and legacy `bitfrost:packet:*`; more importantly, there is no admitted ACE producer/caller or identity-bound write/readback. Contract success is not live warming. |
| `ACE_EVIDENCE_GROUNDED` | `NOT_PROVEN` | Production retrieval → canonical admitted resolver → AcePacketV3 → ContextManifest and grounded readback remain unproven. `ace_context_sources` is legacy diagnostic state, not that V3 proof. Existing V3 fields and contract tests do not establish a production caller; adding another packet schema/table is not the remedy. |

## Why adding ACE fields alone will not unblock `graphify:daily`

The latest live fabric audit is a conjunction over 11 independent predicates. It passed 4, has 4 `PARTIAL_PROVEN`, and 3 `NOT_PROVEN`; `graphify:daily` correctly stops before projection because the overall result is `NOT_SAFE_TO_PROJECT`. The stop is not caused by an ACE packet missing a generic collection of columns.

The existing ACE v3 contract already has `identity.source_ref` (the canonical path/reference), `identity.source_revision`, packet/workspace revisions, feature and representation revision slots, a summary object with input digest/model revision, source digest and byte-span fields, topology/centroid references, evidence references, and request-level ContextManifest token budgeting. The local composer currently leaves important values absent or non-current: source byte offsets are null; summary text/input digest/model revision are null or pending; feature ID/revision and representation revision are null; centroid refs are empty; hypergraph evidence is null; and residency is pending. It writes only local artifact files. The ContextManifest bridge and BitFrost writer exist as contracts, but the production producer/caller and admitted packet-key set are not wired; live `ace_context_sources` count is zero.

**Why ACE appeared to work before:** the production `assembleACEContext()` path still calls the legacy `routeQuery()` flow and maps its `ranked_cards` (`source_ref`, snippet, score, feature ID) into the old ACE context, then attaches the legacy ContextManifest. That is real retrieval/context assembly, but it is not the V3 evidence producer: the ranked-card mapping does not establish `packet_key`, exact source/workspace revisions, current representation revision, or byte-span grounding, and it does not persist V3 source rows. The Qdrant projection contract can carry `packet_key` and optional `source_revision`, but `query-router.ts` drops those when constructing ranked cards; its projection `workspace_revision` is numeric, unlike the canonical SHA revision used by the admitted cohort, so passing it through would not fix authority. Current non-test `buildAcePacketV3()` callers are scripts, not application routes; the V3-to-ContextManifest bridge has no production caller. Therefore the old path can remain useful while the stricter projection gate correctly blocks promotion. The missing step is a server-owned, revision-qualified adapter from an admitted candidate snapshot—not extra JSON fields on the legacy packet.

This does **not** mean the older ACE runtime never worked. A fresh read-only table census found 2 rows in `ace_context_cache` (both `cache_source=feature_map_store`), 0 in `ace_context_packets`, and 0 in `ace_context_sources`. Those cached JSON objects have feature-map fields but no source refs, source/workspace revision, or ContextManifest checksum. They demonstrate legacy cache activity, not grounded/revision-qualified V3 evidence. A second integration defect was found: `setAceContextPackPointer()` treats any fulfilled Postgres promise as a successful Postgres write, but `persistAceContextPackAuditRow()` returns `null` when its target table is absent or persistence fails. The live database has no `public.llm_context_cache`, the table that writer targets. This can mislabel Redis-only/fallback writes as Postgres-backed.

The latest local enriched-index shard confirms this is not just a mapping typo: its row has no `featureId` or token-count field, and `summary` contains only availability/length/hash/trust metadata (the sampled row is `MISSING`). The composer explicitly sets `envelope.feature_id` to null. It cannot safely fill these from a new ACE field without an authoritative feature producer, admitted summary input/model identity, and a declared tokenizer revision. `source_ref` already carries the path identity; adding a second `file_path` identity would create ambiguity unless a consumer-specific projection contract requires it.

Therefore the missing work is **populate from authoritative, revision-bound owners, wire the existing packet→ContextManifest path, then prove grounded readback**—not add duplicate ACE columns. Redis/Valkey centroids, QLoRA, domain classification, HyperGraphRAG, Neo4j, Qdrant, NetworkX, and NLP fanout are not substitutes for the current admission proof. Do not create a migration or index for these missing runtime/evidence links.

### Local ACE composer compatibility fix (2026-09-29)

The local V3 composer was failing before packet sealing because the enriched-index producer emits the explicit AST state `NOT_JOINED_IN_THIS_PASS`, while the V3 `ast_state` schema did not allow it. This is a contract-enum mismatch, not missing database columns. The V3 schema now preserves that state verbatim; a regression test builds and verifies a packet with it. TypeScript compilation and the focused ACE V3 suite passed (13/13). The local-only composer then completed 15,732 packets with zero verification failures/cache-admission misses and zero DB, Valkey, Qdrant, or model calls. This repairs local composition only: summary/embedding/residency remain HINT/PENDING, and the live `ACE_EVIDENCE_GROUNDED` predicate remains `NOT_PROVEN` because `ace_context_sources` has no rows and no admitted producer/readback exists.

### Current local V3 artifact field census (2026-09-29)

Re-counted the four NDJSON shards in `.tmp/atlas/ace-packets-v3/20260929T024243Z` without printing packet contents. All **15,732/15,732** local records contain `packet_key`, `source_ref`, `source_revision`, and `workspace_revision`. None have both source byte bounds; none have a `CURRENT` summary/input digest, `CURRENT` representation/feature/graph revision, centroid reference, hypergraph payload, or `CURRENT` residency. This is a local artifact census only: it does not show a server caller or a Postgres/Valkey readback. `source_ref` already holds the path identity; request token budgeting belongs to ContextManifest, not a guessed per-packet token column. This confirms the remaining issue is authoritative field population and live wiring, not the absence of those slots from the packet contract.

## Live PostgreSQL/Docker schema census

Re-queried from the running `legal-ai-postgres` container / `legal_ai_db` on 2026-09-29 inside `BEGIN READ ONLY` (`transaction_read_only=on`, then `ROLLBACK`). These are catalog observations, not a new row-level census.

- `atlas_packets`: `packet_key`, `source_ref`, `source_revision`, `workspace_revision_key` are available; the older `workspace_revision` column is integer and is not the revision-key contract. `qdrant_point_id` is nullable.
- `atlas_packet_chunk_lineage`: `packet_key`, `canonical_chunk_id`, `chunk_row_id`, `source_ref`, nullable `source_revision`, and `revision_status` are present. Current indexes include the primary key, unique `(packet_key, canonical_chunk_id)`, and separate indexes on `packet_key`, `source_ref`, `canonical_chunk_id`, and `revision_status`. There is no composite partial index on `(packet_key, source_ref, source_revision)` filtered to proven/non-null rows. This is a candidate performance question only; absence alone does not prove an index should be added.
- `codebase_chunk_index`: canonical row `id`, `source_ref`, `source_revision`, `workspace_revision`, and `file_content_hash` are present. Relevant indexes include `source_ref`, `(source_ref, file_content_hash)`, `source_revision`, and `(workspace_revision, source_ref)`.
- `graphify_files`: `workspace_id`, `workspace_revision`, `source_ref`, `source_revision`, `code_source_revision`, and `content_hash` are present. Catalog stats report `n_live_tup=0` and no analyze timestamp despite a nontrivial relation size; these statistics are not a trustworthy exact row count. Use the established Graphify owner and a bounded readback to prove admitted-revision rows.
- `atlas_representations` and `ace_context_sources` exist. The report’s `atlas_representation_records` name is not the live registry table. `ace_context_sources` had zero estimated rows in current stats; the canonical-projection audit also reported zero.

The live schema has `ace_context_cache`, `ace_context_packets`, and `ace_context_sources`, but not `llm_context_cache` even though Drizzle declares it and the legacy audit writer targets it. `ace_context_sources.file_path` already exists; its current row contract has no dedicated source/workspace revision columns (it does have `metadata jsonb`). ACE packet/cache tables already carry token-count fields. The new ACE grounding gate is not satisfied by the two unrevisioned `ace_context_cache` records. Do not add a new table, add revision columns, or redirect the writer until the intended schema/producer owner is reconciled; the `llm_context_cache` mismatch is a real schema-owner discrepancy, not a reason to treat existing cache rows as canonical evidence.

**Migration/index decision:** Drizzle ORM does not imply that a migration is needed. A migration is appropriate only after an owned contract specifies a required persisted field/index and a measured or correctness-backed gap proves it is needed. The current blockers are not fixed by adding `source_revision`, duplicate `file_path`, summary/token, feature-remapping, or centroid columns without producers. For the ordinal query, first complete `ORDINAL-QUERY-PLAN-01` with the exact query and bounded `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`; only if that evidence demonstrates the composite lineage index is the cause should an additive migration be proposed through the registered Drizzle/sidecar migration owner. Never use `drizzle-kit push` on live data. No DDL was run in this census.

## Ordinal and lineage corrections to preserve

1. The canonical admitted root denominator is 16,151. The current ordinal artifact is 14,564; its missing count is 1,587. Do not infer that all 14,564 satisfy the stricter three-way admitted Graphify revision predicate.
2. The prior `PKT-LINEAGE-REFRESH-01` apply was already committed at `2026-09-28T23:47:08.724Z`: it inserted 2,814 lineage rows, including 147 previously missing packet groups, refreshed 49 stale groups, and changed the lineage row count from 125,113 to 127,927. This review initiated no lineage writes.
3. The preserved post-apply readback found 196 admitted packet keys / 3,502 lineage rows with packet↔chunk parity, but zero Graphify rows at the admitted workspace revision. Historical Graphify digest matches are not a substitute for admitted-revision binding. The exact target manifest/checksum for those 196 is still missing.
4. The remaining 1,587 are a separate coverage/identity cohort: 1,586 have no physical chunk row and one has a duplicate canonical chunk identity. They cannot be fixed by relaxing the ordinal query or by refreshing Graphify alone.
5. The materializer must require the existing canonical cohort and exact lineage, then verify packet source revision = chunk file hash = Graphify code-source revision at the admitted workspace revision. Reuse the current Graphify and lineage owners. Do not extend the retired rehearsal stub into another writer.

## Query performance / migration decision

`ANALYZE` refreshed planner statistics. `EXPLAIN (VERBOSE)` showed the lineage probe combining separate `packet_key` and `source_ref` bitmap indexes, then filtering revision/status; chunk and Graphify lookups add more work. The bounded `EXPLAIN ANALYZE` was canceled at its 30-second statement timeout. Therefore the exact runtime/cost and the best remedy remain **unproven**. The latest query-plan output is not evidence that a new index alone will solve the correctness or runtime issue.

**Do not add an index or alter a table yet.** Next, capture the exact materializer SQL and a bounded representative plan/runtime with `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` under a controlled timeout. Compare estimates/actuals and buffers; confirm join/index ownership and whether the `codebase_chunk_index` join is semantically required. If a missing access path is demonstrated and the plan is still too slow, propose one additive, reversible migration and validate its impact before applying it.

If DDL is justified, it must go through the repository’s governed Drizzle migration workflow and schema ownership review—never `drizzle-kit push` against live data. The live catalog proves what is deployed; a migration is needed only for an approved schema change, not merely because a table is queried or because a TypeScript/Drizzle package exists. Before creating a migration, reconcile the existing manual lineage SQL and migration journal/sidecar registration; this review did not establish that a new index belongs in Drizzle or authorize one.

## Ordered checklist

- [x] **A. Audit receipt consistency:** corrected the representation-registry name, latent input-ledger boolean, revision denominator, and current-vs-legacy BitFrost key census. New isolated audit receipts preserve the pre-existing modified report.
- [ ] **B. `ORDINAL-QUERY-PLAN-01`:** capture the exact materializer SQL, current `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`, estimates vs actuals, scans, join loops, and buffer reads/hits. Do not raise timeout as the first fix.
- [x] **C. `GRAPHIFY-FILE-REV-REEVAL-01` (read-only comparison complete; refresh still unauthorized):** recovered 196 exact packet keys/source refs from producer-tagged lineage rows and matched all 196 to the admitted execution membership, packet source revision, and normalized chunk file hash. Receipt checksum: `sha256:d26cb19fe753832ebdc66e60ed8abc6e4c45ecb52f792d4a1244a29368a48dd5`. All 196 have zero `graphify_files` rows at the admitted workspace revision; only 46 have any historical Graphify digest match. Current repo bytes match 192 packet revisions and differ for 4, so the live worktree cannot stand in for the admitted snapshot for those four. Three packet groups also have some physical chunk rows with null `codebase_chunk_index.source_ref` (despite matching file hash); do not infer that metadata from the lineage key. No writes.
- [ ] **D. Upstream coverage:** investigate the 1,586 no-chunk sources through the existing chunk producer; resolve the one duplicate canonical chunk ID through its identity owner. Keep both cohorts separate from Graphify refresh.
- [ ] **E. `ORDINAL-COHORT-BIND-02`:** bind the existing materializer and sealing audit to canonical admitted `repo:root`, exact workspace revision, non-null source revision, packet key, and proven packet↔chunk↔Graphify lineage. Preserve rejection counters; packet/snapshot parity alone cannot certify physical chunk lineage.
- [ ] **F. Only after A–E:** regenerate the current qualified cohort from scratch, run twice, and compare ordering/checksum. Full `ORDINAL_MAP_SEALED=PASS` requires 16,151/16,151 exact identities/revisions, no missing/orphan/legacy/duplicate rows, and deterministic bytes.
- [ ] **G. Resolve the other non-PASS predicates independently:** identity/projection linkage; revision denominator; symbol coverage; semantic writer and representation provenance; latent input digest and promotion; cross-projection checksum owner; BitFrost key derivation; live ACE producer and evidence grounding.
- [ ] **H. Projection admission:** rerun the complete audit from current canonical evidence. Promote only when all 11 predicates meet their declared PASS criteria; do not infer closure from checklist completion or schema presence.

## Evidence and scope

### `GRAPHIFY-FILE-REV-REEVAL-01` read-only result

- Exact target set: 196 packet keys / 196 source refs / 3,502 producer-tagged lineage rows; packet workspace revision and admitted execution membership match 196/196.
- Packet `source_revision` equals lineage `source_revision` for all 3,502 rows. After normalizing only the optional `sha256:` prefix, `codebase_chunk_index.file_content_hash` matches the packet/lineage digest for all 3,502 rows. The separate `codebase_chunk_index.source_revision` field is null for this cohort and is not evidence of revision disagreement.
- `graphify_files` has 0 rows at the admitted workspace revision. Historical rows match the packet digest for 46 sources; 150 have no historical digest match. Current working-tree bytes match the packet digest for 192 sources; 4 differ and require the admitted snapshot bytes, not current-file hashing.
- Three packet groups have only 1 of 7, 1 of 12, and 1 of 3 chunk rows carrying an exact `codebase_chunk_index.source_ref`; the remaining chunk rows have null source refs. Their file hashes match, but source-ref coverage remains a separate metadata gap.
- The exact target manifest checksum is deterministic over sorted `(packet_key, source_ref, source_revision, packet_workspace_revision)` rows. This proves target recovery, not permission or readiness to synthesize missing Graphify rows.
- Diagnostic implementation: `scripts/atlas/audit-graphify-file-rev-reeval-01.mjs`; receipt: `docs/reports/graphify-file-rev-reeval-01.json`. Both are read-only with respect to services/data; the script writes only its local report.
- `GRAPHIFY-BINDING-01` read-only census is complete: the admitted root partition has 24,456 execution-membership rows and 24,456 persisted `atlas_workspace_source_bindings`; exact source/workspace/source-revision/content-digest/byte-length joins match 24,456/24,456. The missing link is not source membership data: zero `graphify_files` rows are bound to the admitted workspace revision, and the existing V2 per-file writer requires Git-backed `WorkspaceRevisionRecordV1` metadata that this sealed-snapshot membership does not provide. Its sealed-snapshot binder writes run-level metadata only, not per-file inventory. Next is a same-owner snapshot-input adapter/readback design, not deriving admitted bytes from the current worktree or inventing Git OIDs. No database writes were made.

### `GRAPHIFY-BINDING-01` result

- Admitted workspace revision: `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; execution: `74d50c86-8194-45ea-8c3d-61aab737ef83`.
- Exact source binding: `24,456/24,456` root execution members match persisted source bindings across `source_ref`, workspace revision, source revision, normalized content digest, and byte length. Root ordinals are unique and contiguous `0..24,455`; required binding fields are populated.
- Graphify inventory gap: zero `graphify_files` rows identify that native snapshot run via `last_seen_run_id`, and zero are attached to the admitted workspace revision. The sealed shard manifest confirms the root partition/count/revision but does not populate the per-file inventory table.
- Ownership: `writeGraphifySourceInventoryV2` accepts a Git-backed workspace revision record plus source bindings. `bindSealedSnapshotWorkspaceRevisionInTransactionV1` binds run metadata only. The same existing Graphify writer needs a carefully typed snapshot-backed per-file input path and readback proof; this does not require a new table or a fabricated repository commit.
- Authority caveat: the older run is marked `LEGACY_IMPORTED` in `graphify_execution_authority`. Its `canonical_authority=true` flag alone is not enough to promote it; preserve the sealed admitted snapshot and execution-membership proof as the source authority.
- No schema/index change follows from this result. Do not write rows until the adapter contract, exact target scope, source-revision authority, and controlled apply/readback are reviewed.

- Latest fresh live audit: `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-29.json`, generated `2026-09-29T02:14:47.740Z`; 4/11 `PASS`, 4/11 `PARTIAL_PROVEN`, 3/11 `NOT_PROVEN`, overall `NOT_SAFE_TO_PROJECT`. PostgreSQL ran in `READ ONLY` and rolled back; BitFrost was scanned without writes.
- Fresh corrected read-only audit: `docs/reports/graphify_928-audit/atlas-canonical-projection-fabric-audit-2026-09-29.json` and `.md` (generated 2026-09-29T01:46:32Z; identity `PASS`, 8/11 below `PASS`).
- Fresh admitted-scope audit: `docs/reports/graphify_928-audit-scoped/atlas-canonical-projection-fabric-audit-2026-09-29.json` and `.md` (generated 2026-09-29T01:51:18Z; revision `PASS`; 7/11 below `PASS`).
- Fresh cache-namespace audit: `docs/reports/graphify_928-audit-cache/atlas-canonical-projection-fabric-audit-2026-09-29.json` and `.md` (generated 2026-09-29T01:59:10Z; both current and legacy key counts 0; 7/11 below `PASS`).
- Latest isolated live audit: `docs/reports/graphify_928-audit-live-ace-store-fix/atlas-canonical-projection-fabric-audit-2026-09-29.json` and `.md`, generated `2026-09-29T03:27:56.162Z`; PostgreSQL `READ ONLY`, rolled back, zero production writes. It confirms 4 `PASS`, 4 `PARTIAL_PROVEN`, and 3 `NOT_PROVEN`, with the corrected ACE note accurately reporting zero persisted source rows. `graphify:daily` therefore remains correctly fail-closed.
- ACE storage census: `ace_context_cache=2`, `ace_context_packets=0`, `ace_context_sources=0`, and no `public.llm_context_cache`. Existing cache rows are legacy `feature_map_store` entries without revision or manifest binding. `setAceContextPackPointer()` telemetry now distinguishes a persisted Postgres key from a fulfilled `null` result; focused tests cover Postgres, Redis fallback, and local fallback. This corrects observability but does not make the ACE gate pass.
- Lineage history and next target gate: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (worktree-modified during this review; read only).
- Ordinal materializer: `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts`.
- Graphify source-revision writer: `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts` (owner recorded in the task ledger).
- Historical lineage apply/readback receipt: `docs/reports/pkt-lineage-refresh-01-apply-v1.json` and the corresponding task-ledger correction.

This checklist records the current blockers; it does not authorize lineage refresh, ordinal regeneration, index DDL, projection/cache writes, or ACE warming.
