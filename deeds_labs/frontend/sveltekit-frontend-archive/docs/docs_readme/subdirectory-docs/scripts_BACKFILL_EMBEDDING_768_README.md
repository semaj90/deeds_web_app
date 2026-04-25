# BACKFILL_EMBEDDING_768_README.md

## Migration and Backfill Instructions for 768-dim Embeddings

### 1. Apply the Migration

Apply the migration to add the `embedding_768` column and index:

```sh
psql -U legal_admin -d legal_ai_db -f src/lib/server/db/migrations/009_add_embedding_768_and_backfill_instructions.sql
```

Or use your preferred migration tool.

### 2. Run the Backfill Script

Set environment variables as needed, then run:

```sh
$env:DATABASE_URL = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
$env:OLLAMA_URL = "http://localhost:11434"
$env:EMBEDDING_MODEL = "embeddinggemma:latest"
$env:BATCH_SIZE = "100"
$env:PAUSE_MS = "100"
node sveltekit-frontend/scripts/backfill_embedding_384.mjs
```

> **Note:** The script now backfills `embedding_768` using the 768-dim model.

### 3. Verify Results

Check that the new column is populated and has the correct dimension:

```sql
SELECT count(*) FROM public.vector_embeddings WHERE embedding_768 IS NOT NULL;
SELECT vector_dims(embedding_768) FROM public.vector_embeddings WHERE embedding_768 IS NOT NULL LIMIT 10;
```

### 4. (Optional) Swap Columns

Once verified, you may rename columns as needed:

```sql
ALTER TABLE public.vector_embeddings RENAME COLUMN embedding TO embedding_1536;
ALTER TABLE public.vector_embeddings RENAME COLUMN embedding_768 TO embedding;
```

### 5. Clean Up

Drop or recreate indexes as needed for the new `embedding` column.

---

**This process aligns your DB with the 768-dim output of `embeddinggemma:latest` and unblocks your RAG pipeline.**
