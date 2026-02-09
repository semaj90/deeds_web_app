# Archived Component Wrappers - February 9, 2026

## Why These Components Were Archived

These local component wrappers around bits-ui are **obsolete** with Svelte 5 + bits-ui v2.15.5.

### Reason 1: Svelte 5 Runes Make Barrel Exports Unnecessary

**Old Pattern (Svelte 4):**
- Required barrel exports (`index.ts`) for store organization
- Stores needed wrapper components for reactivity
- Complex import paths with re-exports

**New Pattern (Svelte 5 Runes):**
- Reactivity works in `.svelte.ts` files directly
- No need for store wrappers or barrel exports
- Direct imports from bits-ui are clearer

### Reason 2: bits-ui v2 Uses Namespace Imports

**Obsolete Pattern (These Wrappers):**
```typescript
// ❌ Local wrapper components
import { Select, SelectContent, SelectItem } from '$lib/components/ui/select';
```

**Correct Pattern (bits-ui v2):**
```typescript
// ✅ Direct namespace import
import * as Select from "bits-ui/components/select";
```

### Reason 3: Maintenance Burden

**Problems with Local Wrappers:**
- Version drift between wrapper and bits-ui
- Duplicated type definitions
- Extra maintenance overhead
- Larger bundle size (no tree-shaking)
- TypeScript inference issues

**Benefits of Direct bits-ui Imports:**
- ✅ Always up-to-date with bits-ui
- ✅ Better TypeScript inference
- ✅ Smaller bundle (tree-shaking works)
- ✅ Less code to maintain
- ✅ Single source of truth

---

## What Was Archived

### Select Components (9 wrapper files)
- `Select.svelte` - Main wrapper component
- `SelectRoot.svelte` - Root component wrapper
- `SelectTrigger.svelte` - Trigger wrapper
- `SelectValue.svelte` - Value display wrapper
- `SelectContent.svelte` - Dropdown content wrapper
- `SelectItem.svelte` - Item wrapper
- `SelectGroup.svelte` - Group wrapper
- `SelectLabel.svelte` - Label wrapper
- `SelectSeparator.svelte` - Separator wrapper
- `index.ts` - Barrel export file

### Migration Path

**Before (Archived Pattern):**
```svelte
<script lang="ts">
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
    from '$lib/components/ui/select';
</script>

<Select.Root>
  <Select.Trigger>
    <Select.Value />
  </Select.Trigger>
  <Select.Content>
    <Select.Item value="1">Option 1</Select.Item>
  </Select.Content>
</Select.Root>
```

**After (Direct bits-ui v2):**
```svelte
<script lang="ts">
  import * as Select from "bits-ui/components/select";
</script>

<Select.Root>
  <Select.Trigger>
    <Select.Value />
  </Select.Trigger>
  <Select.Content>
    <Select.Item value="1">Option 1</Select.Item>
  </Select.Content>
</Select.Root>
```

**Result**: Identical functionality, cleaner code, better types.

---

## Related Documentation

- [Svelte 5 Runes](https://svelte.dev/blog/runes)
- [bits-ui v2 Migration Guide](https://www.bits-ui.com/docs/migration-guide)
- [Session 13 Progress Report](../../../../../../../SESSION_13_PROGRESS_2026-02-09.md)
- [CLAUDE.md Svelte 5 Section](../../../../../../../CLAUDE.md#svelte-5-runes-state-management-without-stores)

---

## Scripts Used for Migration

1. **fix-select-imports.mjs** - Converts local imports to bits-ui v2 namespace imports
2. Located in: `sveltekit-frontend/scripts/fix-select-imports.mjs`
3. Usage: `node scripts/fix-select-imports.mjs`

---

**Archived**: February 9, 2026
**Reason**: Obsolete with Svelte 5 runes + bits-ui v2.15.5
**Replacement**: Direct `import * as Select from "bits-ui/components/select"`