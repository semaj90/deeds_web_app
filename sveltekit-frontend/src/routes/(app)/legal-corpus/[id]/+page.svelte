<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';
	import LegalBreadcrumbs from '$lib/components/legal-corpus/LegalBreadcrumbs.svelte';
	import LegalDocumentHeader from '$lib/components/legal-corpus/LegalDocumentHeader.svelte';
	import LegalMetadataBar from '$lib/components/legal-corpus/LegalMetadataBar.svelte';
	import LegalTabBar from '$lib/components/legal-corpus/LegalTabBar.svelte';
	import CorpusSidebar from '$lib/components/legal-corpus/CorpusSidebar.svelte';
	import CitedSourcesOverlay from '$lib/components/legal/CitedSourcesOverlay.svelte';
	import GlossaryTermCard from '$lib/components/legal/GlossaryTermCard.svelte';
	import CitationViewModal from '$lib/components/citations/CitationViewModal.svelte';
	import LegalCorpusClassicView from '$lib/components/legal-corpus/LegalCorpusClassicView.svelte';
	import LegalCorpusDemoView from '$lib/components/legal-corpus/LegalCorpusDemoView.svelte';
	import { type LegalCorpusView, type DemoModel, legalCorpusViews, parseView, toDemoModel } from '$lib/adapters/legal-corpus';

	let { data } = $props();
	let statute = $derived(data.statute);

	// View toggle: reader (yorha) | classic | demo
	// URL param overrides → localStorage supplies default
	let viewMode = $state<LegalCorpusView>(browser ? parseView(new URL(window.location.href)) : 'reader');

	// Sync URL param when view changes
	$effect(() => {
		if (!browser) return;
		const url = new URL(window.location.href);
		if (viewMode === 'reader') {
			url.searchParams.delete('view');
		} else {
			url.searchParams.set('view', viewMode);
		}
		window.history.replaceState({}, '', url.toString());
		localStorage.setItem('legal-corpus-view', viewMode);
	});

	// Demo model (only computed when needed)
	let demoModel = $derived(toDemoModel(data));

	function setView(v: LegalCorpusView) { viewMode = v; }

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
	let drawerOpen = $state(false);

	// Citation modal state
	let citationModalOpen = $state(false);
	let selectedCitation = $state<{
		id: string;
		citationType?: string;
		formattedCitation?: string;
		quotedText?: string;
		legalPrinciple?: string;
		relevanceScore?: number;
		isKeyAuthority?: boolean;
		documentTitle?: string;
		caseTitle?: string;
		sourceUrl?: string;
		jurisdiction?: string;
		effectiveDate?: string;
		createdAt?: string;
	} | null>(null);

	function openCitationModal(cite: { id?: string; title: string; citation?: string | null; court?: string | null; summary?: string | null; decisionDate?: string | null }) {
		selectedCitation = {
			id: cite.id ?? cite.title,
			citationType: 'case_law',
			formattedCitation: cite.citation ?? cite.title,
			caseTitle: cite.title,
			legalPrinciple: cite.summary ?? undefined,
			jurisdiction: cite.court ?? undefined,
			effectiveDate: cite.decisionDate ?? undefined,
		};
		citationModalOpen = true;
	}

	function handleDemoCitationClick(cite: DemoModel['topCitations'][number]) {
		openCitationModal(cite);
	}

	// Adapt AI sources → CitedSourcesOverlay format
	let overlayCitations = $derived(aiCitedSources.map((s, i) => ({
		type: 'Authority',
		label: `Source ${i + 1}`,
		content: s,
	})));
	let overlayDefinitions = $derived((data.glossaryTerms ?? []).map(t => ({
		term: t.term,
		definition_text: t.definition,
	})));

	// Glossary search
	let glossarySearch = $state('');
	let glossaryLoading = $state(false);
	let searchedGlossary = $state<{ id: string; term: string; definition: string; category?: string; relatedTerms?: string[] | null }[]>([]);

	// Left sidebar
	let activeSection = $state('executive-summary');

	// Selected glossary term (for detail view)
	let selectedGlossaryTerm = $state<{ id: string; term: string; definition: string; category?: string | null; relatedTerms?: string[] | null } | null>(null);

	// Sidebar sections — derived from content
	let sidebarSections = $derived.by(() => {
		const sections = [
			{ id: 'executive-summary', label: 'Executive Summary', icon: 'sparkles' },
			{ id: 'key-provisions', label: 'Key Provisions', icon: 'list' },
			{ id: 'implications', label: 'Implications', icon: 'triangle-alert' },
		];
		if (data.chunks.length > 0) sections.push({ id: 'full-text', label: 'Full Text', icon: 'file-text' });
		if (data.caseLinks.length > 0) sections.push({ id: 'linked-cases', label: 'Linked Cases', icon: 'link' });
		sections.push({ id: 'glossary-terms', label: 'Glossary', icon: 'book-text' });
		return sections;
	});

	// Filtered glossary terms from server data
	let filteredGlossary = $derived.by(() => {
		const terms = data.glossaryTerms ?? [];
		if (!glossarySearch.trim()) return terms;
		const q = glossarySearch.toLowerCase();
		return terms.filter(t => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q));
	});

	// Breadcrumb parts
	let breadcrumbs = $derived.by(() => {
		const parts: string[] = [];
		if (statute?.jurisdiction) parts.push(statute.jurisdiction);
		if (statute?.category) parts.push(statute.category);
		parts.push(statute?.section ? `§ ${statute.section}` : statute?.title ?? 'Detail');
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
		return new Date(statute.effectiveDate) <= new Date() ? 'Current' : 'Pending';
	});

	function getProvisionIcon(icon?: string): string {
		const map: Record<string, string> = {
			shield: 'shield', access: 'lock', fraud: 'triangle-alert',
			theft: 'credit-card', code: 'code', data: 'database',
			privacy: 'eye-off', compliance: 'circle-check', penalty: 'gavel',
		};
		return icon ? (map[icon.toLowerCase()] ?? icon) : 'file-text';
	}

	function scrollToSection(id: string) {
		activeSection = id;
		activeTab = 'summary';
		if (browser) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function formatDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function formatShortDate(d: string | null): string {
		if (!d) return 'N/A';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
		} catch { /* non-fatal */ }
		glossaryLoading = false;
	}
</script>

