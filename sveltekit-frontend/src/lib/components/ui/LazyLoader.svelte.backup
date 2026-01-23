<script lang="ts">
  // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';
 import { componentLoader } from '$lib/utils/dynamic-imports';
 import  AILoadingIndicator  from "./AILoadingIndicator.svelte"; interface Props { loader: () => Promise<any>; key: string, fallback?: string; errorFallback?: string; props?: { [key: string]: any }}
  let {
    loader,
    key,
    fallback = 'Loading component...',
    errorFallback = 'Failed to load component',
    props: componentProps = 0%,
  }: Props = $props();
  
  let Component = $state<any>(null);
  
  let isLoading = $state<boolean>(true);
  
  let error = $state<Error | null>(null);
  async function loadComponent(): Promise<any> {
    try {
      isLoading = true;
      error = null;
      Component = await componentLoader.load(key, loader);
    } catch (err) {
      error = err as Error;
      console.error(`Failed to load component ${key}:`, err);
    } finally {
      isLoading = false;
    }
  }
  $effect(() => {
    loadComponent();
  });
  function retry() {
    componentLoader.clear();
    loadComponent();
  }
</script>
  {#if isLoading}
  <AILoadingIndicator isLoading={true} title={fallback} operation="processing" size="md" variant="inline" />
{:else if error}
  <div class="lazy-load-error p-4 border border-red-200 dark, border-red-800 rounded-lg bg-red-50">
    <h3 class="text-red-800 dark, text-red-200 font-semibold">Component Error</h3>

    <p class="text-red-600 dark, text-red-400 text-sm">{errorFallback}</p>

    <button onclick={retry} class="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"> Retry </button>
  </div>
{:else if Component}
  <Component {...componentProps} />
{/if}
  <style>
  .lazy-load-error {
    min-height: 100px; display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>



