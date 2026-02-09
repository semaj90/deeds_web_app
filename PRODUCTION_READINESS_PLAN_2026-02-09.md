# Production Readiness Plan - February 9, 2026

## 🎯 Mission: Get to 0 Errors + Production Deployment

**Current Status**: 1,414 errors → Target: 0 errors
**Progress**: 92.8% complete (from 19,666 errors in Phase 67)
**Estimated Time to Zero**: 15-20 hours (3-4 days of focused work)

---

## 📊 Phase 1: Automated Error Elimination (Week 1) ⏱️ 5-7 hours

### Task 1.1: CSS Pseudo-Class Syntax Fixer
**Impact**: ~200 errors eliminated
**Time**: 1 hour
**Script**: `scripts/fix-css-pseudo-class-syntax.mjs`

**Pattern**:
```css
/* ❌ WRONG */
focus: border-emerald-500
hover: bg-blue-600

/* ✅ CORRECT */
focus:border-emerald-500
hover:bg-blue-600
```

**Implementation**:
```javascript
// Regex: /(\w+):\s+(\w)/g → $1:$2
// Files affected: ~50 Svelte components
```

**Verification**: `npm run check` after fix

---

### Task 1.2: Ternary Operator Fixer
**Impact**: ~150 errors eliminated
**Time**: 45 minutes
**Script**: `scripts/fix-ternary-operators.mjs`

**Pattern**:
```typescript
// ❌ WRONG (type union in ternary expression)
condition ? value | undefined

// ✅ CORRECT (ternary expression)
condition ? value : undefined
```

**Already Fixed** (Session 11 Part 2): 30 ternary expressions
**Remaining**: ~120 expressions across ~40 files

**Implementation**:
```javascript
// Use AST parser (ts-morph) to detect ternary vs type unions
// Only fix ConditionalExpression nodes, not TypeUnion nodes
```

---

### Task 1.3: Import Type Statement Fixer
**Impact**: ~50 errors eliminated
**Time**: 30 minutes
**Script**: `scripts/fix-import-types.mjs`

**Pattern**:
```typescript
// ❌ WRONG (importing runtime value as type)
import type { zod } from 'sveltekit-superforms/adapters';
import type { superValidate } from 'sveltekit-superforms';

// ✅ CORRECT (runtime imports)
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms';
```

**Files Affected**: ~15 files (mostly +page.server.ts and form components)

---

### Task 1.4: High-Impact UI Component Cascade
**Impact**: ~300 errors eliminated (cascade effect!)
**Time**: 3-4 hours

#### Priority Components (Fix Order):

1. **Button.svelte** (50+ dependents) ⏱️ 30 min
   - Expected cascade: 75-100 errors fixed
   - Update to bits-ui v2 Button API
   - Fix event handlers (on:click → onclick)

2. **Card Components** (40+ dependents) ⏱️ 1 hour
   - Card.svelte ✅ (already clean)
   - CardHeader.svelte, CardContent.svelte, CardFooter.svelte
   - Expected cascade: 80-120 errors fixed

3. **Select.svelte** (30+ dependents) ⏱️ 45 min
   - Update to bits-ui v2 Select API
   - Expected cascade: 50-75 errors fixed

4. **Dialog.svelte** (25+ dependents) ⏱️ 30 min
   - AIDialog.svelte ✅ (already fixed in Batch 5c)
   - Expected cascade: 40-60 errors fixed

**Total Tier 1 Impact**: ~400 errors eliminated (28% reduction)

---

## 📊 Phase 2: XState v5 Migration (Week 2) ⏱️ 4-6 hours

### Task 2.1: XState Import Pattern Fixes
**Impact**: ~100 errors
**Files**: ~20 state machine files

**Pattern**:
```typescript
// ❌ WRONG (importing runtime as type)
import type { createMachine, assign, fromPromise } from 'xstate';

// ✅ CORRECT
import { createMachine, assign, fromPromise } from 'xstate';
```

**Already Fixed** (Session 12):
- ✅ aiAssistantMachine.ts (20+ errors → 1)
- ✅ pgvector-utils.ts (restored full implementation)

**Remaining**:
- evidence-processing-machine.ts (151 errors)
- crewAIOrchestrationMachine.ts (48 errors)
- web-crawl-machine.ts, search-machine.ts, legalAIMachine.v5.ts

---

### Task 2.2: XState v5 Setup API Migration
**Pattern**:
```typescript
// ❌ WRONG (v4 syntax)
actors: {
  myActor: fromPromise(myFn,  // Missing closing paren
  otherActor: fromPromise(otherFn,
}

// ✅ CORRECT (v5 syntax)
actors: {
  myActor: fromPromise(myFn),
  otherActor: fromPromise(otherFn),
}
```

---

