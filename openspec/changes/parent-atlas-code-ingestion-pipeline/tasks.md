# Parent Atlas — Code Ingestion Pipeline (Chunking → Embedding → Rerank → Synthesis)

**Status**: Architecture frozen 2026-08-12. GPH-01 and GPH-07 through GPH-14 are proven; GPH-15 and GPH-16 have bounded production contracts and live dry-run evidence, while GPH-17C has read-only reachability evidence. GPH-17 through GPH-22 remain open for production adoption, persistence, acceptance, and supersession. The legacy extractor remains `MIGRATION_CANDIDATE`.

## Frozen architecture

```
SOURCE CODE
  → Tree-sitter (parser, structural truth) + chunker (chunk boundaries)
  → StructuralChunkV1 (chunk boundary, NOT identity)
  → GIS enrichment: parse_node_id, symbol_id, symbol_version_id, chunk_id, packet_key
  → semantic card compiler
      → EmbeddingGemma → semantic_768 (CANONICAL dense representation)
      → Jina embeddings-v2-base-code → jina_code_768 (EXPERIMENTAL second dense lane)
      → BM25 → lexical_bm25 (sparse)
  → AST graph facts
  → Qdrant (dense + sparse projection, same canonical chunk_id across all vector spaces)
  → canonical fusion (Parent Atlas RRF owner — NOT Qdrant's internal RRF, NOT a second fusion owner)
  → Mixedbread reranker (top-50 → top-10, fail-open: never turn nonempty input into empty output silently)
  → FeatureRow → ACE bounded packet
  → Ornith 9B (synthesis/enrichment ONLY — summarize, pattern-extract, explain, hypothesize; never scan the corpus directly)

DOCS / LOGS / RESEARCH (separate lane, same downstream machinery)
  → LangExtract (schema-grounded entity/relation extraction, rejects ungrounded char_interval-less extractions)
  → semantic card → EmbeddingGemma semantic_768 → sparse+dense retrieval → Mixedbread → Ornith
```

## Hard rules (do not violate)

