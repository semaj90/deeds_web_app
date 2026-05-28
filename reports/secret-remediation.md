# Secret Remediation Report

Summary:
- Removed hard-coded secrets from repository configuration files.
- Added `.env.local.example` as a template for local secrets.
- Updated `.gitignore` to ignore local `.env` files while keeping example files tracked.
- Replaced plaintext credentials in `.mcp.json` with environment-variable placeholders.

Files changed:
- `.gitignore` — added rules to ignore `.env` and related local env files.
- `.mcp.json` — replaced inline `DATABASE_URL` / `NEO4J_PASSWORD` with `${...}` placeholders.
- `.env.local.example` — new example file for local env values.

Actions required (operator):
1. Rotate any credentials that were present in the repository or CI systems.
2. Do NOT paste rotated secrets into VCS. Store them in local `.env.local` (gitignored) or in your secret manager.
3. After rotation, export `DATABASE_URL` locally and run export/updater scripts as needed.

Runbook (quick):
- To set local DB URL in PowerShell before running exporter:
  $env:DATABASE_URL = "postgresql://legal_admin:<new-password>@localhost:5434/legal_ai_db"

- To run atlas export (dry-run preferred):
  cd sveltekit-frontend
  npm run atlas:cards-for-weights -- --dry

Notes:
- No secret values are present in this report.
- If you need help rotating credentials in Docker/Postgres, I can provide step-by-step commands.
