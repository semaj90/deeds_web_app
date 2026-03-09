# LangChain RAG Integration Service

Enhances your existing SSE-first streaming RAG pipeline with LangChain capabilities:

## Features

✅ **Document Chunking**: Intelligent text splitting with legal document awareness
✅ **Case Summarization**: Automatic legal case summaries using LangChain templates  
✅ **Chain-of-Thought Reasoning**: Step-by-step legal analysis
✅ **Enhanced RAG**: Combines basic RAG with summarization and reasoning
✅ **SSE Integration**: Real-time streaming events for all LangChain operations

## Architecture

```
┌─────────────────┐    ┌────────────────────┐    ┌──────────────────┐
│   SvelteKit     │    │   SSE RAG Service  │    │ LangChain Service │
│   Frontend      │◄──►│     (Go)           │◄──►│    (Python)       │
│                 │    │   Port 9003        │    │   Port 9004       │
└─────────────────┘    └────────────────────┘    └──────────────────┘
                                │                           │
                                ▼                           ▼
                       ┌─────────────────┐       ┌─────────────────┐
                       │   PostgreSQL    │       │   Ollama APIs   │
                       │   + pgvector    │       │  nomic-embed    │
                       │                 │       │  gemma3-legal   │
                       └─────────────────┘       └─────────────────┘
```

## Quick Start

1. **Start the LangChain service:**
   ```bash
   cd langchain-rag-service
   pip install -r requirements.txt
   python main.py
   ```

2. **Service runs on:** `http://localhost:9004`

3. **Available endpoints:**
   - `POST /api/v1/documents/chunk` - Chunk documents with embeddings
   - `POST /api/v1/cases/{case_id}/summarize` - Generate case summaries
   - `POST /api/v1/rag/enhanced` - Enhanced RAG with reasoning
   - `GET /api/v1/health` - Service health check

## Usage Examples

### 1. Chunk a Legal Document
```bash
curl -X POST http://localhost:9004/api/v1/documents/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This contract is entered into between Party A and Party B...",
    "case_id": 1,
    "title": "Service Agreement",
    "metadata": {"contract_type": "service", "jurisdiction": "US"}
  }'
```

### 2. Summarize a Case
```bash
curl -X POST http://localhost:9004/api/v1/cases/1/summarize?client_id=my_client \
  -H "Content-Type: application/json"
```

### 3. Enhanced RAG Query
```bash
curl -X POST http://localhost:9004/api/v1/rag/enhanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key elements of contract formation?",
    "case_id": 1,
    "client_id": "my_client",
    "enable_summarization": true,
    "enable_chain_of_thought": true
  }'
```

## SSE Event Types

The LangChain service sends these additional SSE events:

- `chunking_started` - Document chunking begins
- `chunk_processed` - Individual chunk completed 
- `chunking_complete` - All chunks processed
- `summarization_started` - Case summary generation begins
- `summary_generated` - Summary complete
- `reasoning_started` - Chain-of-thought reasoning begins  
- `reasoning_complete` - Reasoning analysis finished

## Integration Flow

1. **Basic RAG** (existing Go service): Vector search + streaming generation
2. **Enhanced RAG** (LangChain service): Adds summarization + reasoning
3. **Real-time events**: All operations stream via SSE to connected clients

## Dependencies

- **LangChain**: Document processing and prompt templates
- **Ollama Integration**: Uses your existing nomic-embed-text + gemma3-legal models
- **PostgreSQL**: Connects to your existing legal_ai_db
- **FastAPI**: REST API for LangChain operations
- **SSE Integration**: Forwards events to Go SSE service

## Legal AI Prompt Templates

The service includes specialized legal templates:

- **Legal Q&A**: Step-by-step legal analysis with precedent references
- **Case Summarization**: Structured case summaries with key issues
- **Chain-of-Thought**: Legal reasoning with issue→law→analysis→conclusion

Perfect for enhancing your existing SSE RAG pipeline with sophisticated legal AI capabilities!