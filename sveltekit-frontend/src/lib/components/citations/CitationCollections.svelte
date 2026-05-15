<script lang="ts">
	import type { CitationCollection } from '$lib/types/citations';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		onSelectCollection?: (collection: CitationCollection) => void;
	}

	let { onSelectCollection }: Props = $props();

	let collections = $state<CitationCollection[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let showCreateForm = $state(false);
	let newCollectionName = $state('');
	let newCollectionDescription = $state('');
	let newCollectionColor = $state('#8B2332');

	// Edit state
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editColor = $state('');

	// Export state
	let exportingId = $state<string | null>(null);
	let exportLoading = $state(false);

	const colors = [
		'#8B2332', '#D4A574', '#2C3E50', '#E74C3C',
		'#3498DB', '#2ECC71', '#F39C12', '#9B59B6'
	];

	async function loadCollections() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/citations/collections');
			if (!res.ok) throw new Error('Failed to load collections');
			collections = await res.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load collections';
		} finally {
			isLoading = false;
		}
	}

	async function handleCreate() {
		if (!newCollectionName.trim()) return;
		try {
			const res = await fetch('/api/citations/collections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newCollectionName.trim(),
					description: newCollectionDescription.trim() || null,
					color: newCollectionColor,
					isPublic: false
				})
			});
			if (!res.ok) throw new Error('Failed to create collection');
			const created: CitationCollection = await res.json();
			collections = [...collections, created];
			newCollectionName = '';
			newCollectionDescription = '';
			newCollectionColor = '#8B2332';
			showCreateForm = false;
		} catch (err) {
			console.error('Error creating collection:', err);
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this collection? This cannot be undone.')) return;
		try {
			const res = await fetch(`/api/citations/collections/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete');
			collections = collections.filter(c => c.id !== id);
		} catch (err) {
			console.error('Error deleting collection:', err);
		}
	}

	function startEdit(c: CitationCollection) {
		editingId = c.id;
		editName = c.name;
		editDescription = c.description ?? '';
		editColor = c.color ?? '#8B2332';
	}

	async function saveEdit() {
		if (!editingId || !editName.trim()) return;
		try {
			const res = await fetch(`/api/citations/collections/${editingId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					description: editDescription.trim() || null,
					color: editColor
				})
			});
			if (!res.ok) throw new Error('Failed to update');
			const updated = await res.json();
			collections = collections.map(c =>
				c.id === editingId ? { ...c, name: updated.name, description: updated.description, color: updated.color } : c
			);
			editingId = null;
		} catch (err) {
			console.error('Error updating collection:', err);
		}
	}

	async function handleExport(id: string, format: 'html' | 'markdown' | 'json') {
		exportLoading = true;
		try {
			const res = await fetch(`/api/citations/collections/${id}/export?format=${format}`);
			if (!res.ok) throw new Error('Export failed');
			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition') ?? '';
			const match = disposition.match(/filename="(.+?)"/);
			const filename = match?.[1] ?? `collection.${format === 'markdown' ? 'md' : format}`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			exportingId = null;
		} catch (err) {
			console.error('Export error:', err);
		} finally {
			exportLoading = false;
		}
	}

	$effect(() => {
		loadCollections();
	});
</script>

