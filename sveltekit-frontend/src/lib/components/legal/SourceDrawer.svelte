<script lang="ts">
	import { browser } from '$app/environment';
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	type SourceChunk = {
		documentTitle: string;
		heading?: string | null;
		content: string;
		pageStart?: number | null;
		chunkId: string;
		documentId?: string;
		nodeId?: string;
	};

	let {
		open = $bindable(false),
		title = 'Source material',
		citation = null,
		relatedChunks = [],
	}: {
		open?: boolean;
		title?: string;
		citation?: string | null;
		relatedChunks?: SourceChunk[];
	} = $props();

	let loadedChunks = $state<SourceChunk[]>([]);
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

{#if browser}
	<Dialog.Root open={open} onOpenChange={(nextOpen) => (open = nextOpen)}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
			<Dialog.Content class="panel fixed right-4 top-4 z-50 flex h-[calc(100vh-2rem)] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden">
				<div class="panel-header">
					<div>
						<Dialog.Title class="text-lg font-semibold text-white">{title}</Dialog.Title>
						<Dialog.Description class="mt-1 text-sm text-zinc-400">
							Trace the citation back to the indexed source text.
						</Dialog.Description>
					</div>

					<div class="flex items-center gap-2">
						{#if citationHref}
							<a href={citationHref} class="btn-ghost text-xs text-zinc-300">Open Citation</a>
						{/if}
						<button type="button" class="btn-ghost" onclick={() => (open = false)} aria-label="Close source drawer">
							<Icon name="x" class="h-4 w-4" />
						</button>
					</div>
				</div>

				{#if citation}
					<div class="border-b border-white/8 px-4 py-3 text-sm font-mono text-blue-200">
						{citation}
					</div>
				{/if}

				<div class="panel-body flex-1 overflow-y-auto space-y-3">
					{#if loading}
						<div class="flex h-full items-center justify-center text-sm text-zinc-400">Loading linked source text...</div>
					{:else if loadError}
						<div class="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
					{:else if displayChunks.length === 0}
						<div class="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-zinc-400">
							No linked source text is available for this citation yet.
						</div>
					{:else}
						{#each displayChunks as chunk}
							<article class="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
								<div class="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
									{#if chunk.documentId && chunk.nodeId}
										<a href={`/library/${chunk.documentId}/node/${chunk.nodeId}`} class="font-medium text-blue-300 hover:text-blue-200">
											{chunk.documentTitle}
										</a>
									{:else}
										<span class="font-medium text-blue-300">{chunk.documentTitle}</span>
									{/if}
									{#if chunk.heading}
										<span>•</span>
										<span>{chunk.heading}</span>
									{/if}
									{#if chunk.pageStart}
										<span>•</span>
										<span>p. {chunk.pageStart}</span>
									{/if}
								</div>

								<p class="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-200">{chunk.content}</p>
							</article>
						{/each}
					{/if}
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}