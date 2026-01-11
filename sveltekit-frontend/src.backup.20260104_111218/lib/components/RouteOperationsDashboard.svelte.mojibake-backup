<script lang="ts">
	import type { OperationReport } from '$lib/utils/route-operation-logger';
	import { onMount } from 'svelte';

	let report = $state<OperationReport | null>(null);
	let loading = $state(true);
	let filter = $state<'all' | 'phase72' | 'phase82' | 'high' | 'medium' | 'low'>('all');
	let selectedCategory = $state<string | null>(null);

	onMount(() => {
    (async () => {
  		try {
  			const res = await fetch('/api/route-operations/log');
  			if (res.ok) {
  				report = await res.json();
  			}
  		} catch (err) {
  			console.error('Failed to load operations log:', err);
  		} finally {
  			loading = false;
  		}
    })();
  });

	function getFilteredOperations() {
		if (!report) return [];

		let filtered = report.operations;

		if (filter === 'phase72') {
			filtered = filtered.filter(op => op.phase === 72);
		} else if (filter === 'phase82') {
			filtered = filtered.filter(op => op.phase === 82);
		} else if (filter === 'high' || filter === 'medium' || filter === 'low') {
			filtered = filtered.filter(op => op.priority === filter);
		}

		if (selectedCategory) {
			filtered = filtered.filter(op => op.category === selectedCategory);
		}

		return filtered;
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'success':
				return '#00c853';
			case 'warning':
				return '#ff9800';
			case 'error':
				return '#f44336';
			default:
				return '#999';
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'high':
				return '#f44336';
			case 'medium':
				return '#ff9800';
			case 'low':
				return '#4caf50';
			default:
				return '#999';
		}
	}
</script>