{#if !statute}
	<!-- Error State -->
	<div class="yorha-page error-center">
		<div class="yorha-card error-card">
			<Icon name="circle-alert" size={32} class="text-amber" />
			<p class="error-msg">{data.loadError ?? 'Statute not found'}</p>
			<a href="/legal-corpus" class="yorha-btn-ghost back-link">
				<Icon name="arrow-left" size={14} /> Back to Legal Corpus
			</a>
		</div>
	</div>
{:else}
	{#if viewMode === 'classic'}
		<!-- Classic View (original full-featured layout) -->
		<div class="relative">
			<div class="floating-toggle">
				<button class="yorha-btn-amber shadow-lg" onclick={() => setView('reader')}>
					<Icon name="sparkles" size={13} /> Reader
				</button>
				<button class="yorha-btn-ghost floating-toggle-alt" onclick={() => setView('demo')}>
					<Icon name="layout-template" size={13} /> Demo
				</button>
			</div>
			<LegalCorpusClassicView {data} />
		</div>
	{:else if viewMode === 'demo'}
		<!-- Demo View (slim showcase shell) -->
		<div class="relative">
			<div class="floating-toggle">
				<button class="yorha-btn-amber shadow-lg" onclick={() => setView('reader')}>
					<Icon name="sparkles" size={13} /> Reader
				</button>
				<button class="yorha-btn-ghost floating-toggle-alt" onclick={() => setView('classic')}>
					<Icon name="layout-dashboard" size={13} /> Classic
				</button>
			</div>
			<LegalCorpusDemoView model={demoModel} onCitationClick={handleDemoCitationClick} />
		</div>
	{:else}
	<div class="reader-page">

		<!-- Breadcrumbs + Top Nav -->
		<div class="top-bar">
			<LegalBreadcrumbs crumbs={breadcrumbs} />
			<div class="top-links">
				<a href="/legal-corpus">Recent Documents</a>
				<a href="/library">My Library</a>
			</div>
		</div>

		<!-- Search Bar -->
		<div class="yorha-panel search-bar">
			<Icon name="search" size={15} class="search-icon" />
			<input
				type="text"
				placeholder="Search legal terms..."
				class="search-input"
			/>
			<div class="search-actions">
				<button class="yorha-btn-ghost search-action-btn"><Icon name="git-compare" size={13} /> Compare</button>
				<button class="yorha-btn-amber"><Icon name="download" size={13} /> Export</button>
			</div>
		</div>

		<!-- Document Header -->
		<div class="doc-header">
			<div>
				<h1 class="doc-title">
					{statute.title || 'Untitled Statute'}
					{#if statute.section}
						<span class="yorha-pill section-pill">§ {statute.section}</span>
					{/if}
				</h1>
				{#if statute.jurisdiction}
					<span class="yorha-pill jurisdiction-pill">{statute.jurisdiction}</span>
				{/if}
			</div>
			<div class="doc-actions">
				<div class="view-toggle-group">
					<button class="view-toggle-btn active" disabled>
						<Icon name="sparkles" size={12} /> Reader
					</button>
					<button class="view-toggle-btn" onclick={() => setView('classic')}>
						<Icon name="layout-dashboard" size={12} /> Classic
					</button>
					<button class="view-toggle-btn" onclick={() => setView('demo')}>
						<Icon name="layout-template" size={12} /> Demo
					</button>
				</div>
				<button class="yorha-btn-amber" onclick={generateSummary} disabled={summaryLoading}>
					<Icon name="sparkles" size={13} />
					{summaryLoading ? 'Analyzing...' : 'AI Analysis'}
				</button>
				{#if aiCitedSources.length > 0}
					<button class="yorha-btn-ghost" onclick={() => drawerOpen = true}>
						<Icon name="bookmark" size={13} /> Sources ({aiCitedSources.length})
					</button>
				{/if}
				{#if statute.sourceUrl}
					<a href={statute.sourceUrl} target="_blank" rel="noopener noreferrer" class="yorha-btn-ghost">
						<Icon name="external-link" size={13} /> Official
					</a>
				{/if}
			</div>
		</div>

		<!-- Metadata Bar -->
		<div class="yorha-panel metadata-bar">
			{#if statute.jurisdiction}
				<div class="meta-item">
					<span class="yorha-label">Jurisdiction</span>
					<span class="meta-value meta-value-amber">{statute.jurisdiction}</span>
				</div>
				<div class="meta-divider"></div>
			{/if}
			{#if statute.category}
				<div class="meta-item">
					<span class="yorha-label">Corpus</span>
					<span class="meta-value">{statute.category}</span>
				</div>
				<div class="meta-divider"></div>
			{/if}
			{#if citationText}
				<div class="meta-item">
					<span class="yorha-label">Citation</span>
					<span class="meta-value meta-value-mono">{citationText}</span>
				</div>
				<div class="meta-divider"></div>
			{/if}
			<div class="meta-item">
				<span class="yorha-label">Status</span>
				{#if statuteStatus === 'Current'}
					<span class="meta-value meta-value-green">{statuteStatus}</span>
				{:else if statuteStatus === 'Pending'}
					<span class="meta-value meta-value-yellow">{statuteStatus}</span>
				{:else}
					<span class="meta-value meta-value-muted">{statuteStatus}</span>
				{/if}
			</div>
			<div class="meta-divider"></div>
			<div class="meta-item">
				<span class="yorha-label">Effective</span>
				<span class="meta-value meta-value-dim">{formatShortDate(statute.effectiveDate)}</span>
			</div>
			{#if statute.updatedAt}
				<div class="meta-divider"></div>
				<div class="meta-item">
					<span class="yorha-label">Updated</span>
					<span class="meta-value meta-value-dim">{formatShortDate(statute.updatedAt)}</span>
				</div>
			{/if}
			{#if statute.sourceUrl}
				<div class="meta-badge">
					<Icon name="shield-check" size={11} />
					AI-generated — verify with official sources
				</div>
			{/if}
		</div>

		<!-- Tab Navigation -->
		<div class="tab-bar">
			{#each [
				{ id: 'summary', label: 'Summary', icon: 'file-text' },
				{ id: 'official-text', label: 'Official Text', icon: 'scroll-text' },
				{ id: 'cases', label: 'Cases', icon: 'folder', count: data.caseLinks.length || undefined },
				{ id: 'regulations', label: 'Regulations', icon: 'landmark' },
				{ id: 'glossary', label: 'Glossary', icon: 'book-text', count: data.glossaryTerms?.length || undefined },
				{ id: 'history', label: 'History', icon: 'clock' },
				{ id: 'citations', label: 'Citations', icon: 'bookmark', count: aiCitedSources.length || undefined },
			] as tab}
				<button
					class="tab-item {activeTab === tab.id ? 'tab-item-active' : ''}"
					onclick={() => { activeTab = tab.id as TabId; }}
				>
					<Icon name={tab.icon} size={14} />
					{tab.label}
					{#if tab.count}
						<span class="tab-count">{tab.count}</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- 3-Column Layout -->
		<div class="corpus-grid">

			<!-- Left Sidebar: Corpus Nav -->
			<aside class="corpus-left yorha-sidebar">
				<CorpusSidebar
					sections={sidebarSections}
					{activeSection}
					relatedStatutes={data.relatedStatutes}
					jurisdiction={statute.jurisdiction}
					category={statute.category}
					casesCount={data.caseLinks.length}
					glossaryCount={data.glossaryTerms?.length ?? 0}
					onSectionClick={scrollToSection}
				/>
			</aside>

			<!-- Center Content -->
			<main class="corpus-center">

				{#if activeTab === 'summary'}
					<!-- Executive Summary -->
					<section id="executive-summary" class="yorha-card content-section">
						<h2 class="section-heading">
							<Icon name="sparkles" size={16} class="text-amber" /> Executive Summary
						</h2>
						{#if aiSummary}
							<div class="yorha-reader">{aiSummary}</div>
						{:else if summaryError}
							<p class="error-inline">
								<Icon name="circle-alert" size={14} /> {summaryError}
							</p>
						{:else if summaryLoading}
							<div class="skeleton-group">
								<div class="skeleton-line"></div>
								<div class="skeleton-line w-60p"></div>
								<div class="skeleton-line"></div>
								<div class="skeleton-line w-50p"></div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="sparkles" size={24} />
								<p>Click <strong>AI Analysis</strong> to generate an executive summary, key provisions, and legal implications.</p>
							</div>
						{/if}
					</section>

					<!-- Key Provisions -->
					<section id="key-provisions" class="yorha-card content-section">
						<h2 class="section-heading">
							<Icon name="list" size={16} class="text-amber" /> Key Provisions
						</h2>
						{#if aiKeyProvisions.length > 0}
							<div class="provisions-grid">
								{#each aiKeyProvisions as prov}
									<div class="yorha-panel provision-card">
										<div class="provision-icon">
											<Icon name={getProvisionIcon(prov.icon)} size={18} />
										</div>
										<h4 class="provision-title">{prov.title}</h4>
										<p class="provision-desc">{prov.description}</p>
									</div>
								{/each}
							</div>
						{:else if data.chunks.length > 0}
							<div class="provisions-grid">
								{#each data.chunks.slice(0, 4) as chunk}
									<div class="yorha-panel provision-card">
										<div class="provision-icon provision-icon-muted">
											<Icon name="file-text" size={18} />
										</div>
										<h4 class="provision-title">Section {chunk.chunkIndex + 1}</h4>
										<p class="provision-desc">{chunk.content?.slice(0, 150)}...</p>
									</div>
								{/each}
							</div>
							{#if data.chunks.length > 4}
								<p class="more-link">
									+ {data.chunks.length - 4} more sections.
									<button class="text-link" onclick={() => activeTab = 'official-text'}>View all</button>
								</p>
							{/if}
						{:else}
							<p class="empty-hint">Run AI Analysis to extract key provisions.</p>
						{/if}
					</section>

					<!-- Implications -->
					<section id="implications" class="yorha-card content-section">
						<h2 class="section-heading">
							<Icon name="triangle-alert" size={16} class="text-amber" /> Implications
						</h2>
						{#if aiImplications.length > 0}
							<div class="implications-grid">
								{#each aiImplications as imp}
									<div class="implication-card {imp.severity === 'high' ? 'imp-high' : imp.severity === 'low' ? 'imp-low' : 'imp-medium'}">
										<h4 class="imp-title">{imp.title}</h4>
										<p class="imp-desc">{imp.description}</p>
										{#if imp.severity}
											<span class="yorha-label imp-severity">{imp.severity}</span>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="empty-hint">Run AI Analysis to identify compliance risks and legal implications.</p>
						{/if}
					</section>

				{:else if activeTab === 'official-text'}
					<section id="full-text" class="yorha-card">
						<h2 class="section-heading">
							<Icon name="scroll-text" size={16} class="text-amber" /> Official Text
						</h2>
						{#if statute.content}
							<div class="yorha-reader official-text-reader">{statute.content}</div>
						{:else if data.chunks.length > 0}
							{#each data.chunks as chunk}
								<div class="chunk-row">
									<span class="chunk-idx">§ {chunk.chunkIndex + 1}</span>
									<p class="chunk-text">{chunk.content}</p>
								</div>
							{/each}
						{:else}
							<p class="empty-hint">No official text available. Upload the statute document to populate this section.</p>
						{/if}
					</section>

				{:else if activeTab === 'cases'}
					<section class="yorha-card content-section">
						<h2 class="section-heading">
							<Icon name="folder" size={16} class="text-amber" /> Linked Cases ({data.caseLinks.length})
						</h2>
						{#if data.caseLinks.length > 0}
							{#each data.caseLinks as link}
								<div class="case-row">
									<div class="case-row-header">
										<a href="/cases/{link.caseId}" class="case-link">
											<Icon name="folder-open" size={14} />
											{link.caseTitle ?? link.caseId}
										</a>
										<span class="yorha-pill pill-purple">{link.linkType?.replace(/_/g, ' ')}</span>
										{#if link.caseStatus}
											<span class="yorha-pill pill-green">{link.caseStatus}</span>
										{/if}
									</div>
									{#if link.notes}<p class="case-notes">{link.notes}</p>{/if}
									<span class="case-date">{formatShortDate(link.createdAt)}</span>
								</div>
							{/each}
						{:else}
							<p class="empty-hint">No cases linked to this statute yet.</p>
						{/if}
					</section>

					<!-- Precedents -->
					{#if data.precedents.length > 0}
						<section class="yorha-card">
							<h2 class="section-heading">
								<Icon name="scale" size={16} class="text-amber" /> Legal Precedents
							</h2>
							{#each data.precedents as p}
								<button class="case-row case-row-btn" onclick={() => openCitationModal(p)}>
									<h4 class="precedent-title">{p.title}</h4>
									<div class="precedent-meta">
										{#if p.court}<span class="meta-court">{p.court}</span>{/if}
										{#if p.decisionDate}<span>{formatShortDate(p.decisionDate)}</span>{/if}
										{#if p.citation}<span class="meta-citation">{p.citation}</span>{/if}
									</div>
									{#if p.summary}<p class="precedent-summary">{p.summary}</p>{/if}
								</button>
							{/each}
						</section>
					{/if}

				{:else if activeTab === 'regulations'}
					<section class="yorha-card">
						<h2 class="section-heading">
							<Icon name="landmark" size={16} class="text-amber" /> Related Regulations
						</h2>
						<p class="empty-hint mb-hint">Related regulations will appear here once CFR and regulatory cross-references are indexed.</p>
						<div class="info-stack">
							<div class="info-box">
								<Icon name="info" size={14} class="info-icon" />
								<div><strong class="info-strong">Coming soon:</strong> Automated cross-referencing with the Code of Federal Regulations (CFR) and state regulatory databases.</div>
							</div>
							{#if statute.jurisdiction === 'Federal' || statute.jurisdiction === 'federal'}
								<div class="info-box">
									<Icon name="landmark" size={14} class="info-icon" />
									<div>Federal statutes like this one often have implementing regulations in Title 18 CFR.</div>
								</div>
							{/if}
						</div>
					</section>

				{:else if activeTab === 'glossary'}
					<!-- Glossary Tabs (sub-tabs) -->
					<div class="tab-bar subtab-bar">
						<button class="tab-item tab-item-active">Glossary</button>
						<button class="tab-item" onclick={() => activeTab = 'cases'}>Cases</button>
						<button class="tab-item" onclick={() => activeTab = 'history'}>History</button>
					</div>

					<!-- Selected Term Pills -->
					{#if selectedGlossaryTerm}
						<div class="selected-term-pills">
							<button
								class="term-pill-btn"
								onclick={() => selectedGlossaryTerm = null}
							>
								<Icon name="book-text" size={12} />
								{selectedGlossaryTerm.term}
								<Icon name="x" size={11} class="pill-x" />
							</button>
							<button class="pill-action">
								<Icon name="sparkles" size={14} />
							</button>
						</div>
					{/if}

					<!-- Selected Term Detail Card -->
					{#if selectedGlossaryTerm}
						<div class="yorha-card content-section">
							<div class="term-detail-header">
								<div>
									<span class="yorha-label">Selected Term</span>
									<h3 class="term-detail-title">{selectedGlossaryTerm.term}</h3>
								</div>
								<span class="term-detail-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
							</div>
							<!-- Category pills -->
							<div class="term-pills-row">
								{#if selectedGlossaryTerm.category}
									<span class="yorha-pill">{selectedGlossaryTerm.category}</span>
								{/if}
								{#if statute.jurisdiction}
									<span class="yorha-pill pill-amber">{statute.jurisdiction}</span>
								{/if}
								{#if statute.category}
									<span class="yorha-pill">{statute.category}</span>
								{/if}
							</div>
							<!-- Source badge -->
							<div class="term-source-row">
								<span class="source-badge"><Icon name="circle-check" size={12} class="text-green-600" /> Official Source</span>
								<span>Date added: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
							</div>
							<!-- Reader pane -->
							<div class="yorha-reader term-reader">
								{selectedGlossaryTerm.definition}
							</div>
							<!-- Related terms -->
							{#if selectedGlossaryTerm.relatedTerms && Array.isArray(selectedGlossaryTerm.relatedTerms) && selectedGlossaryTerm.relatedTerms.length > 0}
								<div class="related-terms-section">
									<span class="yorha-label">Related Terms</span>
									<div class="related-terms-list">
										{#each selectedGlossaryTerm.relatedTerms as rt}
											<span class="yorha-pill">{rt}</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Search bar -->
					<div class="glossary-search yorha-input">
						<Icon name="search" size={14} class="search-icon-sm" />
						<input
							type="text"
							placeholder="Search terms, acronyms, or doctrines..."
							bind:value={glossarySearch}
							onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') searchGlossary(); }}
							class="glossary-search-input"
						/>
						<button
							class="glossary-search-btn"
							onclick={searchGlossary}
							disabled={glossaryLoading}
						>
							{glossaryLoading ? '...' : 'Search'}
						</button>
					</div>

					<!-- Search results from API -->
					{#if searchedGlossary.length > 0}
						<div class="content-section">
							<h3 class="yorha-label list-heading">Search Results</h3>
							<div class="term-list">
								{#each searchedGlossary as term}
									<GlossaryTermCard
										term={{ ...term, id: term.id ?? term.term }}
										variant="light"
										onSelect={() => { selectedGlossaryTerm = { ...term, id: term.id ?? term.term }; }}
									/>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Server-loaded terms -->
					{#if filteredGlossary.length > 0}
						<h3 class="yorha-label list-heading">{statute.jurisdiction ?? 'All'} Terms ({filteredGlossary.length})</h3>
						<div class="term-list">
							{#each filteredGlossary as term}
								<GlossaryTermCard
									{term}
									variant="light"
									selected={selectedGlossaryTerm?.id === term.id}
									onSelect={() => { selectedGlossaryTerm = term; }}
								/>
							{/each}
						</div>
					{:else}
						<p class="empty-hint mt-hint">No glossary terms found for this jurisdiction. Try searching above.</p>
					{/if}

				{:else if activeTab === 'history'}
					<section class="yorha-card">
						<h2 class="section-heading">
							<Icon name="clock" size={16} class="text-amber" /> Version History
						</h2>
						<div class="timeline">
							{#if statute.effectiveDate}
								<div class="timeline-item">
									<div class="timeline-line"></div>
									<div class="timeline-dot timeline-dot-green"></div>
									<div>
										<span class="timeline-date">{formatDate(statute.effectiveDate)}</span>
										<p class="timeline-desc">Effective date — statute entered into force</p>
										<span class="yorha-pill pill-green">Current version</span>
									</div>
								</div>
							{/if}
							<div class="timeline-item">
								<div class="timeline-line"></div>
								<div class="timeline-dot timeline-dot-gray"></div>
								<div>
									<span class="timeline-date">{formatDate(statute.createdAt)}</span>
									<p class="timeline-desc">Added to legal corpus</p>
								</div>
							</div>
							<div class="timeline-item timeline-item-last">
								<div class="timeline-dot timeline-dot-gray"></div>
								<div>
									<span class="timeline-date">{formatDate(statute.updatedAt)}</span>
									<p class="timeline-desc">Last updated in system</p>
								</div>
							</div>
						</div>
						<div class="info-box info-box-amber">
							<Icon name="info" size={14} class="info-icon" />
							<p>Full amendment history and version comparison will be available once legislative change tracking is connected to official sources.</p>
						</div>
					</section>

				{:else if activeTab === 'citations'}
					<section class="yorha-card">
						<h2 class="section-heading">
							<Icon name="bookmark" size={16} class="text-amber" /> Citations & References
						</h2>
						<!-- This statute's citation -->
						<div class="cite-box">
							<span class="yorha-label cite-label">Cite this statute</span>
							<span class="cite-text">{citationText}</span>
						</div>

						{#if aiCitedSources.length > 0}
							<h3 class="yorha-label list-heading">Referenced Sources ({aiCitedSources.length})</h3>
							<ul class="source-list">
								{#each aiCitedSources as source, i}
									<li class="source-item">
										<span class="source-num">{i + 1}</span>
										<span class="source-text">{source}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="empty-hint">Run AI Analysis to extract citations and referenced sources.</p>
						{/if}
					</section>
				{/if}
			</main>

			<!-- Right Sidebar -->
			<aside class="corpus-right">

				<!-- Similar Cases -->
				<div class="yorha-panel sidebar-card">
					<div class="sidebar-card-header">
						<h3 class="sidebar-card-title">
							<Icon name="scale" size={14} class="text-amber" /> Similar Cases
						</h3>
						<button class="sidebar-more-btn">
							<Icon name="ellipsis-vertical" size={14} />
						</button>
					</div>
					{#if data.precedents.length > 0}
						<div class="sidebar-card-list">
							{#each data.precedents.slice(0, 4) as p}
								<button class="sidebar-case-card sidebar-case-btn" onclick={() => openCitationModal(p)}>
									<h4 class="sidebar-case-title">{p.title}</h4>
									<div class="sidebar-case-meta">
										<Icon name="calendar" size={11} />
										<span>{formatShortDate(p.decisionDate)}</span>
									</div>
									<div class="sidebar-case-pills">
										{#if p.court}
											<span class="yorha-pill">{p.court}</span>
										{/if}
										{#if p.citation}
											<span class="sidebar-citation">{p.citation}</span>
										{/if}
									</div>
								</button>
							{/each}
						</div>
						{#if data.precedents.length > 4}
							<button class="sidebar-see-all" onclick={() => activeTab = 'cases'}>
								See all {data.precedents.length} similar cases
								<Icon name="chevron-right" size={13} />
							</button>
						{/if}
					{:else if data.caseLinks.length > 0}
						<div class="sidebar-card-list">
							{#each data.caseLinks.slice(0, 4) as link}
								<a href="/cases/{link.caseId}" class="sidebar-case-card sidebar-case-link">
									<h4 class="sidebar-case-title">{link.caseTitle ?? link.caseId}</h4>
									<div class="sidebar-case-meta">
										<Icon name="calendar" size={11} />
										<span>{formatShortDate(link.createdAt)}</span>
									</div>
									<div class="sidebar-case-pills">
										<span class="yorha-pill">{link.linkType?.replace(/_/g, ' ')}</span>
										{#if link.caseStatus}
											<span class="yorha-pill pill-green">{link.caseStatus}</span>
										{/if}
									</div>
								</a>
							{/each}
						</div>
						{#if data.caseLinks.length > 4}
							<button class="sidebar-see-all" onclick={() => activeTab = 'cases'}>
								See all {data.caseLinks.length} linked cases
								<Icon name="chevron-right" size={13} />
							</button>
						{/if}
					{:else}
						<p class="sidebar-empty">No similar cases found yet.</p>
					{/if}
				</div>

				<!-- Cases Quick Stats -->
				<div class="yorha-panel sidebar-card">
					<div class="sidebar-card-header">
						<h3 class="sidebar-card-title">
							<Icon name="folder" size={14} class="text-amber" /> Cases
						</h3>
					</div>
					<div class="sidebar-stats">
						<div class="sidebar-stat-row">
							<span class="stat-label-row"><Icon name="clock" size={12} /> Recent</span>
							<span class="stat-value-row">{data.caseLinks.length}</span>
						</div>
						<div class="sidebar-stat-row">
							<span class="stat-label-row"><Icon name="target" size={12} /> Relevant</span>
							<span class="stat-value-row">{data.precedents.length}</span>
						</div>
					</div>
				</div>

				<!-- Cited Sources -->
				<div class="yorha-panel sidebar-card">
					<h3 class="sidebar-card-title sidebar-card-title-mb">
						<Icon name="quote" size={14} class="text-amber" /> Cited Sources
					</h3>
					{#if aiCitedSources.length > 0}
						{#each aiCitedSources.slice(0, 3) as source}
							<div class="sidebar-source-row">
								<span class="sidebar-source-text">{source}</span>
							</div>
						{/each}
						<button class="sidebar-see-all" onclick={() => drawerOpen = true}>
							View all {aiCitedSources.length} sources
							<Icon name="chevron-right" size={13} />
						</button>
					{:else}
						<p class="sidebar-empty">AI-extracted sources appear after analysis.</p>
					{/if}
				</div>

				<!-- Glossary Terms -->
				<div class="yorha-panel sidebar-card">
					<h3 class="sidebar-card-title sidebar-card-title-mb">
						<Icon name="book-text" size={14} class="text-amber" /> Glossary
					</h3>
					{#if (data.glossaryTerms?.length ?? 0) > 0}
						{#each data.glossaryTerms.slice(0, 4) as term}
							<button
								class="sidebar-glossary-item"
								onclick={() => { selectedGlossaryTerm = term; activeTab = 'glossary'; }}
							>
								<strong class="sidebar-glossary-term">{term.term}</strong>
								<p class="sidebar-glossary-def">{term.definition?.slice(0, 80)}</p>
							</button>
						{/each}
						{#if data.glossaryTerms.length > 4}
							<button class="sidebar-see-all" onclick={() => activeTab = 'glossary'}>
								View all {data.glossaryTerms.length} terms
								<Icon name="chevron-right" size={13} />
							</button>
						{/if}
					{:else}
						<button class="yorha-btn-ghost sidebar-search-btn" onclick={() => activeTab = 'glossary'}>
							<Icon name="search" size={13} /> Search Glossary
						</button>
					{/if}
				</div>

				<!-- Related Statutes -->
				{#if (data.relatedStatutes?.length ?? 0) > 0}
					<div class="yorha-panel sidebar-card">
						<h3 class="sidebar-card-title sidebar-card-title-mb">
							<Icon name="git-branch" size={14} class="text-amber" /> Related Statutes
						</h3>
						{#each data.relatedStatutes.slice(0, 5) as rs}
							<a href="/legal-corpus/{rs.id}" class="sidebar-related-link">
								<span class="sidebar-related-section">{rs.section ? `§ ${rs.section}` : ''}</span>
								<span class="sidebar-related-title">{rs.title?.slice(0, 50)}</span>
							</a>
						{/each}
					</div>
				{/if}
			</aside>
		</div>
	</div>

	<!-- Cited Sources Overlay -->
	<CitedSourcesOverlay
		bind:isOpen={drawerOpen}
		citations={overlayCitations}
		definitions={overlayDefinitions}
	/>

	<!-- Citation Detail Modal -->
	<CitationViewModal
		citation={selectedCitation}
		bind:open={citationModalOpen}
		onClose={() => { citationModalOpen = false; }}
		onViewFull={(c) => { if (c.id) window.open(`/citations?id=${c.id}`, '_blank'); }}
	/>
	{/if}
{/if}

<style>
	/* ═══════════════════════════════════════════════════════════════════════
	   READER VIEW — Scoped CSS (bypasses UnoCSS extraction issues)
	   ═══════════════════════════════════════════════════════════════════════ */

	/* ── Page Container ── */
	.reader-page {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
		margin: -2.5rem;
		padding: 1rem max(1rem, calc(50% - 720px)) 2rem;
	}
	@media (min-width: 1024px) {
		.reader-page { padding: 1rem max(1.5rem, calc(50% - 720px)) 2rem; }
	}
	.reader-page :global(h1), .reader-page :global(h2), .reader-page :global(h3), .reader-page :global(h4), .reader-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.reader-page :global(a) { color: inherit; border-bottom: none; }
	.reader-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.reader-page :global(input), .reader-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.reader-page :global(.panel), .reader-page :global(.card), .reader-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Error State ── */
	.error-center {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
	}
	.error-card {
		text-align: center;
		max-width: 28rem;
	}
	.error-msg {
		color: rgba(74, 66, 56, 0.7);
		margin-bottom: 1rem;
	}
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* ── Floating View Toggle (Classic/Demo modes) ── */
	.floating-toggle {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 50;
		display: flex;
		gap: 0.375rem;
	}
	.floating-toggle-alt {
		background: #faf7f0;
		box-shadow: 0 4px 12px rgba(0,0,0,0.08);
		border: 1px solid rgba(42, 37, 32, 0.15);
	}

	/* ── Top Bar ── */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.top-links {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
	}
	.top-links a {
		color: rgba(42, 37, 32, 0.4);
		text-decoration: none;
		transition: color 0.15s;
	}
	.top-links a:hover { color: rgba(42, 37, 32, 0.7); }

	/* ── Search Bar ── */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
	}
	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.875rem;
		color: rgba(42, 37, 32, 0.8);
	}
	.search-input::placeholder { color: rgba(42, 37, 32, 0.3); }
	.search-icon { color: rgba(42, 37, 32, 0.25); }
	.search-actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}
	.search-action-btn {
		border: 1px solid rgba(42, 37, 32, 0.12);
	}

	/* ── Document Header ── */
	.doc-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.doc-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: #2a2520;
		line-height: 1.3;
		margin: 0;
	}
	.section-pill {
		margin-left: 0.5rem;
		color: #c4752b;
	}
	.jurisdiction-pill {
		margin-top: 0.375rem;
		display: inline-flex;
	}
	.doc-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-shrink: 0;
	}
	.view-toggle-group {
		display: flex;
		border: 1px solid rgba(42, 37, 32, 0.15);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	/* ── View Toggle Buttons ── */
	.view-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		background: transparent;
		border: none;
		border-right: 1px solid rgba(42, 37, 32, 0.1);
		font-size: 0.7rem;
		font-weight: 500;
		color: rgba(42, 37, 32, 0.45);
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}
	.view-toggle-btn:last-child { border-right: none; }
	.view-toggle-btn:hover { background: rgba(42, 37, 32, 0.04); color: rgba(42, 37, 32, 0.7); }
	.view-toggle-btn.active {
		background: rgba(196, 117, 43, 0.1);
		color: #c4752b;
		cursor: default;
	}
	.view-toggle-btn:disabled { cursor: default; }

	/* ── Metadata Bar ── */
	.metadata-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.625rem 1rem;
		margin-bottom: 0.75rem;
	}
	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.meta-value {
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.7);
	}
	.meta-value-amber { color: #c4752b; font-weight: 500; }
	.meta-value-mono { font-family: 'Fira Code', monospace; }
	.meta-value-green { color: #15803d; font-weight: 500; }
	.meta-value-yellow { color: #ca8a04; font-weight: 500; }
	.meta-value-muted { color: rgba(42, 37, 32, 0.5); font-weight: 500; }
	.meta-value-dim { color: rgba(42, 37, 32, 0.6); }
	.meta-divider {
		width: 1px;
		height: 1.25rem;
		background: rgba(42, 37, 32, 0.1);
		flex-shrink: 0;
	}
	.meta-badge {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 11px;
		color: rgba(196, 117, 43, 0.8);
		background: rgba(196, 117, 43, 0.08);
		border: 1px solid rgba(196, 117, 43, 0.15);
		border-radius: 0.25rem;
		padding: 0.125rem 0.5rem;
	}

	/* ── Tab Bar ── */
	.tab-bar {
		display: flex;
		border-bottom: 1px solid rgba(42, 37, 32, 0.1);
		margin-bottom: 1rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab-bar::-webkit-scrollbar { display: none; }
	.subtab-bar { margin-bottom: 1rem; }
	.tab-item {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 0.875rem;
		font-size: 0.8125rem;
		font-weight: 500;
		white-space: nowrap;
		border: none;
		background: none;
		border-bottom: 2px solid transparent;
		color: rgba(74, 66, 56, 0.5);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}
	.tab-item:hover { color: rgba(42, 37, 32, 0.8); }
	.tab-item-active {
		border-bottom-color: #c4752b;
		color: #c4752b;
	}
	.tab-count {
		font-size: 10px;
		padding: 0 0.375rem;
		border-radius: 0.25rem;
		background: rgba(196, 117, 43, 0.15);
		color: #c4752b;
		font-weight: 600;
	}

	/* ── 3-Column Grid ── */
	.corpus-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
		align-items: start;
	}
	@media (min-width: 1024px) {
		.corpus-grid {
			grid-template-columns: 240px 1fr 280px;
		}
	}

	/* ── Left Sidebar ── */
	.corpus-left {
		display: none;
	}
	@media (min-width: 1024px) {
		.corpus-left {
			display: block;
			position: sticky;
			top: 1rem;
			max-height: calc(100vh - 2rem);
			overflow-y: auto;
			padding: 0.25rem 0.5rem 0.25rem 0;
		}
	}

	/* ── Center Content ── */
	.corpus-center {
		min-width: 0;
	}

	/* ── Right Sidebar ── */
	.corpus-right {
		display: none;
	}
	@media (min-width: 1024px) {
		.corpus-right {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			position: sticky;
			top: 1rem;
			max-height: calc(100vh - 2rem);
			overflow-y: auto;
		}
	}

	/* ── Section Headings ── */
	.section-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(42, 37, 32, 0.85);
		margin: 0 0 0.75rem 0;
	}
	.content-section { margin-bottom: 1rem; }

	/* ── Skeleton Loading ── */
	.skeleton-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.skeleton-line {
		height: 0.75rem;
		background: rgba(42, 37, 32, 0.06);
		border-radius: 0.25rem;
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
	.w-60p { width: 60%; }
	.w-50p { width: 50%; }
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	/* ── Empty States ── */
	.empty-state {
		text-align: center;
		padding: 2rem 0;
		color: rgba(74, 66, 56, 0.4);
	}
	.empty-state p {
		font-size: 0.875rem;
		max-width: 20rem;
		margin: 0.5rem auto 0;
	}
	.empty-hint {
		font-size: 0.875rem;
		color: rgba(74, 66, 56, 0.4);
		font-style: italic;
	}
	.mb-hint { margin-bottom: 0.75rem; }
	.mt-hint { margin-top: 0.75rem; }

	/* ── Provisions Grid ── */
	.provisions-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}
	@media (min-width: 768px) {
		.provisions-grid { grid-template-columns: 1fr 1fr; }
	}
	.provision-card {
		padding: 1rem;
		transition: border-color 0.15s;
	}
	.provision-card:hover { border-color: rgba(196, 117, 43, 0.3); }
	.provision-icon {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(196, 117, 43, 0.1);
		border-radius: 0.5rem;
		color: #c4752b;
		margin-bottom: 0.5rem;
	}
	.provision-icon-muted {
		background: rgba(42, 37, 32, 0.05);
		color: rgba(74, 66, 56, 0.7);
	}
	.provision-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(42, 37, 32, 0.9);
		margin: 0 0 0.25rem 0;
	}
	.provision-desc {
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.65);
		line-height: 1.6;
		margin: 0;
	}
	.more-link {
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.4);
		font-style: italic;
		margin-top: 0.5rem;
	}
	.text-link {
		color: #c4752b;
		text-decoration: underline;
		background: none;
		border: none;
		cursor: pointer;
		font-size: inherit;
	}

	/* ── Implications Grid ── */
	.implications-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}
	@media (min-width: 640px) {
		.implications-grid { grid-template-columns: 1fr 1fr; }
	}
	@media (min-width: 1024px) {
		.implications-grid { grid-template-columns: 1fr 1fr 1fr; }
	}
	.implication-card {
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid;
	}
	.imp-high { background: #fef2f2; border-color: #fecaca; color: #7f1d1d; }
	.imp-medium { background: #fefce8; border-color: #fde68a; color: #78350f; }
	.imp-low { background: #f0fdf4; border-color: #bbf7d0; color: #14532d; }
	.imp-title { font-size: 0.875rem; font-weight: 600; margin: 0 0 0.25rem 0; }
	.imp-desc { font-size: 0.75rem; line-height: 1.6; margin: 0; opacity: 0.75; }
	.imp-severity { margin-top: 0.5rem; display: inline-block; }

	/* ── Official Text ── */
	.official-text-reader {
		max-height: 70vh;
		overflow-y: auto;
		white-space: pre-wrap;
		font-size: 15px;
	}
	.chunk-row {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.05);
	}
	.chunk-idx {
		flex-shrink: 0;
		color: #c4752b;
		font-family: monospace;
		font-weight: 600;
		font-size: 0.875rem;
	}
	.chunk-text {
		font-size: 0.875rem;
		color: rgba(42, 37, 32, 0.7);
		line-height: 1.6;
		font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
		margin: 0;
	}

	/* ── Cases ── */
	.case-row {
		padding: 0.75rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.05);
	}
	.case-row-btn {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		cursor: pointer;
		border-radius: 0.25rem;
		transition: background 0.15s;
		padding: 0.75rem 0.5rem;
		margin: 0 -0.5rem;
	}
	.case-row-btn:hover { background: rgba(196, 117, 43, 0.06); }
	.case-row-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.case-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #c4752b;
		text-decoration: none;
	}
	.case-link:hover { text-decoration: underline; }
	.pill-purple {
		background: #f3e8ff;
		color: #6b21a8;
		border-color: #e9d5ff;
	}
	.pill-green {
		background: #dcfce7;
		color: #15803d;
		border-color: #bbf7d0;
	}
	.pill-amber {
		background: rgba(196, 117, 43, 0.1);
		color: #c4752b;
		border-color: rgba(196, 117, 43, 0.2);
	}
	.case-notes {
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.5);
		margin: 0.25rem 0 0;
	}
	.case-date {
		font-size: 10px;
		color: rgba(74, 66, 56, 0.3);
		font-family: monospace;
	}
	.precedent-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(42, 37, 32, 0.85);
		margin: 0;
	}
	.precedent-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.4);
		margin: 0.125rem 0 0.25rem;
	}
	.meta-court { color: rgba(74, 66, 56, 0.55); }
	.meta-citation { font-family: monospace; color: #c4752b; }
	.precedent-summary {
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.6);
		line-height: 1.6;
		margin: 0;
	}

	/* ── Info Boxes ── */
	.info-stack {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.info-box {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(42, 37, 32, 0.03);
		border: 1px solid rgba(42, 37, 32, 0.08);
		border-radius: 0.5rem;
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.6);
	}
	.info-box-amber {
		background: rgba(196, 117, 43, 0.05);
		border-color: rgba(196, 117, 43, 0.12);
		margin-top: 0.5rem;
	}
	.info-icon {
		flex-shrink: 0;
		color: #c4752b;
		margin-top: 0.125rem;
	}
	.info-strong { color: rgba(42, 37, 32, 0.8); }

	/* ── Glossary ── */
	.selected-term-pills {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.term-pill-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: white;
		border-radius: 9999px;
		border: 1px solid rgba(42, 37, 32, 0.15);
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.7);
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.term-pill-btn:hover { border-color: rgba(196, 117, 43, 0.3); }
	.pill-x { color: rgba(42, 37, 32, 0.3); }
	.pill-action {
		color: rgba(42, 37, 32, 0.2);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.pill-action:hover { color: rgba(42, 37, 32, 0.5); }
	.term-detail-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.term-detail-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #2a2520;
		margin: 0.125rem 0 0;
	}
	.term-detail-date {
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.3);
		font-family: monospace;
	}
	.term-pills-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.term-source-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.4);
		margin-bottom: 1rem;
	}
	.source-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.term-reader { font-size: 15px; }
	.related-terms-section {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(42, 37, 32, 0.08);
	}
	.related-terms-list {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.375rem;
		flex-wrap: wrap;
	}
	.glossary-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0;
		padding-left: 0.75rem;
	}
	.search-icon-sm { color: rgba(74, 66, 56, 0.4); }
	.glossary-search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		padding: 0.5rem 0;
		font-size: 0.875rem;
		color: rgba(42, 37, 32, 0.8);
	}
	.glossary-search-input::placeholder { color: rgba(42, 37, 32, 0.3); }
	.glossary-search-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-family: monospace;
		color: #c4752b;
		background: rgba(196, 117, 43, 0.1);
		border: none;
		border-left: 1px solid rgba(42, 37, 32, 0.1);
		cursor: pointer;
		transition: background 0.15s;
	}
	.glossary-search-btn:hover { background: rgba(196, 117, 43, 0.2); }
	.list-heading { margin-bottom: 0.5rem; }
	.term-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	/* ── Timeline ── */
	.timeline { padding-left: 1rem; }
	.timeline-item {
		display: flex;
		gap: 0.75rem;
		padding-bottom: 1.25rem;
		position: relative;
	}
	.timeline-item-last { padding-bottom: 1.25rem; }
	.timeline-line {
		position: absolute;
		left: 4px;
		top: 14px;
		bottom: 0;
		width: 1px;
		background: rgba(42, 37, 32, 0.1);
	}
	.timeline-dot {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 9999px;
		flex-shrink: 0;
		margin-top: 0.25rem;
	}
	.timeline-dot-green { background: #22c55e; }
	.timeline-dot-gray { background: rgba(42, 37, 32, 0.25); }
	.timeline-date {
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.4);
		font-family: monospace;
	}
	.timeline-desc {
		font-size: 0.875rem;
		color: rgba(42, 37, 32, 0.7);
		margin: 0.125rem 0 0;
	}

	/* ── Citations ── */
	.cite-box {
		background: rgba(42, 37, 32, 0.03);
		border: 1px solid rgba(42, 37, 32, 0.1);
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}
	.cite-label {
		margin-bottom: 0.25rem;
		display: block;
	}
	.cite-text {
		font-size: 0.875rem;
		font-family: monospace;
		color: rgba(42, 37, 32, 0.85);
	}
	.source-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.source-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.05);
	}
	.source-num {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 9999px;
		background: rgba(196, 117, 43, 0.15);
		color: #c4752b;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}
	.source-text {
		font-size: 0.875rem;
		color: rgba(42, 37, 32, 0.7);
	}

	/* ── Right Sidebar Cards ── */
	.sidebar-card { padding: 1rem; }
	.sidebar-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.sidebar-card-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(42, 37, 32, 0.75);
		margin: 0;
	}
	.sidebar-card-title-mb { margin-bottom: 0.5rem; }
	.sidebar-more-btn {
		color: rgba(42, 37, 32, 0.25);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.sidebar-more-btn:hover { color: rgba(42, 37, 32, 0.5); }
	.sidebar-card-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.sidebar-case-card {
		padding: 0.75rem;
		background: #faf7f0;
		border-radius: 0.5rem;
		border: 1px solid rgba(42, 37, 32, 0.08);
		transition: border-color 0.15s;
	}
	.sidebar-case-card:hover { border-color: rgba(196, 117, 43, 0.25); }
	.sidebar-case-btn {
		display: block;
		width: 100%;
		text-align: left;
		cursor: pointer;
	}
	.sidebar-case-link {
		display: block;
		text-decoration: none;
	}
	.sidebar-case-title {
		font-size: 13px;
		font-weight: 600;
		color: rgba(42, 37, 32, 0.85);
		line-height: 1.4;
		margin: 0 0 0.375rem 0;
	}
	.sidebar-case-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 11px;
		color: rgba(42, 37, 32, 0.4);
		margin-bottom: 0.25rem;
	}
	.sidebar-case-pills {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.sidebar-citation {
		font-size: 10px;
		font-family: monospace;
		color: rgba(196, 117, 43, 0.7);
	}
	.sidebar-see-all {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		justify-content: center;
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: #c4752b;
		font-weight: 500;
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.sidebar-see-all:hover { color: #d4934b; }
	.sidebar-empty {
		font-size: 0.75rem;
		color: rgba(74, 66, 56, 0.3);
		font-style: italic;
		margin: 0;
	}

	/* ── Sidebar Stats ── */
	.sidebar-stats {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.sidebar-stat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.55);
		border-radius: 0.25rem;
		transition: background 0.15s;
	}
	.sidebar-stat-row:hover { background: rgba(42, 37, 32, 0.03); }
	.stat-label-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.stat-value-row {
		font-size: 10px;
		font-family: monospace;
		color: rgba(42, 37, 32, 0.3);
	}

	/* ── Sidebar Sources ── */
	.sidebar-source-row {
		padding: 0.375rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.05);
	}
	.sidebar-source-row:last-child { border-bottom: none; }
	.sidebar-source-text {
		font-size: 11px;
		color: rgba(42, 37, 32, 0.55);
		line-height: 1.6;
	}

	/* ── Sidebar Glossary ── */
	.sidebar-glossary-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.375rem 0.25rem;
		border-bottom: 1px solid rgba(42, 37, 32, 0.05);
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		cursor: pointer;
		border-radius: 0.25rem;
		margin: 0 -0.25rem;
		transition: background 0.15s;
	}
	.sidebar-glossary-item:last-child { border-bottom: none; }
	.sidebar-glossary-item:hover { background: rgba(42, 37, 32, 0.03); }
	.sidebar-glossary-term {
		font-size: 0.75rem;
		color: #c4752b;
	}
	.sidebar-glossary-def {
		font-size: 10px;
		color: rgba(74, 66, 56, 0.45);
		margin: 0.125rem 0 0;
		line-height: 1.6;
	}
	.sidebar-search-btn {
		width: 100%;
		justify-content: center;
	}

	/* ── Sidebar Related Statutes ── */
	.sidebar-related-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.25rem;
		border-bottom: 1px solid rgba(42, 37, 32, 0.03);
		text-decoration: none;
		border-radius: 0.25rem;
		margin: 0 -0.25rem;
		transition: background 0.15s;
	}
	.sidebar-related-link:last-child { border-bottom: none; }
	.sidebar-related-link:hover { background: rgba(42, 37, 32, 0.03); }
	.sidebar-related-section {
		font-size: 10px;
		font-family: monospace;
		color: #c4752b;
		flex-shrink: 0;
	}
	.sidebar-related-title {
		font-size: 11px;
		color: rgba(74, 66, 56, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Error inline ── */
	.error-inline {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		color: #ef4444;
		margin: 0;
	}
</style>