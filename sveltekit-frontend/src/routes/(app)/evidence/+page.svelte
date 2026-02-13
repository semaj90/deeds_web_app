<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	let isDragging = $state(false);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let selectedFile = $state<File | null>(null);
	let searchQuery = $state('');
	let typeFilter = $state('all');
	let viewMode = $state<'grid' | 'list'>('grid');

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
</script>

<div class="min-h-screen bg-gray-50">
	<div class="max-w-7xl mx-auto px-4 py-8">
		<!-- Header -->
		<div class="flex items-center justify-between mb-8">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Evidence Gallery</h1>
				<p class="text-gray-500 mt-1">{data.evidence?.length ?? 0} items{data.caseId ? ` for case` : ''}</p>
			</div>
			<a href="/evidence/upload" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
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
					class={`border-2 border-dashed rounded-lg p-6 text-center transition cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}`}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					role="button"
					tabindex="0"
				>
					{#if isUploading}
						<div class="flex items-center justify-center gap-3">
							<div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
							<span class="text-gray-600">Uploading & processing...</span>
						</div>
					{:else if selectedFile}
						<div class="flex items-center justify-center gap-3">
							<span class="text-2xl">{getIcon(selectedFile.type)}</span>
							<div class="text-left">
								<p class="font-medium text-gray-900">{selectedFile.name}</p>
								<p class="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
							</div>
							<button type="submit" class="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
								Upload
							</button>
							<button type="button" onclick={() => (selectedFile = null)} class="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm">
								Cancel
							</button>
						</div>
					{:else}
						<p class="text-gray-500">Drop files here or <label class="text-blue-600 hover:underline cursor-pointer">browse<input type="file" name="file" accept=".pdf,image/*,.doc,.docx" onchange={handleFileSelect} class="hidden" /></label></p>
						<p class="text-xs text-gray-400 mt-1">PDF, images, documents (max 100MB)</p>
					{/if}
				</div>

				{#if form?.error ?? uploadError}
					<div class="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
						<p class="text-red-700 text-sm">{form?.error ?? uploadError}</p>
					</div>
				{/if}
			</form>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-4 mb-6">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search evidence..."
				class="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
			/>
			<div class="flex gap-2">
				{#each [{ value: 'all', label: 'All' }, { value: 'pdf', label: 'PDF' }, { value: 'image', label: 'Images' }, { value: 'document', label: 'Docs' }] as ft (ft.value)}
					<button
						onclick={() => (typeFilter = ft.value)}
						class={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${typeFilter === ft.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
					>
						{ft.label}
					</button>
				{/each}
			</div>
			<div class="flex gap-1 border border-gray-200 rounded-lg overflow-hidden">
				<button
					onclick={() => (viewMode = 'grid')}
					class={`px-2 py-1.5 text-xs ${viewMode === 'grid' ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'}`}
					title="Grid view"
				>Grid</button>
				<button
					onclick={() => (viewMode = 'list')}
					class={`px-2 py-1.5 text-xs ${viewMode === 'list' ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'}`}
					title="List view"
				>List</button>
			</div>
		</div>

		<!-- Evidence Gallery -->
		{#if filteredEvidence.length === 0}
			<div class="text-center py-16 bg-white rounded-lg shadow">
				<p class="text-4xl mb-4">📂</p>
				<p class="text-gray-600 text-lg">
					{searchQuery || typeFilter !== 'all' ? 'No evidence matches your filters.' : 'No evidence uploaded yet.'}
				</p>
				{#if searchQuery || typeFilter !== 'all'}
					<button onclick={() => { searchQuery = ''; typeFilter = 'all'; }} class="mt-3 text-blue-600 hover:underline text-sm">
						Clear filters
					</button>
				{/if}
			</div>
		{:else if viewMode === 'grid'}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredEvidence as doc (doc.id)}
					<div class="bg-white rounded-lg shadow hover:shadow-md transition p-5 border border-gray-100">
						<div class="flex items-start gap-3 mb-3">
							<span class="text-3xl">{getIcon(doc.fileType)}</span>
							<div class="flex-1 min-w-0">
								<h3 class="font-medium text-gray-900 truncate">{doc.title || doc.fileName}</h3>
								<p class="text-xs text-gray-400 mt-0.5">{getTypeLabel(doc.fileType)} &middot; {formatFileSize(doc.fileSize)}</p>
							</div>
						</div>
						{#if doc.description}
							<p class="text-sm text-gray-600 line-clamp-2 mb-3">{doc.description}</p>
						{/if}
						<div class="flex items-center justify-between text-xs text-gray-400">
							<span>{formatDate(doc.createdAt)}</span>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="evidenceId" value={doc.id} />
								<button type="submit" class="text-red-400 hover:text-red-600 transition" title="Delete">Remove</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="bg-white rounded-lg shadow overflow-hidden">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
							<th class="px-4 py-3">File</th>
							<th class="px-4 py-3">Type</th>
							<th class="px-4 py-3">Size</th>
							<th class="px-4 py-3">Uploaded</th>
							<th class="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredEvidence as doc (doc.id)}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<span class="text-lg">{getIcon(doc.fileType)}</span>
										<div>
											<p class="font-medium text-gray-900 text-sm">{doc.title || doc.fileName}</p>
											{#if doc.description}
												<p class="text-xs text-gray-500 truncate max-w-[300px]">{doc.description}</p>
											{/if}
										</div>
									</div>
								</td>
								<td class="px-4 py-3 text-sm text-gray-600">{getTypeLabel(doc.fileType)}</td>
								<td class="px-4 py-3 text-sm text-gray-600">{formatFileSize(doc.fileSize)}</td>
								<td class="px-4 py-3 text-sm text-gray-500">{formatDate(doc.createdAt)}</td>
								<td class="px-4 py-3 text-right">
									<form method="POST" action="?/delete" use:enhance class="inline">
										<input type="hidden" name="evidenceId" value={doc.id} />
										<button type="submit" class="text-red-400 hover:text-red-600 text-sm transition">Remove</button>
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
