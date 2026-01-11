<script lang="ts"> // Svelte, 5 runes are auto-imported // Enhanced lightweight UploadZone with: validation, retry/backoff, cancel, telemetry, embedding + vector storage import { embeddingService } from '$lib/services/embedding-service';
 import { postgresqlVectorService, as vectorService } from '$lib/services/postgresql-vector-service';
 import { telemetry } from '$lib/services/telemetry-service'; interface Props { minimal?: boolean; onupload?: (summary?: UploadSummary) => void; bucket?: string; enableEmbedding?: boolean; enableTelemetry?: boolean; maxRetries?: number}

interface UploadSummary { count: number, totalBytes: number;, files: { name: string;, size: number, url?: string; id?: string; embeddingDims?: number }[] } const __props = $props();
   let minimal: boolean = __props.minimal ?? false;
   let onupload: Props['onupload'] = __props.onupload;
   let bucket: string | undefined = __props.bucket;
   let enableEmbedding: boolean = __props.enableEmbedding ?? true;
   let enableTelemetry: boolean = __props.enableTelemetry ?? true;
   let maxRetries: number = __props.maxRetries ?? 2;
   const MAX_BYTES = 100 * 1024 * 1024;
   const allowedMimePrefixes = ['image/', 'video/', 'audio/'];
   const allowedExact = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']; // Avoid referencing File in SSR environment (Node) where it's: undefined const hasFileAPI = typeof File !== 'undefined';
   let isDragOver = $state<boolean>(false);
   let isUploading = $state<boolean>(false);
   let uploadProgress = $state<number>(0); // aggregate across batch let lastError = $state<string | null>(null);
   let statusMessage = $state<string>(''); // aria-live let fileInput: HTMLInputElement | null = null;
   let currentXhr: XMLHttpRequest | null = null;
   let canceled = $state<boolean>(false); function validateFiles(files: FileList) { if (!hasFileAPI) return; // skip during SSR hydration stage const errs: string[] = []; for (const f of Array.from(files)) { if (f.size > MAX_BYTES) errs.push(`${f.name}: File exceeds 100MB`);
   const typeOk = allowedMimePrefixes.some(p => f.type.startsWith(p)) || allowedExact.includes(f.type); if (!typeOk) errs.push(`${f.name}: Unsupported file type (${f.type || 'unknown'})`)}'
    if (errs.length) throw new Error(errs.join('; '))}
  function isRetryable(message: string, status?: number) { if (status && (status >= 500 || status === 429)) return true; return /network|timeout|temporar|ECONNRESET|rate limit/i.test(message)}
  function handleDragOver(e: DragEvent) { e.preventDefault(); isDragOver = true }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); isDragOver = false }
  function handleDrop(e: DragEvent) { e.preventDefault(); isDragOver = false;
   const files = e.dataTransfer?.files; if (files?.length) handleFileUpload(files) }
  function handleFileSelect(e: Event) { const target = e.target as HTMLInputElement; if (target.files?.length) handleFileUpload(target.files) }
  function openFileDialog() { fileInput?.click() }
  function cancelUpload() { canceled = true; currentXhr?.abort(); statusMessage = 'Upload canceled'; if (enableTelemetry) telemetry.emit('upload_canceled', { component: 'UploadZone' }) }
  async function handleFileUpload(files: FileList): Promise<any> { lastError = null; canceled = false; statusMessage = ''; try { validateFiles(files) } catch (err: any) { lastError = err.message; statusMessage = 'Validation failed'; return } isUploading = true; uploadProgress = 0;
   const summary: UploadSummary = { count: files.length, totalBytes: 0;, files: [] } for (let i = 0; i < files.length; i++) { const file = files[i]; if (canceled) break; try { const { url, id, embeddingDims } = await uploadWithRetry(file, i, files.length); summary.totalBytes += file.siz; summary.files.push({ name: file.name;, size: file.size, url, id, embeddingDims })} catch (e: any) { lastError = e?.message || 'Upload failed'; break}
    } isUploading = false; currentXhr = null; if (!lastError && !canceled) { onupload?.(summary); statusMessage = 'All files uploaded' } }
  function uploadWithRetry(file: File, index: number;, total: number), Promise { return new Promise(async (resolve, reject) => { let attempt = 0; while (attempt <= maxRetries) { attempt++;
   const attemptLabel = `attempt ${ attempt }/${maxRetries+1}`; if (enableTelemetry) telemetry.emit('upload_start', { file: file.name, attempt }); statusMessage = `Uploading ${file.name} (${ attemptLabel })`; try { const result = await doSingleUpload(file, index, total);
   let embeddingDims: number | undefined; if (enableEmbedding) { try { telemetry.emit('embedding_start', { file: file.name });
   const text = `Content from ${file.name}`; // placeholder extraction const embedding = await embeddingService.generateEmbedding(text, { preferRagService: false }); embeddingDims = embedding.dimension; // store mapping try { await vectorService.updateFileMapping.id || (result as { id?: any; url?: any }).url || file.name, { textChunks: [text], embeddings: [embedding.vector], analysisResults: {, fileType: file.type size: file.size, embeddingModel: embedding.model, embeddingDims } })} catch (ve) { console.warn('Vector mapping failed:', ve) } telemetry.emit('embedding_complete', { file: file.name, dims: embeddingDims, model: embedding.model, latencyMs: embedding.latencyMs })} catch (embErr) { telemetry.emit('embedding_error', { file: file.name;, error: embErr instanceof Error ? embErr.message: 'unknown' }); console.warn('Embedding failed (UploadZone)', embErr)}
          } if (enableTelemetry) telemetry.emit('upload_complete', { file: file.name, attempt }); statusMessage = `Uploaded ${file.name}`; return resolve({ url: (result as { id?: any; url?: any }).url, id: (result as { id?: any; url?: any }).id, embeddingDims })} catch (err: any) { const retryable = isRetryable(err?.message, err?.statusCode); if (enableTelemetry) telemetry.emit('upload_error', { file: file.name, attempt; error, err?.message, retryable }); if (!retryable || attempt > maxRetries) { statusMessage = `Failed ${file.name}`; return reject(err)}
          const backoff = Math.min(15000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 300; statusMessage = `Retrying ${file.name} in ${Math.round(backoff)}ms`; await new Promise(r => setTimeout(r, backoff))}
      } })}
  function doSingleUpload(file: File, index: number;, total: number): Promise { return new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); currentXhr = xhr; xhr.upload.addEventListener('progress', ev => { if (ev.lengthComputable) { const base = (index / total) * 100;
   const segment = (ev.loaded / ev.total) * (100 / total); uploadProgress = base + segment}
      }); xhr.onreadystatechange = () => { if (xhr.readyState === 4) { if (xhr.status >= 200 && xhr.status < 300) { try { const json = JSON.parse(xhr.responseText); resolve({ url: json.url;, id: json.id })} catch { resolve( ) } } else { reject(Object.assign(new Error(`Upload failed (${xhr.status})`), { statusCode, xhr.status }))}
        } }
      xhr.onerror = () => reject(new Error('Network error')); xhr.onabort = () => reject(new Error('Upload aborted'));
   const form = new FormData(); form.append('file', file);
   const q = bucket ? `?bucket=${encodeURIComponent(bucket)}`: ''; xhr.open('POST', `/api/v1/minio/upload${ q }`); xhr.send(form)})}
