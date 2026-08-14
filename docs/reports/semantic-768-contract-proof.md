# Semantic 768 contract proof

- status: **PROVEN**
- collection: `codebase_chunks_768`
- dense slots: `content`, `error`, `signature` — 768 dimensions, cosine
- chat owner: `llama-server:8090`
- embedding owner: `Ollama:11434`
- BM42: **DEGRADED/NOT_RUN** (no sparse schema; not required here)

- QDRANT_COLLECTION_REACHABLE: PASS
- QDRANT_CONTENT_VECTOR_768: PASS
- QDRANT_ERROR_VECTOR_768: PASS
- QDRANT_SIGNATURE_VECTOR_768: PASS
- QDRANT_NO_SPARSE_ASSUMPTION: PASS
- LLAMA_CHAT_8090_REACHABLE: PASS
- OLLAMA_EMBEDDING_OWNER_REACHABLE: PASS
- CHAT_EMBEDDING_SEPARATION: PASS
- SEMANTIC_768_CANONICAL_CONTRACT: PASS
- BM42_NOT_REQUIRED: PASS

This is a read-only contract receipt. It does not mutate Qdrant, models, or environment files.
