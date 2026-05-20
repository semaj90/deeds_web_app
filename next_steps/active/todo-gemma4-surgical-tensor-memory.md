# TODO — Gemma4 Surgical Tensor / Memory Optimization Pipeline
**Branch:** feat/gemma4-surgical-analysis
**Status:** Active planning — focused phase
**Updated:** 2026-05-18

---

## 🎯 Core Objective

Turn transformer internals (attention heads / activations)
→ into compressed documents
→ stored in NVMe + Qdrant + Redis
→ used via ACE retrieval instead of raw context

**Phase 1 — Tensor / Attention Head Analysis**

Goal:
- Identify which parts of Gemma4 actually matter for:
  - coding
  - legal reasoning
  - retrieval grounding

Tasks:
- [ ] Extract attention head activations from Gemma4
- [ ] Log:
  - attention maps
  - token importance
  - layer-wise contribution
- [ ] Identify:
  - redundant heads
  - low-impact layers
  - repetitive patterns

Output:
- `/head-analysis/`
  - `layer_0.json`
  - `layer_1.json`
  - ...
  - `attention_scores.parquet`

---

## ⚙️ Phase 2 — Head → Document Conversion

Idea:
- attention head → semantic pattern → document chunk

Tasks:
- [ ] Convert high-importance attention outputs into text summaries
- [ ] Group by:
  - coding patterns
  - legal reasoning patterns
  - retrieval signals
- [ ] Normalize into chunk format:
```json
{
  "source": "attention_head",
  "layer": 12,
  "pattern": "sql_query_validation",
  "summary": "Validates SQL schema before execution",
  "embedding": [...]
}
```

---

## 💾 Phase 3 — NVMe Cold Storage

Goal:
- Offload model “memory” into disk instead of VRAM.

Tasks:
- [ ] Store chunks in:
  - JSONL
  - Parquet
- [ ] Organize:
  - `/nvme-corpus/`
    - `/coding/`
    - `/legal/`
    - `/retrieval/`
- [ ] Add snapshot system:
  - versioned embeddings
  - cluster metadata

---

## 🔍 Phase 4 — Qdrant + Topological Index

Goal:
- Make memory searchable + structured.

Tasks:
- [ ] Insert chunks into Qdrant
- [ ] Add metadata:
```json
{
  "topoClass": "db.query",
  "somRow": 12,
  "somCol": 4,
  "pagerank": 0.82,
  "authority": 0.91
}
```
- [ ] Implement:
  - semantic search
  - cluster filtering
  - neighborhood expansion

---

## 🧩 Phase 5 — GraphRAG / KAG / DAG Layer

Goal:
- Control how memory is used.

Tasks:
- [ ] Build graph edges:
  - SIMILAR
  - DEPENDS_ON
  - CITES
- [ ] Implement KAG:
  - select highest authority + relevance
- [ ] Implement DAG:
  - order dependencies before synthesis

---

## ⚡ Phase 6 — CUDA / RTX Optimization

Goal:
- Use GPU for ranking, not full inference.

Tasks:
- [ ] Implement CUDA kernels for:
  - embedding similarity
  - attention scoring
  - cluster distance
- [ ] Batch rerank top-K candidates
- [ ] Use CUDA Graphs for repeated queries

**Not doing**
- ❌ full custom LLM inference
- ❌ shader-based token generation

---

## 🧠 Phase 7 — ACE Context Assembly

Goal:
- Replace raw prompt with compact memory packet.

Tasks:
- [ ] Build ACE packet:
```json
{
  "query": "...",
  "clusters": [...],
  "chunks": [...],
  "scores": {...}
}
```
- [ ] Enforce limits:
  - ACE packet ≤ 3500 tokens
  - top_k = 3–5
- [ ] Cache in Redis:
  - `ace:topo:{hash}`
  - `ace:packet:{hash}`

---

## 🔌 Phase 8 — TRACE MCP Integration

Goal:
- Tool-based retrieval, not prompt dumping.

Tasks:
- [ ] Add MCP tools:
  - `kb.trace_search`
  - `db.schema_overview`
  - `ace.build_packet`
- [ ] Enforce:
  - limit ≤ 3
  - maxTokens ≤ 512

---

## 🎨 Phase 9 — WebGPU + Shader Visualization

Goal:
- Visualize topology + reasoning.

Tasks:
- [ ] Build WebGPU renderer
- [ ] Map:
  - clusters → nodes
  - edges → relations
- [ ] Use SharedArrayBuffer for graph data
- [ ] Add shader effects:
  - cluster heatmaps
  - attention flow

---

## 🖥️ Phase 10 — SvelteKit 2 Integration

Stack:
- SvelteKit 2
- Svelte 5 runes
- Bits UI v2
- Drizzle ORM 0.44
- PostgreSQL

Tasks:
- [ ] Build components:
  - Context viewer
  - Token usage meter
  - Graph explorer
- [ ] Add endpoints:
  - `/api/ace/context`
  - `/api/graph/search`
  - `/api/llm/chat`

---

## 💬 Phase 11 — AI Chat Pipeline

Flow:
- User prompt
- → TRACE MCP
- → ACE packet
- → Gemma4
- → response

Tasks:
- [ ] Inject ACE packet into system prompt
- [ ] Limit:
  - input ≤ 12k tokens
  - output ≤ 4096 tokens

---

## 📊 Phase 12 — Metrics & Tracking

Track:
- input_tokens
- ace_packet_size
- mcp_payload
- cache_hit_rate
- latency
- tokens/sec

Success:
- cache hit > 60%
- latency decreases
- token usage stable

---

## 🧪 Phase 13 — tmux Multi-Head Analysis

Setup:
```bash
tmux new -s gemma4
```

# panes
1 → llama-server
2 → TRACE MCP
3 → ingestion / graphify
4 → logs

---

## 🧠 Final Target

Gemma4 (16k–32k)
+ ACE memory layer
+ Qdrant topology
+ CUDA reranking
+ GraphRAG
= 64k+ effective reasoning

**Bottom Line**
Do not store intelligence in VRAM.
Store it in structured memory.

---

## Next Step Options

If you want next step, I can help you:
- design the **attention head extraction code (real implementation)**
- or build the **CUDA reranking kernel**
- or wire the **SvelteKit UI for graph + token tracking**
