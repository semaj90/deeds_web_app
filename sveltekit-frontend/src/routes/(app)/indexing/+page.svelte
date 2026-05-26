<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface IndexingStatus {
		success: boolean;
		collections: {
			codebase: { points_count: number };
			errors: { points_count: number };
		};
		timestamp: string;
	}

	interface SearchResult {
		file: string;
		chunk: number;
		similarity: string;
		language: string;
		content: string;
	}

	interface ErrorResult {
		code: string;
		file: string;
		count: number;
		similarity: string;
		message: string;
	}

	let status = $state<IndexingStatus | null>(null);
	let loading = $state(false);
	let activeTab = $state<'status' | 'index' | 'search'>('status');

	// Index
	let indexPath = $state('./src');
	let indexResults = $state<any[]>([]);
	let indexing = $state(false);
	let indexMessage = $state('');

	// Search
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let searching = $state(false);
	let searchType = $state<'codebase' | 'errors'>('codebase');
	let errorResults = $state<ErrorResult[]>([]);

	async function loadStatus() {
		loading = true;
		try {
			const response = await fetch('/api/indexing');
			status = await response.json();
		} catch (err) {
			console.error('Failed to load status:', err);
		} finally {
			loading = false;
		}
	}

	async function indexCodebase() {
		indexing = true;
		indexResults = [];
		indexMessage = '';

		try {
			const response = await fetch('/api/indexing?action=codebase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rootPath: indexPath }),
			});

			const result = await response.json();

			if (result.success) {
				indexResults = result.indexed || [];
				indexMessage = result.message || '';
				activeTab = 'status';
				await loadStatus();
			} else {
				indexMessage = result.error || 'Indexing failed';
			}
		} catch (err) {
			console.error('Indexing failed:', err);
			indexMessage = 'Failed to connect to indexing service';
		} finally {
			indexing = false;
		}
	}

	async function indexErrors() {
		indexing = true;
		indexResults = [];
		indexMessage = '';

		try {
			const response = await fetch('/api/indexing?action=errors', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			const result = await response.json();

			if (result.success) {
				indexResults = result.indexed || [];
				indexMessage = result.message || '';
				activeTab = 'status';
				await loadStatus();
			} else {
				indexMessage = result.error || 'Error indexing failed';
			}
		} catch (err) {
			console.error('Error indexing failed:', err);
			indexMessage = 'Failed to connect to indexing service';
		} finally {
			indexing = false;
		}
	}

	async function search() {
		if (!searchQuery.trim()) return;

		searching = true;
		searchResults = [];
		errorResults = [];

		try {
			const action = searchType === 'codebase' ? 'search' : 'search-errors';
			const response = await fetch(`/api/indexing?action=${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQuery, limit: 10 }),
			});

			const result = await response.json();

			if (result.success) {
				if (searchType === 'codebase') {
					searchResults = result.results || [];
				} else {
					errorResults = result.results || [];
				}
			}
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			searching = false;
		}
	}

	$effect(() => {
		loadStatus();
	});
</script>

<div class="indexing-page">
	<!-- Header -->
	<header class="page-header">
		<div class="header-content">
			<div class="header-title">
				<Icon name="database" size={24} />
				<div>
					<h1>CODEBASE INDEXER</h1>
					<p class="header-sub">SeaweedFS + Qdrant + Ollama Embedding Pipeline</p>
				</div>
			</div>
			<button class="refresh-btn" onclick={loadStatus} disabled={loading}>
				<Icon name="refresh-cw" size={16} class={loading ? 'animate-spin' : ''} />
				Refresh
			</button>
		</div>
	</header>

	<!-- Tabs -->
	<div class="tab-bar">
		<button class="tab" class:active={activeTab === 'status'} onclick={() => activeTab = 'status'}>
			<Icon name="database" size={14} />
			Status
		</button>
		<button class="tab" class:active={activeTab === 'index'} onclick={() => activeTab = 'index'}>
			<Icon name="file-code" size={14} />
			Index
		</button>
		<button class="tab" class:active={activeTab === 'search'} onclick={() => activeTab = 'search'}>
			<Icon name="search" size={14} />
			Search
		</button>
	</div>

	<div class="tab-content">
		<!-- Status Tab -->
		{#if activeTab === 'status'}
			{#if status}
				<div class="status-grid">
					<div class="status-card">
						<div class="card-icon"><Icon name="file-code" size={24} /></div>
						<div class="card-body">
							<h3>Codebase Index</h3>
							<p class="card-number">{status.collections.codebase.points_count}</p>
							<p class="card-label">vectors indexed</p>
						</div>
					</div>

					<div class="status-card">
						<div class="card-icon"><Icon name="triangle-alert" size={24} /></div>
						<div class="card-body">
							<h3>Error Patterns</h3>
							<p class="card-number">{status.collections.errors.points_count}</p>
							<p class="card-label">error clusters</p>
						</div>
					</div>

					<div class="status-card">
						<div class="card-icon"><Icon name="hard-drive" size={24} /></div>
						<div class="card-body">
							<h3>Storage</h3>
							<p class="card-number-sm">SeaweedFS + Qdrant</p>
							<p class="card-label">+ PostgreSQL</p>
						</div>
					</div>

					<div class="status-card">
						<div class="card-icon"><Icon name="clock" size={24} /></div>
						<div class="card-body">
							<h3>Last Updated</h3>
							<p class="card-number-sm">{new Date(status.timestamp).toLocaleTimeString()}</p>
							<p class="card-label">{new Date(status.timestamp).toLocaleDateString()}</p>
						</div>
					</div>
				</div>

				<div class="pipeline-status">
					<h3>RAG Pipeline Status</h3>
					<div class="pipeline-items">
						<div class="pipeline-item" class:ready={status.collections.codebase.points_count > 0}>
							<span class="pipeline-dot"></span>
							Codebase indexing: {status.collections.codebase.points_count > 0 ? 'Ready' : 'Empty'}
						</div>
						<div class="pipeline-item" class:ready={status.collections.errors.points_count > 0}>
							<span class="pipeline-dot"></span>
							Error analysis: {status.collections.errors.points_count > 0 ? 'Ready' : 'Empty'}
						</div>
						<div class="pipeline-item ready">
							<span class="pipeline-dot"></span>
							Vector search: Available (768-dim embeddinggemma)
						</div>
						<div class="pipeline-item ready">
							<span class="pipeline-dot"></span>
							SeaweedFS object storage: Configured
						</div>
					</div>
				</div>
			{:else if loading}
				<div class="loading-state">
					<Icon name="loader-circle" size={32} class="animate-spin" />
					<p>Loading status...</p>
				</div>
			{:else}
				<div class="loading-state">
					<Icon name="triangle-alert" size={32} />
					<p>Failed to load status. Ensure Qdrant is running.</p>
				</div>
			{/if}
		{/if}

		<!-- Index Tab -->
		{#if activeTab === 'index'}
			<div class="index-sections">
				<div class="index-section">
					<h2>Index Codebase</h2>
					<p class="section-desc">Scan TypeScript/Svelte files, generate embeddings via Ollama, and index in Qdrant for semantic search.</p>

					<div class="form-row">
						<label for="rootPath">Root Path</label>
						<input
							id="rootPath"
							type="text"
							bind:value={indexPath}
							placeholder="./src"
							disabled={indexing}
							class="form-input"
						/>
					</div>

					<Button
						variant="default"
						size="sm"
						onclick={indexCodebase}
						disabled={indexing}
					>
						{#if indexing}
							<Icon name="loader-circle" size={16} class="animate-spin" />
							Indexing...
						{:else}
							<Icon name="file-code" size={16} />
							Index Codebase
						{/if}
					</Button>
				</div>

				<div class="index-section">
					<h2>Index Error Patterns</h2>
					<p class="section-desc">Extract error clusters from PostgreSQL and index them in Qdrant for pattern matching.</p>

					<Button
						variant="default"
						size="sm"
						onclick={indexErrors}
						disabled={indexing}
					>
						{#if indexing}
							<Icon name="loader-circle" size={16} class="animate-spin" />
							Indexing...
						{:else}
							<Icon name="triangle-alert" size={16} />
							Index Errors
						{/if}
					</Button>
				</div>

				{#if indexMessage}
					<div class="index-message">
						<p>{indexMessage}</p>
					</div>
				{/if}

				{#if indexResults.length > 0}
					<div class="index-results">
						<h3>Indexed Files ({indexResults.length})</h3>
						<div class="results-list">
							{#each indexResults as result}
								<div class="result-row">
									<Icon name="file-code" size={14} />
									<div class="result-info">
										<span class="result-file">{result.file || result.code}</span>
										<span class="result-meta">
											{#if result.chunks}
												{result.chunks} chunks, {result.vectors} vectors
											{:else if result.count}
												{result.count} occurrences
											{/if}
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Search Tab -->
		{#if activeTab === 'search'}
			<div class="search-section">
				<h2>Search Indexed Data</h2>

				<div class="search-type-toggle">
					<button
						class="type-btn"
						class:active={searchType === 'codebase'}
						onclick={() => searchType = 'codebase'}
					>
						<Icon name="file-code" size={14} />
						Codebase
					</button>
					<button
						class="type-btn"
						class:active={searchType === 'errors'}
						onclick={() => searchType = 'errors'}
					>
						<Icon name="triangle-alert" size={14} />
						Errors
					</button>
				</div>

				<div class="search-box">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder={searchType === 'codebase'
							? 'e.g., "import statement for stores"'
							: 'e.g., "cannot find module"'}
						onkeydown={(e) => e.key === 'Enter' && search()}
						disabled={searching}
						class="search-input"
					/>
					<Button
						variant="default"
						size="sm"
						onclick={search}
						disabled={searching || !searchQuery.trim()}
					>
						{#if searching}
							<Icon name="loader-circle" size={16} class="animate-spin" />
						{:else}
							<Icon name="search" size={16} />
						{/if}
						Search
					</Button>
				</div>

				<!-- Codebase Results -->
				{#if searchType === 'codebase' && searchResults.length > 0}
					<div class="search-results">
						<h3>Codebase Matches ({searchResults.length})</h3>
						{#each searchResults as result}
							<div class="search-result-card">
								<div class="result-header">
									<span class="badge lang">{result.language}</span>
									<span class="badge similarity">{result.similarity}%</span>
								</div>
								<p class="result-file-path">{result.file}</p>
								<p class="result-chunk">Chunk #{result.chunk}</p>
								<pre class="result-preview">{result.content}</pre>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Error Results -->
				{#if searchType === 'errors' && errorResults.length > 0}
					<div class="search-results">
						<h3>Error Pattern Matches ({errorResults.length})</h3>
						{#each errorResults as result}
							<div class="search-result-card error">
								<div class="result-header">
									<span class="badge error-code">{result.code}</span>
									<span class="badge similarity">{result.similarity}%</span>
								</div>
								<p class="result-file-path">{result.file}</p>
								<p class="result-chunk">Occurrences: {result.count}</p>
								<pre class="result-preview">{result.message}</pre>
							</div>
						{/each}
					</div>
				{/if}

				{#if searchQuery.trim() && !searching && searchResults.length === 0 && searchType === 'codebase'}
					<div class="no-results">
						<Icon name="search" size={32} />
						<p>No codebase matches for "{searchQuery}"</p>
						<p class="hint">Try indexing your codebase first, or use broader terms.</p>
					</div>
				{/if}

				{#if searchQuery.trim() && !searching && errorResults.length === 0 && searchType === 'errors'}
					<div class="no-results">
						<Icon name="triangle-alert" size={32} />
						<p>No error patterns for "{searchQuery}"</p>
						<p class="hint">Try indexing errors first, or use different keywords.</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.indexing-page {
		min-height: 100vh;
		background: #1a1610;
		color: #d4c9a9;
		font-family: 'JetBrains Mono', monospace;
	}

	.page-header {
		padding: 1.25rem 2rem;
		background: #2a2016;
		border-bottom: 2px solid #3a3020;
	}

	.header-content {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-title h1 {
		margin: 0;
		font-size: 1.25rem;
		letter-spacing: 0.15em;
		color: #f8f0d9;
	}

	.header-sub {
		margin: 0;
		font-size: 0.7rem;
		color: #8a7a5a;
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.5rem 0.75rem;
		background: #221d15;
		border: 1px solid #3a3020;
		border-radius: 4px;
		color: #8a7a5a;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.refresh-btn:hover:not(:disabled) {
		border-color: #c9a96e;
		color: #f8f0d9;
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Tabs */
	.tab-bar {
		display: flex;
		gap: 0;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		border-bottom: 1px solid #3a3020;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.75rem 1.25rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: #8a7a5a;
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover {
		color: #d4c9a9;
	}

	.tab.active {
		color: #c9a96e;
		border-bottom-color: #c9a96e;
	}

	.tab-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 2rem;
	}

	/* Status Grid */
	.status-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.status-card {
		display: flex;
		gap: 1rem;
		padding: 1.25rem;
		background: #221d15;
		border: 1px solid #3a3020;
		border-radius: 4px;
		transition: border-color 0.15s;
	}

	.status-card:hover {
		border-color: #c9a96e;
	}

	.card-icon {
		color: #c9a96e;
		flex-shrink: 0;
	}

	.card-body h3 {
		margin: 0 0 4px;
		font-size: 0.7rem;
		color: #8a7a5a;
		letter-spacing: 0.1em;
	}

	.card-number {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
		color: #c9a96e;
	}

	.card-number-sm {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #c9a96e;
	}

	.card-label {
		margin: 2px 0 0;
		font-size: 0.65rem;
		color: #5a5040;
	}

	/* Pipeline Status */
	.pipeline-status {
		background: #221d15;
		border: 1px solid #3a3020;
		border-left: 3px solid #c9a96e;
		border-radius: 4px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
	}

	.pipeline-status h3 {
		margin: 0 0 0.75rem;
		font-size: 0.75rem;
		color: #c9a96e;
		letter-spacing: 0.1em;
	}

	.pipeline-items {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pipeline-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.75rem;
		color: #8a7a5a;
	}

	.pipeline-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #5a5040;
		flex-shrink: 0;
	}

	.pipeline-item.ready .pipeline-dot {
		background: #2D5F3F;
		box-shadow: 0 0 6px rgba(45, 95, 63, 0.5);
	}

	.pipeline-item.ready {
		color: #d4c9a9;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 4rem 2rem;
		color: #5a5040;
	}

	.loading-state p {
		margin: 0;
		font-size: 0.85rem;
	}

	/* Index Section */
	.index-sections {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.index-section {
		background: #221d15;
		border: 1px solid #3a3020;
		border-radius: 4px;
		padding: 1.25rem;
	}

	.index-section h2 {
		margin: 0 0 4px;
		font-size: 0.9rem;
		color: #f8f0d9;
		letter-spacing: 0.05em;
	}

	.section-desc {
		margin: 0 0 1rem;
		font-size: 0.75rem;
		color: #8a7a5a;
	}

	.form-row {
		margin-bottom: 1rem;
	}

	.form-row label {
		display: block;
		margin-bottom: 4px;
		font-size: 0.7rem;
		color: #8a7a5a;
		letter-spacing: 0.05em;
	}

	.form-input {
		width: 100%;
		max-width: 400px;
		padding: 8px 12px;
		background: #1a1610;
		border: 1px solid #3a3020;
		border-radius: 4px;
		color: #f8f0d9;
		font-family: inherit;
		font-size: 0.8rem;
	}

	.form-input:focus {
		outline: none;
		border-color: #c9a96e;
	}

	.index-message {
		background: #1a2015;
		border: 1px solid #2D5F3F;
		border-radius: 4px;
		padding: 10px 14px;
	}

	.index-message p {
		margin: 0;
		font-size: 0.75rem;
		color: #8a9a6a;
	}

	.index-results h3 {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
		color: #c9a96e;
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.result-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: #221d15;
		border: 1px solid #2a2418;
		border-radius: 4px;
		color: #8a7a5a;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.result-file {
		font-size: 0.8rem;
		color: #d4c9a9;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-meta {
		font-size: 0.65rem;
		color: #5a5040;
	}

	/* Search Section */
	.search-section h2 {
		margin: 0 0 1rem;
		font-size: 0.9rem;
		color: #f8f0d9;
	}

	.search-type-toggle {
		display: flex;
		gap: 4px;
		margin-bottom: 1rem;
		background: #1a1610;
		border-radius: 4px;
		padding: 3px;
		width: fit-content;
	}

	.type-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.4rem 0.75rem;
		font-size: 0.7rem;
		font-family: inherit;
		font-weight: 600;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		background: transparent;
		color: #8a7a5a;
		transition: all 0.15s;
	}

	.type-btn.active {
		background: #3a3020;
		color: #f8f0d9;
	}

	.search-box {
		display: flex;
		gap: 8px;
		margin-bottom: 1.5rem;
	}

	.search-input {
		flex: 1;
		padding: 8px 12px;
		background: #1a1610;
		border: 1px solid #3a3020;
		border-radius: 4px;
		color: #f8f0d9;
		font-family: inherit;
		font-size: 0.8rem;
	}

	.search-input::placeholder {
		color: #5a5040;
	}

	.search-input:focus {
		outline: none;
		border-color: #c9a96e;
	}

	/* Search Results */
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.search-results h3 {
		margin: 0 0 4px;
		font-size: 0.8rem;
		color: #c9a96e;
	}

	.search-result-card {
		background: #221d15;
		border: 1px solid #3a3020;
		border-radius: 4px;
		padding: 12px;
	}

	.search-result-card.error {
		border-left: 3px solid #8B1521;
	}

	.result-header {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 3px;
		font-size: 0.65rem;
		font-weight: 600;
	}

	.badge.lang {
		background: #1a2030;
		color: #6ba3a0;
	}

	.badge.error-code {
		background: #2a1515;
		color: #d4a0a0;
	}

	.badge.similarity {
		background: #1a2a1a;
		color: #8a9a6a;
		margin-left: auto;
	}

	.result-file-path {
		margin: 0 0 4px;
		font-size: 0.8rem;
		color: #d4c9a9;
	}

	.result-chunk {
		margin: 0 0 8px;
		font-size: 0.65rem;
		color: #5a5040;
	}

	.result-preview {
		margin: 0;
		font-size: 0.7rem;
		color: #8a7a5a;
		line-height: 1.5;
		font-family: inherit;
		white-space: pre-wrap;
		word-break: break-word;
		background: #1a1610;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #2a2418;
		max-height: 120px;
		overflow-y: auto;
	}

	/* No Results */
	.no-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 3rem;
		color: #5a5040;
		text-align: center;
	}

	.no-results p {
		margin: 0;
		font-size: 0.85rem;
	}

	.hint {
		font-size: 0.7rem;
		color: #4a4030;
	}
</style>
