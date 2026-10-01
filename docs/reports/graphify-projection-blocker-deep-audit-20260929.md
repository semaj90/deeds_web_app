# Graphify projection-admission blocker audit — 2026-09-29

## Executive result

`graphify:daily` is not failing because the Graphify task wrapper or ACE packet schema is malformed.
The daily wrapper runs the canonical projection-admission audit before its apply chain and aborts
when the audit returns `NOT_SAFE_TO_PROJECT`. Git blame shows this guard was added to
`scripts/startup/run-graphify-daily-startup.mjs` on 2026-09-10 (commit `6752fdb64e`). The prior
workflow could run before this stronger promotion gate existed; the present stop is deliberate
fail-closed behavior, not proof that the old projection was fully qualified.

Fresh read-only audit receipt:
`docs/reports/atlas-canonical-projection-fabric-deep-audit-20260929/atlas-canonical-projection-fabric-audit-2026-09-29.json`.
The audit opened a read-only transaction and rolled it back. Result: **4/11 PASS**; seven predicates
remain below PASS. It is a different and current predicate set from the pasted older “9 blockers”
summary.

## Follow-up evidence — 2026-09-29

The table below is the initial baseline; later receipts supersede only their corresponding counts.
A bounded run through the existing guarded Graphify symbol extractor processed 141 eligible files.
Its receipt reported 1,174 symbol/AST rows, later reconciled to 1,112 symbol rows plus 60 AST rows
(1,172 persisted rows; see the canary readback below). Receipt:
`docs/reports/graphify-symbol-extractor-v1-1790709740924.json`. An independent read-only audit then
reported 3,764/21,584 supported admitted source refs processed (17.4%), 16,657 unprocessed, 1,159
without an exact Graphify source-revision row, four parse failures, and zero duplicate exact rows.
The current receipt is
`docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-sixth-20260929/atlas-canonical-projection-fabric-audit-2026-09-29.json`.
The gate remains `NOT_SAFE_TO_PROJECT`, 4/11 PASS. This progress is real but does not establish full
symbol coverage or projection safety.

The ordinal materializer was then run in dry-run mode against the current admitted workspace and
candidate snapshot. It hit PostgreSQL `57014` at the existing 60-second statement timeout; no ordinal
artifact was applied or regenerated. `ANALYZE` had refreshed statistics for the relevant tables, so
stale statistics alone do not explain the timeout. A non-ANALYZE plan for the full cohort predicts a
parallel packet scan followed by four correlated lineage subplans; the lineage table has separate
`packet_key` and `source_ref` indexes but no composite index beginning with the repeated packet/source/
revision lookup keys. A bounded 100-row `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` completed in
about 39.5 ms and showed repeated bitmap intersections and chunk primary-key lookups. This supports
an access-path/query-shape diagnosis, but does not justify raising the timeout or adding an index
without a controlled comparison and migration review.

The existing ordinal materializer was then changed in place to use one `LEFT JOIN LATERAL` aggregate
for the three lineage diagnostics, retaining the physical chunk-index join because `chunk_row_id`
has no FK. The previous and new predicates matched exactly over a deterministic 1,000-packet live
sample (zero differences in proven, present, and revision-mismatch classifications). A full dry-run
with `--shuffle` then completed under the unchanged 60-second timeout: 16,151 admitted root packets,
14,564 qualified, 1,587 rejected for missing exact lineage, and the reversed-order checksum check
passed. It wrote only a local artifact under `.tmp/atlas/candidate-ordinal-corpus-v2/` with checksum
`77634f4763f67af6658ba9b4017db2d1c2b8ce150903e5ce09fb31ec752e91fd`; it did not replace the canonical
ordinal artifact or write to a datastore. The rejection counters remain zero for legacy identities,
missing source revision, workspace mismatch, duplicate canonical ID/ordinal, source-revision drift,
and foreign repository. A second independent dry-run produced the same checksum and ordering. This
fixes the query timeout without adding a migration, but does not close `ORDINAL_MAP_SEALED` because
the 1,587 cohort rows still lack proven lineage.

An independent current fabric audit after the query rewrite remains `NOT_SAFE_TO_PROJECT`, 4/11 PASS,
with the same seven predicates below PASS. Receipt:
`docs/reports/atlas-canonical-projection-fabric-post-ordinal-query-rewrite-20260929/atlas-canonical-projection-fabric-audit-2026-09-29.json`.

The lineage bridge was rechecked read-only for the exact sealed execution and admitted workspace
revision. Across 25,542 execution memberships in seven repositories, 24,456 had exact current source
bindings and 14,628 had an exact proven packet/chunk bridge. In the `repo:root` diagnostic grouping,
9,827 source refs were classified `PROVEN_LINEAGE_MISSING`; 5,503 had physical chunk rows but no
proven lineage, while 4,324 had no physical chunk rows. One source ref had lineage proven at another
revision. The bridge census is execution/source-binding scoped, not the 16,151-packet ordinal
denominator; do not substitute these totals for the frozen missing-ordinal set. Receipt:
`.tmp/atlas/graphify-chunk-bridge-deep-audit-20260929.json` (read-only; writesPerformed=false).

Only the bounded Graphify symbol extraction above wrote data, through its existing guarded writer.
The audits/plans were read-only. There were no ordinal, Qdrant, Valkey, cache, or model writes/calls.

## Current predicate findings

| Predicate | Current evidence | What actually closes it |
|---|---|---|
| `IDENTITY_ALIGNED` | PASS; 1,000-sample audit found 0 duplicate packet keys and 0 missing Qdrant point IDs. | No Qdrant-ID backfill is indicated by this audit. Reopen only if a new scoped audit contradicts it. |
| `REVISION_QUALIFIED` | PASS; all 16,151 packets in the admitted `repo:root` workspace cohort match the sealed snapshot and exact source revision. The 61,718 table-wide rows include historical/non-admitted context and are not the denominator. | Preserve this admitted-cohort boundary; do not “repair” the legacy table-wide population to satisfy this gate. |
| `SYMBOLS_RESOLVED` | `PARTIAL_PROVEN`; latest audit receipt reports 3,764/21,584 supported admitted source refs processed (17.4%), 16,657 unprocessed, 1,159 with no exact Graphify source-revision row, 4 parse failures, and 0 duplicate exact inventory rows. The 194 nominated symbols resolve cleanly, but that is not corpus extraction coverage. | Continue through the admitted-source extractor for exact-current rows. Diagnose the 1,159 missing inventory rows through the existing Graphify source-inventory owner; explicitly classify parse failures. Never relax source-byte/revision checks. |
| `SEMANTIC_OWNER_PROVEN` | `PARTIAL_PROVEN`; canonical target column `codebase_chunk_index.content_embedding_768` exists, but unique writer, per-row input/model/tokenizer/representation provenance, revision-qualified reads and projection readback are not proven. Historical `content_embedding` and `atlas_packets.embedding` remain unresolved surfaces. | Trace all writers/callers, select one canonical writer for `semantic_768`, bind input digest + model and tokenizer revisions + representation revision + vector digest to the exact chunk/source revision, and prove readback. Keep the other columns historical until migration/retirement has an owner and evidence. |
| `LATENT_FAMILY_PROVEN` | `PARTIAL_PROVEN`; checkpoint/artifact digests and latent derivation are cross-checked, but no per-row digest identifies the exact `semantic_768` input snapshot; lifecycle remains `CANDIDATE`. | Record the training cohort/input checksum and parameters/seed/output revision; compare held-out quality and obtain an explicit promotion decision before changing lifecycle state. A checkpoint file hash alone is insufficient. |
| `GRAPH_MANIFEST_SEALED` | PASS for admitted in-scope non-submodule repositories; the separate Neo4j consumer path is not thereby proven. | No change needed for this predicate. Do not infer Neo4j production consumption from the manifest PASS. |
| `ONTOLOGY_COHORT_NONEMPTY` | PASS. | No change needed for this predicate. |
| `ORDINAL_MAP_SEALED` | `PARTIAL_PROVEN`; exact canonical subset is 14,564/16,151; 1,587 missing; no orphan, duplicate ordinal, legacy identity, revision mismatch or foreign-repository rows in the current artifact. Prior exact gap classification: 1,586 admitted sources without a physical chunk and one duplicate canonical chunk identity. | Freeze the exact missing set; separate no-chunk coverage from the identity conflict; resolve only through the existing canonical chunk producer and lineage owner; regenerate the complete cohort and independently verify deterministic checksum/readback. Do not manufacture ordinals or deduplicate the conflicting identity. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | `NOT_PROVEN`; the existing representation registry holds representation/artifact metadata but no per-run projection binding; no ordinal-map checksum column or cross-projection receipt was found. | Define a receipt that binds admitted cohort checksum, ordinal-map checksum, representation/input revision, and each projection’s identity/checksum/readback. Reuse an existing owner if it can persist that receipt. Add a Drizzle migration only if the receipt needs durable relational storage and its schema/owner is settled. |
| `BITFROST_KEYS_DERIVABLE` | `NOT_PROVEN`; current audit observed 0 keys under the v1 namespace and 0 under the legacy prefix at its configured endpoint. Even keys present would prove presence, not derivability or grounded admission. | Derive cache identity from canonical packet/source/workspace and representation/context checksums; prove key-builder parity and an admitted write/readback. Keep Valkey disposable and non-authoritative. Do not make centroids/domain labels the identity. |
| `ACE_EVIDENCE_GROUNDED` | `NOT_PROVEN`; `ace_context_sources` is a legacy diagnostic with 0 rows and cannot establish V3 grounding. No admitted production producer plus grounded readback is proven. | Trace the production request route to the canonical admitted source resolver, compose `AcePacketV3`, bridge to `ContextManifest`, and verify each evidence ref against exact current source bytes/spans/symbols. The predicate must consume a receipt from that real path; do not retrofit the legacy table as a competing grounding owner. |

## Why adding more ACE fields will not clear the gate

`packages/parent-atlas/src/core/ace-packet-v3.ts` already defines `packet_key`, `source_ref`,
`workspace_revision`, `source_revision`, packet/producer revisions, representation and feature
revisions, symbol/tree-node references, summary/embedding digests, vector references, and revisioned
centroid references. It also explicitly keeps request-local `ContextManifest`, `PromptPlan`, token
budget, and retrieval/repair material outside the durable packet.

Accordingly:

- `file_path` is a locator/display value, not a replacement for `source_ref + source_revision`.
- Summary text needs its input digest/model revision and grounded source refs; a summary field alone is not evidence.
- Token allocation belongs to request-scoped `ContextManifest`/`PromptPlan`, not durable packet identity.
- Feature remapping belongs to explicit consumer layout revisions, not a universal feature ordinal.
- Centroid references are accelerators/projections; they cannot create canonical identity or another retrieval vote.
- Domain classification is routing evidence; QLoRA changes model weights and belongs behind a separate revisioned training/evaluation/promotion lane.
- HypergraphRAG, Neo4j, Qdrant, NetworkX/cuGraph, NLP and Valkey are downstream consumers/executors. They cannot repair missing canonical chunks, source revisions, or producer ownership.

The smallest accurate summary is: **the ACE data contract is largely present; its production producer and
evidence-source/readback chain are absent. The projection gate is also independently blocked by
symbol extraction, ordinal/chunk coverage, semantic ownership, latent input provenance, and aligned
projection receipts.**

## Fix order

1. **Keep the admission guard.** Treat its failure as a protection, not a failure to suppress.
2. **Close source/ordinal inputs:** finish exact-revision symbol inventory/extraction; freeze the
   1,587 ordinal rejects; fix chunk coverage and the one identity contradiction through existing
   owners; regenerate only after the admitted cohort is exact.
3. **Close semantic and latent provenance:** unique semantic writer and per-row input/revision
   receipts first; then latent training-input lineage and explicit model promotion.
4. **Bind projections:** produce checksummed identity/readback receipts for Qdrant/GPU/graph/other
   projections from the same sealed input and ordinal snapshot.
5. **Wire ACE production:** canonical resolver → V3 composer → ContextManifest → grounded
   production-owned receipt/readback. Use the same canonical admission authority as ordinals;
   `ace_context_sources` remains a legacy diagnostic, not the V3 grounding owner.
6. **Prove BitFrost last:** deterministic identity derivation, then bounded write/readback. Cache
   presence/TTL is not proof of source correctness.
7. Rerun the current read-only 11-predicate audit. Run `graphify:daily` apply only when it reports
   `SAFE_TO_PROJECT`.

No admission bypass, broad reindex, ordinal regeneration, Qdrant mutation, Redis/Valkey write, or
model call was performed during this audit.

## External implementation guidance checked

