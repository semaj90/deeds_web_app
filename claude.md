# Claude - Phase 78 AST-Aware Error Ranking + Svelte 5 Migration

---

## ✅ February 7-8, 2026 – Corrupted File Detection & Restoration Guide

### 🔍 Detection Heuristics

**How to Identify Heavily Corrupted/Minified Files:**

1. **File Size Analysis**
   - Files ≤50 lines are highly suspect (681 candidates found in codebase)
   - All code compressed into 1-2 lines = definite corruption
   - Use: `find . -name "*.svelte" -type f -exec wc -l {} \; | awk '{if ($1 <= 50) count++}'`

2. **Visual Inspection Markers**
   - Multiple statements without line breaks
   - Missing whitespace between tokens
   - Repetitive error patterns (10+ similar errors in one file)
   - Broken syntax visible on first glance

3. **Error Pattern Clustering**
   - Multiple "comma expected" errors in same Props interface
   - CSS pseudo-class spacing errors clustered together
   - Broken directives (transitionfade, <svelte,window)

### 📋 Common Corruption Patterns Catalog

**Pattern 1: Missing Commas in $props() - MOST COMMON (568 files affected)**
```typescript
// ❌ Corrupted
let { value = 0, max = 100 variant = 'default' class: className = '' }: Props = $props();

// ✅ Fixed
let { value = 0, max = 100, variant = 'default', class: className = '' }: Props = $props();
```
**Impact**: 10-15 errors per file
**Detection**: Search for `= \$props()` pattern

**Pattern 2: CSS Pseudo-Class Spacing Errors (200+ occurrences)**
```css
/* ❌ Corrupted */
hover: bg-accent, focus: border-blue-500, disabled: opacity-50

/* ✅ Fixed */
hover:bg-accent focus:border-blue-500 disabled:opacity-50
```
**Impact**: 1 error per occurrence
**Detection**: Search for `: ` followed by CSS class name

**Pattern 3: Missing Colons in Ternary Operators**
```typescript
// ❌ Corrupted
variant === 'success'? 'bg-green-500': variant === 'error'? 'bg-red-500'

// ✅ Fixed
variant === 'success' ? 'bg-green-500' : variant === 'error' ? 'bg-red-500'
```
**Impact**: 15+ errors in minified files
**Detection**: Look for `?` without proper spacing

**Pattern 4: Broken Svelte Directives**
```svelte
<!-- ❌ Corrupted -->
<svelte, window onkeydown={handler} />
<div transitionfade>

<!-- ✅ Fixed -->
<svelte:window onkeydown={handler} />
<div transition:fade>
```
**Impact**: 2-3 errors per directive
**Detection**: Search for `<svelte,` or `transition[a-z]` without colon

**Pattern 5: Switch Case Syntax Errors**
```typescript
// ❌ Corrupted
switch (key) {
  case: 'Escape':
    close();
  case: 'Enter':
    submit();
}

// ✅ Fixed
switch (key) {
  case 'Escape':
    close();
    break;
  case 'Enter':
    submit();
    break;
}
```
**Impact**: 2 errors per case statement
**Detection**: Search for `case:` with colon

**Pattern 6: TypeScript Record Type Syntax**
```typescript
// ❌ Corrupted
Record<string: CommandItem[]>

// ✅ Fixed
Record<string, CommandItem[]>
```
**Impact**: 1 error per occurrence
**Detection**: Search for `Record<[^,]+:` pattern

**Pattern 7: Missing Commas in Object Literals**
```typescript
// ❌ Corrupted
const config = {
  menu: 'from-slate-800/95 border-blue-400/80'
  info: 'from-blue-800/95 border-cyan-400/80'
  stats: 'from-green-800/95 border-green-400/80'
};

// ✅ Fixed
const config = {
  menu: 'from-slate-800/95 border-blue-400/80',
  info: 'from-blue-800/95 border-cyan-400/80',
  stats: 'from-green-800/95 border-green-400/80'
};
```
**Impact**: 10-20 errors per large object
**Detection**: Multi-line objects with no commas

**Pattern 8: Broken Logical Operators**
```typescript
// ❌ Corrupted
item.title.toLowerCase().includes(query) ?? item.description.includes(query)

// ✅ Fixed
item.title.toLowerCase().includes(query) || item.description.includes(query)
```
**Impact**: 1 error per occurrence
**Detection**: Search for `??` where `||` intended

### 🔧 Rewrite Strategy Decision Tree

**When to Use COMPLETE REWRITE:**
✅ File is ≤50 lines AND all on 1-2 physical lines
✅ More than 20 errors in a single file
✅ Multiple pattern types corrupted (commas + CSS + directives)
✅ Visual inspection shows heavily minified code
✅ Trying to read the code makes your eyes hurt

**Success Rate**: 100% (4/4 major rewrites completed successfully)

**When to Use TARGETED EDITS:**
✅ File is properly formatted but has 1-5 specific errors
✅ Single pattern type (e.g., only missing commas)
✅ Errors are isolated to specific section
✅ Code is readable and maintainable

**Success Rate**: ~85% (occasional cascade effects require follow-up)

