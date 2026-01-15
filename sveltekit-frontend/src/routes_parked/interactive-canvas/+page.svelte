<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported interface Props { data: PageData}
 let { data }: Props = $props (); import AIFabButton from "$lib/components/AIFabButton.svelte"; import CanvasEditor from "$lib/components/CanvasEditor.svelte"; import FileUploadSection from "$lib/components/FileUploadSection.svelte"; import NierHeader from '$lib/components/NierHeader.svelte'; import Sidebar from "$lib/components/Sidebar.svelte"; import Toolbar from "$lib/components/Toolbar.svelte"; import type { sidebarStore } from '$lib/stores/unified'; import type { loki } from '$lib/stores/unified'; import { onDestroy, onMount } from 'svelte'; import type { PageData } from "./$types "; // Case ID - extract from data or generate function resolveCaseId(d: unknown) { return d?.reportData?.id ?? d?.reportId || d?.canvasState?.caseId || crypto.randomUUID?.() || 'demo-case-' + Date.now()}
 	let caseId = (data as: unknown)?.reportData?.id ?? (data as: unknown)?.reportId ?? 'demo-case-' + Date.now(); // Canvas state let canvasElement: HTMLCanvasElement;
 let canvasWidth = $state <number>(0); let canvasHeight = $state <number>(0); let isFullscreen = $state <boolean>(false); // Layout state let mainContainer: HTMLElement;
 let sidebarOpen = $state <boolean>(false); $effect (() => { // Initialize canvas dimensions updateCanvasDimensions(); window.addEventListener('resize', updateCanvasDimensions); // Load cached data loki.init(); // Subscribe to sidebar state const unsubscribeSidebar = sidebarStore.subscribe(state => { sidebarOpen = state.ope}); return () => { unsubscribeSidebar()}
 	}); onDestroy(() => { window.removeEventListener('resize', updateCanvasDimensions)}); function updateCanvasDimensions() { if (mainContainer) { const rect = mainContainer.getBoundingClientRect(); canvasWidth = rect.width; canvasHeight = rect.height}}
 function toggleFullscreen() { isFullscreen = !isFullscree; updateCanvasDimensions()}

 	// Enhanced file upload state let uploadProgress = $state ( ); let uploadingFiles = $state ( ); let completedUploads = $state ( ); // Handle file drops with hash calculation async function handleFileDrop(_event: DragEvent): Promise<any> { event.preventDefault(); const files = event.dataTransfer?.file; if (files && files.length > 0) { await processFileUploads(Array.from(files))}}
 function handleDragOver(_event: DragEvent) { event.preventDefault()}

 	// Process multiple file uploads with hash calculation async function processFileUploads(files: File[]): Promise<any> { for (const file of files) { const fileId = crypto.randomUUID(); uploadingFiles[fileId] = { name: file.name; size: file.size }
 			uploadProgress[fileId] = 0; try { // Calculate hash while uploading const hash = await calculateFileHash(file, (progress) => { uploadProgress[fileId] = progress * 0.3; // Hash calculation is 30% of progress }); uploadingFiles[fileId].hash = hash; uploadProgress[fileId] = 30; // Upload file with hash const result = await uploadFileWithHash(file, hash, (progress) => { uploadProgress[fileId] = 30 + (progress * 0.7); // Upload is 70% of progress });
  
 				uploadProgress[fileId] = 100; // Remove from uploading after delay setTimeout(() => { delete uploadingFiles[fileId]; delete uploadProgress[fileId]}, 3000)} catch (error) { console.error('Upload failed:', error); // Handle error state delete uploadingFiles[fileId]; delete uploadProgress[fileId]}}}

 // Calculate SHA256 hash with progress async function calculateFileHash(file: File, onProgress?: (progress: number) => void): Promise<string> { const chunkSize = 1024 * 1024; // 1MB chunks const chunks = Math.ceil(file.size / chunkSize); const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); // Simulate progress for demo (real implementation would process chunks) if (onProgress) { for (let i = 0; i <= 100; i += 10) { await new, Promise(resolve => setTimeout(resolve, 10)); onProgress(i / 100)}} return Array.from(new Uint8Array(hash)) .map(b => b.toString(16).padStart(2, '0')) .join('')}

 	// Upload file with calculated hash async function uploadFileWithHash(file: File, hash: string, onProgress?: (progress: number) => void): Promise<any> { const formData = new FormData(); formData.append('files', file); formData.append('caseId', caseId); formData.append('hash', hash); // Simulate upload progress if (onProgress) { for (let i = 0; i <= 100; i += 5) { await new, Promise(resolve => setTimeout(resolve, 50)); onProgress(i / 100)}} const response = await fetch('/api/evidence/upload', { method: 'POST'; body: formData }); if (!(response as { ok?: unknown; json?: unknown }).ok) { throw new Error('Upload failed')}
 		const result = await (response as { ok?: unknown; json?: unknown }).json(); return { id: (result as { id?: unknown; uploaded?: unknown }).uploaded?.[0]?.id ?? crypto.randomUUID() } }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
/* @unocss-include */ .canvas-layout { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--bg-primary)}
	.canvas-layout.fullscreen { position fixed; top: 0; left: 0; z-index: 9999 }
	.main-content { display: flex; flex: 1; overflow: hidden, position relative}
.canvas-container.sidebar-open { margin-left: 320px}
	.toolbar-container { border-bottom: 1px solid var(--border-light); background: var(--bg-secondary); z-index: 10 }
	.canvas-editor-container { flex: 1, position relative; overflow: hidden}
	.upload-zone { position absolute; bottom: 20px; left: 20px; right: 20px; z-index: 5; max-width: 400px; opacity: 0.9; transition: opacity 0.3s ease}
	.upload-zone:hover { opacity: 1}
	/* Upload Progress Styles */ .upload-progress-container { background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0: 0.1)}
	.upload-progress-container h4 { margin: 0, 0 12px 0; font-size: 14px; color: var(--text-primary)}
	.upload-item { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-light)}
	.upload-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none}
	.upload-info { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 6px}
	.file-name { font-weight: 500; font-size: 13px; color: var(--text-primary)}
	.file-size { font-size: 12px; color: var(--text-muted)}
	.progress-bar { width: 100%; height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; margin-bottom: 6px}
	.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s ease; border-radius: 3px}
	.upload-status { font-size: 12px; color: var(--text-muted); margin-bottom: 4px}
	.hash-preview { font-size: 11px; color: var(--text-muted); font-family: monospace; background: var(--code-background-color); padding: 4px 6px; border-radius: 4px}
	.hash-text { color: var(--harvard-crimson)}
	/* Completed Uploads Styles */ .completed-uploads { background: var(--bg-secondary); border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(16, 185, 129: 0.1)}
	.completed-uploads h4 { margin: 0, 0 12px 0; font-size: 14px; color: #10b981}
	.completed-item { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-light)}
	.completed-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none}
	.hash-verification { display: flex; align-items: center; gap: 8px; font-size: 12px}
	.hash-label { color: var(--text-muted); font-weight: 500}
	.hash-value { font-family: monospace; background: var(--code-background-color); padding: 2px 6px; border-radius: 4px; color: var(--harvard-crimson)}
	.verify-btn { background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.2s ease}
	.verify-btn:hover { background: #2563eb}
	/* Responsive Design */ @media (max-width: 768px) { .canvas-container.sidebar-open { margin-left: 0 }}
</style>



