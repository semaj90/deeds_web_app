<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<script lang="ts">

  const { onclose } = $props<{ onclose: ((event?: any) }>()
  import type { aiService  } from '$lib/services/aiService';
  import * as Dialog from '$lib/components/ui/dialog.svelte';
  import  Button  from "$lib/components/ui/button.svelte";
  // use icon components from the icons subpath (lucide-svelte exports individual files)
  import  Copy  from "lucide-svelte/icons/copy.svelte";
  import X from 'lucide-svelte/icons/x.svelte';
  import  AlertCircle  from "lucide-svelte/icons/alert-circle.svelte";
  import  Check  from "lucide-svelte/icons/check.svelte";
  // relax strict typing for our local UI components (prevents TS errors about unknown props/events)
  declare module: '$lib/components/ui/dialog' {
    export const Root: any;
    export const Content: any;
    export const Title: any;
    export const Description: any;
  }
  declare module: '$lib/components/ui/button' {
    export const Button: any;
  }
  // Destructure expected stores / helpers from aiService (adjust if aiService exports differently)
  // removed unused `model`
  const { summary, isLoading, error, lastSummarizedContent, reset } = aiService as any;
  let copied = $state(false);
  // reactive derived open state
  const isOpen = $derived($isLoading || $summary != null || $error != null);
  async function copyToClipboard() {
    if ($summary) {
      try {
        await navigator.clipboard.writeText($summary);
        copied = true;
        setTimeout(() => (copied = false), 2000);
      } catch (err) {
        console.error('Failed to copy text:', err);
      }
    }
  }
  function closeModal() {
    // call reset if provided, otherwise fallback to aiService.reset()
    if (typeof reset === 'function') reset();
    onclose?.();
  }

</script>
<Dialog open={isOpen} on:close={closeModal}>
  <Dialog.Content class="max-w-5xl">
    <div class="dialog-header">
      <Dialog.Title>AI Summary</Dialog.Title>
      <Dialog.Description>AI-generated summary of your content</Dialog.Description>
    </div>
    <div class="space-y-4">
      {#if $isLoading}
        <!-- Loading State -->
        <div class="space-y-4">
          <span>Analyzing content...</span>
        </div>
      {:else if $error}
        <!-- Error State -->
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <AlertCircle />
            <span>AI Error</span>
          </div>
          <p>{$error}</p>
        </div>
      {:else if $summary}
        <!-- Summary Content -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Button
                class="bits-btn"
                onclick={copyToClipboard}
                variant="ghost"
                size="sm"
                aria-label="Copy summary to clipboard"
              >
                <Copy class="w-4 h-4" />
                <span>Copy</span>
              </Button>
              {#if copied}
                <span class="inline-flex items-center gap-1"><Check class="w-4 h-4" />Copied!</span>
              {/if}
            </div>
          </div>
          <div class="prose">
            {@html $summary}
          </div>
          {#if $lastSummarizedContent}
            <div>
              <strong>Source:</strong>
              {$lastSummarizedContent}
            {/if}
        </div>
      {:else}
        <div>No summary available.{/if}
    </div>
    <div class="dialog-footer mt-4 flex justify-end">
      <Button class="bits-btn" onclick={closeModal} variant="secondary" aria-label="Close summary modal">
        <X />
        <span>Close</span>
      </Button>
    </div>
  </Dialog.Content>
</Dialog>
<style>
  /* @unocss-include */
  .prose {
    max-width: none;
  }
  /* minimal header/footer styles so layout remains consistent */
  .dialog-header { margin-bottom: 0.75rem; }
  .dialog-footer { margin-top: 1rem; }
</style>
