# Implementation Tasks: TypeScript Syntax Repair

## Task Overview

This task list implements the TypeScript Syntax Repair system to fix the remaining 3,071 errors in the SvelteKit frontend codebase. Tasks are organized by component and follow the multi-pass processing architecture defined in the design document.

---

## Phase 1: Core Infrastructure

### Task 1: Create Pattern Matcher Engine
- [ ] 1.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/pattern-matcher.ts` with PatternMatcher interface
- [ ] 1.2 Implement pattern validation logic that checks before/after transformations
- [ ] 1.3 Create pattern registry to store and retrieve fix patterns by name
- [ ] 1.4 Add pattern execution function that applies regex replacement with capture groups

### Task 2: Create File Processor Component
- [ ] 2.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/file-processor.ts` with FileProcessor interface
- [ ] 2.2 Implement `createBackup()` function that copies file to `.backup` extension before modification
- [ ] 2.3 Implement `restoreBackup()` function that restores original file from backup
- [ ] 2.4 Implement `processFile()` function that applies patterns and tracks results
- [ ] 2.5 Implement `processDirectory()` function with recursive file discovery for .ts and .svelte files

### Task 3: Create Validation Engine
- [ ] 3.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/validation-engine.ts` with ValidationEngine interface
- [ ] 3.2 Implement `validateFile()` using TypeScript compiler API to check single file
- [ ] 3.3 Implement `validateProject()` using `tsc --noEmit` to get full project error count
- [ ] 3.4 Implement `getErrorCount()` helper that parses tsc output for error totals
- [ ] 3.5 Add error categorization by TS error code (TS1005, TS1128, TS1434, etc.)

---

## Phase 2: Fix Pattern Implementations

### Task 4: Implement Import Type Syntax Fix (Pass 1)
- [ ] 4.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/patterns/import-type-fix.ts`
- [ ] 4.2 Implement regex pattern to match `type,` followed by identifier in import statements
- [ ] 4.3 Implement replacement function that transforms `type, X` to `type X`
- [ ] 4.4 Handle multiple type imports in single statement (e.g., `type, A, type, B`)
- [ ] 4.5 Add validation to ensure no `type,` patterns remain after fix

### Task 5: Implement Function Parameter Syntax Fix (Pass 2)
- [ ] 5.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/patterns/function-param-fix.ts`
- [ ] 5.2 Implement regex pattern to detect `param: Type: NextType` corruption
- [ ] 5.3 Implement replacement that adds missing parameter names between types
- [ ] 5.4 Handle generic type parameters (e.g., `Record<string, unknown>`)
- [ ] 5.5 Handle async function signatures with corrupted parameters

### Task 6: Implement Function Call Argument Syntax Fix (Pass 3)
- [ ] 6.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/patterns/function-call-fix.ts`
- [ ] 6.2 Implement regex pattern to detect `fn(arg1: arg2)` corruption
- [ ] 6.3 Implement replacement that transforms colons to commas between arguments
- [ ] 6.4 Handle nested function calls with corrupted syntax
- [ ] 6.5 Handle method chaining with multiple corrupted calls

### Task 7: Implement Object Literal Type Syntax Fix (Pass 4)
- [ ] 7.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/patterns/object-literal-fix.ts`
- [ ] 7.2 Implement regex pattern to detect `property, TypeName` corruption in type annotations
- [ ] 7.3 Implement replacement that transforms comma to colon for property types
- [ ] 7.4 Handle complex nested types with multiple properties
- [ ] 7.5 Preserve generic type parameters while fixing property syntax

### Task 8: Implement Nullish Coalescing Fix (Pass 5)
- [ ] 8.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/patterns/nullish-coalescing-fix.ts`
- [ ] 8.2 Implement regex pattern to detect malformed `??` operators
- [ ] 8.3 Implement replacement that ensures proper spacing around `??`
- [ ] 8.4 Handle chained nullish coalescing expressions

---

## Phase 3: Orchestration and CLI

### Task 9: Create Multi-Pass Processor
- [ ] 9.1 Create `sveltekit-frontend/src/lib/utils/syntax-repair/multi-pass-processor.ts`
- [ ] 9.2 Implement pass ordering logic (import → params → calls → objects → nullish)
- [ ] 9.3 Implement iteration control with configurable max passes
- [ ] 9.4 Add progress tracking and reporting between passes
- [ ] 9.5 Implement early termination when no more fixes are found

### Task 10: Create CLI Runner Script
- [ ] 10.1 Create `scripts/syntax-repair-cli.mjs` as executable Node.js script
- [ ] 10.2 Implement command-line argument parsing for target directory and options
- [ ] 10.3 Add `--dry-run` mode that reports fixes without applying them
- [ ] 10.4 Add `--verbose` mode for detailed logging of each fix
- [ ] 10.5 Add `--priority-files` option to process high-error files first
- [ ] 10.6 Generate summary report with before/after error counts

