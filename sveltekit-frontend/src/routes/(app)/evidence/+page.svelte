<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let isDragging = $state(false);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let selectedFile = $state<File | null>(null);
	let searchQuery = $state('');
	let typeFilter = $state('all');
	let viewMode = $state<'grid' | 'list'>('grid');

	// Backend semantic search state
	let searchMode = $state<'local' | 'semantic'>('local');
	let isSearching = $state(false);
	let semanticResults = $state<any[]>([]);
	let searchTiming = $state<Record<string, number>>({});
	let searchDebounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	const typeIcons: Record<string, string> = {
		'application/pdf': '📄',
		'image/jpeg': '🖼️',
		'image/png': '🖼️',
		'image/gif': '🖼️',
		'application/msword': '📝',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
		'text/plain': '📃',
		default: '📎'
	};

	const typeLabels: Record<string, string> = {
		'application/pdf': 'PDF',
		'image/jpeg': 'Image',
		'image/png': 'Image',
		'image/gif': 'Image',
		'application/msword': 'Document',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document',
		'text/plain': 'Text',
		default: 'File'
	};

	let filteredEvidence = $derived(
		(data.evidence ?? []).filter((doc: any) => {
			const matchesSearch = !searchQuery ||
				doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				doc.fileName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				doc.description?.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesType = typeFilter === 'all' ||
				(typeFilter === 'pdf' && doc.fileType?.includes('pdf')) ||
				(typeFilter === 'image' && doc.fileType?.startsWith('image/')) ||
				(typeFilter === 'document' && (doc.fileType?.includes('word') || doc.fileType?.includes('text')));

			return matchesSearch && matchesType;
		})
	);

	function formatFileSize(bytes: number): string {
		if (!bytes || bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(date: string | Date): string {
		if (!date) return '';
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getIcon(fileType: string): string {
		return typeIcons[fileType] ?? typeIcons.default;
	}

	function getTypeLabel(fileType: string): string {
		return typeLabels[fileType] ?? typeLabels.default;
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) {
			selectedFile = input.files[0];
			uploadError = null;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		if (event.dataTransfer?.files?.[0]) {
			selectedFile = event.dataTransfer.files[0];
			uploadError = null;
		}
	}

	// Debounced semantic search — triggers 500ms after user stops typing (3+ chars)
	$effect(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

		if (searchQuery.length >= 3) {
			searchDebounceTimer = setTimeout(() => {
				runSemanticSearch(searchQuery);
			}, 500);
		} else {
			searchMode = 'local';
			semanticResults = [];
		}
	});

	async function runSemanticSearch(query: string) {
		isSearching = true;
		searchMode = 'semantic';
		try {
			const res = await fetch('/api/evidence/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					limit: 30,
					includeContext: true
				})
			});
			if (!res.ok) {
				searchMode = 'local';
				return;
			}
			const result = await res.json();
			semanticResults = result.results ?? result.hits ?? [];
			searchTiming = result.timing ?? {};
		} catch {
			searchMode = 'local';
		} finally {
			isSearching = false;
		}
	}

	// Display items: semantic results when searching, local filter otherwise
	let displayEvidence = $derived.by(() => {
		if (searchMode === 'semantic' && semanticResults.length > 0) {
			return semanticResults;
		}
		return filteredEvidence;
	});
</script>

