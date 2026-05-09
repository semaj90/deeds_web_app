---
name: uno-css-design-system
description: Use when styling SvelteKit components with UnoCSS. Covers the project's design tokens (sand/panel/accent), the svelte-scoped extraction limitations, and the safelist workaround for dynamic class names.
---

# UnoCSS design system

UnoCSS in `@unocss/svelte-scoped/vite` mode. Config at
`sveltekit-frontend/unocss.config.ts`. Tailwind-compatible utilities,
but extraction happens at build time — so dynamic class expressions
that V8 can compute but the extractor can't *will silently fail to
generate CSS*.

## Theme tokens

| Color | Use |
|-------|-----|
| `sand`, `sandDark` | base text + ink |
| `panel`, `panelSoft` | card / surface backgrounds |
| `accent`, `accentSoft` | primary actions, focus rings |
| `danger` | destructive actions, errors |
| `warning` | warnings, dirty states |
| `info` | informational badges |

Common shortcuts (in `unocss.config.ts`): `app-bg`, `panel`,
`btn-base`, `btn-primary`, `tag`.

## Extraction landmine

```svelte
<!-- FAILS — UnoCSS can't extract `flex`, `gap-3` from a template literal -->
<div class={`flex gap-3 ${isActive ? 'bg-accent' : 'bg-panel'}`}>

<!-- FAILS — class binding with a variable -->
<div class="flex gap-3 {someVar}">

<!-- WORKS — static class strings -->
<div class="flex gap-3 bg-accent">

<!-- WORKS — class:directive form for conditional toggle -->
<div class="flex gap-3" class:bg-accent={isActive} class:bg-panel={!isActive}>
```

Two fixes when you must use dynamics:

1. **Safelist** in `unocss.config.ts` — guarantees generation regardless of extraction:
   ```ts
   safelist: [
     'flex', 'inline-flex', 'items-center', 'justify-between',
     'gap-1', 'gap-2', 'gap-3', 'gap-4',
     'px-2', 'px-3', 'px-4', 'py-1', 'py-2',
   ]
   ```

2. **Scoped `<style>` block** in the component. Most deterministic for
   layout-critical components (tabs, filters, toolbars).

## Class syntax rule

UnoCSS rejects spaces before pseudo-class colons:

```css
/* OK */    hover:bg-accent focus:border-blue-500 disabled:opacity-50
/* NOT OK */ hover :bg-accent
```

## Consistency rule

Pick UnoCSS *or* Tailwind and stay there. This project is UnoCSS. Don't
import Tailwind utility class strings from elsewhere — they may collide
or simply not be generated.

## Anti-patterns

- Hard-coded hex colors when a token exists (`#a78bfa` instead of `text-accent`).
- Shipping `style=""` inline declarations that bypass the design system.
- Adding utilities to safelist without a real reason — bloats the bundle.
- Using `presetUno()` — soft-deprecated since v66.0.0; prefer `preset-wind3` (stable) or `preset-wind4`.

## Related skills

- [bits-ui-svelte5](../bits-ui-svelte5/SKILL.md) — the components you're styling.
