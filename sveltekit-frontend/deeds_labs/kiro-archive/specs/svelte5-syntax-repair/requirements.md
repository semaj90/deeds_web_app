# Svelte 5 Syntax Repair - Requirements

**Feature Name**: svelte5-syntax-repair
**Status**: In Progress
**Priority**: Critical (Blocking Compilation)
**Target Completion**: 2-3 days

## Overview

The YoRHa Legal AI Platform's SvelteKit frontend experienced a failed automated migration that corrupted ~1352 Svelte files with systematic syntax errors. This spec defines the requirements for systematically repairing all remaining syntax errors and achieving a clean build.

## Problem Statement

A previous automated migration attempt corrupted the Svelte codebase with three main patterns of syntax errors:
1. Ternary operators using comma instead of colon
2. Dark mode classes using comma instead of colon
3. Style attributes using comma instead of colon

While ~282 files were fixed in the previous phase, approximately 1352 errors remain across multiple categories that must be addressed to achieve a clean build.

## Acceptance Criteria

### Primary Criteria (Must Have)
1. **Error Count Reduction**
   - [ ] Reduce total error count from ~1352 to < 100
   - [ ] Eliminate all "Unexpected token" errors (229 remaining)
   - [ ] Eliminate all "no exported member" errors (105 remaining)
   - [ ] Eliminate all "not assignable" type errors (99 remaining)

2. **Build Success**
   - [ ] `npm run check:svelte` completes with 0 errors
   - `npm run check:typescript` completes with 0 errors
   - [ ] `npm run build` succeeds without errors
   - [ ] No TypeScript compilation errors

3. **Code Quality**
   - [ ] All accessibility warnings resolved (145 remaining)
   - [ ] All state reference warnings resolved (50+ remaining)
   - [ ] No unused CSS selectors
   - [ ] No unused variables

### Secondary Criteria (Should Have)
4. **Testing & Validation**
   - [ ] All unit tests pass (`npm test`)
   - [ ] No regressions in existing functionality
   - [ ] Component rendering verified
   - [ ] Event handlers working correctly

5. **Documentation**
   - [ ] Document all error patterns found
   - [ ] Create repair patterns for future reference
   - [ ] Update migration guidelines

## User Stories

### Story 1: Fix Unexpected Token Errors
**As a** developer
**I want to** fix all "Unexpected token" syntax errors
**So that** the Svelte compiler can parse all components correctly

**Acceptance Criteria:**
- All 229 "Unexpected token" errors are resolved
- Components parse without syntax errors
- No new errors introduced during fixes

**Estimated Effort:** 2-3 hours

### Story 2: Fix Import/Export Errors
**As a** developer
**I want to** fix all "no exported member" import errors
**So that** module resolution works correctly

**Acceptance Criteria:**
- All 105 "no exported member" errors are resolved
- All imports reference valid exports
- Module paths are correct

**Estimated Effort:** 1-2 hours

### Story 3: Fix Type Compatibility Errors
**As a** developer
**I want to** fix all "not assignable" type errors
**So that** TypeScript compilation succeeds

**Acceptance Criteria:**
- All 99 "not assignable" type errors are resolved
- Type definitions are correct
- No type mismatches

**Estimated Effort:** 1-2 hours

### Story 4: Fix Accessibility Warnings
**As a** developer
**I want to** fix all accessibility warnings
**So that** the application meets WCAG standards

**Acceptance Criteria:**
- All 145 accessibility warnings are resolved
- Form labels are properly associated
- Keyboard navigation works
- Screen readers can access all content

**Estimated Effort:** 1-2 hours

### Story 5: Fix State Reference Warnings
**As a** developer
**I want to** fix all Svelte 5 runes reactivity warnings
**So that** state management works correctly

**Acceptance Criteria:**
- All 50+ state reference warnings are resolved
- Reactive values update correctly
- Effects trigger appropriately
- No stale closures

**Estimated Effort:** 1 hour

## Error Categories & Patterns

### Category 1: Unexpected Token Errors (229)
**Pattern**: Syntax corruption in template or script sections
**Root Causes**:
- Malformed directives (e.g., `{#if}`, `{@const}`, `{@render}`)
- Broken expressions in bindings
- Unclosed tags or mismatched braces
- Invalid attribute syntax

**Example Errors**:
```
Directive value must be a JavaScript expression enclosed in curly braces
`{@const}` must be the immediate child of...
Unexpected token in template
```

**Repair Strategy**:
1. Identify malformed directives
2. Validate expression syntax
3. Fix tag matching
4. Verify attribute syntax

### Category 2: No Exported Member Errors (105)
**Pattern**: Import statement validation failures
**Root Causes**:
- Missing exports in imported modules
- Incorrect module paths
- Typos in export names
- Circular dependencies

