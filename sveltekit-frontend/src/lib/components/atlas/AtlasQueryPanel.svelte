<script lang="ts">
	import type { AtlasRetrievalResult, AtlasCacheStats } from '$lib/types/atlas.js';

	let {
		result,
		cacheStats,
		loading,
		onQuery,
		onFlushCache,
	}: {
		result: AtlasRetrievalResult | null;
		cacheStats: AtlasCacheStats | null;
		loading: boolean;
		onQuery: (q: string, noCache: boolean) => void;
		onFlushCache: (key: string) => void;
	} = $props();

	let query = $state('');
	let noCache = $state(false);
	let showCache = $state(false);

	function submit() {
		if (query.trim() && !loading) onQuery(query.trim(), noCache);
	}
</script>

<div class="flex flex-col gap-2 p-3 bg-panel rounded-lg border border-sand-5">
	<!-- Input row -->
	<div class="flex gap-2">
		<input
			type="text"
			placeholder="Query — e.g. 'how does the auth middleware work?'"
			class="flex-1 px-3 py-2 rounded bg-panelSoft border border-sand-5 text-sm font-mono
			       focus:outline-none focus:border-accent text-sand-12 placeholder-sand-8"
			bind:value={query}
			onkeydown={(e) => e.key === 'Enter' && submit()}
		/>
		<button
			class="px-4 py-2 rounded bg-accent text-white text-sm font-medium
			       hover:bg-accent/90 disabled:opacity-40 transition-colors flex-shrink-0"
			onclick={submit}
			disabled={loading || !query.trim()}
		>
			{loading ? 'Running…' : 'Run'}
		</button>
	</div>

	<!-- Options + result summary row -->
	<div class="flex items-center gap-4 text-xs text-sand-9">
		<label class="flex items-center gap-1.5 cursor-pointer select-none">
			<input type="checkbox" bind:checked={noCache} />
			bypass cache
		</label>
		<button
			class="hover:text-accent transition-colors"
			onclick={() => (showCache = !showCache)}
		>
			cache stats {showCache ? '▲' : '▼'}
		</button>

		{#if result}
			<div class="flex items-center gap-2 ml-2 pl-2 border-l border-sand-5">
				<span
					class="px-1.5 py-0.5 rounded text-[10px] font-mono
					{result.mode === 'fast' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}"
				>
					{result.mode}
				</span>
				<span>conf <b class="text-sand-12">{(result.confidence * 100).toFixed(0)}%</b></span>
				<span class="font-mono">{result.latencyMs}ms</span>
				{#if result.cacheHit}
					<span class="text-orange-400">⚡ cached</span>
				{/if}
				<span>{result.chunks.length} chunks · {result.sourceRefs.length} refs</span>
			</div>
		{/if}
	</div>

	<!-- Cache stats panel -->
	{#if showCache}
		<div class="bg-panelSoft rounded p-3 text-xs border border-sand-4 space-y-2">
			{#if cacheStats}
				<div class="flex gap-4 text-sand-10">
					<span>Cartridges: <b class="text-sand-12">{cacheStats.cartridgeCount}</b></span>
					<span>Features: <b class="text-sand-12">{cacheStats.featureCardCount}</b></span>
					<span>Topo: <b class="text-sand-12">{cacheStats.topoCacheCount}</b></span>
					<span>Karpathy: <b class="text-sand-12">{cacheStats.karpathyScoreCount}</b></span>
				</div>
				{#if cacheStats.topScoredFiles.length}
					<div class="space-y-0.5">
						<div class="text-sand-8 mb-1">Top blend scores</div>
						{#each cacheStats.topScoredFiles as f}
							<div class="flex justify-between font-mono">
								<span class="text-sand-10 truncate max-w-xs"
									>{f.path.split('/').slice(-2).join('/')}</span
								>
								<span class="text-accent ml-3">{f.blend.toFixed(3)}</span>
							</div>
						{/each}
					</div>
				{/if}
				<div class="flex gap-2 pt-1 border-t border-sand-5">
					{#each ['ace:cartridge:*', 'ace:feature:*', 'ace:topo:*'] as key}
						<button
							class="px-2 py-1 rounded text-[10px] bg-red-900/25 text-red-400
							       hover:bg-red-900/50 transition-colors"
							onclick={() => onFlushCache(key)}
						>
							flush {key.split(':')[1]}
						</button>
					{/each}
				</div>
			{:else}
				<span class="text-sand-8">Cache stats unavailable (Redis offline?)</span>
			{/if}
		</div>
	{/if}
</div>