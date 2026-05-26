# Bifrost Official Reference (Gateway + Cache + MCP)

This note captures key Bifrost behavior from official docs and maps it to this repository's usage.

## Official Sources

- https://github.com/maximhq/bifrost
- https://docs.getbifrost.ai/quickstart/gateway/setting-up
- https://docs.getbifrost.ai/features/semantic-caching
- https://docs.getbifrost.ai/features/retries-and-fallbacks
- https://docs.getbifrost.ai/mcp/overview

## Quick Start Facts (Official)

- Start locally:
  - `npx -y @maximhq/bifrost`
  - `docker run -p 8080:8080 maximhq/bifrost`
- OpenAI-compatible endpoint:
  - `POST /v1/chat/completions`
- Web UI default:
  - `http://localhost:8080`
- Default app data directory:
  - Linux/macOS: `~/.config/bifrost`
  - Windows: `%APPDATA%\\bifrost`

## Caching Model (Official)

- Dual-layer behavior:
  - direct hash cache
  - semantic similarity cache
- Semantic cache requires a vector store and a cache key to activate.
- Per-request controls include:
  - cache type
  - TTL
  - threshold
  - no-store behavior
- Direct-only mode is supported with `dimension: 1` and no provider config.

## Retry/Fallback Model (Official)

- Retries run with exponential backoff and jitter.
- `429` can rotate API keys when multiple provider keys are configured.
- Fallback providers are attempted after primary retries are exhausted.
- Each provider in the fallback chain gets its own retry budget.

## MCP Model (Official)

- Bifrost can act as:
  - MCP client (connect to MCP servers)
  - MCP server (expose tools)
- Default safety model is explicit tool execution.
- Tool calls are suggestions first, then your app executes approved calls.

## Repository Mapping

- Boundary hardening and direct-call assertions:
  - `src/lib/server/ollama.ts`
  - `src/lib/server/ace/gemma4-codeintel.ts`
  - `src/lib/server/ace/ace-error-kag.ts`
  - `src/lib/server/audit/gemma-tool-router.ts`
- Boundary audit and regression baseline:
  - `scripts/tests/enforce-bifrost-boundary.mjs`
  - `scripts/tests/bifrost-boundary-baseline.json`
- Route-level Bifrost cache APIs:
  - `src/routes/api/cache/bifrost/check/+server.ts`
  - `src/routes/api/cache/bifrost/store/+server.ts`

## Local Operational Notes

- For this codebase, synthesis should stay behind Bifrost paths unless a direct capability is explicitly allowlisted and asserted.
- Keep direct-call regression checks active in CI and local preflight.
- Cache behavior should remain observable in route outputs and audit artifacts.
