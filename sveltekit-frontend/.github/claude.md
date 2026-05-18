# Claude AI Context: Phase 76-87 RAG/KAG SvelteKit Error Analysis

## Current Diagnostics Regression Checkpoint

- Run `npm run test:diagnostics` from `sveltekit-frontend` after diagnostics-related changes.
- Unit-only slice: `npm run test:diagnostics:unit`
- Browser-only slice: `npm run test:diagnostics:e2e`
- VS Code task labels: `Diagnostics Regression Slice`, `Diagnostics Regression Slice (Unit)`, and `Diagnostics Regression Slice (E2E)`.
- Coverage includes evidence diagnostics rendering, `/api/evidence/[id]` metadata normalization and `404` handling, `/api/rag/search` diagnostics payloads, and the focused evidence upload Playwright flow.

## 🔍 Ripgrep Fix (MANDATORY on Windows)

### Problem: `--type mjs` Fails
Ripgrep on Windows doesn't recognize `mjs` as a built-in type:
```bash
$ rg "phase76" scripts --type mjs
rg: unrecognized file type: mjs
```

### Solution: Always Use Glob Patterns
```bash
# ❌ WRONG (fails)
rg "pattern" scripts --type js --type mjs

# ✅ CORRECT (works on all platforms)
rg "pattern" scripts -g'*.js' -g'*.mjs' -g'*.ts' -g'*.mts'

# For complex searches
rg -n -S "phase76|Phase 76|PHASE 76" . -g"*.{ts,js,mjs,ps1,md}" --hidden --no-ignore
```

### Permanent Configuration (.ripgreprc)
Create `.ripgreprc` in workspace root:
```bash
# Add modern JS/TS extensions
--type-add=mjs:*.mjs
--type-add=mts:*.mts
--type-add=cts:*.cts

# Sensible defaults
--smart-case
--hidden
--glob=!{.git,node_modules,.svelte-kit,dist,build}/**
```

Then you can use:
```bash
rg "pattern" --type mjs  # Now works!
```

---

## 🏗️ Phase 76-87 RAG/KAG Architecture (Complete System)

### High-Level Pipeline (6 Stages)
```
┌──────────────────────────────────────────────────────────────────┐
│ 🚀 Phase 90: 205 FILES! (Batches 1-12) - 68% of Codebase      │
│                                          (Jan 7, 2026)          │
│                                                                  │
│ STATUS: ✅ IN PROGRESS | **3,397 fixes** | Variable success 🏆│
│                                                                  │
│ • Batch 12 (NEW!): 375 fixes | 29/50 files (58%)              │
│ • Success trend: 50% → 74.5% → 58% (complexity dependent)     │
│                                                                  │
│ CUMULATIVE TOTALS (Batches 1-12):                                │
│ ✅ 205 files processed (~68% of codebase)                      │
│ ✅ 3,397 total fixes (1,629 + 1,393 + 375)                     │
│ 📉 -714 visible errors removed                                 │
│ 🔮 ~1,313 total cascade                                         │
│ 🛡️ 19 total rollbacks = 0 regressions (perfect safety!)       │
│                                                                  │
│ KEY INSIGHT: Success rate varies 58-74.5% based on:            │
│ • File complexity (WebGPU, workers, machines harder)           │
│ • Pattern density (more TS1005 errors = harder)                │
│ • AST node diversity (UnionTypes, LabeledStatements unknown)   │
│                                                                  │
│ PHASE 90: **SCALING TO REMAINING 32% OF CODEBASE!** 🎯        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ STAGE 1: WEBCRAWL                                                │
│ ├─ Firecrawl API (primary)                                       │
│ ├─ SearxNG (self-hosted, no API key)                             │
│ └─ DuckDuckGo HTML scrape (fallback)                             │
│ Target Docs: Svelte 5, SvelteKit, Vite, UnoCSS, Lucia, etc.     │
└────────────────────────┬─────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STAGE 2: PARSE                                                   │
│ ├─ langextract (port 8095) - Generic text extraction            │
│ └─ docling - PDF layout preservation                             │
│ Output: Structured chunks (headers, code, paragraphs)            │
└────────────────────────┬─────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STAGE 3: CHUNK (Deterministic)                                   │
│ ├─ Max: 1800 chars                                               │
│ ├─ Overlap: 200 chars                                            │
│ └─ Boundaries: Preserve headers, code blocks, sentence endings   │
└────────────────────────┬─────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STAGE 4: EMBED                                                   │
│ ├─ Model: embeddinggemma:latest (Ollama port 11434)             │
│ ├─ Dimensions: 768D                                              │
│ └─ Distance: Cosine similarity                                   │
└────────────────────────┬─────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STAGE 5: INDEX (Multi-Backend Storage)                           │
│ ├─ Qdrant: 15 collections, 55,561 vectors (HNSW index)          │
│ ├─ PostgreSQL pgvector: 100 errors, 100 embeddings (HNSW)       │
│ ├─ CouchDB: Graph views (by_priority, by_status)                │
│ ├─ SeaweedFS S3: 4 buckets (raw docs, parsed chunks)            │
│ └─ Redis: Cache (phase76:codebase:*, semantic:*)                │
└────────────────────────┬─────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ STAGE 6: MIRRORED SEARCH (5-Backend Query)                       │
│ 1. PostgreSQL: Exact filters (error_code, file_path)            │
│ 2. pgvector: Local HNSW similarity (sub-millisecond)            │
│ 3. Qdrant: Semantic KB (15 collections)                         │
│ 4. CouchDB: Graph expansion (related patterns/files)            │
│ 5. SeaweedFS S3: Payload retrieval (full context; MinIO-compatible adapter) │
│ → Merge: Deduplicate + rank by weighted score                   │
└──────────────────────────────────────────────────────────────────┘
```