## 📊 Phase 3: Production Testing (Week 2-3) ⏱️ 6-8 hours

### Task 3.1: Playwright Test Infrastructure Setup
**Time**: 2 hours
**Deliverable**: E2E test suite with screenshots

**Test Coverage**:
1. **Authentication Flow**
   - Login/logout
   - Session persistence
   - Screenshot: Login page, Dashboard after auth

2. **Case Management**
   - Create new case
   - Edit case details
   - Upload evidence
   - Screenshot: Case form, Case list, Case detail

3. **AI Chat Interface**
   - Send message to legal AI
   - Receive streaming response
   - Context-aware suggestions
   - Screenshot: Chat interface, AI response

4. **Document Analysis**
   - Upload legal document
   - LegalBERT classification
   - Evidence extraction
   - Screenshot: Upload form, Analysis results

5. **Graph Visualization**
   - Knowledge graph rendering
   - Node interaction
   - Screenshot: Graph view, Node details

**Playwright Config**:
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
```

---

### Task 3.2: Production Readiness Checklist
**Time**: 1 hour
**Deliverable**: Automated checklist from test results

**Checklist Items**:
- [ ] All Playwright tests passing (100% pass rate)
- [ ] svelte-check: 0 errors, 0 warnings
- [ ] tsc --noEmit: 0 errors
- [ ] npm run build: Success
- [ ] Database migrations: Up-to-date
- [ ] Environment variables: Configured
- [ ] Docker containers: All healthy
- [ ] API endpoints: All responding
- [ ] Authentication: Working
- [ ] File uploads: Working (MinIO integration)
- [ ] WebGPU: Available and functional
- [ ] Ollama: Models loaded (embeddinggemma, gemma3-legal)
- [ ] Redis cache: Connected
- [ ] Qdrant vector DB: Connected
- [ ] PostgreSQL: Connected
- [ ] RabbitMQ: Connected
- [ ] Screenshot evidence: Captured for all flows

---

### Task 3.3: Performance Benchmarking
**Time**: 2 hours

**Metrics to Capture**:
```typescript
interface PerformanceMetrics {
  // Page Load Times
  homePage: number;        // Target: <1s
  dashboard: number;       // Target: <2s
  caseList: number;        // Target: <1.5s

  // AI Operations
  chatResponse: number;    // Target: <3s (streaming)
  docAnalysis: number;     // Target: <5s (LegalBERT)
  embeddingGen: number;    // Target: <500ms

  // Database Operations
  caseQuery: number;       // Target: <100ms
  vectorSearch: number;    // Target: <200ms

  // GPU Operations
  webgpuInit: number;      // Target: <1s
  shaderCompile: number;   // Target: <100ms
}
```

---

## 📊 Phase 4: AST Analysis Pipeline (Week 3) ⏱️ 8-10 hours

### Architecture Overview

```
┌─────────────────┐
│   TypeScript    │
│   AST Parser    │
│   (ts-morph)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   CouchDB       │◄─── Primary Storage
│   (phase66)     │     - AST nodes
│   Port: 5984    │     - Error locations
└────────┬────────┘     - Fix suggestions
         │
         ▼
┌─────────────────┐
│   PyTorch GPU   │◄─── Embedding Generation
│   Embeddings    │     - Code semantics
└────────┬────────┘     - Error patterns
         │
         ├─────────────────┬─────────────────┐
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Qdrant     │  │  pgvector    │  │    Redis     │
│   (phase66)  │  │  (postgres)  │  │   (cache)    │
│  Port: 6333  │  │  Port: 5434  │  │  Port: 6379  │
└──────────────┘  └──────────────┘  └──────────────┘
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  Error Analysis  │
                 │   + Clustering   │
                 └─────────────────┘
```

---

### Task 4.1: AST to CouchDB Pipeline
**Time**: 3 hours
**Script**: `scripts/ast-to-couchdb.ts`

**Data Flow**:
```typescript
// 1. Parse TypeScript files
const project = new Project({ tsConfigFilePath: './tsconfig.json' });
const sourceFiles = project.getSourceFiles();

