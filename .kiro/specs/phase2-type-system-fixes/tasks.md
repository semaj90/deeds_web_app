# Tasks Document: Phase 2 Type System Fixes

## Task Overview

This document provides actionable implementation tasks for Phase 2 Type System Fixes. All tasks are designed for automated execution with clear success criteria and validation steps.

---

## Task 1: Bits UI Import Modernization

**Priority**: 🔴 HIGH
**Estimated Time**: 30 minutes
**Expected Impact**: ~5,000 errors eliminated
**Dependencies**: None

### Subtasks

#### Task 1.1: Create Bits UI Import Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-bits-ui-imports.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement file scanning for `@melt-ui` imports
3. Add pattern matching for deprecated imports
4. Implement replacement logic for v2.0 API
5. Add type import generation
6. Add dry-run mode support
7. Add backup creation logic
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script accepts `--dry-run` and `--apply` flags
- ✅ Script creates backups before modifications
- ✅ Script replaces all `@melt-ui/svelte` imports with `bits-ui`
- ✅ Script adds `import type` for component props
- ✅ Script validates syntax after changes
- ✅ Script logs all changes made

**Test Command**:
```bash
node scripts/fix-bits-ui-imports.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 1.2: Execute Bits UI Import Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 1.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Commit changes

**Acceptance Criteria**:
- ✅ All `@melt-ui` imports replaced
- ✅ Type imports added where needed
- ✅ No syntax errors introduced
- ✅ TypeScript compilation succeeds
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-bits-ui-imports.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-bits-ui-imports.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Commit
git add .
git commit -m "Phase 2.1: Fix Bits UI imports (~5,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 1.3: Validate Bits UI Import Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 1.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~5,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task1-complete.txt
grep "found.*errors" logs/phase2-task1-complete.txt
```

---

## Task 2: Null Safety Enhancement

**Priority**: 🔴 HIGH
**Estimated Time**: 45 minutes
**Expected Impact**: ~4,000 errors eliminated
**Dependencies**: Task 1

### Subtasks

#### Task 2.1: Create Null Safety Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-null-safety.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement AST parsing for property access
3. Add pattern matching for unsafe null access
4. Implement optional chaining insertion
5. Add nullish coalescing for defaults
6. Update function signatures with union types
7. Add dry-run mode support
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies unsafe property access
- ✅ Script adds optional chaining (`?.`)
- ✅ Script adds nullish coalescing (`??`)
- ✅ Script updates function signatures
- ✅ Script validates syntax after changes
- ✅ Script logs all changes made

**Test Command**:
```bash
node scripts/fix-null-safety.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 2.2: Execute Null Safety Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 2.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Commit changes

**Acceptance Criteria**:
- ✅ Optional chaining added where needed
- ✅ Nullish coalescing added for defaults
- ✅ Function signatures updated
- ✅ No syntax errors introduced
- ✅ TypeScript compilation succeeds
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-null-safety.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-null-safety.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Commit
git add .
git commit -m "Phase 2.2: Add null safety patterns (~4,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 2.3: Validate Null Safety Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 2.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~4,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task2-complete.txt
grep "found.*errors" logs/phase2-task2-complete.txt
```

---

## Task 3: WebGPU Type Alignment

**Priority**: 🟡 MEDIUM
**Estimated Time**: 30 minutes
**Expected Impact**: ~3,000 errors eliminated
**Dependencies**: Task 2

### Subtasks

#### Task 3.1: Create WebGPU Type Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-webgpu-types.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement pattern matching for WebGPU buffers
3. Add scalar array conversion logic
4. Generate helper functions for vector reconstruction
5. Update buffer metadata (stride/offset)
6. Fix atomic operations with quantization
7. Add dry-run mode support
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies vec3/vec4 array patterns
- ✅ Script converts to scalar arrays
- ✅ Script generates helper functions
- ✅ Script updates stride/offset uniforms
- ✅ Script fixes atomic operations
- ✅ Script validates syntax after changes

**Test Command**:
```bash
node scripts/fix-webgpu-types.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 3.2: Execute WebGPU Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 3.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Test WebGPU functionality
7. Commit changes

**Acceptance Criteria**:
- ✅ Vector arrays converted to scalar arrays
- ✅ Helper functions generated
- ✅ Stride/offset uniforms added
- ✅ Atomic operations fixed
- ✅ No syntax errors introduced
- ✅ WebGPU tests pass
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-webgpu-types.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-webgpu-types.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Test WebGPU
npm run test:webgpu

# Commit
git add .
git commit -m "Phase 2.3: Fix WebGPU type alignment (~3,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 3.3: Validate WebGPU Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 3.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~3,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task3-complete.txt
grep "found.*errors" logs/phase2-task3-complete.txt
```

