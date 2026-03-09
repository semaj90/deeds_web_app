# TODO: TensorFlow-based OCR (handwriting + GPU) — evaluation & integration

Context
- There is an existing Tesseract OCR pipeline in the repo (fast, light, CPU). TensorFlow OCR (e.g., handwriting-capable models, OCR with deep learning) requires a large runtime (~900 MB) and benefits from GPU (tfjs-node-gpu / tfjs-node-gpu native bindings, or a Triton/TF Serving model).
- Decision: evaluate whether the TF OCR adds measurable value for our legal deed processing (handwriting, low-quality scans) and design safe, reversible integration with fallback to Tesseract.

Goals
- Evaluate TF OCR accuracy vs Tesseract on sample legal deed scans (handwritten signatures, marginalia, aged paper).
- Provide a safe, opt-in TF OCR pipeline that:
  - Runs as a separate service (container / process) to avoid inflating frontend/server footprint
  - Uses GPU when available; falls back to CPU or Tesseract automatically
  - Caches results and exposes metrics
  - Has a simple opt-in toggle per ingestion job or global config

Priority Tasks (ordered)
1. Baseline evaluation (small, quick)
   - Collect 50 representative pages (scans with handwriting + clean scans)
   - Run current Tesseract pipeline; collect metrics: words-per-page, character error rate (CER), time per page
   - Run a TensorFlow OCR test (use an off-the-shelf handwriting OCR model or prepackaged container if available) on same samples and collect metrics
   - Outcome: decision: (A) TF OCR clearly better on our samples → proceed; (B) marginal/no benefit → skip integration.

2. Minimal proof-of-concept (Poc) service
   - Create a containerized TF-OCR service:
     - Dockerfile that installs required TF runtime (or use a prebuilt image)
     - Expose simple HTTP API: POST /ocr { "image": <base64> } → { text, confidence, timings }
     - Use GPU when available (ENV/CUDA_VISIBLE_DEVICES / detect NVIDIA)
     - Limit memory usage and set sensible timeouts
   - Smoke test the service locally

3. Integration into ingestion pipeline
   - Add a config flag / per-job preference: `ocr.preferred: "auto"|"tesseract"|"tfocr"`
   - On ingest:
     - If pref == "tfocr" → send to TF-OCR service
     - If pref == "auto" → try TF-OCR (if GPU available or container reachable) else fallback to Tesseract
     - Always persist raw PDF/image and OCR text; log which engine used
   - Add retry policy/timeouts and circuit breaker: failover to Tesseract within X seconds

4. Caching & deduplication
   - Use Redis to cache OCR outputs per image hash: `ocr:result:<sha256(image)>`
   - TTL: configurable (recommended 7d for batch, 30d for interactive)
   - Store metadata: engine used, confidence, version of TF model

5. Monitoring & metrics
   - Record per-request latency, success/fail, engine names, CER (when ground truth available)
   - Expose `/metrics/ocr` or push to existing metrics pipeline (Prometheus/ELK)
   - Add Redis hit/miss counters for OCR cache

6. Packaging & deploy
   - Build a small Docker image (with multi-stage, minify layers)
   - Add docker-compose service entry `tf-ocr` with optional GPU runtime (runtime: nvidia)
   - Provide quick-start scripts:
     - `start-tfocr.bat` / `.sh` with sensible environment variables
   - Add instructions to orchestration docs (how to opt-in and resource expectations)

7. Safety & cost controls
   - Warn in README that TF runtime >= ~900 MB and may need GPU drivers, CUDA, compatible Node/Python runtime
   - Add a "dry-run" mode that computes only quick stats without full OCR
   - Ensure service can be disabled at runtime via env var `ENABLE_TF_OCR=false`

8. Documentation & developer notes
   - Minimal README at `sveltekit-frontend/docs/tf-ocr/README.md` describing:
     - Model used + source + license
     - GPU/CPU requirements
     - How to run tests and reproduce metrics
     - How to opt-in per-job
   - Add example ingest job that uses TF OCR

Implementation checklist with rough estimates
- [ ] Baseline evaluation (1–2 days)
- [ ] PoC TF-OCR container + HTTP API (1–3 days)
- [ ] Ingestion integration + tests (1–2 days)
- [ ] Redis caching + metrics (0.5–1 day)
- [ ] Docker + orchestration update + docs (0.5–1 day)
- [ ] Final QA (0.5–1 day)

Risk & mitigation
- Native TF runtimes can be hard to install across developer machines.
  - Mitigate: provide prebuilt Docker image; prefer Triton/TF Serving for GPU inference in production.
- Large image size (900 MB):
  - Mitigate: multi-stage build, host prebuilt image in private registry or use Triton service.
- Accuracy mismatch:
  - Mitigate: keep Tesseract as fallback; allow per-job opt-in so we can A/B test.

Quick commands & local test steps (PowerShell examples)

1) Create a test folder and copy sample images:
```powershell
mkdir test-ocr
# copy some sample PNGs into test-ocr/