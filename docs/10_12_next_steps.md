# Parent Atlas — 2026-10-12 Next Steps

**Purpose:** one dependency-ordered workstation roadmap for the Parent Atlas indexing, retrieval, ACE, graph, and GPU work. This is a navigation document, not a new task authority. The owning OpenSpec `tasks.md` files remain the source of gate status; this document does not check their boxes, authorize writes, or turn fixture results into production proof.

**Status vocabulary:** `BLOCKED` means a named prerequisite is missing; `OPEN` means the gate has not been proven; `TESTED` means only the stated focused contract/fixture passed; `LIVE-OBSERVED` means a bounded service responded, not that its output is admitted; `PROVEN` requires revision-bound evidence and independent readback for the stated scope.

## Current checkpoint

- **First blocker:** no current source/workspace cohort has exact bindings and packet-to-chunk closure. The post-edit full-byte snapshot and database-enforced read-only cohort comparison are recorded in `.tmp/atlas/production-hardening-seed-20261012/current-worktree-binding-readback-v1.json`; the earlier `0689ab…` capture is historical because this checkpoint and ledger are themselves snapshot inputs. The admitted Graphify cohort `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` has 24,456 bindings but is a different snapshot. Do not backfill/relabel that execution or join snapshots; establish a newly admitted source-binding/Graphify cohort for the exact current revision first.
- **Identity before enrichment:** packet/chunk membership, exact source bytes/spans, source revision, workspace revision, and representation revision must resolve through their existing owners. No inferred title, path, hash alias, ordinal, or model output substitutes for those owners.
- **Structural data:** AST/CST and symbol owners exist, but historical regex symbols are diagnostic/derived. The workstation census records 10,121 eligible code rows, 9,161 with stored symbols, 8,261 with tree IDs, and 9,866 with null stored `content_hash`; these counts are not native extraction admission or current-source proof.
- **Dense retrieval:** packet-dense-search focused tests passed 7/7; full PDS-00 census, row-level source/representation lineage, production caller, and independent readback remain open. Qdrant and cuVS are projections/executors, not identity owners.
- **Graph and context:** current admitted packet-bound graph incidence, an admitted ontology tuple, and independent ContextManifest readback are not established. Graph algorithms and HyperGraphRAG cannot manufacture these prerequisites.
- **Model and service boundaries:** a read-only `:8090/v1/models` observation returned `ornith-1.5-9b`; this does not attest effective context configuration or prove all legacy Ollama chat callers are gone. `:8095/health` was unavailable in the cited audit. The June ACE packet remains recovery-only; missing active-packet behavior still needs consumer-level verification.
- **GPU:** a 10,000-row exact cuVS measurement is `MEASURED_NOT_PROMOTED`: repeat ordinals and small distance error were observed, but tie-order parity, the frozen metric/normalization contract, the expected service route, and canonical lineage remain open. CAGRA is quarantined.

## Dependency-ordered phases

