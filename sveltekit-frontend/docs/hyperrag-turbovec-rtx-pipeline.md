# Atlas × TurboVec × RTX CUDA Graph Stream Pipeline

## Architecture Overview

```
Query
  │
  ▼
[RotorQuant / TurboVec 4-bit ANN prefilter]   ← TurboVec wrapper (port 8792) → Python helper (port 8793)
  │  top-200 candidate IDs + scores
  ▼
[Qdrant Multi-Lane Dense Search]               ← codebase_chunks_768 / glyph_atlas
  │  4D manifold filter (topoClass, somRow, somCol, pageRank)
  ▼
[4D Topology → RTX CUDA Graph]                 ← tensorrt_bridge.node kmeansWithCentroids
  │  cluster centroids float32 stream
  ▼
[Atlas-fed RotorQuant Decode Stream]           ← llama.cpp rotorquant (port 8090, fed by Atlas compact chunks)
  │  final ranked context with trust tiers
  ▼
[Atlas Multi-Query Merge]                      ← kag.multi_lane_search MCP tool
  │  Atlas-ranked chunks + CouchDB wiki enrichment
  ▼
[Atlas Chunk Index / Log Triage]               ← Redis BoW tile + GRPO writeback
```

## What this pipeline improves: context quality, not tok/sec

This is a **retrieval pipeline**, not a model optimizer. It improves what Gemma4 sees, not how fast it decodes.

- **TurboVec 4-bit ANN + GPU cluster centroids** narrow the Qdrant search before the expensive 768-dim scan — fewer irrelevant chunks reach the model
- **RRF merge across 3 lanes** (semantic / kag / wide) + Karpathy PageRank boost picks the most authoritative chunks, not just the nearest ones
- **CouchDB wiki enrichment** adds pre-computed Karpathy domain notes alongside results
- **Compact `latest.min.json` packet** (Step 7) respects the 32K context budget — summaries truncated to 300 chars, vectors stripped, sidecar logged to `logs/hyperrag-stream/`

Net effect: Gemma4 sees higher-signal, more compact context → fewer wasted tokens → better answers without touching tok/sec or TTFT.

To actually improve inference speed (tok/sec, TTFT): see `TURBO_PROFILE`, flash attention, `-ctk q8_0 -ctv q8_0`, and the speculative decoding section below.

## TurboVec Verified ✅
- 4-bit quantization builds in 0.4s for 1000×64d vectors
- Search at 425ms (CPU) — GPU path via tensorrt_bridge for 768d production

## Runtime Note

This pipeline is built around `llama-server` / TurboQuant on `127.0.0.1:8090` as the primary inference backend. In this local stack, `OLLAMA_BASE_URL` is used to route OpenAI-compatible calls to that endpoint, not to a separate Ollama runtime.

Verify the gateway before trusting UI counts:

```powershell
curl http://127.0.0.1:8090/v1/models
```

Cline/OpenCode should point at `http://127.0.0.1:8090/v1` and use an explicit 32768 context window. Do not trust the provider's displayed token usage if the gateway returns bad/null usage metrics.

Final architecture rule: Do not chase raw 64k first. Make 16k/32k act like 64k through:
TRACE MCP → ACE packet → Redis/Postgres cache → Qdrant/KAG/DAG ranking → compact Gemma4 synthesis.

A server-side guard exists at `src/lib/server/llm/token-budget.ts` to enforce the budget before oversized prompts reach TurboQuant.

Recommended local launch:

```powershell
cd sveltekit-frontend
.\llama-server.exe \
  -m .\models\gemma4-turboquant-rotorquant.gguf \
  --host 127.0.0.1 \
  --port 8090 \
  --ctx-size 32768 \
  --batch-size 512 \
  --ubatch-size 256 \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --flash-attn
```

On 8GB RTX, the production target is:

- `--ctx-size 32768`
- `max_tokens` 2048–4096
- retrieval `top_k` 3–5
- `q8_0` KV cache
- `flash-attn` enabled

Avoid treating `ctx-size` as the only budget; the effective prompt budget also includes MCP outputs, ACE packets, GraphRAG chunks, and tool payloads.

The hot path should be:

- Redis hit? → return compact packet
- Postgres ACE packet hit? → return packet
- Qdrant/Neo4j/CouchDB miss path? → rebuild packet → cache it

