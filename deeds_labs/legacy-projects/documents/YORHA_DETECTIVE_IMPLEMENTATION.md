# Yorha Detective RAG System — Implementation Guide

This guide documents the end-to-end flow: upload → embeddings → search → case creation → AI chat.

## Subsystems

- Case Management: Drizzle/PostgreSQL (`/api/cases`)
- Document Upload: `/api/rag/upload`, `/api/rag/documents/upload`
- Vector Search: `/api/rag/search`, `/api/search/vector`
- AI Chat (Ollama): `/api/ai/chat` and related endpoints
- Frontend: SvelteKit 2 + UnoCSS-compatible components; main UI at `/rag` and `/yorha/detective`

## Backend Routes

1) Upload (RAG)
- `src/routes/api/rag/upload/+server.ts` (primary)
- `src/routes/api/rag/documents/upload/+server.ts` (alternate)

Both insert into the enhanced `documents` and `document_chunks` tables and generate embeddings via Ollama (`embeddinggemma:latest`, 384-dim). They degrade if Redis/MinIO/Qdrant are unavailable.

2) Search (RAG)
- `src/routes/api/rag/search/+server.ts` — hybrid text + vector with graceful downgrades
- `src/routes/api/search/vector/+server.ts` — vector-only helper over the unified service

3) Cases
- `src/routes/api/cases/+server.ts` — list, create, update. Used by `/yorha/detective` for new cases.

4) AI Chat (Ollama)
- Existing endpoints: `/api/ai/chat`, `/api/ai/chat-sse`, `/api/legal/chat`, `/api/v1/chat`, `/api/ai/ollama/analyze-legal-document`
- Client utilities added:
  - `src/lib/server/ai/ollama-client.ts`
  - `src/lib/server/services/embedding-service.ts`

## New Utilities

1) `ollama-client.ts`
- `createEmbedding(prompt, model?)` → number[] (fallback zero-vector on failure)
- `chat(messages, { model? })` → JSON response from Ollama chat completions API

2) `embedding-service.ts`
- `extractText(buffer, mimeType?)` → simple extraction (extend as needed)
- `generateEmbedding(text, { model? })` → { embedding, model }

## Quick Tests

Status
curl http://localhost:5176/api/rag/status || curl http://localhost:5173/api/rag/status

Upload
curl -F file=@COMPREHENSIVE.md -F tags="smoketest,doc" http://localhost:5176/api/rag/upload

Search
curl -X POST http://localhost:5176/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"contract breach remedies","searchType":"hybrid","limit":5}'

Create Case
curl -X POST http://localhost:5176/api/cases \
  -H "Content-Type: application/json" \
  -d '{"title":"People v. Shadow AI","priority":"critical","status":"open"}'

## Frontend

- `/rag`: upload + search UI
- `/yorha/detective`: dashboard with “New Case” (posts to `/api/cases`)

## Ops Notes

- Qdrant should run at `http://localhost:6333` for vector results; hybrid still works without it.
- MinIO/Redis auth failures are tolerated; endpoints degrade gracefully.
- Route groups like `(legal)` don’t appear in URLs; use `/cases`, `/rag`, etc.