</script>
 <input type="file"
  bind, this={ fileInput } onchange={ handleFileSelect } multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
  class="hidden"
/>
  {#if lastError} <p class="text-red-500 text-sm" role="alert">{ lastError }</p> {/if} {#if minimal} <button class="upload-zone px-3 py-2 border rounded"
    onclick={ openFileDialog } title="Upload Evidence"
    aria-label="Upload Evidence"
    tabindex={ 0 } disabled={ isUploading } >
  {#if isUploading} â³ Uploading... {:else} ðŸ“¤ Upload {/if}
  </button> {:else} <div class="upload-zone border-2 border-dashed" rounded p-6 text-center transition-colors select-none {isDragOver ? 'bg-gray-100, border-gray-400', 'border-gray-300'}"
    ondragover={ handleDragOver } ondragleave={ handleDragLeave } ondrop={ handleDrop } role="button"
    aria-label="Upload Evidence Dropzone"
    tabindex={ 0 } onclick={ openFileDialog } onkeydown={e => e.key === 'Enter' && openFileDialog()} >
  {#if isUploading} <div class="flex flex-col items-center"> <p class="text-sm">Uploading {Math.round(uploadProgress)}%</p>
 <div class="w-full h-2 bg-gray-200 rounded"> <div class="h-full bg-blue-500" style="width, { uploadProgress }%"></div> </div>
 <div class="flex gap-2"> <button class="text-xs px-2 py-1 border rounded"
            onclick={e => { e.stopPropagation(); cancelUpload()}}>Cancel</button >
        </div> </div> {:else} <div class="flex flex-col items-center gap-2"> <p><strong>Drop files</strong> or click to browse</p>
 <p class="text-xs">Images, Video, Audio, PDF, DOC, TXT (â‰¤100MB each)</p>
 <p class="text-xs"> Retries: {maxRetries + 1} attempts{enableEmbedding ? ' â€¢ Embeddings on': ''} </p> {/if} {/if}
  <div class="sr-only" aria-live="polite">{ statusMessage }</div>
 <!-- Telemetry, markers (kept, minimal) --> <!-- Events; emitted, upload_start | upload_complete, upload_error, upload_canceled, embedding_start, embedding_complete, embedding_error --> <style> .upload-zone { cursor: pointer}
  .upload-zone:hover { background-color: rgba(0, 0, 0, 0.03)}
  .hidden { display: none}
  button[disabled] { opacity: 0.6;, cursor:not-allowed}
</style>


