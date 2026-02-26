# Svelte 5 Syntax Repair - Design

**Feature Name**: svelte5-syntax-repair
**Design Version**: 1.0
**Last Updated**: January 30, 2026

## Architecture Overview

The repair process follows a systematic, category-based approach to fix all remaining syntax errors in the Svelte codebase. Each error category is addressed independently with targeted repair patterns.

```
┌─────────────────────────────────────────────────────────────┐
│         Svelte 5 Syntax Repair Pipeline                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Error Analysis & Categorization                         │
│     ├─ Run svelte-check                                     │
│     ├─ Parse error output                                   │
│     └─ Group by error type                                  │
│                                                              │
│  2. Category-Based Repair                                   │
│     ├─ Unexpected Token Errors (229)                        │
│     ├─ Import/Export Errors (105)                           │
│     ├─ Type Compatibility Errors (99)                       │
│     ├─ Accessibility Warnings (145)                         │
│     └─ State Reference Warnings (50+)                       │
│                                                              │
│  3. Validation & Testing                                    │
│     ├─ Run svelte-check                                     │
│     ├─ Run TypeScript compiler                              │
│     ├─ Run unit tests                                       │
│     └─ Verify no regressions                                │
│                                                              │
│  4. Build & Deploy                                          │
│     ├─ Build production bundle                              │
│     ├─ Verify bundle size                                   │
│     └─ Deploy to staging                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Repair Patterns

### Pattern 1: Unexpected Token Errors

**Detection**:
```
Error: Directive value must be a JavaScript expression enclosed in curly braces
Error: `{@const}` must be the immediate child of...
Error: Unexpected token in template
```

**Root Causes**:
1. Malformed directives (missing braces, wrong syntax)
2. Broken expressions in bindings
3. Unclosed tags or mismatched braces
4. Invalid attribute syntax

**Repair Strategy**:

```typescript
// Step 1: Identify malformed directives
// Pattern: {@const x = value} (missing braces)
// Fix: {@const x = value}

// Step 2: Fix broken expressions
// Pattern: {#if condition} (missing braces)
// Fix: {#if condition}

// Step 3: Validate tag matching
// Pattern: <div>{#if x}</div>{/if}
// Fix: <div>{#if x}content{/if}</div>

// Step 4: Fix attribute syntax
// Pattern: on:click={handler} (missing braces)
// Fix: on:click={handler}
```

**Implementation**:
1. Parse each component's template section
2. Identify malformed directives
3. Apply targeted fixes
4. Validate syntax
5. Run svelte-check to verify

**Files Affected**: ~229 components

### Pattern 2: Import/Export Errors

**Detection**:
```
Error: Module '"$lib/*"' has no exported member 'X'
Error: Module './types/index.js' has already exported a member named 'X'
```

**Root Causes**:
1. Missing exports in source modules
2. Incorrect module paths
3. Typos in export names
4. Circular dependencies
5. Duplicate exports

**Repair Strategy**:

```typescript
// Step 1: Verify exports exist
// Check source file for export statement
// Pattern: export { X } from './module'

// Step 2: Fix module paths
// Pattern: import { X } from '$lib/types'
// Verify: $lib/types/index.ts exports X

// Step 3: Fix typos
// Pattern: import { Evidenc } from '$lib/types'
// Fix: import { Evidence } from '$lib/types'

// Step 4: Resolve circular dependencies
// Pattern: A imports from B, B imports from A
// Fix: Extract shared types to separate module

// Step 5: Remove duplicate exports
// Pattern: export { X } from './a'; export { X } from './b'
// Fix: Keep only one export, remove duplicate
```

**Implementation**:
1. Parse all import statements
2. Verify target modules exist
3. Verify exports are defined
4. Fix typos and paths
5. Resolve circular dependencies
6. Run TypeScript compiler to verify

**Files Affected**: ~105 components

### Pattern 3: Type Compatibility Errors

**Detection**:
```
Error: Type 'X' is not assignable to type 'Y'
Error: Property 'X' does not exist on type 'Y'
Error: Interface 'X' incorrectly extends interface 'Y'
```

**Root Causes**:
1. Property type mismatches
2. Interface extension conflicts
3. Incorrect type annotations
4. Missing type definitions
5. Incompatible union types

**Repair Strategy**:

```typescript
// Step 1: Review type definitions
// Check interface definitions
// Verify property types match

