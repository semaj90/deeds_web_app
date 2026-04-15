<script lang="ts">
	import CitationCollections from '$lib/components/legal-ai/CitationCollections.svelte';
	import CitedSourcesDrawer from '$lib/components/legal-corpus/CitedSourcesDrawer.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let drawerOpen = $state(false);

	const sampleCollections = [
		{ id: 'col-1', name: 'Fiduciary Duty Cases', isPublic: true, citationCount: 12, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
		{ id: 'col-2', name: 'Contract Law Precedents', isPublic: false, citationCount: 8, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
		{ id: 'col-3', name: 'Evidence Rules', isPublic: true, citationCount: 15, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
	];

	const sampleCitedSources = [
		'Smith v. Jones, 2024 WL 123456 - The court finds that the evidence presented substantially supports the plaintiff\'s claim...',
		'Cal. Civ. Code §1714 - Everyone is responsible for the result of willful acts...',
	];

</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Citation Tools</h1>
		<p class="text-sm opacity-60">Citation collection management and cited sources drawer with Qdrant chunk display and relevance scores.</p>
	</header>

	<h2 class="text-sm font-bold mb-3 opacity-70">Citation Collections</h2>
	<CitationCollections collections={sampleCollections} />

	<div class="mt-6">
		<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm" onclick={() => drawerOpen = true}>
			<Icon name="book-open" size={14} /> Open Cited Sources Drawer
		</button>
	</div>

	<CitedSourcesDrawer bind:open={drawerOpen} citedSources={sampleCitedSources} citation="Smith v. Jones, 2024 WL 123456" statuteTitle="Cal. Civ. Code §1714" />
</div>