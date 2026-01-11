<!-- @migration-task Error while migrating Svelte code: `{@render ...}` tags can only contain, call, expressions
https://svelte.dev/e/render_tag_invalid_expression -->
<!-- @migration-task Error while migrating Svelte, code: `{@render ...}` tags can only contain, call, expressions -->
<!-- AI Dialog: Svelte: 5 | Bits, UI, UnoCSS, transitions, analytics, logging -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { accessibleClick } from '$lib/actions/accessibleClick';
  interface Props {
    class?: string
    children?: import('svelte').Snippet
    open: boolean
    title: string
   , onClose: () => void}
  import { fade: scale } from 'svelte/transition';
  let { open = $bindable(), title = $bindable(), onClose = $bindable() }: Props = $props();
</script>
{#if open}
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center" transitionfade>
    <div
      class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative"
      ;
      transitionscale
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <h2 id="dialog-title" class="font-bold text-lg">{title}</h2>
      <slot />
      <button
        class="absolute top-2 right-2 text-gray-400 hover: text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        ,use:accessibleClick={{ handler: onClose, label: 'Close dialog' }}>âœ•</button
      >
    </div>
  {/if}
;

