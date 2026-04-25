Full RAG + Agentic pipeline skeleton
====================================

This folder contains a runnable skeleton for an end-to-end pipeline. The goal is to give you a starting point you can wire into your infra (Ollama, Triton, Postgres/PGVector, Qdrant, Redis, RabbitMQ, etc.).

Components added in this commit:
- SvelteKit demo route: `src/routes/rag-demo/+page.svelte`
- SvelteKit server route: `src/routes/api/rag/search/+server.ts` (uses local ranker service)
- Ollama embedding worker: `ops/embedding_worker/ollama_embedding_worker.py`
- Triton convert helper: `ops/triton/convert_to_triton.sh`
- Node Triton helper: `ops/triton/node_triton_client.ts`
- Agent function registry: `ops/agent/agent_registry.ts`
- Indexer/ranker/agent skeletons under `ops/` (previously added)

How to try the skeleton
-----------------------
1. Start RabbitMQ and Redis locally, or point the workers to your infrastructure via environment variables.
2. Run the Ollama embedding worker:

```bash
python3 ops/embedding_worker/ollama_embedding_worker.py
```

3. Start the ranker and agent services (node) — these are minimal express servers under `ops/ranker` and `ops/agent` (npm install express node-fetch ioredis).
4. In the SvelteKit dev server, open `/rag-demo` and try searches.

Notes
-----
- All files are intentionally small, commented, and have TODO markers where you should replace placeholders with real DB/clients.
- The Triton conversion script is a minimal helper; you must convert your model to ONNX/TensorRT and verify input/output names.

Next steps I can take for you (choose one):
- Wire `ops/indexer` to Drizzle and Qdrant with example SQL and Qdrant client code.
- Implement a GPU-backed similarity function in `ops/ranker` that calls Triton or a CUDA service.
- Add a Playwright test that runs a simple end-to-end ingest → search flow using mocked services.
