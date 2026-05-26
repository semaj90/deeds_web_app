# Bifrost + Firecrawl Programming Reference

Last updated: 2026-05-22

This file keeps external programming docs and local codebase mappings in one place for troubleshooting and implementation work.

## External Docs (Web-Fetched)

### Bifrost

- Repo: https://github.com/maximhq/bifrost
- Gateway setup: https://docs.getbifrost.ai/quickstart/gateway/setting-up
- Semantic caching: https://docs.getbifrost.ai/features/semantic-caching
- Retries and fallbacks: https://docs.getbifrost.ai/features/retries-and-fallbacks
- MCP overview: https://docs.getbifrost.ai/mcp/overview
- Full docs index for agents: https://docs.getbifrost.ai/llms.txt

### Firecrawl

- Docs home: https://docs.firecrawl.dev/
- Full docs index for agents: https://docs.firecrawl.dev/llms.txt
- MCP server docs: https://docs.firecrawl.dev/mcp-server

Note: No separate "aicrawl" official docs were discovered in this pass. Firecrawl is the crawler integration visible in this repo.

## External Facts To Reuse

### Bifrost gateway

- OpenAI-compatible endpoint: `POST /v1/chat/completions`
- Typical local port in docs/examples: `8080`
- This repo uses `3040` for Bifrost health and runtime.

### Bifrost retries and fallback

- Retries are configured per provider in `network_config`.
- Backoff is exponential with jitter.
- Fallback chain is sequential; each provider gets its own retry budget.

### Bifrost timeout setting (critical)

- Timeout errors mention provider `network_config` and `default_request_timeout_in_seconds`.
- If provider timeout is lower than client smoke timeout, strict smokes can fail even when models are healthy.

### Bifrost semantic cache

- Cache key is required for cache activation.
- Dual-layer cache supports direct hash and semantic similarity.
- Per-request controls include cache type, TTL, threshold, and no-store behavior.

### Firecrawl

- Supports search, scrape, and interact flows via API.
- Agent-oriented docs provide `llms.txt` index and MCP server integration path.

## Codebase Mapping (rg Snapshot)

### Bifrost strict smoke and diagnostics

- `sveltekit-frontend/scripts/bifrost/smoke-card-context.mjs`
  - warmup support
  - provider-timeout mismatch diagnosis
  - strict/fail-open report output

### Bifrost runtime paths

- `sveltekit-frontend/src/lib/server/ollama.ts`
- `sveltekit-frontend/src/lib/server/ai/openai-facade.ts`
- `sveltekit-frontend/src/lib/server/cache/README.md`
- `sveltekit-frontend/src/routes/api/cache/bifrost/check/+server.ts`
- `sveltekit-frontend/src/routes/api/cache/bifrost/store/+server.ts`

### Firecrawl integration in repo

- `sveltekit-frontend/src/lib/server/analytics/unified-research-query.ts`
  - uses `@mendable/firecrawl-js`
  - falls back to HTML path if needed
  - keys off `ENV.FIRECRAWL_API_KEY`

## Practical Troubleshooting Playbook

### 1) Confirm Bifrost is up

- `curl http://127.0.0.1:3040/health`
- `curl http://127.0.0.1:3040/v1/models`

### 2) Warm model before strict smoke

- Run a tiny completion against requested model first.

### 3) Run strict warm gate

- `npm run bifrost:cards:smoke:strict:warm:gate`

### 4) Diagnose timeout mismatch

- Check `providerTimeoutDiagnosis` in strict report.
- If `mismatch=true`, raise provider `default_request_timeout_in_seconds` in Bifrost provider network config.

### 5) Validate report artifact

- `sveltekit-frontend/docs/reports/bifrost-cards-smoke-latest.json`

## Operational Notes For This Repo

- Keep Bifrost docs and Firecrawl docs indexed via their `llms.txt` URLs.
- Prefer the local strict smoke report as the first source of truth for lane status.
- Treat the provider timeout mismatch as configuration debt, not app logic failure.
