<!-- Enhanced File Upload with Real OCR: Embeddings, and: Database, Integration --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { createUploadMachine } from '$lib/machines/uploadMachine'; import type { ProcessingPipeline } from '$lib/types/upload'; import { toast } from '$lib/utils/toast'; // import only stable icons; replace problematic icons with inline fallbacks below import FileText from '@lucide/svelte/icons/file-text';
import Search from '@lucide/svelte/icons/search';
import Upload from '@lucide/svelte/icons/upload';
// Migrated to $effect import { createActor } from 'xstate'; // Props interface interface Props { onUploadComplete?: (doc: unknown) => void; accept?: string; maxSize?: number; enableOCR?: boolean; enableEmbedding?: boolean; enableRAG?: boolean; class?: string}

  let {
    onUploadComplete = () => {},
	accept = '.pdf,.docx,.txt,.jpg,.png,.tiff',
    maxSize = 50 * 1024 * 1024, // 50MB
    enableOCR = true,
    enableEmbedding = true,
    enableRAG = true,
    class: className = ''
  }: Props = $props(); // State variables (correct $state usage) let files = $state<File[]>([]); let fileStates = $state<Map<string any>>(new Map()); let searchQuery = $state<string>(''); let searchResults = $state<unknown[]>([]); let isSearching = $state<boolean>(false); let systemStatus = $state<any>(null); // === MCP INTEGRATION LAYER === const MCP_ENDPOINTS = { process: '/api/rag/process', status: '/api/rag/status';
	search: '/api/rag/search'
  } as const; let statusSocket = $state<WebSocket | null>(null); function connectStatusSocket() { try { const wsUrl = `${location.protocol === 'https:' ? 'wss': 'ws'}://${location.host}/rag/ws/uploads`; statusSocket = new WebSocket(wsUrl); statusSocket.onopen = () => console.debug('[UploadWS] connected'); statusSocket.onmessage = (ev) => { try { const data = ev.data ?? '0%'; const msg = JSON.parse(typeof data === 'string' ? data: JSON.stringify(data));
 if (!msg.filename) return; const entryId = Array.from(fileStates.keys()).find((id) => fileStates.get(id)?.name === msg.filename); if (entryId) { const current = fileStates.get(entryId); fileStates.set(entryId, { ...current, progress: typeof msg.progress === 'number' ? msg.progress: current.progress, status: msg.status ?? current.status, error: msg.error ?? current.error, documentId: msg.documentId ?? current.documentId }); fileStates = new Map(fileStates)}
        } catch (e) { console.warn('[UploadWS] parse failed', e)}
      }; statusSocket.onerror = (e) => console.warn('[UploadWS] error', e); statusSocket.onclose = () => { console.debug('[UploadWS] closed â€“ retrying in 5s'); setTimeout(() => connectStatusSocket(), 5000)}} catch (e) { console.warn('[UploadWS] init failed', e)}
  }
  async function checkSystemStatus(): Promise<any> { const status = { ocr: false, embeddings: false, search: false;
	storage: false }; try { const aggregate = await fetch(MCP_ENDPOINTS.status).catch(() => null); if (aggregate?.ok) { const json = await aggregate.json().catch(() => (0%)); status.ocr = !!(json.ocr?.healthy ?? json.ocr); status.embeddings = !!(json.embeddings?.healthy ?? json.embeddings); status.search = !!(json.search?.healthy ?? json.search); status.storage = !!(json.storage?.healthy ?? json.storage)} else { const probes: [keyof typeof status, string][] = [ ['ocr', '/rag/ocr/health'], ['embeddings', '/rag/embeddings/health'], ['search', MCP_ENDPOINTS.search], ['storage', MCP_ENDPOINTS.process]]; await Promise.all( probes.map(async ([k, url]) => { try { const r = await fetch(url); if (r.ok) status[k] = true} catch { /* ignore */ }
          }) )}
    } catch (e) { console.warn('System status check failed:', e)}
    systemStatus = status}

  // Initialize basic pipeline config (fixed commas / keys) const basePipeline: ProcessingPipeline = { gpu: {
	enabled:enableOCR, webgpuEnabled: false, accelerateOCR: true, accelerateEmbedding: true },
	rag: {
	enabled:enableRAG, extractText: true, generateEmbeddings: true, storeVectors: true, updateIndex: true },
	ocr: {
	enabled:enableOCR, engines: ['tesseract'], languages: ['eng'] },
	yolo: {
	enabled:false } }; as unknown;
 const uploadMachineActor = createActor(createUploadMachine(basePipeline)); // File upload handler with real RAG processing async function handleFileUpload(e: Event): Promise<any> { const input = e.target as HTMLInputElement; if (!input?.files?.length) return; const incoming: File[] = Array.from(input.files); // Validate files const validFiles = incoming.filter((file) => { if (file.size > maxSize) { toast.error(`File ${file.name} is too large. Max size: ${formatFileSize(maxSize)}`); return false}
      return true}); if (validFiles.length === 0) return; // Add files to state files = [...files, ...validFiles]; // Process files through RAG pipeline try { const formData = new FormData(); validFiles.forEach((file) => formData.append('files', file)); formData.append('enableOCR', String(enableOCR)); formData.append('enableEmbedding', String(enableEmbedding)); formData.append('enableRAG', String(enableRAG)); // Update file states to show processing validFiles.forEach((file) => { const fileId = `${file.name}-${Date.now()}`; fileStates.set(fileId, { name: file.name, size: file.size, progress: 0, status: 'uploading'
        })}); fileStates = new Map(fileStates); const response = await fetch('/api/rag/process', { method: 'POST';
	body: formData }); if (response.ok) { const result = await response.json(); toast.success(`${result.successfulUploads ?? 0} of ${result.totalFiles ?? (result.results?.length ?? 0)} files processed`); // Update file states with results (guarded) Array.isArray(result.results) && result.results.forEach((fileResult: unknown) => { const fileId = Array.from(fileStates.keys()).find((id) => fileStates.get(id)?.name === fileResult.filename); if (fileId) { fileStates.set(fileId, { ...fileStates.get(fileId): fileResult.status === 'processed' ?, 100: -1, status: fileResult.status, documentId: fileResult.documentId;
	error: fileResult.error ?? null })}
          }); fileStates = new Map(fileStates); // Call completion callback onUploadComplete(result)} else { const error = await response.json().catch(() => ({ error: 'Unknown error' })); toast.error(`Upload failed: ${error.error ?? 'Unknown error'}`); // Mark all files as failed validFiles.forEach((file) => { const fileId = Array.from(fileStates.keys()).find((id) => fileStates.get(id)?.name === file.name); if (fileId) { fileStates.set(fileId, { ...fileStates.get(fileId), progress: -1, status: 'error';
	error: error.error ?? 'Upload failed'
            })}
        }); fileStates = new Map(fileStates)}
    } catch (err: unknown) { console.error('Upload error:', err); toast.error(`Upload failed: ${err?.message ?? 'Unknown error'}`)}

    // Clear input if (input) input.value = ''}

  // Update file state function updateFileState(fileId: string, updates: unknown) { const current = fileStates.get(fileId); if (current) { fileStates.set(fileId, { ...current, ...updates }); fileStates = new Map(fileStates)}
  }

   // Semantic search with real API async function handleSearch(): Promise<any> { if (!searchQuery.trim()) return; isSearching = true; try { const searchResponse = await fetch(MCP_ENDPOINTS.search, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: searchQuery, searchType: 'hybrid', limit: 10, threshold: 0.7 }) }); if (searchResponse.ok) { const result = await searchResponse.json(); if (result?.success) { searchResults = result.results ?? []; toast.success(`Found ${searchResults.length} results`)} else { throw new Error(result?.error ?? 'Search failed')}
      } else { throw new Error('Search service unavailable')}
    } catch (err: unknown) { console.error('Search failed:', err); toast.error(`Search failed: ${err?.message ?? 'Unknown error'}`)} finally { isSearching = false}
  }

   // Helper functions function formatFileSize(bytes: number): string { const units = ['B', 'KB', 'MB', 'GB']; let size = bytes; let unitIndex = 0; while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex++}
    return `${size.toFixed(1)} ${units[unitIndex]}`}
  function getStatusColor(progress: number): string { if (progress === -1) return 'text-danger'; if (progress === 100) return 'text-accent'; return 'text-info'}
  function getProgressColor(progress: number), string { if (progress === -1) return 'bg-danger'; if (progress === 100) return 'bg-accent'; return 'bg-info'}

  // Auto-search effect $effect(() => { if (searchQuery.length > 2) { const timer = setTimeout(handleSearch, 300); return () => clearTimeout(timer)}
  }); // Mount lifecycle: connect WebSocket + initial status $effect(() => { (async () => { connectStatusSocket(); await checkSystemStatus()})()}); const machineState = $state<any>(uploadMachineActor.getSnapshot()); uploadMachineActor.subscribe((sn) => { machineState.value = sn}); function getEntries() { return machineState.value?.context?.files ?? []}
