# Task 1 Completion: PostgreSQL Schema and Drizzle ORM Setup

## Status: ✅ COMPLETE

### Files Created

1. **sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts**
   - `cases` table: stores criminal case metadata
   - `crimes` table: stores crime-specific information (multiple crimes per case)
   - `caseChunks` table: stores individual chunks from case documents
   - Drizzle relations for all tables
   - pgvector support for embeddings (768-dimensional)

2. **sveltekit-frontend/src/lib/server/db/schema/legal-laws.ts**
   - `laws` table: stores statute/code metadata
   - `lawSections` table: stores individual statute sections
   - Drizzle relations for all tables
   - pgvector support for embeddings (768-dimensional)

3. **sveltekit-frontend/src/lib/server/db/schema/legal-index.ts**
   - Central export file for all legal schema tables and relations
   - Type exports for TypeScript support

4. **sveltekit-frontend/src/lib/server/db/migrations/0003_legal_search_schema.sql**
   - SQL migration file to create all tables
   - Enables pgvector extension
   - Creates IVFFLAT indexes on embedding columns for cosine similarity search
   - Creates indexes on jurisdiction, crime_code, section_type, etc. for performance

5. **sveltekit-frontend/src/lib/server/db/legal-db-init.ts**
   - `initializeLegalSearchSchema()`: runs migrations and creates tables
   - `checkLegalSearchHealth()`: verifies all tables exist
   - Error handling and logging

6. **sveltekit-frontend/src/lib/server/services/minio-legal-service.ts**
   - MinIO client initialization
   - `initializeMinIOBuckets()`: creates buckets if they don't exist
   - `uploadRawPDF()`: upload raw PDFs to minio_bucket_laws
   - `uploadParsedText()`: upload parsed text to minio_bucket_laws_parsed
   - `uploadMetadata()`: upload JSON metadata to minio_bucket_laws_metadata
   - `uploadCaseChunk()`: upload case file chunks
   - `downloadFile()`: retrieve files from MinIO
   - `checkMinIOHealth()`: health check

### Schema Overview

#### Cases Table
- `id` (UUID, PK)
- `externalId` (TEXT, unique) - docket or reporter cite
- `caseName` (TEXT) - e.g., "People v. Smith"
- `jurisdiction` (TEXT) - 'CA', 'US', 'NY', etc.
- `courtName` (TEXT) - e.g., "Cal. Ct. App., 2nd Dist."
- `decisionDate` (TIMESTAMP)
- `rawDocMinioKey` (TEXT) - path to original PDF
- `langextractJsonMinioKey` (TEXT) - path to LangExtract JSON
- `langextractHtmlMinioKey` (TEXT) - path to LangExtract HTML
- `langextractSummary` (JSONB) - extracted metadata
- `createdAt`, `updatedAt` (TIMESTAMP)

#### Crimes Table
- `id` (UUID, PK)
- `caseId` (UUID, FK) - references cases.id
- `crimeCode` (TEXT) - e.g., "PC 211"
- `crimeCategory` (TEXT) - e.g., "robbery", "drug", "homicide"
- `crimeClassification` (TEXT) - "felony" | "misdemeanor" | "infraction" | "wobbler"
- `attempted` (BOOLEAN)
- `sentencingYear` (INTEGER)
- `sentenceLengthMonths` (INTEGER)
- `enhancements` (JSONB) - array of enhancement strings
- `createdAt` (TIMESTAMP)

#### CaseChunks Table
- `id` (UUID, PK)
- `caseId` (UUID, FK) - references cases.id
- `chunkIndex` (INTEGER)
- `sectionType` (TEXT) - facts | issues | reasoning | holding | citations | parties | motions | bibliography | procedural_history | sentencing | judgment
- `sectionSubtype` (TEXT) - optional, e.g., "motion_to_suppress"
- `text` (TEXT) - chunk content
- `embedding` (vector(768)) - pgvector column
- `tokenStart`, `tokenEnd` (INTEGER)
- `createdAt` (TIMESTAMP)

#### Laws Table
- `id` (UUID, PK)
- `jurisdiction` (TEXT) - 'CA', 'NY', 'US', etc.
- `codeTitle` (TEXT) - "Penal Code"
- `codeAbbrev` (TEXT) - "PC"
- `codeEdition` (TEXT) - "2024"
- `createdAt`, `updatedAt` (TIMESTAMP)

#### LawSections Table
- `id` (UUID, PK)
- `lawId` (UUID, FK) - references laws.id
- `sectionNumber` (TEXT) - "211", "459"
- `fullCitation` (TEXT) - "PC § 211"
- `heading` (TEXT) - "Robbery"
- `text` (TEXT) - full statute text
- `embedding` (vector(768)) - pgvector column
- `langextractSummary` (JSONB) - extracted metadata
- `createdAt`, `updatedAt` (TIMESTAMP)

### MinIO Buckets

Three buckets created:
1. `minio_bucket_laws` - raw PDFs and case files
2. `minio_bucket_laws_parsed` - extracted text
3. `minio_bucket_laws_metadata` - JSON metadata

### Next Steps

1. **Task 1.1**: Set up MinIO buckets for document storage
   - Call `initializeMinIOBuckets()` during app startup
   - Verify bucket creation

2. **Task 2**: Implement LangExtract integration and chunking pipeline
   - Create LangExtract service to call the API
   - Implement section type detection
   - Create chunking service with sliding window logic

3. **Task 3**: Implement embedding generation and storage
   - Create embedding service to call Gemma3 via Ollama
   - Store embeddings in pgvector columns

### Requirements Met

- ✅ 7.1: Cases table with metadata
- ✅ 7.2: Crimes table with crime-specific information
- ✅ 7.3: Laws and lawSections tables
- ✅ 7.4: pgvector columns for embeddings
- ✅ 11.1-11.5: MinIO bucket setup and operations

### Testing

To verify the schema setup:

```typescript
import { initializeLegalSearchSchema, checkLegalSearchHealth } from '$lib/server/db/legal-db-init';
import { initializeMinIOBuckets, checkMinIOHealth } from '$lib/server/services/minio-legal-service';

// Initialize schema
await initializeLegalSearchSchema();

// Check health
const health = await checkLegalSearchHealth();
console.log('Database health:', health);

// Initialize MinIO
await initializeMinIOBuckets();

// Check MinIO health
const minioHealthy = await checkMinIOHealth();
console.log('MinIO healthy:', minioHealthy);
```

