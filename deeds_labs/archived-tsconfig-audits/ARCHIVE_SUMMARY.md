# Archived: tsconfig Audit Working Files

**Archived**: April 5, 2026
**Reason**: Intermediate working files from the tsconfig blanket-exclude widening audit (sessions April 4-5, 2026). All useful widening work has been merged into the canonical `sveltekit-frontend/tsconfig.json`.

## Files

| File | Origin | Purpose |
|------|--------|---------|
| `__audit.mjs` | repo root | 1-line scratch test (`console.log(42)`) |
| `tsconfig.audit.json` | repo root | Base widening variant — identical compiler options, broader exclude list |
| `tsconfig.audit.ollama.json` | repo root | Variant with `src/lib/server/ollama.ts` excluded |
| `tsconfig.audit.shims.json` | repo root | Variant with `src/lib/shims/**` excluded |
| `tsconfig.audit.ui.json` | repo root | Variant with extra `src/lib/ui/**`, `src/lib/shared/**`, `src/lib/adapters/**` |
| `tsconfig.audit.phase14.json` | sveltekit-frontend/ | Narrower scope variant for Phase 14 audit |
| `tsconfig.audit.ui-quickaction.json` | sveltekit-frontend/ | Most restrictive variant (22 more excludes than canonical) — narrowed to UI quick-action audit |
| `tsconfig.audit.ui-quickaction.out` | sveltekit-frontend/ | Empty svelte-check output (3 lines, 0 errors) |

## Key Finding

These variants are all **more restrictive** than the canonical tsconfig (they exclude MORE, not fewer directories). They were used to narrow scope for targeted audit passes, not to track widening progress. The canonical `sveltekit-frontend/tsconfig.json` already contains the final merged widening result.

## No Revival Value

Nothing in these files needs to be revived or rewritten. They are purely historical working artifacts.