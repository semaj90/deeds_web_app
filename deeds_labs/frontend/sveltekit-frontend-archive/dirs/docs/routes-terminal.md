# YoRHa Terminal - Route Documentation

## Overview

The `/terminal` route provides a retro-styled detective AI chat interface where users can interact with the 9S assistant and upload evidence files for contextual analysis.

## Route Files

### `+page.svelte`
Client-side UI component featuring:
- **YoRHa Terminal Aesthetic**: Retro green-on-black terminal styling with cyan accents
- **Chat Interface**: Message log with user/assistant bubbles
- **Multi-file Upload**: Drag-and-drop or select multiple evidence files
- **Case Context**: Optional case ID for scoped investigations
- **Superforms Integration**: Client-side form validation with Svelte 5 runes

### `+page.server.ts`
Server-side form action handling:
- **Action**: `POST ?/chat`
- **Validation**: Zod schema via Superforms
- **File Processing**: Uploads to MinIO evidence bucket
- **RAG Pipeline**: Enqueues background indexing job
- **LLM Response**: Calls contextual chat with retrieved evidence

## API Contract

### Form Action: `POST /terminal?/chat`

**Request (multipart/form-data)**:
```typescript
{
  message: string;           // Required: User's question/message
  caseId?: string;          // Optional: UUID of related case
  files: File[];            // Optional: Evidence files (images, PDFs, docs)
}
```

**Response**:
```typescript
{
  form: SuperValidated<AiChatInput>;
  chatTurnId: string;       // UUID for this conversation turn
  llmReply: string;         // AI assistant's response
}
```

**File Upload Location**:
```
MinIO Bucket: legal-evidence
Path: evidence/{caseId}/{chatTurnId}/{randomUUID}.{ext}
```

## Data Flow

1. **User Input** → Form submission with message + files + optional caseId
2. **Validation** → Superforms validates against `aiChatSchema`
3. **File Upload** → Each file streamed to MinIO `legal-evidence` bucket
4. **RAG Indexing** → Background job enqueued:
   - OCR/text extraction from images
   - Embedding generation via `embeddinggemma:latest`
   - Vector storage in Qdrant collection `phase72_evidence_embeddings`
   - Metadata in PostgreSQL `evidence_files` table
5. **Context Retrieval** → RAG query for relevant evidence chunks
6. **LLM Call** → Ollama chat completion with:
   - System prompt: "You are 9S detective AI"
   - Retrieved evidence context
   - User message
7. **Response** → LLM reply returned and displayed in chat

## Environment Variables

```env
# Ollama
OLLAMA_URL=http://localhost:11434
LLM_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_EVIDENCE_BUCKET=legal-evidence

# Database
DATABASE_URL=postgresql://postgres:123456@localhost:5432/legal_ai_db

# Qdrant
QDRANT_URL=http://localhost:6333
```

## Dependencies

### NPM Packages
- `sveltekit-superforms` - Form validation and submission
- `zod` - Schema validation
- `minio` - MinIO client for object storage

### Services
- **Ollama**: LLM inference + embeddings (ports 11434)
- **MinIO**: Evidence file storage (ports 9000/9001)
- **PostgreSQL**: Metadata storage (port 5432)
- **Qdrant**: Vector database (port 6333)
- **RabbitMQ/NATS**: Message queue for background jobs

## Related Files

- Schema: `src/lib/schemas/aiChat.ts`
- MinIO Client: `src/lib/server/minio-client.ts`
- RAG Pipeline: `src/lib/server/rag-pipeline.ts`
- RAG Query: `src/lib/server/rag-query.ts`
- Contextual Chat: `src/lib/server/llm/contextual-chat.ts`
- Queue: `src/lib/server/queue.ts`

## Accessibility

- ✅ All form inputs have `<label>` elements
- ✅ Submit button has `aria-label`
- ✅ Semantic HTML (`<section>`, `<form>`, `<textarea>`)
- ✅ Keyboard navigation support
- ✅ Screen reader compatible (`.sr-only` class for visual labels)

## Future Enhancements

- [ ] Streaming LLM responses (server-sent events)
- [ ] Image preview before upload
- [ ] Chat history persistence
- [ ] Knowledge graph visualization of case connections
- [ ] Multi-user chat rooms (detective collaboration)
- [ ] Voice input via Web Speech API
- [ ] Export chat transcript
