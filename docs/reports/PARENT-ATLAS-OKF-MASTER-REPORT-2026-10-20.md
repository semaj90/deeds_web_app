# Parent Atlas OKF Master Report

**Status**: 47% average completion (10 workstreams) | **Commit**: uncommitted working tree | **Date**: 2026-10-20

---

## TL;DR

Most named pieces exist as code or contracts. Almost none is proven end to end, and nothing is live-admitted. The strongest areas are crawled documentation (83%), the domain taxonomy (67%), and the retrieval substrate (67%). The weakest is the feature_label NES LUT (0%), because no `feature_label` lookup table exists. The API-version tables (PyTorch 2.13/2.14, LangChain) are not built: there is no per-version schema and no agent that resolves package names.

## Method

Each workstream is scored on six gates. Completion = gates met / 6.

| Gate | Meaning |
|---|---|
| SPEC | A contract, schema, or design exists in the repo |
| CODE | An implementation exists |
| DATA | Real data exists for it (not just fixtures) |
| RUN | The code has executed against real data |
| PROOF | A receipt shows it passed an independent check |
| LIVE | It is wired into a live request path and admitted |

Scores come from files and live read-only queries checked on 2026-10-20. Items marked "not checked" count as not met.

## Completion summary

| # | Workstream | SPEC | CODE | DATA | RUN | PROOF | LIVE | Score |
|---|---|---|---|---|---|---|---|---|
| 1 | DSPy / GEPA prompt optimization | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | 33% |
| 2 | OaK / oaklib ontology kernel | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | 50% |
| 3 | Domain classification taxonomy | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | 67% |
| 4 | Per-package versioned API docs (.okf tables) | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | 33% |
| 5 | LangChain / deepagents package tables | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | 33% |
| 6 | Search / retrieval / indexing / ranking | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | 67% |
| 7 | ACE JSON packets | ✓ | ✓ | ◐ | ✓ | ✗ | ✗ | 50% |
| 8 | NES LUT (domain-keyed) | ✓ | ✓ | ◐ | ✓ | ✗ | ✗ | 50% |
| 9 | NES LUT for `feature_label` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | 0% |
| 10 | Firecrawl / BeautifulSoup crawl | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | 83% |
| | **Average** | | | | | | | **47%** |

◐ = partial. Average = (33+50+67+33+33+67+50+50+0+83) / 10 = 46.6, rounded to 47%.

## Workstream evidence

### 1. DSPy / GEPA (33%)
- **SPEC**: `python/atlas_contract_parity/agent_control_plane_v1.py` defines `GepaShadowInputV1` (`atlas.gepa-shadow-input.v1`), a shadow-only boundary mirror.
- **CODE**: `python/parent_atlas_dspy_repair.py:534` constructs `dp.GEPA(...)`.
- **Not met**: the subprompt audit (`docs/reports/dspy-gepa-subprompt-audit-v1.json`, 2026-08-31) records `dspyRuntime: NOT_PROVEN` and `gepaRuntime: NOT_PROVEN`. No optimization run with independently verified repair outcomes exists.
- The polyglot receipt (`docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json`, 2026-10-15, PASS) covers a summarizer and a tensor path. It is a non-canonical proof (`writesPerformed: false`, `canonicalAuthority: false`), not a GEPA optimization result.

### 2. OaK / oaklib (50%)
- **SPEC / CODE**: `python/atlas_oak_kernel.py` states the split: oaklib supplies deterministic ontology lookup; OaK supplies a frozen-schema, typed-function pattern. The kernel is bounded and does not mutate canonical data.
- **DATA**: 125 tracked oaklib-related raw files. The crawl validation (`docs/reports/okf-crawled-docs-validation-v1.json`, 2026-10-05) records the oaklib source as PASS: 237 chunks, 17 pages, zero duplicate ids, zero checksum mismatches.
- **Not checked**: the kernel running on `:8095` today. The RUN and LIVE gates stay open until that is checked.

### 3. Domain classification taxonomy (67%)
- **SPEC**: `.okf/domains/atlas-domain-taxonomy.yaml` is a snapshot of the PostgreSQL `atlas_domain_ontology` owner. It is `canonical: false`; the database is the authority. Schema: `.okf/schemas/domain-taxonomy-v1.schema.json`.
- **DATA / RUN**: `docs/reports/domain-classification-readiness-audit.json` reports `domain_class` coverage 100%, and the naive-Bayes lane 100%.
- **Not met**: the audit's overall status is `READY_WITH_GAPS`. The "feature envelope" gate fails (`ast_symbols` 20.27%, `used_concepts` 96.55%). Reviewed gold labels fall short of the CLAUDE.md floor of 200 rows and 30 per class, so classification accuracy is unproven.
- **Count note**: the snapshot contains 34 `group_id` entries. I did not split top-level from child groups in this pass.

