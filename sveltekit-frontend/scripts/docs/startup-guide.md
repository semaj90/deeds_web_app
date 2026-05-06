# TRACE Stack — Startup Guide

Service map and VS Code task reference for the GPU LLM + Karpathy wiki + MCP graph stack.

---

## Service Map

| Port | Service | Task Label | Detached? |
|------|---------|------------|-----------|
| :8090 | `llama-server.exe` — Gemma4 TurboQuant GGUF | 🦙 llama-server: Start | ✅ |
| :8101 | Topology search server — 4D manifold | auto via `predev` | ✅ |
| :8788 | TRACE MCP server — graph/KAG tools | 🧠 TRACE: Start MCP Server | ✅ |
| :5173 | SvelteKit dev — main app | Dev Server | ❌ foreground |

---

## One-Command Start

```bash
# Launches all 4 services:
npm run trace:start
# or from VS Code:
# Task: "🚀 TRACE: Start Full Stack (llama + topo + MCP + SvelteKit)"
```

---

## Individual Service Start

### llama-server.exe (Gemma4 TurboQuant)
```bash
# VS Code task: "🦙 llama-server: Start Gemma4 VLM (TurboQuant :8090)"
npm run turbo:start:detached
```

### Topology Search Server (:8101)
```bash
# Auto-started by predev hook when you run npm run dev
# Or manually:
node scripts/topology-search-server.mjs
# Detached:
node scripts/ensure-search-engine.mjs --spawn
```

### TRACE MCP Server (:8788)
```bash
# VS Code task: "🧠 TRACE: Start MCP Server only (:8788)"
npm run mcp:trace
# Detached (via predev):
node scripts/ensure-mcp-server.mjs --spawn
```

### SvelteKit Dev (:5173)
```bash
# Auto-spawns topology-search :8101 and TRACE MCP :8788 via predev hook
npm run dev
```

---

## Auto-Spawn on `npm run dev`

`scripts/ensure-dev-runtime.mjs` is the `predev` hook. It spawns:

1. `scripts/ensure-search-engine.mjs --spawn` → topology-search :8101
2. `scripts/ensure-mcp-server.mjs --spawn`   → TRACE MCP :8788

Both use the same detached pattern as `llama-server.exe`:
```js
spawn(node, [script, '--spawn'], { detached: true, stdio: 'ignore', windowsHide: true })
child.unref()
```

---

## Health Checks

```bash
# Topology search
curl http://127.0.0.1:8101/health

# TRACE MCP
curl http://127.0.0.1:8788/health
# or: npm run smoke:trace

# llama-server
curl http://127.0.0.1:8090/health

# Qdrant
curl http://localhost:6333/

# Redis
docker exec deeds-redis-prod redis-cli ping
```

---

## TRACE MCP Tools (10)

Connect any MCP client to `http://127.0.0.1:8788`:

| Tool | What it does |
|------|-------------|
| `graph.expand_neighborhood` | Ego-graph expansion in Neo4j (up to 3 hops) |
| `graph.shortest_path` | Multi-hop path between two stableKeys |
| `graph.community_for_node` | GPU cluster + SOM cluster for a node |
| `graph.pagerank_top` | Top-N files by PageRank (Redis or Neo4j) |
| `topology.search_near` | 4D manifold neighborhood search |
| `topology.same_som_cluster` | All files sharing the same SOM cluster |
| `clusters.get_members` | Files in a GPU cluster key |
| `clusters.get_summary_lenses` | Wiki notes + AGENTS.md for a cluster |
| `trace.kag_search` | Full KAG-DAG retrieval via SvelteKit |
| `trace.explain_retrieval` | Show cached ACE retrieval trace |

---

## Karpathy Wiki Pipeline

The Graphify/Karpathy stack indexes the codebase into structured memory:

```
npm run graphify:daily    → AST scan → codebase-graph.json + Redis KAG notes
npm run graphify:semantic → Qdrant 768-dim embeddings
npm run graphify:topology → Hypergraph + SOM + Neo4j edges
npm run graphify:full     → all of the above + cluster summaries + AGENTS.md
```

VS Code task group: all tasks prefixed with 🗺️/🔎/🧠/🏭 Graphify.

---

## Gemma4 Agentic Tool Calling

Gemma4 calls MCP tools through the SvelteKit agent API:

```
User query → POST /api/ai/agent
  → gemma4-agent.ts (4 inline tools + TRACE MCP bridge)
  → TRACE MCP :8788 tool call
      → Neo4j / Qdrant / Redis / Postgres
  → result back to Gemma4
  → synthesized answer
```

Direct API: `POST /api/ai/agent` with `{ query, pipeline }`.

---

## VS Code Task Groups

| Emoji prefix | Category |
|---|---|
| 🚀 TRACE: | Full stack startup + tests |
| 🦙 llama-server: | Gemma4 GGUF inference |
| 🗺️/🔎/🧠/🏭 Graphify: | Karpathy wiki pipeline |
| 🎮 nes-arch: | AGENTS.md NES arch |
| 🔍 ACE: | Deep directory audit |
| 🤖 Agent: | Batch error fix agents |
| 📂 Dir: | Directory map + audit |
| 📊 FF1: | Fast-fix audit pipeline |
| 🏥 / 🧪: | Health checks + tests |
| Dev Server / Docker / DB: | Infrastructure |