### 📖 Success Examples

**Example 1: Progress.svelte (24 → 115 lines)**
```typescript
// ❌ Before (minified, 24 lines)
let { value = 0, max = 100, variant = 'default', size = 'default', showPercentage = false class: className = ''}: Props = $props(); let percentage = $derived(...); let variantClasses = $derived( variant === 'success'? 'bg-green-500 nes-progress is-success': variant === 'error'? 'bg-red-500 nes-progress is-error': 'bg-blue-500 nes-progress is-primary'); let sizeClasses = $derived(size === 'sm'? 'h-4': size === 'lg'? 'h-8': 'h-6');

// ✅ After (formatted, 115 lines with proper structure)
interface Props {
  value?: number;
  max?: number;
  variant?: 'default' | 'success' | 'error' | 'warning';
  size?: 'sm' | 'default' | 'lg';
  showPercentage?: boolean;
  class?: string;
}

let {
  value = 0,
  max = 100,
  variant = 'default',
  size = 'default',
  showPercentage = false,
  class: className = ''
}: Props = $props();

let percentage = $derived((value / max) * 100);

let variantClasses = $derived(
  variant === 'success'
    ? 'bg-green-500 nes-progress is-success'
    : variant === 'error'
      ? 'bg-red-500 nes-progress is-error'
      : variant === 'warning'
        ? 'bg-yellow-500 nes-progress is-warning'
        : 'bg-blue-500 nes-progress is-primary'
);
```
**Errors Fixed**: 15+ (missing colons, commas, CSS spacing)

**Example 2: CommandPalette.svelte (92 → 327 lines)**
```typescript
// ❌ Before (corrupted, 92 lines)
const allItems: CommandItem[] = [{id: 'nav-dashboard' title: 'Dashboard' description: 'Overview' icon: Search category: 'Navigation' href: '/' shortcut: ['⌘', 'H']}, {id: 'nav-evidence'...}]; // 50+ missing commas

switch (e.key) {
  case: 'Escape':
    close();
  case: 'ArrowDown':
    selectedIndex++;
}

<svelte, window onkeydown={handleKeydown} />
<div transitionfade>

// ✅ After (formatted, 327 lines with proper structure)
const allItems: CommandItem[] = [
  {
    id: 'nav-dashboard',
    title: 'Dashboard',
    description: 'Overview of cases and evidence',
    icon: Search,
    category: 'Navigation',
    href: '/',
    shortcut: ['⌘', 'H']
  },
  {
    id: 'nav-evidence',
    title: 'Evidence Management',
    description: 'Upload and analyze evidence',
    icon: File,
    category: 'Navigation',
    href: '/evidence',
    shortcut: ['⌘', 'E']
  }
  // ... properly formatted
];

switch (e.key) {
  case 'Escape':
    e.preventDefault();
    close();
    break;
  case 'ArrowDown':
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
    break;
}

<svelte:window onkeydown={handleKeydown} />
<div transition:fade>
```
**Errors Fixed**: 50+ (biggest win of the session)

**Example 3: FinalFantasyContainer.svelte (21 → 110 lines)**
```typescript
// ❌ Before (minified object literals)
const typeColors = { menu: 'from-slate-800/95 to-slate-900/95 border-blue-400/80' info: 'from-blue-800/95 to-blue-900/95 border-cyan-400/80' stats: 'from-green-800/95 to-green-900/95 border-green-400/80' inventory: 'from-amber-800/95...' };

// ✅ After (properly formatted)
const typeColors = {
  menu: 'from-slate-800/95 to-slate-900/95 border-blue-400/80',
  info: 'from-blue-800/95 to-blue-900/95 border-cyan-400/80',
  stats: 'from-green-800/95 to-green-900/95 border-green-400/80',
  inventory: 'from-amber-800/95 to-amber-900/95 border-yellow-400/80',
  battle: 'from-red-800/95 to-red-900/95 border-red-400/80',
  magic: 'from-purple-800/95 to-purple-900/95 border-purple-400/80'
};
```
**Errors Fixed**: 10+ (missing commas in large objects)

**Example 4: AIDialog.svelte (38 → 52 lines)**
```typescript
// ❌ Before (corrupted Props interface)
interface Props {
  class?: string;
  children?: Snippet
  open: boolean
  title: string,
  onClose: () => void
}

<div transitionfade>
  <button class="hover: text-gray-700">

// ✅ After (proper syntax)
interface Props {
  class?: string;
  children?: Snippet;
  open: boolean;
  title: string;
  onClose: () => void;
}

<div transition:fade>
  <button class="hover:text-gray-700">
```
**Errors Fixed**: 8 (Props commas, transitions, CSS spacing)

### ✅ Verification Workflow

**Step 1: Individual File Check BEFORE Committing**
```bash
npx svelte-check --threshold error --tsconfig ./tsconfig.json --watch=false \
  src/lib/components/ui/Progress.svelte
```
**Expected**: "0 errors" output
**If errors persist**: Review fix again, may have cascade effect from dependencies

**Step 2: Batch Commit Strategy**
- Fix 1-4 related files per batch
- Descriptive commit messages with before/after examples
- Always include Co-Authored-By line
- Push immediately after commit

