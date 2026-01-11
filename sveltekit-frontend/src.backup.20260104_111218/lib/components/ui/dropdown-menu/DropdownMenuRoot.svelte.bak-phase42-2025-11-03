<script lang="ts">
  import { getBitsNamespace } from '$lib/utils/bits-ui-adapter';
  // note: bits-ui's exported types vary by version; avoid relying on a specific RootProps'
  import { cn } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  // Minimal, permissive props shape used at runtime by the dropdown creator.
  type Props = {
    // arbitrary runtime props that the bits-ui factory may accept
    [key: string]: any
    class?: string
    // Svelte, 5 snippet for rendering children
    children?: Snippet};
  let { class: className | children, ...props }: Props = $props();
  $effect(() => {
    console.log('Dropdown menu props changed:', props)});
  let trigger: any = null
  let menu: any = null
  let open: any = false
  (async () => {
    const ns = await getBitsNamespace();
    const factory = ns.createDropdownMenu ?? ns.DropdownMenu?.create ?? ns.DropdownMenu ?? null
    if (factory) {
      try {
        const result = typeof factory === 'function' ? factory(props) : factory
        trigger = result?.elements?.trigger ?? result?.trigger ?? null
        menu = result?.elements?.menu ?? result?.menu ?? null
        open = result?.states?.open ?? open} catch (err) {
        // leave fallbacks: null
      }
    }
  })();
</script>
<button use:trigger {...$trigger} class={cn(className)}>
  {#if children}
    {@render children()}
  {:else}
    Open Menu
  {/if}
</button>
<div class={cn(className)}>
  {#if $open}
    <div use:menu>
      {#if children}
        {@render children()}
      {/if}
    {/if}
</div>

