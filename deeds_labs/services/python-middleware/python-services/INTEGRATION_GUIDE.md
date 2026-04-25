# Integration Guide: Streaming + Citation Enforcement

## Quick Start

### 1. Enable Streaming in Frontend

**SvelteKit Component Example:**

```typescript
// src/lib/components/RAGSearch.svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let query = '';
  let response = '';
  let isStreaming = false;

  async function streamRAG() {
    isStreaming = true;
    response = '';

    try {
      const res = await fetch('http://localhost:8003/rag/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          context: [
            'California Penal Code §148 defines perjury...',
            'Penalties for perjury include imprisonment...'
          ],
          chunk_ids: ['chunk-1', 'chunk-2']
        })
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        response += chunk;
      }
    } catch (error) {
      console.error('Streaming error:', error);
      response = 'Error: Failed to stream response';
    } finally {
      isStreaming = false;
    }
  }
</script>

<div>
  <input bind:value={query} placeholder="Ask a legal question..." />
  <button on:click={streamRAG} disabled={isStreaming}>
    {isStreaming ? 'Streaming...' : 'Search'}
  </button>
  <div class="response">
    {response}
  </div>
</div>

<style>
  .response {
    white-space: pre-wrap;
    font-family: monospace;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
    min-height: 100px;
  }
</style>
```

### 2. Backend Integration (SvelteKit Server)

**src/routes/api/rag/+server.ts:**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const NLP_MIDDLEWARE_URL = 'http://localhost:8003';

export const POST: RequestHandler = async ({ request }) => {
  const { query, context, chunk_ids } = await request.json();

  try {
    const response = await fetch(`${NLP_MIDDLEWARE_URL}/rag/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        context,
        chunk_ids,
        model: 'gemma2:latest'
      })
    });

    if (!response.ok) {
      throw new Error(`NLP service error: ${response.statusText}`);
    }

    // Return streaming response
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('RAG error:', error);
    return json({ error: 'Failed to process query' }, { status: 500 });
  }
};
```

### 3. Test Streaming Endpoint

```bash
# Terminal 1: Start NLP Middleware
cd python-services
python nlp_middleware_service.py

# Terminal 2: Test streaming
curl -N -X POST http://localhost:8003/rag/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the penalty for perjury in California?",
    "context": [
      "California Penal Code §148 defines perjury as willfully giving false testimony under oath.",
      "Penalties for perjury include imprisonment up to 4 years and fines up to $10,000."
    ],
    "chunk_ids": ["chunk-1", "chunk-2"]
  }'

# Expected output (streaming):
# Perjury in California is defined as willfully giving false testimony [&1].
# Penalties include imprisonment up to 4 years [&2] and fines up to $10,000 [&2].
```

## Citation Enforcement Details

### How It Works

1. **Prompt Formatting**
   - Each source is numbered [1], [2], etc.
   - LLM instructed to cite as [&1], [&2], etc.
   - Fallback message if no sources available

2. **Citation Validation**
   - Regex pattern: `[&\d+]`
   - Check: 1 ≤ citation_number ≤ num_sources
   - If invalid: Replace with fallback message

3. **Fallback Message**
   ```
   No statutory or case authority provided in supplied context.
   ```

### Example Responses

**Valid Response (with citations):**
```
Perjury in California is defined as willfully giving false testimony [&1].
Penalties include imprisonment up to 4 years [&2] and fines up to $10,000 [&2].
```

**Invalid Response (hallucination detected):**
```
[CITATION VALIDATION FAILED]
No statutory or case authority provided in supplied context.
```

## Performance Expectations

### Streaming Latency

| Metric | Value |
|--------|-------|
| First token | 250–350ms |
| Full response | 230–900ms |
| Perceived latency | 250–350ms |
| Actual latency | 230–900ms |

### Throughput

- **Concurrent requests:** 10–50 (depends on GPU memory)
- **Tokens/second:** 20–50 (Gemma 2 on RTX 3060 Ti)
- **Requests/second:** 1–2 (full pipeline)

## Monitoring

### Health Check

```bash
curl http://localhost:8003/health
```

**Response:**
```json
{
  "status": "OK",
  "services": {
    "langextract": "http://localhost:9002",
    "embedding": "http://localhost:8000",
    "granite_docling": "http://localhost:8094",
    "ollama": "http://localhost:11434"
  },
  "embedding_model": "embeddinggemma:latest",
  "embedding_dim": 768
}
```

### Logging

Enable debug logging:

```bash
# In docker-compose.yml or environment
export LOGLEVEL=DEBUG
python nlp_middleware_service.py
```

**Log output:**
```
INFO:     Generating embeddings for 5 chunks...
INFO:     Extracting entities...
INFO:     Processing with Granite Docling...
INFO:     Generating LLM output...
```

## Troubleshooting

### Issue: Streaming not working

**Check:**
1. Ollama is running: `curl http://localhost:11434/api/tags`
2. Model is available: `ollama list | grep gemma2`
3. Streaming is enabled in request: `"stream": true`

**Fix:**
```bash
# Pull model if missing
ollama pull gemma2:latest

# Test streaming directly
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma2:latest", "prompt": "test", "stream": true}'
```

### Issue: Citations not appearing

**Check:**
1. Context is provided: `"context": ["..."]`
2. Chunk IDs match context length: `len(chunk_ids) == len(context)`
3. LLM model supports instruction following

**Fix:**
```bash
# Try with Mistral (better instruction following)
curl -X POST http://localhost:8003/rag/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is perjury?",
    "context": ["Perjury is..."],
    "chunk_ids": ["1"],
    "model": "mistral:latest"
  }'
```

### Issue: Slow first token

**Check:**
1. GPU is being used: `nvidia-smi`
2. Model is loaded in memory: `ollama list`
3. No other processes using GPU

**Fix:**
```bash
# Pre-load model
ollama pull gemma2:latest

# Check GPU memory
nvidia-smi

# Restart Ollama if needed
pkill ollama
ollama serve
```

## Advanced Configuration

### Custom Citation Format

To use different citation format (e.g., `[1]` instead of `[&1]`):

**Edit `validate_citations()` in nlp_middleware_service.py:**

```python
def validate_citations(response_text: str, num_sources: int) -> bool:
    import re

    # Change pattern from [&N] to [N]
    citation_pattern = r'\[\d+\]'  # Changed from r'\[&\d+\]'
    citations = re.findall(citation_pattern, response_text)

    # ... rest of validation
```

**Update prompt in `format_llm_prompt_with_citations()`:**

```python
# Change from [&1], [&2] to [1], [2]
return f"""...
- You MUST cite sources like [1], [2], etc. for every factual claim
..."""
```

### Custom Fallback Message

**Edit `generate_llm_output()` in nlp_middleware_service.py:**

```python
# Change fallback message
if not validate_citations(llm_response, len(context)):
    llm_response = "I cannot provide an answer based on the supplied legal documents."
```

### Different LLM Models

**Supported models:**
- `gemma2:latest` (default, good balance)
- `mistral:latest` (better instruction following)
- `qwen:latest` (multilingual)
- `neural-chat:latest` (optimized for chat)

**Usage:**
```bash
curl -X POST http://localhost:8003/rag/stream \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is perjury?",
    "context": ["..."],
    "chunk_ids": ["1"],
    "model": "mistral:latest"
  }'
```

## Next Steps

1. **Deploy to production** – Use Docker Compose with health checks
2. **Add audit logging** – Log all citations for compliance
3. **Implement chunk-aware citations** – Link to specific pages/sections
4. **Add bias detection** – Flag potentially biased reasoning
5. **Monitor performance** – Track latency and citation accuracy

