<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	interface ClassicViewData {
		statute: any;
		chunks: any[];
		precedents: any[];
		caseLinks: any[];
		glossaryTerms: any[];
		relatedStatutes: any[];
		loadError: string | null;
	}

	let { data }: { data: ClassicViewData } = $props();
	let statute = $derived(data.statute);

	// Tab system
	type TabId = 'summary' | 'official-text' | 'cases' | 'regulations' | 'glossary' | 'history' | 'citations';
	let activeTab = $state<TabId>('summary');

	// AI analysis state
	let aiSummary = $state<string | null>(null);
	let aiKeyProvisions = $state<{ title: string; description: string; icon?: string }[]>([]);
	let aiImplications = $state<{ title: string; description: string; severity?: string }[]>([]);
	let aiCitedSources = $state<string[]>([]);
	let summaryLoading = $state(false);
	let summaryError = $state<string | null>(null);

	// Source drawer
	let expandedSource = $state<number | null>(null);

	// Glossary search
	let glossarySearch = $state('');
	let glossaryLoading = $state(false);
	let searchedGlossary = $state<{ term: string; definition: string; category?: string; relatedTerms?: string[] | null }[]>([]);

	// Left sidebar
	let activeSection = $state('executive-summary');
	let corpusFilter = $state<'all' | 'federal' | 'state' | 'regulations' | 'case-law' | 'glossary'>('all');

	const tabs: { id: TabId; label: string; icon: string }[] = [
		{ id: 'summary', label: 'Summary', icon: 'file-text' },
		{ id: 'official-text', label: 'Official Text', icon: 'scroll-text' },
		{ id: 'cases', label: 'Cases', icon: 'folder' },
		{ id: 'regulations', label: 'Regulations', icon: 'landmark' },
		{ id: 'glossary', label: 'Glossary', icon: 'book-text' },
		{ id: 'history', label: 'History', icon: 'clock' },
		{ id: 'citations', label: 'Citations', icon: 'bookmark' },
	];

	// Corpus sidebar sections — derived from content
	let sidebarSections = $derived.by(() => {
		const sections = [
			{ id: 'executive-summary', label: 'Executive Summary', icon: 'sparkles' },
			{ id: 'key-provisions', label: 'Key Provisions', icon: 'list' },
			{ id: 'implications', label: 'Implications', icon: 'triangle-alert' },
		];
		if (data.chunks.length > 0) {
			sections.push({ id: 'full-text', label: 'Full Text', icon: 'file-text' });
		}
		if (data.caseLinks.length > 0) {
			sections.push({ id: 'linked-cases', label: 'Linked Cases', icon: 'link' });
		}
		sections.push({ id: 'glossary-terms', label: 'Glossary', icon: 'book-text' });
		return sections;
	});

	// Corpus type filters for left sidebar
	const corpusTypes = [
		{ id: 'all' as const, label: 'All', icon: 'layers' },
		{ id: 'federal' as const, label: 'Federal', icon: 'landmark' },
		{ id: 'state' as const, label: 'State', icon: 'map' },
		{ id: 'regulations' as const, label: 'Regulations', icon: 'shield' },
		{ id: 'case-law' as const, label: 'Case Law', icon: 'scale' },
		{ id: 'glossary' as const, label: 'Definitions', icon: 'book-text' },
	];

	// Filtered glossary terms from server data
	let filteredGlossary = $derived.by(() => {
		const terms = data.glossaryTerms ?? [];
		if (!glossarySearch.trim()) return terms;
		const q = glossarySearch.toLowerCase();
		return terms.filter(t =>
			t.term.toLowerCase().includes(q) ||
			t.definition.toLowerCase().includes(q)
		);
	});

	function getProvisionIcon(icon?: string): string {
		const map: Record<string, string> = {
			shield: 'shield', access: 'lock', fraud: 'triangle-alert',
			theft: 'credit-card', code: 'code', data: 'database',
			privacy: 'eye-off', compliance: 'circle-check', penalty: 'gavel',
		};
		if (!icon) return 'file-text';
		return map[icon.toLowerCase()] ?? icon;
	}

	function getSeverityColor(severity?: string): string {
		switch (severity) {
			case 'high': return 'severity-high';
			case 'low': return 'severity-low';
			default: return 'severity-medium';
		}
	}

	function formatDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function formatShortDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function scrollToSection(id: string) {
		activeSection = id;
		if (browser) {
			const el = document.getElementById(id);
			el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function toggleSourceDrawer(index: number) {
		expandedSource = expandedSource === index ? null : index;
	}

	async function generateSummary() {
		if (!statute?.id) return;
		summaryLoading = true;
		summaryError = null;
		try {
			const res = await fetch(`/api/statutes/${statute.id}/summary`, { method: 'POST' });
			if (!res.ok) throw new Error('Summary generation failed');
			const json = await res.json();
			aiSummary = json.summary ?? null;
			aiKeyProvisions = json.keyProvisions ?? [];
			aiImplications = json.implications ?? [];
			aiCitedSources = json.citedSources ?? [];
		} catch (err) {
			summaryError = err instanceof Error ? err.message : 'Failed to generate summary';
		} finally {
			summaryLoading = false;
		}
	}

	async function searchGlossary() {
		if (!glossarySearch.trim()) return;
		glossaryLoading = true;
		try {
			const res = await fetch('/api/glossary/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: glossarySearch, limit: 20 }),
			});
			if (res.ok) {
				const json = await res.json();
				searchedGlossary = json.results ?? [];
			}
		} catch { /* ignore */ }
		glossaryLoading = false;
	}

	// Breadcrumb parts
	let breadcrumbs = $derived.by(() => {
		const parts: string[] = [];
		if (statute?.jurisdiction) parts.push(statute.jurisdiction);
		if (statute?.category) parts.push(statute.category);
		const label = statute?.section ? `§ ${statute.section}` : statute?.title ?? 'Detail';
		parts.push(label);
		return parts;
	});

	// Citation format
	let citationText = $derived.by(() => {
		if (!statute) return '';
		const parts: string[] = [];
		if (statute.title) parts.push(statute.title);
		if (statute.section) parts.push(`§ ${statute.section}`);
		if (statute.jurisdiction) parts.push(`(${statute.jurisdiction})`);
		return parts.join(' ');
	});

	// Status derivation
	let statuteStatus = $derived.by(() => {
		if (!statute?.effectiveDate) return 'Unknown';
		const effective = new Date(statute.effectiveDate);
		return effective <= new Date() ? 'Current' : 'Pending';
	});
</script>

{#if !statute}
	<div class="detail-page">
		<div class="error-banner">
			<Icon name="circle-alert" size={32} />
			<p>{data.loadError ?? 'Statute not found'}</p>
			<a href="/legal-corpus" class="back-link">
				<Icon name="arrow-left" size={14} /> Back to Legal Corpus
			</a>
		</div>
	</div>
{:else}
	<div class="detail-page">
		<!-- Top Bar: Breadcrumbs + Actions -->
		<div class="top-bar">
			<nav class="breadcrumb">
				<a href="/legal-corpus"><Icon name="book-open" size={14} /> Legal Corpus</a>
				{#each breadcrumbs as crumb, i}
					<span class="sep">/</span>
					{#if i < breadcrumbs.length - 1}
						<span class="crumb-text">{crumb}</span>
					{:else}
						<span class="crumb-active">{crumb}</span>
					{/if}
				{/each}
			</nav>
			<div class="top-actions">
				<button class="action-btn primary" onclick={generateSummary} disabled={summaryLoading}>
					<Icon name="sparkles" size={14} />
					{summaryLoading ? 'Analyzing...' : 'AI Analysis'}
				</button>
				{#if statute.sourceUrl}
					<a href={statute.sourceUrl} target="_blank" rel="noopener noreferrer" class="action-btn">
						<Icon name="external-link" size={14} /> Official Source
					</a>
				{/if}
			</div>
		</div>

		<!-- Statute Title -->
		<header class="statute-header">
			<h1>
				{statute.title || 'Untitled Statute'}
				{#if statute.section}
					<span class="section-badge">§ {statute.section}</span>
				{/if}
			</h1>
		</header>

		<!-- Metadata Bar -->
		<div class="metadata-bar">
			<div class="meta-item">
				<span class="meta-label">Jurisdiction</span>
				<span class="meta-value jurisdiction">{statute.jurisdiction ?? 'Unknown'}</span>
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="meta-label">Corpus</span>
				<span class="meta-value">{statute.category ?? 'Statute'}</span>
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="meta-label">Citation</span>
				<span class="meta-value mono">{citationText || 'N/A'}</span>
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="meta-label">Status</span>
				<span class="meta-value status" class:current={statuteStatus === 'Current'} class:pending={statuteStatus === 'Pending'}>
					{statuteStatus}
				</span>
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="meta-label">Effective</span>
				<span class="meta-value">{formatShortDate(statute.effectiveDate)}</span>
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="meta-label">Updated</span>
				<span class="meta-value">{formatShortDate(statute.updatedAt)}</span>
			</div>
			{#if statute.sourceUrl}
				<div class="meta-divider"></div>
				<div class="meta-item">
					<span class="meta-label">Source</span>
					<a href={statute.sourceUrl} target="_blank" rel="noopener noreferrer" class="meta-link">
						<Icon name="external-link" size={11} /> Official
					</a>
				</div>
			{/if}
			<div class="meta-trust">
				<Icon name="shield-check" size={12} />
				AI-generated — verify with official sources
			</div>
		</div>

		<!-- Research Actions Toolbar -->
		<div class="research-toolbar">
			<button class="research-btn" onclick={() => activeTab = 'official-text'}>
				<Icon name="scroll-text" size={13} /> View Official Text
			</button>
			<button class="research-btn" onclick={() => activeTab = 'cases'}>
				<Icon name="scale" size={13} /> Show Cited Cases
			</button>
			<button class="research-btn" onclick={() => activeTab = 'regulations'}>
				<Icon name="landmark" size={13} /> Related Regulations
			</button>
			<button class="research-btn" onclick={() => activeTab = 'glossary'}>
				<Icon name="book-text" size={13} /> Glossary Terms
			</button>
			<button class="research-btn" onclick={() => activeTab = 'history'}>
				<Icon name="git-compare" size={13} /> Version History
			</button>
		</div>

		<!-- Tab Navigation -->
		<div class="tab-bar">
			{#each tabs as tab}
				<button
					class="tab-item"
					class:active={activeTab === tab.id}
					onclick={() => activeTab = tab.id}
				>
					<Icon name={tab.icon} size={14} />
					{tab.label}
					{#if tab.id === 'cases' && data.caseLinks.length > 0}
						<span class="tab-count">{data.caseLinks.length}</span>
					{/if}
					{#if tab.id === 'glossary' && (data.glossaryTerms?.length ?? 0) > 0}
						<span class="tab-count">{data.glossaryTerms.length}</span>
					{/if}
					{#if tab.id === 'citations' && aiCitedSources.length > 0}
						<span class="tab-count">{aiCitedSources.length}</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- 3-Column Layout -->
		<div class="main-layout">
			<!-- Left Sidebar: Corpus Nav -->
			<aside class="corpus-sidebar">
				<!-- Jurisdiction Filters -->
				<div class="sidebar-title">Jurisdiction</div>
				<div class="filter-chips">
					{#each corpusTypes as ct}
						<button
							class="filter-chip"
							class:active={corpusFilter === ct.id}
							onclick={() => corpusFilter = ct.id}
						>
							<Icon name={ct.icon} size={11} />
							{ct.label}
						</button>
					{/each}
				</div>

				<!-- Section Navigation -->
				<div class="sidebar-title" style="margin-top: 0.75rem">Sections</div>
				{#each sidebarSections as section}
					<button
						class="sidebar-item"
						class:active={activeSection === section.id}
						onclick={() => { activeTab = 'summary'; scrollToSection(section.id); }}
					>
						<Icon name={section.icon} size={13} />
						<span>{section.label}</span>
					</button>
				{/each}

				<!-- Related Statutes -->
				{#if (data.relatedStatutes?.length ?? 0) > 0}
					<div class="sidebar-title" style="margin-top: 0.75rem">Related</div>
					{#each data.relatedStatutes as related}
						<a href="/legal-corpus/{related.id}" class="sidebar-related">
							<span class="related-section">{related.section ? `§ ${related.section}` : ''}</span>
							<span class="related-title">{related.title?.slice(0, 40)}</span>
						</a>
					{/each}
				{/if}
			</aside>

			<!-- Center Content -->
			<main class="center-content">
				{#if activeTab === 'summary'}
					<!-- Executive Summary -->
					<section id="executive-summary" class="content-card">
						<h2><Icon name="sparkles" size={16} /> Executive Summary</h2>
						{#if aiSummary}
							<div class="summary-text">{aiSummary}</div>
							<!-- Source drawer toggle -->
							<button class="source-drawer-toggle" onclick={() => toggleSourceDrawer(0)}>
								<Icon name={expandedSource === 0 ? 'chevron-up' : 'chevron-down'} size={12} />
								{expandedSource === 0 ? 'Hide' : 'Show'} Source Details
							</button>
							{#if expandedSource === 0}
								<div class="source-drawer">
									<div class="source-row">
										<span class="source-label">Source</span>
										<span class="source-val">{statute.title}</span>
									</div>
									<div class="source-row">
										<span class="source-label">Jurisdiction</span>
										<span class="source-val">{statute.jurisdiction ?? 'N/A'}</span>
									</div>
									<div class="source-row">
										<span class="source-label">Section</span>
										<span class="source-val mono">{statute.section ? `§ ${statute.section}` : 'N/A'}</span>
									</div>
									<div class="source-row">
										<span class="source-label">Citation</span>
										<span class="source-val mono">{citationText}</span>
									</div>
									{#if statute.sourceUrl}
										<div class="source-row">
											<span class="source-label">Official</span>
											<a href={statute.sourceUrl} target="_blank" rel="noopener noreferrer" class="source-link">
												<Icon name="external-link" size={11} /> View Official Source
											</a>
										</div>
									{/if}
									<div class="source-row">
										<span class="source-label">Model</span>
										<span class="source-val mono">gemma4-legal:latest</span>
									</div>
									<p class="source-disclaimer">This summary was AI-generated and may contain inaccuracies. Always verify against official sources before relying on this content for legal purposes.</p>
								</div>
							{/if}
						{:else if summaryError}
							<p class="error-text"><Icon name="circle-alert" size={14} /> {summaryError}</p>
						{:else if summaryLoading}
							<div class="loading-placeholder">
								<div class="skeleton-line"></div>
								<div class="skeleton-line short"></div>
								<div class="skeleton-line"></div>
								<div class="skeleton-line short"></div>
							</div>
						{:else}
							<div class="placeholder-card">
								<Icon name="sparkles" size={24} />
								<p>Click <strong>AI Analysis</strong> to generate an executive summary, key provisions, and legal implications using gemma4-legal.</p>
							</div>
						{/if}
					</section>

					<!-- Key Provisions -->
					<section id="key-provisions" class="content-card">
						<h2><Icon name="list" size={16} /> Key Provisions</h2>
						{#if aiKeyProvisions.length > 0}
							<div class="provisions-grid">
								{#each aiKeyProvisions as prov, i}
									<div class="provision-card">
										<div class="provision-icon">
											<Icon name={getProvisionIcon(prov.icon)} size={18} />
										</div>
										<h4>{prov.title}</h4>
										<p>{prov.description}</p>
										<button class="source-drawer-toggle small" onclick={() => toggleSourceDrawer(100 + i)}>
											<Icon name="info" size={10} /> source
										</button>
										{#if expandedSource === 100 + i}
											<div class="source-drawer compact">
												<span class="source-val mono">{citationText}</span>
												{#if statute.sourceUrl}
													<a href={statute.sourceUrl} target="_blank" rel="noopener noreferrer" class="source-link">
														<Icon name="external-link" size={10} /> Official
													</a>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else if data.chunks.length > 0}
							<div class="provisions-grid">
								{#each data.chunks.slice(0, 4) as chunk}
									<div class="provision-card">
										<div class="provision-icon">
											<Icon name="file-text" size={18} />
										</div>
										<h4>Section {chunk.chunkIndex + 1}</h4>
										<p>{chunk.content?.slice(0, 150)}...</p>
									</div>
								{/each}
							</div>
							{#if data.chunks.length > 4}
								<p class="see-more">+ {data.chunks.length - 4} more sections.
									<button class="inline-link" onclick={() => activeTab = 'official-text'}>View all in Official Text</button>
								</p>
							{/if}
						{:else}
							<p class="placeholder-text">Run AI Analysis to extract key provisions, or upload statute text to enable section indexing.</p>
						{/if}
					</section>

					<!-- Implications -->
					<section id="implications" class="content-card">
						<h2><Icon name="triangle-alert" size={16} /> Implications</h2>
						{#if aiImplications.length > 0}
							<div class="implications-grid">
								{#each aiImplications as imp, i}
									<div class="implication-card {getSeverityColor(imp.severity)}">
										<h4>{imp.title}</h4>
										<p>{imp.description}</p>
										{#if imp.severity}
											<span class="severity-tag">{imp.severity}</span>
										{/if}
										<button class="source-drawer-toggle small" onclick={() => toggleSourceDrawer(200 + i)}>
											<Icon name="info" size={10} /> source
										</button>
										{#if expandedSource === 200 + i}
											<div class="source-drawer compact">
												<span class="source-val mono">{citationText}</span>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="placeholder-text">Run AI Analysis to identify compliance risks, data protection requirements, and legal uncertainties.</p>
						{/if}
					</section>

				{:else if activeTab === 'official-text'}
					<section id="full-text" class="content-card">
						<h2><Icon name="scroll-text" size={16} /> Official Text</h2>
						{#if statute.content}
							<div class="full-text">{statute.content}</div>
						{:else if data.chunks.length > 0}
							{#each data.chunks as chunk}
								<div class="chunk-block">
									<span class="chunk-index">§ {chunk.chunkIndex + 1}</span>
									<p>{chunk.content}</p>
								</div>
							{/each}
						{:else}
							<p class="placeholder-text">No official text available. Upload the statute document to populate this section.</p>
						{/if}
					</section>

				{:else if activeTab === 'cases'}
					<section class="content-card">
						<h2><Icon name="folder" size={16} /> Linked Cases ({data.caseLinks.length})</h2>
						{#if data.caseLinks.length > 0}
							{#each data.caseLinks as link}
								<div class="case-link-row">
									<div class="case-link-header">
										<a href="/cases/{link.caseId}" class="case-link-id">
											<Icon name="folder-open" size={14} />
											{link.caseTitle ?? link.caseId}
										</a>
										<span class="link-type-badge">{link.linkType?.replace(/_/g, ' ')}</span>
										{#if link.caseStatus}
											<span class="case-status-badge">{link.caseStatus}</span>
										{/if}
									</div>
									{#if link.notes}<p class="link-notes">{link.notes}</p>{/if}
									<span class="link-date">{formatShortDate(link.createdAt)}</span>
								</div>
							{/each}
						{:else}
							<p class="placeholder-text">No cases linked to this statute yet.</p>
						{/if}
					</section>

					<!-- Precedents inline -->
					{#if data.precedents.length > 0}
						<section class="content-card">
							<h2><Icon name="scale" size={16} /> Legal Precedents</h2>
							{#each data.precedents as p}
								<div class="precedent-row">
									<h4>{p.title}</h4>
									<div class="precedent-meta">
										{#if p.court}<span class="precedent-court">{p.court}</span>{/if}
										{#if p.decisionDate}<span>{formatShortDate(p.decisionDate)}</span>{/if}
										{#if p.citation}<span class="precedent-cite">{p.citation}</span>{/if}
									</div>
									{#if p.summary}<p class="precedent-summary">{p.summary}</p>{/if}
								</div>
							{/each}
						</section>
					{/if}

				{:else if activeTab === 'regulations'}
					<section class="content-card">
						<h2><Icon name="landmark" size={16} /> Related Regulations</h2>
						<p class="placeholder-text">Related regulations for this statute will appear here once CFR and regulatory cross-references are indexed.</p>
						<div class="regulation-placeholder">
							<div class="regulation-tip">
								<Icon name="info" size={14} />
								<div>
									<strong>Coming soon:</strong> Automated cross-referencing with the Code of Federal Regulations (CFR) and state regulatory databases.
								</div>
							</div>
							{#if statute.jurisdiction === 'Federal' || statute.jurisdiction === 'federal'}
								<div class="regulation-tip">
									<Icon name="landmark" size={14} />
									<div>Federal statutes like this one often have implementing regulations in Title 18 CFR.</div>
								</div>
							{/if}
						</div>
					</section>

				{:else if activeTab === 'glossary'}
					<section class="content-card">
						<h2><Icon name="book-text" size={16} /> Legal Glossary</h2>
						<!-- Glossary search -->
						<div class="glossary-search-bar">
							<Icon name="search" size={14} />
							<input
								type="text"
								placeholder="Search terms, acronyms, or doctrines..."
								bind:value={glossarySearch}
								onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') searchGlossary(); }}
							/>
							<button class="search-go" onclick={searchGlossary} disabled={glossaryLoading}>
								{glossaryLoading ? '...' : 'Search'}
							</button>
						</div>

						<!-- Server-loaded glossary terms for this jurisdiction -->
						{#if searchedGlossary.length > 0}
							<div class="glossary-results">
								<h3>Search Results</h3>
								{#each searchedGlossary as term}
									<div class="glossary-card">
										<div class="glossary-term-header">
											<strong>{term.term}</strong>
											{#if term.category}
												<span class="glossary-cat">{term.category}</span>
											{/if}
										</div>
										<p>{term.definition}</p>
										{#if term.relatedTerms && Array.isArray(term.relatedTerms) && term.relatedTerms.length > 0}
											<div class="related-terms">
												<Icon name="link" size={11} />
												{#each term.relatedTerms as rt}
													<span class="related-pill">{rt}</span>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if filteredGlossary.length > 0}
							<div class="glossary-results">
								<h3>{statute.jurisdiction ?? 'All'} Terms ({filteredGlossary.length})</h3>
								{#each filteredGlossary as term}
									<div class="glossary-card">
										<div class="glossary-term-header">
											<strong>{term.term}</strong>
											{#if term.category}
												<span class="glossary-cat">{term.category}</span>
											{/if}
										</div>
										<p>{term.definition}</p>
										{#if term.relatedTerms && Array.isArray(term.relatedTerms) && term.relatedTerms.length > 0}
											<div class="related-terms">
												<Icon name="link" size={11} />
												{#each term.relatedTerms as rt}
													<span class="related-pill">{rt}</span>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="placeholder-text" style="margin-top: 1rem">No glossary terms found for this jurisdiction. Try searching above.</p>
						{/if}
					</section>

				{:else if activeTab === 'history'}
					<section class="content-card">
						<h2><Icon name="clock" size={16} /> Version History</h2>
						<div class="timeline">
							{#if statute.effectiveDate}
								<div class="timeline-item">
									<div class="timeline-dot effective"></div>
									<div class="timeline-content">
										<span class="timeline-date">{formatDate(statute.effectiveDate)}</span>
										<p>Effective date — statute entered into force</p>
										<span class="timeline-badge current">Current version</span>
									</div>
								</div>
							{/if}
							<div class="timeline-item">
								<div class="timeline-dot"></div>
								<div class="timeline-content">
									<span class="timeline-date">{formatDate(statute.createdAt)}</span>
									<p>Added to legal corpus</p>
								</div>
							</div>
							<div class="timeline-item">
								<div class="timeline-dot"></div>
								<div class="timeline-content">
									<span class="timeline-date">{formatDate(statute.updatedAt)}</span>
									<p>Last updated in system</p>
								</div>
							</div>
						</div>
						<div class="history-notice">
							<Icon name="info" size={14} />
							<p>Full amendment history and version comparison will be available once legislative change tracking is connected to official sources (GovInfo/GPO for federal, Open States for state).</p>
						</div>
					</section>

				{:else if activeTab === 'citations'}
					<section class="content-card">
						<h2><Icon name="bookmark" size={16} /> Citations & References</h2>

						<!-- This statute's citation -->
						<div class="citation-box">
							<div class="citation-label">Cite this statute</div>
							<div class="citation-formatted">{citationText}</div>
						</div>

						{#if aiCitedSources.length > 0}
							<h3 class="subsection-title">Referenced Sources ({aiCitedSources.length})</h3>
							<ul class="citation-list">
								{#each aiCitedSources as source, i}
									<li class="citation-item">
										<span class="citation-num">{i + 1}</span>
										<div class="citation-body">
											<span>{source}</span>
											<button class="source-drawer-toggle small" onclick={() => toggleSourceDrawer(300 + i)}>
												<Icon name="info" size={10} /> details
											</button>
											{#if expandedSource === 300 + i}
												<div class="source-drawer compact">
													<span class="source-val">Extracted from AI analysis of {statute.title}</span>
												</div>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="placeholder-text">Run AI Analysis to extract citations and referenced sources from the statute text.</p>
						{/if}
					</section>
				{/if}
			</main>

			<!-- Right Sidebar -->
			<aside class="right-sidebar">
				<!-- Cited Sources -->
				<div class="sidebar-card">
					<h3><Icon name="quote" size={14} /> Cited Sources</h3>
					{#if aiCitedSources.length > 0}
						{#each aiCitedSources as source}
							<div class="cited-source">
								<span class="source-text">{source}</span>
							</div>
						{/each}
					{:else}
						<p class="sidebar-placeholder">AI-extracted sources appear after analysis.</p>
					{/if}
				</div>

				<!-- Legal Precedents -->
				<div class="sidebar-card">
					<h3><Icon name="scale" size={14} /> Legal Precedents</h3>
					{#if data.precedents.length > 0}
						{#each data.precedents.slice(0, 5) as p}
							<div class="precedent-item">
								<h4>{p.title}</h4>
								<div class="precedent-meta-mini">
									{#if p.court}<span>{p.court}</span>{/if}
									{#if p.decisionDate}<span>{formatShortDate(p.decisionDate)}</span>{/if}
								</div>
								{#if p.citation}<span class="precedent-citation">{p.citation}</span>{/if}
							</div>
						{/each}
						{#if data.precedents.length > 5}
							<button class="sidebar-action" onclick={() => activeTab = 'cases'}>
								View all {data.precedents.length} precedents
							</button>
						{/if}
					{:else}
						<p class="sidebar-placeholder">No precedents linked yet.</p>
					{/if}
				</div>

				<!-- Glossary Terms -->
				<div class="sidebar-card">
					<h3><Icon name="book-text" size={14} /> Glossary</h3>
					{#if (data.glossaryTerms?.length ?? 0) > 0}
						{#each data.glossaryTerms.slice(0, 5) as term}
							<div class="glossary-mini">
								<strong>{term.term}</strong>
								<p>{term.definition?.slice(0, 80)}</p>
							</div>
						{/each}
						{#if data.glossaryTerms.length > 5}
							<button class="sidebar-action" onclick={() => activeTab = 'glossary'}>
								View all {data.glossaryTerms.length} terms
							</button>
						{/if}
					{:else}
						<button class="sidebar-action" onclick={() => activeTab = 'glossary'}>
							<Icon name="search" size={13} /> Search Glossary
						</button>
					{/if}
				</div>

				<!-- Related Statutes -->
				{#if (data.relatedStatutes?.length ?? 0) > 0}
					<div class="sidebar-card">
						<h3><Icon name="git-branch" size={14} /> Related Statutes</h3>
						{#each data.relatedStatutes.slice(0, 5) as rs}
							<a href="/legal-corpus/{rs.id}" class="related-statute-link">
								<span>{rs.section ? `§ ${rs.section}` : ''}</span>
								<span class="related-title-text">{rs.title?.slice(0, 50)}</span>
							</a>
						{/each}
					</div>
				{/if}
			</aside>
		</div>
	</div>
{/if}

<style>
	.detail-page {
		min-height: 100vh;
		padding: 1rem 1.5rem 3rem;
		max-width: 1400px;
		margin: 0 auto;
		overflow-y: auto;
	}

	/* Error */
	.error-banner {
		text-align: center;
		padding: 4rem 2rem;
		color: rgba(255, 255, 255, 0.5);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: #60a5fa;
		text-decoration: none;
		font-size: 0.85rem;
	}
	.back-link:hover { text-decoration: underline; }

	/* Top Bar */
	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.4);
	}
	.breadcrumb a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: #60a5fa;
		text-decoration: none;
	}
	.breadcrumb a:hover { text-decoration: underline; }
	.sep { color: rgba(255, 255, 255, 0.2); }
	.crumb-text { color: rgba(255, 255, 255, 0.5); }
	.crumb-active { color: rgba(255, 255, 255, 0.8); font-weight: 500; }
	.top-actions { display: flex; gap: 0.5rem; }

	/* Header */
	.statute-header { margin-bottom: 0.5rem; }
	.statute-header h1 {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
	}
	.section-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		vertical-align: middle;
		margin-left: 0.4rem;
	}

	/* Metadata Bar */
	.metadata-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.85rem;
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.375rem;
		margin-bottom: 0.6rem;
	}
	.meta-item { display: flex; flex-direction: column; gap: 0.1rem; }
	.meta-label {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(255, 255, 255, 0.3);
		font-weight: 600;
	}
	.meta-value {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.8);
		font-weight: 500;
	}
	.meta-value.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; }
	.meta-value.jurisdiction { color: #22c55e; }
	.meta-value.status.current { color: #22c55e; }
	.meta-value.status.pending { color: #eab308; }
	.meta-divider {
		width: 1px;
		height: 24px;
		background: rgba(255, 255, 255, 0.08);
	}
	.meta-link {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.72rem;
		color: #60a5fa;
		text-decoration: none;
	}
	.meta-link:hover { text-decoration: underline; }
	.meta-trust {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
		color: #eab308;
		background: rgba(234, 179, 8, 0.06);
		border: 1px solid rgba(234, 179, 8, 0.12);
		padding: 0.2rem 0.5rem;
		border-radius: 0.25rem;
	}

	/* Research Toolbar */
	.research-toolbar {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.research-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.25rem;
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.research-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.85);
		border-color: rgba(255, 255, 255, 0.15);
	}

	/* Tab Bar */
	.tab-bar {
		display: flex;
		gap: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 1rem;
		overflow-x: auto;
	}
	.tab-item {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.55rem 0.85rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}
	.tab-item:hover { color: rgba(255, 255, 255, 0.8); }
	.tab-item.active {
		color: #60a5fa;
		border-bottom-color: #60a5fa;
	}
	.tab-count {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		border-radius: 0.2rem;
		font-weight: 600;
	}

	/* 3-Column Layout */
	.main-layout {
		display: grid;
		grid-template-columns: 180px 1fr 280px;
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 1100px) {
		.main-layout { grid-template-columns: 1fr 260px; }
		.corpus-sidebar { display: none; }
	}
	@media (max-width: 768px) {
		.main-layout { grid-template-columns: 1fr; }
		.right-sidebar { display: none; }
	}

	/* Left Sidebar */
	.corpus-sidebar {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
	}
	.sidebar-title {
		font-size: 0.65rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.4rem 0.6rem;
	}
	.filter-chips {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0 0.3rem;
	}
	.filter-chip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		background: none;
		border: none;
		border-radius: 0.25rem;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.7rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.12s;
	}
	.filter-chip:hover { background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.7); }
	.filter-chip.active {
		background: rgba(96, 165, 250, 0.1);
		color: #60a5fa;
	}
	.sidebar-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.6rem;
		background: none;
		border: none;
		border-left: 2px solid transparent;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.72rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}
	.sidebar-item:hover { color: rgba(255, 255, 255, 0.8); background: rgba(255, 255, 255, 0.03); }
	.sidebar-item.active {
		color: #60a5fa;
		border-left-color: #60a5fa;
		background: rgba(96, 165, 250, 0.06);
	}
	.sidebar-related {
		display: flex;
		flex-direction: column;
		padding: 0.35rem 0.6rem;
		text-decoration: none;
		border-left: 2px solid transparent;
		transition: all 0.12s;
	}
	.sidebar-related:hover { border-left-color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.02); }
	.related-section {
		font-size: 0.65rem;
		color: #60a5fa;
		font-family: 'JetBrains Mono', monospace;
	}
	.related-title {
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.45);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Center Content */
	.center-content { min-width: 0; }
	.content-card {
		padding: 1.25rem;
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}
	.content-card h2 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.75rem 0;
		color: rgba(255, 255, 255, 0.85);
	}
	.subsection-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		margin: 1rem 0 0.5rem 0;
	}

	/* Summary + Source Drawer */
	.summary-text {
		font-size: 0.875rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.8);
		white-space: pre-wrap;
	}
	.source-drawer-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.6rem;
		padding: 0.25rem 0.5rem;
		background: rgba(96, 165, 250, 0.06);
		border: 1px solid rgba(96, 165, 250, 0.15);
		border-radius: 0.2rem;
		color: #60a5fa;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.12s;
	}
	.source-drawer-toggle:hover { background: rgba(96, 165, 250, 0.12); }
	.source-drawer-toggle.small {
		margin-top: 0.4rem;
		padding: 0.15rem 0.35rem;
		font-size: 0.62rem;
	}
	.source-drawer {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(96, 165, 250, 0.1);
		border-radius: 0.375rem;
	}
	.source-drawer.compact {
		padding: 0.4rem 0.6rem;
		margin-top: 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.source-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.75rem;
	}
	.source-label {
		color: rgba(255, 255, 255, 0.35);
		min-width: 70px;
		font-weight: 500;
	}
	.source-val {
		color: rgba(255, 255, 255, 0.7);
	}
	.source-val.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; }
	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: #60a5fa;
		text-decoration: none;
		font-size: 0.72rem;
	}
	.source-link:hover { text-decoration: underline; }
	.source-disclaimer {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		font-size: 0.68rem;
		color: #eab308;
		font-style: italic;
	}

	.placeholder-text {
		font-size: 0.825rem;
		color: rgba(255, 255, 255, 0.35);
		font-style: italic;
	}
	.placeholder-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.35);
	}
	.placeholder-card p { font-size: 0.85rem; max-width: 360px; }
	.error-text {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #ef4444;
		font-size: 0.85rem;
	}
	.inline-link {
		background: none;
		border: none;
		color: #60a5fa;
		cursor: pointer;
		font-size: inherit;
		text-decoration: underline;
		padding: 0;
	}

	/* Key Provisions Grid */
	.provisions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}
	@media (max-width: 600px) {
		.provisions-grid { grid-template-columns: 1fr; }
	}
	.provision-card {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.375rem;
		transition: border-color 0.15s;
	}
	.provision-card:hover { border-color: rgba(96, 165, 250, 0.3); }
	.provision-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(96, 165, 250, 0.1);
		border-radius: 0.375rem;
		color: #60a5fa;
		margin-bottom: 0.5rem;
	}
	.provision-card h4 {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0 0 0.35rem 0;
		color: rgba(255, 255, 255, 0.9);
	}
	.provision-card p {
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.5;
		margin: 0;
	}
	.see-more {
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.4);
		margin-top: 0.5rem;
		font-style: italic;
	}

	/* Implications Grid */
	.implications-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.75rem;
	}
	.implication-card {
		padding: 1rem;
		border-radius: 0.375rem;
		border: 1px solid;
		position: relative;
	}
	.implication-card h4 {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0 0 0.35rem 0;
	}
	.implication-card p {
		font-size: 0.78rem;
		line-height: 1.5;
		margin: 0;
		opacity: 0.75;
	}
	.severity-tag {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		font-size: 0.6rem;
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.05em;
		opacity: 0.6;
	}
	.severity-high {
		background: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}
	.severity-high h4 { color: #fca5a5; }
	.severity-medium {
		background: rgba(234, 179, 8, 0.08);
		border-color: rgba(234, 179, 8, 0.2);
		color: #fde68a;
	}
	.severity-medium h4 { color: #fde68a; }
	.severity-low {
		background: rgba(34, 197, 94, 0.08);
		border-color: rgba(34, 197, 94, 0.2);
		color: #86efac;
	}
	.severity-low h4 { color: #86efac; }

	/* Official Text */
	.full-text {
		font-size: 0.85rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.7);
		white-space: pre-wrap;
		max-height: 70vh;
		overflow-y: auto;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.375rem;
	}
	.chunk-block {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.chunk-index {
		flex-shrink: 0;
		color: #60a5fa;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		font-size: 0.8rem;
	}
	.chunk-block p {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.6;
		margin: 0;
	}

	/* Case Links */
	.case-link-row {
		padding: 0.75rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.case-link-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.case-link-id {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: #60a5fa;
		text-decoration: none;
		font-size: 0.82rem;
		font-weight: 500;
	}
	.case-link-id:hover { text-decoration: underline; }
	.link-type-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		background: rgba(168, 85, 247, 0.12);
		color: #a855f7;
		border-radius: 0.2rem;
		font-size: 0.62rem;
		text-transform: uppercase;
		font-weight: 600;
	}
	.case-status-badge {
		padding: 0.1rem 0.35rem;
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		border-radius: 0.2rem;
		font-size: 0.6rem;
		text-transform: uppercase;
		font-weight: 600;
	}
	.link-notes {
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.45);
		margin: 0.25rem 0 0 0;
	}
	.link-date {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.3);
	}

	/* Precedent rows (center content) */
	.precedent-row {
		padding: 0.75rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.precedent-row h4 {
		font-size: 0.88rem;
		font-weight: 600;
		margin: 0 0 0.25rem 0;
	}
	.precedent-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.4);
		margin-bottom: 0.35rem;
	}
	.precedent-court { color: rgba(255, 255, 255, 0.55); }
	.precedent-cite {
		font-family: 'JetBrains Mono', monospace;
		color: #60a5fa;
		font-size: 0.7rem;
	}
	.precedent-summary {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.5;
		margin: 0;
	}

	/* Regulations placeholder */
	.regulation-placeholder {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.regulation-tip {
		display: flex;
		gap: 0.5rem;
		padding: 0.65rem;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.1);
		border-radius: 0.375rem;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.6);
	}
	.regulation-tip strong { color: rgba(255, 255, 255, 0.8); }

	/* Glossary Tab */
	.glossary-search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.375rem;
	}
	.glossary-search-bar input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: rgba(255, 255, 255, 0.85);
		font-size: 0.82rem;
	}
	.glossary-search-bar input::placeholder { color: rgba(255, 255, 255, 0.3); }
	.search-go {
		padding: 0.25rem 0.5rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		border-radius: 0.2rem;
		color: #60a5fa;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.search-go:hover { background: rgba(96, 165, 250, 0.25); }
	.search-go:disabled { opacity: 0.5; }
	.glossary-results { margin-top: 1rem; }
	.glossary-results h3 {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 0.5rem 0;
	}
	.glossary-card {
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.glossary-term-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.glossary-term-header strong {
		color: #60a5fa;
		font-size: 0.88rem;
	}
	.glossary-cat {
		padding: 0.1rem 0.35rem;
		background: rgba(168, 85, 247, 0.1);
		color: #a855f7;
		border-radius: 0.2rem;
		font-size: 0.6rem;
		text-transform: uppercase;
		font-weight: 600;
	}
	.glossary-card p {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.65);
		line-height: 1.5;
		margin: 0;
	}
	.related-terms {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.7rem;
	}
	.related-pill {
		padding: 0.1rem 0.35rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.2rem;
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.55);
	}

	/* Timeline */
	.timeline { padding-left: 1rem; }
	.timeline-item {
		display: flex;
		gap: 0.75rem;
		padding-bottom: 1.25rem;
		position: relative;
	}
	.timeline-item:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 14px;
		bottom: 0;
		width: 1px;
		background: rgba(255, 255, 255, 0.1);
	}
	.timeline-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		flex-shrink: 0;
		margin-top: 4px;
	}
	.timeline-dot.effective { background: #22c55e; }
	.timeline-date {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		font-family: 'JetBrains Mono', monospace;
	}
	.timeline-content p {
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.7);
		margin: 0.15rem 0 0 0;
	}
	.timeline-badge {
		display: inline-block;
		margin-top: 0.25rem;
		padding: 0.1rem 0.4rem;
		border-radius: 0.2rem;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.timeline-badge.current { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
	.history-notice {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.65rem;
		background: rgba(234, 179, 8, 0.04);
		border: 1px solid rgba(234, 179, 8, 0.1);
		border-radius: 0.375rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}
	.history-notice p { margin: 0; }

	/* Citations Tab */
	.citation-box {
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.375rem;
		margin-bottom: 0.75rem;
	}
	.citation-label {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.35);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.3rem;
	}
	.citation-formatted {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.85);
	}
	.citation-list { list-style: none; padding: 0; }
	.citation-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.6rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.citation-num {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(96, 165, 250, 0.1);
		color: #60a5fa;
		border-radius: 50%;
		font-size: 0.65rem;
		font-weight: 600;
	}
	.citation-body {
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.7);
	}

	/* Right Sidebar */
	.right-sidebar {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
	}
	.sidebar-card {
		padding: 0.85rem;
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.5rem;
		margin-bottom: 0.6rem;
	}
	.sidebar-card h3 {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: rgba(255, 255, 255, 0.65);
	}
	.sidebar-placeholder {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.3);
		font-style: italic;
	}

	/* Cited Sources */
	.cited-source {
		padding: 0.35rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.source-text {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
	}

	/* Precedents (sidebar) */
	.precedent-item {
		padding: 0.45rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.precedent-item:last-child { border-bottom: none; }
	.precedent-item h4 {
		font-size: 0.76rem;
		font-weight: 600;
		margin: 0 0 0.15rem 0;
		color: rgba(255, 255, 255, 0.8);
	}
	.precedent-meta-mini {
		display: flex;
		gap: 0.5rem;
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.3);
	}
	.precedent-citation {
		font-size: 0.67rem;
		color: #60a5fa;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Glossary sidebar */
	.glossary-mini {
		padding: 0.35rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.glossary-mini strong {
		font-size: 0.75rem;
		color: #60a5fa;
	}
	.glossary-mini p {
		font-size: 0.68rem;
		color: rgba(255, 255, 255, 0.45);
		margin: 0.1rem 0 0 0;
	}

	/* Related statutes links */
	.related-statute-link {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0;
		text-decoration: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
		font-size: 0.72rem;
		transition: all 0.12s;
	}
	.related-statute-link:hover { background: rgba(255, 255, 255, 0.02); }
	.related-statute-link span:first-child {
		color: #60a5fa;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		flex-shrink: 0;
	}
	.related-title-text {
		color: rgba(255, 255, 255, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Buttons */
	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.85rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.375rem;
		color: #e0e0e0;
		font-size: 0.8rem;
		cursor: pointer;
		text-decoration: none;
		transition: all 0.15s;
	}
	.action-btn:hover { background: rgba(255, 255, 255, 0.1); }
	.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.action-btn.primary {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.4);
		color: #60a5fa;
	}
	.action-btn.primary:hover { background: rgba(96, 165, 250, 0.25); }

	.sidebar-action {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.25rem;
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		margin-top: 0.35rem;
	}
	.sidebar-action:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); }
	.sidebar-action:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Skeleton */
	.loading-placeholder {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.skeleton-line {
		height: 0.75rem;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 0.25rem;
		animation: pulse 1.5s infinite;
	}
	.skeleton-line.short { width: 60%; }
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
</style>
