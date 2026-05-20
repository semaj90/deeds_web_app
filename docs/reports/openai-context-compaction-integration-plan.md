# OpenAI Context Compaction Integration Plan

**Date:** May 18, 2026
**Scope:** SvelteKit frontend `sveltekit-frontend/`, VS Code / GitHub Copilot guidance, OpenCode/Cline-style compaction, ACE prompt caching, semantic cache, and sidecar memory design.

## Goals

- Prevent raw OpenCode history and tool context from sending 500k+ tokens to Gemma4.
- Implement a preflight context compaction layer in `openai-facade.ts`.
- Combine prompt caching and semantic caching to minimize Gemma4 calls.
- Use workspace tooling rules to make Copilot/OpenCode search repo correctly.
- Optionally add a Go memory sidecar for lower-latency, higher-concurrency cache retrieval.

## Current Stack Targets

- `sveltekit-frontend/src/lib/server/ai/openai-facade.ts`
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- `sveltekit-frontend/src/lib/server/ai/kv-context-controller.js`
- `sveltekit-frontend/src/mcp/trace-mcp-server.ts`

## Architecture Overview

### 1. Gatekeeper: `openai-facade.ts`

This route should:
- inspect request messages and count tokens before model selection
- trigger `context_compaction_required` when `inputTokens > OPENAI_HARD_INPUT_CAP`
- summarize history and rebuild a compact ACE packet
- enforce `ACE_PACKET_TOKEN_CAP` on the prompt
- preserve stable prefix / KV packet metadata
- choose Gemma4 TurboQuant only on cache/miss paths

### 2. ACE compacter

The ACE context path should:
- assemble a compact retrieval packet
- cap packet tokens to `ACE_PACKET_TOKEN_CAP` (3500)
- use attention weights and chunk priorities selectively
- place static rules/templates first and dynamic content last

### 3. Prompt cache vs semantic cache

Prompt cache:
- stable system prefix
- repeated ACE prompt template
- fixed tool definitions
- ideal for identical prefix reuse and attention-state reuse

Semantic cache:
- query hash / similarity
- Redis packet hits / Bifrost L2
- prior-answer HCA cards
- Qdrant tag lookup
- ideal for similar meaning reuse

Both are needed.

### 4. Sidecar memory design

A Go memory sidecar can be added if needed, but only after the core loop works.
The sidecar should support:
- exact hash cache
- semantic embedding cache
- Qdrant tag lookup
- Redis packet cache
- llm_output summary store

Suggested API endpoints:
- `POST /memory/lookup`
- `POST /memory/record`
- `POST /memory/reingest`
- `POST /memory/warm`
- `GET /memory/stats`

Example request:

```json
{
  "query": "why does graphify deep ingest fail",
  "query_hash": "abc123",
  "top_k": 3,
  "token_budget": 3500,
  "tags": ["graphify", "typescript", "error"]
}
```

Example response:

```json
{
  "hit": true,
  "cache_type": "semantic",
  "similarity": 0.91,
  "ace_packet": {
    "chunk_ids": ["scripts/graphify-deep-imports.mjs:300-320"],
    "summary": "Failure is writing unresolved-imports.json...",
    "weights": {
      "semantic": 0.88,
      "authority": 0.74,
      "topology": 0.69
    }
  }
}
```

## Best practical implementation

### Core loop

1. `query -> retrieve -> Gemma4 -> summary -> cache`
2. similar query -> sidecar hit -> compact ACE packet -> maybe no Gemma4

### Pipeline

- Redis / Bifrost exact/packet cache check before Gemma4
- cap ACE packet at 3500 tokens
- summarize `llm_output` into 128-token HCA card
- create embedding for the HCA card
- upsert the HCA card into Qdrant with tags
- future similar queries retrieve the HCA card first

### Recommended stack behavior

- `openai-facade.ts` checks Redis/Bifrost before Gemma4
- `ACE packet` is capped to `3500`
- `llm_output` is summarized into HCA cards
- HCA cards are embedded and tagged
- future queries can pull an HCA card first

### Good Go sidecar libraries

- `github.com/go-redis/redis/v9`
- `github.com/qdrant/go-client`
- `github.com/go-chi/chi` or `github.com/gorilla/mux`
- `github.com/google/uuid`
- `github.com/cespare/xxhash/v2` (fast hashing)
- optional: `github.com/patrickmn/go-cache` or `github.com/dgraph-io/ristretto`

## VS Code / Copilot integration plan

### 1. Workspace instructions

Add `.github/copilot-instructions.md` with rules:
- use `rg` for repo navigation
- run `pwd`
- run `rg --files | rg "<filename>$"`
- search inside `sveltekit-frontend/`
- do not assume repo root has `src/`
- do not ask for file path until `rg` confirms no match
- avoid full file dumps
- use compact summaries and chunked output