<div class="collections-panel">
	<!-- Header -->
	<div class="collections-header">
		<h3>
			<Icon name="folder" size={16} />
			Collections
			{#if collections.length > 0}
				<span class="count-badge">({collections.length})</span>
			{/if}
		</h3>
		<Button
			onclick={() => { showCreateForm = !showCreateForm; }}
			disabled={isLoading}
			class="text-xs px-2.5 py-1"
		>
			{#if showCreateForm}
				<Icon name="x" size={12} />
				Cancel
			{:else}
				<Icon name="plus" size={12} />
				New
			{/if}
		</Button>
	</div>

	<!-- Create Form -->
	{#if showCreateForm}
		<div class="create-form">
			<div class="form-group">
				<label for="cc-name">Name</label>
				<input
					id="cc-name"
					type="text"
					bind:value={newCollectionName}
					placeholder="e.g., Civil Rights Cases"
					onkeydown={(e) => e.key === 'Enter' && handleCreate()}
				/>
			</div>
			<div class="form-group">
				<label for="cc-desc">Description</label>
				<input
					id="cc-desc"
					type="text"
					bind:value={newCollectionDescription}
					placeholder="Optional description..."
				/>
			</div>
			<div class="form-group">
				<span class="label-text">Color</span>
				<div class="color-picker">
					{#each colors as color}
						<button
							type="button"
							onclick={() => { newCollectionColor = color; }}
							class="color-option"
							class:selected={newCollectionColor === color}
							style:background-color={color}
						></button>
					{/each}
				</div>
			</div>
			<div class="form-actions">
				<Button onclick={handleCreate} class="text-xs px-3 py-1.5 flex-1">Create</Button>
				<Button onclick={() => { showCreateForm = false; }} class="text-xs px-3 py-1.5 flex-1">Cancel</Button>
			</div>
		</div>
	{/if}

	<!-- Error -->
	{#if error}
		<div class="error-msg">
			<Icon name="triangle-alert" size={12} />
			{error}
			<button class="retry-btn" onclick={loadCollections}>Retry</button>
		</div>
	{/if}

	<!-- Loading / Empty / List -->
	{#if isLoading && collections.length === 0}
		<div class="empty-state">
			<Icon name="loader-circle" size={16} class="animate-spin" />
			Loading collections...
		</div>
	{:else if collections.length === 0}
		<div class="empty-state">
			<Icon name="folder-open" size={24} />
			<p>No collections yet</p>
			<small>Create one to organize your citations</small>
		</div>
	{:else}
		<div class="collections-list">
			{#each collections as collection (collection.id)}
				{#if editingId === collection.id}
					<!-- Inline Edit -->
					<div class="edit-form">
						<input
							type="text"
							bind:value={editName}
							class="edit-input"
						/>
						<input
							type="text"
							bind:value={editDescription}
							placeholder="Description..."
							class="edit-input"
						/>
						<div class="color-picker small">
							{#each colors as color}
								<button
									type="button"
									onclick={() => { editColor = color; }}
									class="color-option small"
									class:selected={editColor === color}
									style:background-color={color}
								></button>
							{/each}
						</div>
						<div class="form-actions">
							<Button onclick={saveEdit} class="text-xs px-2 py-1">Save</Button>
							<Button onclick={() => { editingId = null; }} class="text-xs px-2 py-1">Cancel</Button>
						</div>
					</div>
				{:else}
					<!-- Collection Card -->
					<div class="collection-item">
						<button
							onclick={() => onSelectCollection?.(collection)}
							class="collection-button"
						>
							<div class="collection-color" style:background-color={collection.color ?? '#8B2332'}></div>
							<div class="collection-info">
								<p class="collection-name">{collection.name}</p>
								{#if collection.description}
									<p class="collection-desc">{collection.description}</p>
								{/if}
								<p class="collection-count">
									{collection.citationCount ?? 0} citation{(collection.citationCount ?? 0) !== 1 ? 's' : ''}
								</p>
							</div>
						</button>

						<!-- Actions -->
						<div class="item-actions">
							<div class="export-wrapper">
								<button
									class="action-btn"
									onclick={() => { exportingId = exportingId === collection.id ? null : collection.id; }}
									title="Export collection"
								>
									<Icon name="download" size={14} />
								</button>
								{#if exportingId === collection.id}
									<div class="export-menu">
										<button
											class="export-option"
											onclick={() => handleExport(collection.id, 'html')}
											disabled={exportLoading}
										>HTML</button>
										<button
											class="export-option"
											onclick={() => handleExport(collection.id, 'markdown')}
											disabled={exportLoading}
										>Markdown</button>
										<button
											class="export-option"
											onclick={() => handleExport(collection.id, 'json')}
											disabled={exportLoading}
										>JSON</button>
									</div>
								{/if}
							</div>
							<button
								class="action-btn"
								onclick={() => startEdit(collection)}
								title="Edit collection"
							>
								<Icon name="pencil" size={14} />
							</button>
							<button
								class="action-btn delete"
								onclick={() => handleDelete(collection.id)}
								title="Delete collection"
							>
								<Icon name="trash-2" size={14} />
							</button>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.collections-panel {
		border-radius: 8px;
		border: 1px solid var(--sand-dark, #44403c);
		background: var(--panel, #1c1917);
		padding: 16px;
	}

	.collections-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.collections-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--sand, #d6d3d1);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.count-badge {
		font-size: 11px;
		font-weight: 400;
		opacity: 0.4;
	}

	/* Create & Edit Forms */
	.create-form, .edit-form {
		margin-bottom: 12px;
		padding: 12px;
		border-radius: 6px;
		border: 1px solid rgba(var(--accent-rgb, 139, 35, 50), 0.2);
		background: rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-group label, .label-text {
		font-size: 12px;
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.6);
	}

	.form-group input, .edit-input {
		width: 100%;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(var(--sand-rgb, 214, 211, 209), 0.2);
		border-radius: 4px;
		color: var(--sand, #d6d3d1);
		font-size: 13px;
		outline: none;
		box-sizing: border-box;
	}

	.form-group input::placeholder, .edit-input::placeholder {
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.4);
	}

	.form-group input:focus, .edit-input:focus {
		border-color: var(--accent, #8B2332);
	}

	.color-picker {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.color-picker.small {
		gap: 4px;
	}

	.color-option {
		width: 28px;
		height: 28px;
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: transform 150ms ease;
	}

	.color-option:hover {
		transform: scale(1.1);
	}

	.color-option.selected {
		border-color: white;
	}

	.color-option.small {
		width: 20px;
		height: 20px;
	}

	.form-actions {
		display: flex;
		gap: 8px;
	}

	/* Error */
	.error-msg {
		margin-bottom: 12px;
		padding: 8px 12px;
		border-radius: 4px;
		background: rgba(127, 29, 29, 0.5);
		border: 1px solid rgba(127, 29, 29, 0.3);
		color: #fca5a5;
		font-size: 12px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.retry-btn {
		margin-left: auto;
		background: transparent;
		border: none;
		color: #f87171;
		cursor: pointer;
		font-size: 12px;
	}

	.retry-btn:hover {
		color: #fecaca;
	}

	/* Empty / Loading */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 32px;
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.4);
		font-size: 13px;
		text-align: center;
	}

	.empty-state p {
		margin: 0;
	}

	.empty-state small {
		font-size: 11px;
	}

	/* Collections List */
	.collections-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.collection-item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		border-radius: 6px;
		border: 1px solid rgba(var(--sand-rgb, 214, 211, 209), 0.1);
		transition: border-color 150ms ease;
	}

	.collection-item:hover {
		border-color: rgba(var(--accent-rgb, 139, 35, 50), 0.3);
	}

	.collection-button {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		padding: 6px 8px;
		min-width: 0;
	}

	.collection-color {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.collection-info {
		flex: 1;
		min-width: 0;
	}

	.collection-name {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--sand, #d6d3d1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.collection-desc {
		margin: 0;
		font-size: 11px;
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.4);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.collection-count {
		margin: 2px 0 0 0;
		font-size: 10px;
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.3);
	}

	/* Item Actions */
	.item-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0;
		transition: opacity 150ms ease;
	}

	.collection-item:hover .item-actions {
		opacity: 1;
	}

	.action-btn {
		padding: 4px;
		border-radius: 4px;
		background: transparent;
		border: none;
		color: rgba(var(--sand-rgb, 214, 211, 209), 0.4);
		cursor: pointer;
		transition: color 150ms ease;
	}

	.action-btn:hover {
		color: var(--accent, #8B2332);
	}

	.action-btn.delete:hover {
		color: #f87171;
	}

	/* Export Menu */
	.export-wrapper {
		position: relative;
	}

	.export-menu {
		position: absolute;
		right: 0;
		top: 100%;
		margin-top: 4px;
		z-index: 10;
		background: var(--panel, #1c1917);
		border: 1px solid var(--sand-dark, #44403c);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		padding: 4px 0;
		min-width: 112px;
	}

	.export-option {
		display: block;
		width: 100%;
		text-align: left;
		padding: 6px 12px;
		font-size: 12px;
		color: var(--sand, #d6d3d1);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.export-option:hover {
		background: rgba(var(--accent-rgb, 139, 35, 50), 0.1);
	}

	.export-option:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
