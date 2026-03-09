<script lang="ts">
	import { fade } from 'svelte/transition';

	export let evidence: any[] = [];
	export let isLoading = false;

	let selectedEvidence: any = null;
	let searchQuery = '';
	let filterType = 'all';

	let filteredEvidence = $derived(evidence.filter(item => {
		const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
							 item.content?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesType = filterType === 'all' || item.type === filterType;
		return matchesSearch && matchesType;
	}));

	function selectEvidence(item: any) {
		selectedEvidence = item;
	}

	function closeEvidence() {
		selectedEvidence = null;
	}
</script>

<div class="evidence-viewer" transition:fade={{ duration: 300 }}>
	<!-- Header -->
	<div class="viewer-header">
		<h2>Evidence Analysis</h2>
		<div class="controls">
			<input
				type="text"
				placeholder="Search evidence..."
				bind:value={searchQuery}
				class="search-input"
			/>
			<select bind:value={filterType} class="filter-select">
				<option value="all">All Types</option>
				<option value="document">Documents</option>
				<option value="image">Images</option>
				<option value="video">Video</option>
				<option value="audio">Audio</option>
			</select>
		</div>
	</div>

	<!-- Evidence Grid -->
	<div class="evidence-grid">
		{#if isLoading}
			<div class="loading-spinner">
				<div class="spinner"></div>
				<p>Analyzing evidence...</p>
			</div>
		{:else if filteredEvidence.length === 0}
			<div class="empty-state">
				<div class="empty-icon">🔍</div>
				<h3>No Evidence Found</h3>
				<p>Try adjusting your search or filters</p>
			</div>
		{:else}
			{#each filteredEvidence as item (item.id)}
				<div
					class="evidence-card"
					class:selected={selectedEvidence?.id === item.id}
					on:click={() => selectEvidence(item)}
				>
					<div class="card-header">
						<div class="evidence-type">{item.type}</div>
						<div class="confidence-score">
							{item.confidence ? `${Math.round(item.confidence * 100)}%` : 'N/A'}
						</div>
					</div>
					<div class="card-content">
						<h4>{item.title || 'Untitled'}</h4>
						<p>{item.content?.substring(0, 100)}...</p>
						<div class="metadata">
							<span class="date">{new Date(item.timestamp).toLocaleDateString()}</span>
							{#if item.source}
								<span class="source">{item.source}</span>
							{/if}
						</div>
					</div>
					<div class="card-footer">
						<div class="tags">
							{#each item.tags || [] as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Evidence Detail Modal -->
	{#if selectedEvidence}
		<div class="evidence-modal" transition:fade={{ duration: 200 }}>
			<div class="modal-backdrop" onclick={closeEvidence}></div>
			<div class="modal-content">
				<div class="modal-header">
				<h3>{selectedEvidence.title}</h3>
				<button class="close-btn" onclick={closeEvidence}>×</button>
				</div>
				<div class="modal-body">
					<div class="evidence-details">
						<div class="detail-row">
							<strong>Type:</strong> {selectedEvidence.type}
						</div>
						<div class="detail-row">
							<strong>Confidence:</strong> {selectedEvidence.confidence ? `${Math.round(selectedEvidence.confidence * 100)}%` : 'N/A'}
						</div>
						<div class="detail-row">
							<strong>Source:</strong> {selectedEvidence.source || 'Unknown'}
						</div>
						<div class="detail-row">
							<strong>Date:</strong> {new Date(selectedEvidence.timestamp).toLocaleString()}
						</div>
						{#if selectedEvidence.content}
							<div class="detail-row content">
								<strong>Content:</strong>
								<div class="content-text">{selectedEvidence.content}</div>
							</div>
						{/if}
					</div>
					{#if selectedEvidence.image_url}
						<div class="evidence-image">
							<img src={selectedEvidence.image_url} alt={selectedEvidence.title} />
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.evidence-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #1a1a1a;
		color: #e0e0e0;
	}

	.viewer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #333;
		background: #2a2a2a;
	}

	.viewer-header h2 {
		margin: 0;
		color: #ff6b6b;
		font-family: 'Courier New', monospace;
	}

	.controls {
		display: flex;
		gap: 1rem;
	}

	.search-input, .filter-select {
		padding: 0.5rem;
		background: #333;
		border: 1px solid #555;
		color: #e0e0e0;
		border-radius: 4px;
	}

	.search-input:focus, .filter-select:focus {
		outline: none;
		border-color: #ff6b6b;
	}

	.evidence-grid {
		flex: 1;
		padding: 1rem;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
	}

	.evidence-card {
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		overflow: hidden;
	}

	.evidence-card:hover {
		border-color: #ff6b6b;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.2);
	}

	.evidence-card.selected {
		border-color: #ff6b6b;
		box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.5);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: #333;
	}

	.evidence-type {
		background: #ff6b6b;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		text-transform: uppercase;
		font-weight: bold;
	}

	.confidence-score {
		color: #4ecdc4;
		font-weight: bold;
	}

	.card-content {
		padding: 1rem;
	}

	.card-content h4 {
		margin: 0 0 0.5rem 0;
		color: #e0e0e0;
	}

	.card-content p {
		margin: 0 0 0.75rem 0;
		color: #bbb;
		line-height: 1.4;
	}

	.metadata {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: #888;
	}

	.card-footer {
		padding: 0.75rem 1rem;
		background: #222;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.tag {
		background: #444;
		color: #bbb;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		font-size: 0.75rem;
	}

	.loading-spinner {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #333;
		border-top: 4px solid #ff6b6b;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-state {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		text-align: center;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		color: #e0e0e0;
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: #888;
		margin: 0;
	}

	.evidence-modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
	}

	.modal-content {
		position: relative;
		background: #2a2a2a;
		border-radius: 8px;
		max-width: 800px;
		max-height: 80vh;
		width: 90%;
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #444;
		background: #333;
	}

	.modal-header h3 {
		margin: 0;
		color: #ff6b6b;
	}

	.close-btn {
		background: none;
		border: none;
		color: #e0e0e0;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background 0.2s;
	}

	.close-btn:hover {
		background: #444;
	}

	.modal-body {
		padding: 1rem;
		max-height: 60vh;
		overflow-y: auto;
	}

	.evidence-details {
		margin-bottom: 1rem;
	}

	.detail-row {
		margin-bottom: 0.75rem;
	}

	.detail-row strong {
		color: #4ecdc4;
		min-width: 100px;
		display: inline-block;
	}

	.detail-row.content {
		flex-direction: column;
		align-items: flex-start;
	}

	.content-text {
		margin-top: 0.5rem;
		background: #1a1a1a;
		padding: 1rem;
		border-radius: 4px;
		border: 1px solid #444;
		white-space: pre-wrap;
		line-height: 1.5;
		max-height: 200px;
		overflow-y: auto;
	}

	.evidence-image {
		margin-top: 1rem;
		text-align: center;
	}

	.evidence-image img {
		max-width: 100%;
		max-height: 400px;
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	@media (max-width: 768px) {
		.viewer-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.controls {
			flex-direction: column;
		}

		.evidence-grid {
			grid-template-columns: 1fr;
		}

		.modal-content {
			width: 95%;
			max-height: 90vh;
		}
	}
</style>