### 4. Per-package versioned API docs (33%)
- **Not met (SPEC)**: there is no per-package, per-version `.okf` table schema. The only versioned corpus is DSPy 3.4.0 (`.okf/docs/dspy/corpus-3.4.0.json`).
- **Gap (DATA)**: zero PyTorch 2.13 or 2.14 tables exist. The only PyTorch-adjacent raw docs are under `docs/.okf/dev/raw/pytorch-numpy-pyarrow/` (Arrow and NumPy docs).
- **CODE / RUN**: the crawl pipeline (`python/atlas_okf_docs_pipeline.py`) produced receipts on 2026-10-05 and 2026-10-15.

#### Proposed table shape (not built)
Each package version gets one table, keyed by `(package, version, source_sha256)`:

| Field | Purpose |
|---|---|
| `package`, `version` | Exact name and version, e.g. `torch` `2.14.0` |
| `source_url`, `fetched_at`, `sha256` | Crawl provenance |
| `summary` | Short per-version summary (sub-header) |
| `completion_pct` | Gate-based completion for that version's docs |
| `status` | `SPEC` / `CODE` / `DATA` / `RUN` / `PROOF` / `LIVE` |

This needs a decision on the version source of truth before anything is built.

### 5. LangChain / deepagents (33%)
- **CODE**: `packages/atlas-orchestrator/package.json` pins `deepagents` `1.14.1`. The root `package.json` pins `@langchain/core` `1.2.1` and `@langchain/langgraph` `1.3.2`. `python/test_langchain_doc_chunking_adapter.py` exists.
- **DATA**: LangChain and LangGraph docs are crawled (under `docs/.okf/dev/raw/langchain-langgraph-*`).
- **Not met**: no code resolves package names or versions from the docs, and no `.okf` table is built from them. Package-name determination is not implemented. The LangChain/deepagents runtime is not checked.

### 6. Search / retrieval / indexing / ranking (67%)
- **SPEC**: `docs/MASTER-TOC-v2.md` (retrieval glossary, revision definitions); `semantic_768` is the canonical dense owner.
- **DATA / RUN**: 219,998 `content_embedding_768` vectors; a 1,808-row observation-feature table.
- **Not met (PROOF)**: the canonical-projection fabric audit is `NOT_SAFE_TO_PROJECT`, with 6 of 11 predicates below PASS (`docs/reports/atlas-canonical-projection-fabric-audit-2026-10-20.json`).

### 7. ACE JSON packets (50%)
- **SPEC / CODE**: `packages/parent-atlas/src/core/ace-packet-v2.ts`, `ace-packet-v3-admission.ts`, `ace-packet-v3-structural-composer.ts`; the builder `scripts/ace/build-packet.mjs`.
- **RUN**: `build-packet.mjs` produced a packet with 5 source refs and 12 cards on 2026-10-20.
- **Not met**: the packet carries no revision fields, and the builder's steps 2–3 only log ("simulated"). The `degraded` flag is unreliable (see the deep-audit notes). Cache admission is blocked, so no packet reaches the live cache.

### 8. NES LUT, domain-keyed (50%)
- **SPEC / CODE**: `sveltekit-frontend/drizzle/manual/20261018_atlas_nes_lut_v1.sql`; `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs`.
- **DATA / RUN**: 10 live rows, all with `lut_revision = atlas.nes-lut.v1`, all `canonical = false`. Keys are `domain_key` values such as `DOM_AUTH_GUARD` and `DOM_AGENT_OAK_RLM_DSPY`.
- **Not met**: not admitted, not used in ranking.

### 9. NES LUT for `feature_label` (0%)
- The live `atlas_nes_lut_v1` table has no feature-label column. Only the domain-keyed LUT above exists.
- The 0–15 `feature_label` taxonomy (chat, auth, canvas, …) appears in the pasted design only. It is not in the repo, and CLAUDE.md says current labels are filenames, not reviewed product labels.
- Unknown labels must be an explicit reject, not a default. The pasted code maps them silently to `rag_search`, which hides failures.

