# Problems TODO

## Critical TypeScript/Svelte Errors

- [x] Fix all notification objects in `EnhancedLegalCaseManager.svelte` to include a `title` property.
- [x] Update `analyticsStore.logEvent` and `trackPageView` calls to use correct arguments and ensure methods exist.
- [x] Check and fix `caseStore.updateCase` and `caseStore.getCase` usage for correct arguments and method existence.
- [x] Ensure all spread operations (e.g., `...data.metadata`) are performed on object types only.
- [x] Replace illegal `$page` variable usage with `globalThis.$page` or a valid variable name (false positive - properly imported).
- [x] Convert `EnhancedLegalCaseManager.svelte` to use Svelte 5 runes consistently (`$state`, `$derived`, `$effect`).
- [x] Fix deprecated `on:click` to `onclick` event handlers in `EnhancedLegalCaseManager.svelte`.
- [x] Fix deprecated `<svelte:component>` usage and replace with dynamic component pattern.
- [x] Add `$state()` to `recognition` and `isListening` variables to fix reactivity.
- [x] Fix `$page` store access in onMount for Svelte 5 compatibility.

## Other Issues

- [x] Fix Button event forwarding and usage in all components (done for `EnhancedLegalAIDemo.svelte`).
- [ ] Address type mismatches and missing properties in `optimization-dashboard/+page.svelte`.
- [ ] Resolve missing namespace `Database` in `test/+page.svelte`.
- [ ] Address accessibility warnings (e.g., a11y_label_has_associated_control).
- [ ] Remove unused CSS selectors in Dialog, Chat, and other components.
- [ ] Fix deprecated Svelte component usage in VectorIntelligenceDemo.
- [ ] Fix spread type errors in caseData updates.
- [ ] Review and fix any other errors surfaced by `npm run check`.

## Latest Update - August 3, 2025

Successfully converted `EnhancedLegalCaseManager.svelte` to full Svelte 5 runes compatibility:

- Replaced `writable()` stores with `$state()`
- Replaced `derived()` stores with `$derived()`
- Replaced `$:` reactive statements with `$effect()`
- Updated all template expressions to remove `$` store accessors
- Fixed event handlers from `on:click` to `onclick`
- Updated dynamic component usage for Svelte 5
- Fixed store page access pattern
- Added proper reactivity declarations

The main `EnhancedLegalCaseManager.svelte` component is now fully compatible with Svelte 5 and should have zero TypeScript/Svelte errors.

---

Continue with remaining files that need similar Svelte 5 conversions and TypeScript fixes.
