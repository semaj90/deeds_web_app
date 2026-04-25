## Migration runner

This is a tiny development migration runner that executes all .sql files found under
`src/lib/server/db` in lexicographic order against the Postgres instance pointed to by
`DATABASE_URL`.

Usage (PowerShell):

```powershell
$env:DATABASE_URL = 'postgres://user:pass@localhost:5432/dbname'
node scripts/migrate.js
```

Notes:

- Intended for development and testing. For production use a proper migration tool (drizzle-kit,
  Flyway, Liquibase, etc.).
- SQL files should be idempotent (use IF NOT EXISTS / IF NOT EXISTS clauses).
