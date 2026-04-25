<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';

  let jobId: string;
  let jobStatus: any = null;
  let isLoading = true;
  let error: string | null = null;

  let jobId = $derived($page.params.id);

  onMount(async () => {
    await loadJobStatus();
    // Poll for updates every 5 seconds
    const interval = setInterval(loadJobStatus, 5000);
    return () => clearInterval(interval);
  });

  async function loadJobStatus() {
    try {
      const response = await api.get(`/status/${jobId}`);
      jobStatus = response.data;
      isLoading = false;

      // Stop polling if job is complete or failed
      if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
        // Could clear interval here, but for simplicity we'll keep it
      }
    } catch (err) {
      error = 'Failed to load job status';
      isLoading = false;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'processing': return 'text-yellow-400';
      default: return 'text-slate-400';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'processing': return '⚡';
      default: return '⏳';
    }
  }
</script>

<svelte:head>
  <title>Ingestion Status - {jobId}</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
  <div class="max-w-4xl mx-auto">

    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-cyan-400 mb-2">Document Ingestion Status</h1>
      <p class="text-slate-300">Job ID: <code class="bg-slate-800 px-2 py-1 rounded">{jobId}</code></p>
    </div>

    {#if isLoading}
      <div class="bg-slate-800/50 rounded-lg p-8 text-center">
        <div class="text-cyan-400 mb-4">
          <svg class="w-12 h-12 mx-auto animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
        </div>
        <p class="text-slate-300">Loading job status...</p>
      </div>
    {:else if error}
      <div class="bg-red-900/50 rounded-lg p-8 text-center">
        <div class="text-red-400 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </div>
        <p class="text-red-300">{error}</p>
      </div>
    {:else if jobStatus}
      <div class="space-y-6">

        <!-- Overall Status -->
        <div class="bg-slate-800/50 rounded-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold text-white">Job Status</h2>
            <span class="px-3 py-1 rounded-full text-sm font-medium {getStatusColor(jobStatus.status)} bg-slate-700">
              {getStatusIcon(jobStatus.status)} {jobStatus.status.toUpperCase()}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p class="text-slate-400 text-sm">Document</p>
              <p class="text-white">{jobStatus.filename}</p>
            </div>
            <div>
              <p class="text-slate-400 text-sm">File Size</p>
              <p class="text-white">{formatFileSize(jobStatus.fileSize)}</p>
            </div>
            <div>
              <p class="text-slate-400 text-sm">Progress</p>
              <div class="w-full bg-slate-700 rounded-full h-2 mt-1">
                <div
                  class="bg-cyan-400 h-2 rounded-full transition-all duration-300"
                  style="width: {jobStatus.progress || 0}%"
                ></div>
              </div>
              <p class="text-cyan-400 text-sm mt-1">{jobStatus.progress || 0}%</p>
            </div>
          </div>

          {#if jobStatus.error}
            <div class="mt-4 p-3 bg-red-900/50 rounded-lg">
              <p class="text-red-300 text-sm">{jobStatus.error}</p>
            </div>
          {/if}
        </div>

        <!-- Processing Steps -->
        {#if jobStatus.steps && jobStatus.steps.length > 0}
          <div class="bg-slate-800/50 rounded-lg p-6">
            <h2 class="text-xl font-semibold text-white mb-4">Processing Steps</h2>
            <div class="space-y-3">
              {#each jobStatus.steps as step}
                <div class="flex items-center space-x-3">
                  <div class="text-cyan-400">
                    {#if step.status === 'completed'}
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                      </svg>
                    {:else if step.status === 'processing'}
                      <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                    {:else}
                      <svg class="w-5 h-5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                      </svg>
                    {/if}
                  </div>
                  <div class="flex-1">
                    <p class="text-white font-medium">{step.name}</p>
                    {#if step.details}
                      <p class="text-slate-400 text-sm">{step.details}</p>
                    {/if}
                  </div>
                  <div class="text-right">
                    <p class="text-slate-400 text-sm">{step.duration || ''}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Results -->
        {#if jobStatus.status === 'completed' && jobStatus.results}
          <div class="bg-slate-800/50 rounded-lg p-6">
            <h2 class="text-xl font-semibold text-white mb-4">Processing Results</h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 class="text-lg font-medium text-green-400 mb-2">Document Analysis</h3>
                <div class="space-y-2 text-sm">
                  <p class="text-slate-300">Pages: <span class="text-white">{jobStatus.results.pages || 'N/A'}</span></p>
                  <p class="text-slate-300">Chunks: <span class="text-white">{jobStatus.results.chunks || 'N/A'}</span></p>
                  <p class="text-slate-300">Content Type: <span class="text-white">{jobStatus.results.contentType || 'N/A'}</span></p>
                </div>
              </div>

              <div>
                <h3 class="text-lg font-medium text-cyan-400 mb-2">AI Processing</h3>
                <div class="space-y-2 text-sm">
                  <p class="text-slate-300">Embeddings: <span class="text-white">{jobStatus.results.embeddingsGenerated ? 'Generated' : 'Pending'}</span></p>
                  <p class="text-slate-300">OCR: <span class="text-white">{jobStatus.results.ocrPerformed ? 'Completed' : 'N/A'}</span></p>
                  <p class="text-slate-300">Structure: <span class="text-white">{jobStatus.results.structureExtracted ? 'Extracted' : 'Pending'}</span></p>
                </div>
              </div>
            </div>

            {#if jobStatus.results.sampleChunks && jobStatus.results.sampleChunks.length > 0}
              <div class="mt-6">
                <h3 class="text-lg font-medium text-yellow-400 mb-2">Sample Chunks</h3>
                <div class="space-y-3">
                  {#each jobStatus.results.sampleChunks.slice(0, 3) as chunk}
                    <div class="bg-slate-700 rounded-lg p-3">
                      <p class="text-slate-300 text-sm line-clamp-3">{chunk.content}</p>
                      {#if chunk.section}
                        <p class="text-cyan-400 text-xs mt-1">Section: {chunk.section}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Actions -->
        <div class="flex justify-center space-x-4">
          <a
            href="/ingest"
            class="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Upload More Files
          </a>
          {#if jobStatus.status === 'completed'}
            <a
              href="/search"
              class="bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Search Documents
            </a>
          {/if}
        </div>

      </div>
    {/if}

  </div>
</div>

<script lang="ts">
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>