// Step 2: Fix property types
// Pattern: property: string (but assigned number)
// Fix: property: string | number

// Step 3: Align interface extensions
// Pattern: interface A extends B { x: string }
// But B has x: number
// Fix: Change A.x to number or B.x to string

// Step 4: Add missing type annotations
// Pattern: const x = value (inferred type wrong)
// Fix: const x: CorrectType = value

// Step 5: Fix union types
// Pattern: Type 'string' is not assignable to 'string | number'
// Fix: Verify union type includes all possible values
```

**Implementation**:
1. Parse type definitions
2. Identify type mismatches
3. Review interface extensions
4. Add missing annotations
5. Fix union types
6. Run TypeScript compiler to verify

**Files Affected**: ~99 components

### Pattern 4: Accessibility Warnings

**Detection**:
```
Warning: A form label must be associated with a control
Warning: Using `<slot>` to render parent content is deprecated
Warning: Visible, non-interactive elements with a click event must have keyboard handlers
```

**Root Causes**:
1. Missing form labels
2. Deprecated slot usage
3. Non-interactive elements with click handlers
4. Missing keyboard event handlers
5. Semantic HTML violations

**Repair Strategy**:

```svelte
<!-- Step 1: Add missing form labels -->
<!-- Pattern: <input id="name" /> -->
<!-- Fix: <label for="name">Name</label><input id="name" /> -->

<!-- Step 2: Replace deprecated slot usage -->
<!-- Pattern: <slot /> -->
<!-- Fix: {@render children?.()} -->

<!-- Step 3: Add keyboard handlers -->
<!-- Pattern: <div on:click={handler}> -->
<!-- Fix: <button on:click={handler}> or <div on:click={handler} on:keydown={handler}> -->

<!-- Step 4: Use semantic HTML -->
<!-- Pattern: <div on:click={handler}> -->
<!-- Fix: <button on:click={handler}> -->

<!-- Step 5: Fix ARIA attributes -->
<!-- Pattern: <div role="button"> -->
<!-- Fix: <button> or add aria-label -->
```

**Implementation**:
1. Identify form inputs without labels
2. Replace deprecated slot usage
3. Add keyboard event handlers
4. Use semantic HTML elements
5. Add ARIA attributes where needed
6. Run svelte-check to verify

**Files Affected**: ~145 components

### Pattern 5: State Reference Warnings

**Detection**:
```
Warning: This reference only captures the initial value of 'X'. Did you mean to reference it inside a derived instead?
```

**Root Causes**:
1. Initial value captures in effects
2. Missing derived() wrappers
3. Stale closures in callbacks
4. Incorrect effect dependencies
5. Reactive value not updated in effect

**Repair Strategy**:

```typescript
// Step 1: Identify stale closures
// Pattern:
// let x = $state(0);
// $effect(() => {
//   console.log(x); // captures initial value
// });

// Fix:
// let x = $state(0);
// let derivedX = $derived(x);
// $effect(() => {
//   console.log(derivedX); // reactive
// });

// Step 2: Wrap in derived()
// Pattern: const value = initialValue;
// Fix: const value = $derived(initialValue);

// Step 3: Fix effect dependencies
// Pattern: $effect(() => { ... }, [])
// Fix: $effect(() => { ... }, [dependency])

// Step 4: Use proper reactivity
// Pattern: let x = value;
// Fix: let x = $state(value);
```

**Implementation**:
1. Identify state references in effects
2. Wrap in derived() where needed
3. Update effect dependencies
4. Fix closure captures
5. Use proper Svelte 5 runes
6. Run svelte-check to verify

**Files Affected**: ~50+ components

## Implementation Approach

### Phase 1: Error Analysis
```bash
# Run svelte-check and capture output
npm run check:svelte > svelte-check-output.txt

