## ADDED Requirements

### Requirement: bifrostChat streams all inference calls
`bifrostChat()` in `sveltekit-frontend/src/lib/server/ollama.ts` SHALL send `stream: true` on every HTTP call it makes to an OpenAI-compatible chat/completions endpoint (TurboQuant direct, llama-server direct fallback, and the Bifrost gateway), and SHALL assemble the final `content` and `tool_calls` from the SSE delta stream rather than reading a single non-streamed JSON body.

#### Scenario: Gemma4 thinking phase does not truncate content
- **WHEN** `bifrostChat()` calls llama-server `:8090` for a Gemma4 model whose reasoning phase consumes a large share of the requested `max_tokens` budget
- **THEN** the assembled `content` still contains the post-thinking answer tokens, because the SSE stream is consumed until `[DONE]` rather than being bounded by a single non-streamed response that could arrive empty with `finish_reason: "length"`

#### Scenario: Bifrost gateway cache-hit metadata still recovered under streaming
- **WHEN** the Bifrost gateway (`:3040`) serves an L2 semantic cache hit for a streamed request
- **THEN** `bifrostChat()` still recovers `extra_fields.cache_debug` (`cache_hit`, `hit_type`, `similarity`) from the stream and reports it via the function's `cacheHit`/`hitType` outputs, unchanged from the non-streamed behavior

### Requirement: raw passthrough mode bypasses ACE via a direct model call
The OpenAI facade's `raw: true` request mode (`sveltekit-frontend/src/lib/server/ai/openai-facade.ts`) SHALL skip ACE context assembly and route the request through TurboQuant (if available) with a Bifrost fallback, and SHALL NOT route through the LDR (deep-research) pipeline.

#### Scenario: raw mode used for latency-isolated model benchmarking
- **WHEN** a client sends `{"raw": true, ...}` to `/api/v1/chat/completions`
- **THEN** the response is produced by `turboQuantChat()` or `bifrostChat()` directly, completing on the order of a single inference call's latency, not LDR's multi-step research/poll pipeline (which can take up to 120s)

### Requirement: TRACE tool allowlist entries reference real registered tools
`TRACE_TOOL_ALLOWLIST` in `sveltekit-frontend/src/lib/server/ai/mcp-tool-bridge.ts` SHALL only contain dotted tool names that are actually registered on `trace-mcp-server.ts` at the time of edit, verified by direct inspection of that file's `registerTool()` call sites (not assumed from documentation).

#### Scenario: model-invoked allowlisted tool resolves successfully
- **WHEN** the Gemma4 tool-calling loop invokes any tool name present in `TRACE_TOOL_ALLOWLIST`
- **THEN** the call resolves to a real, registered TRACE MCP tool rather than silently failing or no-op'ing due to a name mismatch
