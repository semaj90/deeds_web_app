Atlas loader helper

This folder contains tooling to persist the scanner output `.tmp/atlas-component-profiles.jsonl` into Postgres.

Usage

1. Export `DATABASE_URL` in your shell (do NOT edit the repo `.env` file):

PowerShell (temporary for the session):

```powershell
$env:DATABASE_URL = 'postgresql://legal_admin:YOUR_PASSWORD@localhost:5434/legal_ai_db'
node scripts/atlas/load-profiles-to-postgres.mjs .tmp/atlas-component-profiles.jsonl
```

Unix / WSL / Git Bash:

```bash
export DATABASE_URL='postgresql://legal_admin:YOUR_PASSWORD@localhost:5434/legal_ai_db'
node scripts/atlas/load-profiles-to-postgres.mjs .tmp/atlas-component-profiles.jsonl
```

Notes
- The script will create table `atlas_component_profiles` if it does not exist.
- It upserts on `source_ref` (source id) so it is safe to re-run.
- Ensure Postgres is reachable and the role/database exist before running.
