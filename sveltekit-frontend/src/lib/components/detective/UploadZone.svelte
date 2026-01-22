<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { Loader, Upload } from 'lucide-svelte';

	interface Props {
		minimal?: boolean;
		onupload?: (summary: any) => void;
		bucket?: string;
		caseId?: string;
		enableEmbedding?: boolean;
		enableTelemetry?: boolean;
		maxRetries?: number;
	}

	let {
		minimal = false,
		onupload,
		bucket = 'evidence',
		caseId = '',
		enableEmbedding = true,
		enableTelemetry = true,
		maxRetries = 3
	}: Props = $props();

	let isDragging = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let error = $state<string | null>(null);

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			await uploadFiles(Array.from(input.files));
		}
	}

	async function uploadFiles(files: File[]) {
		isUploading = true;
		uploadProgress = 0;
		error = null;

		try {
			// Mock upload logic
			for (let i = 0; i <= 100; i += 10) {
				uploadProgress = i;
				await new Promise((r) => setTimeout(r, 100));
			}

			if (onupload) {
				onupload({ count: files.length, totalBytes: files.reduce((s, f) => s + f.size, 0) });
			}
		} catch (e) {
			error = 'Upload failed: ' + (e instanceof Error ? e.message : String(e));
		} finally {
			isUploading = false;
		}
	}
</script>

<div
	class="nes-container with-title is-centered p-4 {isDragging ? 'is-primary' : ''}"
	role="region"
	aria-label="File upload zone"
>
	<p class="title">UPLOAD {bucket.toUpperCase()}</p>
	{#if isUploading}
		<div class="flex flex-col items-center gap-4">
			<Loader class="animate-spin" />
			<Progress value={uploadProgress} max={100} />
			<p>Processing...</p>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-4">
			<Upload size={32} />
			<p>Drag files here or click to browse</p>
			<input type="file" class="hidden" multiple onchange={handleFileSelect} id="fileInput" />
			<Button onclick={() => document.getElementById('fileInput')?.click()}>Select Files</Button>
		</div>
	{/if}
	{#if error}
		<p class="nes-text is-error mt-2">{error}</p>
	{/if}
</div>

<style>
	.hidden {
		display: none;
	}
</style>