// 2. Extract AST + errors
for (const file of sourceFiles) {
  const diagnostics = file.getPreEmitDiagnostics();
  const astNodes = extractRelevantNodes(file);

  // 3. Store in CouchDB
  await couchdb.insert({
    _id: `ast_${file.getFilePath()}`,
    type: 'typescript_file',
    filePath: file.getFilePath(),
    errors: diagnostics.map(d => ({
      code: d.getCode(),
      message: d.getMessageText(),
      line: d.getLineNumber(),
      category: d.getCategory(),
    })),
    nodes: astNodes.map(node => ({
      kind: node.getKindName(),
      text: node.getText(),
      start: node.getStart(),
      end: node.getEnd(),
    })),
    timestamp: Date.now(),
  });
}
```

**CouchDB Schema**:
```json
{
  "_id": "ast_sveltekit-frontend_src_lib_components_ui_Button.svelte",
  "type": "typescript_file",
  "filePath": "sveltekit-frontend/src/lib/components/ui/Button.svelte",
  "errors": [
    {
      "code": 2304,
      "message": "Cannot find name 'onclick'.",
      "line": 42,
      "category": 1
    }
  ],
  "nodes": [
    {
      "kind": "PropertyAssignment",
      "text": "onclick: handler",
      "start": 1234,
      "end": 1250
    }
  ],
  "timestamp": 1707523200000
}
```

---

### Task 4.2: Ollama Embedding Generation (embeddinggemma:latest)
**Time**: 2 hours
**Script**: `scripts/generate-ast-embeddings.ts`

**Model**: embeddinggemma:latest (Ollama) - **PRIMARY EMBEDDING MODEL**

**Pipeline**:
```typescript
import { OllamaService } from '$lib/services/ollama-service';
import { getOllamaEndpoint } from '$lib/services/get-ollama-endpoint';
import axios from 'axios';

// 1. Initialize Ollama service
const ollama = OllamaService.getInstance();
const ollamaUrl = getOllamaEndpoint(); // Auto-detect: env var or docker hostname

// 2. Fetch AST nodes from CouchDB
const couchResponse = await fetch('http://localhost:5984/phase66-ast/_all_docs?include_docs=true');
const couchData = await couchResponse.json();

