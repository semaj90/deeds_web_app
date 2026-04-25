Production Message Format & Streaming Contract

Purpose
- Define the client/server message schema and framing rules for realtime LLM streaming across transports (WebTransport / WebSocket / HTTP POST fallback).

Framing choices
- NDJSON (newline-delimited JSON) is simple and works across WebTransport unidirectional streams and WebSocket text frames.
- Alternative is length-prefixed binary (more efficient). Start simple with NDJSON and move to length-prefix only if perf requires it.

Message envelope (common fields)
- type: string — message type, e.g. 'token', 'response_start', 'response_end', 'handshake', 'error', 'typing', 'connected', 'batch', 'document_upload', 'tts_chunk'
- sessionId: string — client session identifier
- requestId: string — id for the LLM request/response pair
- clientId: string — client unique id
- payload: object — type-specific payload
- timestamp: ISO8601 string (optional)

Example token chunk (NDJSON line)
{
  "type": "token",
  "sessionId": "sess-123",
  "requestId": "req-456",
  "clientId": "client_abc",
  "payload": { "token": "the", "isFinal": false }
}

Response start/end control
{
  "type": "response_start",
  "requestId": "req-456",
  "payload": { "model": "gemma3-legal", "metadata": { "gpu": true } }
}

{
  "type": "response_end",
  "requestId": "req-456",
  "payload": { "status": "complete", "tokenCount": 42 }
}

Error format
{
  "type": "error",
  "requestId": "req-456",
  "payload": { "code": "model_timeout", "message": "inference timed out" }
}

Control messages
- handshake: client identifies itself after connection
- typing: server signals assistant is typing
- batch: client sends batch items
- document_upload: client notifies server of uploaded doc content/embeddings

Transport specifics
- WebTransport: use unidirectional incoming streams for server->client token chunks; send client->server control messages via unidirectional streams or datagrams.
- WebSocket: use text frames containing NDJSON lines. Server may also send binary frames if using length-prefix.
- HTTP POST fallback: client POSTs to /api/realtime/send with JSON payload; server responds with full response (no streaming).

Reconnection & resumability
- Clients should include sessionId and requestId on reconnect. The server can use Redis Streams keyed by requestId to replay tokens from a point.
- Use an ack/token-index mechanism if you need precise resume points.

Server-side requirements
- Provide both streaming and non-streaming endpoints. Streaming endpoints must support NDJSON or preferrably HTTP/3 WebTransport.
- Provide a POST fallback endpoint: /api/realtime/send which accepts the same JSON envelope and returns the final response.

Security
- Require TLS for WebTransport. Use auth tokens as appropriate in the handshake payload.

Backward compatibility
- Keep WebSocket and HTTP POST compatible with the same JSON envelope so the frontend needs minimal logic to switch transports.
