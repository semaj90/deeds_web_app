# RotorQuant + bitnet.c — Integration Notes + Cache Hierarchy Design

**Status**: research / planning. **NOT IMPLEMENTED — docs/notes only.**
Sits alongside `memory/gpu-weight-architecture.md` (RotorQuant vs TurboQuant vs TurboVec table) and the existing CUDA Graph + WGSL reranker stubs.

**Created**: 2026-05-10
**Scope**: how three currently-unused quantization paths (RotorQuant, bitnet.c 1-bit, attention-head-aware KV) would compose with the existing TurboQuant + Bifrost + Karpathy + HyperRAG + ACE stack — and what the build order looks like IF we ever commit to it.

---

## 0. Why this doc exists

The system today is fast enough for the work the operator is doing. This doc captures the architecture so the next session doesn't re-research the same trade-offs. Three things specifically:

1. **RotorQuant** — Scrya repo (Mar 2026 release). 3-bit weights via block-diagonal rotations. 28% faster decode, 5.3× faster prefill vs TurboQuant **on Llama-3.1-8B** (D=128). **Gemma 4 head_dim safety unverified.**
2. **bitnet.c** — `https://github.com/artalis-io/bitnet.c` — pure C11 ternary/1-bit inference, zero deps, 20+ quant formats including TurboQuant 3-bit KV. **No CUDA path** (CPU + WebGPU + Metal only). For your RTX 3060 Ti, this is a CPU-offload / edge play, not a primary inference target.
3. **NVMe → SSD → RAM → VRAM → L1/L2/L3 cache hierarchy** — currently we only have Bifrost L2 (port 3040) + Redis L1 (5ms exact-match) + L3 (cold Ollama). Want to extend with on-disk warm tiers + attention-head-aware KV.

---

## 1. The cache hierarchy you sketched

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 0 — VRAM (8 GB on RTX 3060 Ti)                                         │
│   • Active model weights (Gemma 4 VLM, ~5.3 GB)                             │
│   • Active KV cache (TurboQuant q8_0/q8_0 ≈ 2 GB at 16K ctx)                │
│   • Hot LibTorch tensors for attentionScoreGPU / pageRankGPU                │
│   • Eviction: LRU on prefix hash; cold prefixes spill → Tier 1              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 1 — System RAM (host)                                                  │
│   • Recently-evicted KV blocks (per-prefix-hash, mmap-friendly)             │
│   • Bifrost L2 cache (semantic, port :3040 → Qdrant-backed)                 │
│   • Redis L1 exact-match (5ms, port :6379)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 2 — NVMe warm cache (proposed)                                         │
│   • On-disk KV-block store, mmap'd into Tier 1 on demand                    │
│   • Path: `data/kv-warm/{prefix_hash}/{layer}.f32`                          │
│   • TTL: 24h LRU; ~50–100 GB ceiling configurable                           │
│   • Re-load: ~200–500 MB/s NVMe → faster than re-prefill from cold prompt   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 3 — SSD cold cache (proposed, parallel to NVMe)                        │
│   • Older prefix-hash blobs, week+ retention                                │
│   • Used only for re-warm into Tier 2; never directly into VRAM             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 4 — Cold inference (Ollama / llama-server fallthrough)                 │
│   • Re-prefill from scratch — 25s typical for Gemma 4 on RTX 3060 Ti        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Hit rate target**: 90–95% across Tiers 0–2 (matches current L1+L2 combined per CLAUDE.md "Redis L1 + Bifrost L2 Cache System"). Tier 3 catches the cold reactivation case where a user returns to a case after a week.

**The "attention NVMe warm cache" idea** is concretely Tier 2 above — KV blocks keyed by `(prefix_hash, layer_idx)`, sharded to one file per layer per prefix. The win is that re-warming a 16K-context conversation is bound by sequential NVMe read (≈200ms for 2 GB) instead of attention prefill (≈25s).

---

## 2. RotorQuant integration notes

### What it is

