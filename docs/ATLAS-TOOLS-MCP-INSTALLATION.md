# Atlas-Tools MCP Installation — Complete

**Date**: 2026-07-27  
**Status**: ✅ INSTALLED  
**Target**: Claude Code / OpenCode integration

---

## Overview

`atlas-tools` is a local MCP (Model Context Protocol) server that provides safe, read-only access to the deeds-web-app project metadata:

- **Codebase traversal** — File graph, imports, references via tree-sitter (AST-grep)
- **Semantic alignment** — Parent Atlas rerankers (LangExtract, AST, lexical) for embedding normalization
- **Topology queries** — SOM clusters, PageRank, Neo4j neighbors (optional)
- **Knowledge base** — Wiki notes, AGENTS.md, directory context
- **Vector search** — Qdrant semantic search (768-dim dual-vector: content + signature)
- **Packet identity** — Packet key resolution, lineage verification
- **KAG search** — Multi-hop graph traversal + community context (Neo4j)
- **Synthesis** — Gemma4 answer generation via llama-server (TurboQuant :8090)

### Tech Stack

**LLM & Embeddings**:
- **Chat/Synthesis**: llama-server (:8090, TurboQuant Gemma4 RotorQuant)
- **Embeddings**: Ollama (:11434, embeddinggemma:latest, 768-dim native + optional 384-dim truncation)
- **Embedding Alignment**: Parent Atlas semantic rerankers (LangExtract, AST-grep, tree-sitter, lexical)

**Vector Index & Reranking**:
- **Vector store**: Qdrant (:6333, 768-dim dual-vector codebase_chunks_768, content + signature)
- **Semantic alignment**: TreeChunker + AST-grep structural extraction → LangExtract entity/NLP alignment → Python middleware for confidence scoring
- **Prefilter**: TurboVec (:8791, optional, 4-bit quantized 64-dim ANN after semantic alignment)

**Graph & Context**:
- **Graph/topology**: Neo4j (:7687, optional for KAG queries, authority scoring)
- **Cache**: Redis/Valkey (:6379, BitFrost semantic cache post-alignment, ACE context)
- **Truth layer**: PostgreSQL (:5434, atlas_packets + schema with confidence scores)

---

## Installation

### 1. Configuration Added to `.mcp.json`

Added atlas-tools server definition:

```json
"atlas-tools": {
  "command": "node",
  "args": ["./sveltekit-frontend/src/mcp/server.ts"],
  "env": {
    "NODE_ENV": "production",
    "DATABASE_URL": "postgresql://legal_admin:legal@127.0.0.1:5434/legal_ai_db",
    "REDIS_HOST": "127.0.0.1",
    "REDIS_PORT": "6379",
    "REDIS_PASSWORD": "redis",
    "QDRANT_URL": "http://127.0.0.1:6333",
    "NEO4J_URI": "bolt://127.0.0.1:7687",
    "NEO4J_USERNAME": "neo4j",
    "NEO4J_PASSWORD": "legal"
  }
}
```

### 2. Configuration Added to `.opencode/opencode.jsonc`

Added atlas-tools to OpenCode MCP servers:

```jsonc
"atlas-tools": {
  "type": "local",
  "command": ["npx", "tsx", "./sveltekit-frontend/src/mcp/server.ts"],
  "enabled": true,
  "timeout": 30000,
  "env": {
    "NODE_ENV": "production",
    "MCP_STDIO": "true"
  }
}
```

---

## Available Tools

The atlas-tools MCP server exposes tools via the underlying MCP server at `sveltekit-frontend/src/mcp/server.ts`:

### Core Tools (Read-Only)

**Structural Analysis**:
- **codebase_traversal** — Find files by pattern, explore imports, detect cycles (tree-sitter AST)
- **ast_extract** — AST-grep structural extraction (functions, classes, imports, symbols)
- **treechunker_segment** — TreeChunker-based code segmentation (syntactic boundaries)

**Semantic Alignment & Reranking**:
- **langextract_entities** — LangExtract entity/NLP extraction (semantic anchors)
- **semantic_align** — Parent Atlas semantic alignment (cross-lane consistency scoring)
- **lexical_match** — Lexical reranking (BM25, TF-IDF, keyword density)

**Retrieval & Search**:
- **vector_search** — Qdrant semantic search, dual-vector (768-dim content + signature) rerank
- **kag_search** — KAG multi-hop graph search + Neo4j traversal (community context)
- **pagerank_top** — Top-N files by PageRank authority scoring

