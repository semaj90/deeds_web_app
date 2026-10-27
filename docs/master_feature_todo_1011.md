# Master feature roadmap and evidence ledger — updated 2026-10-27

> **Status: pipeline NOT finished.** The pieces below work and pass their tests. The pipeline is not complete: the corpus, glossary, and `.okf` schema are not fully indexed, so every retrieval and routing claim here is partial. Nothing in this file says the pipeline is production-ready.

## Current position — 2026-10-27

**Where we are:** current snapshot selection/execution lineage is readback-proven, and a fresh read-only join proves two exact `c636…` workspace bindings are members of the completed execution's `SOURCE_SELECTION` cohort. Canonical packet identity and source→packet→chunk→retrieval→ACE lineage are still unproven. The exact SvelteKit seed trace stops at `CANONICAL_PACKET_KEY_V2_RESOLUTION_UNPROVEN`; no qualified retrieval or ContextManifest trace was attempted. Feature/domain population is not semantic correctness: source-bound feature proposals, OAK taxonomy resolution, Neo4j metric lineage, and reranker/recommendation consumers remain open or unknown. GPU, cache, and Kafka work stays downstream of identity and retrieval proof. Historical runtime and phase notes below retain their original dates and scopes; they are not current completion percentages.

**Fresh packet identity boundary (2026-10-27, read-only):** 24,253 admitted `c636…` source bindings and one root `atlas_repository_identity` row exist, but stable-file identity, revision-binding, and alias registries are empty. In `atlas_packets` (61,718 rows), zero carry the `c636…` workspace key and zero exactly match `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`; 3,294 packet aliases do not resolve this missing identity. Receipt `.tmp/atlas/packet-identity-owner-live-readonly-20261027-v2.json`. The existing packet admission “rehearsal” issues `INSERT`s before rollback, so it was not run as a read-only audit. No persistent writes occurred.

**Not proven, explicit list (2026-10-27):**
- Live `:8095` TypeScript/Svelte checks now pass 4/4 (three live HTTP parser checks plus one fixture symbol check) against `http://127.0.0.1:8095`; receipt `.tmp/atlas/live-8095-svelte-symbol-replay-20261027-v1.json`. This proves parser bytes/spans for one current worktree `.svelte` file, not live VS Code LSP, admitted-workspace binding, canonical packet identity, or downstream retrieval/ACE lineage.
- `atlas_stable_file_identity` has 0 rows, so no per-file UUIDs are minted. `atlas_repository_identity` has 1 row (`deeds-web-app`, UUIDv7). `atlas_workspace_source_bindings` has 24,253 `c63620c4` rows of 93,500.
- Neo4j hypergraph: 470 `HyperedgeMirrorV1` and 548 `HyperedgeMemberV1` nodes exist (correcting the 2026-10-11 zero-node finding). Writer, freshness and retrieval use are unverified; `hypergraph-retrieval-v1.ts` remains a contract.

**Fresh source/packet/chunk readback (2026-10-27):** against 24,253 bindings for admitted `c636…`, exact source-ref/source-revision joins reach 15,352 packet rows; exact packet-key/source/revision joins reach 13,820 source/packet identities and 114,397 chunk rows with proven lineage membership. Zero matched packets carry `workspace_revision_key=c636…`. This is not current workspace admission, PacketKeyV2 resolution, vector parity, retrieval, or ACE proof. See `docs/reports/atlas-source-packet-chunk-readonly-audit-2026-10-27.md` and `.tmp/atlas/current-source-packet-chunk-readonly-20261027.json`.

## Current domain / graph coverage recheck — 2026-10-27

The read-only PostgreSQL 18.4 repeatable-read audit is recorded in [Atlas Domain and Graph Coverage — Read-Only Audit](reports/atlas-domain-graph-coverage-readonly-2026-10-27.md). Its denominator is **61,718 live `atlas_packets` rows**, not the pasted 58,365. `domain_class` and `feature_id` are non-empty on 61,718/61,718 rows; `feature_label` is non-empty on 61,660, leaving 58 populated IDs without labels. The proposed 21,021-row domain-class NULL backfill is not indicated by current coverage. This is presence, not correctness: repository analysis proposes `feature_label` and a related `feature_id`; `domain_class` remains a distinct taxonomy assignment requiring validation against the versioned taxonomy/OAK owner.

Live presence counts: `tree_node_id` 61,659; `title_id` 61,660; `community_id` 61,660 across 12,050 distinct IDs; `page_rank_score` 61,659; non-empty `concept_ids` 58,360 (3,357 NULL, 1 empty array). These counts do **not** prove current Louvain/PageRank run lineage, grounded concept extraction, or producer correctness. Existing receipts are dated and scoped separately: Phase 2C is a five-entity regex sample; Phase 2D is a bounded 50-row exact-join apply; the October 15 PageRank parity receipt is diagnostic on graph revision `dff900…` and explicitly non-canonical; the OAK audit is `BOUNDED_PARTIAL`. See the evidence index in the linked report.

**Disposition:** do not run the four proposed bulk jobs. The urgent NULL gap is absent in the live database snapshot. Keep taxonomy semantics, Neo4j graph/run-to-packet lineage, and concept provenance as open/unknown workboard items. The proposal CLI has an opt-in v2 path that consumes extracted AST/document context; code evidence remains regex-fallback, not live LSP/8095 symbol evidence. Its bounded `Post` / `sveltekit-frontend.post` proposal (confidence 0.91, `GENERIC_REPLACEMENT_RECOMMENDED`, `canonicalMutation:false`) came from a source in the selected cohort, and the retained snapshot bytes matched the selected source digest and length. Admission is now independently reconciled: the tournament receipt admits 30,105 selected sources from 30,327 snapshot candidates; all 222 hygiene exclusions exactly account for the omitted candidates. A corrected read-only authority audit reports `CURRENT_SNAPSHOT_PROVEN` for execution `01a1763a-4355-71d7-9b81-2c7a1814a41f`, while `canonicalAuthority:false` and graph authority remains unproven. Treat the feature label only as a review proposal. Next: feed qualified AST/LSP/exported-symbol evidence into the feature owner and compare proposals with existing rows read-only. Abstain on generic/path-only labels. Map `domain_class` separately through taxonomy/OAK. No database, Neo4j, cache, or projection writes were performed.

**SvelteKit feature/domain semantics (2026-10-27):** A read-only path-scoped historical packet query found 19,956 `atlas_packets` rows under `sveltekit-frontend/`: all have `feature_id`, 19,898 have a label, but just 7 join `atlas_fi_features`; those 7 label pairs match, yet each registry row has no source revision and was produced by `feature-ontology-relationship-preview:v1`. The 4,748-row global `atlas_feature_map` has zero SvelteKit path rows. Only 9,105/19,956 domain values directly match an active taxonomy ID or case-insensitive label; OAK/alias resolution was not tested. No packet row in this slice matches admitted workspace `c63620c4…`. Some frequent values resemble route/file-role labels (`sveltekit-frontend.+server` → `+server.ts`), but producer lineage is absent, so semantic feature labels, domain mappings, and reranker classifications remain **UNKNOWN**. Use current revision-bound AST/LSP proposals with evidence spans and abstentions; do not treat populated fields or path-derived labels as canonical. No database, taxonomy, graph, or projection writes occurred. Receipt: `.tmp/atlas/sveltekit-feature-domain-readback-20261027.json`.

**Recommendation-vs-reranker alignment (2026-10-27):** The admin server loader computes daily Graphify recommendation scores using `domainClassification.confidence`, but the page component does not consume the returned field and the caller does not persist its policy signal/receipt objects. This is not an active user-visible proposal flow, nor proof that SearchRuntime's injected reranker is active or interprets `domainClass`. The builder now separates event revision from source revision, admits only candidates resolved by the exact source-binding owner for a supplied SHA-256 workspace revision, drops unbound candidates, and caps resolver fanout at 64. No production caller supplies the admitted revision today; the Graphify run fallback is not used as source-binding authority. The fixture verifies no-admission and malformed-revision refusal. Keep the recommendation path `COMPONENT_PRESENT_UNQUALIFIED` and production reranker status **UNKNOWN** until verified source lineage and a real consumer are established. See `docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md` and OpenSpec task 1.10.

**Feature/domain classification workboard alignment (2026-10-27):** Keep `feature_id` and `feature_label` as proposed repository-analysis identity (capability/function backed by source evidence), distinct from `domain_class` (versioned taxonomy/OAK classification). Continue the existing `feature-label-semantic-derivation` owner; it emits report-only proposals and retains human review before canonical application. A V2 regression now prevents an existing label from self-certifying as `CANONICAL` when it is the only evidence (`MANUAL_REVIEW`; 4/4 focused tests); this is a guard, not proof of current-source correctness. The open directory-analysis tasks require admitted-revision AST/LSP evidence, exact spans and abstentions; taxonomy alias/status validation; grounded concept/entity provenance; and Neo4j community/PageRank snapshot-to-packet resolution. Static source evidence in `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts` forwards `domain_class` into `LaneCandidate.metadata.domainClass` before the injected reranker. This proves a source-level adapter surface only—not production activation, consumer interpretation, lineage, or ranking effect—so reranker/recommendation status remains **UNKNOWN**, not BLOCKED or absent. Cross-reference Phase 9 recommendation owners (`AWM-09-03/04`) and `parent-atlas-compute-rank-cache-eval-dspy-gepa`; the existing recommendation proposal lane can prioritize human review, but cannot mint canonical labels, alter taxonomy, or add retrieval votes. Existing directory-summary/domain-candidate builders are inputs to reuse, not proof of current semantic fanout: the summary builder consumes prebuilt feature/package/rollup artifacts, and the domain helper scores directory/path/package terms. No new classifier, bulk job, or persistence path is authorized. Owner ledger: `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §§1–2.

**Bounded live source-analysis proof (2026-10-27):** The SvelteKit register page’s checkout bytes match the admitted snapshot SHA-256 (`7272442b…`). Against live `:8095`, the test sends the admitted workspace revision and verifies the response echoes it; the parser reports complete/clean output, zero error/missing nodes, and matching UTF-8 length. A second live `:8095` TypeScript parse verifies its declaration byte span contains the same cross-file target span resolved by the in-process TypeScript LanguageService. The combined fixture also verifies Unicode byte mapping, revision-bound symbol enrichment, a `REVIEW_REQUIRED` feature proposal, and deterministic fixture ContextManifest/prefill cache-record reload. Focused package build/tests: 16/16, no skips. Receipt: `.tmp/atlas/svelte-source-analysis-live-8095-20261027.json`. This is not a live VS Code LSP session, production packet/chunk identity, Valkey, retrieval, or ACE proof; the canonical trace remains blocked at `CANONICAL_PACKET_KEY_V2_RESOLUTION_UNPROVEN`.

**Packet/repository identity owner recheck (2026-10-27, PostgreSQL read-only):** The live root repository mapping exists (`deeds-web-app` → `01a13137-1378-7df9-9968-53738dbf0e48`), but `atlas_stable_file_identity` has 0 rows, admitted-`c63620c4…` stable-file bindings have 0 rows, and the proposed V2 packet registry/alias relations are absent; the legacy alias table has 3,294 ACE-prefix rows. A static `repo:root` → `deeds-web-app` source-authority bridge exists, but `computePacketKeyV2` still keys on the `repo:*` membership scope. The identity reconciliation report calls for canonical repository UUID/repository-qualified source ownership; the draft stores both values but does not prove derivation parity. Thus the bridge is useful evidence, not proof that the key recipe and canonical identity owner agree. No PacketKeyV2 alias/current identity can be admitted from these facts alone. Receipt: `.tmp/atlas/packet-identity-owner-readonly-20261027.json`; first failing boundary remains `CANONICAL_PACKET_KEY_V2_RESOLUTION_UNPROVEN`. No DDL or data writes occurred.

**Source-to-ACE gate refresh (2026-10-27):** Read-only admission reconciliation proves the 30,105-source selected cohort against the 30,327-source snapshot and tournament receipt; execution `01a1763a-4355-71d7-9b81-2c7a1814a41f` matches all selected paths, source digests, lengths, and workspace revisions. The separate source-bridge audit remains `CURRENT_SOURCE_BRIDGE_BLOCKED`: 24,253/29,026 selected root sources have exact current workspace bindings, 4,773 are missing. `graphify_files` is not empty: a live read-only count on 2026-10-27 found 26,014 rows from 6 run IDs (latest update 2026-09-30), with `source_revision_authority` NULL on every row. None is bound to execution `01a1763a…` (`last_seen_run_id`), which is why the refresh receipt counted 0. First failing boundary: `WORKSPACE_SOURCE_BINDING_RECONCILIATION_REQUIRED`. The execution is not canonical graph authority; no binding repair, Graphify run, or persistent write occurred in this refresh. Receipt: `.tmp/atlas/source-bridge-refresh-20261027.json`; authority receipt: `.tmp/atlas/readonly-authority-refresh-20261027-v2/current-graphify-snapshot-authority-v1.json`.

**Corpus and glossary live check (2026-10-27, read-only `SELECT`s on `legal_ai_db`, PostgreSQL 18.4):**
- CA codes: `legal_chunks` 60,432 rows, 60,431 with `embedding` (not 21%). `legal_nodes` 35,106 (the 35,102 section count and 60,428 chunk count in `openspec/changes/legal-corpus-california-codes/tasks.md` are 2026-10-17 snapshot values). Golden-candidate receipt: `docs/reports/golden-legal-candidates-v1-receipt.json`. Gold labels: still 0.
- Runtime glossary: `legal_glossary` 0 rows and `legal_definitions` 0 rows. The glossary surface is wired but holds no data; the earlier "WIRED" status does not mean populated.
- `.okf` validators (2026-10-27, receipts written under `docs/reports/`): `okf-v02-bundle-audit-2026-10-27.json` → `OKF_V02_REVIEW_REQUIRED`, 0 of 387 files valid (the 2026-09-24 audit scanned 25); `okf-claim-freshness-2026-10-27.json` → `CLAIM_FRESHNESS_REVIEW_REQUIRED`, 0 of 32 claims valid; `okf-schema-boundaries-v1.json` → `OKF_SCHEMA_BOUNDARIES_PROVEN` (5 fixtures, `promotionAuthorized:false`). Earlier receipts are archived in `docs/reports/archive/2026-10-27-okf-pre-revalidation/`.

**Source registry refresh (2026-10-27):** Correctly scoped to the admitted `repo:root` cohort (29,026 sources), the read-only planner reports 21,835 exact path+digest matches, 2,418 registered digest mismatches, and 4,773 absent registry refs; no normalized-path candidates or ambiguous keys. A first exploratory invocation against the flattened 30,105 execution rows included nested repositories and reported 5,852 missing refs; that result is not the root-cohort assessment. No registry or workspace-binding rows were written. Receipt: `.tmp/atlas/source-registry-reconciliation-root-cohort-20261027.json`; owner ledger: `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §1.5.

**Live parser smoke (2026-10-27):** `packages/parent-atlas` TypeScript build and focused LSP/identity/prefill/Svelte tests passed 24/26, with two live tests skipped absent endpoint configuration. Against `http://127.0.0.1:8095`, the Svelte/TypeScript smoke passed 3/3, including digest-mismatch refusal and byte-span containment for a real `.svelte` source. This does not prove a live VS Code LSP session or canonical packet/chunk/retrieval/ACE lineage; those remain open. No persistent data was written.

**Binding/registry overlap (2026-10-27):** A second repeatable-read/read-only comparison found the same exact 4,773 root source refs missing from both current workspace bindings and `atlas_source_refs` (equal sorted-ref-set checksums; no binding-only or registry-only refs). The 2,418 present registry refs with stale digests are a different cohort. This identifies registry absence as the shared predecessor for the missing refs, but does not authorize inserts or prove source-type eligibility. Receipt: `.tmp/atlas/root-binding-registry-overlap-20261027.json`.

**Exact source-to-packet trace (2026-10-27):** The admitted snapshot’s `sveltekit-frontend/src/routes/register/+page.svelte` bytes (12,388 bytes; digest `7272442b…`) were parsed by live 8095 with 11/11 byte spans valid; PostgreSQL readback found one exact registry row and current workspace binding. The trace stops before retrieval: the only packet uses legacy `packet:a860248dc642`, has an old `e24bb971…` workspace revision key and a shortened `canonical_source_ref`; the PacketKeyV2 identity/alias-v1 tables are absent and the legacy alias table has no mapping. Although 18 packet-chunk lineage rows are marked `PROVEN` for source revision, each backing chunk lacks workspace/source/representation revisions and remains embedding-ineligible. First failing boundary: `CANONICAL_PACKET_KEY_V2_RESOLUTION_UNPROVEN`; retrieval/ACE were not attempted. Receipt: `.tmp/atlas/source-to-packet-register-page-readonly-20261027.json`.

**PacketKeyV2 cohort follow-up (2026-10-27):** A live repeatable-read/read-only query matched 21,835 current `c63620c4…` workspace bindings to source-registry path+digest, then found zero directly stored UUIDv5-shaped `packet:<uuid>` rows whose source ref, source revision, and workspace revision key all match. The source audit confirms the app resolver consults `atlas_packet_identity_aliases`, which currently has no storage-to-V2 aliases; do not infer an external alias path. The next gate is the report-directed registry-backed identity-owner decision plus stable-file identity/revision binding—not key minting or backfill. No schema or data writes occurred.

**PacketKeyV2 population/identity-owner diagnostic (2026-10-27):** The read-only census derived 17,400 distinct V2 keys without collisions from 61,718 packets, but 44,255 lack execution-membership repository scope; this is not current-revision proof or a safe apply cohort. The live alias resolver reads `atlas_packet_identity_aliases`; all 3,294 rows are ACE-prefix aliases, and its FK cannot target an unstored V2 key. The old FK-dropping proposal `20260925_atlas_packet_identity_alias_v1_storage_to_v2_PREPARED.sql` is explicitly superseded—do not apply. The owning report calls for a registry-backed identity direction and a decision on its canonical owner. Fresh live read-only checks found one root repository identity (`deeds-web-app`), zero stable-file identity rows, and zero stable-file revision bindings for `c63620c4…`. Receipt: `.tmp/atlas/packet-key-v2-legacy-census-20261027-continuation.json`; authority decision: `docs/reports/repository-identity-and-current-ast-reconciliation-v1.json`.

**Current PacketKeyV2 census refresh (2026-10-27):** reran the existing repeatable-read/read-only census to `.tmp/atlas/packet-key-v2-legacy-population-20261027-continuation.json`. It confirms 17,400 collision-free derivable keys, 44,255 packets without execution-membership repository scope, and 3,294 legacy aliases all of the ACE-prefix kind; storage-to-V2 alias coverage is zero. Key derivability does not authorize writing alias rows or establish current source/workspace lineage. Keep the source-to-ACE trace blocked at canonical packet identity until repository/source authority and an approved registry-backed path are resolved.

**Canonical repository owner refresh (2026-10-27, PostgreSQL read-only):** one `ROOT` repository identity now exists (`01a13137-1378-7df9-9968-53738dbf0e48` → `deeds-web-app`); stable-file identity, revision-binding, and alias tables remain empty. The classifier can bridge `repo:root` to `deeds-web-app`, but `packet-key-v2.ts` still hashes the `repo:*` membership label as identity input. Do not treat the repository row as proof that PacketKeyV2@1 is canonically scoped or that any individual file has stable identity. Reconcile the key recipe and registry owner before migration or alias generation; source-to-ACE remains open.

### Phase register (1–24)

This is a navigation/triage index, not a new authority. Phase numbers are only unique within an owning roadmap; the historical Graphify, tensor-residency, retrieval-loop, and this master roadmap reuse numbers. The proposed 1–10 definitions below are a planning crosswalk, not a claim that the historical phases had these names or are complete. Existing status labels retain the evidence limits in their source sections. “Current” means current to the dated evidence cited, not a fresh live recheck.

| Phase(s) | Status as recorded | Main blocker / next action | Detail |
|---|---|---|---|
| 1–10 | `PROPOSED_SCOPE_ONLY` | Use the proposed master pipeline below for planning; do not overwrite historical Graphify phase records or claim completion. | Proposed master pipeline; [historical roadmap index](ATLAS-PHASES-ROADMAP-INDEX.md) |
| 11 | `PARTIAL` | Recheck against a current admitted cohort. | §1 |
| 12 | `BLOCKED_IDENTITY_AUTHORITY` | Decide/qualify canonical identity authority. | §1 |
| 13 | `PARTIAL` | Reconcile the owning ledger and acceptance gate. | §1 |
| 14 | `IMPLEMENTED_BOUNDED` | Keep claims limited to the bounded behavior; production closure is not implied. | §1 |
| 15 | `BLOCKED_CURRENT_COHORT` | Establish a current, revision-qualified source cohort. | §1 |
| 16 | `BLOCKED_CURRENT_GRAPH_BINDING` | Resolve current graph-to-source identity; older “closed” label is not proof. | §1, §2f, latest graph-analysis ledger |
| 17 | `DOWNSTREAM_OF_SEMANTIC_ADMISSION` | Complete canonical semantic/source admission first. | §1 |
| 18 | `PARTIAL_XGBOOST_SURFACE` | CUDA-enabled XGBoost builds are installed in Windows and WSL; still needs owner wiring, qualified labels/features, held-out evaluation, and live workload evidence. | §1, §19, runtime inventory report |
| 19 | `NAMESPACE_CONFLICT` | A 2026-09-09 report assigns 90% to retrieval-loop seed (443 rows); it is not the tensor-residency HMM/linear-policy baseline or a current completion score. | GAN audit below; tensor-residency `tasks.md`; `phase19-retrieval-loop-seed.mjs` |
| 20 | `NAMESPACE_CONFLICT` | A 2026-09-09 report assigns 95% to packet parsing/materialization; this differs from the dated training-readiness report and tensor-residency DSPy contract. | GAN audit below; §2b; tensor-residency `tasks.md` |
| 21 | `NAMESPACE_CONFLICT` | A 2026-09-09 report assigns 75% to an evaluation/policy lane; this is audit evidence, not a current standalone phase score. Tensor-residency Phase 21 is planned GEPA optimization. | GAN audit below; tensor-residency `tasks.md` |
| 22 | `NAMESPACE_CONFLICT` | Tensor-residency Phase 22 is a later XGBoost/gradient-boosting/RL experiment lane; graph-retrieval notes distinguish it from Phase 19 implementation/evaluation. Keep it downstream of qualified labels and Phase 18 baselines. | §1; tensor-residency and graph-retrieval `tasks.md` |
| 23 | `CREATED_MODEL_MISSING` (last recorded check) | Verify the LiteRT artifact, digest, license, and upstream revision before evaluation; fixtures do not substitute for the artifact. | §1–2 |
| 24 | `NAMESPACE_CONFLICT` | Master-note research topics (Ornith, quantization, Titans) are not the tensor-residency Phase 24 DPO lane. Track each by owner and acceptance gate; no training or integration is proven by model-list/runtime metadata. | §2b; tensor-residency `tasks.md` |

### Proposed master pipeline (phases 1–10; scope only)

These names make the master roadmap actionable without renumbering or rewriting historical phase records. Each phase remains `PROPOSED` until an owner accepts it and supplies revision-bound evidence.

| Phase | Proposed scope | Exit gate (evidence required; not implied complete) |
|---|---|---|
| 1 | Capture source bytes and workspace snapshot | Reproducible source/workspace revisions, exclusions, and checksums |
| 2 | Parse current source with Tree-sitter / AST-grep | Exact byte spans, symbols, parser/version receipt, source revision |
| 3 | Bind source, packet, and chunk identities | Unique canonical joins plus independent source/readback proof |
| 4 | Validate `.okf` vocabulary and domain observations | Schema-valid, versioned proposals with evidence spans; no identity promotion |
| 5 | Produce canonical EmbeddingGemma `semantic_768` | Immutable model identity, input/source revisions, vector checksum and readback |
| 6 | Build retrieval projections and indexes | Projection-to-PostgreSQL identity parity; no change to canonical ownership |
| 7 | Retrieve, deduplicate, and rank candidates | Deterministic Top-K, one semantic-lane vote, lexical/graph evidence kept distinct |
| 8 | Build typed AST/KAG graph snapshot and bounded traversals | Snapshot/ordinal checksums, source-bound nodes/edges, CPU reference parity |
| 9 | Admit evidence into ACE `ContextManifest` and cache | Canonical candidate resolution, current-source checks, manifest checksum/readback |
| 10 | Govern agent DAG execution and completion | Explicit approval, bounded permissions, independent validation and proof receipt |

