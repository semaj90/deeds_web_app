<!-- AI Dialog: Svelte 5 | Bits UI | UnoCSS, transitions, analytics, logging -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { accessibleClick } from '$lib/actions/accessibleClick';
  import { fade, scale } from 'svelte/transition';

  interface Props {
    class?: string;
    children?: Snippet;
    open: boolean;
    title: string;
    onClose: () => void;
  }

  let {
    class: className,
    children,
    open = $bindable(),
    title,
    onClose
  }: Props = $props();
</script>

{#if open}
  <div
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
    transition:fade
  >
    <div
      class="bg-white dark:bg-panel rounded-lg shadow-lg p-6 w-full max-w-md relative {className || ''}"
      transition:scale
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <h2 id="dialog-title" class="font-bold text-lg mb-4">{title}</h2>

      {#if children}
        {@render children()}
      {/if}

      <button
        class="absolute top-2 right-2 text-sand/40 hover:text-sand/80 dark:hover:text-sand/40 focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2"
        use:accessibleClick={{ handler: onClose, label: 'Close dialog' }}
        aria-label="Close dialog"
      >
        ✕
      </button>
    </div>
  </div>
{/if}