**Metadata & Identity**:
- **packet_identity** — Resolve packet_key, verify lineage, validate feature_id (with confidence)
- **topology_search** — Query SOM clusters, find K-NN neighbors by PageRank
- **wiki_lookup** — Retrieve wiki notes by directory, search AGENTS.md

### Dispatcher Tools (Requires Auth)

- **identity_recover** — Recover canonical identity for orphaned packets
- **envelope_validate** — Validate packet envelope structure
- **mirror_sync_qdrant** — Sync Qdrant payload with Postgres truth
- **mirror_sync_neo4j** — Sync Neo4j topology with graph state
- **graph_expand** — K-hop neighbor expansion (topology-aware, from Neo4j)
- **retrieval_rerank** — 6-signal fusion reranking (Qdrant + TurboVec + AST + SOM + authority)
- **answer_synthesize** — Gemma4 answer generation with ACE context (llama-server :8090)

---

## Usage

### From Claude Code

atlas-tools tools are automatically available in Claude Code when MCP is initialized:

```typescript
// Call via MCP
const result = await mcpTool('atlas-tools.codebase_traversal', {
  query: 'find files importing from src/lib/server/db',
  limit: 10
});
```

### From OpenCode / Gemma4 (Local)

When atlas-tools is configured in OpenCode, Gemma4 can call tools directly:

```
@atlas-tools find_files_by_pattern src/lib/server/retrieval/*.ts
```

### Command-Line (mcporter)

Test tools without invoking the full MCP stack:

```bash
npx mcporter call atlas-tools.codebase_traversal query:"reranker" limit:5
```

---

## Service Dependencies

atlas-tools requires the following services to be running:

| Service | Port | Status Required | Purpose |
|---------|------|-----------------|---------|
| PostgreSQL | 5434 | ✅ Required | Truth layer (canonical packets, identity, confidence scores) |
| Redis/Valkey | 6379 | ✅ Required | Cache layer (BitFrost semantic cache post-alignment, ACE context) |
| Qdrant | 6333 | ✅ Required | Vector search (768-dim dual-vector semantic index) |
| llama-server | 8090 | ✅ Required | LLM synthesis (Gemma4 RotorQuant, TurboQuant) |
| Ollama | 11434 | ✅ Required | Embeddings (embeddinggemma:latest, 768-dim native) |
| Parent Atlas Python Middleware | 8100+ | ✅ Required | Semantic alignment (LangExtract, AST-grep, tree-sitter, lexical reranking) |
| Neo4j | 7687 | ⚠️ Optional | Topology queries (graph traversal, authority scoring via PageRank) |
| TurboVec | 8791 | ⚠️ Optional | Vector prefilter (4-bit quantized 64-dim ANN after semantic alignment) |

---

## Verification

### 1. Check MCP Server is Discoverable

```bash
npx mcporter list | grep atlas-tools
```

Expected output: `atlas-tools — Codebase traversal + topology queries (N tools, X.Xs)`

### 2. Test Tool Availability

```bash
npx mcporter call atlas-tools.codebase_traversal query:"auth" limit:3
```

### 3. Verify Claude Code Integration

In Claude Code, use the atlas-tools via `/trace-mcp-tooling` skill:

```
/trace-mcp-tooling install atlas-tools
```

---

## Files Modified

- `.mcp.json` — Added atlas-tools server definition
- `.opencode/opencode.jsonc` — Added atlas-tools to MCP servers
- `docs/ATLAS-TOOLS-MCP-INSTALLATION.md` — This documentation

---

## Next Steps

1. ✅ **Installation Complete** — atlas-tools configured in MCP
2. ⏳ **Service Verification** — Ensure Postgres/Redis/Qdrant/Neo4j are running
3. ⏳ **Tool Testing** — Run `npx mcporter call atlas-tools.*` to verify tools
4. ⏳ **Claude Code Integration** — atlas-tools tools will be available on next session

---

## Troubleshooting

**atlas-tools not appearing in MCP list?**
- Restart OpenCode / Claude Code
- Verify Postgres connection: `psql -U legal_admin -d legal_ai_db -c "SELECT 1"`
- Check Redis: `redis-cli PING`
- Check Qdrant: `curl http://127.0.0.1:6333/collections`

**Tool calls timeout?**
- Increase timeout in `.opencode/opencode.jsonc` (try 60000ms)
- Verify database is responsive: check for long-running queries
- Verify llama-server running: `curl http://127.0.0.1:8090/v1/models`