### Phase namespace crosswalk (19–24)

Do not merge these rows into one sequence until an owner approves a canonical crosswalk. The labels below identify what the cited source calls its phase; they do not change the master phase status.

| Owner namespace | Phase | Definition in that owner | Recorded state / boundary |
|---|---:|---|---|
| Workstation master audit | 19 | 443 rows in the 17–21 audit | Count only; no phase status or completion claim |
| Retrieval-loop script | 19 | Retrieval loop seed | Separate implementation owner; inspect its report/tests before status assignment |
| Tensor-residency OpenSpec | 19 | Deterministic HMM plus linear-policy baseline | Partial per its conservative snapshot; offline baseline, not agent authority |
| Tensor-residency OpenSpec | 20 | DSPy program contract | Planned; no production execution implied |
| Historical training-readiness report | 20 | Training/GPU sidecar readiness | Dated 2026-08-09 planning report, not a live readiness receipt |
| Tensor-residency OpenSpec | 21 | GEPA reflective optimization over RouteTrace/eval traces | Planned; requires frozen evaluations and baseline |
| Tensor-residency OpenSpec | 22 | XGBoost/gradient-boosting/RL experiments | Later experimental lane; keep distinct from Phase 18 reranker evaluation |
| Tensor-residency OpenSpec | 23 | QLoRA/SFT | Eval-only in its snapshot; separate from the LiteRT edge-model Phase 23 in this master note |
| Tensor-residency OpenSpec | 24 | DPO | Eval-only; no training run recorded |
| Master-note research lane | 24 | Ornith synthesis, REAP/quantization, importance-sampling quantization, Titans | Separate topics; split into named work items before scheduling or claiming a single phase |

### GAN completion audit: why the portfolio is not 100%

The full phase-by-phase reconciliation is in [Parent Atlas Master Phase Audit — 2026-10-13](reports/parent-atlas-master-phase-audit-2026-10-13.md). This section is the summary; the report preserves each source namespace and its evidence age.

The latest located phase-wide numeric receipt is `docs/reports/phase17-21-workstation-audit.json`, generated 2026-09-09. Its 67% overall and per-row figures are **historical report claims**, not fresh completion scores. GAN status requires a phase to be created, wired to its intended path, proven with relevant evidence, and accepted; existence, checkbox totals, row counts, fixtures, package installation, or stale reports alone do not satisfy `DONE`.

| Report namespace / phase | Last reported % and state | GAN read of the evidence | Why it is not 100% / next proof |
|---|---:|---|---|
| Phase 17 feature extraction | 35%, `SCAFFOLD_ONLY` | Created surfaces; production wiring and qualified evaluation not established by the receipt | Use a multi-row, revision-qualified cohort and measured structural/semantic features; prove consumer wiring and held-out behavior |
| Phase 18 XGBoost reranker | 40%, `SCAFFOLD_ONLY` | Scripts and sidecar surfaces are not a promotion proof | Admit `FeatureRowV1`, labels, frozen split, baseline comparison, held-out NDCG/MRR lift, and independent receipt |
| Phase 19 retrieval-loop seed | 90%, `OPERATIONAL` | 443 rows establish population only; report itself disallows pseudo-cosine events as evaluation truth | Bind replay, packet, source revision, and outcome; prove replay parity and evaluation semantics. Keep distinct from tensor-residency Phase 19 |
| Phase 20 packet parsing/materialization | 95%, `OPERATIONAL` | Validator/artifacts exist, but the same report's summary lane is `MIGRATION_PENDING` and coverage query failed because `summary` was absent | Prove packaged parser snapshot tests and bounded streaming; reconcile the report's degraded summary lane. Keep distinct from DSPy/training-readiness Phase 20 |
| Phase 21 evaluation/policy | 75%, `EVAL_GATED` | Some replay/cache/degradation receipts are cited; research scripts do not establish promotion | Build adversarial/revision-qualified traces and pass baseline-vs-candidate evaluation before opening RL/adapters |

The old percentages do not use a documented shared denominator and cannot be averaged into the master 1–24 roadmap. For phases 1–10, the scopes above are proposals and have no accepted owner/gates; report `N/A — unscoped`, not fabricated 0% or 100%. For phases 11–18 and 23, retain the dated status/evidence and define per-phase acceptance gates before calculating percentages. For 19–22 and 24, report by explicit owner namespace until a crosswalk is accepted. Thus the honest portfolio completion percentage is **NOT_COMPUTABLE**, not zero: its phase set and denominator are not yet canonical.

**Next steps (recommended):** (1) choose one authoritative phase namespace and assign a durable owner to each phase; (2) define atomic acceptance gates and evidence freshness for every phase; (3) map existing tests, reports, live readbacks, and receipts to those gates, marking stale/fixture-only evidence separately; (4) calculate completion as passed gates divided by accepted gates, using equal gate weights unless an owner documents another weighting, and `N/A` for unscoped phases; (5) close the source→packet/chunk→revision/digest→`semantic_768` lineage gate first, because graph, retrieval, cache, and learning promotion depend on it; (6) refresh phase 17–21 evidence only after the cohort and labels are qualified.
### Critical path (do these in order)
1. **Source/identity admission:** obtain one exact source → packet/chunk → revision/digest → `semantic_768` representation chain and independently read it back. Keep the historical Qdrant cohort diagnostic until this gate passes.
2. **Graph evidence:** qualify a current graph artifact and ordinal map against source revisions. Then run the CPU oracle; do not call the 8098 BFS route while its resident graph is null. A graph load/GPU allocation is a separate authorized operation.
3. **Retrieval and context:** compare executors on the same admitted cohort; resolve candidates canonically; only then assemble and read back ACE `ContextManifest`. Cache hits, topology, and multiple semantic executors cannot bypass admission or add votes.
4. **Learning challengers:** only after labels, frozen splits, and baselines exist, evaluate XGBoost, PyTorch, MRL, AE, SOM/KMeans, or GPU challengers. Current CUDA package builds establish capability, not a trained or promoted feature.
5. **Operational automation:** connect the existing workboard/events and MCP only after task/evidence revisions, eligibility, approval, and independent proof receipts are reconciled.

Sections §8 onward are append-only dated **audit notes**, not numbered implementation phases. The former §25 and §22 headings were chronologically out of order; use this register for phase navigation and retain each audit note’s original date/evidence. Do not renumber an audit note as a project phase.
## Pipeline completeness
| Area | Works (tested) | Not complete |
|---|---|---|
| Corpus | Packet and feature counts exist (`atlas_packets`: 61,718 rows) | Not fully indexed. Coverage is unknown until a current census is run. |
| Glossary and OKF tooling corpus | Tooling corpus review: 57 pages reviewed, 717 chunks, artifact readback passes (reported 2026-10-11) | Development publication of 79 pages is not admitted. Four manifest URLs differ from acquired URLs. The reported URL and lineage check is 53/57 exact, with 57/57 manifest-request lineage. |
| `.okf` schema | Schema exists at `docs/.okf/schema.yaml` as a code-intelligence convention | It defines no error-fix record, and its index is not complete. It is not the oracle for repair records. |
| Routing (Viterbi) | Decoder: 12/12 tests. Token-routing pipeline: 7/7 tests, including seeded variance. | Emissions still come from a fixture dictionary. No accuracy claim. |
| Telemetry | Per-tool loader: 5/5 tests, read-only on live data | Not state-conditioned; 27 of 136 rows completed |
| Operator token gate | Gate 10/10, CLI 6/6 | Not wired; no token issued |
| Repair contract | Invariants 7/7; KernelDag chain 5 pass, 2 `todo` | The approval link from an accepted DAG to a repair is not built |
| Recommendation L7 | Extracted and tested 9/9 | Step 2 (approval record) not built |
## Test log (2026-10-11, run for this file)
| Suite | Result |
|---|---|
| Vitest: `src/lib/server/router`, `src/lib/server/mcp`, governed-repair invariants | 9 files, 56 tests passing |
| Node: `kernel-dag-to-repair-chain-v1.test.mjs`, `recommendation-l7-decision-v1.test.mjs` | 16 tests: 14 passing, 0 failing, 2 `todo` (the approval link, which is not built) |

