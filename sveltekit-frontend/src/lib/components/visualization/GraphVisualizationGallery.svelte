<script lang="ts">
	/**
	 * GraphVisualizationGallery — Graph layout gallery
	 * Rewritten Session 63: Svelte 5 runes (removed writable stores)
	 */
	import Badge from '$lib/components/ui/badge/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	interface GraphVisualizationResult {
		id: string;
		url: string;
		algorithm: string;
		timestamp: number;
		metrics: { nodes: number; edges: number; density: number };
	}

	let visualizations = $state<GraphVisualizationResult[]>([]);
	let isGenerating = $state(false);
	let selectedVisualization = $state<GraphVisualizationResult | null>(null);
	let cachingStats = $state({ hits: 0, misses: 0, compressionRatio: 0 });
	let viewMode = $state<'grid' | 'list'>('grid');

	async function generateVisualizationsForAllAlgorithms() {
		isGenerating = true;
		setTimeout(() => {
			isGenerating = false;
		}, 2000);
	}
</script>

<div class="graph-gallery space-y-6">
	<div class="header flex justify-between items-center">
		<div>
			<h2 class="text-2xl font-bold tracking-tight">Visualization Gallery</h2>
			<p class="text-muted-foreground">Generated graph layouts and analysis</p>
		</div>
		<div class="actions flex gap-2">
			<Button variant="outline" size="sm" onclick={() => (viewMode = 'grid')}>
				<span class="i-lucide-grid-2x2 w-4 h-4 inline-block"></span>
			</Button>
			<Button variant="outline" size="sm" onclick={() => (viewMode = 'list')}>
				<span class="i-lucide-list w-4 h-4 inline-block"></span>
			</Button>
			<Button disabled={isGenerating} onclick={generateVisualizationsForAllAlgorithms}>
				{#if isGenerating}
					<span class="i-lucide-refresh-cw w-4 h-4 mr-2 animate-spin inline-block"></span> Generating...
				{:else}
					<span class="i-lucide-refresh-cw w-4 h-4 mr-2 inline-block"></span> Generate All
				{/if}
			</Button>
		</div>
	</div>

	{#if isGenerating}
		<div class="loading-state py-12 text-center">
			<div class="nes-progress is-pattern w-full max-w-md mx-auto mb-4"></div>
			<p>Running layout algorithms (Force Atlas 2, Fruchterman-Reingold)...</p>
		</div>
	{:else if visualizations.length === 0}
		<div class="empty-state py-12 text-center border-2 border-dashed rounded-lg">
			<p class="text-muted-foreground mb-4">No visualizations generated yet.</p>
			<Button variant="secondary" onclick={generateVisualizationsForAllAlgorithms}>
				Start Generation
			</Button>
		</div>
	{:else}
		<div
			class={viewMode === 'grid'
				? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
				: 'flex flex-col gap-4'}
		>
			{#each visualizations as viz (viz.id)}
				<Card class="hover:border-primary/50 transition-colors cursor-pointer">
					<CardHeader>
						<CardTitle class="text-base flex justify-between">
							{viz.algorithm}
							<Badge variant="secondary"
								>{new Date(viz.timestamp).toLocaleTimeString()}</Badge
							>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="aspect-video bg-muted rounded relative overflow-hidden">
							<div
								class="absolute inset-0 flex items-center justify-center text-muted-foreground"
							>
								Preview
							</div>
						</div>
						<div class="metrics mt-4 flex gap-4 text-xs text-muted-foreground">
							<span>{viz.metrics.nodes} Nodes</span>
							<span>{viz.metrics.edges} Edges</span>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
