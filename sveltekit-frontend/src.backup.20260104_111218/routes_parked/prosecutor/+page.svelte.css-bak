<script lang="ts">
  import type { Case } from '$lib/types';
  // import type { SearchResults } from '$lib/types/global'; // Removed: SearchResults type is not used
  import { Button } from '$lib/components/ui/button'; // Changed to named import
  import { Input } from '$lib/components/ui/input'; // Changed to named import
  import { Badge } from '$lib/components/ui/badge'; // Changed to named import

  // dynamically loaded components (use `any` to avoid strict SvelteComponent typing incompatibilities)
  let EvidenceUploadComponent = $state<any>(null);
  let OllamaChatInterface = $state<any>(null);

  // replace the failing named import with a safe module import (cast to any when inspecting)
  import * as webGPUModule from '$lib/services/webgpu-vector-processor';
  import { Scale, Users, FileText, Upload, Search, Brain, Eye, Plus } from 'lucide-svelte';
  import { onMount } from 'svelte';

  // --- Type Definitions ---
  // interface Case { id: string, caseNumber: string, title: string, status: string} // Removed: Case type is already imported
  interface PersonOfInterest {
    name: string;
    role: string;
    tags: string[];
    priority: 'high' | 'normal' | 'low';
  }
  interface Evidence {
    title: string;
    fileName: string;
    uploadedAt: string;
    aiSummary?: string;
    aiAnalysis?: { prosecutionRelevance: 'high' | 'medium' | 'low' };
  }
  interface SearchResult {
    id: string;
    score: number;
    payload?: { fileName?: string; title?: string; tags?: string[] };
  } // Fixed: semicolons to commas

  // State management
  let selectedCaseId = $state<string>('');
  let cases: Case[] = $state([]);
  let personsOfInterest: PersonOfInterest[] = $state([]);
  let recentEvidence: Evidence[] = $state([]);
  let searchQuery = $state<string>('');
  let searchResults: SearchResult[] = $state([]);
  let activeTab = $state<string>('overview');

  // AI features state
  let webGPUEnabled = $state<boolean>(false);
  let ragSystemStatus = $state<string>('initializing');

  // Add a reactive holder for the resolved webgpu processor instance
  let webGPUProcessor = $state<any>(null);

  onMount(() => {
    (async () => {
      // Resolve and normalize the module export into an instance we can call methods on.
      if (!webGPUProcessor) {
        // Check common export shapes: default instance, named instance, class constructor
        // use `any` to avoid TS complaining about missing named exports on the module type
        const _m = webGPUModule as any;
        let candidate =
          _m.default ??
          _m.webGPUProcessor ??
          _m.WebGPUVectorProcessor ??
          _m.webgpuProcessor ??
          null;
        if (candidate) {
          if (typeof candidate === 'function') {
            // candidate is likely a class or factory - try to instantiate, otherwise fall back to using it directly
            try {
              webGPUProcessor = new candidate();
            } catch (_) {
              webGPUProcessor = candidate;
            }
          } else {
            // candidate is already an instance/object
            webGPUProcessor = candidate;
          }
        }
      }

      // Initialize WebGPU when available; tolerate missing initialize method
      webGPUEnabled = webGPUProcessor
        ? await (webGPUProcessor.initialize?.() ?? Promise.resolve(false))
        : false;

      // Load initial data
      await loadCases();
      ragSystemStatus = 'ready';

      // load UI components lazily; support either default or named export
      try {
        // suppress TS if the optional component file is not present in this project
        // @ts-ignore
        const evMod: any = await import('$lib/components/EvidenceUploadComponent.svelte');
        EvidenceUploadComponent = evMod?.default ?? evMod ?? null;
      } catch (e) {
        console.warn('Failed to load EvidenceUploadComponent dynamically', e);
      }
      try {
        // @ts-ignore
        const chatMod: any = await import('$lib/components/OllamaChatInterface.svelte');
        OllamaChatInterface = chatMod?.default ?? chatMod ?? null;
      } catch (e) {
        console.warn('Failed to load OllamaChatInterface dynamically', e);
      }
    })(); // Fixed: closing onMount's async IIFE
  }); // Fixed: closing onMount callback

  $effect(() => {
    if (selectedCaseId) {
      loadPersonsOfInterest();
      loadRecentEvidence();
    }
  });

  const loadCases = async () => {
    try {
      const response = await fetch('/api/cases');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      cases = result.data || [];
      if (cases.length > 0 && !selectedCaseId) {
        selectedCaseId = cases[0].id;
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const loadPersonsOfInterest = async () => {
    if (!selectedCaseId) return;
    try {
      const response = await fetch(`/api/cases/${selectedCaseId}/pois`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      personsOfInterest = result.data || [];
    } catch (error) {
      console.error('Failed to load POIs:', error);
    }
  };

  const loadRecentEvidence = async () => {
    if (!selectedCaseId) return;
    try {
      const response = await fetch(`/api/cases/${selectedCaseId}/evidence`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      recentEvidence = result.data || [];
    } catch (error) {
      console.error('Failed to load evidence:', error);
    }
  };

  // Enhanced vector search with WebGPU
  const performVectorSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      if (webGPUEnabled && webGPUProcessor) {
        // Use the resolved instance
        searchResults = await webGPUProcessor.searchSimilarEvidence(
          searchQuery,
          selectedCaseId,
          undefined, // any evidence type
          undefined, // any tags
          20
        );
      } else {
        // Fallback to API search
        const response = await fetch('/api/search/vector', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            caseId: selectedCaseId,
            type: 'evidence',
          }),
        });
        if (!response.ok) {
          throw new Error(`Vector search failed: ${response.statusText}`);
        }
        const result = await response.json();
        searchResults = result.results || [];
      }
    } catch (error) {
      console.error('Vector search failed:', error);
    }
  };

  // Handle evidence upload completion
  const handleEvidenceUploaded = (results: unknown[]) => {
    console.log('Evidence uploaded:', results);
    loadRecentEvidence(); // Refresh evidence list
  };

  // Case selection handler
  const selectCase = (caseId: string) => {
    selectedCaseId = caseId;
  };
