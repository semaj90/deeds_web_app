<script lang="ts">
	import TagDetailView from '$lib/components/codebase/TagDetailView.svelte';
	import CategoryFilter from '$lib/components/codebase/CategoryFilter.svelte';
	import NodeDetailPanel from '$lib/components/codebase/NodeDetailPanel.svelte';
	import ClusterVisualization from '$lib/components/codebase/ClusterVisualization.svelte';
	import YoRHaTable from '$lib/components/yorha/YoRHaTable.svelte';
	import SemanticSearch from '$lib/components/codebase/SemanticSearch.svelte';
	import TagRenameDialog from '$lib/components/codebase/TagRenameDialog.svelte';
	import TagSelector from '$lib/components/admin/TagSelector.svelte';
	import DiffViewer from '$lib/components/ui/DiffViewer.svelte';
	import GraphExport from '$lib/components/codebase/GraphExport.svelte';

	let { data } = $props();

	// Native $state-based tabs (avoids bits-ui Tabs namespace SSR bug)
	let activeTab = $state<'qdrant' | 'postgres' | 'timeline' | 'clusters'>('qdrant');
	let selectedCollection = $state<string | null>(null);
	let searchQuery = $state('');
	let selectedTag = $state<any>(null);
	let showFilters = $state(false);
	let filterSelections = $state<Record<string, string[]>>({});
	let showYoRHaTable = $state(false);
	let showSemanticSearch = $state(false);
	let showTagRename = $state(false);
	let tagToRename = $state<any>(null);
	let showTagSelector = $state(false);
	let selectedTagIds = $state<string[]>([]);
	let showDiffViewer = $state(false);
	let diffOriginal = $state('');
	let diffModified = $state('');
	let showGraphExport = $state(false);

	// Build filter groups from data
	let filterGroups = $derived.by(() => {
		const embeddings = data.postgres?.embeddings ?? [];
		const typeCounts: Record<string, number> = {};
		const errorCounts: Record<string, number> = { '0': 0, '1-5': 0, '6+': 0 };

		for (const e of embeddings) {
			const ext = (e.source ?? '').split('.').pop() ?? 'unknown';
			typeCounts[ext] = (typeCounts[ext] ?? 0) + 1;
			const ec = e.error_count ?? 0;
			if (ec === 0) errorCounts['0']++;
			else if (ec <= 5) errorCounts['1-5']++;
			else errorCounts['6+']++;
		}

		return [
			{
				id: 'fileType',
				label: 'File Type',
				options: Object.entries(typeCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 8)
					.map(([ext, count]) => ({ value: ext, label: `.${ext}`, count })),
				multiple: true
			},
			{
				id: 'errorRange',
				label: 'Error Count',
				options: [
					{ value: '0', label: 'No Errors', count: errorCounts['0'] },
					{ value: '1-5', label: '1-5 Errors', count: errorCounts['1-5'] },
					{ value: '6+', label: '6+ Errors', count: errorCounts['6+'] }
				],
				multiple: true
			}
		];
	});

	// Filter embeddings based on search + category filters
	const filteredEmbeddings = $derived.by(() => {
		let items = data.postgres?.embeddings ?? [];

		if (searchQuery) {
			items = items.filter((e: any) =>
				e.source?.toLowerCase().includes(searchQuery.toLowerCase())
			);
		}

		const typeFilter = filterSelections['fileType'] ?? [];
		if (typeFilter.length > 0) {
			items = items.filter((e: any) => {
				const ext = (e.source ?? '').split('.').pop() ?? '';
				return typeFilter.includes(ext);
			});
		}

		const errorFilter = filterSelections['errorRange'] ?? [];
		if (errorFilter.length > 0) {
			items = items.filter((e: any) => {
				const ec = e.error_count ?? 0;
				if (errorFilter.includes('0') && ec === 0) return true;
				if (errorFilter.includes('1-5') && ec >= 1 && ec <= 5) return true;
				if (errorFilter.includes('6+') && ec >= 6) return true;
				return false;
			});
		}

		return items;
	});

	const qdrantCollections = $derived(data.qdrant?.collections ?? []);
	const timelineItems = $derived(data.postgres?.timeline ?? []);
	const stats = $derived(data.postgres?.stats ?? {});
	const totalPoints = $derived(data.qdrant?.totalPoints ?? 0);

	// Build sample clusters from embedding data
	let clusters = $derived.by(() => {
		const embeddings = data.postgres?.embeddings ?? [];
		const byDir: Record<string, any[]> = {};
		for (const e of embeddings) {
			const parts = (e.source ?? '').split('/');
			const dir = parts.length > 2 ? parts.slice(0, -1).join('/') : 'root';
			if (!byDir[dir]) byDir[dir] = [];
			byDir[dir].push(e);
		}

		return Object.entries(byDir)
			.filter(([, items]) => items.length >= 2)
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, 12)
			.map(([dir, items], i) => {
				const errors = items.reduce((s: number, e: any) => s + (e.error_count ?? 0), 0);
				const codes = items.flatMap((e: any) => e.error_codes ?? []);
				const topCode = codes.length > 0 ? codes.sort()[Math.floor(codes.length / 2)] : 'none';
				return {
					id: `cluster-${i}`,
					name: dir.split('/').pop() ?? dir,
					dominantCode: topCode,
					memberCount: items.length,
					summary: `${items.length} files in ${dir} with ${errors} total errors`,
					topFiles: items.slice(0, 5).map((e: any) => e.source ?? ''),
					surface: [...new Set(items.map((e: any) => {
						const src = e.source ?? '';
						if (src.includes('/routes/')) return 'routes';
						if (src.includes('/components/')) return 'components';
						if (src.includes('/stores/')) return 'stores';
						if (src.includes('/services/')) return 'services';
						if (src.includes('/api/')) return 'api';
						return 'utils';
					}))],
					tech: []
				};
			});
	});

	const tabs = [
		{ id: 'qdrant' as const, label: 'Qdrant Collections', icon: '' },
		{ id: 'postgres' as const, label: 'PostgreSQL Embeddings', icon: '' },
		{ id: 'timeline' as const, label: 'File Timeline', icon: '' },
		{ id: 'clusters' as const, label: 'Clusters', icon: '' },
	];
