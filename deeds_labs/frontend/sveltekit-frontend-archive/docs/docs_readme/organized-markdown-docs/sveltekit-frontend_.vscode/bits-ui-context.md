# Bits UI Context for SvelteKit 2

## Key Patterns

- `mergeProps(props1, props2)` - Merge component props
- `{#snippet child({ props })}` - Child snippet pattern
- `<Component {...props}>` - Spread merged props

## Example Usage

```svelte
<script>
  import { Accordion } from "bits-ui";
</script>

<Accordion.Trigger id="custom" onclick={handler}>
  {#snippet child({ props })}
    <button {...props} class="custom-class">
      Content
    </button>
  {/snippet}
</Accordion.Trigger>
```

## mergeProps Features

- Chains event handlers in order
- Cancels subsequent handlers if `preventDefault()` called
- Merges classes with `clsx`
- Merges styles (later overrides earlier)
- Chains non-event functions

## Common Props

- `id` - Element identifier
- `class` - CSS classes
- `style` - CSS styles
- `onclick` - Click handler
- `data-*` - Data attributes
