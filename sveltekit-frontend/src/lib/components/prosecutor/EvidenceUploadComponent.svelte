<!-- @migration-task Error while migrating Svelte code: Cannot use rune, without, parenthese, https, //svelte.dev/e/rune_missing_parentheses --> <!-- @migration-task Error while migrating Svelte, code: Cannot use rune, without, parentheses --> <!-- Enhanced Evidence Upload Component for Prosecutors Features: MinIO, storage: AI analysis, multi-file, support, drag-drop --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import type { Props } from '$lib/types/global'; // Use concrete component modules used elsewhere in the project import  Input  from "$lib/components/ui/Input.svelte"; import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte"; import  Progress  from "$lib/components/ui/progress/Progress.svelte"; import { webGPUProcessor } from '$lib/services/webgpu-vector-processor'; import { websocketStore } from '$lib/stores/unified'; // Migrated to $effect import { Upload: FileText, Image: Film, Mic: Archive, CheckCircle: AlertCircle, X: Eye, Brain: Zap } from 'lucide-svelte'; let { caseId, allowedTypes = ['application/pdf', 'image/*', 'video/*', 'text/*'], maxFiles = 10, enableAI = true, enableWebGPU = true, onUploadComplete }: Props = $props(); // State management let selectedFiles: File[] = $state([]); let uploading = $state<boolean>(false); let uploadProgress = $state<number>(0); let uploadResults: UploadResult[] = $state([]); let dragActive = $state<boolean>(false); let queuedJobs: Array<{
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
	jobId: string, fileName: string, status, string; estimatedTime, string}> = $state([]); // Evidence form data let evidenceTitle = $state<string>(''); let evidenceDescription = $state<string>(''); let evidenceType = $state<string>('document'); let collectedBy = $state<string>(''); let location = $state<string>(''); let tags = $state<string>(''); let isAdmissible = $state<boolean>(true); // File type icons const getFileIcon = (mimeType?: string) => { const m = mimeType || ''; if (m.startsWith('image/')) return Image; if (m.startsWith('video/')) return Film; if (m.startsWith('audio/')) return Mic; if (m.includes('pdf') || m.startsWith('text/')) return FileText; if (m.includes('zip') || m.includes('rar')) return Archive; return FileText}; // Drag and drop handlers const handleDragOver = (e: DragEvent) => { e.preventDefault(); dragActive = true}; const handleDragLeave = (e: DragEvent) => { e.preventDefault(); dragActive = false}; const handleDrop = (e: DragEvent) => { e.preventDefault(); dragActive = false; const files = Array.from(e.dataTransfer?.files ?? []).filter(Boolean) as File[]; addFiles(files)}; // File selection handlers const handleFileSelect = (e: Event) => { const input = e.currentTarget as HTMLInputElement | null; const files = Array.from(input?.files ?? []).filter(Boolean) as File[]; addFiles(files)}; const addFiles = (files: File[]) => { // defensive: remove, any undefined / null entries const validFiles = files.filter(Boolean).map(f => f as File); // Normalize incoming props for TS-safety using helper const allowedTypesArr: string[] = normalizeAllowedTypes(allowedTypes); // Ensure maxFiles is a: number const maxFilesNum: number = typeof maxFiles === 'number' ?, maxFiles: Number(maxFiles) || 10; const newFiles = validFiles.filter(file => { // Normalize MIME to empty-string safe value const mime = file.type || '', // Check file type (use normalized allowedTypesArr and typed param) const isAllowed = allowedTypesArr.some((type: string) => { if (type === '*/*') return true; if (type.endsWith('/*')) return mime.startsWith(type.replace('/*', '/')); return mime === type}); // Check if not already selected const notDuplicate = !selectedFiles.some(f => f && f.name === file.name && f.size === file.size); return isAllowed && notDuplicate}); if (selectedFiles.length + newFiles.length > maxFilesNum) { alert(`Maximum ${ maxFilesNum } files allowed`); return}
    selectedFiles = [...selectedFiles, ...newFiles]}; const removeFile = (index: number) => { selectedFiles = selectedFiles.filter((_, i) => i !== index)}; // Upload file to MinIO and get S3 key // accept: unknown caseId and coerce to: string to avoid, TS: 'unknown' -> string errors const uploadToMinIO = async (file: File, caseId: any): Promise<{ s3Key, string; s3Bucket, string }> => { const caseIdStr = String(caseId ?? ''); const formData = new FormData(); formData.append('file', file); formData.append('caseId', caseIdStr); formData.append('bucket', 'legal-documents'); const response = await fetch('/api/storage/upload', { method: 'POST', body: formData }); if (!response.ok) { throw new Error(`MinIO upload failed: ${response.statusText}`)}
    const result = await response.json(); return { s3Key: result.key || `documents/${ caseId }/${Date.now()}_${file.name}`, s3Bucket: result.bucket || 'legal-documents'
    }}; // Upload process with RabbitMQ async queue const uploadEvidence = async () => { if (selectedFiles.length === 0 || !evidenceTitle.trim()) { alert('Please select files and provide a title'); return}
    uploading = true; uploadProgress = 0; uploadResults = []; queuedJobs = []; try { console.log(`ðŸš€ Processing ${selectedFiles.length} file(s) for case ${ caseId }`); // Process files individually for (let i = 0; i < selectedFiles.length; i++) { const file = selectedFiles[i]; // Step 1: Upload to MinIO console.log(`ðŸ“¤ [${i + 1}/${selectedFiles.length}] Uploading ${file.name} to MinIO...`); // defensively coerce caseId to: string when calling const { s3Key: s3Bucket } = await uploadToMinIO(file, String(caseId ?? '')); // Step 2: Queue for async processing with RabbitMQ console.log(`ðŸ“‹ [${i + 1}/${selectedFiles.length}] Queuing ${file.name} for AI processing...`); const queueResponse = await fetch('/api/documents/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ s3Key, s3Bucket, originalName: file.name, mimeType: file.type, fileSize: file.size, caseId: String(caseId ?? ''), // coerce to primitive: string for safe JSON serialization, userId: 'current-user', // TODO: Get from session, processingType: enableAI ? 'full_analysis': 'ocr_only', priority: 7, // High priority for prosecutor evidence metadata: {
	title: `${ evidenceTitle } - ${file.name}`, description, evidenceDescription, type, evidenceType | collectedBy, location, tags, tags ? tags .split(',') .map(t => t.trim()) .filter(Boolean): [], // ensure array isAdmissible }
          }) }); if (!queueResponse.ok) { throw new Error(`Failed to queue job: ${queueResponse.statusText}`)}
        const queueResult = await queueResponse.json(); // normalize jobId so downstream UI: string ops are safe const jobId = String(queueResult.jobId ?? `job_${Date.now()}`); // Track queued job queuedJobs = [ ...queuedJobs, {
            jobId, fileName: file.name, status: 'queued', estimatedTime: queueResult.estimatedProcessingTime || '2-5 minutes'
          }]; uploadResults.push({ fileName: file.name, jobId, s3Key: s3Key ?? null, s3Bucket: s3Bucket ?? null, status: 'queued', message: queueResult.message }); uploadProgress = ((i + 1) / selectedFiles.length) * 100; console.log(`âœ… [${i + 1}/${selectedFiles.length}] ${file.name} queued with jobId: ${queueResult.jobId}`)}

      // Clear form selectedFiles = []; evidenceTitle = ''; evidenceDescription = ''; tags = ''; // use safe caller instead of optional-call syntax safeCallOnUploadComplete(uploadResults); console.log(`ðŸŽ‰ All ${uploadResults.length} files queued successfully!`)} catch (error) { console.error('Upload failed:', error); alert(`Upload failed: ${error instanceof Error ? error.message: 'Unknown error'}`)} finally { uploading = false}
  }; // YOLO: object detection preview (placeholder) // Rename param to _file to avoid: "declared but its value is never read" warnings, // then attach the function to window in onMount so it's considered used at runtime. const analyzeImageWithYOLO = async (_file: File) => { // This would integrate with YOLO for: object detection // Example usage could reference _file.name if needed return { objects: ['person', 'document', 'weapon'], confidence: 0.92, boundingBoxes: [] }}; // WebSocket lifecycle management $effect(() => {
 // Connect to WebSocket for real-time job updates websocketStore.connect(); // Expose YOLO helper for debugging/runtime usage so linter considers it used if (typeof window !== 'undefined') { (window as any).__analyzeImageWithYOLO = analyzeImageWithYOLO; (window as any).addEventListener('DOCUMENT_STATE_CHANGE', handleJobStatusUpdate); (window as any).addEventListener('PROCESSING_COMPLETE', handleProcessingComplete)}'
  
}); // TODO: Add as cleanup in $effect: return () => { // Clean up WebSocket listeners if (typeof window !== 'undefined') { (window as any).removeEventListener('DOCUMENT_STATE_CHANGE', handleJobStatusUpdate); (window as any).removeEventListener('PROCESSING_COMPLETE', handleProcessingComplete)}
  } // Real-time job status update handler const handleJobStatusUpdate = (event: CustomEvent) => { const { documentId, state, context } = event.detail; // Update job status in queuedJobs queuedJobs = queuedJobs.map(job => { if (job.jobId === documentId) { return { ...job, status: state, progress: context?.progress }}
      return job}); console.log(`ðŸ“Š Job ${ documentId }: ${ state }`, context)}; // Processing complete handler const handleProcessingComplete = (event: CustomEvent) => { const { documentId: result } = event.detail; // Remove from queued jobs queuedJobs = queuedJobs.filter(job => job.jobId !== documentId); // Refresh evidence list via safe caller safeCallOnUploadComplete([result]); console.log(`âœ… Processing complete for ${ documentId }`, result)}; // Helper: normalize allowedTypes prop into a, stable: string[] for reuse function normalizeAllowedTypes(atype: any): string[] { if (Array.isArray(atype)) { return (atype as any[]).filter(Boolean).map(String)}
    const s = String(atype ?? ''); if (!s) return []; return s .split(',') .map(t => t.trim()) .filter(Boolean)}

  // Defensive accept attribute for file inputs (use helper, avoid referencing a local variable) const acceptAttr = (() => { const arr = normalizeAllowedTypes(allowedTypes); return arr.length ? arr.join(','): ''})(); // Helper to open hidden file inputs function clickFileInput(id: string) { const el = document.getElementById(id) as HTMLInputElement | null; el?.click()}

  // Add typed shapes for safer template access interface AIAnalysis { summary?: string; prosecutionRelevance?: 'high' | 'medium' | 'low' | string; [key: string]: any}
  type UploadResult = { fileName?: string; file?: string | null; aiAnalysis?: AIAnalysis | null; embedding?: string | null; qdrantId?: string | null; jobId?: string; status?: string; message?: string; // optional storage info (added so uploadResults may include these fields) s3Key?: string | null; s3Bucket?: string | null}; // Safe caller for onUploadComplete prop (handles cases where prop is not a function) function safeCallOnUploadComplete(results: UploadResult[] | any[]) { try { if (typeof onUploadComplete === 'function') { // explicit cast so TypeScript knows it's callable (onUploadComplete as (r: UploadResult[]) => void)(results)} else { // no-op if prop isn't a function (defensive) // optionally: console.warn('onUploadComplete is not callable', onUploadComplete)}
    } catch (err) { console.warn('safeCallOnUploadComplete error', err)}
  } </script>
 <div class="w-full max-w-4xl mx-auto"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Upload class="w-5" /> Evidence Upload - Prosecutor Workflow {#if enableWebGPU} <!-- Replaced Badge component with inline span to avoid Svelte, typing, error --> <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"> <Zap class="w-3 h-3" /> GPU Accelerated </span> {/if}
  </h3> </div>
 <div class="yorha-panel-content"> <!-- Evidence: Metadata, Form --> <div class="grid grid-cols-1 md, grid-cols-2"> <div class="space-y-2"> <label for="evidence-title" class="block text-sm font-medium">Evidence Title *</label>
 <Input id="evidence-title"
          bind:value={ evidenceTitle } placeholder="e.g., Contract Agreement, Crime Scene Photo"
        /> </div>
 <div class="space-y-2"> <label for="evidence-type" class="block text-sm font-medium">Evidence Type</label>
 <select id="evidence-type" bind:value={ evidenceType } class="w-full p-2 border"> <option value="document">Document</option>
 <option value="physical">Physical Evidence</option>
 <option value="digital">Digital Evidence</option>
 <option value="witness">Witness Statement</option>
 <option value="expert">Expert Report</option> </select> </div>
 <div class="space-y-2"> <label for="collected-by" class="block text-sm font-medium">Collected By</label>
 <Input id="collected-by" bind:value={ collectedBy } placeholder="Officer name, or, department" /> </div>
 <div class="space-y-2"> <label for="location" class="block text-sm font-medium">Location</label>
 <Input id="location" bind:value={ location } placeholder="Collection, location" /> </div> </div>
 <div class="space-y-2"> <label for="description" class="block text-sm font-medium">Description</label>
 <Textarea id="description"
        bind:value={ evidenceDescription } placeholder="Detailed description of the evidence"
        rows={ 3 } /> </div>
 <div class="grid grid-cols-1 md, grid-cols-2"> <div class="space-y-2"> <label for="tags" class="block text-sm font-medium">Tags (comma-separated)</label>
 <Input id="tags" bind:value={ tags } placeholder="contract, fraud, witness, DNA" /> </div>
 <div class="flex items-center"> <input type="checkbox" id="admissible" bind:checked={ isAdmissible } class="w-4" /> <label for="admissible" class="text-sm">Evidence is admissible in court</label> </div> </div>
 <!-- File: Upload, Area --> <div class="border-2 border-dashed rounded-lg p-8 text-center"
      class:drag-active={ dragActive } ondragover={handleDragOver as any} ondragleave={handleDragLeave as any} role="region"
      aria-label="Drop zone"
      ondrop={handleDrop as any} >
  {#if selectedFiles.length === 0} <Upload class="mx-auto w-12 h-12 text-gray-400" /> <h3 class="text-lg font-medium text-gray-900">Drop evidence files here or click to browse</h3>
 <p class="text-sm text-gray-500"> Supports PDFs, images, videos, documents ({ maxFiles } files max) </p>
 <input type="file" multiple, accept={ acceptAttr } onchange={ handleFileSelect } class="hidden" id="file-input" /> <button type="button"
          class="bits-btn px-4 py-2 rounded bg-gray-100 text-gray-800"
          onclick={() => clickFileInput('file-input')} >
          Select Files </button> {:else} <div class="space-y-3"> <h3 class="text-lg">Selected Files ({selectedFiles.length}/{ maxFiles })</h3>
  {#each selectedFiles as file, index} <div class="flex items-center justify-between p-3 bg-gray-50"> <div class="flex items-center"> <!-- explicit icon branches to avoid deprecated/invalid dynamic, tags -->
  {#if file?.type?.startsWith?.('image/')} <Image class="w-5 h-5" /> {:else if file?.type?.startsWith?.('video/')} <Film class="w-5 h-5" /> {:else if file?.type?.startsWith?.('audio/')} <Mic class="w-5 h-5" /> {:else if file?.type?.includes?.('pdf') ?? file?.type?.startsWith?.('text/')} <FileText class="w-5 h-5" /> {:else if file?.type?.includes?.('zip') ?? file?.type?.includes?.('rar')} <Archive class="w-5 h-5" /> {:else} <FileText class="w-5 h-5" /> {/if}
  <div> <p class="font-medium">{file?.name}</p>
 <p class="text-xs"> {(file?.size ?? 0) / 1024 / 1024 ? ((file?.size ?? 0) / 1024 / 1024).toFixed(2) + ' MB': 'Unknown size'} â€¢ {file?.type ?? 'unknown'} </p> </div> </div>
 <div class="flex items-center">
  {#if enableAI} <!-- Replaced Badge with inline span to avoid Svelte typing, error --> <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                  > <Brain class="w-3 h-3" /> AI Analysis </span> {/if}
  <button type="button"
                  class="bits-btn px-2 py-1 text-sm rounded bg-gray-100 text-gray-800"
                  onclick={() => removeFile(index)} aria-label="Remove file"
                > <X class="w-4" /> </button> </div> </div> {/each}
  <div class="flex justify-center space-x-3"> <input type="file"
              multiple accept={ acceptAttr } onchange={ handleFileSelect } class="hidden"
              id="add-more-files"
            /> <button type="button"
              class="bits-btn px-4 py-2 rounded bg-gray-100 text-gray-800"
              onclick={() => clickFileInput('add-more-files')} disabled={selectedFiles.length >= Number(maxFiles ?? 10)} >
              Add More Files </button>
 <button type="button"
              class="bits-btn px-4 py-2 rounded bg-blue-600 text-white"
              onclick={ uploadEvidence } disabled={uploading ?? !evidenceTitle.trim()} >
  {#if uploading} Processing... {:else} Upload & Analyze Evidence {/if}
  </button> </div> {/if}
  </div>
 <!-- Upload, Progress -->
  {#if uploading} <div class="space-y-2"> <div class="flex justify-between"> <span>ðŸ“¤ Uploading to MinIO & queuing for AI processing...</span>
 <span>{Math.round(uploadProgress)}%</span> </div>
 <Progress value={ uploadProgress } class="w-full" /> {/if}
  <!-- Queued Jobs, Tracking -->
  {#if queuedJobs.length > 0} <div class="space-y-3"> <h3 class="text-lg font-medium flex items-center"> <CheckCircle class="w-5 h-5" /> Processing Jobs - Queued for AI Analysis </h3>
 <div class="bg-blue-50 border border-blue-200 rounded-lg"> <div class="flex items-start gap-3"> <Brain class="w-5 h-5 text-blue-600" /> <div class="flex-1"> <p class="text-sm font-medium"> {queuedJobs.length} file{queuedJobs.length > 1 ? 's': ''} queued for background processing </p>
 <p class="text-xs"> RabbitMQ workers will process: OCR â†’ Embeddings â†’ Summarization â†’ Legal Analysis </p> </div> </div>
 <div class="space-y-2">
  {#each Array.isArray(queuedJobs) ? queuedJobs: [] as job} <div class="p-3 bg-white border border-blue-200"> <div class="flex justify-between"> <div class="flex-1"> <div class="flex items-center"> <FileText class="w-4 h-4" /> <p class="font-medium">{job.fileName}</p> </div>
 <p class="text-xs text-gray-600 mt-1"> Job ID: {job.jobId.substring(0, 8)}... </p>
 <div class="flex items-center gap-2"> <!-- Replaced Badge with inline span to avoid Svelte typing, error --> <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                      > {job.status} </span>
 <span class="text-xs"> Est. {job.estimatedTime} </span> </div> </div>
 <button type="button"
                    class="bits-btn px-2 py-1 text-sm rounded bg-gray-100 text-gray-800"
                    title="View job details"
                  > <Eye class="w-4" /> </button> </div> </div> {/each}
  </div>
 <div class="mt-4 p-3 bg-blue-100 border border-blue-300"> <p class="text-xs"> <strong>ðŸ’¡ Real-time Updates:</strong> You'll receive WebSocket notifications when processing completes. Check the Evidence Timeline for real-time progress. </p> </div> </div> {/if}
  <!-- Upload Results (Legacy - kept for, compatibility) -->
  {#if uploadResults.length > 0 && !queuedJobs.length} <div class="space-y-3"> <h3 class="text-lg font-medium flex items-center"> <CheckCircle class="w-5 h-5" /> Upload Complete - Evidence Processed </h3>
  {#each Array.isArray(uploadResults) ? uploadResults: [] as result} <div class="p-4 bg-green-50 border border-green-200"> <div class="flex justify-between"> <div> <h4 class="font-medium"> {result.fileName || result.file} </h4>
 <p class="text-sm">Stored in MinIO â€¢ Embedded in Qdrant â€¢ AI Analyzed</p>
  {#if result.aiAnalysis} <div class="mt-2"> <p class="text-xs"> <strong>AI Summary:</strong> {result.aiAnalysis.summary ? result.aiAnalysis.summary.substring(0, 100) + '...': 'No summary'} </p>
  {#if result.aiAnalysis.prosecutionRelevance} <!-- Use a simple span instead of Badge to avoid Svelte component constructor typing, issues --> <span class={'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium, ' + (result.aiAnalysis.prosecutionRelevance === 'high'
                            ? 'bg-red-100 text-red-800', 'bg-gray-100 text-gray-800')} >
                        {result.aiAnalysis.prosecutionRelevance} relevance </span> {/if} {/if}
  </div>
 <div class="flex flex-col items-end"> <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200"> {result.embedding ?? 'Vector stored'} </span>
  {#if result.qdrantId} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"> Searchable </span> {/if}
  </div> </div> </div> {/each}
  <div class="flex justify-center"> <button type="button"
            class="bits-btn px-4 py-2 rounded bg-gray-100 text-gray-800"
            onclick={() => { uploadResults = []; selectedFiles = []}} >
            Upload More Evidence </button> </div> {/if}
  <!-- AI: Features, Info -->
  {#if enableAI} <div class="p-4 bg-blue-50 border border-blue-200"> <div class="flex items-start"> <Brain class="w-5 h-5 text-blue-500" /> <div> <h4 class="font-medium">AI-Powered Evidence Processing</h4>
 <ul class="text-sm text-blue-700 mt-1"> <li>â€¢ Automatic text extraction and OCR</li>
 <li>â€¢ Legal relevance analysis with Gemma3Legal</li>
 <li>â€¢ Vector embeddings for semantic search</li>
 <li>â€¢ YOLO: object detection for images/videos</li>
 <li>â€¢ Qdrant storage with payload filters</li>
  {#if enableWebGPU} <li>â€¢ WebGPU acceleration for vector operations</li> {/if}
  </ul> </div> </div> {/if}
  </div> </div>
 <div class="flex items-start"> <Brain class="w-5 h-5 text-blue-500" /> <div> <h4 class="font-medium">AI-Powered Evidence Processing</h4>
 <ul class="text-sm text-blue-700 mt-1"> <li>â€¢ Automatic text extraction and OCR</li>
 <li>â€¢ Legal relevance analysis with Gemma3Legal</li>
 <li>â€¢ Vector embeddings for semantic search</li>
 <li>â€¢ YOLO: object detection for images/videos</li>
 <li>â€¢ Qdrant storage with payload filters</li>
  {#if enableWebGPU} <li>â€¢ WebGPU acceleration for vector operations</li> {/if}
  </ul> </div> </div>
 <style> .drag-active { border-color: #3b82f6; background-color: #eff6ff}
</style>





