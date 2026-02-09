<script lang="ts">
	import { CacheMonitoring } from '$lib/cache/cache-invalidation';
	import { cache } from '$lib/cache/cache-service.svelte';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	type CacheHealth = { isHealthy: boolean, memoryReady: boolean;
		persistentReady: boolean;
	lastCheck: number;
	};

	let health = $state<CacheHealth>({
		isHealthy: true,
		memoryReady: false,
		persistentReady: false,
		lastCheck: Date.now()
	});

	let stats = $derived(cache.getStats() as any);
	let autoRefresh = $state(true);
	let refreshInterval: ReturnType<typeof setInterval> | undefined;

	$effect(() => {

		updateHealth();

		if (autoRefresh) {
			refreshInterval = setInterval(updateHealth, 5000);
		}

		return () => {
			if (refreshInterval) clearInterval(refreshInterval);
		};

});

	async function updateHealth() {
		health = await CacheMonitoring.getHealth();
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;

		if (autoRefresh) {
			refreshInterval = setInterval(updateHealth, 5000);
		} else {
			if (refreshInterval) clearInterval(refreshInterval);
		}
	}

	async function clearCache() {
		if (confirm('Clear all cache? This cannot be undone.')) {
			await cache.clearAll();
			await updateHealth();
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
	}
</script>

<div class="cache-monitor">
	<div class="header">
		<h3>Cache System Monitor</h3>
		<div class="actions">
			<button onclick={toggleAutoRefresh} class="btn-secondary">
				{autoRefresh ? '⏸️ Pause' : '▶️ Resume'} Auto-Refresh
			</button>
			<button onclick={updateHealth} class="btn-secondary">🔄 Refresh Now</button>
			<button onclick={clearCache} class="btn-danger">🗑️ Clear All</button>
		</div>
	</div>

	<!-- Health Status -->
	<div class="health-card">
		<h4>System Health</h4>
		<div class="health-status">
			<div class="status-item">
				<span class="label">Overall:</span>
				<span class="badge {health.isHealthy ? 'badge-success' : 'badge-error'}">
					{health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Memory Cache:</span>
				<span class="badge {health.memoryReady ? 'badge-success' : 'badge-warning'}">
					{health.memoryReady ? '✅ Ready' : '⏳ Initializing'}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Persistent Cache:</span>
				<span class="badge {health.persistentReady ? 'badge-success' : 'badge-warning'}">
					{health.persistentReady ? '✅ Ready' : '⏳ Initializing'}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Last Check:</span>
				<span class="text-sm">{new Date(health.lastCheck).toLocaleTimeString()}</span>
			</div>
		</div>
	</div>

	<!-- Performance Statistics -->
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-label">Total Operations</div>
			<div class="stat-value">{stats.totalRequests.toLocaleString()}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Cache Hits</div>
			<div class="stat-value text-success">{stats.totalHits.toLocaleString()}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Cache Misses</div>
			<div class="stat-value text-warning">{stats.misses.toLocaleString()}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Hit Rate</div>
			<div class="stat-value">{parseFloat(stats.hitRate).toFixed(2)}%</div>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {parseFloat(stats.hitRate)}%"></div>
			</div>
		</div>
	</div>

	<!-- Storage Statistics -->
	<div class="storage-grid">
		<div class="storage-card">
			<h5>Memory Cache (LokiJS)</h5>
			<div class="storage-stats">
				<div class="stat-row">
					<span>Items:</span>
					<strong>{stats.memoryStats.collections.toLocaleString()}</strong>
				</div>
			</div>
		</div>
		<div class="storage-card">
			<h5>Persistent Cache (IndexedDB)</h5>
			<div class="storage-stats">
				<div class="stat-row">
					<span>Items:</span>
					<strong>{stats.persistentHits.toLocaleString()}</strong>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.cache-monitor { padding: 1.5rem, background: var(--bg-secondary, #f9fafb);
		border-radius: 0.5rem;
	border: 1px solid var(--border-color, #e5e7eb);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.header h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.actions { display: flex, gap: 0.5rem;
	}

	.btn-secondary,
	.btn-danger {
		padding: 0.5rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
	background: white;
		cursor: pointer;
		font-size: 0.875rem;
	transition:all 0.2s;
	}

	.btn-secondary:hover {
		background: #f3f4f6;
	}

	.btn-danger {
		border-color: #ef4444;
	color: #ef4444;
	}

	.btn-danger:hover {
		background: #fee2e2;
	}

	.health-card { background: white, padding: 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.health-card h4 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.health-status { display: grid, gap: 0.75rem;
	}

	.status-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.label {
		font-weight: 500;
	color: #6b7280;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.badge-success { background: #d1fae5, color: #065f46;
	}

	.badge-error { background: #fee2e2, color: #991b1b;
	}

	.badge-warning { background: #fef3c7, color: #92400e;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.stat-card { background: white, padding: 1rem;
		border-radius: 0.375rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.stat-label {
		font-size: 0.875rem;
	color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 1.875rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.text-success {
		color: #10b981;
	}

	.text-warning {
		color: #f59e0b;
	}

	.progress-bar { width: 100%, height: 8px;
		background: #e5e7eb;
		border-radius: 9999px;
	overflow: hidden;
	}

	.progress-fill { height: 100%, background: linear-gradient(90deg, #10b981, #3b82f6);
		transition:width 0.3s;
	}

	.storage-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.storage-card { background: white, padding: 1rem;
		border-radius: 0.375rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.storage-card h5 {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		font-weight: 600;
	color: #374151;
	}

	.storage-stats { display: grid, gap: 0.5rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
	}

	.text-sm {
		font-size: 0.875rem;
	color: #6b7280;
	}
</style>