</script>

<div class="prosecutor-dashboard p-4 md:p-8 bg-gray-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold text-gray-900 flex items-center">
      <Scale class="mr-3 text-blue-600" size={32} /> Prosecutor Dashboard
    </h1>
    <div class="flex items-center space-x-4">
      <Badge variant="outline" class="text-sm">
        RAG System: {ragSystemStatus}
        {#if webGPUEnabled}
          <span class="ml-2 gpu-accelerated" aria-hidden="true"></span>
        {/if}
      </Badge>
      <!-- Use native button for action (accessible + avoids Button prop typing conflicts) -->
      <button
        type="button"
        class="px-3 py-2 bg-blue-600 text-white rounded-md inline-flex items-center"
        onclick={() => console.log('Add New Case')}
      >
        <Plus class="mr-2" size={18} /> Add New Case
      </button>
    </div>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <!-- Left Sidebar: Case List -->
    <aside class="lg:col-span-1 bg-white rounded-lg shadow-md p-4">
      <h2 class="text-xl font-semibold mb-4 flex items-center">
        <FileText class="mr-2" size={20} /> Cases
      </h2>
      <div class="space-y-2">
        {#each cases as caseItem (caseItem.id)}
          <!-- button provides keyboard accessibility and proper role -->
          <button
            type="button"
            onclick={() => selectCase(caseItem.id)}
            class="w-full text-left p-3 rounded-md transition-colors duration-200 {selectedCaseId ===
            caseItem.id
              ? 'bg-blue-100 text-blue-800 font-medium'
              : 'hover:bg-gray-100'}"
          >
            <h3 class="text-lg">{caseItem.title}</h3>
            <p class="text-sm text-gray-500">
              Case #{(caseItem as any).caseNumber ?? (caseItem as any).id}
            </p>
            <Badge variant="secondary" class="mt-1">{(caseItem as any).status ?? 'unknown'}</Badge>
          </button>
        {/each}
      </div>
    </aside>

    <!-- Main Content Area -->
    <section class="lg:col-span-3">
      {#if selectedCaseId}
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 class="text-2xl font-bold mb-4 text-gray-800">
            Case: {cases.find((c) => c.id === selectedCaseId)?.title || 'N/A'}
          </h2>

          <!-- Tabs for Overview, Evidence, POI, AI Assistant -->
          <div class="flex border-b border-gray-200 mb-6">
            <!-- Use native buttons for tabs (avoids Button prop typing issues) -->
            <button
              type="button"
              class="tab-button {activeTab === 'overview' ? 'tab-active' : ''}"
              onclick={() => (activeTab = 'overview')}
            >
              <Eye class="mr-2" size={18} /> Overview
            </button>
            <button
              type="button"
              class="tab-button {activeTab === 'evidence' ? 'tab-active' : ''}"
              onclick={() => (activeTab = 'evidence')}
            >
              <Upload class="mr-2" size={18} /> Evidence
            </button>
            <button
              type="button"
              class="tab-button {activeTab === 'pois' ? 'tab-active' : ''}"
              onclick={() => (activeTab = 'pois')}
            >
              <Users class="mr-2" size={18} /> Persons of Interest
            </button>
            <button
              type="button"
              class="tab-button {activeTab === 'ai-assistant' ? 'tab-active' : ''}"
              onclick={() => (activeTab = 'ai-assistant')}
            >
              <Brain class="mr-2" size={18} /> AI Assistant
            </button>
          </div>

          <!-- Tab Content -->
          {#if activeTab === 'overview'}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 class="text-xl font-semibold mb-3">Recent Evidence</h3>
                {#if recentEvidence.length > 0}
                  <ul class="space-y-2">
                    {#each recentEvidence.slice(0, 3) as evidenceItem (evidenceItem.fileName)}
                      <li class="bg-gray-50 p-3 rounded-md flex justify-between items-center">
                        <span>{evidenceItem.title} ({evidenceItem.fileName})</span>
                        <Badge variant="secondary">{evidenceItem.uploadedAt}</Badge>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="text-gray-500">No recent evidence.</p>
                {/if}
              </div>
              <div>
                <h3 class="text-xl font-semibold mb-3">Persons of Interest</h3>
                {#if personsOfInterest.length > 0}
                  <ul class="space-y-2">
                    {#each personsOfInterest.slice(0, 3) as person (person.name)}
                      <li class="bg-gray-50 p-3 rounded-md flex justify-between items-center">
                        <span>{person.name} ({person.role})</span>
                        <Badge variant="outline">{person.priority}</Badge>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="text-gray-500">No persons of interest.</p>
                {/if}
              </div>
            </div>
          {:else if activeTab === 'evidence'}
            <div class="space-y-6">
              <h3 class="text-xl font-semibold mb-4">Evidence Management</h3>
              {#if EvidenceUploadComponent}
                <EvidenceUploadComponent
                  caseId={selectedCaseId}
                  onevidenceuploaded={handleEvidenceUploaded}
                />
              {/if}

              <!-- Search / vector match UI -->
              <div class="mt-4 flex items-center space-x-2">
                <input
                  class="border rounded-md px-3 py-2 w-full"
                  placeholder="Search evidence (vector search)..."
                  value={searchQuery}
                  oninput={(e) => (searchQuery = (e.target as HTMLInputElement).value)}
                  aria-label="Search evidence"
                />
                <button
                  type="button"
                  class="px-3 py-2 bg-blue-600 text-white rounded-md inline-flex items-center"
                  onclick={() => performVectorSearch()}
                >
                  <Search class="mr-2" size={16} /> Search
                </button>
              </div>

              <!-- Search results -->
              {#if searchResults.length > 0}
                <ul class="mt-4 space-y-2">
                  {#each searchResults as result (result.id)}
                    <li class="bg-gray-50 p-3 rounded-md flex justify-between items-center">
                      <span
                        >{result.payload?.title || result.payload?.fileName || 'Untitled'} (Score: {result.score.toFixed(
                          2
                        )})</span
                      >
                      <Badge variant="secondary">Vector Match</Badge>
                    </li>
                  {/each}
                </ul>
              {:else if searchQuery.length > 0}
                <p class="text-gray-500 mt-4">No search results found.</p>
              {/if}

              <h4 class="text-lg font-medium mb-2">All Evidence</h4>
              {#if recentEvidence.length > 0}
                <ul class="space-y-2">
                  {#each recentEvidence as evidenceItem (evidenceItem.fileName)}
                    <li class="bg-gray-50 p-3 rounded-md flex justify-between items-center">
                      <span>{evidenceItem.title} ({evidenceItem.fileName})</span>
                      <Badge variant="secondary">{evidenceItem.uploadedAt}</Badge>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="text-gray-500">No evidence uploaded for this case yet.</p>
              {/if}
            </div>
          {:else if activeTab === 'pois'}
            <h3 class="text-xl font-semibold mb-4">Persons of Interest</h3>
            {#if personsOfInterest.length > 0}
              <ul class="space-y-3">
                {#each personsOfInterest as person (person.name)}
                  <li class="bg-gray-50 p-4 rounded-md shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                      <span class="text-lg font-medium">{person.name}</span>
                      <Badge variant="outline">{person.role}</Badge>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      {#each person.tags as tag}
                        <Badge variant="secondary">{tag}</Badge>
                      {/each}
                    </div>
                    <p class="text-sm text-gray-600 mt-2">
                      Priority: <Badge
                        variant={person.priority === 'high'
                          ? 'destructive'
                          : person.priority === 'normal'
                            ? 'warning'
                            : 'default'}>{person.priority}</Badge
                      >
                    </p>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-gray-500">No persons of interest defined for this case.</p>
            {/if}
          {:else if activeTab === 'ai-assistant'}
            <h3 class="text-xl font-semibold mb-4 flex items-center">
              <Brain class="mr-2" size={20} /> AI Assistant
            </h3>
            {#if OllamaChatInterface}
              <OllamaChatInterface caseId={selectedCaseId} />
            {:else}
              <p class="text-red-500">AI Chat Interface failed to load.</p>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="bg-white rounded-lg shadow-md p-6 text-center text-gray-600">
          <p class="text-xl font-medium mb-4">
            Select a case from the left sidebar to view details.
          </p>
          <p>Or click "Add New Case" to get started.</p>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  /* Prosecutor dashboard styling */
  :global(.prosecutor-dashboard) {
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  }
  /* Enhanced hover effects for elemental awareness */
  :global(*:hover) {
    transition: all 0.1s ease;
  }
  /* WebGPU acceleration indicators */
  :global(.gpu-accelerated) {
    position: relative;
  }
  :global(.gpu-accelerated::after) {
    content: '⚡'; /* Fixed: 'âš¡' was likely a character encoding issue, replaced with standard lightning bolt */
    position: absolute;
    top: -8px;
    right: -8px;
    font-size: 12px;
  }
  .tab-button {
    padding: 0.5rem 1rem; /* px-4 py-2 */
    font-size: 0.875rem; /* text-sm */
    font-weight: 500; /* font-medium */
    color: #4b5563; /* text-gray-600 */
    border-top-left-radius: 0.375rem;
    border-top-right-radius: 0.375rem;
    background: transparent;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }
  .tab-button:hover {
    color: #1d4ed8; /* blue-700 */
    background-color: #f9fafb; /* gray-50 */
  }
  .tab-active {
    border-bottom: 2px solid #2563eb; /* border-blue-600 */
    color: #1d4ed8; /* text-blue-700 */
  }
</style>
