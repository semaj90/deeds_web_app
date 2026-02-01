# 🚀 QUICK START: Phase 99 Error Fixes

## ⚡ COPY-PASTE COMMANDS (Run in order)

### 1. Commit Current Work
```powershell
cd c:\Users\james\Videos\deeds-web-app
git add .
git commit -m "Phase 99: WebGPU SSR + bits-ui + error analysis"
```

### 2. Run Auto-Migration
```powershell
cd sveltekit-frontend
npx sv migrate svelte-5
# Select ONLY "src" folder when prompted!
```

### 3. Fix UTF-8 Corruption (VS Code Find/Replace - Regex ON)
```
Find: ├ó┼ôΓÇª → Replace: ✓
Find: ├░┼╕ΓÇ£┼á → Replace: ●
Find: ├ó┼íΓÇô├»┬╕┬Å → Replace: ⚖
Find: dispatch\('(\w+)',\s*([^)]+)\)(\w+)\( → Replace: $3(
```

### 4. Clear & Test
```powershell
Remove-Item -Recurse -Force .svelte-kit, node_modules\.cache, build -ErrorAction SilentlyContinue
npx svelte-check --threshold error
npx playwright test
```

---

## 📋 WEBGPU SSR FIX PATTERN (Copy to components)

```svelte
<script>
  import { browser } from '$app/environment';
  import { initWebGPU } from '$lib/webgpu/init';

  let gpuContext = $state(null);
  let fallback = $state(false);

  $effect(() => {
    if (browser) {
      initWebGPU().then(ctx => {
        gpuContext = ctx ?? (fallback = true, null);
      });
    } else {
      fallback = true; // SSR
    }
  });
</script>

{#if fallback}
  <div>CPU Mode</div>
{:else if gpuContext}
  <canvas></canvas>
{/if}
```

---

## 📝 FILES TO MANUALLY FIX

### High Priority
1. `src/lib/components/visualizations/WebGPUEvidenceGraphVisualization.svelte`
2. `src/lib/components/visualization/LegalDocumentGraphViewer.svelte`
3. `src/lib/components/yorha/YoRHaCaseForm.svelte` (createEventDispatcher)

### Medium Priority
- Document upload components (slot patterns)
- Dashboard widgets (event handlers)
- Components with `$$restProps`

---

## ✅ SUCCESS METRICS

**Target**: 1,618 → ~300 errors (81% reduction)
**WebGPU**: 0 SSR failures
**Migration**: 80% complete
**Time**: ~70 minutes

---

**Ready to execute!** 🚀
