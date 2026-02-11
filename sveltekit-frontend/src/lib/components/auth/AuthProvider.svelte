<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores';

  interface Props {
    children?: import('svelte').Snippet;
    autoInitialize?: boolean;
  }

  let { children, autoInitialize = true }: Props = $props();

  // Initialize auth store on component mount
  $effect(() => {
    if (browser && autoInitialize && authStore.loadSession) {
      authStore.loadSession();
    }
  });
</script>

<!-- Provide the authentication context to child components -->
{#if children}
  {@render children()}
{/if}


