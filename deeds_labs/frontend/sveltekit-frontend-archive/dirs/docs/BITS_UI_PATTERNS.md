# Bits UI 2.x + Svelte 5 Patterns

**Version**: bits-ui 2.14.4+
**Svelte Version**: 5.43.2+
**Last Updated**: January 9, 2026
**Source**: https://bits-ui.com/docs

## Installation

```bash
npm install bits-ui
```

## Import Pattern

Bits UI uses **namespace imports** for Svelte 5:

```svelte
<script lang="ts">
  import { Checkbox, Label } from "bits-ui";
</script>

<Checkbox.Root>
  {#snippet children({ checked })}
    {checked ? '✅' : '❌'}
  {/snippet}
</Checkbox.Root>

<Label.Root>Label Text</Label.Root>
```

## Checkbox Component

### Basic Usage
```svelte
<script lang="ts">
  import { Checkbox } from "bits-ui";

  let checked = $state(false);
</script>

<Checkbox.Root bind:checked>
  {#snippet children({ checked, indeterminate })}
    {#if indeterminate}
      -
    {:else if checked}
      ✅
    {:else}
      ❌
    {/if}
  {/snippet}
</Checkbox.Root>
```

### With Props Destructuring
```svelte
<script lang="ts">
  import { Checkbox } from "bits-ui";

  let {
    checked = $bindable(false),
    disabled = false,
    name,
    required = false,
    value = "on"
  } = $props();
</script>

<Checkbox.Root
  bind:checked
  {disabled}
  {name}
  {required}
  {value}
>
  {#snippet children({ checked })}
    {checked ? '✓' : ''}
  {/snippet}
</Checkbox.Root>
```

## Label Component

```svelte
<script lang="ts">
  import { Label } from "bits-ui";
</script>

<Label.Root for="my-input">
  My Label
</Label.Root>
<input id="my-input" />
```

## Select Component

```svelte
<script lang="ts">
  import { Select } from "bits-ui";

  let selected = $state<string | undefined>();
</script>

<Select.Root bind:value={selected}>
  <Select.Trigger>
    {selected ?? 'Select an option'}
  </Select.Trigger>

  <Select.Portal>
    <Select.Content>
      <Select.Item value="apple">Apple</Select.Item>
      <Select.Item value="banana">Banana</Select.Item>
      <Select.Item value="cherry">Cherry</Select.Item>
    </Select.Content>
  </Select.Portal>
</Select.Root>
```

## Dialog Component

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";

  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>Dialog description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

## Tabs Component

```svelte
<script lang="ts">
  import { Tabs } from "bits-ui";

  let value = $state('tab1');
</script>

<Tabs.Root bind:value>
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="tab1">
    Content 1
  </Tabs.Content>

  <Tabs.Content value="tab2">
    Content 2
  </Tabs.Content>
</Tabs.Root>
```

## Styling with Class Names

All components accept a `class` prop for styling:

```svelte
<Checkbox.Root
  class="h-5 w-5 rounded border-2 border-gray-300 data-[state=checked]:bg-blue-500"
>
  <!-- ... -->
</Checkbox.Root>
```

## Utility Functions

### useId()
Generate unique IDs for accessibility:

```svelte
<script lang="ts">
  import { useId } from "bits-ui";

  const id = useId();
</script>

<label for={id}>Label</label>
<input {id} />
```

### WithoutChildrenOrChild
Type helper for components without children:

```svelte
<script lang="ts">
  import type { WithoutChildrenOrChild } from "bits-ui";
  import { Checkbox } from "bits-ui";

  type Props = WithoutChildrenOrChild<Checkbox.RootProps> & {
    labelText: string;
  };

  let { labelText, ...restProps }: Props = $props();
</script>
```

## Data Attributes

Bits UI components expose data attributes for state-based styling:

- `data-state`: `"checked" | "unchecked" | "indeterminate"` (Checkbox)
- `data-disabled`: Present when disabled
- `data-readonly`: Present when readonly
- `data-orientation`: `"horizontal" | "vertical"`

```css
[data-state="checked"] {
  background-color: blue;
}

[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## Form Integration

```svelte
<script lang="ts">
  import { Checkbox } from "bits-ui";
</script>

<form>
  <Checkbox.Root name="terms" value="accepted" required>
    {#snippet children({ checked })}
      {checked ? '✓' : ''}
    {/snippet}
  </Checkbox.Root>

  <button type="submit">Submit</button>
</form>
```

## Common Patterns

### Reusable Checkbox Component
```svelte
<!-- MyCheckbox.svelte -->
<script lang="ts">
  import { Checkbox, Label, useId, type WithoutChildrenOrChild } from "bits-ui";

  type Props = WithoutChildrenOrChild<Checkbox.RootProps> & {
    labelText: string;
  };

  let {
    id = useId(),
    checked = $bindable(false),
    labelText,
    ...restProps
  }: Props = $props();
</script>

<Checkbox.Root {id} bind:checked {...restProps}>
  {#snippet children({ checked, indeterminate })}
    {#if indeterminate}
      -
    {:else if checked}
      ✓
    {/if}
  {/snippet}
</Checkbox.Root>

<Label.Root for={id}>
  {labelText}
</Label.Root>
```

## Migration from bits-ui 0.x/1.x

### BEFORE
```svelte
<script>
  import { Checkbox } from "bits-ui";
</script>

<Checkbox.Root let:checked>
  <Checkbox.Indicator>
    {checked ? '✓' : ''}
  </Checkbox.Indicator>
</Checkbox.Root>
```

### AFTER
```svelte
<script>
  import { Checkbox } from "bits-ui";
</script>

<Checkbox.Root>
  {#snippet children({ checked })}
    {checked ? '✓' : ''}
  {/snippet}
</Checkbox.Root>
```

## Resources

- [Bits UI Documentation](https://bits-ui.com/docs)
- [Bits UI GitHub](https://github.com/huntabyte/bits-ui)
- [Component Examples](https://bits-ui.com/docs/components)
