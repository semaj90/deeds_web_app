Postgres runbook — create role & database for Atlas loader

Purpose

Create a dedicated Postgres role and database for loading the atlas scanner output without editing repository .env files.

Preflight checks

- Ensure Postgres is listening on the expected port (default here: 5434).
- You must have a superuser account (commonly `postgres`) or Docker access to run creation commands.
- Do NOT commit secrets to the repo; set `DATABASE_URL` only in your shell when running the loader.

Verify connectivity (PowerShell)

```powershell
Test-NetConnection -ComputerName localhost -Port 5434
```

Create role/database using local `psql` (PowerShell / Git Bash / WSL)

PowerShell example:

```powershell
$env:PGPASSWORD = 'POSTGRES_SUPER_PASS'
psql -h localhost -p 5434 -U postgres -c "CREATE ROLE legal_admin WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASS';"
psql -h localhost -p 5434 -U postgres -c "CREATE DATABASE legal_ai_db OWNER legal_admin;"
psql -h localhost -p 5434 -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE legal_ai_db TO legal_admin;"
```

Docker/container example:

```powershell
docker exec -i legal-ai-postgres psql -U postgres -c "CREATE ROLE legal_admin WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASS';"
docker exec -i legal-ai-postgres psql -U postgres -c "CREATE DATABASE legal_ai_db OWNER legal_admin;"
```

Verify the new role and database

```powershell
$env:PGPASSWORD = 'REPLACE_WITH_STRONG_PASS'
psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "\l"
psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "\dt"
```

Test loader script (temporary env only)

```powershell
$env:DATABASE_URL = 'postgresql://legal_admin:REPLACE_WITH_STRONG_PASS@localhost:5434/legal_ai_db'
node scripts/atlas/load-profiles-to-postgres.mjs .tmp/atlas-component-profiles.jsonl
```

Troubleshooting

- `psql: could not connect to server` — ensure Postgres container is running and port 5434 is mapped.
- `role "postgres" does not exist` — your superuser may have another name; check docker-compose or environment.
- Permission errors — run the `CREATE` commands as the superuser (inside container if necessary).

Cleanup and security

- Use a strong password for `legal_admin` and rotate it via your secrets manager if this machine is shared.
- Do NOT add `DATABASE_URL` to the repository `.env` files. Keep it in your shell or in an operator-only secrets store.
