# Svelte 5 + Bits-UI v2 Migration Design

## Overview

This design document outlines the technical approach for migrating the YoRHa Legal AI frontend from Svelte 4 + legacy Bits-UI to Svelte 5 with Bits-UI v2. The migration is systematic, using automated codemods for mechanical transformations and targeted manual fixes for complex patterns.

## Architecture

### Migration Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Automated Codemods (Mechanical Transforms)    │
│ - Event handler conversion (on: → event attributes)    │
│ - Dynamic component conversion (<svelte:component>)    │
│ - Self-closing tag fixes (<div/> → <div></div>)       │
│ - Import type fixes (transitions)                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Targeted Manual Fixes (Complex Patterns)      │
│ - export let → $props conversion                       │
│ - $: reactive labels → $derived/$effect                │
│ - Bits-UI component API updates                        │
│ - Route conflict resolution                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Styling Standardization (UnoCSS)              │
│ - Inline styles → UnoCSS classes                       │
│ - Tailwind → UnoCSS compatibility                      │
│ - Custom CSS preservation                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Verification & Testing                        │
│ - Build verification (svelte-check < 500)              │
│ - Route rendering tests                                │
│ - API endpoint verification                            │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Codemod Scripts

#### 1. Event Handler Codemod
**File**: `scripts/codemod-svelte5-events.mjs`
**Purpose**: Convert all `on:event` directives to event attributes
**Pattern**: `on:click={handler}` → `onclick={handler}`
**Scope**: All `.svelte` files in `src/`

#### 2. Dynamic Component Codemod
**File**: `scripts/codemod-svelte5-dynamic-components.mjs`
**Purpose**: Convert `<svelte:component>` to direct component usage
**Pattern**: `<svelte:component this={Component} />` → `<Component />`
**Scope**: All `.svelte` files in `src/`

#### 3. Self-Closing Tag Codemod
**File**: `scripts/codemod-svelte5-nonvoid-selfclose.mjs`
**Purpose**: Fix invalid self-closing non-void tags
**Pattern**: `<div />` → `<div></div>`
**Scope**: All `.svelte` files in `src/`

#### 4. Import Type Codemod
**File**: `scripts/codemod-svelte5-import-type.mjs`
**Purpose**: Fix `import type` for runtime values (transitions, animations)
**Pattern**: `import type { fade }` → `import { fade }`
**Scope**: All `.svelte` files in `src/`

### Manual Fix Patterns

#### Pattern 1: export let → $props
**Before**:
```svelte
<script>
  export let caseId: string;
  export let user: User;
</script>
```

**After**:
```svelte
<script lang="ts">
  let { caseId, user } = $props<{
    caseId: string;
    user: User;
  }>();
</script>
```

#### Pattern 2: $: reactive → $derived
**Before**:
```svelte
<script>
  let count = 0;
  $: doubled = count * 2;
</script>
```

**After**:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

#### Pattern 3: $: side effects → $effect
**Before**:
```svelte
<script>
  $: if (count > 10) {
    console.log('Count exceeded');
  }
</script>
```

**After**:
```svelte
<script>
  $effect(() => {
    if (count > 10) {
      console.log('Count exceeded');
    }
  });
</script>
```

#### Pattern 4: Bits-UI v2 Components
**Before**:
```svelte
<script>
  import { Dialog } from 'bits-ui';
</script>

<Dialog open={isOpen}>
  <Dialog.Content>
    <Dialog.Header>Title</Dialog.Header>
  </Dialog.Content>
</Dialog>
```

**After**:
```svelte
<script>
  import * as Dialog from 'bits-ui/components/dialog';
</script>

<Dialog.Root open={isOpen}>
  <Dialog.Content>
    <Dialog.Header>Title</Dialog.Header>
  </Dialog.Content>
</Dialog.Root>
```

## Data Models

### Migration State
```typescript
interface MigrationState {
  totalFiles: number;
  processedFiles: number;
  errorFiles: string[];
  warnings: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}
```

### Codemod Result
```typescript
interface CodemodResult {
  file: string;
  changed: boolean;
  errors: string[];
  warnings: string[];
  linesChanged: number;
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Event Handler Consistency
*For any* Svelte component, after codemod execution, all event handlers SHALL use event attributes (onclick, onchange, etc.) and NOT use on: directives.
**Validates: Requirements 2.1-2.8**

### Property 2: Runes Completeness
*For any* Svelte component, after manual fixes, all reactive state SHALL use $state, all computed values SHALL use $derived, and all side effects SHALL use $effect.
**Validates: Requirements 1.1-1.5**

### Property 3: Bits-UI v2 Compatibility
*For any* component using Bits-UI, after migration, all imports SHALL be from 'bits-ui' v2 and all component usage SHALL follow v2 API patterns.
**Validates: Requirements 3.1-3.6**

### Property 4: Build Success
*For any* build execution after migration, svelte-check errors SHALL be < 500 and core routes (/terminal, /cases/[id], /yorha-detective) SHALL render without errors.
**Validates: Requirements 7.1-7.4**

### Property 5: Route Consolidation
*For any* route path, there SHALL NOT exist both [id] and [caseId] parameters in the same path tree.
**Validates: Requirements 5.1-5.3**

## Error Handling

### Codemod Errors
- **File Read Errors**: Log and skip file, continue with next
- **Regex Match Errors**: Log warning, preserve original content
- **Write Errors**: Rollback changes, log error, skip file

### Build Errors
- **Svelte Compilation**: Collect errors, categorize by type, report to user
- **Type Errors**: Run tsc to identify type issues, suggest fixes
- **Route Conflicts**: Detect and report conflicting routes

### Recovery Strategy
- **Checkpoint System**: Save state after each codemod
- **Rollback Capability**: Revert changes if build fails
- **Incremental Fixes**: Fix one category of errors at a time

## Testing Strategy

### Unit Testing
- Test each codemod script independently
- Verify regex patterns match expected syntax
- Test edge cases (nested components, complex expressions)

### Integration Testing
- Run all codemods in sequence
- Verify build passes after each step
- Test core routes render correctly

### Property-Based Testing
- Generate random Svelte components
- Apply codemods
- Verify properties hold (event handlers, runes, etc.)
- Verify build succeeds

### Manual Testing
- Review sample files after migration
- Test UI interactions in browser
- Verify API endpoints work correctly

## Implementation Phases

### Phase 1: Preparation (1 day)
- Create codemod scripts
- Set up test environment
- Create backup of codebase

### Phase 2: Automated Codemods (1 day)
- Run event handler codemod
- Run dynamic component codemod
- Run self-closing tag codemod
- Run import type codemod
- Verify build

### Phase 3: Manual Fixes (2-3 days)
- Fix export let → $props
- Fix $: reactive → $derived/$effect
- Update Bits-UI components
- Resolve route conflicts
- Verify build

### Phase 4: Styling Standardization (1-2 days)
- Convert inline styles to UnoCSS
- Verify Tailwind compatibility
- Preserve custom CSS

### Phase 5: Verification & Testing (1-2 days)
- Run full test suite
- Verify core routes render
- Test API endpoints
- Performance benchmarks

## Success Criteria

- ✅ All Svelte 4 legacy patterns removed
- ✅ All components use Svelte 5 runes
- ✅ All event handlers use event attributes
- ✅ All Bits-UI components use v2 API
- ✅ All styling uses UnoCSS classes
- ✅ Route conflicts resolved
- ✅ Build passes with svelte-check < 500 errors
- ✅ Core routes render in browser
- ✅ All tests passing
- ✅ Performance benchmarks meet targets
