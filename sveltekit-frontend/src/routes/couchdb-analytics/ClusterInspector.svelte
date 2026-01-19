<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface Cluster {
		cluster_id: string; cluster_label: string;
		affected_files: string[]; severity: string;
		first_seen: string; last_seen: string;
		occurrence_count: number; source: string;
	}

	let clusters = $state<Cluster[]>([]);
	let loading = $state(true);
	let selectedCluster = $state<Cluster | null>(null);
	let filterSeverity = $state<string>('all');
	let sortBy = $state<'size' | 'severity' | 'occurrences'>('size');

	async function loadClusters() {
		loading = true;
		try {
			const params = new URLSearchParams({ limit: '50' });
			if (filterSeverity !== 'all') {
				params.append('severity', filterSeverity);
			}

			const response = await fetch(`${apiBase}/clusters?${params}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			clusters = await response.json();

			// Sort clusters
			sortClusters();
		} catch (err) {
			console.error('Failed to load clusters:', err);
		} finally {
			loading = false;
		}
	}

	function sortClusters() {
		if (sortBy === 'size') {
			clusters.sort((a, b) => b.affected_files.length - a.affected_files.length);
		} else if (sortBy === 'severity') {
			const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
			clusters.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));
		} else if (sortBy === 'occurrences') {
			clusters.sort((a, b) => b.occurrence_count - a.occurrence_count);
		}
	}

	function getSeverityColor(severity: string): string {
		switch (severity.toLowerCase()) {
			case 'error': return '#dc2626';
			case 'warning': return '#f59e0b';
			case 'info': return '#3b82f6';
			default: return '#6b7280';
		}
	}

	function getSeverityIcon(severity: string): string {
		switch (severity.toLowerCase()) {
			case 'error': return '❌';
			case 'warning': return '⚠️';
			case 'info': return 'ℹ️';
			default: return '•';
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	onMount(() => {
		loadClusters();
	});

	$effect(() => {
		sortClusters();
	});
</script>

<div class="cluster-inspector-container">
	<div class="controls">
		<h3>🔬 GPU Error Clusters</h3>

		<div class="control-group">
			<select bind:value={filterSeverity} onchange={() => loadClusters()}>
				<option value="all">All Severities</option>
				<option value="error">Errors Only</option>
				<option value="warning">Warnings Only</option>
				<option value="info">Info Only</option>
			</select>

			<select bind:value={sortBy}>
				<option value="size">Sort by Size</option>
				<option value="severity">Sort by Severity</option>
				<option value="occurrences">Sort by Occurrences</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading cluster data...</div>
	{:else if clusters.length === 0}
		<div class="empty-state">
			<p>No clusters found</p>
			<p class="hint">Run: <code>python backend/scripts/integrate_gpu_clusters.py</code></p>
		</div>
	{:else}
		<div class="cluster-grid">
			<div class="clusters-list">
				{#each clusters as cluster}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="cluster-card"
						class:selected={selectedCluster?.cluster_id === cluster.cluster_id}
						onclick={() => selectedCluster = cluster}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && (selectedCluster = cluster)}
					>
						<div class="cluster-header">
							<div class="severity-badge" style="background, {getSeverityColor(cluster.severity)}">
								{getSeverityIcon(cluster.severity)} {cluster.severity.toUpperCase()}
							</div>
							<div class="file-count">{cluster.affected_files.length} files</div>
						</div>

						<h4 class="cluster-label">{cluster.cluster_label}</h4>

						<div class="cluster-meta">
							<div class="meta-item">
								<span class="meta-icon">🔁</span>
								<span>{cluster.occurrence_count} occurrences</span>
							</div>
							<div class="meta-item">
								<span class="meta-icon">📍</span>
								<span>{cluster.source}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="cluster-detail">
				{#if selectedCluster}
					<div class="detail-header">
						<h3>{selectedCluster.cluster_label}</h3>
						<div class="severity-badge large" style="background, {getSeverityColor(selectedCluster.severity)}">
							{getSeverityIcon(selectedCluster.severity)} {selectedCluster.severity.toUpperCase()}
						</div>
					</div>

					<div class="detail-body">
						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">Cluster ID</span>
								<span class="info-value">{selectedCluster.cluster_id}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Source</span>
								<span class="info-value">{selectedCluster.source}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Occurrences</span>
								<span class="info-value">{selectedCluster.occurrence_count}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Affected Files</span>
								<span class="info-value">{selectedCluster.affected_files.length}</span>
							</div>
						</div>

						<div class="section">
							<h4>📅 Timeline</h4>
							<div class="timeline">
								<div class="timeline-item">
									<span class="timeline-label">First Seen:</span>
									<span class="timeline-value">{formatDate(selectedCluster.first_seen)}</span>
								</div>
								<div class="timeline-item">
									<span class="timeline-label">Last Seen:</span>
									<span class="timeline-value">{formatDate(selectedCluster.last_seen)}</span>
								</div>
							</div>
						</div>

						<div class="section">
							<h4>📁 Affected Files ({selectedCluster.affected_files.length})</h4>
							<div class="files-list">
								{#each selectedCluster.affected_files as file}
									<div class="file-item">
										<span class="file-icon">📄</span>
										<span class="file-path">{file}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<div class="no-selection">
						<div class="icon">🔬</div>
						<p>Select a cluster to view details</p>
						<div class="stats">
							<div class="stat-box">
								<div class="stat-value">{clusters.length}</div>
								<div class="stat-label">Total Clusters</div>
							</div>
							<div class="stat-box">
								<div class="stat-value">{clusters.reduce((sum, c) => sum + c.affected_files.length, 0)}</div>
								<div class="stat-label">Total Files</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.cluster-inspector-container {
		height: 100%;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.controls h3 {
		margin: 0; color: #1f2937;
		font-size: 1.25rem;
	}

	.control-group {
		display: flex; gap: 0.5rem;
	}

	.control-group select {
		padding: 0.5rem 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 6px;
		font-size: 0.875rem; cursor: pointer;
	}

	.loading, .empty-state {
		text-align: center; padding: 3rem;
		color: #6b7280;
	}

	.empty-state .hint {
		margin-top: 1rem;
		font-size: 0.875rem;
	}

	.empty-state code {
		background: #f3f4f6; padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: monospace;
	}

	.cluster-grid {
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 1.5rem; height: calc(100% - 60px);
	}

	.clusters-list {
		overflow-y: auto;
		max-height: 600px;
	}

	.cluster-card {
		background: white; border: 2px solid #e5e7eb;
		border-radius: 8px; padding: 1rem;
		margin-bottom: 0.75rem; cursor: pointer;
		transition: all 0.2s;
	}

	.cluster-card:hover {
		border-color: #667eea; transform: translateX(4px);
	}

	.cluster-card.selected {
		border-color: #667eea; background: #f0f4ff;
		box-shadow: 0 4px 6px rgba(102, 126, 234, 0.1);
	}

	.cluster-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.severity-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 12px; color: white;
		font-size: 0.75rem;
		font-weight: bold; display: inline-flex;
		align-items: center; gap: 0.25rem;
	}

	.severity-badge.large {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.file-count {
		font-size: 0.875rem; color: #6b7280;
		font-weight: 500;
	}

	.cluster-label {
		margin: 0 0 0.75rem 0;
		color: #1f2937;
		font-size: 1rem;
		line-height: 1.4;
	}

	.cluster-meta {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.meta-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 0.75rem; color: #6b7280;
	}

	.meta-icon {
		font-size: 1rem;
	}

	.cluster-detail {
		border: 2px solid #e5e7eb;
		border-radius: 8px; overflow: hidden;
		background: white;
	}

	.detail-header {
		background: #f9fafb; padding: 1.5rem;
		border-bottom: 2px solid #e5e7eb;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.detail-header h3 {
		margin: 0; color: #1f2937;
		font-size: 1.25rem; flex: 1;
	}

	.detail-body {
		padding: 1.5rem;
		max-height: 550px;
		overflow-y: auto;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.info-item {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem; color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-value {
		font-size: 1rem; color: #1f2937;
		font-weight: 600;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section h4 {
		margin: 0 0 0.75rem 0;
		color: #1f2937;
		font-size: 1rem;
	}

	.timeline {
		background: #f9fafb;
		border-radius: 8px; padding: 1rem;
	}

	.timeline-item {
		display: flex;
		justify-content: space-between; padding: 0.5rem 0;
		border-bottom: 1px solid #e5e7eb;
	}

	.timeline-item:last-child {
		border-bottom: none;
	}

	.timeline-label {
		font-size: 0.875rem; color: #6b7280;
	}

	.timeline-value {
		font-size: 0.875rem; color: #1f2937;
		font-weight: 500;
	}

	.files-list {
		max-height: 300px;
		overflow-y: auto;
	}

	.file-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.5rem; background: #f9fafb;
		border-radius: 4px;
		margin-bottom: 0.25rem;
		font-size: 0.875rem;
	}

	.file-icon {
		flex-shrink: 0;
	}

	.file-path {
		font-family: monospace; color: #374151;
		word-break: break-all;
	}

	.no-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; height: 100%;
		padding: 2rem;
		text-align: center; color: #6b7280;
	}

	.no-selection .icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.stats {
		display: flex; gap: 2rem;
		margin-top: 2rem;
	}

	.stat-box {
		text-align: center;
	}

	.stat-box .stat-value {
		font-size: 2.5rem;
		font-weight: bold; color: #667eea;
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.stat-box .stat-label {
		font-size: 0.75rem; color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
</style>



