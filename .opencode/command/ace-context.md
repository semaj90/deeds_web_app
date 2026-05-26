# ACE Context — OpenCode Command

Purpose
- Build a compact ACE/OpenCode feature map for the repo's env/module surface and runtime dependencies.

Usage
- From repo root run:

  node scripts/opencode/get-ace-context.mjs

- Output: `.opencode/ace-context.json` (also printed to stdout).

What it collects
- `envVars`: keys found in `.env`, `.env.example`, `.env.local`
- `ownerFiles`: files referencing runtime envs (Qdrant, Redis, Ollama, Postgres, Seaweed, MinIO, Turbo)
- `runtimeServices`: quick parse from RUNTIME_MATRIX.md if present
- `packageScripts`: `package.json` scripts
- `mcpToolFiles`: files that mention MCP/TRACE or mcp server wiring
- `storageLane` / `retrievalLane`: inferred storage and retrieval systems
- `dynamicHealth`: probe heuristics (presence of env vars)
- `missingPieces` / `nextSteps`: human-friendly guidance

Next actions (recommended)
- Run the script and inspect `.opencode/ace-context.json`.
- Verify and update any discovered env keys that are secrets (do not commit secrets).
- If Redis is available and writable, publish the JSON to `ace:opencode:context:<hash>` for downstream OpenCode tasks.

Notes
- The script uses a simple heuristic scan (regex) and is intentionally conservative — review the output before trusting automatic wiring.
- Excludes `node_modules`, `.git`, `dist`, and `vendor` directories.
