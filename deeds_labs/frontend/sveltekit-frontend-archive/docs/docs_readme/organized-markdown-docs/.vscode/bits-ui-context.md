# Bits UI Context for SvelteKit 2

## Key Patterns
- `mergeProps(props1, props2)` - Merge component props
- `{#snippet child({ props })}` - Child snippet pattern
- `<Component {...props}>` - Spread merged props

## Example Usage
```svelte
<Accordion.Trigger id="custom" onclick={handler}>
  {#snippet child({ props })}
    <button {...props} class="custom-class">
      Content
    </button>
  {/snippet}
</Accordion.Trigger>