# Phase49 - CSS Sanitiser for Svelte Styles

Phase49 ensures `svelte-check --output json` is able to emit diagnostics even when malformed selector syntax slips into `<style>` blocks. It performs a surgical sweep across `sveltekit-frontend/src/**/*.svelte`, fixing pseudo-selector spacing that causes PostCSS to abort.

## What it does

- Collapses malformed selector tokens such as `.btn: hover`, `.slider: :-webkit-slider-thumb`, and `:not (` into valid CSS.
- Leaves declarations untouched (e.g. `color: red;`), only targeting selector-level issues.
- Summarises every file it touches so you can review the applied fixes.

## Prerequisites

- `npx tsx` available (already part of the repo devDependencies).
- `postcss-safe-parser` installed (added as a devDependency in `sveltekit-frontend`).

## How to run

```powershell
npx tsx scripts/phase49-sanitize-css.ts
```

Afterwards, rerun:

```powershell
Push-Location sveltekit-frontend
npx svelte-check --fail-on-warnings=false --output json | Out-File -Encoding utf8 ../.cache/sveltecheck.json
Pop-Location
```

If the `.cache/sveltecheck.json` file appears with diagnostics, Phase48 can resume embedding.

## Tips

- Pair Phase49 with `npx prettier --write "sveltekit-frontend/src/**/*.svelte"` for consistent formatting.
- Keep `postcss.config.js` pointed at the safe parser so PostCSS continues even if unfamiliar syntax is introduced.