---

## Task 4: LangChain v1 Migration

**Priority**: 🟡 MEDIUM
**Estimated Time**: 20 minutes
**Expected Impact**: ~2,000 errors eliminated
**Dependencies**: Task 3

### Subtasks

#### Task 4.1: Create LangChain v1 Migration Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-langchain-v1.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement pattern matching for deprecated chains
3. Add createAgent() conversion logic
4. Generate middleware hooks
5. Update imports to langchain package
6. Add tool calling format updates
7. Add dry-run mode support
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies deprecated chain patterns
- ✅ Script converts to createAgent()
- ✅ Script generates middleware
- ✅ Script updates imports
- ✅ Script fixes tool calling format
- ✅ Script validates syntax after changes

**Test Command**:
```bash
node scripts/fix-langchain-v1.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 4.2: Execute LangChain v1 Migration
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 4.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Test LangChain integration
7. Commit changes

**Acceptance Criteria**:
- ✅ Deprecated chains converted to createAgent()
- ✅ Middleware hooks added
- ✅ Imports updated
- ✅ Tool calling format fixed
- ✅ No syntax errors introduced
- ✅ LangChain tests pass
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-langchain-v1.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-langchain-v1.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Test LangChain
npm run test:langchain

# Commit
git add .
git commit -m "Phase 2.4: Migrate to LangChain v1 (~2,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 4.3: Validate LangChain v1 Migration
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 4.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~2,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task4-complete.txt
grep "found.*errors" logs/phase2-task4-complete.txt
```

---

## Task 5: Generic Type Fixes

**Priority**: 🔴 HIGH
**Estimated Time**: 60 minutes
**Expected Impact**: ~10,000 errors eliminated
**Dependencies**: Task 4

### Subtasks

#### Task 5.1: Create Generic Type Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-generic-types.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement AST parsing for generic calls
3. Add type inference analysis
4. Implement explicit type parameter insertion
5. Fix generic constraints
6. Update utility types
7. Add dry-run mode support
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies generic calls without type args
- ✅ Script adds explicit type parameters
- ✅ Script fixes generic constraints
- ✅ Script updates utility types
- ✅ Script validates syntax after changes
- ✅ Script logs all changes made

**Test Command**:
```bash
node scripts/fix-generic-types.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 5.2: Execute Generic Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 5.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Commit changes

**Acceptance Criteria**:
- ✅ Explicit type parameters added
- ✅ Generic constraints fixed
- ✅ Utility types updated
- ✅ No syntax errors introduced
- ✅ TypeScript compilation succeeds
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-generic-types.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-generic-types.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Commit
git add .
git commit -m "Phase 2.5: Fix generic types (~10,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 5.3: Validate Generic Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 5.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~10,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task5-complete.txt
grep "found.*errors" logs/phase2-task5-complete.txt
```

---

## Task 6: Type Mismatch Resolution

**Priority**: 🔴 HIGH
**Estimated Time**: 50 minutes
**Expected Impact**: ~8,000 errors eliminated
**Dependencies**: Task 5

### Subtasks

#### Task 6.1: Create Type Mismatch Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-type-mismatches.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement AST parsing for type mismatches
3. Add type compatibility analysis
4. Implement type assertion insertion
5. Add type guard generation
6. Update function signatures
7. Add dry-run mode support
8. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies type mismatch errors
- ✅ Script adds type assertions where safe
- ✅ Script generates type guards
- ✅ Script updates function signatures
- ✅ Script validates syntax after changes
- ✅ Script logs all changes made

**Test Command**:
```bash
node scripts/fix-type-mismatches.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 6.2: Execute Type Mismatch Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 6.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Commit changes

**Acceptance Criteria**:
- ✅ Type assertions added where safe
- ✅ Type guards generated
- ✅ Function signatures updated
- ✅ No syntax errors introduced
- ✅ TypeScript compilation succeeds
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-type-mismatches.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-type-mismatches.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Commit
git add .
git commit -m "Phase 2.6: Fix type mismatches (~8,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 6.3: Validate Type Mismatch Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 6.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~8,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task6-complete.txt
grep "found.*errors" logs/phase2-task6-complete.txt
```

---

## Task 7: Import Type Declarations

**Priority**: 🟡 MEDIUM
**Estimated Time**: 40 minutes
**Expected Impact**: ~2,000 errors eliminated
**Dependencies**: Task 6

### Subtasks

#### Task 7.1: Create Import Type Fix Script
**Status**: ⏳ TODO
**Assignee**: Automation
**Files**: `scripts/fix-import-types.mjs`

