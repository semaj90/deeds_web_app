<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ExecutiveSummary from '$lib/components/legal/ExecutiveSummary.svelte';
	import KeyProvisions from '$lib/components/legal/KeyProvisions.svelte';
	import LegalImplications from '$lib/components/legal/LegalImplications.svelte';
	import TocTree from '$lib/components/legal/TocTree.svelte';
	import OfficialTextPane from '$lib/components/legal/OfficialTextPane.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	type Tab = 'summary' | 'text' | 'cases' | 'regulations' | 'history' | 'citations';
	let activeTab = $state<Tab>('summary');

	let searchQ = $state('');
	let searchResults = $state<Array<Record<string, unknown>>>([]);
	let searching = $state(false);

	const CORPUS_LABELS: Record<string, string> = {
		constitution: 'Constitution',
		statute: 'Statute',
		regulation: 'Regulation',
		bill: 'Bill',
		case: 'Case Law',
		glossary: 'Glossary',
		other: 'Other',
	};

	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel?: string | null;
		nodePath: string;
		depth: number;
		children?: TocNode[];
	}

	const tocTree = $derived.by(() => {
		const nodes: TocNode[] = (data.toc ?? []).map((n: Record<string, unknown>) => ({
			id: n.id as string,
			parentId: n.parent_id as string | null,
			nodeType: n.node_type as string,
			heading: n.heading as string,
			citationLabel: n.citation_label as string | null,
			nodePath: n.node_path as string,
			depth: n.depth as number,
			children: [],
		}));

		const map = new Map(nodes.map((n) => [n.id, n]));
		const roots: TocNode[] = [];
		for (const n of nodes) {
			if (n.parentId && map.has(n.parentId)) {
				map.get(n.parentId)!.children!.push(n);
			} else {
				roots.push(n);
			}
		}
		return roots;
	});

	const citationRefs = $derived((data.citationRefs ?? []) as Array<{ label: string; type: string }>);
	const caseCitationCount = $derived(citationRefs.filter((c: { type: string }) => c.type === 'case').length);

	async function runSearch() {
		if (!searchQ.trim()) return;
		searching = true;
		try {
			const res = await fetch('/api/library/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQ, limit: 10 }),
			});
			if (res.ok) {
				const d = await res.json();
				searchResults = d.results ?? [];
			}
		} catch { /* non-fatal */ }
		finally { searching = false; }
	}
</script>

<svelte:head>
	<title>{data.node.heading} — {data.document.title}</title>
</svelte:head>