### 2. Custom Copilot agent

Create `.github/agents/trace-audit.agent.md` with:
- `rg` first
- prefer `sveltekit-frontend/`
- use TRACE MCP tools when available
- compact evidence only
- summary shape: `goal`, `completed`, `activeFiles`, `errors`, `chunkIds`, `nextAction`

### 3. MCP wiring

Configure `.vscode/mcp.json` to register the TRACE MCP client:
- `npm run mcp:trace`
- `cwd: ${workspaceFolder}/sveltekit-frontend`

### 4. Test case

From workspace root:
- `pwd`
- `rg --files | rg "context-assembler\.ts$"`
- `rg "top_k|buildACEPromptCached|attention_weights" sveltekit-frontend/src/lib/server/ace`

## Recommended ripgrep audit searches

```bash
cd C:\Users\james\Videos\deeds-web-app
rg -n "buildACEPromptCached|assembleACEContext|attention_weights|budgetGuardTriggered|stablePrefixHash|kvPacketTaskId|usage:" sveltekit-frontend/src
rg -n "OPENAI_HARD_INPUT_CAP|ace_packet_shrink|BIFROST|bifrostChat|priorAnswerKey|compressToHCACard" sveltekit-frontend/src
rg -n "QDRANT|qdrant|upsert|vector|embedding|similarity|topoClass" sveltekit-frontend/src
rg -n "SEAWEED|Seaweed|MINIO|S3|uploadFile|getMinioClient" sveltekit-frontend/src docker-compose*.yml
rg -n "mcp:trace|TRACE_MCP|8788|kb.trace_search|atlas.query|graph.expand_neighborhood" sveltekit-frontend/src
```

## Recommended integration steps

### Phase 1: Baseline and guard

1. implement `openai-facade.ts` preflight compaction
2. enforce `OPENAI_HARD_INPUT_CAP=24000`
3. enforce `ACE_PACKET_TOKEN_CAP=3500`
4. preserve stable prefix and KV packet metadata
5. add `budgetGuardTriggered`, `availableContextTokens`, `stablePrefixHash`, and `kvPacketTaskId` telemetry

### Phase 2: cache / HCA cards

1. summarize model outputs to 128-token HCA cards
2. embed HCA cards
3. upsert HCA cards to Qdrant with tags:
   - `query_type`
   - `source:llm_output`
   - `topoClass`
   - `reward_score`
4. cache packet hits in Redis under keys like `llm:hca:{query_hash}`

### Phase 3: retrieval-first optimization

1. check Redis/Bifrost for query hash or packet hit
2. if hit, return a compact ACE packet or HCA-guided packet
3. if miss, run Gemma4 and record the result
4. keep the sidecar only if traffic and latency justify it

## Repo Status Checklist