Use Redis for small hot lookup keys, not full giant context:

- `ace:topo:{queryHash}`
- `ace:packet:{queryHash}`
- `ace:authority:top`
- `gpu:karpathy:scores`
- `code:index:*`

`llm.c` / Karpathy CUDA belongs in the experimental ranking/blend lane, not the production Gemma4 serving lane.

- production serving: `RotorQuant GGUF / TurboQuant / llama-server :8090`
- NVMe cold storage: raw PDFs, large JSONL archives, CouchDB/Qdrant snapshots, embedding dumps, llm output logs

## 64k experiment path

If you want to test a true 64k runtime, do it as an experiment only. On RTX 3060 Ti 8GB, the recommended safe experiment config is:

```powershell
cd sveltekit-frontend
.\llama-server.exe \
  -m .\models\gemma4-turboquant-rotorquant.gguf \
  --host 127.0.0.1 \
  --port 8090 \
  --ctx-size 65536 \
  --batch-size 128 \
  --ubatch-size 64 \
  --cache-type-k q4_0 \
  --cache-type-v q4_0 \
  --flash-attn
```

This gives you an experimental 64k window via aggressive KV cache compression, but it is slower and more fragile than the stable 16k/32k lane. Use it only to validate whether the model can hold the larger window without spilling too far into RAM.

### Two-lane architecture

The safest wiring is two lanes, not one:

- Lane A (production): keep the current Gemma4 RotorQuant GGUF / TurboQuant path intact.
  - `llama-server.exe` on `:8090`
  - `--ctx-size 32768`
  - `--cache-type-k q8_0 --cache-type-v q8_0`
  - `--flash-attn`
  - use ACE/Redis compact packets, Qdrant topological clusters, and TRACE MCP for retrieval

- Lane B (experimental): TRT-LLM on RTX 3060 Ti.
  - TRT-LLM is a separate runtime path.
  - it does not consume your RotorQuant GGUF file directly.
  - it wants a Hugging Face / PyTorch model checkpoint or a dedicated TRT-LLM engine.

### TRT-LLM training path

For Colab and training, use LoRA/QLoRA, not `.ptx`.

The upstream flow is:

1. start from a Gemma HF/PyTorch model
2. optionally LoRA/QLoRA fine-tune on your JSONL dataset
3. export `adapter_model.safetensors`
4. test in Transformers
5. optionally merge the adapter into the base model
6. quantize/convert for the target runtime
7. build a TRT-LLM engine for `sm_86` / RTX 3060 Ti
8. serve it on an OpenAI-compatible endpoint

`.ptx` is CUDA intermediate code, not an LLM training artifact.

### Recommended production strategy

- Production mode: TurboQuant GGUF with `--ctx-size 32768`
- Experiment mode: `--ctx-size 65536` + `q4_0` KV cache + small `batch-size`/`ubatch-size`
- Real 64k behavior is best achieved by making ACE/Redis act as a compact memory layer, then keeping raw model context in the 16k/32k range.

---

## Speculative Decoding: Draft Models vs MTP

Speculative decoding improves tok/sec without changing model quality. Two distinct approaches exist — they are NOT interchangeable.

### Type 1 — GGUF Draft Model (works now)

A separate small model guesses ahead; Gemma4 verifies in parallel.

```powershell
.\llama-server.exe \
  -m .\models\gemma4-turboquant-rotorquant.gguf \
  --model-draft .\models\gemma3-270m-q4_K_M.gguf \
  --draft-max 8 \
  --draft-min 2 \
  --draft-p-min 0.7 \
  --host 127.0.0.1 --port 8090 \
  --ctx-size 32768 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --flash-attn
```

**Speed boost**: moderate (15–25% on matched vocabulary drafters)
**Requirement**: draft model must share Gemma4's vocabulary exactly — `gemma3-270m` is the safest candidate since it shares the Gemma tokenizer
**Risk**: mismatched vocab causes rejection storms (0% acceptance) and actually slows down — verify with `--verbose` and check `draft_accepted / draft_total` ratio; target >60%

`gpt-tokenizer` does not solve the draft-model compatibility problem. It is a BPE tokenizer/decoder used for token counting, chat token estimation, and context-budget checks, so it helps validate whether a prompt packet fits the window, but it does not make two GGUF weights compatible or improve speculative decoding acceptance by itself.

