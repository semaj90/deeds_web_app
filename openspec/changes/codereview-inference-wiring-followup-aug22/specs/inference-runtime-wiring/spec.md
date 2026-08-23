## ADDED Requirements

### Requirement: dense_768 embedding lane provider SHALL match its resolved base URL
The `dense_768` embedding lane in `embedding-service.ts` SHALL NOT build an Ollama-shaped request path against a base URL that resolves to `LLAMA_SERVER_URL`. Provider selection SHALL be consistent with whichever URL environment variable actually determined the base URL.

#### Scenario: LLAMA_SERVER_URL set without explicit EMBEDDING_PROVIDER
- **WHEN** `EMBEDDING_BASE_URL` and `EMBEDDING_PROVIDER` are unset but `LLAMA_SERVER_URL` is set
- **THEN** `embedQueryForLane` for the `dense_768` lane does not send a request to `${baseUrl}/api/embed` or `/api/embeddings` against the llama-server port

### Requirement: streaming and non-streaming Gemma4 completions SHALL apply the same reasoning_content fallback
Any SSE-assembly helper used for Gemma4 chat completions SHALL fall back to `reasoning_content` under the same conditions the non-streaming call sites already do, so a reasoning-format launcher drift produces consistent (not silently empty) output across both paths.

#### Scenario: delta stream emits reasoning_content instead of content
- **WHEN** a streamed chat completion delta carries `reasoning_content` but an empty or absent `content` field
- **THEN** `fetchStreamedChatCompletion()`'s assembled output is not silently empty
