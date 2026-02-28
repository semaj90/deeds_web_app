# Vite 8 Beta Upgrade Attempt

**Date:** February 27, 2026
**Session:** 93r28g
**Status:** ❌ BLOCKED — Rolled back to Vite 6.4.1
**Reason:** SvelteKit adapter incompatibility with Rolldown output structure

---

## Objective

Upgrade from **Vite 6.4.1** to **Vite 8.0.0-beta.16** to gain:
- 🚀 **10-30× faster bundling** (Rolldown vs Rollup)
- 🚀 **3× faster dev server startup**
- 🚀 **40% faster full reloads**
- 🚀 **70% faster production builds**

## Vite 8 Features

- **Rolldown bundler:** Rust-based bundler replacing Rollup (10-30× faster)
- **Full Bundle Mode:** 10× fewer network requests in dev server
- **Unified toolchain:** Vite → Rolldown → Oxc (all Rust)
- **API compatibility:** Config API unchanged from Vite 7

## Compatibility Issues Encountered

### ✅ Issue 1: manualChunks Format (FIXED)

**Error:**
```
TypeError: manualChunks is not a function
```

**Cause:** Rolldown requires `manualChunks` to be a function, not an object.

**Solution:**
```typescript
// Before (Rollup format)
manualChunks: {
  bitsUi: ['bits-ui']
}

// After (Rolldown format)
manualChunks(id) {
  if (id.includes('node_modules/bits-ui')) {
    return 'bitsUi';
  }
  return undefined;
}
```

**File:** `vite.config.ts:258-264`

---

### ✅ Issue 2: Malformed CSS var() Syntax (FIXED)

**Error:**
```
[lightningcss minify] Unexpected token IDHash("cec7ad")
SyntaxError: var(--yorha-panel #cec7ad)
```

**Cause:** Invalid CSS `var()` syntax with color inside (should use comma for fallback).

**Solution:**
```css
/* Before (invalid) */
bg-[var(--yorha-panel #cec7ad)]

/* After (fixed by IDE linter) */
bg-[#cec7ad]
```

**File:** `src/lib/components/PhaseStatusPills.svelte:14`

**Note:** Also tried `cssMinify: 'esbuild'` in vite.config.ts to use esbuild instead of lightningcss, but the setting was ignored in Vite 8 beta.

---

### ❌ Issue 3: SvelteKit Adapter Incompatibility (BLOCKER)

**Error:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.svelte-kit/output/server/internal.js'
imported from node_modules/@sveltejs/kit/src/core/postbuild/analyse.js
```

**Cause:** Rolldown's output structure differs from what SvelteKit 2.49.2's adapter expects.

**Impact:** Build completes transformation (2087 modules) but fails during SvelteKit's postbuild phase.

**Possible fixes (not attempted):**
1. Update SvelteKit to a version compatible with Vite 8 (may not exist yet)
2. Use a different adapter (e.g., @sveltejs/adapter-auto)
3. Modify Rolldown output configuration to match expected structure
4. Wait for SvelteKit team to release Vite 8-compatible adapter

**Status:** **Blocker** — requires upstream fixes in SvelteKit or Rolldown

---

## Vite 8 + @apply Directive Warning

**Warning:**
```
[lightningcss minify] Unknown at rule: @apply
```

**Files affected:**
- `src/lib/components/rag/AnswerWithCitations.svelte`
- Other files using UnoCSS `@apply` directives

**Cause:** Vite 8 uses lightningcss for CSS minification by default, which doesn't recognize Tailwind/UnoCSS `@apply` directives.

**Workaround attempted:**
```typescript
// vite.config.ts
build: {
  cssMinify: 'esbuild'  // Use esbuild instead of lightningcss
}
```

**Result:** Setting was ignored in beta, still used lightningcss.

**Recommendation:** Remove `@apply` directives or wait for lightningcss UnoCSS support.

---

## Build Performance Comparison

| Metric | Vite 6.4.1 | Vite 8 Beta | Notes |
|--------|------------|-------------|-------|
| Module transformation | ~30s | ~29s | Similar (both use esbuild) |
| Bundle rendering | ~8s | N/A | Failed at postbuild |
| Total build time | ~38s | Failed | SvelteKit adapter error |
| Dev server startup | Untested | Untested | Blocked by build failure |

**Conclusion:** Performance gains could not be measured due to build failure.

---

## Rollback Process

```bash
cd sveltekit-frontend
npm install -D vite@6.4.1
npm run build  # Verify build works
```

**Files reverted:**
- `package.json`: `vite` dependency `8.0.0-beta.16` → `6.4.1`
- `package-lock.json`: Updated dependencies

**Files kept (no revert needed):**
- `vite.config.ts`: Changes are forward-compatible
  - `manualChunks` function format works with Vite 6
  - `cssMinify: 'esbuild'` ignored in Vite 6 (no effect)
- `src/lib/components/PhaseStatusPills.svelte`: CSS fix is valid

---

## When to Retry Vite 8

**Recommended timing:**
1. **Vite 8 reaches stable** (likely March-April 2026)
2. **SvelteKit releases Vite 8 support** (check @sveltejs/kit changelog)
3. **Rolldown 1.0 final** released (currently 1.0.0-rc.4)

**Pre-flight checklist for retry:**
- [ ] Check SvelteKit compatibility matrix
- [ ] Review Vite 8 migration guide
- [ ] Test on dev branch first
- [ ] Verify all adapters support Vite 8

---

## Alternative: Vite 7 Upgrade

**Vite 7.3.1** (latest stable) is a safer intermediate upgrade:
- ✅ Stable release (not beta)
- ✅ Better SvelteKit compatibility
- ✅ Performance improvements over Vite 6
- ⚠️ Still uses Rollup (not Rolldown)

**Recommendation:** Consider Vite 7 upgrade if build performance is critical before Vite 8 stable.

---

## Lessons Learned

1. **Beta software risks:** Even late-stage betas can have framework incompatibilities
2. **CSS minifier changes:** Vite 8 switched to lightningcss which has stricter validation
3. **Adapter dependencies:** Build tool upgrades require adapter compatibility
4. **Function over object:** Modern bundlers prefer function-based configuration
5. **Test early, fail fast:** Build errors in postbuild phase waste more time than pre-build

---

## References

- [Vite 8 Beta Announcement](https://vite.dev/blog/announcing-vite8-beta)
- [Rolldown 1.0 RC](https://voidzero.dev/posts/announcing-rolldown-rc)
- [Vite 8 + Rolldown Guide](https://usama.codes/blog/vite-8-beta-rolldown-rust-bundler-guide)
- [SvelteKit Issue Tracker](https://github.com/sveltejs/kit/issues)

---

**Next Steps:** Wait for Vite 8 stable + SvelteKit compatibility, then retry upgrade.
