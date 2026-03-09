# Phase 72: Contextual AI Chat (YoRHa Detective) - Setup Guide

## Overview

This phase integrates a comprehensive contextual AI chat system with your legal AI platform. The Detective (YoRHa) can now:

- Chat with evidence attachment
- Retrieve context from RAG (Qdrant) and KAG (Neo4j)
- Get "did you mean" suggestions
- Track analytics and user behavior

## Architecture

```
SvelteKit Frontend
    ↓
POST /api/ai/yorha/context-chat
    ↓
Go Context Orchestrator (port 8085)
    ├─ gRPC → Python RAG/KAG Service (port 50061)
    │   ├─ Qdrant (vector search)
    │   ├─ Neo4j (knowledge graph)
    │   └─ PostgreSQL (analytics)
    ├─ HTTP → Ollama/Gemma (LLM inference)
    └─ PostgreSQL (chat persistence)
```

## Step 1: Database Setup

### 1.1 Run Migration

```bash
# Apply the contextual chat tables
psql -U legal_admin -d legal_ai_db -f sveltekit-frontend/drizzle/20251208_add_contextual_chat_tables.sql
```

### 1.2 Verify Tables

```bash
psql -U legal_admin -d legal_ai_db -c "\dt chat_*"
```

Expected output:
```
           List of relations
 Schema |        Name        | Type  | Owner
--------+--------------------+-------+------------
 public | chat_analytics     | table | legal_admin
 public | chat_turn_evidence | table | legal_admin
 public | chat_turns         | table | legal_admin
```

## Step 2: Python RAG/KAG Service

### 2.1 Install Dependencies

```bash
cd backend/services
pip install grpcio grpcio-tools qdrant-client neo4j psycopg minio requests
```

### 2.2 Generate gRPC Code

```bash
python -m grpc_tools.protoc -I../../sveltekit-frontend/protos \
  --python_out=. --grpc_python_out=. \
  ../../sveltekit-frontend/protos/rag_kag.proto
```

### 2.3 Start RAG/KAG Service

```bash
# Set environment variables
export QDRANT_HOST=localhost
export QDRANT_PORT=6333
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export DATABASE_URL=postgresql://legal_admin:123456@localhost/legal_ai_db
export OLLAMA_ENDPOINT=http://localhost:11434

# Run service
python rag_kag_server.py
```

Expected output:
```
✅ Connected to Qdrant at localhost:6333
✅ Connected to Neo4j at bolt://localhost:7687
✅ Connected to PostgreSQL
✅ Connected to MinIO at localhost:9000
🚀 RAG/KAG gRPC server listening on [::]:50061
```

## Step 3: Go Context Orchestrator

### 3.1 Build

```bash
cd go-services/yorha-context-orchestrator
go mod init yorha-context-orchestrator
go get google.golang.org/grpc
go build -o yorha-context-orchestrator main.go
```

### 3.2 Run

```bash
# Set environment variables
export CONTEXT_ORCH_URL=http://localhost:8085
export RAG_KAG_SERVICE_ADDR=localhost:50061
export GEMMA_ENDPOINT=http://localhost:11434
export DATABASE_URL=postgresql://legal_admin:123456@localhost/legal_ai_db
export PORT=8085

# Run service
./yorha-context-orchestrator
```

Expected output:
```
🚀 YoRHa Context Orchestrator listening on :8085
```

## Step 4: SvelteKit Frontend Integration

### 4.1 Environment Variables

Add to `.env.local`:

```env
# Context Orchestrator
CONTEXT_ORCH_URL=http://localhost:8085

# RAG/KAG
RAG_KAG_SERVICE_ADDR=localhost:50061
QDRANT_HOST=localhost
QDRANT_PORT=6333
NEO4J_URI=bolt://localhost:7687

# LLM
OLLAMA_ENDPOINT=http://localhost:11434
GEMMA_MODEL=gemma3-legal:latest
EMBEDDING_MODEL=embeddinggemma:latest
```

### 4.2 Update SvelteKit Config

In `svelte.config.js`, ensure the API endpoint is accessible:

```javascript
const config = {
  kit: {
    alias: {
      '$lib/server/schema': './drizzle/schema-contextual-chat.ts',
    },
  },
};
```

### 4.3 Create Terminal Chat Component