- **EmbeddingGemma is the canonical `semantic_768` owner.** 768-dim native, Matryoshka-truncatable to 512/256/128, 2048-token input. Do not replace it; do not make MiniLM-384 or Jina a second canonical dense owner.
- **Jina (`jina_code_768`) is an experimental, separate representation space** — never cosine-compare against EmbeddingGemma vectors directly (`cosine(embeddinggemma_vector, jina_code_vector)` is invalid — unrelated learned spaces). Fuse ranked candidate lists, not raw vectors.
- **MiniLM-L6-v2 (384d) is demoted**: legacy throughput baseline / optional `cheap_candidate_prefilter_384` only. Never pad or reinterpret as `semantic_768`.
- **MiniLM role separation**: existing MiniLM references in the intent-domain classifier and fast cross-encoder reranker are task-specific executors, not semantic representation owners. They may remain until an EmbeddingGemma replacement passes task metrics; do not change them as part of EMB0–EMB4.
- **Sparse model boundary**: EmbeddingGemma is dense and must not be used as a SPLADE/miniCOIL substitute. SPLADE, miniCOIL, BM25, and BM42 require their own sparse output contract, vocabulary/index representation, and exact-vs-approximate evaluation. The current sparse lane remains audit/benchmark-only until a real implementation is identified.
- **FastEmbed boundary**: FastEmbed is an optional ONNX inference toolbox, not a replacement for the canonical EmbeddingGemma runtime or any vector store/index. Its current official Python model table does not list EmbeddingGemma; use it only for separately proven sparse/reranker challengers until an EmbeddingGemma parity receipt exists.
- **Jina dimension boundary**: `jina-embeddings-v2-base-en` and `jina-embeddings-v2-base-code` emit 768-dimensional vectors, but they are separate learned representation spaces. They must not be cosine-compared with `semantic_768`; fuse ranked candidates only after a separate Jina code/text evaluation.
- **MRL boundary**: EmbeddingGemma truncation targets are exactly `768`, `512`, `256`, and `128` with re-normalization. `384` is legacy-only and is not an EmbeddingGemma MRL contract. `latent_64` remains a separate routing autoencoder projection from the 768 semantic source.
- **Prompt boundary**: `formatEmbeddingGemmaInput` is the single owner for `retrieval_query`, `code_query`, and `document` prompt modes. GGUF/llama.cpp, Ollama, ONNX, and FastEmbed are executors; they must consume the same formatted input and still require parity receipts.
- **GGUF executor proof**: `npm run atlas:embedding:gemma:llama:proof` is a read-only 768d/finite/L2/repeatability probe for the existing `:8081` llama.cpp endpoint. Live status is `PROVEN` for three prompt modes; the binary lacks an explicit `--embd-normalize` flag, so normalization is validated from observed output. SentenceTransformers parity and Qdrant projection remain separate gates.
- **Live MRL proof**: `npm run atlas:embedding:gemma:mrl:proof` derives `semantic_768`, `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128` from one live 768d output with prefix truncation and L2 re-normalization. Current read-only status is `PROVEN`; no compact vector persistence is implied.
- **Reference parity audit**: local `models/embeddinggemma_300m` artifacts are present, but the bounded Python 3.13 `sentence_transformers` import probe did not complete. Status remains `REFERENCE_PARITY_NOT_PROVEN`; do not use Ollama or llama.cpp as a substitute reference oracle.
- **Query router feature contract**: `query-routing-features-v1.ts` is `FEATURES_ONLY`; it reuses the existing deterministic evidence classifier boundary and emits an ordered feature vector for a future calibrated XGBoost `multi:softprob` router. It does not claim classification, replace MiniLM, or alter retrieval policy.
- **Graph/Qdrant fanout alignment**: `graph-qdrant-fanout-alignment.ts` now separates identity mismatch, missing projection, and lineage gaps for `packet_key`, `source_ref`, `tree_node_id`, workspace/graph revisions, and `semantic_768` representation. It is a pure gate; live fanout acceptance remains open until the runtime receipt passes it.
- **Graph/Qdrant runtime alignment update (2026-08-20)**: the existing read-only fanout proof now evaluates that pure gate for every resolved Qdrant neighbor and records identity mismatch count, lineage-gap count, workspace/graph revision alignment, and `semantic_768` representation alignment. The live run reached Postgres, Neo4j, and Qdrant: bounded fanout and canonical identity pass, while lineage is `DEGRADED` because the sampled Qdrant payload has no workspace/graph revision and identifies the physical lane as `embeddinggemma_768_native_v1`/`dense_768`, not the frozen `semantic_768`/`content` contract. No store writes occurred.
- **Qdrant payload propagation hardening (2026-08-20)**: `buildQdrantSyncPayload` now maps the existing `atlas_packets` representation aliases, preserves optional graph/identity lineage, requires canonical `semantic_768`, and fails closed when `source_revision` authority is absent. This fixes the builder-side propagation contract without fabricating revisions; the live worker remains blocked until an upstream source-revision owner is populated.
- **Qdrant writer audit (2026-08-20)**: the read-only writer scan found 9 payload writers, but only the live SvelteKit payload path is a complete-lineage candidate; 7 legacy/backfill paths omit revision fields and must not be used for alignment backfills. Status is `WRITER_CONTRACT_PRESENT_PROJECTION_POPULATION_OPEN`; no writes occurred.
- **Source-revision adjacent owner audit (2026-08-20)**: `atlas_source_revisions` exists with 2 populated content-digest rows, but it is an acquisition/web-source owner and has no proven binding to `atlas_packets.source_ref` or code packet identity. It is recorded as `SOURCE_REVISION_ADJACENT_OWNER`, not promoted to the code ingestion revision authority.
- **Source-revision join audit (2026-08-20)**: the apparent single digest overlap is rejected as `REJECTED_UNTRUSTED_DIGEST_COLLISION`: it is the known empty SHA-256 digest on a generated Turbovec lock-file packet matched to an `https://example.com` acquisition row. There is no valid code-source join candidate.
- **Code source revision contract (2026-08-20)**: added the pure `CodeSourceRevisionV1` UTF-8/SHA-256 derivation and tests. It is `CONTRACT_PROVEN` but not yet the persisted `atlas_packets` owner; packet population, source/workspace authority, and Qdrant backfill remain blocked.
- **Packet lineage dry-run (2026-08-20)**: added `dryRunCodeSourceRevisionPacket` and `npm run atlas:embedding:emb3a:packet-dry-run`. The fixture receipt is `DRY_RUN_CONTRACT_PROVEN_INPUT_BINDING_OPEN`; it proves digest comparison and fail-closed behavior with zero canonical writes, but does not claim live packet materialization.
- **Live packet lineage dry-run (2026-08-20)**: `npm run atlas:embedding:emb3a:packet-live-dry-run` reached PostgreSQL and inspected 25 `atlas_packets` rows. `sourceContentRows=0`, `readyRows=0`, and `blockedRows=25`; every row returned `SOURCE_CONTENT_NOT_STORED_IN_PACKET_ROW`. Status is `LIVE_INPUT_BLOCKED_SOURCE_CONTENT_UNAVAILABLE`. This proves the live read path and fail-closed binding, but not source-revision materialization or Qdrant lineage. No canonical, Qdrant, or Valkey writes occurred. The next producer must resolve `source_ref` through an authoritative source snapshot/file-content owner; summaries, paths, hashes, and Qdrant payloads must not be substituted for source bytes.
- **Graphify source resolver continuation (2026-08-20)**: the live dry-run now checks the canonical `graphify_files`/`graphify_runs` source lineage when available and verifies workspace bytes against the recorded `content_hash` before deriving a revision. The current database reports `graphifySourceTableAvailable=false`, `graphifySourceRows=0`, `sourceContentRows=0`, `readyRows=0`, and `blockedRows=25`; status remains `LIVE_INPUT_BLOCKED_SOURCE_CONTENT_UNAVAILABLE`. No file was treated as authoritative without a Graphify hash match, and no stores were written.
- **Live source-lineage table audit (2026-08-20)**: added the read-only `npm run atlas:embedding:emb3a:source-lineage-audit` inventory. It returns `SOURCE_LINEAGE_OWNER_NOT_FOUND`; `public.graphify_files` is absent in the live database, although `atlas_source_revisions` exists as an unrelated acquisition owner. This is a capability/schema deployment gap, not permission to infer revisions or apply a migration during proof mode. Report: `docs/reports/live-source-lineage-table-audit.json`.
- **Migration reconciliation (2026-08-20)**: `drizzle/001_graphify_lineage.sql` exists in the repository, but no `001_graphify_lineage` entry was found in either local Drizzle journal. The live database also lacks `public.graphify_files`. This is now an explicit unapplied-migration gate; do not run `drizzle-kit push`, mutate the live schema, or backfill packets as part of EMB3A proof.
- **Source-lineage candidate census (2026-08-20)**: extended the read-only lineage audit with bounded counts for likely owners. The live database has no `atlas_packets`, `atlas_ast_nodes`, `graphify_files`, `analysis_pass_results`, or `codebase_chunk_index` tables in the active schema. `atlas_source_refs` has 22,487 content hashes but no source references or revisions; `atlas_source_revisions` has 2 content digests but no source references or revision columns; `file_index`, `storage_files`, and `uploaded_files` are empty or expose no usable lineage fields. Status remains `SOURCE_LINEAGE_OWNER_NOT_FOUND`; no table was promoted and no schema/data write occurred.
- **Schema drift audit hardening (2026-08-20)**: `schema:migrations:check` passes, but `schema:drift:check --live` found the Drizzle journal references `0040_snapshot.json` while `drizzle/meta` ends at `0039_snapshot.json`. The comparator now emits `EXPECTED_SNAPSHOT_MISSING` with a structured report instead of throwing. No snapshot was synthesized and no migration or schema write occurred.
- **GPH-17 reachability execution (2026-08-20)**: the local `graphify:daily` wrapper was run with native structural only, `APPLY=0`, `ALLOW_CREATE_SYMBOLS=0`, and bounded limits. It completed with `REACHABILITY_PROVEN_DRY_RUN`; the child processed files, wrote 0 evidence rows, created/versioned 0 symbols, and reported `DRY_RUN_COMPLETE`. The new read-only verifier confirms the native receipt checksum, dry-run flags, child completion, zero write counters, and no daily-chain execution as `GPH17_LIVE_REACHABILITY_PROVEN`. The runner now uses its own validated `pg` pool, so the previous unrelated `[DB] Canonical target: [invalid URL]` logger warning no longer appears. This proves wrapper reachability only; persistence, revision authority, and canonical owner acceptance remain unproven.
- **GPH-14R local hardening (2026-08-20)**: materializer results now expose nullable canonical `sourceRevision`, a SHA-256 `sourceVersionAnchor`, and explicit `sourceRevisionAuthority`. Parser tokens remain available only through sidecar evidence/`parserSourceRevisionToken`. Native structural provenance alone no longer enables promotion; focused materializer, batch, and intelligence adapter tests pass 11/11. The integration receipt remains `DRY_RUN_PROVEN` with canonical promotion blocked by `CONTENT_ANCHOR_ONLY`.
- **GPH-18 persistence readback collector (2026-08-20)**: added `npm run atlas:graphify:structural:persistence-readback`. The read-only collector identifies `PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER` as the intended owner but reports `PERSISTENCE_OWNER_NOT_READY` because live `public.atlas_evidence` is absent. It performed no canary insert, update, delete, or projection write. GPH-18 remains blocked on schema deployment and real source-revision authority.
- **GPH-17 verifier (2026-08-20)**: added `npm run atlas:graphify:structural:reachability:verify`, a read-only verifier for the existing reachability receipt. It checks schema/status, dry-run-only flags, child completion, native receipt checksum, zero write counters, and no daily-chain execution. The current wrapper run satisfies the receipt gates; this proves reachability only, not persistence, revision authority, or canonical owner acceptance.
- **Tree-sitter is the structural-truth parser backend.** ast-grep is a structural query/rewrite tool, not an identity owner — it must not mint `symbol_id`/`parse_node_id`.
- **The chunker chooses spans; GIS chooses identity.** `StructuralChunkV1` is a chunk-boundary contract, not an identity contract — `parse_node_id`/`symbol_id`/`symbol_version_id`/`chunk_id`/`packet_key` are assigned downstream by GIS, never by the chunker itself.
- **LangExtract owns prose/log/research entity extraction, never code identity.** Ungrounded extractions (no `char_interval`) must not be promoted to canonical evidence.
- **Every representation gets its own index + its own exact oracle** — `turbovec_semantic_768_v1` (EmbeddingGemma) and `turbovec_jina_code_v1` (Jina, if promoted) are separate TurboVec indexes, each compared only against its own cuVS brute-force oracle. Never mix representations in one index.
- **Existing evidence pipeline is reused, not replaced.** `SourcePosConceptPacket` → `CodeEvidenceSynthesizer` → `analysis_pass_results` → outbox → board already exists and is live (per Session 199-200 memory + this session's readback/outbox work) — extend it with provenance/identity fields, don't build a parallel `CodeSemanticUnitV1` subsystem.

## Audit tasks (do first — do not add a new chunker/encoder/transport before these run)

### Graphify hardening lifecycle — AST ownership and supersession

These tasks make `SUPERSEDED` an evidence-backed lifecycle state. The legacy
`scripts/atlas/knowledge-layer/ast-extractor.ts` remains `MIGRATION_CANDIDATE`
until replacement parity and zero-import evidence are both proven; it is not
safe to delete based on naming or lack of obvious callers alone.

- [x] **GPH-01** AST ownership audit — read-only receipt identifies the legacy extractor, enumerates callers/importers, records the Graphify/analysis replacement candidates, and writes `docs/reports/ast-ownership-receipt.{json,md}`.
- [ ] **GPH-02** Canonical Graphify contracts — nominate one `SourceSpan`, `SymbolFact`, and `EdgeFact` contract without duplicating downstream embedding, ranking, or Qdrant fields.
- [ ] **GPH-03** Replacement parity — prove the selected Tree-sitter/analysis owner with behavioral tests before changing the lifecycle state.
- [ ] **GPH-04** Stable symbol identity — separate logical `symbol_id`, revisioned `symbol_version_id`, and source span.
- [ ] **GPH-05** Superseded import guard — fail the audit/CI when a `SUPERSEDED` artifact gains a new import.
- [ ] **GPH-06** Retire only after proof — transition `MIGRATION_CANDIDATE → SUPERSEDED → QUARANTINED/DELETED` only after all four promotion requirements are recorded in a receipt.
- [x] **GPH-07** Canonical structural evidence contract — sidecar response is `atlas.ast.evidence.v1`; it carries structural chunks/spans only and no embeddings, ranking, Qdrant IDs, or recommendation state.
- [x] **GPH-08** Sidecar capability reporting — existing 8095 service now exposes `/capabilities` with runtime detection for treesitter-chunker, graph, GPU, and vector packages.
- [x] **GPH-09** Treesitter-chunker AST endpoint — existing 8095 service now exposes `POST /ast/chunk`; missing treesitter-chunker returns diagnostics rather than fabricated evidence.
- [x] **GPH-10** Parent Atlas sidecar adapter — existing Miniforge client now validates and returns `atlas.ast.evidence.v1` through `astChunk()` with a bounded timeout.
- [x] **GPH-11** Canonical identity normalization — pure normalizer matches the existing `atlas_ast_nodes` tree-node derivation; upstream chunk IDs remain provenance, while symbol/version/packet identities remain explicitly pending canonical persistence.
- [x] **GPH-12** Typed edge normalization — live `chunker` metadata now emits `DEFINES`, `IMPORTS`, `EXPORTS`, `CALLS`, and `REFERENCES` evidence; the downstream normalizer preserves typed edges without creating fake call symbols.
- [x] **GPH-13** AST parity corpus — six deterministic fixtures now pass against the current worker owner and live 8095 sidecar; report status is `PROVEN`.
- [x] **GPH-14** Determinism/line-shift proof — focused normalizer tests (7/7) prove repeatable symbols/edges/diagnostics for the same revision, stable target identity across source-line movement and sibling/scoped evidence changes, rename identity changes, and body-revision handling without minting canonical IDs in the normalizer.
- [x] **GPH-15** Parse-failure isolation — bounded production contract and live 8095 dry-run prove malformed-file recovery/isolation; durable persistence remains open.
- [x] **GPH-16** Incremental extraction proof — bounded production contract and live dry-run prove unchanged skip, changed re-extraction, and explicit deletion/tombstone input; canonical lifecycle persistence remains open.
- [ ] **GPH-17** Graphify daily replacement integration — wire the selected canonical owner after GPH-11 through GPH-16 pass.
- [ ] **GPH-18** Production Graphify receipt — record AST engine, revision, failures, identity, persistence, and projection evidence in the existing receipt.
- [ ] **GPH-19** Replacement ownership acceptance — require live owner, parity, span/edge parity, and unchanged canonical identity.
- [ ] **GPH-20** Mark legacy `SUPERSEDED` — blocked until every GPH-19 gate passes; legacy file remains retained.
- [ ] **GPH-21** Superseded import guard — reject new imports only after the registry state becomes `SUPERSEDED`.
- [ ] **GPH-22** Hardening recommendation receipt — emit recommendation state without mutating canonical Graphify truth.
- [x] **GPH-23** Explicit lifecycle states — govern legacy implementations with `ACTIVE`, `MIGRATION_CANDIDATE`, `SUPERSEDED`, `QUARANTINED`, and `DELETED`; the current AST extractor remains `MIGRATION_CANDIDATE`.
- [x] **GPH-24** Governance baseline — treat the ownership receipt and supersession registry as the lifecycle authority; do not promote from dead-code inference, package installation, or naming alone.
- [x] **GPH-25** `DUPLICATE_OF GPH-02/GPH-07/GPH-11/GPH-12` — canonical structural contract is tracked by the original task family; no second acceptance gate.
- [x] **GPH-26** `DUPLICATE_OF GPH-17` — replacement owner reachability remains part of Graphify daily integration.
- [x] **GPH-27** `DUPLICATE_OF GPH-13` — parity corpus and `ast-replacement-parity.{json,md}` remain one task.
- [x] **GPH-28** `DUPLICATE_OF GPH-14` — determinism and line-shift identity remain one task.
- [x] **GPH-29** `DUPLICATE_OF GPH-15/GPH-16` — failure and incremental isolation remain the original tasks.
- [x] **GPH-30** `DUPLICATE_OF GPH-18` — production receipt remains one task.
- [x] **GPH-31** `DUPLICATE_OF GPH-19` — replacement acceptance gates remain one task.
- [x] **GPH-32** `DUPLICATE_OF GPH-20` — controlled supersession remains one task.
- [x] **GPH-33** `DUPLICATE_OF GPH-21` — regression import guard remains one task.
- [x] **GPH-34** `DUPLICATE_OF GPH-22` — hardening recommendation lifecycle remains one task.
- [ ] **GPH-35** Deferred cleanup window — keep `SUPERSEDED` distinct from `QUARANTINED` and `DELETED`; removal requires a later recovery-window decision, digest/reason evidence, and rollback instructions.

### Current workstation integration note — 2026-08-13

- The AST migration has proven GPH-01, GPH-07 through GPH-16, and the governance baseline GPH-23/GPH-24. GPH-17 through GPH-22 remain open; GPH-25 through GPH-34 are closed duplicate aliases. GPH-35 remains the later cleanup-window gate. The legacy extractor stays `MIGRATION_CANDIDATE`; no deletion or unsafe `SUPERSEDED` promotion is authorized.
- Latest bounded parity run: `npm run atlas:ast:replacement:parity` checked six fixtures against the live worker owner and rebuilt 8095 sidecar. The report is `docs/reports/ast-replacement-parity.{json,md}` with status `PROVEN`; structural names, typed imports, spans, and malformed-source diagnostic detection passed. Batch failure isolation, broader CHUNK0 ownership closure, and supersession gates remain open.
- Bounded sidecar isolation evidence: `npm run atlas:ast:failure:isolation` now runs four concurrent cases (two valid TypeScript files, malformed `ERROR`, and missing-delimiter `MISSING`) and passes 4/4; `docs/reports/ast-failure-isolation-proof.{json,md}` records typed `ChunkingError` diagnostics while neighboring files complete. The production-shaped batch contract and live 8095 dry-run now consume these per-file results without aborting; durable persistence/readback remains open.
- End-to-end gate attempt (2026-08-14): replacement parity `PROVEN`, sidecar failure isolation `PROVEN`, bounded incremental extraction `BOUNDED_PROVEN`, and ownership audit `PROVEN_AUDIT`. GPH-15 has live sidecar evidence and worker-level per-job isolation, but a live database-backed Graphify batch receipt was not run. GPH-16 now has a read-only proof for unchanged-file skip, changed-file re-extraction through 8095, and explicit deletion tombstones; production Graphify delta wiring remains pending. The new owner trace confirms `graphify:daily` does not invoke either `sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs` or the 8095 replacement, so GPH-17A canonical owner selection is blocked and no parallel pipeline will be created. GPH-18 remains blocked pending replacement-aware receipt integration. GPH-19/GPH-20 remain blocked by those promotion gates. GPH-21 is observable through the ownership audit but not yet a dedicated CI import-guard gate. GPH-22 has no hardening recommendation receipt yet.
- Current AST gate matrix: `GPH-13 PASS`, `GPH-14 PASS`, `GPH-15 DRY_RUN_PROVEN`, `GPH-16 DRY_RUN_PROVEN`, `GPH-17C REACHABILITY_PROVEN_DRY_RUN/COMPATIBILITY_ONLY`, `GPH-17A OWNER_ACCEPTANCE_PENDING`, `GPH-17B FALLBACK_POLICY_PENDING`, `GPH-18 BLOCKED_RECEIPT_INTEGRATION`, `GPH-19 BLOCKED`, `GPH-20 BLOCKED`, `GPH-21 AUDIT_DETECTION_PASS/CI_GUARD_PENDING`, `GPH-22 OPEN`. The legacy extractor remains `MIGRATION_CANDIDATE`; no unsafe promotion or deletion is authorized.
- AST parity runtime readiness hardening now classifies transport failure,
  unavailable parser engine, missing parser package, and provider failure
  separately. Focused proof passed `4/4`; this changes only the parity proof's
  blocked-versus-mismatch classification. The 66-file corpus receipt remains
  pending, and 8095 remains the default owner.
- Owner trace artifact: `npm run atlas:graphify:ast:owner:proof` returned `OWNER_SELECTION_BLOCKED` and wrote `docs/reports/graphify-ast-owner-trace.{json,md}`. The package exposes `atlas:ast:facts:apply` separately, but the `graphify:daily` chain does not call it; the replacement insertion boundary therefore still requires an explicit owner decision.
- Pipeline ownership order is frozen for the next integration slice: workspace/file inventory and chunk indexing → AST evidence materialization → canonical identity/graph facts → semantic_768/Qdrant projection → centroid/routing assignment → Graphify receipt → recommendation/Kanban task. Recommendations consume receipts; they do not become an AST or vector-index owner.
- ANN boundary is also frozen: Valkey/Redis is cache and hot-routing state only; Qdrant remains the persistent dense projection; DiskANN/Vamana, cuVS/CAGRA, and TurboVec are optional dense executors behind one SearchRuntime lane and must preserve filter, revision, and canonical-identity parity. None is an AST supersession gate.
- Bounded RAPIDS KNN client added at `sveltekit-frontend/src/lib/server/atlas/retrieval/atlas-rapids-knn-client.ts`; it targets the existing `python/atlas_rapids_sidecar.py` `/v1/knn/exact` and `/v1/knn/cagra` contracts with `semantic_768`, packet/revision identity, and fail-before-network guards. This is `CREATED` and fixture-tested, not live RTX-proven: `127.0.0.1:8098` was not listening during the attempt.
- Current GPU correction (2026-08-14): the existing 8098 sidecar was subsequently started from `atlas-rapids-cu13`; exact cuVS brute-force KNN is `PROVEN_ON_LIVE_FIXTURE` and CAGRA is `RUNTIME_PROVEN_ON_TINY_FIXTURE` with Recall@3 = 1.0. Evidence: `docs/reports/gpu-knn-exact-runtime-proof.{json,md}` and `docs/reports/gpu-knn-cagra-runtime-proof.{json,md}`. Larger-corpus recall, Qdrant-corpus comparison, and production SearchRuntime wiring remain open.
- The canonical AST owner boundary is now implemented as `GraphifyStructuralMaterializer` → `AstProvider` → 8095. The materializer normalizes structural evidence, preserves upstream chunk IDs as provenance, does not persist canonical identities or projections, and fails closed on sidecar errors. Focused tests cover `PROVEN`, `RECOVERED_WITH_ERRORS`, and `FAILED`; production `graphify:daily` reachability and fallback policy remain pending.
- Graphify owner trace (2026-08-14): `npm run atlas:graphify:daily:readiness` passes its required-script check, but `graphify:daily` executes `scripts/startup/run-graphify-daily-startup.mjs` → `graphify:daily:chain`; that chain does not invoke the 8095 AST replacement. `scripts/atlas/daily-graphify-concrete-dag.mjs` is a separate DAG that reports existing AST facts and is not the live `graphify:daily` chain. This is the concrete GPH-17 blocker: select one owner and integrate the replacement behind it; do not create a parallel Graphify pipeline.
- PyTorch, RAPIDS/cuVS/cuGraph/CAGRA, TensorRT, LibTorch, simdjson, and multi-threaded execution remain separate deferred integration lanes. Their source files and dedicated sidecar definitions remain present; the lightweight 8095 AST sidecar intentionally reports those optional packages unavailable.
- Ollama remains the embedding owner; llama-server on `:8090` remains the chat/generation owner. These are separate contracts.
- Current workstation status and heuristic ranking are maintained in `docs/parent-atlas-workstation-todo.md`.
- GPU/runtime integration is intentionally tracked separately in `docs/parent-atlas-workstation-gpu-runtime-backlog.md`; its current estimate is 58% and it must not be used to promote or block AST supersession.
- BM42, CAGRA production use, PageRank retrieval weighting, RF5 fusion changes, and GPU promotion are not AST acceptance gates.

| Task | State | What it answers |
|---|---|---|
| **CHUNK0** `/audit-duplication chunking` | PARTIAL_PROVEN | Which structural extraction path is `CANONICAL_OWNER`: in-process TS bridge (`ast-langextract-bridge.ts`, confirmed live — `code_feature_registry` worker routes through it), Python `treesitter-chunker` sidecar (:8095, also real — installs `tree-sitter`, `tree-sitter-language-pack`, `ast-grep-py`, `langextract`), or legacy `ast-chunker.ts` (ts-morph-based)? Live worker wiring now uses the bridge; the Python NLP sidecar now prefers `treesitter-chunker` for structural spans when installed and keeps local tree-sitter only as compatibility fallback. Canonical ownership still needs the duplication audit. |
| **CHUNK1** compare output contracts | PARTIAL_PROVEN | The Node Tree-sitter challenger now emits `atlas.ast.evidence.v1` and passes its seam test; six-fixture comparison against the 8095 owner is still required for names, spans, typed edges, diagnostics, and identity parity. |
| **CHUNK2** demote redundant path | NOT STARTED | Classify the loser `COMPATIBILITY`/`LEGACY`, not delete (Archival Rules) |
| **TURBOVEC** `/audit-duplication turbovec` | **DONE 2026-08-12** | See `openspec/changes/parent-atlas-error-research-lane/tasks.md` — 4 live uncoordinated transports found (HTTP :8791, gRPC, Rust N-API, `child_process.spawn` CLI), NEW_CONFLICT, not yet resolved |
| **LX0** LangExtract runtime grounding proof | PARTIAL_PROVEN | import is real `langextract` (not a stub), call reaches the 8095 sidecar, model provider explicit, extraction schema/examples explicit, grounded source spans returned, ungrounded extractions rejected/marked (not silently promoted), extraction provider revision persisted, failures explicit (not silently empty-success), `SourcePosConceptPacket` actually receives LangExtract-derived fields, live `code_feature_registry` worker exercises this path end-to-end |

Live implementation note (2026-08-12): `sveltekit-frontend/src/lib/server/analysis/worker.ts` now routes `code_feature_registry` through `ast-langextract-bridge.ts` before packet synthesis. That means the live worker path is no longer AST-grep-only; it merges AST-grep, LangExtract, and tree-sitter fallback evidence before `SourcePosConceptPacket` / `CodeEvidenceSynthesizer` / `analysis_pass_results`. `ast-chunker.ts` remains the legacy compatibility path until CHUNK1/CHUNK2 close.

### Priority update from the latest review

The next single-action order is now:

1. **CHUNK0** — close structural ownership: bridge/orchestrator, 8095 `treesitter-chunker`, local parser fallback, and canonical identity owner.
2. **GPH-13 → GPH-22** — run the single AST supersession sequence after CHUNK0 closes.
3. **LX0** — prove LangExtract grounding and `char_interval`-required promotion.
4. **EMB0 → EMB4** — prove the canonical EmbeddingGemma `semantic_768` card/projection contract and use live cuVS brute force as the exact evaluation oracle.
5. **CTX0** — wire the existing `ContextManifest` contract into the live `context-assembler.ts` path.
6. Then continue with **FE5/FE6** query-time `FeatureRow`, followed by the hypergraph owner audit and the reranker/RRF audit as separate bounded slices.

Do not start ContextManifest wiring before CHUNK0 and LX0 are settled; the manifest is downstream of validated chunking and grounded extraction.

## Architecture review — 2026-08-14

Use this order for the next integration work:

`file identity → AST evidence → canonical graph identity → semantic cards → EmbeddingGemma semantic_768 → Qdrant projection → exact cuVS oracle → optional CAGRA/TurboVec executor → bounded Neo4j/PageRank evidence → FeatureRow/fusion → ContextManifest → llama-server`.

KMeans centroids and SOM cells are routing metadata derived from semantic
vectors; domain classifications and ontology-linked tuples remain metadata and
graph evidence, not replacement vector geometry. PageRank remains a reusable
candidate feature. Valkey is hot cache/routing state only. Go retrieval may read
immutable Arrow IPC/mmap snapshots and rebuildable indexes, but Postgres remains
canonical. BM42, Triton, simdjson, Python free-threading, and alternate ANN
executors remain benchmark- or proof-gated.

Current reviewed status: semantic_768 contract and exact cuVS live fixture are
proven; CAGRA is proven only on the tiny fixture and remains quarantined;
same-corpus large-scale recall, Graphify owner integration, LangExtract
grounding, and TurboVec transport ownership remain open.

- Null-content-hash repairability proof (2026-08-21): the merged read-only
  audit checked 20 residual rows across Postgres content/embedding, Qdrant
  point identity, source reference, and 768-dim vector cosine agreement. All
  20 were classified `METADATA_REPAIR_CANDIDATE`; this is sample evidence only
  and does not authorize metadata repair or re-embedding.
- Runtime readiness (2026-08-21): the existing Windows TurboVec/cuVS audit
  returned 100/100 with TurboVec, Qdrant, native bridge, cuVS capability, and
  dense collection available. WSL2 Ubuntu is version 2 but stopped and lacks
  the optional Python `cuvs`, `cugraph`, `cupy`, and `torch` packages; WSL2 is
  not the active executor owner.

Review correction (2026-08-14): dense Qdrant projection, identity round-trip,
and revision-filter validation are separate from sparse/BM42 validation. The
live `codebase_chunks_768` collection has no sparse vector, so BM42 remains
`DEGRADED/NOT_RUN` and is not a blocker for the dense or AST lanes.

## Embedding/retrieval sequence (after CHUNK0/LX0 close)

| Task | State |
|---|---|
| EMB0 prove current EmbeddingGemma writer emits real 768-dim finite normalized `semantic_768` with document/query prompting + representation_revision + source-card identity | PROVEN — `docs/reports/emb0-embeddinggemma-writer-proof.{json,md}`; read-only live Ollama proof, both prompt modes, lineage present |
| EMB1 build Tree-sitter semantic-card corpus (FILE/MODULE/CLASS/INTERFACE/FUNCTION/METHOD/TYPE units, not arbitrary token windows) | PROVEN — 7-card 8095 corpus; exact spans, scope/context, typed relationships, and upstream provenance retained |
| EMB2 re-embed semantic cards with canonical EmbeddingGemma | PROVEN — 7/7 EMB1 cards embedded as finite normalized `semantic_768`; disposable JSONL only |
| EMB3A verify Qdrant dense `semantic_768` projection, identity round-trip, and workspace/source revision filters | PARTIAL_PROVEN — `codebase_chunks_768_v2` contract is now frozen as dense-only physical vector `content` (768/COSINE); identity/revision payloads and EMB2 fixture round-trip remain open; sentinel exclusion and read-only mutation guard pass |
| EMB3B verify Qdrant sparse/BM42 projection | DEFERRED — live `codebase_chunks_768` has no sparse vector; keep `DEGRADED/NOT_RUN` |
| EMB4 exact cuVS brute-force oracle on EmbeddingGemma 768d | LIVE_FIXTURE_PROVEN; same-corpus oracle comparison open |
| EMB-MRL derived compact lanes | PROVEN — typed `768/512/256/128` prefix truncation with L2 re-normalization; `384` rejected |

### Retrieval collection contract freeze (2026-08-20)

- `codebase_chunks_768_v2` is the target dense projection contract: logical representation `semantic_768`, EmbeddingGemma lineage, physical Qdrant vector `content`, 768 dimensions, COSINE.
- `tree_node_id`, `symbol_version_id`, `packet_key`, and `source_ref` are payload identity/provenance fields; they are not vector dimensions. `domain_class`, taxonomy tags, 4D topology coordinates, KMeans/SOM/community labels, and PageRank are payload or derived routing metadata, not additional semantic vector lanes.
- KMeans/SOM centroids are rebuildable routing artifacts derived from the semantic snapshot. HNSW is the persistent dense retrieval index; cuVS/CAGRA/TurboVec are optional executors behind the same SearchRuntime lane.
- The pure contract exposes a blocked revision-index plan for `workspace_revision`, `source_revision`, `representation_id`, `representation_revision`, and related lineage fields. No index creation or payload migration is authorized until EMB3A proves populated upstream lineage.
- Sparse SPLADE/miniCOIL/BM42 remains a separate challenger lane. EmbeddingGemma MRL truncation does not create sparse vectors; EMB3B is not closed by this contract freeze.
- Sparse source census (2026-08-21) is now `RUNTIME_PROOF_PENDING`: the read-only
  audit found `codebase_chunk_index` with 52,417 rows, 52,380 text rows, and
  52,380 dense rows, but this does not prove a SPLADE, miniCOIL, or BM42 model
  owner or a Qdrant sparse projection. No sparse collection or index writes were
  performed.
- Sparse discovery scanner corrected (2026-08-21): the prior zero-hit result was
  caused by incompatible ripgrep flags (`--files` plus unsupported `--type mjs`).
  The corrected scan found 823 keyword-bearing files, existing `lexical_v1`
  contracts, BM42/Qdrant references, and only reference-level miniCOIL/SPLADE
  mentions. Sparse owner selection remains open; do not create a competing
  encoder until the existing owners are audited.
- Sparse adapter naming correction (2026-08-21): the duplicate Qdrant BM42
  adapter now uses the existing legacy hashed codec explicitly, reports the
  `LEXICAL_SPARSE_HASHED` algorithm family, and sets `is_true_qdrant_bm42` to
  false. The historical physical field name is preserved for compatibility;
  no sparse projection or retrieval policy was changed.
- Sparse script wiring correction (2026-08-21): stages 02–10 and the pipeline
  package commands now target the actual `sveltekit-frontend/scripts/atlas/sparse`
  owners instead of a missing root directory. Read-only vocabulary sampling
  now runs successfully on 500 rows, producing 4,369 `lexical_v1` tokens with
  status `RUNTIME_PROOF_PENDING`; no vocabulary table or projection write occurred.
- Sparse sample terminology correction (2026-08-21): the bounded encoder sample
  was labeled `bm25_v1` despite using hashed log-TF weights without IDF. It now
  reports `legacy_code_aware_logtf_v1`; this is not BM25, BM42, SPLADE, or miniCOIL.
- Sparse shadow collection plan (2026-08-21): dry-run contract passed for an
  allowlisted `codebase_chunks_sparse_test_v1` shadow with dense `content` 768
  and sparse `lexical_v1`. `apply=false`; no Qdrant collection was created.
- Sparse readback verifier correction (2026-08-21): the verifier no longer
  defaults to the canonical dense collection or dumps full vectors. It now
  checks dense/sparse schema separately and bounded point population. The
  existing allowlisted shadow contains 10/10 sampled dense and `lexical_v1`
  sparse points, so readback is `RUNTIME_PROVEN`; this proves projection shape,
  not BM42/SPLADE/miniCOIL model semantics.
- Sparse self-query proof correction (2026-08-21): the query returned 10
  points for `retrieveAllCandidates`, but the prior receipt overstated this as
  `RUNTIME_PROVEN`. It now reports `QUERY_EXECUTED_QUALITY_NOT_PROVEN` with
  bounded identities and null recall/MRR until a ground-truth query set exists.
- Sparse RRF ablation stage is currently a pending evaluation scaffold only:
  it emits dense/sparse/RRF/recall/NDCG placeholders and performs no retrieval
  comparison or fusion-policy mutation. `RUNTIME_PROOF_PENDING` is retained.
- Sparse promotion guard correction (2026-08-21): promotion now requires
  measured dense-only, sparse-only, RRF, Recall@10, and NDCG@10 evidence. With
  the current pending ledger it returns `BLOCKED_RRF_EVALUATION_PENDING` and
  performs no supersession-registry mutation.
- RRF input discovery correction (2026-08-21): the ablation scaffold now finds
  the workspace-level `scripts/eval/data/labeled_queries.json` (15 keyword/
  minimum-document queries). These labels are available for a future adapter,
  but packet-level relevance and dense/sparse results remain unmeasured.
- Sparse evaluation-input audit (2026-08-21): `npm run
  atlas:sparse:evaluation-input:audit` confirms stable query IDs and text but no
  `relevant_packet_keys`, `relevant_source_refs`, or graded judgments. It emits
  `MISSING_PACKET_LEVEL_GROUND_TRUTH` locally; no labels or store data are added.
- Sparse annotation template (2026-08-21): `npm run
  atlas:sparse:relevance-template` exports 15 review rows with keyword hints and
  empty packet/source judgments. Every row is `NEEDS_HUMAN_REVIEW`; this is an
  annotation workflow artifact, not ground truth or a promotion input.
- Sparse annotation validator (2026-08-21): `npm run
  atlas:sparse:relevance-validate` fail-closes until every row is reviewed with
  nonempty packet/source judgments and no within-query duplicate identities. The
  current result is `BLOCKED_REVIEW_PENDING` for all 15 rows.
- Sparse candidate proposals (2026-08-21): `npm run
  atlas:sparse:relevance-proposals` performs a bounded read-only keyword lookup
  against canonical source rows and emitted 271 candidate suggestions. Every
  suggestion is `PROPOSED_NOT_GROUND_TRUTH`; reviewers must accept/reject them
  before the annotation validator or RRF metrics can consume the data.
- Sparse proposal audit (2026-08-21): `npm run atlas:sparse:proposal-audit`
  found 161 unique packet/source identities among 271 suggestions, with 110
  repeated identities across different queries and no missing packet keys. The
  repetition is expected for per-query review and is not a global relevance
  judgment; promotion remains blocked.
- Sparse supersession guard correction (2026-08-21): legacy sparse artifacts
  are no longer marked `SUPERSEDED` while replacement RRF/quality metrics are
  pending. The command now returns `BLOCKED_RRF_EVALUATION_PENDING` with zero
  registry mutation.
| TURBOVEC_EXECUTION_OWNER_PROVEN choose one live transport and classify HTTP/gRPC/N-API/CLI alternatives | OPEN |
| EMB5 TurboVec index from the same semantic_768 vectors (only after execution-owner gate) | BLOCKED_BY_TURBOVEC_EXECUTION_OWNER |
| EMB6 measure TurboVec vs exact oracle (Recall@K, NDCG, latency) | BLOCKED_BY_TURBOVEC_EXECUTION_OWNER |
| CODE0 add Jina `jina_code_768` as EXPERIMENTAL second dense lane | NOT STARTED |
| CODE1 evaluate EmbeddingGemma-only vs Jina-only vs fused (Recall@5/10/50, MRR, nDCG@10, symbol/repair localization, latency, RAM/VRAM, index size) | NOT STARTED |
| RERANK0 Mixedbread reranker after canonical fusion (top-50 → top-10, fail-open) | NOT STARTED |
| ENRICH0 Ornith 9B semantic-card synthesis path, schema-bound output (`CodePatternObservationV1`, not free-form prose) | NOT STARTED |
| EXTRACT0 LangExtract for docs/logs/research (separate lane, same downstream machinery) | NOT STARTED |

EMB0 receipt note (2026-08-20): the existing dimension smoke test was extended
with a dedicated read-only writer proof. `npm run atlas:embedding:emb0:proof`
reached the live Ollama EmbeddingGemma owner and proved document/query prompt
modes, finite normalized 768-dimensional output, `semantic_768`,
`embeddinggemma-native-768-v1`, workspace/source revisions, and source-card
identity. No Postgres, Qdrant, Valkey, or embedding artifact writes occurred.

Representation correction (2026-08-20): stale `EmbeddingGemma 384` wording in
the semantic specialist prompt and a Python topology fixture was corrected to
canonical `semantic_768`. Existing MiniLM references remain explicitly scoped
to intent classification or fast cross-encoder tasks. No dense semantic lane
is allowed to use MiniLM-384, and no EmbeddingGemma truncation is promoted
without a separate representation revision and recall/oracle proof.

EMB1 receipt note (2026-08-20): `npm run atlas:embedding:emb1:corpus`
consumed the live 8095 `atlas.ast.evidence.v1` response and emitted
`docs/reports/emb1-semantic-card-corpus.jsonl` plus JSON/Markdown proof
receipts. The deterministic corpus contains FILE, MODULE, CLASS, INTERFACE,
FUNCTION, METHOD, and TYPE cards with exact source spans, scope/context,
relationship evidence, source/workspace revisions, and upstream chunk IDs as
provenance only. No embeddings or canonical/projection writes occurred.

EMB2 receipt note (2026-08-20): `npm run atlas:embedding:emb2:cards`
read the EMB1 JSONL and reached the live Ollama EmbeddingGemma owner for all
seven cards. All vectors passed 768-dimensional finite/normalized validation
and retained card identity plus source/workspace revisions. The output is
`docs/reports/emb2-semantic-card-embeddings.jsonl`; Qdrant and canonical stores
were not written.

EMB3A receipt note (2026-08-20): the read-only Qdrant proof reached
`codebase_chunks_768` and sampled 100 points. The collection is confirmed
768-dimensional with COSINE distance and `packet_key`/`source_ref` identity
payloads. The sampled projection has no `workspace_revision`,
`source_revision`, or `representation_revision` payload coverage, and the
seven EMB2 fixture cards are not indexed, so revision-filter and same-fixture
identity round-trip gates remain unproven. No Qdrant writes occurred.

EMB3A writer-lineage audit note (2026-08-20):
`npm run atlas:embedding:emb3a:writer-audit` now includes the live SvelteKit
path. `qdrant-sync-worker.ts` delegates to
`qdrant-sync-payload.ts`/`qdrant-payload-enricher.ts`, which contain the complete
`packet_key`, `source_ref`, `workspace_revision`, `source_revision`, and
`representation_revision` payload contract. Status is
`WRITER_CONTRACT_PRESENT_PROJECTION_POPULATION_OPEN`: the writer is identified,
but the existing Qdrant sample still lacks revision coverage and the EMB2
fixture round-trip remains unproven. Do not apply a live payload backfill or
add a parallel writer until upstream revision values and a bounded projection
readback are proven.

EMB3A revision readback note (2026-08-20):
`npm run atlas:embedding:emb3a:lineage-readback` completed a bounded read-only
sample of 50 `atlas_packets` rows and 50 Qdrant points. PostgreSQL returned
zero non-zero `workspace_revision`, `source_revision`, or
`representation_revision` values in the sample; Qdrant returned zero revision
fields and no sample join was available. Status is
`LINEAGE_POPULATION_NOT_PROVEN`. The writer contract is present, but its live
inputs and projection population must be repaired or explicitly classified
before EMB3A can advance.

EMB3A v2 proof update (2026-08-20): the proof now defaults to the live
`codebase_chunks_768_v2` contract and separates representation ID
(`semantic_768`) from physical vector name (`content`). It records functional
revision-filter status separately from payload-index presence, checks the
`_atlas_system_record` sentinel exclusion condition, and reports the read-only
mutation guard. Live result: dense schema and cosine `PASS`; sentinel sample
clean and mutation guard `PASS`; identity/revision payload coverage,
revision-filter functionality, and EMB2 fixture round-trip remain
`NOT_PROVEN`; revision payload indexes are absent. Overall remains
`DEGRADED_FIXTURE_OR_PAYLOAD_GAP`.

EMB3A hardening F1/F2 note (2026-08-20): the 768 v2 provisioner now omits
`sparse_vectors` when the contract has `sparseVectorKey: null`, rather than
creating a literal sparse vector named `null`. Future collection creation also
declares revision/identity payload indexes, including the system-record field.
This is a dry-run-safe provisioner fix only; the existing live collection was
not recreated or modified. Shared production retrieval exclusion of
`_atlas_system_record=true` remains a separate integration gate.

EMB3A-F3 update (2026-08-20): added the shared object-filter contract used by
`QdrantManager`; it always appends
`must_not: _atlas_system_record=true` while preserving caller filters. A pure
focused contract test covers scalar and array filters. This is query-only
hardening; no stored points were changed.

EMB3A writer hardening note (2026-08-20):
`buildQdrantSyncPayload` now fails closed when `workspaceRevision`,
`sourceRevision`, or `representationRevision` is absent/invalid instead of
silently emitting zero/null lineage. A focused contract test was added, but
the repository's broad Vitest configuration excluded the new test and the
default Vitest run stalled during module startup; this is not claimed as a
test pass. TypeScript compilation likewise exceeded the diagnostic window.
The live readback remains the acceptance gate.

## P3 correction

P3's canonical path should start with **Tree-sitter chunk → GIS identity → semantic card → EmbeddingGemma `semantic_768`**, not `768d → latent_64 → cluster`. The existing KMeans/latent_64 work is not discarded — it's reclassified as `LEGACY_COMPATIBILITY` / `CACHE_HINT_ONLY`, derived *from* semantic_768, never the retrieval-truth path itself. Matches the already-frozen T6c stop state (KMeans K=64/128/256 = `KMEANS_ROUTING_EXPERIMENT_PROVEN`, `CACHE_HINT_ONLY` — do not reopen).

## Error-research lane integration (already built this session)

`scripts/atlas/research-error-fixes.mjs` (see `parent-atlas-error-research-lane/tasks.md`) should eventually route its error-explanation step through LangExtract once LX0 passes:
`error_logs → ACE local context → LDR (if eligible) → LangExtract(errorClass, suspectedCause, proposedFix, evidenceSpans, citedSources) → error_research_context`. Not done yet — current script persists raw LDR synthesis text, not LangExtract-structured fields. Flagged here, not implemented.

## Schema/contract layer (condensed, 2026-08-12 — not implemented)

**Stack decision**: `okf` documents capability + proof status only (never validates). `Zod` is the canonical TS runtime contract owner. `JSON Schema` is the generated cross-language artifact (Python/MCP consume it, don't hand-author a second copy). `MCP` transports via `inputSchema`/`outputSchema` (JSON-RPC 2.0). `Mastra` stays optional orchestration/eval only — never a schema owner, imports the canonical Zod contracts if ever added.

**Three new contracts needed** (not built): `LangExtractRequestV1`, `LangExtractReceiptV1` (status: `GROUNDED|PARTIAL|EMPTY|FAILED`, `charInterval` required for anything promoted as evidence — ungrounded extractions must be filtered, not treated as truth), `SemanticObservationV1` (kind: `ROLE|PURPOSE|DOMAIN|CONCEPT|SIDE_EFFECT|INVARIANT|DEPENDENCY_INTENT|ERROR_CAUSE|REPAIR_HYPOTHESIS`). Validate twice: Python (Pydantic/JSON Schema) at the 8095 sidecar boundary, TypeScript (Zod) at the HTTP response boundary — intentional double-validation, one semantic contract, two process boundaries.

**Missing bridge**: `SemanticFeatureEnvelopeV1` — the compiled feature object between raw extraction and retrieval (structural facts + semantic observations + POS/domain + representation refs + provenance). Feeds `RetrievalFeatureRowV1` (derived scores: `denseSemanticScore`, `jinaCodeScore`, `bm25Score`, `astSameSymbol`, `pageRank`, `posActionMatch`, `historicalAffinity`, `fusedRank`, `rerankScore` — NOT raw 768-float vectors copied per row).

**LLM injection contract**: `ContextManifestV1` (requestId, selectedPackets[], evidenceSpans[], scores, tokenBudget, selectionPolicyRevision) — reproducible packet injection, not arbitrary JSON. Card lifecycle: `StructuralChunk` (source unit) → `SemanticFeatureEnvelope` (reusable features, Postgres durable + Qdrant projection) → `SemanticCard` (compact durable description) → query time → `RetrievalFeatureRow` (candidate-specific scores) → `ACE Context Card` (task-specific evidence bundle, cached in BitFrost/Redis — cache the card, never serialize raw 768d floats into it) → `ContextManifest` (exact LLM injection receipt).

**Performance tooling — benchmark-gated, not architecture**: simdjson/Sonic(Go)/a new Go retrieval service are all classified `PERFORMANCE_BACKEND` candidates only, never a new truth/architecture lane. Do not add any of them without a measured bottleneck (`PERF0` benchmark current parser, `PERF1` promote only if p95/throughput gate is actually hit). Explicitly rejected without evidence: new Go retrieval service (would duplicate `parent-atlas-retrieval`/`turbovec-prefilter`/canonical fusion — run `/audit-duplication retrieval` before ever reconsidering).

**Task IDs** (all NOT STARTED): LX1 `LangExtractRequestV1` Zod · LX2 `LangExtractReceiptV1` Zod · LX3 export JSON Schema artifacts · LX4 8095 validates against same schema · LX5 require grounding before `SemanticObservation` promotion · LX6 persist extractor/model/source revisions · LX7 optional MCP `atlas.extract_semantics` tool using the same input/output schema · LX8 feed validated observations into `SourcePosConceptPacket` · LX9 explicit EMPTY/PARTIAL/FAILED status (never silent empty-success) · FE0 freeze `SemanticFeatureEnvelopeV1` · FE1 Tree-sitter+LangExtract+POS/domain → envelope · FE2 persist semantic card + provenance · FE3 EmbeddingGemma/Jina vector refs · FE4 Qdrant projection · FE5 query-time FeatureRow compiler · FE6 TurboVec/Qdrant/BM25/AST-graph scores into FeatureRow · FE7 canonical fusion + Mixedbread · ACE0 `ContextManifestV1` · ACE1 hydrate selected packets/cards · ACE2 BitFrost hot cache · ACE3 Ornith packet injection · PERF0 benchmark JSON parsing · PERF1 promote simdjson/Sonic only if bottleneck measured.

**Gates**: `LANGEXTRACT_SCHEMA_CONTRACT_PROVEN`, `LANGEXTRACT_GROUNDING_PROVEN`, `LANGEXTRACT_WORKER_PATH_PROVEN`, `MCP_LANGEXTRACT_TOOL_CONTRACT_PROVEN` — none yet proven. This is the next semantic correctness lane after AST parity; grounding must expose explicit `char_interval`/source-span evidence and `GROUNDED|PARTIAL|EMPTY|FAILED` lifecycle states before promotion.

## GPU/NLP feature-materialization duplication audit (2026-08-12 — read-only, no code written)

Ran against a request to build "SemanticFeatureEnvelope / FeatureRow / FeatureMatrix / Arrow
snapshot / GPU memory owner / GEMM owner / hypergraph projection / ContextManifest" from
scratch. **Audited first per the reuse-first rule below — most of it already exists.**

| Capability | Existing owner(s) | Classification | Live callers | Verdict |
|---|---|---|---|---|
| A. Reusable semantic feature envelope | `atlas/feature-matrix-schema.ts` (`FeatureMatrixRowV1Schema`/`V2Schema`, identity chain + dense_768/384 + latent_64 + lexical + topology + classifiers) | `CANONICAL_OWNER` | 12 files incl. `runtime-registry.ts`, `master-feature-map.ts`, 8 `*.spec.ts` | **RESOLVED** — this already *is* `SemanticFeatureEnvelopeV1`, just under a different name. Do not create a parallel type. |
| A2. Source/POS/concept packet | `analysis/source-pos-concept-packet.ts` | `CANONICAL_OWNER` | 4 files (`daily-graphify-board-recommendations.ts`, `code-evidence-synthesizer.ts`, self, spec) | RESOLVED |
| B. Query-time FeatureRow | same `feature-matrix-schema.ts` file — no separate query-time type exists yet | `CANONICAL_OWNER` (extend, don't fork) | — | **PARTIAL** — schema has no `dense_semantic_score/bm25_score/ast_same_symbol/…` derived-score shape yet (FE5/FE6 below). Extend this file, do not create `feature-row-compiler.ts` as a peer type. |
| C. Contiguous FeatureMatrix (ordered, revisioned) | none in TS. Python `parent_atlas_tensor/feature_matrix.py` exists but owns a **different, narrower 5-column schema** (`entropy_norm, ast_signal, domain_fit, authority_norm, execution_utility` + 4-col topology) — not the same contract as `FeatureMatrixRowV1Schema` | `DEFERRED_UNTIL_CONSUMER` | Zero real callers found — only referenced by one-off proof scripts in `data/atlas-tensor-proof/*.py` (t3/t6b/t6c sweep scripts) | **Deferred until GA8/GA9 or a learned-policy consumer requires it.** Start with a narrower `SemanticSnapshotV1` (`semantic_768` plus ordinal/canonical identity and revisions); do not create a generic matrix without a live consumer. |
| D. Arrow IPC mmap artifact | Python `parent_atlas_tensor/arrow_ipc.py` — `fixed_f32`, `feature_batch` (N×5), `semantic_batch` (N×768), `write_ipc_file`, `open_mmap`, `sha256_file` | `EXISTING_BACKEND_WIRING_PENDING` | Same zero-live-caller status as C | **Writer exists but is not wired to the canonical snapshot path.** Reuse it for an immutable `SemanticSnapshotV1` before adding a new TS-side writer. |
| E. GPU memory owner | JS-side pool in `gpu/libtorch-bridge.ts`: `acquireFloat32`/`releaseFloat32`/`drainFloat32Pool`, `getCudaMemoryInfo`, `getMemoryPressure`, `vramNeededMB`, `gpuHasRoom`, `heapHasRoom` | `CANONICAL_OWNER` (for the N-API/LibTorch path) | Whole `gpu-graph-analysis.ts` stack | RESOLVED for the LibTorch path. **No RMM pooled-allocator init found anywhere in `python/parent_atlas_tensor/*.py`** (`rg` for `rmm\|RMM\|PoolMemoryResource` → 0 hits) — if a RAPIDS/cuDF/cuGraph path is ever actually exercised (it currently doesn't appear to be, per repeated `CANONICAL-PACKET-WIRING`/session notes saying RAPIDS work is deferred), that's a real, currently-absent capability. Do not build it speculatively — no live RAPIDS caller was found to need it. |
| F. GEMM/projection-scoring owner | `gpu/libtorch-bridge.ts` — `computeGpuSimilarity`, `attentionScoreGPU`, `rewardScoreGPU`, `pageRankGPU`, `kmeansWithCentroidsAsync`, `trainSOMAsync` (all via `tensorrt_bridge.node` N-API/LibTorch CUDA) | `CANONICAL_OWNER` | `gpu-graph-analysis.ts`, `karpathy-gpu-enrich.mjs`, ACE context-assembler attention path | RESOLVED — do not add a second `GpuMatrixOps` interface; extend this file's exports if a `scoreFeatureMatrix(X, W)` shape is genuinely missing. |
| G. Exact cosine oracle | `python/parent_atlas_tensor/cuvs_exact.py` + `atlas/retrieval/cuvs-sidecar-client.ts` + `retrieval/autoencoder-cuvs-bridge.ts`, plus `scripts/atlas/prove-pytorch-cuvs-parity.py` | `ORACLE` | `tests/retrieval/autoencoder-cuvs-bridge.spec.ts`, audit script `audit-turbovec-cuvs-readiness.mjs` | RESOLVED — do not create a second exact-cosine owner. |
| H. Hypergraph n-ary projection | `python/parent_atlas_tensor/nary_incidence.py` (`Member`/`incidence_batch` → PyArrow `RecordBatch`) exists **but is a projection with zero live callers today** alongside the used TS-side `graph/hypergraph-4d.ts` and `features/cases/hypergraph-4d.ts` | TS `graph/hypergraph-4d.ts` = `CANONICAL_OWNER`; Python `nary_incidence.py` = `FIXTURE_ONLY`; `features/cases/hypergraph-4d.ts` = **unclassified** | **MINOR DUPLICATION AUDIT OPEN** — classify the second TS file's content and callers before deciding whether it is a compatibility adapter or duplicate. Do not build a new HyperGraphRAG owner. |
| I. ACE ContextManifest | `ace/context-compiler.parent-atlas.ts` remains the contract compiler; `ace/ace-context-manifest.ts` is the additive bridge from live ACE context into that compiler. | `ARCHITECTURALLY_RESOLVED`, live adoption pending | Focused bridge tests pass for deterministic manifest IDs, lane mapping, and input immutability; no existing caller has been migrated and durable linkage is not live-proven. | **RESOLVED_ARCHITECTURALLY / LIVE_ADOPTION_PENDING** — do not rewrite `assembleACEContext`; adopt the bridge at a bounded caller and prove persistence plus `ExecutionReceipt`/`RLMTrace` linkage separately. |
| I2. Ancillary ACE re-export | `ace/ace-context-assembler.ts` — one-line re-export of `assembleACEContext` from `features/ai/ace/context-assembler.js` | `COMPATIBILITY` (possibly `DEAD` — zero callers found besides itself) | 0 external callers found | Flag for archival consideration; not touched. |
| J. BitFrost hot cache | `atlas/tensors/bitfrost-valkey-contract.ts` plus revision-qualified retrieval-key/fail-open SearchRuntime adapter | `CANONICAL_OWNER` | focused BF-01..06 contracts and RLM/SearchRuntime proofs | **PARTIAL_PROVEN** — cache-only ownership, workspace/policy revision isolation, revision-qualified retrieval keys, and fail-open behavior are proven. Pending: live `CLIENT TRACKING`, process-local L0 invalidation, expiry/eviction readback, and negative-cache receipt. |
| LangExtract grounding contract (Phase 2 in the earlier prompt session) | `analysis/ast-langextract-bridge.ts` | bridge exists, but **no proven `char_interval`/grounding/`GROUNDED|PARTIAL|EMPTY|FAILED` lifecycle contract** | — | **REAL OPEN CORRECTNESS GAP** — prioritize LX1/LX2/LX5/LX6/LX8/LX9 and the four LangExtract gates before FE5/FE6. Do not promote semantic observations from ungrounded or silent-empty results. |

### Not re-audited this pass (out of the low-effort budget for this sweep, do not assume clear)

RRF/reranker capability was **not** re-audited here — CLAUDE.md already documents this as
known `BASELINE_DEBT` (13+ reranker/rrf files, `canonical-rerank-executor.ts` self-declared
canonical, rest unclassified) and a fresh `rg` this pass turned up **30+** files matching
`*rrf*` alone. Do not add a 31st. If RRF work is needed, run `/audit-duplication reranker`
as its own bounded task before touching it — it is too large to fold into this sweep.
`embedding-contract-768.ts`/`embedding-contract.ts` (two files) and
`qdrant-collection-contracts.ts` were seen as heavily-used (67 files reference
`semantic_768`/`jina_code_768`) but not individually classified this pass — treat as
probably-canonical, not confirmed.

### Net effect of this audit

**Zero new canonical owners were created.** The audit is updated for work completed after
2026-08-12: the `ContextManifest` row is now **RESOLVED_ARCHITECTURALLY / LIVE_ADOPTION_PENDING**
because the additive ACE bridge exists and its focused tests pass; BitFrost is
**PARTIAL_PROVEN** with revision-qualified keys and fail-open behavior proven, while live
tracking/L0 invalidation and expiry/eviction receipts remain open. The primary semantic
correctness gap is LangExtract grounding (LX1/LX2/LX5/LX6/LX8/LX9). Capability C remains
**DEFERRED_UNTIL_CONSUMER**, and D is **EXISTING_BACKEND_WIRING_PENDING**; begin with a narrow
`SemanticSnapshotV1` rather than a generic matrix. Hypergraph H remains a bounded duplication
audit, not a new retrieval owner. Extend existing owners in place and do not fork parallel
schemas or fusion paths.

**Next bounded order:** LangExtract schema/grounding/worker gates → bounded ContextManifest
caller adoption and durable linkage → BitFrost live invalidation/eviction proof → hypergraph
file ownership audit → only then FE5/FE6 or GPU snapshot wiring.

### ACE0/ACE1 done (2026-08-12) — additive bridge, not a rewrite of `assembleACEContext`

`assembleACEContext` in `features/ai/ace/context-assembler.ts` is ~1400+ lines with many
early-return branches and 8 live production callers (`api/v1/query`, `api/cases/[id]/similar`,
`api/ace/summarize`, `api/synthesis/generate`, `api/sse/chat`, `mcp-tool-dispatch.ts`,
`openai-facade.ts`, `autonomous-agent.ts`). Editing its internals to emit a manifest directly
would be a high-blast-radius change for a single confirmation ("yes") — deliberately **not**
done. Instead, wired a **pure, additive bridge**:

- `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts` — new file,
  `buildContextManifestFromACE(context: ACEContext, opts)` maps `codebaseContext` (→ `dense`
  lane), `ragChunks`/`docChunks` (→ `dense`/`lexical`), `kbChunks` (→ `lexical`), `caseChunks`
  (→ `exact`), `kagNeighbors` (→ `graph`) into `ContextCandidate[]`, then calls the existing
  `compileContext()` from `context-compiler.parent-atlas.ts`. Does not call retrieval, does
  not mutate its input, does not touch `assembleACEContext` or any of its 8 callers.
- `ace-context-manifest.spec.ts` — 3 tests, all passing: empty context → zero-candidate
  manifest; lane mapping + deterministic `manifest_id` across two identical compiles; input
  `ACEContext` is never mutated. `tsgo --noEmit -p .` reports zero errors against either file.

**Adoption is opt-in**: any of the 8 existing callers can call
`buildContextManifestFromACE(aceContext, { request_id })` after they already have an
`ACEContext`, to get a `CompiledContext` (manifest + selected/rejected + deterministic
`prompt_packets`) — and, via `createDrizzleContextManifestPersistence()` (already in
`context-compiler.parent-atlas.ts`, needs the companion `0153_atlas_context_manifests.sql`
migration applied — **not verified live this pass**, only referenced in a code comment), can
persist it. **No caller has been switched over yet** — that's a separate, scoped decision per
route, not bundled into this change.

Also found and left unfixed (recorded, not touched): `ace/context-assembler.ts` itself
contains *both* a thin re-export block (the 8 real callers use this) *and* its own unrelated
`ACEContextAssembler` class with a parallel `ACEPacket`/`assemble()` shape — a second,
apparently-dead duplication inside the same file (0 external callers of
`getACEContextAssembler()`/`new ACEContextAssembler()` found). Separately, `ACEContext` itself
is declared in two places — `ace/types.ts` (the one actually imported, canonical) and
`types/parent-atlas-core.d.ts` (unaudited this pass) — flagging per the same pattern, not
resolved here.

EMB3A upstream revision-owner audit (2026-08-20): the read-only audit now returns
`REVISION_OWNER_NOT_PROVEN`. `atlas_packets` has workspace and representation revision
columns, but workspace values are all zero and only one representation value is non-zero;
`source_revision` and `representation_id` are absent. `atlas_ast_nodes.source_revision`
exists but has zero populated values, and no `atlas_representation_records` owner was found.
Non-null/default columns are not treated as revision authority. No Postgres, Qdrant, Valkey,
or canonical data was modified.

The audit distinguishes the existing representation writer candidate
(`sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`) from
the Qdrant projection writer. The former supplies representation lineage but
does not establish populated workspace/source revision authority; the latter
must remain a projection consumer until that upstream contract is proven.

GPH execution update (2026-08-20): focused materializer/adapter tests passed
7/7. `npx tsx scripts/atlas/prove-ast-failure-isolation.mts` passed 4/4 against
the live 8095 sidecar, proving per-file `ChunkingError`/recovery evidence while
neighboring files complete. `npx tsx scripts/atlas/prove-ast-incremental-extraction.mts`
returned `BOUNDED_PROVEN`, covering unchanged skip, changed-file re-extraction,
and explicit deletion tombstone input. These close bounded executor gates only;
production Graphify batch receipt, daily reachability, fallback policy,
persistence, and projection readback remain unproven. Native Tree-sitter
incremental reuse remains a separate optimization; do not switch `graphify:daily`
or promote the legacy extractor yet.

GPH production dry-run tranche (2026-08-20): added the bounded
`GraphifyStructuralBatchV1` orchestrator around the existing materializer; it
does not add a parser or persistence owner. Focused contract tests pass 3/3.
The live 8095 dry-run is `DRY_RUN_PROVEN`: 3 proven files, 1 recovered
malformed file, 1 unchanged skip, 1 changed re-extraction, and 1 deletion
tombstone. `productionPersistenceReadback=false` and
`graphifyDailyReachability=false` remain explicit. No canonical, Postgres,
Qdrant, Neo4j, or Valkey writes occurred. GPH-17 apply remains disabled.

GPH-17C reachability proof (2026-08-20): added an explicit
`GRAPHIFY_NATIVE_STRUCTURAL_ONLY=1` path to the existing startup wrapper. It
invokes the native structural materializer with `APPLY=0` and skips the
write-capable daily chain. After fixing missing public exports for the
existing evidence/symbol repositories in `@deeds/parent-atlas`, the bounded
limit-2 run returned `DRY_RUN_COMPLETE` and the wrapper receipt returned
`REACHABILITY_PROVEN_DRY_RUN`. The run processed two files with zero writes;
both were `COMPATIBILITY_ONLY`, so this proves invocation/reachability only,
not native provenance quality, persistence, or canonical owner acceptance.

Node challenger update (2026-08-20): added `createNodeTreeSitterAstProvider()`
behind the existing `AstProvider` interface. It uses the locked Node
`tree-sitter` plus TypeScript grammar, emits the existing
`atlas.ast.evidence.v1` shape, and remains noncanonical with persistence
`NOT_ATTEMPTED`. Its focused parity-seam test passes 1/1 and SvelteKit
TypeScript validation passes. This is a challenger only; 8095 remains the
current migration executor and no provider switch or apply path was made.
The next gate is a six-fixture comparison of Node versus 8095 names, spans,
typed edges, and diagnostics. Until that comparison and canonical identity
parity are proven, the Node provider remains `COMPATIBILITY_ONLY`.

Node/8095 comparison (2026-08-20): `npm run atlas:ast:node:parity` completed
all six fixtures with status `DEGRADED_COMPATIBILITY_GAP`. After adding
lexical declaration and import/export extraction, named declaration coverage
matches on the basic cases and Node emits import/export edges. Remaining gaps
are 8095 fragment/function recovery details, one class span mismatch, and
fewer typed edges than 8095. This is an honest compatibility result, not a
provider-switch gate. Report:
`docs/reports/ast-node-8095-parity.{json,md}`. No canonical writes occurred.