### Storage Backend Specifications

#### PostgreSQL 17 + pgvector (Port 5434)
**Container**: `phase66-postgres` (pgvector/pgvector:pg17)
**Tables**:
- `ts_errors` (33,599 total, 100 ingested)
- `error_embeddings` (100 vectors, 768D)
- `knowledge_graph` (error → pattern links)
- `fix_attempts` (audit log)

**HNSW Index**:
```sql
CREATE INDEX error_embeddings_hnsw_idx
ON error_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Current Coverage**: 0.3% (100/33,599) - **needs scaling to 10,000**

#### Qdrant (Port 6333)
**Collections** (15 total, 55,561 vectors):
- `phase72_error_patterns`: 53,227 vectors (768D, primary)
- `phase76_knowledge_base`: 1,093 vectors (operator docs, Svelte/SvelteKit)
- `phase72_ast_knowledge_base`: 14 vectors (surgical patterns)
- `surgical_fixes_phase66_85`: 48 vectors (1536D, OpenAI embeddings)

**Distance**: Cosine (consistent with pgvector)

#### SeaweedFS S3 (Port 8333)
**Buckets**:
- `phase76-summaries` - Webcrawl summaries
- `phase76-docs` - Raw HTML/PDF
- `phase76-knowledge` - Parsed chunks
- `legal-documents` - User uploads

#### CouchDB (Port 5984)
**Design Docs** (phase76 database):
- `by_priority` - Errors ranked by impact
- `by_status` - Open/closed/fixed tracking
- `recommendations` - AI-generated fix suggestions

#### Redis (Port 6379)
**Namespaces**:
- `phase76:codebase:*` - File/symbol cache
- `phase76:semantic:*` - Embedding cache
- `topology:cache:*` - Dependency graph

#### Ollama (Port 11434)
**Models**:
- `embeddinggemma:latest` - 768D embeddings
- `gemma3-legal:latest` - Text generation (fix patches)

### Phase 76 Script Inventory

| Script | Purpose | Key Arguments | Output |
|--------|---------|---------------|--------|
| `phase76-knowledge-builder.mjs` | Webcrawl + ingest docs | `--crawl <url> --depth 2` | Qdrant vectors, SeaweedFS objects |
| `phase76-kb-update.mjs` | Index markdown/JSON | `--paths <files> --tags <tags> --kind <type>` | Qdrant + Postgres kb_chunks |
| `phase76-storage-layer.mjs` | Storage abstraction | N/A (library) | CRUD API |
| `phase76-couchdb-graph-sync.mjs` | Sync knowledge_graph → CouchDB | Auto | Design docs |
| `init-qdrant.mjs` | Create collections | Collection schemas | 15 Qdrant collections |
| `phase86-autonomous-loop.mjs` | Autonomous error fixer | Requires FastMCP | Applied fixes |
| `phase87-ingest-error-corpus.mjs` | Scale embeddings | `--filter "TS1005,TS1128"` | 10,000+ embeddings |
| `fastmcp-server.mjs` | MCP tool server | Port 3002 | 10 tools available |

### FastMCP Server (Phase 86 Tool Layer)

**Status**: ✅ Running on port 3002
**Health**: `GET http://localhost:3002/health` → `{ ok: true, tools: 10 }`
**Tools List**: `GET http://localhost:3002/tools`

**Tool Registry** (10 tools):

1. **qdrant_search** - Semantic KB search
   - Args: `{ query: string, collection?: string, limit?: number }`
   - Returns: `{ results: Array<{ payload, score }> }`

2. **postgres_query** - Raw SQL execution
   - Args: `{ query: string, params?: any[] }`
   - Returns: `{ rows: any[] }`

3. **minio_fetch** - SeaweedFS S3 object retrieval (MinIO-compatible adapter)
   - Args: `{ bucket: string, key: string }`
   - Returns: `{ content: string, metadata: object }`

4. **redis_cache** - Cache operations
   - Args: `{ action: 'get'|'set'|'delete', key: string, value?: any }`
   - Returns: `{ result: any }`

5. **read_file** - File I/O with line ranges
   - Args: `{ filepath: string, startLine?: number, endLine?: number }`
   - Returns: `{ content: string }`

6. **ripgrep** - Advanced code search (JSON output)
   - Args: `{ pattern: string, paths: string[], globs?: string[] }`
   - Returns: `{ matches: Array<{ file, line, text }> }`
   - **IMPORTANT**: Use `globs: ["*.mjs", "*.ts"]` instead of `--type mjs`

7. **search_codebase** - Full-text search
   - Args: `{ query: string, filePattern?: string }`
   - Returns: `{ results: Array<{ file, line, snippet }> }`

8. **web_search** - External search
   - Args: `{ query: string, provider?: 'firecrawl'|'searxng' }`
   - Returns: `{ results: Array<{ title, url, content }> }`

9. **write_file** - File write/patch
   - Args: `{ filepath: string, content: string }`
   - Returns: `{ success: boolean }`