| Phase | Gate and owner | Do next | Exit evidence | Status |
|---|---|---|---|---|
| 0. Preserve authority and safety | Security boundary; ACE recovery; owning OpenSpec ledgers | Keep `codebase.awk_analyze` unavailable until its shell path is replaced safely; preserve June packet artifacts outside active evidence paths; verify every active ACE consumer rejects a missing/unqualified packet without historical fallback. Keep the workstation roadmap a projection. | Safe MCP tool listing after operator-managed TRACE restart; explicit consumer `ACE_PACKET_UNAVAILABLE`/blocked result; no active-path fallback; ledger links retained. | `TESTED` source boundaries; live/restart and ACE consumer proof `OPEN` |
| 1. Freeze source cohort | Workspace/source binding; `DIR-INDEX-01`; `WORKSPACE-SOURCE-BINDING-01` | Reconcile the current tree revision with its authoritative source-binding cohort. Identify source types for unresolved references and require owner-backed readback. Do not backfill the older Graphify workspace by relabeling a new run. | One workspace/source revision, exact bytes/digests, deterministic inventory, and independently read-back bindings for the bounded cohort; explicit zero writes unless a separate apply is approved. | `BLOCKED` |
| 2. Close packet/chunk identity | Packet identity and `DIR-INDEX-02`; packet digest bridge and lineage owners | Trace one exact packet through source binding, chunk producer, chunk identity, and packet/chunk lineage. Recompute each digest using its actual owner and reject ambiguous, missing, or cross-revision links. | Same packet key, source ref, source/workspace revisions, exact UTF-8 chunk span/checksum, producer receipts, and independent readback. | `BLOCKED` |
| 3. Establish structural evidence | `DIR-INDEX-02B`, AST/POS grounding, `GPU-01`, symbol TOC owner | Once phases 1–2 pass, call the existing 8095 Tree-sitter/AST-grep owner on one qualified source; verify returned revision token, native symbol IDs, byte spans, and relation endpoints. Join symbols to canonical packets only through the existing symbol/packet owners. | Reopened source-byte digest and exact span checks; source/workspace revisions; parser/extractor revisions; qualified symbol join and scratch-only TOC receipt. | `LIVE-OBSERVED` (8095 `:8095/ast/chunk` returned 17 chunks, 119 edges via treesitter-chunker 4.0.0; Symbol TOC readback passes 8/8 tests) |
| 4. Qualify feature and embedding families | `DIR-INDEX-03/05/07`; enrichment writer census; `MODEL-RECEIPT-READBACK-01` | Reconcile each enrichment writer/caller with its family owner. For `semantic_768`, bind model artifact, tokenizer/input policy, pooling, normalization, chunk identity, and representation revision. Keep AST, summary, domain, cluster, and embedding admission distinct. | Writer/caller/predicate/readback map; frozen representation descriptor; finite 768D vector and digest; exact source/packet/chunk join; independent readback. | `BLOCKED` for current cohort; summary owner remains its separate governed path |
| 5. Establish lexical and document retrieval | `DIR-INDEX-04/06`; PostgreSQL FTS/pg_trgm and Qdrant projection owners | Use PostgreSQL’s existing FTS/trigram/pgvector owners and planner behavior; inspect indexes/query plans only against qualified candidates. Reconcile `.okf`/OpenWiki source envelopes before document indexing. Keep Qdrant payloads revision-qualified and rebuildable. | Frozen query/candidate set; exact logical lane identity; source-bound document/chunk checksums; Postgres/Qdrant round-trip to canonical identity; one semantic vote after deduplication. | `OPEN`; full corpus lineage/admission blocked |
| 6. Freeze candidates and deterministic ranking | `DIR-INDEX-10/11`; SearchRuntime fusion owner; KNN-TOPK gates | Build the candidate ordinal map only from an admitted population. Resolve KNN tie policy and metric/normalization before GPU/service-route comparison. Keep rank features and executor diagnostics separate from identity and evidence. | Replayed ordinal-map checksum; unique canonical identities; deterministic tie handling including Kth-boundary ties; frozen cosine/normalization contract; independent CPU oracle. | `BLOCKED` on admitted population; KNN service and parity gates open |
| 7. Build graph/topology projections | `DIR-INDEX-08`; ontology/hypergraph incidence owners; GPU-12 | Admit typed relations only through their source/evidence and ontology owners. Construct a frozen packet-bound incidence snapshot; compare NetworkX CPU results before cuGraph/Neo4j challengers. Similarity, taxonomy, and domain labels are not structural edges. | Exact source-grounded endpoints and spans; admitted tuple/edge receipts; graph revision/checksum and candidate-map join; CPU replay; separate GPU parity if admitted. | `BLOCKED` on current admitted incidence |
| 8. Assemble ACE and ContextManifest | ACE/RLM `LINEAGE-E2E-01A..E`, `CTX-MANIFEST-01`, `DIR-INDEX-12` | Carry the same qualified candidates through retrieval, canonical resolution, selection, token budgeting, and the existing manifest/prefill owners. Verify persisted manifest independently; only then send bounded evidence to Ornith `:8090`. No cache warmup or June-packet fallback to force a pass. | One query-to-candidate-to-admitted ACE packet-to-ContextManifest readback chain with matching IDs/revisions/checksums and inference receipt; committed writes explicitly accounted for. | `BLOCKED` |
| 9. Wire agentic DAG and error fixing | Existing PrimeAgent/DAG, MCP registry, `DAG-ERROR-01`, `PRIMEAGENT-ORNITH-HANDOFF-01` | After phase 8, permit only bounded read-only tool plans against registered, schema-validated tools. Repairs stay proposals until authorization, validators, bounded execution, and independent readback pass. | Query → validated plan → allowlisted tool receipt → grounded claim → validated repair DAG → bounded execution/readback; mutation authorization recorded separately. | `OPEN`; no production request-to-manifest chain proven |
| 10. Add cache/residency decisions | BitFrost/Valkey, `MEMORY-SWAP-01`, `INTENT-ACE-LINEAGE-01` | Only after admitted snapshot/manifest: reuse existing cache owners for revision-qualified descriptors, leases, invalidation, and bounded prefetch/release. Cache compact references/approved ACE cards, never canonical truth, tensors, hidden thoughts, or model KV. | Cache key and descriptor bind workspace/candidate/representation/graph/model revisions and checksums; lease generation, stale rejection, resource budget, and readback/eviction receipts. | `OPEN`; do not populate cache to manufacture proof |
| 11. Prove runtime and GPU execution | GPU-05..14, KNN-TOPK-02..07, `DIR-INDEX-14` | Freeze float32 cosine and normalization policy; make top-K tie behavior correct at the boundary; reconcile the deployed 8098 image/routes before endpoint tests. Confirm CUDA/PyTorch/cuVS/cuGraph and device ownership in the intended environment. Keep CAGRA quarantined. | Same frozen ordinal snapshot across CPU/GPU; 50/50 deterministic ordered parity; route/request readback; tolerances, latency, memory/VRAM and failure fallback; corpus lineage proof before promotion. | `MEASURED_NOT_PROMOTED`; route/tie/lineage open |
| 12. Evaluate derived routing and training | KMeans/SOM 20×20; low-rank/PCA/SVD/MLP; `MODEL-QLORA-01`; Titans research | Use a frozen, qualified feature matrix and deterministic CPU baseline first. Treat centroids, coordinates, HMM/Viterbi, TurboVec, and learned recommendations as advisory. Keep QLoRA/Titans offline on versioned data with held-out evaluation and reset/checkpoint tests; no model promotion from cache telemetry. | Revision-qualified matrix/feature map; deterministic baseline and held-out utility/latency; CPU/GPU numerical parity; train/eval provenance, license, rollback and explicit promotion decision. | `DEFERRED` until phases 1–8 provide qualified inputs |
| 13. Acquire and organize documentation | `.okf` schema/admission owner; OpenWiki; `DIR-INDEX-09`; master TOC | Inventory existing local `.okf`/OpenWiki docs first. For new web/PDF sources, use the existing acquisition/admission route, capture URL/license/fetch time/raw and normalized digests/parser revision, and use OCR only when the source is genuinely scanned. Validate schema/semantics/canonical form/checksum before indexing. | Source manifest, reviewed admission envelope, exact document/chunk byte spans, citations/license, and qualified retrieval readback; no unreviewed corpus promotion. | `OPEN`; no crawl/index authorization implied |
| 14. Optimize only measured bottlenecks | SIMDJSON/N-API, Arrow/mmap, cuTile/SIMT, GPJSON, transport | First measure the validated production-shaped path. Keep V8 parsing if the N-API SIMDJSON challenger does not win end-to-end; keep mmap/Arrow, custom kernels, and alternate runtimes optional until copies, latency, or memory pressure are measured. | Reproducible same-input benchmark, correctness parity, bounded resource use, and a separately reviewed deployment decision. | `DEFERRED` |