Create `src/lib/components/YoRHaChat.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let input = '';
  let loading = false;
  let suggestions: Array<{ query: string; reason: string; score: number }> = [];

  async function sendMessage() {
    if (!input.trim()) return;

    loading = true;
    messages = [...messages, { role: 'user', content: input }];
    const userMessage = input;
    input = '';

    try {
      const response = await fetch('/api/ai/yorha/context-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          caseId: null, // Set from context
        }),
      });

      if (!response.ok) throw new Error('Chat failed');

      const data = await response.json();
      messages = [...messages, { role: 'assistant', content: data.answer }];
      suggestions = data.didYouMean || [];
    } catch (err) {
      console.error('Chat error:', err);
      messages = [...messages, { role: 'assistant', content: '❌ Error: ' + err }];
    } finally {
      loading = false;
    }
  }

  function applySuggestion(query: string) {
    input = query;
  }
</script>

<div class="chat-container">
  <div class="messages">
    {#each messages as msg}
      <div class="message {msg.role}">
        {msg.content}
      </div>
    {/each}
  </div>

  {#if suggestions.length > 0}
    <div class="suggestions">
      <h4>Did you mean…</h4>
      {#each suggestions as s}
        <button on:click={() => applySuggestion(s.query)}>
          {s.query}
          <small>{s.reason}</small>
        </button>
      {/each}
    </div>
  {/if}

  <div class="input-area">
    <input
      bind:value={input}
      placeholder="Ask about the case..."
      on:keydown={(e) => e.key === 'Enter' && sendMessage()}
      disabled={loading}
    />
    <button on:click={sendMessage} disabled={loading}>
      {loading ? 'Thinking...' : 'Send'}
    </button>
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .message {
    padding: 0.75rem;
    border-radius: 0.5rem;
    max-width: 80%;
  }

  .message.user {
    align-self: flex-end;
    background: #007bff;
    color: white;
  }

  .message.assistant {
    align-self: flex-start;
    background: #f0f0f0;
    color: black;
  }

  .suggestions {
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 0.5rem;
  }

  .suggestions h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
  }

  .suggestions button {
    display: block;
    width: 100%;
    padding: 0.5rem;
    margin: 0.25rem 0;
    text-align: left;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .suggestions button:hover {
    background: #f0f0f0;
  }

  .suggestions small {
    display: block;
    font-size: 0.75rem;
    color: #666;
  }

  .input-area {
    display: flex;
    gap: 0.5rem;
  }

  input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 0.5rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

## Step 5: Testing

### 5.1 Health Check

```bash
# Check Go orchestrator
curl http://localhost:8085/health

# Check Python service
python -c "import grpc; from rag_kag_pb2_grpc import RagKagServiceStub; print('✅ gRPC OK')"
```

### 5.2 Test Chat Endpoint

```bash
curl -X POST http://localhost:5173/api/ai/yorha/context-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What evidence relates to the timeline?",
    "caseId": "case-123"
  }'
```

### 5.3 Check Database

```bash
psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM chat_turns;"
```

## Step 6: Production Deployment

### 6.1 Docker Compose

Add to `docker-compose.yml`:

```yaml
rag-kag-service:
  build:
    context: ./backend/services
    dockerfile: Dockerfile.rag-kag
  ports:
    - "50061:50061"
  environment:
    QDRANT_HOST: qdrant
    NEO4J_URI: bolt://neo4j:7687
    DATABASE_URL: postgresql://legal_admin:123456@postgres/legal_ai_db
    OLLAMA_ENDPOINT: http://ollama:11434
  depends_on:
    - qdrant
    - neo4j
    - postgres
    - ollama

yorha-context-orchestrator:
  build:
    context: ./go-services/yorha-context-orchestrator
  ports:
    - "8085:8085"
  environment:
    RAG_KAG_SERVICE_ADDR: rag-kag-service:50061
    GEMMA_ENDPOINT: http://ollama:11434
    DATABASE_URL: postgresql://legal_admin:123456@postgres/legal_ai_db
  depends_on:
    - rag-kag-service
    - postgres
```

### 6.2 Environment Variables

```bash
# .env.production
CONTEXT_ORCH_URL=http://yorha-context-orchestrator:8085
RAG_KAG_SERVICE_ADDR=rag-kag-service:50061
OLLAMA_ENDPOINT=http://ollama:11434
```

## Troubleshooting

### Issue: "Context orchestrator failed"

**Solution**: Check Go service is running and accessible:
```bash
curl http://localhost:8085/health
```

### Issue: "RAG/KAG service unavailable"

**Solution**: Check Python service and gRPC connection:
```bash
python -c "import grpc; stub = grpc.aio.secure_channel('localhost:50061'); print('OK')"
```

### Issue: "No embeddings returned"

**Solution**: Verify Ollama is running with embeddinggemma:
```bash
curl http://localhost:11434/api/tags | grep embeddinggemma
```

### Issue: "Database connection failed"

**Solution**: Check PostgreSQL connection:
```bash
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

## Next Steps

1. **Integrate with Terminal Chat UI**: Add YoRHaChat component to `/terminal` route
2. **Add Evidence Upload**: Allow attaching evidence to chat messages
3. **Implement Analytics Dashboard**: Visualize chat patterns and user behavior
4. **Fine-tune Gemma**: Train on legal domain for better responses
5. **Add Voice Chat**: Integrate speech-to-text for accessibility

## References

- [Phase 72 Architecture](./phase72-context-chat.md)
- [RAG/KAG Workflow](./phase-rag-kag-workflow.md)
- [Gemma VLM Integration](./gemma-vlm-integration.md)
