<script lang="ts">
	import type { PageData } from './$types';
	import { untrack } from 'svelte';
	import TocTree from '$lib/components/legal/TocTree.svelte';
	import OfficialTextPane from '$lib/components/legal/OfficialTextPane.svelte';
	import CitationDrawer from '$lib/components/legal/CitationDrawer.svelte';

	let { data }: { data: PageData } = $props();

	type Tab = 'text' | 'summary' | 'search';

	let activeTab = $state<Tab>('text');
	let selectedNodeId = $state<string | null>(untrack(() => data.selectedNodeId ?? null));
	let drawerOpen = $state(false);
	let activeCitation = $state<string | null>(null);

	// Search
	let searchQ = $state('');
	let searchResults = $state<Array<Record<string, unknown>>>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);

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
		searchError = null;
		try {
			const res = await fetch('/api/library/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQ, limit: 10 }),
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
	<div class="p-8 text-center text-red-400">{data.loadError}</div>
{:else if data.document}
	{@const doc = data.document}
	<div class="h-screen flex flex-col bg-app-bg text-sand overflow-hidden">
		<!-- Top bar -->
		<header class="shrink-0 flex items-center gap-3 px-4 h-11 border-b border-sand/10 bg-[#111113]">
			<a href="/library/{doc.id}" class="text-sand/40 hover:text-sand/70 text-sm">←</a>
			<span class="text-sand/20">|</span>
			<span class="text-sm text-sand/70 truncate flex-1">{doc.title}</span>
			{#if doc.citation}
				<span class="text-xs font-mono text-sand/30 shrink-0">{doc.citation}</span>
			{/if}
			{#if doc.jurisdiction}
				<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 font-mono shrink-0">
					{doc.jurisdiction.code.toUpperCase()}
				</span>
			{/if}
			{#if doc.officialUrl}
				<a
					href={doc.officialUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-[10px] text-accent/50 hover:text-accent shrink-0"
				>
					Official ↗
				</a>
			{/if}
		</header>

		<div class="flex-1 flex overflow-hidden">
			<!-- Left rail: TOC -->
			<aside class="w-[240px] shrink-0 flex flex-col border-r border-sand/10 bg-[#111113] overflow-hidden">
				<div class="px-3 py-2 border-b border-sand/8">
					<span class="text-[10px] font-semibold text-sand/40 uppercase tracking-wider">Contents</span>
				</div>
				<div class="flex-1 overflow-y-auto py-1">
					{#if tocTree.length === 0}
						<p class="text-[11px] text-sand/25 px-3 py-4">No sections available</p>
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
			<main class="flex-1 flex flex-col overflow-hidden">
				<!-- Tab bar -->
				<div class="shrink-0 flex items-center gap-0.5 px-4 border-b border-sand/10 bg-[#111113]">
					{#each [['text', 'Official Text'], ['search', 'Search'], ['summary', 'Summary']] as [tab, label]}
						<button
							onclick={() => (activeTab = tab as Tab)}
							class="px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px
								{activeTab === tab
									? 'border-accent text-accent'
									: 'border-transparent text-sand/40 hover:text-sand/70'}"
						>
							{label}
						</button>
					{/each}
				</div>

				<!-- Tab content -->
				<div class="flex-1 overflow-y-auto">
					{#if activeTab === 'text'}
						<div class="max-w-3xl mx-auto px-6 py-6">
							{#if selectedNodeId}
								<div class="mb-3 flex items-center gap-2">
									<button
										onclick={() => (selectedNodeId = null)}
										class="text-xs text-sand/40 hover:text-accent"
									>
										← All sections
									</button>
									<span class="text-xs text-sand/20">|</span>
									<span class="text-xs text-sand/50">
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

					{:else if activeTab === 'search'}
						<div class="max-w-2xl mx-auto px-6 py-6">
							<div class="flex gap-2 mb-5">
								<input
									bind:value={searchQ}
									type="search"
									placeholder="Search within this library…"
									onkeydown={(e) => e.key === 'Enter' && runSearch()}
									class="flex-1 bg-sand/5 border border-sand/10 rounded px-4 py-2 text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/40"
								/>
								<button
									onclick={runSearch}
									disabled={searching}
									class="px-4 py-2 rounded bg-accent/20 text-accent text-sm hover:bg-accent/30 disabled:opacity-50 transition-colors"
								>
									{searching ? '…' : 'Search'}
								</button>
							</div>

							{#if searchError}
								<p class="text-red-400 text-sm">{searchError}</p>
							{/if}

							{#if searchResults.length > 0}
								<div class="flex flex-col gap-3">
									{#each searchResults as hit}
										<div class="bg-sand/3 border border-sand/8 rounded-lg p-4">
											<div class="flex items-start justify-between gap-3 mb-2">
												<div>
													<p class="text-sm font-medium text-sand">{hit.document_title as string}</p>
													{#if hit.node_heading}
														<p class="text-xs text-sand/50">{hit.node_heading as string}</p>
													{/if}
												</div>
												<span class="text-[10px] text-sand/30 shrink-0">
													{Math.round(((hit.score as number) ?? 0) * 100)}% match
												</span>
											</div>
											<p class="text-xs text-sand/60 leading-relaxed line-clamp-4">{hit.snippet as string}</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>

					{:else if activeTab === 'summary'}
						<div class="max-w-2xl mx-auto px-6 py-6">
							<div class="panel rounded-lg border border-sand/10 p-5">
								<h2 class="text-sm font-semibold text-sand mb-3">{doc.title}</h2>
								{#if doc.citation}
									<p class="text-xs font-mono text-sand/50 mb-4">{doc.citation}</p>
								{/if}
								<dl class="grid grid-cols-2 gap-3 text-xs">
									{#if doc.jurisdiction}
										<div>
											<dt class="text-sand/40 mb-0.5">Jurisdiction</dt>
											<dd class="text-sand/70">{doc.jurisdiction.name}</dd>
										</div>
									{/if}
									{#if doc.corpusType}
										<div>
											<dt class="text-sand/40 mb-0.5">Type</dt>
											<dd class="text-sand/70">{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</dd>
										</div>
									{/if}
									{#if doc.pageCount}
										<div>
											<dt class="text-sand/40 mb-0.5">Pages</dt>
											<dd class="text-sand/70">{doc.pageCount}</dd>
										</div>
									{/if}
									{#if doc.wordCount}
										<div>
											<dt class="text-sand/40 mb-0.5">Words</dt>
											<dd class="text-sand/70">{doc.wordCount.toLocaleString()}</dd>
										</div>
									{/if}
									<div>
										<dt class="text-sand/40 mb-0.5">Sections</dt>
										<dd class="text-sand/70">{data.toc.length}</dd>
									</div>
									{#if doc.officialUrl}
										<div class="col-span-2">
											<dt class="text-sand/40 mb-0.5">Official Source</dt>
											<dd>
												<a
													href={doc.officialUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="text-accent hover:underline"
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

	<CitationDrawer bind:open={drawerOpen} citation={activeCitation} />
{/if}