When to use: you already have a small Gemma GGUF and want a quick win with no binary changes.

### Type 2 — MTP Head (`--mtp-head`) — future lane

Multi-Token Prediction is **built into the Gemma4 model weights** as a separate decode head. The model outputs multiple tokens per forward pass natively.

```powershell
# Requires a TurboQuant fork that supports --mtp-head (not yet in stock llama.cpp)
.\llama-server-mtp.exe \
  -m .\models\gemma4-turboquant-rotorquant.gguf \
  --mtp-head .\models\gemma4-mtp-head.bin \
  --mtp-steps 4 \
  --host 127.0.0.1 --port 8090 \
  --ctx-size 32768 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --flash-attn
```

**Speed boost**: large (30–50% on RTX 3060 Ti)
**Requirement**: the Gemma4 checkpoint must have been trained with MTP enabled (the `test1111…/llama-cpp-turboquant-gemma4` fork adds D=256/512 kernel support; check whether it also ships `--mtp-head` support)
**Status**: not yet available for the current `gemma4-rotorquant:latest` weights — deferred until the MTP head is extractable from the HF checkpoint

For this lane, `gpt-tokenizer` is still only useful as a budgeting helper: it can verify the compact packet that enters the decode stream, but it cannot add an MTP head or bridge a kernel/weight mismatch.

### Comparison

| Mode | Speed | Setup | Use now? |
|---|---|---|---|
| Normal | baseline | none | ✅ production |
| Draft model (`--model-draft`) | +15–25% | small Gemma GGUF | ✅ try with gemma3-270m |
| MTP (`--mtp-head`) | +30–50% | special binary + MTP head | 🚀 future — needs MTP-capable fork |

### What this pipeline feeds the drafter/MTP

The HyperRAG pipeline (Phases A–E) runs **before** inference and produces `logs/hyperrag-stream/latest.min.json`. Whether you use normal, draft, or MTP decoding, that compact context packet is what gets sent to port 8090. Better retrieval → fewer tokens wasted on irrelevant context → both draft acceptance rate and MTP head accuracy improve.

### TheTom TurboKV path (next speed jump)

When using the TheTom `tqp-v0.1.1` prebuilt (D=128 only — safe for Qwen/Llama-3, not Gemma4):

```powershell
$env:TURBO_PROFILE = 'turboquant'   # ctk q8_0 / ctv turbo3
$env:LLAMA_SERVER_PATH = 'C:\Users\james\Videos\deeds-web-app\tools\llama-server\llama-server.exe'
npm run turbo:start:detached
npm run turbo:test:stability:turbo
```

For Gemma4 (D=256/512 layers), only the `test1111…/llama-cpp-turboquant-gemma4` source build supports turbo V-cache. Do not pair the TheTom prebuilt with `gemma4-rotorquant:latest` — see CLAUDE.md §KV Cache Policy.

---

## Pipeline Phases — Implementation Status

| Phase | Description | Script | Status |
|---|---|---|---|
| A | RotorQuant Sidecar + TurboVec ANN | `scripts/atlas/rotorquant-turbovec-sidecar.mjs` | ✅ exists |
| B | 4D Qdrant Multi-Query with Cluster Prefilter | `scripts/hyperrag-dense-multiquery.mjs` (also `scripts/atlas/hyperrag-dense-multiquery.mjs`) | ✅ exists |
| C | CouchDB Atlas Enrichment | baked into Phase B Step 6 | ✅ wired |
| D | CUDA Graph Stream → RotorQuant Decode Stream | `scripts/atlas/hyperrag-cuda-stream.mjs` (`npm run atlas:hyperrag:cuda`) | ✅ exists |
| E | Atlas Chunk Index / Log Triage | baked into Phase B Step 7, writes `logs/hyperrag-stream/` | ✅ wired |
| F | Messy Query Routing Evaluation | `scripts/atlas/eval-messy-query-routing.mjs` (`npm run atlas:messy-routing`) + `docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md` | ✅ complete |

### Phase A detail

The doc previously referenced `scripts/rotorquant-turbovec-sidecar.mjs` — that path does not exist. The canonical location is `scripts/atlas/rotorquant-turbovec-sidecar.mjs`, wired as `npm run atlas:hyperrag:sidecar`.

