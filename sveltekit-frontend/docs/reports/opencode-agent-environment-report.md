# OpenCode Agent Environment

Generated: 2026-06-11T03:54:55.242Z

## Surface

- detected surface: opencode
- shell: powershell
- platform: win32/x64
- cwd: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

## Workspace

- app root: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
- repo root: C:\Users\james\Videos\deeds-web-app
- env files loaded: .env.local, .env, .env.development.local, .env.development, ..\.env.local, ..\.env
- VS Code detected: true
- VS Code workspace: ..\deeds-web-app.code-workspace
- VS Code tasks: .vscode\tasks.json, ..\.vscode\tasks.json
- OpenCode detected: true
- OpenCode config: opencode.json
- Codex detected: false

## Runtime Roles

- Gemma4 role: repo-audit-only-after-evidence
- Gemma4 base URL: http://127.0.0.1:8090
- Qdrant URL: http://127.0.0.1:6333
- Qdrant codebase collection: codebase_chunks_768
- Qdrant env collection: legal_documents
- Redis password configured: true

## Guardrails

- repo-evidence-first
- regular-opencode-in-vscode-is-the-primary-agent-surface
- opencode-bootstrap-is-an-optional-context-refresh-not-the-entrypoint
- kanban-is-persistent-task-registry
- recommendations-are-append-only-inbox
- gemma4-is-local-orchestration-synthesis-only
- do-not-use-gemma4-for-generic-model-advice
- prefer-sse-browser-edge-until-transport-proof-changes

## Next Commands

- refreshTasks: `npm run opencode:tasks:refresh`
- optionalContextRefresh: `npm run opencode:bootstrap`
- productionReadiness: `npm run atlas:production-readiness`
- liveServiceEnv: `npm run atlas:live-service-env`
