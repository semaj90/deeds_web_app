# Svelte 5 Dynamic Component Pattern

## ❌ OLD: Svelte 4 Pattern (Deprecated in Runes Mode)

```svelte
<svelte:component this={item.icon} class="icon-class" />
```

## ✅ NEW: Svelte 5 Runes Pattern

```svelte
{#each navigation as item}
  {@const IconComponent = item.icon}
  <a href={item.href}>
    <IconComponent class="icon-class" />
    {item.name}
  </a>
{/each}
```

**Key Rule**: `{@const}` must be the **immediate child** of:
- `{#snippet}`
- `{#if}`, `{:else if}`, `{:else}`
- `{#each}`, `{:then}`, `{:catch}`
- `<svelte:fragment>`
- `<Component>`

**❌ WRONG** - Inside a `<div>`:
```svelte
{#each items as item}
  <a href={item.href}>
    <div>
      {@const Icon = item.icon}  <!-- ERROR! -->
      <Icon />
    </div>
  </a>
{/each}
```

**✅ CORRECT** - Immediate child of `{#each}`:
```svelte
{#each items as item}
  {@const Icon = item.icon}
  <a href={item.href}>
    <div>
      <Icon />
    </div>
  </a>
{/each}
```

## Why This Change?

In Svelte 5 with runes mode, **components are dynamic by default**. The `<svelte:component>` tag is no longer needed and is deprecated.

## Real-World Example

### Before (Svelte 4):
```svelte
<script>
  import { Home, Settings, User } from 'lucide-svelte';

  let navigation = [
    { name: 'Home', icon: Home },
    { name: 'Settings', icon: Settings },
    { name: 'Profile', icon: User }
  ];
</script>

{#each navigation as item}
  <a href={item.href}>
    <svelte:component this={item.icon} class="w-5 h-5" />
    {item.name}
  </a>
{/each}
```

### After (Svelte 5):
```svelte
<script>
  import { Home, Settings, User } from 'lucide-svelte';

  let navigation = [
    { name: 'Home', icon: Home },
    { name: 'Settings', icon: Settings },
    { name: 'Profile', icon: User }
  ];
</script>

{#each navigation as item}
  <a href={item.href}>
    {@const IconComponent = item.icon}
    <IconComponent class="w-5 h-5" />
    {item.name}
  </a>
{/each}
```

## Key Benefits

1. **More Explicit**: Clear what component is being rendered
2. **Better TypeScript**: Type checking works better
3. **Cleaner**: No special syntax needed
4. **Performance**: Slightly faster (no dynamic lookup)

## Common Use Cases

### Icon Libraries (Lucide, Heroicons, etc.)
```svelte
{@const Icon = navItem.icon}
<Icon class="mr-2" size={20} />
```

### Dynamic Form Inputs
```svelte
{@const InputComponent = field.type === 'text' ? TextInput : NumberInput}
<InputComponent bind:value={field.value} />
```

### Conditional Components
```svelte
{@const CardComponent = premium ? PremiumCard : BasicCard}
<CardComponent data={userData} />
```

## Migration Pattern

**Find and Replace Pattern:**

```bash
# Find (regex):
<svelte:component\s+this=\{([^}]+)\}

# Replace with:
{@const Component = $1}
<Component
```

## Our Sidebar.svelte Fix

We had 4 instances of `<svelte:component>` for rendering navigation icons:

```svelte
// OLD (lines 219, 259, 288, 328)
<svelte:component
  this={item.icon}
  class={cn('mr-3 h-5 w-5 flex-shrink-0', /* ... */)}
/>

// NEW
{@const IconComponent = item.icon}
<IconComponent
  class={cn('mr-3 h-5 w-5 flex-shrink-0', /* ... */)}
/>
```

All 4 instances fixed! ✅

## Additional Notes

- The `{@const}` tag is a compile-time constant declaration
- It's scoped to the current block (e.g., inside `{#each}`)
- Can be used for any derived value, not just components
- Works great with dynamic component selection

## References

- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