10. **run_command** - Shell execution
    - Args: `{ command: string, cwd?: string }`
    - Returns: `{ stdout: string, stderr: string, exitCode: number }`

### Phase 86 Autonomous Loop Workflow

```powershell
# Terminal 1: Start FastMCP server
node scripts/fastmcp-server.mjs
# Wait for: "🚀 FastMCP Server Running on port 3002"

# Terminal 2: Configure PostgreSQL connection
$env:PGHOST="127.0.0.1"
$env:PGPORT="5434"
$env:PGDATABASE="legal"
$env:PGUSER="user"
$env:PGPASSWORD="pass"

# Run autonomous loop
node scripts/phase86-autonomous-loop.mjs
```

**Loop Execution (6 Steps)**:

1. **Query PostgreSQL**:
   ```sql
   SELECT * FROM ts_errors
   WHERE status='open'
   ORDER BY impact_score DESC
   LIMIT 1;
   ```

2. **Generate Embedding** (embeddinggemma:latest, 768D)

3. **RAG Retrieval**:
   - pgvector HNSW similarity search
   - Qdrant semantic search (phase76_knowledge_base)

4. **KAG Expansion**:
   ```sql
   SELECT target_name FROM knowledge_graph
   WHERE source_name = $error_id
   AND relationship = 'matches';
   ```

5. **Read Context** (FastMCP `read_file` tool)

6. **Apply Fix** (if confidence ≥0.85):
   - Generate patch with gemma3-legal:latest
   - Write via `write_file` tool
   - Validate: `run_command({ command: "npx tsc --noEmit" })`
   - Audit: Log to `fix_attempts` table

### HNSW vs FAISS (Vector Index Comparison)

| Feature | HNSW (pgvector/Qdrant) | FAISS |
|---------|------------------------|-------|
| **Search Latency** | <5ms (sub-millisecond) | Faster for batch queries |
| **Index Updates** | Incremental (easy) | Requires full rebuild |
| **Integration** | PostgreSQL native, Qdrant built-in | External library |
| **Sync Complexity** | Low (SQL/REST) | High (binary serialization) |
| **Production Choice** | ✅ **CHOSEN** | Optional/legacy |

**Rationale**: HNSW wins for Phase 86 because incremental updates (as errors get fixed) are trivial, whereas FAISS requires full index rebuilds.

### Current Blockers & Fixes

#### Blocker 1: Low Embedding Coverage (100/33,599 = 0.3%)
**Impact**: Similarity search quality is poor
**Fix**: Scale to 10,000 embeddings (syntax errors first)
```powershell
$env:SAMPLE_SIZE = "10000"
node scripts/phase87-ingest-error-corpus.mjs --filter "TS1005,TS1128,TS1109"
```
**Expected Runtime**: ~30 minutes (at ~200ms/embedding)

#### Blocker 2: Pattern = "undefined" in knowledge_graph
**Impact**: KAG expansion retrieves garbage
**Fix**: Implement deterministic pattern classifier (see scripts/phase87-knowledge-sync.mjs)
```javascript
function classifySyntaxPattern({ error_code, error_message }) {
  if (error_code === 'TS1005') {
    if (/\.\.\.\/\w+:\s*\w+/.test(error_message)) return 'object-spread-colon';
    if (/\{\s*\w+:\s*[^,}\n]+\s+\w+:/.test(error_message)) return 'missing-comma';
    if (/expected.*,/.test(error_message)) return 'comma-expected';
    return 'ts1005-other';
  }
  // ... more patterns
  return null; // Don't create link if unrecognized
}
```

#### Blocker 3: FastMCP `webSearch` Tool (Already Fixed)
**Original Issue**: `ReferenceError: webSearchTool is not defined`
**Fix Applied**: Changed `web_search: webSearchTool` → `web_search: webSearch`
**Status**: ✅ RESOLVED (verified in scripts/fastmcp-server.mjs line 315)

---

## ⚠️ Phase 79 Pattern Fixer - Critical Safety Protocol

### Background: Dec 25, 2025 Regression Incident
- **Trigger**: Applied 4,546 pattern-based changes without dry-run preview
- **Impact**: Error count exploded from 14,511 → 81,562 (+67,051 errors)
- **Culprit**: Untested "auth-machine-garbage" patterns corrupted state machine files
- **Recovery**: Full rollback via `.phase79.bak` backup files (system worked perfectly)
- **Outcome**: Restored to 50,827 error baseline

### Mandatory Safety Protocol

#### Step 0: ALWAYS Dry-Run First (Non-Negotiable)
```bash
# BEFORE applying ANY pattern:
node scripts/phase79-pattern-fixer.mjs --dry-run

# Review output → Assess impact → Then proceed:
node scripts/phase79-pattern-fixer.mjs --risk=safe --apply
```

**Why This Matters**: The incident happened because we skipped dry-run. Never skip it again.

#### Step 1: Single Pattern Application
```bash
# ❌ WRONG: Apply all patterns at once
node scripts/phase79-pattern-fixer.mjs --apply

# ✅ CORRECT: Apply one pattern, verify, repeat
node scripts/phase79-pattern-fixer.mjs --pattern="safe-import-fix" --apply
npx svelte-check --output machine  # Check error count
node scripts/phase79-pattern-fixer.mjs --pattern="type-annotation" --apply
npx svelte-check --output machine  # Check again
```

