<script lang="ts">
	let { data } = $props();

	let selectedCollection = $state<string | null>(null);
	let searchQuery = $state('');
	let selectedView = $state<'qdrant' | 'postgres' | 'timeline'>('qdrant');

	// Filter embeddings based on search
	const filteredEmbeddings = $derived(
		data.postgres.embeddings.filter(e =>
			!searchQuery || e.source.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);
</script>

<div class="codebase-viewer">
	<header class="viewer-header">
		<h1>🗄️ Codebase Viewer</h1>
		<p class="subtitle">
			Indexed embeddings • Tagged files • Vector database explorer
		</p>
	</header>

	<!-- Stats Overview -->
	<div class="stats-grid">
		<div class="stat-card qdrant">
			<div class="stat-icon">🔢</div>
			<div class="stat-content">
				<div class="stat-value">{data.qdrant.totalPoints.toLocaleString()}</div>
				<div class="stat-label">Qdrant Vectors</div>
			</div>
		</div>

		<div class="stat-card postgres">
			<div class="stat-icon">📁</div>
			<div class="stat-content">
				<div class="stat-value">{data.postgres.stats.total_files || 0}</div>
				<div class="stat-label">Indexed Files</div>
			</div>
		</div>

		<div class="stat-card embeddings">
			<div class="stat-icon">🧬</div>
			<div class="stat-content">
				<div class="stat-value">{data.postgres.stats.total_errors || 0}</div>
				<div class="stat-label">Total Errors</div>
			</div>
		</div>

		<div class="stat-card coverage">
			<div class="stat-icon">📊</div>
			<div class="stat-content">
				<div class="stat-value">
					{(data.postgres.stats.embedding_coverage || 0).toFixed(1)}%
				</div>
				<div class="stat-label">Embedding Coverage</div>
			</div>
		</div>
	</div>

	<!-- View Tabs -->
	<div class="view-tabs">
		<button
			class, active={selectedView === 'qdrant'}
			onclick={() => selectedView = 'qdrant'}
		>
			🔢 Qdrant Collections
		</button>
		<button
			class, active={selectedView === 'postgres'}
			onclick={() => selectedView = 'postgres'}
		>
			🗃️ PostgreSQL Embeddings
		</button>
		<button
			class, active={selectedView === 'timeline'}
			onclick={() => selectedView = 'timeline'}
		>
			📅 File Timeline
		</button>
	</div>

	<!-- Search Bar -->
	{#if selectedView === 'postgres'}
		<div class="search-bar">
			<input
				type="text"
				bind, value={searchQuery}
				placeholder="Search files..."
				class="search-input"
			/>
		</div>
	{/if}

	<!-- Qdrant Collections View -->
	{#if selectedView === 'qdrant'}
		<div class="collections-grid">
			{#each data.qdrant.collections as collection}
				<div
					class="collection-card"
					class, selected={selectedCollection === collection.name}
					onclick={() => selectedCollection = collection.name}
				>
					<div class="collection-header">
						<h3>{collection.name}</h3>
						<span class="status-badge {collection.status}">{collection.status}</span>
					</div>

					<div class="collection-stats">
						<div class="stat-row">
							<span class="label">Points:</span>
							<span class="value">{collection.pointsCount.toLocaleString()}</span>
						</div>
						<div class="stat-row">
							<span class="label">Vector Size:</span>
							<span class="value">{collection.vectorSize}d</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- PostgreSQL Embeddings View -->
	{#if selectedView === 'postgres'}
		<div class="embeddings-table">
			<table>
				<thead>
					<tr>
						<th>File Path</th>
						<th>Error Count</th>
						<th>Error Codes</th>
						<th>Last Indexed</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredEmbeddings as embedding}
						<tr>
							<td class="file-path">
								<code>{embedding.source}</code>
							</td>
							<td class="error-count">
								<span class="badge">{embedding.error_count}</span>
							</td>
							<td class="error-codes">
								{#each (embedding.error_codes || []) as code}
									<span class="error-badge">{code}</span>
								{/each}
							</td>
							<td class="timestamp">
								{embedding.last_indexed
									? new Date(embedding.last_indexed).toLocaleString()
									: 'Never'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Timeline View -->
	{#if selectedView === 'timeline'}
		<div class="timeline-view">
			{#each data.postgres.timeline as item}
				<div class="timeline-item">
					<div class="timeline-marker"></div>
					<div class="timeline-content">
						<h4>{item.file_path}</h4>
						<div class="timeline-events">
							{#if item.indexed_at}
								<span class="event indexed">
									📥 Indexed: {new Date(item.indexed_at).toLocaleString()}
								</span>
							{/if}
							{#if item.tagged_at}
								<span class="event tagged">
									🏷️ Tagged: {new Date(item.tagged_at).toLocaleString()}
								</span>
							{/if}
							{#if item.edited_at}
								<span class="event edited">
									✏️ Edited: {new Date(item.edited_at).toLocaleString()}
								</span>
							{/if}
							{#if item.analyzed_at}
								<span class="event analyzed">
									🔍 Analyzed: {new Date(item.analyzed_at).toLocaleString()}
								</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.codebase-viewer {
		padding: 2rem;
		max-width: 1400px; margin: 0 auto;
	}

	.viewer-header {
		margin-bottom: 2rem;
	}

	.viewer-header h1 {
		font-size: 2rem; margin: 0;
		color: #1a1a1a;
	}

	.subtitle {
		color: #666; margin: 0.5rem 0 0;
	}

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		display: flex;
		align-items: center; gap: 1rem;
		padding: 1.5rem;
		border-radius: 12px; background: white;
		border: 2px solid #e5e7eb;
		transition: all 0.2s;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.stat-card.qdrant {
		border-color: #3b82f6;
	}

	.stat-card.postgres {
		border-color: #10b981;
	}

	.stat-card.embeddings {
		border-color: #f59e0b;
	}

	.stat-card.coverage {
		border-color: #8b5cf6;
	}

	.stat-icon {
		font-size: 2.5rem;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700; color: #1a1a1a;
	}

	.stat-label {
		font-size: 0.875rem; color: #666;
		margin-top: 0.25rem;
	}

	/* View Tabs */
	.view-tabs {
		display: flex; gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.view-tabs button {
		padding: 0.75rem 1.5rem;
		border: none; background: none;
		cursor: pointer;
		font-size: 1rem; color: #666;
		border-bottom: 3px solid transparent;
		transition: all 0.2s;
	}

	.view-tabs button:hover {
		color: #1a1a1a; background: #f9fafb;
	}

	.view-tabs button.active {
		color: #3b82f6;
		border-bottom-color: #3b82f6;
	}

	/* Search Bar */
	.search-bar {
		margin-bottom: 1.5rem;
	}

	.search-input {
		width: 100%; padding: 0.75rem 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		font-size: 1rem; transition: border-color 0.2s;
	}

	.search-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	/* Collections Grid */
	.collections-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
	}

	.collection-card {
		padding: 1.5rem; border: 2px solid #e5e7eb;
		border-radius: 12px; background: white;
		cursor: pointer; transition: all 0.2s;
	}

	.collection-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
	}

	.collection-card.selected {
		border-color: #3b82f6; background: #eff6ff;
	}

	.collection-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.collection-header h3 {
		margin: 0;
		font-size: 1.125rem; color: #1a1a1a;
	}

	.status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.status-badge.green {
		background: #d1fae5; color: #065f46;
	}

	.collection-stats .stat-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.collection-stats .label {
		color: #666;
		font-size: 0.875rem;
	}

	.collection-stats .value {
		font-weight: 600; color: #1a1a1a;
	}

	/* Embeddings Table */
	.embeddings-table {
		background: white;
		border-radius: 12px; border: 2px solid #e5e7eb;
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead {
		background: #f9fafb;
	}

	th {
		padding: 1rem;
		text-align: left;
		font-weight: 600; color: #1a1a1a;
		border-bottom: 2px solid #e5e7eb;
	}

	td {
		padding: 1rem;
		border-bottom: 1px solid #f3f4f6;
	}

	tr:hover {
		background: #f9fafb;
	}

	.file-path code {
		background: #f3f4f6; padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.error-count .badge {
		background: #fef3c7; color: #92400e;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.error-badge {
		display: inline-block; background: #fee2e2;
		color: #991b1b; padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		margin-right: 0.25rem;
		margin-bottom: 0.25rem;
	}

	.timestamp {
		color: #666;
		font-size: 0.875rem;
	}

	/* Timeline View */
	.timeline-view {
		position: relative;
		padding-left: 2rem;
	}

	.timeline-item {
		position: relative;
		margin-bottom: 2rem;
		padding-left: 2rem;
	}

	.timeline-marker {
		position: absolute; left: 0;
		top: 0.5rem; width: 12px;
		height: 12px;
		border-radius: 50%; background: #3b82f6;
		border: 3px solid white;
		box-shadow: 0 0 0 2px #3b82f6;
	}

	.timeline-item::before {
		content: ''; position: absolute;
		left: 5px; top: 1.5rem;
		bottom: -1.5rem; width: 2px;
		background: #e5e7eb;
	}

	.timeline-item:last-child::before {
		display: none;
	}

	.timeline-content {
		background: white; padding: 1.5rem;
		border-radius: 12px; border: 2px solid #e5e7eb;
	}

	.timeline-content h4 {
		margin: 0 0 1rem;
		color: #1a1a1a;
	}

	.timeline-events {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.event {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.event.indexed {
		background: #dbeafe; color: #1e40af;
	}

	.event.tagged {
		background: #fef3c7; color: #92400e;
	}

	.event.edited {
		background: #d1fae5; color: #065f46;
	}

	.event.analyzed {
		background: #f3e8ff; color: #6b21a8;
	}
</style>



