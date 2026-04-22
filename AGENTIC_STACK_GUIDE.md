# 🚀 Agentic Dev Stack Guide (Phase 76 Alignment)

This guide clarifies the **actual** state of your orchestration and provides the manual for your unified development workflow.

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