#### Step 2: Immediate Verification Gate
```powershell
# After EVERY pattern application:
$result = npx svelte-check --output machine 2>&1 | Select-String "COMPLETED"
Write-Host $result

# Parse error count - if INCREASED, rollback:
if ($result -match '(\d+)\s+ERRORS') {
    $errorCount = [int]$matches[1]
    if ($errorCount -gt 50827) {  # Baseline
        Write-Host "🚨 REGRESSION DETECTED - Rolling back..." -ForegroundColor Red
        Get-ChildItem -Recurse -Filter "*.phase79.bak" | ForEach-Object {
            Copy-Item $_.FullName ($_.FullName -replace '\.phase79\.bak$', '') -Force
        }
    }
}
```

#### Step 3: Pattern Risk Assessment
Every pattern in `scripts/patterns.json` must have a risk level:

```typescript
type PatternRisk =
  | "safe"      // Whitespace, comments, simple imports (auto-apply OK)
  | "medium"    // Type changes, refactors (dry-run + manual review)
  | "high"      // AST transforms, state machines (manual only)
  | "disabled"; // Known to cause corruption (NEVER apply)
```

**Currently Disabled Patterns**:
```json
[
  {
    "id": "env-type-declarations",
    "risk": "disabled",
    "reason": "Injects garbage $env/static/private imports → 259k errors",
    "incident": "2025-12-24"
  },
  {
    "id": "auth-machine-garbage-7",
    "risk": "disabled",
    "reason": "Corrupts XState machines → 67k errors",
    "incident": "2025-12-25",
    "affected_files": 2412
  },
  {
    "id": "auth-machine-garbage-6",
    "risk": "disabled",
    "reason": "Corrupts XState machines → part of 67k error spike",
    "incident": "2025-12-25",
    "affected_files": 1132
  }
]
```

#### Step 4: Emergency Rollback Procedure
```powershell
# One-liner rollback (keep this handy):
Get-ChildItem -Recurse -Filter "*.phase79.bak" | ForEach-Object {
    $orig = $_.FullName -replace '\.phase79\.bak$', ''
    Copy-Item $_.FullName $orig -Force
    Write-Host "Restored: $orig"
}

# Verify restoration:
npx svelte-check --output machine 2>&1 | Select-String "COMPLETED"

# Clean backups ONLY after verification:
Get-ChildItem -Recurse -Filter "*.phase79.bak" | Remove-Item -Force
```

#### Step 5: Pattern Testing Workflow (Before Production)
1. **Unit Test**: Apply pattern to 1-2 sample files manually
2. **Preview**: Run `--dry-run` to see all matches
3. **Pilot**: Apply to 10 files with `--limit=10`
4. **Verify**: Check error count didn't increase
5. **Gradual Rollout**: Apply to 100 files, verify, then full codebase
6. **Continuous Monitoring**: Watch error count during entire process

### Lessons Learned (Post-Mortem)

**What Went Wrong**:
1. ❌ Skipped dry-run preview
2. ❌ Applied all patterns simultaneously (hard to identify culprit)
3. ❌ Didn't verify error count immediately after
4. ❌ Patterns were untested on sample files first

**What Went Right**:
1. ✅ Backup system worked perfectly (`.phase79.bak` files)
2. ✅ Quick detection of regression (error count monitoring)
3. ✅ Fast rollback capability (PowerShell one-liner)
4. ✅ Audit trail in `fix-log-*.jsonl` for analysis

**Prevention Going Forward**:
- 🛡️ Dry-run is now MANDATORY (no exceptions)
- 🛡️ Incremental application with verification gates
- 🛡️ Pattern risk classification system
- 🛡️ Test-first development for new patterns
- 🛡️ Keep backups until 100% verified

### Quick Reference
```bash
# Safe workflow:
node scripts/phase79-pattern-fixer.mjs --dry-run          # Preview
node scripts/phase79-pattern-fixer.mjs --risk=safe --apply # Apply safe only
npx svelte-check --output machine                          # Verify

# Emergency rollback:
Get-ChildItem -Recurse -Filter "*.phase79.bak" | ForEach-Object {
    Copy-Item $_.FullName ($_.FullName -replace '\.phase79\.bak$', '') -Force
}
```

**Golden Rule**: When in doubt, dry-run. Always.

---

## Project Architecture

### Technology Stack
- **Frontend**: SvelteKit 2 (Svelte 5 runes)
- **Backend**: Node.js microservices + Go legal AI engine
- **Database**: PostgreSQL 17 + pgvector (embeddings)
- **Cache**: Redis 7.2 (port 4005) - KAG storage
- **Vector Search**: Qdrant (future: auto-tagging)
- **LLM**: Ollama (gemma:latest for embeddings)

### SvelteKit Route Structure
```
src/routes/
├── +layout.svelte                    # Root layout
├── evidenceboard/
│   └── +page.svelte                  # Production route (uses submitWithProgress)
├── api/
│   └── metadata/
│       └── save/
│           └── +server.ts            # POST endpoint for file metadata
└── routes_parked/                    # Archived/experimental routes
    └── archive/
        └── demos/
            └── upload-demo/
                └── +page.svelte      # Prototype (uses submitWithProgress)
```

---

## 📂 File: submitWithProgress.ts - Deep Dive