The TurboVec wrapper lives at `scripts/atlas/rotorquant-turbovec-sidecar.mjs` on port `8792`, and it spawns the Python helper at `scripts/turbovec-sidecar.py` on port `8793`. Without it, Phase B falls back to plain wide-lane Qdrant search.

### Phase B detail

Three dependencies must be live for full cluster prefilter:

| Dependency | Redis key / service | How to refresh |
|---|---|---|
| TurboVec wrapper | port 8792 | `node scripts/atlas/rotorquant-turbovec-sidecar.mjs` |
| TurboVec helper | port 8793 | `python scripts/turbovec-sidecar.py` |
| 4D manifold centroids | `cluster:kmeans:k20:manifold4:all` | `npm run graphify:semantic-cluster` |
| `glyph_atlas` Qdrant collection | collection must be non-empty | `npm run graphify:semantic` |

Without these, Steps 2–3 skip and the pipeline falls back to plain wide-lane search — still functional but loses the cluster prefilter advantage.

### Phase F detail

Script at `../scripts/atlas/eval-messy-query-routing.mjs` (one level up from `sveltekit-frontend/`).
Writes output to `docs/reports/messy-query-routing-eval.json` + `.md`.

Both items complete (May 2026):
1. ✅ `atlas:messy-routing` + `atlas:messy-routing:dry` wired in `package.json`
2. ✅ `docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md` operator runbook created

---

## Best next implementation moves

1. **Enforce MCP caps**
   - `limit=3`, `max chars/result=512`, no raw full-file dumps

2. **Enforce ACE packet budget**
   - ACE packet ≤ 3500 tokens, tool output ≤ 800 tokens, output `max_tokens` 2048–4096

3. **Match runtime + app env**
   - `llama-server --ctx-size 32768`, `TURBO_CTX_SIZE=32768`, Cline/OpenCode context window = 32768

4. **Cache compact packets**
   - Redis: `ace:topo:{hash}`, `ace:packet:{hash}`
   - Postgres: `ace_context_packets`, `ace_context_cache`

5. **Use KAG/DAG to prune**
   - KAG selects high-authority chunks; DAG orders dependencies before synthesis

6. **Enable draft model speculative decoding** (when ready — see "Speculative Decoding — Current State" section)
   - GGUF draft path: set `ENABLE_MTP_DRAFTER=true` + `MTP_DRAFT_MODEL=<path>` in `.env`, restart `launch-turboquant.ps1`
   - MTP head path: set `TURBO_PROFILE=atomicbot` + `MTP_HEAD_PATH=<model>.mtp` — requires AtomicBot binary with D=256/512 kernels
   - `DRAFT_MODEL_PATH` is **deprecated** — do not use; launcher warns and ignores it
   - Both mechanisms are currently **disabled** (no matching binary for Gemma4 D=256/512 layers yet)

7. ✅ **Phase F messy-query routing harness** — complete (`npm run atlas:messy-routing`, see `docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md`)

### Compact-packet budget flow

1. OpenCode/Cline prompt
2. TRACE MCP `limit=3`, `max chars/result=512`
3. ACE packet capped to `<= 3500` tokens
4. tool output capped to `<= 800` tokens
5. Gemma4 final answer (`max_tokens` 2048–4096)

This matters more than raw runtime choice because OpenCode can exceed context before the useful retrieval hits the model.

`64k` is a benchmark/experimental setting; use it only for diagnostics, not the normal local operator flow.

---

## Speculative Decoding — Current State (May 2026)

### Two Mechanisms, Both Disabled

| Mechanism | Required env vars | Launcher flag | Current state |
|---|---|---|---|
| Separate draft model | `ENABLE_MTP_DRAFTER=true` + `MTP_DRAFT_MODEL=<path>` | `--model-draft` + `-draft-ngl 99` | `ENABLE_MTP_DRAFTER=false` — **disabled** |
| AtomicBot MTP head | `TURBO_PROFILE=atomicbot` + `MTP_HEAD_PATH=<model>.mtp` | `--mtp-head` | No `.mtp` sidecar exists — **disabled** |

`DRAFT_MODEL_PATH` is **deprecated**. The launcher (`launch-turboquant.ps1`) ignores it with a warning. It was removed from `.env` May 2026. Do not restore it.

### Why Gemma4 Speculative Decoding Is Blocked

