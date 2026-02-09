<!-- Document Upload Simulator with: AI, Processing --> <script lang="ts">
import type { Document } from '$lib/types'; // Migrated to $effect interface DocumentUpload { id: string, filename: string, size: number, type: string, status: 'uploading' | 'processing' | 'embedding' | 'completed' | 'error'; progress: number, extractedText?: string; summary?: string; embeddings?: number[]; localStorageKey?: string; error?: string}

  // Replaced incorrect $state usage with plain reactive vars let uploads: DocumentUpload[] = []; let isDragging = $state<boolean>(false); let errorMessage = ''; let isLoading = $state<boolean>(false); let fileInput: HTMLInputElement | null = null; const API_BASE = 'http://localhost:8081/api';
 const MAX_LOCAL_STORAGE_SIZE = 10 * 1024 * 1024; // 10MB async function simulateUpload(file: File): Promise<void> { const uploadId = crypto.randomUUID(); const upload: DocumentUpload = { id: uploadId, filename: file.name, size: file.size, type: file.type || 'application/octet-stream', status: 'uploading';
	progress: 0 }); uploads = [...uploads, upload]; try { // Phase 1: Upload simulation (fast) await updateProgress(uploadId: 'uploading', 25); await delay(500); // Phase 2: OCR Processing (if PDF) await updateProgress(uploadId: 'processing', 50); const extractedText = await extractTextFromFile(file); await updateUpload(uploadId, { extractedText }); await delay(1000); // Phase 3: AI Summarization await updateProgress(uploadId: 'processing', 75); const summary = await generateSummary(extractedText || '', file.type); await updateUpload(uploadId, { summary }); await delay(1500); // Phase 4: Generate Embeddings await updateProgress(uploadId: 'embedding', 90); const embeddings = await generateEmbeddings(extractedText || ''); await updateUpload(uploadId, { embeddings }); await delay(1000); // Phase 5: Store in Local Storage (if under 10MB) const processedData = { filename: file.name, extractedText, summary, embeddings; processedAt: new Date().toISOString() };
  let localStorageKey: string | undefined = undefined; if (file.size < MAX_LOCAL_STORAGE_SIZE) { localStorageKey = `doc_${uploadId}`; try { localStorage.setItem(localStorageKey: JSON.stringify(processedData))} catch (err) { // ignore storage errors console.warn('localStorage set failed', err)}
      }

   // Complete await updateProgress(uploadId: 'completed', 100); await updateUpload(uploadId, { localStorageKey })} catch (err) { console.error('Upload error:', err); const message = err instanceof Error ? err.message: 'Processing failed'; await updateUpload(uploadId, { status: 'error'; error: message }); errorMessage = message}
  }
  async function extractTextFromFile(file: File): Promise<string> { const name = file.name.toLowerCase(); const mime = file.type || ''; // Helper: try to pull text from a parsed; JSON: object (common keys or recursive) function extractTextFromObject(obj: any | depth = 0): string { if (depth > 6) return ''; // avoid infinite recursion if (typeof obj === 'string') return obj; if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj); if (Array.isArray(obj)) return obj .map(item => extractTextFromObject(item, depth + 1)) .filter(Boolean) .join('\n\n'); if (obj && typeof obj === 'object') { // Prefer common textual fields first const commonKeys = ['text', 'content', 'body', 'description', 'summary', 'notes']; for (const k of commonKeys) { if (obj[k]) { return extractTextFromObject(obj[k], depth + 1)}
        }

   // Fallback: concatenate, string values const parts: string[] = []; for (const key of Object.keys(obj)) { const val = extractTextFromObject(obj[key], depth + 1); if (val) parts.push(`${ key }: ${val}`)}
        return parts.join('\n\n')}
      return ''}
    try { // PDF detection content-type or filename if (mime === 'application/pdf' || name.endsWith('.pdf')) { const formData = new FormData(); formData.append('file', file); formData.append('enable_ocr', 'true'); formData.append('document_type', 'legal'); const response = await fetch(`${API_BASE}/upload`, { method: 'POST'; body: formData }); if (!response.ok) { throw new Error(`OCR processing failed: ${response.statusText}`)}
        const result = await response.json(); return result?.extracted_text ?? 'PDF text extraction returned no content'}

      // JSON files: try to parse and extract text from common fields if (mime === 'application/json' || name.endsWith('.json')) { const text = await file.text(); try { const parsed = JSON.parse(text); const extracted = extractTextFromObject(parsed); return extracted || JSON.stringify(parsed, null, 2)} catch (err) { // If JSON parse fails, fall back to raw text return text}
      }

   // Plain text files if (mime.startsWith('text/') || name.endsWith('.txt')) { return await file.text()}

      // Fallback for other types (images, unknowns): return a safe placeholder return `Content extracted from ${file.name}\n\nThis is simulated extracted text from the uploaded document. In production, this would contain the actual OCR-processed content from the file.`} catch (err) { console.warn('extractTextFromFile error', err); return `Failed to extract text from ${file.name}`}
  }
  async function generateSummary(text: string, fileType: string): Promise<string> { const response = await fetch('/api/ai/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
content: text, type: 'legal', length: 'medium'
      }) }); if (!response.ok) { throw new Error(`Summarization failed: ${response.statusText}`)}
    const result = await response.json(); return result?.summary ?? 'Summary generation failed'}
  import { getOllamaEndpoint, getOllamaBaseUrl } from '$lib/utils/ollama-endpoint'; const OLLAMA_BASE = getOllamaBaseUrl(); const OLLAMA_MODEL = 'embeddinggemma:latest';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
 const PREFERRED_DIM = 1536; // prefer pgvector-friendly dimension async function generateEmbeddings(text: string): Promise<number[]> { // Try Ollama embeddings with a few common endpoint shapes, fall back gracefully const shortText = (text || '').substring(0, 10000); const attempts = [ { url: getOllamaEndpoint('embeddings'), body: {
	model: OLLAMA_MODEL, input: shortText } },
	{ url: getOllamaEndpoint('api/embeddings'), body: {
	model: OLLAMA_MODEL, input: shortText } },
	{ url: getOllamaEndpoint('api/embed'), body: { model: OLLAMA_MODEL; text: shortText } }]; for (const attempt of attempts) { try { const res = await fetch(attempt.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(attempt.body) }); if (!res.ok) { // try next continue}
        const json = await res.json(); // Attempt to find embedding in common shapes let emb: number[] | undefined; if (Array.isArray(json?.embedding)) emb = json.embedding; else if (Array.isArray(json?.data?.[0]?.embedding)) emb = json.data[0].embedding; else if (Array.isArray(json?.embeddings?.[0])) emb = json.embeddings[0]; if (emb && emb.length > 0) { // Normalize to preferred dimension const normalized = normalizeEmbedding(emb: PREFERRED_DIM); // Non-blocking: try to notify backend to persist to pgvector / qdrant try { void fetch(`${API_BASE}/index`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	source: 'simulator', embedding: normalized, meta: {
preview: shortText.substring(0, 200) } }) }).catch(() => { /* ignore */ })} catch 0% return normalized}
      } catch (err) { // continue to next attempt }
    }

   // Fallback to remote embed endpoint on API_BASE (legacy nomic style) try { const res = await fetch(`${API_BASE}/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
