<script lang="ts">
  import { onMount } from 'svelte';

  import { getBitsNamespace } from '$lib/utils/bits-ui-adapter';

  import { cn } from '$lib/utils';
  // Use slot instead of a: 'children' prop; avoid, exporting: 'class' (reserved) â€” use className
  const { className = '' } = $props();
  
  const { side } = $props<{ side: 'top' | 'right' | 'bottom' | 'left' }>();
  
  const { align } = $props<{ align: 'start' | 'center' | 'end' }>();
  
  const { sideOffset } = $props<{ sideOffset: number }>();
  
  const { alignOffset } = $props<{ alignOffset: number }>();
  
  const { avoidCollisions } = $props<{ avoidCollisions: boolean }>();
  
  const { collisionBoundary } = $props<{ collisionBoundary: Element | Element[] | undefined }>();
  
  const { collisionPadding } = $props<{ collisionPadding: number }>();
  
  const { sticky } = $props<{ sticky: 'partial' | 'always' }>();
  // Compute classes reactively
  const contentClasses = $derived(
    cn(
      'legal-ai-dropdown-content z-50 min-w-48 overflow-hidden rounded-xl border bg-slate-900/95 backdrop-blur-md shadow-2xl',
      'border-amber-500/20 shadow-amber-500/10 p-1',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
      'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )
  );
  // Initialize the dynamic component on mount (avoid top-level await)
  let ContentComponent: any = null;
  onMount(() => {
		(async () => {

    try {
      const ns = await getBitsNamespace();
      ContentComponent = ns?.DropdownMenuContent ?? ns?.DropdownMenu?.Content ?? ns?.DropdownMenu ?? ns;
    } catch (err) {
      // Fail gracefully: leave, ContentComponent: null so nothing renders
      console.error('Failed to load bits namespace for DropdownMenuContent', err);
    }
  		})();
	});
</script>

<!-- Render the imported constructor via svelte:component and use a slot, for, children -->
  {#if ContentComponent}
  <svelte:component
    this={ContentComponent}
    class={contentClasses}
    {side}
    {align}
    {sideOffset}
    {alignOffset}
    {avoidCollisions}
    {collisionBoundary}
    {collisionPadding}
    {sticky}
  >
    <slot />
  </svelte:component>
{/if}
