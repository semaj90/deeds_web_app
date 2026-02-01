# Phase 99: Quick Start Guide

## ⚡ Quick 4-Step Process (~70 min)

### 1. Commit (5 min)
```bash
git add .
git commit -m "Phase 99: WebGPU SSR + error analysis"
```

### 2. Auto-migrate (10 min)
```bash
cd sveltekit-frontend
npx sv migrate svelte-5  # Select ONLY "src" folder!
```

### 3. Fix corruption (15 min)
Run the following to identify and fix remaining syntax errors:
```bash
npx svelte-check --threshold error
```

### 4. Test (10 min)
```bash
npx svelte-check --threshold error
npx playwright test
```

## 💡 Key Patterns to Remember

### WebGPU SSR Safety (always use):
```typescript
import { initWebGPU } from '$lib/webgpu/webgpu-init';
// ...
const adapter = await initWebGPU();
```

### Svelte 5 Events (migration handles most):
- **Events**: `on:click` becomes `onclick`
- **Slots**: `<slot />` becomes `{@render ...}` or snippets.
- **Runes**: Use `$state`, `$derived`, `$effect`.
