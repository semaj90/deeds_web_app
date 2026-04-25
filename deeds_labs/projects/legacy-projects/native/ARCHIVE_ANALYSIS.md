# native/ — Archive Analysis
**Archived:** March 9, 2026

Autoencoder stub FastAPI service returning random 768-dim vectors. Was a placeholder for a future fine-tuning service that never materialized. All Docker references commented out.

**Replaced by:** Ollama embeddinggemma (768-dim) + Go gRPC server + ONNX WebGPU client. See `autoencoder/ARCHIVE_ANALYSIS.md` for detailed encoding stack analysis.

**Files:** autoencoder/scripts/server.py, Dockerfile, requirements.txt, ARCHIVE_ANALYSIS.md
