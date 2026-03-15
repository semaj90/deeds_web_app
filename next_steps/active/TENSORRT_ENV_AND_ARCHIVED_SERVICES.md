# TensorRT Env Recreation & Archived Services Reference

## TensorRT Python Environment (Deleted — How to Recreate)

The `tensorrt_py310_env/` was a Python 3.10 virtual environment used to build TensorRT engines.
It was deleted because it's 100% recreatable. Here's how to bring it back:

```bash
# 1. Create a fresh Python 3.10 venv
python3.10 -m venv tensorrt_py310_env

# 2. Activate it
# Windows:
tensorrt_py310_env\Scripts\activate
# Linux/WSL:
source tensorrt_py310_env/bin/activate

# 3. Install TensorRT + dependencies
pip install tensorrt tensorrt-llm torch numpy

# 4. Run the engine build scripts
bash scripts/build-trt-engines.sh
# OR use the notebook:
# tensorrt_build/Gemma3_12B_INT4_Quantize_and_Export.ipynb
```

The build configs live in `tensorrt_build/` — the venv was just the throwaway tool to run them.

---

## What Got Archived & Why (ELI5)

Think of it like upgrading your kitchen. You started with basic tools (Python scripts),
then got professional equipment (Go gRPC + Docker). The old tools still work, but the
new ones are faster and better connected. So the old ones go in the garage (deeds_labs/).

### Where Everything Lives Now

| What It Does | Old Way (Archived) | New Way (Active) |
|---|---|---|
| **Read legal documents and find sections** | `hmm_legal_model.py` — a Python script that guesses document sections using statistics (HMM = Hidden Markov Model) | TypeScript HMM built into the app's search pipeline (Feature #9). Same idea, runs inside the app instead of needing a separate server |
| **Read text from scanned images** | `ocr_pipeline.py` — reads images with Tesseract + Microsoft's AI reader (TrOCR) | Evidence pipeline Stage 2: Tesseract reads the text, Docling VLM (AI vision model) understands the document layout. Already wired into evidence upload |
| **Turn text into numbers for search** | `fastapi-embed/main.py` — tiny server that asks Ollama to make embeddings | Go gRPC server on port 50051. Does the same thing but handles many requests at once (goroutines), caches results in Redis, and speaks gRPC (faster than HTTP) |
| **Extract entities from documents** | Local Python with `phase46-venv` | Docker container `phase66-langextract` on port 8095. Uses `gemma3-legal` AI model. Container has its own Python environment built in |

### The Active Stack (What's Running)

```
Your App (SvelteKit)
  |
  |-- Go gRPC Server (port 50051)     ← Embeddings (fast, cached)
  |-- Ollama (port 11434)             ← AI models (gemma3-legal, embeddinggemma)
  |-- LangExtract Docker (port 8095)  ← Document extraction (uses gemma3-legal)
  |-- Qdrant (port 6333)              ← Vector search database
  |-- PostgreSQL (port 5432)          ← Main database + pgvector
  |-- Redis (port 6379)               ← Cache + sessions
  |-- RabbitMQ (port 5672)            ← Background job queue
  |-- MinIO (port 9000)               ← File storage
```

### Where The Archives Live

All in `deeds_labs/` (gitignored, safe storage):

```
deeds_labs/
  projects/     ← Complete old codebases (evidence-service, etc.)
  snapshots/    ← Dated bulk archive sweeps (2026-03-10, 2026-03-15)
  frontend/     ← Old Svelte/SvelteKit code (svelte4, orphaned components)
  services/     ← Archived backend services (HMM, OCR, embed, Go archive)
  infra/        ← CUDA binaries, TensorRT, proto, WASM files
  docs/         ← Old reference docs
```

### Can I Use The Archived Services Again?

Yes! They're just Python/Go files sitting in `deeds_labs/services/`. To revive one:

1. Copy it out of deeds_labs/ back to its original location
2. Install its dependencies (`pip install` or `go mod tidy`)
3. Run it (`uvicorn main:app` or `go run .`)
4. Wire its URL into the SvelteKit app's env vars

But you probably don't need to — the active stack already does everything they did, better.
