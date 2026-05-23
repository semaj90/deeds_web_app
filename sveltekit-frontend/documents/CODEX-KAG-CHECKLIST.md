# CODEX / OpenCode KAG Pipeline Checklist

## Goal

Implement a stateful KAG retrieval + synthesis pipeline with:
- SSE streaming
- MCP tools
- Engram persistence
- TOON compression
- multi-hop retrieval
- reranking
- Bifrost synthesis

---

# PHASE 0 — HEALTH

- [x] llama-server /health = 200
- [x] llama-server /props n_ctx = 65536
- [x] TRACE /health = 200
- [x] MCP POST initialize = 200
- [x] Redis ping = PONG
- [x] Qdrant reachable
- [x] Bifrost /v1/models reachable
- [x] rg installed
- [x] ast-grep installed

---

# PHASE 1 — MEMORY

- [ ] engram.redis_health works
- [ ] engram.ace_packet_inject writes Redis
- [ ] engram.chat_memory_store writes Redis
- [ ] TTL verified
- [ ] JSON schema verified

---

# PHASE 2 — SSE

- [ ] create /api/chat/stream
- [ ] stream status events
- [ ] stream token events
- [ ] stream done/error events

---

# PHASE 3 — MCP

- [ ] create mcp/client.ts
- [ ] initialize()
- [ ] tools/list()
- [ ] tools/call()

---

# PHASE 4 — FEATURE LABELS

- [ ] rg lexical pass
- [ ] ast-grep structural pass
- [ ] graphify integration
- [ ] atlas integration
- [ ] normalized labels

---

# PHASE 5 — MULTI-HOP

- [ ] subgraph expansion
- [ ] hop caps
- [ ] node caps
- [ ] cycle detection

---

# PHASE 6 — RERANKER

- [ ] install CrossEncoder
- [ ] rerank candidates
- [ ] top-N selection
- [ ] suffix-only injection

---

# PHASE 7 — TOON

- [ ] build TOON packet
- [ ] compress labels
- [ ] compress memory
- [ ] compress reranked results

---

# PHASE 8 — BIFROST

- [ ] create bifrost/client.ts
- [ ] stream completion
- [ ] preserve KV prefix
- [ ] no direct llama calls

---

# PHASE 9 — FINAL PIPELINE

```text
User
 ↓
SSE
 ↓
MCP retrieval
 ↓
Feature labels
 ↓
Multi-hop
 ↓
Rerank
 ↓
TOON
 ↓
Bifrost
 ↓
Gemma4
 ↓
SSE stream
 ↓
Engram persistence
```
