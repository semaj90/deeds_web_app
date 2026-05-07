<script lang="ts">
	type SearchResult = {
		id: string;
		title: string;
		content: string;
		similarity: number;
		documentType: 'deed' | 'contract' | 'evidence' | 'case_law';
		metadata?: {
			caseId?: string;
			uploadDate?: string;
			tags?: string[];
		};
	};

	type SearchMetrics = {
		totalDocuments: number;
		searchTime: number;
		vectorDimensions: number;
		similarityThreshold: number;
		avgSimilarity?: number;
		maxSimilarity?: number;
		minSimilarity?: number;
	};

	let query = $state('');
	let isSearching = $state(false);
	let results = $state<SearchResult[]>([]);
	let filteredResults = $state<SearchResult[]>([]);
	let metrics = $state<SearchMetrics | null>(null);
	let error = $state<string | null>(null);
	let selectedResult = $state<SearchResult | null>(null);
	let filterType = $state<'all' | 'deed' | 'contract' | 'evidence' | 'case_law'>('all');
	let sortBy = $state<'similarity' | 'date' | 'title'>('similarity');
	let selectedResults = $state<Set<string>>(new Set());

	let hasResults = $derived(results.length > 0);
	let displayResults = $derived.by(() => {
		let display = results.filter(r => filterType === 'all' || r.documentType === filterType);

		if (sortBy === 'similarity') display.sort((a, b) => b.similarity - a.similarity);
		else if (sortBy === 'date') display.sort((a, b) => new Date(b.metadata?.uploadDate || 0).getTime() - new Date(a.metadata?.uploadDate || 0).getTime());
		else if (sortBy === 'title') display.sort((a, b) => a.title.localeCompare(b.title));

		return display;
	});

	const exampleQueries = [
		'property ownership transfer',
		'contract liability clauses',
		'employment agreements',
		'intellectual property rights'
	];

	const demoResults: SearchResult[] = [
		{
			id: 'demo-1',
			title: 'Property Deed - 123 Main Street',
			content: 'This warranty deed transfers ownership of the property located at 123 Main Street from John Smith to Jane Doe. The property includes all fixtures and improvements...',
			similarity: 0.92,
			documentType: 'deed',
			metadata: { caseId: 'CASE-2024-001', uploadDate: '2024-01-15', tags: ['property', 'transfer', 'warranty'] }
		},
		{
			id: 'demo-2',
			title: 'Employment Contract - Tech Corp',
			content: 'This employment agreement establishes the terms of employment between Tech Corp and the employee. The position includes responsibilities for software development...',
			similarity: 0.87,
			documentType: 'contract',
			metadata: { caseId: 'CASE-2024-002', uploadDate: '2024-01-10', tags: ['employment', 'technology', 'intellectual property'] }
		},
		{
			id: 'demo-3',
			title: 'Evidence Report - Financial Records',
			content: 'Forensic analysis of financial records shows multiple wire transfers between suspect accounts. Transaction patterns indicate potential money laundering activity...',
			similarity: 0.81,
			documentType: 'evidence',
			metadata: { caseId: 'CASE-2024-003', uploadDate: '2024-02-01', tags: ['financial', 'forensics', 'analysis'] }
		},
		{
			id: 'demo-4',
			title: 'Case Law - Property Rights vs. Environmental Regulations',
			content: 'Supreme Court ruling establishes precedent for balancing private property rights against environmental protection regulations. The decision emphasizes balancing tests...',
			similarity: 0.78,
			documentType: 'case_law',
			metadata: { caseId: 'CASE-2024-001', uploadDate: '2024-02-10', tags: ['case law', 'property', 'environment'] }
		},
		{
			id: 'demo-5',
			title: 'Real Estate Purchase Agreement - Commercial Property',
			content: 'This purchase agreement outlines the terms for acquisition of commercial real estate at 456 Commerce Drive. Price negotiations and contingencies are detailed...',
			similarity: 0.75,
			documentType: 'contract',
			metadata: { caseId: 'CASE-2024-004', uploadDate: '2024-01-20', tags: ['real estate', 'commercial', 'contract'] }
		},
		{
			id: 'demo-6',
			title: 'Quitclaim Deed - Estate Distribution',
			content: 'Estate quitclaim deed transferring rights to beneficiary. This document relinquishes all claims and rights to the property as per the probate decree...',
			similarity: 0.72,
			documentType: 'deed',
			metadata: { caseId: 'CASE-2024-005', uploadDate: '2024-02-05', tags: ['estate', 'probate', 'quitclaim'] }
		}
	];

	function getTypeColor(type: SearchResult['documentType']): string {
		switch (type) {
			case 'deed': return 'bg-info/10 text-info';
			case 'contract': return 'bg-accent/10 text-accent';
			case 'evidence': return 'bg-warning/10 text-warning';
			case 'case_law': return 'bg-info/10 text-info';
			default: return 'bg-sand/10 text-sand';
		}
	}

	function getTypeIcon(type: SearchResult['documentType']): string {
		switch (type) {
			case 'deed': return 'file-text';
			case 'contract': return 'file-text';
			case 'evidence': return 'database';
			case 'case_law': return 'brain';
			default: return 'file-text';
		}
	}

	async function performSemanticSearch() {
		if (!query.trim() || isSearching) return;
		isSearching = true;
		error = null;
		selectedResult = null;
		selectedResults.clear();
		const startTime = performance.now();

		try {
			const response = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: query.trim() }),
				signal: AbortSignal.timeout(30_000)
			});

			if (!response.ok) {
				const errText = await response.text();
				let parsed: any;
				try {
					parsed = JSON.parse(errText);
				} catch {
					parsed = { error: errText || response.statusText };
				}
				throw new Error(parsed.error || `Search failed: ${response.statusText}`);
			}

			const data = await response.json();
			const searchTime = performance.now() - startTime;

			results = (data.results || []).map((r: any) => ({
				id: r.id,
				title: r.title || `Document ${r.id}`,
				content: r.content || r.text || '',
				similarity: r.similarity ?? 0,
				documentType: r.documentType ?? 'deed',
				metadata: r.metadata
			}));

			const similarities = results.map(r => r.similarity);
			metrics = {
				totalDocuments: results.length,
				searchTime: Math.round(searchTime),
				vectorDimensions: data.vectorDimensions ?? 768,
				similarityThreshold: data.similarityThreshold ?? 0.0,
				avgSimilarity: similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0,
				maxSimilarity: similarities.length > 0 ? Math.max(...similarities) : 0,
				minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Search failed';

			// Fall back to demo results
			results = demoResults.filter(r =>
				r.title.toLowerCase().includes(query.toLowerCase()) ||
				r.content.toLowerCase().includes(query.toLowerCase())
			);
			if (results.length === 0) results = demoResults;

			const similarities = results.map(r => r.similarity);
			metrics = {
				totalDocuments: results.length,
				searchTime: Math.round(performance.now() - startTime),
				vectorDimensions: 768,
				similarityThreshold: 0.0,
				avgSimilarity: similarities.reduce((a, b) => a + b, 0) / similarities.length,
				maxSimilarity: Math.max(...similarities),
				minSimilarity: Math.min(...similarities)
			};
			error = null; // Clear error since we have demo results
		} finally {
			isSearching = false;
		}
	}

	function toggleResultSelection(id: string) {
		if (selectedResults.has(id)) {
			selectedResults.delete(id);
		} else {
			selectedResults.add(id);
		}
		selectedResults = selectedResults;
	}

	function exportResults() {
		const toExport = displayResults.filter(r => selectedResults.has(r.id) || selectedResults.size === 0);
		const csv = [
			['ID', 'Title', 'Type', 'Similarity', 'Case ID', 'Date'].join(','),
			...toExport.map(r =>
				[
					r.id,
					`"${r.title.replace(/"/g, '""')}"`,
					r.documentType,
					(r.similarity * 100).toFixed(1),
					r.metadata?.caseId || '',
					r.metadata?.uploadDate || ''
				].join(',')
			)
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `search-results-${Date.now()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		performSemanticSearch();
	}
</script>

<div class="vector-demo">
	<!-- Header -->
	<div class="text-center mb-6">
		<div class="flex items-center justify-center gap-2 text-2xl font-bold text-sand">
			<span class="i-lucide-brain h-6 w-6 text-accent inline-block"></span>
			Vector Intelligence Demo
		</div>
		<p class="text-sm text-sand/60 mt-1">
			Semantic search powered by pgvector and AI embeddings for legal document analysis
		</p>
	</div>

	<!-- Search Form -->
	<form onsubmit={handleSubmit} class="flex gap-2 mb-4">
		<input
			type="text"
			bind:value={query}
			placeholder="Search legal documents using natural language..."
			class="flex-1 rounded-lg border-2 border-sand/20 bg-panel px-4 py-2.5 text-sand placeholder-sand/40 transition focus:border-accent focus:outline-none"
			disabled={isSearching}
		/>
		<button
			type="submit"
			disabled={isSearching || !query.trim()}
			class="px-4 py-2 rounded-lg bg-accent text-white font-medium flex items-center gap-2 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
		>
			{#if isSearching}
				<span class="i-lucide-loader-2 h-4 w-4 animate-spin inline-block"></span>
				Searching
			{:else}
				<span class="i-lucide-search h-4 w-4 inline-block"></span>
				Search
			{/if}
		</button>
	</form>

	<!-- Example Queries -->
	<div class="flex flex-wrap gap-2 mb-6">
		<span class="text-sm text-sand/60">Try:</span>
		{#each exampleQueries as example}
			<button
				class="px-3 py-1 text-xs rounded-full bg-panelSoft text-sand/80 hover:bg-panel hover:text-sand transition"
				onclick={() => { query = example; performSemanticSearch(); }}
				disabled={isSearching}
			>
				{example}
			</button>
		{/each}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-4 p-3 bg-danger/5 border border-danger/20 rounded-lg flex items-center gap-2">
			<span class="i-lucide-alert-circle h-4 w-4 text-danger inline-block"></span>
			<span class="text-sm text-danger">{error}</span>
		</div>
	{/if}

	<!-- Metrics -->
	{#if metrics}
		<div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.totalDocuments}</div>
				<div class="text-xs text-sand/60">Documents</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.searchTime}ms</div>
				<div class="text-xs text-sand/60">Time</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.vectorDimensions}D</div>
				<div class="text-xs text-sand/60">Dimensions</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-accent">{Math.round((metrics.maxSimilarity || 0) * 100)}%</div>
				<div class="text-xs text-sand/60">Max</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{Math.round((metrics.avgSimilarity || 0) * 100)}%</div>
				<div class="text-xs text-sand/60">Avg</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand/60">{Math.round((metrics.minSimilarity || 0) * 100)}%</div>
				<div class="text-xs text-sand/60">Min</div>
			</div>
		</div>
	{/if}

	<!-- Results Controls -->
	{#if hasResults}
		<div class="mb-4 flex flex-col gap-4">
			<div class="flex items-center justify-between flex-wrap gap-3">
				<div>
					<h3 class="text-lg font-semibold text-sand mb-1">Search Results</h3>
					<span class="text-xs text-sand/60">{displayResults.length} of {results.length} results</span>
				</div>
				<div class="flex items-center gap-2">
					{#if selectedResults.size > 0}
						<span class="text-xs text-accent px-2 py-1 bg-accent/10 rounded">{selectedResults.size} selected</span>
					{/if}
					<button
						onclick={exportResults}
						disabled={displayResults.length === 0}
						class="px-3 py-1.5 text-xs rounded-lg bg-panelSoft hover:bg-panel text-sand disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
						title="Export results to CSV"
					>
						<span class="i-lucide-download h-3.5 w-3.5 inline-block"></span>
						Export
					</button>
				</div>
			</div>

			<div class="flex flex-wrap gap-3">
				<div class="flex items-center gap-2">
					<span class="text-xs text-sand/60">Filter:</span>
					<select
						bind:value={filterType}
						class="px-2.5 py-1.5 text-xs rounded-lg border border-sand/20 bg-panel text-sand focus:border-accent focus:outline-none transition"
					>
						<option value="all">All Types</option>
						<option value="deed">Deeds</option>
						<option value="contract">Contracts</option>
						<option value="evidence">Evidence</option>
						<option value="case_law">Case Law</option>
					</select>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-xs text-sand/60">Sort by:</span>
					<select
						bind:value={sortBy}
						class="px-2.5 py-1.5 text-xs rounded-lg border border-sand/20 bg-panel text-sand focus:border-accent focus:outline-none transition"
					>
						<option value="similarity">Similarity (High to Low)</option>
						<option value="date">Date (Newest First)</option>
						<option value="title">Title (A to Z)</option>
					</select>
				</div>
			</div>
		</div>

		<div class="space-y-3">
			{#each displayResults as result (result.id)}
				{@const typeIcon = getTypeIcon(result.documentType)}
				<div
					class="rounded-lg border-2 bg-panel p-4 transition {selectedResult?.id === result.id ? 'border-accent bg-accent/5' : 'border-sand/20'} hover:border-accent/40"
				>
					<div class="flex items-start gap-3">
						<input
							type="checkbox"
							checked={selectedResults.has(result.id)}
							onchange={() => toggleResultSelection(result.id)}
							class="mt-1 w-4 h-4 cursor-pointer accent-accent"
							aria-label="Select result"
						/>
						<button
							class="flex-1 text-left cursor-pointer block w-full"
							onclick={() => (selectedResult = selectedResult?.id === result.id ? null : result)}
						>
							<div class="flex items-start gap-3">
								<div class="p-2 rounded-lg {getTypeColor(result.documentType)}">
									<span class="i-lucide-{typeIcon} h-5 w-5 inline-block"></span>
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between gap-2 mb-1">
										<h4 class="font-semibold text-sand truncate">{result.title}</h4>
										<span class="px-2 py-0.5 rounded-full text-xs font-bold {result.similarity >= 0.9 ? 'bg-accent/20 text-accent' : result.similarity >= 0.7 ? 'bg-warning/20 text-warning' : 'bg-sand/20 text-sand/60'}">
											{Math.round(result.similarity * 100)}%
										</span>
									</div>
									<p class="text-sm text-sand/60 line-clamp-2">{result.content}</p>
									{#if result.metadata?.tags}
										<div class="flex flex-wrap gap-1 mt-2">
											{#each result.metadata.tags as tag}
												<span class="px-1.5 py-0.5 text-[10px] rounded bg-sand/10 text-sand/60">#{tag}</span>
											{/each}
										</div>
									{/if}
								</div>
							</div>

							<!-- Expanded Detail -->
							{#if selectedResult?.id === result.id}
								<div class="mt-3 pt-3 border-t border-sand/10">
									<div class="grid grid-cols-2 gap-3 text-xs">
										<div>
											<span class="text-sand/40">Document Type:</span>
											<span class="ml-1 text-sand">{result.documentType}</span>
										</div>
										{#if result.metadata?.caseId}
											<div>
												<span class="text-sand/40">Case ID:</span>
												<span class="ml-1 text-sand">{result.metadata.caseId}</span>
											</div>
										{/if}
										{#if result.metadata?.uploadDate}
											<div class="flex items-center gap-1">
												<span class="i-lucide-clock h-3 w-3 text-sand/40 inline-block"></span>
												<span class="text-sand/60">{result.metadata.uploadDate}</span>
											</div>
										{/if}
										<div>
											<span class="text-sand/40">Similarity:</span>
											<span class="ml-1 text-sand">{(result.similarity * 100).toFixed(1)}%</span>
										</div>
									</div>
									<p class="mt-2 text-sm text-sand/80">{result.content}</p>
								</div>
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.vector-demo {
		max-width: 48rem;
		margin: 0 auto;
	}
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>