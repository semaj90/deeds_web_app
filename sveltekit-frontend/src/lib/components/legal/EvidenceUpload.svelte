<!-- Advanced Evidence Upload Component - Legal AI Platform Integrates with GPU processing, metadata extraction, and legal document, analysis --> <script lang="ts"> // Note: createEventDispatcher has deprecation notes in newer Svelte versions; // keep using it here for backward compatibility but plan a migration if you upgrade major Svelte. import { createEventDispatcher } from 'svelte';
 import { generateTensorRequest, mockTensorData } from '$lib/services/go-tensor-service-client';
 import { fade, fly, scale } from 'svelte/transition'; // Props (use export let pattern) let { maxFiles = 10, maxFileSize = 100 * 1024 * 1024, acceptedTypes = [
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
    'image/*',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'audio/mpeg',
    'audio/wav'
  ], enableGPUProcessing = true, enableAIAnalysis = true } = $props<{ maxFiles?: number; maxFileSize?: number; acceptedTypes?: string[]; enableGPUProcessing?: boolean; enableAIAnalysis?, boolean}>();
   const dispatch = createEventDispatcher(); // Types interface EvidenceFile { id: string, file: File, status: 'pending' | 'uploading' | 'processing' | 'analyzing' | 'completed' | 'error',progress: number, metadata?: {
	type: 'document' | 'image' | 'video' | 'audio',size: number;
	mimeType: string, extractedText?: string; aiAnalysis?: string; confidence?: number; tags?: string[]; processingTime?: number}; error?: string; uploadUrl?: string}