- Qdrant point IDs identify Qdrant points; payload is separate JSON metadata. Continue treating
  point IDs as projection locators, not packet/source authority: [Qdrant points](https://qdrant.tech/documentation/concepts/points/),
  [Qdrant payload](https://qdrant.tech/documentation/concepts/payload/).
- If durable projection-binding storage is genuinely needed, Drizzle’s supported code-first path is
  schema change → generated SQL migration → migrate; do not apply live schema by ad hoc `push`:
  [Drizzle generate](https://orm.drizzle.team/docs/drizzle-kit-generate),
  [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate). This is a conditional future
  step, not a justification to create a parallel representation registry today.
- PostgreSQL 18 constraints support unique and foreign-key integrity; foreign keys should point to
  a primary/unique canonical identity, and referencing-side indexes should be chosen from actual
  access patterns: [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).
- HyperLogLog estimates cardinality; it cannot supply exact membership, identity resolution, or
  duplicate adjudication: [Redis HyperLogLog](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/).

## Validation

- Command: `node scripts/atlas/audit-canonical-projection-fabric.mjs` with report output redirected
  to `docs/reports/atlas-canonical-projection-fabric-deep-audit-20260929/`.
- Observed: read-only transaction rolled back; `NOT_SAFE_TO_PROJECT`, 7/11 predicates below PASS.
- ACE schema source: `packages/parent-atlas/src/core/ace-packet-v3.ts`.
- Guard source: `scripts/startup/run-graphify-daily-startup.mjs`.
- Follow-up commands and receipts: see the dated follow-up section above; the next safe step is to
  freeze the exact 1,587 rejected packet/source identities from the current materializer and classify
  them through existing chunk/lineage owners. Keep the 60-second timeout. The query rewrite now
  completes a full dry-run; do not promote its partial local artifact or regenerate the canonical
  artifact until the admitted cohort is fully lineage-qualified.

## 2026-09-29 follow-up — extractor canary readback and chunk-owner boundary

Read-only reconciliation used the saved apply receipt
`docs/reports/graphify-symbol-extractor-v1-1790709740924.json` as its exact 141-file target set.
All 141 have a matching `graphify_files` row at the receipt's `file_id`, `source_ref`, and
`source_revision`, and all 141 now read back as `PROCESSED`; none remain `UNPROCESSED` or are
missing/revision-changed. The receipt reports 1,174 `totalSymbolsInserted` and zero failed files,
but unique-row readback is 1,112 `graphify_symbols` plus 60 `atlas_ast_nodes` = 1,172. The two-row
difference comes from repeated qualified symbol identities in one source file; details and the
counter correction for future receipts are recorded below. For that exact set, 60 persisted
`atlas_ast_nodes` rows have non-null `parser_version`; observed
values are `json-symbol-extractor-v1` and `markdown-symbol-extractor-v1`. The live schema confirms
`atlas_ast_nodes.parser_version` is `NOT NULL`. The 141 legacy `graphify_files.parser_version`
values are not the AST writer's provenance authority.

No saved report or receipt for the separately described `parser_version NOT NULL` failure was found
among the extractor reports. Its exact candidate IDs therefore remain unreconciled; do not infer
that a full attempted batch rolled back or retry an unidentified set. The existing extractor already
supplies extractor-owned versions for JSON/Markdown AST observations. The shared AST writer was
hardened to reject missing/blank `parserVersion` before issuing SQL rather than forwarding NULL to
PostgreSQL. This is a boundary guard, not a substitute for identifying any unreceipted prior writes.

The exact frozen ordinal rejection diagnostic has 1,587 rows, all with exactly one admitted
`atlas_workspace_source_bindings` match at the admitted workspace/source revisions. Split by
physical-chunk state, the 1,586 no-chunk sources have 1,570 exact
`graphify_files.code_source_revision` matches and 16 mismatches. The separate source with 52
physical rows / 26 duplicated chunk IDs has an exact Graphify revision, making the aggregate across
all 1,587 targets 1,571 exact and 16 mismatched. This reconciles, rather than supersedes, the
previously reported 1,570/16 no-chunk split. Of the 16 mismatches, 15 packet revisions also match
current on-disk bytes (stale Graphify observation candidates), while `.vscode/tasks.json` is the one
case whose current bytes differ from the packet revision. Some sources have multiple historical
Graphify rows at different revisions; counts here are distinct target source/revision tuples, not
raw rows. This does not authorize chunk writes or Graphify refresh.

Existing chunk-write candidates do not satisfy the bounded, chunk-only repair contract:
`scripts/atlas/index-full-repo-for-search.mjs` writes `codebase_chunk_index`, embeds, upserts Qdrant,
and warms Redis centroids; the SvelteKit `index-stream` route mirrors Qdrant points into PostgreSQL
and also performs Qdrant summary-vector work. `scripts/atlas/add-source-ref-chunks.mjs` is schema/
backfill support, not a chunk materializer. No bounded admitted-manifest chunk-only writer was
identified in this trace. Therefore the 1,571 exact-Graphify sources remain candidates only; no
chunk, lineage, ordinal, Qdrant, Redis/Valkey, or model writes were performed. The 1,570 exact-
Graphify no-chunk sources remain candidates only; the 16 revision mismatches and the duplicate-
chunk source remain separately classified.

Validation after the parser boundary guard: `node --test scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs`
passed 5/5. Continue with an exact read-only classification of the 16 Graphify mismatches and
identification of a suitable existing source/chunk owner before any retry or chunk materialization.

## 2026-09-29 follow-up — exact-revision extractor scan and live dependency interruption

A read-only census over the current 16,657 `UNPROCESSED` rows with an exact admitted source binding
found 15,958 source files whose current bytes match the bound `source_revision`, and 699 whose
bytes do not. No writes were performed. The extractor's ordered `--limit 500` dry-run examined only
the first 500 candidates: 254 were unsupported and the 246 supported candidates all failed the
current-byte revision check. It therefore yielded zero `WOULD_EXTRACT`; this is a candidate-window
result, not evidence that the remaining exact-byte cohort is unavailable. A follow-up exact-ref
dry-run returned zero candidates, then subsequent read-only PostgreSQL calls ended in connection
termination / timeout. Do not retry or apply until the live database connection is stable and the
exact-ref selection is reconciled against the current DB state.

The extractor's JSON/Markdown AST write now always records the version owned by the actual
`json-symbol-extractor` or `markdown-symbol-extractor`; it no longer inherits a legacy
`graphify_files.parser_version` merely because that stale field is non-null. The AST writer still
rejects blank provenance before SQL. Focused writer tests pass 5/5. The 5434 TCP listener belongs to
`com.docker.backend.exe`, but the PostgreSQL protocol probe timed out and Docker Engine container
listing returned HTTP 500. Treat this as a live database/runtime availability block, not a
parser-test failure or an empty-data result. No symbol, AST, semantic-vector, chunk, lineage,
projection, cache, or model writes were performed in this follow-up.

## 2026-09-29 follow-up — remove Qdrant-to-PostgreSQL semantic reverse mirror

Source inspection confirmed that the live SvelteKit `index-stream` route scrolled Qdrant's named
`content` vector and inserted it into `codebase_chunk_index.content_embedding_768`. That is a
projection-to-canonical-store reverse write and contradicts the declared PostgreSQL semantic owner.
The existing route was narrowed: its PostgreSQL mirror continues to write chunk metadata and its
auxiliary signature/summary vectors, but no longer accepts, inserts, or updates
`content_embedding_768` from Qdrant. The SQL INSERT column/value arity is covered by a regression
test. This removes one competing writer path; it does **not** select/prove the unique semantic owner
or validate already-populated vectors, so `SEMANTIC_OWNER_PROVEN` remains open pending a refreshed
live writer census and revision-qualified readback.

The broad `atlas:index:full-repo` script was another unqualified PostgreSQL vector writer: its
filesystem scan cannot establish the admitted workspace/source binding, even though it can emit a
Qdrant vector. Its existing PostgreSQL owner now writes chunk metadata without
`content_embedding_768`; embeddings stay in Qdrant, and explicit apply was not run. The static
writer report drops that script and `index-stream` from canonical semantic writers but still reports
`OWNER_NOT_PROVEN` because other historical surfaces remain and a guarded 15-row backfill does not
prove the general owner.

The live admission evaluator also now treats `ace_context_sources` only as a legacy row-count
diagnostic and always returns `NOT_PROVEN` until the canonical retrieval → AcePacketV3 →
ContextManifest production path supplies its own grounding evidence. This prevents non-empty legacy
rows from being misread as partial V3 proof. Regression coverage passes; a fresh read-only audit
attempt failed at PG connection setup with `Connection terminated unexpectedly`. The saved 20:05Z
fabric receipt therefore remains the last live denominator/status evidence, not a post-patch result.

Final validation for this follow-up: 10/10 focused AST/semantic-boundary tests pass; Node syntax
checks, scoped `git diff --check`, and strict OpenSpec validation pass. Full frontend check reports
0 errors and 291 warnings across 100 files. No live store, cache, projection, or model writes/calls.
The repository-wide diff check also sees pre-existing trailing whitespace in generated
`simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; scoped checks pass and that
artifact was not changed.

Validation: focused AST-writer and semantic-mirror tests pass 8/8; the full frontend `npm run check`
completed with 0 errors and 291 existing warnings. No route request, PostgreSQL mutation, Qdrant
mutation, Valkey/cache write, embedding call, or model call was made. The latest saved fabric audit
is still the 20:05 UTC receipt; PostgreSQL is healthy through `docker exec` but host-side Node
connections to the published port are reset, so the audit was not refreshed after this source-only
change.

## 2026-09-29 follow-up — reconcile symbol canary readback

Read-only reconciliation of `graphify-symbol-extractor-v1-1790709740924.json` confirms its 141
eligible file targets are all still `PROCESSED`; all 141 retain the exact receipt
`code_source_revision`, match the admitted `atlas_workspace_source_bindings` row at workspace
revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, and their
current on-disk SHA-256 equals the receipt source revision. No target was retried.

The receipt's `totalSymbolsInserted=1174` was not an accurate count of unique persisted rows.
Readback finds 1,112 `graphify_symbols` rows and 60 exact-revision `atlas_ast_nodes` rows (1,172
total). The single file with a two-row difference is
`scripts/atlas/ingester/tasker-gemma4-writer.mjs`: the existing extractor deterministically emits
13 observations, but two repeated qualified identities (`main.scanForText` and `main.pickTitle`)
collapse under the existing `(file_id, stable_symbol_key)` uniqueness contract to 11 symbol rows.
This is an accounting/identity-deduplication difference, not evidence of an unprocessed file or
revision mismatch. The old receipt remains immutable and is classified as observations/affected
rows, not unique inserts.

For future runs, the existing extractor now uses `ON CONFLICT DO NOTHING`, retrieves the existing
symbol ID when a stable key is already present (so parent links still resolve), and increments
`totalSymbolsInserted` only when PostgreSQL returned a newly inserted row. The existing AST writer
already counts actual inserted AST rows. Explicit extractor-owned AST parser versions are present
for JSON and Markdown; the canary readback contains 12 JSON and 48 Markdown AST rows with those
versions. No canary apply was rerun.

Subsequent dry runs are separate unresolved work: the 100-candidate scan found 8 source-revision
mismatches; the 500-candidate scan found 246. Both scanned only `UNPROCESSED` Graphify rows and
have zero file-ID overlap with the 141 reconciled files, which are already `PROCESSED`. These
mismatches remain fail-closed; they do not authorize replacing source revisions with current disk
hashes or broadening the extractor cohort.

Validation after the counter correction: `node --check` on the extractor, targeted TypeScript
`--noEmit` compilation, `ts-ast-extractor.test.mjs` (4/4), and scoped `git diff --check` pass. The
last live fabric audit remains the 20:05Z receipt (4/11 PASS); the post-change live audit has not
been refreshed because the host-side PostgreSQL connection resets. No database, lineage, projection,
Qdrant, Redis/Valkey, or model writes/calls were made in this reconciliation.

## 2026-09-29 follow-up — host audit connection failure root cause

The full read-only audit still cannot connect from Windows to the published PostgreSQL port. The
configured endpoint is `127.0.0.1:5434`; Docker reports `legal-ai-postgres` as published
`5432/tcp -> 0.0.0.0:5434`. PostgreSQL is healthy inside the container and accepts a TCP `psql`
query on `127.0.0.1:5432`. However, Windows `psql` and the Node audit both receive
`server closed the connection unexpectedly` on host port 5434.

The Docker Desktop monitor log gives the concrete failure: at `2026-09-29T21:17:59.930Z`, its
port-forwarder attempted `0.0.0.0:5434 -> 172.18.0.10:5432` and got connection refused. The current
container inspection reports `172.18.0.21`, so the published-port forwarding target is stale. A
direct host TCP probe to the current container IP times out, so it is not a safe audit workaround.
This points to Docker Desktop's Windows forwarding state, not PostgreSQL query logic or a bad
password; no database authentication/configuration change was made.

Recheck on the next continuation found that Windows now completes a bare TCP connect to `127.0.0.1:5434`,
but the PostgreSQL protocol still resets immediately with `Connection terminated unexpectedly` in
both the full Node audit and a 2.5-second bounded `pg` query. Thus TCP-listener reachability alone is
not a recovered database connection and does not clear this blocker. The stale forwarder log still
points at `.10` while the current container is `.21`.

The local Docker Desktop executable reports version `4.50.0.209931` (Docker Engine/CLI `28.5.1`).
Docker's official release notes show current `4.93.0` and record that `4.92.0` fixed published ports
remaining unreachable for a container after the host port was momentarily busy. That is a relevant
candidate because this failure is in Docker Desktop's published-port forwarding layer, but it is not
yet proven to be this exact stale-container-IP defect. No Docker Desktop update or restart was run.

Repairing the stale forwarder requires a Docker/PostgreSQL runtime restart or equivalent networking
refresh, which could interrupt active services. That restart was not authorized or performed.
Checked the already-running LangGraph, Bifrost, and Go Retrieval containers as a non-disruptive
alternative: none has the repository mounted with a Node/PostgreSQL client available to run this
audit in-place. No alternate container execution path was found.
Until the operator refreshes that mapping, the 20:05Z saved admission report remains the latest full
predicate evidence; container-local read-only observations do not substitute for a regenerated
11-predicate audit. No database, cache, projection, or model writes occurred.

## 2026-09-29 follow-up — ACE production caller trace

Static caller tracing confirms the production gap is wiring, not missing `AcePacketV3` fields. The
live `/api/ace/stream` route still launches `scripts/ace/build-packet.mjs`; that legacy builder can
emit the degraded `doc:local_cache` fallback and produces the older `sourceRefs`/`rankedCards`
packet. The route then sends that object to synthesis and can persist it through its separately
admitted cache path. No request was invoked during this audit.

`createSearchRuntimeAceProductionSourceAdapterV1` has no production caller. Its injected-owner
interface and resolver tests establish a bounded composition contract only. The resolver validates
an already-supplied candidate set, ordinal map, and feature rows; it does not fetch or prove the
canonical admitted source set. `resolveCanonicalPacketKey` and `resolvePacketKeyResolutionV2` resolve
packet storage keys/aliases, but neither binds a selected retrieval result to exact source and
workspace revisions. `buildAcePacketV3` likewise has no application route caller. Thus the needed
owner is an integration of existing retrieval plus canonical admission/source resolution—not a new
packet field, alias resolver, or `ace_context_sources` migration.

The separate `/api/tools/search` route is an intent/tool-routing packet path, not a substitute: its
current caller passes empty `selectedEvidenceIds`, `sourceRefs`, and `evidenceIds` to
`buildAceRoutingPacket`. `searchWithAceManifest` is an opt-in read-only SearchRuntime method, but no
production route calls it and its caller-supplied revision/feature inputs are not themselves an
admitted-source fetcher.

The live `/api/search/hyperrag` route is another synthesis path: it calls `SearchRuntime.search`,
then passes up to five returned packet refs and summaries to `bifrostChat`. It does not call
`searchWithAceManifest`, `buildAcePacketV3`, or the ContextManifest bridge. Its workspace revision
is accepted from the request body rather than resolved from the canonical admission owner. This is
an actual retrieval-to-model path, but not proof of V3 grounding; keep its synthesis identity
unqualified until the canonical owner/manifest path is wired. No route was invoked in this audit.

The V3 production trace remains open until a live request path calls the existing canonical owner,
rejects candidates lacking exact admitted packet/source/workspace revision evidence, builds V3,
bridges to ContextManifest, and emits independently checkable grounding/readback evidence. The audit
predicate should consume that production receipt. The legacy `ace_context_sources` table remains
diagnostic only and cannot satisfy the predicate by row count or by adding competing fields.

### QAS/ContextManifest seam review

The existing `createAtlasSearchAdapter().searchWithAceManifest()` is a useful composition seam, but
it is intentionally not a source authority. `AtlasSearchQasOptions` requires caller-supplied
`workspaceRevision`, `representationRevision`, and feature `sources`; ACE options additionally
require candidate snapshot/policy/playbook revisions, lane masks, and producer revision. The QAS
join maps features by `packetKey` and preserves absent features for rejection, but its source
callbacks do not resolve admitted packet/source rows. The async variant also accepts a caller-supplied
`sourceRevisions` record; labeling that record revisioned does not independently attest it.

The `SearchRuntimeAceResolverV1` is stricter about structure, but it consumes a complete supplied
ordinal map plus equally sized candidate and feature-row sets. The resolver checks packet/source/workspace
identity consistency and rejects synthetic revisions; it does not select the admitted workspace
cohort or prove that its inputs came from PostgreSQL's canonical admission owner. The surrounding
`produceAceFeatureSnapshotV1` and packet-to-manifest bridge explicitly return
`canonicalAuthority: false` and `writesPerformed: false`. They are validation/composition stages, not
the missing live owner.

Therefore do not wire `/api/search/hyperrag` directly to this seam by copying its request-supplied
workspace revision or optional retrieval metadata into the required inputs. That would make the code
call the V3 APIs without proving the intended boundary. The blocker is a production read owner that
can take the actual retrieval candidate keys and return exact admitted `packet_key`, `source_ref`,
`source_revision`, and canonical `workspace_revision` bindings plus their existing ordinal/feature
evidence. Once present, the route can compose through the existing resolver → feature snapshot →
AcePacketV3 → ContextManifest bridge, rejecting every candidate the owner cannot bind. No new packet
field, feature source, table, or cache contract is indicated by this inspection.

Review outcome: COMPOSITION SEAM PRESENT; CANONICAL CANDIDATE SOURCE OWNER NOT FOUND;
PRODUCTION WIRING NOT SAFE TO CLAIM. No files beyond this report and the OpenSpec ledger were
changed; no route was invoked and no datastore/model writes occurred.

## Remediation guidance checked against primary documentation

The safe fixes are evidence/owner work, not another packet-field expansion:

| Predicate | Actual missing proof | Correct next action | Not a fix |
|---|---|---|---|
| `SYMBOLS_RESOLVED` | Current admitted source coverage: only 3,764/21,584 supported refs processed in the saved census; 16,657 unprocessed, 1,159 without exact Graphify revision rows, 4 parse failures. The 141-file canary readback is exact but does not cover the cohort. | Reconcile the unreceipted parser-failure target set; then continue bounded exact-revision extraction using producer-owned parser versions and per-file readback. | Add more ACE packet fields or count raw symbol rows as file coverage. |
| `SEMANTIC_OWNER_PROVEN` | `content_embedding_768` exists, but a unique canonical writer, per-row source/model/tokenizer/representation binding, and independent readback do not. | Finish a single-writer boundary and prove row-level input/output digests and revisions on a bounded current cohort; keep projections downstream. | Treat Qdrant presence, model health, vector dimensionality, or a populated column as ownership proof. |
| `LATENT_FAMILY_PROVEN` | Checkpoint/artifact digest and transform chain exist; source semantic input snapshot binding and promotion receipt do not. | Bind the training input corpus checksum and representation revision to the checkpoint; evaluate and explicitly promote or keep `CANDIDATE`. | Add latent dimensions/feature remapping to AcePacketV3. |
| `ORDINAL_MAP_SEALED` | 14,564/16,151 exact rows; 1,586 sources lack physical chunks and one has a duplicate canonical chunk ID. | Freeze the exact gap; use only the existing eligible chunk/lineage owners; quarantine the duplicate; regenerate and independently verify the full ordinal map. | Invent ordinals, relax lineage, or run the broad indexer with unrelated Qdrant/Valkey fanout. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | No receipt binds the same admitted cohort, ordinal-map checksum, input checksum, and output projection checksums. | Extend/use the existing projection receipt owner to seal those values after prerequisite inputs are sealed. | Create a parallel registry or equate healthy projection indexes with parity. |
| `BITFROST_KEYS_DERIVABLE` | Key fixtures exist, but no production admitted-key producer plus identity-bound write/readback exists; key presence/count is not derivability. | Derive key bytes from canonical packet identity and revisions; only after ACE admission, perform separately authorized bounded write/readback. | HLL counts, Redis key counts, centroid keys, TTL, or model KV residency. |
| `ACE_EVIDENCE_GROUNDED` | No live retrieval → canonical admitted resolver → AcePacketV3 → ContextManifest receipt/readback exists. | Add the canonical candidate-source read owner, then compose through existing V3 APIs and make the audit consume its receipt. | Add packet fields, retrofit `ace_context_sources`, or pass request-supplied revision metadata through as authority. |

Primary technical references support the method, not app-specific proof: PostgreSQL recommends
fresh planner statistics and measured `EXPLAIN` plan comparison when diagnosing index use; the
already measured lateral-aggregate rewrite completed under the existing timeout, so no speculative
index or schema migration is indicated. [PostgreSQL index-usage guidance](https://www.postgresql.org/docs/current/indexes-examine.html),
[EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html). pgvector supports both exact and
approximate search and explicitly distinguishes the speed/recall tradeoff; neither index type proves
source/model lineage. [pgvector documentation](https://github.com/pgvector/pgvector).

For any future schema change, follow this repository's Drizzle migration owner: generate a reviewed
SQL migration and apply it through `migrate`, rather than using `push`. [Drizzle migration guide](https://orm.drizzle.team/docs/migrations),
[`drizzle-kit migrate`](https://orm.drizzle.team/docs/drizzle-kit-migrate). Valkey HyperLogLog is an
approximate cardinality estimator (documented standard error under 1%); it can support an optional
breadth/telemetry signal, never exact admitted-source coverage or packet authority. [Valkey HyperLogLog](https://valkey.io/topics/hyperloglogs/).

The “worked before” distinction is verified in the existing admission wrapper's committed source:
it was introduced specifically because the audit historically exited zero even when the report said
`NOT_SAFE_TO_PROJECT`; the wrapper now throws unless the report says `SAFE_TO_PROJECT`. The daily
pipeline could therefore have applied projections before this enforcement existed. Its current
failure is the intended safety behavior, not evidence that the gate should be bypassed. The saved
receipt still shows 4/11 predicates PASS; it predates source-only edits and is not a fresh live audit.

### Audit PASS-reachability defect

Static branch inspection found a second-order gate blocker. Two non-PASS predicates have a reachable
success branch once the evidence is complete: `SYMBOLS_RESOLVED` (full supported-source extraction
coverage plus clean matching nomination receipt) and `ORDINAL_MAP_SEALED` (the full exact-cohort
identity/revision/checksum conjunction). Five others cannot currently return `PASS` in source, even
if the underlying evidence later becomes available:

- `SEMANTIC_OWNER_PROVEN` returns only `PARTIAL_PROVEN` or `NOT_PROVEN` from column presence.
- `LATENT_FAMILY_PROVEN` returns only `PARTIAL_PROVEN` or `NOT_PROVEN` from registry presence/digests.
- `PROJECTIONS_CHECKSUM_ALIGNED` is hardcoded to `NOT_PROVEN`.
- `BITFROST_KEYS_DERIVABLE` returns only `PARTIAL_PROVEN` or `NOT_PROVEN` from namespace key counts.
- `ACE_EVIDENCE_GROUNDED` is hardcoded to `NOT_PROVEN` pending the production receipt.

The first three are not solved by making them optimistic: they need a defined handoff from their
existing owner evidence into the evaluator. For BitFrost and ACE, a live owner/readback is also not
yet present, but after it is built the evaluator still needs a branch that can verify its receipt.
This makes `SAFE_TO_PROJECT` unreachable in the current evaluator regardless of closing the 1,587
ordinal gap. Before treating future data changes as gate completion, revise these existing predicate
branches to consume owner-produced, current-revision evidence and add tests demonstrating both
rejection and a valid PASS fixture. Do not add a generic registry/table or declare PASS from counts.
The saved live report's 4/11 count is accurate for its run; its code review reveals this additional
reachability blocker.

No application request, cache write, model call, database mutation, or projection write was made.

### Post-apply live refresh (2026-09-30T00:26Z)

The canonical audit was rerun read-only after the bounded symbol-extraction canary. Fresh receipt:
[`live-refresh/atlas-canonical-projection-fabric-audit-2026-09-30.json`](live-refresh/atlas-canonical-projection-fabric-audit-2026-09-30.json).
The verdict remains `NOT_SAFE_TO_PROJECT`, with 4/11 predicates PASS. `IDENTITY_ALIGNED`,
`REVISION_QUALIFIED`, `GRAPH_MANIFEST_SEALED`, and `ONTOLOGY_COHORT_NONEMPTY` pass. The canary
changed only the symbol extraction census; the other six below-PASS predicates remain unresolved,
and the symbol predicate itself remains partial.

The admitted source-binding owner was checked read-only for execution
`74d50c86-8194-45ea-8c3d-61aab737ef83`: 24,456 execution-root members, 24,456 existing exact
workspace-source bindings, zero missing bindings, and zero candidate inserts. The existing
extractor's admitted-cohort selector previously applied SQL `LIMIT` before supported-file
filtering, so a bounded plan could be consumed by stale/off-snapshot rows. Its selector now filters
the admitted cohort by supported source kind, checks on-disk bytes against the exact admitted
`source_revision`, skips stale or unreadable files, and only then applies the requested limit. It
does not relax revision authority.

The corrected dry-run selected five exact-current-byte files after examining 292 candidates (287
revision mismatches; zero missing files or read errors). The existing per-file guarded extractor
was applied only to those five files: 43 structural observations inserted, five files processed,
zero failed. Receipt: `docs/reports/graphify-symbol-extractor-v1-1790727992920.json`. A fresh
read-only audit then confirmed `SYMBOLS_RESOLVED` moved from 3,764 to 3,769 processed, while
unprocessed moved from 16,657 to 16,652. This is bounded progress, not predicate closure; no packet,
embedding, cache, Qdrant, or projection writes occurred.

YaRN belongs on a separate runtime-execution track. Qwen's model card documents the 262,144-token
native window and YaRN extension guidance; llama.cpp exposes rope-scaling options. Neither changes
canonical identity, evidence lineage, ACE composition, or BitFrost admission, so it must not be used
to explain or close a projection-admission predicate. Any runtime claim still requires a receipt
for the exact loaded GGUF, server arguments, accepted token count, and long-context quality tests.
[Qwen3.5-9B model card](https://huggingface.co/Qwen/Qwen3.5-9B),
[llama.cpp server options](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md?plain=1).

Validation after the selector correction: focused Node tests 8/8 PASS and strict OpenSpec validation
PASS. The repository-wide stable-script check still exits nonzero because of existing TypeScript
diagnostics elsewhere; no diagnostics named the changed extractor/helper. Do not report that broad
check as passing. Next work remains owner-specific evidence wiring for the five currently
PASS-unreachable predicates, plus exact-revision symbol and chunk/ordinal cohort closure.

### Second bounded symbol batch (2026-09-30T00:32Z)

A new dry-run again found five exact-current-byte files after the stale prefix was rejected (292
examined, 287 source-revision mismatches, zero missing/read errors). Applied those five through the
existing guarded writer: 30 structural observations inserted, zero failed. Receipt:
`docs/reports/graphify-symbol-extractor-v1-1790728303452.json`. The subsequent independent,
read-only audit is
[`live-refresh-after-symbol-canary-2/atlas-canonical-projection-fabric-audit-2026-09-30.json`](live-refresh-after-symbol-canary-2/atlas-canonical-projection-fabric-audit-2026-09-30.json):
`NOT_SAFE_TO_PROJECT`, 4/11 PASS; symbol extraction is 3,774/21,584 (16,647 unprocessed), and
ordinal coverage remains 14,564/16,151 (1,587 missing). This batch did not change ordinal or any
other predicate. Total for the two bounded batches in this continuation: 10 files, 73 structural
observations, zero reported file failures; no projection/cache/vector writes.

### Exact-cohort identity and blocker audit (2026-09-30)

The first identity-cohort revision still treated missing `qdrant_point_id` as an identity failure.
That conflates canonical identity with a rebuildable projection pointer, contrary to the repository
contract that Qdrant IDs are never packet identity. The evaluator now defines `IDENTITY_ALIGNED`
over exact admitted repo:root rows: nonempty/unique `packet_key` is the identity assertion; Qdrant
pointer completeness remains an explicit diagnostic. Latest read-only receipt:
[`live-identity-cohort-audit-v2/atlas-canonical-projection-fabric-audit-2026-09-30.json`](live-identity-cohort-audit-v2/atlas-canonical-projection-fabric-audit-2026-09-30.json).
It proves 16,151 exact-revision packet keys, zero missing keys, zero duplicates; identity is PASS.
It also reports 1,634 missing Qdrant projection IDs. A separate read-only join found 143 of these
with exact packet/source/revision lineage, physical chunk digest parity (packet revision prefix
normalized to the chunk's raw SHA-256), and exact source-ref match: 7 had one Qdrant target and 136
had multiple targets. The remainder had no such exact joined target. Do not backfill from a
multi-target source or infer a point from a path. This diagnostic is not canonical identity and
does not prove cross-projection checksum alignment.

The authoritative current blockers are therefore:

| Predicate | Current evidence | What is missing / correct owner action |
|---|---|---|
| `SYMBOLS_RESOLVED` | `PARTIAL_PROVEN`; 3,774/21,584 supported admitted refs processed; 16,647 unprocessed; 1,159 lack exact Graphify rows; 4 parse failures | Continue only exact-byte/source-revision extraction. Stale working-tree bytes require a new admitted snapshot through the existing snapshot owner; never rewrite an old revision to match current bytes. |
| `SEMANTIC_OWNER_PROVEN` | `PARTIAL_PROVEN`; canonical `content_embedding_768` exists, static writer audit says `OWNER_NOT_PROVEN` | Resolve one Postgres semantic writer, its exact input/source/representation binding, and independent readback. Historical vector columns and Qdrant mirrors are not alternate authorities. |
| `LATENT_FAMILY_PROVEN` | `PARTIAL_PROVEN`; checkpoint artifact is verified, registry lifecycle remains candidate | Missing row-level binding to the semantic input snapshot used for the latent output, plus an explicit promotion decision/receipt. Checkpoint digest alone is not training-input provenance. |
| `ORDINAL_MAP_SEALED` | `PARTIAL_PROVEN`; 14,564/16,151, 1,587 missing | Repair 1,586 absent physical chunks only through the established chunk owner and resolve the one canonical chunk-ID conflict through its identity owner; then regenerate and read back. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | `NOT_PROVEN`; evaluator hardcodes this verdict; no current full-cohort cross-projection binding receipt | Existing projection owners must emit/replay the same admitted input and ordinal checksum and prove destination readback. Do not invent `atlas_representation_records` or add a table solely to make this gate green. |
| `BITFROST_KEYS_DERIVABLE` | `NOT_PROVEN`; v1 key namespace count is zero; cache writer has no production caller/admitted key owner | Derive admitted packet keys from the canonical resolver, then wire the existing guarded writer and prove identity/checksum-bound readback. No key writes before ACE admission exists. |
| `ACE_EVIDENCE_GROUNDED` | `NOT_PROVEN`; ACE producer-trace receipt says live route is legacy-only, V3 builder/bridge are not production callers | Wire live retrieval to the canonical admitted packet/source resolver → existing AcePacketV3 builder → ContextManifest bridge; emit a production grounding/readback receipt. `ace_context_sources` is legacy diagnostic only. |

The latest verdict remains `NOT_SAFE_TO_PROJECT`, 4/11 PASS: identity, revision qualification,
Graphify manifest sealing, and nonempty ontology cohort pass. The stale `289/1000` missing-ID and
`45,567` table-wide unqualified-packet claims are not this gate's current cohort findings.

Why `graphify:daily` used to appear to work: the admission wrapper was added because the audit
historically emitted a nonzero-quality report but exited zero for `NOT_SAFE_TO_PROJECT`. The wrapper
now enforces `SAFE_TO_PROJECT` and stops the apply path otherwise. That is a corrected fail-closed
guard, not a regression in Graphify extraction. The current error is therefore “promotion denied by
incomplete evidence,” not “Graphify itself failed.”

No additional AcePacketV3 fields are indicated: the existing contract already carries packet/source
and workspace revisions, source digest/spans, summary/model provenance, feature/representation
revisions, and centroid references. `source_ref` is the durable locator; token budgets are
request-scoped in ContextManifest/PromptPlan. Valkey centroids, QLoRA, domain classification,
HyperGraphRAG/Neo4j/NetworkX, Qdrant fanout, and the NLP sidecar may add bounded downstream signals,
but none repairs these missing source-owner receipts. If an eventual owner demonstrably requires a
durable schema change, use a reviewed Drizzle-generated SQL migration and `migrate`, not `push`;
Drizzle documents this migration flow in its [migration guide](https://orm.drizzle.team/docs/migrations)
and [`migrate` reference](https://orm.drizzle.team/docs/drizzle-kit-migrate).

### Semantic and latent provenance follow-up (read-only, 2026-09-29)

The latent training cohort is now recoverable more precisely than the earlier “input snapshot
absent” wording implied. The saved v3 training receipt, v4 ordinal map, and FP32 matrix agree on
55,169 rows; the saved matrix SHA-256 is
`bd36c163938a661f9c0b3f68dd1a0eb7e576405268ebe9c2221df689697441b0`. A fresh read-only export
from PostgreSQL `codebase_chunk_index.content_embedding` reproduced the same ordered row-ID checksum
and matrix digest. All map IDs still match; 434 source refs that were NULL in the frozen map have
since been populated. This recovers the exact historical training vectors/cohort, but not
revision-qualified canonical provenance: the map lacks source/workspace revisions and the source
was the historical halfvec `content_embedding` column, not canonical `content_embedding_768`.
Read-only artifact revalidation (2026-09-30) confirms the frozen ordinal map has 55,169 unique IDs
with contiguous ordinals; its raw-file SHA-256 matches the snapshot manifest, the ordered-ID digest
matches the trainer receipt, and the 169,479,168-byte FP32 matrix SHA-256 matches both the snapshot
manifest and trainer receipt. The map has 2,789 null `sourceRef` entries; the trainer replaces each
with `__no_source_ref__:<id>` before source-grouped splitting. The receipt stores split checksums and
counts, but does not record the NumPy version or per-row split membership. Therefore input cohort
and matrix are now independently corroborated, while exact train/validation assignment is not yet
independently replayed. More importantly, the frozen input is historical `content_embedding`, not
the canonical `content_embedding_768` surface, and its `embeddinggemma:latest` producer label is a
mutable alias rather than an attested model/tokenizer digest. These findings strengthen historical
cohort evidence but do not close semantic lineage or promote the latent family; lifecycle remains
`CANDIDATE` pending its existing quality/promotion decision.

The live `content_embedding_768` census has 219,998 populated rows, but 0 have source_revision,
workspace_revision, representation_revision, or lineage_producer_revision populated. Only 759
have embedding_version; 219,422 are labeled `embeddinggemma:latest` and 576 carry the
`:eg-task-prefix-v1` suffix. The `metadata`, `output_meta`, and `summary_provenance` JSONB surfaces
also have zero source/workspace/representation/producer revisions, model/tokenizer revisions, input
digests, or vector digests across the populated vectors. `output_meta` is present on all rows but
empty in a deterministic sample. `content_hash` has not been shown to cover the exact text sent to
the embed endpoint. The guarded 15-row lineage backfill is a bounded
writer, not a unique general owner. The index-stream and full-repo paths do not write this vector
column. Thus `SEMANTIC_OWNER_PROVEN` remains PARTIAL_PROVEN, and no new embedding corpus was
generated. PostgreSQL checks ran inside read-only transactions; no database, projection, cache,
checkpoint, or model writes/calls occurred.

## Current correction — 2026-09-30T03:59:37Z

The no-write statement above describes the earlier semantic-writer investigation only. In a later
bounded symbol tranche, the existing Graphify extractor was explicitly applied to 90 exact admitted
source refs (three batches) after dry-run byte-digest checks. Independent read-only readback verified
all 90 at exact source revisions as `PROCESSED`, with 687 symbols inserted. No embedding, latent,
Qdrant, Redis/Valkey, projection, or ACE/BitFrost writes occurred.

Fresh `audit-canonical-projection-fabric.mjs` receipt:

- Overall `NOT_SAFE_TO_PROJECT`; **4/11 PASS**. Passing predicates remain `IDENTITY_ALIGNED`,
  `REVISION_QUALIFIED`, `GRAPH_MANIFEST_SEALED`, and `ONTOLOGY_COHORT_NONEMPTY`.
- `SYMBOLS_RESOLVED`: 5,098/21,584 processed (23.62%); 15,323 unprocessed; 1,159 lack an exact
  Graphify revision row; 4 are parse-failed. The 90-row apply is only an increment, not closure.
- `SEMANTIC_OWNER_PROVEN`: partial; the 768-D canonical column is populated, but the unique writer
  and per-row source/model/tokenizer/representation provenance/readback remain unproven.
- `LATENT_FAMILY_PROVEN`: historical checkpoint/input artifacts are checksum-verified, but the
  input was historical `content_embedding`, not canonical `content_embedding_768`; input lineage
  and promotion remain open (`CANDIDATE`).
- `ORDINAL_MAP_SEALED`: 14,564/16,151, with 1,587 missing (1,586 physical chunks absent, one
  duplicate canonical chunk identity).
- `PROJECTIONS_CHECKSUM_ALIGNED`, `BITFROST_KEYS_DERIVABLE`, and `ACE_EVIDENCE_GROUNDED` remain
  `NOT_PROVEN`.

This is the current live audit receipt, replacing older symbol totals in this report. The
`content_embedding` backfill remains a historical halfvec writer and was not retargeted: no Drizzle
migration is indicated because live PostgreSQL types match the Drizzle declarations; the remaining
semantic problem is writer ownership/provenance, not vector dimension schema drift.

### Symbol coverage update — 2026-09-30T04:03:34Z

One more bounded batch applied 25 exact source refs (136 symbols) through the existing Graphify
writer. Independent read-only readback verified all 25 as `PROCESSED` at exact admitted source
revisions. Current `SYMBOLS_RESOLVED` is 5,123/21,584 (23.74%), with 15,298 unprocessed, 1,159
without an exact Graphify row, and four parse failures. The live gate remains 4/11 PASS and
`NOT_SAFE_TO_PROJECT`; ordinal remains 14,564/16,151. Earlier sections' 5,098 symbol total refer
to the preceding audit, not this latest receipt.

### AE candidate storage contract — 2026-09-30

The candidate architecture is fixed at `semantic_768` → 512 → 256 → 128; `latent_256` is learned,
`latent_128` is the learned bottleneck, `latent_64` is a normalized prefix of `latent_128`, and
4D topology is a distinct projection from `latent_256`. The Qdrant planner now explicitly describes
a not-yet-created Qdrant 1.19.0 named-vector collection for 256/128/64 cosine vectors and full-point
upsert plus readback; a pure request builder emits the 1.19-compatible `PUT .../points?wait=true`
envelope with every named vector and full payload v3, including the canonical input representation,
dimension, and column. It rejects duplicate projection IDs and has no network client. The planner
rejects reuse of the legacy single-vector collection. The Postgres/Drizzle
map is already aligned (`content_embedding_768 vector(768)`, `latent_256 halfvec(256)`,
`latent_128 halfvec(128)`, `latent_64 vector(64)`), so no migration is required. This remains a
contract/plan only: training, Postgres derived-vector writes, Qdrant collection creation/upserts,
and promotion remain blocked on semantic writer/input provenance, checkpoint/input readback, and
stable projection-ID ownership. Focused AE tests passed 12/12; admission remains 4/11 PASS and
`NOT_SAFE_TO_PROJECT`.

### Why symbol extraction is at 24.02% — read-only diagnosis, 2026-09-30T04:55Z

The current ratio is 5,185 PROCESSED source refs / 21,584 supported admitted source refs.
It measures extraction completion, not symbol accuracy, embedding coverage, or the separate
16,151-packet ordinal cohort. The denominator contains 21,584 distinct refs with no duplicates;
the audit supports TS/JS variants, JSON/JSONC, Markdown, and text. Other languages are outside
this particular metric. Its exact Graphify join requires source_ref plus code_source_revision.

| Current classification | Source refs | Share of denominator |
| --- | ---: | ---: |
| PROCESSED | 5,185 | 24.02% |
| UNPROCESSED, current bytes match admitted source revision | 14,531 | 67.32% |
| UNPROCESSED, current bytes differ from admitted source revision | 705 | 3.27% |
| No exact Graphify source-revision row | 1,159 | 5.37% |
| PARSE_FAILED | 4 | 0.02% |

This was a live PostgreSQL REPEATABLE READ / READ ONLY census, followed by SHA-256 streaming
checks over all 16,395 unprocessed or missing-exact source refs, using four readers. The database
transaction was rolled back. The filesystem scan is an observation after the database snapshot,
not an atomic admission or authorization receipt; revision checks must run again before any apply.
No extraction apply, source edit, database, model, cache, or projection write occurred in this
diagnostic turn. Only this local report was updated.

The dominant cause is undrained work. The existing extractor defaults to dry-run and limit=50,
performs one bounded selection, and exits. Recent work applied hand-selected 12-25-file cohorts.
The last 62 sources increased coverage by only 0.287 percentage points. Selection orders by
source_ref; 4,659 exact Graphify refs under sveltekit-frontend/src are still UNPROCESSED, with
another 466 missing exact inventory rows. Other large waiting groups are sveltekit-frontend/docs
(4,550), scripts (1,979), tests (1,378), and memory (885). Code itself is also incomplete:
2,847 processed / 12,075 supported code refs, so the low percentage is not explained solely by
including documentation. The inspected production daily/startup chain does not invoke this
extractor and checks canonical projection admission before running its apply chain. Repeating
graphify:daily therefore does not establish that the symbol backlog will drain.

Alphabetically early generated GDS JSON snapshots recur in dry-run plans because they were excluded
from apply. They consume the bounded selection and can expand into tens of thousands of structural
observations. The selector correctly skips byte-mismatched sources, but it rescans earlier rejects
on subsequent invocations; it has no persistent work cursor or full-cohort execution loop. This is
a throughput/work-selection issue, not evidence of a 76% parser failure rate.

| Supported kind | PROCESSED | UNPROCESSED | Missing exact row | PARSE_FAILED |
| --- | ---: | ---: | ---: | ---: |
| TS/JS variants | 2,847 | 8,278 | 950 | 0 |
| Markdown | 2,065 | 5,678 | 169 | 0 |
| JSON/JSONC | 273 | 1,280 | 40 | 4 |

Of the byte-matched UNPROCESSED cohort, 7,661 are code, 5,606 Markdown, and 1,264 JSON/JSONC.
Byte matching is necessary but does not prove parser success or write/readback success. If all
14,531 eventually produce valid outcomes, coverage would reach 19,716/21,584 (91.35%); the other
1,868 cases would still require their own resolution.

The 1,159 missing-exact inventory cases split into 616 refs with no graphify_files row and 543
with inventory at another or null revision. Their current bytes separately classify as 925 exact
matches, 227 mismatches, and seven absent files. Existing inventory ownership must resolve those
cases; the extractor's inner join cannot select them. The 705 unprocessed byte mismatches require
the admitted bytes or an explicitly admitted newer revision, not a relaxed digest check.

The four recorded failures are JSON parsing errors in mcp_init.json, mcp_tools.json,
memory/manifests/sample.json, and packages/atlas-duckdb/src/redis-centroid-config.json. Their stored
errors report malformed property syntax or a missing comma/closing brace. Classify the exact admitted
content and declared JSON/JSONC format before choosing a source correction or parser change.

Recommended repair: freeze a checksummed plan of the byte-matched cohort, execute it through the
existing extractor in resumable bounded batches with per-file byte/revision revalidation and
independent readback, and handle inventory gaps, changed files, and parse failures separately.
Give generated artifacts explicit workload policy rather than silently removing them from the
admitted denominator. This diagnosis changes no producer, admission predicate, scheduler, or schema.

### Frozen structural baseline execution — 2026-09-30T16:28Z

The user authorized processing the exact 14,531 byte-matched backlog through the existing extractor.
All members were frozen, split into 59 fixed shards and visited; code/frontend source was prioritized
over generated JSON. The guarded structural writer ran, followed by a complete read-only sweep.
The fresh audit at `2026-09-30T16:24:42.629Z` shows **18,850/21,584 PROCESSED (87.33%)**, versus
5,185 (24.02%) before this work; overall remains **NOT_SAFE_TO_PROJECT, 4/11 PASS**.

Exact live manifest census: 13,665 PROCESSED (4,127 under frontend/src), 859 UNPROCESSED and seven
PARSE_FAILED. The stronger current-producer readback independently verifies **13,195/14,531**.
Unresolved: 589 identity conflicts (225 code / 364 Markdown), 297 generated JSON resource deferrals,
443 stored-observation mismatches (12 code / 431 JSON), and seven failed members. Of the resource
deferrals, 27 are already PROCESSED but remain unverified; PROCESSED flags alone are not proof.
The baseline seal remains false, with 34/59 fully readback-proven shards.

Existing producers were corrected for ambient-module ancestry, raw Unicode/CRLF spans and exact
JSON property/array locations. Oversized files defer before observation-location construction.
Five producer-bound manifests retain identical ordered membership; no source revisions were inferred.
The original broad worker stalled on generated JSON after 55 shard receipts and was stopped by its
verified PID only; per-file commits in the interrupted shard were reconciled by subsequent live
readback, not assumed rolled back. Old observations and receipts were preserved.

Global live remainder: 1,564 UNPROCESSED (859 manifest + 705 prior byte drift), 1,159 missing exact
Graphify revision rows and 11 PARSE_FAILED (four older + seven manifest). Two new failures are
strict-JSON/JSONC policy cases, one is a parser surrogate-location failure, and four concern invalid
escapes or non-JSON prefixes; do not label all seven malformed sources. No broad retry/reset was made.

Detailed execution, validation, exact errors and safe next steps:
`docs/reports/graphify-symbol-baseline-execution-20260930.md`. Machine gap ledger:
`docs/reports/graphify-symbol-baseline-report-1790785706923/gaps.json`. Final zero-write sweep:
`docs/reports/graphify-symbol-baseline-run-1790785686707.json`.

No model, embedding, latent/checkpoint, physical chunk, lineage, ordinal, Qdrant, Redis/Valkey,
Neo4j, ACE or BitFrost writes; no migration/DDL, service restart or disk cleanup. Forty-two focused
tests and standalone extractor typecheck passed. Kanban fencing, incremental scheduling and baseline
sealing remain open; this is manual resumable structural execution, not a new scheduler or authority.

Evidence owners: scripts/atlas/audit-canonical-projection-fabric.mjs (coverage query and verdict),
scripts/atlas/graphify-symbol-extractor-v1.mts (default flags, exact join, alphabetical selection,
per-file transactions), scripts/atlas/lib/graphify-symbol-candidate-selection-v1.mjs (bounded
byte-checked selection), scripts/startup/run-graphify-daily-startup.mjs and the frontend package
daily-chain alias (execution wiring), and the live census described above.

### Fresh live admission and ordinal-gap reconciliation — 2026-09-30T20:25Z

The canonical audit was rerun read-only into `.tmp/projection-audit-refresh-20260930/` so the
user-modified 2026-09-29 report was not overwritten. The run used PostgreSQL `127.0.0.1:5434`,
read-only/rollback semantics, plus Redis SCAN. Result: `NOT_SAFE_TO_PROJECT`, **4/11 PASS**.
`IDENTITY_ALIGNED` and `REVISION_QUALIFIED` pass against the exact admitted `repo:root` cohort of
16,151 packet keys/source revisions; the 61,718 table-wide packet count is historical context, not
the denominator. `GRAPH_MANIFEST_SEALED` and `ONTOLOGY_COHORT_NONEMPTY` also pass.

The remaining seven predicates are distinct producer/provenance gaps, not missing ACE packet fields:

| Predicate | Fresh result | Required owner-level proof |
| --- | --- | --- |
| `SYMBOLS_RESOLVED` | `PARTIAL_PROVEN`: 18,850/21,584 supported sources processed (87.33%); 1,564 unprocessed, 1,159 without exact Graphify revision rows, 11 parse failures. | Finish the existing frozen structural baseline reconciliation and exact-revision readback; do not treat a processed flag as sufficient. |
| `SEMANTIC_OWNER_PROVEN` | `PARTIAL_PROVEN`: canonical `content_embedding_768` exists, but unique writer and row-level source/model/tokenizer/representation lineage/readback are unresolved. | Trace existing writers and bind provenance/readback before any re-embedding. |
| `LATENT_FAMILY_PROVEN` | `PARTIAL_PROVEN`: checkpoint/output bindings exist; canonical semantic input cohort ledger is absent and lifecycle is `CANDIDATE`. | First seal semantic writer/input snapshot; then independently evaluate and promote the latent family. |
| `ORDINAL_MAP_SEALED` | `PARTIAL_PROVEN`: 14,564/16,151; 1,587 missing. | Resolve physical chunk coverage and the separate duplicate-identity conflict through current owners, then regenerate/read back. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | `NOT_PROVEN`: no current cross-projection receipt binds the admitted cohort, ordinal map, inputs, and readbacks. | Reuse a settled receipt owner; do not create a parallel registry/table just to satisfy admission. |
| `BITFROST_KEYS_DERIVABLE` | `NOT_PROVEN`: no proven admitted-key producer plus identity-bound live write/readback. | Prove production caller and derivation first; keep cache apply blocked until ACE admission/readback exists. |
| `ACE_EVIDENCE_GROUNDED` | `NOT_PROVEN`: no live retrieval → admitted resolver → `AcePacketV3` → `ContextManifest` receipt/readback. | Wire the existing V3 path into the production route and prove grounded readback; `ace_context_sources` remains diagnostic only. |

A separate read-only comparison of the frozen 1,587 missing packet keys against current source,
Graphify, and physical chunk records found one source per missing packet. All 1,587 source paths
still exist; 1,583 currently match the admitted bytes and four have byte drift. Graphify rows exist
for all 1,587: 1,571 have exact `code_source_revision` (1,044 processed, 523 unprocessed, four
parse-failed); 16 have only stale/null revision evidence. Exact source-ref/path matching finds 52
physical chunk rows concentrated on one source, with 26 duplicated chunk IDs; the other 1,586
sources have no exact physical-chunk match. This is a diagnostic classification, not authority to
repair: the duplicate chunk IDs must be quarantined for the identity owner, not deduplicated by the
ordinal materializer. Revalidate all byte/revision states against the frozen admitted manifest
before any bounded apply.

The immediate safe implementation sequence is therefore: (1) reconcile the exact ordinal-gap
manifest and identify a bounded existing physical-chunk/lineage owner that can run without embedding,
Qdrant, or cache fanout; (2) if no such owner exists, add a bounded mode to the existing canonical
chunk owner rather than invoking the broad repository indexer; (3) repair only revision-current,
eligible sources and prove lineage readback; (4) resolve the duplicate-ID source independently;
(5) regenerate and seal the ordinal map; then proceed through projection receipt, BitFrost, and ACE
production grounding. In parallel, complete the already-frozen Graphify symbol baseline through its
existing extractor/readback owner. Do not run `graphify:daily` as a backlog worker: its projection
admission gate is expected to fail closed while these predicates remain below PASS.

The V3 packet contract already carries durable packet/source/revision and evidence provenance. Do
not add `file_path`, another identity field, or a new grounding table to compensate for absent
production wiring. Request token budgeting remains in `ContextManifest`/`PromptPlan`. No database,
chunk, lineage, ordinal, Qdrant, cache, model, or projection writes were performed in this refresh.

### Producer-path review and stale-handoff correction — 2026-09-30 continuation

A second fresh read-only run at `2026-09-30T20:35:57Z` reconfirmed the same 4/11 PASS state and seven
below-PASS predicates. Its artifact is
`.tmp/projection-audit-refresh-20260930-continuation/atlas-canonical-projection-fabric-audit-2026-09-30.json`.
The supplied handoff text contains stale claims that must not drive repairs: the old
`289/1,000` Qdrant-locator sample is not the current `IDENTITY_ALIGNED` gate, and the old
`16,151/61,718` revision comparison is not the admitted-cohort denominator. Current exact-cohort
proof is 16,151/16,151 for both identity and revision qualification. Missing Qdrant point IDs are
projection diagnostics, not canonical identity failures.

The requested packet additions are not the missing cause:

| Proposed field/system | Current contract boundary | Effect on the admission blockers |
| --- | --- | --- |
| `source_revision` | Already durable in `AcePacketV3` and source/packet owners; must be supplied by the exact admitted resolver. | A field without the production resolver/readback does not establish lineage. |
| `file_path` | A locator/annotation, not canonical source identity; canonical `source_ref` and revisions remain authoritative. | Cannot create missing physical chunks or repair duplicate canonical chunk IDs. |
| `summary` | Existing packet summary carries input/model provenance. | Does not prove which canonical semantic rows trained the latent checkpoint. |
| token budget | Request-scoped `ContextManifest`/`PromptPlan` policy. | Does not belong in durable packet identity and closes none of the seven gates. |
| feature remapping / centroids / QLoRA / domain tags | Derived representation, classifier, or residency projections. | May support ranking/fanout later; cannot substitute for admitted source identity, writer lineage, or readback. |

The local chunk-writer review found no safe existing bounded repair path. `scripts/atlas/index-full-repo-for-search.mjs`
is broad: it embeds using the mutable `embeddinggemma:latest` default, upserts Qdrant, inserts/updates
`codebase_chunk_index`, and may warm Redis centroid keys. Its PostgreSQL write does not persist the
admitted `source_revision`/`workspace_revision` binding or `atlas_packet_chunk_lineage`; the source
itself warns that it cannot establish admitted lineage. It can populate an index, but using it for
this ordinal repair would produce rows without the proof that admission requires. Do not invoke it
for the 1,586-source gap. The next code task is a frozen-manifest, revision-revalidated, chunk-only
mode owned by the existing canonical chunk producer, with no embedding/Qdrant/cache fanout and an
independent lineage readback; if that existing owner cannot expose those semantics, stop and settle
its contract before implementation.

The ACE review likewise distinguishes a component from a production path. The existing
`searchWithAceManifest()` in `search-runtime-adapter.ts` can compose SearchRuntime/QAS into an
admission object and cache identity, but it is opt-in and requires caller-supplied revision-qualified
feature sources and policy revisions. The current `/api/ace/stream` route still calls the legacy
`scripts/ace/build-packet.mjs` builder; the production-source adapter has no route caller. Passing
user-supplied `aceCacheIdentity` only controls cache admission; it does not prove V3 packet grounding.
Therefore the implementation gap is the production retrieval/source-owner binding plus an
independently checked receipt—not `file_path`, a replacement `ace_context_sources` table, or more
packet fields.

External implementation guidance checked against official docs:

- Qdrant supports `update_vectors` for changing selected named vectors while preserving unspecified
  vectors; use that when intentionally adding/updating a vector on an existing point, and verify
  point payload/identity readback. Do not assume all vector updates require replacing the full point.
  [Qdrant Points](https://qdrant.tech/documentation/concepts/points/)
- If a settled owner truly requires new relational schema for a durable receipt, use the repository's
  migration flow: generate a reviewed migration, then apply with `drizzle-kit migrate`; schema push
  is not a substitute for this production workflow. [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- pgvector can store/index vectors in PostgreSQL, but vector availability is not producer lineage or
  cross-projection parity. [pgvector](https://github.com/pgvector/pgvector)

Corrected repair order: (1) finish current Graphify exact-revision reconciliation; (2) identify and
prove the bounded chunk+lineage owner, then repair only revalidated ordinal-gap rows and quarantine
the duplicate-ID source; (3) converge the `content_embedding_768` writer and seal its exact input
manifest before any new embedding/training; (4) bind existing latent outputs to that canonical input
snapshot, evaluate quality, and make a separate promotion decision; (5) produce an immutable
projection/readback receipt using the existing receipt owner; (6) wire the existing admitted resolver
→ V3 → ContextManifest path into production and prove grounded readback; (7) only then prove
BitFrost key derivation and a bounded cache write/readback. Qdrant, graph fanout, Neo4j/NetworkX,
NLP, domain classification, or centroid warming remain downstream consumers, not shortcuts through
these gates.

## 2026-09-30 continuation — canonical chunk-owner census

The scoped writer census did not find an existing bounded producer that can safely create the missing
physical chunks and their exact admitted packet-to-chunk memberships:

- `scripts/atlas/index-full-repo-for-search.mjs::upsertPostgresMetadata()` inserts broad index rows
  keyed by `qdrant_id`; it is coupled to embedding/Qdrant projection work and does not bind the
  admitted workspace/source revision or write the required packet lineage. It is not the repair owner.
- `sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts::mirrorToPostgres()`
  mirrors Qdrant payloads by `qdrant_id`; it takes path/chunk identifiers from a derived payload and
  does not establish source admission or packet membership. It is not the repair owner.
- `sveltekit-frontend/scripts/batch-upsert-codeintel.mjs` is explicitly a Qdrant-to-Postgres mirror,
  not a canonical source chunk producer.
- `scripts/atlas/apply-codebase-chunk-lineage-backfill-v1.mjs` updates lineage metadata only on
  existing exact source/digest-matched chunk rows; it cannot create the 1,586 absent physical rows
  or resolve the duplicate-identity source.
- `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts` consumes proven lineage and existing
  physical rows; it is not a chunk creator.

Therefore `ORDINAL_MAP_SEALED` is blocked at owner selection, not SQL/index tuning. The next step is
an owner review against source acquisition and the existing chunk-index contract: identify the
component that owns chunk boundaries, canonical chunk IDs, current source-byte digest, and packet
membership; then decide whether it can accept a frozen source manifest. Until that owner is
established, keep the 1,586-row apply and duplicate identity quarantined. No database, Qdrant,
Redis/Valkey, or projection write was performed.

## 2026-09-30 goal refresh — live blocker matrix and fix sequence

Fresh `scripts/atlas/audit-canonical-projection-fabric.mjs` completed at
`2026-09-30T20:47:03.456Z` in `BEGIN TRANSACTION READ ONLY` followed by `ROLLBACK`:
`NOT_SAFE_TO_PROJECT`, 4/11 PASS. The admitted `repo:root` denominator is 16,151; identity and
source-revision qualification both pass 16,151/16,151. Historical 61,718 packet rows and the
old 289/1,000 Qdrant-ID sample are not current gate denominators. Missing Qdrant IDs are projection
diagnostics, not canonical packet-identity failures.

| Below-PASS predicate | Current evidence | What must change to reach PASS |
| --- | --- | --- |
| `SYMBOLS_RESOLVED` | 18,850/21,584 supported admitted sources processed (87.33%); 1,564 unprocessed, 1,159 without an exact Graphify revision row, 11 failures. Frozen baseline readback classified its unresolved subset as 589 identity conflicts, 297 resource deferrals, 443 readback mismatches, and 7 exact failures. | Reconcile exact-revision sources through the existing extractor/readback owner; resolve identity collisions and bounded JSON policy without deduplication, blind upsert, or weakening byte/revision checks. Re-audit terminal outcomes. |
| `SEMANTIC_OWNER_PROVEN` | `content_embedding_768` exists; writer owner is `UNRESOLVED_NOT_PROMOTED`; historical `content_embedding` and `atlas_packets.embedding` remain competing surfaces. | Converge to one canonical writer; bind each row to admitted source/workspace revision, immutable model/tokenizer and representation revisions, exact input/vector digests, and independent readback. Do not re-embed first. |
| `LATENT_FAMILY_PROVEN` | Checkpoint/artifact identity and 55,169 historical output bindings are verified; no per-row input digest ledger binds training to canonical `semantic_768`; lifecycle remains `CANDIDATE`. | Freeze a manifest of actual canonical semantic inputs and training config; bind checkpoint and derived outputs to that manifest; evaluate quality separately; require an explicit promotion receipt. |
| `ORDINAL_MAP_SEALED` | Fresh dry-run: 14,564/16,151; exactly 1,587 rejected, all `MISSING_LINEAGE`. A second read-only query found 1,586 with no physical chunk, one source with 52 rows/26 unique chunk IDs (26 duplicate-ID rows). On-disk byte checks: 1,583 exact, 4 drift. Exact current binding: 1,587/1,587; exact Graphify revision: 1,571 (1,044 processed, 523 unprocessed, 4 parse-failed), with 16 Graphify revision rows missing. | Establish the source/chunk/identity owner first. Revalidate current bytes and revisions; create chunks and packet membership only through that owner, with lineage readback; quarantine the duplicate-ID source. Do not call the broad embedding/Qdrant indexer as a repair. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | `atlas_representations` exists, but the audit finds no cohort/ordinal checksum binding receipt. | Reuse the settled projection/receipt owner to bind the same source cohort, ordinal checksum, representation/model revisions, and destination readbacks. The evidence gap does not itself justify a new table. |
| `BITFROST_KEYS_DERIVABLE` | Existing key contract is `AceBitfrostCacheIdentityV1`; current v1 keys observed: 0. No live admitted-key producer/caller and identity-bound write/readback proven. | Wire the admitted ACE identity producer; derive keys deterministically from canonical IDs and revisions/checksums; then do bounded write and independent readback only after ACE admission. TTL/expiry proves residency behavior, not identity. |
| `ACE_EVIDENCE_GROUNDED` | `ace_context_sources` has 0 rows and is legacy diagnostic only. Production `/api/ace/stream` still uses the legacy packet builder; SearchRuntime→V3/ContextManifest bridge is opt-in and has no production caller. | Wire the existing production retrieval owner through canonical admitted source resolution → `AcePacketV3` → request-scoped `ContextManifest`; prove exact source spans/revisions via an independent receipt/readback. No packet-field expansion or replacement ledger. |

The new ordinal artifacts are local diagnostics only:
`.tmp/atlas/candidate-ordinal-corpus-v2/goal-refresh-20260930T2047/` (map checksum
`77634f4763f67af6658ba9b4017db2d1c2b8ce150903e5ce09fb31ec752e91fd`; rejection checksum
`sha256:b64867efe7b07e756ee1e5c73bd0ed8fb9d4229b1c2a6acf0d25e5f534154352`). The database checks
used a read-only transaction; only local `.tmp` output was created. No canonical chunk, packet,
projection, model, or cache writes occurred.

Adding `source_revision`, `file_path`, summaries, token budgets, or more feature/centroid fields to
the packet cannot create missing physical chunks, identify the canonical vector writer, recover the
AE training-input cohort, align projection readbacks, or wire the live ACE route. `file_path` is a
locator; request token budgets belong to `ContextManifest`/`PromptPlan`; packet fields already carry
the durable source/revision provenance. QLoRA/domain labels/HyperGraphRAG, Neo4j, Qdrant, NetworkX,
and NLP are downstream derived consumers—not ways to satisfy source ownership and producer receipts.

Implementation guidance checked against primary documentation:

- EmbeddingGemma supports 768-dimensional output and MRL-truncated 512/256/128 outputs, with
  re-normalization; this defines representation options, not missing per-row writer lineage.
  [Google EmbeddingGemma model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card)
- PostgreSQL 18 supports explicit read-only transactions and uniqueness/foreign-key constraints;
  use them for bounded census and canonical membership integrity, not inferred identity.
  [BEGIN](https://www.postgresql.org/docs/18/sql-begin.html),
  [constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
- Qdrant named-vector updates affect only supplied vectors and leave unspecified vectors intact;
  `wait=true` waits for processing. This helps projection update/readback design but does not make
  Qdrant canonical authority. [Qdrant Points](https://qdrant.tech/documentation/concepts/points/)
- Valkey expiry deletes volatile keys; TTL is a lifetime mechanism, not a provenance record.
  [Valkey EXPIRE](https://valkey.io/commands/expire/), [Valkey TTL](https://valkey.io/commands/ttl/)

Correct sequence: finish exact symbol outcomes → settle and implement chunk owner → seal ordinal map
→ converge semantic writer/input provenance → bind/evaluate latent family → produce projection
readback receipt → wire ACE production grounding → prove BitFrost key derivation/write/readback.
Do not enable `graphify:daily` projection apply until all eleven predicates pass.

## Symbol-gate frozen-shard preflight (2026-09-30T21:02Z)

The existing `graphify-symbol-extractor-v1.mts` frozen-plan path was exercised against the admitted
workspace revision in freeze-only mode, followed by a four-shard dry-run. The freeze produced 859
supported, exact-byte-matched, still-UNPROCESSED members (manifest checksum
`sha256:3fc237efff9efb237f08332407a9a4e63ca2a6bc560661245f98a9deffda0d6a`). The live selector
examined 4,308 candidate rows: 2,744 unsupported kinds were skipped, and among 1,564 supported
unprocessed rows, 859 matched current bytes while 705 did not. All 859 frozen members were visited.

No member reached `WOULD_EXTRACT`: 589 were deferred for duplicate expected observation identities
(225 code-symbol and 364 Markdown-structure cases, matching the prior exact classification); 270
generated JSON files exceeded the bounded observation workload. All four shard receipts are
`SHARD_INCOMPLETE`, the aggregate baseline seal is false, and the runner reports `apply=false` /
`datastoreWriteAttempted=false`. The plan is useful as a stable diagnosis but is not an apply-ready
queue. Remaining work is the already tracked `GRAPHIFY-LOCAL-IDENTITY-01` and
`GRAPHIFY-GENERATED-RESOURCE-01`, followed by a freshly frozen producer-revision plan and independent
readback. The legacy `graphify_files.workspace_revision` mirror mismatched on these rows, but the
current admitted workspace/source binding was selected explicitly; do not reinterpret this mirror
diagnostic as an admission failure.

The identity fix belongs in the existing observation owner: preserve distinct overloads/repeated
headings with an explicit local-observation discriminator and exact spans; do not drop duplicates or
remove the PostgreSQL unique constraint. PostgreSQL documents that unique constraints enforce
uniqueness across the declared key, so the producer key must represent distinct observations rather
than weakening the database guard. [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)

No extraction apply or canonical write occurred. The dry-run created frozen plan/shard files under
`.tmp/atlas/graphify-symbol-baseline/` and four per-shard plus one aggregate JSON receipt under
`docs/reports/`; these are local diagnostics, not canonical receipts.

## Canonical chunk-owner candidate rejection (2026-09-30 continuation)

The remaining candidate review confirms that no safe bounded physical-chunk creator has yet been
identified. In `scripts/atlas/index-full-repo-for-search.mjs::processFile()`, chunk identity is
derived from `fullrepo:<relative-path>:<array-index>` and the Qdrant UUID is also assigned as
`packet_key`; this is incompatible with the canonical packet/chunk distinction. The script checks
existing rows by Qdrant ID and skips them, so it cannot repair the absent physical rows. Its apply
branch embeds and writes Qdrant plus PostgreSQL metadata, and may warm Redis centroids; it does not
persist admitted source/workspace revisions or `atlas_packet_chunk_lineage` membership.

The two tree-node ingestion scripts are not substitutes: they assemble PageIndex document/chunk
nodes from existing packet rows and do not create `codebase_chunk_index` chunks. The lineage
backfill similarly updates existing physical rows only. The next bounded action remains a read-only
trace of the original source-acquisition/chunk-boundary owner and canonical chunk-ID contract. Do
not adapt a projection mirror or mint IDs in the ordinal materializer. No scripts were applied and
no database, Qdrant, Redis/Valkey, model, or projection writes occurred.

## Live fabric audit refresh (2026-09-30)

Re-ran `node scripts/atlas/audit-canonical-projection-fabric.mjs`. The script opened a PostgreSQL
READ ONLY transaction and rolled it back after all 11 predicates. Current verdict is still
`NOT_SAFE_TO_PROJECT`, 4/11 PASS. The exact admitted `repo:root` denominator remains 16,151 packets;
the 61,718 total packet rows are historical/non-admitted context.

The current audit makes a crucial distinction for the earlier handoff: all admitted packet keys are
present and unique, so `IDENTITY_ALIGNED` passes. The 1,634 rows lacking `qdrant_point_id` are
explicitly projection diagnostics; Qdrant point IDs are rebuildable locators and backfilling them
would not repair canonical identity or the ordinal gap. The ordinal artifact contains 14,564 valid
members and 1,587 missing members, with zero duplicate packet keys, duplicate ordinals, orphan rows,
or revision mismatches. The unresolved physical-chunk cases remain an upstream coverage/identity
owner issue, not an ACE packet-field issue.

The seven gates below PASS mean seven distinct proofs are missing: extraction terminal outcomes;
unique semantic writer and exact per-row input/model/tokenizer/representation/vector provenance;
latent training-input manifest plus evaluation/promotion; complete physical-chunk-to-ordinal coverage;
projection input/checksum and destination readback; deterministic admitted BitFrost key producer and
cache readback; and live retrieval-to-V3-ContextManifest grounding with independent readback. Adding
`source_revision`, `file_path`, summary, token counts, feature remapping, domain classification,
centroids, or QLoRA metadata to an ACE envelope cannot establish those independently owned facts.

Official references reviewed: PostgreSQL 18 [unique constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
require producer keys to represent distinct observations; Qdrant [point operations](https://qdrant.tech/documentation/concepts/points/)
and [payload operations](https://qdrant.tech/documentation/concepts/payload/) distinguish upsert from
targeted updates; Drizzle's [migration workflow](https://orm.drizzle.team/docs/drizzle-kit-migrate)
applies only if an established owner later requires a schema change. These references inform safe
implementation mechanics; they do not prove local production lineage. No migration or projection
write is warranted by this audit.

## Physical chunk writer census (2026-09-30 continuation)

The scoped source census found three application/script paths inserting into
`codebase_chunk_index`; none can safely repair the admitted ordinal cohort:

1. `scripts/atlas/index-full-repo-for-search.mjs::upsertPostgresMetadata` writes as part of a broad
   filesystem/Qdrant indexer. The path is not admission-manifest driven, assigns Qdrant point
   identity into packet-like fields, and has Qdrant/embedding/centroid fanout. It is explicitly
   unsuitable for canonical missing-chunk repair.
2. `sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts::mirrorToPostgres`
   scrolls existing Qdrant points and mirrors payload metadata/auxiliary vectors. It has no exact
   admitted source/workspace revision check; it is a projection mirror, not a source chunk-boundary
   owner.
3. `sveltekit-frontend/src/routes/api/codebase/auto-research/+server.ts` writes generated wiki
   summaries to the same table; it does not materialize canonical source-file chunks.

This confirms the next dependency is not a missing ACE field or another Postgres table. The owner
that originally established canonical chunk boundaries/IDs for the admitted source corpus has not
been identified in current code. Do not convert any of the three mirrors into that owner by adding
revision columns alone: source byte spans, chunk-boundary provenance, canonical IDs, and exact
workspace/source admission must be produced together. Until the owner is found or explicitly
designated under the existing canonical indexing architecture, the 1,586 no-physical-chunk rows
cannot safely be materialized. The 1,587th ordinal exception remains the separate duplicate-chunk
identity contradiction and must be quarantined through the identity owner.

No writes were performed. The scoped census is code-level evidence only and does not claim that
there are no database procedures or external ingestion jobs; those remain to be checked if the
repository owner points to one.

### Live PostgreSQL owner check

Inspected `pg_trigger`, user-defined `pg_proc` functions, and `pg_rules` for the live
`public.codebase_chunk_index` in a READ ONLY transaction. The only table trigger is
`trig_update_codebase_chunk_search_vector` → `compute_codebase_chunk_search_vector()`, which derives
the FTS column from existing row fields. The only matching function, `refresh_codebase_chunk_stats()`,
aggregates counts into `codebase_chunk_index_stats` and prunes that stats table; it does not create
source chunks or lineage. No rewrite rule was found. The read-only transaction rolled back.

This removes database triggers/functions/rules as a likely hidden physical-chunk owner for the
inspected live schema. It does not rule out external schedulers, another database, or a retired
producer not present in the current checkout; those require concrete deployment/job evidence.

The startup wrapper's optional embedding lane was also traced: `run-graphify-daily-startup.mjs`
invokes `index-full-repo-for-search.mjs --dry-run` only on explicit opt-in, and documents it as
separate from the mutating daily chain so a faster embedding service cannot bypass source-lineage
admission. Thus prior successful search/Graphify runs can be operationally useful while still not
proving the current canonical chunk/ordinal/projection admission contract.

## CandidateOrdinal packet-map cross-check (2026-09-30 continuation)

The repository has two distinct artifacts that prior notes had blended:

- `docs/reports/candidate-ordinal-corpus-v1.json`: 14,564 candidates, produced by
  `materialize-candidate-ordinal-corpus-v1.mts`, whose current eligibility query requires an exact
  packet→PROVEN-lineage→physical-chunk join.
- The CEI-24 `CandidateOrdinalMapV1`: 16,151 packet-key candidates, explicitly packet-grain with
  zero chunk identities and a separate chunk-crosswalk gate. Its receipt is
  `docs/reports/cei24-candidate-snapshot-convergence-v1-20260926T175013.896Z.json`; map SHA-256 and
internal ordinal checksum both verify, and schema plus `assertCandidateOrdinalMapIntegrityV1`
pass.

A fresh repeatable read-only comparison against the currently admitted 16,151 `repo:root` packet
rows confirmed 16,151/16,151 exact packet-key, raw source-ref, source-revision, and workspace-revision
matches for the CEI-24 map. Its candidate snapshot revision (`09bfbf…`) differs from the current
workspace-source snapshot revision (`628872…`), despite the live identity/revision set matching
exactly; the current audit requires those two revision values to be equal. Therefore this is strong
evidence of a producer/audit contract mismatch, but not yet authority to swap the map or weaken the
revision check. Refresh the CEI-24 packet map against the current admitted snapshot through its
existing owner, add a focused audit test for distinct workspace-snapshot versus candidate-snapshot
revisions, and preserve physical chunk coverage as a separate projection-parity condition. No
artifact replacement or datastore write was made.

## Follow-up verification (2026-09-30)

- `canonical-candidate-v1.spec.ts`: 20/20 passed, including a new owner-level regression showing
  candidate snapshot revision and workspace revision are separate axes while internal map binding
  remains enforced.
- `openspec validate parent-atlas-ace-rlm-bitfrost-integration --strict`: valid.
- Fresh `audit-canonical-projection-fabric.mjs` read-only transaction: `NOT_SAFE_TO_PROJECT`,
  4/11 PASS. `SYMBOLS_RESOLVED`, `SEMANTIC_OWNER_PROVEN`, `LATENT_FAMILY_PROVEN`,
  `ORDINAL_MAP_SEALED` remain `PARTIAL_PROVEN`; projection checksum, BitFrost derivation, and ACE
  grounding remain `NOT_PROVEN`.
- Ordinal details remain 14,564/16,151 with 1,587 absent from the chunk-qualified artifact. The
  gate was not changed and no canonical datastore, cache, projection, or model writes occurred.
- Fresh audit reports: `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-30.json` and
  `.md`.

## Current blocker interpretation and repair paths (2026-09-30)

The pasted older handoff is not authoritative for the current predicates. It incorrectly promotes
sampled/missing Qdrant projection IDs into an identity failure and compares the admitted cohort to
all historical `atlas_packets` rows. The live report instead proves `IDENTITY_ALIGNED=PASS` and
`REVISION_QUALIFIED=PASS` for the exact 16,151 admitted `repo:root` packets; 1,634 absent
`qdrant_point_id` values are projection diagnostics, not canonical identity failures. The
historical table total is 63,084 in this run and remains outside the admitted denominator.

| Current predicate | Live evidence | What must change to reach PASS |
|---|---|---|
| `SYMBOLS_RESOLVED` | 18,850/21,584 supported admitted refs processed (87.33%); 1,564 unprocessed, 1,159 lack exact Graphify revision rows, 11 parse failures. | Drain a frozen exact-byte/exact-revision cohort through the existing extractor in resumable bounded batches; classify every supported ref with an explicit terminal outcome; repair revision gaps through the source/revision owner. Do not equate symbols-per-file with coverage. |
| `SEMANTIC_OWNER_PROVEN` | Canonical `content_embedding_768` exists; writer owner is unresolved; historical `content_embedding` and `atlas_packets.embedding` remain. | Trace every active writer and consumer; select/converge one canonical writer; bind each produced row to exact source/workspace revisions, immutable model digest, tokenizer revision, representation revision, input and vector digests; perform PostgreSQL readback. Model name aliases or vector presence are insufficient. |
| `LATENT_FAMILY_PROVEN` | Checkpoint tensor digest and 55,169 checkpoint bindings are verified; no canonical semantic input manifest; lifecycle remains `CANDIDATE`. | Only after semantic writer lineage is proven, freeze the exact training input cohort and config/producer revision; bind the checkpoint to that manifest; run held-out evaluation and a separate explicit promotion decision. Do not retroactively claim unknown historical inputs. |
| `ORDINAL_MAP_SEALED` | The audited corpus has 14,564/16,151 rows; its producer filters through proven packet→lineage→physical-chunk joins. A separate packet-grain map is not a substitute without a current receipt and agreed consumer grain. | Converge the owner/audit contract first. Produce a current revision-bound map at the consumer's true grain and prove deterministic unique contiguous coordinates/checksum. Keep physical-chunk crosswalk/materialization as its own prerequisite wherever consumers need chunks; never synthesize chunk IDs or ordinals. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | No current receipt binds cohort, ordinal map, representation inputs, and projection readbacks; no checksum columns found in the inspected public schema. | Reuse the existing projection/run receipt owner if one is found; otherwise settle its ownership before schema work. Bind input/cohort, ordinal, representation, and output checksums and independently read back projections. A healthy Qdrant/Neo4j/NetworkX lane is not parity proof. |
| `BITFROST_KEYS_DERIVABLE` | No current v1 namespace keys or proven admitted key producer/caller; legacy prefix count is also zero in this audit. | Derive keys from admitted canonical packet/source identity plus exact revision/checksum tuple; prove deterministic derivation and scoped cache write/readback only after the producer and ACE admission path exist. Centroid presence, TTLs, or cache hits alone cannot prove identity authority. |
| `ACE_EVIDENCE_GROUNDED` | Legacy `ace_context_sources` has zero rows and is not the V3 grounding owner; production retrieval→admitted resolver→AcePacketV3→ContextManifest readback is unproven. | Wire the live retrieval path to the existing canonical resolver and V3 builder/bridge; emit a receipt binding admitted packet/source revisions, selected spans, manifest, and final grounded context; independently read back. Adding `source_revision`, `file_path`, summary, token, feature, or remapping fields without this path does not close the predicate. |

These are not all requirements to make the broad system “work.” Daily Graphify currently fails
closed because its projection-admission policy requires the above proof predicates. Qdrant,
Neo4j/cuGraph, NetworkX, NLP, QLoRA, centroid routing, and domain classification may work in their
own lanes; they do not satisfy a missing writer owner, frozen input lineage, checksum receipt, or
grounded ACE production readback unless an explicit predicate consumes their revision-bound
receipts. Do not bolt them into the ACE packet merely to make the gate green.

External implementation guidance checked against primary documentation:

- PostgreSQL constraints are the right mechanism for durable uniqueness/integrity where the
  canonical schema requires it; a cache or application-side duplicate scan is not an equivalent
  uniqueness guarantee: https://www.postgresql.org/docs/18/ddl-constraints.html
- Qdrant supports partial payload updates (`set payload`) separately from full payload overwrite,
  and vector-only updates separately from point upsert. Choose the operation matching the settled
  projection contract and follow it with readback; do not assume an incomplete replacement payload
  preserves fields: https://qdrant.tech/documentation/concepts/payload/ and
  https://qdrant.tech/documentation/concepts/points/
- Ollama exposes embedding generation and loaded-model digests as API surfaces, but `/api/ps` is a
  separate loaded-model listing. Therefore a mutable model alias plus a later digest query is not
  automatically atomic per-embedding provenance; pin the immutable digest at the writer boundary
  and persist it with the row receipt: https://github.com/ollama/ollama/blob/main/docs/api.md
- For any future PostgreSQL schema change, use Drizzle's reviewed migration generation/application
  flow (`generate`, review SQL, then `migrate`) rather than an ad-hoc push; no schema change is
  justified by this audit alone: https://orm.drizzle.team/docs/drizzle-kit-generate and
  https://orm.drizzle.team/docs/kit-overview

No database, Qdrant, Neo4j, Redis/Valkey, model, or projection writes were made in this audit.

## Frozen symbol backlog dry-run (2026-09-30)

The existing `graphify-symbol-extractor-v1.mts` supports a frozen exact-byte plan and resumable
250-row shards. A current plan was created locally for admitted workspace revision
`sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`:

- Manifest: `docs/reports/graphify-symbol-baseline-freeze-20260930-v1.json`
- Shards: `docs/reports/graphify-symbol-baseline-freeze-20260930-v1.json.shards.json`
- 859 frozen rows across four shards; producer and source-snapshot checksums are in the manifest.
- Dry-run visited all 859 rows; `apply=false`, `datastoreWriteAttempted=false`,
  `filesCommittedThisRun=0`, `independentlyVerifiedMembers=0`, and `baselineSealProven=false`.
- Outcome census: 589 `IDENTITY_CONFLICT_DEFERRED`, 270 `RESOURCE_LIMIT_DEFERRED`.
- Per-shard receipts are `graphify-symbol-extractor-v1-1790804838551.json`,
  `graphify-symbol-extractor-v1-1790804839131.json`,
  `graphify-symbol-extractor-v1-1790804841927.json`, and
  `graphify-symbol-extractor-v1-1790804843199.json`; aggregate:
  `graphify-symbol-baseline-run-1790804843202.json`.

The identity guard detects repeated `stable_symbol_key` values whose evidence spans/fingerprints
differ, before any write. A concrete first-shard example is `sveltekit-frontend/src/global.d.ts`:
two repeated `declare module '$lib/server/redis'` ambient declarations and two `export {};`
declarations share kind/name-based keys at distinct source ranges. They must not simply be erased,
collapsed, or assigned fake identities. Decide how intentional merged declarations and repeated
export markers should be represented by the existing symbol/AST owners, add explicit focused tests,
then re-freeze under a new producer revision before any apply can be considered.

The 270 resource deferrals are JSON files whose structural observation expansion exceeded the
existing bounded extractor policy; some are 4 MiB/observation-ceiling cases. Do not label them
parse failures or silently truncate and mark processed. The owner needs an explicit complete-result
strategy or terminal resource-limited outcome accepted by the coverage contract. No extraction
apply, database/cache/projection/model write, or admission change was performed.

The existing `CandidateOrdinalMapV1` owner now has a focused regression test proving that its
candidate-set snapshot revision and workspace revision are separate revision axes; candidates
must still match the map's candidate snapshot, and the map's own workspace binding remains
enforced. This validates the packet-map contract only. The live audit still needs a refreshed
current map/receipt and an explicit independent physical-chunk coverage check before any gate
semantics change.

### Symbol occurrence identity correction and v3 dry-run (2026-09-30)

The v1 frozen-plan census above is superseded for extractor identity conflicts by a focused
producer correction, not by a change to the admission contract. The existing extractor planner now
derives deterministic occurrence keys for repeated code declarations and distinct occurrence names
for repeated AST qualified paths, ordered by source spans. Unique observation identities retain
their established key/name. Canonical packet/source identity is untouched; no schema or parallel
registry was introduced.

Validation and current frozen-cohort evidence:

- `node --test scripts/atlas/lib/graphify-symbol-batch-plan-v1.test.mjs`: 14/14 PASS.
- Extractor CLI module/help load: PASS, without opening a database connection.
- New exact-byte plan: `docs/reports/graphify-symbol-baseline-freeze-20260930-v3.json`, manifest
  checksum `sha256:a4a95001c242c527b027feab3bca730b3032cef0a915b0281c5476b3623530b9`, 859 members,
  four fixed shards.
- All four shards visited. Outcomes: 589 `WOULD_EXTRACT`, 270 `RESOURCE_LIMIT_DEFERRED`, and zero
  `IDENTITY_CONFLICT_DEFERRED`. The 270 JSON resource-limit cases remain deferred; no truncation or
  synthetic terminal outcome was introduced.
- Aggregate receipt: `docs/reports/graphify-symbol-baseline-run-1790805565777.json`.
  `apply=false`, `filesCommittedThisRun=0`, `independentlyVerifiedMembers=0`,
  `baselineSealProven=false`, and `datastoreWriteAttempted=false`.

This closes the prior producer-level duplicate-occurrence blocker for the 589 eligible rows only.
It does not advance live `SYMBOLS_RESOLVED` coverage: apply/readback has not run, and all other
below-PASS predicates remain independent. Apply remains a separate guarded step after reviewing
the frozen plan and current storage headroom.

### Bounded symbol apply and refreshed admission audit (2026-09-30)

The v3 note above described the pre-apply state and is superseded for the 589 eligible members by
the following guarded run. The first apply attempt stopped at the first file: the transaction's
expected readback used disambiguated occurrence keys while the insert loop still used the legacy
name-derived key. It reported `filesCommittedThisRun=0`; the per-file transaction rolled back. The
writer was corrected to insert the exact expected keys, then the cohort was re-frozen under the
new producer revision and dry-run again before retrying.

The v4 plan has checksum
`sha256:62381b43b0a9b713a04b2a4eae445379988e3044b087510ff9a801fba92906ef` and 859 exact-byte
members. The bounded apply committed and independently read back 589 files: 261
`PROCESSED_WITH_SYMBOLS`, 328 `PROCESSED_STRUCTURE_ONLY`, zero failed files. A subsequent full
read-only replay independently verified all 589 and classified the remaining 270 as
`RESOURCE_LIMIT_DEFERRED`; `baselineSealProven=false` remains truthful because those rows are not
covered. Receipts include:

- Apply shard 1: `docs/reports/graphify-symbol-extractor-v1-1790805796598.json`.
- Apply shards 2–4: `docs/reports/graphify-symbol-extractor-v1-1790805814171.json`,
  `docs/reports/graphify-symbol-extractor-v1-1790805825284.json`,
  `docs/reports/graphify-symbol-extractor-v1-1790805826511.json`.
- Full read-only reconciliation: `docs/reports/graphify-symbol-baseline-run-1790805852632.json`.

No embedding, Qdrant, Redis/Valkey, Neo4j, or model writes were performed by this work. The
canonical fabric audit then ran in a PostgreSQL READ ONLY transaction and rolled back. It remains
`NOT_SAFE_TO_PROJECT` at 4/11 PASS, with these current counts:

- `SYMBOLS_RESOLVED`: 19,439/21,584 (90.06%); 975 unprocessed, 1,159 without an exact Graphify
  source-revision row, 11 parse failures. The 589-file repair improved coverage but did not close
  the predicate.
- `SEMANTIC_OWNER_PROVEN`: `PARTIAL_PROVEN` — canonical vector surface exists; unique writer and
  per-row lineage/readback are not proven.
- `LATENT_FAMILY_PROVEN`: `PARTIAL_PROVEN` — checkpoint side is known, canonical semantic input
  cohort and promotion evidence are not.
- `ORDINAL_MAP_SEALED`: `PARTIAL_PROVEN` — audit's physical-chunk-lineage corpus and the separate
  packet-grain ordinal map still need owner/grain convergence.
- `PROJECTIONS_CHECKSUM_ALIGNED`, `BITFROST_KEYS_DERIVABLE`, and `ACE_EVIDENCE_GROUNDED` remain
  `NOT_PROVEN` for lack of their distinct readback/production-path receipts.

A read-only census of the 270 JSON resource-limited files found 2,249–67,988 depth-2 keys per
file (median 18,579; 210 exceed 10,000). Thus the existing 2,000-observation safety ceiling is
not a one-off edge case. Raising it indiscriminately would expand a single-file transaction by
up to ~34x and can create millions of low-value generated-artifact nodes. Before those files can
count toward `SYMBOLS_RESOLVED`, the existing JSON observation owner needs a reviewed bounded
shape contract (for example, schema/property-path extraction with explicit cardinality semantics)
or the admission predicate must accept a distinct, truthful resource-terminal result. Do not
truncate silently, set `PROCESSED`, or label the corpus sealed while those outcomes are unresolved.

### Semantic writer ownership refresh (2026-09-30)

The existing read-only `audit-semantic-768-writer-ownership-v1.mjs` was rerun to a versioned
follow-up report: `docs/reports/semantic-768-writer-ownership-followup-20260930-v2.json`.
Live PostgreSQL remains reachable. Census:

| Surface | Total rows | Populated | Meaning |
|---|---:|---:|---|
| `codebase_chunk_index.content_embedding_768` (`vector`) | 274,465 | 219,998 | Declared canonical target, but row lineage is absent |
| `codebase_chunk_index.content_embedding` (`halfvec`) | 274,465 | 55,169 | Historical/transition surface; the Graphify backfill writes here |
| `atlas_packets.embedding` (`vector`) | 61,718 | 61,659 | Secondary historical surface |

For the 219,998 populated canonical-target rows, the live census found zero values in scalar
`source_revision`, `workspace_revision`, `representation_revision`, and
`lineage_producer_revision` fields; zero nested equivalents for source/workspace/representation,
model/tokenizer revision, input/vector digest, or producer revision; and zero `encoder_id` values.
`content_hash`, model label, dimension, and normalization are present, but 219,422 rows say
`embeddinggemma:latest` and 576 say `embeddinggemma:latest:eg-task-prefix-v1`. A mutable alias
does not identify an immutable model artifact/tokenizer revision.

The static scan reports 15 candidate mutator paths across the three physical surfaces. That is a
useful search set, not a proven count of live production owners. The only path whose SQL directly
targets `content_embedding_768` is the explicitly authorized 15-candidate lineage canary; it is
not a unique, production-reachable owner. `backfill-graphify-file-embeddings-768.mjs` labels the
logical representation `semantic_768` but writes the different legacy `content_embedding`
halfvec column. This is a concrete instance of “it worked” while not satisfying the stronger
canonical gate: a live embedding computation or projection can succeed on a different surface
without proving that the declared canonical column has a unique revision-qualified writer.

No semantic vectors were regenerated or changed in this census. The required path is still:
canonical admitted source/chunk binding → immutable model/tokenizer/runtime revision → exact
input digest → one canonical `content_embedding_768` writer → output digest → PostgreSQL readback.
Do not fill lineage by guessing from the mutable model alias or copy values from the historical
halfvec/Qdrant surfaces. Qdrant remains a projection and must be reconciled after canonical
readback, not used to establish the source writer.

### Ordinal corpus dry-run replay (2026-09-30)

Replayed `scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts` in `--dry-run` mode against
the admitted workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`
and the admitted tournament snapshot revision
`sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`. The read-only query
returned 16,151 admitted root packet rows; 14,564 passed the existing exact source-revision and
packet→lineage→physical-chunk checks. All 1,587 rejects are `MISSING_LINEAGE` in this producer's
diagnostic. Its checksum, `77634f4763f67af6658ba9b4017db2d1c2b8ce150903e5ce09fb31ec752e91fd`,
matches the audit's current ordinal corpus checksum exactly.

The isolated local artifacts are under
`.tmp/atlas/candidate-ordinal-corpus-v2/diagnostic-20260930/` (map, receipt, rejection diagnostics).
No canonical corpus/receipt, database row, Qdrant point, cache, or projection was written. This
replay verifies deterministic reproduction only; it does not resolve lineage ownership or close
`ORDINAL_MAP_SEALED`. The producer's coarse rejection label cannot distinguish the 1,586 absent
physical-chunk cases from the one duplicate canonical chunk-ID contradiction; that detailed split
remains attributed to the separate read-only physical-chunk census recorded above.

The bounded writer search found no safe owner to invoke for repair. The existing
`sveltekit-frontend/src/routes/api/codebase-index/index-stream/+server.ts` path combines PostgreSQL
mirroring with embedding/cluster work and Qdrant upserts. `scripts/atlas/index-full-repo-for-search.mjs`
combines chunk metadata/embedding writes with Qdrant and optional Redis centroid writes.
`scripts/atlas/register-orphaned-chunks.mjs` operates on already-existing orphan chunks and can
create packet plus lineage rows; it is not a physical-chunk creator for this already-admitted
cohort. No writer was invoked. A repair needs an existing canonical chunk producer with bounded
source/revision inputs and a no-fanout mode, or an owner-level change reviewed and tested before any
apply; broad reindexing remains disallowed.

### Historical-success and exact remaining symbol cohort (2026-09-30)

The “it worked before” discrepancy is explained by the guard history, not by recently added packet
fields. Git history shows commit `865a7c3f5761093319a2da96524086c2dde53c29` introduced the daily
admission wrapper on 2026-09-09 because the audit could report `NOT_SAFE_TO_PROJECT` while the
process still exited successfully. Current `graphify:daily` first runs that audit and only enters
the apply-capable chain when all 11 predicates report `SAFE_TO_PROJECT`. Older success established
that some feature path ran; it did not prove this stronger gate.

A fresh dry-run of the existing symbol extractor froze 975 unprocessed supported candidates against
the current admitted workspace revision. 705 are source-byte/revision mismatches and cannot be
re-extracted under stale Graphify authority. The other 270 are JSON; the existing bounded extractor
defers all of them. There are zero eligible rows in this fresh plan. Manifest checksum:
`sha256:b47984d5f16b35e99b542b346322bc634c0cbea9bc8f69d214b9339dfa08232e`. No extraction writes
occurred.

Both frozen shards were then replayed in dry-run mode: **270/270** yielded
`RESOURCE_LIMIT_DEFERRED`; zero files were committed or independently verified, and the receipt
reports `datastoreWriteAttempted=false` and `projectionAdmissionPromoted=false`. Run receipt:
`docs/reports/graphify-symbol-baseline-run-1790806838692.json`. This is current evidence that raising
the arbitrary observation cap is not a safe repair; first define a bounded JSON structural contract
or an explicitly policy-approved terminal outcome.

Adding `file_path`, summaries, token counts, feature remaps, centroids, or classifier labels cannot
create a missing canonical source→packet→physical-chunk relation. `sourceRef` plus exact source and
workspace revisions establish the source binding; summaries and NLP/domain signals are derived
annotations; token budget is request-scoped; Qdrant/Neo4j/Valkey/NetworkX and QLoRA are downstream
projections or execution/enrichment lanes. The present blockers require producer lineage, exact
readback, and live-path wiring—not a larger ACE payload.

Primary external implementation references reviewed on 2026-09-30:

- [PostgreSQL 18 `BEGIN`](https://www.postgresql.org/docs/18/sql-begin.html) documents `READ ONLY`
  transaction mode; use it for diagnostic audits, not as proof of write-path correctness.
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md) documents model tags, model
  listing/running-model endpoints, and model digests. Bind the exact digest to the embedding
  producer receipt; a mutable `:latest` label alone is insufficient.
- [Qdrant points](https://qdrant.tech/documentation/concepts/points/) documents point upsert and
  separate named-vector updates (which retain unspecified vectors). Select the operation based on
  the actual collection/point contract and independently read back the destination.
- [Drizzle migrations](https://orm.drizzle.team/docs/drizzle-kit-migrate) documents applying
  generated migrations. Do not add a schema migration until the existing durable receipt owner and
 field contract are settled.

### JSON backlog sizing and semantic-writer refresh (2026-09-30)

A fresh frozen plan (`docs/reports/graphify-symbol-baseline-freeze-20260930-v6.json`) captured the
same 270 exact-byte JSON members under the current extractor checksum. A bounded 70,000-observation
experiment parsed all 270 without truncation, but would emit **5,799,947 AST observations** across
the two shards (median 18,579/file; maximum 67,988/file). The largest paths are generated Graphify
GDS snapshots, historical graph-run JSON, and a vector row map. I reverted the experimental limit;
the production/frozen extractor remains fail-closed at 2,000 observations per file. No DB writes
occurred. Therefore the next repair is a source-eligibility and JSON-shape contract—not blindly
raising the cap or materializing millions of data-record keys as source capabilities.

The focused JSON extractor test suite passed 4/4, including full preservation of 2,500 keys below a
caller-supplied limit and the existing defer-on-overflow behavior. That verifies the helper's bound
semantics only; it does not make the frozen 270-file plan eligible.

The live semantic writer census refreshed to `OWNER_NOT_PROVEN` with 15 candidate writer paths.
`codebase_chunk_index.content_embedding_768` has 219,998 vectors and zero rows with source,
workspace, representation, or lineage-producer revisions; nested provenance fields likewise have
zero required model/tokenizer/input/vector/producer digests. All are labeled mutable
`embeddinggemma:latest` variants. The identified canonical-column writer candidate is a 15-row
guarded canary, not a proven general production owner; the daily Graphify backfill writes the
historical `content_embedding` halfvec instead.

The current fabric audit (`2026-09-30T22:28:32.276Z`) remains `NOT_SAFE_TO_PROJECT`, 4/11 PASS.
`SYMBOLS_RESOLVED` is 19,439/21,584; ordinal sealing is 14,564/16,151. Semantic and latent lineage
remain partial, while projection checksum alignment, BitFrost derivation, and live ACE grounding
remain unproven. The audit ran in a read-only transaction and rolled back; no canonical or
projection writes occurred.

### Symbol-source scope correction (2026-09-30)

The frozen JSON manifest was classified by path and role. Its 270 exact-byte members are generated
or evaluation artifacts: 152 historical run JSON files, 83 Graphify GDS snapshots, 26 Drizzle
metadata snapshots, three other memory artifacts, two ground-truth fixtures, one graph export,
one vector row map, one prior-stage snapshot, and one generated classification artifact. Expanding
the generic depth-2 AST extractor over these files would create 5,799,947 data-key observations,
not useful source-symbol coverage.

Implemented a shared path-scope policy in the existing Graphify candidate selector and
`SYMBOLS_RESOLVED` audit. It excludes only these derived/test artifact paths from symbol-extraction
coverage; it does not remove them from the admitted workspace, alter their canonical identity, or
claim they were indexed by another owner. The frozen v6 manifest replayed against the policy with
270/270 classified as excluded. The current v8 plan bound to the changed producer code
(`sha256:bc98193c7a19de8b4d2ed7ba54fc598457373e678167931abdfb59a688b5a5bf`) contains zero apply
candidates; all remaining 704 exact-Graphify but unprocessed supported sources fail current
on-disk byte/revision revalidation.

After this scope correction, the live read-only audit reports 20,750 supported admitted symbol
sources, 18,881 processed (90.99%), 704 unprocessed, 1,155 missing exact Graphify revision rows,
10 parse failures, and zero duplicate exact rows. `SYMBOLS_RESOLVED` remains partial, and the full
fabric remains `NOT_SAFE_TO_PROJECT` at 4/11 PASS. The other six open predicates and the ordinal
and ACE blockers are unchanged. Focused scope/JSON tests passed 9/9; OpenSpec strict validation
passed. The audit transaction rolled back; no canonical or projection writes occurred.

### Current source inventory is not the admitted snapshot (2026-09-30)

The existing read-only reconciliation for execution
`74d50c86-8194-45ea-8c3d-61aab737ef83` confirms all 24,456 admitted root rows match the sealed
execution membership and `atlas_workspace_source_bindings`. It finds **zero** `graphify_files`
rows with the admitted `workspace_revision`, despite the separate symbol audit finding exact
`code_source_revision` matches. These are different revision axes: matching source bytes does not
prove the Graphify inventory run itself is bound to the admitted workspace revision.

The existing inventory writer has no dry-run flag and invokes the current workspace materializer.
I called that materializer in memory only: the dirty working tree yields 26,309 source bindings.
The first diagnostic digest was `sha256:a11d674fc241427bbc53bc0bb5198e27ee12ea7dbdc5141279cf1ba3533509f9`;
after task/report edits in this turn, a repeat still found 26,309 bindings but produced
`sha256:b075f3fa0645ce4ab959662a0b6eb7745c5698e8ed9bc068dbad4401954cbd91`. The digest is therefore
volatile while tracked files are being edited, and neither diagnostic is an admitted revision.
Both differ from the admitted 24,456-source revision
`sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. Running the writer now
would create a new Graphify inventory for a dirty-tree revision, not repair the old admitted
revision. It was not run. The correct route for the 1,155 missing inventory rows and 704 byte-drifted
sources is a reviewed new snapshot/admission after the source set is stable, followed by
inventory/extraction against that exact revision; do not backfill or relabel rows under the old
revision.

### Current gate reconciliation and external-mechanism review (2026-10-01)

The attached `graphify:daily` handoff cites an older **4/11 PASS** result and says
`ORDINAL_MAP_SEALED` is partial. The latest complete saved fabric report is
`docs/reports/atlas-canonical-projection-fabric-audit-2026-10-01.json`, generated at
`2026-10-01T00:25:29.690Z`, with **5/11 PASS**. It proves packet-grain ordinals for the exact
16,151-row admitted `repo:root` cohort (16,151/16,151, unique and contiguous); its note explicitly
keeps the physical packet-to-chunk crosswalk separate. Thus the stale 1,587 physical-chunk count
must not be presented as an `ORDINAL_MAP_SEALED` failure. `IDENTITY_ALIGNED` and
`REVISION_QUALIFIED` also pass on the admitted cohort; missing Qdrant point IDs are projection
diagnostics, not packet-identity failures.

I attempted the audit again. The host-side Node/PostgreSQL protocol ended with
`Connection terminated unexpectedly`, before a report was produced. Docker reports the container
ready and a read-only `psql SELECT 1` executed inside the container succeeds; a Windows host-side
`SELECT 1` still fails with the same protocol termination. Therefore 5/11 is the latest complete
saved result, **not a refreshed live verdict**. `graphify:daily` correctly fails closed at
`GRAPHIFY_PROMOTION_ADMISSION_BLOCKED:NOT_SAFE_TO_PROJECT`; do not weaken or bypass that guard.

The six below-PASS predicates in the saved report are:

| Predicate | Current saved evidence | What actually closes it |
|---|---|---|
| `SYMBOLS_RESOLVED` | 18,881/20,750 supported admitted refs processed; 704 unprocessed, 1,155 lack an exact Graphify inventory row, 10 parse failures. Current-byte drift and missing inventory are not safe to rewrite under the old admitted revision. | Stabilize and admit the intended source snapshot, reconcile it through the existing source-inventory owner, then process only exact-revision eligible refs with terminal outcomes and independent readback. |
| `SEMANTIC_OWNER_PROVEN` | Canonical `content_embedding_768` exists; writer is `UNRESOLVED_NOT_PROMOTED`. Historical `content_embedding` and `atlas_packets.embedding` remain distinct surfaces. | Converge to one general writer and bind each produced row to exact source/workspace/input, immutable model/tokenizer/runtime, representation, and vector digests; prove independent readback. Do not merely add ACE packet fields or start a new embedding corpus. |
| `LATENT_FAMILY_PROVEN` | Checkpoint/artifact chain is verified and 55,169 rows have checkpoint bindings; no exact canonical semantic input cohort manifest; lifecycle remains `CANDIDATE`. | Recover/freeze the actual training-input cohort, bind it to the checkpoint and producer/config revision, evaluate quality, and record a separate promotion decision. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | No receipt binds one admitted cohort, ordinal checksum, representation inputs, and projection readbacks. | Have existing projection owners emit and independently verify a same-cohort receipt; do not create a parallel registry just to satisfy the predicate. |
| `ACE_EVIDENCE_GROUNDED` | The production `/api/ace/stream` route still calls the legacy packet builder; the V3 source adapter/bridge has no proven production caller. `ace_context_sources` is not the V3 grounding owner. | Wire live SearchRuntime candidates through the canonical admitted resolver, existing AcePacketV3 builder/validator, and ContextManifest; independently verify identity, exact revisions, spans, and manifest checksum. |
| `BITFROST_KEYS_DERIVABLE` | No current v1 key namespace entries and no proven admitted production key producer with bound readback. | After ACE grounding, derive keys from admitted identity/checksums, then perform an explicitly authorized bounded SET/GET canary and verify the exact value/identity. |

This explains why features could appear to work before: retrieval, model calls, graph algorithms,
classifiers, cache helpers, and packet assembly can be operational without proving that their inputs
belong to this exact admitted cohort or that outputs were read back under the same revisions. The
new gate is about promotion evidence and cross-owner lineage, not the amount of metadata on an ACE
packet. The manual BitFrost warm task is correctly report-only until its ACE/ContextManifest input
exists; it does not close key derivation or live cache residency.

### Audit-evaluator limitation discovered during continuation (2026-10-01)

The current evaluator itself has a remaining integration gap. In
`scripts/atlas/audit-canonical-projection-fabric.mjs`, `PROJECTIONS_CHECKSUM_ALIGNED` is assigned
`NOT_PROVEN` unconditionally after the schema-column census, and `ACE_EVIDENCE_GROUNDED` is also
assigned `NOT_PROVEN` regardless of the legacy table count. The current saved audit independently
confirms that the required owner receipts are absent, so these verdicts are correctly fail-closed
today. However, once the existing projection and live ACE owners produce valid evidence, this
evaluator cannot consume it and will remain red until wired to those evidence owners. Track this as
an audit-integration task, not as permission to weaken either predicate or create a parallel table.
The `audit-current-source-cohort-projection-alignment-v1.mjs` artifact is not a substitute: it
compares local filesystem/source-cohort admissions and does not prove semantic, ordinal, Qdrant, or
production ACE readbacks for the admitted packet cohort.

A further read-only refresh attempt during this continuation reproduced the host protocol failure
at `127.0.0.1:5434`. A direct Windows probe to container-private `172.18.0.12:5432` also failed,
but Docker documents that Linux container bridge IPs are not routable from the Windows host under
Docker Desktop; that failure is expected and must not be diagnosed as a second defect. The published
mapping is present (`5434 -> 5432`); its listeners are `com.docker.backend.exe` and `wslrelay.exe`.
Inside the container, `pg_isready` reports accepting connections and `psql SELECT 1` returns `1`.
This localizes the observed discrepancy to the published-port protocol path, but does not identify
whether the fault is in forwarding, firewall/endpoint filtering, or protocol compatibility. No
Docker restart/remap or datastore mutation was attempted. The saved 5/11 report therefore remains
the latest complete admission result.

Credential/user reconciliation: the audit's `loadAtlasEnv()` reads `.env` and `.env.local` before
selecting `DATABASE_URL`; a sanitized runtime inspection showed the effective identity is
`legal_admin` at `127.0.0.1:5434` for `legal_ai_db`, and the live role exists. The literal
`legal_admin:123456` was only the script's old fallback and was not the effective configured URL.
Connectivity probes using that fallback did not authenticate because the published-port protocol
closed first. I also ran bare in-container `pg_isready` probes without a username; since `docker exec`
runs as root, these likely generated the observed `role "root" does not exist` log entries. This was
an avoidable diagnostic mistake; no successful session or data mutation resulted. The live
container's healthcheck is explicitly `pg_isready -U legal_admin -d legal_ai_db`. I removed the
fabric audit's hardcoded fallback so missing operator configuration now fails before connecting.
The live container's Compose labels identify root `docker-compose.yml` as its source and its
healthcheck is `pg_isready -U legal_admin -d legal_ai_db`. A separate standalone
`docker/docker-compose.gpu.yml` declares `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`,
and a `pg_isready -U postgres` healthcheck. That alternate definition conflicts with the live
identity and can account for `role "postgres" does not exist` when invoked, but it did not create
the currently running container. Do not use that standalone DB definition against the shared
`legal-ai-postgres` container/volume until its ownership/configuration is reconciled.

Primary documentation confirms executor behavior but cannot supply missing local provenance:

- [pgvector](https://github.com/pgvector/pgvector) uses exact nearest-neighbor search by default;
  HNSW/other ANN indexes trade recall for speed. This informs executor parity tests, not writer
  ownership.
- [Qdrant point operations](https://qdrant.tech/documentation/concepts/points/) state that
  re-uploading an existing point ID overwrites that point; the dedicated vector-update operation
  changes specified vectors while retaining unspecified vectors. Use a complete, revision-bound
  projection contract and readback; do not use a guessed ID or incomplete upsert to satisfy a gate.
- [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
  documents OpenAI-compatible chat completions and streaming. A successful streamed synthesis
  response is not proof that the request was grounded through the admitted resolver/ContextManifest.
- [Docker Desktop networking](https://docs.docker.com/desktop/features/networking/) and its
  [networking how-tos](https://docs.docker.com/desktop/features/networking/networking-how-tos/)
  document that published connections pass through `com.docker.backend.exe` and that Linux
  container-private IPs are not reachable directly from the Windows host. Use the published port
  for host probes; inspect backend/firewall/endpoint path next, without treating private-IP failure
  as evidence of stale forwarding.

No database, cache, Qdrant, graph, or model writes were made in this continuation. The next safe
action is to restore the host-to-PostgreSQL protocol path and then rerun the existing read-only audit;
until then, use the saved report above and keep owner-specific apply paths blocked.
