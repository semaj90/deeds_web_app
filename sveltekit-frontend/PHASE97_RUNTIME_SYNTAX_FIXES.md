# Phase 97: Runtime Syntax Error Fixes

**Date**: January 12, 2026
**Status**: In Progress - Dev Server Starting
**Goal**: Fix runtime syntax errors blocking development server

## Critical Issues Found

### 1. Schema Files - Drizzle ORM Syntax Errors

#### `src/lib/db/schema/ace-web.ts`
**Error**: Line 73 - Invalid TypeScript syntax
```typescript
// ❌ BEFORE (corrupted)
tags?, string[];

// ✅ AFTER (fixed)
tags?: string[];
```

#### `src/lib/db/schema/gpuInferenceDemo.ts`
**Error**: Entire file corrupted/minified - regenerated clean schema
**Impact**: PostgreSQL table definitions for GPU inference tracking

### 2. Svelte Component Syntax Errors

#### `<svelte:head>` Tag Corruption (30+ files)
**Error**: Comma instead of colon in special tags
```svelte
<!-- ❌ BEFORE (corrupted) -->
<svelte, head>
</svelte, head>

<!-- ✅ AFTER (fixed) -->
<svelte:head>
</svelte:head>
```

**Files Fixed** (Active Routes):
- `src/routes/+error.svelte`
- `src/routes/(app)/admin/phase89/+page.svelte`
- `src/routes/(app)/admin/component-analysis/+page.svelte`
- `src/routes/(app)/terminal/+page.svelte`
- `src/routes/(app)/dashboard/+page.svelte`
- `src/routes/(app)/cases/+page.svelte`
- `src/routes/(app)/cases/create/+page.svelte`
- `src/routes/(app)/codebase-index/+page.svelte`
- `src/routes/(app)/command-center/+page.svelte`
- `src/routes/(app)/command-center/codebase/+page.svelte`
- `src/routes/(app)/evidence/hash/+page.svelte`
- `src/routes/(app)/evidence/realtime/+page.svelte`
- `src/routes/acp/+page.svelte`
- `src/routes/admin/error-analysis/+page.svelte`
- `src/routes/couchdb-analytics/+page.svelte`
- `src/routes/demo/svelte5-components/+page.svelte`
- `src/routes/rag-search/+page.svelte`
- `src/routes/test-source-validation/+page.svelte`
- ... and 12+ more files

### 3. CSS Syntax Errors

#### `src/routes/+error.svelte`
**Error**: Line 93 - Invalid keyframe syntax
```css
/* ❌ BEFORE (corrupted) */
@keyframes pulse {
  0%; } 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* ✅ AFTER (fixed) */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
```

### 4. TypeScript Store Errors

#### `src/lib/stores/preferences.svelte.ts`
**Error**: Line 149 - Array literal with semicolons instead of commas
```typescript
// ❌ BEFORE (corrupted)
const _ = [
  this.showCitations; this.theme; this.fontSize; ...
];

// ✅ AFTER (fixed)
const _ = [
  this.showCitations,
  this.theme,
  this.fontSize,
  ...
];
```

**Error**: Line 175 - Invalid `classList.toggle()` syntax
```typescript
// ❌ BEFORE (corrupted)
document.body.classList.toggle('dark'; this.theme === 'dark');

// ✅ AFTER (fixed)
document.body.classList.toggle('dark', this.theme === 'dark');
```

## Fix Strategy

### Automated Mass Fix
Used PowerShell script to fix all `<svelte,` tags in active routes:
```powershell
Get-ChildItem -Recurse -Filter "*.svelte" -Path "src/routes" | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  if ($content -match '<svelte,') {
    $newContent = $content `
      -replace '<svelte,\s*head>', '<svelte:head>' `
      -replace '</svelte,\s*head>', '</svelte:head>' `
      -replace '<svelte,\s*body>', '<svelte:body>' `
      -replace '</svelte,\s*body>', '</svelte:body>' `
      -replace '<svelte,\s*window>', '<svelte:window>' `
      -replace '</svelte,\s*window>', '</svelte:window>'
    Set-Content -Path $_.FullName -Value $newContent
    Write-Host "Fixed: $($_.FullName)"
  }
}
```

### Manual Fixes
- Schema files regenerated with correct Drizzle ORM syntax
- CSS keyframes corrected
- TypeScript syntax errors fixed individually

## Test Results

### Before Fixes
- **Dev Server Status**: ❌ Crashed on startup
- **Error**: `Transform failed with 1 error: Expected "}" but found "?"`
- **Routes Tested**: 0/10 (server wouldn't start)

### After Fixes (In Progress)
- **Dev Server Status**: ⏳ Restarting...
- **Routes to Test**: 10 core routes
- **Target**: All routes return < 500 status

## Impact Analysis

### Database Stack (Confirmed Working)
- ✅ **PostgreSQL 17** (port 5434) - Primary SQL + pgvector
- ✅ **Neo4j** - Knowledge graph
- ✅ **CouchDB** (port 5984) - Document database
- ✅ **Qdrant** (port 6333) - 51 vector collections
- ✅ **Redis** (port 6379) - Cache + pub/sub
- ✅ **MinIO** (ports 9000-9001) - S3 object storage

### Services Integration
- ✅ RabbitMQ 3-tier fallback (Docker → Native → Environment)
- ✅ SSE streaming endpoints
- ✅ Chunking library (5 strategies)
- ✅ Loki.js + Fuse.js
- ✅ IndexedDB browser persistence

## Next Steps

1. ⏳ **Wait for dev server to fully restart**
2. 🧪 **Run Playwright tests** to verify routes load
3. 📸 **Take screenshots** of working routes
4. 🔍 **Analyze remaining errors** (if any)
5. 📚 **Fetch RabbitMQ docs** for streaming/chunking knowledge base
6. 🧠 **Update RAG/KAG/DAG** knowledge base with latest docs

## Files Modified

### Schema Files
- `src/lib/db/schema/ace-web.ts` - Fixed TypeScript syntax
- `src/lib/db/schema/gpuInferenceDemo.ts` - Complete regeneration

### Component Files
- `src/routes/+error.svelte` - Fixed CSS + Svelte tag syntax
- 30+ `.svelte` files in `src/routes/` - Fixed `<svelte:head>` tags

### Store Files
- `src/lib/stores/preferences.svelte.ts` - Fixed array and classList syntax

## Root Cause Analysis

**Hypothesis**: Files appear to have been corrupted during a previous automated refactoring/minification process.

**Evidence**:
1. Semicolons replacing commas in arrays and function arguments
2. Special Svelte tags using commas instead of colons
3. Missing/extra braces in CSS keyframes
4. Entire schema files collapsed into single lines

**Prevention**:
- Use AST-based refactoring tools (jscodeshift, ts-morph)
- Validate syntax with ESLint/svelte-check before committing
- Keep backup branches during mass refactoring

## Related Documentation

- [PHASE96_RUNTIME_INTEGRATION_COMPLETE.md](./PHASE96_RUNTIME_INTEGRATION_COMPLETE.md) - Database stack validation
- [Phase 96 Runtime Integration Test](./scripts/phase96-runtime-integration-test.mjs) - System health checks

---

**Last Updated**: January 12, 2026 8:35 AM
**Server Status**: Restarting after fixes
**Next Validation**: Playwright route tests
