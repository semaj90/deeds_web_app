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
	};

	let query = $state('');
	let isSearching = $state(false);
	let results = $state<SearchResult[]>([]);
	let metrics = $state<SearchMetrics | null>(null);
	let error = $state<string | null>(null);
	let selectedResult = $state<SearchResult | null>(null);

	let hasResults = $derived(results.length > 0);

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

	function getTypeIcon(type: SearchResult['documentType']) {
		switch (type) {
			case 'deed': return FileText;
			case 'contract': return FileText;
			case 'evidence': return Database;
			case 'case_law': return Brain;
			default: return FileText;
		}
	}

	async function performSemanticSearch() {
		if (!query.trim() || isSearching) return;
		isSearching = true;
		error = null;
		selectedResult = null;
		const startTime = performance.now();

		try {
			const response = await fetch('/api/semantic-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: query.trim() })
			});

			if (!response.ok) {
				const errText = await response.text();
				let parsed: any;
				try { parsed = JSON.parse(errText); } catch { parsed = { error: errText || response.statusText }; }
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

			metrics = {
				totalDocuments: results.length,
				searchTime: Math.round(searchTime),
				vectorDimensions: data.vectorDimensions ?? 768,
				similarityThreshold: data.similarityThreshold ?? 0.0
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Search failed';

			// Fall back to demo results
			results = demoResults.filter(r =>
				r.title.toLowerCase().includes(query.toLowerCase()) ||
				r.content.toLowerCase().includes(query.toLowerCase())
			);
			if (results.length === 0) results = demoResults;

			metrics = {
				totalDocuments: results.length,
				searchTime: Math.round(performance.now() - startTime),
				vectorDimensions: 768,
				similarityThreshold: 0.0
			};
			error = null; // Clear error since we have demo results
		} finally {
			isSearching = false;
		}
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
			<span class="i-lucide-brain h-6 w-6 text-accent inline-block" />
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
				<span class="i-lucide-loader-2 h-4 w-4 animate-spin inline-block" />
				Searching
			{:else}
				<span class="i-lucide-search h-4 w-4 inline-block" />
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
			<span class="i-lucide-alert-circle h-4 w-4 text-danger inline-block" />
			<span class="text-sm text-danger">{error}</span>
		</div>
	{/if}

	<!-- Metrics -->
	{#if metrics}
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.totalDocuments}</div>
				<div class="text-xs text-sand/60">Documents</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.searchTime}ms</div>
				<div class="text-xs text-sand/60">Search Time</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{metrics.vectorDimensions}D</div>
				<div class="text-xs text-sand/60">Vector Space</div>
			</div>
			<div class="bg-panelSoft rounded-lg p-3 text-center">
				<div class="text-xl font-bold text-sand">{Math.round(metrics.similarityThreshold * 100)}%</div>
				<div class="text-xs text-sand/60">Threshold</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if hasResults}
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold text-sand">Search Results</h3>
			<span class="px-2 py-1 rounded text-xs font-medium bg-accent/10 text-accent">{results.length} found</span>
		</div>

		<div class="space-y-3">
			{#each results as result (result.id)}
				{@const TypeIcon = getTypeIcon(result.documentType)}
				<button
					class="w-full text-left rounded-lg border-2 bg-panel p-4 transition hover:border-accent/40 hover:shadow-md {selectedResult?.id === result.id ? 'border-accent bg-accent/5' : 'border-sand/20'}"
					onclick={() => (selectedResult = selectedResult?.id === result.id ? null : result)}
				>
					<div class="flex items-start gap-3">
						<div class="p-2 rounded-lg {getTypeColor(result.documentType)}">
							<TypeIcon class="h-5 w-5" />
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
										<span class="i-lucide-clock h-3 w-3 text-sand/40 inline-block" />
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