Backfilling embedding_768 (embeddinggemma)

1. Apply the migration that adds the `embedding_768` column:

   $env:PGPASSWORD='123456'; psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -f src/lib/server/db/migrations/007_add_embedding_768_and_backfill_instructions.sql

2. Start Ollama (embedding service) at `http://localhost:11434` and confirm it is reachable.

3. Run the backfill script (from repo root):

   node sveltekit-frontend/scripts/backfill_embedding_768.mjs

   You can adjust batch size with `BATCH_SIZE` and the model with `EMBEDDING_MODEL` environment variable.

4. Verify by running nearest neighbor queries against `embedding_768`:

   $env:PGPASSWORD='123456'; psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "SELECT id, content, embedding_768 <-> '[<vec>]' as dist FROM public.vector_embeddings WHERE embedding_768 IS NOT NULL ORDER BY dist ASC LIMIT 10;"

5. When satisfied, optionally rename/swap columns following the instructions in the migration file.
