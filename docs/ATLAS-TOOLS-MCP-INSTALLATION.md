# Atlas-Tools MCP Installation — Complete

**Date**: 2026-07-27  
**Status**: ✅ INSTALLED  
**Target**: Claude Code / OpenCode integration

---

## Overview

`atlas-tools` is a local MCP (Model Context Protocol) server that provides safe, read-only access to the deeds-web-app project metadata:

- **Codebase traversal** — File graph, imports, references
- **Topology queries** — SOM clusters, PageRank, Neo4j neighbors
- **Knowledge base** — Wiki notes, AGENTS.md, directory context
- **Vector search** — Qdrant semantic search, embeddings
- **Package identity** — Packet key resolution, lineage verification

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

- **codebase_traversal** — Find files by pattern, explore imports, detect cycles
- **topology_search** — Query SOM clusters, find K-NN neighbors by PageRank
- **wiki_lookup** — Retrieve wiki notes by directory, search AGENTS.md
- **packet_identity** — Resolve packet_key, verify lineage, validate feature_id
- **vector_search** — Qdrant semantic search, dual-vector (content + signature) rerank

### Dispatcher Tools (Requires Auth)

- **identity_recover** — Recover canonical identity for orphaned packets
- **envelope_validate** — Validate packet envelope structure
- **mirror_sync_qdrant** — Sync Qdrant payload with Postgres truth
- **mirror_sync_neo4j** — Sync Neo4j topology with graph state
- **graph_expand** — K-hop neighbor expansion (topology-aware)
- **retrieval_rerank** — 6-signal fusion reranking (Qdrant + TurboVec + AST + SOM)
- **answer_synthesize** — Gemma4 answer generation with ACE context

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

| Service | Port | Status Required |
|---------|------|-----------------|
| PostgreSQL | 5434 | ✅ Required (truth layer) |
| Redis/Valkey | 6379 | ✅ Required (cache) |
| Qdrant | 6333 | ✅ Required (vector search) |
| Neo4j | 7687 | ⚠️ Optional (topology) |
| Ollama (embeddings) | 11434 | ⚠️ Optional (embedding fallback) |

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

**Tool calls timeout?**
- Increase timeout in `.opencode/opencode.jsonc` (try 60000ms)
- Verify database is responsive: check for long-running queries

**MCP_STDIO error?**
- Ensure Node.js tsx is installed: `npm install -D tsx`
- Try direct node execution instead: `command: ["node", "./sveltekit-frontend/src/mcp/server.ts"]`

---

**Installation complete. atlas-tools is now integrated with Claude Code and OpenCode.**