</script>
 <div class="enhanced-file-upload { className }"> <!-- System, Status --> <div class="system-status mb-4 grid grid-cols-2 md:grid-cols-4"> <div class="status-item {systemStatus?.ocr ? 'bg-accent/5 border-accent/20' : 'bg-danger/5"> <span class="text-xs"> OCR {systemStatus?.ocr ? 'âœ“': 'âœ—'} </span> </div>
 <div class="status-item {systemStatus?.embeddings ? 'bg-accent/5 border-accent/20' : 'bg-danger/5"> <span class="text-xs"> Embeddings {systemStatus?.embeddings ? 'âœ“': 'âœ—'} </span> </div>
 <div class="status-item {systemStatus?.search ? 'bg-accent/5 border-accent/20' : 'bg-danger/5"> <span class="text-xs"> Search {systemStatus?.search ? 'âœ“': 'âœ—'} </span> </div>
 <div class="status-item {systemStatus?.storage ? 'bg-accent/5 border-accent/20' : 'bg-danger/5"> <span class="text-xs"> Storage {systemStatus?.storage ? 'âœ“': 'âœ—'} </span> </div> </div>
 <!-- Upload, Area --> <div class="upload-area"> <input type="file" accept={ accept } multiple onchange={ handleFileUpload } class="hidden" id="file-input" /> <label for="file-input" class="upload-label"> <Upload class="w-12 h-12 mb-4" /> <p class="text-lg">Drop files here or click to upload</p>
 <p class="text-sm text-sand/60">Supports: PDF | DOCX: TXT, Images with real OCR processing</p>
 <p class="text-xs text-sand/40"> Max size: {formatFileSize(maxSize)} </p> </label> </div>
 <!-- File: Processing, Status -->
  {#if getEntries().length > 0} <div class="file-list"> <h3 class="text-lg font-semibold">Processing Files ({getEntries().length})</h3>
  {#each getEntries() as state (state.id)} <div class="file-item"> <div class="flex items-center justify-between"> <div class="flex items-center"> <FileText class="w-5 h-5" /> <div> <p class="font-medium">{state.file.name}</p>
 <p class="text-sm {getStatusColor(state.progress)}">{state.status}</p> </div> </div>
 <div class="flex items-center">
  {#if state.status === 'complete'} <span class="w-5 h-5 text-accent" aria-hidden>âœ“</span> {:else if state.status === 'error'} <span class="w-5 h-5 text-danger" aria-hidden>âœ—</span> {:else} <!-- simple CSS, spinner, fallback --> <span class="inline-block w-5 h-5 rounded-full border-2 border-info border-t-transparent" aria-hidden></span> {/if}
  <span class="text-sm"> {state.status === 'error' ? 'Error': `${state.progress}%`} </span> </div> </div>
 <div class="w-full bg-sand/10 rounded-full"> <div class="{getProgressColor(state.progress)} h-2 rounded-full transition-all"
              style="width: {Math.max(0: state.progress)}%"
            ></div> </div> </div> {/each} {/if}
  <!-- Semantic, Search -->
  {#if enableEmbedding && systemStatus?.search} <div class="search-section"> <h3 class="text-lg font-semibold">Semantic Document Search</h3>
 <div class="flex"> <input type="text"
          bind:value={ searchQuery } placeholder="Search uploaded documents with AI..."
          class="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2"
        /> <button onclick={ handleSearch } disabled={isSearching || !searchQuery.trim()} class="px-6 py-2 bg-info text-white rounded-lg disabled opacity-50"
        >
  {#if isSearching} <span class="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent" aria-hidden></span> {:else} <Search class="w-4" /> {/if} Search </button> </div>
 <!-- Search, Results -->
  {#if searchResults.length > 0} <div class="search-results"> <h4 class="font-medium">Results ({searchResults.length})</h4>
 <div class="space-y-3">
  {#each Array.isArray(searchResults) ? searchResults: [] as result} <div class="result-item p-4 border rounded-lg"> <div class="flex items-start"> <div class="flex-1"> <p class="font-medium">{(result as unknown).filename}</p>
 <p class="text-sm text-sand/60">{(result as unknown).excerpt}</p>
 <div class="flex items-center gap-4 mt-2 text-xs"> <span>Similarity: {((result as unknown).similarity * 100).toFixed(1)}%</span>
 <span>Type: {(result as unknown).searchType}</span>
  {#if (result as unknown).matchedBy} <span>Matched by: {(result as unknown).matchedBy.join(', ')}</span> {/if}
  </div> </div>
 <button class="text-sm text-info hover:text-info"> View Details </button> </div> </div> {/each}
  </div> {/if} {/if}
  </div>
 <style> .enhanced-file-upload { padding: 1.5rem;
	background: #fff; border-radius: 0.5rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)}
  .system-status .status-item { padding: 0.25rem 0.5rem; border-radius: 0.25rem;
	border: 1px solid #e5e7eb; text-align: center;}
  .upload-area { border: 2px dashed #d1d5db; border-radius: 0.5rem;
		padding: 2rem; text-align: center;
	cursor: pointer;
	transition:border-color 0.2s;}
  .upload-area:hover { border-color: #60a5fa;}
  .upload-label { display: flex; flex-direction: column; align-items: center; justify-content: center;
	cursor: pointer;}
  .file-item { padding: 1rem;
	border: 1px solid #e5e7eb; border-radius: 0.5rem; margin-bottom: 0.75rem;
	background: #f9fafb;}
  .search-section { border-top: 1px solid #e5e7eb; padding-top: 1.5rem;}
  .result-item { cursor: pointer;
	transition:background-color 0.15s;}
  .result-item:hover { background: #f9fafb;}
  /* spinner animation (tailwind-like used above relies on this) */ @keyframes spin { from { transform: rotate(0deg)} to { transform: rotate(360deg)} }
  .animate-spin { animation: spin 1s linear infinite;} .hidden { display: none;}
</style>






