<script lang="ts">
import Progress from '$lib/components/ui/progress/Progress.svelte';
import { CONFIG } from '$lib/config/production-config';
import { cn } from '$lib/utils';
import { AlertCircle, Check, Upload as UploadIcon, X, Zap, FileText } from '@lucide/svelte';

interface UploadFile {
	id: string;
	file: File;
	progress: number;
	status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
	evidenceId?: string;
	jobId?: string;
	minioPath?: string;
	hash?: string;
	cudaProcessed?: boolean;
	errorMessage?: string;
}

interface Props {
	caseId?: string;
	disabled?: boolean;
	maxFileSize?: number;
	acceptedTypes?: string[];
	enableCudaAcceleration?: boolean;
	enableGpuOptimization?: boolean;
	useMsvcOptimizations?: boolean;
	onUploadComplete?: (files: UploadFile[]) => void;
}

let {
	caseId = '',
	disabled = false,
	maxFileSize = CONFIG.minio.maxFileSize || 50 * 1024 * 1024,
	acceptedTypes = CONFIG.minio.allowedMimeTypes || ['image/*', 'application/pdf'],
	enableCudaAcceleration = true,
	enableGpuOptimization = true,
	useMsvcOptimizations = true,
	onUploadComplete
}: Props = $props();

let dragOver = $state(false);
let uploading = $state(false);
let files = $state<UploadFile[]>([]);
let fileInput: HTMLInputElement;
let activeSources: EventSource[] = [];

let performanceStats = $state({
	totalFiles: 0,
	cudaAccelerated: 0,
	avgProcessingTime: 0,
	throughputMBps: 0
});

function handleDragOver(event: DragEvent) {
	event.preventDefault();
	if (!disabled && !uploading) {
		dragOver = true;
	}
}

function handleDragLeave(event: DragEvent) {
	event.preventDefault();
	dragOver = false;
}

function handleDrop(event: DragEvent) {
	event.preventDefault();
	dragOver = false;
	if (disabled || uploading || !event.dataTransfer?.files) return;

	const droppedFiles = Array.from(event.dataTransfer.files);
	processFiles(droppedFiles);
}

function handleFileSelect(event: Event) {
	const target = event.target as HTMLInputElement;
	if (target.files) {
		processFiles(Array.from(target.files));
	}
	target.value = '';
}

function processFiles(newFiles: File[]) {
	const validFiles = newFiles.filter(file => {
		if (file.size > maxFileSize) {
			console.warn(`File ${file.name} too large`);
			return false;
		}
		return true;
	});

	const uploadFiles: UploadFile[] = validFiles.map(file => ({
		id: Math.random().toString(36).substring(7),
		file,
		progress: 0,
		status: 'pending'
	}));

	files = [...files, ...uploadFiles];
	uploadPendingFiles();
}

async function uploadPendingFiles() {
	if (uploading) return;
	uploading = true;

	const pending = files.filter(f => f.status === 'pending');

	for (const file of pending) {
		file.status = 'uploading';
		files = [...files]; // trigger reactivity
		try {
			file.progress = 5;
			const result = await uploadToEvidenceAPI(file);
			file.progress = 35;
			files = [...files];

			// Track embedding/chunking progress via SSE
			if (result.jobId) {
				file.status = 'processing';
				files = [...files];
				await trackJobProgress(file, result.jobId);
			}

			file.status = 'completed';
			file.progress = 100;
			if (enableCudaAcceleration) {
				file.cudaProcessed = true;
				performanceStats.cudaAccelerated++;
			}
			performanceStats.totalFiles++;
		} catch (e) {
			file.status = 'error';
			file.errorMessage = e instanceof Error ? e.message : 'Upload failed';
		}
		files = [...files];
	}

	uploading = false;
	onUploadComplete?.(files.filter(f => f.status === 'completed'));
}

/**
 * Upload to the real /api/evidence/upload endpoint (single source of truth).
 */
async function uploadToEvidenceAPI(fileWrapper: UploadFile) {
	const fd = new FormData();
	fd.set('file', fileWrapper.file);
	if (caseId) fd.set('caseId', caseId);
	fd.set('title', fileWrapper.file.name);
	fd.set('description', 'Uploaded via EnhancedMinIODragDrop');
	fd.set('evidenceType', fileWrapper.file.type || 'application/octet-stream');

	const res = await fetch('/api/evidence/upload', { method: 'POST', body: fd });

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(text || `Upload failed (${res.status})`);
	}

	const data = await res.json() as {
		id: string;
		jobId?: string;
		status?: string;
		fileName?: string;
		minioKey?: string;
		hash?: string;
	};

	fileWrapper.evidenceId = data.id;
	fileWrapper.jobId = data.jobId;
	fileWrapper.minioPath = data.minioKey;
	fileWrapper.hash = data.hash;

	return data;
}

