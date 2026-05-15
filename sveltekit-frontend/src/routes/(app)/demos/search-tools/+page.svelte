<script lang="ts">
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import SearchBox from '$lib/components/ui/SearchBox.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let searchValue = $state('');
	let log = $state<string[]>([]);

	function addLog(msg: string) {
		log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 20);
	}

</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Search Tools</h1>
		<p class="text-sm opacity-60">Two search UI components: SearchBar with debounce and filters, SearchBox with API endpoint integration and expand/collapse.</p>
	</header>

	<h2 class="text-sm font-bold mb-3 opacity-70">SearchBar (82L) — debounced input</h2>
	<SearchBar bind:value={searchValue} onsearch={(q) => addLog(`SearchBar: "${q}"`)} />

	<div class="mt-8">
		<h2 class="text-sm font-bold mb-3 opacity-70">SearchBox (170L) — API-integrated</h2>
		<SearchBox onResults={(results) => addLog(`SearchBox: ${results.length} results`)} />
	</div>

	{#if log.length > 0}
		<div class="mt-6 p-4 rounded border border-sand/20 font-mono text-xs opacity-70 max-h-40 overflow-auto">
			{#each log as entry}
				<div class="py-0.5">{entry}</div>
			{/each}
		</div>
	{/if}
</div>
