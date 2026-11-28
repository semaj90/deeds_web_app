# Tasks: parent-atlas-retrieval-lod-algorithm-taxonomy

## P24 current read-only recheck (2026-10-15)

Fresh bounded recheck: `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify` exited **0**, `QUALIFIED_SNAPSHOT_READBACK_PROVEN`. Saved stdout receipt `.tmp/atlas/function-discovery-getErrorClustering-20261015-current.json` (SHA-256 `4DA60E71C1203B16890C08F220843362B232A92718F1E6FA8C4266F27E25058C`). Canonical symbol and workspace revisions match; the callable projection's source/workspace revision differs from canonical (`projectionRevisionDifferenceCount=1`), so the projection is only discovery. The loader independently matched one 8095 native AST node and exact source bytes, producing the same packet/snapshot checksum as the existing proof. ContextManifest remains false; this recheck proves snapshot qualification only, not downstream retrieval admission.

Route handoff inspection (source-only, not a live HTTP proof): `sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts:118` gates the SearchRuntime registry supplement on the environment flag, configured repository root, and request workspace revision; `:123` creates the runtime with `readOnly: true`. The same route sets requested synthesis to `BLOCKED_CONTEXT_MANIFEST_REQUIRED` at `:180-181` and returns provenance with `ace: false` at `:213`. Thus, the production route has a fail-closed synthesis gate but no ContextManifest admission in this path. Do not enable its registry flag or relax the synthesis gate to claim completion; next implementation must connect the actual final selected candidate through the existing ACE selected-set/feature-row/AcePacket owners and prove readback. This is code inspection only; no route request or environment value was read.

Projection coverage diagnostic: `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=buildAceContextManifestAdmissionV1 --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify` exited **3** and emitted `INCOMPLETE` with zero callable-search candidates. Captured output `.tmp/atlas/function-discovery-buildAceContextManifestAdmissionV1-20261015.json` (SHA-256 `F88F0A9C1B05AC6C508D3B28B17D9CB12FE9F8489EC1D5AB571EEF4B2897BCA1`); no DB/cache writes. This single miss does not quantify full projection coverage, but confirms source-code presence alone does not establish callable-search discoverability.

ACE contract validation: from `sveltekit-frontend`, `npx vitest run src/lib/server/atlas/context/ace-context-manifest-admission-v1.spec.ts src/lib/server/atlas/context/ace-packet-v3-context-manifest-bridge-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose` exited **0**, 2 files / 20 tests passed; log `sveltekit-frontend/.tmp/atlas/ace-context-manifest-bridge-focused-tests-20261015.txt`. This proves the existing bridge contract rejects identity/checksum/revision mismatches and requires an admitted feature snapshot; it is not evidence that the live SearchRuntime route has such a snapshot or admits ContextManifest. Strict validation from repository root and scoped `git diff --check` exited **0**. No Svelte check was run.

Re-ran `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify`; exit **0**, `QUALIFIED_SNAPSHOT_READBACK_PROVEN`. One symbol version resolved through native AST node `3561bb301bdf5dcab4a7134afd843fb78da32acb`, packet `packet:804cec79a65c`, and exact source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`; snapshot checksum remained `242661a300928b3e860ac98aeecc7404856eb978de1152242be7bbc2a29c8091`. The PostgreSQL `signature_normalized` diagnostic is null for this row, but the registry adapter accepts the snapshot only after its separate sidecar signature and ancestry checks pass; it may use that parser-derived signature when the canonical column is null. This is one source-qualified snapshot, not a SearchRuntime→ContextManifest execution: `contextManifestAdmitted=false`, `writesPerformed=false`, `canonicalAuthority=false`. No feature flag, service, database/cache state, or document was changed. Keep P24 integration tests locked until their training/lineage gates pass.

## Latest P24 lineage evidence — AST storage-path repair (2026-10-15)

**PARTIAL; P24 gates remain unchecked and production function retrieval remains disabled.** Added the storage-only `ast-node-storage-path-v1.ts` crosswalk under the existing Function Registry. The PostgreSQL reader now uses the existing writer's complete repository-relative lowercase key without stripping `sveltekit-frontend/`, changing tree IDs, changing stored rows, or rewriting canonical source references. A bounded `source_paths` CTE requires exactly one canonical source binding for the folded key in the requested repository/workspace and requires that binding's exact source reference. Case-fold collisions and root/frontend namespace confusion fail closed. The read qualifier accepts a lossy stored-path mapping only with the explicit policy/source/stored-path binding, preserves the original canonical source reference in the snapshot, and rejects blank/whitespace signature or ancestry evidence. Source, packet, revision, repository UUID, digest, exact byte-span, and unique-node checks remain mandatory. This is a storage projection crosswalk, not a new identity owner or a fuzzy source alias.

**Validation:** From `sveltekit-frontend`, `npx --no-install vitest run --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/function-registry` exited **0**, **8 files / 36 tests**. From the repository root, `npx --no-install tsx --test scripts/atlas/lib/function-ast-writer-consumer-preflight-v1.test.mts scripts/atlas/lib/function-native-source-alignment-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs` exited **0**, **17/17**. `npx --no-install tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --types node sveltekit-frontend/src/lib/server/atlas/function-registry/ast-node-storage-path-v1.ts` exited **0** for the new isolated path helper; this does not replace the still-unverified full SvelteKit typecheck. Tests cover complete namespace retention, explicit mapping, unsafe paths, missing mapping, wrong root, stale source/workspace, ambiguity, and missing signature/ancestry; SQL assertions bind the canonical-path cardinality guard to the actual reader query.

**Live no-write follow-up:** `npx --no-install tsx scripts/atlas/audit-function-ast-writer-consumer-v1.mts --symbol-version-id=symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7 --ast-url=http://127.0.0.1:8095` exited **3 / BLOCKED**. On the same exact-source/native-parser seed and workspace, all seven writer/reader lookup fields now match, including `relative_path`; the independent live canonical path-binding read found exactly one source reference. The existing writer implementation/hash is unchanged. Current receipt `.tmp/atlas/function-ast-writer-consumer-getErrorClustering-20261015-03.json` has SHA-256 `a82dd93f420f235f1176a3926da4385e2e8a201207e3940b6938d3a5905f9b90` and binds the path-policy and qualifier source hashes as well as the writer/reader/audit. It still records **0 persisted AST candidates**, missing signature, unverified ancestry, **0 inserted rows**, `eligibleForApply=false`, `writesPerformed=false`, and `contextManifestAdmitted=false`. The earlier preflight receipts remain historical before/after evidence, not current admission receipts. No database/cache writes, DDL, service restart, GPU work, training, document editing, or feature-flag change occurred.

**Next gate:** Obtain exact signature and parent/ancestry evidence from the existing native parser owner, then extend the existing governed declaration writer/plan without inventing syntax facts or changing established identity policy. Prove that plan against the existing registry qualifier before seeking separate authorization for bounded AST materialization and independent readback. Only after a real node qualifies may the live Atlas request → existing AST lane/RRF → ContextManifest proof proceed. Repairing path compatibility alone does not satisfy P24-LINEAGE-01, P24-SNAPSHOT-02, or the integrated recommender/editor test lock.

## T1 — Taxonomy authored (this session)

- [x] Write `README.md` + `proposal.md`: 12-domain classification, three-engine substrate
      restatement, honest per-domain status against the live `src/lib/server/retrieval/` tree
      (198 files inventoried via `Glob`), explicit cross-links to the 3 sibling changes that already
      own adjacent concerns (fusion census, OKF layering, graph identity).
- [x] Confirm no duplication: read `parent-atlas-okf-knowledge-layers/proposal.md` (status
      vocabulary source) and `parent-atlas-graph-retrieval-proof/proposal.md` (identity-split
      blocker source) before writing, instead of re-deriving either.
- [x] Cross-link this change from the 3 siblings' README files (one line each, "see also"). Done
      2026-08-31: `parent-atlas-graph-retrieval-proof/README.md` already had it. Added one-line
      "See also" entries to `parent-atlas-retrieval-fusion-reachability/README.md` and
      `parent-atlas-okf-knowledge-layers/README.md`. T1 fully closed.

## T2 — Domain 10 (evaluation harness) — the one domain safe to start now

Everything else in the taxonomy is blocked on work already in-flight in sibling changes. Domain 10
is not — it can be built against the *current* CPU fusion pipeline and gives RF6 (fusion-owner
convergence) a regression harness to converge against, which RF6 doesn't currently have.

- [x] Reachability check completed 2026-09-01: existing evaluation harnesses and reviewer pool
      are present (`scripts/atlas/benchmark-retrieval-ndcg10.mjs`, `python/benchmark_*relevance*`,
      `.tmp/atlas/golden-relevance-review-pool-bound-v1.ndjson`). The pool validator reports
      60 queries / 2,433 candidates, zero structural errors, but 2,433 blank grades and zero
      revision-bound queries/candidates. This is an input-readiness finding, not a completed
      QRELS or baseline proof; see `docs/reports/golden-relevance-review-pool-validation-v1.json`.
      A separate read-only exact-text binding audit matched all 60 queue queries to existing
      `evaluation_queries` rows (`BINDINGS_COMPLETE`), but that does not supply query revisions,
      candidate revisions, or relevance grades; see
      `docs/reports/golden-review-query-binding-audit-v1.json` (2026-09-01).
      A representative queue row also has `candidateSnapshotRevision: null` and
      `ordinalMapChecksum: null`; its candidates have `candidateId`/`sourceRef` but no candidate
      revision fields. This confirms the remaining gap is artifact binding, not query-row lookup.
      A read-only comparison against
      `.tmp/atlas/ordinal-bridge-source/candidate-ordinal-map-v1-rebuilt-readonly.json` found
      2,247/2,433 exact `sourceRef` matches, zero ambiguous matches, and 186 unmatched rows.
      None of the unique matches are promotion-qualified because the map's `sourceRevision`
      value is `unknown`; this is `PARTIAL_REACHABILITY`, not a revision-binding pass.
      The existing exact producer was then attempted read-only with `--limit=32` into a separate
      temporary artifact and failed closed with `CANARY_EXACT_LINEAGE_COHORT_EMPTY`. No pool
      rewrite or database mutation occurred; the blocker is the absence of a qualifying live
      source/chunk/workspace cohort, not an unsafe fallback condition (2026-09-01).
      Predicate-level read-only census: the selected workspace binding and Graphify revision join
      has 111 exact rows; only 9 have a unique chunk hash; 0 have chunk content matching the
      bound source digest; and 0 have packet hash readback satisfying the final join. The next
      repair is source/chunk hash-owner reconciliation, not relaxing the exact query.
      The broader read-only cohort receipt reports 778 exact Graphify-source rows, 43 exact
      packet/chunk hash matches, 15 source/chunk-qualified rows, 0 graph revisions, and 0 fully
      qualified candidates (`docs/reports/lineage-qualified-candidate-cohort-v1.json`). The
      companion hash-authority audit records that packet, source, chunk, and artifact hashes are
      produced from different byte domains; they must not be compared as interchangeable values.
      Follow-up owner audits confirm the live state: `current-workspace-packet-chunk-join-v1`
      reports 111 binding rows, 111 Graphify exact sources, and 0 binding/chunk or packet/chunk
      content matches. `graph-revision-owner-v1` finds graph revisions in derived tables, but
      none bound to the canonical packet/chunk cohort; the available samples use incompatible
      workspace scopes. No graph revision was selected as a fallback.
      The hash-authority audit identifies a bounded future repair scope: 341 packets have a
      single distinct chunk hash, 332 are already populated, and 9 remain pending for a safe
      explicit backfill. The remaining 4,207 ambiguous and 57,112 no-chunk-hash packets remain
      excluded; no backfill was authorized or executed (`docs/reports/atlas-packets-content-hash-source-v1.json`).
      The bounded backfill dry-run selected exactly 9 rows, passed `CH_BF_01` and `CH_BF_02`,
      planned 0 updates, and performed 0 PostgreSQL writes. Apply, readback, and replay gates
      remain unset pending explicit authorization (`docs/reports/atlas-packets-content-hash-backfill-v1-dry_run.json`).
      A safety review of `atlas-packets-content-hash-backfill-v1.mjs` found that `--apply-bounded`
      currently has no explicit non-production authorization or database allow-list, no
      transaction-scoped advisory lock, and commits before its readback. Its NULL guard and
      bounded deterministic selection are useful, but they are not sufficient for promotion.
      Add `CH_BF_06 APPLY_AUTHORIZATION_AND_TRANSACTION_SAFETY` before any apply: require an
      explicit local/non-production database identity, dedicated authorization, xact advisory
      lock, repeatable-read transaction, full selected-key/hash readback, and rollback on any
      mismatch. No apply was attempted in this audit.
- [ ] CH_BF_06 — Verify the hardened bounded backfill apply path in a disposable non-production
      transaction fixture; require explicit authorization, local database scoping,
      `REPEATABLE READ`, a transaction-scoped advisory lock, full pre-commit readback, and
      rollback on mismatch. A dry-run or syntax check does not satisfy this gate. The
      unauthorized invocation guard is proven (exit 1 before pool creation); the transaction
      fixture and mismatch rollback proof remain open. The previously used disposable proof
      container is no longer present; the shared `legal-ai-postgres` database is not an
      acceptable substitute for this write-path proof.
      Fresh packet-hash audits still report 9 pending unique chunk-hash candidates, 4,207
      ambiguous chunk mappings, 57,112 without chunk hash, and 0 chunk/artifact hash agreements.
      Packet/source/chunk hash domains remain distinct; the 9-row backfill is eligible only after
      the disposable apply proof and explicit packet/chunk granularity decision.
      The narrower read-only chunk bridge examined 332 populated packet rows and found 15
      `EXACT_CHUNK_IDENTITY` rows, 74 source-only ambiguous rows, and 243
      `REVISION_UNPROVEN` rows (`docs/reports/chunk-bridge-v1.json`). Its `promotionEligible`
      flag applies only to exact chunk identity; it does not override the missing source/
      workspace/graph lineage required by the strict candidate materializer.
      The strict 15-row canary was correctly invoked through `npx tsx` (plain Node rejects
      `.mts`) and failed closed with `CANARY_EXACT_LINEAGE_COHORT_EMPTY`; no output cohort or
      database write was produced. This is the expected blocker until the current-workspace
      source/chunk revision bridge is repaired.
      The source-lineage census confirms the scope: 778 packets have exact Graphify source
      bindings, 885 source-revision bindings are available, 60,881 packets lack a Graphify
      source match, and the source-binding gate remains unproven (`cleanForBackfill: false`).
      Content integrity is proven only for the bounded exact subset; this does not authorize
      broad backfill (`docs/reports/graphify-packet-lineage-census-v1.json`).
      A separate current-source cohort audit narrows the defect: 111 rows are fully matched to
      the current workspace revision with zero missing, mismatched, or ambiguous source rows
      (`docs/reports/current-source-cohort-lineage-v1.json`). The remaining gap is specifically
      source/chunk content binding, not workspace-revision availability.
      Byte-scope reconciliation of the same 111-row cohort classified 96 as `UNPROVEN_SCOPE`
      and 15 as `MISSING_SOURCE`; packet spans are absent and no bounded exact whole-file
      agreement was proven. The report explicitly keeps packet backfill and projection cleanup
      blocked (`docs/reports/atlas-byte-scope-reconciliation-v1.json`).
      Live `codebase_chunk_index` inspection confirms it stores `line_start`, `line_end`,
      `content`, and `content_hash`, but no UTF-8 byte-start/byte-end fields. Exact line/chunk
      identity therefore cannot be upgraded to byte-scope proof without using the existing
      source-byte authority or adding a separately owned derived scope artifact; no schema
      change is authorized in this gate.
      The existing `atlas_ast_nodes` byte-span table was checked as a possible authority, but
      none of the 111 current Graphify source refs matched its `relative_path` or
      `source_ref_key`, and sampled rows are stale fixture data (`widget.c`). It cannot be
      substituted for the current source-byte/chunk bridge.
- [ ] If genuinely missing: scope a minimal harness — fixed query set with known-good top-k
      (hand-labeled or derived from the live entity trace already done in
      `parent-atlas-retrieval-fusion-reachability`), compute Recall@k / NDCG / MRR against
      `SearchRuntime`'s current output.
- [ ] Do not wire this into CI or a build gate yet — first pass is a standalone script, matching
      this repo's `DRY_RUN_PROVEN` before `APPLY_PROVEN` status discipline.

### T2 standalone harness progress — 2026-11-26

- **CREATED:** `scripts/atlas/evaluate-search-runtime-topk-reference-v1.mts` reuses the existing deterministic canary `scripts/atlas/fixtures/golden-retrieval-stability-v1.json`, invokes the real `SearchRuntime` with `readOnly: true`, requires canonical `packet_key` values, and calculates Recall@K, NDCG@10, and MRR against the fixture reference set. The fixture declares `DETERMINISTIC_REPLAY_NOT_HUMAN_RELEVANCE`; therefore the receipt calls these reference-agreement metrics and does not claim relevance quality. It is not wired to CI.
- **Adversarial probe:** harness guards rejected duplicate reference IDs and a result row lacking canonical `packet_key`; both are recorded true in the receipt.
- **Live replay command:** from `sveltekit-frontend`, `npx tsx ../scripts/atlas/evaluate-search-runtime-topk-reference-v1.mts` (rerun after adding compact backend diagnostics; exit 1).
- **Latest observed result:** `BLOCKED_RETRIEVAL_BACKEND_UNAVAILABLE`; SearchRuntime returned 0 retrieved, 0 fused, and 0 final packets. Four retrieval lanes reported `ECONNREFUSED` for PostgreSQL at `127.0.0.1:5434`; Qdrant version/collection validation also failed. `pagerankLaneCount=0`, metrics are null, and no live graph-authority evidence was produced. The earlier TCP health probe did not establish protocol/query readiness.
- **Receipt:** `.tmp/atlas/search-runtime-domain10-reference-eval-v1.json`; `gitHead=a0069da1c0dfaaae47a29fa10199c84056c262c1`; fixture checksum `sha256:f39a4f4277c40ee958592be739a760d5ada2233fb5cd49861fbfc03af51695cc`; runtime source checksum `sha256:1733c424a04d31c900234547c34c69090e59c6fce5013443ac456e0b5863a3e0`; harness checksum `sha256:98d9177b74d21ded822fea565913453881096e4cc2a5dc65a1c647e6394c6e4d`; `writesPerformed=false`, runtime `readOnly=true`.

**T2 status remains OPEN.** Harness creation and negative-input handling are present, but a nonempty SearchRuntime replay, reproducible metrics, source/workspace currentness, reviewed relevance judgments, and graph-authority readback are not proven. Do not close the task from this blocked replay.

### T2 live replay follow-up — 2026-11-26

- The read-only service health command `npm run services:health` returned `status: healthy`, `up: 13`, `downRequired: 0`, `downOptional: 0`. This TCP/service-health result is not retrieval proof.
- Replayed `npx tsx ../scripts/atlas/evaluate-search-runtime-topk-reference-v1.mts` from `sveltekit-frontend`. Exact stdout status: `REFERENCE_REPLAY_COMPLETED`. The script now distinguishes completed execution from reference agreement and records `resourceCleanup.postgresPoolsClosed: true`, so the standalone process exits after closing its PostgreSQL pools.
- Receipt `.tmp/atlas/search-runtime-domain10-reference-eval-v1.json` (`generatedAt=2026-11-26T21:36:12.283Z`; harness checksum `sha256:53b1150752268e01bb542d8b8ca5e82d7115c63156f35c5131e2fd18447f75ef`) records 6 retrieved/fused candidates, 4 reranked, 1 returned, and 4 canonical joins. The 15-ID reference comparison has **0 hits**: Recall@15 `0`, NDCG@10 `0`, MRR `0`, `referenceSetOutcome=NO_REFERENCE_OVERLAP`. Two `ambiguous_source_ref` warnings occurred; the XGBoost sidecar was unavailable and three candidates were removed by source-diversity post-processing. `writesPerformed=false`; `canonicalAuthority=false`.
- The prior `REFERENCE_REPLAY_PROVEN` status incorrectly meant only “a nonempty packet list exists.” It is replaced with `REFERENCE_REPLAY_COMPLETED`; the receipt explicitly says `BASELINE_CAPTURE_ONLY_NOT_PROMOTION`. This proves one live read-only replay and metric capture, **not** reference agreement, human relevance, or production readiness. The historical fixture is not human relevance gold.
- **T2 remains OPEN.** Resolve the stale/mismatched reference cohort and ambiguous source bindings, then capture a reviewed held-out relevance set before using these numbers as a ranking-quality baseline. No disposable PostgreSQL apply proof or byte-scope bridge was attempted.

### T2 reference dependency checkpoint — 2026-11-27

- **CREATED / UNIT_PROVEN:** `python/tests/oracles/manifest.json` pins the vendored offline oracle as test-only version `1.0.0` by SHA-256. `py -3.13 -m pytest python/tests/test_oracle_parity_v1.py -q` exited **0** with **10 passed**; the suite exercises the repository-local N-API binary when present and rejects malformed CSR input. This is a deterministic unit/reference result, not a live SearchRuntime replay or relevance baseline.
- **Current caller inspection:** `runNlutMaskedTopKStageV1` is defined in `sveltekit-frontend/src/lib/server/atlas/execution/nlut-masked-topk-stage-v1.ts`; source search found only that definition and its spec, with no application caller. Do not mark native SearchRuntime execution WIRED or DONE.
- **T2 remains OPEN:** no SearchRuntime/database replay was run in this checkpoint. The latest recorded live T2 receipt remains the 2026-11-26 `REFERENCE_REPLAY_COMPLETED` with zero overlap against the historical fixture and `canonicalAuthority=false`; a current revision-bound, reviewed query/candidate set is still required.

### T2 native edge follow-up — 2026-11-27

- Rebuilt only `simd-bridge/cpp/build-x64-cuda-scalar-safe` (`Release`, target `tensorrt_bridge`; exit **0**). Added native refusal coverage for zero-norm query/active rows, NaN/Infinity, fractional dimensions, and `int32` overflow; changed N-API integer parsing to require exact positive integers and computed bitset words without signed overflow.
- With `ATLAS_ADDON_PATH` set to the isolated scalar-safe binary, `py -3.13 -m pytest python/tests/test_oracle_parity_v1.py -q` exited **0**: **11 passed**. This is native fixture parity on the current host; it does not establish a non-AVX2 host run, application caller wiring, or live SearchRuntime quality.
- **T2 remains OPEN:** no live replay or datastore operation was performed in this follow-up.

### T2 reference identity crosswalk — 2026-11-26

- Read-only crosswalk: `.tmp/review/search-runtime-reference-lineage-crosswalk-v1.json`. All 15 fixture IDs map to rows in the historical `docs/reports/lineage-qualified-current-candidate-map-v2.json`, and all 15 source paths occur in snapshot `001fa407…`.
- The map is dated `2026-08-29`, declares `identityAuthority=false`, and carries workspace revision `sha256:b19b04b6…`. Its source revision matches the current capture for 14/15 rows. The remaining mismatch is `packet:6bd874a60226` (`crates/turbovec-napi/wrapper.js`): map revision `sha256:7eab75bf…`, captured revision `sha256:27ebb246…`.
- The current capture has `snapshotRevision=sha256:001fa407…`, `workspaceRevision=null`, and `CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK`. The derived workspace-revision receipt has `authority=false`, `workspaceRevision=null`; source-selection is `SOURCE_SELECTION_PLAN_BLOCKED`. Therefore the old map’s workspace revision is not a current admitted binding.
- This explains why the fixture is unsuitable as a current authoritative identity baseline, but does not authorize replacing its IDs with live SearchRuntime results. Keep the fixture unchanged; repair source/workspace admission and produce a reviewed, revision-bound reference cohort first. `identityAuthority=false` remains explicit; no identity promotion or datastore write occurred.

### T2 CH_BF_06 disposable PostgreSQL proof — 2026-11-26

- **CREATED / WIRED:** `atlas-packets-content-hash-backfill-v1.mjs --apply-bounded` requires explicit process authorization and a dedicated connection URL. The URL and database identity checks limit apply to the named fixture on loopback port 55434. Selection and full readback run on one connection in the same repeatable-read transaction with a transaction advisory lock.
- **PROVEN (disposable fixture):** `pwsh -NoProfile -File .tmp/review/prove-ch-bf-06-pg18.ps1` exited 0 with `{"status":"PASS","postgres":"18.4","commit":"9|9|9","repeat":"9|9|9","rollback":"9|0|0","fixtureStopped":true}`. Counts mean total, populated, and matched. The repeat selected zero and wrote zero. A fixture trigger changed the ninth hash, the script observed eight matches and refused the commit, and a separate read-only session verified zero persisted hashes and zero update timestamps. An explicit shared-database URL was rejected before connection with `CH_BF_06_DISPOSABLE_FIXTURE_REQUIRED` and exit 1.
- Receipt `.tmp/review/ch-bf-06-disposable-pg18-proof-v1.json` records the exact apply output, independent readback, revision `a0069da1c0dfaaae47a29fa10199c84056c262c1`, and the producer SHA-256. The fixture used a standalone local PostgreSQL 18.4 cluster. Shared database writes were zero. **DONE remains open** pending acceptance.
- Gate 1 replay `node scripts/atlas/audit-current-workspace-frame-admission-v1.mjs --output=.tmp/review/current-workspace-frame-t2-followup-v1.json` returned `EXECUTION_AUTHORITY_UNAVAILABLE` with `WORKSPACE_CURRENTNESS_READBACK_REQUIRED`, 52 exact source-revision matches and unknown workspace match counts. ACE task prefill and strict canary admission still require current workspace authority and their own byte-level readback.
- Read-only tournament preflight exited 1 with `CANDIDATE_ADMISSION_PREFLIGHT_BLOCKED` at `sourceInventoryHygienePass` (`.tmp/review/workspace-revision-t2-preflight-v1.json`). The fresh hygiene check of snapshot `001fa407…` exited 1 with `SOURCE_INVENTORY_HYGIENE_BLOCKED` and the sole blocker `SNAPSHOT_BYTES_READBACK_NOT_PROVEN` (`.tmp/review/source-inventory-hygiene-t2-v1.json`). An independent SHA-256 comparison found 15 byte mismatches among modified tracked files in the saved snapshot (`.tmp/review/workspace-snapshot-tracked-drift-t2-v1.json`). A fresh snapshot for the intended workspace is required before its cohort can support the byte-scope bridge.

## T3 — Domains 1–5 architecture change

**2026-08-08 update**: T3's "blocked until RF6" gate was overridden by explicit user direction
("three-engine substrate wiring"), scoped narrowly to the canonical spine only — see the
"2026-08-08 addendum" in `proposal.md` for the full disclosed-deviation writeup. Domain 1
(candidate fusion) remains untouched and still blocked on RF6 as originally planned — only domains
3/4/5 moved.

- [x] Domain 4 (`feature-matrix.ts`): built narrower than originally designed — a batched
      Postgres authority lookup (`fetchAuthorityScores`, `resolveAuthorityScore`), not a full N×F
      matrix builder. 8 tests passing.
- [x] Domain 5: **did not** create `packet-ranker.ts`. Found `runtime-reranker.ts::blendScores()`
      already correctly implements `S = X·W`-shaped weighted scoring — reused it instead of
      duplicating it (avoids repeating the Domain 1 13-owner anti-pattern one level down). Fixed
      the real bug found while wiring: `pagerankScore` + `graphScore` were both silently dropped
      before reaching this function (~15% of total blend weight always inert). See
      `search-runtime.ts` Score-stage diff.
- [x] Domain 3 upgraded incidentally: `atlas_graph_authority_scores` (confirmed live, 50,164 rows)
      is now a real feature input. **Confirmed via live query, not assumed**: the newer-looking
      Drizzle-typed `atlas_graph_authority_scores_v2` table is 0 rows — do not join against it.
- [ ] Domain 1 (candidate fusion, 13-owner consolidation) — still untouched, still RF6's job.
- [ ] Full N×F feature-matrix object (beyond the single authority column added here) — still
      future work, not done in this pass.

## T4 — Domains 2–3 (graph traversal + structural features) — blocked

Blocked on `parent-atlas-graph-retrieval-proof`'s `symbol_id`/`symbol_version_id`/`tree_node_id`
identity split landing (graph snapshot promotion is explicitly blocked there until that split is
proven). Do not design `graph-expand.ts` or `graph-authority-features.ts` before that lands — any
API surface designed against unstable identity will need to change anyway.

## T5 — Domains 6–9 (vector/ANN, quantization, storage residency) — blocked, GPU-adjacent

Explicitly deferred per standing session instruction: no CAGRA/cuVS/cuGraph/CUDA-GEMM/quantized-LOD
work until the identity/fusion foundation (RF4–RF6) is proven. When that gate opens:

- [ ] Domain 6 first (cuVS exact-brute-force oracle vs. Qdrant, recall parity gate) — this repo's
      own stated rule: "Recall@k(kANN) / k(kExact) until that passes your gate, don't replace
      Qdrant" — cuVS stays an oracle/experiment lane, not a replacement, until proven.
- [ ] Domain 8 (quantization) requires *measuring* `effective_rank`, `singular_value_decay`,
      `condition_number` on the actual `latent_128` data before assuming low-rank structure exists
      — do not default to INT4 packing on faith.
- [ ] Domain 9 (storage residency) follows domain 8, not before.

## T6 — Domains 11–12 (temporal coherence, learned promotion) — not investigated, do not design yet

Both are genuinely new capability, not renames of existing code. Before any design work:

- [ ] Domain 11 needs its own reachability pass over `context-buffer.ts` and ACE session state to
      establish what temporal state already exists, before proposing new state to carry forward.
- [ ] Domain 12 (execution-feedback-driven promotion) needs domains 1–5 and 10 solid first — there
      is no signal to learn promotion *from* until a stable ranker and an evaluation harness exist.

## T7 — Rust SIMD/TurboVec and bounded LOD residency — audit before integration

Repository audit (2026-08-14): Rust `simd-json` exists at
`simd-bridge/rust-simdjson` as an N-API library with Rayon; Rust TurboVec
bindings exist at `crates/turbovec-napi` and already depend on the local
TurboVec crate plus `simd-json`; the reachable TurboVec HTTP sidecar is
`scripts/ingest/turbovec-sidecar.py` on `:8791` and currently keeps its NumPy
vectors/index in process memory. `scripts/sidecars/turbovec-grpc-bridge.mjs`
is a compatibility bridge over that Python owner, not a proven Rust ANN
service. No 4 GB resident-working-set proof exists yet.