<div class="min-h-screen bg-panel">
	<div class="max-w-7xl mx-auto px-4 py-8">
		<!-- Header -->
		<div class="flex items-center justify-between mb-8">
			<div>
				<h1 class="text-3xl font-bold text-sand">Evidence Gallery</h1>
				<p class="text-sand/60 mt-1">{data.evidence?.length ?? 0} items{data.caseId ? ` for case` : ''}</p>
			</div>
			<a href="/evidence/upload" class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/80 transition text-sm font-medium">
				+ Upload Evidence
			</a>
		</div>

		<!-- Upload Drop Zone -->
		<div class="mb-8">
			<form
				method="POST"
				action="?/upload"
				use:enhance={() => {
					isUploading = true;
					return async ({ result }) => {
						isUploading = false;
						if (result.type === 'failure') {
							uploadError = result.data?.error as string;
						} else if (result.type === 'success') {
							selectedFile = null;
						}
						await applyAction(result);
					};
				}}
				enctype="multipart/form-data"
			>
				<div
					class={`border-2 border-dashed rounded-lg p-6 text-center transition cursor-pointer ${isDragging ? 'border-info bg-info/10' : 'border-sand/30 bg-panelSoft hover:border-sand/50'}`}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					role="button"
					tabindex="0"
				>
					{#if isUploading}
						<div class="flex items-center justify-center gap-3">
							<div class="w-5 h-5 border-2 border-info border-t-transparent rounded-full animate-spin"></div>
							<span class="text-sand/80">Uploading & processing...</span>
						</div>
					{:else if selectedFile}
						<div class="flex items-center justify-center gap-3">
							<span class="text-2xl">{getIcon(selectedFile.type)}</span>
							<div class="text-left">
								<p class="font-medium text-sand">{selectedFile.name}</p>
								<p class="text-sm text-sand/60">{formatFileSize(selectedFile.size)}</p>
							</div>
							<button type="submit" class="ml-4 px-4 py-2 bg-info text-white rounded-lg hover:bg-info/80 text-sm font-medium">
								Upload
							</button>
							<button type="button" onclick={() => (selectedFile = null)} class="px-3 py-2 text-sand/60 hover:text-sand text-sm">
								Cancel
							</button>
						</div>
					{:else}
						<p class="text-sand/60">Drop files here or <label class="text-info hover:underline cursor-pointer">browse<input type="file" name="file" accept=".pdf,image/*,.doc,.docx" onchange={handleFileSelect} class="hidden" /></label></p>
						<p class="text-xs text-sand/40 mt-1">PDF, images, documents (max 100MB)</p>
					{/if}
				</div>

				{#if form?.error ?? uploadError}
					<div class="mt-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
						<p class="text-danger text-sm">{form?.error ?? uploadError}</p>
					</div>
				{/if}
			</form>
		</div>

		<!-- Filters -->
		<div class="ev-toolbar">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search evidence (3+ chars for semantic search)..."
				class="flex-1 min-w-[200px] px-3 py-2 border border-sand/30 bg-panelSoft rounded-lg text-sm text-sand focus:outline-none focus:border-info"
			/>
			{#if isSearching}
				<span class="text-xs text-info">Searching...</span>
			{:else if searchMode === 'semantic' && semanticResults.length > 0}
				<span class="text-xs text-accent">{semanticResults.length} semantic results ({searchTiming.total_ms ?? '?'}ms)</span>
			{/if}
			<div class="ev-filter-bar">
				{#each [{ value: 'all', label: 'All' }, { value: 'pdf', label: 'PDF' }, { value: 'image', label: 'Images' }, { value: 'document', label: 'Docs' }] as ft (ft.value)}
					<button
						onclick={() => (typeFilter = ft.value)}
						class="ev-filter-btn"
						class:active={typeFilter === ft.value}
					>
						{ft.label}
					</button>
				{/each}
			</div>
			<div class="ev-view-toggle">
				<button
					onclick={() => (viewMode = 'grid')}
					class="ev-view-btn"
					class:active={viewMode === 'grid'}
					title="Grid view"
				>Grid</button>
				<button
					onclick={() => (viewMode = 'list')}
					class="ev-view-btn"
					class:active={viewMode === 'list'}
					title="List view"
				>List</button>
			</div>
		</div>

		<!-- Evidence Gallery -->
		{#if displayEvidence.length === 0}
			<div class="text-center py-16 bg-panelSoft rounded-lg border border-sand/20">
				<p class="text-4xl mb-4">📂</p>
				<p class="text-sand/80 text-lg">
					{searchQuery || typeFilter !== 'all' ? 'No evidence matches your filters.' : 'No evidence uploaded yet.'}
				</p>
				{#if searchQuery || typeFilter !== 'all'}
					<button onclick={() => { searchQuery = ''; typeFilter = 'all'; }} class="mt-3 text-info hover:underline text-sm">
						Clear filters
					</button>
				{/if}
			</div>
		{:else if viewMode === 'grid'}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each displayEvidence as doc (doc.id)}
					<div class="bg-panelSoft rounded-lg hover:shadow-md transition p-5 border border-sand/20">
						<div class="flex items-start gap-3 mb-3">
							<span class="text-3xl">{getIcon(doc.fileType ?? doc.file_type ?? '')}</span>
							<div class="flex-1 min-w-0">
								<h3 class="font-medium text-sand truncate">{doc.title || doc.fileName || doc.file_name || ''}</h3>
								<p class="text-xs text-sand/40 mt-0.5">{getTypeLabel(doc.fileType ?? doc.file_type ?? '')} &middot; {formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}</p>
							</div>
							{#if doc.similarity !== undefined}
								<span class="ev-score" class:high={doc.similarity >= 0.7} class:medium={doc.similarity >= 0.4 && doc.similarity < 0.7} class:low={doc.similarity < 0.4}>
									{Math.round(doc.similarity * 100)}%
								</span>
							{/if}
						</div>
						{#if doc.description || doc.content}
							<p class="text-sm text-sand/80 line-clamp-2 mb-3">{doc.description || doc.content}</p>
						{/if}
						<div class="flex items-center justify-between text-xs text-sand/40">
							<span>{formatDate(doc.createdAt ?? doc.created_at)}</span>
							{#if !doc.similarity}
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="evidenceId" value={doc.id} />
									<button type="submit" class="text-danger/60 hover:text-danger transition" title="Delete">Remove</button>
								</form>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="bg-panelSoft rounded-lg border border-sand/20 overflow-hidden">
				<table class="w-full">
					<thead>
						<tr class="border-b border-sand/20 text-left text-xs font-medium text-sand/60 uppercase tracking-wider">
							<th class="px-4 py-3">File</th>
							<th class="px-4 py-3">Type</th>
							<th class="px-4 py-3">Size</th>
							<th class="px-4 py-3">Uploaded</th>
							<th class="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each displayEvidence as doc (doc.id)}
							<tr class="border-b border-sand/10 hover:bg-panel/50">
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<span class="text-lg">{getIcon(doc.fileType)}</span>
										<div>
											<p class="font-medium text-sand text-sm">{doc.title || doc.fileName}</p>
											{#if doc.description}
												<p class="text-xs text-sand/60 truncate max-w-[300px]">{doc.description}</p>
											{/if}
										</div>
									</div>
								</td>
								<td class="px-4 py-3 text-sm text-sand/80">{getTypeLabel(doc.fileType)}</td>
								<td class="px-4 py-3 text-sm text-sand/80">{formatFileSize(doc.fileSize)}</td>
								<td class="px-4 py-3 text-sm text-sand/60">{formatDate(doc.createdAt)}</td>
								<td class="px-4 py-3 text-right">
									<form method="POST" action="?/delete" use:enhance class="inline">
										<input type="hidden" name="evidenceId" value={doc.id} />
										<button type="submit" class="text-danger/60 hover:text-danger text-sm transition">Remove</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<style>
	.ev-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.ev-toolbar input {
		flex: 1;
		min-width: 200px;
	}
	.ev-filter-bar {
		display: flex;
		gap: 6px;
	}
	.ev-filter-btn {
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.8);
		background: #2f2a22;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-filter-btn:hover {
		background: rgba(212, 199, 163, 0.1);
	}
	.ev-filter-btn.active {
		background: #38bdf8;
		color: white;
	}
	.ev-view-toggle {
		display: flex;
		gap: 1px;
		border: 1px solid rgba(212, 199, 163, 0.2);
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.ev-view-btn {
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.6);
		background: #2f2a22;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-view-btn:hover {
		background: rgba(212, 199, 163, 0.1);
	}
	.ev-view-btn.active {
		background: rgba(212, 199, 163, 0.2);
		color: #d4c7a3;
	}
	.ev-score {
		flex-shrink: 0;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.625rem;
		font-weight: 600;
	}
	.ev-score.high {
		background: rgba(72, 187, 120, 0.15);
		color: #48bb78;
	}
	.ev-score.medium {
		background: rgba(236, 201, 75, 0.15);
		color: #ecc94b;
	}
	.ev-score.low {
		background: rgba(245, 101, 101, 0.15);
		color: #f56565;
	}
</style>