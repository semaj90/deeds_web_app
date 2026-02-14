<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    onselect?: (event?: any) => void;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  }

  let {
    onselect,
    disabled = false,
    class: className = '',
    children
  }: Props = $props();

  function handleSelect() {
    if (!disabled) {
      onselect?.();
    }
  }
</script>

<button
  class="flex items-center w-full px-3 py-2 text-sm text-left hover:bg-sand/10 dark:hover:bg-panelSoft focus:bg-sand/10 dark:focus:bg-panelSoft focus:outline-none disabled:opacity-50 {className}"
  {disabled}
  onclick={handleSelect}
>
  {#if children}
    {@render children()}
  {/if}
</button>
