<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import GlossaryTermCard from '$lib/components/legal/GlossaryTermCard.svelte';

	let { data }: { data: PageData } = $props();

	let searchQ = $state('');
	let activeCategory = $state('all');
	let activeTab = $state<'summary' | 'definition' | 'corpus' | 'sources' | 'related'>('summary');
	let selectedTerm = $state<(typeof data.terms)[0] | null>(null);
	let searching = $state(false);
	let searchResults = $state<SearchResult[]>([]);
	let searchError = $state<string | null>(null);
	let searchDebounce: ReturnType<typeof setTimeout>;

	interface SearchResult {
		id: string;
		term: string;
		definition: string;
		category: string | null;
		jurisdiction: string | null;
		relatedTerms: string[];
		sources: string[];
		similarity: number;
		matchType: 'semantic' | 'fulltext' | 'prefix';
	}

	const filteredTerms = $derived.by(() => {
		if (searchQ.trim() && searchResults.length > 0) return searchResults;
		return data.terms.filter((t) => {
			if (activeCategory !== 'all' && t.category !== activeCategory) return false;
			if (searchQ.trim()) {
				const q = searchQ.toLowerCase();
				return t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q);
			}
			return true;
		});
	});

	const groupedByLetter = $derived.by(() => {
		const map = new Map<string, typeof filteredTerms>();
		for (const t of filteredTerms) {
			const letter = t.term[0].toUpperCase();
			if (!map.has(letter)) map.set(letter, []);
			map.get(letter)!.push(t as never);
		}
		return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	const termDefinitions = $derived(
		selectedTerm
			? data.corpusDefinitions.filter(
					(d) => d.term.toLowerCase() === selectedTerm!.term.toLowerCase()
				)
			: []
	);

	const selectedDocuments = $derived.by(() => {
		const seen = new Map<
			string,
			{
				docId: string | null;
				docTitle: string | null;
				nodeHeading: string | null;
			}
		>();

		for (const def of termDefinitions) {
			const key = def.docId ?? def.docTitle ?? def.id;
			if (!seen.has(key)) {
				seen.set(key, {
					docId: def.docId,
					docTitle: def.docTitle,
					nodeHeading: def.nodeHeading,
				});
			}
		}

		return [...seen.values()];
	});

	const uniqueSourceCount = $derived.by(
		() => new Set(data.terms.flatMap((term) => term.sources)).size
	);

	const uniqueCategoryCount = $derived.by(
		() => new Set(data.terms.map((term) => term.category ?? 'general')).size
	);

	const executiveSummary = $derived.by(() => {
		if (!selectedTerm) return '';

		const categoryLabel = CATEGORY_LABELS[selectedTerm.category ?? 'general'] ?? 'General';
		const relatedCount = selectedTerm.relatedTerms.length;
		const corpusCount = termDefinitions.length;
		const documentCount = selectedDocuments.length;

		const relatedText = relatedCount > 0
			? ` It connects to ${relatedCount} related concept${relatedCount === 1 ? '' : 's'} that can be compared directly inside the glossary.`
			: '';

		const corpusText = corpusCount > 0
			? ` The indexed corpus surfaces ${corpusCount} excerpt${corpusCount === 1 ? '' : 's'} across ${documentCount} source document${documentCount === 1 ? '' : 's'} where this term appears or is defined.`
			: ' No extracted corpus excerpts have been linked to this term yet.';

		return `${selectedTerm.term} is currently classified under ${categoryLabel} for ${selectedTerm.jurisdiction ?? 'Federal/State'} usage.${relatedText}${corpusText}`;
	});

	const heroStats = $derived.by(() => [
		{ label: 'Glossary Terms', value: data.terms.length, icon: 'book-open' },
		{ label: 'Corpus Excerpts', value: data.corpusDefinitions.length, icon: 'file-text' },
		{ label: 'Source Titles', value: uniqueSourceCount, icon: 'library-big' },
	]);

	const researchTabs = $derived.by(() => [
		{ id: 'summary', label: 'Summary' },
		{ id: 'definition', label: 'Official Text' },
		{ id: 'corpus', label: `Corpus (${termDefinitions.length})` },
		{ id: 'related', label: `Related (${selectedTerm?.relatedTerms.length ?? 0})` },
		{ id: 'sources', label: `Citations (${selectedTerm?.sources.length ?? 0})` },
	]);

	const CATEGORY_LABELS: Record<string, string> = {
		civil: 'Civil Law',
		constitutional: 'Constitutional',
		criminal: 'Criminal Law',
		'criminal-defense': 'Criminal Defense',
		evidence: 'Evidence',
		general: 'General',
		procedure: 'Procedure',
		cybercrime: 'Cybercrime',
		cyber: 'Cyber Law',
		regulatory: 'Regulatory',
		family: 'Family Law',
		property: 'Property',
		corporate: 'Corporate',
		employment: 'Employment',
		bankruptcy: 'Bankruptcy',
		'intellectual-property': 'IP Law',
		intellectual_property: 'IP Law',
		immigration: 'Immigration',
		international: 'International',
		estate: 'Estate',
		environmental: 'Environmental',
		administrative: 'Administrative',
		contract: 'Contract',
		tort: 'Tort Law',
		tax: 'Tax Law',
		uncategorized: 'Other',
	};

	const CATEGORY_COLOR: Record<string, string> = {
		civil: 'gl-cat-civil',
		constitutional: 'gl-cat-constitutional',
		criminal: 'gl-cat-criminal',
		'criminal-defense': 'gl-cat-criminal-defense',
		evidence: 'gl-cat-evidence',
		general: 'gl-cat-general',
		procedure: 'gl-cat-procedure',
		cybercrime: 'gl-cat-cybercrime',
		cyber: 'gl-cat-cybercrime',
		regulatory: 'gl-cat-regulatory',
		family: 'gl-cat-family',
		property: 'gl-cat-property',
		corporate: 'gl-cat-corporate',
		employment: 'gl-cat-employment',
		bankruptcy: 'gl-cat-bankruptcy',
		'intellectual-property': 'gl-cat-ip',
		intellectual_property: 'gl-cat-ip',
		immigration: 'gl-cat-immigration',
		international: 'gl-cat-international',
		estate: 'gl-cat-estate',
		environmental: 'gl-cat-environmental',
		administrative: 'gl-cat-administrative',
		contract: 'gl-cat-contract',
		tort: 'gl-cat-tort',
		tax: 'gl-cat-tax',
		uncategorized: 'gl-cat-general',
	};

	$effect(() => {
		if (!selectedTerm && data.terms.length > 0) {
			selectedTerm = data.terms[0];
		}
	});

	function onSearchInput() {
		clearTimeout(searchDebounce);
		searchError = null;
		if (!searchQ.trim()) {
			searchResults = [];
			return;
		}
		searchDebounce = setTimeout(() => doSearch(), 320);
	}

	async function doSearch() {
		if (!searchQ.trim()) return;
		searching = true;
		try {
			const res = await fetch('/api/glossary/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQ, category: activeCategory === 'all' ? undefined : activeCategory, limit: 30 }),
				signal: AbortSignal.timeout(30_000)
			});
			if (!res.ok) throw new Error('Search failed');
			const json = await res.json();
			searchResults = json.results ?? [];
		} catch (e) {
			searchError = e instanceof Error ? e.message : 'Search error';
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	function selectTerm(term: (typeof data.terms)[0] | SearchResult) {
		const full = data.terms.find((t) => t.id === term.id) ?? term as never;
		selectedTerm = full;
		activeTab = 'summary';
	}

	function clearSearch() {
		searchQ = '';
		searchResults = [];
		searchError = null;
	}
</script>

<div class="min-h-full bg-[#f5f7fb] text-slate-900">
	<div class="mx-auto flex max-w-[1580px] flex-col gap-4 p-4 md:p-6">
		<section class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] backdrop-blur">
			<div class="border-b border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_52%,#eef4ff_100%)] px-5 py-4 md:px-6">
				<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div class="flex min-w-0 items-center gap-3">
						<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
							<Icon name="scale" class="h-5 w-5" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Legal Corpus AI</p>
							<h1 class="truncate text-xl font-semibold text-slate-900 md:text-2xl">
								{selectedTerm?.term ?? 'Legal Glossary'}
							</h1>
						</div>
					</div>

					<div class="flex w-full max-w-[700px] flex-col gap-3 md:flex-row md:items-center md:justify-end">
						<div class="relative flex-1">
							<Icon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
							<input
								type="text"
								placeholder="Search laws, cases, or terms"
								bind:value={searchQ}
								oninput={onSearchInput}
								class="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
							/>
							{#if searching}
								<span class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-blue-500/50 border-t-transparent animate-spin"></span>
							{:else if searchQ}
								<button
									onclick={clearSearch}
									class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
								>
									<Icon name="x" class="h-4 w-4" />
								</button>
							{/if}
						</div>

						<button
							onclick={() => {
								activeTab = 'related';
							}}
							class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
						>
							<Icon name="git-compare-arrows" class="h-4 w-4" />
							Compare
						</button>

						<button
							onclick={() => {
								activeTab = 'corpus';
							}}
							class="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
						>
							<Icon name="search-code" class="h-4 w-4" />
							Search Corpus
						</button>
					</div>
				</div>

				<div class="mt-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
							<span class="font-medium text-slate-500">Federal / State</span>
							<span>›</span>
							<span>{CATEGORY_LABELS[selectedTerm?.category ?? 'general'] ?? 'Glossary'}</span>
							<span>›</span>
							<span class="font-medium text-slate-700">{selectedTerm?.term ?? 'Browse all terms'}</span>
						</div>
						<p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
							Browse the glossary as a research workspace: summary first, source text second, and corpus evidence next to the term instead of buried underneath it.
						</p>
					</div>

					<div class="grid grid-cols-1 gap-2 md:grid-cols-3 xl:min-w-[530px]">
						{#each heroStats as stat}
							<div class="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm">
								<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
									<Icon name={stat.icon} class="h-3.5 w-3.5" />
									{stat.label}
								</div>
								<p class="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<div class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
			<aside class="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.42)]">
				<div class="border-b border-slate-200 px-4 py-4">
					<div class="flex items-center gap-2">
						<Icon name="book-open-text" class="h-4 w-4 text-blue-600" />
						<h2 class="text-sm font-semibold text-slate-900">Glossary Explorer</h2>
						<span class="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
							{filteredTerms.length}
						</span>
					</div>
					<p class="mt-1 text-xs leading-5 text-slate-500">
						Filter the glossary, then pivot into corpus excerpts and cited source material.
					</p>
				</div>

				<div class="border-b border-slate-200 px-4 py-3">
					<div class="flex flex-wrap gap-2">
						<button
							onclick={() => {
								activeCategory = 'all';
								searchResults = [];
							}}
							class="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors {activeCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
						>
							All Terms
						</button>
						{#each data.categories as cat}
							<button
								onclick={() => {
									activeCategory = cat.name;
									searchResults = [];
								}}
								class="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors {activeCategory === cat.name ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
							>
								{CATEGORY_LABELS[cat.name] ?? cat.name}
							</button>
						{/each}
					</div>
				</div>

				<div class="max-h-[calc(100vh-19rem)] overflow-y-auto">
					{#if searchError}
						<p class="px-4 py-4 text-sm text-rose-600">{searchError}</p>
					{:else if filteredTerms.length === 0}
						<p class="px-4 py-6 text-sm text-slate-500">No terms found.</p>
					{:else if searchQ.trim() && searchResults.length > 0}
						<div class="p-2">
							{#each searchResults as result}
								<button
									onclick={() => selectTerm(result)}
									class="mb-2 w-full rounded-2xl border px-3 py-3 text-left transition {selectedTerm?.id === result.id ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-slate-900">{result.term}</p>
											<p class="mt-1 text-xs leading-5 text-slate-500">{result.definition}</p>
										</div>
										<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {CATEGORY_COLOR[result.category ?? 'general'] ?? CATEGORY_COLOR.general}">
											{result.matchType}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{:else}
						{#each groupedByLetter as [letter, terms]}
							<section class="border-b border-slate-100 last:border-b-0">
								<div class="sticky top-0 z-10 bg-slate-50/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 backdrop-blur">
									{letter}
								</div>
								<div class="p-2 space-y-2">
									{#each terms as term}
										<GlossaryTermCard
											{term}
											variant="light"
											selected={selectedTerm?.id === term.id}
											onSelect={(id) => {
												const found = data.terms.find((t) => t.id === id);
												if (found) selectTerm(found);
											}}
										/>
									{/each}
								</div>
							</section>
						{/each}
					{/if}
				</div>
			</aside>

			<section class="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_50px_-40px_rgba(15,23,42,0.42)]">
				{#if !selectedTerm}
					<div class="flex min-h-[540px] flex-col items-center justify-center gap-3 px-6 text-center">
						<Icon name="book-open-text" class="h-12 w-12 text-slate-300" />
						<h2 class="text-lg font-semibold text-slate-900">Select a term to inspect</h2>
						<p class="max-w-md text-sm leading-6 text-slate-500">
							The glossary is loaded, but no active term is selected yet.
						</p>
					</div>
				{:else}
					<div class="border-b border-slate-200 px-5 py-4 md:px-6">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
								<div>
									<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Research Workspace</p>
									<h2 class="mt-1 text-2xl font-semibold text-slate-900">{selectedTerm.term}</h2>
									<div class="mt-3 flex flex-wrap items-center gap-2">
										<span class="rounded-full px-2.5 py-1 text-xs font-medium {CATEGORY_COLOR[selectedTerm.category ?? 'general'] ?? CATEGORY_COLOR.general}">
											{CATEGORY_LABELS[selectedTerm.category ?? 'general'] ?? 'General'}
										</span>
										<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
											{selectedTerm.jurisdiction ?? 'Federal/State'}
										</span>
									</div>
								</div>

								<div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[360px]">
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Corpus Hits</p>
										<p class="mt-2 text-xl font-semibold text-slate-900">{termDefinitions.length}</p>
									</div>
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Related Terms</p>
										<p class="mt-2 text-xl font-semibold text-slate-900">{selectedTerm.relatedTerms.length}</p>
									</div>
									<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Cited Sources</p>
										<p class="mt-2 text-xl font-semibold text-slate-900">{selectedTerm.sources.length}</p>
									</div>
								</div>
							</div>

							<div class="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
								{#each researchTabs as tab}
									<button
										onclick={() => {
											activeTab = tab.id as typeof activeTab;
										}}
										class="rounded-full px-3 py-1.5 text-xs font-semibold transition {activeTab === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
									>
										{tab.label}
									</button>
								{/each}
							</div>
						</div>
					</div>

					<div class="grid gap-4 px-5 py-5 md:px-6 md:py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
						<div class="space-y-4">
							{#if activeTab === 'summary'}
								<div class="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm">
									<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
										<Icon name="sparkles" class="h-3.5 w-3.5" />
										Executive Summary
									</div>
									<p class="mt-4 text-[15px] leading-7 text-slate-700">{executiveSummary}</p>
								</div>

								<div class="grid gap-4 lg:grid-cols-2">
									<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
										<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
											<Icon name="scroll-text" class="h-3.5 w-3.5" />
											Official Definition
										</div>
										<p class="mt-4 text-sm leading-7 text-slate-700">{selectedTerm.definition}</p>
									</div>

									<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
										<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
											<Icon name="shield-check" class="h-3.5 w-3.5" />
											Research Notes
										</div>
										<ul class="mt-4 space-y-3 text-sm leading-6 text-slate-700">
											<li class="flex gap-3"><span class="mt-1 h-2 w-2 rounded-full bg-blue-500"></span><span>Category coverage spans {uniqueCategoryCount} legal domains across the seeded glossary.</span></li>
											<li class="flex gap-3"><span class="mt-1 h-2 w-2 rounded-full bg-slate-400"></span><span>{selectedDocuments.length > 0 ? `${selectedDocuments.length} document${selectedDocuments.length === 1 ? '' : 's'} in the indexed corpus reference this concept.` : 'No corpus document has been linked to this concept yet.'}</span></li>
											<li class="flex gap-3"><span class="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span><span>{selectedTerm.sources.length > 0 ? `${selectedTerm.sources.length} cited source${selectedTerm.sources.length === 1 ? '' : 's'} are attached to the term for traceability.` : 'This term currently has no cited source metadata.'}</span></li>
										</ul>
									</div>
								</div>
							{:else if activeTab === 'definition'}
								<div class="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
									<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
										<Icon name="file-text" class="h-3.5 w-3.5" />
										Official Text
									</div>
									<p class="mt-4 text-base leading-8 text-slate-800">{selectedTerm.definition}</p>
								</div>
							{:else if activeTab === 'corpus'}
								{#if termDefinitions.length > 0}
									<div class="space-y-3">
										{#each termDefinitions as def}
											<div class="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
												<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
													{#if def.docId}
														<a href="/library/{def.docId}" class="font-semibold text-blue-700 transition hover:text-blue-900">
															{def.docTitle ?? 'Document'}
														</a>
													{:else}
														<span class="font-semibold text-slate-700">{def.docTitle ?? 'Document'}</span>
													{/if}
													{#if def.nodeHeading}
														<span>›</span>
														<span>{def.nodeHeading}</span>
													{/if}
												</div>
												<p class="mt-3 text-sm leading-7 text-slate-700">{def.definitionText}</p>
											</div>
										{/each}
									</div>
								{:else}
									<div class="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-7 text-slate-600">
										No corpus excerpts are linked to this term yet. The glossary entry exists, but no in-corpus definition has been extracted.
									</div>
								{/if}
							{:else if activeTab === 'sources'}
								<div class="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
									<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
										<Icon name="link" class="h-3.5 w-3.5" />
										Cited Sources
									</div>
									{#if selectedTerm.sources.length > 0}
										<ul class="mt-4 space-y-3">
											{#each selectedTerm.sources as src}
												<li class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
													{src}
												</li>
											{/each}
										</ul>
									{:else}
										<p class="mt-4 text-sm text-slate-500">No source metadata is attached to this term yet.</p>
									{/if}
								</div>
							{:else if activeTab === 'related'}
								<div class="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
									<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
										<Icon name="network" class="h-3.5 w-3.5" />
										Related Terms
									</div>
									{#if selectedTerm.relatedTerms.length > 0}
										<div class="mt-4 flex flex-wrap gap-2">
											{#each selectedTerm.relatedTerms as related}
												{@const found = data.terms.find((t) => t.term.toLowerCase() === related.toLowerCase())}
												{#if found}
													<button
														onclick={() => selectTerm(found)}
														class="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
													>
														{related}
													</button>
												{:else}
													<span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{related}</span>
												{/if}
											{/each}
										</div>
									{:else}
										<p class="mt-4 text-sm text-slate-500">No related terms are linked to this entry.</p>
									{/if}
								</div>
							{/if}
						</div>

						<aside class="space-y-4">
							<div class="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
								<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
									<Icon name="info" class="h-3.5 w-3.5" />
									Matter Data
								</div>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-3">
										<dt class="text-slate-500">Jurisdiction</dt>
										<dd class="text-right font-medium text-slate-900">{selectedTerm.jurisdiction ?? 'Federal/State'}</dd>
									</div>
									<div class="flex items-start justify-between gap-3">
										<dt class="text-slate-500">Category</dt>
										<dd class="text-right font-medium text-slate-900">{CATEGORY_LABELS[selectedTerm.category ?? 'general'] ?? 'General'}</dd>
									</div>
									<div class="flex items-start justify-between gap-3">
										<dt class="text-slate-500">Corpus Docs</dt>
										<dd class="text-right font-medium text-slate-900">{selectedDocuments.length}</dd>
									</div>
									<div class="flex items-start justify-between gap-3">
										<dt class="text-slate-500">Term ID</dt>
										<dd class="max-w-[150px] truncate text-right font-mono text-xs text-slate-600" title={selectedTerm.id}>{selectedTerm.id}</dd>
									</div>
								</dl>
							</div>

							<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
								<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
									<Icon name="files" class="h-3.5 w-3.5" />
									Corpus Mentions
								</div>
								{#if selectedDocuments.length > 0}
									<ul class="mt-4 space-y-3">
										{#each selectedDocuments as doc}
											<li class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
												{#if doc.docId}
													<a href="/library/{doc.docId}" class="block text-sm font-medium text-blue-700 transition hover:text-blue-900">
														{doc.docTitle ?? 'Document'}
													</a>
												{:else}
													<p class="text-sm font-medium text-slate-800">{doc.docTitle ?? 'Document'}</p>
												{/if}
												{#if doc.nodeHeading}
													<p class="mt-1 text-xs text-slate-500">{doc.nodeHeading}</p>
												{/if}
											</li>
										{/each}
									</ul>
								{:else}
									<p class="mt-4 text-sm text-slate-500">No linked corpus mentions yet.</p>
								{/if}
							</div>

							<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
								<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
									<Icon name="quote" class="h-3.5 w-3.5" />
									Cited Sources
								</div>
								{#if selectedTerm.sources.length > 0}
									<ul class="mt-4 space-y-2">
										{#each selectedTerm.sources as src}
											<li class="text-sm leading-6 text-slate-700">{src}</li>
										{/each}
									</ul>
								{:else}
									<p class="mt-4 text-sm text-slate-500">No citations recorded.</p>
								{/if}
							</div>
						</aside>
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	/* -- Category color badges (scoped, gl-* prefix) -- */
	/* Original 6 categories */
	.gl-cat-civil { background: rgba(59, 130, 246, 0.12); color: rgba(59, 130, 246, 0.9); }
	.gl-cat-constitutional { background: rgba(139, 92, 246, 0.12); color: rgba(139, 92, 246, 0.9); }
	.gl-cat-criminal { background: rgba(244, 63, 94, 0.12); color: rgba(244, 63, 94, 0.9); }
	.gl-cat-evidence { background: rgba(245, 158, 11, 0.12); color: rgba(245, 158, 11, 0.9); }
	.gl-cat-general { background: rgba(100, 116, 139, 0.12); color: rgba(100, 116, 139, 0.9); }
	.gl-cat-procedure { background: rgba(20, 184, 166, 0.12); color: rgba(20, 184, 166, 0.9); }
	/* 14 new categories */
	.gl-cat-cybercrime { background: rgba(239, 68, 68, 0.12); color: rgba(239, 68, 68, 0.9); }
	.gl-cat-regulatory { background: rgba(234, 179, 8, 0.12); color: rgba(234, 179, 8, 0.9); }
	.gl-cat-family { background: rgba(236, 72, 153, 0.12); color: rgba(236, 72, 153, 0.9); }
	.gl-cat-property { background: rgba(168, 85, 247, 0.12); color: rgba(168, 85, 247, 0.9); }
	.gl-cat-corporate { background: rgba(59, 130, 246, 0.12); color: rgba(59, 130, 246, 0.9); }
	.gl-cat-employment { background: rgba(249, 115, 22, 0.12); color: rgba(249, 115, 22, 0.9); }
	.gl-cat-bankruptcy { background: rgba(156, 163, 175, 0.12); color: rgba(156, 163, 175, 0.9); }
	.gl-cat-ip { background: rgba(14, 165, 233, 0.12); color: rgba(14, 165, 233, 0.9); }
	.gl-cat-immigration { background: rgba(34, 197, 94, 0.12); color: rgba(34, 197, 94, 0.9); }
	.gl-cat-estate { background: rgba(217, 119, 6, 0.12); color: rgba(217, 119, 6, 0.9); }
	.gl-cat-environmental { background: rgba(16, 185, 129, 0.12); color: rgba(16, 185, 129, 0.9); }
	.gl-cat-administrative { background: rgba(99, 102, 241, 0.12); color: rgba(99, 102, 241, 0.9); }
	.gl-cat-contract { background: rgba(245, 158, 11, 0.12); color: rgba(245, 158, 11, 0.9); }
	.gl-cat-tax { background: rgba(107, 114, 128, 0.12); color: rgba(107, 114, 128, 0.9); }
	.gl-cat-tort { background: rgba(251, 146, 60, 0.12); color: rgba(251, 146, 60, 0.9); }
	.gl-cat-criminal-defense { background: rgba(220, 38, 38, 0.12); color: rgba(220, 38, 38, 0.9); }
	.gl-cat-international { background: rgba(6, 182, 212, 0.12); color: rgba(6, 182, 212, 0.9); }
</style>