**Synthesis tools fail ("answer_synthesize")?**
- Ensure llama-server is running with Gemma4 RotorQuant: `http://127.0.0.1:8090`
- Verify model supports tools: `curl http://127.0.0.1:8090/v1/models | jq '.data[0].tools'`
- Check system prompt template: should be custom `gemma4-opencode.jinja` (not stock)

**Embedding searches fail?**
- Verify Ollama is running: `http://127.0.0.1:11434/api/tags`
- Expected model: `embeddinggemma:latest` (768-dim native, canonical for semantic alignment)
- Note: Truncation to 384-dim is optional post-alignment via Parent Atlas middleware
- Verify Parent Atlas Python middleware is running (semantic alignment service)
- DO NOT use Ollama for chat — llama-server (TurboQuant) is the canonical chat endpoint

**Semantic alignment failing?**
- Verify Parent Atlas Python middleware running (LangExtract, AST-grep, tree-sitter)
- Check confidence scores in Postgres: `SELECT packet_key, semantic_confidence FROM atlas_packets LIMIT 5`
- Verify TreeChunker-sitter AST extraction working: chunking should be syntactically aware
- Lexical reranking should follow semantic alignment in pipeline order

**MCP_STDIO error?**
- Ensure Node.js tsx is installed: `npm install -D tsx`
- Try direct node execution instead: `command: ["node", "./sveltekit-frontend/src/mcp/server.ts"]`

---

## Semantic Alignment Pipeline

Atlas-tools implements a multi-stage semantic alignment strategy to normalize embeddings and ensure consistency:

### Pipeline Order (Sequential)

1. **TreeChunker-sitter AST Segmentation**
   - Input: Raw source code
   - Tool: tree-sitter AST parser (syntax-aware boundaries)
   - Output: Syntactically aligned code chunks
   - Storage: `codebase_chunk_index.content` (canonical chunks)

2. **AST-grep Structural Extraction**
   - Input: Syntactic chunks
   - Tool: ast-grep (pattern matching on AST nodes)
   - Output: Functions, classes, imports, symbols with metadata
   - Storage: Postgres `code_structures` (optional)

3. **LangExtract Entity/NLP Alignment**
   - Input: Structural metadata
   - Tool: LangExtract (semantic entity extraction)
   - Output: Named entities, semantic anchors, NLP confidence scores
   - Storage: Postgres `semantic_anchors` table

4. **Embedding (Native 768-dim)**
   - Input: Normalized text + semantic anchors
   - Service: Ollama embeddinggemma:latest (768-dim native)
   - Output: Full-dimensional embeddings
   - Storage: `codebase_chunk_index.content_embedding` (Qdrant payload)

5. **Semantic Alignment Scoring**
   - Input: Embeddings + structural metadata + entity alignment
   - Service: Parent Atlas Python middleware
   - Computes: Per-lane confidence (semantic, lexical, structural, AST, domain)
   - Output: `semantic_confidence`, `alignment_score`, per-lane flags
   - Storage: Postgres `atlas_packets` confidence columns

6. **Optional: 384-dim Truncation (Post-Alignment)**
   - Input: 768-dim aligned embeddings
   - Process: MRL (Matryoshka Representation Learning) projection
   - Output: 384-dim truncated vectors for TurboVec prefilter
   - Storage: Optional Redis cache for fast retrieval

7. **Dual-Vector Qdrant Indexing**
   - Input: 768-dim embeddings (canonical)
   - Storage: Qdrant `codebase_chunks_768` with:
     - `content_embedding` (768-dim, primary semantic search)
     - `signature_embedding` (768-dim, secondary rerank signal)
   - Reranking: 6-signal fusion (semantic + signature + AST + SOM + authority + lexical)

### Confidence Tracking

Each embedding carries confidence metadata:
- `semantic_confidence` — LangExtract alignment score (0.0–1.0)
- `alignment_score` — Cross-lane consistency (0.0–1.0)
- `per_lane_flags` — Semantic, lexical, structural, AST, domain membership confidence
- `truncation_loss` — Quality delta if 768→384 truncation applied

### Cache Invalidation

BitFrost semantic cache (Redis) is invalidated when:
- Embeddings are regenerated (`semantic_confidence` changes significantly)
- Structural metadata changes (AST reparse or LangExtract update)
- Alignment scores fall below threshold (e.g., <0.7)

---

**Installation complete. atlas-tools is now integrated with Claude Code and OpenCode.**
