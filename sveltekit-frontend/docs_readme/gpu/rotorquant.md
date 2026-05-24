# RotorQuant + AtomicBot Operator Checklist

> Work through each phase in order. Paste the bench output back to the assistant
> at the marked **→ SEND** checkpoints before continuing.

## Do I need Google Colab?

**No.** The legal fine-tune already exists as the merged Ollama blob (`gemma4-rotorquant:latest`).
Colab is only needed if you want to **re-train** the LoRA adapter from scratch.

| Goal | Colab needed? | Path |
|---|---|---|
| Run the merged legal model faster | ❌ No | Path B — re-quantise Ollama blob → IQ4_XS (local notebook) |
| Test runtime LoRA on base IQ4_XS | ❌ No | Path A — needs the `.gguf` adapter file (may already be on disk) |
| Re-train the legal LoRA from scratch | ✅ Yes | Out of scope for this checklist |

**Fastest route:** skip Phase 2 and Phase 2B entirely, go straight to Phase 2B using the
existing Ollama blob. Open the notebook at `sveltekit-frontend/notebooks/rotorquant-local-quant.ipynb`
and run all cells — it copies + re-quantises the blob automatically.

---

## Phase 1 — RotorQuant baseline (no LoRA, no TurboQuant binary)

**Goal:** confirm the IQ4_XS weight-quantised GGUF runs cleanly at baseline speed.

- [ ] Download `majentik/gemma-4-E4B-RotorQuant-GGUF-IQ4_XS` from HuggingFace
      (file: `gemma-4-E4B-RotorQuant-GGUF-IQ4_XS.gguf`)
- [ ] Add to `.env` (sveltekit-frontend/.env):
      ```
      ROTORQUANT_MODEL_PATH=C:\path\to\gemma-4-E4B-RotorQuant-GGUF-IQ4_XS.gguf
      ```
- [ ] Start server (stock binary, stock KV q8_0/q8_0, TextOnly — no vision tower):
      ```
      npm run turbo:start:rotorquant
      ```
- [ ] Run benchmark:
      ```
      npm run turbo:bench:rotorquant
      ```
      Output saved to `logs/turboquant/bench-rotorquant-<timestamp>.json`

**→ SEND:** paste the terminal table (TTFT / total latency / tok/s columns) to the assistant.

---

## Phase 2 — Legal LoRA adapter (Path A — runtime injection)

**Goal:** add the legal fine-tune on top of the IQ4_XS base without re-quantising.

**Prerequisites:**
- The legal LoRA adapter exported from Colab as a GGUF file (`legal-lora-adapter.gguf`)
- If the Colab output only has safetensors, export with:
  ```
  python llama.cpp/convert_lora_to_gguf.py \
    --base-model-id google/gemma-4-e4b \
    --lora-path ./colab-output/lora-adapter \
    --output ./legal-lora-adapter.gguf
  ```

**Steps:**
- [ ] Add to `.env`:
      ```
      LEGAL_LORA_PATH=C:\path\to\legal-lora-adapter.gguf
      LEGAL_LORA_SCALE=0.8
      ```
- [ ] Start server with LoRA injected:
      ```
      npm run turbo:start:rotorquant:lora
      ```
      Launcher will print: `Legal LoRA: --lora <path> --lora-scale 0.8`
- [ ] Run benchmark with a distinct label:
      ```
      node scripts/turboquant/bench-model.mjs --label rotorquant-lora
      ```
- [ ] Compare both runs:
      ```
      npm run turbo:bench:compare
      ```

**→ SEND:** paste the compare table to the assistant. Include a qualitative note:
- Does legal terminology feel accurate? (hearsay, mens rea, Miranda, etc.)
- Any obvious hallucinations vs the merged Ollama model?

**Decision point (assistant will advise):**
- LoRA quality acceptable → skip Path B, proceed to Phase 3
- LoRA quality regresses → do Path B (re-quantise from merged model)

---

## Phase 2B — Re-quantise from merged model (Path B — best quality)

**Only needed if Path A quality is unacceptable.**

**Option 1 — from the Ollama blob (Q4_K_M → IQ4_XS, slight precision loss):**
```powershell
# The Ollama blob is already a GGUF — just copy it
$blob = "$env:USERPROFILE\.ollama\models\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43"
Copy-Item $blob "gemma4-rotorquant:latest-merged-q4km.gguf"

# Dequantize to F16 (needs llama-quantize from your llama-server build)
llama-quantize.exe gemma4-rotorquant:latest-merged-q4km.gguf gemma4-rotorquant:latest-f16.gguf F16

# Re-quantize to IQ4_XS (block-diagonal rotation baked in)
llama-quantize.exe gemma4-rotorquant:latest-f16.gguf gemma4-rotorquant:latest-iq4xs.gguf IQ4_XS
```