<div class="operations-dashboard">
	<header class="dashboard-header">
		<h1>Route Operations Log</h1>
		<p>Phase 72 (Error Brain) + Phase 82 (Svelte 5 Upgrade) Activity</p>
	</header>

	{#if loading}
		<div class="loading">Loading operations log...</div>
	{:else if !report}
		<div class="error">Failed to load operations log</div>
	{:else}
		<!-- Summary Stats -->
		<div class="summary-stats">
			<div class="stat-card">
				<div class="stat-label">Total Operations</div>
				<div class="stat-value">{report.totalOperations}</div>
			</div>

			<div class="stat-card">
				<div class="stat-label">Phase 72</div>
				<div class="stat-value">{report.byPhase[72] || 0}</div>
			</div>

			<div class="stat-card">
				<div class="stat-label">Phase 82</div>
				<div class="stat-value">{report.byPhase[82] || 0}</div>
			</div>

			<div class="stat-card success">
				<div class="stat-label">✅ Success</div>
				<div class="stat-value">{report.byStatus.success || 0}</div>
			</div>

			<div class="stat-card warning">
				<div class="stat-label">⚠️ Warning</div>
				<div class="stat-value">{report.byStatus.warning || 0}</div>
			</div>

			<div class="stat-card error">
				<div class="stat-label">❌ Error</div>
				<div class="stat-value">{report.byStatus.error || 0}</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="filters">
			<div class="filter-group">
				<label>Filter by Phase:</label>
				<select bind:value={filter}>
					<option value="all">All</option>
					<option value="phase72">Phase 72 (Error Brain)</option>
					<option value="phase82">Phase 82 (Svelte 5 Upgrade)</option>
				</select>
			</div>

			<div class="filter-group">
				<label>Filter by Priority:</label>
				<select bind:value={filter}>
					<option value="all">All</option>
					<option value="high">High</option>
					<option value="medium">Medium</option>
					<option value="low">Low</option>
				</select>
			</div>

			<div class="filter-group">
				<label>Filter by Category:</label>
				<select bind:value={selectedCategory}>
					<option value={null}>All</option>
					{#each Object.keys(report.byCategory) as category}
						<option value={category}>{category}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Operations Table -->
		<div class="operations-table-container">
			<table class="operations-table">
				<thead>
					<tr>
						<th>Timestamp</th>
						<th>Route</th>
						<th>Category</th>
						<th>Priority</th>
						<th>Phase</th>
						<th>Operation</th>
						<th>Status</th>
						<th>Duration</th>
					</tr>
				</thead>
				<tbody>
					{#each getFilteredOperations() as op (op.timestamp + op.route)}
						<tr class="operation-row status-{op.status}">
							<td class="timestamp">
								{new Date(op.timestamp).toLocaleTimeString()}
							</td>
							<td class="route">{op.route}</td>
							<td class="category">{op.category}</td>
							<td class="priority">
								<span
									class="priority-badge"
									style="background-color: {getPriorityColor(op.priority)}"
								>
									{op.priority.toUpperCase()}
								</span>
							</td>
							<td class="phase">Phase {op.phase}</td>
							<td class="operation">{op.operation}</td>
							<td class="status">
								<span
									class="status-badge"
									style="background-color: {getStatusColor(op.status)}"
								>
									{op.status.toUpperCase()}
								</span>
							</td>
							<td class="duration">{op.duration ? `${op.duration}ms` : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if getFilteredOperations().length === 0}
				<div class="no-operations">No operations match your filters</div>
			{/if}
		</div>

		<!-- Category Breakdown -->
		<div class="breakdown">
			<h3>By Category</h3>
			<div class="breakdown-grid">
				{#each Object.entries(report.byCategory) as [category, count]}
					<div class="breakdown-item">
						<span class="category-name">{category}</span>
						<span class="category-count">{count}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Priority Breakdown -->
		<div class="breakdown">
			<h3>By Priority</h3>
			<div class="breakdown-grid">
				{#each Object.entries(report.byPriority) as [priority, count]}
					<div class="breakdown-item">
						<span class="priority-name">{priority.toUpperCase()}</span>
						<span class="priority-count">{count}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.operations-dashboard {
		background: var(--yorha-bg);
		color: var(--yorha-ink);
		font-family: var(--yorha-font);
		padding: 2rem;
		min-height: 100vh;
	}

	.dashboard-header {
		margin-bottom: 2rem;
		border-bottom: 3px solid var(--yorha-crimson);
		padding-bottom: 1rem;
	}

	.dashboard-header h1 {
		margin: 0;
		font-size: 2rem;
		color: var(--yorha-crimson);
		font-weight: bold;
	}

	.dashboard-header p {
		margin: 0.5rem 0 0 0;
		color: #666;
		font-size: 0.875rem;
	}

	.loading,
	.error {
		padding: 2rem;
		text-align: center;
		background: var(--yorha-paper);
		border: 2px solid var(--yorha-ink);
		border-radius: 4px;
	}

	.error {
		color: var(--yorha-crimson);
	}

	.summary-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: var(--yorha-paper);
		border: 2px solid #ddd;
		border-radius: 4px;
		padding: 1rem;
		text-align: center;
	}

	.stat-card.success {
		border-color: #00c853;
		background: #e8f5e9;
	}

	.stat-card.warning {
		border-color: #ff9800;
		background: #fff3e0;
	}

	.stat-card.error {
		border-color: #f44336;
		background: #ffebee;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: bold;
		color: var(--yorha-ink);
	}

	.filters {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: var(--yorha-paper);
		border: 1px solid #ddd;
		border-radius: 4px;
		flex-wrap: wrap;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.filter-group label {
		font-size: 0.875rem;
		font-weight: bold;
	}

	.filter-group select {
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-family: var(--yorha-font);
		background: white;
		color: var(--yorha-ink);
	}

	.operations-table-container {
		overflow-x: auto;
		margin-bottom: 2rem;
		border: 2px solid var(--yorha-ink);
		border-radius: 4px;
	}

	.operations-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--yorha-paper);
		font-size: 0.875rem;
	}

	.operations-table thead {
		background: var(--yorha-bg-dark);
		color: var(--yorha-paper);
	}

	.operations-table th {
		padding: 0.75rem;
		text-align: left;
		font-weight: bold;
		border-bottom: 2px solid var(--yorha-ink);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.operations-table td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #ddd;
	}

	.operation-row {
		transition: background-color 0.2s ease;
	}

	.operation-row:hover {
		background-color: #f5f5f5;
	}

	.operation-row.status-success {
		background-color: #e8f5e9;
	}

	.operation-row.status-warning {
		background-color: #fff3e0;
	}

	.operation-row.status-error {
		background-color: #ffebee;
	}

	.timestamp {
		font-size: 0.75rem;
		color: #999;
	}

	.route {
		font-weight: bold;
		font-family: var(--yorha-font);
	}

	.priority-badge,
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-size: 0.65rem;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: white;
	}

	.no-operations {
		padding: 2rem;
		text-align: center;
		color: #999;
	}

	.breakdown {
		margin-bottom: 2rem;
	}

	.breakdown h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: bold;
		color: var(--yorha-ink);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.breakdown-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: var(--yorha-paper);
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.category-name,
	.priority-name {
		font-weight: bold;
		font-size: 0.875rem;
	}

	.category-count,
	.priority-count {
		font-size: 1.25rem;
		font-weight: bold;
		color: var(--yorha-crimson);
	}
</style>