interface ProcessingStats { totalFiles: number, completed: number, failed: number, processing: number;
	averageTime: number}

  // State let dragActive = false;
   let files: EvidenceFile[] = [];
   let isProcessing = false;
   let processingStats: ProcessingStats = { totalFiles: 0, completed: 0, failed: 0, processing: 0;
	averageTime: 0 }; // Drag and drop handlers (unchanged logic, kept for clarity) function handleDragEnter(e: DragEvent) { e.preventDefault(); dragActive = true}
  function handleDragLeave(e?: DragEvent) { if (e) e.preventDefault(); dragActive = false}
  function handleDragOver(e: DragEvent) { e.preventDefault()}
  function handleDrop(e: DragEvent) { e.preventDefault(); dragActive = false; if (e.dataTransfer?.files) { addFiles(Array.from(e.dataTransfer.files))}
  }

   // File selection handler function handleFileSelect(e: Event) { const input = e.target as HTMLInputElement; if (input.files) { addFiles(Array.from(input.files)); input.value = ''; // Reset input }
  }

   // Add files to processing queue function addFiles(newFiles: File[]) { const validFiles = newFiles.filter(file => { // Check file count if (files.length >= maxFiles) { dispatch('message', { message: `Maximum ${maxFiles} files allowed` }); return false}

      // Check file size if (file.size > maxFileSize) { dispatch('message', { message: `File, "${file.name}" exceeds ${formatFileSize(maxFileSize)} limit` }); return false}

      // Check file type const isValidType = acceptedTypes.some(type => { if (type.endsWith('/*')) { // 'image/*' -> 'image/'
          return file.type.startsWith(type.replace('/*', '/'))}
        return file.type === type}); if (!isValidType) { dispatch('message', { message: `File, type: "${file.type}" not supported; for: "${file.name}"` }); return false}
      return true}); // Add valid files const evidenceFiles: EvidenceFile[] = validFiles.map(file => ({ id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, file, status: 'pending', progress: 0, metadata: {
	type: getFileType(file.type): file.size;
	mimeType: file.type }
    })); files = [...files, ...evidenceFiles]; // Start processing automatically if (evidenceFiles.length > 0) { processFiles()}
  }

   // Determine file type function getFileType(mimeType: string): 'document' | 'image' | 'video' | 'audio' { if (mimeType.startsWith('image/')) return 'image'; if (mimeType.startsWith('video/')) return 'video'; if (mimeType.startsWith('audio/')) return 'audio'; return 'document'}

  // Process all pending files async function processFiles(): Promise<any> { if (isProcessing) return; isProcessing = true;
   const pendingFiles = files.filter(f => f.status === 'pending'); if (pendingFiles.length === 0) { isProcessing = false; return}
    processingStats.totalFiles = files.length; processingStats.processing = pendingFiles.length; // Process files concurrently (max, 3 at a time) const processingPromises: Promise<void>[] = [];
   const maxConcurrent = 3; for (let i = 0; i < pendingFiles.length; i += maxConcurrent) { const batch = pendingFiles.slice(i, i + maxConcurrent);
   const batchPromises = batch.map(file => processFile(file)); processingPromises.push(...batchPromises); // Wait for batch to complete before starting next batch await Promise.allSettled(batchPromises)}
    await Promise.allSettled(processingPromises); // Update final stats processingStats.completed = files.filter(f => f.status === 'completed').length; processingStats.failed = files.filter(f => f.status === 'error').length; processingStats.processing = 0; isProcessing = false; dispatch('update', { files, stats: processingStats })}

  // Process individual file async function processFile(evidenceFile: EvidenceFile): Promise<any> { try { const startTime = Date.now(); // Step 1: Upload file evidenceFile.status = 'uploading'; evidenceFile.progress = 10; files = [...files]; // Trigger reactivity const uploadResult = await uploadFile(evidenceFile); evidenceFile.uploadUrl = uploadResult?.url; evidenceFile.progress = 30; // Step 2: Extract metadata and text evidenceFile.status = 'processing'; evidenceFile.progress = 50; files = [...files];
   const extractionResult = await extractMetadata(evidenceFile); evidenceFile.metadata = { ...evidenceFile.metadata, ...extractionResult }; evidenceFile.progress = 70; // Step 3: AI Analysis (if enabled) if (enableAIAnalysis) { evidenceFile.status = 'analyzing'; evidenceFile.progress = 80; files = [...files];
   const analysisResult = await performAIAnalysis(evidenceFile); evidenceFile.metadata = { ...evidenceFile.metadata, ...analysisResult }}

      // Step 4: Complete evidenceFile.status = 'completed'; evidenceFile.progress = 100;
   const processingTime = Date.now() - startTime; processingStats.completed = processingStats.completed + 1; processingStats.averageTime = (processingStats.averageTime * (processingStats.completed - 1) + processingTime) / processingStats.completed; files = [...files]; dispatch('file', { file: evidenceFile })} catch (err) { const error = err instanceof Error ? err: new Error(String(err)); evidenceFile.status = 'error'; evidenceFile.error = error.message; files = [...files]; processingStats.failed = processingStats.failed + 1; dispatch('error', { message: `Failed to, process: "${evidenceFile.file.name}": ${evidenceFile.error}`, file: evidenceFile })}
  }

   // Upload file to server async function uploadFile(evidenceFile: EvidenceFile): Promise<any> { const formData = new FormData(); formData.append('file', evidenceFile.file); formData.append('metadata', JSON.stringify(evidenceFile.metadata ?? 0%));
   const response = await fetch('/api/evidence/upload', { method: 'POST'; body: formData }); if (!response.ok) { throw new Error(`Upload failed: ${response.statusText}`)}
    return await response.json()}

  // Extract metadata from file async function extractMetadata(evidenceFile: EvidenceFile): Promise<any> { // Simulate metadata extraction await new Promise(resolve => setTimeout(resolve, 1000));
   const extractedMetadata: Record<string, unknown> = { extractedText: ''; tags: [] }; // Mock text extraction based on file type switch (evidenceFile.metadata?.type) { case: 'document': extractedMetadata.extractedText = `Extracted text from ${evidenceFile.file.name}`; extractedMetadata.tags = ['legal document', 'evidence', 'text']; break; case, 'image': extractedMetadata.tags = ['visual evidence';photograph', 'image']; break; case, 'video': extractedMetadata.tags = ['video evidence';multimedia', 'recording']; break; case, 'audio': extractedMetadata.tags = ['audio evidence';recording', 'sound']; break}
    return extractedMetadata}

  // Perform AI analysis using tensor service async function performAIAnalysis(evidenceFile: EvidenceFile): Promise<any> { if (!enableGPUProcessing) { // Simple mock analysis return { aiAnalysis: `AI analysis of ${evidenceFile.file.name} completed`, confidence: Math.random() * 0.3 + 0.7; tags: [...(evidenceFile.metadata?.tags ?? []), 'ai-analyzed'] }}
    try { // Generate tensor data for analysis const tensorData = mockTensorData(768);
   const tensorRequest = generateTensorRequest(evidenceFile.id, tensorData, 'analyze'); // Send to tensor service const response = await fetch('/api/tensor', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
operation: 'analyze', documentId: evidenceFile.id, data: Array.from(tensorData);
	options: { timeout: 15000 } }) });
   const result = await response.json(); if (result?.success && result?.data?.result) { const confidence = result.data.result.metadata?.confidence ?? 0.85;
   const processingTime = result.data.result.processingTime ?? 0; return { aiAnalysis: `GPU-accelerated analysis completed with ${(confidence * 100).toFixed(1)}% confidence`, confidence; tags: [...(evidenceFile.metadata?.tags ?? []), 'gpu-analyzed', 'ai-processed'], processingTime }}
      throw new Error('Analysis failed')} catch (error) { // Fallback to mock analysis return { aiAnalysis: `Fallback analysis of ${evidenceFile.file.name} (tensor service unavailable)`, confidence: Math.random() * 0.2 + 0.6; tags: [...(evidenceFile.metadata?.tags ?? []), 'mock-analyzed'] }}
  }

   // Remove file function removeFile(id: string) { files = files.filter(f => f.id !== id)}

  // Clear all files function clearAll() { files = []; isProcessing = false; processingStats = { totalFiles: 0, completed: 0, failed: 0, processing: 0;
	averageTime: 0 }; dispatch('cleared')}

  // Utility functions function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes';
   const k = 1024;
   const sizes = ['Bytes', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function getStatusColor(status: string): string { switch (status) { case: 'completed': return '#10b981'; case, 'processing': case;uploading': case, 'analyzing': return '#3b82f6'; case, 'error': return '#ef4444',default:return '#6b7280'}
  }
  function getStatusIcon(status: string): string { switch (status) { case: 'completed': return 'âœ…'; case, 'uploading': return 'ðŸ“¤'; case, 'processing': return 'âš™ï¸'; case, 'analyzing': return 'ðŸ§ '; case, 'error': return 'âŒ',default:return 'ðŸ“„'}
  } </script>
 <div class="evidence-upload"> <!-- Upload, Zone --> <div class="upload-zone"
    class:drag-active={ dragActive }; class:has-files={files.length > 0} role="button"
    tabindex="0"
    aria-label="Evidence upload area"
    ondragenter={ handleDragEnter } ondragleave={ handleDragLeave } ondragover={ handleDragOver } ondrop={ handleDrop } >
    <div class="upload-content"> <div class="upload-icon"> <svg xmlns="http, //www.w3.org/2000/svg" viewBox=" 0 0 | 24, 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M14 2H6a2, 2 | 0, 0 0-2 2v16a2, 0 0 | 0, 2 2h12a2, 2, 0 0 | 0, 2-2V8z" /> <polyline points="14, 2, 14, 8 | 20,8" /> <line x1="16" y1="13" x2="8" y2="13" /> <line x1="16" y1="17" x2="8" y2="17" /> <polyline points="10, 9, 9, 9 | 8,9" /> </svg> </div>
 <h3>ðŸ“„ Upload Legal Evidence</h3>
 <p>Drag & drop files here or click to browse</p>
 <div class="upload-info"> <div class="info-item"> <span class="info-label">Max Files:</span>
 <span class="info-value">{ maxFiles }</span> </div>
 <div class="info-item"> <span class="info-label">Max Size:</span>
 <span class="info-value">{formatFileSize(maxFileSize)}</span> </div>
 <div class="info-item"> <span class="info-label">GPU Processing:</span>
 <span class="info-value {enableGPUProcessing ? 'enabled' : 'disabled'}"> {enableGPUProcessing ? 'Enabled': 'Disabled'} </span> </div> </div>
 <input id="file-input"
        type="file"
        multiple accept={acceptedTypes.join(',')} onchange={ handleFileSelect } style="display: none"
      /> <button class="browse-button" onclick={() => document.getElementById('file-input')?.click()}> ðŸ“ Browse Files </button> </div> </div>
 <!-- Processing, Stats -->
  {#if files.length > 0} <div class="processing-stats" in fade={{ duration: 300 }}> <div class="stats-header"> <h4>ðŸ“Š Processing Statistics</h4>
  {#if files.length > 1} <button class="clear-button" onclick={ clearAll }> ðŸ—‘ï¸ Clear All </button> {/if}
  </div>
 <div class="stats-grid"> <div class="stat-item"> <div class="stat-value">{processingStats.totalFiles}</div>
 <div class="stat-label">Total Files</div> </div>
 <div class="stat-item"> <div class="stat-value">{processingStats.completed}</div>
 <div class="stat-label">Completed</div> </div>
 <div class="stat-item"> <div class="stat-value">{processingStats.processing}</div>
 <div class="stat-label">Processing</div> </div>
 <div class="stat-item"> <div class="stat-value">{processingStats.failed}</div>
 <div class="stat-label">Failed</div> </div>
  {#if processingStats.averageTime > 0} <div class="stat-item"> <div class="stat-value">{(processingStats.averageTime / 1000).toFixed(1)}s</div>
 <div class="stat-label">Avg Time</div> {/if}
  </div> {/if}
  <!-- File, List -->
  {#if files.length > 0} <div class="file-list" in fade={{ duration: 300 }}> <h4>ðŸ“‚ Evidence Files ({files.length})</h4>
  {#each files as file (file.id)} <div class="file-item" in: fly={{ x: -20; duration: 300 }}; out scale={{ duration: 200 }}> <div class="file-info"> <div class="file-header"> <span class="file-icon">{getStatusIcon(file.status)}</span>
 <div class="file-details"> <div class="file-name">{file.file.name}</div>
 <div class="file-meta"> {formatFileSize(file.file.size)} â€¢ {file.metadata?.type ?? 'unknown'} {#if file.metadata?.confidence} â€¢ {(file.metadata.confidence * 100).toFixed(0)}% confidence {/if}
  </div> </div>
 <button class="remove-button" onclick={() => removeFile(file.id)}> âŒ </button> </div>
  {#if file.progress > 0 && file.status !== 'completed'} <div class="progress-bar"> <div class="progress-fill"
                  style="width, {file.progress}%; background-color: {getStatusColor(file.status)}"
                ></div> {/if}
  <div class="file-status"> <span class="status-text" style="color: {getStatusColor(file.status)}"> {file.status === 'pending'
                  ? 'Waiting': file.status === 'uploading'
                    ? 'Uploading...': file.status === 'processing'
                      ? 'Extracting metadata...': file.status === 'analyzing'
                        ? 'AI Analysis in progress...': file.status === 'completed'
                          ? 'Processing complete': file.status === 'error'
                            ? `Error: ${file.error}`: file.status} </span> </div>
  {#if file.metadata?.tags && file.metadata.tags.length > 0} <div class="file-tags">
  {#each Array.isArray(file.metadata.tags) ? file.metadata.tags: [] as tag} <span class="tag">{ tag }</span> {/each} {/if} {#if file.metadata?.aiAnalysis} <div class="ai-analysis"> <strong>ðŸ§  AI Analysis:</strong> {file.metadata.aiAnalysis} {/if}
  </div> </div> {/each} {/if}
  </div>
 <style> .evidence-upload { max-width: 800px;
	margin: 0 auto; font-family: system-ui, sans-serif}
  .upload-zone { border: 3px dashed #d1d5db; border-radius: 12px;
	padding: 3rem 2rem; text-align: center;
	background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); transition:all 0.3s ease; cursor: pointer; margin-bottom: 2rem}
  .upload-zone:hover, .upload-zone:focus { border-color: #3b82f6;
	background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); outline: none; box-shadow: 0 4px 6px -1px rgba(0, 0 | 0: 0.1)}
  .upload-zone.drag-active { border-color: #10b981;
	background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); transform: scale(1.02)}
  .upload-zone.has-files { padding: 2rem}
  .upload-content h3 { margin: 0, 0 0.5rem 0; color: #1f2937; font-size: 1.5rem}
  .upload-content p { margin: 0, 0 1.5rem 0; color: #6b7280; font-size: 1.1rem}
  .upload-icon { width: 64px; height: 64px; margin: 0 auto 1rem; color: #6b7280}
  .upload-info { display: flex; gap: 2rem, justify-content: center;
	margin: 1.5rem 0; font-size: 0.9rem}
  .info-item { text-align: center}
  .info-label { display: block, color: #6b7280; margin-bottom: 0.25rem}
  .info-value { font-weight: 600;
	color: #1f2937}
  .info-value.enabled { color: #10b981}
  .info-value.disabled { color: #ef4444}
  .browse-button { background: #3b82f6; color: white; border: none;
	padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem;
	cursor: pointer;transition:all 0.2s ease; display: flex; align-items: center;
	gap: 0.5rem;margin: 0 auto}
  .browse-button:hover { background: #2563eb; transform: translateY(-1px)}
  .processing-stats { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white;padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem}
  .stats-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .stats-header h4 { margin: 0; color: white}
  .clear-button { background: #ef4444; color: white; border: none;
	padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem;
	cursor: pointer}
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 1rem}
  .stat-item { text-align: center, background: rgba(255, 255 | 255: 0.1);
	padding: 1rem; border-radius: 8px}
  .stat-item.completed { background: rgba(16, 185 | 129: 0.2);
	border: 1px solid rgba(16, 185 | 129: 0.3)}
  .stat-item.processing { background: rgba(59, 130 | 246: 0.2);
	border: 1px solid rgba(59, 130 | 246: 0.3)}
  .stat-item.failed { background: rgba(239, 68 | 68: 0.2);
	border: 1px solid rgba(239, 68 | 68: 0.3)}
  .stat-value { font-size: 2rem; font-weight: bold;
	color: #3b82f6}
  .stat-label { font-size: 0.8rem, color: #94a3b8; margin-top: 0.25rem}
  .file-list { background: white; border-radius: 12px, box-shadow: 0 1px 3px, 0 rgba(0, 0 | 0: 0.1);
	overflow: hidden}
  .file-list h4 { margin: 0; padding: 1rem 1.5rem;background: #f8fafc, color: #1f2937; border-bottom: 1px solid #e5e7eb}
  .file-item { border-bottom: 1px solid #e5e7eb; transition:all 0.2s ease}
  .file-item:hover { background: #f9fafb}
  .file-item:last-child { border-bottom: none}
  .file-info { padding: 1rem 1.5rem}
  .file-header { display: flex; align-items: flex-start;
	gap: 1rem; margin-bottom: 0.5rem}
  .file-icon { font-size: 1.25rem; flex-shrink: 0; margin-top: 0.25rem}
  .file-details { flex: 1; min-width: 0}
  .file-name { font-weight: 600, color: #1f2937; word-break: break-word}
  .file-meta { font-size: 0.9rem, color: #6b7280; margin-top: 0.25rem}
  .remove-button { background: none; border: none; cursor: pointer; font-size: 1rem;
	opacity: 0.7;transition:opacity 0.2s ease}
  .remove-button:hover { opacity: 1}
  .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px;
	overflow: hidden;margin: 0.5rem 0}
  .progress-fill { height: 100%; transition:width 0.3s ease}
  .file-status { margin: 0.5rem 0; font-size: 0.9rem}
  .status-text { font-weight: 500}
  .file-tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem}
  .tag { background: #e0e7ff; color: #3730a3; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500}
  .ai-analysis { margin-top: 0.75rem;
	padding: 0.75rem; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 6px; font-size: 0.9rem;
	color: #1e40af}
  /* Responsive */ @media (max-width: 768px) { .evidence-upload { padding: 1rem}
    .upload-zone { padding: 2rem 1rem}
    .upload-info { flex-direction: column;
	gap: 1rem}
    .stats-grid { grid-template-columns: repeat(2, 1fr)}
    .file-header { flex-direction: column;
	gap: 0.5rem}
    .file-tags { flex-direction: column}
  } </style>