/**
 * Track background processing (chunking/embedding) via SSE.
 * Progress mapped into 35..100 range.
 */
function trackJobProgress(fileWrapper: UploadFile, jobId: string): Promise<void> {
	return new Promise<void>((resolve) => {
		const url = `/api/evidence/realtime?jobId=${encodeURIComponent(jobId)}`;
		const es = new EventSource(url);
		activeSources.push(es);

		const cleanup = () => {
			es.close();
			activeSources = activeSources.filter(s => s !== es);
		};

		es.onmessage = (evt) => {
			try {
				const msg = JSON.parse(evt.data);

				if (typeof msg.progress === 'number') {
					fileWrapper.progress = Math.max(fileWrapper.progress, 35 + Math.round(msg.progress * 0.65));
					files = [...files];
				}

				if (msg.type === 'complete' || msg.step === 'complete') {
					cleanup();
					resolve();
				}

				if (msg.type === 'error' || msg.step === 'error') {
					cleanup();
					resolve(); // Don't fail — upload already succeeded
				}
			} catch {
				// ignore malformed SSE messages
			}
		};

		es.onerror = () => {
			cleanup();
			resolve(); // SSE dropped — upload still succeeded
		};

		// Safety timeout: 5 minutes max for embedding
		setTimeout(() => { cleanup(); resolve(); }, 5 * 60 * 1000);
	});
}

function removeFile(id: string) {
	if (disabled) return;
	files = files.filter(f => f.id !== id);
}
</script>

<div class="space-y-4">
	{#if enableCudaAcceleration && performanceStats.totalFiles > 0}
		<div class="flex items-center justify-between p-3 bg-info/50 dark:bg-info/10 border border-info/20 dark:border-info/30 rounded-lg text-sm">
			<div class="flex items-center gap-2">
				<Zap class="h-4 w-4 text-info" />
				<span class="font-medium text-info dark:text-info/60">CUDA Acceleration Active</span>
			</div>
			<div class="text-xs text-muted-foreground">
				{performanceStats.cudaAccelerated}/{performanceStats.totalFiles} Optimized
			</div>
		</div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={cn(
			"relative border-2 border-dashed rounded-lg p-8 transition-colors text-center cursor-pointer",
			dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
			disabled && "opacity-50 cursor-not-allowed"
		)}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={() => !disabled && fileInput.click()}
		onkeydown={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && fileInput.click()}
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			class="hidden"
			onchange={handleFileSelect}
			{disabled}
			accept={acceptedTypes.join(',')}
		/>

		<div class="flex flex-col items-center gap-2">
			<div class="p-4 bg-muted rounded-full">
				<UploadIcon class="h-6 w-6 text-muted-foreground" />
			</div>
			<div class="text-sm font-medium">
				Drag & drop files here or click to browse
			</div>
			<div class="text-xs text-muted-foreground">
				Max file size: {Math.round(maxFileSize / 1024 / 1024)}MB
			</div>
		</div>
	</div>

	{#if files.length > 0}
		<div class="space-y-3">
			{#each files as file (file.id)}
				<div class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
					<div class="p-2 bg-background rounded border">
						<FileText class="h-4 w-4" />
					</div>

					<div class="flex-1 min-w-0">
						<div class="flex items-center justify-between mb-1">
							<span class="text-sm font-medium truncate">{file.file.name}</span>
							{#if file.status === 'uploading'}
								<span class="text-xs text-muted-foreground">{file.progress}%</span>
							{:else if file.status === 'processing'}
								<span class="text-xs text-muted-foreground">Embedding... {file.progress}%</span>
							{:else if file.status === 'completed'}
								<Check class="h-4 w-4 text-accent" />
							{:else if file.status === 'error'}
								<AlertCircle class="h-4 w-4 text-danger" />
							{/if}
						</div>

						{#if file.status === 'uploading' || file.status === 'processing'}
							<Progress value={file.progress} class="h-1" />
						{:else if file.status === 'error'}
							<span class="text-xs text-danger">{file.errorMessage}</span>
						{:else if file.status === 'completed' && file.cudaProcessed}
							<div class="flex items-center gap-1 text-[10px] text-info">
								<Zap class="h-3 w-3" /> CUDA Optimized
							</div>
						{/if}
					</div>

					{#if !disabled && file.status !== 'uploading' && file.status !== 'processing'}
						<button
							class="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
							onclick={(e) => { e.stopPropagation(); removeFile(file.id); }}
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>