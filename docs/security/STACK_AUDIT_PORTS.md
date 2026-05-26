**Stack Audit: Service Ports & Listener Mapping**

Purpose
- Inventory the local dev stack ports and provide a checklist for auditing listeners and transport drift.

Common services (dev environment)
- SvelteKit dev server: `localhost:5173` (app + API routes)
- Ollama (bifrost / embedding): `localhost:11434` or configured `OLLAMA_BASE_URL`
- TurboQuant / llama-server HTTP: `localhost:8090` (TurboQuant chat/generate)
- OpenCode sidecars (MCP sidecars): `localhost:8791`, `:8792`, `:8793` (turbovec, engram, langextract)
- Qdrant: `localhost:6333`
- Redis: `localhost:6379`
- Postgres: `5432` (inside Docker container)
- SeaweedFS S3 gateway: `8333` (if used)
- SeaweedFS master: `9333` and filer `8382`
- Hermes gateway: `:8642` (project-specific)
- Hermes dashboard: `:9119`
- Claude-Mem (insecure local memory): `localhost:37777` (unauthenticated by default)

Audit checklist
1. Enumerate listeners locally:

```powershell
# Windows
netstat -ano | findstr LISTENING

# Filter for relevant ports
netstat -ano | findstr "5173 8090 8095 11434 8791 8792 8793 6333 6379 37777"
```

2. For each listener: identify process, user, and binary path

```powershell
Get-Process -Id <PID> | Select-Object Id, ProcessName, Path
```

3. Verify service health endpoints (where applicable):

```bash
curl -sS http://localhost:5173/api/health
curl -sS http://localhost:6333
curl -sS http://localhost:11434/api/status
```

4. Validate transport compatibility
- For MCP/TurboVec tools, ensure transports are the expected type (SSE vs HTTP vs stdio). See `.vscode/tasks.json` and `opencode.json` tool configs.

5. Detect unexpected unauthenticated listeners (critical)
- If any listener is unauthenticated and accepts external connections (0.0.0.0), block or bind to localhost immediately.

6. Record changes and add them to `docs/security/STACK_AUDIT_PORTS.md` alongside your release notes.

Automated checks (suggested)
- Add a CI/dev script `scripts/audit/ports-check.ps1` that runs `netstat`, resolves PIDs, and compares against a whitelist. Fail the audit if unknown listeners appear.

Next steps
- I can add the `ports-check.ps1` script to `scripts/audit/` and wire it to a VS Code task if you want. I can also run it now and report current listeners (if you want me to run commands on your machine).
