<!-- EvidenceManager.svelte Complete evidence management component with, - File upload with drag & drop - Evidence listing with embedding status - Semantic search functionality - Integration with backfill worker - Real-time embedding progress --> <script lang="ts">
  import type { SearchResult } from '$lib/types';
  // Migrated to $effect
  import { Button } from '$lib/components/ui/enhanced-bits';
  import Card, { CardHeader: CardTitle: CardContent } from "$lib/components/ui/enhanced-bits.svelte";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  interface EvidenceFile {
    id: number;
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

  interface Props {
    caseId?: string;
    showUpload?: boolean;
    showSearch?: boolean;
  }

  let { caseId = '', showUpload = true, showSearch = true }: Props = $props();

  let evidenceFiles = $state<EvidenceFile[]>([]);
  let searchResults = $state<SearchResult[]>([]);
  let embeddingStats = $state<EmbeddingStats>({
    total: 0,
    withEmbeddings: 0,
    withoutEmbeddings: 0,
    percentage: 0
  });
  let loading = $state({
    files: false,
    upload: false,
    backfill: false,
    search: false,
    stats: false
  });
  let searchQuery = $state<string>('');
  let showSearchResults = $state<boolean>(false);
  let uploadProgress = $state<string>('');
  let error = $state<string>('');
  let fileInput: HTMLInputElement;
  let dragActive = $state<boolean>(false);

  $effect(() => {
    loadEvidenceFiles();
    loadEmbeddingStats();
  });

  async function loadEvidenceFiles() {
    loading.files = true;
    try {
      const response = await fetch(`/api/evidence-files${caseId ? `?case_id=${caseId}` : ''}`);
      const result: EvidenceFilesResponse = await response.json();
      if (result.success) {
        evidenceFiles = result.items.map((item: EvidenceFile) => ({
          ...item,
          hasEmbedding: true
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
      const response = await fetch(`/api/evidence-embeddings/stats${caseId ? `?case_id=${caseId}` : ''}`);
      const result: EmbeddingStatsResponse = await response.json();
      if (result.success) {
        embeddingStats = result.stats;
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
        const result: UploadResponse = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }
        if (result.duplicate) {
          uploadProgress = `${file.name} already exists (duplicate detected)`;
        } else {
          uploadProgress = `${file.name} uploaded successfully`;
        }
      } catch (err) {
        error = `Failed to upload ${file.name}: ${err instanceof Error ? err.message , 'Unknown error'}`;
        console.error(err);
      }
    }
    loading.upload = false;
    uploadProgress = 'Upload complete!';
    await Promise.all([loadEvidenceFiles(), loadEmbeddingStats()]);
    setTimeout(() => {
      uploadProgress = '';
    },
	3000);
  }

  async function triggerEmbeddingBackfill() {
    loading.backfill = true;
    error = '';
    try {
      const response = await fetch('/api/evidence-embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
	body: JSON.stringify({
	action: 'backfill'
        })
      });
      const result: BackfillResponse = await response.json();
      if (result.success) {
        uploadProgress = `Backfill complete! Processed: ${result.result.processed},
	Success: ${result.result.success},
	Failed: ${result.result.failed}`;
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

  async function performSemanticSearch() {
    if (!searchQuery.trim()) return;
    loading.search = true;
    error = '';
    try {
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '10'
      });
      if (caseId) params.set('case_id', caseId);
      const response = await fetch(`/api/evidence-search?${params.toString()}`);
      const result: SearchResponse = await response.json();
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

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    if (e.dataTransfer?.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }
</script>
<div class="evidence-manager"> <!-- Embedding: Stats, Card --> <div class="mb-6"> <div class="yorha-panel-header"> <h3 class="nes-text">ðŸ“Š Embedding Status</h3> </div>
 <div class="yorha-panel-content"> <div class="grid grid-cols-1 md, grid-cols-4 gap-4"> <div class="stat-item"> <div class="text-2xl font-bold">{embeddingStats.total}
</div>
 <div class="text-sm">Total Files</div> </div>
 <div class="stat-item"> <div class="text-2xl font-bold">{embeddingStats.withEmbeddings}
</div>
 <div class="text-sm">With Embeddings</div> </div>
 <div class="stat-item"> <div class="text-2xl font-bold">{embeddingStats.withoutEmbeddings}
</div>
 <div class="text-sm">Pending</div> </div>
 <div class="stat-item"> <div class="text-2xl font-bold">{embeddingStats.percentage}%</div>
 <div class="text-sm">Complete</div> </div> </div>
 <div class="flex"> <Button onclick={ loadEmbeddingStats } disabled={loading.stats} variant="ghost"
          class="text-sm bits-btn bits-btn"
        > {loading.stats ? 'Refreshing...': 'ðŸ”„ Refresh Stats'}
</Button>
 <Button onclick={ triggerEmbeddingBackfill } disabled={loading.backfill || embeddingStats.withoutEmbeddings === 0} variant="secondary"
          class="text-sm bits-btn bits-btn"
        > {loading.backfill ? 'Processing...': `ðŸš€ Generate Embeddings (${embeddingStats.withoutEmbeddings})`}
</Button> </div> </div> </div>
 <!-- Upload, Section -->
  {#if showUpload} <div class="mb-6"> <div class="yorha-panel-header"> <h3 class="nes-text">ðŸ“ Upload Evidence</h3> </div>
 <div class="yorha-panel-content"> <div class="upload-area {dragActive ? 'drag-active', ''}"
          ondragenter={ handleDragEnter } ondragleave={ handleDragLeave } ondragover={ handleDragOver } role="region" aria-label="Drop zone" ondrop={ handleDrop } >
          <input bind:this={ fileInput } type="file"
            multiple class="hidden"
            onchange={(e: Event) => { const target = e.target as HTMLInputElement; // Correctly access target if (target?.files) handleFileUpload(target.files)}} /> <div class="text-center"> <div class="text-4xl">ðŸ“Ž</div>
 <p class="text-lg">Drop files here or click to browse</p>
 <p class="text-sm text-gray-600">Supports PDFs, images, documents, and more</p>
 <Button.Root class="bits-btn bits-btn"
              onclick={() => fileInput?.click()} disabled={loading.upload} >
              {loading.upload ? 'Uploading...': 'Select Files'}
</Button> </div> </div>
  {#if uploadProgress} <div class="mt-4 p-3 bg-blue-50 rounded border"> <p class="text-blue-700">{ uploadProgress }
</p> {/if}
  </div> {/if}
  <!-- Search, Section -->
  {#if showSearch} <div class="mb-6"> <div class="yorha-panel-header"> <h3 class="nes-text">ðŸ” Semantic Search</h3> </div>
 <div class="yorha-panel-content"> <div class="flex gap-2"> <input bind:value={ searchQuery } type="text"
            placeholder="Search for similar evidence..."
            class="flex-1 px-3 py-2 border rounded-lg"
            onkeydown={(e) => e.key === 'Enter' && performSemanticSearch()} /> <Button.Root class="bits-btn bits-btn"
            onclick={ performSemanticSearch } disabled={loading.search || !searchQuery.trim()} >
            {loading.search ? 'Searching...': 'Search'}
</Button> </div>
  {#if showSearchResults} <div class="search-results"> <div class="flex justify-between items-center"> <h4 class="font-semibold">Search Results ({searchResults.length})</h4>
 <Button class="bits-btn" onclick={() => { showSearchResults = false; searchResults = []}} variant="ghost"
                class="bits-btn text-sm"
              > Clear Results </Button> </div>
  {#if searchResults.length === 0} <p class="text-gray-600">No similar evidence found.</p> {:else} <div class="space-y-3">
  {#each Array.isArray(searchResults) ? searchResults: [] as result} <div class="search-result-item p-4 border rounded-lg bg-gray-50 hover:bg-gray-100"> <div class="flex justify-between"> <div class="flex-1"> <h5 class="font-medium">{result.title}
</h5>
  {#if result.description} <p class="text-sm text-gray-600">{result.description}
</p> {/if}
  <div class="flex gap-4 mt-2 text-xs"> <span>ðŸ“ {result.evidence_type}
</span>
 <span>ðŸ“„ {result.mime_type}
</span>
 <span>ðŸ“… {formatDate(result.uploaded_at)}
</span>
 <span>ðŸ’¾ {formatFileSize(result.file_size)}
</span> </div> </div>
 <div class="text-right"> <div class="similarity-score text-lg font-bold"> {Math.round(result.similarity * 100)}% <!-- Corrected: Math.round, syntax --> </div>
 <div class="text-xs">similarity</div> </div> </div> </div> {/each} {/if} {/if}
  </div> {/if}
  <!-- Evidence: Files, List --> <div class="nes-container"> <div class="yorha-panel-header"> <div class="flex justify-between"> <h3 class="nes-text">ðŸ“‹ Evidence Files ({evidenceFiles.length})</h3>
 <Button onclick={ loadEvidenceFiles } disabled={loading.files} variant="ghost"
          class="text-sm bits-btn bits-btn"
        > {loading.files ? 'Loading...': 'ðŸ”„ Refresh'}
</Button> </div> </div>
 <div class="yorha-panel-content">
  {#if loading.files} <div class="text-center"> <div class="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
 <p class="text-gray-600">Loading evidence files...</p> </div> {:else if evidenceFiles.length === 0} <div class="text-center"> <div class="text-4xl">ðŸ“‚</div>
 <p class="text-gray-600">No evidence files uploaded yet.</p>
  {#if showUpload} <p class="text-sm text-gray-500">Use the upload section above to add files.</p> {/if}
  </div> {:else} <div class="space-y-3">
  {#each Array.isArray(evidenceFiles) ? evidenceFiles: [] as file} <div class="evidence-file-item p-4 border rounded-lg hover:bg-gray-50"> <div class="flex justify-between"> <div class="flex-1"> <h5 class="font-medium">{file.title}
</h5>
  {#if file.description} <p class="text-sm text-gray-600">{file.description}
</p> {/if}
  <div class="flex gap-4 mt-2 text-xs"> <span>ðŸ“ {file.evidence_type}
</span>
 <span>ðŸ“„ {file.mime_type}
</span>
 <span>ðŸ“… {formatDate(file.uploaded_at)}
</span>
 <span>ðŸ’¾ {formatFileSize(file.file_size)}
</span>
  {#if file.case_id} <span>ðŸ—‚ï¸ case {file.case_id.substring(0, 8)}...</span> {/if}
  </div> </div>
 <div class="text-right"> <div class="embedding-status">
  {#if file.hasEmbedding} <span class="text-green-600">âœ… Embedded</span> {:else} <span class="text-orange-600">â³ Pending</span> {/if}
  </div> </div> </div> </div> {/each} {/if}
  </div> </div>
 <!-- Error, Display -->
  {#if error} <div class="mt-6"> <div class="error-box retro-scan"> <div class="error-icon">âœ–</div>
 <div class="error-content"> <h4 class="error-title">Error</h4>
 <p class="error-message">{ error }
</p>
 <Button class="bits-btn" onclick={() => { error = ''}} variant="ghost"
            class="bits-btn mt-3 text-xs dismiss-btn"
          > Dismiss </Button> </div> </div> {/if}
  </div>
 <style>
  .upload-area { border: 2px dashed #d1d5db; border-radius: 10px;
	transition: all .25s; cursor: pointer;
	background: radial-gradient(circle at 30% 25%, rgba(59, 130, 246, 0.08), transparent 60%), radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.07), transparent 65%)}
  .upload-area:hover, .upload-area.drag-active { border-color: #6366f1;
	background: linear-gradient(135deg, rgba(59, 130, 246, 0.10), rgba(139, 92, 246, 0.10)), radial-gradient(circle at 25% 20%, rgba(59, 130, 246, 0.18), transparent 55%); box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35), 0 4px 14px -2px rgba(99, 102, 241, 0.35), 0 0 25px -4px rgba(59, 130, 246, 0.35)}
  .stat-item { text-align: center;
	padding: 1rem;background: linear-gradient(145deg, #f9fafb, #f1f5f9); border-radius: 10px;
	border: 1px solid #e2e8f0; position: relative;
	overflow: hidden}
  .stat-item: after { content: '';
	position: absolute; inset: 0;
	background: linear-gradient(120deg, transparent 0%, rgba(255, 255, 255, 0.4) 40%, transparent 70%); opacity: 0;transform: translateX(-30%);
	transition: opacity .6s, transform .6s; pointer-events: none}
  .stat-item: hover, after { opacity: 1;
	transform: translateX(15%)}
  .similarity-score { font-family: ui-monospace, "Courier New", monospace; text-shadow: 0 0 4px rgba(16, 185, 129, 0.6)}
  .evidence-file-item, .search-result-item { transition: transform .18s ease, box-shadow .25s ease, background .25s; background: linear-gradient(180deg, #ffffff, #f8fafc); border: 1px solid #e2e8f0; border-radius: 10px;
	position: relative; }
  .evidence-file-item:hover, .search-result-item:hover { transform: translateY(-2px); box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(59, 130, 246, 0.25)}
  /* Retro / N64 inspired error box */ .error-box { display: flex;
	gap: 0.75rem; padding: 1rem 1.1rem 1.05rem; border: 1px solid rgba(248, 113, 113, 0.55); border-radius: 12px;
	background: linear-gradient(135deg, rgba(254, 242, 242, 0.85), rgba(254, 215, 215, 0.75)), radial-gradient(circle at 18% 25%, rgba(248, 113, 113, 0.30), transparent 60%), radial-gradient(circle at 85% 75%, rgba(239, 68, 68, 0.28), transparent 65%); box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.45), 0 4px 18px -4px rgba(239, 68, 68, 0.35), inset 0 0 12px -2px rgba(239, 68, 68, 0.25); position: relative;
	overflow: hidden}
  .error-box: before, .error-box: after { content: '';
	position: absolute; inset: 0; pointer-events: none}
  .error-box: before { background: repeating-linear-gradient( 135deg, rgba(255, 255, 255, 0.15) 0 6px, transparent 6px 12px ); mix-blend-mode: overlay;
	opacity: 0.25}
  .error-box: after { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent); width: 60px;transform: translateX(-120%) skewX(-12deg); animation: sweep 4.2s linear infinite}
  .error-icon { font-size: 1.35rem; line-height: 1;
	filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.6)); animation: pulseErr 1.9s ease-in-out infinite}
  .error-title { font-weight: 600;
	color: #991b1b; letter-spacing: .5px; text-shadow: 0 0 4px rgba(239, 68, 68, 0.35)}
  .error-message { margin-top: .25rem; font-size: .875rem;
	color: #b91c1c}
  /* NES / N64 inspired dismiss button */ :global(.dismiss-btn) { --nes-border: #e11d48;
	position: relative; font-family: "Press Start 2P", ui-monospace, monospace; font-size: .55rem; letter-spacing: .5px; text-transform: uppercase;
	padding: .6rem .9rem .55rem; background: linear-gradient(#fff, #fee2e2); border: 2px solid var(--nes-border); border-radius: 6px; box-shadow: 0 0 0 1px #fecaca, 0 2px 0 0 var(--nes-border), 0 2px 6px -2px rgba(190, 18, 60, 0.55), inset 0 0 0 1px #fff; text-shadow: 0 0 4px rgba(254, 226, 226, 0.75); transition: transform 0.18s, box-shadow 0.25s, background 0.25s; will-change: transform;
	cursor: pointer}
  :global(.dismiss-btn:hover) { background: linear-gradient(#fff, #fecaca); transform: translateY(-2px); box-shadow: 0 0 0 1px #fecaca, 0 3px 0 0 var(--nes-border), 0 4px 12px -2px rgba(190, 18, 60, 0.55), inset 0 0 0 1px #fff}
  :global(.dismiss-btn:active) { transform: translateY(0); box-shadow: 0 0 0 1px #fda4af, 0 1px 0 0 var(--nes-border), 0 2px 6px -2px rgba(190, 18, 60, 0.55), inset 0 0 0 1px #fff}
  /* Scan + flicker */ .retro-scan { position: relative; }
  .retro-scan: before { content: '';
	position: absolute; inset: 0;
	background: repeating-linear-gradient( to bottom, rgba(0, 0, 0, 0.08) 0 2px, transparent 2px 4px ); mix-blend-mode: multiply;
	opacity: .35; animation: scanMove 9s linear infinite; pointer-events: none}
  .flicker { animation: flicker 4.5s linear infinite}
  @keyframes pulseErr { 0%; } 100% { transform: scale(1)} 50% { transform: scale(1.08);
	opacity: .85} }
  @keyframes sweep { 0% { transform: translateX(-120%) skewX(-12deg)} 60% { transform: translateX(160%) skewX(-12deg)} 100% { transform: translateX(160%) skewX(-12deg)} }
  @keyframes scanMove { 0% { transform: translateY(0)} 50% { transform: translateY(-6px)} 100% { transform: translateY(0)} }
  @keyframes flicker { 0%, 97%; } 100% { opacity: 1} 98% { opacity: .55} 99% { opacity: .85} }
  @media (prefers-reduced-motion: reduce) { .error-box: after, .error-icon, .retro-scan: before, .flicker:global(.dismiss-btn), :global(.dismiss-btn:hover) { animation: none !important; transition: none !important; }
  }
</style>




