# Phase 1: Prepare - Execution Plan

## Status: IN PROGRESS ✅

**Duration**: 1 day
**Start Date**: November 29, 2025
**Target Completion**: November 30, 2025

---

## Phase 1 Overview

Phase 1 focuses on fixing TypeScript/Svelte errors, setting up external services, and creating database migrations.

### Tasks
1. Fix TypeScript/Svelte 5 errors
2. Set up external services
3. Create database migrations
4. Update environment variables
5. Verify setup

---

## Task 1: Fix TypeScript/Svelte 5 Errors

### Duration: 2-3 hours

### Step 1.1: Fix tsconfig.json

**Issue**: ES2023 is not a valid target

**Fix**:
```json
{
  "compilerOptions": {
    "target": "ES2022",  // Changed from ES2023
    "lib": ["DOM", "DOM.Iterable", "ES2022"],  // Changed from ES2023
    // ... rest of config
  }
}
```

### Step 1.2: Update Svelte Components

**Pattern 1: Convert let to $state()**
```svelte
<!-- Before -->
<script lang="ts">
  let count: number = 0;
  let user: User | null = null;
</script>

<!-- After -->
<script lang="ts">
  let count = $state(0);
  let user = $state<User | null>(null);
</script>
```

**Files to Update**:
- `sveltekit-frontend/src/routes/+layout.svelte`
- `sveltekit-frontend/src/routes/+error.svelte`
- `sveltekit-frontend/src/routes/(tools)/search/+page.svelte`
- `sveltekit-frontend/src/routes/(legal)/legal-cases/+page.svelte`
- `sveltekit-frontend/src/routes/(tools)/report-builder/+page.svelte`

### Step 1.3: Update bits-ui v2 Components

**Pattern 1: Button Component**
```svelte
<!-- Before -->
<Button on:click={handleClick}>Click me</Button>

<!-- After -->
<Button.Root onclick={handleClick}>Click me</Button.Root>
```

### Step 1.4: Run Verification

```bash
npm run check:typescript
npm run check
npm run lint
npm run format
```

**Expected Output**: No errors

---

## Task 2: Set Up External Services

### Duration: 2-3 hours

### Step 2.1: Google Custom Search API

**Setup**:
1. Go to https://console.cloud.google.com/
2. Create new project
3. Enable Custom Search API
4. Create API key
5. Create custom search engine at https://cse.google.com/cse/

**Configuration**:
```bash
# .env.development
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_engine_id_here
```

### Step 2.2: Gemma3 VLM

**Option A: Local Installation**
```bash
# Download Gemma3 VLM model
ollama pull gemma3-vlm

# Verify installation
ollama list
```

**Option B: Remote Service**
```bash
# Configure remote endpoint
GEMMA3_VLM_URL=http://remote-server:11434
```

**Configuration**:
```bash
# .env.development
GEMMA3_VLM_MODEL_PATH=gemma3-vlm
GEMMA3_VLM_DEVICE=cuda  # or cpu
```

### Step 2.3: Verify Services

```bash
# Check PostgreSQL
psql -U postgres -d chr97 -c "SELECT 1"

# Check Qdrant
curl http://localhost:6333/health

# Check MinIO
curl http://localhost:9000/minio/health/live

# Check Ollama
curl http://localhost:11434/api/tags
```

---

## Task 3: Create Database Migrations

### Duration: 1-2 hours

### Step 3.1: Create Citations Table Migration

**File**: `migrations/002_create_citations_table.sql`

```sql
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID,
    text TEXT NOT NULL,
    source_url VARCHAR NOT NULL,
    source_title VARCHAR,
    context_before TEXT,
    context_after TEXT,
    confidence FLOAT,
    highlighted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP,
    embedding vector(768)
);

CREATE INDEX IF NOT EXISTS idx_citations_result ON citations(result_id);
CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_url);
CREATE INDEX IF NOT EXISTS idx_citations_created ON citations(created_at);
```