### Current State (CLEAN ✅)
```typescript
// src/lib/api/submitWithProgress.ts
import type { uploadWithXhr } from './xhr';

export type SubmitResult = {
	status: number;        // ✅ Correct semicolon
	responseText?: string; // ✅ Proper optional property syntax
};

export async function submitWithProgress(
	url: string,
	data: FormData | Record<string, unknown>,
	onProgress?: (loaded: number, total: number) => void,
	signal?: AbortSignal
): Promise<SubmitResult> {
	if (data instanceof FormData) {
		return uploadWithXhr(url, data, onProgress, signal) as Promise<SubmitResult>;
	}

	// JSON path - no upload progress available, but respect signal
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
		signal
	});

	const text = await res.text();
	return { status: res.status, responseText: text };
}
```

### Historical Corruption Analysis

**Backup Locations** (all showing same corruption pattern):
1. `.phase72-backups/2025-12-18T00-24-10/src/lib/api/submitWithProgress.ts`
2. `.phase72-backups/2025-12-18T00-32-14/src/lib/api/submitWithProgress.ts`
3. `.phase72-backups/2025-12-18T00-32-30/src/lib/api/submitWithProgress.ts`

**Corrupted Syntax**:
```typescript
// Line 3-4 in backups (INCORRECT):
export type SubmitResult = {
  status: number: responseText? , string  // ❌ Multiple errors:
  //             ^               ^  ^
  //             |               |  |
  //             Double colon    |  Missing 'string' type keyword
  //                             Missing property separator
};
```

**Root Cause**: Mojibake UTF-8 encoding corruption
**Fixed By**: `scripts/mojibake-cleanup.mjs` (175,537 patterns fixed across 1,229 files)

### TypeScript Error Pattern
```
src/lib/api/submitWithProgress.ts(3,20): error TS1005: ';' expected.
src/lib/api/submitWithProgress.ts(3,33): error TS1128: Declaration or statement expected.
```

**Error Signature (Phase 72 KAG)**:
- **Normalized**: `error ts(X,Y) *.ts ; expected`
- **Tool**: `tsc`
- **File Extension**: `ts`
- **Context**: Type definition with property separator
- **Hash**: `86fb84dcb19c898f923a6567d229e8f9ebb5409d4ed4847d3b053d41d01b08d9` (example)

---

## 🧬 Phase 72 Error Clustering Strategy

### Category 1: Syntax Errors (High Priority)
**Pattern**: Missing or incorrect punctuation in type definitions
**Files Affected**: 15+ API utility files, global type declarations
**Examples**:
- `status: number: responseText?` → Missing `;`
- `declare module, '$env/dynamic/private'` → Extra `,`
- `data :  FormData | Record<string` → Extra spaces, misplaced colon

**Fix Strategy**:
1. Normalize whitespace
2. Replace `:` with `;` in type property separators
3. Remove extra commas in `declare module` statements
4. Verify with TypeScript compiler

**KAG Storage**:
```javascript
{
  sig: "86fb84dcb...",           // SHA-256 of normalized error
  patch: "s/: /; /g",             // Simplified representation
  confidence: 1.0,                // 100% verified
  successCount: 1,                // Applied successfully 1 time
  verified: true,                 // Passed verification gate
  tier: 1                         // Safe, deterministic fix
}
```

### Category 2: Import Resolution (Medium Priority)
**Pattern**: Missing type imports, barrel export conflicts
**Files Affected**: Components, services, stores
**Examples**:
- Missing `import type { uploadWithXhr } from './xhr';`
- Circular dependency in barrel exports (`$lib/components/index.ts`)
- SvelteKit path alias resolution issues

**Fix Strategy**:
1. Detect missing imports via TypeScript diagnostics
2. Analyze barrel exports for circular dependencies
3. Add explicit type imports
4. Update `tsconfig.json` paths if needed

### Category 3: Svelte 5 Migration (Low Priority)
**Pattern**: Deprecated Svelte 4 syntax, event handlers
**Files Affected**: 200+ Svelte components
**Examples**:
- `on:click` → `onclick` (Svelte 5 event handler syntax)
- `let x` → `let x = $state()` (Svelte 5 runes)
- `$:` reactive statements → `$effect()` or `$derived()`

**Fix Strategy**:
1. Use Svelte compiler diagnostics
2. Apply rune migrations incrementally
3. Test runtime behavior (not just compilation)
4. Store in Phase 72 KAG for replay

---

## 🔍 Redis KAG Implementation Details

### Key Pattern Design
```redis
# Signature storage (sorted by confidence)
phase72:kag:sig:<sha256>
→ JSON array: [
    { patchId, patch, confidence, successCount, ... },
    ...
  ]

# Reverse lookup
phase72:kag:patch:<patchId>
→ JSON: { sig, message, file, code, tool, fileExt }

# Statistics (atomic counters)
phase72:kag:stats
→ HASH:
    totalFixesStored: <int>
    totalSignatures: <int>
    hits: <int>
    misses: <int>
```

### Storage Operation (Atomic)
```javascript
async function storeFix(errorSig, fix) {
  const fixKey = `phase72:kag:sig:${errorSig.sig}`;
  const statsKey = `phase72:kag:stats`;
  const pipeline = redis.pipeline();

  // Store fix data
  pipeline.set(fixKey, JSON.stringify(fixes), 'EX', ttlSeconds);

  // Index by patch ID
  pipeline.set(`phase72:kag:patch:${fix.patchId}`, JSON.stringify(errorSig), 'EX', ttlSeconds);

  // Atomic stats update
  if (isNewFix) {
    pipeline.hincrby(statsKey, 'totalFixesStored', 1);
    pipeline.hincrby(statsKey, 'totalSignatures', 1);
  }

  // Execute atomically
  await pipeline.exec();

  // Verify storage
  return { fixKey, exists: await redis.exists(fixKey) === 1 };
}
```

