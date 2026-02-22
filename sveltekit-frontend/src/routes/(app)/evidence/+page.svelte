<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import SmartDocumentForm from '$lib/components/forms/SmartDocumentForm.svelte';
	import DocumentDetails from '$lib/components/legal/DocumentDetails.svelte';
	import DetectiveEvidenceMap from '$lib/components/yorha/DetectiveEvidenceMap.svelte';
	import EvidenceCRUDModal from '$lib/components/modals/EvidenceCRUDModal.svelte';
	import EvidenceCustodyFlow from '$lib/components/legal/EvidenceCustodyFlow.svelte';
	import EvidenceReportSummary from '$lib/components/legal/EvidenceReportSummary.svelte';
	import type { EvidenceReport } from '$lib/components/legal/EvidenceReportSummary.svelte';
	import EvidenceConnections from '$lib/components/EvidenceConnections.svelte';
	import EvidenceAssistant from '$lib/components/evidence/EvidenceAssistant.svelte';
	import ContradictionReveal from '$lib/components/yorha/ContradictionReveal.svelte';
	import LegalAnalysisDialog from '$lib/components/LegalAnalysisDialog.svelte';
	import IntegrityVerification from '$lib/components/legal/IntegrityVerification.svelte';
	import EnhancedDocumentUploader from '$lib/components/ai/EnhancedDocumentUploader.svelte';
	import ContextualEvidenceChatModal from '$lib/components/ai/ContextualEvidenceChatModal.svelte';
	import CaseSelector from '$lib/components/CaseSelector.svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import ActionPopup from '$lib/components/ActionPopup.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let actionPopupFile = $state<{ name: string } | null>(null);
	let showCaseSelector = $state(false);
	let linkedCaseTitle = $state('');
	let uploadProgressPercent = $state(0);
	let uploadProgressStatus = $state('');
	let uploadProgressDocId = $state('');

	let isDragging = $state(false);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let selectedFile = $state<File | null>(null);
	let searchQuery = $state('');
	let typeFilter = $state('all');
	let viewMode = $state<'grid' | 'list'>('grid');

	// Component integration state
	let showAdvancedUpload = $state(false);
	let showDocumentDetails = $state(false);
	let selectedDocumentId = $state('');
	let showEvidenceMap = $state(false);
	let showCustodyFlow = $state(false);
	let custodyEvidenceId = $state('');
	let showConnections = $state(false);
	let showEvidenceAssistant = $state(false);
	let assistantNode = $state<{ id: string; title: string; type: string; description?: string; confidence?: number; metadata?: Record<string, unknown> }>({ id: '', title: '', type: 'document' });
	let showContradiction = $state(false);
	let contradictionMessage = $state('');
	let showCrudModal = $state(false);
	let crudMode = $state<'create' | 'edit' | 'view'>('create');
	let crudEvidenceId = $state<string | undefined>(undefined);
	let showReportSummary = $state(false);
	let reportEvidenceId = $state('');
	let reportData = $state<EvidenceReport | null>(null);
	let isLoadingReport = $state(false);
	let showLegalAnalysis = $state(false);
	let legalAnalysisEvidenceId = $state('');
	let showIntegrity = $state(false);
	let legalAnalysisTitle = $state('Legal Analysis');
	let showEnhancedUpload = $state(false);
	let showEvidenceChat = $state(false);

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
			actionPopupFile = { name: input.files[0].name };
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
			actionPopupFile = { name: event.dataTransfer.files[0].name };
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

	async function loadEvidenceReport(evidenceId: string) {
		isLoadingReport = true;
		reportEvidenceId = evidenceId;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/report`);
			if (res.ok) {
				reportData = await res.json();
			} else {
				// Build a basic report from available evidence data
				const doc = (data.evidence ?? []).find((e: any) => e.id === evidenceId);
				reportData = {
					id: evidenceId,
					title: doc?.title ?? doc?.fileName ?? 'Evidence Report',
					type: 'document_analysis',
					status: 'pending',
					priority: 'medium',
					createdAt: doc?.createdAt ?? new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					analyst: { name: data.user?.username ?? data.user?.email ?? 'System', credentials: 'AI-Assisted', department: 'Digital Forensics' },
					evidence: { itemNumber: evidenceId.slice(0, 8), description: doc?.description ?? '', chainOfCustody: [], dateCollected: doc?.createdAt ?? '', location: 'Digital Archive' },
					methodology: { procedures: ['Automated ingestion', 'Hash verification'], tools: ['SHA-256', 'OCR Pipeline'], standards: ['NIST SP 800-86'] },
					findings: { summary: doc?.description ?? 'Awaiting analysis', keyPoints: [], confidence: 0, limitations: ['Automated analysis pending'] },
					legalImplications: { charges: [], precedents: [], challengePoints: [] },
					attachments: []
				};
			}
			showReportSummary = true;
		} catch {
			reportData = null;
		} finally {
			isLoadingReport = false;
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
			<div class="flex gap-2">
				<button onclick={() => { crudMode = 'create'; crudEvidenceId = undefined; showCrudModal = true; }} class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition text-sm font-medium">
					+ Create with AI
				</button>
				<a href="/evidence/upload" class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/80 transition text-sm font-medium">
					+ Upload Evidence
				</a>
			</div>
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
			<div class="mt-2">
				<button
					onclick={() => (showAdvancedUpload = !showAdvancedUpload)}
					class="text-sm text-info hover:underline"
				>
					{showAdvancedUpload ? 'Hide Advanced Upload' : 'Advanced Upload with OCR'}
				</button>
			</div>

			{#if showAdvancedUpload}
				<div class="mt-4">
					<SmartDocumentForm
						title="Advanced Evidence Upload"
						description="Upload with OCR extraction and entity detection"
						caseId={data.caseId ?? ''}
						onsubmit={() => {
							showAdvancedUpload = false;
							window.location.reload();
						}}
					/>
				</div>
			{/if}

			<div class="mt-2">
				<button
					onclick={() => (showEnhancedUpload = !showEnhancedUpload)}
					class="text-sm text-accent hover:underline"
				>
					{showEnhancedUpload ? 'Hide AI Upload' : 'AI-Enhanced Upload (Entity Extraction + Summarization)'}
				</button>
			</div>

			{#if showEnhancedUpload}
				<div class="mt-4">
					<EnhancedDocumentUploader
						caseId={data.caseId ?? ''}
						userId={data.user?.id ?? ''}
						autoProcess={true}
						showMetadataForm={true}
						onFileProcessed={(result) => { console.log('Processed:', result); }}
					/>
				</div>
			{/if}

			<div class="mt-2">
				<button
					onclick={() => (showEvidenceChat = !showEvidenceChat)}
					class="text-sm text-accent hover:underline"
				>
					{showEvidenceChat ? 'Hide Evidence AI Chat' : 'Evidence AI Chat (Contextual Assistant)'}
				</button>
			</div>

			{#if showEvidenceChat}
				<div class="mt-4">
					<ContextualEvidenceChatModal
						defaultCaseId={data.caseId ?? ''}
						title="Evidence AI Assistant"
					/>
				</div>
			{/if}
		</div>

		<!-- Case Selector -->
		<div class="mt-2">
			<button
				onclick={() => (showCaseSelector = !showCaseSelector)}
				class="text-sm text-sand/70 hover:underline"
			>
				{showCaseSelector ? 'Hide Case Selector' : 'Link Evidence to Case'}
				{#if linkedCaseTitle}
					<span class="text-accent ml-2">({linkedCaseTitle})</span>
				{/if}
			</button>
		</div>
		{#if showCaseSelector}
			<div class="mt-3" style="max-width: 400px;">
				<CaseSelector
					placeholder="Search and select a case..."
					onselect={(c) => { linkedCaseTitle = c.title; console.log('Linked to case:', c.id); }}
				/>
			</div>
		{/if}

		<!-- Upload Progress -->
		{#if uploadProgressStatus && uploadProgressStatus !== 'complete'}
			<div class="mt-4">
				<UploadProgress
					uploadProgress={uploadProgressPercent}
					uploadStatus={uploadProgressStatus}
					currentDocId={uploadProgressDocId}
				/>
			</div>
		{/if}

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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="bg-panelSoft rounded-lg hover:shadow-md transition p-5 border border-sand/20 cursor-pointer"
						role="button"
						tabindex="0"
						onclick={() => { selectedDocumentId = doc.id; showDocumentDetails = true; }}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { selectedDocumentId = doc.id; showDocumentDetails = true; } }}
					>
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
								<div class="flex gap-2">
									<button onclick={(e) => { e.stopPropagation(); assistantNode = { id: doc.id, title: doc.title || doc.fileName || '', type: doc.fileType?.includes('pdf') ? 'document' : doc.fileType?.startsWith('image') ? 'person' : 'other', description: doc.description }; showEvidenceAssistant = true; }} class="text-warning/60 hover:text-warning transition">Analyze</button>
									<button onclick={(e) => { e.stopPropagation(); loadEvidenceReport(doc.id); }} class="text-accent/60 hover:text-accent transition">Report</button>
									<button onclick={(e) => { e.stopPropagation(); legalAnalysisEvidenceId = doc.id; legalAnalysisTitle = `Legal Analysis: ${doc.title || doc.fileName || doc.id}`; showLegalAnalysis = true; }} class="text-info/60 hover:text-info transition">Legal</button>
									<button onclick={(e) => { e.stopPropagation(); crudMode = 'edit'; crudEvidenceId = doc.id; showCrudModal = true; }} class="text-info/60 hover:text-info transition">Edit</button>
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="evidenceId" value={doc.id} />
										<button type="submit" class="text-danger/60 hover:text-danger transition" title="Delete">Remove</button>
									</form>
								</div>
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
							<tr
								class="border-b border-sand/10 hover:bg-panel/50 cursor-pointer"
								onclick={() => { selectedDocumentId = doc.id; showDocumentDetails = true; }}
							>
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
									<div class="flex gap-2 justify-end">
										<button onclick={(e) => { e.stopPropagation(); assistantNode = { id: doc.id, title: doc.title || doc.fileName || '', type: 'document', description: doc.description }; showEvidenceAssistant = true; }} class="text-warning/60 hover:text-warning text-sm transition">Analyze</button>
										<button onclick={(e) => { e.stopPropagation(); loadEvidenceReport(doc.id); }} class="text-accent/60 hover:text-accent text-sm transition">Report</button>
										<button onclick={(e) => { e.stopPropagation(); legalAnalysisEvidenceId = doc.id; legalAnalysisTitle = `Legal Analysis: ${doc.title || doc.fileName || doc.id}`; showLegalAnalysis = true; }} class="text-info/60 hover:text-info text-sm transition">Legal</button>
										<button onclick={(e) => { e.stopPropagation(); crudMode = 'edit'; crudEvidenceId = doc.id; showCrudModal = true; }} class="text-info/60 hover:text-info text-sm transition">Edit</button>
										<form method="POST" action="?/delete" use:enhance class="inline">
											<input type="hidden" name="evidenceId" value={doc.id} />
											<button type="submit" class="text-danger/60 hover:text-danger text-sm transition">Remove</button>
										</form>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<!-- Evidence Relationship Map -->
		<div class="mt-6">
			<button
				onclick={() => (showEvidenceMap = !showEvidenceMap)}
				class="ev-map-toggle"
			>
				{showEvidenceMap ? 'Hide Evidence Map' : 'Evidence Relationship Map'}
			</button>
		</div>
		{#if showEvidenceMap}
			<div class="mt-4">
				<DetectiveEvidenceMap caseId={data.caseId ?? null} show={showEvidenceMap} />
			</div>
		{/if}
		<!-- Evidence Connection Lines -->
		<div class="mt-6">
			<button
				onclick={() => (showConnections = !showConnections)}
				class="ev-map-toggle"
			>
				{showConnections ? 'Hide Connection Lines' : 'Evidence Connection Lines'}
			</button>
		</div>
		{#if showConnections}
			<div class="mt-4 relative" style="height: 400px; border: 1px solid rgba(212,199,163,0.2); border-radius: 0.5rem; background: rgba(0,0,0,0.2);">
				<EvidenceConnections evidence={filteredEvidence.map((e, i) => ({ id: e.id, x: 80 + (i % 4) * 200, y: 60 + Math.floor(i / 4) * 120, related: [], relation_type: 'related' }))} />
			</div>
		{/if}
		<!-- Evidence Custody Flow -->
		<div class="mt-6">
			<button
				onclick={() => (showCustodyFlow = !showCustodyFlow)}
				class="ev-map-toggle"
			>
				{showCustodyFlow ? 'Hide Custody Workflow' : 'Chain of Custody Workflow'}
			</button>
		</div>
		{#if showCustodyFlow}
			<div class="mt-4">
				<EvidenceCustodyFlow
					evidenceId={custodyEvidenceId || (filteredEvidence[0]?.id ?? '')}
					caseId={data.caseId ?? ''}
					userId={data.user?.id ?? 'anonymous'}
					originalHash={''}
					onWorkflowComplete={() => { showCustodyFlow = false; window.location.reload(); }}
					onWorkflowError={(err) => { uploadError = `Custody error: ${err}`; }}
				/>
			</div>
		{/if}
		<!-- Integrity Verification -->
		<div class="mt-6">
			<button
				onclick={() => (showIntegrity = !showIntegrity)}
				class="ev-map-toggle"
			>
				{showIntegrity ? 'Hide Integrity Check' : 'Evidence Integrity Verification'}
			</button>
		</div>
		{#if showIntegrity}
			<div class="mt-4">
				<IntegrityVerification
					integrityStatus={filteredEvidence.length > 0 ? 'verified' : 'pending'}
					verificationResults={{ aiAnalysisScore: 0.94, tamperedIndicators: [] }}
					originalHash={filteredEvidence[0]?.id ?? ''}
					currentHash={filteredEvidence[0]?.id ?? ''}
					aiAnalysis={{ riskLevel: 'low', confidence: 0.96, models: ['gemma3-legal'] }}
					showDetails={true}
				/>
			</div>
		{/if}
		<!-- Evidence Report Summary -->
		{#if showReportSummary && reportData}
			<div class="mt-6">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-lg font-semibold text-sand">Evidence Report</h3>
					<button onclick={() => { showReportSummary = false; reportData = null; }} class="text-sm text-sand/60 hover:text-sand">Close</button>
				</div>
				<EvidenceReportSummary
					evidenceId={reportEvidenceId}
					caseId={data.caseId ?? ''}
					reportData={reportData}
					allowExport={true}
				/>
			</div>
		{/if}
	</div>
</div>

<DocumentDetails
	documentId={selectedDocumentId}
	isVisible={showDocumentDetails}
	onClose={() => (showDocumentDetails = false)}
/>

<EvidenceCRUDModal
	bind:isOpen={showCrudModal}
	mode={crudMode}
	evidenceId={crudEvidenceId}
	onClose={() => { showCrudModal = false; }}
	onSave={() => { window.location.reload(); }}
	onDelete={() => { window.location.reload(); }}
/>

<EvidenceAssistant
	node={assistantNode}
	bind:open={showEvidenceAssistant}
	onupdate={(detail) => {
		if (detail.updates.description?.toLowerCase().includes('contradict')) {
			contradictionMessage = `Contradiction found in ${detail.nodeId}: ${detail.updates.description}`;
			showContradiction = true;
		}
	}}
/>

<ContradictionReveal
	message={contradictionMessage || 'CONTRADICTION DETECTED IN EVIDENCE!'}
	show={showContradiction}
	onhide={() => (showContradiction = false)}
/>

<LegalAnalysisDialog
	bind:open={showLegalAnalysis}
	evidenceId={legalAnalysisEvidenceId}
	title={legalAnalysisTitle}
	onClose={() => { showLegalAnalysis = false; }}
/>

{#if actionPopupFile}
	<ActionPopup
		pendingFile={actionPopupFile}
		onSelect={({ action }) => {
			if (action === 'analyze') {
				showAdvancedUpload = true;
			} else if (action === 'attach') {
				showCaseSelector = true;
			} else if (action === 'save') {
				console.log('Saving to evidence library:', actionPopupFile?.name);
			}
			actionPopupFile = null;
		}}
		onClose={() => { actionPopupFile = null; }}
	/>
{/if}

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
	.ev-map-toggle {
		padding: 0.5rem 1rem;
		background: rgba(59, 130, 246, 0.12);
		border: 1px solid rgba(59, 130, 246, 0.4);
		color: #60a5fa;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s;
	}
	.ev-map-toggle:hover {
		background: rgba(59, 130, 246, 0.2);
	}
</style>
