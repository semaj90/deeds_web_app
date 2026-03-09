# Environment variables (recommended)

Prefer Docker service hostnames first, with localhost fallbacks for local dev. Centralize access via small helpers (e.g. `getOllamaEndpoint()`, `getRagServiceUrl()`, `getQuicServerUrl()`).

- OLLAMA_URL
  - Purpose: Ollama API base URL for embeddings / generation.
  - Example (docker): `http://ollama:11434`
  - Local fallback: `http://localhost:11434`

- ENHANCED_RAG_URL
  - Purpose: RAG / enhanced retrieval microservice base URL.
  - Example (docker): `http://enhanced-rag:8094`
  - Local fallback: `http://localhost:8094`

- QUIC_SERVER_URL
  - Purpose: QUIC / WebTransport server endpoint (WebTransport origin / WebTransport URL).
  - Example (docker): `https://quic-server:4433` (or `https://quic-server:8095` as HTTP fallback)
  - Local fallback (HTTP/HTTPS): `https://localhost:4433` (or `http://localhost:8095` for fallback)

- QUIC_HTTP_FALLBACK
  - Purpose: Optional HTTP fallback host/port used when QUIC/WebTransport isn't available.
  - Example: `http://quic-server:8095` or `http://localhost:8095`

Recommended values summary (env file example)
```
OLLAMA_URL=http://ollama:11434
ENHANCED_RAG_URL=http://enhanced-rag:8094
QUIC_SERVER_URL=https://quic-server:4433
QUIC_HTTP_FALLBACK=http://quic-server:8095
```

Recommended usage pattern (node / sveltekit server)
```ts
// example helper snippet
export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_URL || 'http://localhost:11434';
}
export function getRagServiceUrl(): string {
  return process.env.ENHANCED_RAG_URL || 'http://localhost:8094';
}
export function getQuicServerUrl(): { quic: string; httpFallback: string } {
  return {
    quic: process.env.QUIC_SERVER_URL || 'https://localhost:4433',
    httpFallback: process.env.QUIC_HTTP_FALLBACK || 'http://localhost:8095'
  };
}
```

Notes
- Do not hardcode `localhost` across server code; use these envs and helpers so CI/prod use Docker hostnames.
- Keep secrets / credentials out of this file. Add auth-related envs separately (e.g., OLLAMA_API_KEY) if required by your deployment.
