<script lang="ts">
	import { browser } from '$app/environment';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionData, PageData } from './$types';
	import {
		type AdvancedEvidenceFilters,
		type CaseSelection,
		type CaseLinkTarget,
		defaultAdvancedFilters
	} from '$lib/components/evidence/evidence-utils.js';

	// Components
	import EvidencePageHeader from '$lib/components/evidence/EvidencePageHeader.svelte';
	import EvidenceStatsRow from '$lib/components/evidence/EvidenceStatsRow.svelte';
	import EvidencePrimaryUpload from '$lib/components/evidence/EvidencePrimaryUpload.svelte';
	import EvidenceToolbar from '$lib/components/evidence/EvidenceToolbar.svelte';
	import EvidenceList from '$lib/components/evidence/EvidenceList.svelte';
	import EvidenceFiltersDrawer from '$lib/components/evidence/EvidenceFiltersDrawer.svelte';
	import EvidenceBulkUploadDialog from '$lib/components/evidence/EvidenceBulkUploadDialog.svelte';
	import EvidenceAdvancedToolsMenu from '$lib/components/evidence/EvidenceAdvancedToolsMenu.svelte';
	import EvidenceAiAssistantDrawer from '$lib/components/evidence/EvidenceAiAssistantDrawer.svelte';
	import LinkEvidenceToCaseDialog from '$lib/components/evidence/LinkEvidenceToCaseDialog.svelte';
	import EvidenceCRUDModal from '$lib/components/modals/EvidenceCRUDModal.svelte';
	import EvidenceViewModal from '$lib/components/evidence/EvidenceViewModal.svelte';
	import EvidenceUploadModal from '$lib/components/evidence/EvidenceUploadModal.svelte';
	import ActionPopup from '$lib/components/ActionPopup.svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import UploadProgressCard from '$lib/components/evidence/UploadProgressCard.svelte';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Upload state
	let selectedFile = $state<File | null>(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadCard = $state<UploadProgressCard | undefined>(undefined);
	let uploadProgressPercent = $state(0);
	let uploadProgressStatus = $state('');
	let uploadProgressDocId = $state('');
	let actionPopupFile = $state<{ name: string } | null>(null);

	// Search + filter state
	let searchQuery = $state('');
	let typeFilter = $state('all');
	let viewMode = $state<'grid' | 'list'>('grid');
	let advancedFilters = $state<AdvancedEvidenceFilters>({ ...defaultAdvancedFilters });
	let showAdvancedFilters = $state(false);

	// Semantic search
	let searchMode = $state<'local' | 'semantic'>('local');
	let isSearching = $state(false);
	let semanticResults = $state<any[]>([]);
	let searchTiming = $state<Record<string, number>>({});
	let searchDebounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	// Panel/dialog visibility
	let showBulkUpload = $state(false);
	let showAiAssistant = $state(false);
	let showAdvancedTools = $state(false);
	let showCaseSelector = $state(false);
	let showUploadPipeline = $state(false);

	// CRUD + delete state
	let showCrudModal = $state(false);
	let crudMode = $state<'create' | 'edit' | 'view'>('create');
	let crudEvidenceId = $state<string | undefined>(undefined);
	let showDeleteConfirm = $state(false);
	let deleteEvidenceId = $state('');
	let deleteEvidenceName = $state('');

	// Case linking
	let linkedCaseTitle = $state('');
	let pendingUploadCaseId = $state<string | null>(null);
	let caseLinkTarget = $state<CaseLinkTarget | null>(null);

	// Component refs
	let aiDrawer = $state<EvidenceAiAssistantDrawer | undefined>(undefined);

	// Evidence detail view modal (from card clicks)
	let viewEvidenceId = $state<string | null>(null);
	let showViewModal = $state(false);

	// React to pushState / popstate (back button closes modal)
	$effect(() => {
		const state = page.state as { showDocumentModal?: boolean; documentId?: string } | undefined;
		if (state?.showDocumentModal && state?.documentId) {
			viewEvidenceId = state.documentId;
			showViewModal = true;
		} else {
			showViewModal = false;
		}
	});

	// Derived
	let activeCaseId = $derived(pendingUploadCaseId ?? data.caseId ?? '');

	let hasActiveEvidenceFilters = $derived(
		searchQuery.trim().length > 0 ||
		typeFilter !== 'all' ||
		advancedFilters.status !== 'all' ||
		advancedFilters.case !== 'all' ||
		advancedFilters.dateRange !== 'all' ||
		advancedFilters.aiAnalyzed !== 'all'
	);

	let filteredEvidence = $derived(
		(data.evidence ?? []).filter((doc: any) => matchesSearchQuery(doc) && matchesAdvancedFilters(doc))
	);

	let displayEvidence = $derived.by(() => {
		if (searchMode === 'semantic' && semanticResults.length > 0) {
			return semanticResults.filter((doc: any) => matchesAdvancedFilters(doc));
		}
		return filteredEvidence;
	});

	// Filter functions
	function matchesSearchQuery(doc: any) {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return true;
		return [doc.title, doc.fileName, doc.file_name, doc.description, doc.content]
			.filter((v): v is string => typeof v === 'string' && v.length > 0)
			.some((v) => v.toLowerCase().includes(query));
	}

	function matchesSelectedType(doc: any) {
		const ft = String(doc.fileType ?? doc.file_type ?? '').toLowerCase();
		if (typeFilter === 'all') return true;
		if (typeFilter === 'pdf') return ft.includes('pdf');
		if (typeFilter === 'image') return ft.startsWith('image/') || ft.includes('image');
		if (typeFilter === 'document') return ft.includes('word') || ft.includes('text') || ft.includes('officedocument');
		return true;
	}

	function isAiAnalyzed(doc: any) {
		return Boolean(doc.summary ?? doc.aiSummary ?? doc.aiAnalysis ?? doc.metadata?.analysis ?? doc.metadata?.entities);
	}

	function matchesDateRange(doc: any, range: string) {
		if (range === 'all') return true;
		const value = doc.createdAt ?? doc.created_at ?? doc.updatedAt ?? doc.updated_at;
		if (!value) return false;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return false;
		const now = new Date();
		const start = new Date(now);
		if (range === 'today') { start.setHours(0, 0, 0, 0); return date >= start; }
		if (range === 'week') { start.setDate(now.getDate() - 7); return date >= start; }
		if (range === 'month') { start.setMonth(now.getMonth() - 1); return date >= start; }
		if (range === 'quarter') { start.setMonth(now.getMonth() - 3); return date >= start; }
		return true;
	}

	function matchesAdvancedFilters(doc: any) {
		const status = String(doc.status ?? doc.processingStatus ?? doc.documentStatus ?? '').toLowerCase();
		const caseRef = [doc.caseNumber, doc.case_number, doc.caseId, doc.case_id, doc.caseTitle, doc.case_title]
			.filter(Boolean).join(' ').toLowerCase();
		const matchesStatus = advancedFilters.status === 'all' || status === advancedFilters.status;
		const matchesCase = advancedFilters.case === 'all' || caseRef.includes(advancedFilters.case.toLowerCase());
		const matchesAi = advancedFilters.aiAnalyzed === 'all' || (advancedFilters.aiAnalyzed === 'analyzed' ? isAiAnalyzed(doc) : !isAiAnalyzed(doc));
		const matchesDate = matchesDateRange(doc, advancedFilters.dateRange);
		return matchesSelectedType(doc) && matchesStatus && matchesCase && matchesAi && matchesDate;
	}

	function applyAdvancedFilters(filterData: AdvancedEvidenceFilters) {
		advancedFilters = { ...filterData };
		searchQuery = filterData.search;
		switch (filterData.type) {
			case 'email': case 'spreadsheet': typeFilter = 'document'; break;
			case 'video': typeFilter = 'video'; break;
			default: typeFilter = filterData.type;
		}
	}

	function clearEvidenceFilters() {
		searchQuery = '';
		typeFilter = 'all';
		advancedFilters = { ...defaultAdvancedFilters };
	}

	function openDocumentModal(e: MouseEvent, id: string) {
		if (e.metaKey || e.ctrlKey) return;
		e.preventDefault();
		viewEvidenceId = id;
		showViewModal = true;
		pushState(window.location.pathname, { showDocumentModal: true, documentId: id });
	}

	// Semantic search effect
	$effect(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		if (searchQuery.length >= 3) {
			searchDebounceTimer = setTimeout(() => runSemanticSearch(searchQuery), 500);
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
				body: JSON.stringify({ query, limit: 30, includeContext: true })
			});
			if (!res.ok) { searchMode = 'local'; return; }
			const result = await res.json();
			semanticResults = result.results ?? result.hits ?? [];
			searchTiming = result.timing ?? {};
			analytics.track('rag_search', { query: query.slice(0, 200), source: 'evidence', resultCount: semanticResults.length });
		} catch { searchMode = 'local'; }
		finally { isSearching = false; }
	}

	// URL param handling
	$effect(() => {
		if (!browser) return;
		const url = new URL(window.location.href);
		const upload = url.searchParams.get('upload');
		let shouldClean = false;
		if (upload) { showBulkUpload = true; url.searchParams.delete('upload'); shouldClean = true; }
		if (url.searchParams.get('caseSelector') === 'true') { showCaseSelector = true; url.searchParams.delete('caseSelector'); shouldClean = true; }
		if (shouldClean) {
			const search = url.searchParams.toString();
			window.history.replaceState({}, '', search ? `${url.pathname}?${search}` : url.pathname);
		}
	});

	function handleCaseLinkSelection(selection: CaseSelection) {
		linkedCaseTitle = selection.title;
		pendingUploadCaseId = selection.id;
		showCaseSelector = false;
	}

	function setCaseLinkTargetById(id: string) {
		const ev = (data.evidence ?? []).find((d: any) => d.id === id)
			?? filteredEvidence.find((d: any) => d.id === id)
			?? semanticResults.find((d: any) => d.id === id);
		if (!ev) return;
		caseLinkTarget = { id: ev.id, label: ev.title || ev.fileName || ev.file_name || ev.id };
	}