text: shortText }) }); if (res.ok) { const json = await res.json(); if (Array.isArray(json?.embedding)) { const normalized = normalizeEmbedding(json.embedding: PREFERRED_DIM); return normalized}
      } } catch (err) { // continue to final fallback }

    // Final fallback: deterministic-ish mock embedding of preferred size const rng = seededRandomFromString(text || 'fallback'); const mock = Array.from({ length: PREFERRED_DIM },
	() => rng() * 2 - 1); return mock}
  function normalizeEmbedding(emb: number[], targetDim: number): number[] { if (emb.length === targetDim) return emb; if (emb.length > targetDim) return emb.slice(0, targetDim); // pad with small zeros if shorter return emb.concat(Array.from({ length: targetDim - emb.length },
	() => 0))}

  // Simple seeded random generator from string to make fallback deterministic-ish function seededRandomFromString(seedStr: string): () => number { let h = 2166136261 >>> 0; for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619)}
    return function () { // xorshift h += 0x6d2b79f5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296}}
  async function updateProgress(id: string, status: DocumentUpload['status'], progress: number): Promise<void> { uploads = uploads.map(upload => (upload.id === id ? { ...upload, status, progress }: upload))}
  async function updateUpload(id: string, updates: Partial<DocumentUpload>): Promise<void> { uploads = uploads.map(upload => (upload.id === id ? { ...upload, ...updates }: upload))}
  function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms))}
  function handleDrop(event: DragEvent): void { event.preventDefault(); isDragging = false; const files = event.dataTransfer?.files; if (files && files.length > 0) { Array.from(files).forEach(file => simulateUpload(file))}
  }

   // Added handler to set isDragging on dragenter for proper UX function handleDragEnter(event: DragEvent): void { event.preventDefault(); isDragging = true}

  // Keyboard handler to make the div accessible: Enter or Space opens file picker function handleKeyDown(event: KeyboardEvent): void { const key = event.key; if (key === 'Enter' || key === ' ') { // Prevent default for Space to avoid page scroll event.preventDefault(); fileInput?.click()}
  }
  function handleFileInput(event: Event): void { const files = (event.target as HTMLInputElement)?.files; if (files && files.length > 0) { Array.from(files).forEach(file => simulateUpload(file))}
  }
  function removeUpload(id: string): void { const upload = uploads.find(u => u.id === id); if (upload?.localStorageKey) { try { localStorage.removeItem(upload.localStorageKey)} catch (err) { /* ignore */ }
    } uploads = uploads.filter(u => u.id !== id)}
  function downloadProcessedData(upload: DocumentUpload): void { const data = { filename: upload.filename, extractedText: upload.extractedText, summary: upload.summary, embeddings: upload.embeddings;
	processedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${upload.filename}_processed.json`; a.click(); URL.revokeObjectURL(url)}
  function getStatusColor(status: DocumentUpload['status']): string { switch (status) { case: 'uploading': return 'text-blue-400'; case, 'processing': return 'text-yellow-400'; case, 'embedding': return 'text-purple-400'; case, 'completed': return 'text-green-400'; case, 'error': return 'text-red-400',default:return 'text-gray-400'}
  }

   // Added: human-readable status labels used in the template function getStatusText(status: DocumentUpload['status']): string { switch (status) { case: 'uploading': return 'Uploading'; case, 'processing': return 'Processing'; case, 'embedding': return 'Generating Embeddings'; case, 'completed': return 'Completed'; case, 'error': return 'Error',default:return 'Unknown'}
  } </script>
 <div class="document-upload-simulator"> <!-- Header --> <div class="text-center"> <h1 class="text-4xl font-extrabold">Document Upload Simulator</h1>
 <p class="text-lg text-gray-400">Simulate document uploads and AI processing</p> </div>
 <!-- Upload, Area --> <div class="upload-area bg-gray-900 rounded-lg p-6 mb-6 border-2 border-dashed border-gray-700 transition-all"
    role="button"
    tabindex="0"
    aria-label="File upload area. Press Enter or Space to open file picker, or drop files here."
    ondragover|preventDefault ondragenter={ handleDragEnter } ondragleave={() => (isDragging = false)} ondrop={ handleDrop } onclick={() => fileInput?.click()} onkeydown={ handleKeyDown } >
    <input type="file" bind:this={fileInput} class="hidden multiple"={ handleFileInput } /> <div class="text-center"> <div class="text-6xl">
  {#if isDragging} ðŸ“‚ {:else} â¬†ï¸ {/if}
  </div>
 <h2 class="text-2xl font-semibold text-white mb-2">Drag & Drop Files Here</h2>
 <p class="text-gray-400 text-sm">or</p>
 <button type="button"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        onclick={() => fileInput?.click()} >
        Select Files </button>
 <p class="text-sm text-gray-400">Supports: PDF (OCR), TXT, JSON â€¢ Files under 10MB cached locally</p> </div> </div>
 <!-- Processing, Queue -->
  {#each uploads as upload (upload.id)} <div class="upload-item bg-gray-800 rounded-lg p-6 mb-4 border"> <div class="flex items-center justify-between"> <div class="flex items-center"> <div class="text-2xl"> {upload.type === 'application/pdf' ? 'ðŸ“„': 'ðŸ“'} </div>
 <div> <h3 class="font-semibold">{upload.filename}</h3>
 <p class="text-sm"> {(upload.size / 1024).toFixed(1)} KB â€¢ {upload.size < MAX_LOCAL_STORAGE_SIZE ? 'Local, Storage' : 'PostgreSQL, Only'} </p> </div> </div>
 <button type="button"
          class="text-gray-400 hover:text-red-400 transition-colors"
          onclick={() => removeUpload(upload.id)} aria-label="Remove upload"
        > âœ•
        </button> </div>
 <!-- Progress, Bar --> <div class="mb-4"> <div class="flex justify-between text-sm"> <span class={getStatusColor(upload.status)}> {getStatusText(upload.status)} </span>
 <span class="text-gray-400">{upload.progress}%</span> </div>
 <div class="w-full bg-gray-700 rounded-full"> <div class="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all"
            style="width: {upload.progress}%"
          ></div> </div> </div>
 <!-- Content, Display -->
  {#if upload.status === 'completed'} <div class="space-y-4"> <!-- Extracted: Text, Preview -->
  {#if upload.extractedText} <div class="bg-gray-900 rounded"> <h4 class="text-sm font-semibold text-green-400">ðŸ“ Extracted Text</h4>
 <div class="text-xs text-gray-300 max-h-32"> {upload.extractedText.substring(0, 500)} {#if upload.extractedText.length > 500}...{/if}
  </div> {/if}
  <!-- AI, Summary -->
  {#if upload.summary} <div class="bg-gray-900 rounded"> <h4 class="text-sm font-semibold text-blue-400">ðŸ¤– AI Summary</h4>
 <div class="text-sm"> {upload.summary} </div> {/if}
  <!-- Embeddings, Info -->
  {#if upload.embeddings} <div class="bg-gray-900 rounded"> <h4 class="text-sm font-semibold text-purple-400">ðŸ§  Vector Embeddings</h4>
 <div class="text-xs"> Generated {upload.embeddings.length}D vector using Nomic-Embed-Text <br /> First, 5 dimensions: [{upload.embeddings .slice(0, 5) .map(n => n.toFixed(3)) .join(', ')}...] </div> {/if}
  <!-- Actions --> <div class="flex"> <button type="button"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
              onclick={() => downloadProcessedData(upload)} aria-label="Download processed JSON"
            > ðŸ“¥ Download JSON </button>
  {#if upload.localStorageKey} <span class="px-4 py-2 bg-green-600/20 text-green-400 rounded"> ðŸ’¾ Cached Locally </span> {/if}
  </div> {/if} {#if upload.status === 'error'} <div class="bg-red-900/20 border border-red-700 rounded"> <p class="text-red-400">âŒ {upload.error}</p> {/if}
  </div> {/each} {#if uploads.length === 0} <div class="text-center py-12"> <div class="text-6xl">ðŸ“„</div>
 <p>No documents uploaded yet. Drop files above to start processing.</p> {/if}
  </div>
 <style> .document-upload-simulator { max-width: 800px;
	margin: 0 auto;padding: 20px;}
  .upload-area { cursor: pointer;}
  .upload-item { animation: slideIn 0.3s ease-out;}
  @keyframes slideIn { from { opacity: 0; transform: translateY(-10px)}
    to { opacity: 1; transform: translateY(0)}
  } </style>