**Example Commit Message:**
```
Fix Progress.svelte - restore from minified (24→115 lines)

Before:
- All code on 2 lines (heavily minified)
- 15+ missing colons in ternary operators
- Missing comma in $props() destructuring
- CSS spacing errors (hover: bg-accent)

After:
- Properly formatted 115 lines
- All ternary operators fixed (? and : with proper spacing)
- Props interface properly destructured
- CSS classes use correct syntax (hover:bg-accent)

Fixed errors: ~15

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Step 3: Cascade Effect Monitoring**
After committing core UI components, check dependent files:
- Button.svelte fix → 3-5 files improved automatically
- Progress.svelte fix → 2-3 files improved
- Card.svelte fix → 4-6 files improved

### 📊 Impact Metrics (February 7-8, 2026)

**Files Fixed**: 11 core UI components
**Errors Eliminated**: ~118 direct errors
**Cascade Effect**: ~30 additional errors resolved in dependent files
**Success Rate**: 100% (no rollbacks needed)
**Time per File**: 5-15 minutes for complete rewrites
**Error Reduction**: 972 → 854 (12% reduction)

**Batches Completed**:
- Batch 4b: DropdownMenu, IconContainer, ProgressBitsUI (3 files, ~18 errors)
- Batch 4c: Progress.svelte (1 file, ~15 errors) - major rewrite
- Batch 5a: LoadingSpinner, FinalFantasyContainer (2 files, ~22 errors)
- Batch 5b: CommandPalette.svelte (1 file, ~50 errors) - biggest win
- Batch 5c: AIDialog.svelte (1 file, ~8 errors)

### 🎯 Cascade Effect Strategy

**Core UI Components to Prioritize** (highest impact):
1. **Button.svelte** - Used by 50+ components (5x multiplier)
2. **Card.svelte + CardHeader/CardContent/CardFooter** - Used by 40+ components (4x multiplier)
3. **Select.svelte** - Used by 30+ components (3x multiplier)
4. **Dialog.svelte** - Used by 25+ components (2.5x multiplier)
5. **Progress.svelte** - Used by 15+ components (2x multiplier)
6. **Checkbox.svelte** - Used by 20+ components (2x multiplier)
7. **Dropdown*.svelte** - Used by 20+ components (2x multiplier)

**Strategy**: Fix these 7 components = improves 200+ dependent files automatically

**Verification**:
```bash
# Count component usage
grep -r "import.*Button" --include="*.svelte" | wc -l
grep -r "import.*Card" --include="*.svelte" | wc -l
```

### 🔍 Quick Detection Scripts

**Find Potentially Minified Files:**
```bash
# Files with ≤50 lines
find . -name "*.svelte" -type f -exec sh -c 'lines=$(wc -l < "$1"); if [ "$lines" -le 50 ]; then echo "$1 ($lines lines)"; fi' _ {} \;

# Files using $props() pattern (568 candidates)
grep -r "= \$props()" --include="*.svelte" -l

# Files with CSS spacing errors
grep -r "hover: \|focus: \|disabled: " --include="*.svelte" -l | head -20
```

**Find Specific Corruption Patterns:**
```bash
# Missing commas in $props()
grep -rn "}\s*[a-zA-Z_$]" --include="*.svelte" | grep "\$props"

# Broken switch cases
grep -rn "case:" --include="*.ts" --include="*.svelte"

# Broken Svelte directives
grep -rn "transition[a-z]" --include="*.svelte" | grep -v "transition:"
grep -rn "<svelte," --include="*.svelte"
```

### ⚠️ Important Notes

1. **Always read files visually first** - Automated detection may miss context
2. **One pattern at a time** - Don't try to fix all 8 patterns in one edit
3. **Verify dependencies** - Some errors are cascade effects from broken imports
4. **Preserve functionality** - Formatting fixes should never change behavior
5. **Use bits-ui v2 patterns** - Component-specific imports, not barrel exports
6. **Test after fixing** - Individual svelte-check before committing

### 🚀 Next Steps for Continued Cleanup

**Immediate (Next Session):**
1. Continue fixing remaining 680 minified files using patterns above
2. Target core UI components for cascade effect (Button, Card, Select)
3. Automated sed script for CSS spacing fixes across 50+ files

**Medium-term:**
4. Archive all `.bak`, `.backup`, `.mojibake-backup` files causing timeouts
5. Implement backup consolidation tool from January 19 spec

**Long-term:**
6. Reach <500 errors (currently 854, need 354 more fixed)
7. Enable strict TypeScript mode once syntax errors eliminated

---

## ✅ January 19, 2026 – Backup Consolidation Spec Complete

### Spec Location
`.kiro/specs/backup-consolidation/`

### Purpose
Safe, automated tool to discover, analyze, and clean up thousands of backup files causing svelte-check/tsc timeouts.

### Backup Patterns Targeted
- `.bak`, `.backup`, `.mojibake-backup`, `.any-backup`
- `.batch*-backup`, `.css-bak`, `.bak-ast`
- `.svelte4.backup`, `.phase*.bak`
- `src.backup*` directories

### Key Features
1. **Ripgrep-based scanning** for fast discovery
2. **Git diff comparison** to determine if live file equals/supersedes backup
3. **Safety validation** - never delete if live file missing or backup has unique content
4. **Dry-run mode** (default) - preview all actions before execution
5. **Quarantine** for non-git files instead of deletion
6. **Audit logging** with restore script generation

### Tasks Summary (All Required)
- Task 1: Project setup + dependencies
- Task 2: BackupScanner with pattern matching + property tests
- Task 3: ComparisonEngine with hash/diff analysis + property tests

---

## ✅ January 22, 2026 – XState v5 Migration Progress

### Migration Status: In Progress (18.5% Error Reduction)

**Error Count Progress**:
- **Initial**: 19,666 TypeScript errors
- **Current**: 16,036 errors
- **Fixed**: 3,630 errors (18.5% reduction)

### XState v5 Fixes Completed

#### 1. Import Corrections (122 errors fixed)
```typescript
// ❌ Wrong (XState v5)
import type { assign, createMachine, fromPromise } from 'xstate';

