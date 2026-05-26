**OpenCode Post-Memory Plugin (post-memory.mjs)**

Overview
- Location: `scripts/opencode/post-memory.mjs`
- Purpose: small CLI helper that POSTs a JSON observation (object or array) to the local SvelteKit memory endpoint: `/api/memory/claude-mem`.
- Usage modes: pass `--file <path>` or pipe JSON to stdin.

What it installs / dependencies
- No global install required. The script uses `node` and `node-fetch`.
- When run via `npx`/OpenCode, OpenCode will spawn Node and execute the script — `npx` itself does not install system packages like `nginx`.

How it works
1. Reads input (file or stdin).
2. Validates JSON (must be object or array).
3. Wraps single object into an array and POSTs to `MEMORY_API_URL` (env override), default `http://localhost:5173/api/memory/claude-mem`.
4. Prints HTTP status and response body.

OpenCode integration
- Command template provided at `.opencode/command/post-memory.md` — use the `command` entry to call the script from an OpenCode workflow after generating an observation packet.

OpenCode packet shape
- Keep the packet explicit and compact:
  - `goal`
  - `context`
  - `files`
  - `constraints`
  - `mcp`
  - `plan`
- The helper should receive a JSON file or stdin payload that already contains the observation fields required by `/api/memory/claude-mem`.
- Do not send raw code dumps in prompt-cache prefixes.
- If you need a higher-level synthesis, write it separately to `llm_synthesis` as a sanitized summary, not as a raw observation payload.

Feature labeling and mapping (do not break things)
- Label: `memory.post` — this feature emits `observation` objects.
- Contract: `observation` JSON must contain at minimum `summary` and `observation_id` (string). The ingestion endpoint expects an array of observation objects.
- `llm_synthesis` is a separate downstream lane for agentic-thinking summaries, not a replacement for the observation packet.
- If you change the contract, update:
  - `scripts/opencode/post-memory.mjs`
  - `src/routes/api/memory/claude-mem/+server.ts`
  - `src/routes/api/memory/agent-observation/+server.ts`
  - `docs/architecture/opencode-claude-mem-bridge.md`

Security notes
- The script assumes local `MEMORY_API_URL` is reachable and that the machine's network policies are enforced. See `docs/security/CLAUDE_MEM.md` for mitigation guidance.

Maintenance
- Keep the script small and dependency-free. If you need advanced retry/auth features, wrap it in a small TypeScript module and add tests.