# Parse output and categorize errors
node scripts/categorize-errors.mjs

# Generate error report by category
node scripts/generate-error-report.mjs
```

### Phase 2: Category-Based Repair
For each error category:
1. Extract list of affected files
2. Create repair script for pattern
3. Apply fixes to all affected files
4. Verify fixes with svelte-check
5. Commit changes

### Phase 3: Validation
```bash
# Type checking
npm run check:typescript

# Svelte validation
npm run check:svelte

# Linting
npm run lint

# Testing
npm test

# Build
npm run build
```

### Phase 4: Deployment
```bash
# Build production bundle
npm run build

# Verify bundle
npm run build:analyze

# Deploy to staging
npm run deploy:staging

# Verify in staging
npm run test:staging
```

## Error Handling

### Handling Ambiguous Errors
Some errors may have multiple possible causes. In these cases:
1. Examine the component context
2. Check related files
3. Review error message carefully
4. Apply most likely fix
5. Verify with svelte-check

### Handling Cascading Errors
Fixing one error may reveal new errors. In these cases:
1. Fix the primary error
2. Re-run svelte-check
3. Address new errors
4. Repeat until no new errors

### Handling Unfixable Errors
If an error cannot be fixed:
1. Document the error and reason
2. Escalate to team lead
3. Consider architectural changes
4. Create workaround if needed

## Testing Strategy

### Unit Tests
- Run existing unit tests after each phase
- Verify no regressions
- Check component rendering
- Verify event handlers

### Integration Tests
- Test component interactions
- Verify data flow
- Check state management
- Test API integration

### E2E Tests
- Test user workflows
- Verify UI functionality
- Check accessibility
- Test performance

## Performance Considerations

### Build Performance
- Monitor build time
- Optimize bundle size
- Check for unused code
- Verify tree-shaking

### Runtime Performance
- Check component rendering time
- Monitor memory usage
- Verify event handler performance
- Check state update performance

## Correctness Properties

### Property 1: Syntax Validity
**Definition**: All Svelte components must have valid syntax that passes svelte-check

**Validation**:
```bash
npm run check:svelte
# Expected: 0 errors
```

### Property 2: Type Safety
**Definition**: All TypeScript code must be type-safe with strict mode enabled

**Validation**:
```bash
npm run check:typescript
# Expected: 0 errors
```

### Property 3: Accessibility Compliance
**Definition**: All components must meet WCAG 2.1 AA standards

**Validation**:
```bash
npm run check:svelte
# Expected: 0 accessibility warnings
```

### Property 4: Reactivity Correctness
**Definition**: All reactive values must update correctly using Svelte 5 runes

**Validation**:
```bash
npm test
# Expected: All tests pass
```

### Property 5: No Regressions
**Definition**: All existing functionality must continue to work correctly

**Validation**:
```bash
npm test
npm run test:e2e
# Expected: All tests pass
```

## Rollback Plan

If critical issues are discovered:
1. Revert to previous commit
2. Identify root cause
3. Create targeted fix
4. Test thoroughly
5. Re-apply fix

## Documentation

### For Developers
- Error patterns and fixes
- Repair scripts and tools
- Testing procedures
- Deployment process

### For Future Reference
- Common error patterns
- Prevention strategies
- Best practices
- Migration guidelines

## Success Criteria

1. ✓ All 229 "Unexpected token" errors fixed
2. ✓ All 105 "no exported member" errors fixed
3. ✓ All 99 "not assignable" type errors fixed
4. ✓ All 145 accessibility warnings fixed
5. ✓ All 50+ state reference warnings fixed
6. ✓ svelte-check passes with 0 errors
7. ✓ TypeScript compilation succeeds
8. ✓ All unit tests pass
9. ✓ No regressions in functionality
10. ✓ Build succeeds without errors
