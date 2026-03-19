<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		caseId?: string;
		class?: string;
	}

	let { caseId, class: className = '' }: Props = $props();

	interface EvidenceItem {
		id: number;
		title: string;
		description?: string;
		evidenceType: string;
		fileSize: number;
		mimeType: string;
		uploadedAt: string;
		hasEmbedding?: boolean;
	}

	let items = $state<EvidenceItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<Array<EvidenceItem & { similarity: number }>>([]);
	let searching = $state(false);

	let filteredItems = $derived.by(() => {
		if (!searchQuery.trim()) return items;
		const q = searchQuery.toLowerCase();
		return items.filter(
			(item) =>
				item.title.toLowerCase().includes(q) ||
				item.description?.toLowerCase().includes(q) ||
				item.evidenceType.toLowerCase().includes(q)
		);
	});

	$effect(() => {
		loadEvidence();
	});

	async function loadEvidence() {
		loading = true;
		error = null;
		try {
			const url = caseId ? `/api/evidence?caseId=${caseId}` : '/api/evidence';
			const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			items = data.items ?? data.data ?? data ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load evidence';
			items = [];
		} finally {
			loading = false;
		}
	}

	async function performSearch() {
		if (!searchQuery.trim()) return;
		searching = true;
		try {
			const res = await fetch('/api/evidence/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQuery, limit: 10, caseId }),
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			searchResults = data.results ?? data.data ?? [];
		} catch (e) {
			console.error('Search failed:', e);
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	function formatSize(bytes: number): string {
		if (!bytes) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="evidence-mgr {className}">
	<div class="mgr-header">
		<Icon name="folder-open" size={16} />
		<h3>Evidence Manager</h3>
		<span class="item-count">{items.length}</span>
		<Button variant="ghost" size="sm" onclick={loadEvidence} disabled={loading}>
			<Icon name="refresh-cw" size={12} />
		</Button>
	</div>

	<div class="search-bar">
		<div class="search-input-wrap">
			<Icon name="search" size={14} />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search evidence..."
				class="search-input"
				onkeydown={(e) => e.key === 'Enter' && performSearch()}
			/>
		</div>
		<Button variant="ghost" size="sm" onclick={performSearch} disabled={searching || !searchQuery.trim()}>
			{searching ? 'Searching...' : 'Semantic Search'}
		</Button>
	</div>

	{#if searchResults.length > 0}
		<div class="search-results">
			<div class="results-header">
				<span>Semantic Results ({searchResults.length})</span>
				<button class="clear-btn" onclick={() => (searchResults = [])}>Clear</button>
			</div>
			{#each searchResults as result}
				<div class="result-item">
					<div class="result-info">
						<span class="result-title">{result.title}</span>
						<span class="result-type">{result.evidenceType}</span>
					</div>
					<span class="similarity-badge">
						{Math.round(result.similarity * 100)}%
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if loading}
		<p class="status-msg">Loading evidence...</p>
	{:else if error}
		<p class="error-msg">{error}</p>
	{:else if filteredItems.length === 0}
		<div class="empty-state">
			<Icon name="inbox" size={20} />
			<span>{searchQuery ? 'No matches' : 'No evidence files'}</span>
		</div>
	{:else}
		<div class="evidence-list">
			{#each filteredItems as item (item.id)}
				<div class="evidence-item">
					<div class="item-main">
						<Icon name="file" size={14} />
						<div class="item-info">
							<span class="item-title">{item.title}</span>
							{#if item.description}
								<span class="item-desc">{item.description}</span>
							{/if}
						</div>
					</div>
					<div class="item-meta">
						<span class="meta-tag">{item.evidenceType}</span>
						<span class="meta-tag">{formatSize(item.fileSize)}</span>
						<span class="meta-tag">{formatDate(item.uploadedAt)}</span>
						{#if item.hasEmbedding}
							<span class="embed-badge">
								<Icon name="circle-check" size={10} />
								Embedded
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.evidence-mgr {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.mgr-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.mgr-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.item-count {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 0.25rem;
		opacity: 0.6;
	}
	.search-bar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.search-input-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
	}
	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		color: inherit;
		font-size: 0.75rem;
		outline: none;
	}
	.search-results {
		margin-bottom: 0.75rem;
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 0.375rem;
		overflow: hidden;
	}
	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.375rem 0.5rem;
		background: rgba(59, 130, 246, 0.08);
		font-size: 0.6875rem;
		font-weight: 500;
	}
	.clear-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-info, #3b82f6);
		font-size: 0.6875rem;
	}
	.result-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.result-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.result-title {
		font-size: 0.8125rem;
	}
	.result-type {
		font-size: 0.6875rem;
		opacity: 0.5;
	}
	.similarity-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		font-family: monospace;
		padding: 0.125rem 0.375rem;
		background: rgba(16, 185, 129, 0.15);
		color: var(--color-accent, #a51c30);
		border-radius: 0.25rem;
	}
	.status-msg {
		font-size: 0.8125rem;
		opacity: 0.5;
		margin: 0;
		text-align: center;
		padding: 1.5rem;
	}
	.error-msg {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0;
		text-align: center;
		padding: 1.5rem;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem;
		opacity: 0.5;
		font-size: 0.8125rem;
	}
	.evidence-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.evidence-item {
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
	}
	.item-main {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}
	.item-info {
		flex: 1;
		min-width: 0;
	}
	.item-title {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-desc {
		display: block;
		font-size: 0.6875rem;
		opacity: 0.5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding-left: 1.5rem;
	}
	.meta-tag {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.25rem;
		opacity: 0.6;
	}
	.embed-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		color: var(--color-accent, #a51c30);
		opacity: 1;
	}
</style>