<div class="legal-dashboard-root">
	<!-- Top Navigation / Breadcrumbs -->
	<header class="dashboard-navbar">
		<nav class="breadcrumb-nav">
			<a href="/library" class="crumb">Legal Library</a>
			<span class="sep">/</span>
			{#if data.document.jurisdiction}
				<span class="crumb jurisdiction">{data.document.jurisdiction.code.toUpperCase()}</span>
				<span class="sep">/</span>
			{/if}
			<a href="/library/{data.document.id}" class="crumb">{data.document.title}</a>
			{#each data.breadcrumbs ?? [] as bc}
				<span class="sep">/</span>
				<a href="/library/{data.document.id}/node/{bc.id}" class="crumb">{bc.heading}</a>
			{/each}
			<span class="sep">/</span>
			<span class="current">{data.node.citationLabel || data.node.heading}</span>
		</nav>

		<div class="header-actions">
			{#if data.navigation.prev}
				<a href="/library/{data.document.id}/node/{data.navigation.prev.id}" class="action-btn">
					<Icon name="chevron-left" size={14} />
					<span>Prev</span>
				</a>
			{/if}
			{#if data.navigation.next}
				<a href="/library/{data.document.id}/node/{data.navigation.next.id}" class="action-btn">
					<span>Next</span>
					<Icon name="chevron-right" size={14} />
				</a>
			{/if}
			<button class="action-btn highlight">
				<Icon name="download" size={14} />
				<span>Export</span>
			</button>
		</div>
	</header>

	<!-- Main 3-column Dashboard Layout -->
	<div class="dashboard-container">
		<!-- Left Rail: TOC -->
		<aside class="dashboard-toc">
			<div class="toc-header">
				<Icon name="list-tree" size={14} class="text-sand/40" />
				<span>Contents</span>
			</div>
			<div class="toc-scroll">
				{#if tocTree.length > 0}
					<TocTree
						nodes={tocTree}
						selectedId={data.node.id}
						onSelect={(id) => goto(`/library/${data.document.id}/node/${id}`)}
					/>
				{:else}
					<p class="toc-empty">No sections available</p>
				{/if}
			</div>
		</aside>

		<!-- Central Content Feed -->
		<main class="dashboard-main">
			<div class="main-header">
				<div class="title-section">
					<div class="badge-row">
						<span class="type-badge">{CORPUS_LABELS[data.document.corpusType] || 'Statute'}</span>
						{#if data.document.jurisdiction}
							<span class="jurisdiction-badge">{data.document.jurisdiction.name}</span>
						{/if}
					</div>
					<h1 class="node-title">{data.node.citationLabel || data.node.heading}</h1>
					<div class="meta-row">
						<span>Effective: {data.document.effectiveDate ? new Date(data.document.effectiveDate).toLocaleDateString() : 'Active'}</span>
						{#if data.document.pageCount}
							<span class="dot"></span>
							<span>{data.document.pageCount} pages</span>
						{/if}
						{#if data.document.wordCount}
							<span class="dot"></span>
							<span>{data.document.wordCount.toLocaleString()} words</span>
						{/if}
					</div>
				</div>

				<div class="search-within">
					<div class="search-box">
						<Icon name="search" size={14} />
						<input
							type="text"
							placeholder="Search this section..."
							bind:value={searchQ}
							onkeydown={(e) => e.key === 'Enter' && runSearch()}
						/>
					</div>
				</div>
			</div>

			<!-- Tab Navigation -->
			<nav class="dashboard-tabs">
				<button class="tab" class:active={activeTab === 'summary'} onclick={() => activeTab = 'summary'}>
					Summary
				</button>
				<button class="tab" class:active={activeTab === 'text'} onclick={() => activeTab = 'text'}>
					Official Text
				</button>
				<button class="tab" class:active={activeTab === 'cases'} onclick={() => activeTab = 'cases'}>
					Cases ({caseCitationCount})
				</button>
				<button class="tab" class:active={activeTab === 'regulations'} onclick={() => activeTab = 'regulations'}>
					Regulations
				</button>
				<button class="tab" class:active={activeTab === 'history'} onclick={() => activeTab = 'history'}>
					History
				</button>
				<button class="tab" class:active={activeTab === 'citations'} onclick={() => activeTab = 'citations'}>
					Citations ({citationRefs.length})
				</button>
			</nav>

			<!-- Tab Content -->
			<div class="dashboard-content">
				{#if activeTab === 'summary'}
					<section class="content-block">
						<ExecutiveSummary
							node={data.node}
							document={data.document}
						/>
					</section>

					{#if data.children.length > 0}
						<section class="content-block mt-8">
							<KeyProvisions
								provisions={data.children}
								documentId={data.document.id}
							/>
						</section>
					{/if}

				{:else if activeTab === 'text'}
					<section class="content-block">
						{#if data.chunks && data.chunks.length > 0}
							<OfficialTextPane
								documentId={data.document.id}
								nodeId={data.node.id}
								initialChunks={data.chunks}
								onCitationClick={() => {}}
							/>
						{:else if data.node.fullText}
							<div class="official-text-fallback">
								<p>{data.node.fullText}</p>
							</div>
						{:else}
							<div class="empty-tab">
								<Icon name="file-text" size={32} class="text-sand/15" />
								<p>No text content available for this section.</p>
							</div>
						{/if}
					</section>

				{:else if activeTab === 'citations'}
					<section class="content-block">
						{#if citationRefs.length > 0}
							<div class="citations-grid">
								{#each citationRefs as ref}
									<div class="citation-card">
										<div class="citation-meta">
											<span class="citation-type-tag">{ref.type}</span>
										</div>
										<span class="citation-label">{ref.label}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="empty-tab">
								<Icon name="scroll-text" size={32} class="text-sand/15" />
								<p>No cross-references detected in this section.</p>
							</div>
						{/if}

						{#if data.definitions.length > 0}
							<div class="definitions-section">
								<h3 class="definitions-header">Defined Terms</h3>
								{#each data.definitions as def}
									<div class="definition-card">
										<span class="def-term">{def.term}</span>
										<p class="def-text">{def.definition_text}</p>
									</div>
								{/each}
							</div>
						{/if}
					</section>

				{:else if activeTab === 'cases'}
					<section class="content-block">
						{#if citationRefs.filter((c) => c.type === 'case').length > 0}
							<div class="citations-grid">
								{#each citationRefs.filter((c) => c.type === 'case') as ref}
									<div class="citation-card case-card">
										<div class="citation-meta">
											<span class="citation-type-tag">Case Law</span>
										</div>
										<span class="citation-label">{ref.label}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="empty-tab">
								<Icon name="gavel" size={32} class="text-sand/15" />
								<p>No case law references detected in this section.</p>
								<p class="empty-hint">Case references will appear here as the corpus grows.</p>
							</div>
						{/if}
					</section>

				{:else}
					<section class="content-block">
						<div class="empty-tab">
							<Icon name="construction" size={32} class="text-sand/15" />
							<p>This tab is under development.</p>
							<p class="empty-hint">Content will be populated as more legal data is indexed.</p>
						</div>
					</section>
				{/if}

				{#if searchResults.length > 0}
					<section class="content-block mt-6">
						<h3 class="search-results-header">Search Results</h3>
						<div class="search-results-list">
							{#each searchResults as hit}
								<div class="search-hit">
									<p class="hit-title">{hit.document_title}</p>
									{#if hit.node_heading}
										<p class="hit-heading">{hit.node_heading}</p>
									{/if}
									<p class="hit-snippet">{hit.snippet}</p>
									<span class="hit-score">{Math.round(((hit.score as number) ?? 0) * 100)}%</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		</main>

		<!-- Right Rail: Cited Sources + Implications -->
		<aside class="dashboard-sidebar">
			<section class="sidebar-block">
				<div class="cited-sources-card">
					<div class="card-header-row">
						<Icon name="scroll-text" size={16} class="text-accent" />
						<h4>Cited Sources</h4>
						<span class="count-badge">{citationRefs.length}</span>
					</div>
					{#if citationRefs.length > 0}
						<div class="cited-list">
							{#each citationRefs.slice(0, 8) as ref}
								<div class="cited-item">
									<span class="cited-type">{ref.type}</span>
									<span class="cited-label">{ref.label}</span>
								</div>
							{/each}
							{#if citationRefs.length > 8}
								<button class="show-all-btn" onclick={() => activeTab = 'citations'}>
									View all {citationRefs.length} citations →
								</button>
							{/if}
						</div>
					{:else}
						<p class="sidebar-empty">No cross-references detected.</p>
					{/if}
				</div>
			</section>

			<section class="sidebar-block">
				<div class="precedents-list-card">
					<div class="card-header-row">
						<Icon name="gavel" size={16} class="text-accent" />
						<h4>Legal Precedents</h4>
					</div>
					{#if citationRefs.filter((c) => c.type === 'case').length > 0}
						<div class="precedent-items">
							{#each citationRefs.filter((c) => c.type === 'case').slice(0, 4) as ref}
								<div class="precedent-teaser">
									<span class="teaser-title">{ref.label}</span>
									<p>Referenced in this section of the {CORPUS_LABELS[data.document.corpusType] || 'document'}.</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="sidebar-empty">No case law precedents linked to this section.</p>
					{/if}
				</div>
			</section>

			<section class="sidebar-block">
				<LegalImplications node={data.node} implications={data.implications ?? []} />
			</section>
		</aside>
	</div>
</div>

<style>
	.legal-dashboard-root {
		background: #0a0b10;
		color: #e0e0e0;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Inter', sans-serif;
	}

	.dashboard-navbar {
		height: 48px;
		padding: 0 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #0d0e14;
		flex-shrink: 0;
	}

	.breadcrumb-nav {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		overflow: hidden;
		white-space: nowrap;
	}

	.crumb { color: #60a5fa; text-decoration: none; }
	.crumb:hover { text-decoration: underline; }
	.crumb.jurisdiction { color: #4ade80; font-weight: 600; }
	.sep { color: rgba(255, 255, 255, 0.2); }
	.current { color: rgba(255, 255, 255, 0.5); }

	.header-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.7rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #e0e0e0;
		font-size: 0.75rem;
		cursor: pointer;
		text-decoration: none;
		transition: background 0.15s;
	}

	.action-btn:hover { background: rgba(255, 255, 255, 0.08); }
	.action-btn.highlight { background: #ef4444; border-color: #ef4444; color: white; }

	.dashboard-container {
		display: grid;
		grid-template-columns: 220px 1fr 300px;
		flex: 1;
		overflow: hidden;
	}

	.dashboard-toc {
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		background: #0d0e14;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.toc-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.4);
	}

	.toc-scroll { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
	.toc-empty { padding: 1rem; font-size: 0.75rem; color: rgba(255, 255, 255, 0.2); }

	.dashboard-main {
		overflow-y: auto;
		padding: 1.5rem 2rem;
		border-right: 1px solid rgba(255, 255, 255, 0.05);
	}

	.main-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.badge-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }

	.type-badge {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
	}

	.jurisdiction-badge {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		background: rgba(74, 222, 128, 0.12);
		color: #4ade80;
	}

	.node-title {
		font-size: 1.75rem;
		font-weight: 800;
		margin: 0;
		color: #e0e0e0;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		margin-top: 0.5rem;
	}

	.dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); }

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.8rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 99px;
		width: 200px;
	}

	.search-box input {
		background: transparent;
		border: none;
		color: #e0e0e0;
		font-size: 0.75rem;
		width: 100%;
	}

	.search-box input:focus { outline: none; }

	.dashboard-tabs {
		display: flex;
		gap: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 1.5rem;
	}

	.tab {
		padding: 0.6rem 0;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover { color: #e0e0e0; }
	.tab.active { color: #60a5fa; border-bottom-color: #60a5fa; }

	.content-block { margin-bottom: 1rem; }
	.mt-8 { margin-top: 2rem; }
	.mt-6 { margin-top: 1.5rem; }

	.official-text-fallback {
		font-size: 0.875rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.8);
		white-space: pre-wrap;
		max-width: 720px;
	}

	.empty-tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.875rem;
	}

	.empty-hint { font-size: 0.75rem; color: rgba(255, 255, 255, 0.2); margin-top: 0.25rem; }

	.citations-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; }

	.citation-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.citation-card.case-card { border-color: rgba(96, 165, 250, 0.15); }

	.citation-type-tag {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.35);
	}

	.citation-label { font-size: 0.8125rem; font-weight: 600; color: #60a5fa; }

	.definitions-section { margin-top: 2rem; }

	.definitions-header {
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 1rem;
	}

	.definition-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		margin-bottom: 0.5rem;
	}

	.def-term { font-weight: 700; color: #4ade80; font-size: 0.8125rem; }
	.def-text { font-size: 0.75rem; color: rgba(255, 255, 255, 0.6); line-height: 1.5; margin: 0.25rem 0 0; }

	.search-results-header {
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 0.75rem;
	}

	.search-hit {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		margin-bottom: 0.5rem;
		position: relative;
	}

	.hit-title { font-size: 0.8125rem; font-weight: 600; color: #e0e0e0; margin: 0; }
	.hit-heading { font-size: 0.6875rem; color: rgba(255, 255, 255, 0.4); margin: 0.15rem 0 0; }
	.hit-snippet { font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); line-height: 1.5; margin: 0.35rem 0 0; }
	.hit-score { position: absolute; top: 0.75rem; right: 1rem; font-size: 0.625rem; color: rgba(255, 255, 255, 0.3); }

	.dashboard-sidebar {
		padding: 1.25rem 1rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.cited-sources-card, .precedents-list-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		padding: 1rem;
	}

	.card-header-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.card-header-row h4 {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #e0e0e0;
		flex: 1;
	}

	.count-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		padding: 0.1rem 0.4rem;
		border-radius: 99px;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		font-family: monospace;
	}

	.cited-list { display: flex; flex-direction: column; gap: 0.5rem; }

	.cited-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.cited-item:last-child { border-bottom: none; }
	.cited-type { font-size: 0.5rem; font-weight: 700; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); min-width: 40px; }
	.cited-label { font-size: 0.75rem; color: #60a5fa; font-weight: 500; }

	.show-all-btn {
		background: transparent;
		border: none;
		color: #60a5fa;
		font-size: 0.6875rem;
		cursor: pointer;
		padding: 0.25rem 0;
		text-align: left;
	}

	.show-all-btn:hover { text-decoration: underline; }
	.sidebar-empty { font-size: 0.75rem; color: rgba(255, 255, 255, 0.2); font-style: italic; }

	.precedent-items { display: flex; flex-direction: column; gap: 0.75rem; }
	.precedent-teaser .teaser-title { display: block; font-size: 0.75rem; font-weight: 600; color: #60a5fa; margin-bottom: 0.15rem; }
	.precedent-teaser p { font-size: 0.6875rem; line-height: 1.4; color: rgba(255, 255, 255, 0.4); margin: 0; }
</style>
