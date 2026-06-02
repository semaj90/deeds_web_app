# Gitignored Model Directories Audit — 2026-06-01

> Surfaced by `rg --uu` + `find` sweep. These directories are gitignored binary blobs
> living in the repo tree. Not tracked by git — manual cleanup required.

---

## Scan Commands

```bash
ls "c:/Users/james/Videos/deeds-web-app/granite-docling-258M/"
ls "c:/Users/james/Videos/deeds-web-app/models/embeddinggemma_300m/"
du -sh "c:/Users/james/Videos/deeds-web-app/granite-docling-258M/"
du -sh "c:/Users/james/Videos/deeds-web-app/models/embeddinggemma_300m/"
```

## Results

### `granite-docling-258M/` — 1.0 GB

```
LLMS.md  README.md  added_tokens.json  assets/  chat_template.jinja
config.json  generation_config.json  granite_docling.png  merges.txt
model.safetensors  preprocessor_config.json  processor_config.json
special_tokens_map.json  tokenizer.json  tokenizer_config.json  vocab.json
```

**What it is:** IBM Granite Docling 258M HuggingFace safetensors download.  
**Ollama status:** Already pulled as `ibm/granite-docling:258m` (521 MB blob in Ollama).  
**Decision:** Safe to delete — Ollama blob is the live copy. Only needed again if re-exporting/quantizing.

### `models/embeddinggemma_300m/` — 2.4 GB

```
LLMS.md  README.md  added_tokens.json  config.json
config_sentence_transformers.json  generation_config.json  model.safetensors
modules.json  notebook.ipynb  sentence_bert_config.json  special_tokens_map.json
tokenizer.json  tokenizer.model  tokenizer_config.json
1_Pooling/  2_Dense/  3_Dense/
```

**What it is:** EmbeddingGemma 300M HuggingFace safetensors — source used to build the browser ONNX model.  
**ONNX status:** ✅ Conversion output EXISTS at `sveltekit-frontend/static/embeddinggemma_300m_onnx/` (329 MB, contains `model.onnx`).  
**Decision:** Safe to delete — ONNX is built and serving. Only needed again if re-running the ONNX export pipeline.

---

## Current Canonical Model Set (keepers)

| File | Size | Purpose | Status |
|---|---|---|---|
| `models/gemma4-legal-iq4xs-direct.gguf` | 4.7 GB | Primary LLM + VLM (legal LoRA merged, IQ4_XS) | ✅ KEEP — canonical |
| `models/mmproj-F16.gguf` | 945 MB | Vision sidecar for gemma4 VLM | ✅ KEEP — wired in .env |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/` | 329 MB | Client-side ONNX embedding model | ✅ KEEP — serving browser inference |
| Ollama: `gemma4-rotorquant:latest` | 5.1 GB | Ollama generation lane | ✅ KEEP |
| Ollama: `embeddinggemma:latest` | 621 MB | Server-side 768d embeddings | ✅ KEEP |
| Ollama: `ibm/granite-docling:258m` | 521 MB | Document layout detection | ✅ KEEP |
| Ollama: `nomic-embed-text:latest` | 274 MB | Embedding fallback | ✅ KEEP |

## Already Deleted This Session

| File | Size | Reason |
|---|---|---|
| `vendor/models/gemma4-legal.gguf` | 5.0 GB | Superseded by IQ4_XS direct (59.8 vs 21.6 tok/s) |
| `vendor/models/mmproj-gemma4.gguf` | 946 MB | Duplicate of `models/mmproj-F16.gguf` |

---

## Parent Atlas Quick Reference

The canonical codebase table of contents lives at:

| File | Description |
|---|---|
| `sveltekit-frontend/memory/atlas/codebase-atlas.latest.md` | **Primary** — 1167 dirs, 8674 files, ranked by Karpathy blend. Generated 2026-06-01. |
| `sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json` | Machine-readable directory atlas |
| `sveltekit-frontend/memory/atlas/codebase-atlas.min.json` | Minified JSON for ACE context injection |
| `sveltekit-frontend/memory/atlas/codebase-atlas.top.json` | Top-ranked dirs only |
| `sveltekit-frontend/docs/atlas-index/codebase-atlas.json` | Full atlas with edge data |
| `docs/atlas/parent-atlas.json` | Parent atlas JSON (feature cards) |
| `docs/atlas/parent-atlas-data-spine.md` | Data spine design doc |
| `.tmp/parent-atlas-index.json` | Live index (regenerated on graphify) |

Refresh with: `npm run graphify:daily` (from `sveltekit-frontend/`)
