# Melt UI Quick Reference

Melt UI is a modern UI library for Svelte, providing both low-level builders and higher-level components for building accessible, customizable interfaces.

## Key Concepts

- **Builders:** Functions/classes that return attribute objects and state for UI primitives. Use them in Svelte components or JS/TS files. Example: `import { Toggle } from "melt/builders";`
- **Components:** Svelte components that wrap builders for a more traditional Svelte experience. No default styling; you control the markup and style.
- **Static vs Reactive Props:** Most builder props accept both static values and reactive getters (e.g., `() => value`).
- **MaybeGetter:** A type used for props that can be a value or a getter function.

## Usage Example (Builder)

```svelte
<script lang="ts">
  import { Toggle } from "melt/builders";
  let value = $state(false);
  const toggle = new Toggle({
    value: () => value,
    onValueChange: (v) => (value = v),
    disabled: false,
  });
</script>

<button {...toggle.trigger}>
  {toggle.value ? "On" : "Off"}
</button>
```

## Best Practices

- Use builders for fine-grained control and composability.
- Use components for rapid prototyping or when you want a Svelte-like API.
- Pass reactive values for props that may change (e.g., `disabled: () => isDisabled`).
- Spread builder attributes onto elements (e.g., `{...toggle.trigger}`) for accessibility and correct behavior.
- Refer to each builder/component's docs for usage patterns and available props.

## Common Gotchas

- Builders/components do not provide default styles—add your own or use Tailwind/CSS.
- Always spread the returned attributes for correct ARIA/accessibility.
- Some props require functions for reactivity.

## References

- [Melt UI Docs](https://next.melt-ui.com/guides/how-to-use/)
- [Melt UI GitHub](https://github.com/melt-ui/next-gen)