### Query Operation (with Cache Stats)
```javascript
async function queryBestFix(errorSig) {
  const key = `phase72:kag:sig:${errorSig.sig}`;
  const fixesJson = await redis.get(key);

  if (!fixesJson) {
    await redis.hincrby(`phase72:kag:stats`, 'misses', 1);
    return null; // Cache miss
  }

  await redis.hincrby(`phase72:kag:stats`, 'hits', 1);
  const fixes = JSON.parse(fixesJson);
  return fixes[0]; // Highest confidence fix (sorted)
}
```

---

## 📊 Error Signature Computation

### Normalization Rules
```javascript
function computeSignature(error) {
  let normalized = error.message
    .replace(/\((\d+),(\d+)\)/g, '(X,Y)')           // Line/col → (X,Y)
    .replace(/[A-Z]:\\[^:]+\.(ts|js|svelte)/gi, '*.$1') // Windows paths → *.ext
    .replace(/\/[^/]+\.(ts|js|svelte)/g, '*.$1')    // Unix paths → *.ext
    .replace(/\b\d+\b/g, 'N')                       // Numbers → N
    .toLowerCase()
    .trim();

  const fileExt = path.extname(error.file).substring(1); // 'ts', 'js', 'svelte'
  const tool = error.tool || 'unknown';                  // 'tsc', 'svelte-check'

  // Context: 50 chars before/after error position
  const context = error.code.substring(
    Math.max(0, error.position - 50),
    Math.min(error.code.length, error.position + 50)
  );

  const sigInput = `${tool}:${fileExt}:${normalized}:${context}`;
  return crypto.createHash('sha256').update(sigInput).digest('hex');
}
```

### Why This Works
1. **Line/Col Normalization**: Errors at different positions have same signature if message is identical
2. **Path Normalization**: Errors across different files (same extension) group together
3. **Number Normalization**: `array[0]` and `array[1]` errors share signature
4. **Context Inclusion**: Distinguishes similar errors in different code contexts
5. **Deterministic Hashing**: Same error always produces same signature

---

## 🎯 Usage in Production Routes

### Evidence Board Page
**File**: `src/routes/evidenceboard/+page.svelte`

**Usage Pattern**:
```svelte
<script lang="ts">
  import { submitWithProgress } from '$lib/api/submitWithProgress';
  import unsyncedUploads from '$lib/services/unsynced-uploads';
  import { isAuthenticated, currentUser } from '@/stores/auth.svelte';

  async function handleUploadSuccess(detail) {
    const payload = {
      caseId: '7d897d59-9832-45c1-87e6-9c5a04745119',
      originalFilename: detail.originalFilename,
      storedFilename: detail.storedFilename,
      mimeType: detail.mimeType ?? null,
      fileSize: detail.size ?? null,
      storagePath: detail.filePath ?? null,
      metadata: {}
    };

    if ($isAuthenticated) {
      // Authenticated: Send to server
      await submitWithProgress('/api/metadata/save', payload);
    } else {
      // Unauthenticated: Store locally for later sync
      unsyncedUploads.saveLocalUpload({ ...payload, userId: $currentUser?.id ?? null });
    }
  }
</script>
```

**API Endpoint**: `/api/metadata/save`
**Method**: POST
**Content-Type**: `application/json`
**Response**: `{ status: number, responseText?: string }`

### Upload Demo (Parked)
**File**: `src/routes_parked/archive/demos/upload-demo/+page.svelte`

**Purpose**: Prototype implementation for testing upload functionality
**Status**: Not active (in `routes_parked/`)
**Usage**: Similar pattern to Evidence Board but simplified

---

## 🧪 Testing & Verification

### Manual Verification
```bash
# 1. Compile TypeScript (should pass)
npx tsc --noEmit -p tsconfig.check.json

# 2. Check Svelte components
npx svelte-check --tsconfig tsconfig.check.json

# 3. Verify Redis connectivity
node -e "const Redis = require('ioredis'); const r = new Redis({host:'127.0.0.1',port:4005}); r.ping().then(()=>{console.log('✅ Redis OK');r.quit()});"

# 4. Check KAG stats
node scripts/kag-rag-dashboard.mjs
```

### Automated Verification (Factory-Fixer)
```bash
node scripts/factory-fixer-v2.mjs \
  --apply \
  --tier 1 \
  --limit 100 \
  --verify "cmd /c exit 0"
```

**Verification Gates**:
1. **Pre-check**: Count errors before applying fixes
2. **Apply**: Make file modifications
3. **Post-check**: Count errors after fixes
4. **Verify**: Run custom verification command
5. **Store**: Save to Redis KAG only if verification passes

---

## 🚨 Known Issues & Workarounds

### Issue 1: Error Detection Reports 0 (ACTIVE BUG)
**File**: `scripts/regenerate-errors-jsonl.mjs`
**Symptom**: Script reports "🎉 No errors found!" but `tsc` shows hundreds of errors
**Root Cause**: Parser doesn't detect `tsc` stderr format correctly
**Workaround**: Run `npx tsc --noEmit` directly and parse output manually
**Fix Status**: Pending (needs parser update)