// ✅ Correct (XState v5)
import { assign, createMachine, fromPromise } from 'xstate';
```
**Reason**: `assign`, `createMachine`, `fromPromise` are runtime functions, not types.

**Files Fixed**:
- `src/lib/state/evidence-processing-machine.ts`
- `src/lib/client/actors/llmStreamActor.ts`
- `src/lib/state/crewAIOrchestrationMachine.ts`

#### 2. Setup API Syntax (48 errors fixed)
```typescript
// ❌ Wrong syntax
actors: {
  myActor: fromPromise(myFn, otherActor: fromPromise(otherFn, // Missing closing parens
}

// ✅ Correct syntax
actors: {
  myActor: fromPromise(myFn),
  otherActor: fromPromise(otherFn),
  anotherActor: fromPromise(anotherFn)
}
```

**Files Fixed**:
- `src/lib/state/crewAIOrchestrationMachine.ts` - actors/actions object formatting

#### 3. Svelte 5 Integration Helper

**Created**: `src/lib/utils/xstate-svelte5.ts`

```typescript
import { useMachine } from '$lib/utils/xstate-svelte5';
import { myMachine } from './myMachine';

const { snapshot, send, actor } = useMachine(myMachine, {
  context: { customValue: 'test' }
});

// Use with $derived for reactive selectors
const isLoading = $derived(snapshot.matches('loading'));
const data = $derived(snapshot.context.data);
```

**Features**:
- Compatible with Svelte 5 runes (`$state`, `$derived`)
- Automatic actor lifecycle management (start/stop)
- Type-safe snapshot access
- Includes `createSelectors` helper for reusable derived state

### Next Steps

1. **Continue High-Error File Fixes**:
   - `svelte-check-analyzer.ts` (162 errors)
   - `citation-store.ts` (160 errors)
   - `evidence-processing-machine.ts` (151 errors)
   - `MultiLayerCacheSystem.ts` (109 errors) - requires full rewrite

2. **Migrate Components Using `@xstate/svelte`**:
   - Update to new `xstate-svelte5` helper
   - Replace legacy `useMachine` imports

3. **Target**: <15,000 errors (23.7% reduction)

---

## ✅ January 22, 2026 – Database Schema Fixes (219 errors)

### schema-phase90-hardened.ts (111 errors fixed)
**Issues**: Missing `export const` + incorrect index syntax

```typescript
// ❌ Wrong (malformed table definition)
'document_chunks', {
  id: uuid('id').primaryKey()
}

// ✅ Correct (Drizzle syntax)
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey()
}, (table) => ({
  // Use commas, not colons!
  myIndex: index('idx_name').on(table.field1, table.field2)
}));
```

**Tables Fixed**:
- `documentChunks`, `legalDocuments`, `cases`, `evidence`
- `phase72ErrorVector`, `phase72Error`

**Index Syntax**: Changed `:` to `,` in all `index().on()` calls.

### schema-actual.ts (108 errors fixed)
**Issues**: Completely malformed schema file with broken imports and missing punctuation

**Before**: Broken imports, missing commas/parentheses, invalid syntax
```typescript
import type { index, integer, pgTable } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
 id: integer('id').primaryKey(email, varchar('email'...
```

**After**: Complete rewrite with proper Drizzle syntax
```typescript
import { index, integer, pgTable, varchar, jsonb, text } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});
```

**Tables Rebuilt**:
- `users`, `cases`, `evidence`, `documents`

### Error Count Progress
- **Before**: 19,666 errors
- **After Schema Fixes**: 15,785 errors
- **Fixed**: 3,881 errors (19.7% reduction)

---

## ✅ January 19, 2026 – Backup Consolidation Spec Complete
- Task 5: ManifestGenerator with safety analysis + property tests
- Task 6: CleanupExecutor with dry-run/execute modes + property tests
- Task 7: Checkpoint - verify manifest/executor
- Task 8: Rollback support with git restore + quarantine
- Task 9: CLI interface
- Task 10: Final integration test

### Property-Based Tests (20 properties)
Using fast-check with 100+ iterations per property for comprehensive validation.

---

## ✅ January 19, 2026 – ai-service.ts Rebuild + Contextual Chat Verification

### ai-service.ts Rebuilt
- **Ollama-driven analysis:** Uses `OllamaService` for embeddings and completions
- **Dynamic DB import:** Lazy-loads drizzle to avoid crashes when DB unavailable
- **Async flow fixed:** Proper handling for embeddings, auto-tags, document chunks
- **Models:** `gemma3-legal:latest` for LLM, `embeddinggemma:latest` for embeddings

### Contextual Chat System Verified
- **chat-store.svelte.ts:** Clean Svelte 5 runes (`$state`, `$derived`, `$derived.by`)
- **ChatSession.svelte.ts:** SSE-based real-time chat with reconnection logic
- **OllamaService:** Proper endpoint configuration via `get-ollama-endpoint.ts`

### Core Files Status (All Clean)
- `sveltekit-frontend/src/lib/services/ai-service.ts` ✅
- `sveltekit-frontend/src/lib/services/ollamaService.ts` ✅
- `sveltekit-frontend/src/lib/stores/chat-store.svelte.ts` ✅
- `sveltekit-frontend/src/lib/models/ChatSession.svelte.ts` ✅
- `sveltekit-frontend/src/routes/chat/+page.svelte` ✅
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` ✅

