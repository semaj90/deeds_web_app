<script lang="ts">
	import SourceDrawer from '$lib/components/legal/SourceDrawer.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let drawerOpen = $state(false);

	const sampleChunks = [
		{ chunkId: 'chunk-1', documentTitle: 'Smith v. Jones (2024)', heading: 'Section IV — Analysis', content: 'The court finds that the evidence presented substantially supports the plaintiff\'s claim regarding breach of fiduciary duty. The defendant\'s assertion that the transaction was conducted at arm\'s length is not supported by the record.', pageStart: 42, documentId: 'doc-001' },
		{ chunkId: 'chunk-2', documentTitle: 'California Civil Code §1714', heading: 'General Duty of Care', content: 'Everyone is responsible, not only for the result of his or her willful acts, but also for an injury occasioned to another by his or her want of ordinary care or skill in the management of his or her property or person.', pageStart: 1, documentId: 'doc-002' },
		{ chunkId: 'chunk-3', documentTitle: 'Evidence Analysis Report', heading: 'Financial Records', content: 'Bank statements from January through March 2024 show a pattern of irregular transfers totaling $847,000, inconsistent with normal business operations for the entity in question.', pageStart: 15, documentId: 'doc-003' },
	];

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Source Drawer</h1>
		<p class="text-sm opacity-60">Citation viewer with bits-ui Dialog, Qdrant chunk display, and page references for RAG source material.</p>
	</header>
	<button
		class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 transition-colors flex items-center gap-2"
		onclick={() => drawerOpen = true}
	>
		<Icon name="book-open" size={16} />
		Open Source Drawer ({sampleChunks.length} chunks)
	</button>
</div>

<SourceDrawer
	bind:open={drawerOpen}
	title="RAG Source Material"
	citation="Smith v. Jones, 2024 WL 123456"
	relatedChunks={sampleChunks}
/>