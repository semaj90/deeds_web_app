Phase48 — Embed Svelte Diagnostics and publish to Redis

What this does

- Runs `svelte-check` (optional) or reads a saved diagnostics JSON (default: .cache/sveltecheck.json).
- For each diagnostic, creates a short text summary and obtains an embedding via the local embedding client.
- Publishes a JSON payload to Redis channel `ai:embedding:new` so the QUIC bridge / analyzer can pick it up.

Files

- scripts/phase48-embed-errors.ts — main script (Node/TS, run with `npx tsx`).
- scripts/utils/embedding-client.ts — local embedding client used by phase48.

How to run (basic)

1. (Recommended) Run the Phase49 CSS sanitiser to clear malformed selectors:
   - npx tsx scripts/phase49-sanitize-css.ts
2. Ensure dependencies are installed:
   - Node.js 18+
   - `npx tsx` is available (project already includes dev deps).
3. Run svelte-check and capture JSON (optional):
   - npx --yes svelte-check --fail-on-warnings=false --output json > .cache/sveltecheck.json
   - Or let the script run svelte-check for you via `--runCheck`.
4. Run the embedder (dry-run first):
   - npx tsx scripts/phase48-embed-errors.ts --runCheck --dryRun
   - Check console output. If dryRun=false (default), the script will publish to Redis.

Environment variables

- REDIS_URL — Redis connection string (default: redis://localhost:6379)
- PHASE48_REDIS_CHANNEL — Redis channel to publish to (default: ai:embedding:new)
- OLLAMA_URL or EMBEDDING_API_URL — Optional endpoints used by the embedding client
- PHASE48_EMBED_MODEL — Optional embedding model override passed to embedding client

Troubleshooting

- If embedding fails, check that one of the endpoints in `scripts/utils/embedding-client.ts` is reachable (Ollama at :11434 or vLLM at :8000).
- Use `--dryRun` to skip Redis publish and debug payload formation and embeddings.
- If Redis is remote, ensure network access and correct REDIS_URL.

Next steps / Integration

- Once published, the QUIC bridge (`go-microservice`) should subscribe to `ai:embedding:new` and forward payloads to the Phase47 analyzer.
- Make sure Phase47 analyzer and Docker services are up (see scripts/run-phase46.ps1). If Docker is unavailable, run the script locally and use `--dryRun` to validate the embeddings generation.
