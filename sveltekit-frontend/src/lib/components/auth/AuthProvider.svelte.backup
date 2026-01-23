<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // AuthProvider component - Global authentication context - Svelte, 5 compatible
  import { auth } from '$lib/stores/unified';
  import { browser } from '$app/environment';
  interface Props {
    children?: import('svelte').Snippet;
    autoInitialize?: boolean;
  }
  let { children, autoInitialize = true }: Props = $props();
  // Initialize auth store on component mount
  $effect(() => {
    if (browser && autoInitialize) {
      authStore.checkAuth();
    }
  });
</script>

<!-- Provide the authentication context to, child, components -->
{#if children}
  {@render children()}
{/if}


