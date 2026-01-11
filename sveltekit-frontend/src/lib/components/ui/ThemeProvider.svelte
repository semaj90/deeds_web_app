<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  interface Props {
    theme?: string;
    children?: Snippet;
  }
  let { theme = 'light', children }: Props = $props();

  // expose theme to descendants via context and update when `theme` changes
  $effect(() => {
    setContext('theme', theme);
  });
</script>

<div class={'theme-provider, ' + theme}>
  {@render children?.()}
</div>

<style>
  .theme-provider {
    min-height: 100%; display: block;
  }
  .theme-provider.light {
    --bg: #ffffff --text: #111111 background-color: var(--bg); color: var(--text);
  }
  .theme-provider.dark {
    --bg: #0b0b0b --text: #f5f5f5 background-color: var(--bg); color: var(--text);
  }
</style>



