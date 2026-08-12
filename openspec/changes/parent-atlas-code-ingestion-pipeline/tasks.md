# Parent Atlas — Code Ingestion Pipeline (Chunking → Embedding → Rerank → Synthesis)

**Status**: Architecture frozen 2026-08-12, not yet implemented/audited. No code written for this change.

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
- **Tree-sitter is the structural-truth parser backend.** ast-grep is a structural query/rewrite tool, not an identity owner — it must not mint `symbol_id`/`parse_node_id`.
- **The chunker chooses spans; GIS chooses identity.** `StructuralChunkV1` is a chunk-boundary contract, not an identity contract — `parse_node_id`/`symbol_id`/`symbol_version_id`/`chunk_id`/`packet_key` are assigned downstream by GIS, never by the chunker itself.
- **LangExtract owns prose/log/research entity extraction, never code identity.** Ungrounded extractions (no `char_interval`) must not be promoted to canonical evidence.
- **Every representation gets its own index + its own exact oracle** — `turbovec_semantic_768_v1` (EmbeddingGemma) and `turbovec_jina_code_v1` (Jina, if promoted) are separate TurboVec indexes, each compared only against its own cuVS brute-force oracle. Never mix representations in one index.
- **Existing evidence pipeline is reused, not replaced.** `SourcePosConceptPacket` → `CodeEvidenceSynthesizer` → `analysis_pass_results` → outbox → board already exists and is live (per Session 199-200 memory + this session's readback/outbox work) — extend it with provenance/identity fields, don't build a parallel `CodeSemanticUnitV1` subsystem.

## Audit tasks (do first — do not add a new chunker/encoder/transport before these run)

| Task | State | What it answers |
|---|---|---|
| **CHUNK0** `/audit-duplication chunking` | PARTIAL_PROVEN | Which structural extraction path is `CANONICAL_OWNER`: in-process TS bridge (`ast-langextract-bridge.ts`, confirmed live — `code_feature_registry` worker routes through it), Python `treesitter-chunker` sidecar (:8095, also real — installs `tree-sitter`, `tree-sitter-language-pack`, `ast-grep-py`, `langextract`), or legacy `ast-chunker.ts` (ts-morph-based)? Live worker wiring now uses the bridge; canonical owner still needs the duplication audit. |
| **CHUNK1** compare output contracts | NOT STARTED | Do the TS bridge and Python sidecar emit compatible chunk shapes, or does switching ownership change packet identity? |
| **CHUNK2** demote redundant path | NOT STARTED | Classify the loser `COMPATIBILITY`/`LEGACY`, not delete (Archival Rules) |
| **TURBOVEC** `/audit-duplication turbovec` | **DONE 2026-08-12** | See `openspec/changes/parent-atlas-error-research-lane/tasks.md` — 4 live uncoordinated transports found (HTTP :8791, gRPC, Rust N-API, `child_process.spawn` CLI), NEW_CONFLICT, not yet resolved |
| **LX0** LangExtract runtime grounding proof | PARTIAL_PROVEN | import is real `langextract` (not a stub), call reaches the 8095 sidecar, model provider explicit, extraction schema/examples explicit, grounded source spans returned, ungrounded extractions rejected/marked (not silently promoted), extraction provider revision persisted, failures explicit (not silently empty-success), `SourcePosConceptPacket` actually receives LangExtract-derived fields, live `code_feature_registry` worker exercises this path end-to-end |

Live implementation note (2026-08-12): `sveltekit-frontend/src/lib/server/analysis/worker.ts` now routes `code_feature_registry` through `ast-langextract-bridge.ts` before packet synthesis. That means the live worker path is no longer AST-grep-only; it merges AST-grep, LangExtract, and tree-sitter fallback evidence before `SourcePosConceptPacket` / `CodeEvidenceSynthesizer` / `analysis_pass_results`. `ast-chunker.ts` remains the legacy compatibility path until CHUNK1/CHUNK2 close.

## Embedding/retrieval sequence (after CHUNK0/LX0 close)

| Task | State |
|---|---|
| EMB0 prove current EmbeddingGemma writer emits real 768-dim normalized `semantic_768` with correct query/document prompting + representation_revision | NOT STARTED |
| EMB1 build Tree-sitter semantic-card corpus (FILE/MODULE/CLASS/INTERFACE/FUNCTION/METHOD/TYPE units, not arbitrary token windows) | NOT STARTED |
| EMB2 re-embed semantic cards with canonical EmbeddingGemma | NOT STARTED |
| EMB3 verify Qdrant semantic_768 + lexical_bm25 | NOT STARTED |
| EMB4 exact cuVS brute-force oracle on EmbeddingGemma 768d | NOT STARTED |
| EMB5 TurboVec index from the same semantic_768 vectors (once TURBOVEC conflict above is resolved) | NOT STARTED |
| EMB6 measure TurboVec vs exact oracle (Recall@K, NDCG, latency) | NOT STARTED |
| CODE0 add Jina `jina_code_768` as EXPERIMENTAL second dense lane | NOT STARTED |
| CODE1 evaluate EmbeddingGemma-only vs Jina-only vs fused (Recall@5/10/50, MRR, nDCG@10, symbol/repair localization, latency, RAM/VRAM, index size) | NOT STARTED |
| RERANK0 Mixedbread reranker after canonical fusion (top-50 → top-10, fail-open) | NOT STARTED |
| ENRICH0 Ornith 9B semantic-card synthesis path, schema-bound output (`CodePatternObservationV1`, not free-form prose) | NOT STARTED |
| EXTRACT0 LangExtract for docs/logs/research (separate lane, same downstream machinery) | NOT STARTED |

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

**Gates**: `LANGEXTRACT_SCHEMA_CONTRACT_PROVEN`, `LANGEXTRACT_GROUNDING_PROVEN`, `LANGEXTRACT_WORKER_PATH_PROVEN`, `MCP_LANGEXTRACT_TOOL_CONTRACT_PROVEN` — none yet run.
