# Deep AST Audit

Generated: 2026-05-06T00:37:50.234Z
Graph files: 3417

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D17 | MGET bulk-read opportunity (3+ sequential redis.get) | 16 |
| D19 | Missing outputMeta on recordLlmOutputHit (use Rag/Kag helper) | 2 |

---

## D17 — MGET bulk-read opportunity (3+ sequential redis.get)

**16** findings

- `src\lib\server\vector-cache.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\inference\turbo-prefix-cache.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\inference\gpu-arbiter.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\grpc\embedding-client.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\hypergraph-4d.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\glyph-atlas-builder.ts:1` — 3 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
- `src\lib\server\graph\community-graph.ts:1` — 4 sequential redis.get() calls — consider MGET via redisGetBulk() or .mget(...)
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

## D19 — Missing outputMeta on recordLlmOutputHit (use Rag/Kag helper)

**2** findings

- `src\lib\server\cache\code-llm-index.ts:184` — export async function recordLlmOutputHit(  → use recordRagAnswer/recordKagAnswer for structured outputMeta
- `src\routes\api\codebase-index\llm-output\+server.ts:98` — const entry = await recordLlmOutputHit(parsed.data.path, parsed.data.llmOutput, parsed.data);  → use recordRagAnswer/recordKagAnswer for structured outputMeta

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
