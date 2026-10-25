# Codebase capability audit (2026-10-25)

Scope: document analysis, EmbeddingGemma (768-d), contextual engineering, ranking functions, comment tooling, directory summarization, rg search, and production-hardening OpenSpec tasks.
Method: read-only `rg` and `grep` over tracked source. Counts are exact file matches, not term hits. Nothing was modified except this report and the `.tmp` / archive housekeeping noted in section 8.

## 1. Summary

- **Ranking has the most duplicate owners.** Several rerank entry points exist, and two different functions are both named `rerankCandidates`. This conflicts with the one-owner rule in the project instructions.
- **Two context assemblers** with near-identical names exist: `AceContextAssembler` (`ace/ace-context-assembler.ts`) and `ACEContextAssembler` (`ace/context-assembler.ts`).
- **EmbeddingGemma 768-d** is the canonical contract, with a working `/api/embed` path. Client and server embedding helpers are separate.
- **Directory summarization** is live through `/api/codebase-index/summarize-dirs` and `features/codebase-intel/indexer/directory-summarizer.ts`.
- **rg search** is exposed through MCP tools in `src/mcp/rg_atlas_tools.ts` (`registerRgAtlasTools`) and `src/mcp/codebase_tools.ts`.
- **Comment tooling** has no dedicated generator. Comment and doc-comment handling appears only as helper logic inside other modules.
- **Production-hardening OpenSpec tasks** are mostly open. `parent-atlas-agent-framework-integration-hardening` has 12 done and 59 open. `parent-atlas-workspace-snapshot-runtime` has 8 done and 36 open.

## 2. Document analysis

| Piece | Location | Status |
|---|---|---|
| Document-analysis UI | `src/routes/(analysis)/document-analysis/[evidenceId]/+page.svelte` | Present |
| Vision analysis endpoint | `src/routes/api/vision/analyze/+server.ts` | Present |
| Analysis job queue | `src/lib/server/analysis/analysis-jobs.ts` (`enqueueJob`, `claimNextJob`, `claimBatch`, `getJobsForEvidence`) | Present |
| Agentic fix proposal | `src/lib/server/analysis/agentic-fix-proposal.ts` (`buildAgenticFixProposal`) | Present |

Gap: no single entry point named `analyzeDocument` was found. Document analysis is split across the job queue, the vision route, and the page.

## 3. EmbeddingGemma (768-d)

- Client helpers: `src/lib/ai/client-embed.ts` (`embedText`, `batchCosineSimilarity`, `cosineSimilarity`).
- Server helpers: `src/lib/server/embeddings/ollama.ts` (`tryEmbedOllama`, `tryEmbedCanonical`, `embeddingDims`). Validators live in `representation-contract-validator.ts` (`validateOllamaContract`, `validateONNXHealthContract`, `canFallback`).
- Live check (earlier, `graphify:validate`): embedding service `:8097` reports 768-d.
- Known gap (project notes): `/api/embed` applies no EmbeddingGemma task prefix. Query and corpus recipes must match. The prefix-aware adapter is still open (EMB-CALLER-CONVERGENCE-01).
- Caveat: client-side `embedText` and server-side `tryEmbedCanonical` are separate code paths. Parity between them is not proven here.

## 4. Contextual engineering

- `ContextPack` type: `src/lib/types/pipeline-v2.ts`.
- ACE manifest: `src/lib/server/ace/ace-context-manifest.ts` (`buildContextManifestFromACE`, `attachContextManifestToACE`), plus `ace-route-context-manifest-bridge-v1.ts` (`bridgeAceContextManifestToPacketIdentityV1`).
- Duplicate assemblers: `ace/ace-context-assembler.ts` (`AceContextAssembler`) and `ace/context-assembler.ts` (`ACEContextAssembler`). Same job, two names. Ownership needs deciding.
- Orchestrator-side: `packages/atlas-orchestrator/src/tools/verified-context-tool.ts` and `packages/atlas-core/src/langgraph/worker.ts`.

## 5. Ranking functions (duplicate-owner risk)

Exported rerank and score entry points, with file locations:

