# Phase 99: Corrupted Files Re-Integration Plan

## 📅 Created: January 14, 2026

## 🚨 Problem Statement

The codebase has **~95,000 TypeScript errors** caused by widespread syntax corruption from previous automated fix scripts. The corruption patterns include:

- `name, Type` instead of `name: Type` (parameter declarations)
- `bind, value=` instead of `bind:value=` (Svelte directives)
- `}$1}$1` garbage from failed regex replacements
- Minified/collapsed code losing line breaks
- `error, Error | unknown` instead of `error: Error | unknown` (catch blocks)

## ✅ Phase 99 Strategy: Targeted Cleanup

Instead of fixing 95k errors, we:
1. **Exclude corrupted directories** from TypeScript compilation
2. **Focus on core routes** (`/cases`, `/evidence`)
3. **Gradually re-integrate** files as they are fixed

## 📁 Excluded Directories (tsconfig.json)

### High-Priority Exclusions (Most Corrupted)

| Directory | Est. Errors | Purpose | Priority to Fix |
|-----------|-------------|---------|-----------------|
| `src/lib/services/**` | ~15,000 | Business logic services | HIGH |
| `src/lib/state/**` | ~5,000 | XState machines | MEDIUM |
| `src/lib/machines/**` | ~5,000 | XState machines | MEDIUM |
| `src/lib/optimization/**` | ~3,000 | Performance optimization | LOW |
| `src/lib/orchestration/**` | ~2,000 | AI orchestration | LOW |
| `src/lib/webgpu/**` | ~2,000 | WebGPU rendering | LOW |
| `src/lib/workers/**` | ~2,000 | Web Workers | LOW |
| `src/lib/cache/**` | ~1,500 | Caching layer | MEDIUM |
| `src/lib/caching/**` | ~1,500 | Caching layer | MEDIUM |
| `src/lib/gpu/**` | ~1,000 | GPU acceleration | LOW |
| `src/lib/simd/**` | ~1,000 | SIMD acceleration | LOW |
| `src/lib/integrations/**` | ~1,000 | Third-party integrations | LOW |
| `src/lib/composables/**` | ~500 | Svelte composables | MEDIUM |
| `src/lib/error-brain/**` | ~500 | Error analysis | LOW |
| `src/lib/agents/**` | ~500 | AI agents | LOW |

### Component Exclusions

| Directory | Reason |
|-----------|--------|
| `src/lib/components/three/**` | Three.js 3D components, heavily corrupted |
| `src/lib/components/ui/gaming/**` | NES/N64 style components, corrupted |
| `src/lib/components/source-validation/**` | Source validation, corrupted |

### Route Exclusions

| Pattern | Reason |
|---------|--------|
| `src/routes/test-*/**` | Test pages, not core functionality |
| `src/routes/rag-*/**` | RAG demo pages, experimental |
| `src/routes/demo/**` | Demo pages, experimental |
| `src/routes_parked/**` | Parked/archived routes |

## 🎯 Core Routes to Fix First

These routes MUST work for the application to be usable:

### Critical Routes

1. **`/cases`** - Case listing
   - Files: `src/routes/(app)/cases/+page.svelte`, `+page.server.ts`
   - Status: ⚠️ Needs verification

2. **`/cases/[id]`** - Case detail
   - Files: `src/routes/(app)/cases/[id]/+page.svelte`, `+page.server.ts`
   - Status: ⚠️ Needs verification

3. **`/evidence`** - Evidence listing
   - Files: `src/routes/(app)/evidence/+page.svelte`, `+page.server.ts`
   - Status: ⚠️ Needs verification

4. **`/`** - Homepage
   - Files: `src/routes/+page.svelte`, `+page.server.ts`
   - Status: ⚠️ Needs verification

5. **`/login`** - Authentication
   - Files: `src/routes/login/+page.svelte`, `+page.server.ts`
   - Status: ⚠️ Needs verification

### Supporting Files

- `src/routes/+layout.svelte` - Root layout
- `src/routes/+layout.server.ts` - Root layout server
- `src/lib/server/db/*` - Database layer (mostly clean)
- `src/lib/components/ui/` - Core UI components (selective fix)

## 🔧 Re-Integration Process

For each excluded directory:

### Step 1: Identify Critical Exports
```bash
# Find files that are imported by core routes
grep -r "from '\$lib/services/" src/routes/(app)/ | grep -v node_modules
```

### Step 2: Create Stub Files
Create minimal stub implementations for critical exports that core routes need.

### Step 3: Fix Original Files
Fix the original corrupted files using:
- Manual review for complex logic
- Targeted regex for known patterns
- AST-based fixes for structural issues

### Step 4: Test Integration
```bash
npm run check:svelte:fast
npm run dev -- --port 5175
```

### Step 5: Remove from Exclusion List
Update `tsconfig.json` to remove the directory from exclusions.

## 📝 Known Corruption Patterns to Fix

### Pattern 1: Parameter Type Annotations
```typescript
// WRONG
function foo(name, string, age, number) { }

// CORRECT
function foo(name: string, age: number) { }
```

### Pattern 2: Catch Block Types
```typescript
// WRONG
catch (error, Error | unknown) { }

// CORRECT
catch (error: Error | unknown) { }
```

### Pattern 3: Svelte Bind Directives
```svelte
<!-- WRONG -->
<input bind, value={text} />

<!-- CORRECT -->
<input bind:value={text} />
```

### Pattern 4: Object Property Access
```typescript
// WRONG
const x = obj, prop, subprop

// CORRECT
const x = obj.prop.subprop
```

### Pattern 5: Garbage Regex Artifacts
```typescript
// WRONG
}$1}$1

// CORRECT
(delete the garbage)
```

## 📊 Progress Tracking

| Phase | Directory | Status | Errors Before | Errors After |
|-------|-----------|--------|---------------|--------------|
| 99.1 | Core routes | 🔄 In Progress | ~95,000 | TBD |
| 99.2 | `src/lib/server/db` | ✅ Done | ~500 | ~0 |
| 99.3 | `src/lib/server/rabbitmq.ts` | ✅ Restored | N/A | 0 |
| 99.4 | `src/lib/workers/gpu-tensor-worker.ts` | ✅ Restored | N/A | 0 |
| 99.5 | Database migration | ✅ Done | N/A | N/A |

## 🚀 Next Steps

1. [ ] Run `npm run check:svelte:fast` with new exclusions
2. [ ] Verify error count is < 1,000
3. [ ] Start dev server: `npm run dev -- --port 5175`
4. [ ] Test `/cases` route
5. [ ] Test `/evidence` route
6. [ ] Test button clicks and navigation
7. [ ] Document any additional files that need fixing
8. [ ] Begin gradual re-integration of excluded directories

## 📚 References

- `tsconfig.json` - Current exclusion configuration
- `scripts/fix-comma-syntax-v3.mjs` - Automated fixer (use with caution)
- `documents/TODO_PHASE99.md` - Original Phase 99 plan
