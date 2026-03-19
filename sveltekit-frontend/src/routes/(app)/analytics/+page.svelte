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

<div class="analytics-page">
	<div class="ana-header">
		<div class="ana-header-left">
			<div class="ana-header-icon">
				<Icon name="bar-chart-3" />
			</div>
			<div>
				<h1 class="ana-title">User Analytics</h1>
				<p class="ana-subtitle">ACE context engine feedback — query patterns, cache performance, inference routing</p>
			</div>
		</div>
		<div class="ana-user-badge">User: {data.userId}</div>
	</div>

	<!-- Tabs -->
	<div class="ana-tabs">
		{#each [
			{ id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
			{ id: 'patterns', label: 'Query Patterns', icon: 'activity' },
			{ id: 'cache', label: 'Cache Performance', icon: 'database' }
		] as tab}
			<button
				class="ana-tab"
				class:active={activeTab === tab.id}
				onclick={() => (activeTab = tab.id as typeof activeTab)}
			>
				<Icon name={tab.icon} />
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'overview'}
		<!-- Summary Cards -->
		<div class="ana-stats-grid">
			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="activity" class="ana-stat-icon" />
					<span class="ana-stat-label">Total Queries</span>
				</div>
				<div class="ana-stat-value">{summary.totalQueries}</div>
				<div class="ana-stat-sub">Last 7 days</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="timer" class="ana-stat-icon" />
					<span class="ana-stat-label">Avg Latency</span>
				</div>
				<div class="ana-stat-value">{formatMs(summary.avgLatencyMs)}</div>
				<div class="ana-stat-sub">Per query</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="database" class="ana-stat-icon" />
					<span class="ana-stat-label">Cache Hit Rate</span>
				</div>
				<div class="ana-stat-value">{formatRate(summary.cacheHitRate)}</div>
				<div class="ana-stat-sub">LokiJS + IndexedDB + Redis</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="bar-chart-3" class="ana-stat-icon" />
					<span class="ana-stat-label">Patterns</span>
				</div>
				<div class="ana-stat-value">{patterns.length}</div>
				<div class="ana-stat-sub">Unique query clusters</div>
			</div>
		</div>

		<!-- Top Intents + Tools -->
		<div class="ana-two-col">
			<div class="ana-card">
				<h3 class="ana-card-title">Top Intents</h3>
				{#if summary.topIntents.length > 0}
					<ul class="ana-list">
						{#each summary.topIntents as intent}
							<li>
								<span class="ana-dot accent"></span>
								{intent}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ana-empty">No intents captured yet</p>
				{/if}
			</div>

			<div class="ana-card">
				<h3 class="ana-card-title">Most Used Tools</h3>
				{#if summary.mostUsedTools.length > 0}
					<ul class="ana-list">
						{#each summary.mostUsedTools as tool}
							<li>
								<span class="ana-dot info"></span>
								{tool}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ana-empty">No tool usage recorded yet</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if activeTab === 'patterns'}
		<div class="ana-card">
			<div class="ana-card-head">
				<h3 class="ana-card-title">Top Query Patterns (30 days)</h3>
				<p class="ana-card-desc">Repeated queries feed ACE context pre-warming</p>
			</div>
			{#if patterns.length > 0}
				<div class="ana-pattern-list">
					{#each patterns as pattern, i}
						<div class="ana-pattern-row">
							<div class="ana-pattern-left">
								<span class="ana-pattern-rank">{i + 1}</span>
								<code class="ana-pattern-hash">{pattern.query_hash}</code>
							</div>
							<div class="ana-pattern-right">
								<span>{pattern.count}x</span>
								<span>{relativeTime(pattern.last_seen)}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="ana-empty-center">
					No query patterns recorded yet. Use chat or search to generate analytics.
				</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'cache'}
		<div class="ana-two-col">
			<div class="ana-card">
				<h3 class="ana-card-title">Cache Layers</h3>
				<div class="ana-cache-layers">
					{#each [
						{ name: 'L0: LokiJS', ttl: '5-10min', scope: 'Session' },
						{ name: 'L1: IndexedDB', ttl: '7 days', scope: 'Persistent' },
						{ name: 'L2: Memory', ttl: '5min', scope: 'Server process' },
						{ name: 'L3: Redis', ttl: 'Configurable', scope: 'Cross-request' }
					] as layer}
						<div class="ana-cache-row">
							<span class="ana-cache-name">{layer.name}</span>
							<div class="ana-cache-meta">
								<span>{layer.ttl}</span>
								<span>{layer.scope}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="ana-card">
				<h3 class="ana-card-title">Hit Rate Breakdown</h3>
				<div class="ana-hit-rate">
					<div class="ana-bar-track">
						<div
							class="ana-bar-fill"
							style="width: {summary.cacheHitRate * 100}%"
						></div>
					</div>
					<span class="ana-bar-label">{formatRate(summary.cacheHitRate)}</span>
				</div>
				<p class="ana-card-desc">Combined hit rate across all cache layers</p>
			</div>
		</div>

		{#if summary.slowEndpoints.length > 0}
			<div class="ana-card ana-card-danger">
				<h3 class="ana-card-title">Slow Endpoints</h3>
				<div class="ana-slow-list">
					{#each summary.slowEndpoints as endpoint}
						<div class="ana-slow-item">{endpoint}</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* ── Page layout ── */
	.analytics-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 1.5rem max(1.5rem, calc(50% - 36rem));
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.analytics-page :global(h1), .analytics-page :global(h2), .analytics-page :global(h3), .analytics-page :global(h4), .analytics-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.analytics-page :global(a) { color: inherit; border-bottom: none; }
	.analytics-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.analytics-page :global(input), .analytics-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.analytics-page :global(.panel), .analytics-page :global(.card), .analytics-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.ana-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.ana-header-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}
	.ana-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(52, 211, 153, 0.15));
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
		flex-shrink: 0;
	}
	.ana-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.ana-subtitle { font-size: 0.75rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.125rem; }
	.ana-user-badge {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.3);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	/* ── Tabs ── */
	.ana-tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding-bottom: 0;
	}
	.ana-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.45);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
		margin-bottom: -1px;
	}
	.ana-tab:hover { color: rgba(212, 199, 163, 0.7); }
	.ana-tab.active {
		color: rgba(96, 165, 250, 0.95);
		border-bottom-color: rgba(96, 165, 250, 0.8);
	}

	/* ── Stats grid ── */
	.ana-stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}
	@media (max-width: 768px) { .ana-stats-grid { grid-template-columns: repeat(2, 1fr); } }
	.ana-stat-card {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.ana-stat-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}
	:global(.ana-stat-icon) { width: 0.9rem; height: 0.9rem; color: rgba(96, 165, 250, 0.7); }
	.ana-stat-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.4);
		font-weight: 600;
	}
	.ana-stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		font-variant-numeric: tabular-nums;
	}
	.ana-stat-sub { font-size: 0.68rem; color: rgba(212, 199, 163, 0.3); margin-top: 0.25rem; }

	/* ── Two column layout ── */
	.ana-two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 768px) { .ana-two-col { grid-template-columns: 1fr; } }

	/* ── Card ── */
	.ana-card {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.ana-card-danger { border-color: rgba(248, 113, 113, 0.2); }
	.ana-card-head { padding-bottom: 0.75rem; border-bottom: 1px solid rgba(212, 199, 163, 0.06); margin-bottom: 0.5rem; }
	.ana-card-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.25rem;
	}
	.ana-card-desc { font-size: 0.7rem; color: rgba(212, 199, 163, 0.35); margin: 0.375rem 0 0; }

	/* ── List ── */
	.ana-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.ana-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.65);
	}
	.ana-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.ana-dot.accent { background: rgba(96, 165, 250, 0.7); }
	.ana-dot.info { background: rgba(56, 189, 248, 0.7); }
	.ana-empty { font-size: 0.8rem; color: rgba(212, 199, 163, 0.3); font-style: italic; margin: 0; }
	.ana-empty-center { padding: 2rem; text-align: center; font-size: 0.8rem; color: rgba(212, 199, 163, 0.3); font-style: italic; }

	/* ── Pattern list ── */
	.ana-pattern-list {
		display: flex;
		flex-direction: column;
	}
	.ana-pattern-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0;
		border-bottom: 1px solid rgba(212, 199, 163, 0.04);
	}
	.ana-pattern-row:last-child { border-bottom: none; }
	.ana-pattern-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.ana-pattern-rank {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.25);
		width: 1.25rem;
	}
	.ana-pattern-hash {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.55);
	}
	.ana-pattern-right {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
	}

	/* ── Cache layers ── */
	.ana-cache-layers { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.5rem; }
	.ana-cache-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ana-cache-name { font-size: 0.8rem; color: rgba(212, 199, 163, 0.75); }
	.ana-cache-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
	}

	/* ── Hit rate bar ── */
	.ana-hit-rate {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 0.5rem 0;
	}
	.ana-bar-track {
		flex: 1;
		height: 1rem;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 9999px;
		overflow: hidden;
	}
	.ana-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, rgba(96, 165, 250, 0.6), rgba(52, 211, 153, 0.6));
		border-radius: 9999px;
		transition: width 0.3s;
	}
	.ana-bar-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.9);
		font-variant-numeric: tabular-nums;
	}

	/* ── Slow endpoints ── */
	.ana-slow-list { display: flex; flex-direction: column; gap: 0.375rem; margin-top: 0.5rem; }
	.ana-slow-item {
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: #f87171;
	}
</style>
