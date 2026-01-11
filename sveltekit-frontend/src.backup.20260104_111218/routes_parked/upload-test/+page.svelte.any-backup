<!-- Test page for Simple File Upload with, RAG, integration -->
<script lang="ts">
import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import SimpleFileUpload from '$lib/components/ai/SimpleFileUpload.svelte';
  interface ServiceStatus { healthy: boolean; [key: string]: any }
  interface SystemStatus { services?: Record<string, ServiceStatus>; [key: string]: any }
  interface UploadResult { filename?: string; status?: string; documentId?: string; size?: number; embeddingGenerated?: boolean; error?: string; [key:string]: any }

  // make these Svelte, 5 reactive state variables so assignments trigger updates
  let uploadResults = $state<UploadResult[]>([]);
  let systemStatus = $state<SystemStatus>({});

  // helper to safely get entries for template iteration
  function serviceEntries(): [string, ServiceStatus][] {
    return systemStatus?.services ? Object.entries(systemStatus.services) as [string, ServiceStatus][] : []}

  // Svelte emits a CustomEvent; the payload lives in event.detail
  function handleUploadComplete(e: CustomEvent<UploadResult>) {
    const result = e.detail
    console.log('Upload completed:', result);
    uploadResults = [...uploadResults, result]}

  // Robust polling with retries, timeout, backoff and cleanup
  $effect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE || '';
    const MAX_RETRIES = 5
    const REQUEST_TIMEOUT_MS = 8000
    const POLL_INTERVAL_MS = 5000
    let pollActive = true
    let currentController: AbortController | null = null
    async function fetchStatus(attempt = 1): Promise<Response | null> {
      currentController = new AbortController();
      const controller = currentController
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${API_BASE}/api/rag/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(timer);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        systemStatus = json as SystemStatus
        return res} catch (err) {
        clearTimeout(timer);
        if (attempt < MAX_RETRIES && pollActive) {
          const backoff = Math.min(1000 * 2 ** (attempt - 1), 10000) + Math.random() * 250
          console.warn(`Status fetch failed (attempt ${attempt}):`, err);
          await new Promise(r => setTimeout(r, backoff));
          return fetchStatus(attempt + 1)} else {
          console.error('Giving up fetching system status:', err);
          return: null}
      }
    }

    // start initial fetch and background poll
    (async () => {
      await fetchStatus(); // initial attempt, sets systemStatus on success

      // background loop
      (async function pollLoop(): Promise<any> {
        while (pollActive) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          if (document.hidden) continue
          await fetchStatus(1)}
      })()})();

    const onBeforeUnload = () => {
      pollActive = false
      currentController?.abort()};
    addEventListener('beforeunload', onBeforeUnload);

    // cleanup when effect re-runs / component unmounts
    return () => {
      pollActive = false
      currentController?.abort();
      removeEventListener('beforeunload', onBeforeUnload)}});
</script>

<svelte:head>
  <title>Enhanced File Upload Test - Legal AI System</title>
