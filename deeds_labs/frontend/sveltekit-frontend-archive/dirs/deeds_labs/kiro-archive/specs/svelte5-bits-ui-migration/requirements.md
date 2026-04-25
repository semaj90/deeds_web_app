# Svelte 5 + Bits-UI v2 Migration Requirements

## Introduction

This specification defines the requirements for migrating the YoRHa Legal AI frontend from Svelte 4 + legacy Bits-UI to Svelte 5 with Bits-UI v2, while standardizing on UnoCSS for styling. The migration affects 700+ API endpoints and hundreds of UI components across the codebase.

## Glossary

- **Svelte 5 Runes**: New reactive primitives ($props, $state, $derived, $effect) replacing legacy patterns
- **Bits-UI v2**: Updated component library with new API for Svelte 5
- **UnoCSS**: Atomic CSS framework for consistent styling
- **Event Attributes**: Svelte 5 pattern (onclick, onchange) replacing on: directives
- **Legacy Patterns**: Svelte 4 syntax (export let, $:, on:event) that must be removed
- **API Endpoints**: Backend routes (700+) that may reference UI patterns in documentation/types

## Requirements

### Requirement 1: Svelte 5 Runes Migration

**User Story**: As a developer, I want all components to use Svelte 5 runes, so that the codebase is modern and maintainable.

#### Acceptance Criteria

1. WHEN a component has `export let` declarations, THE system SHALL convert them to `let { prop } = $props<Type>()`
2. WHEN a component has reactive labels (`$: variable = ...`), THE system SHALL convert them to `let variable = $derived(...)`
3. WHEN a component has reactive side effects (`$: { ... }`), THE system SHALL convert them to `$effect(() => { ... })`
4. WHEN a component uses `onMount`, THE system SHALL convert it to `$effect(() => { ... })`
5. WHEN a component uses `onDestroy`, THE system SHALL convert it to `$effect(() => () => { ... })`

### Requirement 2: Event Handler Migration

**User Story**: As a developer, I want all event handlers to use Svelte 5 event attributes, so that the code is consistent and future-proof.

#### Acceptance Criteria

1. WHEN a component has `on:click={handler}`, THE system SHALL convert it to `onclick={handler}`
2. WHEN a component has `on:submit={handler}`, THE system SHALL convert it to `onsubmit={handler}`
3. WHEN a component has `on:change={handler}`, THE system SHALL convert it to `onchange={handler}`
4. WHEN a component has `on:input={handler}`, THE system SHALL convert it to `oninput={handler}`
5. WHEN a component has `on:keydown={handler}`, THE system SHALL convert it to `onkeydown={handler}`
6. WHEN a component has `on:keyup={handler}`, THE system SHALL convert it to `onkeyup={handler}`
7. WHEN a component has `on:focus={handler}`, THE system SHALL convert it to `onfocus={handler}`
8. WHEN a component has `on:blur={handler}`, THE system SHALL convert it to `onblur={handler}`

### Requirement 3: Bits-UI v2 Component Updates

**User Story**: As a developer, I want all Bits-UI components to use the v2 API, so that components are compatible with Svelte 5.

#### Acceptance Criteria

1. WHEN a component imports from `bits-ui`, THE system SHALL verify the import uses v2 API
2. WHEN a component uses `Dialog`, THE system SHALL ensure it uses the new Dialog primitives (DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogClose)
3. WHEN a component uses `Button`, THE system SHALL ensure it uses the new Button component with proper props
4. WHEN a component uses `Card`, THE system SHALL ensure it uses the new Card primitives (CardRoot, CardHeader, CardTitle, CardContent, CardFooter)
5. WHEN a component uses `Tooltip`, THE system SHALL ensure it uses the new Tooltip primitives (TooltipRoot, TooltipContent, TooltipTrigger)
6. WHEN a component uses `Select`, THE system SHALL ensure it uses the new Select primitives

### Requirement 4: UnoCSS Styling Standardization

**User Story**: As a developer, I want all components to use UnoCSS classes consistently, so that styling is maintainable and performant.

#### Acceptance Criteria

1. WHEN a component has inline styles, THE system SHALL convert them to UnoCSS classes where possible
2. WHEN a component has Tailwind classes, THE system SHALL verify they are compatible with UnoCSS
3. WHEN a component has custom CSS, THE system SHALL preserve it but document the reason
4. WHEN a component uses spacing (p-, m-, w-, h-), THE system SHALL ensure UnoCSS classes are used
5. WHEN a component uses flexbox/grid, THE system SHALL ensure UnoCSS classes are used (flex, grid, gap-)

### Requirement 5: Route Conflict Resolution

**User Story**: As a developer, I want all route conflicts resolved, so that the application builds without errors.

#### Acceptance Criteria

1. WHEN the codebase has both `[id]` and `[caseId]` route parameters in the same path, THE system SHALL consolidate to `[id]`
2. WHEN a route conflict is detected, THE system SHALL remove the duplicate route directory
3. WHEN routes are consolidated, THE system SHALL verify all API endpoints still function correctly

### Requirement 6: API Endpoint Documentation Updates

**User Story**: As a developer, I want API endpoint documentation to reflect Svelte 5 patterns, so that new code follows best practices.

#### Acceptance Criteria

1. WHEN an API endpoint has example code, THE system SHALL update examples to use Svelte 5 patterns
2. WHEN an API endpoint has type definitions, THE system SHALL ensure they are compatible with Svelte 5 runes
3. WHEN an API endpoint has UI component examples, THE system SHALL update them to use Bits-UI v2

### Requirement 7: Build Verification

**User Story**: As a developer, I want the build to pass with minimal errors, so that the application is production-ready.

#### Acceptance Criteria

1. WHEN the build runs, THE system SHALL have svelte-check errors < 500
2. WHEN the build runs, THE system SHALL have no fatal compilation errors
3. WHEN the build runs, THE system SHALL verify core routes render correctly (/terminal, /cases/[id], /yorha-detective)
4. WHEN the build runs, THE system SHALL verify all API endpoints are accessible

## Success Criteria

- ✅ All Svelte 4 legacy patterns removed
- ✅ All components use Svelte 5 runes ($props, $state, $derived, $effect)
- ✅ All event handlers use event attributes (onclick, onchange, etc.)
- ✅ All Bits-UI components use v2 API
- ✅ All styling uses UnoCSS classes
- ✅ Route conflicts resolved
- ✅ Build passes with svelte-check < 500 errors
- ✅ Core routes render in browser
- ✅ All 700+ API endpoints documented with Svelte 5 examples
