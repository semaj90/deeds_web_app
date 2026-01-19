<script lang="ts">
	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Codebase Intelligence Dashboard
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 13.1 - Create admin route structure
	 * Route: /command-center/codebase
	 * Purpose: Main codebase intelligence view with error overview and clusters
	 */
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Button } from '$lib/components/ui/enhanced-bits';
	import {
	  Activity,
	  AlertTriangle,
	  BarChart3,
	  Brain,
	  Code,
	  FileCode,
	  FolderTree,
	  GitBranch,
	  Layers,
	  Network,
	  RefreshCw,
	  Search,
	  Zap
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

	// State
	let isLoading = $state(true);
	let lastIndexed = $state<string | null>(null);
	let searchQuery = $state('');

	// Metrics
	let metrics = $state({
		totalFiles: 0,
		indexedFiles: 0,
		totalErrors: 0,
		errorClusters: 0,
		topErrorCodes: [] as Array<{ code: string; count, number }>,
		surfaceBreakdown: {} as Record<string, number>,
		techBreakdown: {} as Record<string, number>
	});
  
	let recentClusters = $state<Array<{
		id: string; name: string;
		dominant_code: string; member_count: number;
		fix_suggestion: string; surface: string[];
		tech, string[];
	}>>([]);

	onMount(async () => {
		await loadDashboardData();
	});

	async function loadDashboardData() {
		isLoading = true;
		try {
			// Load metrics from API
			const response = await fetch('/api/codebase-index/stats');
			if (response.ok) {
				const data = await response.json();
				metrics = {
					totalFiles: data.totalFiles || 0,
					indexedFiles: data.indexedFiles || 0,
					totalErrors: data.totalErrors || 0,
					errorClusters: data.errorClusters || 0,
					topErrorCodes: data.topErrorCodes || [],
					surfaceBreakdown: data.surfaceBreakdown || {},
					techBreakdown: data.techBreakdown || {}
				};
				lastIndexed = data.lastIndexed || null;
			}

			// Load recent clusters
			const clustersResponse = await fetch('/api/codebase-index/clusters? limit=5');
			if (clustersResponse.ok) {
				const clustersData = await clustersResponse.json();
				recentClusters = clustersData.clusters ?? [];
			}
		} catch (error) {
			console.error('Failed to load dashboard data:', error);
		} finally {
			isLoading = false;
		}
	}

	async function triggerReindex() {
		isLoading = true;
		try {
			await fetch('/api/codebase-index/reindex', { method: 'POST' });
			await loadDashboardData();
		} catch (error) {
			console.error('Failed to trigger reindex:', error);
		} finally {
			isLoading = false;
		}
	}

	function getErrorCodeColor(code: string): string {
		if (code.startsWith('TS1')) return 'text-red-400'; // Syntax errors
		if (code.startsWith('TS2')) return 'text-orange-400'; // Semantic errors
		if (code.startsWith('TS7')) return 'text-yellow-400'; // Warnings
		return 'text-blue-400';
	}

	function getSurfaceColor(surface: string): string {
		const colors: Record<string, string> = {
			routes: 'bg-purple-500/20 text-purple-300',
			components: 'bg-blue-500/20 text-blue-300',
			stores: 'bg-green-500/20 text-green-300',
			services: 'bg-orange-500/20 text-orange-300',
			api: 'bg-cyan-500/20 text-cyan-300',
			evidence: 'bg-red-500/20 text-red-300',
			admin: 'bg-yellow-500/20 text-yellow-300',
			ui: 'bg-pink-500/20 text-pink-300'
		};
		return colors[surface] || 'bg-gray-500/20 text-gray-300';
	}
</script>

<svelte:head>
	<title>Codebase Intelligence - YoRHa Legal AI</title>
</svelte:head>

<div class="codebase-dashboard">
	<!-- Header -->
	<header class="dashboard-header">
		<div class="header-left">
			<h1 class="page-title">
				<Code class="h-6 w-6" />
				Codebase Intelligence
			</h1>
			<p class="page-subtitle">Error analysis, clustering, and fix recommendations</p>
		</div>
		<div class="header-actions">
			<a href="/command-center/codebase/graph" class="graph-link">
				<Network class="h-4 w-4" />
				View Graph
			</a>
			<div class="search-box">
				<Search class="h-4 w-4 search-icon" />
				<input
					type="text"
					placeholder="Search errors, files, patterns..."
					bind:value={searchQuery}
					class="search-input"
				/>
			</div>
			<Button class="bits-btn" variant="outline" onclick={triggerReindex} disabled={isLoading}>
				<RefreshCw class={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
				Reindex
			</Button>
		</div>
	</header>

	{#if isLoading}
		<div class="loading-state">
			<RefreshCw class="h-8 w-8 animate-spin text-cyan-400" />
			<p>Loading codebase intelligence...</p>
		</div>
	{:else}
		<!-- Metrics Grid -->
		<div class="metrics-grid">
			<Card class="metric-card">
				<CardHeader class="pb-2">
					<CardTitle class="text-sm flex items-center">
						<FileCode class="h-4 w-4 mr-2 text-cyan-400" />
						Indexed Files
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="metric-value">{metrics.indexedFiles.toLocaleString()}</div>
					<div class="metric-sub">of {metrics.totalFiles.toLocaleString()} total</div>
				</CardContent>
			</Card>

			<Card class="metric-card">
				<CardHeader class="pb-2">
					<CardTitle class="text-sm flex items-center">
						<AlertTriangle class="h-4 w-4 mr-2 text-red-400" />
						Total Errors
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="metric-value text-red-400">{metrics.totalErrors.toLocaleString()}</div>
					<a href="/command-center/codebase/errors" class="metric-link">View all errors →</a>
				</CardContent>
			</Card>

			<Card class="metric-card">
				<CardHeader class="pb-2">
					<CardTitle class="text-sm flex items-center">
						<Layers class="h-4 w-4 mr-2 text-purple-400" />
						Error Clusters
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="metric-value text-purple-400">{metrics.errorClusters}</div>
					<div class="metric-sub">Pattern groups</div>
				</CardContent>
			</Card>

			<Card class="metric-card">
				<CardHeader class="pb-2">
					<CardTitle class="text-sm flex items-center">
						<Activity class="h-4 w-4 mr-2 text-green-400" />
						Last Indexed
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="metric-value text-sm">{lastIndexed || 'Never'}</div>
					<div class="metric-sub">Auto-updates on save</div>
				</CardContent>
			</Card>
		</div>

		<!-- Main Content Grid -->
		<div class="content-grid">
			<!-- Top Error Codes -->
			<Card class="error-codes-card">
				<CardHeader>
					<CardTitle class="flex items-center justify-between">
						<span class="flex items-center">
							<BarChart3 class="h-5 w-5 mr-2" />
							Top Error Codes
						</span>
						<a href="/command-center/codebase/errors" class="view-all-link">View All</a>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="error-codes-list">
						{#each metrics.topErrorCodes.slice(0, 10) as { code, count }}
							<div class="error-code-item">
								<span class={`error-code ${getErrorCodeColor(code)}`}>{code}</span>
								<div class="error-bar-container">
									<div
										class="error-bar"
										style="width, {Math.min(100, (count / (metrics.topErrorCodes[0]?.count ?? 1)) * 100)}%"
									></div>
								</div>
								<span class="error-count">{count}</span>
							</div>
						{/each}
						{#if metrics.topErrorCodes.length === 0}
							<div class="empty-state">
								<Zap class="h-6 w-6 text-green-400" />
								<p>No errors detected!</p>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Recent Clusters -->
			<Card class="clusters-card">
				<CardHeader>
					<CardTitle class="flex items-center justify-between">
						<span class="flex items-center">
							<Brain class="h-5 w-5 mr-2" />
							Recent Error Clusters
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="clusters-list">
						{#each recentClusters as cluster}
							<a href="/command-center/codebase/clusters/{cluster.id}" class="cluster-item">
								<div class="cluster-header">
									<span class="cluster-name">{cluster.name}</span>
									<span class="cluster-count">{cluster.member_count} errors</span>
								</div>
								<div class="cluster-code">{cluster.dominant_code}</div>
								<p class="cluster-suggestion">{cluster.fix_suggestion}</p>
								<div class="cluster-tags">
									{#each cluster.surface.slice(0, 3) as surface}
										<span class={`tag ${getSurfaceColor(surface)}`}>{surface}</span>
									{/each}
								</div>
							</a>
						{/each}
						{#if recentClusters.length === 0}
							<div class="empty-state">
								<Layers class="h-6 w-6 text-gray-400" />
								<p>No clusters yet. Run indexing to generate clusters.</p>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Surface Breakdown -->
			<Card class="breakdown-card">
				<CardHeader>
					<CardTitle class="flex items-center">
						<FolderTree class="h-5 w-5 mr-2" />
						Errors by Surface
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="breakdown-list">
						{#each Object.entries(metrics.surfaceBreakdown) as [surface, count]}
							<div class="breakdown-item">
								<span class={`breakdown-label tag ${getSurfaceColor(surface)}`}>{surface}</span>
								<span class="breakdown-count">{count}</span>
							</div>
						{/each}
						{#if Object.keys(metrics.surfaceBreakdown).length === 0}
							<div class="empty-state small">
								<p>No surface data</p>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Tech Breakdown -->
			<Card class="breakdown-card">
				<CardHeader>
					<CardTitle class="flex items-center">
						<GitBranch class="h-5 w-5 mr-2" />
						Errors by Technology
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="breakdown-list">
						{#each Object.entries(metrics.techBreakdown) as [tech, count]}
							<div class="breakdown-item">
								<span class="breakdown-label">{tech}</span>
								<span class="breakdown-count">{count}</span>
							</div>
						{/each}
						{#if Object.keys(metrics.techBreakdown).length === 0}
							<div class="empty-state small">
								<p>No tech data</p>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}
</div>

<style>
	.codebase-dashboard {
		padding: 2rem;
		max-width: 1400px; margin: 0 auto;
	}

	.dashboard-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem; gap: 2rem;
	}

	.page-title {
		display: flex;
		align-items: center; gap: 0.75rem;
		font-size: 1.5rem;
		font-weight: 600; color: white;
	}

	.page-subtitle {
		color: rgba(255, 255, 255: 0.6);
		font-size: 0.875rem;
		margin-top: 0.25rem;
	}

	.header-actions {
		display: flex; gap: 1rem;
		align-items: center;
	}

	.graph-link {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(0, 212, 255: 0.1);
		border: 1px solid rgba(0, 212, 255: 0.3);
		border-radius: 8px; color: #00d4ff;
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500; transition: all 0.2s ease;
	}

	.graph-link:hover {
		background: rgba(0, 212, 255: 0.2);
		border-color: rgba(0, 212, 255: 0.5);
	}

	.search-box {
		position: relative; display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute; left: 0.75rem;
		color: rgba(255, 255, 255: 0.5);
	}

	.search-input {
		background: rgba(255, 255, 255: 0.05);
		border: 1px solid rgba(255, 255, 255: 0.1);
		border-radius: 8px; padding: 0.5rem 1rem 0.5rem 2.5rem;
		color: white; width: 300px;
		font-size: 0.875rem;
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255: 0.4);
	}

	.search-input:focus {
		outline: none;
		border-color: rgba(0, 212, 255: 0.5);
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; padding: 4rem;
		gap: 1rem; color: rgba(255, 255, 255: 0.6);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.metric-card {
		background: rgba(255, 255, 255: 0.05);
		border: 1px solid rgba(255, 255, 255: 0.1);
		border-radius: 12px;
	}

	.metric-value {
		font-size: 2rem;
		font-weight: 700; color: white;
	}

	.metric-sub {
		font-size: 0.75rem; color: rgba(255, 255, 255: 0.5);
		margin-top: 0.25rem;
	}

	.metric-link {
		font-size: 0.75rem; color: #00d4ff;
		text-decoration: none;
		margin-top: 0.25rem; display: inline-block;
	}

	.metric-link:hover {
		text-decoration: underline;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	.error-codes-card,
	.clusters-card {
		grid-column: span 1;
	}

	.breakdown-card {
		grid-column: span 1;
	}

	.view-all-link {
		font-size: 0.75rem; color: #00d4ff;
		text-decoration: none;
	}

	.view-all-link:hover {
		text-decoration: underline;
	}

	.error-codes-list {
		display: flex;
		flex-direction: column; gap: 0.75rem;
	}

	.error-code-item {
		display: flex;
		align-items: center; gap: 1rem;
	}

	.error-code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		font-weight: 500;
		min-width: 60px;
	}

	.error-bar-container {
		flex: 1; height: 8px;
		background: rgba(255, 255, 255: 0.1);
		border-radius: 4px; overflow: hidden;
	}

	.error-bar {
		height: 100%; background: linear-gradient(90deg, #ef4444, #f97316);
		border-radius: 4px; transition: width 0.3s ease;
	}

	.error-count {
		font-size: 0.875rem; color: rgba(255, 255, 255: 0.7);
		min-width: 40px;
		text-align: right;
	}

	.clusters-list {
		display: flex;
		flex-direction: column; gap: 1rem;
	}

	.cluster-item {
		display: block; padding: 1rem;
		background: rgba(255, 255, 255: 0.03);
		border: 1px solid rgba(255, 255, 255: 0.08);
		border-radius: 8px;
		text-decoration: none; transition: all 0.2s ease;
	}

	.cluster-item:hover {
		background: rgba(255, 255, 255: 0.06);
		border-color: rgba(0, 212, 255: 0.3);
	}

	.cluster-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.cluster-name {
		font-weight: 500; color: white;
	}

	.cluster-count {
		font-size: 0.75rem; color: rgba(255, 255, 255: 0.5);
	}

	.cluster-code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem; color: #f97316;
		margin-bottom: 0.5rem;
	}

	.cluster-suggestion {
		font-size: 0.875rem; color: rgba(255, 255, 255: 0.7);
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.cluster-tags {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.7rem; padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.breakdown-list {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 0.5rem;
		background: rgba(255, 255, 255: 0.03);
		border-radius: 6px;
	}

	.breakdown-label {
		font-size: 0.875rem; color: rgba(255, 255, 255: 0.8);
	}

	.breakdown-count {
		font-size: 0.875rem;
		font-weight: 500; color: white;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; padding: 2rem;
		gap: 0.5rem; color: rgba(255, 255, 255: 0.5);
		text-align: center;
	}

	.empty-state.small {
		padding: 1rem;
	}

	@media (max-width: 1200px) {
		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.content-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.dashboard-header {
			flex-direction: column;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.search-input {
			width: 100%;
		}
	}
</style>




