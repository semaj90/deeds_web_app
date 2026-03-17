<script lang="ts">
	import OfficialTextPane from '$lib/components/legal/OfficialTextPane.svelte';

	type ReaderChunk = {
		id: string;
		content: string;
		chunkIndex: number;
		pageStart?: number | null;
		pageEnd?: number | null;
		tokenCount?: number | null;
		citations?: string[];
		nodeHeading?: string | null;
		nodeCitation?: string | null;
		nodePath?: string | null;
	};

	type ReaderNode = {
		id: string;
		heading: string;
		citationLabel?: string | null;
		nodeType?: string;
	};

	let {
		documentId,
		nodeId = null,
		initialChunks = [],
		selectedNode = null,
		onCitationClick,
	}: {
		documentId: string;
		nodeId?: string | null;
		initialChunks?: ReaderChunk[];
		selectedNode?: ReaderNode | null;
		onCitationClick?: (citation: string) => void;
	} = $props();
</script>

<section class="panel flex h-full flex-col overflow-hidden">
	<div class="panel-header">
		<div>
			<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Reader Pane</p>
			<h2 class="mt-1 text-lg font-semibold text-white">
				{selectedNode?.heading ?? 'Full document text'}
			</h2>
		</div>
		{#if selectedNode?.citationLabel}
			<span class="badge font-mono text-[11px] text-blue-200">{selectedNode.citationLabel}</span>
		{/if}
	</div>

	<div class="panel-body flex-1 overflow-y-auto">
		{#if !nodeId}
			<p class="mb-4 text-sm text-zinc-400">
				Showing the current document feed. Select a node in the table of contents to narrow the reader to one section.
			</p>
		{/if}

		<article class="prose prose-invert max-w-none prose-p:my-0 prose-headings:my-0">
			<OfficialTextPane
				{documentId}
				{nodeId}
				{initialChunks}
				{onCitationClick}
			/>
		</article>
	</div>
</section>