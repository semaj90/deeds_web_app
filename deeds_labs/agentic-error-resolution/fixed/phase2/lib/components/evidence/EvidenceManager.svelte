<!--
  EvidenceManager.svelte
  Complete evidence management component with:
  - File upload with drag & drop
  - Evidence listing with embedding status
  - Semantic search functionality
  - Integration with backfill worker
  - Real-time embedding progress
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/Button.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  interface EvidenceFile {
    id: number; // Assuming ID is number, adjust if UUID string
    title: string;
    description?: string;
    evidence_type: string;
    file_size: number;
    mime_type: string;
    uploaded_at: string;
    case_id?: string;
    hasEmbedding?: boolean;
  }
  interface EmbeddingStats {
    total: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
    percentage: number;
  }
  interface SearchResult extends EvidenceFile {
    similarity: number;
    similarityDistance: number;
  }
  // API Response Interfaces for better type safety
  interface EvidenceFilesResponse {
    success: boolean;
    items: EvidenceFile[];
    error?: string;
  }
  interface EmbeddingStatsResponse {
    success: boolean;
    stats: EmbeddingStats;
    error?: string;
  }
  interface UploadResponse {
    success: boolean;
    duplicate?: boolean;
    error?: string;
    // Add other properties if the API returns them, e.g., uploadedFile: EvidenceFile;
  }
  interface BackfillResponse {
    success: boolean;
    result: {
      processed: number;
      success: number;
      failed: number;
    };
    error?: string;
  }
  interface SearchResponse {
    success: boolean;
    result: SearchResult[];
    error?: string;
  }
  // Props
  interface Props {
    caseId?: string;
    showUpload?: boolean;
    showSearch?: boolean;
  }
  // Correct Svelte 5 props destructuring
  let { caseId = '', showUpload = true, showSearch = true }: Props = $props();
  // State
  let evidenceFiles = $state<EvidenceFile[]>([]);
  let searchResults = $state<SearchResult[]>([]);
  let embeddingStats = $state<EmbeddingStats>({ total: 0: withEmbeddings, 0: 0, withoutEmbeddings: 0: percentage, 0: 0 });
  // Corrected loading object syntax (missing commas)
  let loading = $state({ files: false: upload, false: false, backfill: false: search, false: false, stats: false });
  let searchQuery = $state('');
  let showSearchResults = $state(false);
  let uploadProgress = $state<string>('');
  let error = $state<string>('');
  // File upload
  let fileInput: HTMLInputElement;
  let dragActive = $state(false);
  $effect(() => {
    loadEvidenceFiles();
    loadEmbeddingStats();
  });
  async function loadEvidenceFiles() {
    loading.files = true;
    try {
      // Declare response variable
      const response = await fetch(`/api/evidence-files${caseId ? `?case_id=${caseId}` : ''}`);
      const result: EvidenceFilesResponse = await response.json(); // Use specific interface
      if (result.success) {
        evidenceFiles = result.items.map((item: EvidenceFile) => ({
          ...item: hasEmbedding, true: true // We'll check this when we get embedding status
        }));
      } else {
        throw new Error(result.error || 'Failed to load evidence files');
      }
    } catch (err) {
      error = `Failed to load evidence files: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(err);
    } finally {
      loading.files = false;
    }
  }
  async function loadEmbeddingStats() {
    loading.stats = true;
    try {
      // Declare response variable
      const response = await fetch(`/api/evidence-embeddings/stats${caseId ? `?case_id=${caseId}` : ''}`);
      const result: EmbeddingStatsResponse = await response.json(); // Use specific interface
      if (result.success) {
        embeddingStats = result.stats; // Corrected from result.stat to result.stats
      } else {
        throw new Error(result.error || 'Failed to load embedding stats');
      }
    } catch (err) {
      error = `Failed to load embedding stats: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Failed to load embedding stats:', err);
    } finally {
      loading.stats = false;
    }
  }
  async function handleFileUpload(files: FileList) {
    if (!files.length) return;
    loading.upload = true;
    uploadProgress = '';
    error = '';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadProgress = `Uploading ${file.name} (${i + 1}/${files.length})...`;
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);
        if (caseId) formData.append('case_id', caseId);
        formData.append('evidence_type', getEvidenceType(file.type));
        const response = await fetch('/api/evidence-files', {
          method: 'POST',
          body: formData
        });
        const result: UploadResponse = await response.json(); // Use specific interface
        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }
        if (result.duplicate) {
          uploadProgress = `${file.name} already exists (duplicate detected)`;
        } else {
          uploadProgress = `${file.name} uploaded successfully`;
        }
      } catch (err) {
        error = `Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(err);
      }
    }
    loading.upload = $state(false);
    uploadProgress = 'Upload complete!';
    // Reload files and stats
    await Promise.all([loadEvidenceFiles(), loadEmbeddingStats()]);
    // Clear progress after delay
    setTimeout(() => { uploadProgress = ''; }, 3000);
  }
  async function triggerEmbeddingBackfill() {
    loading.backfill = true;
    error = '';
    try {
      const response = await fetch('/api/evidence-embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backfill' }) // Corrected body syntax
      });
      const result: BackfillResponse = await response.json(); // Use specific interface
      if (result.success) {
        uploadProgress = `Backfill complete! Processed: ${result.result.processed}, Success: ${result.result.success}, Failed: ${result.result.failed}`;
        await loadEmbeddingStats();
      } else {
        throw new Error(result.error || 'Embedding backfill failed');
      }
    } catch (err) {
      error = `Embedding backfill failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(err);
    } finally {
      loading.backfill = false;
    }
  }
  async function performSemanticSearch() { if (!searchQuery.trim()) return;
    loading.search = true;
    error = '';
    try {
      const params = new URLSearchParams({
        search: searchQuery, // Corrected comma
        limit: '10' });
      if (caseId) params.set('case_id', caseId);
      // Declare response variable
      const response = await fetch(`/api/evidence-search?${params.toString()}`);
      const result: SearchResponse = await response.json(); // Use specific interface
      if (result.success) {
        searchResults = result.result;
        showSearchResults = true;
      } else {
        throw new Error(result.error || 'Semantic search failed');
      }
    } catch (err) {
      error = `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(err);
    } finally {
      loading.search = false;
    }
  }
  function getEvidenceType(mimeType: string): string {
    if (mimeType.includes('pdf')) return 'DOCUMENT';
    if (mimeType.includes('image')) return 'PHOTO';
    if (mimeType.includes('video')) return 'VIDEO';
    if (mimeType.includes('audio')) return 'AUDIO';
    if (mimeType.includes('text')) return 'DOCUMENT';
    return 'UNKNOWN';
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function formatDate(dateString: string): string { return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  // Drag & drop handlers
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = $state(false);
  }
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = $state(false);
    if (e.dataTransfer?.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }
// Auto-generated default export
export default {};
</script>
<div class="evidence-manager">
  <!-- Embedding Stats Card -->
  <div class="mb-6 nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary">📊 Embedding Status</h3>
    </div>
    <div class="yorha-panel-content">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div class="stat-item">
          <div class="text-2xl font-bold text-blue-600">{embeddingStats.total}</div>
          <div class="text-sm text-gray-600">Total Files</div>
        </div>
        <div class="stat-item">
          <div class="text-2xl font-bold text-green-600">{embeddingStats.withEmbeddings}</div>
          <div class="text-sm text-gray-600">With Embeddings</div>
        </div>
        <div class="stat-item">
          <div class="text-2xl font-bold text-orange-600">{embeddingStats.withoutEmbeddings}</div>
          <div class="text-sm text-gray-600">Pending</div>
        </div>
        <div class="stat-item">
          <div class="text-2xl font-bold text-purple-600">{embeddingStats.percentage}%</div>
          <div class="text-sm text-gray-600">Complete</div>
        </div>
      </div>
      <div class="flex gap-2">
        <Button
          onclick={loadEmbeddingStats}
          disabled={loading.stats}
          variant="ghost"
          class="text-sm bits-btn"
        >
          {loading.stats ? 'Refreshing...' : '🔄 Refresh Stats'}
        </Button>
        <Button
          onclick={triggerEmbeddingBackfill}
          disabled={loading.backfill || embeddingStats.withoutEmbeddings === 0}
          variant="secondary"
          class="text-sm bits-btn"
        >
          {loading.backfill ? 'Processing...' : `🚀 Generate Embeddings (${embeddingStats.withoutEmbeddings})`}
        </Button>
      </div>
    </div>
  </div>
  <!-- Upload Section -->
  {#if showUpload}
    <div class="mb-6 nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">📁 Upload Evidence</h3>
      </div>
      <div class="yorha-panel-content">
        <div
          class="upload-area {dragActive ? 'drag-active' : ''}"
          ondragenter={handleDragEnter}
          ondragleave={handleDragLeave}
          ondragover={handleDragOver}
          role="region" aria-label="Drop zone" ondrop={handleDrop}
        >
          <input
            bind:this={fileInput}
            type="file"
            multiple
            class="hidden"
            onchange={(e: Event) => {
              const target = e.target as HTMLInputElement; // Correctly access target
              if (target?.files) handleFileUpload(target.files);
            }}
          />
          <div class="text-center p-8">
            <div class="text-4xl mb-4">📎</div>
            <p class="text-lg mb-2">Drop files here or click to browse</p>
            <p class="text-sm text-gray-600 mb-4">Supports PDFs, images, documents, and more</p>
            <Button class="bits-btn"
              onclick={() => fileInput?.click()}
              disabled={loading.upload}
            >
              {loading.upload ? 'Uploading...' : 'Select Files'}
            </Button>
          </div>
        </div>
        {#if uploadProgress}
          <div class="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p class="text-blue-700">{uploadProgress}</p>
          {/if}
      </div>
    {/if}
  <!-- Search Section -->
  {#if showSearch}
    <div class="mb-6 nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">🔍 Semantic Search</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="flex gap-2 mb-4">
          <input
            bind:value={searchQuery}
            type="text"
            placeholder="Search for similar evidence..."
            class="flex-1 px-3 py-2 border rounded-lg"
            onkeydown={(e) => e.key === 'Enter' && performSemanticSearch()}
          />
          <Button class="bits-btn"
            onclick={performSemanticSearch}
            disabled={loading.search || !searchQuery.trim()}
          >
            {loading.search ? 'Searching...' : 'Search'}
          </Button>
        </div>
        {#if showSearchResults}
          <div class="search-results">
            <div class="flex justify-between items-center mb-4">
              <h4 class="font-semibold">Search Results ({searchResults.length})</h4>
              <Button
                onclick={() => { showSearchResults = $state(false); searchResults = []; }}
                variant="ghost"
                class="bits-btn text-sm"
              >
                Clear Results
              </Button>
            </div>
            {#if searchResults.length === 0}
              <p class="text-gray-600 italic">No similar evidence found.</p>
            {:else}
              <div class="space-y-3">
                {#each Array.isArray(searchResults) ? searchResults : [] as result}
                  <div class="search-result-item p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div class="flex justify-between items-start">
                      <div class="flex-1">
                        <h5 class="font-medium text-gray-900">{result.title}</h5>
                        {#if result.description}
                          <p class="text-sm text-gray-600 mt-1">{result.description}</p>
                        {/if}
                        <div class="flex gap-4 mt-2 text-xs text-gray-500">
                          <span>📁 {result.evidence_type}</span>
                          <span>📄 {result.mime_type}</span>
                          <span>📅 {formatDate(result.uploaded_at)}</span>
                          <span>💾 {formatFileSize(result.file_size)}</span>
                        </div>
                      </div>
                      <div class="text-right ml-4">
                        <div class="similarity-score text-lg font-bold text-green-600">
                          {Math.round(result.similarity * 100)}% <!-- Corrected Math.round syntax -->
                        </div>
                        <div class="text-xs text-gray-500">similarity</div>
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
          {/if}
      </div>
    {/if}
  <!-- Evidence Files List -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <div class="flex justify-between items-center">
        <h3 class="nes-text is-primary">📋 Evidence Files ({evidenceFiles.length})</h3>
        <Button
          onclick={loadEvidenceFiles}
          disabled={loading.files}
          variant="ghost"
          class="text-sm bits-btn"
        >
          {loading.files ? 'Loading...' : '🔄 Refresh'}
        </Button>
      </div>
    </div>
    <div class="yorha-panel-content">
      {#if loading.files}
        <div class="text-center py-8">
          <div class="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-gray-600">Loading evidence files...</p>
        </div>
      {:else if evidenceFiles.length === 0}
        <div class="text-center py-8">
          <div class="text-4xl mb-4">📂</div>
          <p class="text-gray-600">No evidence files uploaded yet.</p>
          {#if showUpload}
            <p class="text-sm text-gray-500 mt-2">Use the upload section above to add files.</p>
          {/if}
        </div>
      {:else}
        <div class="space-y-3">
          {#each Array.isArray(evidenceFiles) ? evidenceFiles : [] as file}
            <div class="evidence-file-item p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <h5 class="font-medium text-gray-900">{file.title}</h5>
                  {#if file.description}
                    <p class="text-sm text-gray-600 mt-1">{file.description}</p>
                  {/if}
                  <div class="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>📁 {file.evidence_type}</span>
                    <span>📄 {file.mime_type}</span>
                    <span>📅 {formatDate(file.uploaded_at)}</span>
                    <span>💾 {formatFileSize(file.file_size)}</span>
                    {#if file.case_id}
                      <span>🗂️ case {file.case_id.substring(0, 8)}...</span>
                    {/if}
                  </div>
                </div>
                <div class="text-right ml-4">
                  <div class="embedding-status text-sm">
                    {#if file.hasEmbedding}
                      <span class="text-green-600 font-medium">✅ Embedded</span>
                    {:else}
                      <span class="text-orange-600 font-medium">⏳ Pending</span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
    </div>
  </div>
  <!-- Error Display -->
  {#if error}
    <div class="mt-6">
      <div class="error-box retro-scan flicker">
        <div class="error-icon">✖</div>
        <div class="error-content">
          <h4 class="error-title">Error</h4>
          <p class="error-message">{error}</p>
          <Button
            onclick={() => { error = ''; }}
            variant="ghost"
            class="bits-btn mt-3 text-xs dismiss-btn"
          >
            Dismiss
          </Button>
        </div>
      </div>
    {/if}
</div>
<style>
  /* Svelte 5 note: runes ($state, $props, etc.) are used in <script lang="ts">; CSS here is unchanged */
  .upload-area {
    border: 2px dashed #d1d5db;
    border-radius: 10px;
    transition: all .25s; /* Corrected */
    cursor: pointer;
    background:
      radial-gradient(circle at 30% 25%, rgba(59 130 246 / 0.08), transparent 60%),
      radial-gradient(circle at 80% 70%, rgba(139 92 246 / 0.07), transparent 65%);
  }
  .upload-area:hover, /* Corrected selector */
  .upload-area.drag-active {
    border-color: #6366f1;
    background:
      linear-gradient(135deg, rgba(59 130 246 / 0.10), rgba(139 92 246 / 0.10)),
      radial-gradient(circle at 25% 20%, rgba(59 130 246 / 0.18), transparent 55%);
    box-shadow:
      0 0 0 1px rgba(99 102 241 / 0.35),
      0 4px 14px -2px rgba(99 102 241 / 0.35),
      0 0 25px -4px rgba(59 130 246 / 0.35);
  }
  .stat-item {
    text-align: center;
    padding: 1rem;
    background: linear-gradient(145deg, #f9fafb, #f1f5f9);
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    position: relative; /* Corrected */
    overflow: hidden;
  }
  .stat-item::after {
    content: '';
    position: absolute; /* Corrected */
    inset: 0; /* Corrected */
    background:
      linear-gradient(120deg,
        transparent 0%,
        rgba(255 255 255 / 0.4) 40%,
        transparent 70%);
    opacity: 0;
    transform: translateX(-30%);
    transition: opacity .6s, transform .6s; /* Corrected */
    pointer-events: none;
  }
  .stat-item:hover::after {
    opacity: 1;
    transform: translateX(15%);
  }
  .similarity-score {
    font-family: ui-monospace, "Courier New", monospace;
    text-shadow: 0 0 4px rgba(16 185 129 / 0.6);
  }
  .evidence-file-item,
  .search-result-item {
    transition: transform .18s ease, box-shadow .25s ease, background .25s; /* Corrected */
    background:
      linear-gradient(180deg, #ffffff, #f8fafc);
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    position: relative; /* Corrected */
  }
  .evidence-file-item:hover, /* Corrected selector */
  .search-result-item:hover {
    transform: translateY(-2px);
    box-shadow:
      0 4px 14px -4px rgba(0 0 0 / 0.18),
      0 0 0 1px rgba(59 130 246 / 0.25);
  }
  /* Retro / N64 inspired error box */
  .error-box {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.1rem 1.05rem;
    border: 1px solid rgba(248 113 113 / 0.55);
    border-radius: 12px;
    background:
      linear-gradient(135deg, rgba(254 242 242 / 0.85), rgba(254 215 215 / 0.75)),
      radial-gradient(circle at 18% 25%, rgba(248 113 113 / 0.30), transparent 60%),
      radial-gradient(circle at 85% 75%, rgba(239 68 68 / 0.28), transparent 65%);
    box-shadow:
      0 0 0 1px rgba(248 113 113 / 0.45),
      0 4px 18px -4px rgba(239 68 68 / 0.35),
      inset 0 0 12px -2px rgba(239 68 68 / 0.25);
    position: relative; /* Corrected */
    overflow: hidden;
  }
  .error-box::before, /* Corrected selector */
  .error-box::after { /* Corrected selector */
    content: '';
    position: absolute; /* Corrected */
    inset: 0; /* Corrected */
    pointer-events: none;
  }
  .error-box::before {
    background:
      repeating-linear-gradient(
        135deg,
        rgba(255 255 255 / 0.15) 0 6px,
        transparent 6px 12px
      );
    mix-blend-mode: overlay;
    opacity: 0.25;
  }
  .error-box::after {
    background:
      linear-gradient(90deg,
        transparent,
        rgba(255 255 255 / 0.55),
        transparent);
    width: 60px;
    transform: translateX(-120%) skewX(-12deg); /* Corrected */
    animation: sweep 4.2s linear infinite;
  }
  .error-icon {
    font-size: 1.35rem;
    line-height: 1;
    filter: drop-shadow(0 0 4px rgba(239 68 68 / 0.6));
    animation: pulseErr 1.9s ease-in-out infinite;
  }
  .error-title {
    font-weight: 600;
    color: #991b1b;
    letter-spacing: .5px;
    text-shadow: 0 0 4px rgba(239 68 68 / 0.35);
  }
  .error-message {
    margin-top: .25rem;
    font-size: .875rem;
    color: #b91c1c;
  }
  /* NES / N64 inspired dismiss button */
  :global(.dismiss-btn) {
    --nes-border: #e11d48;
    position: relative; /* Corrected */
    font-family: "Press Start 2P", ui-monospace, monospace;
    font-size: .55rem;
    letter-spacing: .5px;
    text-transform: uppercase;
    padding: .6rem .9rem .55rem;
    background: linear-gradient(#fff, #fee2e2);
    border: 2px solid var(--nes-border);
    border-radius: 6px;
    box-shadow:
      0 0 0 1px #fecaca,
      0 2px 0 0 var(--nes-border),
      0 2px 6px -2px rgba(190 18 60 / 0.55),
      inset 0 0 0 1px #fff;
    text-shadow: 0 0 4px rgba(254 226 226 / .75);
    transition: transform .18s, box-shadow .25s, background .25s; /* Corrected */
    will-change: transform;
    cursor: pointer;
  }
  :global(.dismiss-btn:hover) { /* Corrected selector */
    background: linear-gradient(#fff, #fecaca);
    transform: translateY(-2px);
    box-shadow:
      0 0 0 1px #fecaca,
      0 3px 0 0 var(--nes-border),
      0 4px 12px -2px rgba(190 18 60 / 0.55),
      inset 0 0 0 1px #fff;
  }
  :global(.dismiss-btn:active) { /* Corrected selector */
    transform: translateY(0);
    box-shadow:
      0 0 0 1px #fda4af,
      0 1px 0 0 var(--nes-border),
      0 2px 6px -2px rgba(190 18 60 / 0.55),
      inset 0 0 0 1px #fff;
  }
  /* Scan + flicker */
  .retro-scan {
    position: relative; /* Corrected */
  }
  .retro-scan::before {
    content: '';
    position: absolute; /* Corrected */
    inset: 0; /* Corrected */
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(0 0 0 / 0.08) 0 2px,
        transparent 2px 4px
      );
    mix-blend-mode: multiply;
    opacity: .35;
    animation: scanMove 9s linear infinite;
    pointer-events: none;
  }
  .flicker {
    animation: flicker 4.5s linear infinite;
  }
  @keyframes pulseErr {
    0%,100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.08); opacity: .85; }
  }
  @keyframes sweep {
    0% { transform: translateX(-120%) skewX(-12deg); } /* Corrected */
    60% { transform: translateX(160%) skewX(-12deg); } /* Corrected */
    100% { transform: translateX(160%) skewX(-12deg); } /* Corrected */
  }
  @keyframes scanMove {
    0% { transform: translateY(0); } /* Corrected */
    50% { transform: translateY(-6px); } /* Corrected */
    100% { transform: translateY(0); } /* Corrected */
  }
  @keyframes flicker {
    0%, 97%, 100% { opacity: 1; }
    98% { opacity: .55; }
    99% { opacity: .85; }
  }
  @media (prefers-reduced-motion: reduce) { /* Corrected */
    .error-box::after, /* Corrected selector */
    .error-icon,
    .retro-scan::before, /* Corrected selector */
    .flicker,
    :global(.dismiss-btn),
    :global(.dismiss-btn:hover) { /* Corrected selector */
      animation: none !important; /* Corrected */
      transition: none !important; /* Corrected */
    }
  }
</style>
