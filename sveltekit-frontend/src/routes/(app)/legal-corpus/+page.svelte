<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import LegalPrecedentCard from '$lib/components/legal/LegalPrecedentCard.svelte';

	let { data } = $props();

	// View mode
	let activeView = $state<'corpus' | 'glossary'>('corpus');

	// Search
	let searchQuery = $state('');
	let searching = $state(false);
	let searchResults = $state<any[]>([]);
	let searchTiming = $state<Record<string, number>>({});

	// Glossary search
	let glossaryQuery = $state('');
	let glossarySearching = $state(false);
	let glossaryResults = $state<any[]>([]);

	// Precedent search
	let precedentResults = $state<any[]>([]);

	// Filters
	let jurisdictionFilter = $state<string>('all');
	let categoryFilter = $state<string>('all');
	let sortBy = $state<'relevance' | 'title' | 'date'>('relevance');

	// Debounce timer
	let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	const jurisdictions = [
		{ value: 'all', label: 'All Jurisdictions' },
		{ value: 'federal', label: 'Federal' },
		{ value: 'state', label: 'State' },
		{ value: 'regulation', label: 'Regulations' },
		{ value: 'international', label: 'International' },
	];

	const categories = [
		{ value: 'all', label: 'All Categories' },
		{ value: 'criminal', label: 'Criminal' },
		{ value: 'civil', label: 'Civil' },
		{ value: 'constitutional', label: 'Constitutional' },
		{ value: 'administrative', label: 'Administrative' },
		{ value: 'corporate', label: 'Corporate' },
		{ value: 'tax', label: 'Tax' },
		{ value: 'property', label: 'Property' },
		{ value: 'family', label: 'Family' },
		{ value: 'environmental', label: 'Environmental' },
		{ value: 'labor', label: 'Labor' },
	];

	function handleSearchInput(value: string) {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!value || value.length < 2) {
			searchResults = [];
			precedentResults = [];
			return;
		}
		debounceTimer = setTimeout(() => searchCorpus(value), 400);
	}

	$effect(() => {
		handleSearchInput(searchQuery);
	});

	async function searchCorpus(query: string) {
		searching = true;
		const headers = { 'Content-Type': 'application/json' };
		const filters: Record<string, string> = {};
		if (jurisdictionFilter !== 'all') filters.jurisdiction = jurisdictionFilter;
		if (categoryFilter !== 'all') filters.category = categoryFilter;

		try {
			const [statuteRes, precedentRes] = await Promise.all([
				fetch('/api/statutes/search', {
					method: 'POST',
					headers,
					body: JSON.stringify({ query, limit: 20, ...filters }),
				}).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
				fetch('/api/precedents/search', {
					method: 'POST',
					headers,
					body: JSON.stringify({ query, limit: 10 }),
				}).then((r) => (r.ok ? r.json() : { results: [] })).catch(() => ({ results: [] })),
			]);

			searchResults = statuteRes.results ?? [];
			searchTiming = statuteRes.timing ?? {};
			precedentResults = precedentRes.results ?? [];
		} catch {
			searchResults = [];
			precedentResults = [];
		} finally {
			searching = false;
		}
	}

	async function searchGlossary(query: string) {
		if (!query || query.length < 2) {
			glossaryResults = [];
			return;
		}
		glossarySearching = true;
		try {
			const res = await fetch('/api/glossary/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, limit: 20 }),
			});
			if (res.ok) {
				const json = await res.json();
				glossaryResults = json.results ?? [];
			}
		} catch {
			glossaryResults = [];
		} finally {
			glossarySearching = false;
		}
	}

	let glossaryDebounce = $state<ReturnType<typeof setTimeout> | null>(null);
	$effect(() => {
		if (glossaryDebounce) clearTimeout(glossaryDebounce);
		const q = glossaryQuery;
		if (q.length >= 2) {
			glossaryDebounce = setTimeout(() => searchGlossary(q), 400);
		} else {
			glossaryResults = [];
		}
	});

	function formatDate(d: string | Date | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function similarityPercent(sim: number): string {
		return `${Math.round(sim * 100)}%`;
	}

	let filteredStatutes = $derived.by(() => {
		let items = data.recentStatutes ?? [];
		if (jurisdictionFilter !== 'all') {
			items = items.filter((s: any) => s.jurisdiction?.toLowerCase().includes(jurisdictionFilter));
		}
		if (categoryFilter !== 'all') {
			items = items.filter((s: any) => s.category?.toLowerCase() === categoryFilter);
		}
		return items;
	});
</script>

<div class="legal-corpus-page">
	<!-- Header -->
	<header class="corpus-header">
		<div class="header-left">
			<h1><Icon name="book-open" class="w-6 h-6" /> Legal Corpus</h1>
			<p class="subtitle">Statutes, regulations, glossary, and case law research</p>
		</div>
		<div class="header-stats">
			<span class="stat-chip"><strong>{data.stats?.statutes ?? 0}</strong> Statutes</span>
			<span class="stat-chip"><strong>{data.stats?.glossary ?? 0}</strong> Terms</span>
			<span class="stat-chip"><strong>{data.stats?.precedents ?? 0}</strong> Precedents</span>
			<span class="stat-chip"><strong>{data.stats?.jurisdictions ?? 0}</strong> Jurisdictions</span>
		</div>
	</header>

	<!-- View Tabs -->
	<div class="view-tabs">
		<button class="tab-btn" class:active={activeView === 'corpus'} onclick={() => (activeView = 'corpus')}>
			<Icon name="scroll-text" class="w-4 h-4" /> Statute Corpus
		</button>
		<button class="tab-btn" class:active={activeView === 'glossary'} onclick={() => (activeView = 'glossary')}>
			<Icon name="book-text" class="w-4 h-4" /> Legal Glossary
		</button>
	</div>

	<div class="corpus-layout">
		<!-- Left Rail -->
		<aside class="left-rail">
			{#if activeView === 'corpus'}
				<div class="filter-section">
					<h3>Jurisdiction</h3>
					{#each jurisdictions as j}
						<label class="radio-item" class:selected={jurisdictionFilter === j.value}>
							<input type="radio" name="jurisdiction" value={j.value} bind:group={jurisdictionFilter} />
							<span>{j.label}</span>
						</label>
					{/each}
				</div>

				<div class="filter-section">
					<h3>Category</h3>
					<select class="filter-select" bind:value={categoryFilter}>
						{#each categories as c}
							<option value={c.value}>{c.label}</option>
						{/each}
					</select>
				</div>

				<div class="filter-section">
					<h3>Sort By</h3>
					<select class="filter-select" bind:value={sortBy}>
						<option value="relevance">Relevance</option>
						<option value="title">Title (A-Z)</option>
						<option value="date">Date (Newest)</option>
					</select>
				</div>
			{:else}
				<!-- Glossary quick-lookup -->
				<div class="filter-section">
					<h3>Quick Lookup</h3>
					<p class="filter-hint">Type a legal term, acronym, or popular name</p>
					{#each (data.glossaryTerms ?? []).slice(0, 15) as term}
						<button
							class="glossary-quick-link"
							onclick={() => { glossaryQuery = term.term; }}
						>
							{term.term}
						</button>
					{/each}
				</div>
			{/if}
		</aside>

		<!-- Main Content -->
		<main class="main-content">
			{#if activeView === 'corpus'}
				<!-- Search Bar -->
				<div class="search-bar">
					<Icon name="search" class="w-5 h-5 search-icon" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search statutes, regulations, case law... (semantic + full-text)"
						class="search-input"
					/>
					{#if searching}
						<span class="search-spinner"></span>
					{/if}
					{#if searchTiming.total_ms}
						<span class="search-timing">{searchTiming.total_ms}ms</span>
					{/if}
				</div>

				<!-- Search Results -->
				{#if searchResults.length > 0}
					<div class="results-section">
						<h2>Statute Results ({searchResults.length})</h2>
						<div class="statute-grid">
							{#each searchResults as result}
								<a href="/legal-corpus/{result.statuteId}" class="statute-card">
									<div class="card-header">
										<div class="card-title-row">
											<h3>{result.statuteTitle || 'Untitled Statute'}</h3>
											<span class="similarity-badge" class:high={result.similarity > 0.8} class:medium={result.similarity > 0.5 && result.similarity <= 0.8}>
												{similarityPercent(result.similarity)}
											</span>
										</div>
										{#if result.section}
											<span class="section-tag">§ {result.section}</span>
										{/if}
									</div>
									<p class="card-excerpt">{result.content?.slice(0, 200)}...</p>
									<div class="card-meta">
										{#if result.jurisdiction}
											<span class="meta-chip jurisdiction">{result.jurisdiction}</span>
										{/if}
										{#if result.category}
											<span class="meta-chip category">{result.category}</span>
										{/if}
									</div>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Precedent Results -->
				{#if precedentResults.length > 0}
					<div class="results-section">
						<h2>Legal Precedents ({precedentResults.length})</h2>
						<div class="precedent-list">
							{#each precedentResults as p}
								<div class="precedent-item">
									<h4>{p.title ?? p.caseName ?? 'Unknown Case'}</h4>
									{#if p.court}<span class="meta-chip">{p.court}</span>{/if}
									{#if p.summary}<p class="precedent-summary">{p.summary?.slice(0, 200)}</p>{/if}
									{#if p.similarity != null}
										<span class="similarity-badge small">{similarityPercent(p.similarity)}</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Recent Statutes (no search) -->
				{#if searchResults.length === 0 && !searching}
					<div class="results-section">
						<h2>Recent Statutes</h2>
						{#if filteredStatutes.length === 0}
							<div class="empty-state">
								<Icon name="book-open" class="w-12 h-12" />
								<p>No statutes found. Use the search bar to query the legal corpus, or seed the database with statute data.</p>
							</div>
						{:else}
							<div class="statute-grid">
								{#each filteredStatutes as statute}
									<a href="/legal-corpus/{statute.id}" class="statute-card">
										<div class="card-header">
											<h3>{statute.title || 'Untitled'}</h3>
											{#if statute.section}
												<span class="section-tag">§ {statute.section}</span>
											{/if}
										</div>
										<div class="card-meta">
											{#if statute.jurisdiction}
												<span class="meta-chip jurisdiction">{statute.jurisdiction}</span>
											{/if}
											{#if statute.category}
												<span class="meta-chip category">{statute.category}</span>
											{/if}
											{#if statute.effectiveDate}
												<span class="meta-chip date">Effective: {formatDate(statute.effectiveDate)}</span>
											{/if}
										</div>
										{#if statute.sourceUrl}
											<span class="source-link"><Icon name="external-link" class="w-3 h-3" /> Official Source</span>
										{/if}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

			{:else}
				<!-- GLOSSARY VIEW -->
				<div class="search-bar">
					<Icon name="search" class="w-5 h-5 search-icon" />
					<input
						type="text"
						bind:value={glossaryQuery}
						placeholder="Search legal terms, acronyms, doctrines... (e.g. CFAA, habeas corpus)"
						class="search-input"
					/>
					{#if glossarySearching}
						<span class="search-spinner"></span>
					{/if}
				</div>

				{#if glossaryResults.length > 0}
					<div class="glossary-results">
						{#each glossaryResults as term}
							<div class="glossary-card">
								<div class="glossary-header">
									<h3>{term.term}</h3>
									<div class="glossary-badges">
										{#if term.jurisdiction}
											<span class="meta-chip jurisdiction">{term.jurisdiction}</span>
										{/if}
										{#if term.category}
											<span class="meta-chip category">{term.category}</span>
										{/if}
										{#if term.matchType}
											<span class="meta-chip match-type">{term.matchType}</span>
										{/if}
										{#if term.similarity != null}
											<span class="similarity-badge small">{similarityPercent(term.similarity)}</span>
										{/if}
									</div>
								</div>
								<p class="glossary-definition">{term.definition}</p>
								{#if term.relatedTerms?.length > 0}
									<div class="related-terms">
										<span class="related-label">Related:</span>
										{#each term.relatedTerms as rt}
											<button class="related-term-link" onclick={() => { glossaryQuery = typeof rt === 'string' ? rt : rt.term ?? ''; }}>
												{typeof rt === 'string' ? rt : rt.term ?? rt}
											</button>
										{/each}
									</div>
								{/if}
								{#if term.sources?.length > 0}
									<div class="glossary-sources">
										<span class="related-label">Sources:</span>
										{#each term.sources as src}
											<span class="source-ref">{typeof src === 'string' ? src : src.title ?? src}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else if glossaryQuery.length >= 2 && !glossarySearching}
					<div class="empty-state">
						<Icon name="book-text" class="w-12 h-12" />
						<p>No glossary terms found for "{glossaryQuery}". Try a different search term.</p>
					</div>
				{:else if !glossaryQuery}
					<!-- Show all terms from server load -->
					<div class="glossary-results">
						{#if (data.glossaryTerms ?? []).length === 0}
							<div class="empty-state">
								<Icon name="book-text" class="w-12 h-12" />
								<p>No glossary terms loaded. Seed the legal_glossary table or use the search bar to query.</p>
							</div>
						{:else}
							{#each data.glossaryTerms ?? [] as term}
								<div class="glossary-card">
									<div class="glossary-header">
										<h3>{term.term}</h3>
										{#if term.category}
											<span class="meta-chip category">{term.category}</span>
										{/if}
									</div>
									<p class="glossary-definition">{term.definition}</p>
									{#if term.relatedTerms}
										<div class="related-terms">
											<span class="related-label">Related:</span>
											{#each (Array.isArray(term.relatedTerms) ? term.relatedTerms : []) as rt}
												<button class="related-term-link" onclick={() => { glossaryQuery = typeof rt === 'string' ? rt : ''; }}>
													{typeof rt === 'string' ? rt : JSON.stringify(rt)}
												</button>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			{/if}
		</main>
	</div>
</div>

<style>
	.legal-corpus-page {
		min-height: 100vh;
		padding: 1.5rem 2.5rem;
		margin: -2.5rem;
		background: var(--color-bg, #0a0a1a);
		color: var(--color-text, #e0e0e0);
	}
	.legal-corpus-page :global(h1), .legal-corpus-page :global(h2), .legal-corpus-page :global(h3), .legal-corpus-page :global(h4), .legal-corpus-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.legal-corpus-page :global(a) { color: inherit; border-bottom: none; }
	.legal-corpus-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.legal-corpus-page :global(input), .legal-corpus-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.legal-corpus-page :global(.panel), .legal-corpus-page :global(.card), .legal-corpus-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.corpus-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	.corpus-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.subtitle {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 0.25rem;
	}
	.header-stats {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.stat-chip {
		padding: 0.35rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.375rem;
		font-size: 0.8rem;
	}
	.stat-chip strong {
		color: #60a5fa;
	}

	/* View tabs */
	.view-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.tab-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.375rem;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s;
	}
	.tab-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.tab-btn.active {
		background: rgba(96, 165, 250, 0.15);
		border-color: #60a5fa;
		color: #60a5fa;
	}

	/* Layout */
	.corpus-layout {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 1.5rem;
	}
	@media (max-width: 768px) {
		.corpus-layout {
			grid-template-columns: 1fr;
		}
		.left-rail {
			display: none;
		}
	}

	/* Left Rail */
	.left-rail {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.filter-section h3 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 0.5rem;
	}
	.filter-hint {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		margin-bottom: 0.5rem;
	}
	.radio-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.85rem;
		transition: background 0.15s;
	}
	.radio-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.radio-item.selected {
		background: rgba(96, 165, 250, 0.1);
		color: #60a5fa;
	}
	.radio-item input {
		accent-color: #60a5fa;
	}
	.filter-select {
		width: 100%;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.375rem;
		color: #e0e0e0;
		font-size: 0.85rem;
	}
	.glossary-quick-link {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		color: #60a5fa;
		background: none;
		border: none;
		cursor: pointer;
		border-radius: 0.25rem;
	}
	.glossary-quick-link:hover {
		background: rgba(96, 165, 250, 0.1);
	}

	/* Search Bar */
	.search-bar {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 1.5rem;
	}
	.search-icon {
		position: absolute;
		left: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		padding: 0.75rem 0.75rem 0.75rem 2.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.5rem;
		color: #e0e0e0;
		font-size: 0.9rem;
	}
	.search-input:focus {
		outline: none;
		border-color: #60a5fa;
		box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
	}
	.search-spinner {
		position: absolute;
		right: 3.5rem;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(96, 165, 250, 0.3);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.search-timing {
		position: absolute;
		right: 0.75rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Results */
	.results-section {
		margin-bottom: 2rem;
	}
	.results-section h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: rgba(255, 255, 255, 0.8);
	}

	/* Statute Cards */
	.statute-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}
	.statute-card {
		display: block;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	.statute-card:hover {
		border-color: #60a5fa;
		background: rgba(96, 165, 250, 0.05);
	}
	.card-header {
		margin-bottom: 0.5rem;
	}
	.card-title-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.statute-card h3 {
		font-size: 0.95rem;
		font-weight: 600;
		color: #e0e0e0;
		margin: 0;
	}
	.section-tag {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-family: monospace;
		margin-top: 0.25rem;
	}
	.card-excerpt {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}
	.card-meta {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.meta-chip {
		padding: 0.15rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-weight: 500;
	}
	.meta-chip.jurisdiction {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}
	.meta-chip.category {
		background: rgba(168, 85, 247, 0.15);
		color: #a855f7;
	}
	.meta-chip.date {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.5);
	}
	.meta-chip.match-type {
		background: rgba(59, 130, 246, 0.15);
		color: #3b82f6;
	}
	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: #60a5fa;
		margin-top: 0.5rem;
	}

	/* Similarity badge */
	.similarity-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: monospace;
		background: rgba(234, 179, 8, 0.15);
		color: #eab308;
		white-space: nowrap;
	}
	.similarity-badge.high {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}
	.similarity-badge.medium {
		background: rgba(234, 179, 8, 0.15);
		color: #eab308;
	}
	.similarity-badge.small {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
	}

	/* Precedent list */
	.precedent-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.precedent-item {
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
	}
	.precedent-item h4 {
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}
	.precedent-summary {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
		margin-top: 0.35rem;
	}

	/* Glossary */
	.glossary-results {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.glossary-card {
		padding: 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
	}
	.glossary-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}
	.glossary-header h3 {
		font-size: 1.1rem;
		font-weight: 700;
		color: #60a5fa;
	}
	.glossary-badges {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.glossary-definition {
		font-size: 0.9rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.75);
		margin-bottom: 0.75rem;
	}
	.related-terms, .glossary-sources {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}
	.related-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		font-weight: 600;
	}
	.related-term-link {
		padding: 0.15rem 0.5rem;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 0.25rem;
		color: #60a5fa;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.related-term-link:hover {
		background: rgba(96, 165, 250, 0.2);
	}
	.source-ref {
		padding: 0.15rem 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: rgba(255, 255, 255, 0.4);
	}
	.empty-state p {
		margin-top: 1rem;
		font-size: 0.9rem;
	}
</style>
