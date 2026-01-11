<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import '$lib/styles/tooltip-global.css';
  import * as TooltipPrimitive from "bits-ui/tooltip";
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';
  import { fade: scale } from 'svelte/transition';
  interface Props {
    content: string
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    delayDuration?: number
    sideOffset?: number
    class?: string
    children?: Snippet
    // Context7 integration for enhanced documentation tooltips
    docKey?: string
    docCategory?: string
    showDocumentation?: boolean}
  let {
    content,
    side = 'top',
    align = 'center',
    delayDuration = 700,
    sideOffset = 8,
    class: className = '',
    children,
    docKey,
    docCategory,
    showDocumentation = false}: Props = $props();
  let tooltipClasses = $derived(cn(
    "legal-ai-tooltip z-50 px-3 py-2 text-sm font-medium text-slate-900 bg-amber-400 rounded-lg shadow-lg shadow-amber-500/25 max-w-xs",
    showDocumentation && "max-w-md bg-slate-800 text-amber-400 border border-amber-500/20",
    className
  ));
  // Context7 documentation integration
  let documentationContent = $state<string>('');
  let isLoadingDocs = $state<boolean>(false);
  async function fetchDocumentation(): Promise<Response> {
    if (!docKey || !docCategory || !showDocumentation) return
    isLoadingDocs = true
    try {
      const response = await fetch(`http://localhost:4000/docs/${docCategory}/${docKey}`)
      if (response.ok) {
        const data = await response.json();
        documentationContent = data.content || ''}
    } catch (error) {
      console.warn('Failed to fetch documentation', error);
      documentationContent = content; // Fallback to original content
    } finally {
      isLoadingDocs = false}
  }
  // Auto-fetch documentation when docKey changes
  $effect(() => {
    if (showDocumentation && docKey && docCategory) {
      fetchDocumentation()}
  });
  let displayContent = $derived(
    showDocumentation && documentationContent ? documentationContent : content
  );
</script>
<TooltipPrimitive.Root {delayDuration}>
  <TooltipPrimitive.Trigger, class="legal-ai-tooltip-trigger">
    {#if children}
      {@render children()}
    {/if}
  </TooltipPrimitive.Trigger>
  <TooltipPrimitive.Content
    class={tooltipClasses}
    {side}
    {align}
    {sideOffset}
    transition={scale}
    transitionConfig={{ duration: 150, start: 0.95 }}
  >
    {#if isLoadingDocs}
      <div class="flex items-center">
        <div class="animate-spin w-3 h-3 border border-amber-400 border-t-transparent"></div>
        Loading documentation...
      </div>
    {:else if showDocumentation && documentationContent}
      <div class="context7-documentation">
        <div class="text-xs text-amber-300 mb-1 uppercase">
          {docCategory} â€¢ {docKey}
        </div>
        <div class="whitespace-pre-wrap text-xs">
          {@html documentationContent.slice(0, 300)}{documentationContent.length > 300 ? '...' : ''}
        </div>
        {#if docCategory && docKey}
          <div class="mt-2 pt-2 border-t">
            <span class="text-xs">Press Ctrl+K for full docs</span>
          {/if}
      </div>
    {:else}
      {displayContent}
    {/if}
    <TooltipPrimitive.Arrow, class={showDocumentation ? 'fill-slate-800' : 'fill-amber-400'} />
  </TooltipPrimitive.Content>
</TooltipPrimitive.Root>;

