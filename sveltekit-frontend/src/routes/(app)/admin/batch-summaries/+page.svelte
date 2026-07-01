<script lang="ts">
  import BatchSummaryUI from '$lib/components/admin/BatchSummaryUI.svelte';
</script>

<svelte:head>
  <title>Batch Summaries</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="border-b border-gray-300 bg-white">
    <div class="max-w-7xl mx-auto px-6 py-8">
      <h1 class="text-4xl font-bold">Batch Summarization Pipeline</h1>
      <p class="mt-2 text-gray-600">
        Browser ONNX (Transformers.js) + Server Gemma4 (llama-server)
      </p>
    </div>
  </header>

  <main class="max-w-7xl mx-auto">
    <BatchSummaryUI />
  </main>
</div>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