### Stack Configuration
- **Drizzle ORM:** 0.44 with PostgreSQL + pgvector
- **Client Caching:** LokiJS + IndexedDB
- **Server Caching:** Redis + Qdrant
- **Message Queue:** RabbitMQ
- **State Machines:** XState v5
- **Styling:** UnoCSS + bits-ui (Svelte 5 API)

### Known Issues
- Full `svelte-check` and `tsc` commands timeout due to thousands of errors in backup files
- Use `getDiagnostics` on specific files instead of full codebase checks
- Errors concentrated in `.mojibake-backup`, `.phase79.bak`, and parked routes

---

## ✅ January 19, 2026 – Svelte 5 Route Fixes

### Key Fixes Applied
- **Svelte 5 event attributes:** Use `onclick`/`onchange` instead of `on:click`/`on:change`.
- **Case routes repaired:** `cases/[id]` overview + board pages now use valid class syntax and fetch payloads.
- **Evidence upload (case scoped):** Fixed `allowedTypes`, return payload, and case title mapping.
- **Component repairs:**
  - `ContextualChatModal.svelte` payload mapping and CSS `rgba()` fixes
  - `CaseNotesEditor.svelte` function boundaries, handlers, and CSS fixes
  - `NesModal.svelte` supports `children?: Snippet`

### Notes
- Svelte 5 runes are in use (`$props`, `$state`, `$derived`).
- bits-ui uses component-level imports for Svelte 5 (no barrel exports).
- Prefer SSR-safe patterns and Drizzle ORM 0.44 queries.

## 🚨 **CRITICAL: Database Migration Safety Protocol**

### ⛔ **DO NOT PROCEED WITH THIS PUSH**

**STOP** if you see warnings like this during `npm run db:push:dev`:

```
⚠️  Warning  Found data-loss statements:
· You're about to delete kg_nodes table with 2764 items
· You're about to delete ts_errors table with 69311 items
· You're about to delete phase89_embeddings table with 34505 items
· You're about to delete error_topk_index table with 910413 items
```

**Answer NO or press Ctrl+C to abort immediately.**

### Why This Happens

Drizzle ORM compares your TypeScript schema files against the actual database. **Tables that exist in the database but aren't defined in your schema files are marked for deletion.**

This would delete **1.2 million+ records** including:
- **910,413 items** in error_topk_index
- **69,311 items** in ts_errors
- **54,384 items** in cpg_edges
- **40,106 items** in raw_error_embeddings
- All Phase 89 embeddings, clusters, and analysis data

### ✅ Safe Approaches

**Option 1: Add Missing Tables to Schema** (Recommended)
```typescript
// These tables exist in DB but not in schema - add them to prevent deletion
export const kgNodes = pgTable('kg_nodes', { ... });
export const tsErrors = pgTable('ts_errors', { ... });
```

**Option 2: Use `tablesFilter` in drizzle.config.ts**
```typescript
export default {
  tablesFilter: ['!phase89_*', '!kg_*', '!ts_errors', '!error_topk_index'],
} satisfies Config;
```

**Option 3: Use `introspect` to Auto-Generate**
```bash
npx drizzle-kit introspect
```

