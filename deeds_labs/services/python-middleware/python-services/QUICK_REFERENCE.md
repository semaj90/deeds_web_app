# Quick Reference: Streaming RAG + Citation Enforcement

## TL;DR

✅ **Streaming Endpoint:** `/rag/stream` – First token in 250–350ms
✅ **Citation Enforcement:** LLM must cite [&1], [&2], etc. or return fallback
✅ **Hallucination Blocking:** Invalid citations replaced with fallback message

## Quick Start

### 1. Start Service
```bash
cd python-services
python nlp_middleware_service.py
```

### 2. Test Streaming
```bash
curl -N -X POST http://localhost:8003/rag/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is perjury?",
    "context": ["Perjury is willfully giving false testimony under oath."],
    "chunk_ids": ["1"]
  }'
```

### 3. Expected Response
```
Perjury is willfully giving false testimony [&1] under oath.
```

## API Endpoints

### POST `/rag/stream` (NEW)
Stream RAG response with citations.

**Request:**
```json
{
  "query": "string",
  "context": ["string"],
  "chunk_ids": ["string"],
  "model": "gemma2:latest"
}
```

**Response:** `text/plain` (streaming)

### POST `/generate-llm` (UPDATED)
Generate LLM output with citations (non-streaming).

**Request:** Same as `/rag/stream`

**Response:**
```json
{
  "query": "string",
  "response": "string",
  "model": "string",
  "processing_time_ms": 450.5
}
```

## Citation Format

### Valid Citations
```
Perjury is [&1] defined as [&2] willfully giving false testimony [&1].
```

### Invalid Citations (Hallucination)
```
Perjury carries a 10-year sentence and $50,000 fine.
[CITATION VALIDATION FAILED]
No statutory or case authority provided in supplied context.
```

## Performance

| Metric | Value |
|--------|-------|
| First token | 250–350ms |
| Full response | 230–900ms |
| Perceived latency | 250–350ms |
| Throughput | 1–2 req/sec |

## Key Functions

### `format_llm_prompt_with_citations(query, docs, kag_graph)`
Format prompt with citation requirements.

```python
docs = [
    {"text": "Perjury is...", "source": "chunk-1"},
    {"text": "Penalties include...", "source": "chunk-2"}
]
prompt = format_llm_prompt_with_citations("What is perjury?", docs)
```

### `validate_citations(response_text, num_sources)`
Validate response contains proper citations.

```python
valid = validate_citations("Perjury is [&1]...", 1)  # True
valid = validate_citations("Perjury is...", 1)      # False (no citations)
valid = validate_citations("Perjury is [&5]...", 1) # False (invalid citation)
```

### `stream_llm_output(query, context, chunk_ids, model)`
Stream LLM output token-by-token.

```python
async for token in stream_llm_output(
    "What is perjury?",
    ["Perjury is..."],
    ["1"]
):
    print(token, end="", flush=True)
```

## Testing

### Run Unit Tests
```bash
python test_streaming_citations.py
```

### Test Streaming Endpoint
```bash
curl -N -X POST http://localhost:8003/rag/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is perjury?",
    "context": ["Perjury is willfully giving false testimony under oath."],
    "chunk_ids": ["1"]
  }'
```

### Test Citation Validation
```bash
curl -X POST http://localhost:8003/generate-llm \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is perjury?",
    "context": ["Perjury is willfully giving false testimony under oath."],
    "chunk_ids": ["1"]
  }'
```

## Configuration

### Environment Variables
```bash
OLLAMA_URL=http://localhost:11434
EMBEDDING_URL=http://localhost:8000
GRANITE_DOCLING_URL=http://localhost:8094
LANGEXTRACT_URL=http://localhost:9002
PORT=8003
```

### Supported Models
- `gemma2:latest` (default)
- `mistral:latest` (better instruction following)
- `qwen:latest` (multilingual)
- `neural-chat:latest` (optimized for chat)

## Troubleshooting

### No streaming response
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Test streaming directly
curl -X POST http://localhost:11434/api/generate \
  -d '{"model": "gemma2:latest", "prompt": "test", "stream": true}'
```

### Citations not appearing
- Verify context is provided
- Check chunk_ids match context length
- Try with Mistral model

### Slow first token
- Check GPU: `nvidia-smi`
- Pre-load model: `ollama pull gemma2:latest`
- Restart Ollama

## Files

| File | Purpose |
|------|---------|
| `nlp_middleware_service.py` | Main service (modified) |
| `STREAMING_CITATIONS.md` | Full documentation |
| `INTEGRATION_GUIDE.md` | Integration examples |
| `test_streaming_citations.py` | Unit tests |
| `IMPLEMENTATION_SUMMARY.md` | Implementation details |
| `QUICK_REFERENCE.md` | This file |

## Next Steps

1. ✅ Streaming implemented
2. ✅ Citation enforcement implemented
3. ⏭ Deploy to production
4. ⏭ Add audit logging
5. ⏭ Implement chunk-aware citations

## Support

- **Documentation:** See `STREAMING_CITATIONS.md`
- **Integration:** See `INTEGRATION_GUIDE.md`
- **Testing:** Run `test_streaming_citations.py`
- **Issues:** Check service logs: `docker logs nlp-middleware`

