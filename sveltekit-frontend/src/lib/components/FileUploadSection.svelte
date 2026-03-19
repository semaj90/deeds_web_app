<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		accept?: string;
		multiple?: boolean;
		maxSizeMB?: number;
		label?: string;
		onfiles?: (files: File[]) => void;
		disabled?: boolean;
		class?: string;
	}

	let {
		accept = '.pdf,.doc,.docx,.txt,.jpg,.png',
		multiple = true,
		maxSizeMB = 50,
		label = 'Upload Files',
		onfiles,
		disabled = false,
		class: className = ''
	}: Props = $props();

	let dragOver = $state(false);
	let fileInput: HTMLInputElement | undefined = $state(undefined);
	let selectedFiles = $state<File[]>([]);
	let error = $state<string | null>(null);

	function validateFiles(files: FileList | null): File[] {
		if (!files) return [];
		error = null;
		const valid: File[] = [];
		const maxBytes = maxSizeMB * 1024 * 1024;

		for (const f of files) {
			if (f.size > maxBytes) {
				error = `${f.name} exceeds ${maxSizeMB}MB limit`;
				continue;
			}
			valid.push(f);
		}
		return valid;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (disabled) return;
		const files = validateFiles(e.dataTransfer?.files ?? null);
		if (files.length > 0) {
			selectedFiles = multiple ? [...selectedFiles, ...files] : files.slice(0, 1);
			onfiles?.(selectedFiles);
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = validateFiles(input.files);
		if (files.length > 0) {
			selectedFiles = multiple ? [...selectedFiles, ...files] : files.slice(0, 1);
			onfiles?.(selectedFiles);
		}
		input.value = '';
	}

	function removeFile(idx: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== idx);
		onfiles?.(selectedFiles);
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
</script>

<div class="flex flex-col gap-2 {className}">
	<!-- Drop Zone -->
	<button
		class="w-full border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer bg-transparent {dragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-stone-700'} {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
		ondragover={(e) => { e.preventDefault(); if (!disabled) dragOver = true; }}
		ondragleave={() => dragOver = false}
		ondrop={handleDrop}
		onclick={() => !disabled && fileInput?.click()}
		{disabled}
	>
		<Icon name="upload" size={24} class="mx-auto mb-2 text-stone-500" />
		<p class="text-sm text-stone-400 m-0">{label}</p>
		<p class="text-[11px] text-stone-600 mt-1 m-0">Drag & drop or click to browse. Max {maxSizeMB}MB per file.</p>
	</button>

	<input
		bind:this={fileInput}
		type="file"
		{accept}
		{multiple}
		class="hidden"
		onchange={handleFileInput}
	/>

	<!-- Error -->
	{#if error}
		<div class="text-red-400 text-xs flex items-center gap-1.5 px-1">
			<Icon name="triangle-alert" size={12} />
			{error}
		</div>
	{/if}

	<!-- File List -->
	{#if selectedFiles.length > 0}
		<div class="flex flex-col gap-1">
			{#each selectedFiles as file, idx}
				<div class="flex items-center gap-2 px-3 py-1.5 rounded bg-stone-800/50 border border-stone-700 text-sm">
					<Icon name="file" size={14} class="text-stone-500 shrink-0" />
					<span class="text-stone-300 truncate flex-1">{file.name}</span>
					<span class="text-stone-600 text-[11px] shrink-0">{formatSize(file.size)}</span>
					<button
						class="text-stone-600 hover:text-red-400 bg-transparent border-none cursor-pointer p-0.5 shrink-0 transition-colors"
						onclick={() => removeFile(idx)}
						title="Remove file"
					>
						<Icon name="x" size={14} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
