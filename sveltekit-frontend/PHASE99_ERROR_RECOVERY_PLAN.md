# Phase 99: Error Recovery Plan

## 1. Critical Error Categories
We have identified 5 categories responsible for the 1,618 errors:

### A. WebGPU SSR Failures (Critical)
- **Symptom**: `navigator is not defined` or `requestAdapter` errors during build/check.
- **Fix**: Use `webgpu-init.ts` wrapper. Never access `navigator.gpu` directly in top-level code or `load` functions without `browser` check.

### B. Svelte 5 Migration Syntax
- **Symptom**: `Unexpected token` in `.svelte` files.
- **Fix**: Run `npx sv migrate svelte-5`.
- **Manual Fixes**: Convert `export let` to `$props()`, `$:` to `$derived()`/`$effect()`.

### C. Import/Export Corruptions
- **Symptom**: `Module has no exported member` or `Cannot find module`.
- **Fix**: Check `src/lib/components/index.ts` (Barrel file) and ensure it only exports valid components. Remove circular dependencies.

### D. CSS/Style Syntax
- **Symptom**: `Expected selector` or `Unexpected }`.
- **Fix**: Syntax errors in `<style>` blocks often due to copy-paste errors or missing braces.

### E. Type Mismatches
- **Symptom**: `Type 'string' is not assignable to type 'number'`.
- **Fix**:
    - Use `any` cast temporarily for legacy code: `as any`.
    - Fix interfaces in `src/lib/types.ts`.

## 2. Recovery Workflow

1. **Snapshot**: Commit current state.
2. **Migrate**: automated Svelte 5 migration.
3. **Stabilize**: Fix Syntax (A, B, D).
4. **Type Check**: Fix Types (C, E).
5. **Verify**: Run tests.