1. **Head-dim mismatch** — Gemma4 SWA layers use `head_dim=256`, global layers use `head_dim=512`. Most TurboQuant prebuilts (including TheTom `tqp-v0.1.1`) only implement `D=128` fast-attention kernels. They launch cleanly and pass the `-h` probe, but produce corrupt output on Gemma4 attention. The launcher cannot detect this mismatch.

2. **Draft model must share tokenizer and architecture** — `gemma3:270m` (Ollama blob `sha256-735af...`, 279 MB) is a valid draft candidate for Gemma3/Llama-3/Qwen2.5 D=128 models. It is not a safe drafter for Gemma4 due to the attention head-dim gap and vocabulary alignment differences.

3. **Only viable path**: [test1111.../llama-cpp-turboquant-gemma4](https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4) — source build, MSVC + CUDA 13.0, adds D=256/512 kernels. ~30 min build for `sm_86`. Until that binary exists and passes the 20-generation stability harness, keep `TURBO_PROFILE=stock`.

### To Enable When Ready

```env
# .env — draft model path (a Gemma4-family GGUF, not gemma3:270m)
ENABLE_MTP_DRAFTER=true
MTP_DRAFT_MODEL=C:\path\to\gemma4-draft-q4_0.gguf
DRAFT_N=5
```

The launcher injects `--model-draft` + `-draft-ngl 99` automatically. Restart `launch-turboquant.ps1` then run `npm run turbo:test:stability:turbo`.

---

## Model Inventory (May 2026)

### Canonical — Keep

| Path | Size | Role |
|---|---|---|
| `models/gemma4-rotorquant:latest-iq4xs-direct.gguf` | **4.8 GB** | Production GGUF — `TURBO_MODEL_PATH` / `ROTORQUANT_MODEL_PATH`. 59.8 tok/s, 220ms TTFT. |
| `models/mmproj-F16.gguf` | **945 MB** | VLM mmproj (SigLIP projector) — `MMPROJ_PATH`. Required for vision mode with `--mmproj`. |
| `models/embeddinggemma_300m_onnx/` | **329 MB** | Browser ONNX embeddings, mirrored into `static/embeddinggemma_300m_onnx/`. |
| `models/gemma3-client-onnx/` | **872 MB** | Browser ONNX LLM — `CLIENT_LLM_MODEL` in `src/lib/ai/model-ids.ts`. Contains `gemma3_270m_w8a16.onnx` + `gemma3_client_quantized.onnx`. |
| `models/gemma3_270m/` | **549 MB** | HF safetensors source for the 270M client model (conversion source for `static/gemma3_270m_onnx/`). |
| `models/embeddinggemma_300m/` | **2.4 GB** | Full HF embedding model. Source for ONNX export; also used as `embeddinggemma:latest` by Ollama server. Do not delete without confirming Ollama does not reference it. |

### Delete — Empty Shells

These directories contain only a `config.json` stub — no `.safetensors`, no `.gguf`, no `.onnx`. Zero model weights:

| Path | Size | Action |
|---|---|---|
| `models/gemma3-legal/` | ~276 B | `rm -rf models/gemma3-legal/` |
| `models/gemma3-legal-q4km/` | ~362 B | `rm -rf models/gemma3-legal-q4km/` |
| `models/gemma3-legal-q4km-hf/` | ~685 B | `rm -rf models/gemma3-legal-q4km-hf/` |

Disk recovered: negligible (< 2 KB). These are safe to delete immediately.

### Ollama Blobs — Manage via `ollama rm`, Not Manual Delete

| Blob | Size | Model | Advice |
|---|---|---|---|
| `~/.ollama/models/blobs/sha256-735af...` | 279 MB | `gemma3:270m` | Dormant. Was `DRAFT_MODEL_PATH` (deprecated). Run `ollama rm gemma3:270m` only if no other Ollama workflow depends on it. Never delete the raw blob file — let Ollama manage its own store. |

### Potential Recovery (if confirmed unused)

| Path | Size | Condition |
|---|---|---|
| `models/embeddinggemma_300m/` | 2.4 GB | Safe to delete only if `embeddinggemma:latest` in Ollama references a separate blob, not this directory, and no ONNX export pipeline depends on the HF source |

Run before deciding: `ollama show embeddinggemma:latest --modelfile` — if the modelfile points to an Ollama blob (not this path), the directory is safe to remove.