| Property | Value |
|---|---|
| Source | Scrya repo, March 2026 release |
| Bits | 3-bit weights (PlanarQuant 2D / IsoQuant 4D rotations) |
| Block size | 128 params per rotation block (vs TurboQuant's 16,384) |
| Speed vs TurboQuant on Llama-3.1-8B | **+28% decode, +5.3× prefill** |
| Gemma 4 head_dim safety | **Unknown — needs validation** |
| File format | Custom quantized weights; not GGUF-compatible by default |

### The Gemma 4 risk (same shape as the TurboQuant D=128 problem)

Llama-3.1-8B uses `head_dim=128` end-to-end. Gemma 4 uses:
- SWA layers: `head_dim=256`
- Global layers: `head_dim=512`

Block-diagonal rotation schemes (IsoQuant 4D quaternion) are head_dim-sensitive. The Scrya kernels almost certainly ship D=128-only, like TurboQuant prebuilts. Verification path:

```bash
# Inside the Scrya build dir
grep -rn "HEAD_DIM\|D=128\|D=256" csrc/   # find compile-time constants
# Look for HEAD_DIM_TILE_SIZE, ATTENTION_HEAD_DIM, etc.
```

If the kernels are D=128-only, the same fix as TurboQuant applies: either source-patch to add D=256/512 kernels OR limit RotorQuant to embedding-only paths (where head_dim doesn't apply).

### Where it would land in this codebase

| If we integrate | Where | Replaces |
|---|---|---|
| RotorQuant for chat weights | New binary path `LLAMA_SERVER_PATH = C:/rotorquant/llama-server.exe` + `TURBO_PROFILE=rotorquant` | TurboQuant `--ctk q8_0 --ctv turbo3` |
| RotorQuant for KV cache only | Patch llama-server to accept `--ctv rotor3` flag | TurboQuant turbo3 |
| RotorQuant for embeddings | Run alongside embedding-gemma, replace `embedding-client.ts` source-tier 1 | Direct Ollama `/api/embed` |

**Recommendation**: NOT NOW. The Gemma 4 head_dim risk + the source-build cost (CMake CUDA, ~30 min) + the test1111 fork being a more mature path for the same speedup means RotorQuant goes in the "evaluate quarterly" bucket alongside CUDA Graph capture.

---

## 3. bitnet.c — 1-bit inference notes

URL: https://github.com/artalis-io/bitnet.c

### Verified facts (fetched 2026-05-10)

- **Pure C11**, zero deps beyond libc/libm. Compiles to WASM too.
- **CPU-first**: ARM NEON/SDOT, AVX2 x86-64, WASM SIMD128.
- **Optional GPU**: WebGPU + native Metal. **No CUDA path** — would run CPU-only on Windows + RTX 3060 Ti.
- **20+ quant formats**: I2_S, TQ1_0, TQ2_0 (ternary/1.58-bit), K-quants Q2_K…Q8_K, imatrix IQ2/IQ3/IQ4.
- **Loads GGUF** directly, BPE tokenizer from GGUF metadata.
- **Memory**: TurboQuant 3-bit KV = 8.9× reduction. **~11 concurrent 64K-context sessions on 32 GB**.
- **Speed**: 19–20 tok/s on Qwen3-30B MoE on M1 Max (CPU). Beats llama.cpp CPU on sparse MoE models at steady state.
- **Hybrid SSM+attention + MoE expert caching** are recent additions (active dev, 224 commits).

### Where it fits (honestly: niche on this machine)

| Use case | bitnet.c fit |
|---|---|
| Primary chat backend for Hermes / SvelteKit | ❌ — no CUDA, would be CPU-only on Windows. Slower than your existing Ollama + llama-server CUDA path. |
| Browser-side fallback (WASM) | ✅ — only viable option for client-side legal-AI inference. Pairs with your existing `static/gemma3_270m_onnx/` client-router. |
| Edge / air-gapped review laptop | ✅ — air-gapped courtroom laptop with no GPU runs ternary Gemma 4 fine on a recent CPU. |
| Hybrid CPU offload for K-quant Q2 fallback | ⚠️ possible — wire as Tier 4.5 between Ollama (CUDA) and pure-CPU re-prefill. |
| TurboQuant 3-bit KV implementation reference | ✅ — bitnet.c's TQ1_0/TQ2_0 source is a working reference for the algorithm |

### Recommendation

Two concrete places this is interesting:

1. **Browser-side client inference (Phase E future)** — replace the ONNX `gemma3_270m_onnx/` path with a WASM-compiled bitnet.c running a Q2_K Gemma 3 variant. Same VRAM-free property, broader hardware compatibility (no WebGPU required), smaller binary. Build target: WASM SIMD128.
2. **Reference reading for KV-cache layout** — when we implement the NVMe warm cache (Tier 2 above), bitnet.c's KV-block serialization in `src/kv_cache.c` is exactly the file layout we want.

NOT a chat-tier replacement. Stays parallel to Ollama / llama-server, not in front of them.

---

## 4. Attention-head-aware KV cache (Gemma 4 head analysis)

You said "synthesis after analysis of Gemma 4 heads". Concretely: Gemma 4's 256/512 head_dim split between SWA and global layers means a uniform KV-cache quantization (e.g. `--ctv turbo3` on every layer) is leaving accuracy on the table.

### Layer profile (Gemma 4 E4B, 26 layers)

| Layer type | Count | head_dim | Pattern | Compress safely? |
|---|---|---|---|---|
| SWA (sliding window) | 20 | 256 | Local 4096-token attention | ✅ q8_0 → turbo3 — lossy attention windows tolerate it |
| Global | 6 | 512 | Full-context attention | ⚠️ keep at q8_0 — these are the "memory" layers; aggressive quant degrades long-context recall |

### Action: per-layer cache profile

The current `TURBO_PROFILE` system in `scripts/launch-turboquant.ps1` is one-size-fits-all (`-ctk q8_0 -ctv turbo3`). To go finer-grained:

1. Patch llama-server (or the test1111 fork) to accept per-layer cache hints: `--cache-profile-file C:\path\to\gemma4-cache.json`
2. JSON shape:
   ```json
   {
     "layers": {
       "swa":    { "k": "q8_0", "v": "turbo3" },
       "global": { "k": "q8_0", "v": "q8_0"   }
     }
   }
   ```
3. Validate with the existing 20-generation stability harness (`npm run turbo:test:stability`).

This is a future patch — not on the build-order chart yet, but documented here so the next operator doesn't redo the head-dim spreadsheet.

---

## 5. KAG → DAG → CUDA Graph background analysis pipeline

You sketched: "develop kag for dag hits into cuda graph background analysis for graph backed 4d topological transforms of clustered tagged ranked kag for hyper rag ace redis cache bitfrost hits".

Decoded against the existing stack:

```
User query
   │
   ▼
ACE Stage A0 retrieval (existing — context-assembler.ts)
   ├── Redis L1 exact-match (gpu:karpathy:scores, ace:topo:*)
   ├── Bifrost L2 semantic (port :3040)
   ├── Qdrant ANN (codebase_chunks_768)
   └── Neo4j hyper-graph expansion (cluster_context + shared_resource lanes)
   │
   ▼
KAG operator routing (Phase B ✅ — intent-router.ts)
   ├── label='legal_research' → kag.multi_lane_search → kb.search_summary_tree → kag.feature_lookup
   ├── label='graph_search'   → graph.expand_neighborhood → graph.shortest_path
   └── label='gpu_rerank'     → search.rerank
   │
   ▼
DAG dependency resolution (existing — document-dag.ts)
   • Order operator chain by topo sort: which steps can run in parallel,
     which depend on the previous step's output (via takeFrom in
     OperatorChainStep)
   │
   ▼
CUDA Graph capture of the rerank kernel (proposed — Tier-5 background work)
   • Record once: attentionScoreGPU + autoencoder encode + pageRankGPU
   • Replay 100× per Karpathy daily refresh (3am cron)
   • Speedup: 10-40% IF SM utilization > 70% (Nsight Compute baseline first)
   │
   ▼
4D topological transforms (existing — manifold4 columns + topology-search-4d)
   • Each chunk has manifold4 = [som_x, som_y, semantic_z, grpo_w]
   • New: clustered KAG hits get fused via 4D-aware RRF, weighted by
     Karpathy blend, with chunks in the same SOM cell getting an
     adjacency bonus
   │
   ▼
HyperRAG ACE Redis Bifrost write-back
   • Successful hits update gpu:karpathy:scores (24h TTL)
   • Failed retrievals invalidate ace:topo:{class}:{hash}
   • Bifrost write-through for new semantic-cache entries
```

### What's missing vs. what's done

| Stage | Status | Where |
|---|---|---|
| ACE Stage A0 retrieval | ✅ done | `src/lib/server/ace/context-assembler.ts` |
| KAG operator routing | ✅ done (Phase B) | `src/lib/server/ai/intent-router.ts` |
| DAG sort + takeFrom plumbing | ✅ minimal — `OperatorChainStep.takeFrom` exists | `intent-router.ts` |
| Parallel-step dispatch (true DAG) | ⏳ not yet — chain is sequential today | future |
| CUDA Graph capture | ❌ documented only | `memory/gpu-weight-architecture.md` |
| 4D-aware RRF with SOM-cell adjacency bonus | ❌ today's RRF is pure rank-based | `src/lib/server/retrieval/rrf-fuse.ts` |
| Background analysis cron | ✅ partially — `karpathy:gpu` runs daily | `scripts/karpathy-gpu-enrich.mjs` |

---

## 6. Build order if/when we commit (high-level, NOT a session plan)

| Phase | Effort | Prerequisites |
|---|---|---|
| **R1** Verify RotorQuant Scrya kernels on Gemma 4 head_dim | 1 day | Clone Scrya repo, grep for HEAD_DIM, decide whether to source-patch or skip |
| **R2** Tier-2 NVMe warm cache for KV blocks | 1 week | Hash function (sha1(prefix_tokens)), filesystem layout, mmap eviction policy |
| **R3** Per-layer cache profile for Gemma 4 | 3 days | Pick test1111 fork as baseline; add `--cache-profile-file` flag; 20-gen stability harness |
| **R4** CUDA Graph capture for attentionScoreGPU | 4 days | Nsight Compute baseline (prove launch-bound); cudaStreamBeginCapture wrap |
| **R5** 4D RRF with SOM-cell adjacency bonus | 3 days | Rrf-fuse module already exists; just add `manifold4Distance` weighting |
| **R6** Browser-side bitnet.c via WASM | 1 week | Build bitnet.c with `-target=wasm32`, replace ONNX client-router 270m path |

**Total budget if we did all six**: ~5 weeks. None of this is on the active sprint.

---

## 7. What this does NOT propose

- **Replacing Ollama or llama-server CUDA as the primary chat backend.** Both stay. RotorQuant/bitnet.c are alternatives evaluated quarterly.
- **A new MCP tool.** Cache-tier work happens inside existing services; no new model-facing surface.
- **A new Postgres table.** All KV-block metadata lives in `data/kv-warm/*.f32` + an in-process LRU map; no DB pressure.
- **A new Drizzle migration.** Same reason.
- **Touching the test1111 fork's source.** If we adopt TurboQuant turbo3/turbo4 we use that fork as-is; RotorQuant work is a parallel evaluation.
- **A demo page.** This is internal architecture; no user-visible surface.

---

## 8. Cross-references

- `memory/gpu-weight-architecture.md` — RotorQuant/TurboQuant/TurboVec table + CUDA Graph capture pseudocode
- `CLAUDE.md` §"Redis L1 + Bifrost L2 Cache System" — current 3-tier cache (5ms exact / 2-5s semantic / 25s cold)
- `CLAUDE.md` §"TurboQuant — Google ICLR 2026 Paper" — PolarQuant + QJL algorithm + Gemma 4 D=256/512 hard rule
- `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` — Phase A-D for the intent dispatcher (separate concern)
- `next_steps/active/2026-05-10_full-stack-claude-checklist.md` — Rails-port mental model + N-API ↔ Ruby gems
- `src/lib/server/atlas/context-for-file.ts:416` — where Karpathy blend lands as 13% of ranking
- `scripts/karpathy-gpu-enrich.mjs` — daily blend refresh that would feed R5
- `https://github.com/artalis-io/bitnet.c` — verified facts as of 2026-05-10

---

**Doc length**: ~310 lines. Designed to outlive this session — drop it in front of the next operator who asks "should we switch to RotorQuant" and they get the verified answer plus the integration map.
