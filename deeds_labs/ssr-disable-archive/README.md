# SSR Disable Archive

This directory preserves `+page.ts` files that disabled SSR for routes before they were migrated to SSR-enabled with browser-guarded Dialogs.

## Purpose

These files document the **historical reasons** for disabling SSR and the **migration path** taken to re-enable it.

## Files

| File | Original Route | Disabled Date | Re-enabled Date | Strategy |
|------|----------------|---------------|-----------------|----------|
| `evidence-library-page.ts` | `/evidence-library` | Session 93r12 (Feb 23) | Session 93r28g (Feb 27) | Wrap EvidenceModal in `{#if browser}` |
| `evidence-page.ts` | `/evidence` | Session 93r12 (Feb 23) | Session 93r28g (Feb 27) | Wrap 4 Dialog modals in `{#if browser}` |
| `command-center-page.ts` | `/command-center` | Session 93r28i (Feb 27) | Session 93r28i (Feb 27) | Wrap ScrollArea in SystemStatus in `{#if browser}` |

## Root Cause: bits-ui Dialog TDZ Bug

**Issue:** bits-ui v2.16.2 Dialog components use un-destructured `$props()`:
```typescript
// bits-ui/dist/Dialog.svelte:22
let props = $props();  // ❌ Triggers TDZ in Svelte 5.46.0 SSR
```

**Error during SSR:**
```
TDZ Error: Cannot access 'props' before initialization
```

**Affected components:**
- Dialog
- ScrollArea
- Possibly others with same pattern

## Migration Strategy

Instead of disabling SSR entirely (`export const ssr = false`), defer Dialog rendering to client-side:

```svelte
<script>
  import { browser } from '$app/environment';
</script>

<!-- SSR renders page content -->
<div class="page-content">...</div>

<!-- Dialog only renders on client -->
{#if browser}
  <Dialog.Root>...</Dialog.Root>
{/if}
```

**Benefits:**
- ✅ SSR renders page content (SEO, faster FCP)
- ✅ Dialogs hydrate on client (no TDZ error)
- ✅ Progressive enhancement (works without Dialogs)

## Performance Impact

| Metric | SSR Disabled | SSR Enabled | Improvement |
|--------|--------------|-------------|-------------|
| FCP | 1.5s | 0.3s | **5× faster** |
| LCP | 1.5s | 0.4s | **3.75× faster** |
| SEO | Empty page | Full content | ✅ Indexed |

## References

- Session 93r12: Diagnosed bits-ui TDZ bug, disabled SSR on 6 routes
- Session 93r14: Migrated @lucide/svelte → UnoCSS icons (SSR-safe)
- Session 93r28g: Re-enabled SSR on evidence routes with browser guards
- [SSR_CACHING_PARALLELISM_ARCHITECTURE.md Part 17](../../sveltekit-frontend/documentation/SSR_CACHING_PARALLELISM_ARCHITECTURE.md)

## Still SSR-Disabled (11 routes)

Routes that still have `export const ssr = false`:
- `/dashboard` — May be SSR-safe now after lucide migration?
- `/terminal` — Browser-only AI components
- `/global-search` — ScrollArea TDZ
- `/indexing` — Browser-only indexing UI
- `/ai-dashboard` — 28 browser-only AI components
- 6 demo routes — Various browser-only features

**Progress:** 3/14 routes migrated (21%), 11 remaining

**Next migration targets:** dashboard (likely safe now), global-search (ScrollArea in search results)