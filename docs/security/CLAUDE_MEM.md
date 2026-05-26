**CLAUDE-MEM: Risk, necessity, and safeguards**

- **What it is:** claude-mem is a local personal-memory service that stores observations and exposes an HTTP API (default port 37777) for reading/writing local notes and settings.
- **Risk:** A February 2026 community security audit rated it HIGH risk because the API is unauthenticated by default. Any local process or user on the machine can query or modify stored observations.

Do we need it?
- For most development and production workflows: no. The feature is convenience for personal note-taking and local assistants. It is not required by the codebase.
- If you use it for private development experiments and are comfortable isolating it (VM/container, no production data), it's acceptable with controls.

Immediate safeguards (recommended)
1. Block the port when not actively using claude-mem: see `scripts/security/block-claude-mem.ps1`.
2. Run the monitor if you want continuous detection: `scripts/security/monitor-claude-mem.ps1` (optional `-AutoKill`).
3. Run claude-mem inside a VM or container and do not expose port 37777 to the host. This is the safest approach.
4. If you must run it on-host and access it locally, place a reverse proxy with TLS+auth in front of it (nginx/Caddy) and bind the proxy to `localhost` only.
5. Limit file permissions on claude-mem storage (owner-only) and enable disk encryption for sensitive data.
6. For this repo, use the OpenCode bridge documented in `docs/architecture/opencode-claude-mem-bridge.md` instead of treating SQLite as canonical.
7. Keep feature-labeling and semantic-indexing lanes separate from the memory bridge; use `docs/operations/stack-audit-playbook.md` to audit them in order.

Operational checks
- Inspect whether claude-mem is running: `netstat -ano | findstr 37777` (Windows) and check process owners.
- Inspect data directory (refer to your claude-mem config) and ensure only the intended user can read it.

Longer-term
- Prefer tools that enable auth/TLS or support socket-only mode.
- Open an upstream issue requesting auth-by-default and a socket-only mode.

Quick commands
```powershell
# Block port
.\scripts\security\block-claude-mem.ps1 -Action Block

# Kill running listener (one-off)
.\scripts\security\block-claude-mem.ps1 -KillListener

# Monitor continuously and auto-kill
.\scripts\security\monitor-claude-mem.ps1 -Loop -AutoKill
```

If you want, I can:
- run the firewall block on this machine now (I can execute the PowerShell command), or
- add an example nginx proxy config and a small script to run it in WSL, or
- search the repo/config for any references to claude-mem storage paths and surface them.
