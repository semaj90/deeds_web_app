# agentic-ai-rag (skeleton)

This repository is a scaffold for an agentic RAG pipeline with GPU acceleration, TensorRT/Triton inference, multi-threaded embeddings, and a dynamic agentic function registry.

## Layout overview
- frontend/sveltekit-app: SvelteKit 2 + XState frontend with WebGPU/SharedArrayBuffer embedding worker.
- backend/node-api: Node API for RPC, top-k cache, and orchestration (Redis, PGVector, Qdrant clients).
- ml-services: Python workers for embeddings, GPU metrics, clustering, and Triton/TensorRT clients.
- storage: placeholders for MinIO, Postgres (pgvector), Redis, and Qdrant.
- graph: Neo4j + analysis utilities.
- tests: basic unit tests.

## Agentic Function Registry
- Python: `ml-services/embedding_worker/agentic_functions.py` exposes `AGENTIC_FUNCTIONS` and `call_agent_function`.
- Node: `backend/node-api/services/agenticFunctions.ts` mirrors the registry for server-side calls.

## Triton/TensorRT notes
- Use Triton Inference Server to host TensorRT-optimized models. The `ml-services/triton_inference/run_triton_example.py` file gives a minimal example of calling Triton via `tritonclient.http`.
- Build TensorRT engines using the model conversion pipeline. Triton can host TensorRT `.plan` or ONNX models.
- GPU metrics: collect with PyTorch (tensor_core_dot, cosine_similarity_gpu) or NVIDIA tools (nvml) for detailed telemetry.

## Quick start (dev)
1. Install Python deps for ml-services:

   python -m venv .venv
   .venv\Scripts\activate
   pip install -r ml-services/requirements.txt

2. Start core services via Docker Compose (see `docker-compose.yml`):

   docker compose up -d postgres redis qdrant minio triton

3. Run embedding worker (example):

   python ml-services/embedding_worker/worker_main.py

4. Run Triton example (after Triton server is running and model is loaded):

   python ml-services/triton_inference/run_triton_example.py

## Next steps
- Wire drizzl e/pgvector schema and Qdrant client.
- Implement the full agentic function set and secure RPC bridge.
- Add tests, CI, and deployment manifests.

## Example: call the agentic RPC

Once the backend is running (e.g. `cd backend/node-api && npm run dev`), you can call the agentic registry via HTTP:

curl -X POST http://localhost:4000/api/agentic/call \
   -H 'Content-Type: application/json' \
   -d '{"name":"web_search","args":["openai policies"]}'

The server will respond with JSON { ok: true, result: ... } or { ok: false, error: ... }.

There's a tiny helper script at `backend/node-api/scripts/test-agentic-call.js` that demonstrates the same call via node.