</script>

<div class="evidence-page">
	<EvidencePageHeader
		evidenceCount={data.evidence?.length ?? 0}
		caseId={data.caseId ?? null}
		onCreateWithAI={() => { crudMode = 'create'; crudEvidenceId = undefined; showCrudModal = true; }}
		onBulkUpload={() => (showBulkUpload = true)}
		onAiAssistant={() => (showAiAssistant = true)}
		onAdvancedTools={() => (showAdvancedTools = !showAdvancedTools)}
	/>

	<EvidenceStatsRow
		totalCount={data.evidence?.length ?? 0}
		filteredCount={displayEvidence.length}
		caseId={data.caseId ?? null}
		{searchMode}
		semanticResultsCount={semanticResults.length}
		searchTimingMs={searchTiming.total_ms ?? null}
	/>

	<EvidencePrimaryUpload
		{form}
		{activeCaseId}
		caseId={data.caseId ?? null}
		bind:selectedFile
		bind:isUploading
		bind:uploadError
	/>

	<EvidenceToolbar
		bind:searchQuery
		bind:typeFilter
		bind:viewMode
		{isSearching}
		{searchMode}
		semanticResultsCount={semanticResults.length}
		{searchTiming}
		onToggleFilters={() => (showAdvancedFilters = !showAdvancedFilters)}
	/>

	<EvidenceFiltersDrawer
		bind:open={showAdvancedFilters}
		onFilter={applyAdvancedFilters}
	/>

	<div class="evidence-content">
		<EvidenceList
			evidence={displayEvidence}
			{viewMode}
			hasActiveFilters={hasActiveEvidenceFilters}
			onOpenDetail={(e, id) => { setCaseLinkTargetById(id); openDocumentModal(e, id); }}
			onAnalyze={(doc) => aiDrawer?.analyzeEvidence(doc)}
			onReport={(id) => aiDrawer?.loadReport(id)}
			onLegal={(id, title) => aiDrawer?.showLegalAnalysisFor(id, title)}
			onEdit={(id) => { crudMode = 'edit'; crudEvidenceId = id; showCrudModal = true; }}
			onDelete={(id, name) => { deleteEvidenceId = id; deleteEvidenceName = name; showDeleteConfirm = true; }}
			onClearFilters={clearEvidenceFilters}
			onLinkCase={(id) => { setCaseLinkTargetById(id); showCaseSelector = true; }}
		/>
	</div>

	<EvidenceAdvancedToolsMenu
		bind:open={showAdvancedTools}
		evidence={filteredEvidence}
		caseId={data.caseId ?? ''}
		userId={data.user?.id ?? ''}
	/>

	<!-- Upload Progress -->
	{#if uploadProgressStatus && uploadProgressStatus !== 'complete'}
		<div class="progress-bar">
			<UploadProgress
				uploadProgress={uploadProgressPercent}
				uploadStatus={uploadProgressStatus}
				currentDocId={uploadProgressDocId}
			/>
		</div>
	{/if}

	{#if selectedFile}
		<div class="progress-bar">
			<UploadProgressCard
				bind:this={uploadCard}
				filename={selectedFile.name}
				fileSize={selectedFile.size}
				onCancel={() => { selectedFile = null; uploadCard?.failUpload('Cancelled by user'); }}
				onRetry={() => { uploadCard?.startUpload(); }}
			/>
		</div>
	{/if}
</div>

<!-- Dialogs & Drawers -->
{#if browser}
	<EvidenceBulkUploadDialog
		bind:open={showBulkUpload}
		{activeCaseId}
		userId={data.user?.id ?? ''}
		onClose={() => (showBulkUpload = false)}
		onUploadComplete={() => { showBulkUpload = false; invalidateAll(); }}
	/>

	<EvidenceAiAssistantDrawer
		bind:this={aiDrawer}
		bind:open={showAiAssistant}
		evidence={data.evidence ?? []}
		caseId={data.caseId ?? ''}
		user={data.user}
	/>

	<LinkEvidenceToCaseDialog
		bind:open={showCaseSelector}
		{caseLinkTarget}
		{linkedCaseTitle}
		{activeCaseId}
		onSelect={handleCaseLinkSelection}
		onClose={() => { showCaseSelector = false; caseLinkTarget = null; }}
	/>

	<EvidenceCRUDModal
		bind:isOpen={showCrudModal}
		mode={crudMode}
		evidenceId={crudEvidenceId}
		onClose={() => { showCrudModal = false; }}
		onSave={() => { invalidateAll(); }}
		onDelete={() => { invalidateAll(); }}
	/>

	<!-- Evidence detail view modal (opened by card click) -->
	<EvidenceViewModal
		bind:open={showViewModal}
		evidenceId={viewEvidenceId}
		onClose={() => {
			showViewModal = false;
			viewEvidenceId = null;
			history.back();
		}}
		onEdit={(id) => { crudMode = 'edit'; crudEvidenceId = id; showCrudModal = true; }}
		onAnalyze={(doc) => { showAiAssistant = true; aiDrawer?.analyzeEvidence(doc); }}
	/>

	<EvidenceUploadModal
		caseId={activeCaseId || data.evidence?.[0]?.caseId || 'default'}
		isOpen={showUploadPipeline}
		onClose={() => (showUploadPipeline = false)}
		onSuccess={(evidenceId, jobId) => { showUploadPipeline = false; invalidateAll(); }}
	/>

	<Dialog bind:open={showDeleteConfirm} title="Delete Evidence" description="This action cannot be undone.">
		<p class="text-sm" style="color: rgba(212,199,163,0.7);">Are you sure you want to delete <strong>{deleteEvidenceName}</strong>?</p>
		{#snippet footer()}
			<button type="button" onclick={() => (showDeleteConfirm = false)} class="cancel-btn">Cancel</button>
			<form method="POST" action="?/delete" use:enhance={() => { return async ({ result }) => { showDeleteConfirm = false; await applyAction(result); invalidateAll(); }; }}>
				<input type="hidden" name="evidenceId" value={deleteEvidenceId} />
				<button type="submit" class="delete-btn">Delete</button>
			</form>
		{/snippet}
	</Dialog>

	{#if actionPopupFile}
		<ActionPopup
			pendingFile={actionPopupFile}
			onSelect={({ action }) => {
				if (action === 'analyze') showAiAssistant = true;
				else if (action === 'attach') showCaseSelector = true;
				actionPopupFile = null;
			}}
			onClose={() => { actionPopupFile = null; }}
		/>
	{/if}
{/if}

<style>
	.evidence-page {
		min-height: 100vh;
		background: #0a0b0e;
		display: flex;
		flex-direction: column;
		margin: -2.5rem;
	}
	.evidence-page :global(h1), .evidence-page :global(h2), .evidence-page :global(h3), .evidence-page :global(h4), .evidence-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.evidence-page :global(a) { color: inherit; border-bottom: none; }
	.evidence-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.evidence-page :global(input), .evidence-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.evidence-page :global(.panel), .evidence-page :global(.card), .evidence-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }
	.evidence-content {
		flex: 1;
		padding: 0.5rem 0;
	}
	.progress-bar {
		padding: 0 1.5rem;
		margin-bottom: 0.5rem;
	}
	.cancel-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(212, 199, 163, 0.7);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.delete-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.25);
		color: #f87171;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}
	.delete-btn:hover {
		background: rgba(239, 68, 68, 0.25);
	}
</style>
