<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();

	let stats = $state(data.stats);
	let loading = $state(false);
	let lastUpdate = $state(new Date().toISOString());

	// Auto-refresh every 5 seconds
	let autoRefresh = $state(true);
	let refreshInterval: NodeJS.Timeout | null = null;

	$effect(() => {
		if (autoRefresh) {
			refreshInterval = setInterval(async () => {
				await refreshStats();
			}, 5000);
		} else {
			if (refreshInterval) clearInterval(refreshInterval);
		}

		return () => {
			if (refreshInterval) clearInterval(refreshInterval);
		};
	});

	async function refreshStats() {
		loading = true;
		try {
			const res = await fetch('/api/cache/stats');
			if (res.ok) {
				const json = await res.json();
				stats = json.data;
				lastUpdate = new Date().toISOString();
			}
		} catch (err) {
			console.error('Failed to refresh stats:', err);
		} finally {
			loading = false;
		}
	}

	async function invalidateCache(pattern: string) {
		if (!confirm(`Invalidate all keys matching: ${pattern}?`)) return;

		try {
			const res = await fetch('/api/cache/invalidate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pattern })
			});

			if (res.ok) {
				await refreshStats();
				alert('Cache invalidated successfully');
			} else {
				const err = await res.json();
				alert(`Failed: ${err.error || res.statusText}`);
			}
		} catch (err) {
			alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function getHitRateColor(rate: number): string {
		if (rate >= 80) return 'text-green-600';
		if (rate >= 50) return 'text-yellow-600';
		return 'text-red-600';
	}
</script>

<div class="cache-dashboard">
	<div class="header">
		<div class="title-section">
			<h1><Icon name="database" class="inline-block" /> Cache Monitoring Dashboard</h1>
			<p class="subtitle">Real-time cache performance and statistics</p>
		</div>

		<div class="controls">
			<label class="auto-refresh">
				<input type="checkbox" bind:checked={autoRefresh} />
				Auto-refresh (5s)
			</label>

			<button class="refresh-btn" onclick={refreshStats} disabled={loading}>
				<Icon name={loading ? 'loader-circle' : 'refresh-cw'} class={loading ? 'spin' : ''} />
				Refresh
			</button>

			<span class="last-update">
				Last update: {new Date(lastUpdate).toLocaleTimeString()}
			</span>
		</div>
	</div>

	<!-- Overview Cards -->
	<div class="overview-grid">
		<div class="stat-card">
			<div class="stat-icon redis">
				<Icon name="database" />
			</div>
			<div class="stat-content">
				<div class="stat-label">Redis Status</div>
				<div class="stat-value">{stats.redis.connected ? 'Connected' : 'Disconnected'}</div>
				<div class="stat-meta">{stats.redis.totalKeys} total keys</div>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-icon memory">
				<Icon name="cpu" />
			</div>
			<div class="stat-content">
				<div class="stat-label">Memory Cache</div>
				<div class="stat-value">{stats.memory.size} entries</div>
				<div class="stat-meta">{formatBytes(stats.memory.estimatedSize)}</div>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-icon template">
				<Icon name="file-text" />
			</div>
			<div class="stat-content">
				<div class="stat-label">Template Cache</div>
				<div class="stat-value">{stats.template.totalKeys} keys</div>
				<div class="stat-meta">
					{stats.template.metadataKeys} metadata, {stats.template.aiContentKeys} AI
				</div>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-icon export">
				<Icon name="download" />
			</div>
			<div class="stat-content">
				<div class="stat-label">Export Cache</div>
				<div class="stat-value">{stats.export.totalKeys} exports</div>
				<div class="stat-meta">{formatBytes(stats.export.totalSizeBytes)}</div>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-icon llm">
				<Icon name="brain" />
			</div>
			<div class="stat-content">
				<div class="stat-label">LLM Response Cache</div>
				<div class="stat-value">{stats.llm.totalResponses} responses</div>
				<div class="stat-meta">
					Hit rate: <span class={getHitRateColor(stats.llm.hitRate)}
						>{stats.llm.hitRate.toFixed(1)}%</span
					>
				</div>
			</div>
		</div>
	</div>

	<!-- Cache Breakdown -->
	<div class="cache-sections">
		<!-- Redis Cache -->
		<section class="cache-section">
			<h2><Icon name="database" class="inline-block" /> Redis Cache</h2>

			<div class="section-grid">
				<div class="metric-card">
					<div class="metric-label">Total Keys</div>
					<div class="metric-value">{stats.redis.totalKeys}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Memory Used</div>
					<div class="metric-value">{formatBytes(stats.redis.memoryUsed)}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Uptime</div>
					<div class="metric-value">{formatDuration(stats.redis.uptimeMs)}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Connected Clients</div>
					<div class="metric-value">{stats.redis.connectedClients}</div>
				</div>
			</div>

			<div class="key-patterns">
				<h3>Key Patterns</h3>
				<table>
					<thead>
						<tr>
							<th>Pattern</th>
							<th>Count</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.redis.keyPatterns as pattern}
							<tr>
								<td><code>{pattern.pattern}</code></td>
								<td>{pattern.count}</td>
								<td>
									<button
										class="action-btn danger"
										onclick={() => invalidateCache(pattern.pattern)}
									>
										<Icon name="trash-2" />
										Invalidate
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- Template Cache -->
		<section class="cache-section">
			<h2><Icon name="file-text" class="inline-block" /> Template Cache</h2>

			<div class="section-grid">
				<div class="metric-card">
					<div class="metric-label">Metadata Keys</div>
					<div class="metric-value">{stats.template.metadataKeys}</div>
					<div class="metric-meta">Template definitions</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">AI Content Keys</div>
					<div class="metric-value">{stats.template.aiContentKeys}</div>
					<div class="metric-meta">Ollama responses</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Rendered Keys</div>
					<div class="metric-value">{stats.template.renderedKeys}</div>
					<div class="metric-meta">Final templates</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Total Keys</div>
					<div class="metric-value">{stats.template.totalKeys}</div>
				</div>
			</div>

			<div class="actions">
				<button class="action-btn" onclick={() => invalidateCache('template:meta:*')}>
					<Icon name="refresh-cw" />
					Invalidate Metadata
				</button>
				<button class="action-btn" onclick={() => invalidateCache('template:ai:*')}>
					<Icon name="refresh-cw" />
					Invalidate AI Content
				</button>
				<button class="action-btn danger" onclick={() => invalidateCache('template:*')}>
					<Icon name="trash-2" />
					Invalidate All Templates
				</button>
			</div>
		</section>

		<!-- Export Cache -->
		<section class="cache-section">
			<h2><Icon name="download" class="inline-block" /> Report Export Cache</h2>

			<div class="section-grid">
				<div class="metric-card">
					<div class="metric-label">Total Exports</div>
					<div class="metric-value">{stats.export.totalKeys}</div>
					<div class="metric-meta">Cached files</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Total Size</div>
					<div class="metric-value">{formatBytes(stats.export.totalSizeBytes)}</div>
					<div class="metric-meta">Disk usage</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Oldest Export</div>
					<div class="metric-value">
						{#if stats.export.oldestExport}
							{new Date(stats.export.oldestExport).toLocaleTimeString()}
						{:else}
							None
						{/if}
					</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Newest Export</div>
					<div class="metric-value">
						{#if stats.export.newestExport}
							{new Date(stats.export.newestExport).toLocaleTimeString()}
						{:else}
							None
						{/if}
					</div>
				</div>
			</div>

			{#if Object.keys(stats.export.formats).length > 0}
				<div class="format-breakdown">
					<h3>Export Formats</h3>
					<div class="format-grid">
						{#each Object.entries(stats.export.formats) as [format, count]}
							<div class="format-badge">
								<span class="format-name">{format.toUpperCase()}</span>
								<span class="format-count">{count}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="actions">
				<button class="action-btn danger" onclick={() => invalidateCache('report:export:*')}>
					<Icon name="trash-2" />
					Invalidate All Exports
				</button>
			</div>

			<p class="info-note">
				<Icon name="info" class="inline-block" />
				Export cache stores generated HTML, Markdown, and JSON report files. Cache invalidation
				happens automatically when report content changes (Priority #8).
			</p>
		</section>

		<!-- LLM Response Cache -->
		<section class="cache-section">
			<h2><Icon name="brain" class="inline-block" /> LLM Response Cache</h2>

			<div class="section-grid">
				<div class="metric-card">
					<div class="metric-label">Total Responses</div>
					<div class="metric-value">{stats.llm.totalResponses}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Cache Hits</div>
					<div class="metric-value">{stats.llm.hits}</div>
					<div class="metric-meta">Saved LLM calls</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Cache Misses</div>
					<div class="metric-value">{stats.llm.misses}</div>
					<div class="metric-meta">New requests</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Hit Rate</div>
					<div class="metric-value {getHitRateColor(stats.llm.hitRate)}">
						{stats.llm.hitRate.toFixed(1)}%
					</div>
					<div class="metric-meta">
						{#if stats.llm.hitRate >= 80}
							Excellent
						{:else if stats.llm.hitRate >= 50}
							Good
						{:else}
							Needs improvement
						{/if}
					</div>
				</div>
			</div>

			<div class="actions">
				<button class="action-btn danger" onclick={() => invalidateCache('llm:response:*')}>
					<Icon name="trash-2" />
					Invalidate All LLM Responses
				</button>
			</div>
		</section>

		<!-- Memory Cache -->
		<section class="cache-section">
			<h2><Icon name="cpu" class="inline-block" /> In-Memory Cache</h2>

			<div class="section-grid">
				<div class="metric-card">
					<div class="metric-label">Total Entries</div>
					<div class="metric-value">{stats.memory.size}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Estimated Size</div>
					<div class="metric-value">{formatBytes(stats.memory.estimatedSize)}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Default TTL</div>
					<div class="metric-value">{formatDuration(stats.memory.defaultTTL)}</div>
				</div>

				<div class="metric-card">
					<div class="metric-label">Hit Rate</div>
					<div class="metric-value {getHitRateColor(stats.memory.hitRate)}">
						{stats.memory.hitRate.toFixed(1)}%
					</div>
				</div>
			</div>

			<p class="info-note">
				<Icon name="info" class="inline-block" />
				In-memory cache is process-local and resets on server restart
			</p>
		</section>
	</div>
</div>

<style>
	.cache-dashboard {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.title-section h1 {
		font-size: 1.75rem;
		font-weight: 600;
		margin: 0;
		color: var(--sand-dark, #2d2d2d);
	}

	.subtitle {
		color: var(--sand-9, #666);
		margin: 0.25rem 0 0 0;
		font-size: 0.95rem;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.auto-refresh {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--accent, #8b3a3a);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.refresh-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.last-update {
		font-size: 0.85rem;
		color: var(--sand-9, #666);
	}

	.overview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--panel, #fafaf8);
		border: 1px solid var(--sand-6, #ddd);
		border-radius: 8px;
	}

	.stat-icon {
		width: 3rem;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		font-size: 1.5rem;
	}

	.stat-icon.redis {
		background: #dc2626;
		color: white;
	}

	.stat-icon.memory {
		background: #2563eb;
		color: white;
	}

	.stat-icon.template {
		background: #16a34a;
		color: white;
	}

	.stat-icon.export {
		background: #ea580c;
		color: white;
	}

	.stat-icon.llm {
		background: #9333ea;
		color: white;
	}

	.stat-content {
		flex: 1;
	}

	.stat-label {
		font-size: 0.85rem;
		color: var(--sand-9, #666);
		margin-bottom: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--sand-dark, #2d2d2d);
	}

	.stat-meta {
		font-size: 0.8rem;
		color: var(--sand-9, #666);
		margin-top: 0.25rem;
	}

	.cache-sections {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.cache-section {
		background: var(--panel, #fafaf8);
		border: 1px solid var(--sand-6, #ddd);
		border-radius: 8px;
		padding: 1.5rem;
	}

	.cache-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 1.5rem 0;
		color: var(--sand-dark, #2d2d2d);
	}

	.cache-section h3 {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.5rem 0 1rem 0;
		color: var(--sand-dark, #2d2d2d);
	}

	.section-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.metric-card {
		padding: 1rem;
		background: white;
		border: 1px solid var(--sand-5, #e5e5e5);
		border-radius: 6px;
	}

	.metric-label {
		font-size: 0.85rem;
		color: var(--sand-9, #666);
		margin-bottom: 0.5rem;
	}

	.metric-value {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--sand-dark, #2d2d2d);
	}

	.metric-meta {
		font-size: 0.8rem;
		color: var(--sand-9, #666);
		margin-top: 0.25rem;
	}

	.key-patterns table {
		width: 100%;
		border-collapse: collapse;
		background: white;
		border-radius: 6px;
		overflow: hidden;
	}

	.key-patterns th,
	.key-patterns td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--sand-5, #e5e5e5);
	}

	.key-patterns th {
		background: var(--sand-3, #f5f5f5);
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--sand-dark, #2d2d2d);
	}

	.key-patterns code {
		background: var(--sand-3, #f5f5f5);
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-size: 0.85rem;
		font-family: 'Courier New', monospace;
	}

	.format-breakdown {
		margin: 1.5rem 0;
	}

	.format-grid {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.format-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: white;
		border: 1px solid var(--sand-5, #e5e5e5);
		border-radius: 6px;
	}

	.format-name {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--accent, #8b3a3a);
		text-transform: uppercase;
	}

	.format-count {
		font-size: 0.9rem;
		color: var(--sand-9, #666);
		padding: 0.125rem 0.5rem;
		background: var(--sand-3, #f5f5f5);
		border-radius: 12px;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--sand-3, #f5f5f5);
		border: 1px solid var(--sand-6, #ddd);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--sand-dark, #2d2d2d);
	}

	.action-btn:hover {
		background: var(--sand-4, #eee);
	}

	.action-btn.danger {
		background: #fef2f2;
		border-color: #fecaca;
		color: #991b1b;
	}

	.action-btn.danger:hover {
		background: #fee2e2;
	}

	.info-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 4px;
		color: #1e40af;
		font-size: 0.85rem;
		margin-top: 1rem;
	}

	.text-green-600 {
		color: #16a34a;
	}

	.text-yellow-600 {
		color: #ca8a04;
	}

	.text-red-600 {
		color: #dc2626;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
