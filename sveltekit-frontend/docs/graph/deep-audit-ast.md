# Deep AST Audit

Generated: 2026-08-30T18:53:16.526Z
Graph files: 25618

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D6 | Hardcoded localhost outside env.server.ts | 10 |
| D11 | Phantom service candidates (port w/ no impl) | 9 |
| D15 | Proto/contract files missing on disk | 1 |
| D20 | Direct ENV.*_URL fetch (use typed client) | 37 |

---

## D6 — Hardcoded localhost outside env.server.ts

**10** findings

- `src\lib\server\ai\local-llama-provider.ts:11` — 'http://127.0.0.1:8090';
- `src\lib\server\analysis\experiment-analysis-sidecar.ts:39` — 'http://127.0.0.1:8091'
- `src\lib\server\analysis\model-analysis-sidecar.ts:61` — 'http://127.0.0.1:8091'
- `src\lib\server\atlas\feature-doc-enrichment.ts:307` — `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5173/api/library/ingest-feature-docs -ContentType application/json -Body '{\"featureId
- `src\lib\server\grpc\embedding-client.ts:381` — ? ENV.OLLAMA_EMBED_BASE_URL          // e.g. http://127.0.0.1:8081
- `src\lib\server\langextract-client.ts:117` — const loopbackUrl = 'http://127.0.0.1:8095';
- `src\lib\server\llm\runtime-contract.ts:24` — 'http://127.0.0.1:8090';
- `src\lib\server\ollama.ts:87` — 'http://127.0.0.1:8090';
- `src\lib\server\ollama.ts:92` — 'http://127.0.0.1:11434';
- `src\lib\server\retrieval\cache-layers-orchestrator.ts:43` — 'http://127.0.0.1:8091'

---

## D11 — Phantom service candidates (port w/ no impl)

**9** findings

- `src\lib\server\ai\llama-server-model-resolver.ts:79` — Port 8090 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\ai\local-llama-provider.ts:11` — Port 8090 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\ai\local-llama-provider.ts:15` — Port 8090 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\analysis\experiment-analysis-sidecar.ts:39` — Port 8091 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\analysis\model-analysis-sidecar.ts:61` — Port 8091 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\grpc\embedding-client.ts:381` — Port 8081 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\llm\runtime-contract.ts:24` — Port 8090 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\ollama.ts:87` — Port 8090 referenced as fallback but no docker-compose service / Go cmd binds it
- `src\lib\server\retrieval\cache-layers-orchestrator.ts:43` — Port 8091 referenced as fallback but no docker-compose service / Go cmd binds it

---

## D15 — Proto/contract files missing on disk

**1** finding

- `src\lib\gpu\policy-reranker-bridge.ts:1` — Proto file referenced but not found: sidecar/protos/policy_reranker.proto

---

## D20 — Direct ENV.*_URL fetch (use typed client)

**37** findings (showing first 30)

- `src\lib\server\ace\retrieval\evidence-lanes.ts:131` — const response = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768_v2/points/query`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ai\langgraph-research.ts:297` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ai\tool-dispatcher.ts:49` — const searchRes = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\analytics\ldr-ace-bridge.ts:154` — await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\audit\gpu-audit-orchestrator.ts:174` — const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\cache\ace-context-pack-cache.ts:294` — const res = await fetch(`${ENV.QDRANT_URL}/collections`, { method: 'GET' });  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\cache\atlas-cache-cascade.ts:159` — const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/query`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\ai\ace\context-assembler.ts:5321` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\ai\ace\error-kag-writer.ts:279` — await fetch(`${ENV.QDRANT_URL}/collections/knowledge_base/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\cases\external-research-agent.ts:96` — const embeddingRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\codebase-intel\indexer\cluster-summary.ts:128` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\codebase-intel\indexer\run-cluster-assign.ts:34` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\codebase-intel\indexer\run-cluster-assign.ts:86` — await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/batch`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\evidence\video\video-ingest-service.ts:259` — await fetch(`${ENV.QDRANT_URL}/collections/evidence_items/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\rag\codebase-context.ts:124` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\rag\codebase-context.ts:314` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\features\rag\codebase-context.ts:857` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:193` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:239` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:291` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:397` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:623` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\gpu-karpathy-tagger.ts:72` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\karpathy-search-loop.ts:116` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\som-summary.ts:73` — const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\memory\claude-mem-ingest.ts:48` — const resp = await fetch(`${ENV.OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ml\topic-clustering-worker.ts:74` — const response = await fetch(`${ENV.QDRANT_URL}/collections/legal_documents/points?limit=10000&with_vectors=true`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ollama.ts:1414` — await fetch(`${ENV.QDRANT_URL}/collections/${BIFROST_CACHE_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\go-retrieval-facade.ts:740` — const res = await fetch(`${ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}/api/tags`, { signal: AbortSignal.timeout(200  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\go-retrieval-facade.ts:750` — const res = await fetch(`${ENV.QDRANT_URL}/collections`, { signal: AbortSignal.timeout(2000) });  → use the typed client (qdrant-client, ollama-client, etc.)

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
