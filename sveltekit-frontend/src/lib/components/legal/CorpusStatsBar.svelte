<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	type CorpusStats = {
		documents: number;
		nodes: number;
		chunks: number;
		embeddings: number;
	};

	type StatCard = {
		label: string;
		value: number;
		icon: string;
		toneClass?: string;
	};

	let {
		stats,
		cards = [],
	}: {
		stats?: CorpusStats;
		cards?: StatCard[];
	} = $props();

	const resolvedCards = $derived.by(() => {
		if (cards.length > 0) return cards;
		if (!stats) return [];

		return [
			{ label: 'Documents', value: stats.documents, icon: 'library-big' },
			{ label: 'Nodes', value: stats.nodes, icon: 'folder-tree' },
			{ label: 'Chunks', value: stats.chunks, icon: 'blocks' },
			{ label: 'Embeddings', value: stats.embeddings, icon: 'database' },
		];
	});
</script>

<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	{#each resolvedCards as card}
		<article class="panel overflow-hidden">
			<div class="panel-body flex items-center gap-4">
				<div class={[
					'flex h-11 w-11 items-center justify-center rounded-2xl border',
					card.toneClass ?? 'border-blue-400/20 bg-blue-500/10 text-blue-300',
				].join(' ')}>
					<Icon name={card.icon} class="h-5 w-5" />
				</div>
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{card.label}</p>
					<p class="mt-2 text-3xl font-semibold text-white">{card.value.toLocaleString()}</p>
				</div>
			</div>
		</article>
	{/each}
</section>
