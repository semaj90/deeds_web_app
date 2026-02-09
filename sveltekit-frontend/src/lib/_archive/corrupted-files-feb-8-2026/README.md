# Corrupted Files Archive - February 8, 2026

## Purpose
These files were archived during Session 10 error fixing due to extensive corruption that requires comprehensive repair rather than pattern-based fixes.

## Archived Files

### 1. aiAssistantMachine-workflows.ts (200+ errors)
- **Original Path**: `lib/features/workflows/aiAssistantMachine.ts`
- **Issues**:
  - Malformed async functions
  - Broken imports
  - Cascading syntax errors throughout file
- **Recommended Fix**: Complete rewrite using XState v5 patterns

### 2. aiAssistantMachine-machines.ts (200+ errors)
- **Original Path**: `lib/machines/aiAssistantMachine.ts`
- **Issues**: Same as above (duplicate file)
- **Recommended Fix**: Complete rewrite using XState v5 patterns

### 3. xstate-store.ts (66+ errors)
- **Original Path**: `lib/state/xstate-store.ts`
- **Issues**:
  - Import statement corruption
  - Arrow function syntax errors
  - Regex replacement corruption (`$1?.$2`)
- **Recommended Fix**: Comprehensive syntax repair or rewrite

### 4. cached-rag-service.ts (27+ errors)
- **Original Path**: `lib/services/cached-rag-service.ts`
- **Issues**:
  - Multiple import errors
  - Missing type definitions
  - Beyond simple pattern fixes
- **Recommended Fix**: Update imports and types systematically

### 5. pgvector-utils.ts (160+ errors) **✅ RESTORED**
- **Original Path**: `lib/server/db/pgvector-utils.ts`
- **Status**: ✅ **File has been properly restored with full implementation (400 lines)**
- **Issues**: (RESOLVED - user/linter restored proper implementation)
- **Note**: Original stub replaced with complete working implementation including:
  - Vector conversion functions (arrayToVector, vectorToArray)
  - Search functions (searchSimilarMessages, searchSimilarEvidence, searchAcrossAllVectors)
  - Insert/update functions with proper SQL template strings
  - Health check and initialization functions

### 6. vector-suggestions-service.ts (~50+ errors, 0 imports)
- **Original Path**: `lib/services/vector-suggestions-service.ts`
- **Issues**:
  - Severe formatting corruption (400+ lines compressed)
  - Object properties using wrong separators (`:` instead of `,`)
  - Backtick placement errors
  - Double question mark corruption (`? ?` instead of `??`)
  - Ternary operator issues (`: confidence |` instead of `, confidence:`)
- **Import Status**: ✅ **0 active imports - truly orphaned!**
- **Recommended Fix**: Complete rewrite if needed in future, or leave archived

## Next Steps

1. **XState Machines** (aiAssistantMachine): Rewrite using patterns from [xstate-svelte5.ts](../../utils/xstate-svelte5.ts)
2. **Store System** (xstate-store): Review XState v5 store documentation and rebuild
3. **RAG Service** (cached-rag-service): Update to use [unified-cache-service.ts](../../services/unified-cache-service.ts)
4. **Database Utils** (pgvector-utils): Migrate raw SQL to Drizzle ORM query builders

## Archive Date
February 8, 2026

## Session Context
- Session 10: Ternary expression fixes + file corruption cleanup
- Total errors before archiving: 2,055 (svelte-check)
- Files fixed in session: 13 files, 25+ errors eliminated