- [ ] **LOD-01** Produce a read-only memory census with separate measurements for canonical FP32 bytes, Python/NumPy RSS, Rust N-API RSS if built, Arrow/mmap virtual size, Arrow/mmap resident set, Qdrant memory, Valkey memory, GPU VRAM, index metadata, and ordinal-map size. Do not claim a 4 GB target until hidden FP32 duplicates are accounted for.
- [ ] **LOD-02** Freeze `SemanticSnapshotV1` plus ordinal/canonical identity mapping as the immutable source: workspace/source/representation/ordinal-map revisions, rows, dimension 768, float32, normalization, ordinal, `packet_key`, optional `symbol_version_id`, and checksum. LOD transitions may evict/reload derived indexes but may not delete or rewrite canonical truth. Prefer Arrow IPC/mmap for direct tensor access; do not substitute Parquet where direct mmap is required.
- [ ] **LOD-03** Define HOT/WARM/COLD artifacts: hot query/index pages, warm mmap/Arrow vectors and routing metadata, cold Postgres/source/Qdrant reconstruction. Every artifact must carry workspace, representation, source, and ordinal-map revisions.
- [ ] **LOD-04** Evaluate paged/mmap or shard-local TurboVec residency against the current in-memory Python sidecar. A 4 GB working-set target is accepted only with measured recall, latency, rebuild, and RSS evidence.
- [ ] **LOD-05** Choose one TurboVec execution owner and primary transport: existing Python `:8791`, Rust N-API, or an isolated Rust sidecar. Classify all other paths (gRPC bridge, CLI spawn, alternate HTTP) as compatibility, deprecated, or rollback; do not leave multiple live owners.
- [ ] **LOD-06** Benchmark Rust `simd-json` only for metadata/JSONL control paths such as snapshot manifests and receipts; never hex-encode or JSON-serialize the float32 vector bulk path.
- [ ] **LOD-07** Prove fail-open tier swaps: stale/missing hot state falls back to warm mmap/Qdrant; missing warm artifacts reconstruct from canonical sources; no cache/index artifact becomes identity truth.
- [ ] **LOD-08** Emit an immutable LOD receipt with tier, revision, artifact checksum, resident bytes, peak RSS, cache hit/miss, recall, latency, and fallback reason.

- [ ] **LOD-MEMORY-COMPRESSION-PROVEN** Report raw FP32 bytes versus compressed TurboVec bytes and ratio for the same snapshot.
- [ ] **LOD-PROCESS-WORKING-SET-PROVEN** Separately prove steady-state RSS, hidden FP32 duplicate absence, mmap resident bounds, index reload, and fallback behavior.

The proposed Neo4j GDS Python sidecar on `:8099` is also a future executor
boundary, not a currently proven listener. If implemented, it should compute
revision-qualified graph features from Neo4j GDS and return compact derived
features; it must not become a second graph or retrieval owner.

### TurboVec LOD refinement — 2026-08-14

The 31–32 GB to approximately 4 GB target is a quantization hypothesis, not
an mmap or swap result. TurboVec/TurboQuant may reduce the vector coordinate
representation; Arrow/mmap avoids eagerly copying the full-precision backing
store; simd-json only accelerates control-plane parsing. These are separate
measurements.

Keep residency and representation orthogonal. `COLD`, `WARM`, and `HOT`
describe where an artifact is resident; `FP32_MMAP`, `TURBO_4BIT`, `FP16`,
and similar values describe fidelity/encoding. They are not one combined
state and may evolve independently.

```text
COLD / FP32_MMAP    immutable Arrow IPC/mmap rebuild source
WARM / TURBO_2BIT   compressed candidate generator (later experiment)
WARM / TURBO_4BIT   first compressed candidate-generator target
HOT / FP16          selected high-fidelity RAM/GPU working set
HOT / FP32          exact or precision rerank working set
```

TurboVec local IDs remain ordinals. The ordinal map resolves them to
`packet_key`, `symbol_version_id`, and source/revision fields. The compressed
representation never replaces canonical `semantic_768`.

- [ ] **TV-LOD-01** Build a frozen `semantic_768` corpus from `SemanticSnapshotV1`; verify checksum, cosine metric, float32 source, and ordinal-map revision.
- [ ] **TV-LOD-02** Compare TurboVec 4-bit against exact cuVS on the same corpus: Recall@10/@50, top-1 agreement, identity parity, latency, RSS, and index size.
- [ ] **TV-LOD-03** Compare TurboVec 2-bit using the same oracle and measurements; keep it an experiment after the 4-bit gate and do not assign residency status before results exist.
- [ ] **TV-LOD-04** Verify filtered allowlist/slot-mask parity from canonical `SearchFilter` and routed ordinals; no post-search identity filtering may hide false positives.
- [ ] **TV-LOD-05** Prove candidate promotion: TurboVec ordinal candidates → Arrow/mmap FP32/FP16 rows → exact cuVS or approved hot CAGRA rerank.
- [ ] **TV-LOD-06** Choose one TurboVec production execution owner: Python `:8791`, Rust N-API, or an isolated Rust service. Prefer the isolated Rust service only if process-level memory/crash isolation outweighs N-API call overhead; keep the existing gRPC bridge compatibility-only and CLI spawn deprecated until ownership is proven.
- [ ] **TV-LOD-07** Add explicit memory-budget receipts: compressed bytes, mmap bytes, resident RSS, peak RSS, VRAM, page faults, rebuild time, cache transitions, and fallback reason. A 4 GB target is accepted only from measured evidence.
- [ ] **TV-LOD-08** Keep JSON/simd-json on the control plane (manifests, filters, receipts); use Arrow IPC/mmap or equivalent binary transport for vector bulk data.

### BitFrost-controlled promotion policy

### Review corrections — 2026-08-14

- cuVS brute-force is an oracle only when the metric contract explicitly sets
  `semantic_768`, float32, 768 dimensions, cosine normalization, score
  direction, deterministic tie-breaking, and the canonical eligibility mask;
  do not inherit a squared-Euclidean default from a toy fixture.
- Valkey Search capability exists, but the current production ownership choice
  remains BitFrost hot state/routing/cache and Qdrant persistent projection.
  Any future Valkey vector executor must be one selectable executor in the
  existing logical semantic lane, not another fusion vote or truth store.
- PostgreSQL 18 maintenance version is runtime evidence only. Do not record a
  specific minor version as current without probing `SELECT version()` and
  `SHOW server_version` on the workstation.
- Qdrant sparse/BM42 remains deferred because the live collection has no sparse
  vector slot; dense semantic proof does not require creating that schema.
- The LOD lane now has four explicit planes: Postgres truth, retrieval
  projections/executors, evidence expansion, and BitFrost memory/routing.

BitFrost/Valkey controls residency policy, not canonical vector truth. A cache
entry may contain routing metadata, an ordinal allowlist, a compact packet/card
reference, or a promotion decision; it must not be the only copy of a vector,
identity, ontology tuple, or ACE policy record.

- [x] **BF-LOD-01** Define and test pure `LodPromotionDecisionV1` with `packetKey` or ordinal, orthogonal residency/representation tiers, artifact and revision references, vector-payload versus resident-byte accounting, utility, policy revision, and timestamp. Implementation: `sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`.
- [x] **BF-LOD-02** Validate promotion/demotion decisions with the Zod contract boundary; invalid residency transitions, missing identity/revisions, out-of-range utility, and negative byte counts are rejected. Stale policy readback remains an integration gate.
- [ ] **BF-LOD-03** Persist promotion receipts and policy outcomes through the existing Postgres/Drizzle durable receipt owner; Valkey stores the revision-qualified hot state and may be rebuilt.
- [ ] **BF-LOD-04** Prove transitions `WARM/TURBO_4BIT → HOT/FP16`, `HOT/FP16 → WARM/TURBO_4BIT`, `WARM/TURBO_4BIT → COLD/FP32_MMAP`, and stale-revision eviction. No transition may mutate `packet_key`, `symbol_version_id`, ontology links, or canonical ACE state.
- [ ] **BF-LOD-05** Measure utility inputs separately: relevance, access frequency, graph authority, domain affinity, expected reuse, and memory cost. The policy chooses residency; SearchRuntime still chooses candidates and fusion.
- [ ] **BF-LOD-06** Keep ACE packet contents bounded and provenance-linked: packet/card references, selected evidence, policy revision, and ContextManifest hash; do not put full corpus vectors or hidden reasoning into Valkey.

Recommended receipt shape:

```json
{
  "schema": "atlas.lod-promotion.v1",
  "packetKey": "packet:...",
  "representationRevision": "semantic_768:r1",
  "artifactId": "semantic-snapshot:r1",
  "artifactRevision": "artifact:r1",
  "from": { "residency": "WARM", "representation": "TURBO_4BIT" },
  "to": { "residency": "HOT", "representation": "FP16" },
  "reason": "QUERY_REUSE",
  "utility": 0.87,
  "vectorPayloadBytesBefore": 384,
  "vectorPayloadBytesAfter": 1536,
  "residentBytesBefore": 4096,
  "residentBytesAfter": 3072,
  "policyRevision": "bitfrost:r3",
  "workspaceRevision": "workspace:r1",
  "sourceRevision": "source:r1"
}
```

`bytesBefore` and `bytesAfter` describe the selected artifact or resident
working set, not the size of a metadata key/value pair. Vector bytes remain in
Arrow/mmap, TurboVec, or GPU artifacts; identity and ontology relationships
remain in their canonical stores and projections.

Execution order for this lane is fixed as:

```text
LOD-01 memory census
  → LOD-02 SemanticSnapshotV1
  → LOD-05 single TurboVec owner
  → LOD-04 compression/mmap benchmark
  → exact cuVS comparison
  → LOD-03 HOT/WARM/COLD policy
  → BF-LOD promotion/demotion proof
  → LOD-07 fail-open swaps
  → LOD-08 durable residency receipts
```

## Implementation checkpoint — 2026-08-14

- [x] **BF-LOD contract implementation** Added the pure revision-qualified
  `LodPromotionDecisionV1` Zod contract and focused tests at
  `sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`
  and `.spec.ts`. It validates identity, revisions, allowed state transitions,
  utility bounds, and byte accounting without carrying vectors or canonical
  identity truth.
- [x] **BF-LOD focused proof** `npx vitest run
  src/lib/server/atlas/tensors/lod-promotion-contract.spec.ts
  src/lib/server/atlas/tensors/latent-lod-contract.spec.ts` passed: 2 files,
  7 tests.
- [x] **BF-LOD orthogonal tiers** Corrected the contract so residency
  (`COLD/WARM/HOT`) and representation (`FP32_MMAP/FP16/TURBO_4BIT/...`) are
  separate dimensions. Receipts now distinguish vector-payload bytes from
  actual resident bytes and carry artifact identity/revision.
- [ ] **BF-LOD live wiring** The contract is not yet connected to Valkey
  promotion/readback or Postgres/Drizzle durable receipts. Do not report
  BitFrost LOD promotion as live or complete.
- [ ] **LOD memory proofs** No memory census, TurboVec 2/4-bit compression
  measurement, hidden-FP32-duplicate check, or process working-set proof has
  been completed.
- [ ] **TurboVec owner** Rust N-API/sidecar ownership and the reachable Python
  `:8791` compatibility path remain unresolved; no production owner promotion
  occurred.
- [x] **LOD-01 census scaffold** Added the read-only command
  `npm run atlas:lod:memory:census` backed by
  `scripts/atlas/prove-lod-memory-census.mjs`. It records the census process
  RSS, optional snapshot/index artifact metadata, and explicit unavailable
  measurements without claiming service memory.
- [x] **LOD-01 initial run** Report written to
  `docs/reports/lod-memory-census.json`: the `turbovec` source tree was found,
  measured as 1,433 files / 560,505,533 bytes, but no frozen semantic snapshot
  or compressed index was supplied. Status is `PARTIAL_NOT_MEASURED`; both
  memory promotion gates remain `NOT_PROVEN`. Source-tree bytes are not index
  residency evidence.
- [x] **LOD-01 artifact audit** The supplied tree contains Rust source/build
  outputs and upstream benchmark JSON (for example `benchmarks/results`), but
  no Parent Atlas `SemanticSnapshotV1`, ordinal map, or workload-specific
  TurboVec index. Benchmark files remain reference evidence only and cannot
  promote `TV-LOD-02` or either memory gate.
- [x] **LOD-02 candidate input proof** Reused the existing
  `.tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson` as a
  read-only candidate input. `npm run atlas:lod:snapshot:input:proof` validated
  100/100 rows, 768 finite float values per row, zero duplicate packet keys,
  and zero duplicate source refs. It remains
  `CANDIDATE_VALIDATED_MANIFEST_INCOMPLETE` because workspace/source/
  representation/ordinal-map revisions and an immutable Arrow/mmap artifact
  checksum are absent.
- [x] **LOD-02 existing producer verification** Ran
  `npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts --verify`.
  The producer validated 5,000/5,000 exact 768-dimensional positive-norm rows
  and 5,000 unique packet keys, but only 4,999 unique source refs. The result
  is a verified 5K reference candidate, not a complete promotion proof until
  the source-ref collision is explained and the Arrow/mmap artifact plus full
  lineage manifest are accepted.
- [x] **LOD-02 registry correction** Fixed the producer root path and added a
  dedicated `vectorSnapshot5k768` registry entry. The generated manifest now
  carries `embeddinggemma-full768-v1` instead of the stale legacy 384 registry
  metadata. The prior misplaced `scripts/.tmp` artifact was not deleted.

## DAG-4 / Query Adaptive Synthesis (QAS) bounded seam

- [x] **QAS-00 owner audit** Added
  `scripts/atlas/audit-qas-owner.mjs` and command
  `npm run atlas:graphify:qas:owner:audit`. The current audit is
  `OWNER_AUDIT_PARTIAL`: Graphify and the QAS sampler are wired, while SOM,
  ContextManifest, exact promotion, Kanban linkage, and BitFrost policy are
  existing owners with adoption/proof gates still open.
- [x] Added the deterministic QAS sampler at
  `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts`.
  It uses query-conditioned feature weights and a stable hash seed to select a
  bounded candidate sketch. It emits `packetKey`, `sourceRef`, optional
  `symbolVersionId`, and proposal metadata only.
- [x] Added the non-mutating proof command
  `npm run atlas:graphify:qas:proof` and receipt
  `docs/reports/query-adaptive-sampling-proof.json`.
- [x] Wired a best-effort daily receipt step into
  `scripts/startup/run-graphify-daily-startup.mjs`. Missing candidate feature
  input produces `DEFERRED_NO_FEATURE_MATRIX` and cannot block Graphify.
- [x] **QAS-03 candidate input adapter** Added the read-only adapter
  `scripts/atlas/adapt-qas-candidate-input.mts` and command
  `npm run atlas:graphify:qas:input:adapt`. It rejects rows without complete
  identity, revision lineage, or all QAS features; the current run is
  `MISSING_INPUT` with zero rows written.
  `docs/reports/atlas-qas-candidate-features.jsonl` only from validated
  query-time feature rows. Every row must carry packet/source identity,
  workspace/source/representation/feature revisions, and all QAS feature
  values; the existing 25-column candidate matrix alone is insufficient for
  memory/promotion cost features and must not be silently padded.
- [ ] **QAS-04 exact promotion proof** Consume a real revision-qualified
  candidate feature matrix, fetch exact canonical evidence through
  SearchRuntime, and compare sketch recall/identity preservation against an
  exact baseline. No sampling result may invent a file, packet, or symbol.
- [ ] **QAS-05 receipt-to-Kanban linkage** Feed the QAS receipt into the
  existing Graphify recommendation/Kanban owner as an evidence reference only.
  Do not create a second recommendation ledger or mutate canonical truth.
- [ ] **QAS-06 offline GEPA/GRPO evaluation** Use execution receipts as an
  offline dataset only. No online policy-gradient update, LoRA stitching, or
  adapter composition is part of DAG-4 acceptance.
- [ ] **QAS-07 GPU/WebGPU/LOD promotion** Deferred until the semantic snapshot,
  exact baseline, GPU KNN/CAGRA, and residency receipts are proven.

## DAG-5 / live feature matrix and exact promotion

Scope rule: DAG-5 is a read-only analytical join/materialization lane. It
does not create a second retrieval owner or feature store. DuckDB is a later
read-only join backend; JSONL is the audit artifact and Arrow IPC is a later
compute artifact. simdjson, GPU sampling, BitFrost residency, Kanban, and ACE
remain deferred until the CPU exact baseline is proven.

- [x] **DAG-5A feature-row contract** Added
  `query-adaptive-feature-compiler.ts` with identity, workspace/source/graph/
  feature/representation revisions, task/domain metadata, core QAS features,
  and evidence references. It adapts existing candidate evidence; it does not
  create a retrieval universe.
- [x] **DAG-5A SearchRuntime bridge** Added
  `adaptSearchRuntimeCandidatesToQasRows` as a resolver-based, read-only
  boundary. It accepts SearchRuntime identity/revision envelopes plus feature
  rows from existing owners, rejects missing canonical IDs or provenance, and
  never treats `packetKey` as `canonicalId` or queries a backing store.
- [x] **DAG-5A existing matrix-owner bridge** Added
  `adaptCandidateFeatureMatrixRowToQas`. It maps the repository-native
  25-column query feature owner into the QAS core dimensions, including
  process fit, execution utility, and retrieval frequency, while requiring
  canonical identity and graph/task lineage as explicit inputs.
- [x] **DAG-5A read-only export harness** Added
  `scripts/atlas/build-qas-candidate-features.mts` and
  `npm run atlas:graphify:qas:search-runtime:build`. It consumes an explicit
  SearchRuntime candidate export plus an existing feature-owner context and
  writes only the regenerable QAS JSONL artifact. The current dry run is
  `MISSING_INPUT`; no canonical stores are touched.
- [ ] **DAG-5A SearchRuntime producer binding** The final `FeatureEnvelope`
  exposes dense, lexical, AST, authority, metadata, and recency signals, but
  does not consistently expose the complete QAS core set (`processAffinity`,
  `priorExecutionSuccess`, and `reuseProbability`) or a stable canonical
  symbol ID. Bind the existing query-time feature owner and identity join
  before generating live rows; do not derive or zero-fill those fields.
- **Owner trace note:** process metadata is available through the existing
  Qdrant payload enrichment path, retrieval-frequency counts are produced by
  the hotness job, and execution utility is owned by the trace utility
  compiler. These are separate producers; none is currently joined at the
  SearchRuntime query boundary. This remains a composition gap, not permission
  to treat cache hotness, demand utility, or packet text as equivalent QAS
  features.
- [ ] **DAG-5A producer reachability audit** Current repository search finds the
  25-column matrix builder and schema, but no live caller that emits
  `CandidateFeatureMatrixRowV1` for SearchRuntime results. This is now the
  precise blocker: attach the existing builder to the canonical query-time
  feature owner before invoking the export harness.
- [ ] **DAG-5A.1 SearchRuntime producer caller** Add one bounded caller where
  canonical SearchRuntime candidates and the existing 25-column feature owner
  are simultaneously available. It may emit only the regenerable
  `search-runtime-qas-candidates.raw.jsonl` artifact.
- [x] **DAG-5A.1 producer function** Added
  `buildSearchRuntimeQasRows`. It calls the existing
  `buildCandidateFeatureMatrix`, checks the presence mask for every QAS core
  column, and passes only complete rows through the identity/revision adapter.
  A live SearchRuntime call site is still required.
- [x] **DAG-5A.1 Atlas adapter helper** Added
  `projectAtlasSearchResponseToQas` at the existing Atlas SearchRuntime
  adapter boundary. It is read-only and requires external feature projections
  plus the existing identity/revision resolver; it does not change retrieval
  fusion or persist rows.
- [x] **DAG-5A.1 projection result contract** The helper now returns accepted
  QAS rows, categorized rejected candidates, and a same-request exact baseline
  from canonical SearchRuntime packets. File emission remains owned by the
  existing export harness.
- [x] **DAG-5A.1 owner-composition seam** Added the pure
  `search-runtime-qas-feature-resolver.ts` adapter. It composes injected
  projection/context owners, preserves missing evidence, and performs no
  store reads or writes. It is tested but not yet wired to a live producer.
- [x] **DAG-5A.1 response composition helper** Added
  `projectAtlasSearchResponseToQasFromSources`, which aligns the existing
  SearchRuntime packet envelope with injected owners before QAS validation.
  The helper is opt-in and leaves the SearchRuntime response unchanged.
- [ ] **DAG-5A.2 lineage join** Require canonical ID/symbol version, workspace,
  graph, feature, representation, request, and task lineage. Missing
  process/execution/reuse evidence remains `UNKNOWN` and rejects promotion; it
  is never zero-filled.
- [x] **DAG-5A.2 production path identified** The live path is
  `semantic-search-workflow.ts` → `createAtlasSearchAdapter().search()` →
  `SearchRuntime.search()`. It currently returns finalized packets but does
  not expose the complete query feature projection or graph/task revision
  resolver, so no incomplete observation was wired into the response.
- [ ] **DAG-5A.3 live artifact** Produce raw SearchRuntime rows, pass them
  through the existing validator, and promote the status to
  `LIVE_QAS_RAW_ROWS` only when all rows are revision-qualified.
- [x] **DAG-5A.3 harness emission contract** Extended the existing harness to
  accept the adapter projection result, emit accepted raw JSONL plus a
  same-request exact-baseline JSON, and report candidate/accepted/rejected/
  baseline counts. The current run remains `MISSING_INPUT` because no live
  projection envelope exists yet.
- [x] **DAG-5A adapter integration proof** Standard project Vitest now proves
  SearchRuntime packet identity → complete feature projection → strict QAS
  row → same-request exact baseline. The test is read-only; live service
  invocation and artifact emission remain separate gates.
- [x] **DAG-5A focused regression proof** The adapter and DAG-5 tests pass
  together (`7/7`). The owner audit remains `OWNER_AUDIT_PARTIAL`, and the
  export harness remains `MISSING_INPUT`; these results are expected until a
  real SearchRuntime caller supplies the existing complete feature projection.
- [x] **DAG-5C exact promotion contract** Added
  `query-adaptive-exact-promotion.ts`. Only revision-compatible resolver
  results become `EXACT_PROMOTED`; missing, stale, and revision-mismatched
  results remain explicitly ineligible.
- [x] **DAG-5D evaluator fixture** Added
  `query-adaptive-evaluator.ts` and
  `scripts/atlas/evaluate-query-adaptive-sampling.mts`. Fixture evaluation
  passed; it is not live recall evidence.
- [x] **DAG-5E daily receipt hook** Daily Graphify now emits a non-blocking
  evaluation receipt after QAS sampling. Current daily status is
  `DEFERRED_MISSING_INPUT_OR_BASELINE`.
- [ ] **DAG-5A live feature compiler binding** Produce the real
  `docs/reports/atlas-qas-candidate-features.jsonl` from the existing
  SearchRuntime candidate set and feature owners. The adapter seam is now
  `CREATED / FOCUSED_PROVEN`; the live candidate export and feature-owner
  resolver are still missing. Current repository evidence shows
  `buildCandidateFeatureMatrix` has no production caller and SearchRuntime
  packets do not consistently carry `process_fit`, `execution_utility`, and
  `retrieval_frequency`. Do not use task-candidate metadata, packet-text
  heuristics, or zero-filled matrix values as a substitute.
- [ ] **DAG-5B exact SearchRuntime baseline** Provide a revision-qualified
  exact top-K oracle and query set across task kinds/domains. No recall,
  overlap, MRR, or candidate-reduction claim is valid before this exists.
- [ ] **DAG-5B same-request oracle** Capture ordered exact IDs and QAS rows
  from the same request and revision tuple so evaluation cannot drift.
- [ ] **DAG-5F live recall/promotion proof** Evaluate budgets 128/512/2048,
  validate exact promotion, and emit the complete QAS receipt before any
  Kanban or ACE linkage.

### QAS bundle review

- [x] Reviewed `parent-atlas-qas-bundle`. Its contracts and owner audit are
  useful reference material, but `run-qas-shadow.mjs --json` reports
  `NOT_WIRED` and expects a separate `atlas/qas` owner path. It is not copied
  into the application as a second sampler or receipt owner.

## Reconciliation vs stale "End-to-End Gaps" doc (2026-08-22)

A July 13, 2026 status doc (`End-to-End Gaps: Domain Classifier + Cross-Reranker
→ XGBoost/RL`, not part of this OpenSpec change — a standalone note the
operator was re-reading) claimed 9 gaps in the `SearchRuntime` → promotion →
XGBoost pipeline, several flagged `❌ NOT WIRED`. Read `search-runtime.ts`
(the real `SearchRuntime.search()` method, 1359 lines) plus its downstream
promotion path in full and checked real callers (not just file existence,
per the Duplication Prevention rule in root CLAUDE.md) before trusting the
doc. Verdict: **the doc is 5+ weeks stale and wrong in both directions** —
some gaps it called trivial are still open, some it called missing are done,
just under different names/architecture than it assumed.

- [x] **Confirmed PageRank is live**, contrary to the doc's "not wired" claim.
  `neo4j-gds-client.ts::runPageRankClient()` runs a real
  `CALL gds.pageRank.mutate(...)`, with real callers
  (`graph-analysis-runner.ts`, `graph-analytics-service.ts`,
  `pagerank-analysis-adapter.ts`, `cheirank-analysis-adapter.ts`,
  `kcore-analysis-adapter.ts`). `pagerankScore` is consumed in
  `search-runtime.ts`'s Stage 3b blended score. This matches the Aug 9
  governance audit's finding that this is the one PageRank implementation
  (of 5 total) with a live runtime proof; the other 4 remain dead/fixture-only
  per `docs/architecture/runtime-ownership-baseline.json`.
