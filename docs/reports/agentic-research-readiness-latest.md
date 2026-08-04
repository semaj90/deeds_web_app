# Agentic Research Readiness

Generated: 2026-08-04T19:24:01.8144771Z

## Safety

- No deletes, volume operations, schema changes, Qdrant writes, Valkey writes, or Graphify.

## Results

| Check | Status | Detail |
|---|---|---|
| python.imports | PASS | LDR/crawler/RAG/Qdrant/pgvector/graph/gRPC imports passed |
| ast-grep.cli | PASS | ast-grep 0.45.0 |
| llama.models | PASS | hforf.gguf |
| ollama.tags | PASS | embeddinggemma:latest, ibm/granite-docling:258m, nomic-embed-text:latest |
| embeddinggemma.semantic_768 | PASS | dim=768 finite=True l2=1.00000009519478 |
| qdrant.collection | PASS | codebase_chunks_768_v2 points=52380 dim=768 |
| qdrant.payload.sample | WARN | sample=10 packet_key=0 representation_id=10 representation_name=10 |
| qdrant.tag_filter | PASS | field=representation_name value=semantic_768 results=5 |
| valkey.ping | PASS | PONG; no keys read or written |
| postgres.readonly | PASS | Read-only transaction passed |
| gpu.nvidia | PASS | NVIDIA GeForce RTX 3060 Ti, 8192, 7814, 580.88 |
| gpu.cuvs | NOT_PROVEN | run: line 1: conda: command not found |
| retrieval.search_runtime | PASS | C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\retrieval\search-runtime.ts |
| ranking.rrf | NOT_PROVEN | Use focused SearchRuntime tests; bootstrap does not invoke fusion |
| graph.pagerank | NOT_PROVEN | Requires persisted-property/distribution proof |
| clustering.knn | NOT_PROVEN | Requires immutable Postgres↔Qdrant manifest before GPU benchmark |
| firecrawl.runtime | NOT_PROVEN | SDK installed; no server/API key called |
| ldr.runtime | NOT_PROVEN | Import ready; MCP client-attached research remains separate |
