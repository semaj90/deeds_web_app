# Agent runtime alignment audit — 2026-08-22

Scope: tRPC, Mastra, OpenCode, TRACE MCP Streamable HTTP, and the local llama-server OpenAI-compatible facade. This report is read-only architecture evidence; it does not authorize store mutations or protocol migrations.

## Current status

| Surface | Status | Evidence / next gate |
| --- | --- | --- |
| SvelteKit tRPC `/api/trpc` | ALIGNED_STATIC | Route uses `fetchRequestHandler`, app router, request-scoped context, and GET/POST handlers. Runtime smoke still required. |
| Mastra adapters/workflows | PRESENT_UNPROVEN | Multiple Mastra adapters/workflows and contract tests exist. Full package/runtime build remains a separate proof. |
| OpenCode → `hforf.gguf` → `http://127.0.0.1:8090/v1` | ALIGNED_LEGACY_DIALECT | Local configs use the OpenAI-compatible facade. Config is predominantly OpenCode V1 dialect; V2 migration should be explicit, not implicit. |
| llama-server OpenAI facade | CANONICALLY_ALIGNED | Current llama.cpp exposes `/v1/models`, `/v1/chat/completions`, `/v1/responses`, completions and embeddings. Live health/model/chat/tool receipt remains local runtime evidence. |
| TRACE MCP HTTP | LEGACY_STREAMABLE_HTTP | Server imports monolithic `@modelcontextprotocol/sdk` v1 transport. It is not yet proven against MCP 2026-07-28 stateless semantics. |
| MCP list caching | NOT_CURRENT_SPEC_PROVEN | 2026-07-28 list results support `ttlMs`/`cacheScope`; current repo audit client/server contracts do not prove this. |
| MCP standard routing headers | NOT_CURRENT_SPEC_PROVEN | 2026-07-28 requires `Mcp-Method` and, for named calls, `Mcp-Name`. Existing ontology probe sends a bare legacy `tools/list`. |
| `.opencode/tools` | MISSING | Current OpenCode docs still define `.opencode/tools/` as the project-local custom tool surface. MCP tools remain separate and need not be copied into this directory. |
| Active MCP ownership registry | BLOCKED | Registry parity still needs every live tool assigned owner, dispatch surface, lane, operation kind, permission and proof status. |
| `phase18_reranker` | QUARANTINED | Randomized placeholder scoring must remain non-routable until receipt-backed deterministic inference exists. |

## Important compatibility boundaries

### MCP

Do not relabel the existing TRACE server as MCP 2026-07-28 compliant merely because Streamable HTTP works. The current source imports:

- `@modelcontextprotocol/sdk/server/mcp.js`
- `@modelcontextprotocol/sdk/server/streamableHttp.js`

The current MCP v2 SDK split uses dedicated packages such as `@modelcontextprotocol/client` / `@modelcontextprotocol/server` and implements the 2026-07-28 stateless protocol. Migration must be a separately tested compatibility tranche.

Required future gates:

1. `MCP-PROTO-01`: pin protocol/SDK revision in runtime receipt.
2. `MCP-PROTO-02`: prove `Mcp-Method` header validation.
3. `MCP-PROTO-03`: prove `Mcp-Name` on `tools/call` and other named requests.
4. `MCP-CACHE-01`: prove deterministic `tools/list` ordering.
5. `MCP-CACHE-02`: prove list `ttlMs` / `cacheScope` behavior before client-side caching is enabled.
6. `MCP-TRACE-01`: propagate W3C trace context through MCP `_meta` without changing tool identity.

### OpenCode

The repo has multiple configuration surfaces (`opencode.jsonc`, `.opencode/opencode.jsonc`, and `sveltekit-frontend/opencode.json`). OpenCode merges project configs by location/precedence, so these must be audited as one effective configuration rather than independently assumed authoritative.

Current V1-style fields are intentionally not auto-migrated in this audit. A V2 migration should explicitly translate provider declarations, permission policy, MCP entries, small-model behavior and agent definitions only after the installed OpenCode binary generation is confirmed.

`.opencode/tools/` is genuinely absent, but that is only a gap for project-local OpenCode custom tools. TRACE/MCP tools should remain MCP-owned and must not be duplicated there merely to satisfy a static checker.

### llama-server / hforf.gguf

The `8090/v1` boundary is the correct protocol family for OpenCode's OpenAI-compatible provider. Keep model identity and capability claims receipt-backed:

- `/health`
- `/v1/models`
- one bounded `/v1/chat/completions` request
- one bounded tool-call request using the exact exposed model ID

Do not infer context length/tool support solely from local config when `/v1/models` or the runtime command reports something different.

## Next implementation order

1. Reconcile the local deep-audit changes into GitHub (`READ/AUDIT/PROPOSE/APPLY` classifier + report) before changing routing.
2. Build `ActiveMcpToolRegistryV1` from static registry parity + live `tools/list`, fail closed on duplicates/handler-only names/unknown ownership.
3. Add an MCP protocol-version receipt and keep the current v1 Streamable HTTP path explicit until a v2 migration passes compatibility tests.
4. Add an OpenCode effective-config audit across all project config surfaces; do not migrate to V2 until the installed CLI generation is recorded.
5. Keep `8090/v1` as the local model facade and add a bounded chat/tool smoke receipt.
6. Keep Mastra as orchestration/agent consumer; do not let it become a second tool-ownership registry.

## Non-goals

- No Postgres/Qdrant/Neo4j/Valkey writes.
- No automatic MCP v2 migration.
- No OpenCode V2 config rewrite.
- No resurrection of `phase18_reranker`.
- No duplication of MCP tools into `.opencode/tools`.