### Step 3.2: Create Images Table Migration

**File**: `migrations/003_create_images_table.sql`

```sql
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path VARCHAR NOT NULL,
    minio_path VARCHAR,
    extracted_text TEXT,
    visual_objects TEXT[],
    scene_description TEXT,
    relationships TEXT[],
    embedding vector(768),
    confidence FLOAT,
    source_url VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_source ON images(source_url);
CREATE INDEX IF NOT EXISTS idx_images_confidence ON images(confidence);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at);
```

### Step 3.3: Run Migrations

```bash
# Apply citations table
psql $DATABASE_URL -f migrations/002_create_citations_table.sql

# Apply images table
psql $DATABASE_URL -f migrations/003_create_images_table.sql

# Verify tables
psql $DATABASE_URL -c "\dt citations, images"
```

---

## Task 4: Update Environment Variables

### Duration: 30 minutes

**File**: `.env.development`

```bash
# Google Search API
GOOGLE_SEARCH_API_KEY=your_api_key
GOOGLE_SEARCH_ENGINE_ID=your_engine_id

# Gemma3 VLM
GEMMA3_VLM_MODEL_PATH=gemma3-vlm
GEMMA3_VLM_DEVICE=cuda

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chr97

# Vector Databases
QDRANT_URL=http://localhost:6333
PGVECTOR_URL=postgresql://user:password@localhost:5432/chr97

# Object Storage
MINIO_URL=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Embedding Service
OLLAMA_URL=http://localhost:11434
```

---

## Task 5: Verify Setup

### Duration: 1 hour

### Step 5.1: TypeScript/Svelte Checks

```bash
npm run check:typescript
npm run check
npm run lint
npm run build
```

**Expected**: All pass with no errors

### Step 5.2: Database Verification

```bash
# Check tables exist
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"

# Check pgvector extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector"

# Verify tables
psql $DATABASE_URL -c "\d citations"
psql $DATABASE_URL -c "\d images"
```

### Step 5.3: Service Verification

```bash
# Test Google Search API
curl "https://www.googleapis.com/customsearch/v1?q=test&key=$GOOGLE_SEARCH_API_KEY&cx=$GOOGLE_SEARCH_ENGINE_ID"

# Test Gemma3 VLM
curl -X POST http://localhost:11434/api/generate -d '{"model":"gemma3-vlm","prompt":"test"}'

# Test Qdrant
curl http://localhost:6333/collections

# Test MinIO
mc ls minio/
```

---

## Checkpoint: Phase 1 Complete

### Verification Checklist

- [ ] TypeScript errors fixed
- [ ] Svelte 5 errors fixed
- [ ] bits-ui v2 components updated
- [ ] Google Search API configured
- [ ] Gemma3 VLM configured
- [ ] PostgreSQL migrations applied
- [ ] Citations table created
- [ ] Images table created
- [ ] Environment variables set
- [ ] All services verified
- [ ] Build succeeds
- [ ] Tests pass

### Success Criteria

✅ All TypeScript/Svelte errors fixed
✅ All external services configured
✅ All database migrations applied
✅ All environment variables set
✅ Build succeeds without errors
✅ All services verified and working

---

## Next Phase

Once Phase 1 is complete:

1. Mark Phase 1 as complete
2. Begin Phase 2: Implement Citations
3. Follow `.kiro/ENHANCEMENT_MIGRATION_PATH.md` Phase 2 section

---

## Support

For issues:
- TypeScript/Svelte: See `.kiro/SVELTE5_TYPESCRIPT_FIX_GUIDE.md`
- Setup: See `.kiro/ENHANCEMENT_MIGRATION_PATH.md` Phase 1
- General: See `.kiro/START_HERE.md`

---

**Status**: IN PROGRESS ✅
**Duration**: 1 day
**Target Completion**: November 30, 2025
