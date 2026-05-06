# Deep AST Audit

Generated: 2026-05-05T20:21:00.573Z
Graph files: 3417

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D16 | await-using opportunity (try/finally + .quit/.disconnect) | 8 |
| D17 | MGET bulk-read opportunity (3+ sequential redis.get) | 16 |
| D18 | simdjson opportunity (.mget + JSON.parse, no fast-parse) | 14 |
| D19 | Missing outputMeta on recordLlmOutputHit (use Rag/Kag helper) | 3 |
| D20 | Direct ENV.*_URL fetch (use typed client) | 33 |

---

## D16 — await-using opportunity (try/finally + .quit/.disconnect)

**8** findings

- `scripts\graphify-persist-couchdb.mjs:345` — await redis.quit().catch(() => {});  → consider `await using` + getDisposableRedis()
- `scripts\deep-audit-ast.mjs:647` — // D16: `await using` opportunities — try/finally with .quit()/.disconnect()  → consider `await using` + getDisposableRedis()
- `scripts\tests\test-ace-graphify-retrieval.mjs:192` — await redis.quit().catch(() => {});  → consider `await using` + getDisposableRedis()
- `scripts\lib\phase89-sse-stream.mjs:199` — await redis.quit();  → consider `await using` + getDisposableRedis()
- `src\lib\server\redis-streams.ts:147` — reader.disconnect();  → consider `await using` + getDisposableRedis()
- `src\routes\api\health\redis\+server.ts:74` — await client.quit();  → consider `await using` + getDisposableRedis()
- `src\routes\api\cache\stats\+server.ts:78` — fresh.disconnect();  → consider `await using` + getDisposableRedis()
- `src\routes\api\codebase-index\export\bundle\+server.ts:244` — redis.disconnect();  → consider `await using` + getDisposableRedis()

---

## D17 — MGET bulk-read opportunity (3+ sequential redis.get)

**16** findings

- `src\lib\server\vector-cache.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\inference\turbo-prefix-cache.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\inference\gpu-arbiter.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\grpc\embedding-client.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\hypergraph-4d.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\glyph-atlas-builder.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\community-graph.ts:1` — 7 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\engagement\idle-reengagement.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\cache\report-template-cache.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\cache\code-llm-index.ts:1` — 5 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\ai\error-fix-memory.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\ace\context-assembler.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\routes\api\graph\glyph-atlas\+server.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\routes\api\codebase-index\orchestrate\+server.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\ff1\storage\redis-cache.ts:1` — 6 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\routes\api\synthesis\evaluation\[id]\+server.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)

---

## D18 — simdjson opportunity (.mget + JSON.parse, no fast-parse)

**14** findings

- `src\lib\server\retrieval\centroid-cache.ts:92` — const values = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\research\lane4-feedback.ts:126` — const [scoreRaw, countRaw] = await redis.mget(  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\rag\sdk.ts:48` — const [statusRaw, shardCountRaw] = await redis.mget([  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\inference\turbo-prefix-cache.ts:108` — const blobs = await redis.mget(hashes.map(h => `web:research:sum:${h}`));  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\graph\hypergraph-4d.ts:1123` — const raw = await redis.mget(hashes.map(h => HG_EDGE_KEY(h))).catch(() => [] as (string|null)[]);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\graph\glyph-atlas-builder.ts:326` — kagVals = kagKeys.length ? await redis.mget(...kagKeys) : [];  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\graph\codebase-cluster-detection.ts:350` — const values = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\cache\redis-exact-match.ts:160` — const values = await redis.mget(...cacheKeys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\analytics\web-research-crawler.ts:396` — .mget(hashes.map(h => WEB_SUM_KEY(h)))  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\analytics\research-cache.ts:200` — const raw = await redis.mget(hashes.map(h => SKETCH_KEY(h))).catch(() => [] as (string | null)[]);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\topology-hits\+server.ts:52` — const blobs = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\ingest-log\+server.ts:44` — const raws = await redis.mget(hashes.map((h) => `rag:hit:${h}`));  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\agents-write\+server.ts:209` — kagVals = await redis.mget(...kagKeys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\export\bundle\+server.ts:223` — const values = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate

---

## D19 — Missing outputMeta on recordLlmOutputHit (use Rag/Kag helper)

**3** findings

- `src\lib\server\cache\code-llm-index.ts:184` — export async function recordLlmOutputHit(  → use recordRagAnswer/recordKagAnswer for structured outputMeta
- `src\routes\api\graph\traverse\+server.ts:254` — recordLlmOutputHit(`cluster:${clId}`, gemma4Summary!, {  → use recordRagAnswer/recordKagAnswer for structured outputMeta
- `src\routes\api\codebase-index\llm-output\+server.ts:98` — const entry = await recordLlmOutputHit(parsed.data.path, parsed.data.llmOutput, parsed.data);  → use recordRagAnswer/recordKagAnswer for structured outputMeta

---

## D20 — Direct ENV.*_URL fetch (use typed client)

**33** findings (showing first 30)

- `src\lib\server\ollama.ts:1074` — await fetch(`${ENV.QDRANT_URL}/collections/${BIFROST_CACHE_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\video-vlm-processor.ts:237` — const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\video-vlm-processor.ts:394` — const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\document-embed-consumer.ts:92` — const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\document-embed-consumer.ts:153` — await fetch(`${ENV.QDRANT_URL}/collections/chat_documents/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\audio-processor.ts:287` — const response = await fetch(`${ENV.LANGEXTRACT_URL}/extract`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\audio-processor.ts:325` — const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\audio-processor.ts:377` — const embedResponse = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\audio-processor.ts:523` — await fetch(`${ENV.QDRANT_URL}/collections/audio_segments/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\workers\audio-processor.ts:544` — const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\orchestrator.ts:127` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${collection}/points/search`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\codebase-context.ts:101` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\codebase-context.ts:284` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\retrieval\codebase-context.ts:743` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\research\web-research-ingester.ts:123` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\som-summary.ts:72` — const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\run-cluster-assign.ts:34` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\run-cluster-assign.ts:86` — await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/batch`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\gpu-karpathy-tagger.ts:71` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:139` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:185` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:237` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:335` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\dual-embedder.ts:496` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\indexer\cluster-summary.ts:129` — const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\audit\gpu-audit-orchestrator.ts:174` — const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ai\langgraph-research.ts:289` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ace\error-kag-writer.ts:277` — await fetch(`${ENV.QDRANT_URL}/collections/knowledge_base/points`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ace\context-assembler.ts:1632` — const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {  → use the typed client (qdrant-client, ollama-client, etc.)
- `src\lib\server\ace\ace-error-kag.ts:74` — const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {  → use the typed client (qdrant-client, ollama-client, etc.)

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /deep-audit — already clean; run for 47-gate health sweep across all tiers (Tier A code, Tier C infra, Tier H analytics)

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
