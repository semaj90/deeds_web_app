<script lang="ts">
import Icon from '$lib/components/ui/Icon.svelte';

interface GraphNode {
	id: string;
	label: string;
	type: 'file' | 'directory';
	path: string;
	extension?: string;
	size: number;
	domain?: string;
	complexity?: string;
	group: number;
}

interface GraphData {
	nodes: GraphNode[];
	edges: any[];
	stats: {
		totalFiles: number;
		totalChunks: number;
		totalDirs: number;
		extensionBreakdown: Record<string, number>;
		domainBreakdown: Record<string, number>;
	};
}

let {
	graphData,
	loading,
	error,
	selectedNode,
	limit = $bindable(),
	searchQuery = $bindable(),
	filterExtension = $bindable(),
	onReload,
	onClearFilters
}: {
	graphData: GraphData | null;
	loading: boolean;
	error: string | null;
	selectedNode: GraphNode | null;
	limit: number;
	searchQuery: string;
	filterExtension: string | null;
	onReload: () => void;
	onClearFilters: () => void;
} = $props();

const sortedExtensions = $derived.by(() => {
	if (!graphData) return [];
	return Object.entries(graphData.stats.extensionBreakdown)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15);
});

function handleExtensionClick(ext: string) {
	filterExtension = filterExtension === ext ? null : ext;
}
</script>

<div class="w-80 bg-[var(--t-panel)] border-r border-[var(--t-border)] flex flex-col h-full">
	<div class="p-4 border-b border-[var(--t-border)]">
		<h1 class="text-xl font-bold flex items-center gap-2 text-[var(--t-text)]">
			<Icon name="network" class="w-5 h-5" />
			Codebase Graph
		</h1>
		<p class="text-xs text-[var(--t-text-muted)] mt-1">
			Interactive knowledge graph
		</p>
	</div>

	<div class="flex-1 overflow-y-auto p-4 space-y-6">
		{#if loading}
			<div class="flex items-center justify-center py-8">
				<div class="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div>
			</div>
		{:else if error}
			<div class="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
				<Icon name="alert-circle" class="w-5 h-5 text-red-500" />
				<div class="text-sm text-red-300/80 mt-2">{error}</div>
			</div>
		{:else if graphData}
			<div class="space-y-2">
				<h3 class="text-sm font-semibold text-[var(--t-text)]">Statistics</h3>
				<div class="bg-[var(--t-bg)] rounded-lg p-3 space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-[var(--t-text-muted)]">Files:</span>
						<span class="font-mono text-[var(--t-text)]">{graphData.stats.totalFiles.toLocaleString()}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-[var(--t-text-muted)]">Chunks:</span>
						<span class="font-mono text-[var(--t-text)]">{graphData.stats.totalChunks.toLocaleString()}</span>
					</div>
				</div>
			</div>

			<div class="space-y-2">
				<h3 class="text-sm font-semibold text-[var(--t-text)]">Search</h3>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Filter files..."
					class="w-full px-3 py-2 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-sm"
				/>
				{#if searchQuery || filterExtension}
					<button
						onclick={onClearFilters}
						class="w-full px-3 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm"
					>
						Clear Filters
					</button>
				{/if}
			</div>

			<div class="space-y-2">
				<h3 class="text-sm font-semibold text-[var(--t-text)]">File Types</h3>
				<div class="space-y-1">
					{#each sortedExtensions as [ext, count]}
						<button
							onclick={() => handleExtensionClick(ext)}
							class="w-full flex justify-between px-3 py-2 rounded-lg text-sm {filterExtension === ext ? 'bg-blue-600 text-white' : 'bg-[var(--t-bg)] hover:bg-[var(--t-hover)]'}"
						>
							<span class="font-mono">{ext}</span>
							<span class="text-xs opacity-70">{count}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="space-y-2">
				<label class="block text-sm text-[var(--t-text-muted)]">
					Sample: {limit.toLocaleString()}
				</label>
				<input
					type="range"
					bind:value={limit}
					min="100"
					max="15651"
					step="100"
					class="w-full"
				/>
				<button
					onclick={onReload}
					class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
				>
					Reload Graph
				</button>
			</div>
		{/if}
	</div>
</div>