**Option 2 — from Colab safetensors (preferred — no round-trip loss):**
```bash
# On a machine with the Colab output:
python llama.cpp/convert_hf_to_gguf.py \
  --outtype f16 \
  --outfile gemma4-rotorquant:latest-f16.gguf \
  ./colab-output/merged-model/

python llama.cpp/llama-quantize \
  gemma4-rotorquant:latest-f16.gguf gemma4-rotorquant:latest-iq4xs.gguf IQ4_XS
```

- [ ] Set in `.env`:
      ```
      ROTORQUANT_MODEL_PATH=C:\path\to\gemma4-rotorquant:latest-iq4xs.gguf
      # Remove or clear LEGAL_LORA_PATH — LoRA is now baked in
      LEGAL_LORA_PATH=
      ```
- [ ] Re-run Phase 1 bench with new label:
      ```
      node scripts/turboquant/bench-model.mjs --label rotorquant-merged-iq4xs
      npm run turbo:bench:compare
      ```

**→ SEND:** paste compare table (rotorquant / rotorquant-lora / rotorquant-merged-iq4xs).

---

## Phase 3 — AtomicBot binary (turbo3/turbo3 KV + MTP speculative decode)

**Goal:** +30-50% throughput on short-prompt workloads via turbo3 KV caching and
Multi-Token Prediction. Requires a D=256/512-capable TurboQuant binary.

**Download binary:**
- Repository: `AtomicBot-ai/atomic-llama-cpp-turboquant-binaries`
- Pick the Windows CUDA 12.x release matching your driver
- Or source-build from `test1111.../llama-cpp-turboquant-gemma4` (Ampere sm_86):
  ```bash
  cmake -B build -S . -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86
  cmake --build build --config Release
  ```

**Steps:**
- [ ] Add to `.env`:
      ```
      LLAMA_SERVER_PATH=C:\path\to\atomic-llama-server.exe
      TURBO_PROFILE=atomicbot
      # MTP sidecar — usually same basename + .mtp alongside the GGUF
      # Only needed if the sidecar is NOT co-located with ROTORQUANT_MODEL_PATH:
      # MTP_HEAD_PATH=C:\path\to\model.mtp
      ```
- [ ] Start server:
      ```
      npm run turbo:start:atomicbot
      ```
      Launcher will print:
      - `AtomicBot: --mtp-head enabled (<path>)` if sidecar found
      - `AtomicBot: MTP sidecar not found — running without --mtp-head` if missing
        (set `MTP_HEAD_PATH` to fix)
- [ ] Run benchmark:
      ```
      npm run turbo:bench:atomicbot
      npm run turbo:bench:compare
      ```

**→ SEND:** paste the final compare table (all labelled runs side-by-side) to the assistant.
Include which model GGUF was active (LoRA / merged IQ4_XS / base IQ4_XS).

---

## Env var reference

| Variable | Default | Purpose |
|---|---|---|
| `ROTORQUANT_MODEL_PATH` | — | Path to IQ4_XS (or re-quant merged) GGUF |
| `TURBO_PROFILE` | `stock` | `stock` / `turboquant` / `turboquant-safe` / `atomicbot` |
| `LLAMA_SERVER_PATH` | stock binary path | AtomicBot or test1111 fork binary |
| `LEGAL_LORA_PATH` | — | Path to legal LoRA GGUF (Path A only) |
| `LEGAL_LORA_SCALE` | `0.8` | LoRA strength 0.0–1.0 (lower = more base) |
| `MTP_HEAD_PATH` | `<model>.mtp` | AtomicBot MTP sidecar override |
| `TURBO_CTX` | `4096` | Context length |
| `TURBO_NGL` | `99` | GPU layers |

## npm scripts reference

```
turbo:start:rotorquant            # Phase 1 — stock binary, IQ4_XS, no LoRA
turbo:start:rotorquant:lora       # Phase 2 — stock binary, IQ4_XS + LoRA
turbo:start:rotorquant:detached   # detached variants of the above
turbo:start:rotorquant:lora:detached
turbo:start:atomicbot             # Phase 3 — AtomicBot binary, turbo3/turbo3
turbo:start:atomicbot:lora        # Phase 3 + LoRA (if still using base GGUF)
turbo:start:atomicbot:detached
turbo:start:atomicbot:lora:detached

turbo:bench                       # bench whatever server is alive
turbo:bench:rotorquant            # --label rotorquant
turbo:bench:atomicbot             # --label atomicbot
turbo:bench:compare               # print side-by-side table of all saved runs
```