### 10. Firecrawl / BeautifulSoup crawl (83%)
- **SPEC**: crawl manifests under `.okf/docs/dspy/snapshots/…/manifest.json`; `docs/.okf/embeddinggemma2/crawl-receipt.json` (2026-10-15).
- **CODE**: `python/atlas_okf_docs_pipeline.py`; BeautifulSoup is the HTTP fetcher recorded in the validation receipt.
- **DATA / RUN**: 124 tracked Firecrawl and BeautifulSoup raw files; receipts dated 2026-09-28 and 2026-10-15.
- **PROOF**: the oaklib source passes its validation (2026-10-05). I did not read the other sources' results, so the PROOF gate applies to oaklib only.
- **Not met (LIVE)**: the validation receipt has `live: false`. No writes to Postgres, Qdrant, Valkey, or Neo4j.

## Verified facts this report depends on

| Claim | Source |
|---|---|
| Revision definitions are canonical | `docs/MASTER-TOC-v2.md` (Revision definitions table) |
| Revision corpus entry is schema-valid | `.okf/corpora/keyword-corpus.yaml` (19 entries, valid) |
| Live `atlas_observation_feature_rows` has revision columns, but the current rows do not satisfy admission: 1,797 of 1,808 match a canonical source binding path, 1,736 match its source revision, 0 match the row workspace revision, and all 1,808 registry revisions remain proposals | corrected read-only census, 2026-10-20; see ACE OpenSpec ledger |
| ORF reader rejects null revisions | `src/lib/server/atlas/retrieval/orf-feature-row-reader-v1.ts:117-119` |
| Decoder prefers canonical checkpoint, falls back to legacy | `python/atlas_neural_decoder_service.py:136-166` (source only) |

## Runtime and summary-provenance recheck (2026-10-20)

Read-only probes returned healthy responses from `:8095` (Tree-sitter, ast-grep, LangExtract capabilities), `:8098` (CUDA/cuGraph execution service; no PyTorch and no graph residency asserted), `:8791` (219,998 indexed 128-d 4-bit TurboVec projection), `:8090` (Ornith synthesis model), `:8100` (Go Retrieval dependencies connected), and TRACE `:8788` (MCP/Postgres/Redis healthy). These establish service availability, not a joined end-to-end path. TurboVec is a challenger; PostgreSQL `content_embedding_768` remains canonical. `:8095` observations are proposals and do not themselves establish canonical identity or eligible graph relations.

A fresh read-only PostgreSQL count found 274,465 codebase chunks, 219,998 canonical 768-d vectors, 40,306 nonblank summaries, and 560 rows with both summary and vector. The JULY summary provenance receipt (`docs/reports/july-summary-provenance-reconciliation-v1.json`, generated 2026-09-25) records 3,060 packets in a July 4 `gemma4_offline` layer and packet embedding timestamps on July 20–21. It explicitly leaves the exact summary writer and embedding input unproven. Current `updated_at` values cannot establish a summary-specific upsert date. Thus: July summary artifacts exist, but a canonical, revision-qualified summary upsert/embedding lineage is not proven.

The no-write status probe (`node scripts/atlas/pipeline-status-v1.mjs --no-write`) now reports:

| Stage | Current status | Evidence / boundary |
|---|---|---|
| TurboVec | `SERVING_INDEXED` | 219,998 vectors, 128-D, `CHALLENGER_ONLY`; not canonical or a second fusion vote |
| KMeans | `CANDIDATE_NOT_ACTIVE` | 52,380 assigned; candidate model trained on 197,987 |
| SOM / Manifold4 | `BLOCKED` / `MAN4_PRODUCER_ALIGNMENT_BLOCKED` | 49,301 SOM row values and 11,625 Manifold4 values do not establish producer lineage |
| Autoencoder | `DECODER_UP_QUALITY_UNPROVEN` | 55,169 latent-256 and latent-128; 1,703 latent-64; no quality/admission proof |
| Domain classification | `DOMAIN_CLASSIFIER_TRAINING_READY_FALSE` | 13 labels across 3 classes; 0 revision-qualified rows |
| Low-rank | `FIXTURE_PROVEN` | 11-candidate fixture only; not a live ranker |
| PostgreSQL schema | `SCHEMA_MATCHES_DRIZZLE_DECLARATION` | pgvector 0.8.3; 14 checks; 10 HNSW indexes |
| Multi-hop | `BOUNDED_TRAVERSAL_PROVEN` | deterministic weighted 4D traversal implementation; not a live qualified graph replay |

This supersedes the earlier `CREATED_EMPTY` TurboVec status in pasted output; it was stale relative to the live `:8791` probe. The status command is read-only and ran with `--no-write`; it did not exercise GPU kernels or DB writes. `did_you_mean` remains `NOT_PROBED`.

