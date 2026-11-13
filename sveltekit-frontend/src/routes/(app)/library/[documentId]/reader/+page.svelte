<script lang="ts">
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import TocTree from '$lib/components/legal/TocTree.svelte';
	import OfficialTextPane from '$lib/components/legal/OfficialTextPane.svelte';
	import CitationDrawer from '$lib/components/legal/CitationDrawer.svelte';

	let { data }: { data: PageData } = $props();

	type Tab = 'text' | 'pdf' | 'image' | 'summary' | 'search';
	let pdfPreviewDialog = $state<HTMLDialogElement>();
	let pdfPreviewUrl = $state<string | null>(null);

	const isPdf = (mimeType: string | null | undefined) =>
		String(mimeType ?? '').split(';', 1)[0].trim().toLowerCase() === 'application/pdf';
	const isRasterImage = (mimeType: string | null | undefined) =>
		['image/jpeg', 'image/png', 'image/webp'].includes(String(mimeType ?? '').split(';', 1)[0].trim().toLowerCase());
	const visibleTabs = $derived([
		{ id: 'text' as const, label: 'Official Text' },
		...(isPdf(data.document?.mimeType) ? [{ id: 'pdf' as const, label: 'Preview PDF' }] : []),
		...(isRasterImage(data.document?.mimeType) ? [{ id: 'image' as const, label: 'Preview image' }] : []),
		{ id: 'search' as const, label: 'Search' },
		{ id: 'summary' as const, label: 'Summary' },
	]);

	function openPdfPreview(documentId: string) {
		pdfPreviewDialog?.showModal();
		pdfPreviewUrl ??= `/api/library/documents/${documentId}/pdf`;
	}

	let activeTab = $state<Tab>('text');
	let selectedNodeId = $state<string | null>(untrack(() => data.selectedNodeId ?? null));
	let drawerOpen = $state(false);
	let activeCitation = $state<string | null>(null);

	// Search
	let searchQ = $state('');
	let searchResults = $state<Array<Record<string, unknown>>>([]);
	let searching = $state(false);
	let hasSearched = $state(false);
	let searchError = $state<string | null>(null);
	let suggestions = $state<string[]>([]);
	let suggestTimer: ReturnType<typeof setTimeout> | null = null;

	async function fetchSuggestions(q: string) {
		if (q.trim().length < 2) { suggestions = []; return; }
		try {
			const res = await fetch(`/api/library/suggestions?q=${encodeURIComponent(q.trim())}`, { signal: AbortSignal.timeout(15_000) });
			if (res.ok) {
				const d = await res.json() as { suggestions: Array<{ suggestion: string }> };
				suggestions = (d.suggestions ?? []).map((s) => s.suggestion).slice(0, 8);
			}
		} catch { /* non-fatal */ }
	}

	function onSearchInput() {
		if (suggestTimer) clearTimeout(suggestTimer);
		suggestTimer = setTimeout(() => fetchSuggestions(searchQ), 250);
	}

	// Build flat toc into nested tree
	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel?: string | null;
		nodePath: string;
		depth: number;
		pageStart?: number | null;
		pageEnd?: number | null;
		children?: TocNode[];
	}

	const tocTree = $derived.by(() => {
		const nodes: TocNode[] = data.toc.map((n: Record<string, unknown>) => ({
			id: n.id as string,
			parentId: (n.parent_id as string | null),
			nodeType: n.node_type as string,
			heading: n.heading as string,
			citationLabel: n.citation_label as string | null,
			nodePath: n.node_path as string,
			depth: n.depth as number,
			pageStart: n.page_start as number | null,
			pageEnd: n.page_end as number | null,
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

	function openCitationDrawer(citation: string) {
		activeCitation = citation;
		drawerOpen = true;
	}

	async function runSearch() {
		if (!searchQ.trim() || !data.document) return;
		searching = true;
		hasSearched = true;
		searchError = null;
		try {
			const res = await fetch('/api/library/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQ, documentId: data.document.id, limit: 10 }),
				signal: AbortSignal.timeout(30_000)
			});
			if (!res.ok) throw new Error('Search failed');
			const d = await res.json();
			searchResults = d.results ?? [];
		} catch (e) {
			searchError = e instanceof Error ? e.message : 'Search failed';
		} finally {
			searching = false;
		}
	}

	const CORPUS_LABELS: Record<string, string> = {
		constitution: 'Constitution',
		statute: 'Statute',
		regulation: 'Regulation',
		case: 'Case Law',
		treatise: 'Treatise',
		other: 'Other',
	};
</script>

<svelte:head>
	<title>{data.document?.title ?? 'Reader'} — Legal Library</title>
</svelte:head>

{#if data.loadError}
	<div class="lr-error">{data.loadError}</div>
{:else if data.document}
	{@const doc = data.document}
	<div class="lr-page">
		<!-- Top bar -->
		<header class="lr-topbar">
			<a href="/library/{doc.id}" class="lr-topbar-back">&larr;</a>
			<span class="lr-topbar-divider">|</span>
			<span class="lr-topbar-title">{doc.title}</span>
			{#if doc.citation}
				<span class="lr-topbar-citation">{doc.citation}</span>
			{/if}
			{#if doc.jurisdiction}
				<span class="lr-topbar-jurisdiction">{doc.jurisdiction.code.toUpperCase()}</span>
			{/if}
			{#if doc.officialUrl}
				<a
					href={doc.officialUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="lr-topbar-official"
				>
					Official
				</a>
			{/if}
		</header>

		<div class="lr-body">
			<!-- Left rail: TOC -->
			<aside class="lr-toc-sidebar">
				<div class="lr-toc-header">
					<span class="lr-toc-label">Contents</span>
				</div>
				<div class="lr-toc-scroll">
					{#if tocTree.length === 0}
						<p class="lr-toc-empty">No sections available</p>
					{:else}
						<TocTree
							nodes={tocTree}
							bind:selectedId={selectedNodeId}
							onSelect={(id) => { selectedNodeId = id; activeTab = 'text'; }}
						/>
					{/if}
				</div>
			</aside>

			<!-- Main: tabs + content -->
			<main class="lr-main">
				<!-- Tab bar -->
				<div class="lr-tab-bar">
					{#each visibleTabs as { id: tab, label }}
						<button
							onclick={() => {
								if (tab === 'pdf') {
									openPdfPreview(doc.id);
									return;
								}
								activeTab = tab;
							}}
							class="lr-tab"
							class:active={activeTab === tab}
						>
							{label}
						</button>
					{/each}
				</div>

				<!-- Tab content -->
				<div class="lr-content">
					{#if activeTab === 'text'}
						<div class="lr-content-narrow">
							{#if selectedNodeId}
								<div class="lr-breadcrumb-row">
									<button
										onclick={() => (selectedNodeId = null)}
										class="lr-breadcrumb-link"
									>
										&larr; All sections
									</button>
									<span class="lr-breadcrumb-divider">|</span>
									<span class="lr-breadcrumb-current">
										{data.toc.find((n: Record<string, unknown>) => n.id === selectedNodeId)?.heading ?? 'Section'}
									</span>
								</div>
							{/if}
							<OfficialTextPane
								documentId={doc.id}
								nodeId={selectedNodeId}
								initialChunks={data.initialChunks as any}
								onCitationClick={openCitationDrawer}
							/>
						</div>

					{:else if activeTab === 'image'}
						<div class="lr-image-preview">
							<img
								src={`/api/library/documents/${encodeURIComponent(doc.id)}/image`}
								alt={`Original image: ${doc.title}`}
								loading="lazy"
								decoding="async"
							/>
							<p>{doc.title} · Original image</p>
						</div>

					{:else if activeTab === 'search'}
						<div class="lr-content-narrow lr-content-medium">
							<div class="lr-search-row">
								<input
									bind:value={searchQ}
									type="search"
									placeholder="Search within this library..."
									list="lr-suggestions"
									oninput={onSearchInput}
									onkeydown={(e) => e.key === 'Enter' && runSearch()}
									class="lr-search-input"
								/>
								<datalist id="lr-suggestions">
									{#each suggestions as s}
										<option value={s}></option>
									{/each}
								</datalist>
								<button
									onclick={runSearch}
									disabled={searching}
									class="lr-search-btn"
								>
									{searching ? '...' : 'Search'}
								</button>
							</div>

							{#if searchError}
								<p class="lr-search-error">{searchError}</p>
							{/if}

							{#if searchResults.length > 0}
								<div class="lr-results-list">
									{#each searchResults as hit}
										<div class="lr-result-card">
											<div class="lr-result-header">
												<div>
													<p class="lr-result-title">{(hit.title ?? hit.document_title) as string}</p>
													{#if hit.heading ?? hit.node_heading}
														<p class="lr-result-heading">{(hit.heading ?? hit.node_heading) as string}</p>
													{/if}
												</div>
												<span class="lr-result-score">
													{Math.round(((hit.score as number) ?? 0) * 100)}% match
												</span>
											</div>
											<p class="lr-result-snippet">{hit.snippet as string}</p>
										</div>
									{/each}
								</div>
							{:else if hasSearched && !searching && !searchError}
								<p class="lr-search-empty">No matching sections found for "{searchQ}".</p>
							{/if}
						</div>

					{:else if activeTab === 'summary'}
						<div class="lr-content-narrow lr-content-medium">
							<div class="lr-summary-card">
								<h2 class="lr-summary-title">{doc.title}</h2>
								{#if doc.citation}
									<p class="lr-summary-citation">{doc.citation}</p>
								{/if}
								<dl class="lr-summary-dl">
									{#if doc.jurisdiction}
										<div>
											<dt>Jurisdiction</dt>
											<dd>{doc.jurisdiction.name}</dd>
										</div>
									{/if}
									{#if doc.corpusType}
										<div>
											<dt>Type</dt>
											<dd>{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</dd>
										</div>
									{/if}
									{#if doc.pageCount}
										<div>
											<dt>Pages</dt>
											<dd>{doc.pageCount}</dd>
										</div>
									{/if}
									{#if doc.wordCount}
										<div>
											<dt>Words</dt>
											<dd>{doc.wordCount.toLocaleString()}</dd>
										</div>
									{/if}
									<div>
										<dt>Sections</dt>
										<dd>{data.toc.length}</dd>
									</div>
									{#if doc.officialUrl}
										<div class="lr-summary-wide">
											<dt>Official Source</dt>
											<dd>
												<a
													href={doc.officialUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="lr-summary-link"
												>
													{doc.officialUrl}
												</a>
											</dd>
										</div>
									{/if}
								</dl>
							</div>
						</div>
					{/if}
				</div>
			</main>
		</div>
	</div>

	<dialog bind:this={pdfPreviewDialog} class="lr-pdf-dialog" aria-label="PDF preview">
		<div class="lr-pdf-dialog-header">
			<strong>{doc.title}</strong>
			<a href={`/api/library/documents/${encodeURIComponent(data.document.id)}/pdf`} target="_blank" rel="noopener noreferrer">Open in new tab</a>
			<a href={`/api/library/documents/${encodeURIComponent(data.document.id)}/pdf?download=1`} download>Download</a>
			<button type="button" class="lr-pdf-dialog-close" onclick={() => pdfPreviewDialog?.close()} aria-label="Close PDF preview">Close</button>
		</div>
		{#if pdfPreviewUrl}
			<iframe title={`PDF preview: ${doc.title}`} src={pdfPreviewUrl} class="lr-pdf-frame"></iframe>
		{:else}
			<div class="lr-pdf-empty">Opening PDF preview…</div>
		{/if}
	</dialog>
	<CitationDrawer bind:open={drawerOpen} citation={activeCitation} />
{/if}

<style>
	/* ── Error ── */
	.lr-error { padding: 2rem; text-align: center; color: #f87171; }

	/* The native dialog opens synchronously; the browser owns PDF decoding. */
	.lr-pdf-dialog {
		width: min(96vw, 1440px);
		height: min(94dvh, 1000px);
		max-width: none;
		max-height: none;
		padding: 0;
		border: 0;
		border-radius: 12px;
		background: #25282b;
		color: #f8fafc;
		box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
	}
	.lr-pdf-dialog::backdrop { background: rgb(0 0 0 / 68%); }
	.lr-pdf-dialog-header {
		height: 48px;
		padding: 0 12px 0 18px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		border-bottom: 1px solid rgb(255 255 255 / 12%);
	}
	.lr-pdf-dialog-header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lr-pdf-dialog-close { padding: 6px 12px; border: 1px solid rgb(255 255 255 / 20%); border-radius: 6px; color: inherit; background: transparent; cursor: pointer; }
	.lr-pdf-frame { display: block; width: 100%; height: calc(100% - 48px); border: 0; background: #525659; }
	.lr-pdf-empty { height: calc(100% - 48px); display: grid; place-items: center; color: #cbd5e1; }
	.lr-image-preview { width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 1rem; overflow: auto; }
	.lr-image-preview img { display: block; max-width: 100%; max-height: calc(100% - 2rem); object-fit: contain; }
	.lr-image-preview p { color: rgba(212, 199, 163, 0.65); font-size: 0.75rem; }

	/* ── Page ── */
	.lr-page {
		height: 100%;
		display: flex;
		flex-direction: column;
		margin: -2.5rem;
		background: #0e0d0b;
		color: rgba(212, 199, 163, 0.9);
		overflow: hidden;
	}
	.lr-page :global(h1), .lr-page :global(h2), .lr-page :global(h3), .lr-page :global(h4), .lr-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.lr-page :global(a) { color: inherit; border-bottom: none; }
	.lr-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.lr-page :global(input), .lr-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.lr-page :global(.panel), .lr-page :global(.card), .lr-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Top bar ── */
	.lr-topbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 1rem;
		height: 2.75rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(17, 17, 19, 1);
	}
	.lr-topbar-back {
		color: rgba(212, 199, 163, 0.3);
		font-size: 0.85rem;
		text-decoration: none;
		transition: color 0.15s;
	}
	.lr-topbar-back:hover { color: rgba(212, 199, 163, 0.6); }
	.lr-topbar-divider { color: rgba(212, 199, 163, 0.15); }
	.lr-topbar-title {
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.6);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lr-topbar-citation {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.25);
		flex-shrink: 0;
	}
	.lr-topbar-jurisdiction {
		font-size: 0.6rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		flex-shrink: 0;
	}
	.lr-topbar-official {
		font-size: 0.6rem;
		color: rgba(96, 165, 250, 0.4);
		text-decoration: none;
		flex-shrink: 0;
		transition: color 0.15s;
	}
	.lr-topbar-official:hover { color: rgba(96, 165, 250, 0.9); }

	/* ── Body ── */
	.lr-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	/* ── TOC sidebar ── */
	.lr-toc-sidebar {
		width: 240px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(17, 17, 19, 1);
		overflow: hidden;
	}
	.lr-toc-header {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.lr-toc-label {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(212, 199, 163, 0.3);
	}
	.lr-toc-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 0.25rem 0;
	}
	.lr-toc-empty {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.2);
		padding: 1rem 0.75rem;
	}

	/* ── Main ── */
	.lr-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ── Tab bar ── */
	.lr-tab-bar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0 1rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(17, 17, 19, 1);
	}
	.lr-tab {
		padding: 0.625rem 0.75rem;
		font-size: 0.7rem;
		font-weight: 500;
		border: none;
		background: none;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		color: rgba(212, 199, 163, 0.3);
		transition: color 0.15s, border-color 0.15s;
	}
	.lr-tab:hover { color: rgba(212, 199, 163, 0.6); }
	.lr-tab.active {
		border-bottom-color: rgba(96, 165, 250, 0.8);
		color: rgba(96, 165, 250, 0.95);
	}

	/* ── Content ── */
	.lr-content {
		flex: 1;
		overflow-y: auto;
		position: relative;
	}
	.lr-content-narrow {
		max-width: 48rem;
		margin: 0 auto;
		padding: 1.5rem;
	}
	.lr-content-medium { max-width: 40rem; }

	/* ── Breadcrumb row ── */
	.lr-breadcrumb-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.lr-breadcrumb-link {
		font-size: 0.7rem;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.3);
		cursor: pointer;
		transition: color 0.15s;
	}
	.lr-breadcrumb-link:hover { color: rgba(96, 165, 250, 0.9); }
	.lr-breadcrumb-divider { font-size: 0.7rem; color: rgba(212, 199, 163, 0.15); }
	.lr-breadcrumb-current { font-size: 0.7rem; color: rgba(212, 199, 163, 0.4); }

	/* ── Search ── */
	.lr-search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}
	.lr-search-input {
		flex: 1;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.9);
	}
	.lr-search-input::placeholder { color: rgba(212, 199, 163, 0.25); }
	.lr-search-input:focus { outline: none; border-color: rgba(96, 165, 250, 0.4); }
	.lr-search-btn {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.lr-search-btn:hover { background: rgba(96, 165, 250, 0.25); }
	.lr-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.lr-search-error { font-size: 0.85rem; color: #f87171; }

	/* ── Results ── */
	.lr-results-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.lr-result-card {
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.lr-result-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	.lr-result-title { font-size: 0.85rem; font-weight: 500; color: rgba(212, 199, 163, 0.9); }
	.lr-result-heading { font-size: 0.7rem; color: rgba(212, 199, 163, 0.4); }
	.lr-result-score {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.25);
		flex-shrink: 0;
	}
	.lr-result-snippet {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.45);
		line-height: 1.6;
		display: -webkit-box;
		line-clamp: 4;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Summary card ── */
	.lr-summary-card {
		border-radius: 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.2);
		padding: 1.25rem;
	}
	.lr-summary-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0 0 0.75rem;
	}
	.lr-summary-citation {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.4);
		margin-bottom: 1rem;
	}
	.lr-summary-dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		font-size: 0.7rem;
	}
	.lr-summary-dl dt {
		color: rgba(212, 199, 163, 0.3);
		margin-bottom: 0.125rem;
	}
	.lr-summary-dl dd { color: rgba(212, 199, 163, 0.6); }
	.lr-summary-wide { grid-column: span 2; }
	.lr-summary-link {
		color: rgba(96, 165, 250, 0.8);
		text-decoration: none;
		transition: color 0.15s;
	}
	.lr-summary-link:hover { color: rgba(96, 165, 250, 1); text-decoration: underline; }
</style>