These results show the pieces work in isolation. They do not show the full pipeline works end to end
**TL;DR.** Several lanes now have real evidence, and most open work is blocked on a decision or a missing runtime, not on code. Built and tested: the Viterbi kernel (offline), the per-tool telemetry loader, the operator-token gate and CLI, the L7 decision extraction, the chain test, and the error-fixing contract checks. Not built or not run: live graph admission, the RL environment, the phase 23 edge model, Kafka, and a PyTorch top-k/k-means path. Nothing below authorises writes, reindexing, or promotion.
Status vocabulary follows `CLAUDE.md`: `CREATED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `NOT_PROVEN`, plus `BLOCKED` and `DECISION_NEEDED`.
## Phase status details: 11–23
| Phase | Status | Evidence / source | Next step |
|---|---|---|---|
| 11 | PARTIAL | `docs/parent-atlas-workstation-todo.md`, 2026-09-05 | Re-check against current cohort |
| 12 | BLOCKED_IDENTITY_AUTHORITY | same | Identity authority decision |
| 13 | PARTIAL | same | — |
| 14 | IMPLEMENTED_BOUNDED | same | Bounded only |
| 15 | BLOCKED_CURRENT_COHORT | same | Current source cohort |
| 16 | BLOCKED_CURRENT_GRAPH_BINDING | same; 16-H "CLOSED" in open-lanes file | Later label governs |
| 17 | DOWNSTREAM_OF_SEMANTIC_ADMISSION | 17–21 audit, 67% PARTIAL, 2026-09-09 | Semantic admission first |
| 18 | PARTIAL XGBoost surface | same | `FeatureRowV1`, temporal labels, held-out eval |
| 19 | NAMESPACE_CONFLICT | 17–21 audit reports 443 rows; tensor-residency defines HMM/linear policy; retrieval-loop script is separately named Phase 19 | Name the intended owner and acceptance gate; do not infer status from row count |
| 20 | NAMESPACE_CONFLICT | Dated training-readiness report and tensor-residency DSPy plan | Keep readiness report historical; define current owner and proof gate |
| 21 | AUDIT_COVERAGE_ONLY | 17–21 audit coverage; tensor-residency GEPA plan | Define an independent evaluation gate before scheduling |
| 22 | NAMESPACE_CONFLICT | Tensor-residency later XGBoost/RL experiment; Phase 18 is the current reranker evaluation surface | Keep downstream of qualified feature rows and held-out baseline |
| 23 | CREATED, edge lane, **model missing** | `sveltekit-frontend/scripts/phase23-edge-status.mjs` reports `MODEL_MISSING: static/models/gemma4-e2b/model.litertlm`; `static/models/gemma4-e2b/` does not exist | Obtain and verify the artifact; see §2 |
Authoritative board `docs/reports/parent-atlas-workstation-openspec-workboard-v2.json` is dated 2026-09-25 and blocked by `WORKSPACE_REVISION_SOURCE_MISMATCH`. Regenerate it before quoting counts.
## 2. Phase 23 sub-lanes (asked for explicitly)

| Lane | Status | Evidence | Missing |
|---|---|---|---|
| Edge model eval (Gemma 4 E2B, LiteRT-LM) | MODEL_MISSING | status script; crosswalk doc (planning only, 2026-10-08) | Verified `.litertlm` artifact with checksum, licence, upstream revision. Do not claim browser model tested. |
| Eval gym | CREATED | `src/lib/ai/edge/phase23-eval-gym.ts` and spec | Run against a real artifact; fixtures are not proof |
| Artifact integrity and cache identity | CREATED | `phase23-artifact-integrity.ts`, `phase23-cache-identity.ts` and specs | Exercise on a real artifact |
| Agent repair (edge) | CREATED | `phase23-agent-repair.ts` | Not exercised |
| REAP / quantization | EXPERIMENTAL | `docs/experiments/phase23-reap-cerebras-quantization.md` | Tensor counts must be read from the GGUF, not the doc |
| Tensor map audit | CREATED | `scripts/experiments/phase23_tensor_map_audit.py` | Run against a real GGUF |
| **PyTorch** | Partial | ROUTE-04/05 open in prefill-routing `tasks.md` | MLP on non-toy revision-qualified data |
| **RL gym (routing environment)** | NOT_PROVEN, no environment | `phase23-eval-gym` is an eval harness, not an RL environment; `gymnasium` not installed | Define the environment and reward first. Install only after a capability gap is proven. |
| **Unsupervised learning** | Partial | k-means runs through cuVS under WSL; SOM and autoencoder scripts exist | PyTorch top-k/k-means path is stuck; see §4 |
| **Kafka** | PROPOSAL_ONLY | `openspec/changes/parent-atlas-kafka-projection-initiative/proposal.md` (`PA-KAFKA-001`) | Event schema and outbox contract. Not a prerequisite for anything in this file. |
| **Tensor analysis** | Partial | tensor-residency change; phase 23 tensor map audit | Evidence against a real artifact |

## 2b. Phase 24 (Ornith + REAP + IS quant + Titans)

| Item | Status | Evidence | Gap |
|---|---|---|---|
| Ornith runtime (synthesis, `:8090`) | LIVE_MODEL_PROVEN for identity; runtime context is 65,536 | Read-only `GET /v1/models` reports `ornith-1.5-9b`, `n_embd=4096`, `n_ctx_train=262144`; `GET /props` reports `n_ctx=65536` and the served GGUF path `models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf` | `n_embd` is hidden width, not embedding dimension. The 262,144 value is model training context, not active server context. A 512-token sliding-window/block claim is NOT_PROVEN. Vision is disabled in the live server (`modalities.vision=false`). |
| REAP (expert pruning / quantization) | EXPERIMENTAL | `docs/experiments/phase23-reap-cerebras-quantization.md` (filed under phase 23); `docs/reports/parent-atlas-gemma4-kernels-litert-reap-memory-eval-20261009.md` | Tensor counts must be read from the GGUF; no REAP run is recorded |
| IS quant (importance-sampling quantization) | NOT_FOUND | No file, task, or doc matches `isquant` or importance-sampling quantization | **DECISION_NEEDED:** define the method before scoping it |
| Titans 2.0 (memory) | RESEARCH_ONLY | `NEURAL_MEMORY_LAB_V1` (small PyTorch Titans/HOPE sidecar); `KV-RESIDENCY-01`; "Titans blocks inside Ornith = research only" | Build the sidecar lab first; no Ornith integration |
| Phase 24 DPO | EVAL_ONLY | `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` lines 898 and 953 | No training run recorded |

These research topics and tensor-residency Phase 24 DPO share a number, not an owner or lifecycle. Keep them as separate lanes; the master Phase 24 remains unassigned until an owner and acceptance gate are approved.
Gemma 4 on the client is LiteRT (phase 23 edge lane), not Ornith. Ornith is the server synthesis model. Keep the two lanes separate in every claim.
## 2c. GPU graph lane (from the 2026-10-11 discussion)
| Step | Status | Gate |
|---|---|---|
| CSR representation of the admitted graph | NOT_STARTED | Blocked: `graphify_edges` has zero admitted rows |
| CPU oracle (NetworkX custom PageRank) on a frozen snapshot | BLOCKED | Same as above |
| PyTorch sparse power iteration matched to the oracle | NOT_STARTED | After the CSR step and oracle parity |
| SIMT kernel | NOT_STARTED | After PyTorch parity (ladder: no level skipped) |
| cuTile kernel | NOT_STARTED | Last. Linked lists on GPU are rejected: pointer chasing is a poor fit. |

## 2d. Encoding, labels, and icon lane (review note, 2026-10-11)
Rules (binding for this lane):
- Exact original UTF-8 bytes are the only input to source-byte digests, spans, and source admission.
- Normalized text (NFC or NFD) is for matching, classification, or display only. Any persisted normalized text must record its normalization form and producer revision.
- Pixels, hexadecimal, and bitplanes are encodings, not legal meaning. A classifier's output is derived evidence, never authority.
- Icon ID is the stable semantic reference. Texture coordinates, palette, and GPU storage may change independently.
| Component | Priority | Found by name | Status |
|---|---|---|---|
| SymbolDatasetV1 | P0 | No | NOT_FOUND by name; check existing dataset owners first |
| SymbolLabelTaxonomyV1 | P0 | No | NOT_FOUND by name |
| EncodingRegistryV1 | P0 | No | NOT_FOUND by name. Normalization form is not recorded in code under that name. |
| DatasetSplitManifestV1 | P0 | No | NOT_FOUND by name |
| LicenseManifestV1 | P0 | No | NOT_FOUND by name |
| FastAPI classifier sidecar | P1 | Sidecars exist (`:8095` NLP, `:8097` embedding) | Audit before adding a fourth |
| PyTorch baseline classifier | P1 | No | Train on frozen features before QLoRA |
| Glyph raster and atlas compiler | P1 | No | NOT_FOUND by name |
| MCP classification adapter | P1 | No | NOT_FOUND by name |
| Offline evaluation harness | P1 | Partial (eval gyms, classifier eval scripts) | Audit first |
| QLoRA experiment | P2 | No | Blocked on the classifier baseline |
| Procedural icon generator | P2 | No | Human-approved canonical icons only |
| GPU/WebGPU texture cache | P2 | No | After the atlas compiler |

### Owner audit (2026-10-11, read-only)

| P0 item | Existing owner found | What it covers | Gap |
|---|---|---|---|
| SymbolDatasetV1 | `sveltekit-frontend/src/lib/server/atlas/classification/query-router-dataset-v2.ts` | Query-level rows with `datasetRevision`, `tensorRevision`, `labelRevision` | Query rows, not source symbols. No symbol-level provenance. |
| SymbolLabelTaxonomyV1 | Two owners, **disagreeing**: `atlas/domain-taxonomy.ts` (`CANONICAL_DOMAINS`: auth, ui, retrieval, network, database, cache, agent, graph, ml) and the `domainLabel` enum in `query-router-dataset-v2.ts` (code, database, retrieval, graph, api, security, documentation, workflow, testing, unknown) | Two domain label sets | **Duplicate label owner.** Reconcile before adding a third. Neither has a stable class-ID registry or negative examples. |
| DatasetSplitManifestV1 | Same query-router file: deterministic 80/10/10 split from `sha256(queryId)` | Query-level split | Split is keyed by query ID, so same-source and near-duplicate leakage is not prevented |
| EncodingRegistryV1 | None | — | Normalization form is not recorded in code |
| LicenseManifestV1 | None for our data, models, or icons | Third-party vendored licences only (`claude-mem`, `llama-cpp-turboquant-gemma4`, `.python311`) | Needs a manifest for our own assets |

Other dataset scripts (`export-classifier-dataset.mjs`, `neural-routing/dataset-export.ts`, `build-human-agent-feedback-dataset-v1.mjs`) have no split or leakage handling.
Priority from this audit: reconcile the two label taxonomies first. Splitting by source rather than query ID comes next. The encoding registry and licence manifest are new work.
Not yet answered from the review's question list: which ACE packets combine, whether mmap synthesis tiles exist, and the cuTile, LOD, texture-swap, trilinear, and quaternion paths. Each needs an owner audit before a claim.
## 2e. Repair pipeline and stale-chunk review (mid-turn review, 2026-10-11)
Source: an external review pasted into this session. Figures below are as reported by the review and are **not verified here**. Verify each against the live receipts before relying on it.
Core finding: two chunk bodies match an older Git revision, but live lineage marks them as current. File-level digest identity does not prove chunk identity. The chunk lineage join is inconsistent, and the writer responsible is not identified.
Rules:
- Do not rebuild the index.
- Do not let an agent edit files from stale chunks.
- Historical chunks are labelled historical, never silently rewritten.
- Dense search keeps its current behaviour until a shadow comparison proves otherwise.
| Gate | Priority | Required proof | Status |
|---|---|---|---|
| HISTORICAL CHUNK 01 | P0 | Read-only receipt: current and historical Git revisions, SHA-256 of each chunk body, declared digest scope, mismatches, affected symbols and ordinals | PROVEN (Read-Only). V2 resolver written and tested 6/6 (`scripts/atlas/historical-chunk-resolver-v2.mjs`, `docs/reports/historical-chunk-resolver-receipt-v2.json`, git `c48c7ad0…`, 50-chunk sample: 38 current, 0 historical, 11 mismatch, 1 ambiguous, 12 rebuild recommendations). Baseline containment scan (`scripts/atlas/historical-chunk-receipt-v1.mjs`, `.tmp/atlas/historical-chunk-receipt-v1.json`): of 2,000 stored chunks, 1,613 appear in current line window, 386 do not, 1 source missing. |
| DIGEST SCOPE 01 | P0 | Hash algorithm, source-byte scope and normalization declared per chunk digest | DECLARED (`historical-chunk-resolver-v2.mjs`: `SHA256` over normalized UTF-8 bytes with CRLF normalization and boundary trimming; byte spans distinguished from LSP UTF-16 code units). |
| SOURCE JOIN 01 | P0 | Current source symbol version, span and ordinal map verified against bytes | SPECIFIED (`evaluateChunkHistoricalLineage` defines 5 discrete states: `CURRENT_SOURCE_VERIFIED`, `HISTORICAL_SOURCE_MATCH`, `SOURCE_CONTENT_MISMATCH`, `AMBIGUOUS_SOURCE_MATCH`, `UNVERIFIED_DIGEST_SCOPE`). |
| DAG AST LIVE 01 | P0 | One real diagnostic request: AST observation, source bytes, symbol version, candidate ordinal and patch target all tied to one revision | NOT_STARTED. Reuse existing AST and SearchRuntime owners. |
| SYMBOL TOC LIVE 01 | P0 | Production symbol-to-ordinal join with zero ambiguous admitted spans | NOT_STARTED |
| BATCH IMPACT 01 | P1 | Incremental impact analysis per file, revision-qualified | NOT_STARTED. Extend the existing digest-bridge owner. |
| RANK SUPERSEDED 01 | P1 | Revision-filtered ranking; one RRF vote per logical lane; historical candidates excluded from current repair | NOT_STARTED |
| PATCH PROPOSAL 01 | P1 | Proposal with preimage hash, exact span or AST match, `mutationAllowed:false` | NOT_STARTED |
| PATCH VALIDATE 01 | P1 | Scratch-worktree application, focused tests, rollback | NOT_STARTED |
| PREFILL CACHE 01 | P2 | Measured tokenizer counts and prefill latency. A shorter summary does not prove KV reuse. | NOT_STARTED |

Standing rules from the review:
- A ranking score must never bypass a failed source-revision or span check.
- A detected file extension does not authorise AST rewriting. Language status is separate: DETECTED, PARSED, EXTRACTED, SYMBOL_JOINED, REWRITE_CAPABLE, VALIDATED.
- Packet hash, chunk hash, source file hash, and authority receipt are distinct and must not be treated as interchangeable.
- Token IDs come from the model tokenizer, never from symbol hashes or candidate ordinals.
Test status: `label-taxonomy-reconciliation.spec.ts` passes 8 tests and has 3 `todo` items. The 3 todos are the reconciliation and source-level split tests.
## 2f. Neo4j, HyperGraphRAG, NetworkX, RTX alignment check (2026-10-11, read-only)
| Item | Finding | Status |
|---|---|---|
| Neo4j service | Container `legal-ai-neo4j` healthy. Authenticates with the `NEO4J_PASSWORD` in `.env` (exit 0). The earlier auth failure was my probe, which ran without that variable set. | WORKING |
| Neo4j content | Topology is populated: `AtlasContextNode` 165,190; `SourceRef` 125,625; `CodebaseFile` 69,009; `Packet` 59,692; `TreeNode` 58,365; `ParentAtlasFeature` 39,485; `Function` 27,763; `Concept` 19,698; `Feature` 13,290; `Community` 2,512; `Tool` 801 | Populated topology mirror |
| HyperGraph in Neo4j | **Superseded 2026-10-27:** the 0-node finding below was wrong for the current database. Live read-only count: `HyperedgeMirrorV1` 470 nodes, `HyperedgeMemberV1` 548 nodes (of 622,527 total). The writer that created them and whether they are current are not yet checked. Original 2026-10-11 finding: 0 hyper-labelled nodes (`server/features/ai/ai/hypergraph-store.ts`). | NOT_EVIDENCED (freshness and writer unverified) |
| HyperGraphRAG retrieval | `server/atlas/retrieval/hypergraph-retrieval-v1.ts` is a Zod contract. It doesn't call Neo4j. | CONTRACT_ONLY |
| NetworkX (OpenSpec) | 33 task files mention NetworkX: 50 open lines, 39 closed. Fixture-level CPU parity exists; live parity needs an admitted graph snapshot (zero admitted `graphify_edges`). | PARTIAL, fixture-only |
| RTX | GeForce RTX 3060 Ti, 8192 MiB, driver 580.88. 38 open RTX/TensorRT task lines. CUDA 13.0 with LibTorch cu130 is the proven path; TensorRT-RTX is not proven. | HARDWARE_PRESENT; integration open |
Readiness: Neo4j and the RTX card are available. Neither HyperGraph retrieval nor a live NetworkX-to-GPU path is proven, so no integration is ready for claims.
## 3. Routing, token, and approval chain
| Item | Status | Next step |
|---|---|---|
| Viterbi decoder (`viterbi-decoder-v1.ts`) | CREATED, 12/12 tests, no caller | Stays unwired until the 160-trace checkpoint |
| Telemetry loader (per tool) | WIRED to real data, 5/5 tests | Not state-conditioned; `trace_id` null on all live rows |
| Completed outcomes | 27 of 136 rows | 109 pending rows are historical (pre-August); do not weight them |
| Token register | Documented, 11 kinds | TOK-ROUTE-01: decide the token kind that drives emissions. Recommended: keyword token. |
| TOK-ROUTE-02/03 | Interim variance test, 7/7 | Real emissions after TOK-ROUTE-01 |
| Operator token gate | CREATED, 10/10 tests, not wired | **DECISION_NEEDED:** approve wiring `requireToken` to the gate |
| Operator token CLI | CREATED, 6/6 tests | Operator issues the first token out of band |
| Ops gate probe | FINDING: any non-empty token passes today | Wire the gate or disable write tools for models |
| L7 decision | Extracted, 9/9 tests | Step 2: route `ask_permission` to an approval record |
| **Step 2 approval owner** | DECISION_NEEDED | Choose `workflow_approvals` (recommended) or a file-based proposal |
| KernelDag chain | 5 pass, 2 `todo` | Approval link: an accepted DAG cannot reach a repair without a matching approval |
| Autoresearch fabric | Schemas only (`ExperimentHypothesisV1`, `HardwareProfileV1`); gates 03–18 proposal-only | Not a KernelDag loop; not wired |
## 4. Search, index, and consistency
| Item | Status | Next step |
|---|---|---|
| Worktree and Git state | Dirty: 118 tracked, 140 untracked (2026-10-11) | Use `git worktree add` for experiments |
| PostgreSQL 18.4 | `io_method=worker`, `effective_io_concurrency=16`, `work_mem=4MB` | Read-only planner check on real retrieval queries |
| Index census | `atlas_packets` 92 indexes (964 MB), all valid; 13 duplicate column groups | Review for removal. **DECISION_NEEDED** (archive, do not delete) |
| REINDEX / dense rebuild / full reindex | **Not authorised** | Only after a change-impact plan and shadow comparison |
| Change-impact contract (`CodebaseChangeImpactV1`) | Proposed | Extend the existing digest-bridge owner; do not create a new producer |
| Search shadow comparison | Not started | Freeze the query set; compare identity, recall, MRR, latency |
| Qdrant warning in search runtime | Diagnostic only | Must not authorise promotion from an unverified lane |
## 5. Infrastructure and runtime
| Item | Status | Next step |
|---|---|---|
| TRACE MCP `:8788` | Up: 188 tools; one read-only call verified | Log live receipts as they happen |
| Atlas DAG graph projection | UNRESOLVED | Restore the projection before graph claims |
| Disk on C: | ~12 GB free after scratch cleanup | Docker prune (~13.5 GB build cache, ~21.7 GB unused images), cache clean, VHDX compaction. **Needs approval.** Do not prune volumes. |
| TOC check drift | `--check` fails on concurrent input changes | DOC-GOV-TOC-CHECK-01 (see document-governance `tasks.md`) |
| Phase 23 edge model | Missing | Obtain and verify the artifact before any run |
## 6. Decisions needed (in priority order)
1. Approve wiring `requireToken` to the operator-token gate, or disable write tools for models until it is wired.
2. Choose the step 2 approval owner: `workflow_approvals` or a file proposal.
3. Choose the token kind that drives router emissions (TOK-ROUTE-01).
4. Approve the phase namespace crosswalk and owners; the 443-row Phase 19 figure is a count, not a status.
5. Approve Docker prune and cache clean for disk recovery.
6. Approve workspace-revision v2 design (skipped-source, extension-set, excluded-prefix digests). v1 stays unchanged.
7. Decide whether to run the planner check next (read-only).
## 7. Not authorised by this document
No REINDEX, index drop, Docker volume prune, token issuance, approval write, model download, promotion, or live tool write. Each needs an explicit decision above.
## 8. Live recheck (2026-10-12, read-only)
| Item | 2026-10-11 said | 2026-10-12 live | Change |
|---|---|---|---|
| Phase 23 edge model `static/models/gemma4-e2b/` | MODEL_MISSING | Directory still missing | None |
| Disk C: free | ~12 GB | 7.66 GiB (8.22 GB decimal; 8,223,637,504 bytes) | Lower. Docker prune remains a separate approval; do not prune volumes (§6 item 5). |
| TRACE `:8788` | Up, 188 tools | `/health` HTTP 200 | Up. Tool count not rechecked. |
| Ornith `:8090` | Model artifact present; live identity unverified | `/health` HTTP 200; `/v1/models`=`ornith-1.5-9b`; `n_embd=4096`, `n_ctx_train=262144`; `/props`=`n_ctx=65536`, vision disabled | Active model identity verified; effective context is 65,536. Do not interpret `n_embd` as embedding width or claim a 512-token sliding window. |
| `atlas_packets` | 92 indexes, 61,718 rows | 92 indexes, 61,718 rows | None |
| `graphify_edges` admitted rows | 0 | Table exists, 0 rows | None. CSR and NetworkX gates stay blocked. |
| Qdrant collections and snapshots | Current readback at §9 | 18 current collections; 18 API-visible snapshot entries totaling 5,163,315,712 bytes; no aliases or live `*384*` collections. The filesystem has 92 files in 43 collection-named directories plus `tmp`, totaling 5,170,720,640 bytes; `/qdrant/storage` is 12,003,695,240 bytes. | Two 384-named directories remain empty; their snapshot files are gone. Twenty-eight other non-current directories retain 7,403,776 bytes. Exact restore/rollback value is unproven; no prune is authorized. |
The master phase IDs 19–24 remain unassigned across the conflicting namespaces documented above; the cited owner-specific scopes are definitions, not accepted crosswalks. The 2026-10-11 decisions in §6 remain open where they are not superseded by this clarification.
## 9. Disk and duplicate-directory follow-up (2026-10-12 local, read-only)
- Current recheck (2026-10-12 local): Qdrant API reports 18 collections, 18 snapshot entries (5,163,315,712 bytes), zero aliases, zero empty collections, and no 384-named collection. The full API receipt is `.tmp/atlas/production-hardening-seed-20261012/qdrant-pruning-audit-v2.json`. 
legal-ai-qdrant` filesystem recheck: 92 files across 43 collection-named directories plus `tmp` under `/qdrant/snapshots` (5,170,720,640 bytes); `/qdrant/storage` is 12,003,695,240 bytes. The two 384-named directories are empty, confirming their snapshot payload files are gone. Twenty-eight directories absent from the live collection API hold 7,403,776 bytes. Physical snapshot bytes exceed API-visible bytes by 7,404,928; exact file-to-snapshot membership and rollback value remain unresolved. Readback: `.tmp/atlas/production-hardening-seed-20261012/qdrant-volume-storage-readback-v1.json`.
C: free-space rechecks on 2026-10-12 returned 7,245,676,544–7,249,031,168 bytes (about 6.75 GiB), below the prior 7,297,048,576-byte reading. Treat this as a fluctuating live measurement, not a cleanup delta. Qdrant storage changes do not establish an equal host free-space gain because the Docker/WSL virtual disk may retain allocated blocks; no cleanup or compaction ran.
A new live Qdrant collection/snapshot refresh was attempted read-only but stalled; the last successful Qdrant inventory remains the v2 receipt cited above. Do not infer any additional snapshot deletion from the reduced C: free-space reading.
Earlier §9 readback (superseded by the current recheck above): C: free space was 7,322,169,344 bytes and `/qdrant/storage` was reported at 5.5G. The later direct container read reports 12,003,695,240 bytes for `/qdrant/storage`; the earlier storage measurement is not current. The 46-entry count remains an unresolved scope discrepancy.
- Correction: both `codebase_chunks_384*` collections are absent from the live API and their named snapshot directories are empty; no 384 snapshot files remain. The empty directories were not removed. The filesystem now shows 28 non-current non-empty collection directories totaling 7,403,776 bytes; this supersedes the earlier 7,401,984-byte estimate. The older per-file hash receipt remains historical evidence and has not been reconciled against the current directory layout. File presence and hashes do not prove restore compatibility, aliases, searchability, or lineage.
- A prior read-only directory-name screen traversed 40,296 directories and found 119 paths matching backup/archive/copy/old/snapshot naming patterns. This is a candidate list, not a count of duplicate data. A fresh traversal was attempted but stopped because it was taking too long; no new count or candidate list is claimed.
- Compared `sveltekit-frontend/src` with `.svelte-error-fixes-backup/sveltekit-frontend/src` by relative path and SHA-256: 6,965 active files, 692 backup files, 163 shared paths, zero byte-identical shared files. The backup is an older/different subset, not an exact duplicate of current `src`.
- The two full `deeds_labs/archive/2026-09-12/workspace-source-snapshot-*` trees differ in `package.json` and the Parent Atlas lineage task file; the `partial-12564` tree lacks those files. These are distinct historical snapshots, not verified duplicates. No directories or snapshot files were moved or deleted.
- Outcome: no exact duplicate directory was proven in the recorded comparisons. The `.svelte-error-fixes-backup` tree and the two workspace snapshots are distinct from their compared counterparts; do not remove them as duplicates. The broader 119-path candidate list still needs prioritized manifest/hash comparison before any space-recovery proposal. No directory or snapshot was moved or deleted in this audit.
## 10. Follow-up recheck (2026-10-12 local, read-only)
- C: currently has 7,133,151,232 bytes free (6.64 GiB). This is lower than the earlier 7.67-GiB reading; it does not identify what consumed space or prove a cleanup delta.
- Qdrant at `127.0.0.1:6333` currently lists 18 collections and 18 collection snapshots totaling 5,163,315,712 bytes. `/qdrant/snapshots` reports 92 files and about 4.9 GiB. The two `codebase_chunks_384*` snapshot directories still exist but contain no snapshot files; the 384 payloads were removed, not every Qdrant snapshot. No current collection or alias was changed in this check.
- Root archive-name comparison: `.archive` has 22 files and `archive` has 50; they share zero relative file paths, so these two directories are not exact mirrored copies. `backups/` contains a 1,037,555,678-byte PostgreSQL dump and the Qdrant upgrade backup; `deeds_labs/archive/` contains 54,611 files (8,825,165,298 bytes). These are preservation candidates, not proven duplicates, and were not altered.
- Duplicate-directory audit remains partial. The prior `.svelte-error-fixes-backup` and historical workspace-snapshot comparisons remain as recorded in §9. No broad content-hash comparison of all 119 name-based candidates was completed; do not delete or move any candidate based on names or size alone.
- No database, Qdrant, Docker, or filesystem cleanup operation was performed during this recheck.
## 11. Latest live recheck (2026-10-12 local, read-only)
- C: free space is 7,130,288,128 bytes (6.64 GiB) at this check. This is a point-in-time reading, not a measured cleanup delta.
- Qdrant `127.0.0.1:6333` now lists 44 collections and 42 API-visible collection snapshots totaling 5,166,674,432 bytes. The latest complete per-collection query succeeded; this supersedes the 18-collection/18-snapshot readings in §§8–10. There are zero aliases.
- `codebase_chunks_384` and `codebase_chunks_384_hybrid` currently exist as empty collection shells (0 points each) and each has zero snapshots. The prior snapshot receipt records no surviving snapshot files for either collection. This supports that the 384 snapshot payloads were removed; it does not show that every Qdrant snapshot was deleted. The current shells may have been recreated after the prior inventory; their origin is unknown.
- The two `codebase_chunks_768` snapshots remain present (each 1,586,415,104 bytes). Overall snapshot bytes are about 4.81 GiB. No Qdrant deletion, restore, or mutation was performed in this recheck.
- The phase 23 model directory `static/models/gemma4-e2b/` remains absent; TRACE `:8788/health` returned HTTP 200. These two master-list gates remain unchanged.
- Duplicate-directory conclusion remains limited: the prior comparisons found no exact duplicate among the compared pairs (`.archive` vs `archive`, `.svelte-error-fixes-backup` vs active `src`, and the two historical workspace snapshots). The 119 name-matched archive/backup/copy candidates were not content-compared as a complete set. Therefore no repository-wide duplicate-directory claim is proven; do not move or remove candidates based on names alone.
- Evidence: `.tmp/atlas/production-hardening-seed-20261012/qdrant-deleted-collection-snapshot-hashes-v1.json` and the live read-only Qdrant API query. Restore compatibility and source lineage remain unproven.
## 12. Follow-up live recheck (2026-10-12 local, read-only)
- C: free space is 7,153,065,984 bytes (about 6.66 GiB); this is a point-in-time reading and does not identify what changed on disk.
- Qdrant still reports 44 collections and 42 API-visible snapshots totaling 5,166,674,432 bytes. `codebase_chunks_384` and `codebase_chunks_384_hybrid` are empty (0 points) and have no snapshots.
- Answer to “were the snapshots deleted?”: the 384 snapshot payloads are gone, but the full Qdrant snapshot set was not deleted; 42 snapshots remain. The empty 384 collection shells still exist.
- Duplicate-directory audit remains partial. Recorded pairwise comparisons found no exact duplicate for `.archive`/`archive`, active `sveltekit-frontend/src`/`.svelte-error-fixes-backup/.../src`, or the compared historical workspace snapshots. The 119 name-based candidates were not all content-compared, so repository-wide duplicates are not established.
- No Qdrant, database, Docker, or filesystem mutation was performed. No directory or snapshot was moved or deleted during this recheck.
## 13. Current Qdrant and root-folder check (2026-10-12 local, read-only)
- Live Qdrant API returned 44 collections and 42 collection snapshots totaling 5,166,674,432 bytes. The per-collection snapshot listing contained no `384` collection or snapshot names. This confirms the 384 snapshot payloads are not currently API-visible; it does not mean all Qdrant snapshots were deleted.
- C: free space at this check was 7,209,418,752 bytes (about 6.71 GiB). This is a point-in-time value, not a measured cleanup delta.
- A root-level name screen found `.svelte-error-fixes-backup` (9,478,481 file bytes) and `backups` (3,677,140,991 file bytes). Names and aggregate size do not prove duplicate content. Existing pairwise comparisons remain limited; the full 119-path candidate set has not been content-compared.
- No directories or Qdrant snapshots were moved or deleted in this check. No database, Qdrant, Docker, or filesystem mutation was performed.
## 14. Current disk and duplicate-file recheck (2026-10-12 local, read-only)
- Master-list sequence was reviewed before this recheck. Live Qdrant currently lists 44 collections and 42 API-visible snapshots totaling 5,166,674,432 bytes (about 4.81 GiB); C: has 7,160,659,968 bytes free (about 6.67 GiB). These are point-in-time readings.
- Answer to “did we delete the snapshots?”: the earlier cleanup removed the `codebase_chunks_384*` snapshot payloads only. The 42-snapshot set remains; the two empty 384 collection shells still exist. No further deletion is evidenced or performed here.
- A bounded content check of the three local PostgreSQL dump files found no byte-identical copy: `backups/legal_ai_db_20260825_112807.dump` (1,037,555,678 bytes), `backups/qdrant-upgrade-20260825-211412/legal_ai_db.pg_dump` (1,053,672,101 bytes), and `offline-data/backups/legal_ai_db_backup.dump` (674,540,804 bytes) have different SHA-256 digests. Different dumps may still contain overlapping database state; this check does not establish restore quality or safe removability.
- Root archive-name screening found `.archive` (22 files, 10,571,072 bytes), `archive` (50 files, 5,473,443 bytes), `backups` (7 files, 3,677,140,991 bytes), `offline-data/backups` (1 file, 674,540,804 bytes), `.svelte-error-fixes-backup` (692 files, 9,478,481 bytes), `deeds_labs/archive` (54,611 files, 8,825,165,298 bytes), and `sveltekit-frontend/archive` (172 files, 249,522,808 bytes). Names and sizes are not duplicate evidence. A depth-limited directory-name scan is not a full repository census.
- Prior exact pair comparisons remain as in §§9–13: no exact duplicate was proven for the compared directory trees; the complete 119-name candidate set is still not content-compared. No directories, dumps, or Qdrant snapshots were moved or deleted during this recheck.
## 15. Qdrant inventory refresh (2026-10-12 local, read-only)
- Fresh GET-only inventory: 44 collections, 0 aliases, 26 empty collections, 42 API-visible snapshots (5,166,674,432 bytes). The two empty `codebase_chunks_384*` shells have no snapshots. The other 24 empty collections each retain an API-visible snapshot; this is not authorization to prune them.
All 44 collection detail requests returned HNSW configuration; 17 collections report indexed payload fields. Qdrant returned `vectors_count: null` for all 44, so point counts are available but vector counts are not. Vector dimensions reported include 1, 64, 128, 256, 384, 512, and 768; `sc_deedssocraticode_metadata` is a 1-point, 1D collection and must not be treated as semantic retrieval without owner evidence.
Literal source search found references to all 26 empty collection names; a generic dimension-usage inventory alone references 23 of them. These matches include audit inventories, tests, and compatibility definitions, so none proves a production consumer or proves the absence of one. No empty collection is classified as unused or safe to prune.
Container filesystem readback: `/qdrant/storage` 19,175,346,575 bytes and `/qdrant/snapshots` 5,170,720,640 bytes. Filesystem snapshot bytes exceed the API total by 4,046,208 bytes; exact snapshot-file membership is unresolved. C: free space was 7,154,188,288 bytes at capture. The API inventory is `.tmp/atlas/production-hardening-seed-20261012/qdrant-pruning-audit-v3.json`; joined storage readback is `.tmp/atlas/production-hardening-seed-20261012/qdrant-storage-readback-v2.json`.
- No Qdrant, Docker, PostgreSQL, or filesystem cleanup was performed. Empty collections and snapshots remain review candidates only; consumer ownership, exact restore tests, alias recovery, and source lineage still block pruning or promotion.

## 16. Qdrant-to-PostgreSQL lineage census (2026-10-12 local, read-only)
Reused the same-day payload-only full scans with repeatable-read/read-only PostgreSQL snapshots. `codebase_chunks_768` scanned 328,348 points; `codebase_chunks_768_v2` scanned 52,816. Qdrant counts were unchanged before and after each scroll. No vectors were fetched. `codebase_chunks_768`: 239,395 unique `chunk_id` candidates, 925 ambiguous, 88,028 missing; exact `(source_ref, content_hash)` matches were 220,673. `codebase_chunks_768_v2`: 16,156 unique candidates, 649 ambiguous, 36,011 missing; exact `(source_ref, content_hash)` matches were 16,156. These are locator matches, not proven packet/chunk/source-span lineage.
Both receipts report zero candidates with all `source_revision`, `workspace_revision`, and `representation_revision` populated and zero strictly revision-qualified candidates. Packet-key matches were 106,337 in the primary collection and 6,746 in v2; packet-key presence alone does not establish an admitted binding.
Decision remains `PAYLOAD_LOCATORS_ARE_NOT_FULLY_REVISION_QUALIFIED`. Do not use either collection as current-source evidence or promote it into ACE/ContextManifest until canonical chunk identity, packet binding, source bytes/span, and representation provenance are independently verified. No repair, upsert, deletion, or snapshot operation occurred.
Receipts: `.tmp/atlas/production-hardening-seed-20261012/lineage-02-codebase-chunks-768.json` and `.tmp/atlas/production-hardening-seed-20261012/lineage-02-codebase-chunks-768-v2.json`. These are census evidence only; they do not establish full corpus admission or justify removing Qdrant.

## 17. Post-audit live recheck (2026-10-12 local, read-only)
C: free space is 7,158,116,352 bytes (about 6.67 GiB). This is a point-in-time reading, not a measured gain from snapshot removal.
Qdrant remains at 44 collections, with 42 API-visible collection snapshots totaling 5,166,674,432 bytes. A per-collection detail read confirms 26 empty collections; their existence and file names do not establish that they are disposable. The confirmed snapshot removal remains limited to the two `codebase_chunks_384*` payloads; 42 snapshots remain.
Duplicate-directory audit remains partial. Existing exact comparisons did not prove duplicates for `.archive`/`archive`, the active source tree versus `.svelte-error-fixes-backup`, or the compared historical workspace snapshots. The 119 name-based candidates have not been comprehensively content-compared; no directory or backup is authorized for removal or relocation.
The same-day LINEAGE-02 receipts in §16 are the latest full Qdrant-to-PostgreSQL census used here. They show zero fully revision-qualified candidates in both 768 collections; point IDs, `chunk_id`, `source_ref`, packet-key presence, and content-hash matches are insufficient to promote results as current-source evidence.
 No Qdrant, database, Docker, or filesystem mutation was performed during this recheck.
## 18. OpenSpec checkbox census (2026-10-12 local, source scan)
 Current ripgrep-visible, non-archived `tasks.md` census across root and frontend OpenSpec: 116 files, 12,359 checkbox lines total; 4,812 unchecked, 7,537 checked, and 10 marked partial. These are checkbox-line counts, not deduplicated semantic tasks or proof of completion.
The four named large changes currently contain 693 open lines (`parent-atlas-neural-prefill-encoder`), 445 (`parent-atlas-ace-rlm-bitfrost-integration`), 292 (`parent-atlas-best-fit-score-fabric`), and 254 (`parent-atlas-retrieval-lineage-dag-convergence`). The prior 691/442 figures are stale; 292/254 remain consistent. The root workboard also reports 254 open for the lineage change.
A keyword triage found 1,908 unchecked lines containing one or more of `latent`, `graph`, `gpu`, `cuVS`, `cuGraph`, `MLP`, `model`, `embedding`, `KMeans`, `SOM`, `feature`, `prefill`, or `BitFrost`. This is a search bucket, not an estimate of unique ML/graph tasks; owners and duplicate task identities still need normalization before portfolio prioritization.
No OpenSpec task checkbox was changed by this census. Recompute from the task files before using these totals as a baseline; generated workboards are projections and can be stale.
## 19. Autoencoder training-artifact reconciliation (2026-10-12 local, read-only)
 Correction to the blanket “untrained/no checkpoint” claim: a historical v3 full-training receipt exists (`docs/reports/latent-autoencoder-training-receipt-v3-full01.json`) and both referenced checkpoint copies exist and are byte-identical (SHA-256 `ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5`). Its receipt checksum recomputes successfully. The receipt reports 49,622 training rows, 5,547 validation rows, and held-out KNN recall@10 of 0.8957 / 0.8572 / 0.7933 for latent_256/128/64.
 This is historical candidate evidence, not promotion: `models/nested-semantic-autoencoder/ae_meta.json` explicitly says `canonical_authority:false`, input authority `HISTORICAL_CONTENT_EMBEDDING_COLUMN_UNQUALIFIED_AS_CANONICAL_SEMANTIC_768`, and `live_consumers:NONE` (as of 2026-08-29); the training receipt also requires exact-semantic promotion. The receipt’s source revision is a table/row-count label, though its training snapshot separately checksums ordered row identities and vector bytes. A CPU `torch.load(weights_only=True, map_location='cpu')` read of the checkpoint recomputed the receipt’s state-dict checksum exactly; retrieval metrics were not independently reproduced.
