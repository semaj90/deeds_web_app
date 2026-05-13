# 🚀 Agentic Dev Stack Guide (Phase 76 Alignment)

This guide clarifies the **actual** state of your orchestration and provides the manual for your unified development workflow.

## 🧭 Clean Stack Map

The current stack is best treated as a planner-driven retrieval system with three inference lanes:

```text
User request
  ↓
SvelteKit route / UI action
  ↓
ACE planner
  ├─ hash current request state
  ├─ check Redis hot context pack
  ├─ check Postgres durable context registry
  └─ reuse cached pack or fetch deltas only
  ↓
Retrieval layers
  ├─ RAPTOR = hierarchical summaries
  ├─ GraphRAG = entities, paths, relations
  ├─ Qdrant = vector recall
  └─ Neo4j = graph / Pentagon / KAG paths
  ↓
Context pack assembly
  ├─ system prompt
  ├─ tool definitions
  ├─ legal / evidence / code chunks
  ├─ feature/wiki packets
  └─ retrieval trace + cache metadata
  ↓
Inference backend
  ├─ llama-server = primary controllable backend
  ├─ Ollama = convenience / model management lane
  └─ TurboQuant / RotorQuant / Gemma 4 MTP = experimental speed lanes
  ↓
Generation + trace writeback
  ├─ answer
  ├─ trace summary
  └─ cache registry update
```

### Layer Roles

| Layer | Role | Notes |
|---|---|---|
| `llama-server` | Main inference backend | Best place to test low-level GPU, KV, and prompt-cache behavior |
| `Ollama` | Convenience backend | Good for pulls, demos, and simple API integration |
| `TurboQuant` / `RotorQuant` | Compression lane | Experimental KV/weight compression, not a required dependency |
| `Gemma 4 MTP` | Decode-speed lane | Helps after prefill; does not replace ACE cache planning |
| `RAPTOR` | Hierarchical memory | Tree summaries for long docs, cases, and conversation state |
| `GraphRAG` | Relational memory | Paths, entities, evidence links, file/symbol/test relationships |
| `ACE` | Brain / router / cache planner | Decides whether to reuse, delta-fetch, or rebuild context |
| `Redis` | Hot memory | Context packs, trace state, locks, lane health, short-lived cache |
| `Postgres` | Durable truth | Context registry, trace audit, summary records, cache metadata |
| `Qdrant` | Vector recall | Semantic retrieval and rerank support |
| `Neo4j` | Graph recall | Graph paths, Pentagon, KAG and topology queries |
| `NVMe` | Cold artifact store | Context pack snapshots, graph snapshots, future KV artifacts |

### Runtime Flow

1. Compute a stable cache key from request state, model state, tool state, corpus state, and graph state.
2. Check Redis for a hot context pack.
3. If Redis misses, check the durable Postgres registry.
4. If a cached pack is valid, reuse it and retrieve only deltas.
5. If not, rebuild via RAPTOR and GraphRAG, then pack the context once.
6. Send the packed prompt to `llama-server` or the selected backend lane.
7. Write back answer summary, trace metadata, and cache registry entries.

### GPU Acceleration Split

| Capability | What it helps | Where it belongs |
|---|---|---|
| CUDA streams | Overlap GPU work | Embedding batches, rerank batches, concurrent lane work |
| CUDA graphs | Reduce repeated kernel launch overhead | Repeated decode shapes, stable prompt/session patterns |
| GPU layer/KV offload | Fit more model state on RTX | `llama-server` / backend serving lane |
| TurboQuant / RotorQuant | Reduce KV or weight pressure | Experimental backend capabilities, not planner logic |

## 🛠️ The Unified Orchestrator: `npm run dev:agent`
We have unified the disparate GPU and research scripts into a single entry point.
- **Command**: `npm run dev:agent`
- **What it does**:
  1. **Hardware Alignment**: Enables FlashAttention 2, sets INT8 KV cache (`q8_0`), and configures `PYTORCH_CUDA_ALLOC_CONF` for your RTX 3060 Ti.
  2. **Infrastructure**: Starts the full Docker profile (Postgres, Redis, Qdrant, MinIO, Bifrost, SearXNG).
  3. **Inference**: Launches Ollama via `start-ollama-flash-attention.bat`.
  4. **Context7 Bridge**: Starts the SvelteKit API in cluster mode (PM2) to handle high-concurrency tool calls.
  5. **Watchdog**: Runs a background VRAM monitor to prevent OOM errors.

## 📓 Obsidian Notebook Integration
To bridge your research logs and "ACE Hits" (Automated Codebase Engineering) into Obsidian:
1. **Script**: `scripts/sync-to-obsidian.ps1`
2. **Usage**:
   ```powershell
   powershell scripts/sync-to-obsidian.ps1 -VaultPath "C:\Path\To\Your\Obsidian\Vault"
   ```
3. **Outcome**: Generates dated Markdown reports based on your AST audits and research findings.

## 🌐 WebUI Dashboards
Your SvelteKit 2 frontend is pre-loaded with several dashboards for monitoring:
- **Main Dashboard**: `http://localhost:5173/dashboard`
- **AI Analytics**: `http://localhost:5173/ai-dashboard` (Monitor model throughput and VRAM)
- **Error Brain**: `http://localhost:5173/admin/error-brain` (Deep AST audit visualization)
- **Indexing UI**: `http://localhost:5173/indexing` (Manage the GPU Codebase Indexer)

## 🏗️ Merging & Salvaging (Deep Audit Alignment)
To address the concern of "did you remove too much?":
- **Phase 76 vs GPU Indexer**: We have preserved the Phase 76 scripts for **Web Research** (recursive crawling) while promoting the `codebase-semantic-indexer.ts` (GPU-First) for **Local Intelligence**.
- **Context7**: The "Multicore Context7" server is now the primary bridge for FastMCP tool-calling. This means your agents have access to both the local vector store (Qdrant) and the real-time codebase graph (Neo4j).

## ⚡ Performance Tuning (RTX 3060 Ti)
- **VRAM**: 8GB limit is respected via `q8_0` KV caching and `max_split_size_mb:512`.
- **Inference Speed**: ~40-60 tokens/sec with Gemma 4 using native CUDA acceleration.
- **Offloading**: CPU offloading is active. If a task exceeds 8GB, the KV cache will partially offload to system RAM.
