# YoRHa AI Chat – Contextual Uploads (Phase 72 / Phase 14)

## Goal

Detective can chat with 9S **and** attach images/documents.
Each turn:

1. UI sends `message + files[] + caseId?` via multipart form.
2. SvelteKit 2 + Superforms + Zod validate inputs.
3. Files are streamed to MinIO as evidence blobs.
4. A RAG + KAG pipeline:
   - Extracts text (OCR / captions).
   - Generates embeddings with `embeddinggemma:latest`.
   - Stores vectors in Qdrant + metadata in PostgreSQL.
   - (Optionally) creates/updates knowledge graph nodes/edges.
5. Chat request hits the LLM with:
   - Raw user message.
   - Top-k retrieved evidence chunks.
   - Case context (caseId, POIs, tags, etc.).
6. LLM response is saved as `llm_output` linked to the case and evidence.

## Routes

- Page: `/terminal` (YoRHa AI Chat UI)
- Action: `POST /terminal?/_action=chat`
- API (optional): `POST /api/ai/context-chat`
- Storage:
  - MinIO: `evidence/{caseId}/{uuid}/{filename}`
  - DB: `phase72_error` (errors), `evidence_files`, `chat_messages`
  - Vectors: Qdrant collection `phase72_evidence_embeddings`

## Tech

- SvelteKit 2 + Svelte 5 (runes)
- `sveltekit-superforms` + `zod`
- MinIO client (Node SDK)
- Ollama `embeddinggemma:latest` for embeddings
- Phase 72 GPU addon (optional) for AST error vectors
- RAG + KAG services reused from existing `/api/ai/enhanced-rag` + Neo4j sidecar

## Flow Summary

1. Detective types message, attaches files → submit.
2. Server:
   - Validates message.
   - Uploads files to MinIO.
   - Enqueues RAG/KAG indexing job.
   - Calls contextual LLM endpoint with `message + retrieved context`.
3. Response is streamed back to chat and stored for future turns.