- [x] **Confirmed SOM→Neo4j cluster fan-out is live** (doc's gap #8),
  predating even the July doc — `BELONGS_TO_CLUSTER` edges are written by
  `scripts/graphify-som-cluster-summaries.mjs` and consumed across
  `neo4j-gds-client.ts`, `graph-projection-manifest.ts`,
  `node-sync-neo4j-mirror.ts`, and others. No action needed.
- [x] **Confirmed Neo4j fan-out after Postgres write exists** (doc's gap #4)
  but as a narrower mechanism than the doc's proposed `promote-results-neo4j.ts`:
  `promote-results-outbox.ts` implements a transactional-outbox pattern with a
  `PROMOTE_NEO4J` operation; its `promoteNeo4j()` substage matches the
  `Packet` node by `packet_key` and creates a `RETRIEVED_BY → RetrievalEvent`
  edge (retrieval-history telemetry), updating only `summary`/`retrieved_at`/
  `updated_at` on the node. It does **not** currently propagate `latent_64`,
  `latent_128`, `domain_class`, or `title_id` onto the Neo4j `Packet` node —
  those land in Postgres only (see next item). If Neo4j-side topology
  properties for those fields are wanted, that is still a real, scoped gap —
  distinct from "no fan-out exists," which is false.
- [x] **Confirmed domain classification AND title generation are both wired**
  (doc's gaps #5 and #7, both called trivial/schema-only in the doc) — via
  `promote-results-outbox.ts::recordPromotionIntent()` → `enrichPacketSemantics()`
  in `src/lib/server/ace/promotion-enrichment-service.ts`, which calls
  `classifyDomainTaxonomy()` (from `src/lib/server/atlas/domain-taxonomy.ts`)
  and `generateTitleIdentity()` (from `src/lib/server/ace/title-id-generator.ts`).
  Both write `domain_class` / `title_id` / `title_generator_version` /
  `domain_classification` / `domain_class_source` to Postgres in the
  `PROMOTE_SUMMARY` stage. **Important nuance the doc missed**: this runs in
  Stage 6 (promotion), strictly *after* Stage 4 rerank and Stage 4b
  postProcess have already fixed `finalPackets`' order. So while domain
  classification is wired end-to-end for storage/labeling, the doc's
  specific ask — "domain-aware reranking boost" — genuinely is not done;
  classification never feeds back into ranking. Don't close that half of
  the gap by pointing at the promotion-stage wiring.
- [ ] **Domain-classifier duplication (new finding, governance-relevant per
  root CLAUDE.md "Duplication Prevention" / one-canonical-owner rules)** — at
  least 5 modules implement domain/taxonomy classification, only 3 have any
  real caller:
  | File | Export | Real callers | Role |
  |---|---|---|---|
  | `src/lib/server/atlas/domain-taxonomy.ts` | `classifyDomainTaxonomy` | `ace/promotion-enrichment-service.ts` | **CANONICAL_OWNER** for the live SearchRuntime promotion path |
  | `src/lib/server/ace/features/domain-classifier.ts` | `DomainClassifier` class, 13-class | `ace/features/feature-extraction-orchestrator.ts` | live, but a *different* pipeline (ACE feature extraction, not SearchRuntime promotion) |
  | `src/lib/server/enrichment/domain-classifier.ts` | `classifyDomain`, `DOMAIN_TAXONOMY` | `atlas/feature-doc-enrichment.ts` | live, but a third distinct pipeline (feature-doc enrichment) |
  | `src/lib/server/classifier/domain-classifier.ts` | `classifyDomainFromText` | **none found** | dead — this is the exact function name the July doc wanted wired; it was written but never called anywhere |
  | `src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts` | `classifyWorkstationDomain` | not checked for callers here | out of scope — belongs to the workstation chunking/summarization tool (tree-sitter + NLP sidecar + llama-server), unrelated taxonomy |
  Per the CLAUDE.md classification vocabulary, `domain-taxonomy.ts` should be
  recorded as `CANONICAL_OWNER` for the SearchRuntime/promotion capability;
  the ACE and feature-doc-enrichment classifiers are legitimate distinct-layer
  `CANONICAL_OWNER`s for their own pipelines (not peers to reconcile away);
  `classifier/domain-classifier.ts` is `DEAD` and should be flagged for
  archival (not deleted, per root CLAUDE.md archival rules) rather than
  reused — do not wire the July doc's exact suggested call
  (`classifyDomainFromText`) since that would resurrect a dead, unreviewed,
  differently-shaped classifier alongside the one already live in production.
- [ ] **Latent128/Latent64 status needs a dedicated read, not grep** (doc's
  gaps #2/#3) — both have substantially more real infrastructure than the
  doc's "schema only" claim (a `src/lib/server/atlas/contracts/*` subsystem:
  `canonical-chunk-contract.ts`, `dense-lane-policy.ts`,
  `cluster-feature-projection-v1.ts`, `classification-ledger-writer.ts`,
  `retrieval-router-feature-row-v1.ts`), but this session did not verify
  whether that infrastructure actually trains/encodes/persists a real
  768→128→64 latent end-to-end or is still contract/schema scaffolding
  without a live producer. Do not claim either DONE or MISSING for these two
  without reading that contracts subsystem directly.
- [ ] **E2E search→XGBoost test still does not exist** (doc's gap #9,
  confirmed) — no `search-to-xgboost` test anywhere. `train-baseline-xgboost.mts`
  and `train-xgboost-v2-with-domain.mts` exist as separate training scripts
  under `scripts/atlas/`; not verified here whether they actually consume
  `SearchRuntime` promotion output or a different, disconnected dataset path.

## Non-goals (repeat from proposal.md — do not action these under this change)

- No re-run of the RF2 13-implementation census.
- No attempt to unblock the graph identity split.
- No OKF concept-file registration until `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` lands.

## Reduction taxonomy reconciliation — 2026-09-06

- [x] Reconciled the DeepSeek/MLA/TurboQuant analogy as a taxonomy of reductions, not an
      equivalence claim. Parent Atlas keeps the full authoritative source/graph/`semantic_768`
      state separate from derived `latent_256`/`latent_128`/`latent_64`, neighborhood, partition,
      sampling, abstraction, residency, and token-admission projections. Every projection still
      requires its parent revision and checksum.
- [x] Confirmed no new `ReductionTaxonomyV1` owner is needed. The existing
      `algorithm-execution-manifest.ts` owns algorithm class/kind/backend/geometry metadata, and
      `contextual-prefill-fabric.ts` owns the validated derived-recipe contract. These already
      classify KNN, PageRank/PPR, KMeans, SOM, and `RANDOM_FOREST` as derived, non-canonical work.
- [x] Confirmed the existing `TaxonomyOrdinalMapV1` remains the ordinal projection owner and that
      graph results must continue to reattach through canonical graph identity before export or
      cache. GPU/CUDA is an executor dimension, not a new Atlas identity or logical retrieval lane.
- [ ] Forest reduction remains `NOT_PROVEN`: the contract accepts `RANDOM_FOREST` only through
      `CUML` or `CPU_REFERENCE` with a recorded seed, but this audit found no promotion-grade
      forest sampling surface. Any future implementation must consume an admitted feature matrix,
      emit a deterministic routing-only receipt, compare against an exact baseline, and never
      create candidate identity, an RRF vote, or canonical evidence.
- [x] Kept `semantic_768` as the canonical dense lane; `latent_256` is the physical learned
      reduction, and `latent_128`/`latent_64` remain nested derived views. Legacy 384 paths are
      compatibility/archival only and are not reactivated by this reconciliation.

This entry is a status reconciliation only. It does not authorize GPU work, forest sampling,
Qdrant/Neo4j/Valkey writes, or a new cross-cutting OpenSpec change. The next executable LOD work
remains the existing QAS live feature/compiler and exact-baseline gates after identity and
SearchRuntime prerequisites are satisfied.

## Reduction router implementation — 2026-09-06

- [x] Added the read-only `REDUCTION-ROUTER-01` bridge at
      `sveltekit-frontend/src/lib/server/atlas/classification/reduction-router-v1.ts`.
      It consumes the existing `QueryClassificationV2` plus an existing taxonomy scope and emits
      a checksum-bound reduction plan for exact filtering, optional taxonomy filtering, the single
      `semantic_768` KNN lane, optional graph/hyperedge expansion, and ACE context cards.
- [x] Wired the reduction plan into `compileQueryRouterControlPlaneV2()` as an additive derived
      result. It does not execute retrieval, call a provider, add an RRF vote, or authorize writes.
- [x] Explicitly deferred `RANDOM_FOREST` because the existing LOD contract has no promotion-grade
      forest surface. `semantic_768` remains canonical; `latent_256/128/64` remain downstream
      derived representations and legacy 384 is not reactivated.
- [x] Focused proof covers deterministic replay, graph fail-closed behavior, one semantic lane,
      non-canonical/non-voting steps, and absence of any `DEEPSEEK_API_KEY` dependency.

## LOD identity + representation evidence handoff — 2026-09-24

**TL;DR.** Read-only identity/provenance work ahead of `LOD-02`. Strict `SemanticSnapshotV1` is still
**BLOCKED, 0 eligible rows**: source/chunk lineage and recipe are proven for 6,774 rows, but no immutable
historical model-artifact digest exists. No datastore writes were performed. No `LOD-*` box below is
checked by this entry. Receipt: `docs/reports/parent-atlas/lod-02-representation-reproducibility-evidence-v1.json`
(commit `9950262810`, pushed).

### Gate state (evidence-safe)

| Gate | Status | Numbers |
|---|---|---|
| LOD-02A source/chunk lineage | PROVEN | 6,774 rows = `atlas_packet_chunk_lineage` (7,421 rows, 627 packets) joined to `content_embedding IS NOT NULL` |
| LOD-02C recipe identity | PROVEN | 6,312 `eg-task-prefix-v1` (`title: {relative_path} \| text:`), 462 raw/`unprompted-v0`; 6,297 metadata-corroborated, 477 recovered, 0 contradicted/ambiguous/unresolved |
| LOD-02C current-runtime reproducibility | PROVEN | fp16 RNE, <= 1 ulp per element (frozen before measurement): 6,774 pass, 0 fail; digest-exact 6,453 is a single-pass observation, NOT a stable invariant (Ollama varies ~1 ulp with batch composition) |
| LOD-02B representation binding | BLOCKED | `REPRESENTATION_EXACT` 0, `MODEL_REVISION_EXACT` 0; `atlas_representations.semantic_768` revision/digest fields are all `unknown`, `CANDIDATE`/`UNVERIFIED` |
| Strict `SemanticSnapshotV1` | 0 eligible | blocker = `MODEL_REVISION_UNRESOLVED` |
| `SemanticSnapshotReproducibilityCanaryV1` | NOT BUILT | 6,774 candidate rows; `canonicalAuthority=false`, `promotionEligible=false`, `historicalModelArtifactVerified=false` |

`representationEvidenceGrade = CURRENT_RUNTIME_REPRODUCIBLE` (orthogonal fields: writer `SUBSTANTIALLY_IDENTIFIED`,
recipe `PROVEN`, reproducibility `PROVEN`, historical artifact `UNRESOLVED`). Reproducibility is not provenance.

### Frozen policy: `QdrantPgIdentityResolutionV1` (`codebase_chunks_768`, `revisionQualified=false`)

Precedence: point ID <-> `codebase_chunk_index.qdrant_id` -> unique `source_ref`+`content_hash` -> consistent payload
`chunk_id` -> `atlas_packet_chunk_lineage` -> `atlas_packet_identity_aliases` -> unresolved.
Payload `qdrant_point_id` is deliberately NOT a V1 step; adding it requires a named V2 with an authority proof.

| Bucket | Points (of 328,348) |
|---|---|
| POINT_BINDING_CONSISTENT | 225,385 |
| CONTENT_HASH_MISMATCH | 493 |
| CHUNK_ID_LABEL_CONFLICT | 84 |
| DUPLICATE_PROJECTION | 82,866 |
| PLACEHOLDER_BACKFILL | 1,000 |
| ORPHAN (= no accepted owner under V1) | 18,520 |

`ORPHAN` splits: 18,449 payload-pointer-only (hash agrees on all; only 2,130 share `source_ref`, 16,319 point at
identical content under a different `source_ref`, so the pointer is not a safe identity owner) + 71 no owner by any
tested method. Earlier counts (226,350 / 100,350 / 71 / 90 / 100,331) came from different procedures; V1 supersedes them.

### Findings to preserve

- `qdrant_id` (varchar, unique, total) is a projection slot/address, not a revision identity. Families: 235,314
  `fullrepo:` rows = `hashToUuid(sha256("fullrepo:<relPath>:<idx>"))` (100% recomputed); 28,812 `card:` UUID rows =
  `sha256("<source_ref>:<idx>")[:32]` (no version bits); 3,539 numeric = `abs(javaHash(chunk_id))`; **~6,800 unexplained**
  (6,763 numeric + 37 blank) = projection debt, not a blocker.
- Qdrant `packet_key`: 222,010 UUID-shaped values all equal the point's own ID -> `PROJECTION_ID_MISLABELED_AS_PACKET_KEY`
  (not in `atlas_packets`/lineage/aliases); never add them to `atlas_packet_identity_aliases`.
- Two vector columns, almost disjoint: `content_embedding` (halfvec, 55,169, declared canonical) vs
  `content_embedding_768` (vector, 219,998; noncanonical). Only 739 rows have both, cosine ~0.90 (different recipes).
  `content_embedding_768` is a **dual write** from one fresh raw-text embedding by `scripts/atlas/index-full-repo-for-search.mjs`
  (99.75% `fullrepo:` rows), NOT a Qdrant->Postgres copy. 47,405 canonical-column rows have no Qdrant point.
- Postgres revision columns (`source_/workspace_/representation_revision`) are empty on 0 of 274,465 `codebase_chunk_index`
  rows; revision-qualified identity exists only in `atlas_packet_chunk_lineage`.
- Historical writer for the tagged cohort: `scripts/atlas/reembed-corpus-document-prefix-v1.mjs`, run 2026-08-25, Ollama
  `embeddinggemma:latest` alias, no digest recorded. Receipt defect kept verbatim:
  `WRITE_FLAG_CONTRADICTS_REPORTED_UPDATE_COUNT` (52,324 updated, `writesPerformed:false`).
- **Retraction:** `embedding_version='qdrant-backfill-v1'` on cohort rows is a stale label from the retired 384 backfill
  (`backfill-content-embedding-384.mjs`); it is not vector provenance.
- TurboVec: `sveltekit-frontend/scripts/turbovec-sidecar.py` = RUNTIME_OWNER of `:8791` (live Qdrant scroll, no snapshot
  authority, stride-12 768->64, INT4, loaded at process start); `scripts/sidecars/turbovec-grpc-bridge.mjs` = ADAPTER
  (`:50062`); `scripts/ingest/turbovec-sidecar.py` = LEGACY; Node MCP sidecar is a separate `:8792` service (not a `:8791`
  competitor). The live index (327,820 vectors) cannot support any compression/recall claim.
- **TurboVec runtime recheck (2026-10-07, read-only):** existing `scripts/atlas/turbovec-sidecar-health.mjs`
  returned HTTP 200 from `127.0.0.1:8791/health`, but reported `indexed=0`, `dim=64`, `bits=4`, and `turbovec=false`.
  This supersedes the older live-count observation as current runtime state; it does not prove an empty canonical corpus
  or a retrieval failure. No index/search request or service operation was performed. Keep frozen-snapshot, model-revision,
  owner-decision, and recall gates open; do not benchmark or promote TurboVec from this health response.
- **Frozen-corpus artifact audit (2026-10-07, read-only):** an existing 5,000-row vector snapshot manifest
  (`.tmp/atlas-vector-snapshots/vector-snapshot-5k-768-manifest.json`, generated 2026-08-25) records 5,000 vectors,
  but only 4,999 identity-parity rows, 4,999 unique source refs, and a legacy `embeddinggemma-full768-v1` label; it has
  no workspace revision or independently bound model-artifact checksum. It is not admitted as the benchmark truth set.
  The 14,564-row candidate ordinal corpus/receipt is from workspace revision
  `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, generated 2026-09-29, and explicitly
  reports `fullAdmittedRootCoverage=false`; its matching receipt does not bind those rows to the 5,000-vector snapshot.
  A separate 4,951-row admission receipt has `downstreamAllowed=false` and a fallback `workspace-active-v1` snapshot
  revision. These artifacts cannot be combined or substituted for one frozen, identity- and recipe-qualified corpus.
  **Gate remains `BLOCKED_FROZEN_TRUTH_SET_GATE`;** no approximate-vs-exact benchmark or index build was run.
- **Small-cohort cross-check (2026-10-07, read-only):** `docs/reports/lineage-semantic-768-cohort-v1.json` is a separate
  15-candidate cohort generated 2026-09-15. Its rows have content-qualified source revisions, but the per-row
  `semanticRevision` includes `encoder-unspecified` and the cohort has no single independently attested
  `representationRevision`; it is therefore not a TurboVec benchmark truth set. This confirms that simply shrinking
  the old 5K population does not fix recipe qualification.
- Existing `SemanticSnapshotManifest` (`tensor-artifact-contract.ts`, `atlas.semantic-snapshot.v1`) cannot express the
  cohort (fixed float32, single `sourceRevision` vs 558, non-empty `representationRevision`). Do not fork a second
  snapshot owner; the canary layers on it by id.

### Code (committed and pushed in `9950262810`, tests pass)

`sveltekit-frontend/src/lib/server/atlas/tensors/semantic-snapshot-reproducibility-canary-v1.{ts,spec.ts}` (commit
`9950262810`): frozen fp16 classifier + noncanonical evidence envelope; 19/19 tests. It is a contract, not the snapshot.

### Open (all unchecked; none authorized yet)

- [ ] **LOD-02B** Recover an immutable historical model artifact digest for the 2026-08-25 run, or leave `MODEL_REVISION_UNRESOLVED`.
      Further alternate-artifact testing (Q8_0 etc.) was rejected as unable to close this gate. Any `atlas_representations`
      update needs recoverable evidence for every field plus operator approval; do not write it from circumstantial evidence.
- [ ] **Canary build** (separate authorized tranche): deterministic ordering -> ordinal map -> cohort/vector checksums ->
      Arrow/mmap -> reload parity -> exact 768 baseline -> 64-d/INT4 recall + memory comparison. Must not be named
      `SemanticSnapshotV1`.
- [ ] **LOD-05** Decide the single TurboVec owner in code (owner census above is done); the live `:8791` load must not be used
      as a compression/recall baseline until a frozen snapshot exists.
- [ ] **Owner decision:** which column is canonical `semantic_768` (`content_embedding` per policy vs the larger,
      Qdrant-aligned `content_embedding_768`). Not decided here.
- [ ] Projection debt: 82,866 duplicate projections (concentrated in ~4,500 chunks), 47,405 canonical rows with no point,
      ~6,800 unexplained `qdrant_id` rows. Needs a bounded cleanup gate with retrieval-parity proof; no deletes yet.

### Restart rule

Completed evidence + missing input or approval => WAITING => STOP. Do not scan the OpenSpec board and pick another change.
Scratch per-row measurement ledgers were kept only in the session scratchpad and are not persisted.
## Canonical-state correction — 2026-10-14

- Canonical dense representation is `semantic_768` (EmbeddingGemma, 768-d). The 384 representation is retired from active retrieval; 384 references above are historical and are not current canonical claims.
- Latent/MRL facts (code is authoritative; root `CLAUDE.md` "Autoencoder latents"): `z128` is a learned bottleneck, not a slice of `z256`; `z64 = normalize(z128[:64])`; MRL prefix `v_k = normalize(v_768[:k])`. Existing `latent_128` rows described as a slice of `latent_256` must be re-verified before citation.
- Parity canonical contract is `codebase_chunks_768_v2`; `codebase_chunks_768` is legacy.
- This note changes no database, Qdrant, or runtime state.

## Retrieval learning and topology experiment tranche — 2026-10-14

These are separate algorithm families, not interchangeable forms of low-rank approximation. Reuse their current owners; keep every challenger advisory until its own evidence gate passes.

## AST language dispatch and sidecar evidence — 2026-10-15

- **Svelte dispatch and current sidecar fixture slice (2026-10-22):** the existing structural-language resolver now maps `.svelte` to the sidecar's `svelte` parser; this does not add Svelte to the evidence-source-kind taxonomy or route it through ast-grep. Direct resolver assertions pass. The live 8095 capability response advertises 14 extension bindings and 8 sidecar language labels. One revision-matched fixture per label (TypeScript, TSX, JavaScript, Python, Rust, Go, Java, Svelte) returned clean chunks; all byte spans passed strict UTF-8 boundary validation. Checksum-verified receipt: `.tmp/atlas/language-coverage/parser-fixtures-verified-20261022T182704026Z/sidecar-parser-fixtures.json` (`d7212c99732d8f38150138f7564279cf917a99db8348076929213d049569e695`). This is one-fixture-per-label evidence only, not 140-language support or repository-wide parser coverage. Focused Vitest did not report results and was stopped; full test validation remains open. No database, Graphify, cache, or canonical writes occurred.

- **Fixture receipt checksum correction (2026-10-22):** the prior paragraph's claimed embedded checksum for the first fixture receipt did not verify against its canonical body; that historical receipt is not relied upon. A fresh live run produced `.tmp/atlas/language-coverage/parser-fixtures-v2-20261022T183359872Z/sidecar-parser-fixtures.json` (canonical digest `39c67f59cecba7aa4208e61c2f35d5a134368f584aa78c56a55e5d3c7064d08c`), and the successful eight-label fixture evidence join is `.tmp/atlas/language-coverage/evidence-join-v2-20261022T183421Z/inventory-evidence-join.json` (join digest `854b1f685de2f7a902a8d275a169e7663ca55c3949a7415ee4d1a6b01f70a5b0`). Compiler/LSP validation remains 0; whole-repository parser coverage remains unestablished. This correction changes no structural resolver or evidence-source taxonomy status.

- The local `@ast-grep/napi` extractor previously defaulted unknown hints to TypeScript and retried failed parses as TypeScript. It now accepts only explicit JS/TS/JSX/TSX hints or extensions and abstains on Python/unknown languages; LSP `javascriptreact` and `typescriptreact` IDs are mapped explicitly.
- Focused parser/provider validation passed 3 files / 15 tests; log `.tmp/atlas/ast-language-dispatch-tests-20261015.txt`.
- Read-only 8095 `/health` and `/ast/chunk` returned Tree-sitter chunker 4.0.0, 16 chunks, and a revision-matched `structuralLaneHitsToCandidates` observation with native node/chunk/file/symbol IDs, exact span, signature, and ancestry. Receipt `docs/reports/atlas-ast-sidecar-observation-readonly-20261015.json`, SHA-256 `CE1BEE06C9C33E22B27E16E2D512555D654C90F91F8850792D97B4226DD70AF6`; `canonicalAuthority=false`, `writesPerformed=false`.
- Read-only Python fixture replay through the same 8095 endpoint returned one `calculate_score` function chunk with `language=python`, revision echo, and native chunk/node IDs. Receipt `docs/reports/atlas-ast-python-sidecar-observation-readonly-20261015.json`, SHA-256 `2A878AA50F7897FF8982A1664D970E457E4638E6A3FFEEDE17210AD07D587C1A`; fixture-only, no DB/SearchRuntime/ContextManifest call.
- CLI grammar support does not imply that the installed N-API binding has every grammar enabled. Keep 8095 Tree-sitter as the broad-language observation provider; do not spawn a per-language executable or treat `codebase-memory-mcp`/N-API as parser identity owners absent a proven capability gap.
- Added `structural-language-dispatch-v1.ts` and threaded optional `languageId` through the existing Graphify structural batch input. The helper normalizes a bounded current language set, prefers an explicit LSP ID, checks explicit-hint and file-extension conflicts, and rejects unknown languages instead of guessing. This is dispatch metadata only; it does not create AST facts, canonical identity, or revisions.
- `@ast-grep/cli` and `@ast-grep/napi` are distinct execution surfaces: the CLI can select built-in grammars such as Python, while the installed local N-API extractor is currently JS/TS-family only. Keep the CLI as an offline/explicit tool rather than spawning `.exe` per file in the live path. `codebase-memory-mcp` is not a parser substitute or identity owner. The existing 8095 Tree-sitter provider remains the broad parser lane; exact native node/span joins and downstream retrieval admission are still separate gates.
- The focused Vitest invocation did not complete in this workstation session and was interrupted; no test pass is claimed. Re-run the new dispatch spec and the existing Graphify batch/parser specs before treating the helper as proven.
- [ ] Add a typed non-JS structural adapter (initially Python) through the existing AST lane, consuming 8095 Tree-sitter chunks directly (not pretending they are AST-grep matches), using explicit LSP `languageId` when available, exact source/native-ID/span joins, and fail-closed language conflict handling. No second registry or fusion vote.
- This verifies parser observation only. The adapter has no production caller; SearchRuntime and ContextManifest admission remain unproven and P24 remains PARTIAL.

- [ ] **EXP-01 — Freeze the experiment cohort.** Use revision-qualified canonical candidate identities, source/evidence references, a frozen candidate snapshot, and an exact CPU Top-K oracle. Record query/repository grouping and independently reviewed relevance labels; without labels, supervised ranking remains `NOT_RUN`.
- [ ] **EXP-02 — Separate candidate generation from ranking.** Compare existing PostgreSQL FTS/trigram, semantic, AST, and bounded graph-expansion candidates by Recall@K against the exact oracle. In this repository, `bm25-search.ts` is a compatibility-named PostgreSQL `tsvector`/`ts_rank` path, not evidence of a standalone BM25 implementation; do not add a second sparse index under the BM25 name.
- [ ] **EXP-03 — Preserve one fusion owner.** Normalize and deduplicate by canonical identity and logical lane, then retain the existing SearchRuntime/RRF and stable Top-K/pagination contracts. Qdrant, cuVS exact, and CAGRA are alternative semantic executors, not extra semantic votes. Compare rerankers on the same frozen candidate pool separately from candidate-generation recall.
- [ ] **EXP-04 — Evaluate unsupervised representation challengers independently.** On one frozen, lineage-complete matrix, compare PCA/TruncatedSVD against the exact full-dimensional baseline; measure numerical correctness, reconstruction/variance, Recall@K, MRR/NDCG, latency, and memory. Any KMeans/SOM routing must report candidate recall lost versus global exact Top-K and must not assign identity or add an RRF vote.
- [ ] **EXP-05 — Gate supervised challengers on reviewed labels.** Compare Naive Bayes, logistic regression, XGBoost, then MLP using query/repository-grouped train/validation/test splits. Fit normalization only on training folds; record model/feature revisions, leakage checks, ranking metrics, calibration (Brier/ECE where probabilities are claimed), latency, and fallback parity. Do not train on synthetic labels or equate retrieval frequency with relevance.
- [ ] **EXP-06 — Keep HMM and spelling assistance in routing/lexical scope.** Evaluate HMM routing on real, revision-qualified execution traces and bounded tool budgets. Evaluate `did-you-mean` as a separate lexical suggestion on typo fixtures; preserve the original query and never silently replace it or create canonical candidates from suggestions.
- [ ] **EXP-07 — Compare graph executors on the same frozen graph.** Preserve directed typed edges and N-ary role incidence. Compare Neo4j traversal with the existing Python/NetworkX reference using identical graph revision, qualified endpoints, hop/fanout budgets, and checksums; compare result identities and direction, not just counts. Any undirected projection is a separate analysis input. cuGraph is optional acceleration only after CPU parity and resource approval.
- [ ] **EXP-08 — Restrict interpolation to a qualified grid.** Trilinear/tricubic interpolation is not a general embedding-ranker or quantum-like Top-K method. Use interpolation only for a defined regular-grid/SOM visualization or field approximation, document the chosen continuity constraints, and test against direct grid values. It must not change retrieval ordering or evidence admission.
- [ ] **EXP-09 — Emit a joined experiment receipt.** Bind request/query-set checksum, canonical candidate snapshot, source/workspace/graph/feature revisions, algorithm/backend versions, random seeds, exact commands and exits, metrics, memory/latency, and write counts. Report missing labels, lineage, or runtime as `BLOCKED`/`NOT_RUN`; no database, Qdrant, graph-store, or cache writes are authorized by this tranche.
- [ ] **EXP-10 — Qualify Tang-inspired sampling before any prototype.** Document the exact data-access model, ℓ²-sampling/query assumptions, preprocessing and storage costs, and supported output guarantee. Compare total cost and sample quality on the same frozen feature matrix; do not describe it as exact or faster Top-K without end-to-end evidence. If the access assumptions cannot be met by existing owners, record `NOT_APPLICABLE` and do not add an index.
- [ ] **EXP-11 — Keep peripheral research claims scoped.** Treat quaternion/QVM as out of scope unless an actual rotation workload exists; treat AlphaGo self-play as an analogy only, not an Atlas unsupervised-training method. Any TabFM comparison must identify the exact model/configuration, benchmark, hardware, memory, and latency, and use the same frozen, independently labeled Atlas dataset as logistic/XGBoost baselines.
- [ ] **EXP-12 — Qualify native and probability boundaries.** Record that Node-API stabilizes the Node-facing ABI only; LibTorch/CUDA/TensorRT C++ ABI, compiler/runtime compatibility, and buffer lifetime require separate native tests. If an MLP emits probabilities, use a separate held-out calibration set and report Brier/ECE; otherwise report an uncalibrated score, not confidence.

## LOD → ACE → residency implementation handoff — 2026-10-14

- **Existing-owner inventory:** LOD fidelity/promotion contracts are `sveltekit-frontend/src/lib/server/atlas/tensors/latent-lod-contract.ts` and `lod-promotion-contract.ts`; advisory hot/warm/cold scoring and byte budgeting are in `sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-residency-warming-v1.ts`; bounded state transitions are in `bitfrost-token-fsm-v1.ts`; descriptor and GPU-budget seams are in `unified-residency-adapter-v1.ts` and `gpu-memory-admission-v1.ts`. PCA/SVD baselines are in `python/pca_svd_representation_baseline_v1.py`; KMeans/SOM have existing Python and LibTorch-facing owners. cuTile/SIMT files under `python/atlas_cuda_cutile_simt_*_probe_v1.py` are probes, not a promoted retrieval kernel. The audit found no production Atlas workload for UMAP, RoPE/YaRN as retrieval transforms, PolarQuant/IsoQuant, or quaternion/QVM; they remain out of the runtime path.
- [x] **LOD-ACE-01 — Bind residency descriptors to admitted Top-K (contract-level).** The descriptor bridge validates the `AceContextManifestAdmissionV1` contract, snapshot/ordinal-map identity, selected candidate IDs, selected-ordinal checksum, and source-revision-set checksum before preparing descriptors. It emits descriptors only for manifest-selected rows. Focused subset, tamper, and missing-selection cases pass in the isolated test run below; this is fixture-backed contract proof, not a live ACE or retrieval receipt.
- [ ] **LOD-ACE-02 — Prove representation and residency execution.** Feature-pack residency now carries a separate SHA-256 payload checksum; the existing artifact checksum continues to bind the complete pack. Descriptor validation binds shape × dtype to exact byte length, and unsafe shape products fail closed. `UnifiedResidencyAdapter.load` rejects missing or mismatched payload checksums before residency and checks both reported and actual view lengths. **Local validation:** 3 focused files, 17 tests passed with `cd sveltekit-frontend; .\node_modules\.bin\vitest.cmd run --config vitest.lane-contracts.config.ts --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/tensors/unified-residency-adapter-v1.spec.ts src/lib/server/atlas/tensors/unified-residency-feature-pack-v1.spec.ts src/lib/server/atlas/tensors/unified-residency-ace-bridge-v1.spec.ts` (exit 0). This is a CPU-side fixture/provider proof, not immutable artifact-service readback, physical GPU allocation, or cache persistence. CUDA/SIMT tile execution and persistent GPU residency remain unproven.
- [ ] **LOD-RESEARCH-01 — Keep algorithm families distinct.** PCA/SVD are projection baselines; KMeans/SOM are advisory coarse-routing/visualization; UMAP is analysis/visualization; RoPE/YaRN are model positional/context mechanisms; PolarQuant, IsoQuant, quaternion/QVM, and ℓ²-sampling remain research or not-applicable unless a measured Atlas workload and frozen evaluation qualify them. None may alter canonical `semantic_768`, create an RRF vote, or bypass evidence admission.

## Ingestion → retrieval → agent integration handoff — 2026-10-14

Requested audit scope: Rust/simdjson, PostgreSQL storage and index choices, Tree-sitter fanout, TurboVec/cuVS/RAPIDS/LibTorch, DAG prefill, SearchRuntime, tRPC/MCP, HMM routing, and Mastra. This is an owner/caller audit, not a live end-to-end proof. No migration, index build, corpus ingestion, cache write, or GPU job was run.

| Stage | Existing owner | Current evidence | First unresolved proof |
|---|---|---|---|
| JSON/NDJSON control input | `simdjson-typed-evidence-bridge.ts` plus the native parser wrapper | Bounded streaming parser, UTF-8 validation, per-record schema admission and fixture tests exist. The wrapper loads `tensorrt_bridge.node`; the Rust `simd_bridge_rs` crate has Rayon and async N-API exports but the repository's normal `fastJsonParseWithBackend()` path does not load it. `worker.cjs` is a separate adapter and no production caller was found in the main app path. | Select one actual runtime owner; exercise the built artifact through its real caller and report parser backend, byte/line ceilings, accepted/rejected counts and checksum parity. Rust unit tests alone do not prove Node addon load or app wiring. |
| Canonical packet/source and binary payload | PostgreSQL packet/lineage schemas and existing `bytea` owners | `bytea` is used for binary packet/vector artifacts; canonical identity remains PostgreSQL-owned. | Prove one admitted immutable source/packet readback and exact checksum/revision join. Do not store dense-vector bulk data as JSON, hexadecimal text, or TOON. |
| Metadata and lexical indexes | Existing JSONB, B-tree, and `tsvector`/GIN owners; `bm25-search.ts` is PostgreSQL FTS compatibility naming | Existing owners and migrations are present. `tsvector`/GIN is a lexical path; JSONB GIN and B-tree serve different predicates. | Read-only schema/data census plus `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on representative queries before proposing DDL. BRIN is only a candidate for physically correlated range columns after measurement; no required BRIN or Merkle-tree owner was established. |
| Tree-sitter / AST fanout | 8095 parser/AST owners and existing AST retrieval lane | Structural extraction and retrieval contracts exist. | Replay the same frozen packet through parser → source-byte span → canonical packet join; bound fanout, worker count, retries, timeout/cancellation and report partial failures. |
| Dense retrieval / ranking | PostgreSQL canonical `semantic_768`; Qdrant projection; SearchRuntime owns normalization, dedupe, RRF and Top-K | SearchRuntime, FTS/AST/MCP and GPU challenger code exist. TurboVec, cuVS and CAGRA remain executors/projections, not identity or extra semantic votes. | Same-request frozen candidate pool, exact CPU oracle, canonical identity parity and one semantic-lane vote. Do not combine Qdrant/cuVS/CAGRA results as separate votes. |
| Graph and tensor execution | NetworkX reference; optional cuGraph/cuVS on the RAPIDS sidecar; existing LibTorch N-API bridge | CPU/GPU algorithm owners and fixtures exist. Rust simdjson is not a GPU executor. LibTorch GEMM is distinct from graph traversal; no live end-to-end CUDA result is established by this audit. | Immutable graph/vector snapshot, revision-bound ordinal map, CPU/GPU result parity, device-memory budget and an execution receipt. No GPU dispatch is authorized by this task. |
| Agent boundary | Existing MCP search tools, ACP bounded tool loop, tRPC router, and request-scoped Mastra route | These are separate caller/API/orchestration owners; existence does not prove one shared request or evidence chain. HMM classification may route budgets but cannot establish identity or authorize calls. | One read-only request ID from MCP/ACP through SearchRuntime and ACE/ContextManifest, with tool schema/auth checks, bounded async fanout, stable Top-K, source revisions and zero writes. tRPC is not a substitute for MCP authorization. |

- [ ] **PIPE-E2E-01 — Freeze one qualified seed.** Select an already admitted packet/chunk with exact source bytes, packet key, workspace/source revisions and evidence references. If any field is absent, stop as `BLOCKED_LINEAGE`; do not synthesize identity from a path, ordinal, vector point ID, or current checkout.
- [ ] **PIPE-E2E-02 — Prove parser-to-canonical-readback.** Run the existing bounded NDJSON typed-evidence stream using the runtime parser actually loaded by the application, then resolve the output against the canonical packet/source owner. Record native-vs-fallback counts, accepted/rejected rows, input and output checksums, exact byte/span verification, and side effects. Decide Rust N-API versus C++ N-API ownership from this result; do not load two parsers as independent authorities.
- [ ] **PIPE-E2E-03 — Qualify PostgreSQL representation/index alignment.** Inspect existing schema and query plans read-only. Keep packet/source identity and binary payload in their existing canonical owners; use JSONB indexes for actual JSON predicates, B-tree for exact keys/revisions, and the existing `tsvector`/GIN or approved lexical owner for text. Add BRIN, Merkle structures, TOON, or migrations only after a concrete workload, owner, and measured acceptance test are approved.
- [ ] **PIPE-E2E-04 — Bound parser and AST concurrency.** Verify worker-pool maximum concurrency is a hard ceiling (not only a spawn target), input bytes and batch sizes are bounded, output order is deterministic, and timeout/cancellation/errors are visible. Compare sequential/parallel outputs and checksums; do not fan out all corpus files or embedding calls at once.
- [ ] **PIPE-E2E-05 — Connect one retrieval request.** Feed the qualified seed to the existing AST/lexical/semantic executors and SearchRuntime. Compare against an exact CPU oracle; deduplicate by canonical identity and logical lane before RRF; preserve stable Top-K and pagination. GPU/ANN outputs are advisory until parity passes.
- [ ] **PIPE-E2E-06 — Prove graph/GPU challenger parity.** Use the same frozen graph/vector snapshot and revision-qualified ordinal mapping for NetworkX/CPU and optional cuGraph/cuVS/LibTorch execution. Record backend, metric, dtype, dimensions, device, memory, checksum and result-identity parity. Keep GEMM, graph traversal, HNSW and DAG context prefill as distinct stages; do not assert GPU availability from a compiled bridge alone.
- [ ] **PIPE-E2E-07 — Prove agent handoff and admission.** Carry the same request ID, candidate snapshot checksum and source revisions through the existing MCP/ACP caller into ACE/ContextManifest. Require bounded tool authorization and independent evidence admission before context injection; keep tRPC/Mastra as adapters/orchestration only. Record attempted/committed writes as zero for this read-only proof.
- [ ] **PIPE-E2E-08 — Emit one joined execution receipt.** Bind producer/consumer revisions, parser backend, canonical packet/source identity, PostgreSQL query/index plan, retrieval lane outputs, graph/GPU backend, Top-K, ContextManifest checksum, MCP tool call, concurrency limits, exact commands/exits and write counts. Report stages individually as `OWNER_PRESENT`, `CONTRACT_TESTED`, `CALLER_PROVEN`, `COMPONENT_LIVE`, `VERTICAL_PARTIAL`, or `LIVE_PROVEN`; never mark the whole path complete from component tests.

### Adapter training, LibTorch, and transport alignment

Additional owner check for the requested QLoRA/Unsloth/Cython/LibTorch/gRPC/QUIC path:

- `python/parent_atlas_neural_router/train_tool_cross_encoder.py` is the existing Python PyTorch/Transformers/PEFT LoRA trainer over schema-checked JSONL. It requires train/eval inputs and writes a model/evaluation output directory. Its source explicitly leaves QLoRA optional pending resource qualification; no Unsloth integration or Cython training owner was found in the active training path.
- Existing Python `loss.backward()`/`optimizer.step()` owners are training experiments. `simd-bridge/cpp/pytorch_graph.cc` and `libtorch_graph_impl.cpp` use LibTorch inference/no-grad operations. `torch::from_blob` wraps host memory; `.to(CUDA)` still transfers data. The N-API ABI does not qualify LibTorch/CUDA C++ ABI compatibility, pointer lifetime, pinned-memory behavior, GPU availability, or numerical parity.
- gRPC clients/services and QUIC/Caddy deployment/test artifacts exist. `atlas.custom-rpc-packet.v1` and related packet-registry contracts are data contracts, not by themselves proof that the same packet is transported end-to-end over gRPC or QUIC. Existing ACP/gRPC/QUIC tests must be classified as fixture/registry checks unless a live service invocation and packet readback are captured.

- [ ] **ADAPTER-QUAL-01 — Qualify LoRA/QLoRA against existing Python owner.** Freeze reviewed, lineage-complete train/eval data with query-grouped splits and immutable base-model/tokenizer checksums. Compare the current PEFT LoRA path before considering QLoRA or Unsloth; verify GPU memory, adapter-only output, held-out ranking/calibration metrics, reproducibility, and rollback metadata. Do not train synthetic labels or promote a model from a smoke run.
- [x] **LIBTORCH-ALIGN-01 — Prove host-to-device tensor contract.** Verified via `scripts/atlas/test-atlas-cuda-gather-01.mjs` (`graphCandidateGatherGPU` in `tensorrt_bridge.node`). Measures host-to-device transfer latency separately (0.6875ms) from GPU kernel execution (0.5933ms), bounds-checked indices fail-closed on negatives/overflow, exact numerical agreement vs CPU reference (`maxDiff = 0`), preserves 6.91 GB VRAM free alongside `:8090` Ornith, receipt in `docs/reports/atlas-cuda-gather-01-receipt.json`.
- [ ] **RPC-PACKET-01 — Prove one revision-qualified packet transport.** Select the already-owned transport for the caller (existing HTTP/MCP by default; gRPC or QUIC only if its measured requirements justify it). Round-trip a bounded typed packet and immutable artifact reference, validate schema/version/checksum/identity at the consumer, and capture service health, exact bytes and readback. Caddy routing or a port declaration alone is not transport proof; do not add a parallel registry, packet authority, or transport without this gate.

### Function recall and Atlas tensor-LOD wiring — 2026-10-15

- [x] **FR-SEARCH-WIRE-01 — Add opt-in FunctionRegistry → SearchRuntime bridge.** The existing PostgreSQL snapshot loader and source-byte qualifier can supplement existing AST results through `/api/search/hyperrag` when both `ATLAS_FUNCTION_REGISTRY_RETRIEVAL_ENABLED=true` and `ATLAS_FUNCTION_REGISTRY_REPO_ROOT` are configured and the request supplies a workspace revision. It remains off by default; missing revision, read failure, or qualification failure yields no supplement. Route-level tests cover default-off and explicit enablement; one current live read-only source/AST snapshot and direct SearchRuntime candidate replay are now proven, but an HTTP route request remains unproven.
- [x] **FR-SEARCH-WIRE-02 — Preserve one AST vote.** Function-registry results carry the existing `ast_tree` score source and explicit executor provenance. SearchRuntime's existing revision-qualified RRF grouping merges same-identity AST hits into one contribution; regression test covers parser + registry duplicate hits.
- [ ] **FR-SEARCH-WIRE-03 — Live receipt.** Configure the approved read-only workspace root and explicit feature flag, run one revision-qualified route query, and record candidates qualified/rejected, source and workspace revisions, snapshot checksum, AST lane contribution count, Top-K, ContextManifest checksum, and zero writes. Keep the feature flag off until this gate is reviewed.
- [x] **ATLAS-LOD-WIRE-01 — Prove numerical row mapping before GPU/cache.** Verified via `scripts/atlas/prove-tensor-io-01.mjs`. 1000-row × 768-col flat float32 binary matrix (`corpus_semantic_768_proof.f32bin`) paired with parallel NES-style CPU lookup table (`corpus_semantic_768_lut.json`). CPU ordinal gather of 50 candidates transferred to RTX 3060 Ti cuBLAS (`cuda_cublas`) SGEMM; top-1 matched ground-truth target (ordinal 42), max absolute oracle difference 1.7881e-7 < 1e-5, zero canonical writes, receipt in `docs/reports/tensor-io-01-receipt.json`.
- [ ] **ATLAS-LOD-WIRE-02 — Cache residency proof.** Reuse BitFrost transitions; Valkey stores revision/checksum-qualified descriptors and counters only, while the GPU process owns device allocations. Distinguish descriptor hit, CPU artifact hit, and actual GPU-resident hit; record bytes, cold/warm identity parity, evictions and stale-revision behavior. No hidden reasoning, model KV cache, or raw CUDA pointers in Redis/Valkey.
- [ ] **ATLAS-INTENT-01 — Keep routing/classification advisory.** HMM/domain taxonomy may choose bounded retrieval budgets and MCP tool candidates; lexical “did you mean” remains suggestion-only. Tool authorization, canonical identity, ontology assertions, and ContextManifest admission remain separate deterministic gates.
- [ ] **ATLAS-LEARNING-01 — Keep training/evaluation gated.** PCA/SVD are frozen projection baselines; KMeans/SOM are coarse-routing challengers; logistic/XGBoost/MLP are supervised rankers requiring reviewed query-grouped labels. DSPy/GEPA optimize prompts against held-out evaluation; OAK validates ontology references. No synthetic-label production claim, online backprop, automatic adapter merge, or model-driven action authorization.
- **Reviewed-label eligibility recheck (2026-10-25):** The prior AWM-08 tally of 49/200 is not linked to a frozen review artifact and is not accepted as a current eligible-label count. Fresh recheck receipts `.tmp/atlas/phase8-pool-current-recheck.json` and `.tmp/atlas/phase8-queue-current-recheck.json` recomputed their input checksums and report 0/2,433 pool grades, 0 revision-bound queries/candidates, and 0/1,287 completed queue judgments (0 hard negatives). No labels were assigned. Keep supervised rankers `NOT_RUN` until reviewer-authored, query-grouped judgments bind to the exact frozen packet/source revisions and pass independent validation.
- **Legacy Phase 2F corpus lineage recheck (2026-10-25; read-only):** The static `phase2f-ground-truth-evaluation-set.mts` contains 50 query definitions and 150 scored expectations, but live PostgreSQL readback found zero exact joins from those expectations to `atlas_packets.packet_key`/`packet_id`, zero query-ID joins to `evaluation_queries`, and no source/workspace-revision lineage or reviewer metadata in that table contract. Treat this as a legacy diagnostic fixture, not reviewed labels; it contributes zero rows to ATLAS-LEARNING-01's 200-row floor and does not reconcile 49/200. No DB writes occurred.
- **Current review-pool DB lineage recheck (2026-10-25; READ ONLY):** The August pool (60 query IDs, 2,433 candidate occurrences / 2,240 unique chunk IDs) has 60 exact query-ID joins and all candidate IDs exist in `codebase_chunk_index`. Only 140 unique candidates have exact chunk-to-packet lineage; 2,100 rely on source-ref fallback. Although all 2,240 source refs map to a single packet by path, only 140 candidate mappings have source/workspace revisions, all bound to superseded `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; none are bound to admitted `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`. The e24 materialized snapshot root is absent from the active snapshot directory. This does not make those rows eligible for c636 review; no labels or DB writes occurred.
- **Phase 8 current-source identity boundary (2026-10-25; READ ONLY):** A bounded cohort of 654 review-pool source refs was independently byte-read from the admitted `891a8d9c…` snapshot; all 654 matched manifest digest, selection content hash, and code-source revision. This proves source-byte availability only. `PacketKeyV2` requires `repositoryScope` from revision-qualified `graphify_execution_file_membership_v2.repository_id`; a path join to `atlas_packets` or `atlas_workspace_source_bindings` cannot supply that authority. No current terminal Graphify execution/membership has been qualified for c636, and no current packet rows match both c636 workspace revision and source revision. Therefore the pool cannot yet be frozen as a revision-qualified human-review cohort. Do not assign labels, synthesize packet keys from paths, or backfill packet revisions. Next gate: obtain an authorized terminal execution and independently verify its membership-to-binding-to-packet/chunk lineage, or select a different already-qualified cohort through the canonical identity owner.
- **Phase 8 validator floor guard (2026-10-25):** The review-queue validator now counts only valid human judgments and withholds `READY_FOR_IMPORT_REVIEW` unless there are at least 200 total and 30 per grade 0–3. Import remains disabled pending independent cohort checksum, packet/source lineage, revision, and authority review. Tests cover balanced and unbalanced cohorts; this gate cannot substitute for human review.
- **QLoRA challenger-gate hardening (2026-10-25):** The existing `qlora-training-gate.ts` helper now also requires 200 reviewed judgments, 30 per grade, a SHA-256 corpus checksum, and revision binding before shadow-training readiness. Its focused tests pass 4/4. `rg` found no production caller, so the gate is not wired to a trainer; do not claim training readiness or phase completion from the helper alone.
- **Review-queue lineage qualification (2026-10-25):** `validate-golden-relevance-review-queue-v1.mjs` now applies the 200/30-per-grade floor only to judgments whose query and candidate carry SHA-256 workspace/source revisions and whose candidate has a source ref plus evidence refs. Tests pass 15/15. Current pooled queue readback is 0/1,287 completed, 0/1,287 candidate slots revision-qualified, and 0 qualified judgments; no labels were generated, and import remains disabled.
- **Live Phase 8 judgment census (2026-10-25):** `scripts/atlas/audit-phase8-live-label-census-v1.mjs` ran in PostgreSQL 18.4 `REPEATABLE READ READ ONLY` and wrote `.tmp/atlas/phase8-live-label-census-v6.json`. All 60 registered queries exist, but both relevance tables have 0 rows joined to them and the DB-wide human-judgment count is 0. The pooled queue has 1,287 exact packet-key/source-ref candidate pairs; 527 have SHA-256 revisions, all tied to old workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, and none has a verified byte span. The separate 2,433-candidate reviewer pool has 0 exact candidate-ID→packet-ID matches and only 1 exact Qdrant-point/source pair, without revision/span proof. No query row exactly joins to a packet, and no active source snapshot root for that old revision was found. Existing derived/model-graded records do not satisfy the human/revision-qualified label floor; no relabeling, DB writes, or import occurred. Keep supervised rankers `NOT_RUN`; rebuild an authorized, revision-qualified review cohort before requesting human labels.
- **AWM-08 current label-gate refresh (2026-10-26; PostgreSQL 18.4 `REPEATABLE READ READ ONLY`):** `.tmp/atlas/phase8-live-label-census-v7-20261026.json` rechecked the registered 60-query set and candidate identity joins. The registered-query relevance tables and database-wide human-judgment census remain at zero. The pooled queue retains 1,287 exact packet-key/source-ref pairs, but 527 revision-bearing rows are tied to the superseded workspace revision and none has byte-span proof. The 2,433-candidate reviewer pool has zero exact packet-ID joins and one Qdrant-point/source pair without revision/span proof. No labels, database/cache writes, or training occurred; the 49/200 report remains unreconciled and must not count toward the trust floor.
- **Architecture clarification:** ATen is PyTorch's tensor/operator layer (multidimensional arrays plus dispatch), not a new database or identity system. GEMM is dense linear algebra; SIMT is GPU execution; SIMDJSON is CPU parsing; cuGraph is graph analytics; MCP is tool invocation; FastAPI/gRPC/QUIC are transports. Shader/LOD imagery is useful only as the coarse-select → bounded-refine analogy. Pokémon/move/hotkey registries were not found as a canonical Parent Atlas retrieval owner; do not bind them to packet identity absent a concrete user-facing requirement and source-backed registry.
- **Proof status:** Existing owner contracts remain stronger than end-to-end evidence. The optional bridge and duplicate-vote test are locally testable; a direct read-only SearchRuntime replay proves one qualified candidate reaches its existing `ast_tree` RRF lane, but it does not survive final Top-K. No HTTP route-to-ContextManifest, GPU residency hit, model-training run, or live MCP → ContextManifest trace is claimed here.
- **Canonical payload path alias contract (2026-10-26):** `buildEnrichedPayload` now emits `file_path` from the exact same normalized source value as `source_ref`, and the canonical Qdrant payload test asserts equality. Focused Qdrant-payload and structural-lane suites pass 16/16. This is code/test evidence only: it does not prove that every writer supplies canonical `feature_id`/`feature_label`, that metadata enrichment joins against the matching source/workspace revision, or that a live Qdrant projection has been updated. Those remain open; no projection write occurred.

## Native simdjson → tensor-array numerical proof — 2026-10-15

- [x] Reuse existing native JSON validation/parsing/numeric extraction/UTF-8-span/CSR/BFS exports in a bounded CPU-oracle composition; add FP32 shape/bytes/min/max/mean/population variance/sparsity/row-L2 metrics. Implementation: `scripts/atlas/lib/simdjson-graph-gather-v1.mjs`; guide: `docs/architecture/simdjson-tensor-array-analysis-v1.md`. Numerical fixtures only; no source or datastore writes, new fusion owner, corpus embedding, training or evidence promotion.
- [x] Verify nine focused oracle/metrics/resource/fail-closed tests and real native CPU plus LibTorch CUDA gather/cosine Top-K parity on the synthetic 4×768 fixture. CUDA receipt: `docs/reports/simdjson-graph-gather-2026-10-16T03-41-40-101Z.json`. Its single-call timings are not a steady-state performance benchmark; summaries are CPU-computed and TensorRT inference is not exercised.
- [x] Wire CPU-only `atlas.simdjson_tensor_metrics` through existing TRACE native diagnostics and add MCP boundary tests. GPU dispatch remains explicit via `atlas:simdjson:tensor:gpu`, behind independent NVIDIA/native headroom checks with a 2 GiB reserve. Both local Top-K indices and resolved candidate ordinals must match the CPU oracle.
- [ ] Establish deployed TRACE discovery/call after an explicitly scheduled refresh. Keep current-source corpus/ordinal qualification, retrieval quality, ACE/ContextManifest admission and persistent residency as separate existing gates; this numerical proof does not close them.

## Phase 24 — source-qualified function recommendations and governed edits — 2026-10-14

- **Canonical discovery repair (2026-10-15):** `queryCallableSearchProjectionInReadOnlyTransactionV1` now uses `atlas_callable_search` only for lexical hints, joins the existing `atlas_symbol_versions` and active `atlas_symbol_registry` owners, filters by the canonical version's requested workspace, and returns the canonical source revision. It no longer passes the projection's revision to the loader as expected source identity. The live `getErrorClustering` row demonstrates the distinction: projection source revision `1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf` is a Git-shaped value, while its canonical source revision is `sha256:efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`; their kinds are not interchangeable. `npx vitest run --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts` in `sveltekit-frontend` exited 0, 5/5. This is a reader fix, not projection repair, source qualification, or permission to enable the production feature flag.
- **Live canonical-discovery and loader readback (2026-10-15):** Added `scripts/atlas/audit-function-discovery-readback-v1.mts`, which calls the actual discovery helper and optionally the existing PostgreSQL source qualifier in one `REPEATABLE READ READ ONLY` transaction, records producer-file SHA-256 values, and rolls back. `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=4` returned one canonical candidate, exit 0 (`CANONICAL_DISCOVERY_READBACK_PROVEN`). With `--limit=1 --qualify`, the same current-workspace query reached the real source qualifier and exited 3 with `FUNCTION_QUALIFICATION_BLOCKED / AST_NOT_FOUND`; receipt `.tmp/atlas/function-snapshot-readback-getErrorClustering-20261015-02.json`, SHA-256 `0d070e6f4c098435d9f12ac1d5f037a50b88aa69a10b6d6a44cf6334d36bd49c`, embedded load-receipt checksum `88ffc705b4644dfc2c5459138bf76446c1c19ed5d079dc73f326fc5975ecdcb2`. Querying the older projection workspace `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9` with `--limit=1` returned zero canonical candidates, exit 3; receipt `.tmp/atlas/function-discovery-old-workspace-rejection-20261015.json`, SHA-256 `75de04c939ae560ecc7e2071b600482564c31ddf3e9a1f50497bf325275e52c6`. These are isolated read-only discovery/source-qualification diagnostics, not integrated recommendation/editor tests. No database/cache writes, model training, service startup, route flag enablement, snapshot qualification, or ContextManifest admission occurred. The next required handoff is a source- and repository-qualified AST observation through the existing AST writer/admission owner; preserve the native source proof above and do not substitute nil-UUID metadata rows or infer a workspace ID from a different graph snapshot. P24-LINEAGE-01/P24-SNAPSHOT-02 and FR-SEARCH-WIRE-03/04 remain open.

**Parent Atlas Priority Shift:** The next blocker is **live source lineage**, not GPU performance. The latest investigation changes the priority. RTX gather, tensor I/O, native graph helpers, and focused integration tests have passed their respective proof gates. But the attempt to run a real Function Registry lookup exposed a more fundamental problem: the registry (`atlas_callable_search`), AST projection (`atlas_ast_nodes`), workspace revision, and source-byte verifier do not yet agree on identity and revision semantics (0/85 matched in live census). Another CUDA benchmark, embedding model, or HyperGraphRAG traversal will not resolve the current integration blocker.

Phase 24 is **BLOCKED / NOT COMPLETE**. **Do not run the integrated recommender, function/module recommendation, symbol-editor, or document-edit test yet.** Before that test, this phase requires all of the following as independently reviewable evidence: (1) a genuinely trained and evaluated NLP function/module recommender using a frozen, lineage-complete cohort and independently reviewed labels; (2) measured PCA and TruncatedSVD low-rank baselines against the full-dimensional baseline; (3) an implemented and evaluated Tang-inspired ℓ²-sampling algorithm under its documented data-access/query assumptions and against an exact oracle; and (4) live source-lineage qualification plus the governed editor safeguards. The recommender may nominate a function/module for the symbol editor; it does not author canonical identity or independently authorize edits. This is not permission to mutate documents. Never train on synthetic/proxy labels, retrieval frequency, generated summaries, or the incumbent ranker’s own outputs as ground truth. An inability to satisfy Tang's assumptions or obtain reviewed labels is a blocking gap, not `NOT_APPLICABLE` completion. Do not claim Tang, a trained model, or low-rank quality from code presence or fixtures. The live callable-search census recorded below is a hard stop for enabling the registry-backed route or evaluating document edits against purported canonical symbols. Keep the feature flag off until source lineage is reconciled and a live read-only qualification succeeds.

**Required dependency order (all gates remain open until their evidence exists):**

1. **P24-LINEAGE-01** — reconcile canonical symbol, packet/source binding, and native AST identity/revisions; repeat the bounded read-only census with zero mismatches or unresolved/ambiguous joins.
2. **P24-SNAPSHOT-02** — load and verify exact live source bytes, digest, UTF-8 span, packet key, and expected revisions; produce a read-only qualification receipt.
3. **P24-NLP-04** — freeze the lineage-complete, independently reviewed relevance cohort; train and evaluate the function/module recommendation model against deterministic SearchRuntime/RRF, using query/repository/revision-grouped splits and leakage checks. Report retrieval metrics and fallback parity.
4. **P24-LOWRANK-05** — evaluate PCA/TruncatedSVD on that same frozen cohort and ordinal map; record dimensions, checksums, Recall@K and ranking metrics, memory, and latency. Keep projected features noncanonical.
5. **P24-TANG-06** — implement and evaluate a Tang-inspired ℓ²-sampler after documenting its data-access assumptions. Provide the sampling/query data structure or a verified adapter over existing owners, deterministic seeded tests, preprocessing/storage/query cost, approximation/sample-quality metrics, and comparison to the exact oracle on the same frozen cohort. No new canonical identity owner or index. If the assumptions cannot be met, leave this gate BLOCKED; `NOT_APPLICABLE` does not satisfy the user's Phase 24 completion requirement.
6. **P24-EDITOR-03 integration tests** — only after gates 1–5 have acceptable evidence, test proposal construction and the governed edit path on an explicitly approved, isolated fixture/worktree. Keep direct TS-Morph writes prohibited; require approval, contained paths, preimage CAS, validation, and independent readback. Contract/unit tests for fail-closed guards may run earlier, but must not be described as document-edit integration tests.
7. **P24-RECEIPT-07** — join matching request/cohort/model/projection/source/evaluation evidence and record exact commands/exits, checksums, outcomes, and zero-write status for recommendation-only runs.

**Phase 24 exit gate:** Do not mark this phase complete, enable learned function/module recommendations, or run TS-Morph/document-edit integration tests until P24-LINEAGE-01, P24-SNAPSHOT-02, P24-NLP-04, P24-LOWRANK-05, and P24-TANG-06 have independently reviewable evidence, P24-EDITOR-03 has passed on an explicitly approved isolated fixture, and P24-RECEIPT-07 binds those results to the same revisions and checksums. A parser/unit test or GPU fixture test is not an editor integration test and does not satisfy this exit gate. The required NLP model must be actually trained on independently reviewed, revision-qualified labels; PCA/SVD must have measured baseline comparisons; and Tang must be implemented and evaluated under its stated access model. Keep each checkbox open until its evidence is recorded, even if implementation code exists.

**Phase 24 test-readiness lock:** “Test Phase 24” means exercising the integrated function/module recommender or symbol/document editor against a candidate corpus—not merely running pure validation/unit tests. Such integration testing is **BLOCKED** until the complete exit-gate conjunction above is independently reviewed. In particular, do not substitute a fitted model trained on proxy/synthetic labels, an unmeasured PCA/SVD transform, a Tang paper summary or fixture-only sampler, or TS-Morph parsing for the required trained recommender, measured low-rank baselines, implemented/evaluated Tang sampler, live source-byte qualification, and governed edit safeguards. **Do not start the integrated test to discover whether these prerequisites work; establish and review their evidence first.** Keep the production route disabled and the document editor proposal-only until the lock is cleared; no direct TS-Morph save/write path is permitted.

- [ ] **P24-LINEAGE-01 — Reconcile the live function identity chain.** Repair the producer/materializer contract so each `atlas_callable_search` candidate resolves to exactly one canonical `atlas_symbol_versions` record, an exact packet/source binding, and one native-provenance AST node at matching workspace/source revisions and content digest. Do not infer identity from path, name, ordinal, or a projection row. Re-run the bounded read-only census; require zero revision mismatches, unresolved AST IDs, and ambiguous matches before proceeding. Current census: 85 rows; 85 source-revision mismatches; 85 workspace-revision mismatches; 85 projected AST IDs unresolved; 0 canonical AST matches. No DDL, rebuild, or repair write is authorized by this task.
- [ ] **P24-SNAPSHOT-02 — Prove source-byte qualification before editor testing.** Load one live symbol through the existing snapshot loader, reopen exact source bytes, verify whole-file SHA-256, UTF-8 byte boundaries, exact function span, packet key, and expected workspace/source revisions, then emit a checksummed read-only receipt. Wrong revisions, absent/ambiguous AST, changed bytes, missing packet, and stale preimage must reject. This gate is blocked by P24-LINEAGE-01; fixture tests do not close it.
- [ ] **P24-EDITOR-03 — Keep TS-Morph analysis separate from document mutation.** TS-Morph may parse and produce a source-bound symbol/edit proposal, but must not save, overwrite, or create canonical files directly. Bind each proposal to canonical symbol-version ID, source and workspace revisions, source-content SHA-256, exact byte span, preimage checksum, allowed-root policy, and a deterministic diff checksum. Route any write through the existing governed action-DAG/file-mutation owner with plan-bound human approval, path containment, compare-and-swap preimage check, idempotency key, required validation nodes, and post-write readback. Stale source or failed validation aborts; do not auto-rebase or retry against changed bytes.
- [ ] **P24-NLP-04 — Qualify the symbol/function recommendation model.** Before enabling learned recommendations, freeze a lineage-complete query→function cohort with independently reviewed labels, hard negatives, query/repository/revision-grouped train/validation/test splits, and immutable source/model/feature checksums. Establish deterministic SearchRuntime/RRF as baseline; compare Naive Bayes and logistic regression before XGBoost/MLP. Report Recall@K, MRR/NDCG, calibration where probabilities are claimed, leakage checks, latency, and fallback parity. No synthetic labels, generated summaries, retrieval frequency, or self-labeling from the incumbent ranker may be used as ground truth. Until this gate passes, model output is unavailable or advisory-only and cannot authorize an edit.
- [ ] **P24-LOWRANK-05 — Evaluate PCA/SVD before learned compression.** Use only the same frozen, source-qualified feature matrix and candidate ordinal map. Compare PCA/TruncatedSVD projections with the exact full-dimensional semantic baseline; record dimensions, fit-scope, reconstruction/variance, Recall@K, MRR/NDCG, memory, latency, seed, and checksums. Keep projection artifacts separate from canonical `semantic_768`; reject stale or cross-revision rows.
- [ ] **P24-TANG-06 — Implement and qualify Tang-inspired ℓ²-sampling.** Specify the paper-aligned data-access/query model and approximation claim; implement the required sampling structure/adapter against the frozen, lineage-qualified feature cohort without creating a canonical index. Add deterministic seeded tests and compare preprocessing, storage, query cost, and sample quality with the exact Top-K oracle on identical inputs. Keep outputs advisory and identity-resolve them through existing canonical owners. Missing access assumptions, labels/cohort, implementation, or evaluation leave this gate BLOCKED; do not substitute PCA/SVD, fixtures alone, or `NOT_APPLICABLE`, and do not claim production-ready exact Top-K.
- [ ] **P24-RECEIPT-07 — Join the proof into one read-only recommendation receipt.** Bind request ID, canonical symbol and packet IDs, source/workspace/feature/model revisions, training-cohort and evaluation checksums, algorithm/backend versions, exact commands/exits, selected candidates, source qualification outcomes, edit proposal/diff checksum if present, validation results, and writes performed. Require `writesPerformed:false` for recommendation-only evaluation and keep production feature flags disabled until review.
- [ ] **P24-EXIT-08 — Verify Phase 24 completion as an evidence conjunction.** Review the receipts for P24-LINEAGE-01, P24-SNAPSHOT-02, P24-NLP-04, P24-LOWRANK-05, P24-TANG-06, P24-EDITOR-03, and P24-RECEIPT-07; verify matching source/workspace/cohort/model revisions, checksums, exact command exit codes, independent review, and zero unauthorized writes. Reject completion if any prerequisite is missing, stale, fixture-only where live proof is required, or marked `NOT_APPLICABLE` in place of the required Tang implementation. Only this gate may authorize changing the Phase 24 heading/status to complete; it does not itself authorize production writes or learned-ranking promotion.
- [ ] **P24-TEST-LOCK-09 — Clear integration-test prerequisites before exercising the recommender/editor.** Require P24-EXIT-08 evidence review before integrated corpus/recommender/editor tests. The reviewed, revision-qualified training cohort, actually trained and evaluated function/module recommender, measured PCA/SVD baselines, implemented and evaluated Tang sampler, live source-byte snapshot qualification, and approved governed-editor fixture must all bind to the same declared cohort and compatible revisions. Record the reviewer, fixture/worktree boundary, exact command and exit code, receipts, and writes. Until then, only deterministic validation and isolated fail-closed unit tests may run; those tests do not close this gate or count toward Phase 24 completion. <!-- wfu: depends=P24-EXIT-08 -->

- **Current evidence (read-only refresh, 2026-10-15):** The bounded callable census against workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9` still finds 85 projection rows, 85 source-revision mismatches, 85 workspace-revision mismatches, 0 exact projection packet matches, 85 projection source-binding mismatches, 85 unresolved projection AST IDs, and 0 exact canonical AST matches. Canonical symbol rows have 85 exact packet matches and 85 unique source bindings; projection packet keys match canonical keys, but projection revision tuples do not. A separate read-only lookup of the existing `atlas_repository_identity` owner found one exact mapping for `source_authority_repo_id='deeds-web-app'` to repository UUID `01a13137-1378-7df9-9968-53738dbf0e48`; joining that UUID to `atlas_ast_nodes.repo_id` yielded **0 AST rows**. The unrelated `code_repos` mirror contains an all-zero UUID with 523,271 AST rows; it is not interchangeable with the canonical repository UUID and must not be substituted. The audit remains diagnostic; no materializer, DDL, data repair, or cache write occurred. AST candidate producers bind SHA-256 of supplied UTF-8 source, and TS-Morph rejects missing/mismatched candidate-to-input bytes before parsing. The PostgreSQL snapshot loader now keeps the source-binding label separate from the canonical UUID, resolves the latter through `atlas_repository_identity`, and queries AST by that UUID plus normalized path, source revision/hash, qualified symbol, and byte span. It does not equate `upstream_node_id` with `tree_node_id`. Focused fixture validation previously passed 6 files / 31 tests for TS-Morph/AST and 3 files / 11 tests for the Function Registry loader/qualifier. Neither test group proves live AST/source readback or editing safety.
- **Repository identity contract correction (2026-10-15):** `WorkspaceSourceBindingRowV1` carries `repoId` (source-owner label) and nullable `astRepoId` (UUID resolved from canonical `atlas_repository_identity`) separately. The read-only provider resolves the crosswalk through `source_authority_repo_id`, not the noncanonical `code_repos` mirror; AST candidates are queried by mapped UUID and qualification rejects absent/mismatched UUID provenance. Live lookup proves the key maps to UUID `01a13137-1378-7df9-9968-53738dbf0e48`, but that UUID currently has zero `atlas_ast_nodes` rows. A live read-only qualification of an exact symbol/packet/source-binding seed now reaches the AST lookup and rejects deterministically as `AST_NOT_FOUND`; no DB write was attempted. During that path, two provider SQL defects were corrected: joining `path_rows` by a column absent from the candidate relation, and binding the textual repo label instead of the mapped UUID. Focused tests after these corrections passed 3 files / 13 tests. This is a real live rejection/readback observation, not a qualified function snapshot or ContextManifest admission.
- **Live snapshot-loader attempt (2026-10-15):** In one `REPEATABLE READ READ ONLY` transaction, selected `symbol-version:0167e230af226c584148c1b3ce52e3c342180ea119167a3a34bebed6880a7d07` only after exact joins across symbol version, packet, and workspace-source binding. The read ports found one registry row, one packet, one binding (`deeds-web-app` → `01a13137-1378-7df9-9968-53738dbf0e48`), and 5,216 source bytes matching the requested SHA-256; the AST query returned no native node and the loader returned `REJECTED / AST_NOT_FOUND`. Transaction rolled back; `writesPerformed=false`. First end-to-end objective remains unmet: no source-qualified function has reached ContextManifest.
- **AST repository namespace root cause (2026-10-15):** The legacy materializer and backfill receipt writer still encode the slug `deeds-web-app` into AST identity/structural keys but store nil UUID `00000000-0000-0000-0000-000000000000` in `atlas_ast_nodes.repo_id` (`sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs`, `scripts/atlas/atlas-ast-backfill-receipt-v1.mjs`). The legacy materializer's `codebase_chunk_index` query does not select workspace/source revisions, and its `atlas_ast_nodes` insert does not write them. The shared AST writer previously used nil UUID but is now guarded as described below and requires those revisions. The canonical `atlas_repository_identity` owner maps the source-authority label to `01a13137-1378-7df9-9968-53738dbf0e48`; current live AST population is not bound to that UUID. A sample canonical function also had 0 AST path matches even without a repository filter. Do not equate/rewrite historical nil UUID rows or remint node IDs by inference. Resolving historical data requires an owner-approved, source/revision-qualified AST reindex or explicit identity reconciliation; no write, migration, or rebuild was run.
- **Shared AST writer hardening (2026-10-15):** `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` now resolves `deeds-web-app` through `atlas_repository_identity` immediately before inserting, and rejects absent, ambiguous, malformed, or nil UUID mappings before any AST insert. It also rejects missing `workspaceId` or `sourceRevision` before querying/inserting. Existing slug-derived tree-node IDs remain unchanged. Tests cover canonical UUID parameterization and all fail-closed cases: `node --test scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs scripts/atlas/test-ast-nodes-writer-contract-v1.mjs` — exit 0, 9/9. This is producer contract protection only; it did not run a database writer, repair historical rows, modify the separate legacy materializer, or qualify a live function.
- **Frontend check observation (2026-10-15):** `npm run check` completed and emitted `svelte-check found 0 errors and 181 warnings in 69 files`. The terminal wrapper did not preserve the final process exit code; record this as diagnostic output, not an exit-code-verified PASS. Existing warnings are outside this focused change.
- **Training/editing boundary:** Reviewed training data and a qualified trained model, measured PCA/SVD baselines, and an implemented/evaluated Tang sampler are required before any model-assisted function/module recommendation is enabled or any document-edit integration test is run. This does not block deterministic parser tests or isolated fail-closed contract/unit tests. TS-Morph must not edit documents directly; any actual edit requires the separate lineage, approval, preimage, validation, and readback gates above. Do not run or claim a document-edit integration test before P24-LINEAGE-01, P24-SNAPSHOT-02, P24-NLP-04, P24-LOWRANK-05, P24-TANG-06, and explicit approval.
- **Reviewed-label corpus census (2026-10-15):** The existing golden relevance review pool is structurally valid but has 60 queries / 2,433 candidates, 2,433 blank grades, 0 completed grades, and 0 revision-bound queries or candidates (`docs/reports/golden-relevance-review-pool-validation-v1.json`). Its import and production activation are false. The separate review queue has 2 queries / 43 judgments, only 1 completed judgment, 42 blank judgments, and 0 hard negatives (`docs/reports/golden-relevance-review-queue-validation-v1.json`). The available proxy relevance evaluation is structural-import proxy data, not human-verified semantic function relevance; it evaluated 12 of 60 sampled entries after skipping 48 with no relevant candidate in the pool (`docs/reports/golden-proxy-relevance-eval-v1.json`). None of these artifacts qualifies as Phase 24 training/evaluation data. No model was trained.
- **No promotion implied:** Existing PCA/SVD, classifier, model-training scripts, or Tang-related research notes are not evidence of a trained Phase 24 model or a completed sampling implementation. All P24 gates remain unchecked until their specified evidence exists.
- **Local validation (2026-10-15):** `npx vitest run --pool=threads --maxWorkers=1 --reporter=dot src/routes/api/search/hyperrag/server.route.test.ts src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts src/lib/server/atlas/function-registry/function-registry-retriever-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts src/lib/server/cache/rpc-cache.spec.ts src/lib/gpu/tensorrt-worker-pool.spec.ts` — exit 0, 6 files / 47 tests. The route test confirms the opt-in flag/repository-root gate and default-off behavior. `npx openspec validate parent-atlas-retrieval-lod-algorithm-taxonomy --strict` — exit 0. Scoped `git diff --check` — exit 0. `npm run check` was started but interrupted after prolonged no-output stall; typecheck remains unverified. A repo-wide diff check reports pre-existing whitespace in unrelated dirty files and was not used as this patch's result.
- **Workstation execution (2026-10-15):** `node scripts/atlas/test-atlas-cuda-gather-01.mjs` exit 0, 5/5; RTX 3060 Ti, `cuda_libtorch`, six gathered candidates, max row difference 0, transfer 0.6861 ms, kernel 0.9844 ms, 6.91 GB free. `node scripts/atlas/prove-tensor-io-01.mjs` exit 0, 1,000 × 768 generated FP32 fixture, 50-candidate pool, GEMM Top-5, CPU/GPU discrepancy `1.7881393432617188e-7` under `1e-5`, `cuda_cublas`, 6.91 GB free; generated input digest `dd9159fe17e67a8479c4e047f5973f6e3a9001cd25234e5c182f9ee26dffde15`. `node scripts/atlas/test-native-graph-tree-parity.mjs` exit 0, 7/7. `node scripts/atlas/test-atlas-native-graph-01.mjs` exit 0, 16/16 including worker-thread tests. `npx vitest run --pool=threads --maxWorkers=1 --reporter=dot src/lib/server/atlas/contracts/atlas-action-dag-v1.spec.ts` exit 0, 4/4. These are fixture/native-operation proofs; they do not establish live Postgres→source lineage, production retrieval, cache residency, or MCP→ACE execution.
- **E2E receipt qualification:** `scripts/atlas/prove-ace-4d-manifold-e2e-pipeline-v1.mjs` generates candidate vectors, query vectors, manifold features, GRPO-like scores, and hard-coded workspace/source/graph revisions in-process. It does not read a live canonical embedding cohort, call the configured SearchRuntime/MCP path, or perform actual BitFrost residency. Its `PROVEN` label is therefore fixture-pipeline status only, not a live end-to-end claim; do not rerun it as live proof or promote its generated ACE proposal.
- **SIMDJSON copy-boundary correction:** `simd-bridge/cpp/simdjson_bridge.cc::SimdJsonToCSR` copies a TypedArray input into a padded `std::string`, parses a DOM, then allocates new ArrayBuffers for CSR outputs. It is SIMD-accelerated parsing plus materialization, not zero-copy JSON→CSR or AVX2 zero-copy layout conversion. CPU parser acceleration is still usable; zero-copy claims require a separate native buffer ownership/readback proof.
- **Live Function Registry join census (2026-10-15):** Read-only PostgreSQL inspection of `atlas_callable_search` for workspace revision `sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9` found 85 projection rows. All 85 resolve to a symbol-version row and have a packet key, but **0/85** have workspace-revision parity with `atlas_symbol_versions`, **0/85** have source-revision parity, and the projection `tree_node_id` values did not resolve to AST rows (85/85 not found). Four inspected examples confirm the projection claims workspace `sha256:55ed…fac9` and source `1bb240…7aaf`, while the canonical symbol owner has workspace `sha256:e24b…bacc` and different per-symbol SHA-256 source revisions. `atlas_ast_nodes` has no `workspace_revision` column; its available revision evidence is `source_revision`, so audits must join only on actual columns plus canonical workspace/source-binding evidence. The snapshot loader correctly rejected the sampled symbol with `REVISION_MISMATCH`. All probes used `BEGIN READ ONLY`/rollback; no data was changed. **Status: BLOCKED for live registry-to-retrieval qualification; projection census is proven, not repaired.**
- **Canonical-identity census correction (2026-10-15):** The first version of `scripts/atlas/audit-callable-search-lineage-v1.mjs` mislabeled a lookup in the legacy `code_repos` projection as the repository UUID mapping; its 85 “mapping missing” count was not authoritative. Updated the read-only census to resolve `atlas_workspace_source_bindings.repo_id` through canonical `atlas_repository_identity.source_authority_repo_id` and compare AST `repo_id` against that UUID. Re-run command `node scripts/atlas/audit-callable-search-lineage-v1.mjs --workspace-revision=sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9 --limit=500` exited 0: 85 rows; 85 unique canonical repository mappings; 85 source-revision mismatches; 85 workspace-revision mismatches; 85 unresolved projected tree-node IDs; 0 canonical AST path/revision/hash/symbol/span matches. Each sampled binding resolves to canonical repository UUID `01a13137-1378-7df9-9968-53738dbf0e48`; the legacy `code_repos` inventory still contains only the nil UUID projection and is reported separately. A second diagnostic pass found 0 path candidates or exact-span matches among nil-UUID AST rows for these 85 canonical source refs, so simply substituting the legacy nil UUID would not repair this cohort. Census ran in `REPEATABLE READ READ ONLY` and rolled back; no writes. This corrects the diagnosis but does not reconcile the stale callable projection or missing canonical AST rows; Phase 24 remains incomplete.
- **Materializer dry-run boundary (2026-10-15):** `scripts/atlas/materialize-ast-symbol-versions.mjs` defaults to `DRY_RUN` but still writes/overwrites `docs/reports/ast-symbol-version-materialization-v1.json`; it reads local nomination/resolution/AST snapshot files and does not query the live database in this mode. Do not use that command as a no-side-effect live lineage check or as proof of current DB state. The `--apply` path is explicitly retired unless a legacy bypass environment variable is set; do not set that override or run the writer without separate authorization and an approved reconciliation plan.
- **Exact source-byte recovery audit (2026-10-15):** Added `scripts/atlas/audit-function-source-readback-v1.mjs`, a no-report-write, `REPEATABLE READ READ ONLY` probe for one canonical `symbol_version_id`. `node --check scripts/atlas/audit-function-source-readback-v1.mjs` exited 0; `node scripts/atlas/audit-function-source-readback-v1.mjs --symbol-version-id=symbol-version:0211824b9f676a3c1b52db76a98253686cbc85afb918b352c70665f6fd452469` exited 0 with `status=EXACT_SOURCE_BYTES_NOT_FOUND`, `writesPerformed=false`, `canonicalAuthority=false`. For this symbol, the canonical packet and workspace binding are unique and digest-consistent (13,507 expected bytes), but the current checkout is 13,665 bytes with a different digest; the artifact row is `feature_labels` with no storage location; `atlas_source_refs.fragments` is empty; and packet payload contains metadata keys, not source text. Twenty `codebase_chunk_index` rows carry the matching file digest but have null source/workspace revisions; their spans have 26 missing lines, 32 conflicting lines, and two malformed rows, so they cannot reconstruct the file. Nine reachable Git revisions were checked and none produced the expected raw SHA-256. This is a bounded source-readback failure for the sampled symbol, not proof that no source artifact exists anywhere. **P24-SNAPSHOT-02 remains blocked:** identify/authorize the existing immutable source-byte owner or correct its reference; do not infer source bytes from chunks, metadata, or the present checkout.
- **Packet-owner follow-up (2026-10-15):** The same read-only audit found zero matching `atlas_rpc_packets` rows and one `atlas_packet_registry` row with no `seaweedfs_filer_path`, size, `title_id`, or `tree_node_id`. This closes the obvious packet/RPC/SeaweedFS-pointer lookup for the sampled symbol only; it does not prove that no separately registered source store exists. Exact bytes and native AST identity are still unavailable, so P24-LINEAGE-01/P24-SNAPSHOT-02 remain open and the live route must remain disabled.
- **Exact source/chunk candidate follow-up (2026-10-15):** Corrected `scripts/atlas/audit-current-packet-chunk-lineage-bridge-v1.mjs` to resolve each source-binding `repo_id` through the persisted `atlas_repository_identity.source_authority_repo_id` owner, rather than reporting a hard-coded missing canonical repository mapping. `node --check scripts/atlas/audit-current-packet-chunk-lineage-bridge-v1.mjs` exited 0. Re-run with `--execution-id 0dba1c0d-2cf7-4f35-a61b-c77956f60d3d --workspace-revision sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --report-path .tmp/atlas/parent-atlas-context-candidate-lineage-20261015-02.json` exited 3 with the correctly scoped `CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PARTIAL`; report checksum `sha256:40726b11adbc69f5047f62fb148881d2de157e6525a8174d48f2e77028954116`, `writesPerformed=false`, `postgresWrites=false`. It records 25,542 selected memberships, 14,628 exact current packet/chunk bridges, and 10,914 lacking exact proven lineage. One bounded candidate, `crates/atlas_packet_parser/build.rs`, now resolves uniquely to canonical repository UUID `01a13137-1378-7df9-9968-53738dbf0e48`; its workspace/source binding, `PROVEN` lineage row, physical chunk, and packet key each resolve once. A separate read-only DB readback compared its 65-byte `codebase_chunk_index.content` with the exact local source bytes: both SHA-256 values are `aa7d2ac01ee024deb2df8891a498123bb7c15d9303fb767f6085a9aac92f0d4f`. This is a real source/chunk candidate, not yet a ContextManifest admission: the chunk row's own source/workspace/representation revisions and lineage checksum are null, the packet row's source/workspace revisions are null, and `atlas_ast_nodes` has zero rows for this path under the canonical repository ID. No live SvelteKit request was made and no DB/cache writes occurred. This file-level candidate does not close the function-specific P24 gates or authorize recommender/editor tests.
- **Next safe gate:** Keep the retriever fail-closed and the feature flag disabled. Produce a full read-only reconciliation grouped by symbol version and packet key across callable projection, canonical symbol owner, AST `tree_node_id`/source hash/span, packet, and workspace-source binding. Do not backfill or rerun the materializer until the mismatched rows are explained and separately authorized. The current evidence points to stale or incorrectly revision-bound callable projection rows, not a missing validation step in the loader.
- [ ] **FR-SEARCH-WIRE-04 — Reconcile the live callable projection before enabling it.** Added `scripts/atlas/audit-callable-search-lineage-v1.mjs`, a bounded `REPEATABLE READ READ ONLY` census requiring an explicit workspace revision and capped at 2,000 rows. Live command `node scripts/atlas/audit-callable-search-lineage-v1.mjs --workspace-revision=sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9 --limit=500` exited 0: 85 rows, 0 source/workspace revision matches to canonical symbols, 85 exact packet matches, 85 unique workspace-source bindings, 85 unresolved projected AST IDs, and 0 canonical AST matches under the snapshot loader's source/revision/hash/path anchor. This is diagnostic evidence only; no database write, report persistence, materializer run, or feature-flag enablement occurred. Reconcile producer revisions and AST node identity, then rerun the census and a real source-byte snapshot load before closing FR-SEARCH-WIRE-03.
- **Phase 24 test-readiness recheck (2026-10-15):** Keep the integrated recommender/symbol-editor/document-edit test **BLOCKED and unrun**. The latest native CUDA/graph and tensor-I/O results are fixture/operation evidence and do not satisfy any missing P24 training or lineage gate. The reviewed relevance pool still has 0 completed labels and 0 revision-bound queries/candidates; therefore no qualifying NLP recommender has been trained. The live callable census still reports 85 revision mismatches, 85 unresolved projected AST IDs, and 0 canonical AST matches. The available `graphify-snapshot-native-readback-v1.json` receipt reports `SNAPSHOT_NATIVE_READBACK_BLOCKED` for workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; it cannot be used as a live snapshot proof. PCA/TruncatedSVD measurements and an implemented/evaluated Tang ℓ²-sampler on the same lineage-qualified cohort are also absent. Thus P24-LINEAGE-01, P24-SNAPSHOT-02, P24-NLP-04, P24-LOWRANK-05, P24-TANG-06, P24-EDITOR-03, P24-RECEIPT-07, P24-EXIT-08, and P24-TEST-LOCK-09 remain unchecked. Do not train from proxy/synthetic labels or start integrated testing to probe these prerequisites; first reconcile source identity/revisions, obtain reviewed labels, implement and evaluate the required methods, and pass the governed isolated-editor proof. No service, database, cache, materializer, model training, or document mutation was run for this recheck.
- **Live ContextManifest caller audit (2026-10-15):** `GET/POST /api/retrieval/search-unified` calls `runSemanticSearchWorkflow` without `contextManifestShadow`; that workflow passes the absent config to `runSearchRuntimeContextManifestShadowV1`, which therefore returns `UNAVAILABLE / REVISION_QUALIFIED_FEATURE_SOURCE_PROVIDER_NOT_CONFIGURED` rather than admitting a manifest. `resolveRevisionQualifiedShadowSourcesV1` is not production-wired and explicitly leaves the live `ChunkRetrievalProfileV2` writer and three revision-qualified supplement producers unidentified. Its own output is `SOURCE_VERIFIED_NOT_ADMITTED`, not manifest admission. Do not set synthetic revisions or route fixture providers to production to turn this into an admission. Next gate: identify the actual profile and supplement producers and canonical source-byte provider, then wire their read-only owners into the existing workflow and prove one live request with the same request/workspace/representation/graph revisions. No service was started and no integrated or document-edit test was run.
- **Tang implementation distinction (2026-10-15):** `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts` contains a deterministic weighted-key routing sketch whose source comment explicitly says it is not a theorem implementation. It samples from hand-combined feature proposal scores, not from an ℓ²-sampling data structure or a sampled low-rank approximation as in Tang (arXiv:1807.04271). Treat it as an existing heuristic only; it does not close P24-TANG-06 and must not be marketed as Tang, sublinear, or an exact Top-K method. The required Tang gate still needs a specified access model, implementation, and measured comparison on the shared qualified cohort.
- **P24-SNAPSHOT-02 source/native-observation progress (2026-10-15):** A bounded read-only census of the same 85 callable-linked canonical symbol versions found 85 unique source bindings and exact packet joins; 62 local files matched their canonical whole-file digest/byte count and had valid UTF-8 declaration bounds, while 23 differed. This supplies an available source seed without reconstructing historical bytes or repairing data. Extended `scripts/atlas/audit-function-source-readback-v1.mjs` with explicit opt-in `--ast-url` readback and `scripts/atlas/lib/function-native-source-alignment-v1.mjs` to compare the existing native parser response against canonical node ID, symbol ID, qualified name, language, revision, exact span, and whole-file SHA-256. The comparator rejects stale/malformed provenance, ambiguous spans, wrong IDs/paths/languages, changed bytes, and split UTF-8 characters; HTTP readback is timeout- and size-bounded, and the receipt omits raw source. `node --test scripts/atlas/lib/function-native-source-alignment-v1.test.mjs` exited 0, 5/5; `node --check scripts/atlas/audit-function-source-readback-v1.mjs` exited 0.
- **Reproducible live source/parser seed (2026-10-15):** `node scripts/atlas/audit-function-source-readback-v1.mjs --symbol-version-id=symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7 --ast-url=http://127.0.0.1:8095` exited 0 with `EXACT_SOURCE_BYTES_FOUND` and `nativeAst.status=SOURCE_NATIVE_AST_ALIGNED`. The existing 8095 service returned HTTP 200, clean syntax, and `treesitter-chunker@4.0.0` for `getErrorClustering` in `sveltekit-frontend/src/lib/server/services/error-analysis/ErrorClustering.ts`: packet `packet:804cec79a65c`, workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`, 1,156 source bytes, declaration `[979,1154)` (175 bytes), span digest `50482567aa4be4ceb1551b4543f3a4cce9e9fcb48a1a6e6128c39e7be7e44700`. Native node `3561bb301bdf5dcab4a7134afd843fb78da32acb` and symbol `ee5e3f54660008459366d5d190ee4c81ec83bfcc` exactly reproduce the canonical symbol-version upstream IDs. Saved stdout receipt `.tmp/atlas/function-source-native-readback-getErrorClustering-20261015.json` has SHA-256 `cdbd99cf3124f59937e8c795c95ef9b39e822a3b8c6ac540f7aa7afdcc21e8a1`. Reads ran inside `REPEATABLE READ READ ONLY` and rolled back; no datastore writes or service startup occurred. This proves source-to-native-observation alignment for one symbol only, not its clustering implementation, a persisted canonical AST row, a qualified FunctionRegistry snapshot, or ContextManifest admission (`contextManifestAdmitted=false`). The database AST projection and live caller/provider wiring remain open; P24 gates and the integrated recommender/editor test lock remain unchanged. The separate code-metadata populator `sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs` still hardcodes the nil repository UUID and omits native byte spans/source revision from its insert; do not run it to populate this gap.

- **P24-LINEAGE-01 writer/consumer preflight (2026-10-15):** Added `scripts/atlas/audit-function-ast-writer-consumer-v1.mts` and `scripts/atlas/lib/function-ast-writer-consumer-preflight-v1.mts`. The audit reopens exact source bytes, repeats the existing native-parser identity proof, verifies canonical symbol/upstream IDs and workspace/source binding, and reads a unique completed `canonical_authority=true` execution mapping workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` to workspace ID `625743d2-092b-4fa8-abe0-9dc094920c80`. The compatibility probe invokes the existing AST writer on an isolated recording client and captures the actual reader's lookup parameters; it never forwards a writer statement to PostgreSQL. This is a **shape/capability probe, not an authorized AST write plan or persisted readback**; parent ancestry is explicitly unverified, no signature is invented, and `eligibleForApply=false`. On the same `getErrorClustering` seed, `npx --no-install tsx scripts/atlas/audit-function-ast-writer-consumer-v1.mts --symbol-version-id=symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7 --ast-url=http://127.0.0.1:8095` exited **3 / BLOCKED**: live AST matches remain 0; all seven lookup checks except `relative_path` match, but the writer emits `sveltekit-frontend/src/lib/server/services/error-analysis/errorclustering.ts` while the reader requests `src/lib/server/services/error-analysis/ErrorClustering.ts`. The writer also emits an empty `normalized_signature`, which cannot satisfy the registry adapter's required signature evidence. A future insert alone would therefore not close the lookup. Saved stdout receipt `.tmp/atlas/function-ast-writer-consumer-getErrorClustering-20261015.json` has SHA-256 `5526d38c0aa41e34c72da7e3181af6ecb2d59b853526ea027fe822414bb5f352`; it binds audit/helper/writer/reader source checksums and reports 1 captured statement, 0 inserted rows, `writesPerformed=false`, `contextManifestAdmitted=false`. No DB/cache/materializer write, service restart, GPU job, training, or document editing occurred.

- **Preflight validation and next gates:** `npx --no-install tsx --test scripts/atlas/lib/function-ast-writer-consumer-preflight-v1.test.mts scripts/atlas/lib/function-native-source-alignment-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs` exited **0**, **17/17** (4 new preflight cases plus 13 existing source/writer cases). The root-level bounded TypeScript command (`npx --no-install tsc --noEmit --allowJs --checkJs false --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck --types node --allowImportingTsExtensions scripts/atlas/lib/function-ast-writer-consumer-preflight-v1.mts scripts/atlas/audit-function-ast-writer-consumer-v1.mts`) exited **2** because imported frontend owners require the SvelteKit `$lib` aliases; full app compilation remains unverified. The path crosswalk now agrees in the isolated writer/reader preflight. Next, find a current-revision symbol with a canonical persisted AST match (the sampled current revision yielded zero callable rows); prove that its stored AST node is linked to exact native parser identity, normalized signature, and complete ancestry. If no such row exists, design and review the existing-owner materializer contract before requesting separate authorization for bounded AST materialization and independent readback. Do not run the legacy populator, rebind nil-repository rows, fabricate a canonical AST row from transient parser evidence, relax signature/lineage checks, or enable the registry route. The live request → qualified snapshot → ContextManifest milestone and all dependent P24 gates remain open.

- **P24 parser and live-owner refresh (2026-10-15):** `docker ps` reports `miniforge-nlp-sidecar` **Up 8 hours (healthy)** on `8095`; `GET http://127.0.0.1:8095/health` returned **200**. The running `/ast/chunk` service remains the existing `treesitter-chunker` path, distinct from the SIMDJSON bridge; it was not restarted. The changed parser, invoked in a one-off process inside the same container against the exact `ErrorClustering.ts` bytes, returned one `getErrorClustering` match at `[979,1154)`, source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`, and 86-byte signature text. It returned one syntax ancestor (`export_statement`, `[972,1154)`), not a fully qualified persisted ancestry chain. `docker exec -e PYTHONDONTWRITEBYTECODE=1 miniforge-nlp-sidecar python -m pytest -p no:cacheprovider /app/python/test_miniforge_nlp_sidecar_v2_declarator_kind.py /app/python/test_miniforge_nlp_sidecar_v2_multiline_crlf.py /app/python/test_atlas_structural_provenance.py -q` exited **0**, **18 passed** (3 existing Pydantic warnings). A fresh bounded read-only callable census, `node scripts/atlas/audit-callable-search-lineage-v1.mjs --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=100`, exited **0** with 0 callable rows; the diagnostic inventory showed 523,271 AST rows under the nil repository UUID, not an admissible substitute. Re-running the symbol-specific read-only writer/consumer audit exited **1 / BLOCKED**: source binding unique, path policy now agrees, but `existingAstCandidates=0`, `signaturePresent=false` in the writer plan, and `ancestryVerified=false`; `writesPerformed=false`, `contextManifestAdmitted=false`. These checks refine the blocker but do not authorize materialization, rebind legacy rows, or expose the changed parser through the running HTTP server. Keep the registry route disabled and P24 open.
- **P24 live AST consumer wiring (2026-10-15):** Added an optional `FunctionRegistryAstObservationProviderV1` seam to the existing read-only PostgreSQL snapshot loader and implemented its 8095 adapter. When the existing HyperRAG Function Registry feature flag is enabled, the retriever now obtains parser observations from the environment-configured Miniforge client instead of trusting the empty/stale `atlas_ast_nodes` projection; symbol, packet, source-byte, and repository identity still come from existing PostgreSQL/source owners. The adapter requires exact path/revision correlation, clean syntax, canonical upstream node ID, exact qualified name/span, nonempty signature matching the canonical normalized signature, bounded (2 MiB) source bytes, and bounded containing ancestry spans; it derives the source digest from reopened bytes and never writes AST rows. Missing evidence returns no candidate/fails qualification; no DB fallback or synthesized node ID. Focused Vitest: `npx vitest run src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-read-adapter-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.spec.ts` exited **0**, **17/17**. This is adapter/runtime wiring plus fixture proof only: the running 8095 service was not restarted and its HTTP contract has not yet been verified to expose the new signature/ancestry fields; no real snapshot or ContextManifest was admitted. Keep the flag disabled; next safely reread the exact seed through the current HTTP contract and run the loader once read-only. Do not mark P24 lineage or end-to-end gates complete.
- **Validation refresh:** `npm run check` in `sveltekit-frontend` exited **0** with 0 errors and 181 existing warnings; `openspec validate parent-atlas-retrieval-lod-algorithm-taxonomy --strict` and scoped `git diff --check` exited **0**. No service was restarted, GPU touched, database/cache mutated, or production flag enabled.
- **Live HTTP contract check (2026-10-15):** Re-ran `node scripts/atlas/audit-function-source-readback-v1.mjs --symbol-version-id=symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7 --ast-url=http://127.0.0.1:8095`; exit **0**, `EXACT_SOURCE_BYTES_FOUND`, unique source binding and packet join, and `SOURCE_NATIVE_AST_ALIGNED` for `getErrorClustering` at `[979,1154)` with matching native node/symbol IDs. Direct bounded HTTP read returned 200/CLEAN and exact source correlation, but `signature_text` and `syntax_ancestry` are absent/null in the running process. Therefore the new strict registry adapter correctly yields no qualified AST observation against this live contract. `contextManifestAdmitted=false`, `writesPerformed=false`; the audit script itself did not persist a receipt, and the diagnostic report linked below was created afterward. A fresh four-file Vitest run exited **0**, **28/28**, including client field mapping and proving configured sidecar AST observations bypass the stale-table query with no fallback. Next: locate a separately persisted, exact-revision AST match that already satisfies signature/ancestry, or request a controlled 8095 deployment/restart to expose the reviewed parser contract; do not substitute parser-independent guessed fields or loosen qualification.
- **Current-revision persisted-AST census (2026-10-15):** A bounded PostgreSQL `REPEATABLE READ READ ONLY` census joined active canonical symbol versions to exact packets, source bindings, and canonical repository UUIDs for workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. It found **144** eligible symbols, **0** unique exact-span/source-hash AST matches, **0** ambiguous matches. A first query attempt failed on UUID-vs-text comparison and was rolled back; the corrected `n.repo_id::text` read-only join exited **0**. Docker inspection confirms the healthy `miniforge-nlp-sidecar` container bind-mounts repository code read-only, but its running process still serves the old response contract. No data was changed. No alternate persisted AST seed exists in this workspace snapshot; the unresolved deployment boundary is now explicit. Do not restart/recreate the container without separate operator authorization.
- **Receipt:** `docs/reports/atlas-function-registry-live-ast-contract-v1.json` records the live seed alignment, the missing HTTP evidence fields, zero exact persisted AST matches, focused test results, and explicit false values for ContextManifest admission and runtime writes. It is diagnostic evidence only, not a canonical receipt or promotion decision.
- **P24 live qualification refresh (2026-10-15):** With explicit operator approval, restarted only `miniforge-nlp-sidecar` on `8095`; Docker reported `running healthy`, and `GET /health` returned 200. The refreshed endpoint now returns `signature_text` and `syntax_ancestry`. The first discovery proof still rejected the seed because `atlas_symbol_versions.qualified_name` is the parser ancestry-qualified value `export_statement::function_declaration::getErrorClustering`, while the provider compared it only to the parser-local `chunk.name`. The provider now reconstructs that qualified name from parser `parent_route` plus `name`, retaining exact native node ID, byte-span, source digest, revision, signature, and ancestry checks. Added regression coverage for ancestry-qualified matching.
- **Live vertical proof:** `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify` exited **0** with `QUALIFIED_SNAPSHOT_READBACK_PROVEN`. One candidate qualified across canonical `symbol_version_id` → native `tree_node_id` → packet `packet:804cec79a65c` → exact 1,156-byte source and SHA-256 `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444` → snapshot checksum `242661a300928b3e860ac98aeecc7404856eb978de1152242be7bbc2a29c8091`; load-receipt checksum `a4446d0853377ccf22f2df639b948e0ff82a3d4bc963066ba428bf4f5682be02`. Readback found one stale projection revision difference; canonical symbol/workspace/source readback matched and loader qualified from canonical owners. This is a single-seed read-only snapshot proof, not a live SearchRuntime request or ContextManifest admission. `contextManifestAdmitted=false`, `writesPerformed=false`, `canonicalAuthority=false`; function-registry route remains disabled.
- **Harness correction:** `scripts/atlas/audit-function-discovery-readback-v1.mts` now invokes the same configured 8095 AST observation provider used by the production retriever and emits bounded identity diagnostics. Before this correction the harness called the low-level loader without the provider, so its `AST_NOT_FOUND` result did not test the actual production path.
- **Regression tests and synthesis guard:** focused Vitest command `npx vitest run src/routes/api/search/hyperrag/server.route.test.ts src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-read-adapter-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.spec.ts` exited **0**, **25/25**. `/api/search/hyperrag` no longer sends raw packet summaries to Bifrost; `synthesize=true` returns `synthesis=null` and `synthesisStatus=BLOCKED_CONTEXT_MANIFEST_REQUIRED` until the existing admission owner is wired. Updated diagnostic report: `docs/reports/atlas-function-registry-live-ast-contract-v1.json`. Next gates: execute a feature-flag-disabled baseline and an explicitly authorized shadow SearchRuntime request, then build/admit ContextManifest through the existing feature-evidence owner. Do not mark P24 complete.
- **P24 retrieval storage boundary (2026-10-15):** Current `/api/search/hyperrag` calls `SearchRuntime`; its default `retrieveAllCandidates()` dense executor is Qdrant, with PostgreSQL lexical retrieval/hydration. PostgreSQL pgvector is implemented in the separate `unified-orchestrator.ts` path, which this route does not call; do not add both as separate semantic votes. Set this route's `SearchRuntime` to `readOnly: true`, which disables rerank-cache access and writes. Provenance now reports `pgvector=false` and `redis=false` (not a live Valkey claim); the shared Redis client is Valkey-backed and accepts `VALKEY_URL`/`REDIS_URL`, but this request has not verified live Valkey connectivity or a cache hit. Focused HyperRAG route test exited **0**, **6/6**; full `npm run check` exited **0** with **0 errors / 181 warnings**; scoped `git diff --check` exited **0**. No live SearchRuntime request, pgvector query, Valkey access, database/cache mutation, or ContextManifest admission was performed. Next gate: wire exactly one semantic executor behind the existing SearchRuntime lane contract, then assemble/admit the source-qualified candidate through the existing ACE feature-snapshot owner and capture one live request receipt. P24 remains **PARTIAL**.
- **P24 production-readiness audit (2026-10-15):** Reviewed `/api/search/hyperrag` caller and existing SearchRuntime/Function Registry/HyperRAG/ACE owners. Route provenance now correctly reports `neo4j:false`: the current SearchRuntime retrieval-source union has no Neo4j executor, and `ast_tree`/Postgres-backed HyperRAG evidence is not Neo4j proof. Route-level 500 responses return stable generic `Search unavailable`; hypergraph fusion errors return `HYPERRAG_FUSION_UNAVAILABLE`, not internal exception text. Added response-redaction coverage. SearchRuntime read-only guards promotion, recommendation, rerank-cache, shadow-receipt, and policy-training writes, but the route has no live request receipt. It explicitly reports `pgvector:false` and `redis:false`; no pgvector or Valkey integration/readback was demonstrated here. Production remains **PARTIAL**: the revision-qualified feature-source provider is not wired into ContextManifest admission; synthesis remains blocked and the Function Registry flag remains disabled. 8095 TCP reachability alone does not prove route consumption of its AST/source evidence. `svelte-check` was not run; if needed, capture complete stdout/stderr to a `.txt` log first. No DB/cache/GPU/service mutation was performed.
- **Audit validation outcome:** `npx vitest run src/routes/api/search/hyperrag/server.route.test.ts src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.spec.ts` exited **0**, **11/11** (route **7/7**, fusion **4/4**). `openspec validate parent-atlas-retrieval-lod-algorithm-taxonomy --strict` exited **0**; scoped `git diff --check` exited **0**. Repository-wide `git diff --check` exited **2** due trailing whitespace in unrelated worktree-generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`. No `svelte-check` run.
- **P24 live snapshot revalidation (2026-10-15):** `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify` exited **0** with `QUALIFIED_SNAPSHOT_READBACK_PROVEN`: one canonical symbol version `symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7` → AST observation `3561bb301bdf5dcab4a7134afd843fb78da32acb` → packet `packet:804cec79a65c` → exact source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444` and snapshot checksum `242661a300928b3e860ac98aeecc7404856eb978de1152242be7bbc2a29c8091`. Workspace/source binding and sidecar response correlated; one stale callable-projection revision difference remains. Receipt explicitly records `contextManifestAdmitted=false`, `writesPerformed=false`, `canonicalAuthority=false`. This closes neither the SearchRuntime→ACE feature-source gap nor P24 exit gates. Static contract review confirms the live feature join also requires a checksummed `ChunkRetrievalProfileV2`, matching graph/semantic/representation revisions, all nine query-time features, and a revision-matched supplement with evidence-backed retrieval-frequency, execution-utility and process-fit values; no live producer/provider for these inputs was identified. Do not synthesize them from missing values or this single function snapshot. No DB/cache/GPU mutation, service restart, training, feature-flag change, or `svelte-check` occurred.
- **P24 evidence supersession and low-rank guard (2026-10-15):** The later configured-provider readback above supersedes the earlier direct-HTTP/missing-signature and zero-AST-observation blocker for this one seed only; it proves a qualified source snapshot, not a live retrieval request or ContextManifest admission. Separately, the historical PCA/SVD receipt at `docs/vector-governance/pca-svd-representation-comparison-v1.json` must be treated as disqualified for its advertised component widths: its reported 20-row sample cannot substantiate a 64–512D sample-rank projection. The PCA baseline now fails closed on dimensions exceeding matrix capacity, enforces the 512-row cohort floor, and has regression tests. No new DB query, fit, training, or report overwrite was performed. P24-LOWRANK-05 remains open until a frozen lineage-qualified cohort produces a dimension-verified comparison against exact semantic_768 retrieval.

- **Phase 01–24 evidence review and LUT receipt storage (2026-10-15):** Added `docs/reports/parent-atlas-phases-01-24-evidence-review-v1.json` as a diagnostic, non-authoritative phase inventory. It leaves Phases 1–10 unverified, 11–16 historical/stale, 17–21 without receipt-backed completion, 22–23 unspecified, and Phase 24 partial; no overall percentage is computed. PostgreSQL 18.4 sidecar migration `manual/20261015_atlas_packet_class_lut_validation_receipts_v1.sql` applied atomically after successful rollback rehearsal. Read-only independent readback confirmed the 16-column append-only table, five indexes (revision/outcome B-tree, FTS/JSONB GIN), two UPDATE/DELETE rejection triggers, and zero rows. `drizzle-kit check` and isolated `tsgo` for the new schema passed; the broader schema-export audit remains failed on 23 pre-existing duplicate database table declarations. The focused Vitest runner hung without diagnostics and was interrupted; no test pass is claimed. Schema metadata is registered in `drizzle/sidecar-migrations.json`; Drizzle table is exported through `schema.ts` and filtered from generated migrations because its DDL is sidecar-owned. No receipt writer, repository-analysis search consumer, or production SearchRuntime lane exists yet. `GET /v1/models` on `:8090` returned `ornith-1.5-9b`; this is synthesis/tool use, while `semantic_768`/EmbeddingGemma remains the distinct embedding contract. No source-row vector lineage or production pgvector query was established.
- **PCA/SVD regression validation (2026-10-15):** The focused test command `docker exec -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/app/python miniforge-nlp-sidecar python -m pytest -p no:cacheprovider /app/python/tests/test_pca_svd_representation_baseline_v1.py -q` exited **0**, **5/5**. The first attempt revealed the database driver was imported at module load and missing in the analysis container; moved `psycopg2` import into the DB CLI path so pure matrix tests do not require a database driver. No PostgreSQL connection/query or persistent test cache was used. `py -3.14` syntax compilation exited **0**; strict OpenSpec validation for both changes and scoped `git diff --check` exited **0**. PCA/SVD evaluation itself remains unrun because no newly frozen, lineage-qualified cohort was selected; no report replaced and no model trained.
- **PCA/SVD cohort decoupling (2026-10-15):** Inspecting `docs/vector-governance/pca-svd-representation-comparison-v1.json` confirmed `sampleSize=20` and every `pca_svd_*` metric had `dimensions=20`. Source trace found the SQL cohort required all `latent_256/128/64` columns, coupling PCA to sparse AE coverage. The evaluator now fetches the 768D semantic cohort independently, requires 512 rows before requested 512/256/128/64 fits, and evaluates existing AE latent columns separately on their own matched cohort; their rankings are not mixed. New outputs go to `docs/vector-governance/pca-svd-representation-comparison-v2.json`, preserving v1. The v2 receipt explicitly says database rows are not source-lineage proof and canonical authority is false. Regression test command in the prior bullet now exits **0**, **7/7**; Python syntax check exits **0**. No DB connection, fitting, training, or report generation was executed. Phase 24 low-rank evaluation remains open pending a frozen source-qualified cohort and exact semantic retrieval oracle.
- **P24 retrieval-to-context recheck (2026-10-15):** Source inspection confirms the Function Registry candidate adapter is called by `SearchRuntime` when its feature flag is configured and maps qualified candidates into the existing AST lane, so RRF counts them as one AST vote. A bounded exact source/AST snapshot remains the only live qualified seed; `atlas_callable_search` is stale and not trusted as authority. `SearchRuntime` has no caller wiring for `compileSearchRuntimeLiveFeatureJoinV1` or `runSearchRuntimeContextManifestShadowV1`. Those helpers require checksummed `ChunkRetrievalProfileV2` plus revision/evidence-bound retrieval-frequency, execution-utility, and process-fit supplements; the repository search found contracts/types but no live producers for these values. Do not synthesize values or admit a manifest without these owners. Focused command `npx vitest run src/lib/server/retrieval/function-registry-retrieval-proof-v1.spec.ts src/lib/server/atlas/retrieval/search-runtime-live-feature-join-v1.spec.ts src/lib/server/atlas/retrieval/search-runtime-context-manifest-shadow-v1.spec.ts` was interrupted with exit **1** after 20 seconds with no output; this remains **NOT_VERIFIED** for those three tests. No ContextManifest admission, DB/cache write, feature-flag change, or service change occurred. Keep the phase and production flag open; next identify/qualify the three feature producers and a profile read provider, then run tests under the repository's logged-error workflow before wiring admission.
- **P24 live SearchRuntime replay and hydration correction (2026-10-15; read-only):** Replayed `getErrorClustering` at workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` with an explicit Function Registry adapter and `readOnly=true`. The live symbol/AST snapshot qualified; SearchRuntime emitted one registry candidate in the existing `ast_tree` lane alongside 19 `postgres_fts` and one `exact_symbol` candidate, with no second registry vote. Hydration joined 14 canonical rows and rejected 7 ambiguous source-ref rows. The verified function did not survive final Top-K (`qualifiedCandidateCount=1`, `qualifiedFinalCandidateCount=0`); the final two packets were not the qualified function, and `contextManifestAdmitted=false`. Root cause fixed in `hydrate-candidates.ts`: spreading row JSONB after qualified identity fields overwrote them with nulls, and a packet key could be fabricated as a symbol-version ID. Metadata now precedes authoritative fields, tree-node identity is carried explicitly, and unproved symbol-version fallbacks are omitted. Regression tests prove qualified IDs survive null metadata and packet keys do not become symbol versions. Focused command `npx vitest run src/lib/server/retrieval/hydrate-candidates.spec.ts src/lib/server/retrieval/function-registry-retrieval-proof-v1.spec.ts` passed **7/7**. Receipt `.tmp/atlas/phase-closure-search-runtime-function-live-20261015-v2.receipt.json`, checksum `sha256:ea0795e48e315332e93550107ffa50718369a8e2b361e4df133bb88421b719b3`; transcript `.tmp/atlas/phase-closure-search-runtime-function-live-hydrated-v2-20261015.json`, SHA-256 `sha256:8de8b517ae02698c1e8c73172defd55e24e5b830de0f529791377167456f72ae`. The configured application feature flag was not changed; no HTTP route request, ContextManifest admission, canonical/cache write, or service mutation occurred. FR-SEARCH-WIRE-03 remains open.
- **P24 hydration crosswalk follow-up (2026-10-15):** Inspection of the replay shows the qualified candidate's packet key is `packet:804cec79a65c` and its source is `sveltekit-frontend/src/lib/server/services/error-analysis/ErrorClustering.ts`; neither appears in the final hydrated packet list. The current hydrator resolves by exact chunk ID/packet-key metadata, then permits a source-ref fallback only when exactly one chunk row matches; it intentionally rejects ambiguous source refs instead of choosing the newest row. The receipt aggregates seven ambiguous source-ref rejections but does **not** identify whether one belongs to this function candidate, so the exact drop stage is still `NOT_VERIFIED`. Next proof: emit candidate-scoped exact-ID/source-ref match counts and rejection stage, then add only a canonical, revision-and-span-qualified packet/chunk crosswalk if the live owner data proves one. Do not relax ambiguity handling or force the candidate into Top-K/ContextManifest.
- **P24 candidate-scoped hydration hardening (2026-10-15):** `hydrateCandidatesWithProof` now prioritizes exact packet/symbol/tree-node identities over source paths, recognizes exact `symbol_version_id` and `tree_node_id` metadata, rejects conflicting exact rows, and emits a per-candidate resolution (`HYDRATED`, ambiguity, missing join, revision rejection, or envelope rejection). A Function Registry candidate is not permitted to hydrate through a source-path-only fallback. Regression covers exact identity winning over a shared ambiguous path. Focused tests `npx vitest run src/lib/server/retrieval/hydrate-candidates.spec.ts src/lib/server/retrieval/function-registry-retrieval-proof-v1.spec.ts` passed **8/8**. This is code/fixture proof only: the live candidate has not been replayed with the new per-candidate evidence, and the correct canonical chunk crosswalk remains unproven. Do not close P24 or enable the production feature flag.
- **P24 identity-fallback repair and live replay (2026-10-15; read-only):** The repeated SearchRuntime replay exited **0** and confirmed one live Function Registry snapshot (`symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7`, packet `packet:804cec79a65c`, tree node `3561bb301bdf5dcab4a7134afd843fb78da32acb`, source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`, snapshot checksum `242661a300928b3e860ac98aeecc7404856eb978de1152242be7bbc2a29c8091`). Candidate-level hydration correctly exposed `AMBIGUOUS_SOURCE_REF / SOURCE_REF_MATCHES_MULTIPLE_ROWS`; no path fallback was accepted, `readOnly=true`, no cache/canonical writes, and no ContextManifest admission. Inspection found SearchRuntime still fabricated `symbolVersionId=packetKey` in two normalization/hydration paths; removed both fallbacks and added a regression asserting absent symbol IDs remain null. Live replay transcript `.tmp/atlas/phase-closure-function-hydration-live-20261015.txt`, SHA-256 `0548dfa91e3f2cc366a284381ce036050870f329069201f2819df843955fa1e4`. This advances the diagnosis but remains **PARTIAL**: exact canonical packet/chunk crosswalk for the function is absent/ambiguous, and the candidate does not reach final Top-K or ContextManifest. Next: run focused tests and logged Svelte check, then rerun the identical read-only request; only proceed to ContextManifest after a unique revision/span-qualified chunk row resolves. No feature flag promotion.
- **P24 post-fix validation attempt (2026-10-15):** `git diff --check` passed. Both the focused Vitest suite and a separate single-worker `search-runtime.spec.ts` run stalled at Vitest startup with no test diagnostics and were interrupted; `npm run check` was logged to `.tmp/atlas/phase-closure-search-hydration-check-20261015.txt` and likewise stalled after printing only the Svelte config/Vite warning, then was interrupted. Logs: `.tmp/atlas/phase-closure-focused-tests-20261015.txt`, `.tmp/atlas/phase-closure-search-runtime-single-worker-20261015.txt`, and `.tmp/atlas/phase-closure-search-hydration-check-20261015.txt`. None is a passing result, and the live replay above predates removal of the two fabricated symbol-ID fallbacks. Do not claim post-fix runtime behavior or close the gate until validations complete and the same read-only request is replayed.
- **Cross-roadmap phase reconciliation (2026-10-15):** Updated `docs/reports/parent-atlas-phase-roadmap-reconciliation-v1.json` after finding the root workstation TODO's explicit 2026-09-07 canonical index. That index maps workstation P11–P25 and resolves legacy collision aliases (including P23 transport and P24 GPU/vector residency), but does not make phase labels in separate OpenSpec changes equivalent. Workstation P1–P10 remain unmapped. Follow the documented dependency spine `P12 → P13 → P15 → P16 → P17 → P18 → P14 → P20/P21 → P11/P25`; keep P22/P23/P24 as separate eval/transport/execution lanes. Record completion at each owning `tasks.md` with current receipts; no aggregate percentage is justified. The report records index scope, hashes, commands/exit codes, and zero writes; one repeatable-read, read-only PostgreSQL transaction was run for the subsequent P12 recheck and is recorded separately. Next: use this dependency order to audit owner ledgers and close the first unblocked proof gate, then resolve P1–P10 without inferring scope from unrelated local ordinals.
- **P24 exact chunk crosswalk and final-stage replay (2026-10-15; read-only):** Added a fail-closed canonical chunk resolver over existing PostgreSQL source-binding/lineage owners; it verifies source digest, exact function byte span, unique content occurrence, proven lineage, and span containment. Function Registry candidates now carry the resolved chunk row ID into hydration; the live request resolves symbol `symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7` to chunk row `751464de-b878-45d1-a123-b416bdca780b` and reports `HYDRATED`. The same read-only SearchRuntime request still returns `qualifiedFinalCandidateCount=0`; final packets do not contain the qualified symbol/tree/source/workspace tuple. Reranker logs show `MIXEDBREAD_DISABLED_BY_POLICY` and `xgboost_sidecar_unavailable`, followed by source-diversity filtering. Corrected the receipt's final-candidate match to accept exact packet key or the complete symbol-version + native-tree + source/workspace revision + source-ref tuple; added positive and stale-revision regression tests. This does not change ranking or bypass filters. Validation: four focused files, 38/38 passed (`.tmp/atlas/phase-closure-crosswalk-tests-v3-20261015.txt`, exit 0); SearchRuntime proof tests, 19/19 passed (`.tmp/atlas/phase-closure-proof-identity-tests-20261015.txt`, exit 0); final `npm run check` exit 0, 0 errors / 181 warnings (`.tmp/atlas/phase-closure-crosswalk-check-v3-20261015.txt`); scoped `git diff --check` and strict OpenSpec validation exit 0. Live replay exit 0, read-only, writes suppressed, one qualified function candidate, exact chunk hydration, 0 final Top-K candidates, no ContextManifest admission (`.tmp/atlas/phase-closure-function-hydration-live-crosswalk-v4-20261015.txt`). Keep P24 PARTIAL and feature flag disabled. Next gate: diagnose why the qualified identity is absent from final reranker/post-process output without relaxing source-diversity, revision, or authority checks; then prove ContextManifest admission on an authorized read-only path. The all-phase portfolio remains unscored until each phase has a mapped owner, acceptance criteria, and current receipt.

## Legacy Phase 10A SIMD/native JSON completion claim audit — 2026-10-16

- The May checklist's “COMPLETE” section is a historical report with no exact current receipt binding for its claimed Bifrost L2/L3 hot paths or the listed benchmark commands. Current package manifests do not expose the old `json:parse:bench`, `bifrost:trace:smoke`, or `retrieval:turbovec:smoke` names.
- Current code confirms `fastJsonParse` owners and callers exist, and the native addon exports `simdJsonParse`; however, there are two separate bridge implementations: `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` and `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts`. Both have 32 MiB runtime budget constants, while the package bridge's function documentation still says 8 MiB. This is a source/documentation drift to reconcile, not proof of differing runtime configuration.
- The newer SIMDJSON→tensor-array proof is independently scoped and current: synthetic 4x768 CPU-oracle plus native LibTorch CUDA gather/cosine parity, nine focused tests, receipt `docs/reports/simdjson-graph-gather-2026-10-16T03-41-40-101Z.json`. It does not exercise the legacy Bifrost paths, large-corpus parsing throughput, steady-state performance, or TensorRT inference. Its evidence does not retroactively validate the May Phase 10A benchmark claims.
- Classification: parser sources/callers `CREATED`/`WIRED` at component level; legacy performance and Bifrost end-to-end claims `NOT_VERIFIED`; current tensor fixture parity `PROVEN` only at its documented synthetic scope. Keep production performance claims open until a current, warmed baseline/replay receipt binds the exact bridge, caller, input cohort, cache state, and outputs.
- **P24 per-stage candidate disposition (2026-10-15; read-only):** Extended `FunctionRegistryRetrievalProofV1` to require the exact symbol version, native tree node, source/workspace revisions, and source ref at each pipeline stage; it now reports presence after hydration, reranking, post-processing, and final Top-K plus the exact audited post-process decision. Same live query now proves the candidate is present after hydration and reranking, then dropped by `SOURCE_DIVERSITY` (`dedupPrefixDepth=2 prefix=sveltekit-frontend/src`); final count is 2, ContextManifest admission is false, writes are suppressed. Added a regression for that exact stage/decision sequence. `npx vitest run src/lib/server/retrieval/search-runtime.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose` passed 19/19; log `.tmp/atlas/phase-closure-postprocess-proof-tests-v2-20261015.txt`. Live receipt `.tmp/atlas/phase-closure-function-hydration-live-postprocess-v6-20261015.txt`, exit 0, checksum `sha256:bb32858fd514edb062c6cd4b8bd9fb6f2086198bba741182fbab1867cdda837e`. No scoring, source-diversity policy, feature flag, cache, or canonical state was changed. Keep P24 PARTIAL. Next gate: decide source-diversity calibration only after reviewed query/function relevance labels; then exercise ContextManifest admission. Rerun logged `npm run check` after this proof-contract change.
- **P24 final validation refresh (2026-10-15):** The post-proof-contract `npm run check` completed exit **0**, 0 errors, 181 warnings across 69 files; full log `.tmp/atlas/phase-closure-postprocess-check-20261015.txt`, SHA-256 `01a94b7d962b42bc791c53925e23a2c5b0d122a56c83464b5281476d14379206`. Strict OpenSpec validation exited **0**; phase review JSON parsed successfully. No production flag, DB, cache, service, or GPU state changed. P24 remains PARTIAL pending reviewed relevance labels/policy calibration and exact ContextManifest admission.
- **P24 reviewed-label eligibility recheck (2026-10-15; SELECT-only DB audit):** Re-ran `node scripts/atlas/audit-golden-review-corpus-v2.mjs`; exit **0**, refreshed `docs/reports/golden-review-corpus-v2.json` at 2026-10-15 with `GOLDEN_REVIEW_CORPUS_BLOCKED`, 60 registered queries, 0 relevance judgments for those queries, 0 compatible manifests, 0 human-graded judgments database-wide, and 0 judgments bound to the admitted workspace revision. The transaction executed only SELECT queries; `postgresModified=false`; report checksum `sha256:2ccfb60faf15395767800b1bc6bb59088069cc49e100fc5b6a594426c03d05a3`, transcript `.tmp/atlas/golden-review-corpus-recheck-20261015.txt`. Thus source-diversity calibration and learned scoring cannot be qualified from current labels; keep current deterministic policy and ranking gates unchanged until independent human review is provided. This confirms P24 PARTIAL rather than closing it.
- **P24 live retrieval-profile gate (2026-10-15; read-only):** Ran `node scripts/atlas/audit-chunk-retrieval-profile-live-readback-v1.mjs --readback=.tmp/atlas/graphify-snapshot-native-readback-74d5-v1.json --report=.tmp/atlas/phase-closure-retrieval-profile-live-readback-20261015-v3.json --limit=16`; exit **2**, `PROFILE_LIVE_READBACK_BLOCKED`, 16 rows, blocker `FEATURE_REVISION_MISSING`, `writesPerformed=false`. The receipt binds execution `74d50c86-8194-45ea-8c3d-61aab737ef83` and workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; all 16 rows contain lineage evidence refs but zero have a row-level feature revision. The broader readback reports 19 source refs with one feature revision (`atlas-ast-entity-prefill-v2`) but zero workspace-revision coverage, so that aggregate revision cannot be assigned to the selected rows. JSON checksum `sha256:C69D8B552DC64523F8830E561830ADE0874D2800D3C538AD017DECD0F12EB582`; transcript checksum `sha256:C5757E92D0F60E7AF64E30802E729122EA955A50A86FD20D1780435AB418811A`. The existing materializer plan is not a safe repair input: its 2026-08-27 JSONL has 174 rows, 170 `sourceRevision=workspace:0`, and no `workspaceRevision` field. The function `runSearchRuntimeContextManifestShadowV1` is called from `semantic-search-workflow.ts`, correcting the earlier claim that no caller exists; however, inspected live routes supply `null` or `{}` config, and no revision-qualified provider is registered. Next gate is to identify an existing canonical producer/read owner for feature revision and required supplements, then prove source-aligned profile replay; do not infer values from the aggregate revision or apply the stale plan. Phase 24 remains PARTIAL and its editor/recommender test lock remains in force.
- **P24 focused post-fix identity/hydration validation (2026-10-15; superseded for live Top-K status):** Re-ran `npx vitest run src/lib/server/retrieval/hydrate-candidates.spec.ts src/lib/server/retrieval/function-registry-retrieval-proof-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose` from `sveltekit-frontend`; exit **0**, 2 files / 8 tests passed. The regression confirms a packet-key-only final result does not satisfy function identity; the complete symbol/tree/source/workspace/source-ref tuple does. The hydrator suite passed all 6 cases, including ambiguous source rejection and no invented symbol identity. `git diff --check` passed for the touched runtime, fixture, and status paths. Its “candidate absent from final Top-K” statement was superseded by the later live replay recorded under `LOD-RESOURCE-BRIDGE-01 scoping` below: one fresh candidate survives final Top-K, but ContextManifest admission remains false. P24 remains PARTIAL; no DB/cache/service/GPU writes were performed.
- **LOD-RESOURCE-BRIDGE-01 scoping (2026-10-15; read-only):** Reuse candidates identified in `N64TextureLODSystem.ts`, `shader-cache-manager.ts`, and `python/atlas_compute/low_rank.py` only as implementation precedents; none proves retrieval-side residency integration. A fresh live Function Registry candidate now resolves to exact packet/chunk lineage and survives SearchRuntime through final Top-K, superseding older “dropped before Top-K” notes for this seed. Do not start the LOD priority/LUT experiment until a single frozen candidate set can be admitted by the existing feature/ContextManifest owners: current bounded profiles lack row-level `feature_revision`, and live semantic/graph supplements are not established. The experiment must compare CPU reference priorities with a checksummed baked LUT on the same immutable candidates, recording deterministic replay, memory, cache hit/miss, transfer bytes, recall, latency, and fallback; it must not add a retrieval vote or mutate canonical state. No LOD code, cache entry, or GPU allocation was created in this scoping pass.

## CONTINUATION 2026-11-09 — CPU-AVX2-01 evidence refinement

A standalone LUT-filter harness now provides fresh host-only evidence: forced-scalar and automatic AVX2 dispatch parity, fail-closed byte cases, a 6,527-item cohort, and 5/5 Python↔C++ bitmask parity. The receipt is source/binary/output-hashed and marks acceptance `PARTIAL`. This does not establish exact KNN numerical/order parity or the `tensorrt_bridge.node` dispatch path. Because the standalone binary is built globally with `/arch:AVX2`, it also does not demonstrate execution on a non-AVX2 CPU/OS baseline. CPU-AVX2-01 remains PARTIAL; no GPU claim.

## CONTINUATION 2026-11-26 — masked Top-K fixture replay

Ran `node scripts/atlas/verify-nlut-knn-parity-v1.mjs` against the current `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node`. Exact observed output: `KNN_ORDER_PARITY_PROVEN`, 10 positive fixture queries, 5 negative fixture queries, 0 negative leaks at cosine floor 0.55, and deterministic tie-break verified. This is a synthetic 10-symbol fixture only; it is not the frozen route/query cohort, a SearchRuntime call path, or production retrieval proof. No persistent store or service was touched. The receipt script and KNN script are currently untracked files in the worktree; no standalone report was emitted by this command.

At this checkpoint CPU-AVX2-01 remained PARTIAL: the presets still set `/arch:AVX2` globally. That specific build-config gap is addressed by the separate-output build recorded below; execution on a physical non-AVX2 host remains untested. The N-API output buffers avoid the JS-side gathered-vector copy and can reuse caller-owned output arrays, but `batchCosineTopKMasked` still allocates its internal `std::vector<ScoredIdx>` per call.

## CONTINUATION 2026-11-26 — receipt hardening and masked Top-K adversarial replay

**Revision/scope:** Git HEAD `750d2e89e9e56cfb5d96c097efbdee123d579810`; working-tree source and binary hashes are included in `.tmp/review/tensorrt-bridge-nlut07-receipt-v1.json`. The addon loaded from `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node`. No build, service, database, or SearchRuntime wiring was performed.

- `node scripts/atlas/verify-tensorrt-bridge-nlut07-receipt-v1.mjs --report=.tmp/review/tensorrt-bridge-nlut07-receipt-v1.json` → exact stdout: `{"status":"PARTIAL","acceptance":"PARTIAL","runtimeSupportsAvx2":true,"checks":6528,"adversarialChecks":{"duplicateAllowlistRefused":true},"throughput":{"bytesPerIter":65536,"iterations":200,"dispatchMbPerSec":4607.62,"forcedScalarMbPerSec":6196.4},"reportPath":"C:\\Users\\james\\Videos\\deeds-web-app\\.tmp\\review\\tensorrt-bridge-nlut07-receipt-v1.json"}`. All lengths `n=0..6527` matched the scalar reference on automatic dispatch, forced scalar, and a caller-owned output buffer. Duplicate allowlist input was refused. The single throughput sample is diagnostic only and showed automatic dispatch slower than forced scalar; it is not a performance result.
- `node scripts/atlas/verify-nlut-knn-parity-v1.mjs` → exact stdout: `{"status":"KNN_ORDER_PARITY_PROVEN","scope":"synthetic 10-row CPU masked Top-K fixture; not SearchRuntime integration","positiveQueriesChecked":10,"negativeQueriesChecked":5,"negativeLeaks":0,"cosineFloor":0.55,"tieBreakVerified":true,"callerOutputBuffersReused":true,"fallbackOutputParity":true,"adversarialChecks":{"shortMaskRefused":true}}`. This proves the synthetic fixture's order, tie-break, fallback allocation, caller-buffer reuse, and short-mask refusal only.
- `node --check` passed for both verifier scripts; `git diff --check` passed for the receipt script and ledger edit.

This receipt checkpoint was `PARTIAL`: source-to-binary linkage was not yet shown and global `/arch:AVX2` release flags blocked a scalar-baseline build. See the next continuation for the separate build. The Top-K kernel still stores every active candidate in an internally allocated `std::vector<ScoredIdx>` and reports backend `cpu_masked_bitset`; output-buffer reuse does not make that stage allocation-free or GPU-accelerated. A separate `.tmp/atlas/frozen-qa-ab-nlut-knn-v1.json` remains `PROPOSAL_ONLY`; its 10-query/5-negative figures are not a SearchRuntime replay, and the frozen symbol corpus has no vector fields or admitted workspace revision. Do not treat those numbers as promotion evidence.

## CONTINUATION 2026-11-26 — scalar-safe CUDA addon build

**Revision/scope:** Git HEAD `750d2e89e9e56cfb5d96c097efbdee123d579810`; tracked working-tree source hashes are in `.tmp/review/tensorrt-bridge-nlut07-scalar-safe-receipt-v1.json`. The existing `build-x64-cuda` binary was not overwritten. Configuration and build used a separate output directory.

- `cmake --preset windows-x64-cuda-libtorch -B build-x64-cuda-scalar-safe` → `-- Configuring done (120.3s)`; `-- Build files have been written to: .../simd-bridge/cpp/build-x64-cuda-scalar-safe`.
- `cmake --build build-x64-cuda-scalar-safe --config Release --target tensorrt_bridge --parallel 2` → exit 0; `tensorrt_bridge.vcxproj -> .../build-x64-cuda-scalar-safe/Release/tensorrt_bridge.node`. The compile emitted existing LibTorch/MSVC C4267 size-conversion warnings; no build errors.
- Build configuration readback: `CMAKE_CXX_FLAGS_RELEASE:STRING=/O2`; generated project sets `AdvancedVectorExtensions2` only on `nes_lut_avx2.cc`. `CMakePresets.json` now removes global `/arch:AVX2` from the four release presets; `CMakeLists.txt` keeps the isolated AVX2 source option.
- `ATLAS_ADDON_PATH=simd-bridge/cpp/build-x64-cuda-scalar-safe/Release/tensorrt_bridge.node` with `node scripts/atlas/verify-tensorrt-bridge-nlut07-receipt-v1.mjs --report=.tmp/review/tensorrt-bridge-nlut07-scalar-safe-receipt-v1.json` → `PARTIAL`, `runtimeSupportsAvx2=true`, 6,528 length checks, duplicate allowlist refused. Binary SHA-256: `cf98068332ca5383c1003e90f7be9d235ada6521cbd3b0d3c44e3847e06ea5c2`.
- With the same `ATLAS_ADDON_PATH`, `node scripts/atlas/verify-nlut-knn-parity-v1.mjs` → `KNN_ORDER_PARITY_PROVEN`, 10 positive + 5 negative synthetic queries, 0 leaks, tie-break verified, caller buffers reused, fallback output parity, and short mask refused.

The scalar-baseline **build configuration and addon execution on this AVX2 host are PROVEN**; runtime execution on a non-AVX2 machine is not. CPU-AVX2-01 and NLUT-07 remain PARTIAL because the KNN test is a synthetic 10-row corpus, the 10-query/5-negative proposal lacks admitted source/workspace/model/tokenizer provenance and SearchRuntime replay, and the kernel still allocates/stores all active candidates in `std::vector<ScoredIdx>`. The one-pass throughput figures in the receipt are diagnostic only and do not establish an AVX2 speedup. No production retrieval wiring or data-store writes occurred.

## CONTINUATION 2026-11-26 — bounded masked Top-K and scalar-object inspection

**Status: PARTIAL.** `batchCosineTopKMasked` now retains at most `min(k,n)` candidates in a worst-first heap: a 64-entry stack buffer for `k <= 64`, and a vector sized to `min(k,n)` above that. This changes retained candidate memory from O(active candidates) to O(k), while preserving score-descending / lowest-index-first ties. Query values and active-row values must be finite; NaN/Infinity inputs fail closed before entering heap ordering.

- `cmake --build simd-bridge/cpp/build-x64-cuda-scalar-safe --config Release --target tensorrt_bridge --parallel 2` → exit 0; rebuilt only the isolated scalar-safe output directory.
- With `ATLAS_ADDON_PATH=simd-bridge/cpp/build-x64-cuda-scalar-safe/Release/tensorrt_bridge.node`, `node scripts/atlas/verify-nlut-knn-parity-v1.mjs` → `KNN_ORDER_PARITY_PROVEN`; 10 positive and 5 negative synthetic queries, zero negative leaks, deterministic tie-break, caller-buffer reuse, fallback output parity, `k=65` parity over 96 rows, short-mask refusal, and non-finite query/active-row refusal. This remains fixture evidence, not route retrieval.
- `llvm-objdump -d --x86-asm-syntax=intel` object inspection → `binding.obj` had 0 VEX-prefixed instruction matches; dedicated `nes_lut_avx2.obj` had 7 (positive control). Receipt: `.tmp/review/nlut07-scalar-object-disassembly-v1.json`. This proves the inspected translation unit is baseline-safe; it does not prove execution on non-AVX2 hardware or whole-addon portability.
- Refreshed readiness evidence remains blocked: `.tmp/review/current-workspace-frame-admission-v1.json` reports `EXECUTION_AUTHORITY_UNAVAILABLE`, `WORKSPACE_CURRENTNESS_READBACK_REQUIRED`, and null current revision/match counts. `.tmp/review/qa-route-heldout-evaluation-plan-v1.json` reports `BLOCKED_PENDING_ROUTE_REVIEW`; the existing 10-query cohort cannot be reused as held-out. `.tmp/atlas/frozen-qa-ab-nlut-knn-v1.json` remains `PROPOSAL_ONLY` with `workspaceRevision: null`.

Production SearchRuntime is not wired to this kernel. Do not mark CPU-AVX2-01 or NLUT-07 DONE until non-AVX2 runtime coverage (or an accepted portability proof), independently reviewed route labels, admitted workspace/source provenance, and a held-out SearchRuntime replay pass. No database, service, route, or canonical-store writes were performed.

## CONTINUATION 2026-11-26 — compact scalar-safe receipt

The scalar-safe receipt previously serialized a repeated JSON object for each of 6,528 length checks. The verifier still executes every check, but now records aggregate pass counts, 12 boundary samples, and a SHA-256 digest over canonical per-case results instead of retaining/serializing the full array.

- `node --check scripts/atlas/verify-tensorrt-bridge-nlut07-receipt-v1.mjs` → exit 0.
- `ATLAS_ADDON_PATH=simd-bridge/cpp/build-x64-cuda-scalar-safe/Release/tensorrt_bridge.node` plus `node scripts/atlas/verify-tensorrt-bridge-nlut07-receipt-v1.mjs --report=.tmp/review/tensorrt-bridge-nlut07-scalar-safe-receipt-v1.json` → `PARTIAL`, 6,528 checks, 6,528 exact automatic, 6,528 forced-scalar, and 6,528 caller-buffer matches; duplicate allowlist refused. Canonical case digest: `sha256:232db69dc7faba2f25f67bc1dfa32755f07bae1f8a8518c63f5c2d6d543c19bb`.
- Receipt size changed from 878,234 bytes to 3,723 bytes (about 99.6% smaller; roughly 236x), with the per-case check coverage retained by the digest and aggregates.

The receipt remains `PARTIAL`; compacting its detail does not change the portability or production-integration gates above.

## CONTINUATION 2026-11-26 — EG2, Qdrant Turbo8, and pgvector half precision

**Decision: keep the canonical `semantic_768` lane unchanged and evaluate storage/model challengers independently.** This is an implementation-plan update, not an index migration or production cutover. No database, Qdrant, service, embedding, or cache writes were performed for this review.

### Existing owner and wiring readback

- `services/go-retrieval-service/main.go` defaults to collection `codebase_chunks_768`, representation `semantic_768`, and model `embeddinggemma:latest`; its representation registry marks only `semantic_768` query-executable. These are source defaults, not proof of the live process environment.
- `sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts` also defaults its 768-D model to `embeddinggemma:latest`.
- EmbeddingGemma 2 already has separate challenger owners, including `python/atlas_graph_runtime/eg2_challenger_lane_v1.py`, `sveltekit-frontend/src/lib/server/atlas/embedding/embeddinggemma2-challenger-executor-v1.ts`, and offline index/query/evaluation scripts. This is not evidence that MCP/KAG/RAG or the production SearchRuntime uses EG2. The reviewed MCP context request returned zero hits with missing source-revision warnings, so it establishes no active model for those hits.
- `python/atlas_graph_runtime/qdrant_v120_graphrag_adapter_v1.py` accepts `turbo8` and `turbo16` schema datatypes, with `turbo16` as its default. The existence of this schema helper is not a production collection or caller proof. `codebase_chunks_eg2_768_q8` names an EG2 Q8 model-weight challenger; that `q8` suffix is distinct from Qdrant's `turbo8` vector datatype.
- The existing Qdrant benchmark script is modified in the worktree by concurrent work and currently uses fixed temporary collection names plus DELETE requests. It was not run or edited here. Harden its isolation/cleanup contract and review the complete diff before any benchmark run; never point it at a production collection.
- The canonical PostgreSQL column remains `codebase_chunk_index.content_embedding_768`. An experimental pgvector half-precision expression/index may be compared against it, but must not change the canonical column type or representation identity. Exact-rescore a bounded candidate set from canonical vectors when needed.

### Evaluation order — all remain open

- [ ] **REP-CHALLENGER-01 — Freeze one qualified cohort.** Require admitted workspace/source revisions, exact canonical chunk identities, finite normalized vectors, model/tokenizer/prompt recipe, representation revision, immutable ordinal map, and checksums. Exclude rows that cannot be rebound; do not synthesize revisions.
- [ ] **REP-CHALLENGER-02 — Establish the baseline.** Capture exact PostgreSQL `semantic_768` Top-K for the same held-out queries and candidate cohort, then replay the current production SearchRuntime path with its existing single semantic vote and canonical identity rejoin.
- [ ] **REP-CHALLENGER-03 — Compare Qdrant storage formats.** In uniquely named, isolated benchmark collections, compare `float32`, `turbo16`, and `turbo8` from the same qualified vectors and queries. Record Recall@10/50, top-1 agreement, identity parity, p50/p95 latency, index/RSS/disk use, build time, checksums, and cleanup result. Turbo datatypes are lossy storage representations that replace the stored vector; retain PostgreSQL as the canonical exact-rescore source. Do not use a benchmark that deletes a fixed/shared collection.
- [ ] **REP-CHALLENGER-04 — Compare PostgreSQL half precision.** Benchmark a separate `halfvec(768)` expression/HNSW path or an already-owned challenger table against canonical exact search. Use a short, approved migration only if the benchmark justifies it; keep the `vector(768)` source column intact and measure query plan, recall, latency, and index bytes. No live index creation is authorized by this task entry.
- [ ] **REP-CHALLENGER-05 — Evaluate EmbeddingGemma 2 as a new representation.** Pin the exact model artifact/tag digest, tokenizer, task prefixes, preprocessing, pooling, normalization, executor, and representation revision. Embed the same eligible source cohort into the existing challenger owner, then compare only within EG2's own space. Do not compare EG2 query vectors against EG1 corpus vectors or overwrite `semantic_768` in place.
- [ ] **REP-CHALLENGER-06 — Prove caller coverage.** Trace each intended MCP, KAG, DAG-prefill, RAG, and SearchRuntime entrypoint to the actual embedder, collection/table, representation revision, canonical identity rejoin, and fusion owner. Mark unobserved callers `NOT_PROVEN`; require one semantic-lane vote after normalization/deduplication.
- [ ] **REP-CHALLENGER-07 — Promotion review.** Require an independently reviewed, held-out query-relevance set; predeclared quality/latency/storage gates; exact command/output receipts; rollback/rebuild plan; and explicit review before any caller, collection default, or canonical representation changes.

### Isolated service-arm replay — 2026-11-27

- **CREATED / WIRED for evaluation.** The existing Domain 10 evaluator separates EG1 `:8097/embed` → `codebase_chunks_768:content`, Go `:8100/search/codebase`, and EG2 `:8094/embed` → `codebase_chunks_eg2_768_q8`. Projection diagnostics use different corpora and produce no comparable ranking metrics. Optional Go calls may use existing service caches.
- **LIVE OBSERVATION.** `node --import tsx scripts/atlas/evaluate-search-runtime-topk-reference-v1.mts --service-arms-only --service-arms` exited 0 with `SERVICE_ARM_OBSERVATIONS_RECORDED`. The receipt is `.tmp/atlas/search-runtime-domain10-service-arms-v1.json` (HEAD `d3bc3906c29f6d8d33c4dd4e17862f3483cd92fe`, harness `sha256:72b2cdf87eee5bca2071508af7fc997cabdd1c4fe417628019cfd6af19202417`). All vector, model, response, and byte-binding guard probes passed.
- **Results.** EG1 found 59 of 64 PostgreSQL-linked point IDs in Qdrant. A follow-up readback found 59 exact chunk IDs, 56 matching source refs, 56 matching stored digests, and zero stored PostgreSQL digests equal to SHA-256 of the current chunk body. The harness refused re-embedding. The restarted Go service returned HTTP 200 with zero chunks. Its log reported missing embedding receipt policy or expected representation revision. EG2 returned four normalized MRL widths (768/512/256/128) and queried only the 768-dimensional projection. All 15 hits lacked packet keys, so canonical ranking metrics were withheld.
- **OPEN.** PG18 returned 274,428 populated `content_embedding_768` values over 274,465 chunks, with zero embedded rows carrying all three source, workspace, and representation revisions. Baseline qualification, one frozen same-source comparison, training, and promotion remain open. No per-row backfill, collection change, or training ran.

### EG2 HTTP provider profiling — 2026-11-27

- **CREATED / WIRED for the isolated pilot.** `gemma2-onnx-embed-server-v1.py` accepts an opt-in `ORT_PROFILE_PREFIX` and finalizes ONNX Runtime profiles on graceful FastAPI shutdown.
- **LIVE_PROVEN for CPU HTTP only.** Ran the Q8 server with `.venv-eg2-gpu/Scripts/python.exe -B -`, Uvicorn on `127.0.0.1:18094`, `ORT_PROVIDER_MODE=cpu`, and `ORT_WORKERS=1`. The health, tokenize, and embed requests returned HTTP 200. Unsupported dimension 999 returned HTTP 422. Four normalized widths were returned, 768-D cosine against the Docker CPU reference was `0.9999999999998402`, and the finalized profile recorded 1,066 CPU kernel events. Scope and source checksum are in `.tmp/review/eg2-http-profile-20261127T204703696288Z/receipt.json`.
- **GPU HTTP and cutover remain open.** The existing GPU status command reported one idle Gemma slot, 2,324 MiB free, and `gpuLease=null`. The existing manager has no verified inference-drain/shutdown path. The separate GPU inference benchmark remains valid for its recorded scope. The pilot exited, the CPU Docker reference remained on `:8094`, and no stores were written.

**Current state:** CREATED — separate EG2 challenger and Turbo datatype owners exist. WIRED — source-level defaults point to EG1 `semantic_768`; some EG2 offline/challenger paths exist, while MCP/KAG/RAG production caller coverage is unresolved. UNIT_PROVEN / LIVE_PROVEN — no new proof claimed by this continuation. DONE — no; no challenger has been promoted. See `.tmp/review/embedding-representation-turbo8-readiness-v1.json` for the read-only evidence summary and exact claim scope.

**Source references checked:** `services/go-retrieval-service/main.go`; `sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts`; `python/atlas_graph_runtime/eg2_challenger_lane_v1.py`; `python/atlas_graph_runtime/qdrant_v120_graphrag_adapter_v1.py`; `python/atlas_graph_runtime/qdrant_v120_turbo_benchmark_v1.py`; `openspec/changes/parent-atlas-evidence-agent-proposals/tasks.md` task 12.10; `sveltekit-frontend/drizzle/schema.ts` canonical vector declaration. No live database or service read was performed for this continuation.

### Readiness probe update — 2026-11-26

- `npm run services:health` → `status: healthy`, `up: 12`, `downRequired: 0`, `downOptional: 1`; PostgreSQL `127.0.0.1:5434` and Qdrant `127.0.0.1:6333` are reachable. SvelteKit `:5173` is the one optional service reported down. This is a TCP health probe, not database or collection readback.
- `GET http://127.0.0.1:8094/health` → `status: ok`, model `onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx`, `CPUExecutionProvider`, dimensions `[768,512,256,128]`, max batch 32, ownership `EXPERIMENT`. This proves the endpoint health/configuration response only, not embedding parity, Qdrant writes, or production routing.
- The Turbo8 benchmark and scoped PG18/RLM replay were not run. The current benchmark script has fixed temporary collection names and DELETE calls; no Qdrant mutation is allowed until its isolation/cleanup behavior is made safe and reviewed. No PG18 manifest/grant readback was performed in this probe.

**GAN state for this probe:** CREATED — readiness plan and receipt; WIRED — no new caller wiring; PROVEN — only TCP reachability and `:8094/health` configuration response; DONE — no. Report `.tmp/review/embedding-representation-turbo8-readiness-v1.json` records this scope.

### Benchmark attempt — blocked before Qdrant access — 2026-11-26

- Hardened the existing benchmark in the current worktree to use a random 12-hex run ID in each temporary collection name, refuse reuse if a generated name already exists, and delete only collections successfully created by that invocation. Preserved the existing `--embed-8094` path. The result now reports `writes_performed: true` because a successful benchmark creates/upserts/deletes temporary Qdrant collections.
- Python AST syntax parse → `PYTHON_SYNTAX_OK`; `git diff --check -- python/atlas_graph_runtime/qdrant_v120_turbo_benchmark_v1.py` → exit 0 (Git printed only its LF-to-CRLF working-copy warning).
- Exact benchmark command: `py -3.13 -m python.atlas_graph_runtime.qdrant_v120_turbo_benchmark_v1 --embed-8094 --corpus-limit 200 --query-count 50 --report .tmp/review/qdrant-v120-eg2-turbo-storage-benchmark-v1.json`.
- Exact observed failure: `psycopg.OperationalError: connection failed: connection to server at "127.0.0.1", port 5434 failed: server closed the connection unexpectedly`. The failure occurred at `psycopg.connect(dsn)` before SQL, embedding requests, or Qdrant API calls. No benchmark report was emitted; no Qdrant collections or writes occurred. The earlier service check only proved TCP reachability and did not prove PostgreSQL protocol readiness.

**GAN state:** CREATED — run-scoped collection safety change; WIRED — existing offline benchmark now uses EG2 endpoint when selected; PROVEN — syntax/diff checks only; LIVE_PROVEN — blocked before PostgreSQL query; DONE — no. Retry only after PostgreSQL accepts a normal authenticated connection and a read-only source cohort is available. This diagnostic is not a retrieval-quality or production-promotion result.

### Native oracle and exact token admission checkpoint — 2026-11-27

- **CREATED / UNIT_PROVEN:** Vendored `python/tests/oracles/atlas_reference_v1.py` is now registered by `python/tests/oracles/manifest.json` as test-only version `1.0.0`, with a checked source SHA-256. `python/tests/test_oracle_parity_v1.py` also probes that the native BFS rejects a malformed CSR edge.
- **WIRED / UNIT_PROVEN:** `document-processor.ts` now supplies the local EG2 tokenizer to all legal-chunker branches, including Docling block and table splitting. This call currently sends bare chunk text to `generateEmbeddings` with the default unprompted recipe, so counts include the tokenizer's special tokens but do not invent a title prefix. The separate document routing preview continues to count its title-prefixed recipe. The configured embedding provider/model is dynamic here; matching it to the EG2 tokenizer is **NOT_PROVEN**, so this count is not canonical embedding admission.
- Tokenizer errors, non-integer/negative token counts, and one-word windows over budget now refuse exact chunking. No estimated-token fallback can turn an exact-counter failure into chunks eligible for embedding. The Docling table path now splits at the exact token boundary.
- **Verification:** `py -3.13 -m pytest python/tests/test_oracle_parity_v1.py -q` → **10 passed**. `npx vitest run src/lib/server/document-processor.routing-plan.test.ts src/lib/server/indexer/legal-chunker.counted.test.ts src/lib/server/eg2-token-counter.test.ts --pool=threads --maxWorkers=1 --minWorkers=1` → **3 files, 20 tests passed**. Existing binary suite → **17 passed, 1 skipped** (optional harness unavailable). Scoped `git diff --check` → exit **0** with only line-ending warnings.
- **NOT PROVEN:** Docling's generated block offsets are character offsets over joined block text, not verified UTF-8 byte offsets into the original source. Exact tokenizer counting is not a byte-span/source-lineage proof or proof that the active embedding producer uses the same EG2 tokenizer. The native masked Top-K stage still has no application caller; no claim of multicore execution or SearchRuntime wiring is made.
- **Remaining tasks:** bind Docling blocks to exact source byte spans or keep those spans explicitly unqualified; verify active embedder/tokenizer/recipe identity for each production lane; connect native Top-K only after task/workspace/grant/source/representation eligibility and canonical ordinal mapping are supplied; then prove bounded worker concurrency and structured per-lane receipts.

### Native Top-K input validation follow-up — 2026-11-27

- `simd-bridge/cpp/binding.cc` now rejects zero-norm queries and active corpus vectors, non-finite query/active-row values, fractional or out-of-range `n`/`dim`/`k`, and computes required bitset words without signed `n + 31` overflow.
- The isolated scalar-safe addon rebuilt successfully. Its SHA-256 and the focused test receipt are recorded in `.tmp/review/parent-atlas-native-oracle-eg2-chunking-checkpoint-v2.json`. The v2 receipt reports **11 passed**, all fixture-scoped; SearchRuntime application wiring and multicore execution remain unproven.

### SearchRuntime receipts and cancellation follow-up — 2026-11-27

- **CREATED / WIRED:** `retrieveAllCandidatesWithReceipts` remains the receipt owner and the production SearchRuntime path prefers it; the compatibility adapter still returns candidates only. SearchRuntime now correlates lane receipts with run/task and requested workspace/source/representation revisions. The receipt explicitly says authorization binding is not carried by SearchRuntime; this metadata does not replace the route's validated actor-grant check.
- **WIRED:** One 8-second request budget bounds five concurrently executed lanes; lane deadlines are capped at 5 seconds. AbortSignal reaches query embedding, PostgreSQL read queries (using node-postgres cancellation on a dedicated read-only transaction), and ripgrep subprocesses. Qdrant requests carry a 5-second server timeout; its REST client does not expose AbortSignal cancellation. No queue-admission queue or application-shutdown signal is owned by this retrieval adapter.
- **CREATED / UNIT_PROVEN:** Deadline tests cover pre-admission cancellation, active cancellation, timeout, late rejection handling, and distinct empty/unavailable outcomes. Dense embedding errors now reject to the lane receipt; exact/AST/trigram/rg database errors no longer become successful empty hits. Recoverable FTS-to-trigram fallback remains supported.
- **NOT PROVEN:** Live SearchRuntime execution, route authorization/readback, Qdrant cancellation beyond server timeout, graph/Neo4j cancellation, actual native Top-K caller, and multicore execution. No service, PG18, or projection was accessed or changed in this checkpoint.
- The existing `scoreHydratedCandidatesWithNlut` helper now rejects candidates missing an expected workspace or representation identity; fixture coverage includes foreign and missing bindings. This remains a callable helper with unit proof, not a call from the production `search()` flow. The evidence-document test failure reported from an earlier run was not reproducible against this worktree: the current focused rerun passed its updated Drizzle `db.update` mock path.
- **Native helper hardening:** adversarial review found the helper used `0xff` as an ineligible sentinel even when `0xff` could be allowed. It now requires explicit expected workspace and representation IDs and selects a code outside the allowlist. `search-runtime.spec.ts` passed **27/27** with `0xff` explicitly allowlisted and foreign/missing scope rows still excluded. Receipt: `.tmp/review/searchruntime-native-eligibility-v2.json`. This is helper-level fixture proof, not a production `search()` caller or canonical ordinal-map proof.
- **Evidence fixture and lifecycle follow-up:** the proposed patch's `git apply --check` failed because this worktree already had a Drizzle `update().set().where()` mock, so it was not applied. Strengthened that fixture to assert the canonical `evidence` table, extracted text, normalized 240-character card summary, evidence-ID predicate, and existing synthesis bytes/source revision; added a rejection-propagation test. The three document suites passed **55/55**. Source review confirms chunk vector persistence uses its existing transaction, source-revision/chunk idempotency key, committed readback, and projection outbox; the later evidence-row update is outside that transaction, so a failure can leave vector/outbox state committed while the row summary is stale. This checkpoint used mocks only; no retry/authorization/concurrency DB test was run.
- **Final requested five-file suite:** receipt, SearchRuntime, Qdrant embed failure, NLUT stage, and EG2/NLUT/graph/materializer tests passed **5 files / 36 tests** after the retrieval deadline narrowing edit. `git diff --check` passed.
- **Type-check limitation:** `npm run check` was interrupted before diagnostics because its Node process reached about 7.3 GB working set and system free RAM dropped to about 444 MiB. This is inconclusive, not a passing check.
- **NOT PROVEN:** the route passes request ID and AbortSignal, but not task ID, workspace ID/grant, source revision, or representation revision to SearchRuntime. No authorized PG18/Qdrant readback, live dense caller, native stage invocation from `SearchRuntime.search()`, multicore tournament, or GPU cutover was performed. Keep the live wiring and representation tournament open. Receipt: `.tmp/review/parent-atlas-receipt-and-evidence-followup-v2.json`.
- **Final focused rerun:** receipt/deadline, SearchRuntime, Qdrant embedding-failure, and structural-lane tests exited **0**: 4 files / **35 passed**. `process-evidence-document-v1.spec.ts` separately exited **0**: 1 file / **4 passed**. Scoped `git diff --check` exited **0**.
- **Fusion owner regression:** `fusion-core-v1`, `search-runtime-fusion`, and `rf7-contract-parity-01` exited **0**: 3 files / **42 passed**. This verifies existing deterministic logical-lane fusion fixtures; no Qdrant/TurboVec/pgvector live parity or production backend grouping replay was run.
- **BM25 naming clarification:** the retrieval helper's legacy `bm25` lane uses PostgreSQL `ts_rank` over `tsvector`; its fallback is SQL substring `LIKE` with fixed scores, not Okapi BM25 scoring or `pg_trgm` similarity. Lane identifiers remain unchanged for compatibility.
- **Current status:** cancellation and failure reporting are fixture-proven for the tested adapters. PostgreSQL cancel uses a dedicated read-only connection; ripgrep receives the lane signal; query embedding accepts the signal; Qdrant gets a five-second server timeout but the client cannot confirm cancellation. Other Go/gRPC and Neo4j paths were not integrated by this `retrieve-candidates` owner. Live route replay, actor-grant-bound receipt identity, actual `search()` native Top-K invocation, and multicore execution remain **NOT PROVEN**. No live service or datastore was queried or changed.
- **Final validation reconciliation (2026-11-27):** The later five-file regression run is authoritative for retrieval/native/graph coverage: 5 files / 36 tests passed, exit 0. The later three-file document run is authoritative for evidence/chunker/routing coverage: 3 files / 55 tests passed, exit 0. These supersede the earlier same-day summaries of 4 retrieval files / 35 tests and 1 evidence file / 4 tests. `npm run check` was interrupted at low system memory before diagnostics and remains inconclusive. Details and source hashes are in `.tmp/review/parent-atlas-receipt-and-evidence-followup-v2.json`.
- **Latest post-edit recheck (2026-11-27; checkout HEAD `d3bc3906c29f6d8d33c4dd4e17862f3483cd92fe` plus worktree edits):** The requested five-file command was rerun after the final `retrieve-candidates.ts` narrowing edit and exited 0: **5 files / 37 tests passed** in 31.82s. Receipt: `.tmp/review/searchruntime-live-wiring-gate-v1.json`; `canonicalAuthority:false`, no writes. This is fixture proof, not live replay.
- **P2/P5 caller audit:** `SearchRuntime.search()` has a conditional `nativeDenseTopK` hook and its fixture proves the hook preserves a lexical tail, but repo search found no non-test caller supplying the aligned `queryVector`/`corpusMatrix`/LUT. `hyperrag/+server.ts` calls `runtime.search()` with only request `signal` and `runId`; it does not pass workspace ID, validated actor grant, or native input. The route's `useGraph` path relies on trusted workspace authority, not actor-grant verification. Existing `expandGraphCandidates()` uses strict KAG/GraphV2/Postgres quick-hop owners; `graphBFSExtended` is only referenced by the E2E fixture, and the BitFrost token FSM has no caller in this route. Do not claim live dense/BitFrost/graphBFSExtended wiring.
- **Live discovery gate:** Atlas read-only query returned 12 chunk hits / 10 files, with 7 identity-bound cards, `canonicalAuthority:false`, `revisionStatus=MISSING_SOURCE_REVISION`, and proof rejection reasons `MISSING_WORKSPACE_REVISION`, `MISSING_SOURCE_REVISION`, and `NO_CANONICAL_PACKET`. This is discovery evidence only; it is not a PG18/Qdrant authorized readback or eligible cohort. No live PG18/Qdrant query was made by the application and no stores were changed.
- **P3 representation/ranking tournament:** **NOT RUN / BLOCKED** pending one frozen cohort with admitted workspace/source revisions, exact canonical ordinal map, and matching EG2 model/tokenizer/representation revisions. No MRL/PCA/SVD/autoencoder/XGBoost/PairwiseMLP/DSPy/AutoResearch comparison or model training was performed.
- **P4 GPU profiling:** **DEFERRED** because the requested HTTP replay requires stopping the human-managed Docker CPU `:8094` service first; no service lifecycle action or GPU profile was authorized/performed in this step. Keep the existing CPU service and `:8090` unchanged.
- **Gate 1 currentness check:** `node scripts/atlas/audit-current-workspace-frame-admission-v1.mjs --output=.tmp/review/current-workspace-frame-admission-v2.json` exited 0 with `status=EXECUTION_AUTHORITY_UNAVAILABLE`, `nextGate=WORKSPACE_CURRENTNESS_READBACK_REQUIRED`, `currentWorkspaceMatches=null`, and `sourceAuthority.status=CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` (`safeToPromote=false`, `requiresSnapshotRefresh=true`). The older admitted revision was `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`; it does not prove current source authority for this worktree. No datastore writes were performed.
- **Status:** CREATED/WIRED/PROVEN applies only to the conditional native SearchRuntime hook and the 37-test fixture run. Actual production caller binding, actor-grant scope, live PG18/Qdrant readback, BitFrost FSM, authorized graph traversal through `graphBFSExtended`, tournament, and GPU cutover remain **NOT DONE**. Full check remains inconclusive (previous `npm run check` interrupted at low RAM). Detailed receipt: `.tmp/review/searchruntime-live-wiring-gate-v1.json`.
- Receipt: `.tmp/review/searchruntime-receipt-cancellation-v1.json` records focused test counts, source hashes, and these proof boundaries. T2 remains open.


### T2 local verification and Gate 1 follow-up — 2026-11-28

- The corrected Downloads checkpoint runner completed the exact five-file local Vitest suite: **38 passed, 0 failed, 0 pending, 0 todo**, exit 0. Runner validation was 6/6. Fixture receipt `.tmp/review/native-checkpoint-20261128T000308998571Z/receipt.json` has SHA-256 `50f8854473e12c75b9bd23cfa31f9aca9266bf8416d273c14edd82eea84c1c4c`, `canonicalAuthority=false`, and `liveProof=false`. This is fixture evidence only.
- Caller audit: `hyperrag/+server.ts` passes `signal` and `runId`, but no actor grant, task ID, source/representation binding, or `nativeDenseTopK`; the helper is not invoked by that route. `verified-context-runtime-v1.ts` remains fail-closed with seven providers listed as missing. `graphBFSExtended` is exercised by the synthetic E2E fixture, not this production route.
- The source snapshot admitted for tournament authority is not a PG18 lineage readback. Repeatable-read PG18 v18.4 showed 0 source-binding rows and 0 Graphify rows for candidate `sha256:09e1d40886a982f66a17ec1e068774559d12f012dde412228d909dca49247590`; the newest persisted binding frame remains `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c` (24,253 rows; last observed 2026-10-26). No PG18/Qdrant writes or training occurred.
- **T2 remains OPEN.** No reviewed held-out labels, current admitted PG18/Qdrant cohort, or live `SearchRuntime.search()` native execution was established. Do not promote fixture metrics to a production baseline.

### T2 — Gate 1 source-lineage diagnostic follow-up

- Repaired the existing current-source audit with the linked source-only admission/preflight/manifest validator and repeatable-read, read-only PG18 source-binding delta owner (`scripts/atlas/audit-current-source-cohort-lineage-v1.mjs` + `scripts/atlas/lib/current-source-lineage-readback-v1.mjs`). Focused Node regression: **4/4 passed**; syntax checks exited 0.
- Read-only result for admitted candidate `sha256:1b83001d265b958f6a719b72fcf5acf6acdebde2f773d4581440730fca6337df`: 0 current-revision source bindings, 0 current Graphify rows, latest historical frame `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c` with 24,253 rows. Historical coverage only supports 23,283 unchanged and 964 modified content comparisons; 7,544 current sources lack historical binding coverage, so “added/removed” is not asserted. Status remains `WORKSPACE_REVISION_SOURCE_MISMATCH`.
- Diagnostic: `.tmp/review/current-source-lineage-delta-gate1-20261128.json`, SHA-256 `03bd8091405ff2e0961db859617c1aaa750ba1cc4dbc533f102c0bd8fee7c70c`; `canonicalAuthority=false`, `writesPerformed=false`. The audit/helper code post-dates the admitted manifest and is explicitly marked unbound to it. No validated grant, Qdrant readback, source-body hydration, canonical write, or training occurred.
- T2 remains **OPEN**. The post-edit checkout needs a fresh exact capture and the applicable source-only admission before its own currentness can be asserted; the zero-row PG18 result still blocks authorized cohort hydration and live native SearchRuntime execution.

### T2 HyperRAG route and TensorRT-RTX boundary checkpoint — 2026-11-27

- Replayed `npx vitest run src/routes/api/rag/hyperrag/server.route.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`: **5/5 passed**. The reported 403 did not reproduce. The success fixture's `issued_at` was corrected from a future date to `2026-11-01`; both fail-closed 403 cases still pass. No authorization check was weakened.
- `npm run check`: **exit 0**, 0 errors, 7 existing unused-CSS warnings in `src/routes/(app)/analysis-center/+page.svelte`.
- Live read-only CPU `:8094` health and one fixture `/embed` request returned 200 with `model_id=onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx`; the keyed `embeddings['768']` shape was `[1,768]`. The response omitted `truncated_count`, so HTTP truncation metadata is not proven on this CPU service.
- Hardened `scripts/atlas/benchmark-trt-rtx-parity-v1.py`: unique per-run JIT cache path (no cache deletion), non-fatal package-version lookup before receipt handling, and CPU/GPU model-ID mismatch refusal. `py_compile` and keyed-dimension parser smoke passed. Script SHA-256: `4454d7f5215a482a5cfa7ef39c3a71331da8815a551731b7891d6977f12a241f`.
- GPU HTTP inference, operator profiling, and persistent-cache replay were **not run**. RTX 3060 Ti readback showed 2,279 MiB free while `:8090` remained loaded (idle slot). No release/cutover authorization was exercised. Do not infer GPU parity from CPU response or prior direct-inference results.
- Receipt `.tmp/review/hyperrag-route-trt-http-checkpoint-2026-11-27.json` SHA-256 `ba2fab964c86ce2858a9491d25918fa76c5cfa5cf07e74a6b751c56736b811c1`; fixture/CPU observations only, `canonicalAuthority=false`, `writesPerformed=false`.
- Gate 1 and Gate 2 remain blocked: no source-only admission was issued, no grant was created, and no canonical PG18/Qdrant/Graphify writes occurred. The earlier source snapshot candidate must be recaptured after this turn's source/test/ledger edits before it can be considered for admission.

### T2 continuation — HyperRAG/BitFrost/SearchRuntime replay and PG18 lexical timeout diagnosis — 2026-11-28

- Combined regression command from `sveltekit-frontend`: `npx vitest run src/routes/api/rag/hyperrag/server.route.test.ts src/lib/server/atlas/cache/bitfrost-token-fsm-v1.spec.ts src/lib/server/retrieval/search-runtime.spec.ts src/lib/server/atlas/execution/search-runtime-topk-caller-v1.spec.ts src/lib/server/atlas/execution/e2e-eg2-nlut-graph-materializer-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1` — exit 0, **5 files / 60 tests passed**. This is fixture proof; it does not establish a live authorized route, current PG18 lineage, or production materializer admission. The previously completed `npm run check` was not rerun in this continuation.
- Read-only PG18 diagnostics ran in `BEGIN READ ONLY` with a 5-second local statement timeout. The zero-hit `search_vector @@ to_tsquery('english', ...)` plan used `idx_codebase_chunk_bm25_search` (GIN), returned 0 rows, and completed in **7.200 ms** (5 shared buffers hit; 11 total). The exact substring-fallback plan for `LOWER(summary/content/source_ref) LIKE '%xyznonexistenttoken999999%'` chose `Parallel Seq Scan` with 2 planned workers. This plan-only query was not executed; no index or schema changes were made. The current `retrieveBM25` still invokes that fallback after a successful empty FTS result and after most FTS errors. This is a concrete likely cause for the reported timeout, not proof that a specific prior 57014 came from that fallback. `retrieveBM25` is PostgreSQL `ts_rank` FTS, not true BM25; `retrieveBM25Trigram` is unindexed substring `LIKE`, not `pg_trgm` similarity.
- Source-delta count reconciliation: the earlier delta report was rooted in a 31,791-source root manifest (f290 snapshot), not the later 31,793-source root inventory (ace45 snapshot). Its `23,283 unchanged + 964 modified + 7,544 without historical binding coverage = 31,791` accounts for that report's root set; six historical-only bindings are separate. The later inventory adds two root helper files and shares 7 digest changes; both inventories contain 1,080 nested-repository sources, explaining `32,871` versus `32,873` total inventory entries. This arithmetic does not establish current PG18 bindings or source authority. The old `sha256:91c64cac...` preflight candidate postdates neither the current route/test/ledger bytes nor these follow-up edits and must not be admitted; a fresh capture and reseal is required.
- GPU boundary remains as recorded in the P4 receipt: HTTP output parity is proven for the isolated fixture, but TensorRT-RTX execution is **not**: the profile reports 1,066 CPU EP node events and 0 TensorRT-RTX events, with no engine/cache files. Keep production CPU `:8094` and `:8090` unchanged; no cutover was performed.
- Checksummed read-only continuation receipt: `.tmp/review/parent-atlas-continuation-20261128.json` (paired `.sha256` file). Canonical authority and writes are false. T2 remains **OPEN**; live grant/source binding, Qdrant parity, route-level native execution, and current source admission remain blocked.

### T2 continuation — bounded PostgreSQL FTS fallback — 2026-11-27

- Removed the automatic `LOWER(summary/content/source_ref) LIKE '%term%'` fallback from `retrieveBM25`. A successful empty indexed FTS query now remains a successful empty lexical result; FTS errors propagate to the existing lane receipt rather than triggering an unindexed scan. The receipt reports fallback `not_admitted` or `not_needed`. Positive FTS retrieval now ranks and limits IDs before fetching wide chunk payload columns.
- Read-only live check: `idx_codebase_chunk_bm25_search` served the zero-hit token query; the former substring plan was a parallel sequential scan. The updated live regression requires the zero-hit request to complete under 50 ms. No schema/index DDL or canonical writes were performed.
- Final focused run from `sveltekit-frontend` on 2026-11-27: `npx vitest run src/lib/server/retrieval/retrieve-bm25-fallback-admission.spec.ts src/lib/server/retrieval/__tests__/live-retrieve-bm25-fts.test.ts src/lib/server/retrieval/retrieve-candidates.spec.ts src/lib/server/retrieval/retrieve-lane-receipts.spec.ts src/lib/server/retrieval/search-runtime.spec.ts src/lib/server/retrieval/retrieve-qdrant-embed-failure.spec.ts src/lib/server/atlas/execution/nlut-masked-topk-stage-v1.spec.ts src/lib/server/atlas/execution/search-runtime-topk-caller-v1.spec.ts src/lib/server/atlas/execution/e2e-eg2-nlut-graph-materializer-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1` — exit 0, **9 files / 49 tests passed**. `git diff --check` exit 0.
- `npm run check` was attempted but interrupted after memory use rose to approximately 5.9 GB without diagnostics; this run is inconclusive. No full checker pass is claimed for this edit.
- This closes the unindexed fallback timeout path for the tested lexical lane, not all historical 57014s or PG18 query performance. No new trigram index was added. T2 and live source/grant/cohort admission remain **OPEN**; canonical authority and writes remain false.

### T2 continuation — EG2 import alignment preflight (2026-11-27)

- **CREATED / PROVEN for catalog readback:** `node scripts/atlas/audit-eg2-onnx-cohort-preflight-v1.mjs --catalog-only --output=.tmp/review/eg2-onnx-catalog-alignment-20261127.json` exited 0 with `BLOCKED_NOT_ADMITTED`, PG18.4 transaction read-only, zero selected sources, and `PRIMARY KEY (source_id)` on the existing EG2 `halfvec` table. Receipt SHA-256 `c791376b760b021b555fd847ff98f69b020802d7949fa72f2f56be7d861be214`. Full census timed out, so catalog mode leaves counts null. The `--catalog-only --apply` adversarial probe exited 1 with `READ_ONLY_PREFLIGHT_DOES_NOT_ACCEPT_APPLY_OR_EMBED`.
- **Graph and ranking remain open:** Qdrant REST returned version 1.20.2 and 1,271 points in the existing EG2 Q8 collection. Graphify's status-only receipt returned `BLOCKED` / `NOT_SAFE_TO_PROJECT`. The golden BFS, GraphRAG compiler and Qdrant adapter fixture command in `docs/reports/parent-atlas-eg2-import-alignment-20261127.md` exited 0 with `5 passed, 2 deselected`. The AE plan returned `TRAINING_BLOCKED` / `writerAndPerRowProvenance=NOT_PROVEN`. The runbook records the exact owners and gate order for the next alignment iteration. Repo HEAD `d3bc3906c29f6d8d33c4dd4e17862f3483cd92fe`.

### T2 continuation — GraphRAG TextUnit proposal handoff (2026-11-27)

- **CREATED / WIRED:** `POST /api/nlp/tuple-proposals` accepts opt-in `graphRag: { workspaceId, repositoryId }`. It verifies trusted workspace revision and the actor's exact repository/source grant before source binding or extraction. The existing source owner checks the admitted repository before emitting the binding receipt. The draft builder rechecks each proposal's producer revision, workspace, source, byte slice, and digest. The route emits `PROPOSAL_ONLY`, with GraphRAG document/token and admitted entity/relationship identifiers pending. Requests without `graphRag` retain the existing response contract.
- **PROVEN in fixtures:** four scoped Vitest files, 22 tests, exit 0. Exercised missing exact grant, mismatched repository binding, and tampered extraction evidence. Independent BOM/CRLF and distinct-source identity probe exited 0. Exact commands, source hashes, and scoped results are in `.tmp/review/graphrag-text-unit-proposal-proof-20261127.json` (SHA-256 `424e13533fd4e55d987ca92214f476c70fd57a16d76311b926b3f95160d9998c`).
- **Live gate open:** the read-only current-workspace audit exited 0 with `EXECUTION_AUTHORITY_UNAVAILABLE`, `WORKSPACE_CURRENTNESS_READBACK_REQUIRED`, and `currentWorkspaceMatches:null`. The report is `.tmp/review/graphrag-current-workspace-authority-20261127.json`. Live authorized extraction, reviewed relation admission, GraphRAG import, Neo4j traversal, and ContextManifest replay remain open. No datastore writes were used.

### T2 continuation — GraphRAG relationship review handoff (2026-11-27)

- **CREATED / WIRED:** the opt-in `POST /api/nlp/tuple-proposals` draft now binds each tuple ID to its TextUnit candidate, exact UTF-8 evidence span, evidence digest, extraction producer revision, and checksummed proposal batch and draft. Duplicate tuple IDs fail closed. GraphRAG document, entity, and relationship identities remain pending admission.
- **PROVEN in fixtures:** four focused Vitest files, 22 tests, exit 0, including duplicate IDs, tampered evidence, and missing grants. Exact commands, source checksums, and Vitest output are linked from `.tmp/review/graphrag-review-handoff-proof-20261127.json` (SHA-256 `43c0a515bd39950548f14ea6aef0a0ef654955cbb0d3bc57795af6b92d5fdb9b`).
- **Live gate blocked:** `scripts/atlas/audit-graphrag-workspace-gate-v1.mjs` used a repeatable-read, read-only PG18 transaction and found zero source bindings, zero Graphify executions, and zero active grants for `sha256:09e1d40886a982f66a17ec1e068774559d12f012dde412228d909dca49247590`. The byte-verified snapshot digest differs from the selected tournament-only admission. See `.tmp/review/graphrag-workspace-gate-readback-20261127.json` (SHA-256 `a2d6c1218ebd52b84a474feabd77e52670a39d55167dd75a1af1f89f3f50fa42`). Live extraction, graph import, traversal, and materialization remain open.

### Planned milestone — EG2-only GDS → SearchRuntime → GraphRAG/Qdrant/RRF (2026-11-27)

Scope: define a fixture-first, read-only/dry-run-gated implementation sequence for one request across the existing graph, retrieval, and context owners. Target path: trusted task/query context → EmbeddingGemma 2 query vector → Go Retrieval/Qdrant read-only candidate executor → revision-qualified GDS graph pass → SearchRuntime normalization, one RRF fusion, native Top-K, and pagination → proposal-only GraphRAG evidence → admitted ACE ContextManifest → BitFrost/Headroom → synthesis. These are planned tasks, not completion claims. Use EmbeddingGemma 2 for all new document and query embeddings. Keep legacy or unverified representations isolated; do not mix vectors or bulk-reembed canonical rows. No source/workspace revision writes before the Phase 20 restriction is lifted, and no canonical datastore writes without the applicable scoped authorization.

#### Phase A — Establish owners and accurate readiness

- [ ] Reconcile the current RRF caller inventory using `scripts/atlas/classify-rrf-callers-v1.mjs` and the existing lane-weight census. The checked-in caller classification is from 2026-09-13 (93 callers, 0 unmapped); the latest supplied lane-weight census says migration is blocked. Refresh evidence into a non-overwriting, timestamped review artifact before concluding that there are six unclassified callers. Classify real retrieval lanes separately from rerankers, caches, feature-local helpers, tests, and legacy compatibility. Keep `SearchRuntime` the sole final fusion owner for the target route; group correlated semantic executors as one logical semantic vote without forcing unrelated feature-only callers to migrate.
- [ ] Verify the active EG2 model artifact, tokenizer, prefix/input policy, 768D normalized output, and serving endpoint identity. Treat `:8094` and `:18094` only as isolated CPU/GPU challengers until their receipts name actual execution and match artifact hashes.
- [ ] Reconcile TensorRT-RTX receipts by exact graph/weight/tokenizer hashes and operator profile. Preserve generated checksummed receipts; add a superseding receipt if the current execution evidence differs. Do not claim full GPU execution from provider registration or a fused-node count alone.
- [ ] Confirm Neo4j readiness, restart count, and healthcheck behavior without restarting the human-managed container. Reuse the existing GDS dispatcher and the existing NetworkX/cuGraph parity owners.

Phase A exit: a reviewed owner/caller map identifies the one target route, the single target-route fusion point, the graph algorithm executor, and all existing compatibility callers; no caller is rewritten merely to make an inventory count reach zero.

#### Phase B — Deterministic graph and native-compute contracts

- [ ] Define a versioned Arrow/CSR graph interchange contract: canonical node/chunk keys, candidate ordinal map, directed edge endpoints, predicate, edge evidence/source span, graph/workspace revisions, weights, and checksums. Keep bulk numeric arrays out of JSON/JSONB payloads.
- [ ] Extend the existing GDS dispatcher for bounded KNN, Leiden, Louvain, PageRank/PPR, and supported path traversal. Record graph projection identity and algorithm/config revision; compare deterministic fixture outputs with the established CPU reference. Treat GDS as a derived topology executor.
- [ ] Implement a separate bounded four-dimensional L1/Manhattan topology-neighbor expansion only if the feature contract needs it; do not label it Neo4j GDS KNN. Require deterministic tie-breaking and fixture parity.
- [ ] Wire the existing AVX2 masked Top-K helper only after candidate hydration yields a verified `CandidateOrdinalMapV1`; keep scalar CPU scoring as the oracle and preserve lexical/structural candidates without compatible EG2 vectors.
- [ ] Add stable Top-K pagination keyed by candidate snapshot, query/filter identity, EG2 representation revision, ranking revision, and deterministic continuation key.

Phase B exit: the fixture graph interchange and algorithm outputs are checksummed, ordinal-aligned, deterministic against the CPU reference, and clearly marked derived/non-authoritative.

#### Phase C — Complete synthetic/authorized fixture path

- [ ] Route `.okf` query/domain classification into a bounded prefill proposal. Bind `task_id` only from the existing Kanban/OpenSpec task owner; feature labels, KMeans/SOM, PageRank, and model output remain advisory.
- [x] Fixture-prove the unified route's server request cancellation signal through route → workflow → Atlas adapter → SearchRuntime. Route, workflow, and adapter handoff specs pass 10/10 with mocked execution boundaries; a live request/dependency replay is still open. Task ID, trusted workspace scope, and grant resolution remain unwired and must not be inferred from client fields.
- [ ] Bind the new dense query embedding to the EmbeddingGemma 2 artifact, tokenizer/prefix policy, and an EG2-only projection. Current `retrieveQdrant` calls the generic `embeddinggemma:latest` fallback and the default `codebase_chunks_768` collection; do not route EG2 vectors there or relabel legacy vectors.
- [ ] Make the Go executor's model and collection contract explicit before registering it as a SearchRuntime lane: `SearchCodebase` embeds internally, while `QDRANT_COLLECTION` defaults to `codebase_chunks_768`; current defaults are not an EG2-only query/projection pair. Preserve Go's read-only executor role and do not add a second fusion owner.
- [ ] Wire the existing Go Retrieval adapter as one read-only SearchRuntime lane with identity/revision receipts and bounded deadlines. Verify fallback behavior and ensure Go Retrieval does not perform a second final fusion.
- [ ] Exercise the Qdrant request/response contract in the fixture path and generate a dry-run projection plan from canonical EG2 vector fixtures. No production collection upsert, collection creation, or full-corpus backfill is part of fixture proof.
- [ ] Hydrate each selected candidate from the existing canonical PG18 owner; validate actor scope, packet/chunk/source identity, source/workspace revision, content hash, EG2 artifact/prefix, dimensions, normalization, and representation revision before native scoring or graph expansion.
- [ ] Apply bounded, revision-matched graph expansion and exact rescoring; record candidate ordinals and provenance in a route-level receipt. Keep graph results in their declared logical lane and prevent duplicate semantic votes. Probe stale workspace revision, foreign graph node, wrong EG2 representation, duplicate semantic vote, missing grant, timeout/cancellation, and dense-vector absence.
- [ ] Produce a proposal-only GraphRAG TextUnit/tuple from fixture source bytes with exact source/chunk identity, UTF-8 evidence spans, and content hashes. Do not import the proposal as an admitted graph edge.
- [ ] Build an admitted ACE `ContextManifest` from independent readback rows, then feed only that manifest through the existing BitFrost/Headroom owners to the active synthesis model. Do not pass raw retrieval hits, vectors, KV cache, or hidden reasoning to the model or cache.
- [ ] Connect `task_prefill_ace_qlora_packet_v1.py` after the admitted manifest exists. Emit proposal-only, ungraded review examples; human-reviewed labels and offline artifact admission remain separate gates.
- [ ] Replay the entire fixture from request to cited synthesis output. Record exact command, revision, artifact hashes, receipts, lane/fusion trace, latency, and side-effect checks. Classify each edge CREATED/WIRED/PROVEN; fixture success is not live proof.
- [x] Add a non-overwriting local receipt runner for the focused graph-ownership and EG2/NLUT materializer fixture tests. Receipt `FIXTURE_ONLY` PASS proves those two test scopes only; it explicitly records synthetic lane/vector/graph inputs, no service or database access, and `endToEndPromotionStatus: NOT_PROVEN`. Evidence: `.tmp/review/parent-atlas-phase-b-c-fixture-2026-11-28T082940-129Z.json`.
- [x] Add a diagnostic citation-symbol audit for generated code recommendations. Its 3 focused Node tests pass; it flags backticked identifiers missing from the cited excerpt. This is a lexical check, not semantic entailment or route proof. The latest prior report shows why: it cites `R2` for `getAuthorizedCase`, while that identifier is present in adjacent `R1`; it also labels the answer `UNVERIFIED`. Evidence: `.tmp/review/e2e-turbovec-recommendation-20261128T082716976Z.json` and `scripts/atlas/lib/citation-support-audit-v1.test.mjs`.
- **CREATED, not yet PROVEN:** `scripts/atlas/eval-eg2-known-item-v1.mts` now evaluates only the EG2 challenger representation, applies the shared EG2 code-query prompt, restricts candidates to the same representation/model revision and selected cohort, and writes a unique local diagnostic receipt. It no longer calls the canonical EG1 embed endpoint. This remains self-retrieval sanity only; source authority, relevance, Qdrant parity, and live route execution are not established. No evaluation rerun is recorded.

Phase C exit: one reproducible fixture request exercises EG2 identity, Go/Qdrant retrieval contracts, graph expansion, single SearchRuntime RRF, stable Top-K, GraphRAG proposal, ContextManifest, and cited synthesis while proving zero canonical writes. Report fixture execution separately from any real-service/model-provider execution.

#### Phase D — Production admission after the Phase 20 restriction

- [ ] Obtain a fresh exact-revision source-authority readback and current Graphify execution owner. Do not relabel historical source rows with a new workspace/source revision.
- [ ] Use the existing authorized grant owner for a narrowly scoped actor/workspace/repository/revision grant; do not create or seed a grant to make tests pass.
- [ ] Reconcile a bounded PG18/Qdrant cohort by canonical chunk ID, source/content hashes, workspace/source revisions, EG2 model/tokenizer/prefix, 768D normalization, representation revision, and Qdrant point identity. Keep Qdrant as a rebuildable projection; do not infer full-corpus parity from a sample.
- [ ] Admit reviewed, byte-span-grounded graph relations and perform graph import only through the existing authorized owner. Read back graph revision and edge provenance before route-level GraphRAG claims.
- [ ] Run one authorized live request through the same fixture-proven SearchRuntime path and independently verify source readback, grant enforcement, fusion owner, graph scope, ContextManifest, citations, and writes/read-only behavior.

Phase D exit: a single revision-bound live request has independent authorization/source/vector/graph readback and a complete checksummed route receipt. Until then, GraphRAG imports and Qdrant upserts remain dry-run only.

#### Phase E — Optimization and training

- [ ] Only after cohort admission, compare EG2 768/512/256/128 MRL and Qdrant Turbo8/Turbo16 as representation/compression challengers, not alternate embedding models. Require exact-baseline Recall@10, reviewed relevance, P95 latency, disk/RAM/VRAM, and model/representation identity receipts.
- [ ] Verify the live RAPIDS/cuVS ABI and compare cuGraph/GDS/NetworkX on identical revision-bound graph inputs with a shared GPU resource budget. No production routing change from fixture parity alone.
- [ ] Train domain MLP, SOM/KMeans routing, or latent autoencoder challengers only with reviewed labels or admitted EG2-derived features, grouped splits, held-out evaluation, immutable artifact checksums, and a separate promotion receipt. No automatic promotion.
- [ ] Keep Airflow uninstalled for this vertical slice; use the existing PG18/outbox/RabbitMQ/scheduler owners unless a measured orchestration gap is documented.

Exit state: this plan does not authorize source-revision writes, actor-grant writes, canonical lineage materialization, Qdrant collection migration, graph import, model training, or production cutover. Those actions require their separate gates and receipts.