## Immediate execution order

1. Read the owning ledgers and select one already-qualified seed; if no seed satisfies source and packet/chunk identity, stop and report the first missing owner rather than manufacture one.
2. Close the current workspace/source binding and exact packet/chunk crosswalk for that seed, read-only first.
3. Prove native AST/source-span extraction and feature/representation identity on that same seed.
4. Prove one retrieval result through canonical candidate resolution and deterministic ranking.
5. Prove admitted graph incidence only if a real admitted tuple exists; then independently read back ContextManifest and ACE.
6. Only after those gates pass, evaluate cache residency, GPU parity, agentic DAG execution, and advisory low-rank/KMeans/SOM recommendations.

## Owner map

- Workstation dependency projection and historical status: [`parent-atlas-workstation-todo.md`](parent-atlas-workstation-todo.md).
- Directory inventory through GPU/gRPC sequence (`DIR-INDEX-01..15`): [`parent-atlas-canonical-directory-ingestion-fabric/tasks.md`](../openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md).
- ACE, source-to-retrieval lineage, ContextManifest, BitFrost, and agentic gates: [`parent-atlas-ace-rlm-bitfrost-integration/tasks.md`](../openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
- Dense identity/search proof: [`parent-atlas-packet-dense-bitmap-search/tasks.md`](../sveltekit-frontend/openspec/changes/parent-atlas-packet-dense-bitmap-search/tasks.md).
- GPU runtime/KNN/CAGRA and accelerator experiments: [`parent-atlas-workstation-gpu-runtime-backlog.md`](parent-atlas-workstation-gpu-runtime-backlog.md).
- Candidate feature/model/QLoRA/graph-retrieval gates: [`parent-atlas-candidate-feature-execution-fabric/tasks.md`](../openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md).
- Pass-fabric packet identity, NLP, ontology, and graph incidence: [`parent-atlas-pass-fabric/tasks.md`](../openspec/changes/parent-atlas-pass-fabric/tasks.md).

## Qdrant collection and snapshot classification (2026-10-12)

Source: `.tmp/atlas/snapshot-retention-20261012/collections-inventory.tsv` (read-only, 48 collections). Retention target: keep the latest two snapshots per collection; never prune the only snapshot of a collection; archive with a checksum before any deletion. No rebuild path is verified for any collection yet, so snapshots are the only recovery copy.

| Class | Collections (points, snapshots) | Recovery status |
|---|---|---|
| Canonical semantic | `codebase_chunks_768` (328,348, 2) | Keep. Rebuild via `atlas:qdrant:768:restore` untested. |
| Challenger / derived | `codebase_chunks_768_v2` (52,816, 2); `codebase_chunks_512` (53,380, 2) | Keep until cutover owner decides (`_768_v2`) or 512 rebuild from 768 is verified. |
| Latent / topology | `codebase_topology_64` (105,761, 2); `codebase_chunks_latent256` (55,169, 0); `codebase_topology_128` (0, 1) | `topology_64`: Postgres holds only 1,703 `latent_64` rows, so not rebuildable from Postgres; keep. `latent256`: **no snapshot, no recovery copy**; gap. |
| Experiment with owner | `phase110_baseline_768` (2,467, 2); `taxonomy_nodes_768` (5,527, 0); `error_embeddings` (20, 1) | Keep. `taxonomy_nodes_768` has **no snapshot**; gap. |
| Legacy 384 (pending) | `codebase_chunks_384` (1, 1); `codebase_chunks_384_hybrid` (10, 1); `codebase_chunks_sparse_test_v1` (500, 1) | Retired lane per CLAUDE.md, still referenced by 73, 50, and 5 files. Prune only after explicit approval and checksum archive. |
| Orphaned experiment | `error_embedding_mrl_128/256/512` (20 each, 0 snapshots, 0 references) | No recovery copy; candidate for review, not deletion. |
| Unreferenced | `sc_deedscodebase_deeds-web-app` (1,025, 1, 0 references) | Owner unknown; review before any action. |
| Cache / memory (rebuildable by design) | `BifrostSemanticCachePlugin` (18), `llm_response_cache` (14), `cluster_narratives` (18), `synthesis_memory_768` (8), `chunks_web_search` (11), `sc_deedssocraticode_metadata` (1) | Caches; low recovery value. |
| Empty (config-only snapshots) | 27 collections with 0 points, one snapshot each (includes `codebase_topology_128`) | Snapshot holds config only; no data loss from pruning, but recreate config before any deletion. |

pgvector alignment (bounded read-only sample, 2026-10-12): 2,000 points from `codebase_chunks_768` gave 1,312 distinct `chunk_id`s, 662 points without a `chunk_id`. 1,302 of the 1,312 match a `codebase_chunk_index` row, and all 1,302 have a non-null `content_embedding` (halfvec). None has `content_embedding_768`. So the Qdrant 768 collection is aligned with the halfvec column, while CLAUDE.md names `content_embedding_768` as the current physical owner. That conflict is unresolved and needs an owner decision before either column is treated as canonical.

Consolidation policy going forward:
- `scripts/operator/backup-atlas-state.mjs`: the automatic prune is removed from the working tree (uncommitted); it now lists older snapshots for explicit review only.
- Prune only per approved list, after SHA-256 archive and re-list verification.
- Each unrebuildable collection needs a recorded rebuild path or stays snapshot-protected.

## Error-fixing and dense-search checks (read-only, 2026-10-12)

| Check | Evidence | Status |
|---|---|---|
| Error capture | `hooks.server.ts` logs to `error_logs` (`logError`, TODO-LOG-01). Live table has 1 row (`not_found_error`, INFO, unresolved, 2026-10-13 00:36 UTC). | Wired, very low volume |
| Stored fix patterns | Postgres `fixer_patterns`: 0 rows. Qdrant `fixer_memory_768`: 0 points (768, cosine). | Empty; recall returns nothing |
| Repair runner | `scripts/agentic-error-fix.mjs` runs `check:ultra-fast`/`check:svelte:fast` or `check`/`check:ts7` via `spawnSync`. It runs checks only, with no mutation. | Diagnostics only |
| Repair planning | MCP `repair_tools.ts`: HMM and toposort planners. | Advisory; not a fix applier |
| Dense search collection | `create-codebase-search-backend.ts` uses `process.env.QDRANT_COLLECTION`, named vector `content`. | **Conflict**: `sveltekit-frontend/.env.local` sets `legal_documents` (0 points), root `.env` sets `codebase_chunks_768`. Effective value not yet confirmed. |
| Semantic constant | `QDRANT_SEMANTIC_COLLECTION` = `codebase_chunks_768`. A comment in `qdrant-search.ts` still says `_768_v2`. | Stale comment; the constant governs |

Error-fixing LUT from indexed data does not exist yet: no fix patterns are stored, and the repair path only runs checks. Do not describe it as operational.

## Web search alignment audit (read-only, 2026-10-12)

| Check | Evidence | Status |
|---|---|---|
| SearXNG port | `SEARXNG_URL=http://localhost:8889` in root `.env`; `:8889/search?format=json` returns results | Aligned (AGENTS.md: 8889) |
| Port 8888 | Answers 200 as SeaweedFS Filer, not SearXNG | Aligned; do not treat 8888 as search |
| Result provenance | `SearchResult` (`agent/tools/web-search.ts`): url, title, snippet, source, method, duration, plus optional `rank`, `retrievedAt`, `provider` (added 2026-10-12, SearXNG path only) | **Partial**: still no published date or content digest; curated rows carry no provenance |
| Owners | `agent/tools/web-search.ts` (`webSearch`, `multiSourceSearch`); routes `/api/websearch` and `/api/web/search`; MCP `ldr-research` and `research_tools.ts`; analytics `ldr-client` and `agentic-web-indexer` | **Duplicate owners**: several entry points, no single canonical owner recorded |
| Fallback chain | SearXNG, then DuckDuckGo HTML scraping, then a curated list | Scraping and curated fallback need a policy decision |
| Persistence | No web-search results table. External documents land in `atlas_external_doc_pages`, `_chunks`, `_analyses` | Pages captured by a separate path |
| Identity boundary | Search rank is not relevance or identity (AGENTS.md) | Not enforced in the result type |
| OpenCode fetch | `.opencode/opencode.jsonc` defines `web-research-fetch` as a read-only subagent using `llama-server/ornith-1.5-9b`, with `webfetch`/`read` allowed and store/write tools denied | Present as URL fetch-and-summary; not a corpus indexer or admission route |
| Firecrawl / BeautifulSoup | MCP `analytics:unified_research` can fetch a URL through optional Firecrawl with HTML fallback; the external-doc pipeline also has Firecrawl capture and a Python BeautifulSoup acquisition/parser path | Existing capture/parser owners; fetched content remains untrusted until existing admission/readback; no new crawl authorized |
| Author metadata | External page schema/admission currently stores `publisher`, but no dedicated author field or extraction receipt was found | Gap: define source-tagged author extraction and review contract before schema or corpus changes |
| Model boundary | Unified-research self-prompt now uses `resolveLlamaInferenceTarget()` and the configured Ornith llama-server target; the deep-research synthesis adapter routes through `bifrostChat` | Source-aligned; live end-to-end request path not proven here |

Next: reconcile duplicate web-search entry points under the existing owner; decide whether HTML scraping remains; define author provenance in the external-doc owner. Do not crawl, add columns, or index into PostgreSQL/Qdrant without separately approved scope and admission evidence.

## Canonical skeleton for next steps (2026-10-12)

1. **Confirm dense collection.** Check which `.env` the app loads and which value wins for `QDRANT_COLLECTION`. Read-only. Gate: effective value recorded.
2. **Snapshot safety.** Keep latest two per collection. Prune only the approved 384 set after a name confirmation and checksum archive. Restore test on a scratch collection before any further deletion. Gate: restore receipt.
3. **Lineage.** Resolve the `halfvec` `content_embedding` vs `content_embedding_768` owner conflict, and the 662 no-`chunk_id` points in the sample. Gate: owner decision recorded in CLAUDE.md-linked ledger.
4. **Error fixing.** Store only verified fixes into `fixer_patterns` and `fixer_memory_768` through `storeFixerPattern`. Gate: 1+ verified pattern with readback.
5. **Dense search proof.** Run one query through the canonical collection and confirm hits resolve to Postgres rows. Gate: resolved candidate receipt.
6. **Glossary.** Root `.okf/` copy is canonical. Archive `docs/.okf/` copy on approval.

## Non-goals and stop conditions

- Do not run `graphify:daily`, apply a source-binding/backfill/migration, mutate PostgreSQL/Qdrant/Neo4j/Valkey, restart a service, crawl/index external docs, launch GPU workloads, or train/merge models as part of this roadmap.
- Do not add a second packet, feature, ranking/fusion, cache, graph, or manifest authority. Reuse the named owners and update their ledgers only when the associated proof is actually obtained.
- Stop at the first missing or mismatched identity/revision/evidence boundary. Record `BLOCKED`/`NOT_VERIFIED`, not an inferred success.
- Preserve all existing user changes and historical reports; this document does not authorize cleanup, file moves, or deletion.

```yaml
likely_cause: Workstation tasks span many owners and phases, while fixture, planner, live-component, and admission evidence were previously easy to conflate.
evidence: [docs/parent-atlas-workstation-todo.md, openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md, openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md, sveltekit-frontend/openspec/changes/parent-atlas-packet-dense-bitmap-search/tasks.md, docs/parent-atlas-workstation-gpu-runtime-backlog.md]
patch_targets: [docs/10_12_next_steps.md]
safe_next_command: "rg -n 'BLOCKED|OPEN|Next Steps|DIR-INDEX|PDS-00|LINEAGE-E2E-01' docs/10_12_next_steps.md"
smoke_command: "git diff --check -- docs/10_12_next_steps.md"
report_path: docs/10_12_next_steps.md
```
