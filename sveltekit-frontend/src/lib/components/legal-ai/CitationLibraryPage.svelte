<script lang="ts">
	// Migrated to $effect
	import CitationCollections from './CitationCollections.svelte';
	import CollectionDetail from './CollectionDetail.svelte';

	interface Collection {
		id: string;
	name: string;
		description?: string;
	is_public: boolean;
		citation_count?: number;
	created_at: string;
	}

	let collections: Collection[] = $state([]);
	let selectedCollection: Collection | null = $state(null);
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let showCreateForm = $state(false);
	let newCollectionName = $state('');
	let newCollectionDescription = $state('');
	let isCreating = $state(false);

	$effect(() => {

		loadCollections();
	
});

	async function loadCollections() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/citations/collections');
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					collections = data.collections || [];
				} else {
					error = data.error || 'Failed to load collections';
				}
			} else {
				error = 'Failed to load collections';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isLoading = false;
		}
	}

	async function createCollection() {
		if (!newCollectionName.trim()) {
			error = 'Collection name is required';
			return;
		}

		isCreating = true;
		error = null;

		try {
			const response = await fetch('/api/citations/collections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	name: newCollectionName,
					description: newCollectionDescription || undefined,
					is_public: false
				})
			});

			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					collections = [...collections, data.collection];
					newCollectionName = '';
					newCollectionDescription = '';
					showCreateForm = false;
				} else {
					error = data.error || 'Failed to create collection';
				}
			} else {
				error = 'Failed to create collection';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isCreating = false;
		}
	}

	function selectCollection(collection: Collection) {
		selectedCollection = collection;
	}

	function handleCollectionDeleted(event: CustomEvent) {
		const collectionId = event.detail;
		collections = collections.filter((c) => c.id !== collectionId);
		if (selectedCollection?.id === collectionId) {
			selectedCollection = null;
		}
	}
</script>

<div class="citation-library-page">
	<div class="page-header">
		<h1>Citation Library</h1>
		<button class="btn-create" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? '✕ Cancel' : '+ New Collection'}
		</button>
	</div>

	{#if error}
		<div class="error-message">
			<p>{error}</p>
		</div>
	{/if}

	{#if showCreateForm}
		<div class="create-form">
			<h3>Create New Collection</h3>
			<div class="form-group">
				<label for="name">Collection Name *</label>
				<input
					id="name"
					type="text"
					bind:value={newCollectionName}
					placeholder="e.g., Criminal Law Cases"
					disabled={isCreating}
				/>
			</div>

			<div class="form-group">
				<label for="description">Description</label>
				<textarea
					id="description"
					bind:value={newCollectionDescription}
					placeholder="Optional description..."
					rows="3"
					disabled={isCreating}
				></textarea>
			</div>

			<div class="form-actions">
				<button class="btn-cancel" onclick={() => (showCreateForm = false)} disabled={isCreating}>
					Cancel
				</button>
				<button class="btn-submit" onclick={createCollection} disabled={isCreating}>
					{isCreating ? 'Creating...' : 'Create Collection'}
				</button>
			</div>
		</div>
	{/if}

	<div class="content">
		{#if selectedCollection}
			<div class="detail-view">
				<button class="back-btn" onclick={() => (selectedCollection = null)}>
					← Back to Collections
				</button>
				<CollectionDetail collection={selectedCollection} ondeleted={handleCollectionDeleted} />
			</div>
		{:else}
			<div class="list-view">
				{#if isLoading}
					<div class="loading">
						<div class="spinner"></div>
						<p>Loading collections...</p>
					</div>
				{:else if collections.length === 0}
					<div class="empty-state">
						<p>No collections yet. Create one to get started!</p>
					</div>
				{:else}
					<CitationCollections
						{collections}
						onselect={(e: CustomEvent) => selectCollection(e.detail)}
						ondeleted={handleCollectionDeleted}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.citation-library-page {
		display: flex;
		flex-direction: column;
	gap: 1.5rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 1rem;
		border-bottom: 2px solid #d4a574;
	}

	.page-header h1 {
		margin: 0;
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 2rem;
	color: #2c2c2c;
	}

	.btn-create {
		padding: 0.75rem 1.5rem;
		background-color: #8b4513;
	color: #f5f1e8;
		border: none;
		border-radius: 4px;
		font-weight: 600;
	cursor: pointer;
		transition: all 0.2s;
	}

	.btn-create:hover {
		background-color: #a0522d;
	}

	.error-message {
		padding: 1rem;
		background-color: #ffe6e6;
	border: 1px solid #ff6b6b;
		border-radius: 4px;
	color: #c92a2a;
	}

	.create-form {
		padding: 1.5rem;
		background-color: #f5f1e8;
	border: 2px solid #d4a574;
		border-radius: 8px;
	}

	.create-form h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
	color: #2c2c2c;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.form-group label {
		font-weight: 600;
	color: #2c2c2c;
		font-size: 0.9rem;
	}

	.form-group input,
	.form-group textarea {
		padding: 0.75rem;
	border: 1px solid #d4a574;
		border-radius: 4px;
		font-family: 'Source Sans 3', sans-serif;
		font-size: 0.95rem;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #8b4513;
		box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
	}

	.form-group input:disabled,
	.form-group textarea:disabled {
		background-color: #e0d5c7;
	color: #999;
	}

	.form-actions {
		display: flex;
	gap: 1rem;
		justify-content: flex-end;
	}

	.btn-cancel,
	.btn-submit {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		font-weight: 600;
	cursor: pointer;
		transition: all 0.2s;
	}

	.btn-cancel {
		background-color: #e0d5c7;
	color: #2c2c2c;
	}

	.btn-cancel:hover:not(:disabled) {
		background-color: #d4a574;
	}

	.btn-submit {
		background-color: #8b4513;
	color: #f5f1e8;
	}

	.btn-submit:hover:not(:disabled) {
		background-color: #a0522d;
	}

	.btn-cancel:disabled,
	.btn-submit:disabled {
		opacity: 0.6;
	cursor: not-allowed;
	}

	.content {
		flex: 1;
	}

	.detail-view {
		display: flex;
		flex-direction: column;
	gap: 1rem;
	}

	.back-btn {
		align-self: flex-start;
	padding: 0.5rem 1rem;
		background-color: #e0d5c7;
	border: 1px solid #d4a574;
		border-radius: 4px;
		font-size: 0.9rem;
	cursor: pointer;
		transition: all 0.2s;
	}

	.back-btn:hover {
		background-color: #d4a574;
	}

	.loading,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
	gap: 1rem;
		color: #666;
	}

	.spinner {
		width: 40px;
	height: 40px;
		border: 4px solid #e0e0e0;
		border-top-color: #8b4513;
		border-radius: 50%;
	animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
