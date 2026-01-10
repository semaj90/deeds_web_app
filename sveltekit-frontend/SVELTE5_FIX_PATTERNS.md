# Svelte 5 Migration Fix Patterns

## ✅ Dry-Run Results (January 9, 2026)

**Files Fixed**: 4 test files
**Success Rate**: 1/4 (25%) - cn imports fixed, bits-ui patterns need refinement
**Remaining Errors**: ~215 errors (down from 218)

---

## 🎯 Fix Patterns

### 1. ✅ Import `cn` from `$lib` Barrel Export

**Problem**:
```typescript
import { cn } from "$lib/utils/cn";  // ❌ TypeScript can't resolve $lib/*
```

**Solution**:
```typescript
import { cn } from "$lib";  // ✅ Uses barrel export from src/lib/index.ts
```

**Why**: The `$lib/index.ts` re-exports `cn` from `utils/cn.ts`. TypeScript's path mapping in `.svelte-kit/tsconfig.json` has explicit paths for specific modules but not a wildcard `$lib/*` pattern.

**Impact**: ~30 files need this fix

**Automation**:
```powershell
Get-ChildItem -Path src -Recurse -Include *.svelte,*.ts |
  Where-Object { $_.FullName -notmatch 'node_modules|\.backup|phase72' } |
  ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match 'import \{ cn \} from ["\x27]\$lib/utils/cn["\x27]') {
      $content = $content -replace 'import \{ cn \} from ["\x27]\$lib/utils/cn["\x27]', 'import { cn } from "$lib"'
      Set-Content $_.FullName -Value $content -NoNewline
      Write-Host "Fixed: $($_.Name)" -ForegroundColor Green
    }
  }
```

---

### 2. ⚠️ bits-ui Component Imports (NEEDS INVESTIGATION)

**Problem**:
```typescript
import { DropdownMenu } from "bits-ui";  // ❌ TypeScript error
import * as DropdownMenu from 'bits-ui/dropdown-menu';  // ❌ No subpath exports
```

**Current State**:
- bits-ui v2.14.4 exports components as **namespace objects**
- Type definitions show `export * as DropdownMenu from "./exports.js"`
- Main entry (`bits-ui/dist/index.d.ts`) exports: `Accordion, AlertDialog, Avatar, Button, Checkbox, DropdownMenu, etc.`

**Possible Solutions** (UNTESTED):

**Option A**: Use wrapper components (RECOMMENDED)
```svelte
<!-- Use our Svelte 5 wrapper components -->
<script>
  import { DropdownMenu } from "$lib/components/ui/dropdown-menu";
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>Menu</DropdownMenu.Trigger>
  <DropdownMenu.Content>...</DropdownMenu.Content>
</DropdownMenu.Root>
```

**Option B**: Import namespace correctly (NEEDS TESTING)
```typescript
import { DropdownMenu as DropdownMenuNS } from "bits-ui";
// Then use: <DropdownMenuNS.Root>
```

**Option C**: Check if bits-ui needs type augmentation
```typescript
// In src/app.d.ts or similar
declare module "bits-ui" {
  export * from "bits-ui/dist/index.d.ts";
}
```

**Impact**: ~100 files have bits-ui namespace errors

**Status**: ⏸️ **HOLD** - Needs manual investigation before automation

---

### 3. ⚠️ SvelteComponentTyped → Component Migration

**Problem**:
```typescript
// Svelte 4 type
Argument of type 'SvelteComponentTyped<...>' is not assignable to
  parameter of type 'ConstructorOfATypedSvelteComponent | Component<any, any, any>'
```

**Solution** (TBD):
```typescript
// Svelte 5 pattern - needs research
import type { Component } from "svelte";
```

**Impact**: ~88 files with SvelteComponentTyped usage

**Status**: ⏸️ **HOLD** - Requires Svelte 5 type system understanding

---

## 🔧 Manual Service API Wiring Fixes

### Context
XState machines reference Go microservices that may have changed APIs. Need to audit and update:

**Files to Check**:
1. `src/lib/services/goServiceClient.ts` - Go service HTTP client
2. `src/lib/services/production-service-client.ts` - Production service adapter
3. `src/lib/api/production-service-client.ts` - Alternative location?
4. `src/lib/machines/*.ts` - All machine service invocations

**Pattern**:
```typescript
// OLD (Svelte 4 / XState v4)
invoke: {
  src: 'performSemanticSearch',
  input: ({ context: event } => ({ query: context.searchQuery }))  // ❌ Typo fixed
}

// NEW (XState v5)
invoke: {
  src: 'performSemanticSearch',
  input: ({ context, event }) => ({ query: context.searchQuery })  // ✅ Fixed
}
```

**Action Items**:
- [ ] Verify Go service endpoints are still valid (HTTP/3 QUIC vs HTTP/2)
- [ ] Check request/response schemas match current Go APIs
- [ ] Test RabbitMQ integration (queue names, message formats)
- [ ] Validate Redis cache keys and data structures
- [ ] Confirm Qdrant collection names and query formats

---

## 📚 Web Search Documentation Updates

**Files to Update**:
1. `claude.md` - Add XState v5 patterns and bits-ui v2 imports
2. `gemini.md` - Add Svelte 5 runes migration examples
3. `copilot.md` - Add $lib barrel export pattern

**Key Topics**:
- XState v5 `setup()` API and `fromPromise` actors
- Svelte 5 `$props()`, `$state()`, `$derived()` runes
- bits-ui v2 namespace imports vs wrapper components
- SvelteKit `$lib` path resolution (barrel exports)

---

## 📊 Error Breakdown

**Total Errors**: 218 → 215 (after dry-run)

1. **Import Resolution** (~27 remaining): `$lib/utils/cn` → `$lib`
2. **bits-ui Types** (~100): Namespace import pattern TBD
3. **SvelteComponentTyped** (~88): Svelte 4 → 5 component types

---

## ✅ Next Steps

**Immediate** (Safe to automate):
1. ✅ Run cn import fix across all files (pattern tested)
2. Validate error count drops by ~30

**Research Required**:
1. ⚠️ Investigate bits-ui v2 correct import pattern
2. ⚠️ Test one file with bits-ui namespace fix
3. ⚠️ Read Svelte 5 migration guide for Component types

**Manual Audit**:
1. 🔧 Service API wiring (Go microservices, RabbitMQ, Redis, Qdrant)
2. 📚 Update web_searches documentation

---

## 🎯 Success Criteria

- [ ] Error count < 50 (from 218)
- [ ] All `$lib/utils/cn` imports resolved
- [ ] bits-ui components working with correct import pattern
- [ ] Service API calls tested and validated
- [ ] Documentation updated with migration patterns

**Last Updated**: January 9, 2026 - Dry-run phase complete
