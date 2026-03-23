<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface SimilarityResult {
		id: string;
		title: string;
		documentType?: string;
		content?: string;
		caseId?: string;
		similarity: number;
	}

	interface Props {
		selectedDocument?: SimilarityResult;
		searchQuery?: string;
	}

	let { selectedDocument = $bindable(), searchQuery = $bindable() }: Props = $props();

	let similarDocuments = $state<SimilarityResult[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	async function performSemanticSearch(query: string | undefined) {
		const q = String(query ?? '').trim();
		if (!q) {
			similarDocuments = [];
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: q, limit: 5, threshold: 0.3 })
			});

			if (!response.ok) {
				const text = await response.text().catch(() => response.statusText);
				throw new Error(text || `HTTP ${response.status}`);
			}

			const data = await response.json().catch(() => ({}));

			if (data?.success && Array.isArray(data.result)) {
				similarDocuments = data.result.map((r: Record<string, unknown>) => ({
					...r,
					similarity: typeof r.similarity === 'number' ? r.similarity : Number(r.similarity) || 0
				}));
			} else {
				error = data?.error ?? 'Search failed';
				similarDocuments = [];
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Search failed';
			similarDocuments = [];
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (searchQuery && String(searchQuery).trim().length) {
			performSemanticSearch(searchQuery);
		} else {
			similarDocuments = [];
			error = null;
		}
	});
</script>

<div class="space-y-6">
	<!-- Search Input -->
	<div>
		<label for="search-query" class="block text-sm font-medium mb-1">
			<Icon name="search" size={14} /> Semantic Search Legal Documents
		</label>
		<div class="flex gap-2">
			<input
				id="search-query"
				type="text"
				bind:value={searchQuery}
				placeholder="Enter search query (e.g., 'property deed transfer', 'contract liability'...)"
				class="flex-1 px-3 py-2 border border-sand-dark rounded-md text-sm bg-panel-soft focus:outline-none focus:border-accent"
			/>
			<button
				onclick={() => performSemanticSearch(searchQuery)}
				disabled={isLoading || !(searchQuery && String(searchQuery).trim())}
				class="px-4 py-2 rounded-md text-sm font-medium border border-accent bg-accent-soft hover:bg-accent disabled:opacity-50 transition-colors"
			>
				{isLoading ? 'Searching...' : 'Search'}
			</button>
		</div>
	</div>

	<!-- Selected Document Display -->
	{#if selectedDocument}
		<div class="rounded-lg border border-sand-dark bg-panel p-4">
			<h2 class="text-base font-bold mb-3">
				<Icon name="file-text" size={16} /> Document Analysis: {selectedDocument.title}
			</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
				<p><strong>ID:</strong> {selectedDocument.id}</p>
				{#if selectedDocument.documentType}
					<p><strong>Type:</strong> {selectedDocument.documentType}</p>
				{/if}
				{#if selectedDocument.caseId}
					<p><strong>Case ID:</strong> {selectedDocument.caseId}</p>
				{/if}
			</div>
			{#if selectedDocument.content}
				<div>
					<h3 class="font-semibold text-sm mb-1">Content Preview</h3>
					<div class="bg-panel-soft p-3 rounded border border-sand-dark max-h-40 overflow-y-auto">
						<p class="text-sm opacity-70">
							{String(selectedDocument.content).slice(0, 500)}{(selectedDocument.content?.length ?? 0) > 500 ? '...' : ''}
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Search Results -->
	<div class="rounded-lg border border-sand-dark bg-panel p-4">
		<h2 class="text-base font-bold mb-3">
			<Icon name="target" size={16} /> Similar Documents {searchQuery ? `for "${searchQuery}"` : ''}
		</h2>

		{#if error}
			<div class="rounded-md border border-danger bg-danger-soft p-3 text-sm">
				<strong>Search Error:</strong> {error}
			</div>
		{:else if isLoading}
			<div class="flex items-center justify-center py-8 gap-2 opacity-60">
				<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>
				<span class="text-sm">Searching for similar documents...</span>
			</div>
		{:else if similarDocuments.length > 0}
			<div class="space-y-3">
				{#each similarDocuments as doc}
					<div class="border border-sand-dark rounded-lg p-3 hover:border-accent transition-colors">
						<div class="flex justify-between items-start mb-1">
							<h4 class="font-semibold text-sm">{doc.title}</h4>
							<div class="flex gap-1.5">
								{#if doc.documentType}
									<span class="px-2 py-0.5 rounded-full text-[11px] bg-info-soft text-info">{doc.documentType}</span>
								{/if}
								<span class="px-2 py-0.5 rounded-full text-[11px] bg-accent-soft text-accent">{(doc.similarity * 100).toFixed(1)}% match</span>
							</div>
						</div>
						<div class="text-xs opacity-60 mb-1.5">
							<span>ID: {doc.id}</span>
							{#if doc.caseId}
								<span class="ml-2">Case: {doc.caseId}</span>
							{/if}
						</div>
						{#if doc.content}
							<div class="bg-panel-soft p-2 rounded text-xs opacity-70">
								{String(doc.content).slice(0, 200)}{(doc.content?.length ?? 0) > 200 ? '...' : ''}
							</div>
						{/if}
						<button
							type="button"
							onclick={() => (selectedDocument = doc)}
							class="mt-2 text-accent text-xs font-medium hover:underline cursor-pointer bg-transparent border-none p-0"
						>
							View Details &rarr;
						</button>
					</div>
				{/each}
			</div>
		{:else if searchQuery}
			<div class="text-center py-8 opacity-50">
				<p>No similar documents found for: "{searchQuery}"</p>
				<p class="text-xs mt-1">Try adjusting your search terms or lowering the similarity threshold</p>
			</div>
		{:else}
			<div class="text-center py-8 opacity-50">
				<p>Enter a search query to find similar legal documents</p>
				<p class="text-xs mt-1">Use natural language like: "property deed transfer" or "contract liability clauses"</p>
			</div>
		{/if}
	</div>
</div>
