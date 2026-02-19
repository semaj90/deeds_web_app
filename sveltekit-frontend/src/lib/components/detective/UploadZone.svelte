<script lang="ts">
	import { evidenceStore } from '$lib/stores/unified/evidence-store.svelte';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Loader2 from '@lucide/svelte/icons/loader-2';

	let {
		caseId = 'case-001',
		onUploadComplete = (result: any) => {}
	} = $props<{
		caseId?: string;
		onUploadComplete?: (result: any) => void }>();

	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let dropzoneActive = $state(false);

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files?.length) return;
		await uploadFiles(Array.from(input.files));
	}

	async function uploadFiles(files: File[]) {
		isUploading = true;
		uploadProgress = 0;

		try {
			for (const file of files) {
				// Artificial delay / local upload logic
				await new Promise((resolve) => setTimeout(resolve, 500));
				const result = await evidenceStore.uploadEvidence(file, { caseId, type: 'document' });
				onUploadComplete(result);
			}
		} catch (error) {
			console.error('Upload failed:', error);
		} finally {
			isUploading = false;
			uploadProgress = 100 }
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="nes-container is-rounded p-4 flex flex-col items-center justify-center border-dashed border-2 min-h-[150px] transition-colors {dropzoneActive ? 'bg-info/20' : ''}"
	ondragover={(e) => { e.preventDefault(); dropzoneActive = true }}
	ondragleave={() => dropzoneActive = false}
	ondrop={async (e) => {
		e.preventDefault();
		dropzoneActive = false;
		if (e.dataTransfer?.files) {
			await uploadFiles(Array.from(e.dataTransfer.files));
		}
	}}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { (document.querySelector('input[type=file]') as HTMLInputElement)?.click() } }}
	role="region"
	aria-label="File drop zone"
>
	{#if isUploading}
		<Loader2 class="animate-spin mb-2" size={32} />
		<p class="text-xs">UPLOADING DATA...</p>
		<progress class="nes-progress is-primary w-full max-w-[200px]" value={uploadProgress} max="100"></progress>
	{:else}
		<FileUp class="mb-2" size={32} />
		<p class="text-xs text-center">DROP INTEL HERE<br/>OR CLICK TO SCAN</p>
		<label class="mt-2">
			<span class="nes-btn is-primary text-xs">SELECT FILES</span>
			<input type="file" class="hidden" multiple onchange={handleFileSelect} />
		</label>
	{/if}
</div>

<style>
	.hidden { display: none;}
</style>