// 3. Generate embeddings using embeddinggemma
for (const row of couchData.rows) {
  const doc = row.doc;
  const astNode = doc.nodes[0]; // Example: first node

  // Generate embedding via Ollama
  const embedding = await ollama.generateEmbedding(
    astNode.text,
    'embeddinggemma:latest' // 768-dimensional embeddings
  );

  // Store embedding back in CouchDB
  doc.embedding = embedding;
  await fetch(`http://localhost:5984/phase66-ast/${doc._id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
}
```

**Why embeddinggemma:latest?**
- ✅ Already integrated in project (primary embedding model)
- ✅ 768-dimensional embeddings (same as CodeBERT)
- ✅ Optimized for semantic similarity
- ✅ Works with existing Ollama infrastructure
- ✅ No PyTorch/transformers dependencies needed
- ✅ Consistent with legal AI embeddings (gemma3-legal:latest ecosystem)

---

### Task 4.3: Qdrant + pgvector Mirroring
**Time**: 2 hours
**Script**: `scripts/mirror-embeddings.ts`

**Implementation**:
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import { db } from '$lib/server/db/drizzle';
import { codeChunks } from '$lib/server/db/schema-postgres';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// 1. Create collection in Qdrant (if not exists)
await qdrant.createCollection('phase89_code_chunks', {
  vectors: {
    size: 768,  // embeddinggemma:latest dimension
    distance: 'Cosine',
  },
});

// 2. Fetch embeddings from CouchDB
const couchDocs = await fetchAllFromCouch('phase66-ast');

// 3. Mirror to Qdrant + pgvector
for (const doc of couchDocs) {
  const embedding = doc.embedding;

  // Insert into Qdrant
  await qdrant.upsert('phase89_code_chunks', {
    points: [{
      id: doc._id,
      vector: embedding,
      payload: {
        filePath: doc.filePath,
        errorCount: doc.errors.length,
        nodeType: doc.nodes[0]?.kind,
      },
    }],
  });

  // Mirror to pgvector
  await db.insert(codeChunks).values({
    id: doc._id,
    filePath: doc.filePath,
    embedding: `[${embedding.join(',')}]`,  // pgvector format
    metadata: {
      errorCount: doc.errors.length,
      nodeType: doc.nodes[0]?.kind,
    },
  });
}
```

---

### Task 4.4: Error Clustering & Analysis
**Time**: 2 hours
**Script**: `scripts/cluster-errors.py`

**K-Means Clustering on Embeddings**:
```python
from sklearn.cluster import KMeans
import numpy as np

# 1. Fetch all embeddings from Qdrant
response = qdrant_client.scroll(
    collection_name='phase89_code_chunks',
    limit=10000,
)

embeddings = np.array([point.vector for point in response[0]])

# 2. Cluster errors (K=10 clusters)
kmeans = KMeans(n_clusters=10, random_state=42)
clusters = kmeans.fit_predict(embeddings)

# 3. Analyze clusters
for cluster_id in range(10):
    cluster_docs = [doc for i, doc in enumerate(response[0]) if clusters[i] == cluster_id]

    # Find common error patterns
    error_codes = [doc.payload['errorCode'] for doc in cluster_docs]
    most_common = Counter(error_codes).most_common(3)

    print(f"Cluster {cluster_id}: {len(cluster_docs)} errors")
    print(f"  Top errors: {most_common}")
```

---

## 📊 Docker Container Verification ✅ COMPLETE

**Status**: All containers running and healthy

```bash
✅ ollama-cpu              Up 28 seconds
✅ deeds-neo4j             Up 28 seconds
✅ phase66-postgres        Up 28 seconds (Port: 5434)
✅ phase66-couchdb         Up 2 minutes (healthy, Port: 5984)
✅ phase66-redis           Up 2 minutes (healthy, Port: 6379)
✅ phase66-rabbitmq        Up 2 minutes (healthy, Ports: 5672, 15672)
⚠️  phase66-qdrant         Up 2 minutes (unhealthy → healthy in 30s, Port: 6333)
```

**Qdrant Collection**: `phase89_code_chunks` already exists (recovered 1/1 shards)

**Ollama Models Loaded**:
```bash
✅ embeddinggemma:latest    (621 MB) - PRIMARY embedding model
✅ nomic-embed-text:latest  (274 MB) - Fallback embedding model
⚠️  gemma3-legal:latest     (NOT LOADED) - Need to pull
```

**Pull Missing Models**:
```bash
docker exec ollama-cpu ollama pull gemma3-legal:latest
docker exec ollama-cpu ollama pull gemma3:latest  # Fallback LLM
```

**Connection Endpoints**:
- PostgreSQL: `postgresql://localhost:5434/legal_ai_db`
- CouchDB: `http://localhost:5984`
- Qdrant: `http://localhost:6333`
- Redis: `redis://localhost:6379`
- RabbitMQ: `amqp://localhost:5672` (UI: http://localhost:15672)
- Ollama: `http://localhost:11434`
- Neo4j: `bolt://localhost:7687` (UI: http://localhost:7474)

---

## 🎯 Success Metrics

### Error Elimination Milestones
- ✅ Phase 67 Start: 19,666 errors
- ✅ Current (Feb 9): 1,414 errors (-92.8%)
- 🎯 After Phase 1: ~600 errors (-57% reduction)
- 🎯 After Phase 2: ~200 errors (-67% reduction)
- 🎯 After Phase 3: 0 errors ✨ **PRODUCTION READY**

### Production Readiness Criteria
- [ ] svelte-check: 0 errors, 0 warnings
- [ ] Playwright tests: 100% pass rate
- [ ] All screenshots captured
- [ ] Performance metrics: All targets met
- [ ] Docker containers: All healthy
- [ ] Database migrations: Applied
- [ ] Environment variables: Configured
- [ ] AST analysis pipeline: Operational
- [ ] Error clustering: Complete
- [ ] Deployment tested: Staging environment

---

## 📅 Timeline

| Week | Phase | Tasks | Hours | Cumulative |
|------|-------|-------|-------|------------|
| 1 | Automated Fixes | 1.1-1.4 | 5-7h | 5-7h |
| 2 | XState Migration | 2.1-2.2 | 4-6h | 9-13h |
| 2-3 | Production Testing | 3.1-3.3 | 6-8h | 15-21h |
| 3 | AST Pipeline | 4.1-4.4 | 8-10h | 23-31h |

**Total Estimated Time**: 23-31 hours (5-7 working days)

---

## 🚀 Next Immediate Actions

1. **Run automated CSS fixer** (1 hour, -200 errors)
2. **Run automated ternary fixer** (45 min, -150 errors)
3. **Fix Button.svelte** (30 min, -75 cascading errors)
4. **Verify containers healthy** ✅ (DONE)
5. **Run svelte-check** → Track progress

**First Commit Target**: -400 errors in 3 hours (CSS + Ternary + Button fixes)

---

## 📝 Documentation & Tracking

**Session Logs**:
- ✅ SESSION_10_PROGRESS_2026-02-08.md
- ✅ SESSION_11_PROGRESS_2026-02-08.md
- ✅ SESSION_12_PROGRESS_2026-02-08.md
- 📄 SESSION_13_PROGRESS_2026-02-09.md (Next)

**Technical Specs**:
- ✅ ERROR_ELIMINATION_ROADMAP_2026-02-09.md
- ✅ PRODUCTION_READINESS_PLAN_2026-02-09.md (This document)
- 📄 CASCADE_EFFECT_STRATEGY.md (From CLAUDE.md)

**Archive**:
- ✅ _archive/corrupted-files-feb-8-2026/README.md (13 files archived)

---

**Status**: 🟢 **READY TO EXECUTE**
**Confidence**: ⭐⭐⭐⭐⭐ (All containers verified, plan complete, tools ready)
**Risk**: 🟢 **LOW** (Systematic approach, automated testing, rollback available)
