<script lang="ts">
	import { browser } from '$app/environment';

	let {
		open = $bindable(false),
		citation,
		relatedChunks = [],
	}: {
		open?: boolean;
		citation?: string | null;
		relatedChunks?: Array<{
			documentTitle: string;
			heading?: string | null;
			content: string;
			pageStart?: number | null;
			chunkId: string;
			documentId?: string;
			nodeId?: string;
		}>;
	} = $props();

	type LoadedChunk = {
		documentTitle: string;
		heading?: string | null;
		content: string;
		pageStart?: number | null;
		chunkId: string;
		documentId?: string;
		nodeId?: string;
	};

	let loadedChunks = $state<LoadedChunk[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	const citationHref = $derived(citation ? `/citations/law/${encodeURIComponent(citation)}` : null);
	const displayChunks = $derived(relatedChunks.length > 0 ? relatedChunks : loadedChunks);

	$effect(() => {
		if (!browser || !open || !citation || relatedChunks.length > 0) return;

		let cancelled = false;
		loading = true;
		loadError = null;

		fetch(`/api/library/citations/${encodeURIComponent(citation)}?limit=8`)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error('Failed to load citation sources');
				}
				return response.json();
			})
			.then((data) => {
				if (cancelled) return;
				loadedChunks = Array.isArray(data?.chunks)
					? data.chunks.map((chunk: Record<string, unknown>) => ({
						documentTitle: String(chunk.documentTitle ?? ''),
						heading: chunk.heading ? String(chunk.heading) : null,
						content: String(chunk.content ?? ''),
						pageStart: typeof chunk.pageStart === 'number' ? chunk.pageStart : null,
						chunkId: String(chunk.chunkId ?? ''),
						documentId: chunk.documentId ? String(chunk.documentId) : undefined,
						nodeId: chunk.nodeId ? String(chunk.nodeId) : undefined,
					}))
					: [];
			})
			.catch((error) => {
				if (cancelled) return;
				loadError = error instanceof Error ? error.message : 'Failed to load citation sources';
				loadedChunks = [];
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if open}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-40 bg-black/40"
		onclick={() => (open = false)}
		aria-label="Close citation drawer"
	></button>

	<!-- Drawer -->
	<aside class="fixed right-0 top-0 h-full w-[380px] z-50 bg-[#1a1a1e] border-l border-sand/10 flex flex-col shadow-xl">
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-4 border-b border-sand/10">
			<div>
				<h2 class="text-sm font-semibold text-sand">Citation Source</h2>
				{#if citationHref}
					<a href={citationHref} class="mt-1 inline-flex items-center gap-1 text-[11px] text-accent/70 hover:text-accent">
						Open citation page
					</a>
				{/if}
			</div>
			<button
				onclick={() => (open = false)}
				class="text-sand/40 hover:text-sand transition-colors text-lg leading-none"
			>
				×
			</button>
		</div>

		<!-- Citation label -->
		{#if citation}
			<div class="px-5 py-3 bg-accent/8 border-b border-accent/15">
				<p class="text-sm font-mono text-accent">{citation}</p>
			</div>
		{/if}

		<!-- Related chunks -->
		<div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
			{#if loading}
				<div class="text-center py-12 text-sand/30">
					<p class="text-xs">Loading linked source text…</p>
				</div>
			{:else if loadError}
				<div class="text-center py-12 text-sand/30">
					<p class="text-xs">{loadError}</p>
				</div>
			{:else if displayChunks.length === 0}
				<div class="text-center py-12 text-sand/30">
					<p class="text-2xl mb-2">⚖️</p>
					<p class="text-xs">No linked source text found in library</p>
					<p class="text-[10px] mt-1 text-sand/20">{citation}</p>
				</div>
			{:else}
				{#each displayChunks as chunk}
					<div class="bg-sand/3 border border-sand/8 rounded-lg p-4">
						{#if chunk.documentId && chunk.nodeId}
							<a href="/library/{chunk.documentId}/node/{chunk.nodeId}" class="text-[10px] text-accent/60 font-medium mb-1 hover:text-accent block">
								{chunk.documentTitle}
							</a>
						{:else}
							<p class="text-[10px] text-accent/60 font-medium mb-1">{chunk.documentTitle}</p>
						{/if}
						{#if chunk.heading}
							<p class="text-xs text-sand/50 mb-2">{chunk.heading}</p>
						{/if}
						<p class="text-xs text-sand/70 leading-relaxed line-clamp-6">{chunk.content}</p>
						{#if chunk.pageStart}
							<p class="text-[9px] text-sand/25 mt-2">p. {chunk.pageStart}</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</aside>
{/if}