The latest PostgreSQL 18.4 read-only readback sees the recorded ORF backfill: 1,797 of 1,808 rows have the four revision columns populated. This is not admission: all 1,797 registry revisions remain `proposal:*`, and all 1,808 evidence arrays contain only their own packet key. `/api/ace/stream` remains correctly fail-closed without a server-owned admitted `ContextManifest` and cache identity. The next useful proof is a single revision-qualified candidate flowing through canonical retrieval → reviewed feature mapping → registry/evidence admission → bounded ACE prompt plan, with independent readback. Do not persist model KV state or vectors in Redis/Valkey; cache only permitted revision/checksum-addressed descriptors or context artifacts.

## Live retrieval / GPU blockers (2026-10-20)

A bounded, read-only MCP call initially failed at `EMBED_QUERY` because strict `:8081` was down. After explicit operator authorization, the existing launcher was started CPU-only (`EMBED_SERVER_NGL=0`; batch 128, ubatch 64). `/health` returned `ok`, `/tokenize` returned 6 tokens, and `/v1/embeddings` returned a finite, unit-normalized 768-D vector. Repeating `atlas.packet_dense_search` with the canonical `source_ref` returned `OK`, one joined candidate, and no degraded reasons. This proves the strict embedding→MCP dense-search execution path for one bounded request; it does not prove model/artifact parity or ACE admission.

The configured `embeddinggemma-300m-f16.gguf` file is present locally (621,867,360 bytes), and model/tokenizer/input-policy revision settings are populated. The existing VS Code launcher defaults `EMBED_SERVER_NGL` to 99 (full GPU offload); live Ornith `:8090` remains independent. The authorized smoke test used `NGL=0`, leaving GPU offload disabled. The one query result is still not admitted: `packet:f14acd5c1dec` had NULL `source_revision`, empty `workspace_revision_key`, legacy `workspace_revision=0`, and filename-derived feature fields. A corrected PostgreSQL 18.4 read-only join using canonical `workspace_revision_key` found 32,298 populated keys and 16,151 exact DB-to-DB source-binding joins; this is not proof of current disk bytes or reviewed taxonomy mapping. The ACE route's binding is stale versus disk (7,932 vs. 9,041 bytes; source digests differ). A `chat` packet (`packet:b78dc41fcfcf`) does match current local source bytes and a source/workspace binding at an older sealed workspace revision; its stored filename label is only a proposed mapping to catalog label `chat`. Retrieval execution is proven for the bounded request, while current-workspace-qualified candidate → reviewed feature mapping → ContextManifest → safe cache path remains blocked. Do not relax admission or persist tensors/KV state.

The `chat` packet's stored artifact is not yet usable as a ranker/ACE feature: read-only readback found a 768-D vector plus a legacy 384-D vector and a summary, but `representation_revision=0`, `embedding_digest` and `summary_hash` are empty, and no ORF row exists for the packet. Its 10 chunk-lineage rows cite only a local frozen-proposal JSON receipt. The current source contains the summarized citation handlers, which establishes topical overlap, not provenance, semantic parity, or admission. Keep the `chat` label association and stored artifacts proposal-only until a trusted feature row binds the source, representation, summary, and evidence receipts.

The RAPIDS `GET /v1/graph/resident` endpoint reports `resident: null`; it advertises a cuGraph PageRank capability, not a loaded graph. `:8095` reports ast-grep/Tree-sitter/LangExtract available but no cuGraph/cuVS, and `:8098` is the separate CUDA graph executor. No live query embedding or vector search completed in this probe; no cache, database, graph, model, or GPU write/execution occurred. The first live retrieval blocker is canonical query-embedding endpoint alignment; after that, qualified candidate/evidence and manifest admission remain separate gates.

## Not verified in this pass

- DSPy and GEPA runtime (only the 2026-08-31 audit).
- The OaK kernel running on `:8095`.
- LangChain or deepagents runtime behavior.
- Crawl validation results for sources other than oaklib.
- Top-level vs child split of the 34 taxonomy groups.
- PyTorch version pinning and the WSL environments.
- Any claim taken from the pasted design that isn't listed above.

## Priority order

1. **Revision source for the ORF backfill** (blocks workstreams 6, 7, 8). Nothing in the repo owns it yet.
2. **`feature_label` taxonomy owner and reviewed mapping** (blocks workstream 9). Decide whether unknown labels reject.
3. **Reviewed gold labels** (blocks workstream 3 PROOF): 200 rows, 30 per class.
4. **Version source of truth for package tables** (blocks workstreams 4 and 5). Decide before building any per-version table.
5. **Live check of the OaK kernel and DSPy/GEPA runs** (moves workstreams 1 and 2 forward).
