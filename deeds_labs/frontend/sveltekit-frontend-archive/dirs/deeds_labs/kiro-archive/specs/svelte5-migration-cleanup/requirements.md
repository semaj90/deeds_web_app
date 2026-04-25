# Requirements Document: Svelte 5 Migration Cleanup

## Introduction

The codebase is transitioning from Svelte 4 to Svelte 5 (runes mode). While core routing and case detail wiring are complete, legacy code patterns and incorrect import paths are blocking the build. This spec addresses systematic cleanup of:

1. **Type import misuse** — `import type` used for runtime values (e.g., `fade` transition)
2. **Legacy event syntax** — `on:click` → `onclick` conversion
3. **Deprecated component patterns** — `<svelte:component>`, `<slot />`
4. **Reactive state declarations** — Missing `$state()` wrappers
5. **HTML/A11y violations** — Self-closing non-void tags, unbound labels

The goal is a clean `npm run build` with zero Svelte 5 syntax errors, enabling feature development without framework friction.

## Glossary

- **Runes Mode**: Svelte 5's new reactivity system using `$state`, `$derived`, `$effect`
- **Type Import**: `import type { X }` — compile-time only, erased at runtime
- **Runtime Import**: `import { X }` — available at runtime
- **Event Directive**: Old syntax `on:click`, new syntax `onclick`
- **Transition**: Svelte animation function (e.g., `fade`, `slide`) — must be runtime import
- **Legacy Code**: Svelte 3/4 syntax incompatible with Svelte 5 runes mode
- **Codemod**: Automated code transformation script

## Requirements

### Requirement 1: Fix Type Import Misuse

**User Story:** As a developer, I want all runtime values (transitions, animations, components) to use runtime imports, so that Svelte 5 can access them at runtime without compilation errors.

#### Acceptance Criteria

1. WHEN a file imports a transition (e.g., `fade`, `slide`) using `import type` THEN the system SHALL convert it to `import { fade }`
2. WHEN a file imports a component using `import type` THEN the system SHALL convert it to `import { Component }`
3. WHEN a file uses a runtime value in markup (e.g., `transition:fade`) THEN the system SHALL verify the import is NOT `import type`
4. WHEN scanning the codebase THEN the system SHALL identify all `import type` statements and flag those used at runtime

### Requirement 2: Convert Event Directives to Event Attributes

**User Story:** As a developer, I want all event handlers to use Svelte 5 event attribute syntax, so that the codebase is consistent and forward-compatible.

#### Acceptance Criteria

1. WHEN a file contains `on:click={handler}` THEN the system SHALL convert it to `onclick={handler}`
2. WHEN a file contains `on:submit={handler}` THEN the system SHALL convert it to `onsubmit={handler}`
3. WHEN a file contains mixed event syntaxes (both `on:` and event attributes) THEN the system SHALL convert all to event attributes
4. WHEN converting event directives THEN the system SHALL preserve handler logic and parameters unchanged

### Requirement 3: Replace Deprecated Component Patterns

**User Story:** As a developer, I want deprecated Svelte 4 patterns removed, so that the codebase uses Svelte 5 idioms exclusively.

#### Acceptance Criteria

1. WHEN a file contains `<svelte:component this={X} />` THEN the system SHALL convert it to `<X />`
2. WHEN a file contains `<slot />` in a layout THEN the system SHALL convert it to `{@render children()}`
3. WHEN a layout uses `<slot />` THEN the system SHALL ensure the script declares `let { children } = $props()`
4. WHEN converting patterns THEN the system SHALL verify no syntax errors are introduced

### Requirement 4: Declare Reactive State with $state()

**User Story:** As a developer, I want all mutable local variables declared with `$state()`, so that Svelte 5 reactivity works correctly.

#### Acceptance Criteria

1. WHEN a file declares a mutable variable (e.g., `let loading = true`) THEN the system SHALL wrap it with `$state(true)`
2. WHEN a file declares a typed mutable variable (e.g., `let error: string | null = null`) THEN the system SHALL convert it to `let error = $state<string | null>(null)`
3. WHEN the compiler flags "non-reactive update" warnings THEN the system SHALL identify and fix the source variable
4. WHEN a variable is derived or effect-based THEN the system SHALL use `$derived()` or `$effect()` instead

### Requirement 5: Fix HTML/A11y Violations

**User Story:** As a developer, I want all HTML to be valid and accessible, so that the codebase meets Svelte 5 compiler standards.

#### Acceptance Criteria

1. WHEN a file contains `<div />` or `<span />` THEN the system SHALL convert to `<div></div>` or `<span></span>`
2. WHEN a file contains a `<label>` without a `for` attribute THEN the system SHALL add `for="id"` and bind the input with `id="id"`
3. WHEN a form input lacks an associated label THEN the system SHALL create the association
4. WHEN fixing HTML THEN the system SHALL preserve all styling and functionality

### Requirement 6: Automate Codemod Execution

**User Story:** As a developer, I want automated scripts to apply fixes repo-wide, so that manual patching is minimized.

#### Acceptance Criteria

1. WHEN running a codemod script THEN the system SHALL process all `.svelte` files in `src/`
2. WHEN a codemod modifies a file THEN the system SHALL log the file path and number of changes
3. WHEN a codemod completes THEN the system SHALL report total files changed and total files processed
4. WHEN codemods are applied THEN the system SHALL preserve file formatting and comments

### Requirement 7: Validate Build Success

**User Story:** As a developer, I want to verify that all fixes result in a clean build, so that the codebase is production-ready.

#### Acceptance Criteria

1. WHEN all codemods are applied THEN the system SHALL run `npm run build`
2. WHEN the build completes THEN the system SHALL report zero Svelte 5 syntax errors
3. WHEN errors remain THEN the system SHALL identify the file and error type
4. WHEN the build succeeds THEN the system SHALL confirm readiness for feature development

