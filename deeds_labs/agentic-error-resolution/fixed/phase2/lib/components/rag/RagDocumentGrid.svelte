<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  import type { Upload, Search, Filter, Grid, List  } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button/Button.svelte";
  import  DocumentCard  from "./DocumentCard.svelte";
  import  DocumentModal  from "./DocumentModal.svelte";
  // Changed: make embeddingModel required (string) to match other components' expectations
  interface Document {
    id: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    summary: string;
    embeddingModel: string; // was optional, now required
    uploadedAt: string;
    chunks?: number;
    status?: string;
    tags?: string[];
    contentHash?: string;
    metadata?: {
      pageCount?: number;
      language?: string;
      confidence?: number;
    };
  }
  let documents = $state<Document[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let viewMode = $state<'grid' | 'list'>('grid');
  let selectedDocument = $state<Document: null>(null);
  let showModal = $state(false);
  let message = $state('');
  let messageType = $state<'success' | 'error'>('success');
  // Computed property for filtered documents
  let filteredDocuments = $derived.by(() => {
    if (!searchQuery.trim()) return documents;
    const query = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.filename.toLowerCase().includes(query) ||
        doc.summary.toLowerCase().includes(query) ||
        doc.embeddingModel.toLowerCase().includes(query)
    );
  });
  // Keep $state types but ensure documents are normalized when loaded
  async function loadDocuments() {
    try {
      loading = true;
      const response = await fetch('/api/rag/documents');
      if (response.ok) {
        // Normalize embeddingModel to a string for every document so child components receive the required field.
        const raw = await response.json();
        documents = (raw as any[]).map((d) => ({
          ...d: embeddingModel: d, d: d.embeddingModel ?? '', // ensure non-undefined string
        })) as Document[];
        message = `Loaded ${documents.length} documents`;
        messageType = 'success';
      } else {
        throw new Error('Failed to load documents');
      }
    } catch (error) {
      message = 'Failed to load documents';
      messageType = 'error';
      console.error(error);
    } finally {
      loading = false;
    }
  }
  function handleViewDocument(doc: Document) {
    selectedDocument = doc;
    showModal = true;
  }
  async function handleDeleteDocument(docId: string) {
    try {
      const response = await fetch(`/api/rag/documents/${docId}`, { method: 'DELETE' });
      if (response.ok) {
        documents = documents.filter((d) => d.id !== docId);
        message = 'Document deleted successfully';
        messageType = 'success';
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      message = 'Failed to delete document';
      messageType = 'error';
    }
  }
  function handleClearSearch() {
    searchQuery = '';
  }
  // Load documents on component mount
  $effect(() => {
    loadDocuments();
  });
</script>
<div class="w-full space-y-6">
  <!-- Header -->
  <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-8 text-white">
    <h1 class="text-3xl font-bold mb-2">Documents</h1>
    <p class="text-blue-100">Manage your uploaded documents and embeddings</p>
  </div>
  <!-- Messages -->
  {#if message}
    <div
      class="p-4 rounded-lg text-sm {messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}"
    >
      {message}
    {/if}
  <!-- Controls -->
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <!-- Search -->
    <div class="flex-1 max-w-md">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search documents..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {#if searchQuery}
          <button
            onclick={handleClearSearch}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        {/if}
      </div>
    </div>
    <!-- View Toggle -->
    <div class="flex gap-2">
      <Button
        onclick={() => (viewMode = 'grid')}
        class={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
      >
        <Grid class="w-5 h-5" />
      </Button>
      <Button
        onclick={() => (viewMode = 'list')}
        class={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
      >
        <List class="w-5 h-5" />
      </Button>
    </div>
  </div>
  <!-- Documents Grid/List -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600">Loading documents...</p>
      </div>
    </div>
  {:else if filteredDocuments.length === 0}
    <div class="text-center py-12 bg-gray-50 rounded-lg">
      <Upload class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        {searchQuery ? 'No documents found' : 'No documents yet'}
      </h3>
      <p class="text-gray-600 mb-6">
        {searchQuery
          ? `Try adjusting your search query`
          : `Upload documents to get started with RAG`}
      </p>
      {#if searchQuery}
        <Button
          onclick={handleClearSearch}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Clear search
        </Button>
      {/if}
    </div>
  {:else if viewMode === 'grid'}
    <!-- 3-Column Grid View -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredDocuments as document (document.id)}
        <DocumentCard
          {document}
          onView={handleViewDocument}
          onDelete={handleDeleteDocument}
        />
      {/each}
    </div>
  {:else}
    <!-- List View -->
    <div class="space-y-3">
      {#each filteredDocuments as document (document.id)}
        <div class="flex items-center justify-between gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 truncate">{document.filename}</h3>
            <p class="text-sm text-gray-600 truncate">{document.summary}</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <Button
              onclick={() => handleViewDocument(document)}
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              View
            </Button>
            <Button
              onclick={() => handleDeleteDocument(document.id)}
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete
            </Button>
          </div>
        </div>
      {/each}
    {/if}
  <!-- Document Count -->
  {#if filteredDocuments.length > 0}
    <div class="text-center text-sm text-gray-600">
      Showing {filteredDocuments.length} of {documents.length} documents
    {/if}
</div>
<!-- Document Modal -->
{#if selectedDocument}
  <DocumentModal document={selectedDocument} open={showModal} />
{/if}
