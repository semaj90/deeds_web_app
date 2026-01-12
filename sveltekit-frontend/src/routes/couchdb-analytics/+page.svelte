<script lang="ts">
	import { onMount } from 'svelte';
	import ClusterInspector from './ClusterInspector.svelte';
	import DependencyChart from './DependencyChart.svelte';
	import ErrorPropagationGraph from './ErrorPropagationGraph.svelte';
	import SummaryCard from './SummaryCard.svelte';

	interface Stats {
		total_files: number; total_summaries: number;
		total_clusters: number; files_with_errors: number;
		avg_complexity: number;
	}

	let stats: Stats | null = $state(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let activeTab = $state<'summaries' | 'dependencies' | 'errors' | 'clusters'>('summaries');

	const API_BASE = 'http://localhost:8001/api/analytics';

	async function loadStats() {
		try {
			const response = await fetch(`${API_BASE}/stats`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			stats = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
			console.error('Stats error:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadStats();
	});
</script>

<svelte:head>
	<title>CouchDB Analytics Dashboard</title>
</svelte:head>

<div class="analytics-dashboard">
	<header class="dashboard-header">
		<h1>📊 CouchDB Analytics Dashboard</h1>
		<p class="subtitle">Week 2 Task 5: LLM Summaries • Dependencies • Error Propagation • GPU Clusters</p>
	</header>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading analytics...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<h2>❌ Connection Error</h2>
			<p>{error}</p>
			<p class="hint">Make sure the analytics API server is running on port 8001</p>
			<button onclick={() => loadStats()}>Retry</button>
		</div>
	{:else if stats}
		<!-- Stats Overview -->
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-icon">📁</div>
				<div class="stat-value">{stats.total_files.toLocaleString()}</div>
				<div class="stat-label">Total Files</div>
			</div>

			<div class="stat-card">
				<div class="stat-icon">🤖</div>
				<div class="stat-value">{stats.total_summaries}</div>
				<div class="stat-label">LLM Summaries</div>
			</div>

			<div class="stat-card">
				<div class="stat-icon">🔬</div>
				<div class="stat-value">{stats.total_clusters}</div>
				<div class="stat-label">GPU Clusters</div>
			</div>

			<div class="stat-card">
				<div class="stat-icon">⚠️</div>
				<div class="stat-value">{stats.files_with_errors}</div>
				<div class="stat-label">Files with Errors</div>
			</div>

			<div class="stat-card">
				<div class="stat-icon">📈</div>
				<div class="stat-value">{stats.avg_complexity.toFixed(2)}</div>
				<div class="stat-label">Avg Complexity</div>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="tabs">
			<button
				class:active={activeTab === 'summaries'}
				onclick={() => activeTab = 'summaries'}
			>
				🤖 LLM Summaries
			</button>
			<button
				class:active={activeTab === 'dependencies'}
				onclick={() => activeTab = 'dependencies'}
			>
				🔗 Dependencies
			</button>
			<button
				class:active={activeTab === 'errors'}
				onclick={() => activeTab = 'errors'}
			>
				⚠️ Error Propagation
			</button>
			<button
				class:active={activeTab === 'clusters'}
				onclick={() => activeTab = 'clusters'}
			>
				🔬 GPU Clusters
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'summaries'}
				<SummaryCard apiBase={API_BASE} />
			{:else if activeTab === 'dependencies'}
				<DependencyChart apiBase={API_BASE} />
			{:else if activeTab === 'errors'}
				<ErrorPropagationGraph apiBase={API_BASE} />
			{:else if activeTab === 'clusters'}
				<ClusterInspector apiBase={API_BASE} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.analytics-dashboard {
		padding: 2rem;
		max-width: 1400px; margin: 0 auto;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		min-height: 100vh;
	}

	.dashboard-header {
		text-align: center;
		margin-bottom: 2rem; color: white;
	}

	.dashboard-header h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
	}

	.subtitle {
		font-size: 1rem; opacity: 0.9;
	}

	.loading-state, .error-state {
		text-align: center; padding: 4rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0,0,0,0.1);
	}

	.spinner {
		width: 50px; height: 50px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #667eea;
		border-radius: 50%; animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-state h2 {
		color: #dc2626;
		margin-bottom: 1rem;
	}

	.error-state .hint {
		font-size: 0.875rem; color: #6b7280;
		margin-top: 1rem;
	}

	.error-state button {
		margin-top: 1rem; padding: 0.5rem 1.5rem;
		background: #667eea; color: white;
		border: none;
		border-radius: 6px; cursor: pointer;
		font-weight: 500;
	}

	.error-state button:hover {
		background: #5568d3;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: white; padding: 1.5rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0,0,0,0.1);
		text-align: center; transition: transform 0.2s;
	}

	.stat-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 6px 12px rgba(0,0,0,0.15);
	}

	.stat-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: bold; color: #667eea;
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.875rem; color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.tabs {
		display: flex; gap: 0.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.tabs button {
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.2);
		color: white; border: 2px solid transparent;
		border-radius: 8px; cursor: pointer;
		font-weight: 500; transition: all 0.2s;
		backdrop-filter: blur(10px);
	}

	.tabs button:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.tabs button.active {
		background: white; color: #667eea;
		border-color: white;
		box-shadow: 0 4px 6px rgba(0,0,0,0.1);
	}

	.tab-content {
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0,0,0,0.1);
		padding: 2rem;
		min-height: 500px;
	}
</style>




