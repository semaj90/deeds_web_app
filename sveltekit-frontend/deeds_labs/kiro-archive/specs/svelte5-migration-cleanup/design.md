# Design Document: Svelte 5 Migration Cleanup

## Overview

This design addresses systematic cleanup of legacy Svelte 4 code patterns to achieve a clean Svelte 5 runes-mode build. The migration is blocked by:

1. **Type import misuse** — `import type` used for runtime values (transitions, components)
2. **Event directive syntax** — `on:click` instead of `onclick`
3. **Deprecated patterns** — `<svelte:component>`, `<slot />`
4. **Reactive state** — Missing `$state()` wrappers
5. **HTML violations** — Self-closing non-void tags, unbound labels

The solution uses automated codemods for mechanical fixes, followed by targeted manual patches for complex cases.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Svelte 5 Migration                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1: Automated Codemods (Mechanical Fixes)            │
│  ├── Fix on: → onclick (event directives)                  │
│  ├── Fix lucide-svelte/icons → lucide-svelte (imports)     │
│  ├── Fix <div /> → <div></div> (self-closing tags)         │
│  └── Fix <svelte:component> → <Component /> (components)   │
│                                                             │
│  Phase 2: Manual Patches (Complex Cases)                   │
│  ├── Fix export let → $props() (legacy components)         │
│  ├── Fix $: → $derived() (reactive statements)             │
│  ├── Fix <slot /> → {@render children()} (layouts)         │
│  └── Fix import type → import (runtime values)             │
│                                                             │
│  Phase 3: Validation (Build Success)                       │
│  ├── Run npm run build                                      │
│  ├── Verify zero Svelte 5 syntax errors                    │
│  └── Confirm production readiness                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Codemod Scripts

**fix-svelte5.mjs** (Node.js)
- Walks `src/` directory recursively
- Applies regex transformations to `.svelte` files
- Logs changes per file
- Reports total files modified

**Transformations**:
```typescript
// Event directives
on:click= → onclick=
on:submit= → onsubmit=
on:change= → onchange=
on:input= → oninput=
on:keydown= → onkeydown=
on:keyup= → onkeyup=
on:focus= → onfocus=
on:blur= → onblur=

// Lucide imports
import X from "lucide-svelte/icons/x" → import { X } from "lucide-svelte"
from "lucide-svelte/icons" → from "lucide-svelte"

// Self-closing tags
<div ... /> → <div ...></div>
<span ... /> → <span ...></span>
<section ... /> → <section ...></section>

// Svelte components
<svelte:component this={X} ... /> → <X ... />
```

### Manual Patch Targets

**Legacy Component Patterns** (`src/routes/_yorha_legacy/*`)
- Convert `export let` → `let { } = $props()`
- Convert `$:` → `$derived()` or `$effect()`
- Convert `<slot />` → `{@render children()}`

**Type Import Issues** (All `.svelte` files)
- Identify `import type` used at runtime
- Convert to `import` (non-type)
- Verify in markup (transitions, components)

**Layout Files** (`+layout.svelte`)
- Add `let { children } = $props()` to script
- Replace `<slot />` with `{@render children()}`

## Data Models

### File Metadata
```typescript
interface FileChange {
  path: string;
  original: string;
  modified: string;
  changes: number;
  timestamp: Date;
}

interface CodemapResult {
  filesProcessed: number;
  filesModified: number;
  totalChanges: number;
  errors: string[];
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Event Directive Elimination
*For any* `.svelte` file, after codemod execution, there should be zero occurrences of `on:` event directives (e.g., `on:click`, `on:submit`).

**Validates: Requirements 2.1, 2.2**

### Property 2: Lucide Import Standardization
*For any* lucide-svelte import, the import path must be exactly `"lucide-svelte"` (not `"lucide-svelte/icons"` or `"lucide-svelte/icons/x"`).

**Validates: Requirements 1.1, 1.2**

### Property 3: Self-Closing Tag Elimination
*For any* non-void HTML element (`div`, `span`, `section`), the element must use closing tags (e.g., `</div>`) and never self-close (e.g., `<div />`).

**Validates: Requirements 5.1, 5.2**

### Property 4: Svelte Component Modernization
*For any* dynamic component, the syntax must use direct component invocation (e.g., `<Component />`) and never use `<svelte:component this={X} />`.

**Validates: Requirements 3.1, 3.2**

### Property 5: Type Import Correctness
*For any* runtime value (transition, component, function), the import must NOT use `import type` syntax; it must use `import` (non-type).

**Validates: Requirements 1.3, 1.4**

### Property 6: Build Success
*After* all codemods and manual patches are applied, `npm run build` must complete with zero Svelte 5 syntax errors.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

## Error Handling

### Codemod Failures
- Log file path and error
- Continue processing remaining files
- Report summary at end
- Do not modify file if error occurs

### Build Failures
- Capture error output
- Identify file and line number
- Categorize error type (syntax, type, import)
- Suggest manual fix if needed

### Verification Failures
- Run `rg` searches to confirm fixes
- Report remaining issues
- Provide file paths for manual review

## Testing Strategy

### Unit Testing (Verification Scripts)

**Test 1: Event Directive Elimination**
```bash
rg "on:" src --glob "*.svelte"
# Expected: 0 results
```

**Test 2: Lucide Import Standardization**
```bash
rg "lucide-svelte/icons" src --glob "*.svelte"
# Expected: 0 results
```

**Test 3: Self-Closing Tag Elimination**
```bash
rg "<(div|span|section)[^>]*\s/>" src --glob "*.svelte"
# Expected: 0 results
```

**Test 4: Svelte Component Modernization**
```bash
rg "<svelte:component" src --glob "*.svelte"
# Expected: 0 results
```

**Test 5: Type Import Correctness**
```bash
rg "import type.*from.*['\"]lucide-svelte" src --glob "*.svelte"
# Expected: 0 results
```

### Property-Based Testing

**Property 1: Event Directive Elimination**
- Generate random `.svelte` files with `on:` directives
- Run codemod
- Verify zero `on:` directives remain
- **Tool**: ripgrep (rg)

**Property 2: Lucide Import Standardization**
- Generate random `.svelte` files with various lucide import paths
- Run codemod
- Verify all imports use `"lucide-svelte"` root path
- **Tool**: ripgrep (rg)

**Property 3: Build Success**
- Run all codemods
- Execute `npm run build`
- Verify exit code 0
- Verify zero Svelte 5 syntax errors in output
- **Tool**: npm build command

### Integration Testing

**Full Pipeline Test**
1. Run `node scripts/fix-svelte5.mjs`
2. Run verification scripts (rg searches)
3. Run `npm run build`
4. Confirm all three steps succeed

