<script lang="ts">
	import EvidenceStats from '$lib/components/yorha/dashboard/EvidenceStats.svelte';
	import UploadZone from '$lib/components/yorha/evidence/UploadZone.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let log = $state<string[]>([]);

	function addLog(msg: string) {
		log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 20);
	}

</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Evidence Dashboard</h1>
		<p class="text-sm opacity-60">Evidence stats with chart data and appStore integration, plus drag-drop upload zone with progress tracking.</p>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<div>
			<h2 class="text-sm font-bold mb-2 opacity-70">Evidence Stats (167L)</h2>
			<EvidenceStats />
		</div>
		<div>
			<h2 class="text-sm font-bold mb-2 opacity-70">Upload Zone (204L)</h2>
			<UploadZone onfilesadded={({ files }) => addLog(`Uploaded ${files.length} file(s)`)} />
		</div>
	</div>

	{#if log.length > 0}
		<div class="mt-6 p-4 rounded border border-sand/20 font-mono text-xs opacity-70 max-h-40 overflow-auto">
			{#each log as entry}
				<div class="py-0.5">{entry}</div>
			{/each}
		</div>
	{/if}
</div>