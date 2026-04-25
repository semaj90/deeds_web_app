# SvelteKit 2 Route Groups - URL Structure Guide

## 🔑 Critical Concept

**Route groups with parentheses `(name)` are LAYOUT-ONLY groupings.**
**They DO NOT appear in the actual URL paths!**

## File Path vs URL Examples

| File System Path | Actual URL | ❌ WRONG URL |
|-----------------|------------|-------------|
| `src/routes/(legal)/cases/+page.svelte` | `/cases` | `/(legal)/cases` |
| `src/routes/(ai)/chat/+page.svelte` | `/chat` | `/(ai)/chat` |
| `src/routes/(admin)/users/+page.svelte` | `/users` | `/(admin)/users` |
| `src/routes/(public)/about/+page.svelte` | `/about` | `/(public)/about` |

## Why Use Route Groups?

Route groups let you:
1. **Share layouts** without affecting URLs
2. **Organize code** by feature/domain
3. **Apply themes** to specific sections
4. **Group related routes** logically

## Example Structure

```
src/routes/
├── (legal)/                    ← Layout group (not in URL)
│   ├── +layout.svelte         ← Shared layout for all legal routes
│   ├── +layout.ts             ← Shared data/config
│   ├── cases/                 ← URL: /cases
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   ├── evidence/              ← URL: /evidence
│   │   └── +page.svelte
│   └── detective/             ← URL: /detective
│       └── +page.svelte
├── (ai)/                       ← Layout group (not in URL)
│   ├── +layout.svelte         ← Shared AI theme/layout
│   ├── chat/                  ← URL: /chat
│   │   └── +page.svelte
│   └── assistant/             ← URL: /assistant
│       └── +page.svelte
```

## Common Mistakes

### ❌ WRONG: Redirecting to route group path
```typescript
// Don't do this!
const legacyRouteMapping = {
  '/old-cases': '/(legal)/cases'  // ❌ 404 error
};
```

### ✅ CORRECT: Redirect to actual URL
```typescript
// Do this instead
const legacyRouteMapping = {
  '/old-cases': '/cases'  // ✅ Works!
};
```

### ❌ WRONG: Linking with route group in href
```svelte
<!-- Don't do this! -->
<a href="/(legal)/cases">Cases</a>  <!-- ❌ 404 -->
```

### ✅ CORRECT: Link to actual URL
```svelte
<!-- Do this instead -->
<a href="/cases">Cases</a>  <!-- ✅ Works! -->
```

## Our Fixed Routes

| Feature | File Path | Correct URL |
|---------|-----------|-------------|
| Legal Cases | `(legal)/cases/+page.svelte` | `/cases` |
| Evidence | `(legal)/evidence/+page.svelte` | `/evidence` |
| AI Chat | `(ai)/chat/+page.svelte` | `/chat` |
| AI Assistant | `(ai)/assistant/+page.svelte` | `/assistant` |

## Layout Sharing Benefits

```svelte
<!-- (legal)/+layout.svelte -->
<script>
  // This layout applies to ALL routes in (legal)/
  // But doesn't create /(legal)/ URL prefix
  import LegalNavBar from '$lib/components/legal/NavBar.svelte';
  let consolePalette = 'matrix'; // Green terminal theme
</script>

<LegalNavBar />
<main class="legal-theme">
  {@render children()}
</main>
```

All routes in `(legal)/` will:
- ✅ Share the same navbar
- ✅ Use the matrix console theme
- ✅ Have consistent layout/styling
- ✅ Still have clean URLs like `/cases`, `/evidence`

## Route Resolution Fix

**Before** (caused 404):
```typescript
legacyRouteMapping = {
  '/cases': '/(legal)/cases'  // ❌ Redirects to non-existent URL
};
```

**After** (works correctly):
```typescript
legacyRouteMapping = {
  // Comment out - route already at correct path
  // '/cases': '/cases' would create infinite redirect
};
```

## Testing Checklist

- [x] Visit `/cases` → Shows legal cases page
- [x] Check layout → Uses `(legal)/+layout.svelte`
- [x] No 404 errors
- [x] DEV_BYPASS_AUTH banner shows in dev mode
- [x] Redirect from old URLs works
- [x] No infinite redirect loops

## Key Takeaway

**🎯 Route groups `(name)` organize your code, not your URLs!**

Think of them as folders for organization that "disappear" when the app runs.
