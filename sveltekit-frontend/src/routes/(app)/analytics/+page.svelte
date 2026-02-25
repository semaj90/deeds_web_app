<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data } = $props();

	let summary = $derived(data.summary);
	let patterns = $derived(data.patterns);

	let activeTab = $state<'overview' | 'patterns' | 'cache'>('overview');

	function formatRate(rate: number): string {
		return `${(rate * 100).toFixed(1)}%`;
	}

	function formatMs(ms: number): string {
		return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
	}

	function relativeTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}
</script>

<div class="p-6 max-w-6xl mx-auto">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-[var(--sand-dark)]">User Analytics</h1>
			<p class="text-sm text-[var(--sand-dark)] opacity-60 mt-1">
				ACE context engine feedback — query patterns, cache performance, inference routing
			</p>
		</div>
		<div class="text-xs text-[var(--sand-dark)] opacity-40">
			User: {data.userId}
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 mb-6 border-b border-[var(--sand-dark)]/10">
		{#each ['overview', 'patterns', 'cache'] as tab}
			<button
				class="px-4 py-2 text-sm font-medium transition-colors"
				class:text-[var(--accent)]={activeTab === tab}
				class:border-b-2={activeTab === tab}
				class:border-[var(--accent)]={activeTab === tab}
				class:text-[var(--sand-dark)]={activeTab !== tab}
				class:opacity-60={activeTab !== tab}
				onclick={() => (activeTab = tab as typeof activeTab)}
			>
				{tab === 'overview' ? 'Overview' : tab === 'patterns' ? 'Query Patterns' : 'Cache Performance'}
			</button>
		{/each}
	</div>

	{#if activeTab === 'overview'}
		<!-- Summary Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<div class="flex items-center gap-2 mb-2">
					<span class="i-lucide-activity inline-block w-4 h-4 text-[var(--accent)]"></span>
					<span class="text-xs text-[var(--sand-dark)] opacity-60 uppercase tracking-wide">Total Queries</span>
				</div>
				<div class="text-2xl font-bold text-[var(--sand-dark)]">{summary.totalQueries}</div>
				<div class="text-xs text-[var(--sand-dark)] opacity-40 mt-1">Last 7 days</div>
			</div>

			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<div class="flex items-center gap-2 mb-2">
					<span class="i-lucide-timer inline-block w-4 h-4 text-[var(--accent)]"></span>
					<span class="text-xs text-[var(--sand-dark)] opacity-60 uppercase tracking-wide">Avg Latency</span>
				</div>
				<div class="text-2xl font-bold text-[var(--sand-dark)]">{formatMs(summary.avgLatencyMs)}</div>
				<div class="text-xs text-[var(--sand-dark)] opacity-40 mt-1">Per query</div>
			</div>

			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<div class="flex items-center gap-2 mb-2">
					<span class="i-lucide-database inline-block w-4 h-4 text-[var(--accent)]"></span>
					<span class="text-xs text-[var(--sand-dark)] opacity-60 uppercase tracking-wide">Cache Hit Rate</span>
				</div>
				<div class="text-2xl font-bold text-[var(--sand-dark)]">{formatRate(summary.cacheHitRate)}</div>
				<div class="text-xs text-[var(--sand-dark)] opacity-40 mt-1">LokiJS + IndexedDB + Redis</div>
			</div>

			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<div class="flex items-center gap-2 mb-2">
					<span class="i-lucide-bar-chart-3 inline-block w-4 h-4 text-[var(--accent)]"></span>
					<span class="text-xs text-[var(--sand-dark)] opacity-60 uppercase tracking-wide">Patterns</span>
				</div>
				<div class="text-2xl font-bold text-[var(--sand-dark)]">{patterns.length}</div>
				<div class="text-xs text-[var(--sand-dark)] opacity-40 mt-1">Unique query clusters</div>
			</div>
		</div>

		<!-- Top Intents + Tools -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)] mb-3">Top Intents</h3>
				{#if summary.topIntents.length > 0}
					<ul class="space-y-2">
						{#each summary.topIntents as intent}
							<li class="text-sm text-[var(--sand-dark)] opacity-80 flex items-center gap-2">
								<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
								{intent}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-[var(--sand-dark)] opacity-40 italic">No intents captured yet</p>
				{/if}
			</div>

			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)] mb-3">Most Used Tools</h3>
				{#if summary.mostUsedTools.length > 0}
					<ul class="space-y-2">
						{#each summary.mostUsedTools as tool}
							<li class="text-sm text-[var(--sand-dark)] opacity-80 flex items-center gap-2">
								<span class="w-1.5 h-1.5 rounded-full bg-[var(--info)]"></span>
								{tool}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-[var(--sand-dark)] opacity-40 italic">No tool usage recorded yet</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if activeTab === 'patterns'}
		<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg">
			<div class="p-4 border-b border-[var(--sand-dark)]/10">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)]">Top Query Patterns (30 days)</h3>
				<p class="text-xs text-[var(--sand-dark)] opacity-40 mt-1">
					Repeated queries feed ACE context pre-warming
				</p>
			</div>
			{#if patterns.length > 0}
				<div class="divide-y divide-[var(--sand-dark)]/5">
					{#each patterns as pattern, i}
						<div class="px-4 py-3 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-xs font-mono text-[var(--sand-dark)] opacity-30 w-5">
									{i + 1}
								</span>
								<div>
									<code class="text-xs font-mono text-[var(--sand-dark)] opacity-70">
										{pattern.query_hash}
									</code>
								</div>
							</div>
							<div class="flex items-center gap-4 text-xs text-[var(--sand-dark)] opacity-60">
								<span>{pattern.count}x</span>
								<span>{relativeTime(pattern.last_seen)}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="p-8 text-center">
					<p class="text-sm text-[var(--sand-dark)] opacity-40 italic">
						No query patterns recorded yet. Use chat or search to generate analytics.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'cache'}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)] mb-3">Cache Layers</h3>
				<div class="space-y-3">
					{#each [
						{ name: 'L0: LokiJS', ttl: '5-10min', scope: 'Session' },
						{ name: 'L1: IndexedDB', ttl: '7 days', scope: 'Persistent' },
						{ name: 'L2: Memory', ttl: '5min', scope: 'Server process' },
						{ name: 'L3: Redis', ttl: 'Configurable', scope: 'Cross-request' }
					] as layer}
						<div class="flex items-center justify-between">
							<span class="text-sm text-[var(--sand-dark)]">{layer.name}</span>
							<div class="flex gap-3 text-xs text-[var(--sand-dark)] opacity-50">
								<span>{layer.ttl}</span>
								<span>{layer.scope}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)] mb-3">Hit Rate Breakdown</h3>
				<div class="flex items-center gap-4">
					<div class="flex-1">
						<div class="h-4 rounded-full bg-[var(--panel-soft)] overflow-hidden">
							<div
								class="h-full bg-[var(--accent)] rounded-full transition-all"
								style="width: {summary.cacheHitRate * 100}%"
							></div>
						</div>
					</div>
					<span class="text-sm font-bold text-[var(--sand-dark)]">
						{formatRate(summary.cacheHitRate)}
					</span>
				</div>
				<p class="text-xs text-[var(--sand-dark)] opacity-40 mt-2">
					Combined hit rate across all cache layers
				</p>
			</div>
		</div>

		{#if summary.slowEndpoints.length > 0}
			<div class="bg-[var(--panel)] border border-[var(--sand-dark)]/10 rounded-lg p-4 mt-4">
				<h3 class="text-sm font-semibold text-[var(--sand-dark)] mb-3">Slow Endpoints</h3>
				<div class="space-y-2">
					{#each summary.slowEndpoints as endpoint}
						<div class="text-sm text-[var(--danger)] font-mono">{endpoint}</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
