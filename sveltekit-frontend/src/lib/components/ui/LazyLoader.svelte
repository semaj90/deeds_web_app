<script lang="ts">
  import { componentLoader } from '$lib/utils/dynamic-imports';
  import AILoadingIndicator from "./AILoadingIndicator.svelte";

  interface Props {
    loader: () => Promise<any>;
    key: string;
    fallback?: string;
    errorFallback?: string;
    props?: Record<string, unknown>;
  }

  let {
    loader,
    key,
    fallback = 'Loading component...',
    errorFallback = 'Failed to load component',
    props: componentProps = {}
  }: Props = $props();

  let Component = $state<any>(null);
  let isLoading = $state<boolean>(true);
  let error = $state<Error | null>(null);

  async function loadComponent(): Promise<void> {
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
  <div class="lazy-load-error p-4 border border-danger/20 dark:border-danger/30 rounded-lg bg-danger/5 dark:bg-danger/10">
    <h3 class="text-danger dark:text-danger/40 font-semibold">Component Error</h3>
    <p class="text-danger dark:text-danger/80 text-sm mt-1">{errorFallback}</p>
    <button onclick={retry} class="mt-2 px-3 py-1 bg-danger text-white rounded text-sm hover:bg-danger/80">
      Retry
    </button>
  </div>
{:else if Component}
  <Component {...componentProps} />
{/if}

<style>
  .lazy-load-error {
    min-height: 100px;
	display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>
