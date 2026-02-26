# Svelte5 Error Remediation - Design Document

**Feature:** Systematic remediation of 70,232 TypeScript/Svelte errors
**Status:** Design Phase
**Priority:** CRITICAL - Blocks all development
**Date:** January 4, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [4-Phase Fix Strategy](#4-phase-fix-strategy)
3. [Automated Fix Scripts](#automated-fix-scripts)
4. [RAG/KAG Integration](#ragkag-integration)
5. [Verification System](#verification-system)
6. [Error Recovery](#error-recovery)
7. [Implementation Timeline](#implementation-timeline)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Svelte5 Error Remediation                 │
│                         System                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Fix Script Orchestrator         │
        │  (Coordinates all fix phases)           │
        └─────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│  Phase 1: Syntax  │                   │  RAG/KAG Engine   │
│  - Colon fixes    │◄──────────────────┤  - Qdrant search  │
│  - Redeclare      │                   │  - Neo4j graph    │
│  - Corruption     │                   │  - ACE context    │
└───────────────────┘                   └───────────────────┘
        │                                           ▲
        ▼                                           │
┌───────────────────┐                               │
│  Phase 2: Types   │                               │
│  - bits-ui        │───────────────────────────────┘
│  - Null safety    │
│  - Properties     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Phase 3: Migration│
│  - Runes          │
│  - Events         │
│  - Reactivity     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Phase 4: Imports  │
│  - Paths          │
│  - Circular deps  │
│  - Exports        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Verification     │
│  - tsc            │
│  - svelte-check   │
│  - lint           │
│  - tests          │
└───────────────────┘
```

### Data Flow

```
Error Analysis (logs/) → Fix Scripts → Modified Files → Verification → Report
                              ↓
                         RAG/KAG Query
                              ↓
                      Similar Fix Patterns
                              ↓
                      Apply Best Match
```

---

## 4-Phase Fix Strategy

### Phase 1: Syntax Fixes (30 minutes)

**Goal:** Fix all syntax errors that prevent TypeScript from parsing files

**Target Errors:** ~24,581 errors (35%)
**Expected Result:** 70,232 → 65,000 errors

#### 1.1 Colon Syntax Fixes

**Problem:** TypeScript union types using `:` instead of `|`

**Pattern:**
```typescript
// BEFORE (ERROR)
type Foo = string : number : boolean;

// AFTER (FIXED)
type Foo = string | number | boolean;
```

**Implementation:**
- Script: `scripts/fix-colon-syntax.mjs`
- Regex: `/:\s*(?=[A-Za-z_$])/g` → `| `
- Multi-pass: Run until no more matches
- Validation: Verify no `:` in type positions

**Estimated Fixes:** ~20,000 errors

#### 1.2 Duplicate Declaration Fixes

**Problem:** Multiple `export const` or `let` declarations in same scope

**Pattern:**
```typescript
// BEFORE (ERROR)
export const foo = 1;
export const foo = 2; // Cannot redeclare

// AFTER (FIXED)
export const foo = 1;
// Removed duplicate
```

**Implementation:**
- Script: `scripts/fix-redeclare.mjs`
- Strategy: Track declarations per scope, remove duplicates
- Preserve: Keep first declaration, remove subsequent
- Validation: Verify no duplicate declarations

**Estimated Fixes:** ~3,500 errors

#### 1.3 File Corruption Fixes

**Problem:** Malformed syntax, incomplete statements, corrupted imports

**Pattern:**
```typescript
// BEFORE (ERROR - incomplete function)
export function foo(

// AFTER (FIXED - restored from git or template)
export function foo(param: string): void {
  // Implementation
}
```

**Implementation:**
- Script: `scripts/fix-corruption.mjs`
- Strategy 1: Restore from git (`git checkout HEAD -- <file>`)
- Strategy 2: Restore from `.bak` files
- Strategy 3: Regenerate from templates
- Validation: Verify file parses successfully

**Estimated Fixes:** ~1,000 errors

---

### Phase 2: Type System Fixes (1 hour)

**Goal:** Fix all type errors that prevent TypeScript from type-checking

**Target Errors:** ~28,093 errors (40%)
**Expected Result:** 65,000 → 40,000 errors

#### 2.1 bits-ui Import Fixes

**Problem:** Incorrect bits-ui imports for Svelte 5

**Pattern:**
```typescript
// BEFORE (ERROR)
import { Dialog } from 'bits-ui';
// Property 'Root' does not exist on type 'ComponentCtor'

// AFTER (FIXED)
import { Dialog } from 'bits-ui/components/dialog';
```

**Implementation:**
- Script: `scripts/fix-bits-ui-imports.mjs`
- Mapping:
  - `Dialog` → `bits-ui/components/dialog`
  - `Select` → `bits-ui/components/select`
  - `Popover` → `bits-ui/components/popover`
  - `Tooltip` → `bits-ui/components/tooltip`
  - etc.
- Validation: Verify imports resolve correctly

**Estimated Fixes:** ~5,000 errors

#### 2.2 Null Safety Fixes

**Problem:** Object possibly null/undefined without checks

**Pattern:**
```typescript
// BEFORE (ERROR)
const value = obj.prop; // Object is possibly 'null'

// AFTER (FIXED)
const value = obj?.prop; // Optional chaining
// OR
const value = obj && obj.prop; // Null check
```

**Implementation:**
- Script: `scripts/fix-null-safety.mjs`
- Strategy: Add optional chaining (`?.`) for property access
- Fallback: Add null checks for complex cases
- Validation: Verify no null safety errors

**Estimated Fixes:** ~4,000 errors

#### 2.3 Missing Property Fixes

**Problem:** Properties missing from types/interfaces

**Pattern:**
```typescript
// BEFORE (ERROR)
interface User {
  name: string;
}
const user: User = { name: 'John', age: 30 }; // 'age' does not exist

// AFTER (FIXED)
interface User {
  name: string;
  age?: number; // Added missing property
}
```

**Implementation:**
- Script: `scripts/fix-missing-properties.mjs`
- Strategy: Analyze usage, add missing properties to interfaces
- Use RAG: Query similar interfaces for property patterns
- Validation: Verify properties exist in types

**Estimated Fixes:** ~10,000 errors

#### 2.4 Type Mismatch Fixes

**Problem:** Type assignments don't match expected types

**Pattern:**
```typescript
// BEFORE (ERROR)
const value: string = 123; // Type 'number' is not assignable to type 'string'

// AFTER (FIXED)
const value: string = String(123); // Convert to string
// OR
const value: number = 123; // Fix type annotation
```

**Implementation:**
- Script: `scripts/fix-type-mismatches.mjs`
- Strategy 1: Add type conversions
- Strategy 2: Fix type annotations
- Strategy 3: Add type assertions (`as Type`)
- Use RAG: Query similar type patterns
- Validation: Verify types match

**Estimated Fixes:** ~8,000 errors

---

### Phase 3: Svelte 5 Migration Fixes (2 hours)

**Goal:** Convert all Svelte 4 patterns to Svelte 5 runes

**Target Errors:** ~10,535 errors (15%)
**Expected Result:** 40,000 → 25,000 errors

#### 3.1 Props Migration (export let → $props)

**Problem:** Old Svelte 4 `export let` syntax

**Pattern:**
```svelte
<!-- BEFORE (ERROR) -->
<script lang="ts">
  export let name: string;
  export let age: number = 0;
</script>

<!-- AFTER (FIXED) -->
<script lang="ts">
  let { name, age = 0 }: { name: string; age?: number } = $props();
</script>
```

**Implementation:**
- Script: `scripts/fix-svelte5-props.mjs`
- Strategy:
  1. Find all `export let` declarations
  2. Extract prop names, types, defaults
  3. Generate `$props()` destructuring
  4. Replace old syntax
- Validation: Verify props work correctly

**Estimated Fixes:** ~3,000 errors

#### 3.2 State Migration (let → $state)

**Problem:** Local state not using `$state()` rune

**Pattern:**
```svelte
<!-- BEFORE (ERROR) -->
<script lang="ts">
  let count = 0; // state_referenced_locally
</script>

<!-- AFTER (FIXED) -->
<script lang="ts">
  let count = $state(0);
</script>
```

**Implementation:**
- Script: `scripts/fix-svelte5-state.mjs`
- Strategy:
  1. Find reactive variables (used in template)
  2. Wrap with `$state()`
  3. Handle objects: `$state({ ... })`
- Validation: Verify reactivity works

**Estimated Fixes:** ~2,500 errors

#### 3.3 Reactive Statements Migration ($: → $derived/$effect)

**Problem:** Old reactive statements using `$:`

**Pattern:**
```svelte
<!-- BEFORE (ERROR) -->
<script lang="ts">
  let count = 0;
  $: doubled = count * 2; // Old reactive statement
  $: console.log(count); // Side effect
</script>

<!-- AFTER (FIXED) -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2); // Derived value
  $effect(() => {
    console.log(count); // Side effect
  });
</script>
```

**Implementation:**
- Script: `scripts/fix-svelte5-reactive.mjs`
- Strategy:
  1. Identify reactive statements (`$:`)
  2. Classify: Derived value vs side effect
  3. Convert to `$derived()` or `$effect()`
- Validation: Verify reactivity works

**Estimated Fixes:** ~3,000 errors

#### 3.4 Event Handler Migration (on:click → onclick)

**Problem:** Old event handler syntax

**Pattern:**
```svelte
<!-- BEFORE (ERROR) -->
<button on:click={handleClick}>Click</button>

<!-- AFTER (FIXED) -->
<button onclick={handleClick}>Click</button>
```

**Implementation:**
- Script: `scripts/fix-svelte5-events.mjs`
- Mapping:
  - `on:click` → `onclick`
  - `on:input` → `oninput`
  - `on:change` → `onchange`
  - etc.
- Validation: Verify events fire correctly

**Estimated Fixes:** ~2,000 errors

---

### Phase 4: Import/Export Fixes (3 hours)

**Goal:** Fix all import/export errors and circular dependencies

**Target Errors:** ~7,023 errors (10%)
**Expected Result:** 25,000 → 5,000 errors

#### 4.1 Import Path Fixes

**Problem:** Incorrect import paths

**Pattern:**
```typescript
// BEFORE (ERROR)
import { foo } from './utils'; // Cannot find module

// AFTER (FIXED)
import { foo } from './utils/foo'; // Correct path
// OR
import { foo } from '$lib/utils/foo'; // Use alias
```

**Implementation:**
- Script: `scripts/fix-import-paths.mjs`
- Strategy:
  1. Resolve import paths
  2. Check file existence
  3. Fix relative paths
  4. Add file extensions if needed
- Validation: Verify imports resolve

**Estimated Fixes:** ~2,000 errors

#### 4.2 Circular Dependency Fixes

**Problem:** Circular imports between modules

**Pattern:**
```typescript
// BEFORE (ERROR)
// a.ts
import { B } from './b';
export class A { b: B; }

// b.ts
import { A } from './a'; // Circular!
export class B { a: A; }

// AFTER (FIXED)
// types.ts (new file)
export interface A { b: B; }
export interface B { a: A; }

// a.ts
import type { B } from './types';
export class A { b: B; }

// b.ts
import type { A } from './types';
export class B { a: A; }
```

**Implementation:**
- Script: `scripts/fix-circular-deps.mjs`
- Strategy:
  1. Detect circular dependencies
  2. Extract shared types to separate file
  3. Use `import type` for type-only imports
  4. Refactor if needed
- Validation: Verify no circular warnings

**Estimated Fixes:** ~1,000 errors

#### 4.3 Missing Export Fixes

**Problem:** Missing exports or incorrect import statements

**Pattern:**
```typescript
// BEFORE (ERROR)
// utils.ts
const foo = 'bar'; // Not exported

// main.ts
import { foo } from './utils'; // Cannot find 'foo'

// AFTER (FIXED)
// utils.ts
export const foo = 'bar'; // Added export
```

**Implementation:**
- Script: `scripts/fix-missing-exports.mjs`
- Strategy:
  1. Find missing export errors
  2. Add `export` keyword
  3. Or fix import statement
- Validation: Verify exports exist

**Estimated Fixes:** ~2,000 errors

---

## Automated Fix Scripts

### Script Architecture

All fix scripts follow this pattern:

```javascript
// scripts/fix-<category>.mjs
import fs from 'fs';
import path from 'path';

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Statistics
let filesProcessed = 0;
let filesModified = 0;
let fixesApplied = 0;

// Main function
async function fixErrors(targetDir) {
  const files = await getFiles(targetDir);

  for (const file of files) {
    filesProcessed++;
    const content = fs.readFileSync(file, 'utf8');
    const fixed = applyFixes(content, file);

    if (fixed !== content) {
      filesModified++;
      if (!DRY_RUN) {
        fs.writeFileSync(file, fixed, 'utf8');
      }
    }
  }

  printReport();
}

// Apply fixes (multi-pass)
function applyFixes(content, file) {
  let fixed = content;
  let prevFixed = '';
  let passes = 0;

  // Run until no more changes
  while (fixed !== prevFixed && passes < 10) {
    prevFixed = fixed;
    fixed = applyFixPattern(fixed, file);
    passes++;
  }

  return fixed;
}

// Apply specific fix pattern
function applyFixPattern(content, file) {
  // Pattern-specific logic
  // Use RAG/KAG for complex cases
  return content;
}

// Print report
function printReport() {
  console.log(`
╔════════════════════════════════════════╗
║         Fix Script Report              ║
╠════════════════════════════════════════╣
║ Files Processed:  ${filesProcessed.toString().padStart(4)}              ║
║ Files Modified:   ${filesModified.toString().padStart(4)}              ║
║ Fixes Applied:    ${fixesApplied.toString().padStart(4)}              ║
╚════════════════════════════════════════╝
  `);
}

// Run
fixErrors(process.argv[2] || 'src');
```

### Script Execution Order

```bash
# Phase 1: Syntax (30 min)
node scripts/fix-colon-syntax.mjs src --apply
node scripts/fix-redeclare.mjs src --apply
node scripts/fix-corruption.mjs src --apply

# Verify Phase 1
npx tsc --noEmit > logs/phase1-errors.txt

# Phase 2: Types (1 hour)
node scripts/fix-bits-ui-imports.mjs src --apply
node scripts/fix-null-safety.mjs src --apply
node scripts/fix-missing-properties.mjs src --apply
node scripts/fix-type-mismatches.mjs src --apply

# Verify Phase 2
npx tsc --noEmit > logs/phase2-errors.txt

# Phase 3: Migration (2 hours)
node scripts/fix-svelte5-props.mjs src --apply
node scripts/fix-svelte5-state.mjs src --apply
node scripts/fix-svelte5-reactive.mjs src --apply
node scripts/fix-svelte5-events.mjs src --apply

# Verify Phase 3
npx svelte-check > logs/phase3-errors.txt

# Phase 4: Imports (3 hours)
node scripts/fix-import-paths.mjs src --apply
node scripts/fix-circular-deps.mjs src --apply
node scripts/fix-missing-exports.mjs src --apply

# Final Verification
npx tsc --noEmit > logs/final-errors.txt
npx svelte-check > logs/final-svelte-errors.txt
```

---

## RAG/KAG Integration

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│              RAG/KAG Fix Pattern Engine                 │
└─────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Qdrant     │  │    Neo4j     │  │     ACE      │
│ Vector Store │  │ Knowledge    │  │  Contextual  │
│              │  │   Graph      │  │ Engineering  │
└──────────────┘  └──────────────┘  └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  Fix Pattern DB  │
              │  - Error pattern │
              │  - Fix pattern   │
              │  - Success rate  │
              │  - Context       │
              └──────────────────┘
```

### RAG Query Flow

1. **Error Detection**
   - Script encounters complex error
   - Extract error pattern and context

2. **Semantic Search (Qdrant)**
   - Generate embedding for error pattern
   - Query Qdrant for similar errors
   - Return top 5 matches with similarity scores

3. **Graph Traversal (Neo4j)**
   - Query knowledge graph for related fixes
   - Find fix patterns with high success rates
   - Consider file context and dependencies

4. **Contextual Analysis (ACE)**
   - Analyze error in full file context
   - Consider project-wide patterns
   - Apply contextual engineering principles

5. **Fix Selection**
   - Rank fixes by:
     - Similarity score (Qdrant)
     - Success rate (Neo4j)
     - Context relevance (ACE)
   - Select highest-scoring fix

6. **Apply & Learn**
   - Apply selected fix
   - Verify fix works
   - Store successful fix in knowledge base

### Knowledge Base Schema

```typescript
interface FixPattern {
  id: string;
  errorPattern: string;
  errorCategory: 'syntax' | 'type' | 'migration' | 'import';
  fixPattern: string;
  successRate: number;
  timesApplied: number;
  fileContext: string[];
  dependencies: string[];
  embedding: number[]; // 384-dim vector
  createdAt: Date;
  updatedAt: Date;
}
```

### RAG Integration Points

**Phase 2: Type Fixes**
- Query RAG for similar type errors
- Learn from successful type conversions
- Apply patterns from similar files

**Phase 3: Migration Fixes**
- Query RAG for Svelte 5 migration patterns
- Learn from successful rune conversions
- Apply patterns from similar components

**Phase 4: Import Fixes**
- Query RAG for import resolution patterns
- Learn from successful path fixes
- Apply patterns from similar modules

---

## Verification System

### Multi-Level Verification

```
┌─────────────────────────────────────────┐
│         Verification Pipeline           │
└─────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
        ▼         ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│   tsc    │ │  svelte  │ │  eslint  │
│ --noEmit │ │  -check  │ │          │
└──────────┘ └──────────┘ └──────────┘
        │         │         │
        └─────────┼─────────┘
                  │
                  ▼
        ┌──────────────────┐
        │   Test Suite     │
        │  npm run test    │
        └──────────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │  Final Report    │
        │  - Error count   │
        │  - Files fixed   │
        │  - Remaining     │
        └──────────────────┘
```

### Verification Commands

```bash
# TypeScript compilation
npx tsc --noEmit 2>&1 | tee logs/verification-tsc.txt

# Svelte validation
npx svelte-check 2>&1 | tee logs/verification-svelte.txt

# ESLint
npm run lint 2>&1 | tee logs/verification-lint.txt

# Unit tests
npm run test:run 2>&1 | tee logs/verification-tests.txt
```

### Success Criteria

- ✅ `tsc --noEmit` exits with code 0
- ✅ `svelte-check` reports 0 errors
- ✅ `npm run lint` reports 0 errors
- ✅ `npm run test:run` all tests pass
- ✅ `npm run build` completes successfully

---

## Error Recovery

### Rollback Strategy

```bash
# Before starting fixes
git checkout -b svelte5-error-fixes
git commit -m "Checkpoint: Before error fixes"

# After each phase
git add .
git commit -m "Phase 1: Syntax fixes complete"

# If something goes wrong
git reset --hard HEAD~1  # Rollback last commit
```

### Backup Strategy

```bash
# Create backup before running scripts
cp -r src src.backup.$(date +%Y%m%d_%H%M%S)

# Restore from backup if needed
rm -rf src
cp -r src.backup.20260104_120000 src
```

### File-Level Recovery

```bash
# Restore single file from git
git checkout HEAD -- src/lib/components/Button.svelte

# Restore from .bak file
cp src/lib/components/Button.svelte.bak src/lib/components/Button.svelte
```

---

## Implementation Timeline

### Detailed Schedule

| Phase | Task | Duration | Errors Fixed | Cumulative |
|-------|------|----------|--------------|------------|
| **Phase 1** | | **30 min** | **5,232** | **65,000** |
| 1.1 | Colon syntax fixes | 15 min | 20,000 | 50,232 |
| 1.2 | Duplicate declarations | 10 min | 3,500 | 46,732 |
| 1.3 | File corruption | 5 min | 1,000 | 45,732 |
| 1.4 | Verify Phase 1 | 5 min | - | - |
| **Phase 2** | | **1 hour** | **25,000** | **40,000** |
| 2.1 | bits-ui imports | 15 min | 5,000 | 40,732 |
| 2.2 | Null safety | 15 min | 4,000 | 36,732 |
| 2.3 | Missing properties | 20 min | 10,000 | 26,732 |
| 2.4 | Type mismatches | 15 min | 8,000 | 18,732 |
| 2.5 | Verify Phase 2 | 10 min | - | - |
| **Phase 3** | | **2 hours** | **15,000** | **25,000** |
| 3.1 | Props migration | 30 min | 3,000 | 15,732 |
| 3.2 | State migration | 30 min | 2,500 | 13,232 |
| 3.3 | Reactive statements | 40 min | 3,000 | 10,232 |
| 3.4 | Event handlers | 20 min | 2,000 | 8,232 |
| 3.5 | Verify Phase 3 | 15 min | - | - |
| **Phase 4** | | **3 hours** | **20,000** | **5,000** |
| 4.1 | Import paths | 1 hour | 2,000 | 6,232 |
| 4.2 | Circular dependencies | 1 hour | 1,000 | 5,232 |
| 4.3 | Missing exports | 45 min | 2,000 | 3,232 |
| 4.4 | Verify Phase 4 | 30 min | - | - |
| **Final** | | **30 min** | | |
| 5.1 | Full verification | 15 min | - | - |
| 5.2 | Generate report | 10 min | - | - |
| 5.3 | Manual review | 5 min | - | - |
| **TOTAL** | | **7 hours** | **65,232** | **5,000** |

### Milestones

- ✅ **Milestone 1:** Phase 1 complete (30 min) - 70k → 65k errors
- ✅ **Milestone 2:** Phase 2 complete (1.5 hrs) - 65k → 40k errors
- ✅ **Milestone 3:** Phase 3 complete (3.5 hrs) - 40k → 25k errors
- ✅ **Milestone 4:** Phase 4 complete (6.5 hrs) - 25k → 5k errors
- ✅ **Milestone 5:** Final verification (7 hrs) - Production ready

---

## Next Steps

1. **Review Design** - Confirm approach with team
2. **Create Tasks** - Break down into actionable tasks
3. **Implement Scripts** - Build automated fix scripts
4. **Test Scripts** - Dry-run on sample files
5. **Execute Phases** - Run fixes in order
6. **Verify Results** - Run full verification suite
7. **Generate Report** - Document results and remaining errors

---

**Status:** ✅ Design Complete - Ready for Tasks
**Next Step:** Create tasks.md with detailed implementation tasks
**Estimated Total Time:** 7 hours to reduce from 70k → 5k errors
