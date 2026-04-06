<script lang="ts">
	import { Tabs, Dialog, ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data } = $props();

	// Tab state
	let activeTab = $state('corpus');

	// Search
	let searchQuery = $state('');
	let searching = $state(false);
	let searchResults = $state<any[]>([]);
	let searchTiming = $state<Record<string, number>>({});

	// Glossary
	let glossaryQuery = $state('');
	let glossarySearching = $state(false);
	let glossaryResults = $state<any[]>([]);

	// Precedent
	let precedentResults = $state<any[]>([]);

	// Filters
	let jurisdictionFilter = $state('all');
	let categoryFilter = $state('all');

	// Detail dialog
	let detailOpen = $state(false);
	let detailItem = $state<any>(null);
	let detailSummary = $state<any>(null);
	let detailLoading = $state(false);

	// Glossary letter filter
	let activeLetter = $state('');

	// Debounce
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let glossaryDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const jurisdictions = [
		{ value: 'all', label: 'All' },
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

	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	$effect(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		const q = searchQuery;
		if (!q || q.length < 2) {
			searchResults = [];
			precedentResults = [];
			return;
		}
		debounceTimer = setTimeout(() => searchCorpus(q), 400);
	});

	$effect(() => {
		if (glossaryDebounceTimer) clearTimeout(glossaryDebounceTimer);
		const q = glossaryQuery;
		if (!q || q.length < 2) {
			glossaryResults = [];
			return;
		}
		glossaryDebounceTimer = setTimeout(() => searchGlossary(q), 400);
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

	async function openDetail(statute: any) {
		detailItem = statute;
		detailSummary = null;
		detailOpen = true;
		detailLoading = true;
		try {
			const res = await fetch(`/api/statutes/${statute.id}/summary`, { method: 'POST' });
			if (res.ok) detailSummary = await res.json();
		} catch { /* non-fatal */ }
		finally { detailLoading = false; }
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

	let filteredGlossary = $derived.by(() => {
		const terms = data.glossaryTerms ?? [];
		if (!activeLetter) return terms;
		return terms.filter((t: any) => t.term?.charAt(0).toUpperCase() === activeLetter);
	});

	function formatDate(d: string | Date | null): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function pct(n: number): string {
		return `${Math.round(n * 100)}%`;
	}
</script>

<div class="corpus-page">
	<!-- Header -->
	<header class="corpus-header">
		<div class="header-title">
			<div class="title-icon"><Icon name="scale" /></div>
			<div>
				<h1>Legal Corpus</h1>
				<p class="subtitle">Statutes, glossary &amp; case law research</p>
			</div>
		</div>
		<div class="stat-row">
			<div class="stat-card">
				<span class="stat-num">{data.stats?.statutes ?? 0}</span>
				<span class="stat-label">Statutes</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{data.stats?.glossary ?? 0}</span>
				<span class="stat-label">Terms</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{data.stats?.precedents ?? 0}</span>
				<span class="stat-label">Precedents</span>
			</div>
			<div class="stat-card">
				<span class="stat-num">{data.stats?.jurisdictions ?? 0}</span>
				<span class="stat-label">Jurisdictions</span>
			</div>
		</div>
	</header>

	<!-- Tabs -->
	<Tabs.Root bind:value={activeTab}>
		<Tabs.List class="tab-list">
			<Tabs.Trigger value="corpus" class="tab-trigger">
				<Icon name="scroll-text" /> Statute Corpus
			</Tabs.Trigger>
			<Tabs.Trigger value="glossary" class="tab-trigger">
				<Icon name="book-text" /> Legal Glossary
			</Tabs.Trigger>
			<Tabs.Trigger value="precedents" class="tab-trigger">
				<Icon name="gavel" /> Precedents
			</Tabs.Trigger>
		</Tabs.List>

		<!-- CORPUS TAB -->
		<Tabs.Content value="corpus" class="tab-content">
			<div class="corpus-layout">
				<!-- Filters sidebar -->
				<aside class="sidebar">
					<div class="filter-group">
						<h3 class="filter-title">Jurisdiction</h3>
						{#each jurisdictions as j}
							<label class="filter-radio" class:selected={jurisdictionFilter === j.value}>
								<input type="radio" name="jurisdiction" value={j.value} bind:group={jurisdictionFilter} />
								<span>{j.label}</span>
							</label>
						{/each}
					</div>
					<div class="filter-group">
						<h3 class="filter-title">Category</h3>
						<select class="filter-select" bind:value={categoryFilter}>
							{#each categories as c}
								<option value={c.value}>{c.label}</option>
							{/each}
						</select>
					</div>
				</aside>

				<!-- Main content -->
				<div class="main-area">
					<!-- Search -->
					<div class="search-container">
						<Icon name="search" />
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search statutes, regulations, case law..."
							class="search-input"
						/>
						{#if searching}
							<div class="spinner"></div>
						{/if}
						{#if searchTiming.total_ms}
							<span class="timing">{searchTiming.total_ms}ms</span>
						{/if}
					</div>

					<ScrollArea.Root class="scroll-root">
						<ScrollArea.Viewport class="scroll-viewport">
							{#if searchResults.length > 0}
								<!-- Search results -->
								<h2 class="section-heading">Search Results ({searchResults.length})</h2>
								<div class="card-grid">
									{#each searchResults as result}
										<button class="statute-card" onclick={() => openDetail(result)}>
											<div class="card-top">
												<h3>{result.title || result.statuteTitle || 'Untitled'}</h3>
												<span class="score" class:high={result.similarity > 0.8} class:mid={result.similarity > 0.5 && result.similarity <= 0.8}>
													{pct(result.similarity ?? result.score ?? 0)}
												</span>
											</div>
											{#if result.section || result.citationLabel}
												<span class="section-label">§ {result.section || result.citationLabel}</span>
											{/if}
											<p class="excerpt">{(result.content ?? result.snippet ?? '').slice(0, 180)}...</p>
											<div class="tag-row">
												{#if result.jurisdiction}
													<span class="tag jurisdiction">{result.jurisdiction}</span>
												{/if}
												{#if result.category}
													<span class="tag category">{result.category}</span>
												{/if}
											</div>
										</button>
									{/each}
								</div>

								{#if precedentResults.length > 0}
									<h2 class="section-heading">Related Precedents ({precedentResults.length})</h2>
									<div class="precedent-list">
										{#each precedentResults as p}
											<div class="precedent-card">
												<h4>{p.title ?? p.caseName ?? 'Unknown'}</h4>
												<div class="tag-row">
													{#if p.court}<span class="tag">{p.court}</span>{/if}
													{#if p.similarity != null}<span class="score small">{pct(p.similarity)}</span>{/if}
												</div>
												{#if p.summary}<p class="excerpt">{p.summary.slice(0, 200)}</p>{/if}
											</div>
										{/each}
									</div>
								{/if}
							{:else if !searching && searchQuery.length < 2}
								<!-- Recent statutes -->
								<h2 class="section-heading">Recent Statutes</h2>
								{#if filteredStatutes.length === 0}
									<div class="empty">
										<Icon name="book-open" />
										<p>No statutes found. Use search or seed the database.</p>
									</div>
								{:else}
									<div class="card-grid">
										{#each filteredStatutes as statute}
											<button class="statute-card" onclick={() => openDetail(statute)}>
												<div class="card-top">
													<h3>{statute.title || 'Untitled'}</h3>
												</div>
												{#if statute.section}
													<span class="section-label">§ {statute.section}</span>
												{/if}
												<div class="tag-row">
													{#if statute.jurisdiction}
														<span class="tag jurisdiction">{statute.jurisdiction}</span>
													{/if}
													{#if statute.category}
														<span class="tag category">{statute.category}</span>
													{/if}
													{#if statute.effectiveDate}
														<span class="tag date">{formatDate(statute.effectiveDate)}</span>
													{/if}
												</div>
												{#if statute.sourceUrl}
													<span class="source-link"><Icon name="external-link" /> Source</span>
												{/if}
											</button>
										{/each}
									</div>
								{/if}
							{:else if searching}
								<div class="empty">
									<div class="spinner"></div>
									<p>Searching corpus...</p>
								</div>
							{:else}
								<div class="empty">
									<Icon name="search" />
									<p>No results for "{searchQuery}"</p>
								</div>
							{/if}
						</ScrollArea.Viewport>
						<ScrollArea.Scrollbar orientation="vertical" class="scrollbar">
							<ScrollArea.Thumb class="scrollbar-thumb" />
						</ScrollArea.Scrollbar>
					</ScrollArea.Root>
				</div>
			</div>
		</Tabs.Content>

		<!-- GLOSSARY TAB -->
		<Tabs.Content value="glossary" class="tab-content">
			<div class="glossary-layout">
				<!-- Alphabet rail -->
				<div class="alpha-rail">
					<button
						class="alpha-btn"
						class:active={activeLetter === ''}
						onclick={() => (activeLetter = '')}
					>All</button>
					{#each alphabet as letter}
						<button
							class="alpha-btn"
							class:active={activeLetter === letter}
							onclick={() => (activeLetter = letter)}
						>{letter}</button>
					{/each}
				</div>

				<div class="main-area">
					<!-- Search -->
					<div class="search-container">
						<Icon name="search" />
						<input
							type="text"
							bind:value={glossaryQuery}
							placeholder="Search legal terms, doctrines, acronyms..."
							class="search-input"
						/>
						{#if glossarySearching}
							<div class="spinner"></div>
						{/if}
					</div>

					<ScrollArea.Root class="scroll-root">
						<ScrollArea.Viewport class="scroll-viewport">
							{#if glossaryResults.length > 0}
								<h2 class="section-heading">Search Results ({glossaryResults.length})</h2>
								{#each glossaryResults as term}
									<div class="glossary-card">
										<div class="glossary-top">
											<h3>{term.term}</h3>
											<div class="tag-row">
												{#if term.category}<span class="tag category">{term.category}</span>{/if}
												{#if term.jurisdiction}<span class="tag jurisdiction">{term.jurisdiction}</span>{/if}
												{#if term.similarity != null}<span class="score small">{pct(term.similarity)}</span>{/if}
											</div>
										</div>
										<p class="definition">{term.definition}</p>
										{#if term.relatedTerms?.length > 0}
											<div class="related">
												<span class="related-label">Related:</span>
												{#each term.relatedTerms as rt}
													<button class="related-link" onclick={() => { glossaryQuery = typeof rt === 'string' ? rt : rt.term ?? ''; }}>
														{typeof rt === 'string' ? rt : rt.term ?? rt}
													</button>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							{:else if glossaryQuery.length >= 2 && !glossarySearching}
								<div class="empty">
									<Icon name="book-text" />
									<p>No terms found for "{glossaryQuery}"</p>
								</div>
							{:else}
								<!-- All terms -->
								{#if filteredGlossary.length === 0}
									<div class="empty">
										<Icon name="book-text" />
										<p>{activeLetter ? `No terms starting with "${activeLetter}"` : 'No glossary terms loaded.'}</p>
									</div>
								{:else}
									{#each filteredGlossary as term}
										<div class="glossary-card">
											<div class="glossary-top">
												<h3>{term.term}</h3>
												{#if term.category}<span class="tag category">{term.category}</span>{/if}
											</div>
											<p class="definition">{term.definition}</p>
											{#if term.relatedTerms}
												<div class="related">
													<span class="related-label">Related:</span>
													{#each (Array.isArray(term.relatedTerms) ? term.relatedTerms : []) as rt}
														<button class="related-link" onclick={() => { glossaryQuery = typeof rt === 'string' ? rt : ''; }}>
															{typeof rt === 'string' ? rt : JSON.stringify(rt)}
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								{/if}
							{/if}
						</ScrollArea.Viewport>
						<ScrollArea.Scrollbar orientation="vertical" class="scrollbar">
							<ScrollArea.Thumb class="scrollbar-thumb" />
						</ScrollArea.Scrollbar>
					</ScrollArea.Root>
				</div>
			</div>
		</Tabs.Content>

		<!-- PRECEDENTS TAB -->
		<Tabs.Content value="precedents" class="tab-content">
			<div class="main-area">
				<div class="search-container">
					<Icon name="search" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search case law, court decisions..."
						class="search-input"
					/>
				</div>

				<ScrollArea.Root class="scroll-root">
					<ScrollArea.Viewport class="scroll-viewport">
						{#if precedentResults.length > 0}
							{#each precedentResults as p}
								<div class="precedent-card">
									<h4>{p.title ?? p.caseName ?? 'Unknown Case'}</h4>
									<div class="tag-row">
										{#if p.court}<span class="tag">{p.court}</span>{/if}
										{#if p.similarity != null}<span class="score small">{pct(p.similarity)}</span>{/if}
									</div>
									{#if p.summary}<p class="excerpt">{p.summary.slice(0, 300)}</p>{/if}
								</div>
							{/each}
						{:else}
							<div class="empty">
								<Icon name="gavel" />
								<p>{data.stats?.precedents ?? 0} precedents in database. Use the search bar to find relevant case law.</p>
							</div>
						{/if}
					</ScrollArea.Viewport>
					<ScrollArea.Scrollbar orientation="vertical" class="scrollbar">
						<ScrollArea.Thumb class="scrollbar-thumb" />
					</ScrollArea.Scrollbar>
				</ScrollArea.Root>
			</div>
		</Tabs.Content>
	</Tabs.Root>

	<!-- Detail Dialog -->
	<Dialog.Root bind:open={detailOpen}>
		<Dialog.Portal>
			<Dialog.Overlay class="dialog-overlay" />
			<Dialog.Content class="dialog-content">
				<Dialog.Title class="dialog-title">
					{detailItem?.title || detailItem?.statuteTitle || 'Statute Detail'}
				</Dialog.Title>
				<Dialog.Description class="dialog-desc">
					{#if detailItem?.section || detailItem?.citationLabel}
						§ {detailItem?.section || detailItem?.citationLabel}
					{/if}
					{#if detailItem?.jurisdiction}
						&mdash; {detailItem.jurisdiction}
					{/if}
				</Dialog.Description>

				<ScrollArea.Root class="dialog-scroll">
					<ScrollArea.Viewport class="dialog-scroll-vp">
						{#if detailLoading}
							<div class="detail-loading">
								<div class="spinner"></div>
								<p>Generating AI summary...</p>
							</div>
						{:else if detailSummary}
							<div class="detail-body">
								<div class="detail-section">
									<h4>Summary</h4>
									<p>{detailSummary.summary}</p>
								</div>
								{#if detailSummary.keyProvisions?.length > 0}
									<div class="detail-section">
										<h4>Key Provisions</h4>
										{#each detailSummary.keyProvisions as kp}
											<div class="provision">
												<Icon name={kp.icon || 'shield'} />
												<div>
													<strong>{kp.title}</strong>
													<p>{kp.description}</p>
												</div>
											</div>
										{/each}
									</div>
								{/if}
								{#if detailSummary.implications?.length > 0}
									<div class="detail-section">
										<h4>Implications</h4>
										{#each detailSummary.implications as imp}
											<div class="implication" data-severity={imp.severity ?? 'medium'}>
												<strong>{imp.title}</strong>
												<p>{imp.description}</p>
											</div>
										{/each}
									</div>
								{/if}
								{#if detailSummary.citedSources?.length > 0}
									<div class="detail-section">
										<h4>Cited Sources</h4>
										<ul class="cited-list">
											{#each detailSummary.citedSources as src}
												<li>{src}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{:else}
							<div class="detail-body">
								<p class="no-summary">AI summary unavailable. Content preview:</p>
								<p class="excerpt">{(detailItem?.content ?? detailItem?.snippet ?? 'No content available').slice(0, 500)}</p>
							</div>
						{/if}
					</ScrollArea.Viewport>
					<ScrollArea.Scrollbar orientation="vertical" class="scrollbar">
						<ScrollArea.Thumb class="scrollbar-thumb" />
					</ScrollArea.Scrollbar>
				</ScrollArea.Root>

				<div class="dialog-footer">
					<a href="/legal-corpus/{detailItem?.id ?? detailItem?.statuteId ?? ''}" class="detail-link">
						<Icon name="external-link" /> View Full Detail
					</a>
					<Dialog.Close class="dialog-close-btn">Close</Dialog.Close>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</div>

<style>
	/* Page container */
	.corpus-page {
		min-height: 100vh;
		padding: 1.5rem 2rem;
		background: var(--t-bg, #0a0a1a);
		color: var(--t-text, #e0e0e0);
	}

	/* Header */
	.corpus-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.1));
	}
	.header-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.title-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--t-accent-muted, rgba(96,165,250,0.15));
		border-radius: 0.5rem;
		color: var(--t-accent, #60a5fa);
	}
	.corpus-header h1 {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0;
		color: var(--t-text, #e0e0e0);
	}
	.subtitle {
		font-size: 0.8rem;
		color: var(--t-text-muted, rgba(255,255,255,0.5));
		margin: 0.15rem 0 0;
	}
	.stat-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem 0.85rem;
		background: var(--t-surface, rgba(255,255,255,0.03));
		border: 1px solid var(--t-border, rgba(255,255,255,0.1));
		border-radius: 0.5rem;
		min-width: 70px;
	}
	.stat-num {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--t-accent, #60a5fa);
		font-variant-numeric: tabular-nums;
	}
	.stat-label {
		font-size: 0.65rem;
		color: var(--t-text-dim, rgba(255,255,255,0.4));
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Tabs */
	.corpus-page :global(.tab-list) {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.1));
		padding-bottom: 0;
	}
	.corpus-page :global(.tab-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
		color: var(--t-text-muted, rgba(255,255,255,0.6));
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}
	.corpus-page :global(.tab-trigger:hover) {
		color: var(--t-text, #e0e0e0);
		background: var(--t-surface, rgba(255,255,255,0.03));
	}
	.corpus-page :global(.tab-trigger[data-state="active"]) {
		color: var(--t-accent, #60a5fa);
		border-bottom-color: var(--t-accent, #60a5fa);
	}
	.corpus-page :global(.tab-content) {
		min-height: 400px;
	}

	/* Layout */
	.corpus-layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 1.25rem;
	}
	.glossary-layout {
		display: grid;
		grid-template-columns: 36px 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 768px) {
		.corpus-layout { grid-template-columns: 1fr; }
		.sidebar { display: none; }
		.glossary-layout { grid-template-columns: 1fr; }
		.alpha-rail { flex-direction: row; flex-wrap: wrap; }
	}

	/* Sidebar */
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.filter-group {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.08));
	}
	.filter-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--t-text-dim, rgba(255,255,255,0.4));
		margin: 0 0 0.4rem;
	}
	.filter-radio {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.8rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.filter-radio:hover { background: var(--t-surface-hover, rgba(255,255,255,0.05)); }
	.filter-radio.selected {
		background: var(--t-accent-muted, rgba(96,165,250,0.1));
		color: var(--t-accent, #60a5fa);
	}
	.filter-radio input { accent-color: var(--t-accent, #60a5fa); }
	.filter-select {
		width: 100%;
		padding: 0.4rem 0.5rem;
		background: var(--t-surface, rgba(255,255,255,0.05));
		border: 1px solid var(--t-border, rgba(255,255,255,0.12));
		border-radius: 0.375rem;
		color: var(--t-text, #e0e0e0);
		font-size: 0.8rem;
	}

	/* Alphabet rail */
	.alpha-rail {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.alpha-btn {
		width: 32px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--t-text-dim, rgba(255,255,255,0.4));
		background: none;
		border: none;
		border-radius: 0.2rem;
		cursor: pointer;
		padding: 0;
		transition: all 0.1s;
	}
	.alpha-btn:hover { color: var(--t-text, #e0e0e0); background: var(--t-surface, rgba(255,255,255,0.05)); }
	.alpha-btn.active { color: var(--t-accent, #60a5fa); background: var(--t-accent-muted, rgba(96,165,250,0.15)); }

	/* Search */
	.search-container {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 1.25rem;
	}
	.search-container > :global(svg:first-child) {
		position: absolute;
		left: 0.75rem;
		width: 16px;
		height: 16px;
		color: var(--t-text-dim, rgba(255,255,255,0.35));
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		padding: 0.65rem 0.75rem 0.65rem 2.25rem;
		background: var(--t-surface, rgba(255,255,255,0.04));
		border: 1px solid var(--t-border, rgba(255,255,255,0.12));
		border-radius: 0.5rem;
		color: var(--t-text, #e0e0e0);
		font-size: 0.85rem;
		font-family: inherit;
	}
	.search-input:focus {
		outline: none;
		border-color: var(--t-accent, #60a5fa);
		box-shadow: 0 0 0 2px var(--t-accent-muted, rgba(96,165,250,0.15));
	}
	.timing {
		position: absolute;
		right: 0.75rem;
		font-size: 0.7rem;
		color: var(--t-text-dim, rgba(255,255,255,0.35));
		font-variant-numeric: tabular-nums;
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--t-accent-muted, rgba(96,165,250,0.3));
		border-top-color: var(--t-accent, #60a5fa);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		position: absolute;
		right: 3rem;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Scroll area */
	.corpus-page :global(.scroll-root) { height: calc(100vh - 280px); }
	.corpus-page :global(.scroll-viewport) { width: 100%; height: 100%; }
	.corpus-page :global(.scrollbar) {
		display: flex;
		width: 6px;
		padding: 1px;
		touch-action: none;
		user-select: none;
	}
	.corpus-page :global(.scrollbar-thumb) {
		background: var(--t-border-hover, rgba(255,255,255,0.2));
		border-radius: 3px;
		flex: 1;
	}

	/* Section heading */
	.section-heading {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--t-text-muted, rgba(255,255,255,0.7));
		margin: 0 0 0.75rem;
	}

	/* Card grid */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.statute-card {
		display: block;
		text-align: left;
		width: 100%;
		padding: 0.85rem 1rem;
		background: var(--t-surface, rgba(255,255,255,0.03));
		border: 1px solid var(--t-border, rgba(255,255,255,0.08));
		border-radius: 0.5rem;
		color: inherit;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}
	.statute-card:hover {
		border-color: var(--t-accent, #60a5fa);
		background: var(--t-surface-hover, rgba(96,165,250,0.04));
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.card-top h3 {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0;
		color: var(--t-text, #e0e0e0);
	}
	.section-label {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		background: var(--t-accent-muted, rgba(96,165,250,0.12));
		color: var(--t-accent, #60a5fa);
		border-radius: 0.2rem;
		font-size: 0.7rem;
		font-family: monospace;
		margin-bottom: 0.35rem;
	}
	.excerpt {
		font-size: 0.78rem;
		color: var(--t-text-muted, rgba(255,255,255,0.55));
		line-height: 1.5;
		margin: 0.3rem 0 0.5rem;
	}
	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.7rem;
		color: var(--t-accent, #60a5fa);
		margin-top: 0.35rem;
	}

	/* Tags */
	.tag-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.tag {
		padding: 0.1rem 0.4rem;
		border-radius: 0.2rem;
		font-size: 0.65rem;
		font-weight: 500;
		background: var(--t-surface, rgba(255,255,255,0.06));
		color: var(--t-text-muted, rgba(255,255,255,0.6));
	}
	.tag.jurisdiction { background: rgba(34,197,94,0.12); color: #22c55e; }
	.tag.category { background: rgba(168,85,247,0.12); color: #a855f7; }
	.tag.date { color: var(--t-text-dim, rgba(255,255,255,0.45)); }

	/* Score badge */
	.score {
		padding: 0.15rem 0.4rem;
		border-radius: 0.2rem;
		font-size: 0.7rem;
		font-weight: 600;
		font-family: monospace;
		background: rgba(234,179,8,0.12);
		color: #eab308;
		white-space: nowrap;
	}
	.score.high { background: rgba(34,197,94,0.12); color: #22c55e; }
	.score.mid { background: rgba(234,179,8,0.12); color: #eab308; }
	.score.small { font-size: 0.6rem; padding: 0.08rem 0.3rem; }

	/* Precedent cards */
	.precedent-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
	.precedent-card {
		padding: 0.75rem 1rem;
		background: var(--t-surface, rgba(255,255,255,0.03));
		border: 1px solid var(--t-border, rgba(255,255,255,0.08));
		border-radius: 0.5rem;
	}
	.precedent-card h4 {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0 0 0.3rem;
		color: var(--t-text, #e0e0e0);
	}

	/* Glossary cards */
	.glossary-card {
		padding: 1rem 1.15rem;
		background: var(--t-surface, rgba(255,255,255,0.03));
		border: 1px solid var(--t-border, rgba(255,255,255,0.08));
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.glossary-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.glossary-top h3 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
		color: var(--t-accent, #60a5fa);
	}
	.definition {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--t-text-muted, rgba(255,255,255,0.7));
		margin: 0;
	}
	.related {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
	}
	.related-label {
		font-size: 0.7rem;
		color: var(--t-text-dim, rgba(255,255,255,0.4));
		font-weight: 600;
	}
	.related-link {
		padding: 0.1rem 0.4rem;
		background: var(--t-accent-muted, rgba(96,165,250,0.1));
		border: 1px solid rgba(96,165,250,0.2);
		border-radius: 0.2rem;
		color: var(--t-accent, #60a5fa);
		font-size: 0.7rem;
		cursor: pointer;
		font-family: inherit;
	}
	.related-link:hover { background: rgba(96,165,250,0.2); }

	/* Empty state */
	.empty {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--t-text-dim, rgba(255,255,255,0.35));
	}
	.empty :global(svg) { width: 36px; height: 36px; margin: 0 auto 0.75rem; opacity: 0.5; }
	.empty p { margin: 0; font-size: 0.85rem; }

	/* Dialog */
	.corpus-page :global(.dialog-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		backdrop-filter: blur(4px);
		z-index: 50;
	}
	.corpus-page :global(.dialog-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(680px, 92vw);
		max-height: 85vh;
		background: var(--t-bg-alt, #111122);
		border: 1px solid var(--t-border, rgba(255,255,255,0.12));
		border-radius: 0.75rem;
		padding: 1.5rem;
		z-index: 51;
		display: flex;
		flex-direction: column;
	}
	.corpus-page :global(.dialog-title) {
		font-size: 1.15rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
		color: var(--t-text, #e0e0e0);
	}
	.corpus-page :global(.dialog-desc) {
		font-size: 0.8rem;
		color: var(--t-text-muted, rgba(255,255,255,0.5));
		margin: 0 0 1rem;
	}
	.corpus-page :global(.dialog-scroll) { flex: 1; min-height: 0; }
	.corpus-page :global(.dialog-scroll-vp) { max-height: 55vh; }
	.detail-loading {
		text-align: center;
		padding: 2rem;
		color: var(--t-text-dim, rgba(255,255,255,0.4));
	}
	.detail-loading .spinner { position: static; margin: 0 auto 0.75rem; }
	.detail-body { display: flex; flex-direction: column; gap: 1rem; }
	.detail-section h4 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--t-accent, #60a5fa);
		margin: 0 0 0.5rem;
	}
	.detail-section p { font-size: 0.85rem; line-height: 1.6; color: var(--t-text-muted, rgba(255,255,255,0.7)); margin: 0; }
	.provision {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.06));
	}
	.provision :global(svg) { flex-shrink: 0; width: 18px; height: 18px; color: var(--t-accent, #60a5fa); margin-top: 2px; }
	.provision strong { font-size: 0.82rem; color: var(--t-text, #e0e0e0); }
	.provision p { font-size: 0.78rem; color: var(--t-text-muted, rgba(255,255,255,0.6)); margin: 0.15rem 0 0; }
	.implication {
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		border-left: 3px solid var(--t-warning, #eab308);
	}
	.implication[data-severity="high"] { border-left-color: var(--t-danger, #ef4444); }
	.implication[data-severity="low"] { border-left-color: var(--t-success, #22c55e); }
	.implication strong { font-size: 0.82rem; color: var(--t-text, #e0e0e0); }
	.implication p { font-size: 0.78rem; color: var(--t-text-muted, rgba(255,255,255,0.6)); margin: 0.2rem 0 0; }
	.cited-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.cited-list li {
		padding: 0.3rem 0;
		font-size: 0.82rem;
		color: var(--t-text-muted, rgba(255,255,255,0.65));
		border-bottom: 1px solid var(--t-border, rgba(255,255,255,0.05));
	}
	.cited-list li::before { content: '§ '; color: var(--t-accent, #60a5fa); }
	.no-summary { font-size: 0.8rem; color: var(--t-text-dim, rgba(255,255,255,0.4)); font-style: italic; margin: 0 0 0.5rem; }
	.dialog-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--t-border, rgba(255,255,255,0.1));
	}
	.detail-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--t-accent, #60a5fa);
		text-decoration: none;
	}
	.detail-link:hover { text-decoration: underline; }
	.corpus-page :global(.dialog-close-btn) {
		padding: 0.4rem 1rem;
		background: var(--t-surface, rgba(255,255,255,0.06));
		border: 1px solid var(--t-border, rgba(255,255,255,0.15));
		border-radius: 0.375rem;
		color: var(--t-text, #e0e0e0);
		font-size: 0.8rem;
		cursor: pointer;
		font-family: inherit;
	}
	.corpus-page :global(.dialog-close-btn:hover) {
		background: var(--t-surface-hover, rgba(255,255,255,0.1));
	}
</style>
