<script lang="ts">
	import { untrack } from 'svelte';

	interface Chunk {
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
	}

	type ChunkInput = Chunk | Record<string, unknown>;

	let {
		documentId,
		nodeId = null,
		initialChunks = [],
		onCitationClick,
	}: {
		documentId: string;
		nodeId?: string | null;
		initialChunks?: ChunkInput[];
		onCitationClick?: (citation: string) => void;
	} = $props();

	function optionalString(value: unknown) {
		return typeof value === 'string' && value.length > 0 ? value : null;
	}

	function normalizeCitations(value: unknown, fallback: string | null) {
		if (Array.isArray(value)) {
			return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
		}

		return fallback ? [fallback] : [];
	}

	function normalizeChunk(input: ChunkInput): Chunk {
		const record = input as Record<string, unknown>;
		const nodeCitation = optionalString(record.nodeCitation ?? record.node_citation ?? record.citation_label);

		return {
			id: String(record.id ?? ''),
			content: String(record.content ?? record.chunk_text ?? ''),
			chunkIndex: Number(record.chunkIndex ?? record.chunk_index ?? 0),
			pageStart: typeof (record.pageStart ?? record.page_start) === 'number'
				? (record.pageStart ?? record.page_start) as number
				: null,
			pageEnd: typeof (record.pageEnd ?? record.page_end) === 'number'
				? (record.pageEnd ?? record.page_end) as number
				: null,
			tokenCount: typeof (record.tokenCount ?? record.token_count) === 'number'
				? (record.tokenCount ?? record.token_count) as number
				: null,
			citations: normalizeCitations(record.citations, nodeCitation),
			nodeHeading: optionalString(record.nodeHeading ?? record.node_heading ?? record.heading),
			nodeCitation,
			nodePath: optionalString(record.nodePath ?? record.node_path),
		};
	}

	const initialNormalizedChunks = untrack(() => initialChunks.map(normalizeChunk));

	let chunks = $state<Chunk[]>(initialNormalizedChunks);
	let page = $state(1);
	let loading = $state(false);
	let hasMore = $state(initialNormalizedChunks.length === 20);
	let error = $state<string | null>(null);

	// Reload when nodeId changes
	$effect(() => {
		if (nodeId !== undefined) {
			chunks = [];
			page = 1;
			hasMore = true;
			loadChunks(1, true);
		}
	});

	async function loadChunks(p: number, reset = false) {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const url = new URL(`/api/library/documents/${documentId}/chunks`, location.origin);
			url.searchParams.set('page', String(p));
			url.searchParams.set('limit', '20');
			if (nodeId) url.searchParams.set('nodeId', nodeId);
			const res = await fetch(url.toString());
			if (!res.ok) throw new Error('Failed to load chunks');
			const data = await res.json();
			const newChunks: Chunk[] = Array.isArray(data.chunks)
				? data.chunks.map((c: Record<string, unknown>) => normalizeChunk(c))
				: [];
			if (reset) {
				chunks = newChunks;
			} else {
				chunks = [...chunks, ...newChunks];
			}
			hasMore = data.hasMore;
			page = p;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Load error';
		} finally {
			loading = false;
		}
	}

	function highlightCitations(text: string): string {
		// Very simple highlight: wrap § references
		return text.replace(/(§{1,2}\s*[\d.]+[a-z]?)/g, '<mark class="bg-accent/15 text-accent px-0.5 rounded text-[0.85em]">$1</mark>');
	}
</script>

<div class="flex flex-col gap-3">
	{#if chunks.length === 0 && !loading}
		<p class="text-sand/30 text-sm py-8 text-center">No content found.</p>
	{/if}

	{#each chunks as chunk}
		<div class="group relative bg-sand/3 border border-sand/8 rounded-lg p-5 hover:border-sand/15 transition-colors">
			<!-- Section heading -->
			{#if chunk.nodeHeading}
				<div class="flex items-center gap-2 mb-3 pb-2 border-b border-sand/8">
					<span class="text-xs font-medium text-sand/50">{chunk.nodeHeading}</span>
					{#if chunk.nodeCitation}
						<span class="text-[10px] font-mono text-accent/50">{chunk.nodeCitation}</span>
					{/if}
					{#if chunk.pageStart}
						<span class="ml-auto text-[10px] text-sand/25">p. {chunk.pageStart}</span>
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div
				class="text-sm text-sand/80 leading-relaxed whitespace-pre-wrap font-serif"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html highlightCitations(chunk.content)}
			</div>

			<!-- Citations -->
			{#if chunk.citations?.length}
				<div class="mt-3 pt-2 border-t border-sand/8 flex flex-wrap gap-1.5">
					{#each chunk.citations as cite}
						<button
							onclick={() => onCitationClick?.(cite)}
							class="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent/70 hover:bg-accent/20 hover:text-accent transition-colors"
						>
							{cite}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Metadata -->
			<div class="absolute top-2 right-2 text-[9px] text-sand/20"># {chunk.chunkIndex}</div>
		</div>
	{/each}

	{#if loading}
		<div class="flex items-center justify-center py-6 gap-2 text-sand/30">
			<span class="animate-spin text-sm">⟳</span>
			<span class="text-xs">Loading…</span>
		</div>
	{/if}

	{#if error}
		<p class="text-red-400 text-xs text-center py-4">{error}</p>
	{/if}

	{#if hasMore && !loading}
		<button
			onclick={() => loadChunks(page + 1)}
			class="w-full py-2 text-xs text-sand/40 hover:text-sand/70 border border-sand/10 rounded hover:border-sand/20 transition-colors"
		>
			Load more
		</button>
	{/if}
</div>
