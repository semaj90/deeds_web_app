# Backfill embedding_384 (README)

This document describes how to safely add and backfill a 384-dimensional embedding column `embedding_384` on `public.vector_embeddings`.

Pre-reqs
- PostgreSQL with `pgvector` extension installed and reachable (defaults to postgres://legal_admin:123456@localhost:5432/legal_ai_db)
- Ollama (or other embedding service) reachable at `http://localhost:11434` and a model that produces 384-dim embeddings
- Node.js (to run the backfill script)

Files
- `src/lib/server/db/migrations/008_add_embedding_384_and_backfill_instructions.sql` - migration to add `embedding_384` and an ivfflat index
- `sveltekit-frontend/scripts/backfill_embedding_384.mjs` - Node script to backfill rows in batches

Run steps

1) Backup the DB

```powershell
$env:PGPASSWORD='123456'
pg_dump -h localhost -p 5432 -U legal_admin -Fc legal_ai_db -f "backup_legal_ai_db_before_embedding_384.dump"
```

2) Apply the migration (either via psql -f on the migration file, or run the ALTER/CREATE commands manually)

```powershell
$env:PGPASSWORD='123456'
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -f src/lib/server/db/migrations/008_add_embedding_384_and_backfill_instructions.sql
```

3) Confirm the column exists

```powershell
$env:PGPASSWORD='123456'
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "\d+ public.vector_embeddings"
```

4) Start Ollama (or ensure your embedding endpoint is running)

5) Run the backfill script

```powershell
Set-Location 'C:\Users\james\Videos\deeds-web-app'
$env:DATABASE_URL = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
$env:OLLAMA_URL = "http://localhost:11434"
$env:EMBEDDING_MODEL = "embeddinggemma-384:latest" # or your model
$env:BATCH_SIZE = "100"
$env:PAUSE_MS = "100"

node sveltekit-frontend/scripts/backfill_embedding_384.mjs
```

6) Verify counts and dims

```powershell
$env:PGPASSWORD='123456'
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "SELECT count(*) AS total, count(embedding_384) FILTER (WHERE embedding_384 IS NOT NULL) AS backfilled FROM public.vector_embeddings;"
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "SELECT vector_dims(embedding_384) FROM public.vector_embeddings WHERE embedding_384 IS NOT NULL LIMIT 10;"
```

7) Test a NN query

```powershell
$env:PGPASSWORD='123456'
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "WITH sample AS (SELECT embedding_384 FROM public.vector_embeddings WHERE embedding_384 IS NOT NULL LIMIT 1) SELECT id, document_id, content, embedding_384 <-> (SELECT embedding_384 FROM sample) as dist FROM public.vector_embeddings WHERE embedding_384 IS NOT NULL ORDER BY dist ASC LIMIT 5;"
```

8) (Optional) Swap/rename columns when ready

See the migration file for swap/rename instructions. Always keep the original column until you're satisfied with results and have backups.
