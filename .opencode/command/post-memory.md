# OpenCode Command: Post Observation to Memory

Purpose: Send an OpenCode observation packet to the local SvelteKit memory ingestion endpoint (`/api/memory/claude-mem`).

Template (invoke from OpenCode `command` entry):

```
{
  "command": "node scripts/opencode/post-memory.mjs --file {{input_file_path}}",
  "description": "Post observation JSON file to local memory endpoint",
  "agent": "system",
  "template": "{{input_file_path}}",
  "timeout": 120000
}
```

Notes:
- The script accepts JSON object or array. It will POST an array of observations.
- By default it posts to `http://localhost:5173/api/memory/claude-mem`. Override with `MEMORY_API_URL` environment variable.
- Use this command in OpenCode workflows (e.g., after a successful analysis step) to persist observations.

Security:
- Ensure the machine firewall and claude-mem safeguards are applied (see `docs/security/CLAUDE_MEM.md`).
- The command runs locally and assumes SvelteKit dev server is accessible on `localhost:5173`.