</script>

<div class="mx-auto max-w-[1400px] p-6">
	<!-- Header -->
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-black uppercase tracking-wide">Codebase Viewer</h1>
		<p class="mt-1 text-sm text-black/60">
			Indexed embeddings &bull; Tagged files &bull; Vector database explorer
		</p>
		<div class="flex gap-2 mt-3">
			<button
				onclick={() => (showSemanticSearch = !showSemanticSearch)}
				class="cv-tab" style="margin-bottom: 0; border-radius: 0.375rem;"
			>
				{showSemanticSearch ? 'Hide Semantic Search' : 'Semantic Search'}
			</button>
			<button
				onclick={() => (showTagSelector = !showTagSelector)}
				class="cv-tab" style="margin-bottom: 0; border-radius: 0.375rem;"
			>
				{showTagSelector ? 'Hide Tag Selector' : 'Tag Selector'}
			</button>
			<button
				onclick={() => (showDiffViewer = !showDiffViewer)}
				class="cv-tab" style="margin-bottom: 0; border-radius: 0.375rem;"
			>
				{showDiffViewer ? 'Hide Diff Viewer' : 'Diff Viewer'}
			</button>
			<button
				onclick={() => (showGraphExport = !showGraphExport)}
				class="cv-tab" style="margin-bottom: 0; border-radius: 0.375rem;"
			>
				{showGraphExport ? 'Hide Export' : 'Graph Export'}
			</button>
		</div>
	</header>

	{#if showSemanticSearch}
		<div class="mb-6">
			<SemanticSearch
				placeholder="Semantic search across codebase embeddings..."
				onSelect={(result) => { searchQuery = result.filePath.split('/').pop() ?? ''; activeTab = 'postgres'; showSemanticSearch = false; }}
				onSearch={(q) => { searchQuery = q; }}
			/>
		</div>
	{/if}

	{#if showTagSelector}
		<div class="mb-6 p-4 rounded-lg border-2 border-black/20 bg-panel">
			<h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">Tag Selector (Jurisdiction-based)</h3>
			<TagSelector
				selectedTags={selectedTagIds}
				jurisdiction="US-Federal"
				onChange={(ids) => { selectedTagIds = ids; }}
			/>
		</div>
	{/if}

	<!-- Stats Grid -->
	<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex items-center gap-3 rounded-lg border-2 border-info bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">🔢</span>
			<div>
				<div class="text-xl font-bold text-black">{totalPoints.toLocaleString()}</div>
				<div class="text-xs uppercase tracking-wide text-black/60">Qdrant Vectors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-accent bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">📁</span>
			<div>
				<div class="text-xl font-bold text-black">{stats.total_files || 0}</div>
				<div class="text-xs uppercase tracking-wide text-black/60">Indexed Files</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-warning bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">🧬</span>
			<div>
				<div class="text-xl font-bold text-black">{stats.total_errors || 0}</div>
				<div class="text-xs uppercase tracking-wide text-black/60">Total Errors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-info bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">📊</span>
			<div>
				<div class="text-xl font-bold text-black">
					{(stats.embedding_coverage || 0).toFixed(1)}%
				</div>
				<div class="text-xs uppercase tracking-wide text-black/60">Embedding Coverage</div>
			</div>
		</div>
	</div>

	<!-- Tabbed View (native $state tabs) -->
	<div class="w-full">
		<div class="cv-tab-bar" role="tablist">
			{#each tabs as tab}
				<button
					role="tab"
					class="cv-tab"
					class:active={activeTab === tab.id}
					aria-selected={activeTab === tab.id}
					onclick={() => activeTab = tab.id}
				>
					{tab.icon} {tab.label}
				</button>
			{/each}
		</div>

		<!-- Qdrant Collections Tab -->
		{#if activeTab === 'qdrant'}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each qdrantCollections as collection}
					<button
						type="button"
						class="w-full rounded-lg border-2 bg-panel p-4 text-left transition hover:border-info hover:shadow-md {selectedCollection === collection.name ? 'border-info bg-info/10' : 'border-black/20'}"
						onclick={() => selectedCollection = collection.name}
					>
						<div class="mb-3 flex items-center justify-between">
							<h3 class="font-semibold text-black">{collection.name}</h3>
							<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
								{collection.status}
							</span>
						</div>

						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span class="text-black/60">Points:</span>
								<span class="font-semibold text-black">{collection.pointsCount.toLocaleString()}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-black/60">Vector Size:</span>
								<span class="font-semibold text-black">{collection.vectorSize}d</span>
							</div>
						</div>
					</button>
				{/each}

				{#if qdrantCollections.length === 0}
					<div class="col-span-full rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
						No Qdrant collections found. Is Qdrant running on port 6333?
					</div>
				{/if}
			</div>
		{/if}

		<!-- PostgreSQL Embeddings Tab -->
		{#if activeTab === 'postgres'}
			<!-- Search + Filter Bar -->
			<div class="mb-4 flex gap-3 items-center">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search files..."
					class="flex-1 rounded-lg border-2 border-black/20 bg-panel px-4 py-2 text-black placeholder-black/40 transition focus:border-accent focus:outline-none"
				/>
				<button
					onclick={() => (showFilters = !showFilters)}
					class="cv-tab {showFilters ? 'active' : ''}"
					style="margin-bottom: 0; border-radius: 0.375rem;"
				>
					{showFilters ? 'Hide Filters' : 'Filters'}
				</button>
			</div>

			{#if showFilters}
				<div class="mb-4">
					<CategoryFilter
						groups={filterGroups}
						selected={filterSelections}
						onChange={(sel) => { filterSelections = sel; }}
						compact={false}
					/>
				</div>
			{/if}

			<div class="mb-2 text-xs text-black/40">{filteredEmbeddings.length} files shown</div>

			<div class="overflow-hidden rounded-lg border-2 border-black/20 bg-panel">
				<table class="w-full border-collapse">
					<thead>
						<tr class="border-b-2 border-black/20 bg-sand/10">
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">File Path</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Error Count</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Error Codes</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Last Indexed</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredEmbeddings as embedding}
							<tr class="border-b border-black/10 transition hover:bg-sand/5 cursor-pointer" onclick={() => { selectedTag = { id: embedding.id ?? embedding.source, name: embedding.source?.split('/').pop() ?? 'unknown', filePath: embedding.source ?? '', type: embedding.source?.endsWith('.svelte') ? 'component' : embedding.source?.includes('/routes/') ? 'route' : 'util', category: embedding.source?.includes('/routes/') ? 'route' : 'component', errorCount: embedding.error_count ?? 0, createdAt: embedding.last_indexed ?? new Date().toISOString(), updatedAt: embedding.last_indexed ?? new Date().toISOString() }; }}>
								<td class="p-3">
									<code class="rounded bg-sand/10 px-2 py-0.5 text-xs text-black">{embedding.source}</code>
								</td>
								<td class="p-3">
									<span class="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
										{embedding.error_count}
									</span>
								</td>
								<td class="p-3">
									{#each (embedding.error_codes || []) as code}
										<span class="mr-1 mb-1 inline-block rounded bg-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger">
											{code}
										</span>
									{/each}
								</td>
								<td class="p-3 text-xs text-black/60">
									{embedding.last_indexed
										? new Date(embedding.last_indexed).toLocaleString()
										: 'Never'}
								</td>
							</tr>
						{/each}

						{#if filteredEmbeddings.length === 0}
							<tr>
								<td colspan="4" class="p-8 text-center text-black/40">
									{searchQuery ? `No files matching "${searchQuery}"` : 'No embeddings found. Is PostgreSQL running?'}
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		{/if}

		<!-- Tag Detail Panel -->
		{#if selectedTag && activeTab === 'postgres'}
			<div class="mt-4 flex gap-4 flex-wrap">
				<TagDetailView tag={selectedTag} onClose={() => { selectedTag = null; }} />
				<button
					class="cv-tab" style="margin-bottom: 0; border-radius: 0.375rem; align-self: flex-start;"
					onclick={() => { tagToRename = selectedTag; showTagRename = true; }}
				>
					Rename Tag
				</button>
				<NodeDetailPanel
					node={selectedTag ? {
						id: selectedTag.id ?? '',
						label: selectedTag.name ?? 'Unknown',
						type: selectedTag.type ?? 'util',
						errorCount: selectedTag.errorCount ?? 0,
						filePath: selectedTag.filePath ?? '',
						cluster: selectedTag.category ?? undefined,
						imports: [],
						exports: [],
						functions: []
					} : null}
					onClose={() => { selectedTag = null; }}
					onViewErrors={(fp) => { searchQuery = fp.split('/').pop() ?? ''; }}
					onViewFile={(fp) => { searchQuery = fp.split('/').pop() ?? ''; }}
				/>
			</div>
		{/if}

		<!-- Timeline Tab -->
		{#if activeTab === 'timeline'}
			<div class="relative pl-8">
				{#each timelineItems as item, i}
					<div class="relative mb-6 pl-6">
						<!-- Marker -->
						<div class="absolute left-0 top-2 h-3 w-3 rounded-full border-2 border-panel bg-accent shadow-[0_0_0_2px] shadow-accent/40"></div>

						<!-- Line -->
						{#if i < timelineItems.length - 1}
							<div class="absolute left-[5px] top-5 bottom--4 w-0.5 bg-black/20"></div>
						{/if}

						<!-- Content -->
						<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
							<h4 class="mb-2 font-semibold text-black">{item.file_path}</h4>
							<div class="flex flex-wrap gap-2">
								{#if item.indexed_at}
									<span class="rounded-md bg-info/20 px-3 py-1 text-xs font-medium text-info">
										Indexed: {new Date(item.indexed_at).toLocaleString()}
									</span>
								{/if}
								{#if item.tagged_at}
									<span class="rounded-md bg-warning/20 px-3 py-1 text-xs font-medium text-warning">
										Tagged: {new Date(item.tagged_at).toLocaleString()}
									</span>
								{/if}
								{#if item.edited_at}
									<span class="rounded-md bg-accent/20 px-3 py-1 text-xs font-medium text-accent">
										Edited: {new Date(item.edited_at).toLocaleString()}
									</span>
								{/if}
								{#if item.analyzed_at}
									<span class="rounded-md bg-info/20 px-3 py-1 text-xs font-medium text-info">
										Analyzed: {new Date(item.analyzed_at).toLocaleString()}
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}

				{#if timelineItems.length === 0}
					<div class="rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
						No timeline data available.
					</div>
				{/if}
			</div>
		{/if}

		<!-- Clusters Tab -->
		{#if activeTab === 'clusters'}
			<ClusterVisualization
				{clusters}
				selectedClusterId={null}
				onSelectCluster={(cluster) => {
					activeTab = 'postgres';
					searchQuery = cluster.topFiles[0]?.split('/').slice(0, -1).join('/').split('/').pop() ?? '';
				}}
				layout="grid"
			/>
		{/if}
	</div>
</div>

<!-- Diff Viewer -->
{#if showDiffViewer}
	<div class="mb-6 p-4 rounded-lg border-2 border-black/20 bg-panel">
		<h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">Code Diff Viewer</h3>
		<div class="flex gap-2 mb-3">
			<textarea
				bind:value={diffOriginal}
				placeholder="Paste original code here..."
				class="flex-1 min-h-[120px] p-2 bg-black/30 border-2 border-black/20 rounded text-black text-xs font-mono placeholder:text-black/30 focus:border-accent focus:outline-none"
			></textarea>
			<textarea
				bind:value={diffModified}
				placeholder="Paste modified code here..."
				class="flex-1 min-h-[120px] p-2 bg-black/30 border-2 border-black/20 rounded text-black text-xs font-mono placeholder:text-black/30 focus:border-accent focus:outline-none"
			></textarea>
		</div>
		{#if diffOriginal || diffModified}
			<DiffViewer original={diffOriginal} modified={diffModified} language="typescript" />
		{/if}
	</div>
{/if}

<!-- Graph Export -->
{#if showGraphExport}
	<div class="mb-6 p-4 rounded-lg border-2 border-black/20 bg-panel">
		<h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">Graph Export</h3>
		<GraphExport
			nodes={(data.postgres?.embeddings ?? []).map((e: any) => ({ id: e.id ?? String(Math.random()), label: (e.source ?? '').split('/').pop() ?? 'unknown', type: (e.source ?? '').split('.').pop() ?? 'file', errorCount: e.error_count ?? 0, filePath: e.source ?? '' }))}
			edges={[]}
			filename="codebase-embeddings"
		/>
	</div>
{/if}

<!-- Tag Rename Dialog -->
<TagRenameDialog
	tag={tagToRename}
	isOpen={showTagRename}
	onClose={() => { showTagRename = false; tagToRename = null; }}
	onRename={async (oldName, newName) => { console.log(`Rename: ${oldName} → ${newName}`); showTagRename = false; tagToRename = null; return true; }}
/>

<style>
	.cv-tab-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 1rem;
		border-bottom: 2px solid rgba(0, 0, 0, 0.2);
	}
	.cv-tab {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem 0.375rem 0 0;
		font-size: 0.875rem;
		text-transform: uppercase;
		color: rgba(0, 0, 0, 0.6);
		background: rgba(212, 199, 163, 0.2);
		cursor: pointer;
		transition: all 0.15s;
		font-weight: 600;
	}
	.cv-tab:hover {
		color: #000;
		background: rgba(212, 199, 163, 0.3);
	}
	.cv-tab.active {
		border-bottom: 2px solid #4ade80;
		color: #4ade80;
		background: rgba(212, 199, 163, 0.4);
		font-weight: 700;
	}
</style>