### Have
- `sveltekit-frontend/src/lib/server/ai/openai-facade.ts` — OpenAI facade, preflight budget guard, stable-prefix-aware prompt assembly, `bifrostChat` + TurboQuant selection, telemetry fields.
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` — ACE assembly, Qdrant retrieval, Redis cache + packet cache planner, graph/topology re-ranking, token-budget enforcement.
- `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` — Qdrant manager, hybrid dense/sparse support, payload indexes, Qdrant collection init, deterministic point IDs.
- `sveltekit-frontend/src/lib/server/redis.ts` — Redis pooled client, typed helpers, cache key namespaces, general-purpose Redis layer.
- `sveltekit-frontend/src/lib/server/ai/kv-context-controller.ts` — KV packet controller, stable prefix hash, compressed file cards, attention TOC, query-level cache.
- `sveltekit-frontend/src/lib/server/langextract-client.ts` + `src/lib/server/services/langextract-service.ts` — LangExtract network client with heuristic fallback and native extraction gating.
- `sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts` — LangExtract entity-aware reranker with GRPO-style fusion.
- `sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts` and `src/lib/server/cache/redis-semantic-cache.ts` — Redis-backed exact and semantic cache paths.
- `sveltekit-frontend/tests/langextract-service.spec.ts` and `tests/langextract-native.spec.ts` — LangExtract test coverage.
- `sveltekit-frontend/tests/kv-context-controller.spec.ts` — KV packet controller test coverage.

### Need / Next work
- Explicit sidecar memory service implementation. The repo has cache layers and packet controllers, but not a standalone `memory/lookup`/`memory/record` Go service.
- A dedicated BGE / FlagEmbedding reranker component. Current reranking is LangExtract/GRPO-style; a FlagEmbedding-focused reranker is not yet present in the codebase.
- A stable `prompt cache` / repeat-prefix reuse layer integrated with OpenAI/Gemma4 beyond the existing `kv-context-controller.ts` packet cache. The current controller is a strong basis, but it still needs explicit reuse instrumentation in `openai-facade.ts` and LLM prompt cache metrics.
- A formal Qdrant HCA card ingestion path. Qdrant manager exists, and vector collections are supported, but the pipeline to compress outputs into HCA cards, embed them, and upsert them with tags is still design work.
- A documented `sidecar memory` API contract. The plan has the design, but the repo currently lacks a standard `POST /memory/*` service route and health stats endpoint.
- A merge of `openai-facade.ts` budget guard logic with `kv-context-controller.ts` stable-prefix reuse so the facade can choose a cached packet hit before expensive retrieval.
- A `FlagEmbedding`-style cross-encoder / BGE reranker integration for reranking after Qdrant hybrid search.
- A concrete `cache_prompt` / stable-prefix invalidation rule in the OpenAI prompt flow beyond the descriptive policy.

## Audit Checklist: Actual repo evidence

### Existing in repo
- Bifrost/Redis GPT cache: `sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts`, `sveltekit-frontend/src/lib/server/cache/redis-semantic-cache.ts`, `sveltekit-frontend/src/lib/server/redis.ts`.
- OpenAI facade / gatekeeper: `sveltekit-frontend/src/lib/server/ai/openai-facade.ts` and `sveltekit-frontend/tests/openai-facade.spec.ts`.
- ACE compact packet / token budget: `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`, `sveltekit-frontend/src/lib/server/ace/context-cache-planner.ts`, and `sveltekit-frontend/src/lib/server/llm/token-budget.ts`.
- Qdrant hybrid retrieval: `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` plus retrieval pipeline hooks in `src/lib/server/ace/*`.
- Legal/entity extraction: `sveltekit-frontend/src/lib/server/langextract-client.ts`, `src/lib/server/services/langextract-service.ts`, and `src/lib/server/retrieval/langextract-reranker.ts`.
- Stable prefix / KV packet theory: `sveltekit-frontend/src/lib/server/ai/kv-context-controller.ts`.
- Prompt cache search patterns already present in repo guidance: `.github/copilot-instructions.md`, `docs/reports/openai-context-compaction-integration-plan.md`.

### Missing or partial
- FlagEmbedding / BGE reranker: no explicit `FlagEmbedding` or BGE cross-encoder module in `sveltekit-frontend/src/lib/server/retrieval/`.
- HCA card ingestion + rebake path: no dedicated HCA card embedding/upsert flow implemented yet.
- Sidecar memory API routes: no `POST /memory/*` or `GET /memory/stats` route currently present in app routes.
- Full prompt-cache invalidation contract: theory is documented, but the concrete stable-prefix invalidation state is not wired as a reusable service.
- Go sidecar implementation: no Go module or service files exist, only design guidance.

### Audit search commands to verify

```bash
cd C:\Users\james\Videos\deeds-web-app
rg -n "OPENAI_HARD_INPUT_CAP|ace_packet_shrink|BIFROST|bifrostChat|priorAnswerKey|compressToHCACard|stablePrefixHash|cache_prompt|cache-reuse" sveltekit-frontend/src
rg -n "QDRANT|qdrant|upsert|vector|embedding|similarity|topoClass|BM25|RRF|DBSF|sparse|dense|cosine|rerank|FlagEmbedding|bge|MARCO" sveltekit-frontend/src scripts
rg -n "LangExtract|LANGEXTRACT|entity|citation|source grounding|structured extraction" sveltekit-frontend/src scripts
rg -n "stablePrefix|getStableSystemPrefix|cache_prompt|cache-reuse|kvPacketTaskId|stablePrefixHash" sveltekit-frontend/src
rg -n "MCP|mcp:trace|TRACE_MCP|kb.trace_search|tools/list|tools/call" . --glob "!node_modules"
```

## Best next implementation

1. Keep Bifrost/Redis as L1/L2 cache.
2. Add Qdrant hybrid dense+sparse retrieval.
3. Add BGE/FlagEmbedding reranker after Qdrant.
4. Add LangExtract for legal/code entities.
5. Summarize `llm_output` into HCA cards.
6. Re-embed HCA cards into Qdrant.
7. Cache HCA cards in Redis.
8. Feed only top weighted ACE packet to Gemma4.

This gives you the loop:

`retrieve -> synthesize -> summarize -> embed -> cache -> retrieve better next time`

## Notes on best design

- Put static content first in prompts.
- Dynamic values like user query, date, or session-specific fields must go at the end.
- Do not break the stable prompt prefix by changing early prompt text often.
- Use prompt cache for repeated stable blocks.
- Use semantic cache for meaning-similar queries.

## Conclusion

This plan aligns with the OpenCode/Cline strategy: use a compacted ACE prompt + prompt cache + semantic cache, and reserve Gemma4 TurboQuant for cache misses.

The result is: `summarize -> embed -> tag -> cache -> retrieve -> synthesize less`.
