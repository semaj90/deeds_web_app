<script lang="ts">
	import FileUpload from '$lib/components/ui/modular/FileUpload.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let files = $state<any[]>([]);
	let log = $state<string[]>([]);

	function addLog(msg: string) {
		log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 20);
	}

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Modular File Upload</h1>
		<p class="text-sm opacity-60">Clean drag-and-drop file upload with validation, progress tracking, file list, size formatting, and remove controls.</p>
	</header>

	<FileUpload
		multiple={true}
		maxFiles={5}
		maxSize={25 * 1024 * 1024}
		accept=".pdf,.png,.jpg,.jpeg,.docx"
		bind:files
		supportedFormats={['PDF', 'PNG', 'JPG', 'DOCX']}
		onfileschange={(f) => addLog(`Files changed: ${f.length} file(s)`)}
		onupload={(f) => addLog(`Upload: ${f.name} (${f.size} bytes)`)}
		onremove={(id) => addLog(`Removed: ${id}`)}
	/>

	{#if log.length > 0}
		<div class="mt-6 p-4 rounded border border-sand/20 font-mono text-xs opacity-70 max-h-48 overflow-auto">
			<h3 class="font-bold mb-2 text-sm">Event Log</h3>
			{#each log as entry}
				<div class="py-0.5">{entry}</div>
			{/each}
		</div>
	{/if}
</div>
