Mini integration test: MinIO + Redis + optional Postgres

Purpose
-------
Quick script to validate that your dev stack can accept MinIO uploads and talk to Redis. Optionally checks Postgres for the `documents` table.

Files added
- `scripts/test-minio-redis.js` — Node script that uploads a tiny object to MinIO, downloads it, and performs Redis PING/SET/GET. If `POSTGRES_URL` is set it will query `information_schema` for the `documents` table.
- `drizzle/20251012_create_documents_table.sql` — idempotent migration to create a `documents` table with a UUID PK and a `vector(1536)` column.

Usage
-----
Copy environment variables to a `.env` or export them in your shell. Minimal set:

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=test-bucket
MINIO_USE_SSL=false

REDIS_URL=redis://localhost:6379

# optional
POSTGRES_URL=postgresql://legal_admin:testpass123@localhost:5434/legal_ai_test

Run the script from the `sveltekit-frontend` folder:

```powershell
node scripts/test-minio-redis.js
```

Exit codes
- 0 : all checks passed
- 2 : one or more integration checks failed
- 3 : unexpected error

Notes
-----
- The script needs the `minio`, `redis`, and `pg` npm packages. Install them in the `sveltekit-frontend` workspace:

```powershell
npm install minio redis pg
```

- The migration file uses `vector(1536)` — adjust the dimension to match your embedding model.
