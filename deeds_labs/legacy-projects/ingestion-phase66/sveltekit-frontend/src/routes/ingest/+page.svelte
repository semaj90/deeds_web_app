<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';
  import UploadFile from './upload-file.svelte';

  let cases: any[] = [];
  let selectedCaseId: string = '';
  let isLoading = false;

  onMount(async () => {
    await loadCases();
  });

  async function loadCases() {
    try {
      const response = await api.get('/cases');
      cases = response.data;
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  }

  async function handleFileUploaded(event: CustomEvent) {
    const { jobId, caseId } = event.detail;
    // Navigate to status page
    window.location.href = `/ingest/status/${jobId}`;
  }
</script>

<svelte:head>
  <title>Phase 66 - Document Ingestion</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
  <div class="max-w-4xl mx-auto">

    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-cyan-400 mb-2">🚀 Phase 66 GPU Ingestion</h1>
      <p class="text-slate-300">Upload legal documents for AI-powered analysis</p>
    </div>

    <!-- Case Selection -->
    <div class="bg-slate-800/50 rounded-lg p-6 mb-8">
      <h2 class="text-xl font-semibold text-green-400 mb-4">Select Case</h2>
      <select
        bind:value={selectedCaseId}
        class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
      >
        <option value="">Choose a case...</option>
        {#each cases as caseItem}
          <option value={caseItem.id}>{caseItem.case_number} - {caseItem.title}</option>
        {/each}
      </select>
    </div>

    <!-- Upload Component -->
    {#if selectedCaseId}
      <UploadFile
        caseId={selectedCaseId}
        on:fileUploaded={handleFileUploaded}
      />
    {:else}
      <div class="bg-slate-800/50 rounded-lg p-8 text-center">
        <div class="text-slate-400 mb-4">
          <svg class="w-16 h-16 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
          </svg>
        </div>
        <p class="text-slate-300">Select a case to begin uploading documents</p>
      </div>
    {/if}

    <!-- Features -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
      <div class="bg-slate-800/50 rounded-lg p-6">
        <div class="text-cyan-400 mb-2">
          <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-white mb-2">OCR Processing</h3>
        <p class="text-slate-300 text-sm">GPU-accelerated OCR for PDFs and images</p>
      </div>

      <div class="bg-slate-800/50 rounded-lg p-6">
        <div class="text-green-400 mb-2">
          <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-white mb-2">AI Embeddings</h3>
        <p class="text-slate-300 text-sm">embeddinggemma for semantic search</p>
      </div>

      <div class="bg-slate-800/50 rounded-lg p-6">
        <div class="text-yellow-400 mb-2">
          <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-white mb-2">Structure Extraction</h3>
        <p class="text-slate-300 text-sm">LangExtract for legal document parsing</p>
      </div>
    </div>

  </div>
</div>