The current `ae:train` owner declares a different architecture revision (`atlas.latent-ae.768-512-256-128.v2`) and reads `codebase_chunk_index.content_embedding_768`; the historical v3 receipt has a 256D physical bottleneck with 128D/64D prefixes, while the current trainer declares 128D as the bottleneck. Do not claim the current command reproduces the v3 artifact or merge their latent identities. The normal entrypoint was run and exited 78 with `TRAINING_BLOCKED` before database access (`databaseRead:false`, `checkpointWritten:false`). Its `--require-cuda` option is optional, so if the source-provenance gate is ever opened, CPU fallback would still need an explicit policy decision.
Therefore: training has occurred historically; an artifact and reported held-out metrics exist; current source-qualified input authority, artifact-to-weight recomputation, production consumers, retrieval quality on a current admitted cohort, and promotion remain `NOT_PROVEN`. No training, checkpoint write, store write, or model call occurred in this audit.
Fresh owner check (2026-10-13): `python python/train_latent_autoencoder.py --plan-only` returned `TRAINING_BLOCKED` / `SEMANTIC_WRITER_AND_ADMITTED_INPUT_PROVENANCE_REQUIRED`, `databaseRead:false`, `trainingPerformed:false`, and `checkpointWritten:false`. The declared current architecture is `[768,512,256,128]`; its `latent_64` is only a proposed normalized prefix. This confirms the current entrypoint is not a trained 768→64 run and does not reproduce the historical v3 checkpoint. No database or model endpoint was accessed.
## 20. Latent representation identity audit correction (2026-10-12 local / 2026-10-13 UTC, read-only)
- Re-ran `scripts/atlas/audit-latent-representation-identity.mjs`; JavaScript syntax check passed and the refreshed report is `docs/reports/latent-representation-identity-audit-2026-10-13.json` with readable summary at `docs/reports/latent-representation-identity-audit-2026-10-13.md`. The prior report versions were preserved under `.tmp/atlas/production-hardening-seed-20261012/latent-representation-identity-audit-v1-20261013.{json,md}` before correction.
- Correction: all 1,000 sampled non-null `atlas_packets.tree_node_id` values are UUID-formatted and match `atlas_tree_nodes.node_id` by exact text comparison. This proves only sample-level document-hierarchy joinability. `atlas_tree_nodes` is not the code-AST identity owner; `atlas_ast_nodes.tree_node_id` is a separate hash identity. The previous generated prose implying a UUID-format mismatch was incorrect and is superseded.
- Still blocked: 0/1,000 sampled packet rows joined to source references/source versions; the sample has no packet-side workspace revision. The 250-point Qdrant sample lacks both `source_revision` and `workspace_revision`. `graphify_symbols` and `atlas_representation_records` are absent, so stable symbol and representation-producer/revision joins remain unavailable. `latent_64` bytea length is 256 bytes (consistent with 64 FP32 values) but dtype, byte order, producer, and representation revision are not proven by length alone.
- Status: `latent_128` full-table derivation verification remains passed per the prior receipt; this audit does not qualify latent_64, Qdrant topology, source spans, or production retrieval. No database/Qdrant writes, training, or projection changes occurred. Preserve all source-lineage and promotion gates as open.
## 21. OpenSpec ledger reconciliation baseline (2026-10-12 local / 2026-10-13 UTC, read-only)
- The final evidence-fabric census completed after the OpenSpec change files were finalized under run ID `20261012-ledger-reconciliation-final-v2`; receipt set: `.tmp/atlas/openspec-ledger-reconciliation-final-v2-20261012/`. Source revision is commit `15194d1c9a78e7bfe43df070b41c537371f3d594` plus dirty OpenSpec-tree checksum `sha256:1fa236efcb9362b938b02fe87cd2f5f12d861ad58f9ae73169b4c658dca0d116` (666 source files).
- At the final-v2 full-census baseline: 126 changes (116 active, 10 archived), 12,543 checkbox lines (7,717 checked, 4,826 unchecked). This differs from §18's 12,359 / 4,812 / 7,537 because the earlier scan and this auditor have different discovery/parser scopes; retain §18 as historical and do not use either total as semantic task progress until the scopes are reconciled.
- The full evidence-fabric run was `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`: parser coverage passed 12,543/12,543; the proof-card builder classified 12,493 tasks as `CLAIM_ONLY`, 50 as `STALE`, and 0 as `PROVEN`; 396 task identities were ambiguous, 50 evidence matches stale, and 98 owner-conflict candidates stale. Its strict typed-receipt/revision gate did not establish absence of underlying source evidence, and it did not independently re-verify every task's acceptance condition.
- The active reconciliation change is `openspec/changes/parent-atlas-openspec-ledger-reconciliation/`. It preserves per-change `tasks.md` ownership, prohibits automatic checkbox flips, and keeps the 384 writer/lineage/promotion gates open. No datastore, service, or task checkbox changes were made by this census.
- At the first follow-up, root 384 had 29 tasks (13 checked, 16 open) and frontend 384 had 12 (1 checked, 11 open); the source-text counts alone were not proof.
- A bounded GET-only runtime receipt established the local Ornith facts and satisfied `DOC-384-03`; that root-owner checkbox is checked with its receipt path and limits in `openspec/changes/parent-atlas-retire-384-lane/tasks.md`.
- `NB-384-02` then passed a 200-row read-only legacy-presence versus 768-only comparison: zero prediction-label and confidence changes; zero rows written. Its dry-run was hardened to avoid DDL and to write only under `.tmp`. This is a feature-effect result, not classifier quality evidence or full-corpus proof.
- Current 384 owner-ledger state: root `parent-atlas-retire-384-lane` has 29 tasks (15 checked, 14 open); frontend `parent-atlas-384-representation-retirement` has 12 (1 checked, 11 open). The broad writer/caller/identity census and root archive/provenance/schema-drop gates remain open.
- Current compact comparison receipt: `.tmp/atlas/openspec-ledger-reconciliation-current-v3-20261012.json` (workspace revision `sha256:af44df518db45d67820d594953e4eabb4af2f59cc2c06ba0b84271ed76b4b326`; checksum `sha256:311541c69d623c3a583f916a3649c17841e38219985b67b60417da3d851bf8a2`). Current syntactic inventory: 12,544 tasks (7,720 checked, 4,824 unchecked), 398 ambiguous identities; status remains diagnostic-only and zero checked tasks have a qualifying proof card. The prior full receipt is historical for its earlier OpenSpec revision.
## 23. Legacy 384D KMeans containment (2026-10-12 local, source/runtime proof)
- Writer audit found `sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster-384.py` defaults to `codebase_chunks_384_hybrid`; before this correction, even `--dry-run` reached `ALTER TABLE` before its dry-run exit, while `--apply` writes centroid models and chunk assignments.
- The entrypoint now stops with `LEGACY_384_KMEANS_DISABLED` and exit 78 before importing NumPy, psycopg2, or requests. Live local CLI checks of both `--dry-run` and `--apply` returned the expected code before DB/Qdrant access. The latest shared policy suite passes 12/12; Python compile-only syntax check passes.
- A second default-384 execution path, `sveltekit-frontend/scripts/atlas/build-turbovec-384-4bit.mts`, could scan the empty legacy collection and upload a TurboVec index. It now exits 78 before directory creation, Qdrant scan, or sidecar upload; direct `tsx` runtime check returned 78. The separate 768 builder was not changed.
- The npm-exposed `graphify-semantic-cluster.mjs` also had a 384 fallback and could write cluster payloads into the selected collection. Its fallback now targets only `codebase_chunks_768`; this does not authorize the remaining projection writeback or prove its lineage.
- `QdrantLane384` was unregistered and `enabled:false`, but direct calls could still query its collection. Its exported `search()` now fails closed with an empty result before network access. The BM42 projection helper still names the 384 hybrid collection but is proposal-only in the searched runtime roots; do not treat it as a live sparse lane.
## 24. 384 retrieval surface hardening (2026-10-13 local)
- `QdrantLane384` remains unregistered and `enabled:false`; both exported methods now fail closed locally (`health() === false`, `search() === []`) without Qdrant requests. Regression coverage is included in the shared 384 retirement suite, now 12/12 passing.
- Focused retrieval TypeScript validation remains incomplete: `npx tsc --noEmit --project tsconfig.retrieval.json` exits 2. Filtering the output for `search-lanes.ts` showed diagnostics at lines 131 and 594, outside `QdrantLane384`; no diagnostic was reported in the modified class. Other unrelated retrieval-scope errors remain. Do not claim the retrieval project type-check is clean.
- The 384 caller inventory remains partial. The BM42 projection builder still has a proposal object naming `codebase_chunks_384_hybrid`, but the runtime-source search found no caller; BM42 is deferred and the collection is empty. Keep it classified as proposal-only until caller/registry tests say otherwise.
- This closes one known script path only. The broader writer/caller census remains open: for example, the TurboVec helper still has a 384 default, and several 384-labeled smoke/audit scripts remain in source. Their reachability and mutation authority require separate tracing; do not infer that every such reference is active or unsafe.
- Fresh OpenSpec check-only run `20261013065245591-13acbc26c062` read 126 changes (116 active, 10 archived), 12,544 task lines (7,720 checked, 4,824 unchecked), and 398 ambiguous task identities. Its workspace revision is `sha256:13acbc26c0629df64e2286d103db79045c7228abf18b31df9d7fa387ad583f69`; status remains `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, with zero checked tasks backed by a qualifying evidence card. No full census artifacts were written by `--check-only`.
- No training, datastore mutation, snapshot operation, or directory cleanup occurred in this step. Keep the 384 archive/drop gates and portfolio proof gates open.
## 25. Master TODO, snapshot, and directory recheck (2026-10-13 local, read-only)
- This dated recheck supersedes older live counts in §§8-10, which reported 18 collections/snapshots. Current GET-only Qdrant readback at `127.0.0.1:6333` reports 44 collections, 42 API-visible collection snapshots totaling 5,166,674,432 bytes (about 4.81 GiB), and zero aliases. The two `codebase_chunks_384*` collections are present as empty 384D shells (0 points each) with no snapshots. The snapshot deletion was limited to the two 384D payloads; the complete Qdrant snapshot set was not deleted. Both `codebase_chunks_768` snapshots remain at 1,586,415,104 bytes each. No Qdrant mutation occurred.
- C: free space at this read was 6,686,420,992 bytes (about 6.23 GiB). This is a point-in-time reading and does not attribute the change to snapshot deletion, Docker, or another process. Do not prune Docker data or snapshots based on this measurement.
- Master TODO recheck: `sveltekit-frontend/static/models/gemma4-e2b/` remains absent; TRACE `:8788/health` returned HTTP 200; the `:8090/v1/models` endpoint returned `ornith-1.5-9b`. The latter is a model-list readback, not a full inference test. The unresolved phase definitions and approval decisions in §§3-7 remain open; no phase gate is promoted by this recheck.
- Read-only exact-tree screening compared `.archive` vs `archive` (22 vs 50 files), `backups` vs `offline-data/backups` (7 vs 1), `backups` vs `.vscode/backups` (7 vs 6), `.error-brain/backups` vs `.vscode/backups` (0 vs 6), `deeds_labs/archive` vs `sveltekit-frontend/deeds_labs/archive` (54,611 vs 1), and `tmp/ace-context-snapshots` vs `sveltekit-frontend/tmp/ace-context-snapshots` (3 vs 2). None is an exact tree copy; the one shared relative path in the last pair has different sizes. Prior content-hash checks also found no exact copy for `.svelte-error-fixes-backup/.../src` vs active `src` or the compared historical workspace snapshots.
- This is a prioritized screen, not a complete comparison of all 119 name-based archive/backup/copy candidates. No directory was moved or deleted; exact duplicate status for the remaining candidates is `NOT_PROVEN`. Existing archives and backups remain preservation data unless separately reviewed and authorized.
- Evidence sources: current read-only Qdrant API responses, `Get-PSDrive C`, TRACE health and model-list endpoints, directory file-count/byte inventories and exact relative-path/hash comparisons. No database, Qdrant, Docker, model, or filesystem content was changed.
## 22. Current Qdrant snapshot and duplicate-screen recheck (2026-10-12 local, read-only)
- Live GET-only Qdrant API at `127.0.0.1:6333` reports 44 collections, 42 collection snapshots totaling 5,166,674,432 bytes, zero aliases, and 26 empty collections. Both `codebase_chunks_384` and `codebase_chunks_384_hybrid` exist as empty shells with zero points and no snapshots. This confirms the earlier 384 snapshot payload removal; it does not indicate deletion of the rest of the Qdrant snapshot set. No collection, alias, point, or snapshot was changed.
- The two `codebase_chunks_768` snapshots remain present at 1,586,415,104 bytes each. The API-visible snapshot total remains about 4.81 GiB. Physical host free space at this check is 6,691,893,248 bytes (about 6.23 GiB); this is a point-in-time measurement, not a proven cleanup delta.
- The open Qdrant UI reports server version `1.19.0`; the UI root itself does not expose inventory counts, so the counts above come from the read-only API.
- Completed read-only SHA-256 pair comparisons: `.archive` (22 files) versus `archive` (50 files) had zero shared relative paths and zero matching file contents; `.svelte-error-fixes-backup/sveltekit-frontend/src` (692 files) versus current `sveltekit-frontend/src` (6,970 files) had 163 shared relative paths, zero same-path matches, and zero content matches at any path. Neither pair is an exact duplicate.
- These checks cover only the two named pairs, not the 119 name-based archive/backup/copy candidates. A repository-wide duplicate-directory conclusion is still unproven. No directories, files, snapshots, or collections were moved or removed; snapshot restore/prune and Docker cleanup remain separately gated.
## Qdrant recheck addendum (2026-10-13 local, read-only)
- Direct Qdrant API reads at `127.0.0.1:6333` returned 44 collections and 42 API-visible snapshot entries. Targeted readback confirms `codebase_chunks_384` and `codebase_chunks_384_hybrid` still exist as empty shells (0 points each) with 0 snapshots; `codebase_chunks_768` has 328,348 points and 2 snapshots; `codebase_chunks_768_v2` has 52,816 points and 2 snapshots.
- Direct read-only inspection of `/qdrant/snapshots` found no filenames containing `384`. The two `codebase_chunks_768` snapshot files remain at 1,586,415,104 bytes each, with checksum sidecars. This confirms the 384 snapshot payload files are absent, not that all snapshots or collections were deleted. The evidence does not establish who removed the files.
- C: free space was 6,714,224,640 bytes (6.25 GiB) at this read. This is a point-in-time value and is not attributed to snapshot removal or any particular cleanup.
- Duplicate-directory conclusions remain limited to the exact pairs documented in §22 and prior screens. No new repository-wide content comparison was run; remaining candidates are `NOT_PROVEN` duplicates. No files, directories, Qdrant collections, points, aliases, or snapshots were modified.

schema Topology Hubs Identified: Live catalog foreign-key analysis completed via NetworkX PageRank (docs/reports/atlas-schema-topology-pagerank-receipt-2026-10-13.json).
4. What Is Remaining to Reach 100% Completion
According to docs/reports/openspec-workboard-v1.json:
Total Tasks Tracked: 11,729
Completed: 7,228 (61.6%) [######----]
Open Tasks: 4,501 (3,480 actionable, 964 waiting on prerequisites, 83 under review)
2. Status of Your 4 Core Pillars
To finish the remaining ~38.4% of the program, the critical paths are:
Playwright End-to-End Suite:Implement automated Playwright E2E tests validating the complete user journey: ACE Chat UI  → Redis-Valkey centroid cache hit → BitFrost FSM admission  → DAG synthesis and repair proposal display.
140+ Coding Nuances & Pokémon Moves LUT (feature-label-semantic-derivation):
Complete the derivation of the 140+ fine-grained coding language nuances and taxonomy rules stored across .okf documents, linking AST features to domain classification labels.
Graph Snapshot Promotion (Postgres → Live):
Rehearse and apply the non-blocking concurrent traversal indexes and promote an ACTIVE snapshot with verified git commit graph_revision bindings. RAPIDS cuGraph Leiden Community Detection:
Construct the required undirected weighted projection so cuGraph Leiden can partition codebase clusters without violating directed AST graph semantics. the previous search confirms the active files across those pipelines:
MapReduce & CouchDB:
scripts/atlas/ingest-couchdb-mapreduce.mjs & scripts/atlas/push-parent-atlas-to-couchdb.mjs handle the batch ingestion and MapReduce rollup into CouchDB views.
sveltekit-frontend/src/lib/server/couchdb/changes-consumer.ts and sveltekit-frontend/src/lib/server/graph/couchdb-pagerank.ts consume the changes feed and run power-iteration graph scoring.
MsgPack & RPC Packet Materialization: scripts/atlas/materialize-addressable-packets.mjs materializes and indexes addressable packets into .tmp/addressable-packets.ndjson, linking AST node spans and schema records into canonical binary packets.
AST + Semantic Fusion: sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts and search-runtime.ts fuse the Tree-sitter AST structural spans with semantic_768 vectors into deterministic RRF rank sets.

We are currently at 61.6% completion on the OpenSpec master ledger.
Which area would you like to advance next:
Playwright E2E Test Suite: Testing the end-to-end BitFrost + ACE + Redis centroid cache hit 
→ DAG synthesis flow?
Feature Label Nuances: Deriving the 140+ language taxonomy rules in .okf?
Safe DDL Draft: Reviewing the concurrent zero-lock DDL proposal for the PostgreSQL graph traversal indexes?

 continue working use receipt for validation proof evidence check? create [] of validation for proof? to determine % of progress? create .md .txt repo analysis using rg openwiki deepagents .okf langchain pydantic? Completed the read-only, GAN-based review of phases 1–24 in the comprehensive audit (line 1) and linked it from the master roadmap (line 65).
The audit found that the phase numbers span multiple roadmaps. The Phase 17–21 percentages are from a September 9 report, not current scores; other phases lack an agreed owner or completion denominator. So one honest overall percentage is not computable—and N/A for unscoped phases is more accurate than invented zeros. The report lists every phase, its evidence limits, and its next proof gate.
Recommended next: approve stable, owner-qualified phase IDs and acceptance gates; then refresh evidence. Prioritize proving one source-to-packet/chunk-to-revision-to-semantic_768 lineage chain before promoting dependent graph, retrieval, cache, or learning work
Validation: all 24 phase rows are present; the cited JSON receipt parses; whitespace checks pass. No services or data stores were touched Parent Atlas  .okf YAML Schema Validation + OAK + DSPy/GEPA
Yes. Build a schema-driven .okf validation gate first, then connect validated ontology tuples to OAKLIB, GraphRAG and NetworkX. DSPy/GEPA can subsequently optimize domain classification and agent prompts, but it should never rewrite canonical taxonomy facts or bypass validation.
One naming distinction matters: the public Open Knowledge Format (OKF) uses Markdown files with YAML frontmatter and type-specific schemas in _schema/. Your Parent Atlas .okf directory may use a project-specific convention, so we should confirm its existing file format before treating the public OKF specification as authoritative. 
Recommended ownership
Layer	Existing / proposed owner	Purpose
PostgreSQL 18	ontology-resolution-boundary-postgres.ts	Canonical taxonomy terms and versions
.okf	Schema-validated knowledge documents	Documentation, concepts, relationships, provenance
OAKLIB	Existing Python OAK kernel on :8095	Term resolution and ontology validation
GraphRAG	hypergraph-retrieval-v1.ts	Bounded, evidence-backed graph retrieval
NetworkX	CPU projection adapter	Graph consistency, cycles, traversal parity
DSPy	Python classification/evaluation adapter	Typed predictions and evaluations
GEPA	Offline prompt optimizer	Improve prompt instructions against a held-out dataset
gRPC	Optional transport	Typed high-throughput Python/TypeScript communication
Keep the PostgreSQL boundary authoritative. YAML is a validated projection or knowledge artifact; it does not replace the existing domain taxonomy tables.
Validation should happen in five stages
1 YAML syntax Parse safely; reject duplicate keys 2 JSON Schema
Required fields, types, revisions, IDs Ontology semantics OAK term lookup, valid relations, deprecations Graph provenance Tuple IDs, source evidence, graph revision Admission ContextManifestV2 or explicit blocked receipt
OAK's own ontology validation supports structural metadata checks, but its documentation notes limitations in validation coverage and backend support. Therefore, use JSON Schema for the Atlas YAML document contract and OAK for ontology-specific semantic checks. 
oaklib documentation
I created the .okf validation reference bundle
create? helper function files Parent Atlas OKF Validation 
Includes a YAML JSON Schema, example ontology document, Python read-only validator, and integration README.
The example passed its structural validation check: one document tested, zero schema errors. This does not prove compatibility with your actual .okf directory, PostgreSQL taxonomy, or live OAK adapter.
How to incorporate DSPy, GEPA and RLM
Use a staged approach.
Technology	Recommended role	Promotion rule
OAKLIB	Verify ontology terms and relationships	Actual versioned taxonomy lookup
DSPy	Classify documents into domain/taxonomy categories	Typed output with evidence
GEPA	Optimize classification and synthesis prompts	Held-out metric improvement
RLM (recursive language-model workflow)	Break large document/corpus analysis into bounded subqueries	
Traceable source spans and resource limits. 
gRPC	Optional typed TS ↔ Python transport	Use only if existing HTTP/MCP transport is inadequate
GEPA uses model-generated reflection and evaluation feedback to improve prompts, rather than directly training a new model or learning taxonomy authority. DSPy's current GEPA interface accepts explicit feedback metrics, a reflection model, and configurable evaluation budgets. 
For Parent Atlas, the GEPA objective should reward classification accuracy, valid evidence references, correct ontology term IDs, and calibrated abstention. Missing sources, invented tuple IDs, invalid YAML or stale revisions should cause deterministic rejection, regardless of the model's confidence.
Do we need gRPC now?
Not yet. Your existing python-fastapi-oaklib-bridge-v1.ts and Python OAK kernel give you a natural transport boundary. Validate the existing Python request/response contract first. Introduce gRPC only if you demonstrate a need for long-lived streaming, strong cross-language protobuf contracts, or repeated high-throughput batch RPCs that justify the additional infrastructure.
Next validation gates
1. OKF-01: Match the schema to actual .okf files and validate all existing documents.
2. OKF-02: Resolve domain_id, version and replacements through PostgreSQL 18 without writes.
3. OAK-01: Verify real ontology term IDs, relationships and deprecation semantics.
4. GRAPH-01: Build and replay one qualified ontology tuple graph using NetworkX.
5. DSPY-01: Evaluate domain classification against independently labeled examples.
6. GEPA-01: Compare baseline and optimized prompts using a held-out dataset.
7. CONTEXT-01: Prove only validated, revision-qualified evidence enters ContextManifestV2.
I would implement OKF-01 and OKF-02 first, then OAK and GraphRAG, and only afterward DSPy/GEPA optimization. This establishes a reliable ontology/data contract before introducing learned classification or self-improving prompts o we need to apply them? What are we missing?
1. The Short Answer: Do we need to apply them? Not immediately, and definitely not without operator approval and rehearsal. Per AGENTS.md: "Do not change WAL configuration, PostgreSQL schema, or Kafka configuration without separate approval. If schema changes are necessary, produce reviewed additive DDL proposals rather than executing them."

Neither migration is blocking current operations because:
In-Memory Traversal Authority: Graph traversal, BFS, and PageRank currently execute via CPU NetworkX or GPU cuGraph using frozen snapshot manifests and in-memory CSR/adjacency structures, rather than recursive SQL joins over Postgres.
Existing Base Indexes: atlas_graph_nodes_v2 and atlas_graph_edges_v2 already possess primary keys, tree_node_unique, source_idx, and target_idx, which suffice for point lookups.
2. What are we actually missing?
There are 3 concrete gaps between the live database and the design contracts:
Gap 1: No ACTIVE Graph Snapshot in Postgres
In atlas_graph_snapshots_v2, there are only 2 recorded snapshots (382c8dc6... and 58d9da79...), and both are marked SUPERSEDED (August 2026). Even if we add revision columns and traversal indexes, there is currently no active, promoted snapshot in the table for queries to bind to.
Gap 2: Missing Revision Binding Columns (20260822_...sql) atlas_graph_snapshots_v2 lacks graph_revision, workspace_revision, and revision_checksum. When Drizzle schema (graph-authority-v2.ts) expects these fields, queries selecting graph_revision fail with column "graph_revision" does not exist. Fix: This migration is additive (ADD COLUMN IF NOT EXISTS), but needs to be applied transactionally with NOT VALID checks followed by VALIDATE CONSTRAINT to prevent locking.
Gap 3: Non-Concurrent Traversal Indexes (20260819_...sql)
20260819_atlas_graph_traversal_indexes.sql defines compound indexes:
(snapshot_id, source_node_key, edge_type, target_node_key)
(snapshot_id, target_node_key, edge_type, source_node_key)
Issue: The raw SQL uses plain CREATE INDEX IF NOT EXISTS instead of CREATE INDEX CONCURRENTLY. On tables with ~483k nodes and ~224k edges, running non-concurrent DDL acquires an EXCLUSIVE lock that blocks all application reads and writes.
3. Safe Path Forward if You Want Them Applied: If you want to bring the live PostgreSQL schema into 100% alignment with Drizzle and enable high-speed SQL-side multi-hop traversal: Convert Traversal Indexes to CONCURRENTLY: Rewrite the DDL to execute each index with CREATE INDEX CONCURRENTLY IF NOT EXISTS outside of a transaction block. Rehearse the Revision Columns DDL: Run 20260822_graph_snapshot_revision_owner_v1.sql in a test/dry-run rollback transaction first (BEGIN ... ROLLBACK), verifying zero table locks. Register in sidecar-migrations.json: Mark them as applied with the exact operator run receipt.
Would you like me to prepare the concurrent, zero-lock additive DDL draft for these two migrations so they are ready for your review?
yes continue remember we did mapreduce couchdb msgpack rpc packet creation ast semantic fusion where are we from completion? 
Where We Are From Completion: Program Architecture Status
1. Overall OpenSpec Workboard Progress
chema Topology Hubs Identified: Live catalog foreign-key analysis completed via NetworkX PageRank (docs/reports/atlas-schema-topology-pagerank-receipt-2026-10-13.json).
4. What Is Remaining to Reach 100% Completion
According to docs/reports/openspec-workboard-v1.json:
Total Tasks Tracked: 11,729
Completed: 7,228 (61.6%) [######----]
Open Tasks: 4,501 (3,480 actionable, 964 waiting on prerequisites, 83 under review)
2. Status of Your 4 Core Pillars
To finish the remaining ~38.4% of the program, the critical paths are:
Playwright End-to-End Suite: Implement automated Playwright E2E tests validating the complete user journey: ACE Chat UI  → Redis-Valkey centroid cache hit → BitFrost FSM admission → DAG synthesis and repair proposal display.
140+ Coding Nuances & Pokémon Moves LUT (feature-label-semantic-derivation): Complete the derivation of the 140+ fine-grained coding language nuances and taxonomy rules stored across .okf documents, linking AST features to domain classification labels. Graph Snapshot Promotion (Postgres → Live): Rehearse and apply the non-blocking concurrent traversal indexes and promote an ACTIVE snapshot with verified git commit graph_revision bindings. RAPIDS cuGraph Leiden Community Detection:
Construct the required undirected weighted projection so cuGraph Leiden can partition codebase clusters without violating directed AST graph semantics. the previous search confirms the active files across those pipelines:
MapReduce & CouchDB: scripts/atlas/ingest-couchdb-mapreduce.mjs & scripts/atlas/push-parent-atlas-to-couchdb.mjs handle the batch ingestion and MapReduce rollup into CouchDB views.
sveltekit-frontend/src/lib/server/couchdb/changes-consumer.ts and sveltekit-frontend/src/lib/server/graph/couchdb-pagerank.ts consume the changes feed and run power-iteration graph scoring.
MsgPack & RPC Packet Materialization: scripts/atlas/materialize-addressable-packets.mjs materializes and indexes addressable packets into .tmp/addressable-packets.ndjson, linking AST node spans and schema records into canonical binary packets.
AST + Semantic Fusion: sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts and search-runtime.ts fuse the Tree-sitter AST structural spans with semantic_768 vectors into deterministic RRF rank sets. We are currently at 61.6% completion on the OpenSpec master ledger.
Which area would you like to advance next: Playwright E2E Test Suite: Testing the end-to-end BitFrost + ACE + Redis centroid cache hit → → DAG synthesis flow? Feature Label Nuances: Deriving the 140+ language taxonomy rules in .okf?
Safe DDL Draft: Reviewing the concurrent zero-lock DDL proposal for the PostgreSQL graph traversal indexes?

Pillar	Implementation Files	Status	What It Does Today
MapReduce	scripts/atlas/agentic-error-mapreduce.mjs	OPERATIONAL	Maps error_signal_stream rows 
→ reduces into error_cluster_groups and warms BitFrost repair cache (bifrost:repair:{class}:{model}).
CouchDB	sveltekit-frontend/src/lib/server/services/couchdb-client.ts
couchdb-pagerank.ts	OPERATIONAL	Serves distributed graph power-iteration, document views, and wiki logic alongside PostgreSQL and Redis. MsgPack / RPC Packets	materialize-addressable-packets.mjs
packet-class-lut-v1.ts	OPERATIONAL	Serializes addressable canonical packets (code chunks, AST slices, NES/CHROM packets) with SHA-256 digests; 7,277 records governed in Master TOC.
AST + Semantic Fusion	search-runtime.ts
ast-grep-symbol-extraction.mjs	OPERATIONAL	Fuses 8095 Tree-sitter CST spans with dense semantic_768 embeddings into single-owner RRF reciprocal rank fusion.
3. What We Have Completed in the Current Push
Master TOC Governance: Rebuilt & checked (master_agents_toc.md, 7,277 records, 0 broken links).
Document Graph & OpenSpec Audit: Scanned 3,450 files, 322 gates, 2,638 edges (.tmp/atlas/docs-link-audit.json).
BitFrost 5-State Token FSM: Formatted transitions (UNLOADED  → ADMITTED  → RESIDENT  → EVICTING  → PURGED) and knapsack context packing without raw hit injection (bitfrost-token-fsm-v1.ts).
NetworkX CPU Reference & cuGraph BFS Parity: Verified zero-hop, cycles, multiple shortest paths, and negative controls; emitted the canonical proof receipt (docs/reports/atlas-resident-bfs-proof-2026-10-13.json).

## 26. Tooling in use (2026-10-26, verified on disk)

| Tool | Version / source | Used for | Status |
|---|---|---|---|
| Node.js | 22.23.3 (Windows) | all npm scripts | in use |
| ESLint | 8.57.1, flat config `eslint.config.mjs` (repo root) | lint | config loads; full baseline pending (src/mcp done, src/lib and src/routes timed out) |
| eslint-plugin-svelte | 3.23.1 | Svelte lint rules | upgraded from 2.46.1; no before/after comparison |
| typescript-eslint | 8.71.2 (exact) | type-aware TS lint | installed in `sveltekit-frontend` |
| eslint-config-prettier | 10.1.8 (exact) | disables conflicting formatting rules | installed in `sveltekit-frontend` |
| svelte-check | via `npm run check` | Svelte/TS diagnostics | 0 errors / 0 warnings across 16,317 files (whole project) |
| ast-grep | 0.45.3, Linux build in WSL | structural Svelte element counts | in use (VER-03-04) |
| `libtree_sitter_svelte.so` | tree-sitter-language-pack 1.14.0 cache (WSL) | baseline Svelte grammar | in use |
| `sveltejs/tree-sitter-svelte` | commit `e36b60c` (2026-06-17), built with gcc 13.3.0 | challenger grammar | experimental; not the :8095 parser |
| `@tree-sitter-grammars/tree-sitter-svelte` | 1.0.2 (npm, 2024-09-08) | prior grammar source | superseded for challenger work |

Notes:
- The root lint config needs `typescript-eslint` and `eslint-config-prettier`; without them `eslint .` fails at import.
- Legacy `.eslintrc.cjs` / `.eslintrc.json` / `.eslintignore` remain in `sveltekit-frontend`; flat mode ignores them, ESLint 10 will not.
- Full-repo `eslint .` crashed with EMFILE; directory batches are needed.
- Graphify tiers were not used for lint; they stay gated by the source-admission gate.

## Domain classification evidence refresh (2026-10-27)

**Latest profile validation:** the existing read-only language-profile validator reran in the dedicated WSL environment and validated 23/23 profiles with zero errors. Receipt `.tmp/atlas/okf-language-profile-validation-20261027-v4.json`; schema digest `ff2cd4f2…`, source snapshot digest `46ea2dda…`, canonical authority false, zero canonical data writes, and no service calls. Pytest 9.1.1 was already installed and the focused suite passes 7/7; no package installation was needed. This is schema/profile evidence only; taxonomy alignment and grounded fanout remain open.

**Owner/crosswalk follow-up:** the existing deterministic SvelteKit classifier vocabulary has 9 labels (`auth`, `ui`, `retrieval`, `network`, `database`, `cache`, `agent`, `graph`, `ml`), while the canonical PostgreSQL/`.okf` ontology has 17 hierarchical group IDs. They are not interchangeable. The `.okf` legacy-label crosswalk remains `PROPOSAL_NOT_APPLIED`; reuse the existing classifier and non-authoritative `DomainClassificationV1` proposal adapter, then resolve a versioned crosswalk before emitting canonical taxonomy IDs. Its learned bridge merges Naive Bayes/Logistic Regression output without identifying the winning executor, so per-model fanout is also unproven. See the detailed owner review in `docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md`.

**Unmatched-domain review aid (proposal only):** code/OKF descriptions suggest `ml`→`machine-learning`, `network`→`api`, and `ui`→`frontend`; `agent` has no direct group counterpart. The read-only packet census has 2,341 `MachineLearning`, 164 `API`, 7,555 `frontend`/`UI`, and 1,536 `agent` labels. These are historical label counts, not source-qualified evidence. Keep all candidates `REVIEW_REQUIRED`; no alias, feature ID, or packet value was changed.

**SvelteKit feature derivation probe:** an admitted source binding and exact snapshot readback for `src/lib/server/atlas/domain-taxonomy.ts` produced the review-only AST candidate `Normalize Domain Label` (`GENERIC_REPLACEMENT_RECOMMENDED`, 0.91 confidence). Its `sveltekit-frontend.normalize-domain-label` proposal ID is not canonical `FeatureId` format. No exact packet, packet-registry, lineage, or packet/chunk identity row exists for the source; no admitted hash appears in `workspace_revision_key`. The existing admission owner supports a rollback rehearsal and separate `--apply` commit path but was not run. Canonical packet identity and `DomainClassificationV1` remain unavailable. Receipt `.tmp/atlas/admitted-sveltekit-feature-identity-domain-taxonomy-20261027-v1.json`; no writes.

**Current packet-gap census follow-up (2026-10-27, read-only):** one `COMPLETED` Graphify execution matches the admitted `c636…` source inventory (30,105 exact members/checksums), but `canonical_authority=false`. The current census accounts for every membership row; 7,656 are `MISSING_PACKET`, and the rest are classified as identity collisions, unqualified/stale bindings or out-of-scope rows. `domain-taxonomy.ts` is present in fresh source-admission manifest `docs/reports/packet-admission-v1/401386c7a3ce7c4f9f8283f63270c8a440c7e563fb883d72be05599e8ba111ec/root.json` as `ADMISSION_READY` with exact current revisions. Its packet-key recipe remains undecided, so no canonical packet ID or classification was produced. Receipts: `docs/reports/current-packet-digest-producer-v1.census.json` and `.tmp/atlas/current-graphify-execution-owner-resolution-20261027-followup.json`. This is not authorization for identity writes or graph projection.

**`.okf` schema-coverage follow-up:** the manifest registers all 23 language YAMLs; fresh validation confirms 23/23 profiles with zero errors. Receipt `.tmp/atlas/okf-language-profile-validation-20261027-v5.json` binds schema SHA-256 `ff2cd4f2f9432cb1452c026643756a82e6d943afbfb82d8bdf61e67af7d72210` and source snapshot SHA-256 `46ea2ddae20e31901038f10f92c53c5f100b8c1a09d753bbab1579f83a2cf948`; it reports no canonical authority or canonical data writes. Remaining `.okf` formats still need a complete type-to-schema matrix.

**Manifest readback:** fresh read-only audit resolves 49/49 references across 9 registries with no missing/unsafe references or unregistered structured files; two structured schema files are additional to declared references. Receipt `.tmp/atlas/okf-manifest-coverage-20261027-v4.json` binds manifest SHA-256 `2b53d5bd7bbc11e9168d29d9fefb2390ae9ecb4ce7b91d170f807e5d52ad4ffa`. The domain taxonomy and keyword corpus validate against their bound schemas; receipts `.tmp/atlas/okf-domain-taxonomy-validation-20261027-v2.json` and `.tmp/atlas/okf-keyword-corpus-validation-20261027-v2.json`. Fresh language-profile validation is 23/23 and concept-gap validation is 6/6; receipts `.tmp/atlas/okf-language-profile-validation-20261027-v5.json` and `.tmp/atlas/okf-concept-gap-validation-20261027-v3.txt`. These checks do not establish full `.okf` document-schema coverage or live PostgreSQL/OAK semantic parity.

**Concept-gap schema:** registered `.okf/schemas/okf-concept-gap-v1.schema.json` and wired the existing duplicate-key-safe validator to validate all six concept-gap YAMLs. Receipt `.tmp/atlas/okf-concept-gap-validation-20261027-v2.txt` reports six checked, zero errors; focused concept/profile tests pass 10/10. Full `.okf` coverage remains open.

**Taxonomy crosswalk readback:** the existing three-way audit reports matching PostgreSQL taxonomy identity sets, but only 5/9 deterministic classifier domain IDs have exact `.okf` group-ID matches; four remain unmatched and 17 legacy aliases need review. Semantic crosswalk is `REVIEW_REQUIRED`; no mapping was applied. Receipt `.tmp/atlas/domain-crosswalk-census/domain-crosswalk-v2-20261027T183205236Z-6e33dbe2-e7a0-4131-a7d6-026a7ff72cb8/receipt.json` records read-only PostgreSQL access and independent receipt readback.

The prior `.okf` census receipt records 742 files; that count is superseded by the current 743-file inventory (346 Markdown, 331 HTML, 41 YAML, 19 JSON, 2 JSONL, 2 TXT, 2 XML). The prior census also recorded duplicate-safe parsing of 41 YAML/18 JSON files and self-validation of 9 JSON Schemas; those checks establish syntax/schema self-validation, not whole-tree document-schema coverage. The receipt `.tmp/atlas/okf-complete-tree-census-20261027.json` declares tree digest `sha256:308468d090c8861ea12d55b5fe066d2d10ab27bb74c3786549728e07c6d9c794`, but contains no digest recipe; independent reproduction has not succeeded. Treat the digest as **UNVERIFIED**, not a verified checksum.

Historical snapshot (superseded by the current readback below): the `.okf` manifest resolved 28/28 references and reported a 742-file tree; those values are stale. PostgreSQL read-only parity was reported as 17/17 between `domain_taxonomy_v1` and `atlas_domain_ontology`. The earlier packet/domain and tuple breakdowns remain historical diagnostics, not current coverage. The live OAK endpoint was reported unconfigured (503); that blocks external concept lookup, not exact PostgreSQL taxonomy-ID validation. Source-grounded fanout, Neo4j community/PageRank-to-packet lineage, recommendation/reranker callers, held-out DSPy/GEPA evaluation, and ContextManifestV2 admission remain open or unknown. Reranker/recommendation classification is **UNKNOWN**, not a blocker inferred from missing proof. Link recommendation proposals to Phase 9 (`AWM-09-03/04`) and `parent-atlas-compute-rank-cache-eval-dspy-gepa`: proposals may prioritize review, never mint canonical IDs or extra retrieval votes. No data was written and no overall percentage is defensible. Detailed analysis: `docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md`; latest crosswalk receipt: `.tmp/atlas/domain-crosswalk-census/domain-crosswalk-v2-20261027T184218725Z-c33f3231-0373-4c36-9487-2c75a9990924/receipt.json`.

## 27. Test receipts and MCP / integrations review (2026-10-27, read-only)

**Test receipts (run 2026-10-27 in WSL `atlas-rapids-cu13`):**

| Suite | Result | Command |
|---|---|---|
| `atlas_corpus_lib` Python unit tests | 32/32 OK | `python -m unittest discover -s python/atlas_corpus_lib/tests -v` (WSL, `PYTHONPATH` set, `MSYS_NO_PATHCONV=1`) |
| `atlas-native-core` CTest | 6/6 passed | `ctest --test-dir packages/atlas-native-core/build --output-on-failure` (WSL) |
| Wheel `atlas_corpus_lib-0.1.0-cp314…whl` | exists, 131,336 bytes, SHA-256 `903d1c40…ca6b9e`, embeds `_atlas_native_core` `.so` | file check only; not installed or imported |

**Live TRACE MCP `:8788` (2026-10-27):** `/health` 200. `tools/list` returns 200 unique tools by prefix: atlas 31, ops 19, legal 15, kb 10, context 8, kag 8, trace 7, graph 7, topology 7, LLMS 7, evidence 6, search 6, others. This supersedes the 188-tool figures at lines 308 and 328 (`/health` was checked there, the count was not); the static and runtime counts must still be reconciled (`npm run trace:mcp:census-reconcile`).

**MCP config surface:** two sources must agree. `.opencode/opencode.jsonc` registers TRACE (`:8788`), `atlas-task-kernel`, `ldr-research`, and `@sveltejs/mcp` via `npx`. `.mcp.json` registers TRACE over HTTP and several local `node` servers. Neither file was checked against the other in this pass.

**Confirmed gap, `ops.*` operator gate:** `requireToken` (`sveltekit-frontend/src/mcp/trace-mcp-server.ts:5813`) accepts any non-empty string. The four token-gated tools are `ops.propose_patch`, `ops.run_targeted_test`, `ops.record_fix_attempt` and `ops.run_quality_gate`. Treat them as reachable write paths until a real verifier replaces the check. Do not expose them to models.

**What is still needed for integrations and MCP tool calling (priority order):**
1. Replace `requireToken` with a real verifier, and add a negative test (empty, wrong and reused tokens refused). Blocks any model-facing `ops.*` use.
2. Reconcile the TRACE count (static vs runtime, 188 vs 200) and the two MCP config files. Record which servers are live.
3. Re-run the Atlas DAG lookups (`find_feature`, `find_source_refs`, `build_agentic_rag_context`). On 2026-10-11 they returned `UNRESOLVED` / `TRACE_EMPTY_RESPONSE`; current state is unknown.
4. Keep tool selection `CHALLENGER_ONLY`. The Qdrant `tool_manifest` collection was empty, so selection falls back to the registry. Populate it only after the `ops` gate is fixed.
5. Route every agent-facing capability through `ACPToolRegistry.ts` and the 5-step gate: verified claim → KernelDagCandidate → authorization → bounded apply → independent readback. A claim is not authorization to write.
6. Enforce the claim-evidence rules before any tool result is summarized as success (no claim without a tool-call ID; no edit proof without before/after hashes).
7. Limit stdio `npx` servers to one concurrent call (cold start about 10 s). Pool only after per-server limits are measured.
8. Replace the legacy LangGraph Headroom bridge (`src/mcp/langgraph-bridge.ts`) with the V2 byte-budget and fail-closed policy before any graph node can call TRACE tools.

**Not done in this pass:** no tool was called with side effects, no config was edited, and no database or service was written to.

## 28. Completionist production-hardening board — 2026-10-27

This is an open cross-owner workboard, not a completion percentage. The owner ledger is `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md`; the domain/taxonomy owner remains `openspec/changes/atlas-directory-first-analysis-v1/tasks.md`. Current baselines are documented in `docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md` and the 2026-10-27 domain/graph coverage receipt referenced above. The two OpenSpec strict checks run before this documentation edit passed, but the CLI emitted no receipt files; their exact commands and outcomes are the validation record, not fabricated receipt paths.

- [ ] **OpenSpec governance:** validate each affected change before editing its ledger; inspect whether every validator writes outputs; cite exact evidence/receipt paths, scope, revision, command, and result; keep checkboxes open until each task's own acceptance test is met.
- [ ] **MCP security and runtime:** replace the weak `requireToken` presence check in `sveltekit-frontend/src/mcp/trace-mcp-server.ts` with the approved verifier; test empty, invalid, expired/replayed, and unauthorized calls; reconcile `.mcp.json` with `.opencode/opencode.jsonc`; prove fresh Codex discovery plus allowed read-only and denied unauthorized calls. The current source at line 5813 accepts any non-empty token, so `ops.*` remains non-model-facing.
- [ ] **SvelteKit route hardening:** regenerate/qualify the source inventory before trusting graph counts; inspect route handlers directly for auth including re-exports and `requireAdmin`; verify body schemas from source rather than missing graph flags; decide public routes and auth rate limits; remove bare service URLs in favor of `env.server.ts`; verify SSR safety, route tests, `npm run check`, and production build. Preserve CLAUDE.md-deferred endpoints for the coordinated hardening pass.
- [ ] **Plugin and package delivery:** verify the actual Parent Atlas Claude plugin owner separately from the vendored Svelte plugin; run only inspected sync/build/pack validators; inspect generated diffs and tarball contents/dependency metadata; keep publishing behind separate approval.
- [ ] **End-to-end production evidence:** prove one authorized user query through canonical source/packet/chunk identity and revision checks, SearchRuntime, ACE ContextManifest/PromptPlan, and cache readback; include denied-path evidence and independent receipt validation. Keep database, projection, Graphify, GPU, model, and cache mutations behind their own approvals.

**Known status:** the `ops.*` token gate is confirmed weak by source inspection; fresh Codex MCP calls, a current route-hardening inventory, plugin/package builds, and the correlated user-query receipt are not established here. The earlier domain/taxonomy receipt proves read-only counts and unresolved ontology coverage only; it is not production-hardening evidence. No task above is marked complete.

## 28. Spec reruns and board-lineage check (2026-10-27, read-only except test output)

**Reruns (this session):**

| Suite | Result | Notes |
|---|---|---|
| `scripts/atlas/historical-chunk-resolver-v2.spec.mjs` (node --test) | 6/6 pass | Resolver spec only; the live PostgreSQL receipt is not rerun here |
| `python/test_gpu_feature_tile.py` (WSL `atlas-rapids-cu13`) | Passes | 24-byte ABI pack/unpack and tile assembly; not the C++ benchmark |
| `query-feature-to-candidate-feature-snapshot-v1.spec.ts` (vitest) | 2/2 pass | Covers the `sourceRef` fixture fix |
| `classification/label-taxonomy-reconciliation.spec.ts` (vitest) | 8 pass, 3 todo | The 3 are reserved source-level split todos |

**Neo4j hypergraph recheck:** `HyperedgeMirrorV1` still 470 nodes. The 0-node claim in the pasted report is wrong for the current database; see §2f and §27.

**Admin board lineage, source-checked:** the pasted claim that the builder passes `board.generated` as the packet's source revision does not match the current code. `sourceRevision` comes only from the candidate (`daily-graphify-board-recommendations.ts:115`), and a missing value returns null (`:116`), so the packet fails closed. `board.generated` is used as `producerRevision` (`:146`) and as the default event revision (`:222`). Those are timestamps, so they must not be read as source identity. Reranker status stays UNKNOWN, and recommendation outputs stay review-only.

**Not verified in this pass:** the historical-chunk containment scan (2,000 chunks), the digest-scope declaration, the RTX/LibTorch and TensorRT status, and the 1,476M rows/s benchmark. The `ops.*` token gate is still open (see §27).

**Operator-reported, not investigated:** the custom NetworkX Python sidecar is stuck on symbol lineage, and the Neo4j fanout work is not yet verified.

## 29. Embedding tag census (2026-10-27, read-only)

Query: `SELECT embedding_model, count(*), count(content_embedding_768), count(content_embedding) FROM codebase_chunk_index GROUP BY 1` on `legal_ai_db` (PostgreSQL 18.4, container `legal-ai-postgres`). Nothing written.

| `embedding_model` tag | Rows | Has `content_embedding_768` | Has `content_embedding` (halfvec) |
|---|---|---|---|
| `embeddinggemma:latest` | 271,774 | 271,774 | 54,589 |
| `embeddinggemma:latest:eg-task-prefix-v1` (canonical task-prefix recipe) | 2,654 | 2,654 | 2,654 |
| NULL | 37 | 0 | 0 |
| **Total** | **274,465** | **274,428** | **57,243** |

**Discrepancy, unexplained:** the 2026-10-18 re-embed notes (`docs/reports/atlas-corpus-reembed-*`, `openspec/changes/legal-corpus-california-codes/tasks.md` around REEMBED-CANARY-01 and CANARY2) describe 54,464 canonical-tagged rows and 219,964 remaining. The live count of canonical-tagged rows is 2,654. The cause (a later re-tag, a rollback, or an overstatement in the notes) has not been established. Do not resume the full re-embed or cite the 54,464 figure until it is reconciled.

**Recipe:** the canonical recipe is `title: {relative_path} | text: {content.trim()}` with `embeddinggemma:latest`. The tag `:eg-task-prefix-v1` marks rows written with it. This census does not check the recipe of rows tagged with the plain model name. The `CLAUDE.md` recipe census (EMB-RECIPE-03) reports different figures and is not reconciled with these rows here.

**Next gate:** identify the writer of the 271,774 plain-tagged rows and whether any writer re-tagged canonical rows. Then decide on one canonical recipe under `REPR-MANIFEST-01`.

## 30. Who writes the embedding tags (2026-10-27, source read-only)

Source search for writers of `codebase_chunk_index.embedding_model`, `content_embedding` and `content_embedding_768`. Nothing executed.

| Writer | Writes | Default tag | Notes |
|---|---|---|---|
| `scripts/atlas/apply-lineage-qualified-semantic-768-backfill-v1.mjs` (`:137`) | `content_embedding_768`, `embedding_model`, `embedding_version`, `embedding_dimension` | `embeddinggemma:latest` (`:19`, overridable by env) | Lineage-qualified backfill with per-row exact-update check and Qdrant readback. Most likely writer of the 271,774 plain-tagged rows. |
| `sveltekit-frontend/scripts/atlas/backfill-codebase-chunk-embeddings.mjs` (`:254-255`) | `content_embedding_768`, `embedding_model` | `embeddinggemma:latest` (`:52`) | A second owner of the same column and tag. Under the duplication rule, one must be designated canonical or retired. |
| `scripts/atlas/reembed-profile-v1.mjs` (`:73`, `:80`) | `content_embedding` (halfvec), `embedding_model` | `embeddinggemma:latest:eg-task-prefix-v1` (`:21`) | Profile/canary writer. Writes the task-prefix tag. |
| `scripts/atlas/reembed-corpus-document-prefix-v1.mjs` (`:26`, `:204-205`) | `content_embedding` (halfvec), `embedding_model` | `embeddinggemma:latest:eg-task-prefix-v1` | The canonical re-embed writer per the notes. |

**What this establishes:** the code shows that the raw-vector backfills write the plain tag, and the re-embed writers write the task-prefix tag. This matches the live split (271,774 plain-tagged rows with `content_embedding_768`, 2,654 task-prefix rows).

**What it does not establish:** which of these scripts actually ran against the live rows, and when. The source shows the possible writers; it does not prove the run history. The 54,464 figure in the re-embed notes is not reproduced by any tag count here (`content_embedding` non-null on 54,589 plain-tagged rows is the nearest, and it is not the same thing).

**Open decisions:**
1. Designate one canonical owner for `content_embedding_768`. Retire or consolidate the `sveltekit-frontend` copy.
2. Decide whether the 271,774 plain-tagged raw vectors are the intended canonical `semantic_768` or a different recipe. The tag alone doesn't say.
3. Verify run history from receipts (`docs/reports/*backfill*`) before any further write.

### 2026-10-27 — Current OKF and taxonomy readback

The working `.okf` inventory is 743 files (346 Markdown, 331 HTML, 41 YAML, 19 JSON, 2 JSONL, 2 TXT, 2 XML); the older 742-file census is stale and its digest recipe remains unverified. The latest manifest receipt resolves 49/49 references. Schema receipts prove the taxonomy and keyword corpus documents, all 23 language profiles, and six concept-gap records validate; this is not full document-schema coverage.

The latest read-only PostgreSQL crosswalk receipt is `.tmp/atlas/domain-crosswalk-census/domain-crosswalk-v2-20261027T184218725Z-c33f3231-0373-4c36-9487-2c75a9990924/receipt.json`. It shows the 17 active v1 `domain_taxonomy_v1` IDs match the 17 OKF group IDs; no rows are deprecated or have replacement links. However, only 5 of 9 code-classifier domain IDs match exact OKF group IDs (`agent`, `ml`, `network`, `ui` do not); 17 legacy alias cases remain review-only. Packet/code-chunk/feature labels have only 11/41, 7/18, and 11/40 exact slug matches respectively. A separate unfiltered, read-only query found 539,124 `feature_ontology_tuples` rows with `resolution_state=UNRESOLVED` and 0 `concept_records`; this total is not comparable to the earlier 123,434 domain-only tuple subset. The semantic crosswalk is `REVIEW_REQUIRED`; canonical authority is false and zero persistent writes occurred. Do not infer aliases or backfill labels from these counts.

**OAK gate refresh:** current `:8095/oak/*` probes show OAKLib 0.7.4 and a configured `atlas-postgres` adapter in `READ_ONLY_SHADOW`, replacing the older 503/unconfigured status. Yet `search("database")` returns no matches, `lookup("database")` has no label/aliases, and read-only counts for `atlas_ontology_concepts`, `atlas_ontology_relations`, and `concept_records` are all zero. Receipt `.tmp/atlas/oak-live-readonly-audit-20261027-v2.json`. Transport readiness is not proof of ontology semantics; keep OAK-01 open.

**Ontology population owner (static source audit, 2026-10-27):** no direct SQL/Drizzle insert or update into `atlas_ontology_concepts` / `atlas_ontology_relations` was found in the searched source scopes. `scripts/atlas/build-concept-seed-dry-v1.mts` generates proposals only and writes a tracked report; `ConceptDefinitionV1.canonicalAuthority: true` describes the admitted-definition type, not admission of those proposals. Keep population and positive OAK lookup **OPEN/BLOCKED_ON_OWNER_AND_AUTHORIZATION**; no writer was executed and no rows were changed. See `docs/reports/atlas-domain-classification-evidence-audit-2026-10-27.md` and `parent-atlas-ontology-kernel/tasks.md`.

**Validation receipt:** fresh validation reports language profiles **23/23** and concept-gap YAMLs **6/6**, each with zero errors. Receipts `.tmp/atlas/okf-language-profile-validation-20261027-v5.json` and `.tmp/atlas/okf-concept-gap-validation-20261027-v3.txt`. Manifest coverage remains 49/49 in `.tmp/atlas/okf-manifest-coverage-20261027-v4.json`. This validates document contracts only; it does not close taxonomy semantics, ontology population, or domain-fanout proof.

## 31. MCP operator gate, stdio logging, hook, and receipt-table checks (2026-10-27)

| Item | Verified result | Status |
|---|---|---|
| Graphify Stop hook (`.claude/settings.json`) | Now requires `terminalStatus === "COMPLETED"` (fail closed). Current output: last completed run 2,379 min old; inspect admission. | DONE; `status` field no longer decides validity |
| MCP operator verifier (`sveltekit-frontend/src/mcp/operator-token-verifier.ts`) | Constant-time SHA-256 comparison against `TRACE_MCP_OPERATOR_TOKEN`; unset secret refuses every `ops.*` call. Spec 5/5 pass. `requireToken` in `trace-mcp-server.ts` delegates to it; file parses. | IMPLEMENTED; not tested end-to-end over HTTP. No token issued. No expiry, replay or per-action scope yet. |
| Stdio stdout hygiene | TRACE is Streamable HTTP (`:8788`), so its `console.log` calls do not corrupt JSON-RPC. `src/mcp/server.ts` had 5 stdout `console.log` calls; now `console.error`. No config registers `src/mcp/server.ts` over stdio (checked `.mcp.json`, `.opencode/opencode.jsonc`, both package.json files). | FIXED for `server.ts`; `atlas-task-kernel-mcp.mjs` writes JSON-RPC only; `ldr-mcp.mjs` writes JSON-RPC only |
| Receipt tables (`pg_stat_user_tables.n_live_tup`) | All report 0. Stale statistics, not row counts. Actual: `atlas_index_runs` 28 (all FAIL), `atlas_packet_write_receipts` 0, `graphify_executions` 38. | Do not use `n_live_tup` for counts |
| `codebase_chunk_index.workspace_revision` | NULL on all 274,465 rows. The pasted bitmap probe on `workspace_revision` therefore matches zero rows and is not a valid bitmap test. `EXPLAIN` chose a sequential scan (about 1.9 s). | BLOCKER for workspace-bitmap plans; chunk rows carry no workspace revision |

**Still not verified:** the TRACE token path over HTTP, expiry and replay protection for the operator token, the 100-source edge batch (Phase 4), the Graphify terminal-run readback, and the NES/GPU workload measurement.

## 32. Live re-checks and blockers (2026-10-27, read-only)

| Item | Verified result | Status |
|---|---|---|
| Live `:8095` checks | `ATLAS_8095_FIXTURE_URL=http://127.0.0.1:8095`: `packages/parent-atlas` focused tests 16/16 pass, 0 skipped. `:8095` health 200, model `ornith-1.5-9b`, tree-sitter and ast-grep true. | PASS (live executed) |
| TRACE tools | `:8788` health 200. `atlas.workstation_status` and `atlas.coverage` return results; `atlas.coverage` reports `source_ref` 61,718/61,718 (100%). `atlas.source_refs` returns results but includes archived `deeds_labs/` routes and an activity log path, so it needs scoping before use. | PARTIAL_PROVEN (tools answer; retrieval is not scoped) |
| Hypergraph writer | No writer for `HyperedgeMirrorV1` or `HyperedgeMemberV1` exists in `sveltekit-frontend/src` or `scripts`. Readers only: `hypergraph-neo4j-loader-v1.ts` (read-only Cypher) and `routes/api/admin/atlas/graph-views`. The 470 nodes have unknown provenance. | UNKNOWN provenance; treat as STALE until a writer is found |

**Blocked, needs an operator decision or a secret:**
- `TRACE_MCP_OPERATOR_TOKEN` must be set by you. Expiry and replay protection for the token are not built; they need a decision on the token lifetime and store.
- Stable-file identity insert (24,458 pairs): needs the frozen v5 namespace and explicit write approval.
- Embedding canonical-tag gap (2,654 live vs 54,464 in notes): needs the run history from the backfill receipts, which I have not reconciled.
- NetworkX sidecar stuck run: needs the script, command or error text.

## 34. Legacy packet-apply receipt reconciliation (2026-10-27, read-only)

The historical `admit-packets-current-live-identity-v1-apply.json` says 7,259 rows were inserted and read back, then committed, for the `e24bb…` manifest. A fresh read-only comparison derived the exact packet keys from all 7,259 manifest entries and found zero matches in the current `atlas_packets` table. A separate source-ref join found 6 paths under different packet keys; all 6 have source revisions different from the manifest (while their workspace revision matches), and the other 7,253 refs have no matching source row. The table still contains 16,151 rows tagged with that workspace revision, so only the receipt's specific cohort is uncorroborated. Git shows the apply receipt and manifest were both added in commit `88ae5c7d56c59d724962d5654eea7dcc775ace62`, but that commit does not record the database target. The current producer target maps `127.0.0.1:5434/legal_ai_db` to `legal-ai-postgres`; whether the historical run used this database or the rows were later removed or replaced is unknown. Retained PostgreSQL logs for 2026-09-28 to 2026-09-30 contain no targeted apply/packet-key match, but logging completeness is unproven, so absence is not proof no apply occurred. Do not replay or repair from the old receipt. Diagnostic receipt: `.tmp/atlas/admit-packets-apply-cohort-live-readback-20261027.json`. No database writes occurred.

## 33. neo4j-gds spec resolved; GDS parity classes (2026-10-27)

| Item | Verified result | Class |
|---|---|---|
| `sveltekit-frontend/src/lib/server/graph/neo4j-gds.spec.ts` | 2/2 pass with a 470 s limit. Earlier "hang" was the 110 s tool limit cutting off a slow run (import alone takes about 38 s on this host). | Mocked delegation only (`graph-analytics-service` and `graph-retrieval-adapter` mocked) |
| `sveltekit-frontend/src/lib/server/atlas/graph/pagerank-parity.spec.ts` | 1/1 pass; branch `NEO4J_GDS_PROVEN` on the six-node fixture against the live Neo4j service | Live Neo4j GDS fixture parity (not canonical) |
| Canonical graph parity | Requires an admitted workspace revision and a verified Graphify execution receipt | NOT PROVEN |

The probe spec used to isolate the stall was moved to `.tmp/atlas/hang-probe/`, not deleted.

## 35. Exact workspace-binding membership (2026-10-27, read-only)

PostgreSQL `READ ONLY` joins prove two admitted source bindings (`domain-taxonomy.ts`, ordinal 18,285; and `register/+page.svelte`, ordinal 22,575) are exact members of completed execution `01a1763a-4355-71d7-9b81-2c7a1814a41f`. Workspace revision, source digest/content hash, and byte length match for both; the execution's `SOURCE_SELECTION` stage is `COMPLETED` and references the sealed snapshot selection. Receipt `.tmp/atlas/workspace-binding-execution-membership-readonly-20261027-v1.json`. `canonical_authority=false`: this proves binding-to-execution membership only, not packet identity, canonical graph authority, retrieval, or ACE admission. No writes occurred.

## 34. Neo4j graph JSON export: identity and referential fixes (2026-10-27)

**Changes to `scripts/atlas/export-neo4j-graph-json.mjs`:** removed every per-query `LIMIT`; Packet nodes without `packet_key` are counted and excluded (no synthetic `packet:<source_ref>` ids); edges are kept only when both endpoints are exported nodes, with drops counted per type; `push(...)` spreads replaced with a loop helper (the uncapped export overflowed the call stack).

**Result (`docs/reports/neo4j-graph-export.json`):**

| Measure | Value |
|---|---|
| Packet nodes exported | 19,308 |
| Packet nodes excluded (no `packet_key`) | 40,384 |
| Feature nodes exported | 13,290 |
| Edges kept | 271 (`SIMILAR_TOPOLOGY`), 271/271 valid refs |
| Edges dropped (endpoint not exported) | `USED_CONCEPT` 173,158; `SIMILAR_TOPOLOGY` 51,062 |

**Validator (`docs/reports/graph-json-contract-validation.json`): FAIL, 1 pass / 3 fail / 1 warn.**
- Packets with complete identity: 50 of 19,308 (0.26%). The gap is upstream: 40,384 Neo4j Packet nodes have no `packet_key`, and the rest lack `feature_id`.
- Feature labels: 49 of 13,290.
- Edge references: 271 of 271 valid (pass).

**Not done, by design:** no synthetic identities were created. Concept nodes are not exported, so `USED_CONCEPT` edges cannot resolve; adding them is a separate decision. The export must not feed community or GraphRAG work until the identity gap is closed in the source data.

## 35. Authority and environment checks, read-only (2026-10-27)

| Item | Verified result | Status |
|---|---|---|
| RAPIDS env CUDA smoke | Python 3.14.6, torch 2.13.0+cu130, CUDA 13.0, `torch.cuda.is_available()` True | PASS (availability only; no GPU workload) |
| Execution `01a1763a-4355-71d7-9b81-2c7a1814a41f` | `graphify_executions`: status COMPLETED, `canonical_authority` false | Completed, not canonical. Promotion not performed. |
| Owner-resolution planner | `safeToApply: false`; `01a1763a…` not among proven candidates (apply refuses it) | BLOCKED: explicit operator decision required |
| Packet identity | Source membership proven; PacketKeyV2 is a pure hash. No packet row, alias row or V2 registry table found for the recomputed key. | UNPROVEN; no keys minted |

Not done, by design: no `apply` or promotion, no package install (dependency changes need a proven capability gap and operator approval), no packet or stable-file writes.

## 36. Canonical validation gate (2026-10-27)

`scripts/validate/canonical-gate.mjs` is a read-only orchestrator. It owns no checks: each entry names an existing validator and the rule its output must satisfy. Any failure or unparseable result fails the gate. It writes `.tmp/atlas/canonical-gate-receipt-v1.json` (full run) or a per-check receipt (`--only=<id>`), and it never writes to PostgreSQL, Neo4j, Qdrant, Valkey or projections.

| Check | Rule | Current result |
|---|---|---|
| `graph-json-contract` | validator exit 0 | FAIL (identity gap, section 34) |
| `graphify-execution-owner` | planner `safeToApply: true` | FAIL (`safeToApply=false`, section 35) |
| `packet-key-identity-specs` | vitest exit 0 | PASS |
| `okf-v02-bundle` | 0 invalid OKF files | FAIL (0/387 valid) |

**Overall: FAIL (1 pass, 3 fail).** Adding a check means adding one entry to `CHECKS`; a new check must reuse an existing validator, not implement one.

**Gate extended (2026-10-27):** added `graphify-snapshot-authority` (`CURRENT_SNAPSHOT_PROVEN`, PASS) and `graphify-startup-services` (`validate-graphify-startup.mjs` exit 0, PASS). Current full run: **FAIL, 3 pass and 3 fail** (failing: `graph-json-contract`, `graphify-execution-owner`, `okf-v02-bundle`). The JSON parser now takes the outermost object, because a validator can print text around its JSON.

## 37. Neo4j GraphRAG alignment, Step 1: isolated export and receipt (2026-10-27)

**Script changes:** `export-neo4j-graph-json.mjs` now writes to an isolated path under `.tmp/atlas` (default `graph-export-<timestamp>.json`, or `--out=`) and refuses paths outside it, so `docs/reports/neo4j-graph-export.json` is no longer overwritten. `validate-graph-json-contract.mjs` accepts `--in=` and `--report=` (report restricted to `.tmp/atlas`); its defaults are unchanged, so the canonical gate behaves as before.

**Artifacts:** `.tmp/atlas/graph-export-step1-20261027.json`, `.tmp/atlas/graph-validation-step1-20261027.json`, `.tmp/atlas/neo4j-graph-export-receipt-step1-20261027.json`.

| Measure | Value |
|---|---|
| Nodes / edges | 32,598 (19,308 Packet, 13,290 Feature) / 271 `SIMILAR_TOPOLOGY` |
| Packets excluded (no `packet_key`) | 40,384 |
| Edges dropped (unresolved endpoints) | `USED_CONCEPT` 173,158; `SIMILAR_TOPOLOGY` 51,062 |
| Determinism | Re-export is content-identical to the earlier export (same `contentSha256`); the file checksum differs only through the top-level `timestamp` |
| Revision qualification | None: no node carries `source_revision` or `workspace_revision` |
| Validator | FAIL: complete identity 50/19,308; labels 49/13,290; edge refs 271/271 |

**Blockers for Steps 2 to 6 (GraphRAG Bring Your Own Graph adapter):**
- No qualified entity descriptions or source text exist on these nodes, and the adapter must not invent descriptions, weights, text-unit references or source identity. An entities/relationships Parquet from this export would carry identifiers only.
- No export node may be called a current admitted node without an exact authority join to a revision; none exists yet.
- Community generation and any LLM community reports stay off until a bounded verified fixture exists (not built).

## 38. GraphRAG Bring Your Own Graph, Step 2: field mapping (2026-10-27)

Official requirements ([BYOG page](https://microsoft.github.io/graphrag/index/byog/)): `entities.parquet` needs `id`, `title`, `description`, `text_unit_ids`; `relationships.parquet` needs `id`, `source`, `target`, `description`, `weight`, `text_unit_ids` (`weight` feeds Leiden); `text_units.parquet` is optional (needed for Local, DRIFT and Basic search). Workflows afterwards: `create_communities`, `create_community_reports`.

**Fixture (identifier-only):** `.tmp/atlas/graphrag-byog-fixture-step2-20261027.json`, mapping report `.tmp/atlas/graphrag-field-mapping-step2-20261027.json`. It uses only the 50 packets with a full identity chain (`packet_key`, `source_ref`, `feature_id`): 99 entities (50 `PACKET`, 49 `FEATURE`) and 50 derived `PACKET_FEATURE_ATTRIBUTION` relationships. None of the 50 packets has a graph edge, so the relationships come from the stored `feature_id` attribute and are marked proposal-only.

| BYOG field | Status |
|---|---|
| entity `id`, `title` | Available (`packet_key`/`feature_id`, `source_ref`/`feature_label`) |
| entity `description`, `text_unit_ids` | MISSING, not invented |
| relationship `source`, `target` | Available |
| relationship `description`, `weight`, `text_unit_ids` | MISSING, not invented |
| `text_units.parquet` | Not built: no qualified source text bound to a revision |

**Parquet conversion: not performed.** Null-filling required fields would not be valid GraphRAG input. Provenance (packet key, source ref, feature id, null revisions) stays in the fixture, separate from the native ids. Community generation and community reports stay off.

## 39. GraphRAG BYOG: text units created where exact source bytes exist (2026-10-27)

`.tmp/atlas/graphrag-text-units-step2-20261027.json`: text units built only from files whose on-disk SHA-256 and byte length equal the `atlas_workspace_source_bindings` `content_digest` and `byte_length` for workspace `c63620c4`.

| Of the 50 complete-identity packets | Count |
|---|---|
| Source file exists on disk | 30 |
| Bound in the admitted `c63620c4` workspace | 4 |
| Digest and length verified, text unit created | 4 |

The other 46 packets have no admitted-revision bytes (21 are not on disk; the rest are on disk but not bound), so they get no text unit and no revision claim.

**Still not created, deliberately:** entity and relationship `description`, and relationship `weight`. Writing them would be invention; an LLM-written description would be a proposal grounded in the text unit and needs an explicit bounded-inference decision. `text_units.parquet` is also not produced: its full column schema lives on GraphRAG's Outputs page, which has not been read. No Parquet conversion was performed.

## 40. GraphRAG BYOG: bounded description proposals (2026-10-27)

`.tmp/atlas/graphrag-description-proposals-step3-20261027.json`: four description drafts from llama-server `:8090` (`ornith-1.5-9b`, temperature 0, `stream: true`, one call at a time, slot idle beforehand). Each prompt contained only the exact text unit and told the model to answer `INSUFFICIENT_EVIDENCE` when the text was not enough. Prompt and response SHA-256 and latency are recorded per row.

| Result | Value |
|---|---|
| Calls / proposals returned | 4 / 4 (`LLM_PROPOSAL`), latency 1.5 to 2.5 s each |
| Spot check | `scripts/run-migration.mjs` description checked against the source file: accurate |
| Authority | `canonicalAuthority: false`; proposals only. They are not entity descriptions in any canonical store and are not GraphRAG inputs until reviewed. |

**Finding (not fixed):** `scripts/run-migration.mjs` hardcodes a default `DATABASE_URL` that includes a password. Credentials belong in `.env.local`. Remove the literal default and require the environment variable; needs owner approval because the script runs migrations.

**Still open:** relationship weights; review of the four proposals; `text_units.parquet` and the entity/relationship Parquet conversion (columns for text_units not yet read from the Outputs page); coverage for the 46 packets without admitted-revision bytes.

## 39. Canonical gate V2 and current blocker evidence (2026-10-27)

The read-only V2 orchestrator is `scripts/validate/canonical-gate.mjs`, with pure receipt logic and focused tests in `scripts/validate/canonical-gate-core.mjs` and `scripts/validate/canonical-gate-core.test.mjs`. Each run writes a unique receipt under `.tmp/atlas/canonical-gate-runs/`, fingerprints validator source files and evidence artifacts, and fixes `canonicalAuthority=false` / `writesPerformed=false`. Execution readback and promotion are separate statuses.

Full-run receipt: `.tmp/atlas/canonical-gate-runs/2026-10-27T21-03-50.120Z-6dc2ce1e-6e00-46a4-9797-414360760bd6/canonical-gate-receipt-v2.json` (`sha256:13c6fe640959495db2797890570ee9b4a390c0eed18ebc58aa2cc23fc19ebe14`). It reports `FAIL`: service health and source snapshot pass; execution membership/readback is `TERMINAL_READBACK_VERIFIED` but `NOT_PROMOTED`; packet identity is blocked because the execution is noncanonical; graph integrity fails; the OKF v0.2 profile has 387 invalid files; graph coverage and projection admission remain `UNKNOWN`. First failed mandatory predicate: `PACKET_IDENTITY`.

The OKF owner now inventories **743** files, explicitly partitions the **387** YAML/Markdown profile cohort from **356** excluded extensions, and records reason codes per invalid/excluded file. This is not full intended-schema validation. The existing graph export remains a whole-result materializer and its current export has no source/workspace revision qualification; graph coverage is not proven. These are open gates, not completion claims.

Validation: canonical-gate core tests **5/5**; `node --check` passes for the gate and OKF audit. Full gate returns nonzero by design on its current blockers. No apply, promotion, database, Neo4j, Qdrant, or cache writes were performed.

## 41. Registry and repository-scope coverage recheck (2026-10-27, read-only)

Live PostgreSQL read-only census: 61,718 packet rows; no repeated packet key across distinct source refs and no source ref with multiple packet keys. The legacy alias table has 3,294 rows, with no observed canonical key having multiple aliases and no alias key targeting multiple canonical keys. This supports—but does not establish as policy—the draft's one-to-one alias constraint. Registry-v1 tables remain absent.

The admitted Graphify execution has seven membership scopes: `repo:root` has 29,026 members; six nested scopes have 1,079 combined. Only `repo:root` is mapped by the selected contract to the existing `deeds-web-app` repository UUID. Therefore the current PacketKeyV2 admission plan is root-scope only; it does not establish all-repository or every-directory analysis coverage. Keep directory feature analysis proposal-only and require exact source membership plus repository UUID resolution for every included repository scope.

No DDL, packet/alias upsert, Graphify promotion, Neo4j write, or Qdrant write occurred. Details: `docs/reports/packet-identity-registry-upsert-pipeline-review-2026-10-27.md`.

## 43. Repository-wide Graphify coverage review (2026-10-27, read-only)

The architecture can cover all directories admitted by a sealed source-selection manifest, but current code/evidence does not prove that coverage. The Graphify execution has seven membership scopes: root 29,026 files and six nested scopes with 1,079 files combined; only root is currently mapped to the selected repository UUID. Existing batch helpers accept supplied rows rather than discovering and reconciling the full admitted inventory.

The live Neo4j census found 622,527 distinct nodes, 687,900 label memberships across 37 labels, and 450,349 relationships across 38 endpoint-class combinations. Diagnostics report 40,384 Packet nodes missing `packet_key` and 13,241 Feature nodes missing `feature_label`. This is aggregate census evidence, not a complete revision-qualified graph export. Latest census receipt: `.tmp/atlas/neo4j-graph-coverage-v2/2026-10-27T21-14-27.819Z-d1cd3a63-63ce-40b6-bd01-fbcbdc8d4ddc.json`. Latest verified canonical gate receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T21-19-58.607Z-439ace48-ef12-46f1-bcc6-009b47586834/canonical-gate-receipt-v2.json` (`sha256:b938c283a5df4c4944a8c94074fbc38c609e36085d786b977dcfa70fcafa8242`) passes receipt structure, checksum, evidence digest reread, and freshness checks, but reports `FAIL`: first mandatory blocker `PACKET_IDENTITY` (`GRAPHIFY_EXECUTION_NOT_CANONICAL`), graph coverage `PARTIAL`, projection admission `UNKNOWN`; `canonicalAuthority=false`, `writesPerformed=false`. Legacy export validation also fails because coverage evidence is missing; 271 retained edges have valid references, but that subset cannot establish graph completeness. OKF accounts for 743 files, with 387 invalid under the current profile and 356 explicitly excluded; profile selection requires review, not bulk source edits.

Refresh: a new complete read-only gate run at `.tmp/atlas/canonical-gate-runs/2026-10-27T21-25-06.767Z-10c46b56-c00a-418b-986d-fb37f56aa98c/canonical-gate-receipt-v2.json` has checksum `sha256:19700bb86ad81a2d66d8b00062c01b62f58f9aa4db1bf7ef1f45886f3e4a297b`. It preserves the same `FAIL` boundary: `GRAPHIFY_EXECUTION_NOT_CANONICAL`, 387 invalid/356 excluded OKF files, graph census without a complete export or thresholds, and projection admission `UNKNOWN`. `canonicalAuthority=false`, `writesPerformed=false`. Receipt verification passed; the graph integrity validator failed because coverage evidence is missing. The newly edited exporter was syntax-checked only and is not covered by this gate’s stale export artifact.

The same run produced a fresh live graph census `.tmp/atlas/canonical-gate-runs/2026-10-27T21-25-06.767Z-10c46b56-c00a-418b-986d-fb37f56aa98c/graph-coverage.json` (`receiptSha256`: `sha256:2e1cde55ea510714cf6d5951791f702df4ce19fa142d4e2f506ea3b64d7c282e`): 622,527 nodes, 687,900 label memberships, 450,349 relationships, 37 labels, and 38 endpoint-class combinations; 40,384 Packet nodes lack `packet_key`, 40,755 lack `source_ref`, 13,241 Feature nodes lack `feature_label`, two nodes are unlabeled, and zero relationships have an unlabeled endpoint. All 69,009 CodebaseFile nodes have no source or workspace revision; only 370/59,692 Packet nodes have source_revision and zero have workspace_revision. Census status remains `CENSUS_ONLY_NOT_EXPORTED`; authority is not established and no writes occurred.

Review checklist: `docs/reports/repository-wide-coverage-review-checklist-2026-10-27.md`. All questions remain open, including nested repository mapping, parser applicability, OKF profiles, graph coverage thresholds, and alias cardinality policy. No DDL, packet upsert, Graphify promotion, Neo4j mutation, or Qdrant indexing occurred.

## 41. Registry V2 convergence and 50-packet source grounding (2026-10-27)

**Final status:** `SCHEMA_DRAFT_REVIEW_READY` (one open decision, below) · `SOURCE_TEXT_VERIFIED` 4 of 50 · `IDENTITY_UNRESOLVED` 50 of 50 · `GRAPHRAG_BYOG_BLOCKED`. Not claimed: `CANONICAL_PACKET_ADMITTED`, `SAFE_TO_PROJECT`.

**A. Registry contract**
- Live PostgreSQL has neither `atlas_packet_identity_registry_v1` nor `atlas_packet_identity_aliases_v1`; the older `atlas_packet_identity_aliases` (6 columns, no storage-locator column) exists and is never used as a fallback.
- Draft SQL vs Drizzle: all columns match; Drizzle now has the `repository_id` foreign key (read-side mirror of the live `atlas_repository_identity`, marked do-not-generate) and the same constraint names. Added `UNIQUE (canonical_packet_key)` to the alias table so reverse mappings are unambiguous (schema-owner decision). Receipt: `.tmp/atlas/registry-v1-schema-comparison-20261027.json`.
- Resolver: a missing registry table now raises `REGISTRY_DDL_NOT_APPLIED` (SQLSTATE 42P01 limited to the two registry-v1 relations, another session tightened this) instead of crashing.
- New writer contract `packet-identity-registry-writer-v1.ts`: pure insert-or-verify decisions, no SQL, no overwrite; 16 tests (unknown repository, wrong root mapping, recipe mismatch, duplicate canonical key, source/kind conflict, stale revision, locator ownership, second locator, cross-repository alias, idempotent replay).
- Specs: 50 of 50 pass across the five identity files (writer 16, DDL guard 4, registry 9, key 12, resolution 9).

**Constraint evidence (disposable `postgres:18` container, unmodified draft DDL, stub FK targets; live database untouched):** 18 probes, including two real two-process races (identity and alias): exactly one writer wins each. Unique, check and foreign-key rejections behave as drafted.
- **Open decision, found by the probe:** the draft's `root_repository_check` now constrains only `membership_repository_scope = 'repo:root'` (edited concurrently at 13:58 in both SQL and Drizzle). A known **non-root repository UUID is accepted by the database**. Root-only is currently enforced by the writer contract and resolver, not by SQL. Decide whether to restore `repository_id = '01a13137-…'` in the CHECK.
- The database does not recompute PacketKeyV2; derivation is enforced by the writer contract.

**B. 50-packet census** (`.tmp/atlas/graphrag-source-grounding-census-20261027.json`, producer script alongside): packet registry ABSENT, so every packet is a historical identity observation.

| Result | Count |
|---|---|
| Source text verified (digest and length equal the admitted `c63620c4` binding) | 4 |
| On disk, not in the admitted snapshot (`NOT_IN_ADMITTED_SNAPSHOT`) | 26 |
| Not on disk (`SOURCE_FILE_MISSING`) | 20 |
| Revision mismatches | 0 |
| Span or chunk locator present | 0 |
| Packet to Feature links | 50, all `PROPOSAL_ONLY` |

Caveat on the 4: no retained snapshot object exists to cross-check, so qualification rests on worktree bytes whose SHA-256 and length equal the binding. Git-object corroboration is mixed: 2 blobs equal the recorded digest; `run-migration.mjs` equals it only after line-ending normalisation; `queries.md` does not match (off by one byte).

**C. GraphRAG BYOG contract:** `text-unit-candidate-v1.ts` (+ spec, 8 of 8). `text_units` columns per the official Outputs page are `text`, `n_tokens`, `document_id`, `entity_ids`, `relationship_ids`, `covariate_ids`. The adapter reports `n_tokens`, `entity_ids` and `relationship_ids` as `byogMissingFields` and never fills them. Relationship `source`/`target` in BYOG are entity titles, not ids, so the fixture's relationships need title mapping before any Parquet.

**Migration risk and rollback (not applied):** additive only (two `CREATE TABLE IF NOT EXISTS`, no existing table altered, no seed rows). Risks: `ON DELETE RESTRICT` foreign keys to `atlas_packets`; the new reverse-unique rule will reject a legitimate second legacy row for one source file and force the duplicate to be resolved first. Rollback while empty: drop the two new tables (aliases first). After rows exist, archive the rows with a checksum before any drop.

**Not run this turn:** strict OpenSpec validation (CLI unavailable earlier), repository-analysis batch envelope tests, package build. Project-wide `tsc` filtered to the touched files printed no matches; completion of `tsc` itself was not independently confirmed.

**Safe next commands:** `node scripts/validate/canonical-gate.mjs`; `npx vitest run src/lib/server/atlas/identity src/lib/server/atlas/graphrag` from `sveltekit-frontend`.

## 42. Repository-wide canonical coverage, read-only (2026-10-27)

**Status: `REPOSITORY_WIDE_COVERAGE_READ_ONLY_VERIFIED` for the directory census only. `safeToProject: false`.** Receipt: `.tmp/atlas/repository-wide-coverage-receipt-v1-20261027.json` (`receiptSha256` `2b0272b9…`; producer `scripts/validate/repository-wide-coverage-v1.mjs`, pure accounting in `repository-wide-coverage-core.mjs`, 10 of 10 negative tests; the neo4j-graph-coverage-v2 tests pass 2 of 2 and the gate core tests 5 of 5).

| Reconciliation | Value |
|---|---|
| Admitted execution membership rows (`01a1763a…`) | 30,105 = manifest `sourceCount`; directory total and scope total both 30,105 |
| Snapshot candidates | 30,327 = 30,105 admitted + 222 hygiene exclusions (backup/archive 175, generated 29, build output 10, worktree duplicate 8) |
| Directories / scopes | 3,954 / 7 |
| Duplicate paths, case-fold collisions, unsafe paths, symlinks | 0, 0, 0, 0 |

| Scope | Selected | Bound to `c63620c4` | Legacy packet observed | Revision-qualified | Registry-qualified |
|---|---|---|---|---|---|
| `repo:root` | 29,026 | 24,253 | 16,486 | 29,026 | 0 (registry absent) |
| `repo:claude-mem` | 761 | 0 | 757 | 761 | 0 |
| `repo:turbovec` | 86 | 0 | 86 | 86 | 0 |
| `repo:mcp-server-mcp` | 188 | 0 | 0 | 188 | 0 |
| `repo:models/embeddinggemma_300m` | 13 | 0 | 0 | 13 | 0 |
| `repo:sites/parent-atlas-gateboard` | 21 | 0 | 0 | 21 | 0 |
| `repo:granite-docling-258M` | 10 | 0 | 10 | 10 | 0 |

Parser routing (extension proposal; reconcile with `helper-registry-v1.ts`): 13 families cover 29,973 files; 132 files have no applicable parser and are recorded, not omitted (`.proto` 100, `.toml` 18, `.c` 12, `.java` 1, `.psm1` 1). One root file is missing from disk.

**Verdicts, kept separate:** `CURRENT_SNAPSHOT_PROVEN` (tournament admission) · `EXECUTION_COMPLETED` true · `REGISTRY_DDL_NOT_APPLIED` true · `GRAPH_COVERAGE_INCOMPLETE` (delegated; no complete revision-qualified export) · `CANONICAL_AUTHORITY_NOT_GRANTED` true. Latest gate V2 run: overall FAIL, first blocking predicate `packet-identity` (`GRAPHIFY_EXECUTION_NOT_CANONICAL`).

**Not done:** the six nested scopes have no persisted repository mapping (not reused from the root UUID); OKF reconciliation of the 743-file cohort (387 invalid, 356 excluded) was not recomputed here; the Neo4j export still lacks a complete revision-qualified read with edge coverage computed before filtering; the receipt is not yet registered as a Canonical Gate V2 check (that gate was rewritten concurrently, so it was left alone); strict OpenSpec validation and package builds were not run; the task ledger `atlas-directory-first-analysis-v1/tasks.md` was not edited because it is untracked and concurrently modified.

**Tooling note:** a boolean concatenated in SQL renders as `false`, not `f`; my first run inverted `CANONICAL_AUTHORITY_NOT_GRANTED` for that reason and was corrected before the final receipt.

## 43. Canonical Gate V2: repository coverage check registered (2026-10-27)

`REPOSITORY_COVERAGE` is now a Gate V2 category with the `repository-coverage` check (`scripts/validate/repository-wide-coverage-v1.mjs`, per-run immutable receipt). It fails if the census does not reconcile, if any integrity violation exists, or if the producer ever implies projection permission; while any blocker remains it is at most `PARTIAL`. Full run `2026-10-27T21-22-26Z`: overall `FAIL` (PASS 2, BLOCKED 2, FAIL 2, PARTIAL 2, UNKNOWN 1). Handoff, open tasks 6.1 to 6.8 and gotchas: `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` section 6.

## 44. Neo4j export streamed read-only follow-up (2026-10-27)

**Census for review:** 622,527 unique nodes; 687,900 label memberships over 37 labels; 450,349 relationships across 38 endpoint-class combinations. Identity diagnostics: 40,384 Packet nodes without `packet_key`, 40,755 without `source_ref`, 13,241 Feature nodes without `feature_label`, and two unlabeled nodes. Revision diagnostics: 0/69,009 CodebaseFile nodes have source/workspace revisions; 370/59,692 Packet nodes have a source revision and 0 have a workspace revision. These are census counts, not export or admission proof.

The Neo4j exporter now streams keyset pages to disk-backed node/edge arrays and assembles a unique output without collecting the exported graph payload in memory. The read-only run considered 59,692 Packet, 13,290 Feature and 19,698 Concept records; exported 19,113 Packet and 13,290 Feature nodes; and kept 271 of 224,491 rows across the two relationship types queried (all `SIMILAR_TOPOLOGY`). Concept nodes were excluded because `name` has not been established as a stable canonical endpoint identity. SOMCell and its two relationship families returned zero rows. Coverage receipt: `.tmp/atlas/neo4j-graph-export-v2/2026-10-27T21-34-17-667Z-0a58239e-9f58-459e-971d-8430863df4fd/coverage-receipt-2026-10-27T21-34-17-667Z-0a58239e-9f58-459e-971d-8430863df4fd.json`; streamed export `.tmp/atlas/graph-export-2026-10-27T21-34-44-292Z-d3cc1f5c-34c6-4b08-b1d4-a2bad42d190f.json`; validator `.tmp/atlas/neo4j-graph-export-v2/validation-2026-10-27T21-34-44-292Z.json` returns `FAIL`, as intended: only 50/19,113 Packets have complete identity, 49/13,290 Features have labels, and revision/snapshot/execution/coverage-threshold evidence is absent. Overall graph coverage and canonical lineage remain unproven. Focused helper/coverage tests pass 8/8 and exporter syntax check passes. No canonical or datastore writes occurred.

## 45. OKF profile reconciliation refresh (2026-10-27, read-only)

The 743-file inventory is now freshly audited and fully accounted for, but intended schema/profile validity is **not proven**; this supersedes earlier wording that called the broad v0.2 reconciliation verified. Receipt `.tmp/atlas/okf-profile-reconciliation-live-20261027T2140.json` reports `OKF_PROFILE_RECONCILIATION_INCOMPLETE`, deterministic receipt SHA-256 `3af875fe94d8530bcb31c5ddb98d64a6d2d56743c9496feff4eb726b875144ff`, inventory SHA-256 `e2d95a26f20c20f7b3219376ac6d9e095e8e357de1513afc81aa916cde22b981`; a second execution reproduced both digests. Per-file entries carry source digest/length, profile, audit status and exact reason codes.

2026-10-27 per-file owner-evidence refresh supersedes the receipt path/checksum above: `.tmp/atlas/okf-profile-reconciliation-live-20261027T2210.json` (`sha256:c43c05f40f3bd422f562084f862b709e5637584e7252d3cfc6978a625cff1fde`). The 743-file/inventory digest remains unchanged. Receipt links current source digests to owner receipts and self-validates schema documents: 32 current source/schema passes, 10 schema-document self-validation passes, 3 rejections under the current domain profile, and 698 files with no matching owner validation. The three rejections indicate profile mismatch, not intrinsic invalidity. Status remains `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; first blocker `OKF_V02_PROFILE_APPLICABILITY_NOT_ESTABLISHED` (674 snapshot documents outside confirmed profile), and all missing-owner-validation files need intended profiles assigned. No `.okf` or canonical data writes occurred. Details: `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §6.11.

Latest refresh supersedes that interpretation. `.tmp/atlas/okf-profile-reconciliation-live-20261027T2320.json` and replay `...T2330.json` have identical receipt checksum `sha256:d97b47ffa1e8ad8fd5a2c3f1f1b38d8f751790e20eb17c02790ce046fe117343` and inventory digest `sha256:e2d95a26f20c20f7b3219376ac6d9e095e8e357de1513afc81aa916cde22b981`. The full 743 entries reconcile: 674 DSpy snapshot artifacts/control files have per-file manifest, source, and Git-blob evidence; 664 artifact bytes match recorded Git-blob hashes after identifying Windows CRLF worktree transformation, and all snapshot controls are verified. No unreferenced snapshot artifacts remain. Outside snapshots, 32 current source/schema validations and 10 schema self-validations pass; 24 files lack matching owner validation and three domain documents use an unregistered profile (the broad taxonomy schema is not applicable). Status remains `OKF_PROFILE_RECONCILIATION_INCOMPLETE`, first blocker `OKF_DOMAIN_PROFILE_NOT_REGISTERED`; task 6.5 remains open. Latest complete gate `.tmp/atlas/canonical-gate-runs/2026-10-27T21-43-37.313Z-a99e4eb1-d783-4a73-acbe-6c89b4d09eb5/canonical-gate-receipt-v2.json` (`sha256:f7e9b98bb5f51ff5c1f4cc502b6c28ab0fcd749a2ff37b2a98281f2e3a772726`) remains `FAIL`, with packet/execution authority blocked, graph integrity/ontology failing, graph/repository coverage partial, projection admission unknown. No canonical or projection writes occurred. See OpenSpec §6.12.

Counts reconcile: 387 invalid = 331 snapshot Markdown without front matter + 55 records missing v0.2 fields + 1 Markdown without front matter; 356 excluded = 343 non-Markdown snapshot files + 11 schema/catalog JSON + 2 other corpus JSON. All 55 field-missing records lack `trust` and `lifecycle`; 54 also lack `provenance`. The profile is `atlas-okf-v02-validation-profile-v1`, YAML parser `yaml@2.9.0`. The 674 snapshot files (331+343) are external crawled documents, not confirmed OKF records; their intended profile is unresolved. Zero files are unclassified, but no claim is made that the 743 files all passed their intended validators. First blocker: `OKF_V02_PROFILE_APPLICABILITY_NOT_ESTABLISHED`. Focused cause tests pass 4/4. No `.okf` source changes or canonical writes occurred. The owning OpenSpec details are in `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §6.10.

2026-10-27 latest task 6.5 receipt supersedes the paths and blocker above: `.tmp/atlas/okf-profile-reconciliation-6-5-20261027T145345.json` (`sha256:4631b8aea9f8cce93a45cb7721b95f70f98c2182af57adf0f5ef6609dbd5232e`). All 743 entries reconcile, but profile binding is incomplete: 674 snapshot-integrity-only, 32 intended-profile validations, 10 schema-document self-validations, 24 with no registered owner validator, and 3 rejected by a taxonomy schema that does not match their document profile. Outcome remains `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; first blocker `OKF_INTENDED_PROFILE_BINDING_OR_VALIDATION_INCOMPLETE`. No `.okf` edits or canonical data writes. See OpenSpec §6.13. The 622,527-node / 450,349-relationship Neo4j census cited in the handoff is user-reported and not validated by this OKF receipt.

Latest refresh: existing WSL owner validation now covers `.okf/predicates/feature-relationships.yaml` against `.okf/schemas/feature-relationships-v1.schema.json` (`VALID`, current document/schema digests, no writes). Receipt `.tmp/atlas/okf-profile-reconciliation-6-5-20261027T145548.json` (`sha256:098276474e3c756907c1763ec2c637833d40d2e32bfa59ac9fde05bb423aa62f`) preserves the 743-file inventory digest and reduces missing owner receipts to 23; profile counts are 33 intended validations, 10 schema self-validations, 23 unregistered owners, 3 schema-review rejections, 674 snapshot-integrity-only. Still `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; see OpenSpec §6.14. No `.okf` or canonical data writes.

## 46. OKF manifest-binding reconciliation (2026-10-27, read-only)

Fresh task 6.5 audit/reconciliation: `.tmp/atlas/okf-v02-audit-6-5-20261027T150002.json` and `.tmp/atlas/okf-profile-reconciliation-6-5-20261027T150120.json` (`sha256:2c80931530915b8baf01c0c9b456299e6f8bcf0d8914e7f0dde59767d7bb5990`; inventory `sha256:e2d95a26f20c20f7b3219376ac6d9e095e8e357de1513afc81aa916cde22b981`). It reproduces 743 total = 387 broad-profile rejects + 356 exclusions, zero unclassified. Added a per-file binding distinction against `.okf/manifest.yaml`: 11 entries have a declared schema but no current owner receipt, 33 are manifest-listed without an applicable schema binding, 12 are unlisted under a registry path, and 687 have no registry binding (including snapshot/control artifacts). This does not invent intended profiles. The owner evidence remains 33 intended validations, 10 schema self-validations, 674 snapshot-integrity-only, 23 missing owner validations and 3 wrong-profile schema rejections. Status remains `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; exact first blocker `OKF_INTENDED_PROFILE_BINDING_OR_VALIDATION_INCOMPLETE`. Focused tests pass 5/5; no `.okf` or canonical data writes. Details in `openspec/changes/atlas-directory-first-analysis-v1/tasks.md` §6.17.

## 47. Graph semantic/GPU reconciliation baseline (2026-10-27, read-only)

Fresh Neo4j census `.tmp/atlas/neo4j-graph-coverage-v2/graph-semantic-gpu-20261027T1500.json` (`sha256:dd7ef338c712ac3ffe93ecfc291fa6f284ac35f941b8bbdb9c817c60927e7e19`) records 622,527 nodes, 687,900 label memberships/37 labels, and 450,349 relationships/38 endpoint-class combinations. Identity/revision gaps are in task 6.18; database identity and READ transaction boundary are recorded, with no snapshot-consistency claim under concurrent writers.

Latest full canonical gate `.tmp/atlas/canonical-gate-runs/2026-10-27T22-01-01.640Z-4d340579-6fa0-4e8c-a602-005a3fb80bf2/canonical-gate-receipt-v2.json` (`sha256:63dabaa0ea3358ec56aa7f0ecf6af80cd27dcc6d7eae83a037e07d9116247dca`) is checksum-valid and `FAIL`, authority/writes false. First mandatory blocker: `PACKET_IDENTITY/BLOCKED` because Graphify execution is not canonical. Graph integrity fails on the legacy partial export (50/19,308 packets fully identified; 49/13,290 features labeled; no SOM cells; missing export coverage receipt); graph coverage is census-only and thresholds are undefined; ontology schema fails; repository coverage is partial; projection admission is unknown. No GPU semantic/K-means/SOM experiment, enrichment write, or datastore mutation was run. Task 6.5 remains open per §46 and OpenSpec §6.17–6.18.

## 48. Canonical gate now validates its fresh graph export (2026-10-27)


## 49. Registry V1 persisted scope mapping (2026-10-27, draft-only)

Added supplemental PostgreSQL/Drizzle draft `sveltekit-frontend/drizzle/manual/20261027_atlas_graphify_scope_repository_map_v1_DRAFT.sql` with scope, repository UUID, source-authority identity, mapping kind, and evidence digest. The resolver no longer contains a hardcoded root UUID and requires exact persisted scope mapping. A disposable PostgreSQL 18 rehearsal accepts the correct root mapping and rejects nested-UUID-as-root plus mismatched registry scope/UUID; focused resolver/adapter tests pass 13/13. No production DDL or mappings were applied. Six nested scopes remain unresolved; schema-owner review and Graphify authority remain blockers. LangExtract/Python NLP note: existing middleware emits source-grounded classification/fact proposals; use it for bounded entity/concept extraction with evidence spans, not as an identity authority or an ungrounded summarizer. See OpenSpec task ledger scope-map rehearsal entry.

## 50. Canonical gate V2 fresh read-only run (2026-10-27)

Receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T22-17-06.283Z-a1e25afb-3193-4a5f-9e59-3a1b7d753115/canonical-gate-receipt-v2.json` verifies (`sha256:33c50db3a910932c3ad1cb6a5c2a2bb1c8b207c49c6bd4f1e3784df98e059fb5`), overall `FAIL`, authority/writes false. First blocker is packet identity: `GRAPHIFY_EXECUTION_NOT_CANONICAL`. Service health and source snapshot pass; graph integrity and ontology schema fail; graph/repository coverage are partial; projection admission is unknown. The gate uses a fresh graph export, not the fixed legacy file. Focused tests pass 18/18 and strict OpenSpec validation passes. `npm run check` reports one TypeScript diagnostic at `multiruntime-worker-receipt-v1.ts:153`; no change made there. LangExtract/Python is a bounded evidence-grounded proposal middleware, not an ungrounded summarizer or canonical identity/classification writer. See OpenSpec §6.M6 for artifact digests, rejection reasons, and boundaries. No production writes occurred.

## 51. Neo4j export read-consistency guard and gate rerun (2026-10-27)

Coverage validation now rejects a nominally complete export without explicit proven read consistency. The exporter declares its shared read transaction but marks stable cross-page snapshot consistency `NOT_PROVEN`, so the live export cannot claim complete coverage. Fresh gate receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T22-20-50.900Z-cf9ccd00-ae97-4341-9309-13ae349f9cc2/canonical-gate-receipt-v2.json` verifies (`sha256:9c90726ce4ceb5c3d9ad6c916ec540d393f645b2f56dd0a03ebd22b6bd36a90a`), overall `FAIL`, first blocker `GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph integrity now explicitly includes `READ_CONSISTENCY_NOT_PROVEN`. Tests pass 19/19; receipt/evidence integrity, strict OpenSpec and scoped diff checks pass. Full graph coverage, revisions, thresholds, and canonical authority remain open; no data writes occurred. See OpenSpec §6.M7.

## 52. Fresh Neo4j identity and revision census (2026-10-27)

Read-only census `.tmp/atlas/neo4j-graph-coverage-v2/2026-10-27T22-23-19.239Z-f34a5a98-ade6-4682-bbc3-82e79e6d6b39.json` verifies (`sha256:d933312c272237e904f5838f8e7007ad91bd2dd58c3e28bff104a0e444231f21`; file SHA-256 `4ba8099b68e21a588c0a2dce890e451b79c2b67b7d5f285157ec47c6e8d7968a`). It reproduces 622,527 nodes, 687,900 label memberships, 450,349 relationships; 40,384 Packets lack keys, 40,755 lack source refs, 13,241 Features lack labels, and 2 nodes are unlabeled. CodebaseFile has 0/69,009 source/workspace revisions; Packet has 370/59,692 source revisions and 0 workspace revisions; Feature has 0/13,290 of either. Counts indicate presence only; stale/source revision matching remains unevaluated. Database identity and concurrent-writer consistency limits are in the receipt. Status is census-only, with no data writes. See OpenSpec §6.M8.

## 53. Canonical gate refresh after graph revision census (2026-10-27)

Fresh full read-only gate receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T22-23-44.799Z-7f264668-6d66-47f8-a83b-0452e3d133e7/canonical-gate-receipt-v2.json` verifies (`sha256:12efd1c9a8ed14a498edcc7076b5715faa8bb5378f52de2e47fdb912c9628825`; file SHA-256 `11683b86f4f784fa37c917405a41893496cdd91a307bb5957c16e5508a214e65`), overall `FAIL`. First blocker is `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph integrity and ontology fail, graph/repository coverage are partial, and projection admission is unknown. Focused tests pass 20/20; the graph identity/revision census remains diagnostic only. No production writes occurred. See OpenSpec §6.M9.

## 54. OpenSpec review guardrails and registry scope planner follow-up (2026-10-27)

Updated `codex.md` with canonical-dimension and human-review rules: active retrieval remains `semantic_768`/EmbeddingGemma 768-d; 4,096-d hidden states are experimental, and `domain_class` and `feature_label` are distinct labels. Synthetic/model reviewers cannot supply gold labels; preserve reviewer/evidence provenance, abstentions, and per-class evaluation limits.

The Registry V1 planner now distinguishes Graphify membership scope text from canonical repository UUID, validates the persisted scope-map/repository authority, and blocks existing V2 rows with a conflicting repository UUID. Planner TypeScript check passed; resolver/adaptor tests passed 13/13. Four pure scope-map contract tests now pass; SQL/map behavior still requires disposable PostgreSQL 18 rehearsal, and the planner itself was not run.

Fresh read-only gate: `.tmp/atlas/canonical-gate-runs/2026-10-27T22-29-04.621Z-8a3d9b2f-7446-4acf-9673-67a8389f9884/canonical-gate-receipt-v2.json` (file SHA-256 `4c4f4e3ddcbeac1570337ba203fac54ee7205961a25cbaeb6fffe637755d1e11`), `FAIL`, exit 1; first blocker `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph/ontology fail, graph/repository coverage partial, projection admission unknown. `canonicalAuthority=false`; `writesPerformed=false`. Production DDL and data writes remain unauthorized.

## 55. Registry planner structure guard and canonical gate refresh (2026-10-27)

Planner contract detection now requires the persisted scope-map PK/FK/check constraints, its repository-authority trigger, and the registry composite scope-to-UUID FK. Focused tests pass 12/12; the planner TypeScript check passes. Planner-level integration tests and disposable PostgreSQL 18 rehearsal remain open.

Fresh full read-only gate: `.tmp/atlas/canonical-gate-runs/2026-10-27T22-34-00.631Z-3a6b0116-9718-48f2-8f94-94a739cc5d67/canonical-gate-receipt-v2.json`, embedded checksum `sha256:38a21e6772e78c5eb9a2ab22e700eae168ed525b7cf47705bfc67bbed2ab45c9`, file SHA-256 `18137eda379eb8d0b9b7d0f8ca29bec88e79b0d5101c9319f7ae8edb7ea90fdc`. Exit 1, overall `FAIL`, first blocker `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph integrity/ontology fail, graph/repository coverage partial, projection admission unknown. `canonicalAuthority=false`; `writesPerformed=false`.

## 56. Human-review guard and LangExtract boundary (2026-10-27)

The classifier evaluator now requires a non-test human reviewer and timezone-qualified review timestamp for each gold row. It rejects synthetic/model/agent reviewer markers, reports unverified labeled rows, and requires a distinct second reviewer with its own timestamp on at least 10% of gold rows before `SCORED`. `python -m unittest test_atlas_domain_classifier_eval_v1 -v` from `python/` passes 14/14. `node --test` for scope admission, scope mapping, and packet admission passes 16/16. The broad owning `tsconfig.scripts.json` check fails with many repository-wide diagnostics, so planner type validation remains open. Reviewer strings are not authentication proof.

Fresh read-only gate `.tmp/atlas/canonical-gate-runs/2026-10-27T22-38-23.374Z-9ed2c353-26c8-402f-bf9b-3e617dad5c80/canonical-gate-receipt-v2.json` has embedded checksum `sha256:f53f367bea3c26ef197533ad7f7ee6193282a12d6b7a1521e8c595e945eb3897` and file SHA-256 `5c58be26e14ed45d46afd875524d28f95ecef869d455958f2d048c53e46d24d2`; exit 1, `FAIL`. First blocker: `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`. Graph integrity and ontology fail; graph/repository coverage are partial; projection admission is unknown. `canonicalAuthority=false`, `writesPerformed=false`.

LangExtract and `:8095` Python NLP middleware remain proposal/evidence executors: summaries must retain source digest, exact spans, extractor/model revision, and evidence references; they cannot supply human labels, canonical identity, or relations. Canonical retrieval remains `semantic_768`/EmbeddingGemma 768-d; 4,096-d hidden states are experimental. No candidates were labeled and no persistent data or projection writes occurred.

## 57. Repository-analysis proof checklist and human-label boundary (2026-10-27)

Added `docs/reports/parent-atlas-repository-analysis-proof-checklist-2026-10-27.md` and `.txt`. Current full gate receipt is `FAIL`; its 2/9 passing predicates describe only that run and are not a portfolio completion score. The first blocker is `GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph integrity/ontology fail, coverage is partial, and projection admission is unknown. The OKF census accounts for 743 files but remains incomplete because intended profile applicability is unresolved. No human labels were created. LangExtract/`:8095` remain proposal-only, and `semantic_768`/EmbeddingGemma 768-d remains canonical; 4,096-d hidden states are experimental. Evaluator tests pass 14/14; scope/registry tests pass 16/16; strict OpenSpec validation passes. Broad scripts typecheck has repository-wide diagnostics. No canonical or persistent data writes occurred.

## 58. Fresh OKF profile-owner reconciliation receipt (2026-10-27)

Fresh pair: `.tmp/atlas/okf-v02-audit-goal-20261027T154801973.json` and `.tmp/atlas/okf-profile-reconciliation-goal-20261027T154801973.json`. Reproduced 743 files, 387 broad-profile rejects, 356 exclusions, zero unclassified, inventory digest `sha256:e2d95a26f20c20f7b3219376ac6d9e095e8e357de1513afc81aa916cde22b981`. Receipt file SHA-256 `c5df7c89b4b113fd92fcecf5b4f0a0c0b8527ecfa4b3394a590b18022d51939a`; embedded checksum `sha256:7d2b0e1b6a5ad6c65528cb4474df8e91fe7caec9e4c502786b1fb80d72d97755`. Classification: 674 snapshot-integrity-only, 33 current profile validations, 10 schema self-validations, 23 missing owner validations, and three domain documents rejected by their currently bound schema. Status remains incomplete; no source or canonical data writes.

## 59. Current Canonical Gate V2 read-only verification (2026-10-27)

Fresh full receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T22-48-48.094Z-4c20e80d-2507-46ee-87bc-1a13a4c25eda/canonical-gate-receipt-v2.json` verifies along with all evidence (file SHA-256 `d625cabbed380b0c256a25b487203561649bbe1822cacc906923cf9b285cafb`; embedded checksum `sha256:0b5a04c8ef17fa321fed527de937538ac42493b80af39947d151fa50dec72215`). Outcome `FAIL`; 2/9 predicates pass for this run only, not a project-completion percentage. First blocker `GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph/ontology fail, coverage partial, projection admission unknown. Authority/writes false. Focused owner tests pass 26/26; no persistent writes.

## 60. OKF syntax observations, not schema promotion (2026-10-27)

Extended the existing reconciliation owner to report syntax separately. Receipt `.tmp/atlas/okf-profile-reconciliation-syntax-20261027T155158462.json` (file SHA-256 `60e7811f194c5965defd4e25fa7ceb88342507725c1637ec5995879a518694d5`; embedded `sha256:606d29ace13f999ea11db31dcf03f9e95147683d9f3f412138856888d5b0c461`) accounts for 743 files. Syntax probes: 14 Markdown frontmatter, 41 YAML, 19 JSON, 332 plain Markdown without asserted profile, 337 not applicable; zero parse failures. This does not prove intended schema validity. Reconciliation tests pass 9/9, including syntax-success-not-readiness; OKF readiness remains incomplete. No source or canonical data writes.

## 61. OKF declared-profile identity and applied-audit separation (2026-10-27)

The reconciler now records the broad v0.2 profile as `auditProfileApplied`, separately captures parsed document declarations, and leaves intended-profile applicability `UNVERIFIED` without owner evidence. Fresh receipt `.tmp/atlas/okf-profile-reconciliation-declarations-20261027T155526247.json` (file SHA-256 `sha256:045d63f88967199f6a9c33161fc145a0485ceb7fc8404b081a507a1d6cdd298d`; embedded checksum `sha256:ddd4280c66981f0cc89f316b81561e72f7637463d172f50c502d7633483812ea`) reconciles 743 files: 674 snapshot-integrity-only, 33 intended-profile validated, 10 schema-document self-validated, 23 owner validations missing, and 3 currently bound schema rejections pending owner review. Status remains `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; first blocker `OKF_INTENDED_PROFILE_REJECTED_REQUIRES_OWNER_REVIEW`. Reconciliation tests pass 10/10 and both modules pass `node --check`. No `.okf` content or canonical data was written.

Fresh full read-only gate: `.tmp/atlas/canonical-gate-runs/2026-10-27T22-59-12.266Z-f596edf9-790b-45a4-abc8-35f22cb9d37a/canonical-gate-receipt-v2.json` (file SHA-256 `sha256:0c1a60510ffed3acd17c02e07003d67a38c60d22217e038b87c6f8245c42e238`; embedded `sha256:d212aec1ef710f3053955b814304bd0b5f0c189a485fa436eb97addf3df562c4`) remains `FAIL`. Packet identity is the first admission blocker (`GRAPHIFY_EXECUTION_NOT_CANONICAL`); graph integrity/ontology fail, coverage is partial, and projection admission is unknown. Gate receipt confirms `canonicalAuthority=false` and `writesPerformed=false`.

## 62. Existing index contract validators added to OKF owner evidence (2026-10-27)

Added `.tmp/atlas`-only output to two existing Zod contract validators, recording exact source and validator-script SHA-256 values. Both checks pass their local contracts but do not prove runtime admission. Fresh reconciliation `.tmp/atlas/okf-profile-reconciliation-followup-20261027T1635.json` (file SHA-256 `sha256:0190b2a30fbe97415a05b8be7362911df7a8eb97339be671f2251ca2cab13ecd`; embedded `sha256:ce0ac53a1cb625c40df52536229d7e076311f1704b2da601950f8e320cdb00a3`) still accounts for 743 files and remains incomplete: 35 intended-profile validations, 10 schema self-validations, 674 snapshot-only, 21 owner validations missing, and 3 rejections pending owner review. First blocker remains `OKF_INTENDED_PROFILE_REJECTED_REQUIRES_OWNER_REVIEW`. Focused tests pass 10/10; no `.okf` source or canonical data writes.

## 63. Per-document OKF domain schema binding and refreshed gate (2026-10-27)

Narrowed `.okf/manifest.yaml` so `domain-taxonomy-v1.schema.json` applies only to `atlas-domain-taxonomy.yaml`. The reconciler supports per-member `schema_files`, and the manifest auditor rejects mappings to undeclared members. Three old domain-schema mismatch receipts remain preserved as superseded diagnostics: their source digests match current files, but the taxonomy schema was not their intended profile. Fresh audit `.tmp/atlas/okf-profile-binding-audit-final-20261027T161324.json` has file SHA-256 `sha256:11eb3cc8f9671354fe287c1e60d8ea6804fea81ec2ffd64f2226d34f8109eaa2`; reconciliation `.tmp/atlas/okf-profile-binding-reconciliation-final-20261027T161324.json` has file SHA-256 `sha256:6c04d1f552b596f7c01fb7437e70fbee491c57390cbc931a25c32da223a3a728`, embedded checksum `sha256:0b225a79dbcd7e3445e993cf643a25142295b79c870f64ca959c7190bb4f9df2`, inventory digest `sha256:bc5d7eac9b012eeb3cd331cc66f1692b3cb6cb8519624fdfc7a63ba0033b22a5`. All 743 files reconcile (387 broad-v0.2 rejects, 356 excluded, zero unclassified): 35 current schema validations, 10 schema-document self-validations, 674 snapshot-integrity-only, 24 missing owner validations. Status remains incomplete; first OKF blocker is `OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING`.

Focused verification: Python manifest auditor 7/7, JS reconciliation 10/10, manifest references 49/49 with no missing/unsafe entries. Full gate receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T23-13-59.697Z-7c615711-9069-4543-b2e7-1ac0b36da7f2/canonical-gate-receipt-v2.json` is `FAIL` (file SHA-256 `sha256:db65d5c250b4bef5e2bfa5e72bb1c078b38216b14c399de998868f5923f578b9`; embedded checksum `sha256:326bc7f54ba80c89bde93be4760a21765bfa829c870f64ca959c7190bb4f9df2`). First mandatory blocker remains noncanonical Graphify packet identity; graph integrity/ontology fail, coverage is partial, and projection admission is unknown. No persistent data, graph, cache, index, or promotion writes occurred.

Latest full gate refresh `.tmp/atlas/canonical-gate-runs/2026-10-27T23-05-28.567Z-fb3dfe9d-6be4-4195-8a4a-e23d589c51b5/canonical-gate-receipt-v2.json` (file SHA-256 `sha256:0069e35ac6c0e7dfad61aa5f58a2ca03b0fc019b870d5c21c70782c38c4d25a6`; embedded `sha256:fa0d4e939ef2ade17cc26cef7cd5b7fae0c420c761fcc655e7a87e65294fb989`) is still `FAIL`. First blocker `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`; only service and source-snapshot predicates pass. Graph integrity/ontology fail, graph/repository coverage is partial, and projection admission remains unknown. `canonicalAuthority=false`, `writesPerformed=false`.

## 64. OKF capability-index validation added to profile evidence (2026-10-27)

Reused `scripts/atlas/validate-code-capability-okf-contract-v1.mjs` to validate `.okf/indexes/code-capability-knowledge-v1.yaml` against its declared `docs/.okf/schema.yaml` profile. Fresh owner receipt `.tmp/atlas/okf-code-capability-index-validation-20261027-v2.json` reports `VALID`, with source/schema digests matching and no canonical writes. Corrected the reconciler's schema-path normalization so `docs/.okf/...` remains a docs path. Fresh reconciliation `.tmp/atlas/okf-profile-reconciliation-capability-v2-20261027T232510917Z.json` has file SHA-256 `sha256:b0697f75835c2c9452b849556f728a7e6f3bb6017dbd7435fbd18d3f738915e7` and embedded checksum `sha256:c69fc96c5e3ac30451a8c1553c7c2323a1fab0034e31e55fb1aa550a7cdd38f1`. The full inventory remains 743: 387 broad-v0.2 rejects, 356 excluded, zero unclassified; owner validations increase to 36, with 23 still missing. The 674 external snapshot documents remain outside the confirmed record-profile scope. Status is `OKF_PROFILE_RECONCILIATION_INCOMPLETE`; first blocker `OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING`. This does not establish that the broad-audit rejects are defects or complete OKF profile coverage. No source or canonical data writes occurred.

## 65. OKF evidence-path regression tested and receipt refreshed (2026-10-27)

Moved receipt-path normalization into the pure reconciliation core; tests cover absolute Windows/Unix paths, root `.okf` paths, `docs/.okf` schemas and ordinary docs paths. The focused suite passes 11/11 and the reconciler passes `node --check`. Fresh receipt `.tmp/atlas/okf-profile-reconciliation-pathfix-20261027T232717252Z.json` has file SHA-256 `sha256:b0697f75835c2c9452b849556f728a7e6f3bb6017dbd7435fbd18d3f738915e7` and embedded checksum `sha256:c69fc96c5e3ac30451a8c1553c7c2323a1fab0034e31e55fb1aa550a7cdd38f1`. It still accounts for 743 files (387 broad-profile rejects, 356 excluded, zero unclassified), 36 owner validations, 23 missing owner validations, and 674 snapshot documents outside the confirmed record profile. The result remains incomplete; no `.okf` source or canonical data writes occurred.

## 66. Full Canonical Gate V2 read-only refresh (2026-10-27)

Ran `node scripts/validate/canonical-gate.mjs`. Fresh receipt `.tmp/atlas/canonical-gate-runs/2026-10-27T23-28-03.429Z-e6fcb975-bd0d-4b1d-b4f0-04626d9c5a83/canonical-gate-receipt-v2.json` has file SHA-256 `sha256:c62ae60c45242f1b5cbf803142f25f25af49b38402015026880b26bda0678330` and embedded checksum `sha256:060d5ba80ef94a505773504b49baeb0dda86a526d4a9ad1d69701137cb97d44b`. Overall `FAIL`, `canonicalAuthority=false`, `writesPerformed=false`. Service health and source snapshot pass; first mandatory blocker is `GRAPHIFY_EXECUTION_NOT_CANONICAL`. Graph integrity fails, graph/repository coverage are partial, ontology-schema fails the broad v0.2 audit, and projection admission remains `UNKNOWN`. The profile-aware OKF owner-reconciliation result is not yet consumed by the gate. No production DDL, promotion, database, graph, index, or cache mutations occurred.
