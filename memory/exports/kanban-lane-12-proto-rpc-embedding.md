# Kanban Task Card — Lane 12 Proto/RPC Tool Registry Embedding

**Lane**: 12 (Proto/RPC Tool Registry Embedding + Wiring)  
**Status**: 65% complete (audit + packetization ✅; embedding + wiring pending)  
**Priority**: HIGH (blocks Stage 5 policy network tool selection)  
**Estimated Time**: 2-3 hours wall-clock  
**Owner**: Atlas/HyperRAG pipeline

---

## Context

**What's done**:
- ✅ Proto registry audit (10 unique services, 69 RPC methods scanned)
- ✅ Packet generation (61 gRPC service/method packets generated)
- ✅ Stored in `docs/reports/grpc-service-packets.jsonl` (ready for Qdrant)

**What's needed**:
- Ingest 61 packets into Qdrant `codebase_chunks_768` with embeddings
- Wire Qdrant RPC retrieval endpoint → MCP runtime tool selection
- Wire Neo4j RPC dependency graph (tool imports/relationships)

**Why this matters**:
- Currently Gemma4 agent gets ALL 300+ MCP tools at once (overwhelming)
- Lane 12 enables **narrowed tool set** per query: retrieve top-K relevant tools only
- Reduces inference cost, latency, and confusion (fewer hallucinated tool calls)
- Enables Stage 5 policy network to pick next action from relevant tools only

---

## Subtasks (Ordered by Dependency)

### 1️⃣ Embed + Ingest gRPC Packets to Qdrant (2-3 hours)
**File**: `scripts/atlas/ingest-grpc-packets-to-qdrant.mjs` (to create)  
**Input**: `docs/reports/grpc-service-packets.jsonl` (61 packets)  
**Output**: Qdrant points in `codebase_chunks_768`, `domain_class=mcp_agents` tag  
**Commands**:
```bash
# Preview (dry-run)
node scripts/atlas/ingest-grpc-packets-to-qdrant.mjs

# Apply (embeds via Ollama + upserts to Qdrant)
node scripts/atlas/ingest-grpc-packets-to-qdrant.mjs --apply
```

**Acceptance Criteria**:
- [ ] 61 packets successfully embedded (Ollama `/api/embeddings` called)
- [ ] 61 points upserted to Qdrant with `domain_class=mcp_agents` payload
- [ ] Qdrant point count increases by 61 (verify via `/collections/codebase_chunks_768`)
- [ ] All packets have Qdrant tags: `["grpc", "service", "mcp_agents"]`

### 2️⃣ Wire Qdrant RPC Retrieval → MCP Tool Selection (1-1.5 hours)
**File**: `sveltekit-frontend/src/routes/api/tools/rpc-search/+server.ts` (to create)  
**Endpoint**: `POST /api/tools/rpc-search?query=X&limit=K`  
**Query Path**:
```
query → embed via /api/embed → 
  Qdrant ANN search (codebase_chunks_768, filter: domain_class=mcp_agents) → 
  top-K results (services + methods) → 
  return tool manifest + metadata
```

**Response Shape**:
```json
{
  "ok": true,
  "tools": [
    {
      "packet_key": "grpc:RetrievalService.SearchEvidence",
      "service_name": "RetrievalService",
      "method_name": "SearchEvidence",
      "summary": "Search evidence by query",
      "qdrant_tags": ["grpc", "retrieval", "search"],
      "confidence": 0.92
    }
  ],
  "total_available": 61,
  "returned": 5,
  "query_time_ms": 245
}
```

**Acceptance Criteria**:
- [ ] Endpoint returns HTTP 200 with valid tool list
- [ ] Top-K tools match query semantically (test: "search evidence" → SearchEvidence in top-3)
- [ ] Confidence scores reflect Qdrant cosine similarity
- [ ] Latency <500ms p95 (including embedding)

### 3️⃣ Wire Neo4j RPC Dependency Graph (1 hour, optional for v1)
**File**: `scripts/atlas/wire-grpc-neo4j-edges.mjs` (to create)  
**Graph Edges**:
- `SERVICE_HAS_METHOD` (Service → Method)
- `METHOD_IMPORTS_SERVICE` (Method → imported Service)
- `METHOD_USES_CONCEPT` (Method → concept tags)

**Acceptance Criteria** (optional for v1, but recommended):
- [ ] Neo4j edges created (can query: `MATCH (s:GrpcService)-[:SERVICE_HAS_METHOD]->(m:GrpcMethod)`)
- [ ] Tool dependency graph traversable (can expand from one service to related services)

---

## Expected Impact

| Metric | Before | After |
|---|---|---|
| Tools per inference | 300+ (all) | 5-10 (relevant only) |
| Inference latency | +200ms (all tools) | -100ms (narrowed) |
| Hallucinated tool calls | ~15% | ~3% |
| MCP socket memory | ~2.5MB | ~500KB |

---

## Integration Points

- **Stage 5 policy network** consumes narrowed tool list from `/api/tools/rpc-search`
- **Gemma4 agent** calls `/api/tools/rpc-search?query=<task>` instead of hardcoded tool list
- **ACE context assembler** can tag retrieval strategy with which tools were available
- **OpenCode MCP runtime** uses `/api/tools/rpc-search` for dynamic tool discovery

---

## References

- `docs/reports/grpc-service-packets.jsonl` — 61 packets ready for Qdrant
- `docs/reports/proto-registry-audit.json` — full proto inventory
- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts` — Stage 4 ANN cascade pattern (copy + adapt for tools)

---

## Notes

- **Embedding model**: Ollama `embeddinggemma:latest` (consistent with codebase vector DB)
- **Batch size**: 10-20 packets per Qdrant upsert (avoid timeouts)
- **Timeout**: Qdrant upsert can take >5s for large batches; use `wait=true` flag
- **No breaking changes**: New endpoint doesn't modify existing MCP tool list; purely additive filtering
