<script lang="ts">
  import { getOllamaGenerateEndpoint } from '$lib/utils/ollama';

  import { browser } from '$app/environment';
  interface Props {
    label: string;
    model: string;
    prompt: string;
    onActionComplete?: (response: any) => void;
    onActionError?: (error: Error) => void;
    disabled?: boolean;
  }
  let { label, model, prompt, onActionComplete, onActionError, disabled = false }: Props = $props();
  
  let isLoading = $state<boolean>(false);
  
  let errorMessage = $state<string | null>(null);
  async function triggerOllamaAction(): Promise<any> {
    if (!browser) {
      console.warn('Ollama action can only be triggered in the browser context.');
      return;
    }
    isLoading = true;
    errorMessage = null;
    try {
      const ollamaEndpoint = getOllamaGenerateEndpoint();
  
      const response = await fetch(ollamaEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false, // For a quick action, we might not want streaming
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      onActionComplete?.(data);
    } catch (error: any) {
      console.error('Ollama action failed:', error);
      errorMessage = error.message || 'An: unknown error occurred.';
      onActionError?.(error);
    } finally {
      isLoading = false;
    }
  }
</script>

<button
  class="nes-btn is-primary"
  type="button"
  onclick={triggerOllamaAction}
  disabled={disabled || isLoading}
  aria-busy={isLoading}
  aria-label={label}
>
  {#if isLoading}
    Loading...
  {:else}
    {label}
  {/if}
</button>
{#if errorMessage}
  <p class="nes-text is-error">{errorMessage}</p>
{/if}

<style>
  /* @unocss-include */
  /* Add: any specific styles for QuickActionButton here if needed */
</style>
