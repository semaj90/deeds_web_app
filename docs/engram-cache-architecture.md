## Engram, Redis/Valkey, and Vector Cache — Recommended Architecture

Summary
- Redis/Valkey are cache engines — Engram is the agent-memory coordinator.

Prompt/Query cache flow

1. prompt / query
2. normalize (whitespace, lowercasing, canonicalization)
3. hash → check exact cache in Redis/Valkey
4. if miss → embed (embeddinggemma / other)
5. vector similarity search in Redis/Valkey (or Qdrant)
6. if miss → full model / RAG

Notes
- Redis supports vector search with filters; can serve semantic-cache use cases when configured.
- Valkey Search with HNSW (if built with search module) can perform the same ANN/semantic role.

Where Engram fits

- Engram = session memory lifecycle manager (not the low-level cache engine).
- Responsibilities:
  - extract → reconcile → consolidate → inject memory into model context
  - manage session-level TTLs, promotion policies, and what to inject into the KV slot
  - coordinate promotions from Redis/Valkey → Qdrant (deeper memory)

Suggested responsibilities by system

- Redis/Valkey: hot cache, exact prompt-hash keys, short TTLs (1h–24h), Redis Streams for eventing.
- Qdrant: heavier semantic memory, long-lived vectors and persistent recall.
- Engram: orchestrates when to read/write/promote memories and what to inject into Gemma4's KV.

Stream semantics (two meanings)

1. OpenAI-compatible streaming (`stream: true`) — token streaming back to client (SSE / chunked responses).
   - Use this for Gemma4 response streaming and UX.
   - Not related to the cache mechanics themselves.

2. Redis Streams (`XADD` / `XREAD`) — event log / queue semantics.
   - Use for tool traces, retrieval outcomes, memory promotion jobs, scenario indexing, async workers.

MCP tool calling

- MCP is the JSON-RPC 2.0 tool-calling bridge used by OpenCode/Gemma4 to call external tools.
- Typical flow: model → MCP tool call → atlas/tool handler → DB/cache → result → model.

Vercel AI SDK

- Use on the SvelteKit app when you want a TS-friendly wrapper for model calls, function-schema-based tool calling, and streaming-friendly endpoints.

Best Atlas cache stack (recommended)

- Tier 0: `IndexedDB` — client-side visual/glyph cache only.
- Tier 1: `Redis/Valkey exact` — exact prompt-hash keys. Keys like `ace:ctx:{hash}`, TTL 1h–24h.
- Tier 2: `Redis/Valkey semantic` or `Qdrant scenario_cache` — similar prompt lookup with threshold (0.75–0.90).
- Tier 3: `ACE/GraphRAG` — TRACE + MCP + Qdrant + Neo4j assemble deeper context.
- Tier 4: `Gemma4` — only when cache/RAG cannot answer.

Caveman rule

- Redis remembers exact. Valkey/Redis Search finds similar. Qdrant finds deeper similarity. Engram decides what memory to inject. MCP lets Gemma4 ask for it. Vercel SDK is the app-side wrapper.

Appendix: quick operational notes

- Prefer Redis exact-hash keys for deterministic caching of prompts and for easy invalidation.
- Use Redis Streams to publish promotion events so Engram workers can asynchronously promote hot keys into Qdrant.
- Ensure Valkey build includes the search module before relying on HNSW features.
- When instrumenting injection to KV slots, Engram should expose a dry-run mode and a promotion audit log.

---
File created: `docs/engram-cache-architecture.md`