**Example Errors**:
```
Module '"$lib/*"' has no exported member 'X'
Module './types/index.js' has already exported a member named 'X'
```

**Repair Strategy**:
1. Verify exports exist in source modules
2. Check module paths are correct
3. Fix typos in import names
4. Resolve circular dependencies

### Category 3: Not Assignable Type Errors (99)
**Pattern**: Type compatibility issues
**Root Causes**:
- Property type mismatches
- Interface extension conflicts
- Incorrect type annotations
- Missing type definitions

**Example Errors**:
```
Type 'X' is not assignable to type 'Y'
Property 'X' does not exist on type 'Y'
Interface 'X' incorrectly extends interface 'Y'
```

**Repair Strategy**:
1. Review type definitions
2. Fix property types
3. Align interface extensions
4. Add missing type annotations

### Category 4: Accessibility Warnings (145)
**Pattern**: WCAG compliance issues
**Root Causes**:
- Missing form labels
- Non-interactive elements with click handlers
- Deprecated slot usage
- Missing keyboard event handlers

**Example Warnings**:
```
A form label must be associated with a control
Using `<slot>` to render parent content is deprecated
Visible, non-interactive elements with a click event must have keyboard handlers
```

**Repair Strategy**:
1. Add missing form labels
2. Replace deprecated slot usage with `{@render}`
3. Add keyboard event handlers
4. Use semantic HTML elements

### Category 5: State Reference Warnings (50+)
**Pattern**: Svelte 5 runes reactivity issues
**Root Causes**:
- Initial value captures in effects
- Missing derived() wrappers
- Stale closures in callbacks
- Incorrect effect dependencies

**Example Warnings**:
```
This reference only captures the initial value of 'X'. Did you mean to reference it inside a derived instead?
```

**Repair Strategy**:
1. Wrap reactive values in derived()
2. Update effect dependencies
3. Fix closure captures
4. Use proper reactivity patterns

## Technical Specifications

### Technology Stack
- **Framework**: SvelteKit 2.0 with Svelte 5 (runes-based)
- **Language**: TypeScript 5.0 (strict mode)
- **Build Tool**: Vite 6.0
- **UI Framework**: Bits UI 2.0 + NES.css
- **Linter**: ESLint with TypeScript support
- **Formatter**: Prettier (2 spaces, 100 char width)

### Key Configuration Files
- `tsconfig.json` - TypeScript compiler options
- `svelte.config.cjs` - SvelteKit configuration
- `vite.config.ts` - Vite build configuration
- `.prettierrc` - Code formatting rules
- `.eslintrc.minimal.cjs` - Linting rules

### Build Commands
```bash
# Type checking
npm run check:typescript

# Svelte validation
npm run check:svelte

# Linting
npm run lint
npm run lint:fix

# Build
npm run build

# Testing
npm test
npm run test:run
```

## Success Metrics

1. **Error Reduction**: From 1352 to 0 errors
2. **Build Time**: < 30 seconds for full build
3. **Test Coverage**: 100% of tests passing
4. **Code Quality**: 0 accessibility warnings
5. **Type Safety**: 0 TypeScript errors

## Constraints & Assumptions

### Constraints
- Must maintain backward compatibility
- Cannot break existing functionality
- Must follow Svelte 5 best practices
- Must maintain code style consistency

### Assumptions
- All errors are fixable without architectural changes
- No breaking changes to component APIs
- Existing tests are valid and should pass
- No new dependencies required

## Out of Scope

- Refactoring components for performance
- Adding new features
- Updating dependencies
- Changing component architecture
- Adding new tests (only fixing existing ones)

## Dependencies

- Previous phase: Batch regex fixes (~282 files)
- Svelte 5 documentation and migration guide
- TypeScript strict mode configuration
- ESLint and Prettier configuration

## Risks & Mitigation

### Risk 1: Incomplete Error Analysis
**Mitigation**: Categorize all errors before starting fixes

### Risk 2: Introducing New Errors
**Mitigation**: Run full test suite after each category fix

### Risk 3: Missed Edge Cases
**Mitigation**: Use systematic approach, verify each fix

### Risk 4: Performance Regression
**Mitigation**: Monitor build time and runtime performance

## Timeline

- **Phase 1**: Fix "Unexpected token" errors (2-3 hours)
- **Phase 2**: Fix import/export errors (1-2 hours)
- **Phase 3**: Fix type compatibility errors (1-2 hours)
- **Phase 4**: Fix accessibility warnings (1-2 hours)
- **Phase 5**: Fix state reference warnings (1 hour)
- **Phase 6**: Validation & testing (1-2 hours)

**Total Estimated Time**: 8-12 hours

## Acceptance Sign-Off

- [ ] All error categories addressed
- [ ] Build succeeds without errors
- [ ] All tests pass
- [ ] Code review approved
- [ ] Deployed to staging
- [ ] Verified in production
