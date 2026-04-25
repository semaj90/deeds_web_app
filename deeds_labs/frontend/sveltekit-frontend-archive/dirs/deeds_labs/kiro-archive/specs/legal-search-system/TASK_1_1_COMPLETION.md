# Task 1.1 Completion: Set up MinIO Buckets for Document Storage

## Status: ✅ COMPLETE

### Files Created

1. **sveltekit-frontend/src/lib/server/init/legal-search-init.ts**
   - `initializeLegalSearchSystem()`: orchestrates database and MinIO initialization
   - `isLegalSearchInitialized()`: checks if system is initialized
   - `checkLegalSearchSystemHealth()`: comprehensive health check
   - Runs during app startup

2. **.kiro/specs/legal-search-system/SETUP_GUIDE.md**
   - Complete setup instructions for Docker Desktop
   - Environment variables configuration
   - Docker Compose configuration with all services
   - Ollama model setup
   - Verification steps
   - Troubleshooting guide

### MinIO Buckets Created

Three buckets are automatically created during initialization:

1. **`minio_bucket_laws`** - Raw documents
   - Stores original PDFs and case files
   - Key format: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.pdf`
   - Case files: `cases/{jurisdiction}/{caseId}/chunk_{index}.pdf`

2. **`minio_bucket_laws_parsed`** - Extracted text
   - Stores parsed text from documents
   - Key format: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.txt`
   - Case files: `cases/{jurisdiction}/{caseId}/chunk_{index}.txt`

3. **`minio_bucket_laws_metadata`** - JSON metadata
   - Stores LangExtract output and crime metadata
   - Key format: `{jurisdiction}/{codeAbbrev}/{sectionNumber}.json`
   - Case files: `cases/{jurisdiction}/{caseId}/chunk_{index}.json`

### MinIO Service Functions

From `minio-legal-service.ts`:

- `initializeMinIOBuckets()` - Creates all three buckets
- `uploadRawPDF()` - Upload raw PDF documents
- `uploadParsedText()` - Upload extracted text
- `uploadMetadata()` - Upload JSON metadata
- `uploadCaseChunk()` - Upload case file chunks
- `downloadFile()` - Retrieve files from MinIO
- `checkMinIOHealth()` - Health check

### Docker Services

The Docker Compose setup includes:

1. **PostgreSQL 15** with pgvector
   - Port: 5432
   - Database: legal_search
   - User: postgres / postgres

2. **MinIO**
   - API Port: 9000
   - Console Port: 9001
   - User: minioadmin / minioadmin

3. **Qdrant** (vector database)
   - Port: 6333

4. **Elasticsearch**
   - Port: 9200

5. **Redis**
   - Port: 6379

6. **RabbitMQ**
   - AMQP Port: 5672
   - Management Port: 15672

7. **Ollama** (optional, can run locally)
   - Port: 11434

### Integration with App Startup

Add to `src/hooks.server.ts`:

```typescript
import { initializeLegalSearchSystem } from '$lib/server/init/legal-search-init';

export async function handle({ event, resolve }) {
  try {
    await initializeLegalSearchSystem();
  } catch (error) {
    console.error('Failed to initialize legal search system:', error);
  }
  return resolve(event);
}
```

### Health Check Endpoint

Create `src/routes/api/health/legal-search/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import { checkLegalSearchSystemHealth } from '$lib/server/init/legal-search-init';

export async function GET() {
  const health = await checkLegalSearchSystemHealth();
  return json(health);
}
```

Response:
```json
{
  "initialized": true,
  "database": {
    "healthy": true,
    "tables": {
      "cases": true,
      "crimes": true,
      "case_chunks": true,
      "laws": true,
      "law_sections": true
    }
  },
  "minio": true,
  "healthy": true
}
```

### Startup Checklist

- [ ] Create `.env.local` with environment variables
- [ ] Run `docker-compose up -d` to start services
- [ ] Pull Ollama models: `docker exec legal-search-ollama ollama pull embeddinggemma:latest`
- [ ] Add initialization code to `src/hooks.server.ts`
- [ ] Create health check endpoint
- [ ] Visit `http://localhost:5173/api/health/legal-search` to verify
- [ ] Access MinIO console at `http://localhost:9001`

### Requirements Met

- ✅ 11.1: MinIO buckets created (minio_bucket_laws, minio_bucket_laws_parsed, minio_bucket_laws_metadata)
- ✅ 11.2: Bucket policies and lifecycle rules (via Docker Compose)
- ✅ 11.3: minio-legal-service.ts for bucket operations
- ✅ 11.4: Document storage organized by jurisdiction/code/section
- ✅ 11.5: Case file storage with chunk indexing

### Next Steps

1. **Task 2**: Implement LangExtract integration and chunking pipeline
   - Create LangExtract service to call the API
   - Implement section type detection and validation
   - Create chunking service with sliding window logic

2. **Task 3**: Implement embedding generation and storage
   - Create embedding service to call Gemma3 via Ollama
   - Implement batch embedding with caching
   - Store embeddings in PostgreSQL pgvector columns

3. **Task 4**: Set up Qdrant collection and indexing
   - Create Qdrant collections for case_chunks and law_sections
   - Configure HNSW indexing with cosine distance
   - Implement Qdrant indexing service

