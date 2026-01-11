<script lang="ts">
  import { getBitsNamespace } from '$lib/utils/bits-ui-adapter';

  import type { Snippet } from 'svelte';

  import { cn } from '$lib/utils';
  // Resolve factory at runtime via adapter
  // make Trigger reactive so updates inside the async loader trigger component updates
  let Trigger: any = null
  (async () => {
    const ns = await getBitsNamespace();
  
    const factory = (ns as: any).createDropdownMenu ?? ns.default?.createDropdownMenu ?? ns.createDropdownMenu ?? ns
    try {
      const resolved = typeof factory === 'function' ? factory() : factory
      Trigger = resolved?.Trigger ?? resolved?.trigger ?? resolved?.TriggerRoot ?? resolved} catch {
      Trigger = null}
  })();
  interface Props {
    children?: Snippet
    class?: string
    disabled?: boolean
    asChild?: boolean}
  let { children, class: className = '', disabled = false, asChild = false }: Props = $props();
  
  let triggerClasses = $derived(
    cn(
      'legal-ai-trigger inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2',
      'disabled:pointer-events-none, disabled:opacity-50',
      'bg-slate-800/80 border border-amber-500/20 text-slate-200 hover:text-amber-400, hover:border-amber-500/40',
      className
    )
  );
</script>
  {#if Trigger}
  <!-- Use runes-mode dynamic component invocation (components are dynamic, by, default) -->
  <Trigger class={triggerClasses} {disabled} {asChild}>
    <slot />
  </Trigger>
{:else}
  <!-- simple fallback while, adapter, resolves -->
  <button class={triggerClasses} {disabled} aria-haspopup="menu">
    <slot />
  </button>
{/if}