**Implementation Steps**:
1. Create script file with CLI argument parsing
2. Implement AST parsing for imports
3. Add type-only import detection
4. Implement import splitting logic
5. Update re-exports with type keyword
6. Add dry-run mode support
7. Add validation hooks

**Acceptance Criteria**:
- ✅ Script identifies type-only imports
- ✅ Script splits mixed imports
- ✅ Script updates re-exports
- ✅ Script validates syntax after changes
- ✅ Script logs all changes made

**Test Command**:
```bash
node scripts/fix-import-types.mjs sveltekit-frontend/src --dry-run
```

---

#### Task 7.2: Execute Import Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 7.1

**Implementation Steps**:
1. Run script in dry-run mode
2. Review proposed changes
3. Run script in apply mode
4. Verify file modifications
5. Run TypeScript validation
6. Commit changes

**Acceptance Criteria**:
- ✅ Type-only imports split
- ✅ Re-exports updated
- ✅ No syntax errors introduced
- ✅ TypeScript compilation succeeds
- ✅ Changes committed to git

**Execution Commands**:
```bash
# Dry run
node scripts/fix-import-types.mjs sveltekit-frontend/src --dry-run

# Apply fixes
node scripts/fix-import-types.mjs sveltekit-frontend/src --apply

# Validate
cd sveltekit-frontend && npx svelte-check

# Commit
git add .
git commit -m "Phase 2.7: Fix import type declarations (~2,000 errors)"
git push origin svelte5-error-fixes
```

---

#### Task 7.3: Validate Import Type Fixes
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 7.2

**Implementation Steps**:
1. Run svelte-check
2. Extract error count
3. Compare with baseline
4. Verify expected reduction
5. Update dashboard

**Acceptance Criteria**:
- ✅ Error count reduced by ~2,000
- ✅ No new errors introduced
- ✅ Dashboard updated with progress

**Validation Commands**:
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-task7-complete.txt
grep "found.*errors" logs/phase2-task7-complete.txt
```

---

## Task 8: Final Validation and Documentation

**Priority**: 🔴 HIGH
**Estimated Time**: 30 minutes
**Expected Impact**: Verification of all fixes
**Dependencies**: Task 7

### Subtasks

#### Task 8.1: Run Comprehensive Validation
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 7.3

**Implementation Steps**:
1. Run full svelte-check
2. Run full TypeScript compilation
3. Run build process
4. Run smoke tests
5. Generate validation report

**Acceptance Criteria**:
- ✅ Error count ≤61,500 (57% reduction from 88,500)
- ✅ TypeScript compilation succeeds
- ✅ Build process completes
- ✅ Smoke tests pass
- ✅ Validation report generated

**Validation Commands**:
```bash
# Full validation
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-complete-validation.txt
npx tsc --noEmit 2>&1 | tee logs/phase2-tsc-validation.txt
npm run build 2>&1 | tee logs/phase2-build-validation.txt

# Extract metrics
grep "found.*errors" logs/phase2-complete-validation.txt
```

---

#### Task 8.2: Update Documentation
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 8.1

**Implementation Steps**:
1. Update dashboard with final metrics
2. Create Phase 2 completion summary
3. Document patterns discovered
4. Update knowledge base
5. Create handoff document for Phase 3

**Acceptance Criteria**:
- ✅ Dashboard updated with final metrics
- ✅ Completion summary created
- ✅ Patterns documented
- ✅ Knowledge base updated
- ✅ Phase 3 handoff document created

**Documentation Files**:
- `SVELTE5_ERROR_REMEDIATION_DASHBOARD.md` (update)
- `SESSION_COMPLETE_JAN5_2026_PHASE2_TYPE_SYSTEM_FIXES.md` (create)
- `PHASE2_PATTERNS_DISCOVERED.md` (create)
- `PHASE3_HANDOFF.md` (create)

---

#### Task 8.3: Create Phase 2 Completion Report
**Status**: ⏳ TODO
**Assignee**: Automation
**Dependencies**: Task 8.2

**Implementation Steps**:
1. Gather all metrics
2. Create visual progress chart
3. Document lessons learned
4. Create recommendations for Phase 3
5. Archive Phase 2 artifacts

**Acceptance Criteria**:
- ✅ Completion report created
- ✅ Visual progress chart included
- ✅ Lessons learned documented
- ✅ Phase 3 recommendations provided
- ✅ Artifacts archived

**Report Template**:
```markdown
# Phase 2 Type System Fixes - Completion Report

## Executive Summary
- **Start Date**: [Date]
- **End Date**: [Date]
- **Duration**: [Hours]
- **Initial Errors**: 88,500
- **Final Errors**: [Count]
- **Errors Fixed**: [Count]
- **Reduction**: [Percentage]%