### Issue 2: Dashboard Showed 0 Fixes (RESOLVED)
**File**: `scripts/kag-fix-store.mjs`
**Symptom**: Dashboard reported 0 fixes despite factory-fixer logs showing successful storage
**Root Cause**: Key pattern mismatch - `storeFix()` wrote to `phase72:kag:sig:*`, but `getStats()` read from old JSON blob
**Fix Applied**: Atomic counters with `HINCRBY` on `phase72:kag:stats` hash
**Status**: ✅ RESOLVED (2025-12-18)

### Issue 3: Redis Connection Drops (INTERMITTENT)
**Symptom**: `ECONNREFUSED 127.0.0.1:4005`
**Root Cause**: Redis server not running or port conflict
**Fix**: Manually start Redis: `.\redis-latest\redis-server.exe --port 4005`
**Future**: Add health check task to VS Code tasks.json

---

## 📚 Related Scripts & Tools

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `factory-fixer-v2.mjs` | Apply verified fixes from KAG | `errors.jsonl` | Modified files + manifest |
| `kag-fix-store.mjs` | Redis storage layer | Fix objects | Stored in Redis |
| `kag-rag-dashboard.mjs` | Display KAG statistics | Redis data | Terminal UI |
| `regenerate-errors-jsonl.mjs` | Parse tsc output → JSONL | tsc stderr | `errors.jsonl` |
| `mojibake-cleanup.mjs` | Fix UTF-8 encoding issues | Source files | Cleaned files |

---

## 🎯 Svelte 5 + bits-ui v2.x (Native Runes)

### Migration Status (2025-01-25)
- **Error Count**: 392 → 0 in src/ folder (100% reduction)
- **bits-ui**: v2.14.4 (Svelte 5 native, NO Melt UI)
- **UnoCSS**: v66.5.11 with YoRHa/NES themes

### Svelte 5 Runes Pattern
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    class?: string;
    children?: Snippet;
  }

  let { title, class: className = '', children }: Props = $props();
  let open = $state(false);
  let derived = $derived(title.toUpperCase());

  $effect(() => {
    console.log('State changed:', open);
  });
</script>

{@render children?.()}
```

### Common Error Patterns Fixed
| Error | Pattern | Fix |
|-------|---------|-----|
| `state_referenced_locally` | Using `$state` in reactive context | Wrap in `$effect()` |
| Stub placeholder | `TODO: implement` | Rebuild with `$props()` + `{@render children()}` |
| a11y interactive elements | Click handlers without keyboard | Add `role`, `tabindex`, `onkeydown` |
| D3 TypeScript | Module resolution | Cast to `any` |
| lucide-svelte imports | Named imports fail | Use default: `import Icon from 'lucide-svelte/icons/icon-name'` |

### Template Files Created
- `src/lib/components/templates/Svelte5BitsDialog.svelte`
- `src/lib/components/templates/Svelte5Card.svelte`
- `src/lib/components/templates/Svelte5Button.svelte`
- `src/lib/components/templates/index.ts` (barrel export)

---

## 🖥️ WebGPU API (Browser GPU Acceleration)

### TypeScript Configuration
```json
// tsconfig.json - Enable WebGPU types
{
  "compilerOptions": {
    "lib": ["DOM", "ES2022"],
    "types": ["@webgpu/types"]
  }
}
```

### Core WebGPU Initialization Pattern
```typescript
interface WebGPUContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
  });
  if (!adapter) throw new Error('No GPU adapter');

  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension: 65535
    }
  });

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: 'premultiplied' });

  return { adapter, device, context, format };
}
```

### GPU Buffer Types
```typescript
// Vertex Buffer
const vertexBuffer: GPUBuffer = device.createBuffer({
  label: 'Vertices',
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);

// Uniform Buffer (matrices, constants)
const uniformBuffer: GPUBuffer = device.createBuffer({
  label: 'Uniforms',
  size: 64, // 4x4 matrix
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

// Storage Buffer (compute shaders)
const storageBuffer: GPUBuffer = device.createBuffer({
  label: 'Storage',
  size: data.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
});
```

### WGSL Shader Module
```typescript
const shaderCode = `
  struct Uniforms {
    mvpMatrix: mat4x4f,
    time: f32
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec3f,
    @location(1) uv: vec2f
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
  }

  @vertex
  fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = uniforms.mvpMatrix * vec4f(in.position, 1.0);
    out.uv = in.uv;
    return out;
  }

  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    return vec4f(in.uv, 0.5, 1.0);
  }
`;

const shaderModule: GPUShaderModule = device.createShaderModule({
  label: 'Main Shader',
  code: shaderCode
});
```

### Compute Pipeline (GPU SIMD)
```typescript
const computeShader = `
  @group(0) @binding(0) var<storage, read> input: array<f32>;
  @group(0) @binding(1) var<storage, read_write> output: array<f32>;

  @compute @workgroup_size(256)
  fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i < arrayLength(&input)) {
      output[i] = input[i] * 2.0 + 1.0;
    }
  }
`;

const computePipeline: GPUComputePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {
    module: device.createShaderModule({ code: computeShader }),
    entryPoint: 'main'
  }
});

// Create bind group
const bindGroup = device.createBindGroup({
  layout: computePipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: inputBuffer } },
    { binding: 1, resource: { buffer: outputBuffer } }
  ]
});