### Task 11: Create npm Scripts
- [ ] 11.1 Add `syntax:repair` script to package.json that runs the CLI
- [ ] 11.2 Add `syntax:repair:dry-run` script for preview mode
- [ ] 11.3 Add `syntax:repair:validate` script that runs tsc after repairs
- [ ] 11.4 Add `syntax:repair:report` script that generates error analysis

---

## Phase 4: Property-Based Testing

### Task 12: Set Up Property Testing Infrastructure
- [ ] 12.1 Install fast-check library if not present (`npm install -D fast-check`)
- [ ] 12.2 Create `sveltekit-frontend/src/lib/__tests__/syntax-repair/` test directory
- [ ] 12.3 Create test utilities for generating corrupted TypeScript snippets

### Task 13: Implement Property Tests
- [ ] 13.1 (PBT) Property 1: Import type transformation produces valid import statements
  **Validates: Requirements 1.1, 1.2**
- [ ] 13.2 (PBT) Property 2: Idempotence - correct syntax unchanged after fix
  **Validates: Requirements 1.3**
- [ ] 13.3 (PBT) Property 3: Function parameter fix produces valid signatures
  **Validates: Requirements 2.1, 2.2**
- [ ] 13.4 (PBT) Property 4: Function call fix produces valid invocations
  **Validates: Requirements 3.1, 3.2**
- [ ] 13.5 (PBT) Property 5: Object literal type fix produces valid annotations
  **Validates: Requirements 4.1, 4.2**
- [ ] 13.6 (PBT) Property 6: Nullish coalescing fix produces valid expressions
  **Validates: Requirements 5.1**
- [ ] 13.7 (PBT) Property 7: Backup file exists before any modification
  **Validates: Requirements 6.1**
- [ ] 13.8 (PBT) Property 8: Validation failure triggers backup restoration
  **Validates: Requirements 6.3**
- [ ] 13.9 (PBT) Property 9: Error count never increases after processing
  **Validates: Requirements 7.3**

---

## Phase 5: Unit Testing

### Task 14: Create Unit Tests for Pattern Matchers
- [ ] 14.1 Create `import-type-fix.test.ts` with specific corruption examples
- [ ] 14.2 Create `function-param-fix.test.ts` with parameter corruption examples
- [ ] 14.3 Create `function-call-fix.test.ts` with call argument examples
- [ ] 14.4 Create `object-literal-fix.test.ts` with type annotation examples
- [ ] 14.5 Create `nullish-coalescing-fix.test.ts` with operator examples

### Task 15: Create Unit Tests for Infrastructure
- [ ] 15.1 Create `backup-restore.test.ts` for file backup/restore functionality
- [ ] 15.2 Create `validation-engine.test.ts` for TypeScript validation
- [ ] 15.3 Create `multi-pass-processor.test.ts` for orchestration logic

---

## Phase 6: Execution and Validation

### Task 16: Execute Syntax Repair on Codebase
- [ ] 16.1 Run `npm run syntax:repair:dry-run` to preview all fixes
- [ ] 16.2 Review dry-run output and verify fix patterns are correct
- [ ] 16.3 Run `npm run syntax:repair` to apply all fixes
- [ ] 16.4 Run `npx tsc --noEmit` to validate TypeScript compilation
- [ ] 16.5 Run `npx svelte-check` to validate Svelte components

### Task 17: Final Validation and Cleanup
- [ ] 17.1 Verify error count is 0 or document remaining manual fixes needed
- [ ] 17.2 Remove backup files after successful validation
- [ ] 17.3 Run full test suite to ensure no regressions
- [ ] 17.4 Update project documentation with final error count

---

## Task Dependencies

```
Task 1 (Pattern Matcher) ──┐
Task 2 (File Processor) ───┼──► Task 9 (Multi-Pass) ──► Task 10 (CLI) ──► Task 16 (Execute)
Task 3 (Validation) ───────┘
                                      │
Tasks 4-8 (Fix Patterns) ─────────────┘

Task 12 (PBT Setup) ──► Task 13 (Property Tests)

Tasks 4-8 ──► Task 14 (Unit Tests)
Tasks 1-3 ──► Task 15 (Infrastructure Tests)

Task 16 (Execute) ──► Task 17 (Final Validation)
```

## Priority Order

1. **Critical Path**: Tasks 1-3 → Tasks 4-8 → Task 9 → Task 10 → Task 16 → Task 17
2. **Testing (Parallel)**: Tasks 12-15 can run in parallel with implementation
3. **npm Scripts**: Task 11 after Task 10

## Success Criteria

- [ ] All property-based tests pass (100 iterations each)
- [ ] All unit tests pass
- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] `npx svelte-check` passes without syntax errors
- [ ] No new errors introduced (regression-free)