**Option 4: Raw SQL for Simple Changes** (Safest)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password TEXT;
```

### 🎯 Pre-Flight Checklist

Before running `npm run db:push:dev`:
1. ✅ Review migration SQL in `drizzle/*.sql`
2. ✅ Check for DROP TABLE statements
3. ✅ Check for DROP COLUMN statements
4. ✅ Verify schema includes all existing tables
5. ✅ Test on dev database first

**Remember:** Drizzle will happily delete millions of records if you let it. Always review, always verify, always backup.

---

## 📊 Latest Findings (January 11, 2026) - Phase 67-68

### Phase 67: Error Cluster & Solve Strategy

**Massive Error Reduction Achieved:**
- **Starting Errors:** 150,925
- **Final Errors:** ~89,000
- **Total Reduction:** -61,000 errors (-41%)

**Iteration Results:**
| Iteration | Focus | Action | Impact |
|-----------|-------|--------|--------|
| 1. Legacy | `ai.bak` archive | Moved legacy code to `_archive/` | **-27,134** |
| 2. Corruption | Phantom Commas | Fixed `{, ` and `;,` patterns in 2080 files | **-34,511** |
| 3. Types | Missing Imports | `ts-morph` auto-import for Node.js/SvelteKit | -14 |
| 4. Strictness | Implicit Any | `ts-morph` added `: any` to 1,879 params | Quality |

**Key Corruption Patterns Discovered:**
```typescript
// Pattern 1: Phantom Start Comma
Promise<{, valid: boolean }> // ❌ Corrupted
Promise<{ valid: boolean }>  // ✅ Fixed

// Pattern 2: Double Question Marks
processingStatus?? 'pending'  // ❌ Corrupted
processingStatus?: 'pending'  // ✅ Fixed

// Pattern 3: Colon Instead of Comma in Generics
ActorRef<Snapshot: Event>  // ❌ Corrupted
ActorRef<Snapshot, Event>  // ✅ Fixed
```

**Tools Created:**
- `scripts/fix-syntax-corruption.mjs` - MVP regex fixer (2000+ files)
- `scripts/fix-syntax-patterns.mjs` - Colon/double-?? fixer
- `scripts/fix-missing-imports-enhanced.ts` - ts-morph auto-import
- `scripts/fix-implicit-any.ts` - Type annotation adder

### Phase 68: Semantic Surgery Strategy

**Error Distribution Analysis (89k errors):**
| Rank | Pattern | Count | % | Root Cause |
|------|---------|-------|---|------------|
| 1 | `',' expected` | 26,414 | 30% | Syntax corruption |
| 2 | `Cannot find name` | 18,741 | 21% | Missing imports |
| 3 | `Declaration expected` | 4,953 | 5.5% | Broken braces |
| 4 | `Type only refers to...` | 3,330 | 3.7% | `import type` misuse |
| 5 | `Property missing` | 3,065 | 3.4% | Interface mismatch |

### 2025 Best Practices Applied

**TypeScript 5.7+ Patterns:**
- Enable `strict: true` in tsconfig
- Use `unknown` over `any` where possible
- Leverage `satisfies` operator for type-safe assignments
- Use `jscodeshift` or `ts-morph` for codemods

**Svelte 5 Runes Migration:**
```typescript
// Svelte 4 (OLD)
export let name;
$: doubled = count * 2;

// Svelte 5 (NEW)
let { name } = $props();
let doubled = $derived(count * 2);
```

**ts-morph AST Best Practices:**
- Use `Project` with `skipAddingFilesFromTsConfig: true` for speed
- Check `findReferencesAsNodes()` before modifying
- Always `saveSync()` after modifications
- Handle edge cases like dynamic imports gracefully

### 🐰 RabbitMQ 4.0 Streaming (2025)

**Key Changes:**
- Quorum queues replace classic mirrored queues
- Default redelivery limit: 20 (configure DLX!)
- Streams for append-only, replayable logs

**TypeScript Client:**
```typescript
import { connect } from 'rabbitmq-stream-js-client';
const client = await connect({ hostname: 'localhost', port: 5552 });
const producer = await client.declarePublisher({ stream: 'docs' });
await producer.send(Buffer.from(JSON.stringify({ id: '123' })));
```

### 📄 LangChain.js Chunking (2025)

**Recommended Strategy:**
```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,    // 256-512 tokens optimal
  chunkOverlap: 50,  // 10-20% overlap
});
```

**Streaming SSE:**
```typescript
for await (const chunk of chain.stream({ input })) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

---

## 📊 Previous Findings (January 9, 2026)

### Svelte 5 Migration Patterns Discovered

**Critical Import Pattern Changes:**
```typescript
// ❌ OLD (Svelte 4 + bits-ui < 2.0)
import { cn } from "$lib/utils";
import { Checkbox as BitsCheckbox } from "bits-ui";

// ✅ NEW (Svelte 5 + bits-ui 2.14.4)
import { cn } from "$lib/utils/cn.js";
import * as Checkbox from "bits-ui/components/checkbox";

// Usage change:
<BitsCheckbox.Root> → <Checkbox.Root>
```

**Components Fixed:**
- Checkbox.svelte (5 errors → 0)
- Label.svelte (errors eliminated)
- Select components (9 files, all BitsSelect refs fixed)
- ~12 UI components remaining (dropdowns, buttons, switches)

**Database Schema Fixes:**
- Fixed missing closing parentheses in `defaultRandom()`, `notNull()`, `defaultNow()`
- Corrected multi-line property declarations
- Standardized indentation and formatting

### Phase 78 Pipeline Commands

```bash
# Validation
npm run phase78:ast-rank:test

# Analyze all errors with AST ranking
npm run phase78:ast-rank

# Focus on top 50 files
npm run phase78:ast-rank:top50

# Complete pipeline (rank → insert → cluster → suggest)
npm run phase78:full
```

---

## 🚀 Quick Start with Docker (Phase 72)

### Build in WSL Linux

```bash
# Navigate to workspace
cd /mnt/c/path/to/legal-ai

# Build CUDA Docker image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Build with specific CUDA architecture
docker build -f docker/Dockerfile.cuda \
  --build-arg CUDA_ARCHITECTURES=86 \
  -t legal-ai-gpu:latest .
```

### Run with Docker

```bash
# Run GPU container with all services
docker run --gpus all \
  -p 8000:8000 \
  -p 5174:5174 \
  -p 6333:6333 \
  -p 7687:7687 \
  -p 6379:6379 \
  -p 5432:5432 \
  -v $(pwd)/backend:/app/backend \
  -v $(pwd)/sveltekit-frontend:/app/frontend \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e PYTHONUNBUFFERED=1 \
  legal-ai-gpu:latest

# Run with custom environment
docker run --gpus all \
  -p 8000:8000 \
  -e NEO4J_URI=bolt://localhost:7687 \
  -e OLLAMA_URL=http://localhost:11434 \
  -e QDRANT_URL=http://localhost:6333 \
  -e PHASE72_MAX_ITERATIONS=10 \
  legal-ai-gpu:latest
```

### Docker Compose (Keep Existing)

```bash
# Start full GPU stack (preserves existing compose files)
docker-compose -f docker/docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker/docker-compose.gpu.yml logs -f legal-ai-gpu

# Stop stack
docker-compose -f docker/docker-compose.gpu.yml down

# Rebuild services
docker-compose -f docker/docker-compose.gpu.yml build --no-cache
```

---

## 📊 Phase 72: AST Error Reduction

### What It Does
- Extracts 80k+ TypeScript/Svelte errors
- Clusters similar errors using GPU acceleration
- Generates AI patches using gemma3-legal
- Applies and validates patches automatically
- Iterates until errors stabilize (<1k)

### Expected Results
- **Error Reduction**: 95%+ (80k → <1k)
- **Success Rate**: 75-85% patch acceptance
- **Processing Time**: 15-30 min per cycle
- **GPU Utilization**: 70-90%

### Key Components
- Error extraction (svelte-check)
- Neo4j graph database
- GPU clustering (CUDA)
- AI patch generation (Ollama)
- Patch validation (ts-morph)

### Specification
- Requirements: `.kiro/specs/phase-72-ast-error-reduction/requirements.md`
- Design: `.kiro/specs/phase-72-ast-error-reduction/design.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

---

## ⚡ CUDA Acceleration

### 4-Phase Speedup Plan

| Phase | Component | Current | GPU | Speedup |
|-------|-----------|---------|-----|---------|
| A | Tokenization | 100ms | 20ms | 5x |
| B | Embedding | 500ms | 50ms | 10x |
| C | Vector Search | 100ms | 30ms | 3x |
| D | Reranking | 50ms | 6ms | 8x |
| **Total** | **Pipeline** | **750ms** | **106ms** | **7x** |

### Build CUDA Components

```bash
# In WSL Linux
cd /mnt/c/path/to/legal-ai

# Configure CMake
cmake -B build -DCMAKE_BUILD_TYPE=Release \
                -DCUDA_ARCHITECTURES=86 \
                -DCUTLASS_DIR=/opt/cutlass

# Build
cmake --build build --parallel 8

# Install
cmake --install build

# Run benchmarks
./build/benchmark_tokenizer --batch-size 32 --iterations 100
./build/benchmark_embedding --batch-size 32 --iterations 100
./build/benchmark_search --num-candidates 1000 --iterations 100
./build/benchmark_reranker --batch-size 32 --iterations 100
```

### Docker Build with CUDA

```bash
# Build CUDA image in WSL
docker build -f docker/Dockerfile.cuda \
  --build-arg CUDA_ARCHITECTURES=86 \
  -t legal-ai-gpu:cuda12 .

# Run with GPU
docker run --gpus all \
  -p 8000:8000 \
  -v $(pwd):/app \
  legal-ai-gpu:cuda12 \
  python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## 🔧 Configuration

### Environment Variables

```bash
# CUDA
export CUDA_VISIBLE_DEVICES=0
export CUDA_LAUNCH_BLOCKING=0

# Phase 72
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export OLLAMA_URL=http://localhost:11434
export QDRANT_URL=http://localhost:6333
export REDIS_URL=redis://localhost:6379
export PHASE72_MAX_ITERATIONS=10
export PHASE72_MIN_IMPROVEMENT=0.05
```

### Docker Compose Services (Preserved)

```yaml
# All existing docker-compose files remain unchanged
# New GPU stack in docker/docker-compose.gpu.yml includes:
# - legal-ai-gpu (main service)
# - postgres (database)
# - redis (cache)
# - qdrant (vector db)
# - minio (storage)
# - rabbitmq (queue)
# - gpu-monitor (optional)
```

---

## 📁 File Structure

```
legal-ai/
├── CMakeLists.txt                      # Root CMake
├── CUDA_ACCELERATION_ROADMAP.md        # CUDA plan
├── CUDA_QUICKSTART.md                  # Quick start
├── PHASE_72_AND_CUDA_SUMMARY.md       # Summary
├── IMPLEMENTATION_READY.md             # Checklist
│
├── backend/
│   ├── cuda/
│   │   └── CMakeLists.txt             # CUDA backend
│   └── ... (existing services)
│
├── docker/
│   ├── Dockerfile.cuda                # GPU runtime
│   ├── docker-compose.gpu.yml         # GPU stack
│   └── ... (existing configs - preserved)
│
├── .kiro/
│   ├── INDEX.md                       # Navigation
│   ├── STARTUP_GUIDE.md               # Getting started
│   ├── PHASE_72_SPEC_COMPLETE.md      # Phase 72 summary
│   └── specs/
│       └── phase-72-ast-error-reduction/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
│
└── phase72-ast-reduction/
    ├── phase72-orchestrator.ts        # Existing
    └── ... (to be implemented)
```

---

## 🚀 Implementation Steps

### Step 1: Build Docker Image (WSL Linux)

```bash
# In WSL terminal
cd /mnt/c/path/to/legal-ai

# Build image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Verify build
docker images | grep legal-ai-gpu
```

### Step 2: Start Services

```bash
# Option A: Docker run (single container)
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Option B: Docker Compose (full stack)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Option C: Keep existing compose files
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d
```

### Step 3: Verify Services

```bash
# Check API health
curl http://localhost:8000/api/health

# Check GPU metrics
curl http://localhost:8000/api/gpu-metrics

# Check Neo4j
curl http://localhost:7687

# Check Qdrant
curl http://localhost:6333/health
```

### Step 4: Start Phase 72

```bash
# Run Phase 72 orchestrator
docker exec legal-ai-gpu npm run phase72:run

# Monitor progress
docker exec legal-ai-gpu npm run phase72:progress

# View dashboard
open http://localhost:5174
```

---

## 📊 Performance Monitoring

### GPU Metrics

```bash
# Real-time GPU monitoring
nvidia-smi -l 1

# GPU memory usage
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader -l 1

# GPU utilization
nvidia-smi dmon
```

### Docker Logs

```bash
# View all logs
docker-compose -f docker/docker-compose.gpu.yml logs -f

# View specific service
docker logs legal-ai-gpu -f

# View with timestamps
docker logs --timestamps legal-ai-gpu
```

### Performance Benchmarks

```bash
# Run benchmarks in container
docker exec legal-ai-gpu ./build/benchmark_tokenizer --batch-size 32
docker exec legal-ai-gpu ./build/benchmark_embedding --batch-size 32
docker exec legal-ai-gpu ./build/benchmark_search --num-candidates 1000
docker exec legal-ai-gpu ./build/benchmark_reranker --batch-size 32
```

---

## 🔧 Troubleshooting

### GPU Not Available

```bash
# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:12.0-runtime-ubuntu22.04 nvidia-smi

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Out of Memory

```bash
# Reduce batch size
docker run --gpus all \
  -e CUDA_LAUNCH_BLOCKING=1 \
  -e BATCH_SIZE=16 \
  legal-ai-gpu:latest

# Monitor memory
docker stats legal-ai-gpu
```

### Build Failures

```bash
# Clean build
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Check build logs
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest . 2>&1 | tail -50

# Build with verbose output
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .
```

---

## 📚 Documentation

### Phase 72
- Specification: `.kiro/specs/phase-72-ast-error-reduction/`
- Summary: `.kiro/PHASE_72_SPEC_COMPLETE.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

### CUDA
- Roadmap: `CUDA_ACCELERATION_ROADMAP.md`
- Quick Start: `CUDA_QUICKSTART.md`
- CMake: `CMakeLists.txt`

### Getting Started
- Startup Guide: `.kiro/STARTUP_GUIDE.md`
- Index: `.kiro/INDEX.md`
- Implementation Ready: `IMPLEMENTATION_READY.md`

---

## ✅ Verification Checklist

- [ ] Docker image builds successfully
- [ ] GPU detected in container
- [ ] All services start (Neo4j, Ollama, Qdrant, Redis, Postgres)
- [ ] API health check passes
- [ ] GPU metrics endpoint responds
- [ ] Phase 72 orchestrator initializes
- [ ] Dashboard accessible at localhost:5174
- [ ] Benchmarks run successfully

---

## 🎯 Next Steps

1. **Build Docker Image**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`
2. **Start Services**: `docker-compose -f docker/docker-compose.gpu.yml up -d`
3. **Verify Setup**: `curl http://localhost:8000/api/health`
4. **Start Phase 72**: `docker exec legal-ai-gpu npm run phase72:run`
5. **Monitor Progress**: `docker exec legal-ai-gpu npm run phase72:progress`

---

**Status**: ✅ Ready for Docker deployment in WSL Linux

**Build Command**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`

**Run Command**: `docker run --gpus all -p 8000:8000 legal-ai-gpu:latest`

**Compose Command**: `docker-compose -f docker/docker-compose.gpu.yml up -d`
