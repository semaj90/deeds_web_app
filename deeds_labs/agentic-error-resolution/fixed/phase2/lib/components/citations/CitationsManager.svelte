<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- Citations Manager - Legal Citation System with AI-powered search -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
	import type { onMount  } from 'svelte';
	import 
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	Input,
	Badge
   from "$lib/components/ui/enhanced-bits.svelte";
	import  Button  from "$lib/components/ui/Button.svelte";
	import type { Search, BookOpen, ExternalLink, Download,
		Plus, FileText, Calendar, User, Tags,
		Filter, SortAsc, Eye, Edit, Trash2
	 } from 'lucide-svelte';
  	// Svelte 5 state management
  	let citations = $state<any[]>([]);
  	let filteredCitations = $state<any[]>([]);
  	let searchQuery = $state('');
  	let selectedCategory = $state('all');
  	let sortBy = $state<'date' | 'title' | 'relevance'>('date');
  	let isLoading = $state(false);
  	let citationCategories = $state([
  		{ id: 'all', label: 'All Citations', count: 0 },
  		{ id: 'cases', label: 'Case Law', count: 0 },
  		{ id: 'statutes', label: 'Statutes', count: 0 },
  		{ id: 'regulations', label: 'Regulations', count: 0 },
  		{ id: 'articles', label: 'Articles', count: 0 },
  		{ id: 'evidence', label: 'Evidence', count: 0 }
  	]);
  	let newCitation = $state({
  		title: '',
	let newCitation = $state({
		title: '',
		authors: '',
		year: new Date().getFullYear(),
		source: '',
		category: 'cases',
		pages: '',
		url: '',
		notes: '',
		tags: [] as string[],
		relevanceScore: 0
	});
  	let showDetailModal = $state(false);
  	// Component props
  	let {
  		caseId = '',
  		readonly = false
  	} = $props();
  	// Initialize citations
  	$effect(() => {
    (async () => {
await loadCitations();
  		updateCategoryCounts();
    })();
  });
  	async function loadCitations() {
  		isLoading = true;
	async function loadCitations() {
		isLoading = true;
		console.log('📚 Loading citations for caseItem:', caseId);
		try {
			// Load sample citations data
			citations = [
				{
					id: 'citation-1',
					title: 'Brown v. Board of Education',
					authors: 'Supreme Court of the United States',
					year: 1954,
					source: '347 U.S. 483',
					category: 'cases',
					pages: '483-496',
					url: 'https://supreme.justia.com/cases/federal/us/347/483/',
					notes: 'Landmark case establishing that racial segregation in public schools is unconstitutional',
					tags: ['constitutional-law', 'education', 'civil-rights', 'segregation'],
					relevanceScore: 95,
					dateAdded: new Date('2024-01-15'),
					caseId: caseId
				},
				{
					id: 'citation-2',
					title: 'Federal Rules of Evidence',
					authors: 'U.S. Congress',
					year: 2023,
					source: 'Fed. R. Evid.',
					category: 'statutes',
					pages: 'Rule 401-403',
					url: 'https://www.law.cornell.edu/rules/fre',
					notes: 'Rules governing admissibility of evidence in federal court proceedings',
					tags: ['evidence-law', 'federal-rules', 'admissibility', 'relevance'],
					relevanceScore: 88,
					dateAdded: new Date('2024-01-16'),
					caseId: caseId
				},
				{
					id: 'citation-3',
					title: 'Miranda v. Arizona',
					authors: 'Supreme Court of the United States',
					year: 1966,
					source: '384 U.S. 436',
					category: 'cases',
					pages: '436-526',
					url: 'https://supreme.justia.com/cases/federal/us/384/436/',
					notes: 'Established Miranda rights - suspects must be informed of rights before interrogation',
					tags: ['criminal-law', 'constitutional-rights', 'interrogation', 'fifth-amendment'],
					relevanceScore: 92,
					dateAdded: new Date('2024-01-17'),
					caseId: caseId
				},
				{
					id: 'citation-4',
					title: 'Digital Evidence and Computer Crime',
					authors: 'Casey, E. & Rose, C.',
					year: 2022,
					source: 'Academic Press',
					category: 'articles',
					pages: '1-45',
					url: 'https://doi.org/example',
					notes: 'Comprehensive guide to handling digital evidence in modern legal proceedings',
					tags: ['digital-forensics', 'computer-crime', 'evidence-handling', 'technology'],
					relevanceScore: 78,
					dateAdded: new Date('2024-01-18'),
					caseId: caseId
				}
			];
			filteredCitations = citations;
			updateCategoryCounts();
			console.log(`✅ Loaded ${citations.length} citations`);
		} catch (error) {
			console.error('❌ Failed to load citations:', error);
		} finally {
			isLoading = false;
		}
	}
	function updateCategoryCounts() {
		citationCategories = citationCategories.map(cat => {
			const count = cat.id === 'all'
				? citations.length
	function filterCitations() {
		let filtered = citations.slice();
		// Filter by category
		if (selectedCategory !== 'all') {
			filtered = filtered.filter(c => c.category === selectedCategory);
		}
		// Filter by search query
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(c => {
				return (c.title && c.title.toLowerCase().includes(q)) ||
					(c.authors && c.authors.toLowerCase().includes(q)) ||
					(c.source && c.source.toLowerCase().includes(q)) ||
					(c.notes && c.notes.toLowerCase().includes(q)) ||
					(c.tags && c.tags.some((t: string) => t.toLowerCase().includes(q)));
			});
		}
		// Sort results
		filtered.sort((a, b) => {
			switch (sortBy) {
				case 'title':
					return a.title.localeCompare(b.title);
				case 'relevance':
					return (b.relevanceScore || 0) - (a.relevanceScore || 0);
				case 'date':
				default: return (b.dateAdded?.getTime() || 0) - (a.dateAdded?.getTime() || 0);
			}
		});
		filteredCitations = filtered;
	function handleSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target?.value ?? '';
		filterCitations();
	}
  		searchQuery = target.valu;
  		filterCitations();
  	}
  	function selectCategory(categoryId: string) {
  		selectedCategory = categoryId;
  		filterCitations();
  	}
  	function changeSortBy(newSortBy: 'date' | 'title' | 'relevance') {
	function showAddCitationForm() {
		showAddForm = true;
		newCitation = {
			title: '',
			authors: '',
			year: new Date().getFullYear(),
			source: '',
			category: 'cases',
			pages: '',
			url: '',
			notes: '',
			tags: [],
			relevanceScore: 0
		};
	}
  			relevanceScore: 0,
  		}
  	}
  	function hideAddCitationForm() {
  		showAddForm = $state(false);
  	}
  	async function saveCitation() {
  		if (!newCitation.title.trim() || !newCitation.authors.trim()) {
		const citation = {
			...newCitation,
			id: `citation-${Date.now()}`,
			dateAdded: new Date(),
			caseId: caseId
		};
		try {
			console.log('💾 Saving citation', citation.title);
			// Save to server (stubbed)
			const response = await fetch('/api/legal/citations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(citation)
			});
			if (response.ok) {
				citations = [...citations, citation];
				updateCategoryCounts();
				filterCitations();
				hideAddCitationForm();
				console.log('✅ Citation saved successfully');
			} else {
				console.warn('Save returned non-OK response', response.status);
			}
		} catch (error) {
			console.error('❌ Failed to save citation', error);
	function viewCitationDetails(citation any) {
		selectedCitation = citation;
		showDetailModal = true;
	}
  	}
  	function viewCitationDetails(citation any) {
  		selectedCitation = citatio;
  		showDetailModal = true;
	async function deleteCitation(citationId: string) {
		if (!confirm('Are you sure you want to delete this citation?')) {
			return;
		}
		try {
			const response = await fetch(`/api/legal/citations/${citationId}`, {
				method: 'DELETE'
			});
			if (response.ok) {
				citations = citations.filter(c => c.id !== citationId);
				updateCategoryCounts();
				filterCitations();
				console.log('✅ Citation deleted successfully');
			} else {
				console.warn('Delete returned non-OK response', response.status);
			}
		} catch (error) {
			console.error('❌ Failed to delete citation', error);
		}
	}
  			}
  		} catch (error) {
  			console.error('❌ Failed to delete citation', error);
  		}
  	}
  	function formatCitation(citation any): string {
  		// Generate proper legal citation format
  		switch (citation.category) {
  			case 'cases':
  				return `${citation.title}, ${citation.source} (${citation.year})`;
  			case 'statutes':
	async function exportCitations() {
		console.log('📄 Exporting citations...');
		const exportData = filteredCitations.map(citation => ({
			formattedCitation formatCitation(citation),
			...citation
		}));
		// Create downloadable file
		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `citations-${caseId || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
  		const url = URL.createObjectURL(blob);
  		const a = document.createElement('a');
  		a.href = url;
  		a.download = `citations-${caseId || 'export'}-${new Date().toISOString.split('T')[0]}.json`;
  		a.click();
  		URL.revokeObjectURL(url);
  	}
</script>
<!-- Citations Manager Interface -->
<div class="w-full h-full flex flex-col bg-background">
	<!-- Header -->
	<div class="mb-4 nes-container">
		<div class="yorha-panel-header pb-3">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-4">
					<div class="w-10 h-10 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
						<BookOpen class="w-5 h-5 text-primary" />
					</div>
					<div>
						<h3 class="nes-text is-primary text-xl">Citations & References</h3>
						<p class="text-sm nes-text is-disabled">Legal citation management system</p>
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if !readonly}
						<Button
							class="enhanced-bits-btn nes-citation-control n64-enhanced lod-optimized retro-add-btn"
							variant="ghost"
							size="sm"
							onclick={showAddCitationForm}
							aria-label="Open dialog to add a new legal citation"
							aria-describedby="add-citation-help"
							role="button"
							data-nes-theme="citation-add"
							data-enhanced-bits="true"
							data-operation="add-citation"
						>
<Plus class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="Plus icon" />
							Add Citation
</Button>
						<div id="add-citation-help" class="sr-only">
							Create a new legal citation with complete source information
						{/if}
					<Button
						class="enhanced-bits-btn nes-citation-control n64-enhanced lod-optimized retro-export-btn"
						variant="ghost"
						size="sm"
						onclick={exportCitations}
						aria-label="Export citations to downloadable file"
						aria-describedby="export-help"
						role="button"
						data-nes-theme="citation-export"
						data-enhanced-bits="true"
						data-operation="export-citations"
					>
<Download class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="Download icon" />
						Export
</Button>
					<div id="export-help" class="sr-only">
						Download all filtered citations as a JSON file for backup or sharing
					</div>
				</div>
			</div>
		</div>
	</div>
	<!-- Search and Filters -->
	<div class="mb-4 nes-container">
		<div class="yorha-panel-content py-4">
			<div class="flex flex-col lg:flex-row gap-4">
				<!-- Search -->
				<div class="flex-1">
					<div class="relative">
						<Search class="w-4 h-4 absolute left-3 top-3 nes-text is-disabled" />
						<Input
							placeholder="Search citations, authors, sources..."
							value={searchQuery}
							oninput={handleSearch}
							class="pl-9"
						/>
					</div>
				</div>
				<!-- Sort Options -->
				<div class="flex gap-2">
					<Button
						class="enhanced-bits-btn nes-citation-sort n64-enhanced lod-optimized retro-sort-btn"
						variant={sortBy === 'date' ? 'default' : 'outline'}
						size="sm"
						onclick={() =>
changeSortBy('date')}
						aria-label={sortBy === 'date' ? 'Currently sorting by date' : 'Sort citations by date added'}
						aria-describedby="sort-date-help"
						role="button"
						data-nes-theme="citation-sort"
						data-enhanced-bits="true"
						data-sort-type="date"
						data-active={sortBy === 'date'}
					>
						<Calendar class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="Calendar icon" />
						Date
</Button>
					<div id="sort-date-help" class="sr-only">
						Sort citations by the date they were added to the system
					</div>
					<Button
						class="enhanced-bits-btn nes-citation-sort n64-enhanced lod-optimized retro-sort-btn"
						variant={sortBy === 'title' ? 'default' : 'outline'}
						size="sm"
						onclick={() =>
changeSortBy('title')}
						aria-label={sortBy === 'title' ? 'Currently sorting by title' : 'Sort citations alphabetically by title'}
						aria-describedby="sort-title-help"
						role="button"
						data-nes-theme="citation-sort"
						data-enhanced-bits="true"
						data-sort-type="title"
						data-active={sortBy === 'title'}
					>
						<SortAsc class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="Sort ascending icon" />
						Title
</Button>
					<div id="sort-title-help" class="sr-only">
						Sort citations alphabetically by title
					</div>
					<Button
						class="enhanced-bits-btn nes-citation-sort n64-enhanced lod-optimized retro-sort-btn"
						variant={sortBy === 'relevance' ? 'default' : 'outline'}
						size="sm"
						onclick={() =>
changeSortBy('relevance')}
						aria-label={sortBy === 'relevance' ? 'Currently sorting by relevance score' : 'Sort citations by relevance score'}
						aria-describedby="sort-relevance-help"
						role="button"
						data-nes-theme="citation-sort"
						data-enhanced-bits="true"
						data-sort-type="relevance"
						data-active={sortBy === 'relevance'}
					>
						<Filter class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="Filter icon" />
						Relevance
</Button>
					<div id="sort-relevance-help" class="sr-only">
						Sort citations by their calculated relevance score to your case
					</div>
				</div>
			</div>
		</div>
	</div>
	<!-- Main Content -->
	<div class="flex-1 grid grid-cols-4 gap-4">
		<!-- Categories Sidebar -->
		<div class="h-fit nes-container">
			<div class="yorha-panel-header pb-3">
				<h3 class="nes-text is-primary text-sm">Categories</h3>
			</div>
			<div class="yorha-panel-content space-y-2">
				{#each Array.isArray(citationCategories) ? citationCategories : [] as category}
					<button
						class="w-full flex justify-between items-center p-2 rounded text-sm hover: bg-muted transition-colors";
						class:bg-primary={selectedCategory === category.id}
						class:text-primary-foreground={selectedCategory === category.id}
						onclick={() => selectCategory(category.id)}
					>
						<span>{category.label}</span>
						<span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">{category.count}</span>
</Button>
				{/each}
			</div>
		</div>
		<!-- Citations List -->
		<div class="col-span-3 space-y-4">
			{#if isLoading}
				<div class="nes-container">
					<div class="yorha-panel-content py-8 text-center">
						<div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
						<p class="text-sm nes-text is-disabled">Loading citations...</p>
					</div>
				</div>
			{:else if filteredCitations.length === 0}
				<div class="nes-container">
					<div class="yorha-panel-content py-8 text-center">
						<BookOpen class="w-12 h-12 nes-text is-disabled mx-auto mb-4" />
						<p class="text-sm nes-text is-disabled mb-2">No citations found</p>
						{#if searchQuery}
							<p class="text-xs nes-text is-disabled">Try adjusting your search terms</p>
						{/if}
					</div>
				</div>
			{:else}
				{#each Array.isArray(filteredCitations) ? filteredCitations : [] as citation}
					<div class="hover:shadow-md transition-shadow nes-container">
						<div class="yorha-panel-content py-4">
							<div class="flex justify-between items-start">
								<div class="flex-1 pr-4">
									<div class="flex items-center gap-2 mb-2">
										<h3 class="font-semibold text-lg">{citation.title}</h3>
										<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{citation.category}</span>
										{#if citation.relevanceScore > 80}
											<span class="px-2 py-1 rounded text-xs font-medium bg-blue-500 text-white">High Relevance</span>
										{/if}
									</div>
									<div class="text-sm nes-text is-disabled mb-2">
										<div class="flex items-center gap-4 flex-wrap">
											<span class="flex items-center gap-1">
												<User class="w-3 h-3" />
												{citation.authors}
											</span>
											<span class="flex items-center gap-1">
												<Calendar class="w-3 h-3" />
												{citation.year}
											</span>
											<span class="flex items-center gap-1">
												<FileText class="w-3 h-3" />
												{citation.source}
											</span>
											{#if citation.pages}
												<span>pp. {citation.pages}</span>
											{/if}
										</div>
									</div>
									{#if citation.notes}
										<p class="text-sm mb-3">{citation.notes}</p>
									{/if}
									<div class="flex flex-wrap gap-1">
										{#each Array.isArray(citation.tags) ? citation.tags : [] as tag}
											<Badge variant="ghost" class="text-xs">
												<Tags class="w-2 h-2 mr-1" />
												{tag}
											</Badge>
										{/each}
									</div>
								</div>
								<div class="flex items-center gap-1">
									<button class="nes-btn"
										variant="ghost"
										size="sm"
										onclick={() => viewCitationDetails(citation)}
										class="h-8 w-8 p-0"
									>
										<Eye class="w-4 h-4" />
									</button>
									{#if citation.url}
										<Button
											class="enhanced-bits-btn nes-citation-action n64-enhanced lod-optimized retro-external-btn h-8 w-8 p-0"
											variant="ghost"
											size="sm"
											onclick={() =>
window.open(citation.url, '_blank')}
											aria-label="Open citation source in new tab"
											aria-describedby={`external-${citation.id}-help`}
											role="button"
											data-nes-theme="citation-external"
											data-enhanced-bits="true"
											data-operation="external-link"
										>
											<ExternalLink class="w-4 h-4" />
</Button>
									{/if}
									{#if !readonly}
										<Button
											class="enhanced-bits-btn nes-citation-action n64-enhanced lod-optimized retro-delete-btn danger-variant h-8 w-8 p-0 text-destructive hover:text-destructive"
											variant="ghost"
											size="sm"
											onclick={() =>
deleteCitation(citation.id)}
											aria-label="Delete this citation permanently"
											aria-describedby={`delete-${citation.id}-help`}
											role="button"
											data-nes-theme="citation-destructive"
											data-enhanced-bits="true"
											data-operation="delete-citation"
											data-critical="true"
										>
											<Trash2 class="w-4 h-4" />
</Button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
<!-- Add Citation Modal -->
{#if showAddForm}
	<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="button" tabindex="0"
                onclick={ (e) => { if (e.target === e.currentTarget) hideAddCitationForm() }}>
		<div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto nes-container">
			<div class="yorha-panel-header">
				<h3 class="nes-text is-primary">Add New Citation</h3>
			</div>
			<div class="yorha-panel-content space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Title *</label>
						<Input bind:value={newCitation.title} placeholder="Case name or article title" />
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Authors *</label>
						<Input bind:value={newCitation.authors} placeholder="Author names or court" />
					</div>
				</div>
				<div class="grid grid-cols-3 gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Year</label>
						<Input type="number" bind:value={newCitation.year} />
					</div>
					<div>
						<label class="block text-sm font-medium mb-1" for="category">Category</label>
						<select id="category" bind:value={newCitation.category} class="w-full p-2 border rounded">
							<option value="cases">Case Law</option>
							<option value="statutes">Statutes</option>
							<option value="regulations">Regulations</option>
							<option value="articles">Articles</option>
							<option value="evidence">Evidence</option>
						</select>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Pages</label>
						<Input bind:value={newCitation.pages} placeholder="e.g., 123-145" />
					</div>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1">Source</label>
					<Input bind:value={newCitation.source} placeholder="Journal, reporter, publisher" />
				</div>
				<div>
					<label class="block text-sm font-medium mb-1">URL</label>
					<Input bind:value={newCitation.url} placeholder="https://..." />
				</div>
				<div>
					<label class="block text-sm font-medium mb-1" for="notes">Notes</label><textarea id="notes"
						bind:value={newCitation.notes}
						placeholder="Brief description or notes about this citation"
						class="w-full p-2 border rounded min-h-[80px]"
					></textarea>
				</div>
				<div class="flex justify-end gap-2 pt-4">
					<Button
						class="enhanced-bits-btn nes-dialog-control n64-enhanced lod-optimized retro-cancel-btn"
						variant="ghost"
						onclick={hideAddCitationForm}
						aria-label="Cancel adding citation and close dialog"
						role="button"
						data-nes-theme="dialog-secondary"
						data-enhanced-bits="true"
					>
Cancel
</Button>
					<Button
						class="enhanced-bits-btn nes-dialog-control n64-enhanced lod-optimized retro-save-btn"
						onclick={saveCitation}
						aria-label="Save new citation to collection"
						aria-describedby="save-citation-help"
						role="button"
						data-nes-theme="dialog-primary"
						data-enhanced-bits="true"
						data-operation="save-citation"
					>
Save Citation
</Button>
					<div id="save-citation-help" class="sr-only">
						Add this citation to your legal reference collection
					</div>
				</div>
			</div>
		</div>
	{/if}
<!-- Citation Detail Modal -->
{#if showDetailModal && selectedCitation}
	<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onclick|self={hideDetailModal}>
		<div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto nes-container">
			<div class="yorha-panel-header">
				<h3 class="nes-text is-primary">{selectedCitation.title}</h3>
			</div>
			<div class="yorha-panel-content space-y-4">
				<div class="bg-muted p-4 rounded font-mono text-sm">
					{formatCitation(selectedCitation)}
				</div>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<strong>Authors:</strong> {selectedCitation.authors}
					</div>
					<div>
						<strong>Year:</strong> {selectedCitation.year}
					</div>
					<div>
						<strong>Source:</strong> {selectedCitation.source}
					</div>
					{#if selectedCitation.pages}
						<div>
							<strong>Pages:</strong> {selectedCitation.pages}
						{/if}
				</div>
				{#if selectedCitation.notes}
					<div>
						<strong>Notes:</strong>
						<p class="mt-1">{selectedCitation.notes}</p>
					{/if}
				{#if selectedCitation.tags.length > 0}
					<div>
						<strong>Tags:</strong>
						<div class="flex flex-wrap gap-1 mt-1">
							{#each Array.isArray(selectedCitation.tags) ? selectedCitation.tags : [] as tag}
								<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{tag}</span>
							{/each}
						</div>
					{/if}
				<div class="flex justify-between items-center pt-4">
					<div>
						<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">Relevance: {selectedCitation.relevanceScore}%</span>
					</div>
					<div class="flex gap-2">
						{#if selectedCitation.url}
							<Button
								class="enhanced-bits-btn nes-dialog-control n64-enhanced lod-optimized retro-external-btn"
								variant="ghost"
								onclick={() =>
window.open(selectedCitation.url, '_blank')}
								aria-label="Open citation source link in new tab"
								role="button"
								data-nes-theme="dialog-external"
								data-enhanced-bits="true"
								data-operation="open-external"
							>
								<ExternalLink class="w-4 h-4 mr-1" aria-hidden="true" role="img" aria-label="External link icon" />
								Open Link
</Button>
						{/if}
						<Button
							class="enhanced-bits-btn nes-dialog-control n64-enhanced lod-optimized retro-close-btn"
							onclick={hideDetailModal}
							aria-label="Close citation details dialog"
							role="button"
							data-nes-theme="dialog-primary"
							data-enhanced-bits="true"
						>
Close
</Button>
					</div>
				</div>
			</div>
		</div>
	{/if}
<style>
	/* Custom scrollbar for modal content */
	.overflow-y-auto {
		scrollbar-width: thi;
		scrollbar-color: hsl(var(--muted-foreground)) hsl(var(--muted));
	}
	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}
	.overflow-y-auto::-webkit-scrollbar-track {
		background: hsl(var(--muted));
	}
	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground));
		border-radius: 3px;
	}
</style>