// Execute compute pass
const commandEncoder = device.createCommandEncoder();
const passEncoder = commandEncoder.beginComputePass();
passEncoder.setPipeline(computePipeline);
passEncoder.setBindGroup(0, bindGroup);
passEncoder.dispatchWorkgroups(Math.ceil(dataLength / 256));
passEncoder.end();
device.queue.submit([commandEncoder.finish()]);
```

### Error Handling & Fallback
```typescript
class GPUCompute {
  private device: GPUDevice | null = null;

  async init(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      this.device = await adapter.requestDevice();

      // Handle device loss
      this.device.lost.then((info) => {
        console.error('GPU lost:', info.reason, info.message);
        this.device = null;
      });

      return true;
    } catch {
      return false;
    }
  }

  async compute(data: Float32Array): Promise<Float32Array> {
    if (!this.device) {
      // CPU fallback
      return new Float32Array(data.map(x => x * 2 + 1));
    }
    // GPU compute...
    return data;
  }
}
```

---

## 🔗 LangChain.js TypeScript Patterns

### Package Installation
```bash
npm install langchain @langchain/core @langchain/ollama @langchain/qdrant
```

### Ollama LLM (Local)
```typescript
import { Ollama } from '@langchain/ollama';
import { ChatOllama } from '@langchain/ollama';

// Text completion
const llm = new Ollama({
  model: 'gemma3-legal:latest',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7
});

const text = await llm.invoke('Explain Drizzle ORM');

// Chat model
const chat = new ChatOllama({
  model: 'gemma3-legal:latest',
  temperature: 0
});

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const response = await chat.invoke([
  new SystemMessage('You are a TypeScript expert.'),
  new HumanMessage('Fix this error: TS2322')
]);
```

### Embeddings (768D)
```typescript
import { OllamaEmbeddings } from '@langchain/ollama';

const embeddings = new OllamaEmbeddings({
  model: 'embeddinggemma:latest',
  baseUrl: 'http://localhost:11434'
});

// Single vector
const vector = await embeddings.embedQuery('TypeScript error');
console.log(`Dimensions: ${vector.length}`); // 768

// Batch
const vectors = await embeddings.embedDocuments([
  'TS2322 type mismatch',
  'TS1005 semicolon',
  'Drizzle schema'
]);
```

### Qdrant Vector Store
```typescript
import { QdrantVectorStore } from '@langchain/qdrant';
import type { Document } from '@langchain/core/documents';

const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
  url: 'http://localhost:6333',
  collectionName: 'phase72_error_patterns'
});

// Add documents
const docs: Document[] = [
  { pageContent: 'TS2322: Type mismatch', metadata: { code: 'TS2322', file: 'schema.ts' } }
];
await vectorStore.addDocuments(docs);

// Search
const results = await vectorStore.similaritySearch('type error', 5);
const scored = await vectorStore.similaritySearchWithScore('type error', 5);

// As retriever
const retriever = vectorStore.asRetriever({ k: 5 });
```

### Agent with Tools (LangChain v0.3+)
```typescript
import { createAgent, tool } from 'langchain';
import * as z from 'zod';

const searchTool = tool(
  async ({ query }) => {
    const res = await fetch(`http://localhost:3002/search?q=${encodeURIComponent(query)}`);
    return JSON.stringify(await res.json());
  },
  {
    name: 'search_codebase',
    description: 'Search code patterns',
    schema: z.object({ query: z.string() })
  }
);

const agent = createAgent({
  model: 'gemma3-legal:latest',
  tools: [searchTool]
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Find TS2322 errors' }]
});
```

### RAG Chain
```typescript
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const prompt = ChatPromptTemplate.fromTemplate(`
Context: {context}
Question: {input}
Answer based on context only.
`);

const documentChain = await createStuffDocumentsChain({
  llm: new ChatOllama({ model: 'gemma3-legal:latest' }),
  prompt
});

const ragChain = await createRetrievalChain({
  combineDocsChain: documentChain,
  retriever: vectorStore.asRetriever({ k: 5 })
});

const answer = await ragChain.invoke({
  input: 'How to fix ExtraConfigColumn?'
});
```

---

## 📊 Phase 96: Manual Fixes & Verification (Current Status)

### Progress
- **Restored Files**: 215 files restored from main branch.
- **Error Count**: Reduced from ~98k to ~82k.
- **Top Offenders Fixed**:
    - `src/lib/server/lucia.ts`: Fixed corrupted template literals (`${ userId: userId }` -> `${userId}`).
    - `src/lib/services/qlora-rl-langextract-integration.ts`: Fixed duplicate imports and shadowing.
    - `src/lib/server/services/grpoThinkingService.ts`: Fixed `import type` misuse and interface definitions.
    - `src/lib/components/integration/LegalAIOrchestrationDemo.svelte`: Fixed corrupted object literals, missing braces, and imports.
    - `src/lib/services/end-to-end-api-integration.ts`: Recreated missing service with valid TypeScript implementation.
    - `src/lib/components/ui/Card*.svelte`: Fixed UI component stubs to accept `children`.
    - `src/routes/admin/error-analysis/+page.svelte`: Fixed corrupted template literals in script block.

### Next Steps
1. Continue fixing top offenders manually.
2. Verify fixes with `svelte-check`.
3. Re-run full build to check for cascading improvements.
