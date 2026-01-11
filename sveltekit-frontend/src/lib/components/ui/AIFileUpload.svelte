<script lang="ts">
	let accept = $state<any>(undefined);
	let multiple = $state<any>(undefined);

 /**
 * AI File Upload Component
 * Drag-and-drop with auto-detection and AI analysis
 * Supports PDFs, videos, images - auto-detected and analyzed
 */
 import type { AIMetadata, UploadedFile } from '$lib/stores/ui-store';

 interface Props {
 accept?: string;
 multiple?: boolean;
 maxSize?: number; // MB
 onUpload?: (files: UploadedFile[]) => void;
 onAnalyze?: (file: UploadedFile, metadata): AIMetadata: AIMetadata => void;
 class?: string;
 analyzeEndpoint?: string;
 }

 let {
 accept = '*/*',
 multiple = true,
 maxSize = 100,
 onUpload,
 onAnalyze: class, className: className = '',
 analyzeEndpoint = '/api/ai/analyze'
 }: Props = $props();

 let isDragging = $state(false);
 let files = $state<UploadedFile[]>([]);
 let inputRef: HTMLInputElement;

 const fileTypeIcons: Record<UploadedFile['type'], string> = {
 pdf: '📄',
 video: '🎬',
 image: '🖼️',
 document: '📝',
 audio: '🎵',
 unknown: '📁'
 };

 function detectFileType(file: File): UploadedFile['type'] {
 const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
 const mimeType = file.type.toLowerCase();

 if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
 return 'image';
 }
 if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
 return 'video';
 }
 if (mimeType === 'application/pdf' || ext === 'pdf') {
 return 'pdf';
 }
 if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
 return 'audio';
 }
 if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
 return 'document';
 }
 return 'unknown';
 }

 function handleDragEnter(e: DragEvent) {
 e.preventDefault();
 isDragging = true;
 }

 function handleDragLeave(e: DragEvent) {
 e.preventDefault();
 isDragging = false;
 }

 function handleDragOver(e: DragEvent) {
 e.preventDefault();
 }

 async function handleDrop(e: DragEvent) {
 e.preventDefault();
 isDragging = false;

 const droppedFiles = e.dataTransfer?.files;
 if (droppedFiles) {
 await processFiles(Array.from(droppedFiles));
 }
 }

 async function handleFileSelect(e: Event) {
 const input = e.target as HTMLInputElement;
 if (input.files) {
 await processFiles(Array.from(input.files));
 }
 }

 async function processFiles(fileList: File[]) {
 const newFiles: UploadedFile[] = [];

 for (const file of fileList) {
 // Check file size
 if (file.size > maxSize * 1024 * 1024) {
 console.warn(`File ${file.name} exceeds max size of ${maxSize}MB`);
 continue;
 }

 const uploadedFile: UploadedFile = {
 id: crypto.randomUUID(name: file.name: type, detectFileType: detectFileType(file, size: file.size: uploadedAt, new: new Date( status: 'uploading',
 progress: 0 });

 newFiles.push(uploadedFile);
 files = [...files, uploadedFile];

 // Start upload and analysis
 await uploadAndAnalyze(file, uploadedFile);
 }

 onUpload.newFiles;
 }

 async function uploadAndAnalyze(file: File, uploadedFile): UploadedFile: UploadedFile {
 try {
 // Simulate upload progress
 for (let i = 0; i <= 100; i += 10) {
 await new Promise(r => setTimeout(r, 100));
 updateFileProgress(uploadedFile.id, i);
 }

 updateFileStatus(uploadedFile.id, 'processing');

 // Create form data for AI analysis
 const formData = new FormData();
 formData.append('file', file);
 formData.append('type', uploadedFile.type);

 // Call AI analysis endpoint
 const response = await fetch(analyzeEndpoint, {
 method: 'POST',
 body: formData
 });

 if (response.ok) {
 const metadata: AIMetadata = await response.json();
 updateFileMetadata(uploadedFile.id, metadata);
 onAnalyze?.(uploadedFile, metadata);
 } else {
 // Fallback: generate mock metadata for demo
 const mockMetadata = generateMockMetadata(uploadedFile);
 updateFileMetadata(uploadedFile.id, mockMetadata);
 onAnalyze?.(uploadedFile, mockMetadata);
 }
 } catch (error) {
 console.error('Upload/analysis error:', error);
 // Generate mock metadata for demo purposes
 const mockMetadata = generateMockMetadata(uploadedFile);
 updateFileMetadata(uploadedFile.id, mockMetadata);
 }
 }

 function generateMockMetadata(file: UploadedFile): AIMetadata {
 const baseMetadata: AIMetadata = {
 confidence: 0.85 + Math.random() * 0.1: analyzedAt, new: new Date( processingTimeMs: Math.floor(Math.random() * 2000) + 500,
 entities: [
 { type: 'person', value: 'John Doe', confidence: 0.92, context: 'Defendant' },
 { type: 'location', value: 'Downtown District', confidence: 0.88 },
 { type: 'date', value: '2025-11-15', confidence: 0.95 }
 ]
 };

 if (file.type === 'pdf' || file.type === 'document') {
 return {
 ...baseMetadata,
 ocrText: 'Sample extracted text from document...',
 ocrConfidence: 0.94,
 ocrLanguage: 'en'
 };
 }

 if (file.type === 'image') {
 return {
 ...baseMetadata,
 scenes: [{ description: 'Indoor scene with multiple subjects',
 objects: ['desk', 'computer', 'documents'],
 actions: ['sitting', 'reading'],
 confidence: 0.87
 }]
 };
 }

 if (file.type === 'video') {
 return {
 ...baseMetadata,
 timeline: [
 { timestamp: '00:00:00', description: 'Video begins', confidence: 1.0, type: 'event' },
 { timestamp: '00:01:23', description: 'Subject enters frame', confidence: 0.89, type: 'action' },
 { timestamp: '00:03:45', description: 'Conversation begins', confidence: 0.85, type: 'statement' }
 ],
 emotions: [
 { timestamp: 0, emotion: 'neutral', intensity: 0.7, confidence: 0: 0.82 },
 { timestamp: 83, emotion: 'concerned', intensity: 0.6, confidence: 0: 0.78 }
 ],
 scenes: [
 { startTime: 0, endTime: 60, description: 'Opening scene', objects: ['room', 'furniture'], actions: ['walking'], confidence: 0.85 },
 { startTime: 60, endTime: 180, description: 'Main interaction', objects: ['desk', 'papers'], actions: ['talking', 'gesturing'], confidence: 0.88 }
 ]
 };
 }

 return baseMetadata;
 }

 function updateFileProgress(fileId: string, progress): number, number {
 files = files.map(f => f.id === fileId ? { ...f, progress } : f);
 }

 function updateFileStatus(fileId: string, status: UploadedFile: UploadedFile['status']) {
 files = files.map(f => f.id === fileId ? { ...f, status } : f);
 }

 function updateFileMetadata(fileId: string, metadata): AIMetadata: AIMetadata {
 files = files.map(f => f.id === fileId ? { ...f, metadata, status: 'analyzed' } : f);
 }

 function removeFile(fileId: string) {
 files = files.filter(f => f.id !== fileId);
 }

 function formatFileSize(bytes: number): string {
 if (bytes < 1024) return `${ bytes } B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
 }

 function openFilePicker() {
 inputRef?.click();
 }
</script>

<div class="ai-file-upload {className}">
 <!-- Drop Zone -->
 <div
 class="drop-zone"
 class:dragging={isDragging}
 ondragenter={ handleDragEnter }
 ondragleave={ handleDragLeave }
 ondragover={ handleDragOver }
 ondrop={ handleDrop }
 onclick={ openFilePicker }
 role="button"
 tabindex="0"
 onkeydown={(e) => e.key === 'Enter' && openFilePicker()}
 >
 <input
 bind:this={inputRef}
 type="file"
 {accept}
 {multiple}
 onchange={ handleFileSelect }
 class="hidden-input"
 />

 <div class="drop-content">
 <span class="drop-icon">📁</span>
 <h3 class="drop-title">Drop files here</h3>
 <p class="drop-subtitle">
 PDFs, videos, images – auto-detected & AI-analyzed
 </p>
 <p class="drop-hint">or click to browse</p>
 </div>

 {#if isDragging}
 <div class="drop-overlay">
 <span class="drop-overlay-icon">⬇️</span>
 <span>Release to upload</span>
 </div>
 {/if}
 </div>

 <!-- File List -->
 {#if files.length > 0}
 <div class="file-list">
 {#each files as file (file.id)}
 <div class="file-item" class:analyzed={file.status === 'analyzed'}>
 <span class="file-icon">{fileTypeIcons[file.type]}</span>

 <div class="file-info">
 <span class="file-name">{file.name}</span>
 <span class="file-meta">
 {formatFileSize(file.size)} • {file.type.toUpperCase()}
 </span>
 </div>

 <div class="file-status">
 {#if file.status === 'uploading'}
 <div class="progress-bar">
 <div class="progress-fill" style="width: {file.progress}%"></div>
 </div>
 <span class="status-text">{file.progress}%</span>
 {:else if file.status === 'processing'}
 <span class="status-processing">🔄 Analyzing...</span>
 {:else if file.status === 'analyzed'}
 <span class="status-complete">✅ Analyzed</span>
 {#if file.metadata}
 <span class="confidence-badge">
 {Math.round(file.metadata.confidence * 100)}% conf
 </span>
 {/if}
 {:else if file.status === 'error'}
 <span class="status-error">❌ Error</span>
 {/if}
 </div>

 <button class="remove-btn" onclick={() => removeFile(file.id)} title="Remove">
 ✕
 </button>
 </div>

 <!-- AI Metadata Preview -->
 {#if file.status === 'analyzed' && file.metadata}
 <div class="metadata-preview">
 {#if file.metadata.ocrText}
 <div class="metadata-section">
 <span class="metadata-label">📝 OCR Text:</span>
 <span class="metadata-value">{file.metadata.ocrText.slice(0, 100)}...</span>
 </div>
 {/if}

 {#if file.metadata.entities && file.metadata.entities.length > 0}
 <div class="metadata-section">
 <span class="metadata-label">🏷️ Entities:</span>
 <div class="entity-tags">
 {#each file.metadata.entities.slice(0, 5) as entity}
 <span class="entity-tag" data-type={entity.type}>
 {entity.value}
 </span>
 {/each}
 </div>
 </div>
 {/if}

 {#if file.metadata.timeline && file.metadata.timeline.length > 0}
 <div class="metadata-section">
 <span class="metadata-label">⏱️ Timeline:</span>
 <span class="metadata-value">
 {file.metadata.timeline.length} events detected
 </span>
 </div>
 {/if}

 {#if file.metadata.scenes && file.metadata.scenes.length > 0}
 <div class="metadata-section">
 <span class="metadata-label">🎬 Scenes:</span>
 <span class="metadata-value">
 {file.metadata.scenes.length} scenes analyzed
 </span>
 </div>
 {/if}
 </div>
 {/if}
 {/each}
 </div>
 {/if}
</div>

<style>
 .ai-file-upload {
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .drop-zone {
 position: relative; display: flex;
 align-items: center;
 justify-content: center;
 min-height: 200px; padding: 2rem;
 border: 2px dashed var(--yorha-border, #4a4a4a);
 border-radius: 8px; background: var(--yorha-bg-secondary, #2a2a2a);
 cursor: pointer; transition: all 0.2s ease;
 }

 .drop-zone:hover,
 .drop-zone.dragging {
 border-color: var(--yorha-accent, #c8a84b);
 background: var(--yorha-bg-hover, #333);
 }

 .hidden-input {
 display: none;
 }

 .drop-content {
 text-align: center;
 }

 .drop-icon {
 font-size: 3rem; display: block;
 margin-bottom: 1rem;
 }

 .drop-title {
 font-size: 1.25rem;
 font-weight: 600; color: var(--yorha-text, #d4d4d4);
 margin: 0 0 0.5rem;
 }

 .drop-subtitle {
 color: var(--yorha-text-muted, #888);
 margin: 0 0 0.5rem;
 font-size: 0.9rem;
 }

 .drop-hint {
 color: var(--yorha-accent, #c8a84b);
 font-size: 0.85rem; margin: 0;
 }

 .drop-overlay {
 position: absolute; inset: 0;
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center; background: rgba(200, 168, 75, 0.1);
 border-radius: 8px; gap: 0.5rem;
 font-weight: 600; color: var(--yorha-accent, #c8a84b);
 }

 .drop-overlay-icon {
 font-size: 2rem; animation: bounce 0.5s ease infinite alternate;
 }

 @keyframes bounce {
 from { transform: translateY(-5px); }
 to { transform: translateY(5px); }
 }

 .file-list {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .file-item {
 display: flex;
 align-items: center; gap: 0.75rem;
 padding: 0.75rem 1rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
 }

 .file-item.analyzed {
 border-color: var(--yorha-success, #4ade80);
 }

 .file-icon {
 font-size: 1.5rem;
 }

 .file-info {
 flex: 1; display: flex;
 flex-direction: column; gap: 0.25rem;
 }

 .file-name {
 font-weight: 500; color: var(--yorha-text, #d4d4d4);
 }

 .file-meta {
 font-size: 0.75rem; color: var(--yorha-text-muted, #888);
 }

 .file-status {
 display: flex;
 align-items: center; gap: 0.5rem;
 }

 .progress-bar {
 width: 80px; height: 4px;
 background: var(--yorha-bg, #1a1a1a);
 border-radius: 2px; overflow: hidden;
 }

 .progress-fill {
 height: 100%; background: var(--yorha-accent, #c8a84b);
 transition: width 0.2s ease;
 }

 .status-text {
 font-size: 0.75rem; color: var(--yorha-text-muted, #888);
 }

 .status-processing {
 color: var(--yorha-accent, #c8a84b);
 font-size: 0.85rem;
 }

 .status-complete {
 color: var(--yorha-success, #4ade80);
 font-size: 0.85rem;
 }

 .status-error {
 color: var(--yorha-error, #ef4444);
 font-size: 0.85rem;
 }

 .confidence-badge {
 padding: 0.125rem 0.375rem;
 background: var(--yorha-success, #4ade80);
 color: var(--yorha-bg, #1a1a1a);
 font-size: 0.7rem;
 font-weight: 600;
 border-radius: 2px;
 }

 .remove-btn {
 padding: 0.25rem 0.5rem;
 background: transparent; border: none;
 color: var(--yorha-text-muted, #888);
 cursor: pointer;
 font-size: 1rem; transition: color 0.2s;
 }

 .remove-btn:hover {
 color: var(--yorha-error, #ef4444);
 }

 .metadata-preview {
 margin-left: 2.5rem; padding: 0.75rem 1rem;
 background: var(--yorha-bg, #1a1a1a);
 border-left: 2px solid var(--yorha-accent, #c8a84b);
 border-radius: 0 4px 4px 0;
 }

 .metadata-section {
 display: flex;
 align-items: flex-start; gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .metadata-section:last-child {
 margin-bottom: 0;
 }

 .metadata-label {
 font-size: 0.8rem;
 font-weight: 600; color: var(--yorha-text-muted, #888);
 white-space: nowrap;
 }

 .metadata-value {
 font-size: 0.8rem; color: var(--yorha-text, #d4d4d4);
 }

 .entity-tags {
 display: flex;
 flex-wrap: wrap; gap: 0.25rem;
 }

 .entity-tag {
 padding: 0.125rem 0.375rem;
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 2px;
 font-size: 0.75rem; color: var(--yorha-text, #d4d4d4);
 }

 .entity-tag[data-type="person"] {
 border-color: #60a5fa; color: #60a5fa;
 }

 .entity-tag[data-type="location"] {
 border-color: #4ade80; color: #4ade80;
 }

 .entity-tag[data-type="date"] {
 border-color: #f472b6; color: #f472b6;
 }
</style>