| Function | File | Note |
|---|---|---|
| `rerankCandidates` | `packages/parent-atlas-retrieval/src/crossencoder/crossencoder-client.ts` | Same name as the next entry |
| `rerankCandidates` | `src/lib/server/search/gpu-rerank.ts` | Same name as the previous entry |
| `rerankWithCrossEncoder` | `src/lib/server/retrieval/cross-encoder-reranker.ts` | |
| `rerankWithAttention`, `rerankWithKarpathyBlend` | `src/lib/server/retrieval/attention-reranker.ts` | |
| `rankWithBoostedReranker`, `scoreWithBoostedReranker` | `src/lib/server/retrieval/boosted-reranker.ts` | |
| `rerankWithMarco`, `scorePair` | `src/lib/server/search/marco-reranker.ts` | |
| `scoreCandidates` | `src/lib/server/retrieval/candidate-scorer.ts` | |
| `rerankCanonicalFeatureEnvelopes` | `src/lib/server/retrieval/canonical-rerank-executor.ts` | |

Callers of `rerankCandidates` include `search/hybrid-search.ts`, `reranker-client.ts`, `retrieval/search-runtime.ts`, and `routes/api/error-brain/diagnose/+server.ts`.

Recommendation: run `npm run atlas:audit:ownership` (`scripts/atlas/audit-runtime-ownership.mjs`) and classify each function as `CANONICAL_OWNER`, `BACKEND`, `ADAPTER`, `EXPERIMENT`, `COMPATIBILITY`, `FIXTURE_ONLY`, or `DEAD`. Then rename or retire the duplicates. Do not add a new reranker until that is done.

## 6. Comment tooling

- No dedicated code-comment or doc-comment generator was found.
- Matches for "generate comment", "jsdoc", or "code comment" are helper logic inside `api-metadata-extractor.ts`, `ace-materializer.ts`, `nlp-feature-compiler.ts`, `okf-fit.ts`, `post-process-reranker.ts`, and `hmm-policy-bridge.ts`. None is a standalone tool.
- If you want comment generation, it needs a new owner. Check the existing helpers first.

## 7. Directory summarization and rg search

Directory summarization:
- Route: `src/routes/api/codebase-index/summarize-dirs/+server.ts`. It reads SOM coordinates from Qdrant `codebase_chunks_768` and caches results in Redis.
- Engine: `src/lib/server/features/codebase-intel/indexer/directory-summarizer.ts`.
- Writer: `src/routes/api/codebase-index/agents-write/+server.ts` (AGENTS.md generation).
- Indexer output: `docs/graph/codebase-graph.json` is the canonical graph (from 2026-10-17). Refreshed probes go to `docs/reports/graph-probes/`.

rg search:
- MCP tools: `src/mcp/rg_atlas_tools.ts` (`registerRgAtlasTools`) and `src/mcp/codebase_tools.ts`.
- API: `src/routes/api/admin/atlas/query/+server.ts` and the admin search-intelligence page.

## 8. Production hardening: OpenSpec tasks versus skills

| Change | Done | Open | Read |
|---|---|---|---|
| `openspec/changes/parent-atlas-agent-framework-integration-hardening` | 12 | 59 | Most work not started |
| `openspec/changes/parent-atlas-workspace-snapshot-runtime` | 8 | 36 | Early |
| `sveltekit-frontend/openspec/changes/parent-atlas-retrieval-staging-planes` | not counted | not counted | Listed as hardening-related |

- There is no dedicated "production hardening" skill in `.claude/skills`. The closest is the `parent-atlas-workstation` skill, which routes work to existing owners.
- Hardening work should follow the audit-first rule: check the owner in `docs/architecture/runtime-ownership-registry.json` before adding code.

## 9. Housekeeping done during this audit

- `.tmp/merge-validation-20260912` (about 2.5 GB, 29,410 files) moved to `deeds_labs/archive/2026-10-25/merge-validation-20260912/`. Every file matched its SHA-256 before and after the move. The group entry is recorded in `docs/archive-manifest.json`, pointing to the per-file hash manifest `docs/reports/merge-validation-20260912-archive-manifest-v1.json`.
- Plan and verification files: `.tmp/archive-plan/PLAN.md` and `.tmp/archive-plan/merge-validation-verify.json`.

## 10. Open items

1. Resolve the duplicate `rerankCandidates` and the two context assemblers under the ownership audit.
2. Decide an owner for document analysis (job queue, vision route, or both).
3. Prove EmbeddingGemma parity between the client `embedText` and the server `tryEmbedCanonical` paths.
4. Decide whether comment generation is needed. If so, give it one owner.
5. Close the production-hardening open items before adding new hardening tasks.