## Scripts Executed
1. Bits UI Imports: [Errors Fixed]
2. Null Safety: [Errors Fixed]
3. WebGPU Types: [Errors Fixed]
4. LangChain v1: [Errors Fixed]
5. Generic Types: [Errors Fixed]
6. Type Mismatches: [Errors Fixed]
7. Import Types: [Errors Fixed]

## Success Metrics
- ✅ Target reduction achieved: [Yes/No]
- ✅ Build success: [Yes/No]
- ✅ Tests passing: [Yes/No]
- ✅ No regressions: [Yes/No]

## Lessons Learned
[Document key learnings]

## Recommendations for Phase 3
[Provide recommendations]
```

---

## Task Dependencies Graph

```
Task 1 (Bits UI)
    │
    ▼
Task 2 (Null Safety)
    │
    ▼
Task 3 (WebGPU)
    │
    ▼
Task 4 (LangChain)
    │
    ▼
Task 5 (Generic Types)
    │
    ▼
Task 6 (Type Mismatches)
    │
    ▼
Task 7 (Import Types)
    │
    ▼
Task 8 (Validation & Docs)
```

---

## Quick Reference Commands

### Run All Phase 2 Scripts (Sequential)
```bash
#!/bin/bash
# phase2-execute-all.sh

echo "Phase 2: Type System Fixes - Starting..."

# Task 1: Bits UI Imports
echo "Task 1: Fixing Bits UI imports..."
node scripts/fix-bits-ui-imports.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.1: Fix Bits UI imports"

# Task 2: Null Safety
echo "Task 2: Adding null safety patterns..."
node scripts/fix-null-safety.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.2: Add null safety patterns"

# Task 3: WebGPU Types
echo "Task 3: Fixing WebGPU types..."
node scripts/fix-webgpu-types.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.3: Fix WebGPU type alignment"

# Task 4: LangChain v1
echo "Task 4: Migrating to LangChain v1..."
node scripts/fix-langchain-v1.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.4: Migrate to LangChain v1"

# Task 5: Generic Types
echo "Task 5: Fixing generic types..."
node scripts/fix-generic-types.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.5: Fix generic types"

# Task 6: Type Mismatches
echo "Task 6: Resolving type mismatches..."
node scripts/fix-type-mismatches.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.6: Fix type mismatches"

# Task 7: Import Types
echo "Task 7: Fixing import type declarations..."
node scripts/fix-import-types.mjs sveltekit-frontend/src --apply
git add . && git commit -m "Phase 2.7: Fix import type declarations"

# Push all changes
git push origin svelte5-error-fixes

# Final validation
echo "Running final validation..."
cd sveltekit-frontend
npx svelte-check 2>&1 | tee logs/phase2-complete.txt

echo "Phase 2: Type System Fixes - Complete!"
```

### Validate Current State
```bash
cd sveltekit-frontend
npx svelte-check 2>&1 | grep "found.*errors"
```

### Rollback Last Task
```bash
git reset --hard HEAD~1
git push origin svelte5-error-fixes --force
```

---

## Success Criteria Summary

| Task | Target Errors Fixed | Validation | Status |
|------|---------------------|------------|--------|
| Task 1: Bits UI | ~5,000 | svelte-check | ⏳ TODO |
| Task 2: Null Safety | ~4,000 | svelte-check | ⏳ TODO |
| Task 3: WebGPU | ~3,000 | svelte-check + GPU tests | ⏳ TODO |
| Task 4: LangChain | ~2,000 | svelte-check + AI tests | ⏳ TODO |
| Task 5: Generic Types | ~10,000 | svelte-check | ⏳ TODO |
| Task 6: Type Mismatches | ~8,000 | svelte-check | ⏳ TODO |
| Task 7: Import Types | ~2,000 | svelte-check | ⏳ TODO |
| **Total** | **~34,000** | **Build + Tests** | **⏳ TODO** |

**Note**: Target is 27,000 errors fixed (57% reduction). The 34,000 total accounts for overlap and provides buffer.

---

## Estimated Timeline

| Week | Tasks | Duration | Cumulative |
|------|-------|----------|------------|
| Week 1 | Tasks 1-4 | 2 hours | 2 hours |
| Week 2 | Tasks 5-7 | 2.5 hours | 4.5 hours |
| Week 2 | Task 8 | 0.5 hours | 5 hours |

**Total Estimated Time**: 5 hours (including validation and documentation)

---

## Next Steps

1. ✅ Review and approve tasks document
2. ⏳ Implement Task 1.1 (Create Bits UI script)
3. ⏳ Execute Task 1.2 (Run Bits UI fixes)
4. ⏳ Continue with remaining tasks sequentially
5. ⏳ Complete Task 8 (Final validation and documentation)

**Ready to begin implementation!** 🚀
