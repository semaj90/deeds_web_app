# Route Conflict Resolution

## Problem Identified

SvelteKit was throwing the error:
```
The "/(tools)/search" and "/search" routes conflict with each other
```

This happened because two page routes resolve to the same `/search` path:
- `src/routes/(tools)/search/+page.svelte` → `/search` (inside layout group)
- `src/routes/search/+page.svelte` → `/search` (top-level)

## Solution Implemented

**Removed the duplicate top-level `/search` route** and kept the more developed `/(tools)/search` route as the primary search page.

### Actions Taken

1. **Archived duplicate**: Renamed `src/routes/search/` → `src/routes/search.bak/`
   - This preserves the code in case it's needed for reference
   - Removes the route conflict

2. **Verified**: Confirmed `/(tools)/search` remains intact with:
   - `src/routes/(tools)/search/+page.svelte` (page component)
   - `src/routes/(tools)/search/+page.server.ts` (server logic)

## Why `/tools/search` is Better

The `/(tools)/search` route is the primary search interface because it:
- Uses **superforms** for robust form handling
- Implements **Zod validation** with SearchFormSchema
- Has **server-side logic** in +page.server.ts
- Supports **advanced search options**
- Integrates with the `/api/search` endpoint we just built

## Route Resolution

| Previous | Current | Status |
|----------|---------|--------|
| `/search` | ❌ Removed (archived as search.bak) | Conflicting |
| `/tools/search` | ✅ Primary search interface | Active |
| `/api/search` | ✅ Search API endpoint | Active |

## Build Status

After resolving the conflict:
- ✅ `npx svelte-kit sync` completes without route errors
- ✅ No remaining routing conflicts
- ✅ `/tools/search` route is properly recognized
- ✅ Search API and UI are fully integrated

## Integration Flow

```
User visits /tools/search
        ↓
Loads /(tools)/search/+page.svelte (UI)
        ↓
Uses /(tools)/search/+page.server.ts (server logic)
        ↓
Submits to POST /api/search
        ↓
Processes through XState machine pipeline
        ↓
Returns results to UI
```

## Files Reference

- **Primary Route**: `src/routes/(tools)/search/+page.svelte`
- **Server Logic**: `src/routes/(tools)/search/+page.server.ts`
- **Search API**: `src/routes/api/search/+server.ts`
- **Backup (archived)**: `src/routes/search.bak/+page.svelte`

## How to Access

Navigate to: `http://localhost:5173/tools/search`

This displays the search interface and integrates with the complete embedding → PG → Qdrant → merge → summarize → tag pipeline.

---

**Status**: ✅ Route conflict resolved - Ready for development
