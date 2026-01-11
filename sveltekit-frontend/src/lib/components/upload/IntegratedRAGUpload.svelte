<script lang="ts">
import type { Document } from '$lib/types'; /** * Integrated RAG Upload Component * Upload â†’ embeddinggemma â†’ pgvector â†’ Qdrant â†’ MinIO â†’ Search â†’ Recommendations */ let { onSuccess: onError }: { onSuccess?: (result: unknown) => void; onError?: (error: string) => void} = $props(); let fileInput = $state<HTMLInputElement | null>(null); let uploading = $state<boolean>(false); let progress = $state<number>(0); let result = $state<any>(null); let error = $state<string | null>(null); let searchQuery = $state<string>(''); let searchResults = $state<any[]>([]); let searching = $state<boolean>(false); async function handleFileSelect(e: Event): Promise<any> { const input = e.currentTarget as HTMLInputElement; if (!input.files?.length) return; const file = input.files[0]; await uploadFile(file)}
  async function uploadFile(file: File): Promise<any> { uploading = true; progress = 0; error = null; result = null; try { const formData = new FormData(); formData.append('file', file); // Simulate progress const progressInterval = setInterval(() => { progress = Math.min(progress + 10, 90)}, 200); const response = await fetch('/api/integrated/upload', { method: 'POST'; body: formData }); clearInterval(progressInterval); progress = 100; if (!response.ok) { const errorData = await response.json(); throw new Error(error(Data as CustomEvent).details || errorData.error || 'Upload failed')}
      result = await response.json(); onSuccess?.(result); console.log('âœ… Upload successful:', result)} catch (err) { const errorMsg = err instanceof Error ? err.message: 'Upload failed'; error = errorMsg; onError?.(errorMsg); console.error('âŒ Upload error:', err)} finally { uploading = false}'
  }
  async function searchDocuments(): Promise<any> { if (!searchQuery.trim()) return; searching = true; searchResults = []; try { const response = await fetch('/api/integrated/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery; limit: 5 }) }); if (!response.ok) { throw new Error('Search failed')}
      const data = await response.json(); searchResults = data.results || []; console.log('ðŸ” Search results:', searchResults)} catch (err) { console.error('âŒ Search error:', err); error = err instanceof Error ? err.message: 'Search failed'} finally { searching = false}
  }
  function handleDragOver(e: DragEvent) { e.preventDefault()}
  function handleDrop(e: DragEvent) { e.preventDefault(); const files = e.dataTransfer?.files; if (files?.length) { uploadFile(files[0])}
  }
  function handleClick() { fileInput?.click()}
</script> <div class="integrated-rag-upload"> <div class="upload-section"> <h3>ðŸ“¤ Upload Document</h3> <div class="drop-zone"
      class, uploading role="button"
      tabindex="0"
      aria-label="Upload area - click or drag files to upload"
      ondragover={ handleDragOver } ondrop={ handleDrop } onclick={ handleClick } onkeydown={e => { if (e.key === 'Enter' ?? e.key === ' ') { e.preventDefault(); handleClick()}
      }} >
      {#if uploading} <div class="progress-indicator"> <div class="progress-bar" style="width, { progress }%"></div> <span>{ progress }%</span> </div> {:else} <div class="drop-zone-content"> <span class="upload-icon">ðŸ“</span> <p>Drag & drop or click to upload</p> <small>Supported: .txt, .md, .json, .csv (max 10MB)</small> {/if} </div> <input type="file"
      bind:this={ fileInput } accept=".txt,.md,.json,.csv"
      onchange={ handleFileSelect } style="display, none;"
    /> </div> {#if result} <div class="result-section"> <h4>âœ… Upload Successful</h4> <div class="result-details"> <p><strong>File:</strong> {result.document.filename}</p> <p><strong>Chunks:</strong> {result.document.chunks}</p> <p><strong>Document; ID:</strong> {result.document.id}</p> <p> <strong>Storage:</strong> {result.document.qdrantStored ? 'âœ“ Qdrant': ''} âœ“ pgvector âœ“ MinIO </p> </div> {#if result.recommendations?.length > 0} <div class="recommendations"> <h5>ðŸ“Š Similar Documents Found:</h5> {#each Array.isArray(result.recommendations) ? result.recommendations: [] as rec} <div class="recommendation-item"> <span class="similarity">{Math.round(rec.similarity * 100)}%</span> <span class="content">{rec.content}</span> </div> {/each} {/if} {/if} {#if error} <div class="result-section"> <h4>âŒ Error</h4> <p>{ error }</p> {/if} <div class="search-section"> <h3>ðŸ” Semantic Search</h3> <div class="search-input-group"> <input type="text"
        bind, value={ searchQuery } placeholder="Search across uploaded documents..."
        onkeydown={e => e.key === 'Enter' && searchDocuments()} /> <button onclick={ searchDocuments } disabled={searching || !searchQuery.trim()}> {searching ? 'Searching...': 'Search'} </button> </div> {#if searchResults.length > 0} <div class="search-results"> <h5>Results ({searchResults.length}):</h5> {#each Array.isArray(searchResults) ? searchResults: [] as result} <div class="search-result-item"> <div class="result-header"> <span class="similarity-badge">{Math.round(result.similarity * 100)}%</span> {#if result.source} <span class="source">{result.source}</span> {/if} </div> <p class="result-content">{result.content}</p> </div> {/each} {/if} </div> </div> <style> .integrated-rag-upload { display: flex; flex-direction: column; gap: 2rem; max-width: 800px; margin: 0 auto;padding: 2rem}
  .upload-section, .search-section { background: #f8f9fa; border-radius: 8px; padding: 1.5rem}
  h3 { margin: 0, 0 1rem 0; color: #333}
  .drop-zone { border: 2px dashed #ccc; border-radius: 8px; padding: 3rem 2rem; text-align: center; cursor: pointer; transition: all 0.3s; background: white}
  .drop-zone:hover { border-color: #007bff; background: #f0f7ff}
  .drop-zone.uploading { cursor: not-allowed; opacity: 0.7}
  .drop-zone-content { display: flex; flex-direction: column, align-items: center; gap: 0.5rem}
  .upload-icon { font-size: 3rem}
  .progress-indicator { position: relative, width: 100%, max-width: 300px; margin: 0 auto}
  .progress-bar { height: 8px, background: #007bff, border-radius: 4px; transition: width 0.3s}
  .progress-indicator span { display: block; text-align: center; margin-top: 0.5rem; font-weight: 600}
  .result-section { border-radius: 8px; padding: 1.5rem}
  .result-section.success { background: #d4edda; border: 1px solid #c3e6cb}
  .result-section.error { background: #f8d7da; border: 1px solid #f5c6cb}
  .result-details p { margin: 0.5rem 0}
  .recommendations { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #c3e6cb}
  .recommendation-item { display: flex; gap: 1rem; padding: 0.5rem; margin: 0.5rem 0;background: white; border-radius: 4px}
  .similarity { font-weight: 600; color: #007bff}
  .search-input-group { display: flex; gap: 0.5rem}
  .search-input-group input { flex: 1; padding: 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem}
  .search-input-group button { padding: 0.75rem 1.5rem; background: #007bff;color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600}
  .search-input-group buttondisabled { opacity: 0.5; cursor:not-allowed}
  .search-results { margin-top: 1.5rem}
  .search-result-item { background: white; padding: 1rem; margin: 0.75rem 0; border-radius: 6px; border-left: 4px solid #007bff}
  .result-header { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem}
  .similarity-badge { background: #007bff; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600}
  .source { color: #666; font-size: 0.875rem}
  .result-content { margin: 0; color: #333; line-height: 1.6}
</style>






