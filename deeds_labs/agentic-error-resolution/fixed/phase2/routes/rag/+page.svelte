<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
  // Removed superForm / zod / Zod types imports (client-side superforms caused invalid bindings)
  import type { Search, Upload, Tag, FileText, Database  } from 'lucide-svelte';
  import Button from '$lib/components/ui/button/Button.svelte';
  import type { onMount  } from 'svelte';

  // receive data from load()
  const { data } = $props<{ data: any }>()

  // client state (explicitly declared to avoid undefined accesses)
  let submitting = $state(false);
  let loadingDocuments = $state(false);
  let documents: Array<any> = [];
  let selectedFile: File: null = null;
  let tags = '';
  let uploading = $state(false);
  let uploadResult: any = null;
  let searchQuery = '';
  let searchTags = '';
  let searchType: 'hybrid' | 'vector' | 'fuzzy' = 'hybrid';
  let searching = $state(false);
  let searchResults: Array<any> = [];
  let systemStatus: any = null;
  let activeTab: 'upload' | 'documents' | 'search' = 'upload';
  let deletingId: string: null = null;

  // Load documents on mount
  async function loadDocuments() {
    loadingDocuments = true;
    try {
      const res = await fetch('/api/rag/documents?limit=50');
      const json = await res.json();
      if (json.success) {
        documents = json.documents || [];
      } else {
        documents = [];
        console.error('Failed to load documents:', json.error);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
      documents = [];
    } finally {
      loadingDocuments = false;
    }
  }

  // Delete a document
  async function deleteDocument(id: string) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    deletingId = id;
    try {
      const res = await fetch(`/api/rag/documents/${id}`, { method: 'DELETE' });
      const json = await res.json();

      if (json.success) {
        documents = documents.filter(d => d.id !== id);
        alert('Document deleted successfully');
      } else {
        alert(`Failed to delete document: ${json.error}`);
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      deletingId = null;
    }
  }

  // Check system status on mount
  async function checkStatus() {
    try {
      const res = await fetch('/api/rag/status');
      const json = await res.json();
      systemStatus = json;
    } catch (error) {
      console.error('Status check failed:', error);
      systemStatus = { healthy: false, error: 'Connection failed' };
    }
  }

  // Handle file selection
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target?.files && target.files[0]) {
      selectedFile = target.files[0];
    } else {
      selectedFile = null;
    }
  }

  // Upload file to RAG system
  async function uploadFile() {
    if (!selectedFile) return;

    uploading = true;
    uploadResult = null;

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (tags) {
        formData.append('tags', tags);
      }

      const res = await fetch('/api/rag/upload', { method: 'POST', body: formData });

      const json = await res.json();

      if (res.ok) {
        uploadResult = { success: true, ...json };
        selectedFile = null;
        tags = '';

        // Reset file input if present
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement: null;
        if (fileInput) fileInput.value = '';
      } else {
        uploadResult = { success: false, error: json.error || 'Upload failed' };
      }
    } catch (error) {
      uploadResult = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      uploading = false;
      // reload documents after upload attempt (optional)
      await loadDocuments();
    }
  }

  // Search documents
  async function searchDocuments() {
    if (!searchQuery.trim()) return;

    searching = true;
    searchResults = [];

    try {
      const searchTagsArray = searchTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, searchType, tags: searchTagsArray.length > 0 ? searchTagsArray : undefined, limit: 10 }),
      });

      const json = await res.json();

      if (json.success) {
        searchResults = json.results || [];
      } else {
        searchResults = [];
        console.error('Search failed:', json.error);
      }
    } catch (error) {
      console.error('Search error:', error);
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  // Initialize
  onMount(() => {
    checkStatus();
    loadDocuments();
  });
</script>

<h1 class="text-2xl font-bold mb-4">Upload Document to RAG</h1>

<!-- Server action form: use plain POST multipart form (no superForm client-side binding) -->
<form method="POST" enctype="multipart/form-data" class="space-y-3 border p-4 rounded" onsubmit={() => (submitting = true)}>
  <label class="block">
    <span>Title</span>
    <input name="title" value={data?.form?.data?.title ?? ''} class="border p-2 w-full rounded" />
  </label>

  <label class="block">
    <span>File</span>
    <input type="file" name="file" required class="border p-2 w-full rounded" />
  </label>

  <label class="block">
    <span>Tags (comma-separated)</span>
    <input name="tags" placeholder="case, contract" value={data?.form?.data?.tags ?? ''} class="border p-2 w-full rounded" />
  </label>

  <button type="submit" disabled={submitting} class="bg-blue-600 text-white px-3 py-1 rounded">
    {submitting ? 'Uploading…' : 'Upload'}
  </button>
</form>

{#if (data as any)?.result}
  {#if (data as any).result.message}
    <div class="mt-4 bg-green-50 p-3 rounded border text-green-700">
      ✅ {(data as any).result.message}
    </div>
  {:else}
    <div class="mt-4 bg-red-50 p-3 rounded border text-red-700">
      ❌ {(data as any).result.error}
    </div>
  {/if}
{/if}
<!-- merged above -->

<div class="nes-container is-dark" style="min-height: 100vh; background: #212529; padding: 2rem;">
  <!-- Header -->
  <div style="border-bottom: 4px solid #d4af37; padding-bottom: 1.5rem; margin-bottom: 2rem;">
    <h1 class="nes-text is-primary" style="font-size: 2rem; margin-bottom: 0.5rem;">🤖 RAG KNOWLEDGE BASE</h1>
    <p style="color: #d4af37; font-size: 0.875rem;">embeddinggemma:latest + MinIO + Qdrant + PostgreSQL + Fuse.js</p>

    <!-- System Status -->
    {#if systemStatus}
      <div style="margin-top: 1rem; display: flex; gap: 1rem; flex-wrap: wrap;">
        <div class="nes-badge">
          <span class="is-{systemStatus.healthy ? 'success' : 'error'}">
            {systemStatus.healthy ? '✓' : '✗'} System
          </span>
        </div>
        {#if systemStatus.documentsCount !== undefined}
          <div class="nes-badge">
            <span class="is-primary">{systemStatus.documentsCount} Docs</span>
          </div>
        {/if}
        {#if documents.length > 0}
          <div class="nes-badge">
            <span class="is-success">{documents.length} Loaded</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Tab Navigation -->
    <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button
        class="nes-btn"
        class:is-primary={activeTab === 'upload'}
        onclick={() => activeTab = 'upload'}
        style="background: {activeTab === 'upload' ? '#4a9eff' : '#1a1d20'}; border: 2px solid #d4af37;"
      >
        📤 Upload
      </button>
      <button
        class="nes-btn"
        class:is-primary={activeTab === 'documents'}
        onclick={() => activeTab = 'documents'}
        style="background: {activeTab === 'documents' ? '#4a9eff' : '#1a1d20'}; border: 2px solid #d4af37;"
      >
        📚 Documents ({documents.length})
      </button>
      <button
        class="nes-btn"
        class:is-primary={activeTab === 'search'}
        onclick={() => activeTab = 'search'}
        style="background: {activeTab === 'search' ? '#4a9eff' : '#1a1d20'}; border: 2px solid #d4af37;"
      >
        🔍 Search
      </button>
    </div>
  </div>

  <!-- Upload Tab -->
  {#if activeTab === 'upload'}
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
      <!-- Upload Section -->
      <div class="nes-container is-dark" style="background: #1a1d20;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
        <Upload size={20} style="color: #d4af37;" />
        <h2 class="nes-text is-primary" style="font-size: 1.25rem; margin: 0;">UPLOAD DOCUMENT</h2>
      </div>

      <!-- File Input -->
      <div class="nes-field" style="margin-bottom: 1rem;">
        <label for="file-input" style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
          <FileText size={16} style="display: inline; vertical-align: middle;" />
          Select File (.txt, .md, .json, .csv)
        </label>
        <input
          id="file-input"
          type="file"
          accept=".txt,.md,.json,.csv,text/*"
          onchange={handleFileSelect}
          style="padding: 0.5rem; width: 100%; background: #212529; border: 2px solid #d4af37; color: #d4af37;"
        />
      </div>

      {#if selectedFile}
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #0f1214; border: 2px solid #4a5568;">
          <p style="color: #d4af37; font-size: 0.875rem; margin: 0;">
            📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        </div>
      {/if}

      <!-- Tags Input -->
      <div class="nes-field" style="margin-bottom: 1.5rem;">
        <label for="tags-input" style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
          <Tag size={16} style="display: inline; vertical-align: middle;" />
          Tags (comma-separated)
        </label>
        <input
          id="tags-input"
          type="text"
          class="nes-input is-dark"
          placeholder="contract, legal, evidence"
          bind:value={tags}
          style="width: 100%;"
        />
      </div>

      <!-- Upload Button -->
      <Button
        onclick={uploadFile}
        disabled={!selectedFile || uploading}
        class="nes-btn is-success"
        style="width: 100%;"
      >
        {uploading ? '⏳ UPLOADING...' : '📤 UPLOAD TO RAG SYSTEM'}
      </Button>

      <!-- Upload Result -->
      {#if uploadResult}
        <div
          class="nes-container"
          style="margin-top: 1rem; background: {uploadResult.success ? '#1a3a1a' : '#3a1a1a'};"
        >
          {#if uploadResult.success}
            <p style="color: #4ade80; margin: 0;">✓ Upload Successful!</p>
            <ul style="margin: 0.5rem 0 0 1.5rem; color: #d4af37; font-size: 0.875rem;">
              <li>Document ID: {uploadResult.documentId}</li>
              <li>Chunks: {uploadResult.chunks}</li>
              <li>Embeddings: {uploadResult.embeddings}</li>
              <li>Tags: {uploadResult.tags?.join(', ') || 'None'}</li>
              <li>MinIO: {uploadResult.minioStored ? '✓' : '✗'}</li>
              <li>Qdrant: {uploadResult.qdrantStored ? '✓' : '✗'}</li>
            </ul>
          {:else}
            <p style="color: #ef4444; margin: 0;">✗ Upload Failed</p>
            <p style="color: #d4af37; font-size: 0.875rem; margin: 0.5rem 0 0 0;">
              {uploadResult.error}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Search Section -->
    <div class="nes-container is-dark" style="background: #1a1d20;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
        <Search size={20} style="color: #d4af37;" />
        <h2 class="nes-text is-primary" style="font-size: 1.25rem; margin: 0;">SEARCH KNOWLEDGE BASE</h2>
      </div>

      <!-- Search Query -->
      <div class="nes-field" style="margin-bottom: 1rem;">
        <label for="search-input" style="color: #d4af37; margin-bottom: 0.5rem; display: block;"> Search Query </label>
        <input
          id="search-input"
          type="text"
          class="nes-input is-dark"
          placeholder="What are you looking for?"
          bind:value={searchQuery}
          onkeydown={e => e.key === 'Enter' && searchDocuments()}
          style="width: 100%;"
        />
      </div>

      <!-- Search Tags Filter -->
      <div class="nes-field" style="margin-bottom: 1rem;">
        <label for="search-tags-input" style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
          <Tag size={16} style="display: inline; vertical-align: middle;" />
          Filter by Tags
        </label>
        <input
          id="search-tags-input"
          type="text"
          class="nes-input is-dark"
          placeholder="contract, evidence"
          bind:value={searchTags}
          style="width: 100%;"
        />
      </div>

      <!-- Search Type -->
      <div style="margin-bottom: 1.5rem;">
        <label style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
          <Database size={16} style="display: inline; vertical-align: middle;" />
          Search Type
        </label>
        <div style="display: flex; gap: 0.5rem;">
          <label class="nes-radio" style="color: #d4af37;">
            <input type="radio" name="search-type" bind:group={searchType} value="hybrid" />
            <span>Hybrid</span>
          </label>
          <label class="nes-radio" style="color: #d4af37;">
            <input type="radio" name="search-type" bind:group={searchType} value="vector" />
            <span>Vector</span>
          </label>
          <label class="nes-radio" style="color: #d4af37;">
            <input type="radio" name="search-type" bind:group={searchType} value="fuzzy" />
            <span>Fuzzy</span>
          </label>
        </div>
      </div>

      <!-- Search Button -->
      <Button
        onclick={searchDocuments}
        disabled={!searchQuery.trim() || searching}
        class="nes-btn is-primary"
        style="width: 100%;"
      >
        {searching ? '🔍 SEARCHING...' : '🔎 SEARCH'}
      </Button>
    </div>
    </div>
  {/if}

  <!-- Documents Tab -->
  {#if activeTab === 'documents'}
    <div class="nes-container is-dark" style="background: #1a1d20; padding: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
        <FileText size={20} style="color: #d4af37;" />
        <h2 class="nes-text is-primary" style="font-size: 1.5rem; margin: 0;">UPLOADED DOCUMENTS</h2>
      </div>

      {#if loadingDocuments}
        <p class="nes-text is-primary" style="text-align: center;">⏳ Loading documents...</p>
      {:else if documents.length === 0}
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #d4af37; font-size: 0.875rem;">No documents uploaded yet. Start by uploading a file in the Upload tab!</p>
        </div>
      {:else}
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;">
          {#each documents as doc (doc.id)}
            <div class="nes-container" style="background: #0f1214; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
              <!-- Document Header -->
              <div style="display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
                <div style="flex: 1;">
                  <h3 style="color: #d4af37; margin: 0 0 0.5rem 0; word-break: break-word;">
                    📄 {doc?.filename ?? 'Untitled'}
                  </h3>
                  <p style="color: #9ca3af; font-size: 0.75rem; margin: 0;">
                    {#if doc?.createdAt}
                      {new Date(doc.createdAt).toLocaleDateString()} · {doc.chunks ?? 0} chunks
                    {:else}
                      {doc.chunks ?? 0} chunks
                    {/if}
                  </p>
                </div>
                <div class="nes-badge">
                  <span class="is-success">{doc?.fileSize > 0 ? (doc.fileSize / 1024).toFixed(1) : '0'}KB</span>
                </div>
              </div>

              <!-- Status and Tags -->
              <div>
                {#if doc?.tags && doc.tags.length > 0}
                  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                    {#each Array.isArray(doc.tags.slice(0, 3)) ? doc.tags.slice(0, 3) : [] as tag}
                      <span class="nes-badge">
                        <span class="is-warning">{tag}</span>
                      </span>
                    {/each}
                    {#if doc.tags.length > 3}
                      <span class="nes-badge">
                        <span class="is-disabled">+{doc.tags.length - 3}</span>
                      </span>
                    {/if}
                  </div>
                {/if}
                <div class="nes-badge">
                  <span class="is-primary">{doc?.status ?? 'completed'}</span>
                </div>
              </div>

              <!-- Document Summary -->
              <div style="background: #1a1d20; padding: 0.75rem; border: 1px solid #4a5568; flex: 1;">
                <p style="color: #d4af37; font-size: 0.75rem; margin: 0; line-height: 1.4; max-height: 3.5em; overflow: hidden; text-overflow: ellipsis;">
                  {doc?.summary ?? ''}
                </p>
              </div>

              <!-- Action Buttons -->
              <div style="display: flex; gap: 0.5rem;">
                <button
                  class="nes-btn is-primary"
                  style="flex: 1; font-size: 0.75rem; padding: 0.5rem;"
                  onclick={() => {
                    const url = `/api/rag/documents/${doc?.id}`;
                    fetch(url).then(r => r.json()).then(data => {
                      console.log('Document details:', data);
                      alert(`Document: ${data?.document?.filename ?? 'Unknown'}\nChunks: ${data?.chunks?.length ?? 0}\nStatus: ${data?.document?.status ?? 'unknown'}`);
                    });
                  }}
                >
                  View
                </button>
                <button
                  class="nes-btn is-error"
                  disabled={deletingId === doc?.id}
                  style="flex: 1; font-size: 0.75rem; padding: 0.5rem;"
                  onclick={() => deleteDocument(doc?.id)}
                >
                  {deletingId === doc?.id ? '⏳' : '🗑️'} Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Search Tab -->
  {#if activeTab === 'search'}
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
      <!-- Search Section -->
      <div class="nes-container is-dark" style="background: #1a1d20;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
          <Search size={20} style="color: #d4af37;" />
          <h2 class="nes-text is-primary" style="font-size: 1.25rem; margin: 0;">SEARCH KNOWLEDGE BASE</h2>
        </div>

        <!-- Search Query -->
        <div class="nes-field" style="margin-bottom: 1rem;">
          <label for="search-input-tab" style="color: #d4af37; margin-bottom: 0.5rem; display: block;"> Search Query </label>
          <input
            id="search-input-tab"
            type="text"
            class="nes-input is-dark"
            placeholder="What are you looking for?"
            bind:value={searchQuery}
            onkeydown={e => e.key === 'Enter' && searchDocuments()}
            style="width: 100%;"
          />
        </div>

        <!-- Search Tags Filter -->
        <div class="nes-field" style="margin-bottom: 1rem;">
          <label for="search-tags-input-tab" style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
            <Tag size={16} style="display: inline; vertical-align: middle;" />
            Filter by Tags
          </label>
          <input
            id="search-tags-input-tab"
            type="text"
            class="nes-input is-dark"
            placeholder="contract, evidence"
            bind:value={searchTags}
            style="width: 100%;"
          />
        </div>

        <!-- Search Type -->
        <div style="margin-bottom: 1.5rem;">
          <label style="color: #d4af37; margin-bottom: 0.5rem; display: block;">
            <Database size={16} style="display: inline; vertical-align: middle;" />
            Search Type
          </label>
          <div style="display: flex; gap: 0.5rem;">
            <label class="nes-radio" style="color: #d4af37;">
              <input type="radio" name="search-type-tab" bind:group={searchType} value="hybrid" />
              <span>Hybrid</span>
            </label>
            <label class="nes-radio" style="color: #d4af37;">
              <input type="radio" name="search-type-tab" bind:group={searchType} value="vector" />
              <span>Vector</span>
            </label>
            <label class="nes-radio" style="color: #d4af37;">
              <input type="radio" name="search-type-tab" bind:group={searchType} value="fuzzy" />
              <span>Fuzzy</span>
            </label>
          </div>
        </div>

        <!-- Search Button -->
        <Button
          onclick={searchDocuments}
          disabled={!searchQuery.trim() || searching}
          class="nes-btn is-primary"
          style="width: 100%;"
        >
          {searching ? '🔍 SEARCHING...' : '🔎 SEARCH'}
        </Button>
      </div>

      <!-- Search Status -->
      <div class="nes-container is-dark" style="background: #1a1d20;">
        <h3 class="nes-text is-primary" style="margin-top: 0;">📊 SEARCH STATUS</h3>
        {#if searching}
          <p style="color: #d4af37;">🔍 Searching knowledge base...</p>
        {:else if searchResults.length > 0}
          <p style="color: #4ade80; margin: 0;">✓ Found {searchResults.length} results</p>
        {:else if searchQuery}
          <p style="color: #ef4444; margin: 0;">✗ No results found</p>
        {:else}
          <p style="color: #9ca3af; margin: 0;">Enter a search query to begin</p>
        {/if}
      </div>

      <!-- Search Results Full Width -->
      {#if searchResults.length > 0}
        <div class="nes-container is-dark" style="margin-top: 2rem; background: #1a1d20; grid-column: 1 / -1;">
          <h3 class="nes-text is-primary" style="font-size: 1.25rem; margin-bottom: 1rem;">
            📊 SEARCH RESULTS ({searchResults.length})
          </h3>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            {#each searchResults as result, index}
              <div class="nes-container" style="background: #0f1214; padding: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                  <div>
                    <h4 style="color: #d4af37; margin: 0 0 0.25rem 0;">
                      {index + 1}. {result.filename}
                    </h4>
                    {#if result.tags && result.tags.length > 0}
                      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                        {#each Array.isArray(result.tags) ? result.tags : [] as tag}
                          <span class="nes-badge">
                            <span class="is-warning">{tag}</span>
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <div style="text-align: right;">
                    <div class="nes-badge">
                      <span class="is-success">{Math.round((result.score || result.matchScore || 0) * 100)}%</span>
                    </div>
                    {#if result.searchType}
                      <p style="color: #9ca3af; font-size: 0.75rem; margin: 0.25rem 0 0 0;">
                        {result.searchType}
                      </p>
                    {/if}
                  </div>
                </div>

                {#if result.content}
                  <p style="color: #d4af37; font-size: 0.875rem; margin: 0.5rem 0 0 0; line-height: 1.5;">
                    {result.content.slice(0, 200)}...
                  </p>
                {/if}

                {#if result.createdAt}
                  <p style="color: #6b7280; font-size: 0.75rem; margin: 0.5rem 0 0 0;">
                    📅 {new Date(result.createdAt).toLocaleDateString()}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @import 'nes.css/css/nes.min.css';

  :global(body) {
    background: #212529;
    color: #d4af37;
    font-family: 'Press Start 2P', 'Courier New', monospace;
  }
</style>
                    📅 {new Date(result.createdAt).toLocaleDateString()}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @import 'nes.css/css/nes.min.css';

  :global(body) {
    background: #212529;
    color: #d4af37;
    font-family: 'Press Start 2P', 'Courier New', monospace;
  }
</style>