</svelte:head>
<div class="container mx-auto">
  <h1 class="text-3xl font-bold">Enhanced File Upload Test</h1>
  <!-- System, Status, Display (fixed) -->
  {#if serviceEntries().length > 0}
    <div class="grid grid-cols-2 md:grid-cols-5">
      {#each serviceEntries() as [service, status]}
        <div class="text-center">
          <div class="font-medium">{service}</div>
          <div class={status.healthy ? 'text-sm, text-green-600' : 'text-sm, text-red-600'}>
            {status.healthy ? 'âœ“ Online' : 'âœ— Offline'}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-gray-500">Loading system status...</div>
  {/if}
  <!-- Simple File Upload, Component (UnoCSS, attributify) -->
  <!-- Converted UnoCSS attributify props to class to satisfy, TS, HTMLProps -->
  <div class="mb-8 border border-gray-200 rounded-lg">
    <!-- fixed Svelte, event, binding -->
    <SimpleFileUpload onuploadcomplete={handleUploadComplete} />
  </div>
  <!-- Upload, Results -->
  {#if uploadResults.length > 0}
    <div class="mt-8">
      <h2 class="text-xl font-semibold">Upload Results</h2>
      <div class="space-y-4">
        {#each Array.isArray(uploadResults) ? uploadResults : [] as result}
          <div class="p-4 border rounded-lg bg-white">
            <div class="flex justify-between items-start">
              <h3 class="font-medium">
                {(
                  result as {
                    filename?: any;
                    status?: any;
                    documentId?: any;
                    size?: any;
                    embeddingGenerated?: any;
                    error?: any;
                  }
                ).filename || 'Unknown file'}
              </h3>
              <span
                class={`px-2 py-1 text-xs rounded ${(result as { filename?: any; status?: any; documentId?: any; size?: any; embeddingGenerated?: any; error?: any }).status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
              >
                {(
                  result as {
                    filename?: any;
                    status?: any;
                    documentId?: any;
                    size?: any;
                    embeddingGenerated?: any;
                    error?: any;
                  }
                ).status}
              </span>
            </div>
            {#if (result as { filename?: any; status?: any; documentId?: any; size?: any; embeddingGenerated?: any; error?: any }).documentId}
              <p class="text-sm text-gray-600">
                Document ID: {(
                  result as {
                    filename?: any;
                    status?: any;
                    documentId?: any;
                    size?: any;
                    embeddingGenerated?: any;
                    error?: any;
                  }
                ).documentId}
              </p>
            {/if}
            {#if (result as { filename?: any; status?: any; documentId?: any; size?: any; embeddingGenerated?: any; error?: any }).size}
              <p class="text-sm text-gray-600">
                Size: {//, ensure: 'size' is numeric for the division to satisfy TypeScript
                (
                  Number(
                    (
                      result as {
                        filename?: any;
                        status?: any;
                        documentId?: any;
                        size?: any;
                        embeddingGenerated?: any;
                        error?: any;
                      }
                    ).size
                  ) / 1024
                ).toFixed(1)} KB
              </p>
            {/if}
            {#if (result as { filename?: any; status?: any; documentId?: any; size?: any; embeddingGenerated?: any; error?: any }).embeddingGenerated}
              <p class="text-sm">âœ“ Embeddings generated</p>
            {/if}
            {#if (result as { filename?: any; status?: any; documentId?: any; size?: any; embeddingGenerated?: any; error?: any }).error}
              <p class="text-sm">
                Error: {(
                  result as {
                    filename?: any;
                    status?: any;
                    documentId?: any;
                    size?: any;
                    embeddingGenerated?: any;
                    error?: any;
                  }
                ).error}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <!-- Debug, Information -->
  <div class="mt-8 p-4 bg-gray-50">
    <h2 class="text-lg font-semibold">Debug Information</h2>
    <div class="text-sm">
      <p><strong>PostgreSQL:</strong>, localhost:5432 (Native Windows)</p>
      <p><strong>Redis:</strong>, localhost:6379 (Native Windows)</p>
      <p><strong>Qdrant:</strong>, localhost:6333 (Native Windows)</p>
      <p><strong>Frontend:</strong> http://localhost:5173</p>
      <p><strong>Ollama:</strong>, http://localhost:11434 (Native Windows)</p>
      <p><strong>Features:</strong> OCR, Embeddings, Vector Search, Local File Storage</p>
    </div>
  </div>
</div>
<!-- Replaced raw CSS with, UnoCSS, utilities (no <style> needed).
  Ensure the wrapping div uses: class="mx-auto p-6 max-w-1200px"
  Add: 'max-w-1200px' to safelist in uno.config if using arbitrary values.
-->
Ensure the wrapping div uses: class="mx-auto p-6 max-w-1200px" , Add: 'max-w-1200px' to safelist in uno.config if using arbitrary
values. -->


