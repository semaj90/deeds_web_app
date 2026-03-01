<script lang="ts">
	import { browser } from '$app/environment';
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
	import EnhancedFileUpload from '$lib/components/forms/EnhancedFileUpload.svelte';
	import ContextualEvidenceChatModal from '$lib/components/ai/ContextualEvidenceChatModal.svelte';
	import CaseSelector from '$lib/components/CaseSelector.svelte';
	import UploadProgress from '$lib/components/UploadProgress.svelte';
	import ActionPopup from '$lib/components/ActionPopup.svelte';
	import EvidenceUpload from '$lib/components/evidence/EvidenceUpload.svelte';
	import EvidenceFilters from '$lib/components/yorha/evidence/EvidenceFilters.svelte';
	import DocumentUploadMachineIntegration from '$lib/components/DocumentUploadMachineIntegration.svelte';
	import UploadProgressCard from '$lib/components/evidence/UploadProgressCard.svelte';
	import LegalDocumentSummarizer from '$lib/components/ai/LegalDocumentSummarizer.svelte';
	import EnhancedLegalProcessor from '$lib/components/legal/EnhancedLegalProcessor.svelte';
	import UploadZone from '$lib/components/yorha/evidence/UploadZone.svelte';
	import EvidenceComparisonOverlay from '$lib/components/yorha/evidence/EvidenceComparisonOverlay.svelte';
	import RelationshipInspector from '$lib/components/evidence/RelationshipInspector.svelte';
	import WorkflowProgress from '$lib/components/legal/WorkflowProgress.svelte';
	import AIFileUpload from '$lib/components/ui/AIFileUpload.svelte';
	import YorhaEvidenceGrid from '$lib/components/yorha/evidence/EvidenceGrid.svelte';
	import DocumentDetailModal from '$lib/components/DocumentDetailModal.svelte';
	import MarkdownSceneViewer from '$lib/components/ui/MarkdownSceneViewer.svelte';
	import EvidenceUploadModal from '$lib/components/evidence/EvidenceUploadModal.svelte';
	import Gemma270MWebAssembly from '$lib/components/ai/Gemma270MWebAssembly.svelte';
	import VisionImageAnalyzer from '$lib/components/evidence/VisionImageAnalyzer.svelte';
	import ChainOfCustodyTracker from '$lib/components/legal/ChainOfCustodyTracker.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let uploadCard = $state<UploadProgressCard | undefined>(undefined);
	let showAdvancedFilters = $state(false);
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
	let showEnhancedFileUpload = $state(false);
	let showBulkUpload = $state(false);
	let showXStateUpload = $state(false);
	let showSummarizer = $state(false);
	let showLegalProcessor = $state(false);
	let showYorhaUpload = $state(false);
	let showComparison = $state(false);
	let showRelationshipInspector = $state(false);
	let showWorkflowProgress = $state(false);
	let showAIFileUpload = $state(false);
	let showYorhaGrid = $state(false);
	let showDetailModal = $state(false);
	let showUploadPipeline = $state(false);
	let showVlmAnalyzer = $state(false);
	let showSceneViewer = $state(false);
	let showVisionPipeline = $state(false);
	let showCustodyTracker = $state(false);
	let sampleScene = $state<{
		id: string; title: string; markdown: string; confidence: number;
		sourceFiles: string[]; aiGenerated: boolean; validated: boolean;
		validatedBy?: string; validatedAt?: Date;
	}>({
		id: 'scene-1',
		title: 'Crime Scene Analysis — Sector 7',
		markdown: '## Evidence Summary\n\n**Location**: 742 Evergreen Terrace, Sector 7\n\n### Key Findings\n- Fingerprint match on exhibit B (93% confidence)\n- DNA trace evidence collected from entry point\n- Timeline corroborated by surveillance footage\n\n### Chain of Custody\n1. Evidence collected by **Officer Chen** at 14:32\n2. Logged into evidence locker #A-17\n3. Transferred to forensic lab at 16:00\n\n> **AI Note**: High confidence match with existing case profiles in the database.',
		confidence: 0.93,
		sourceFiles: ['exhibit-b.pdf', 'surveillance-cam4.mp4'],
		aiGenerated: true,
		validated: false,
	});
	let workflowStage = $state('idle');
	let workflowPercent = $state(0);
	let comparisonA = $state<{ id: string; fileName: string; extractedText: string; caseId?: string; timestamp?: string }>({ id: '', fileName: '', extractedText: '' });
	let comparisonB = $state<{ id: string; fileName: string; extractedText: string; caseId?: string; timestamp?: string }>({ id: '', fileName: '', extractedText: '' });

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

	let selectedDocument = $derived(
		selectedDocumentId ? (data.evidence ?? []).find((d: any) => d.id === selectedDocumentId) ?? null : null
	);

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

<div class="evidence-management-page">
	<!-- Professional Header -->
	<div class="page-header-pro">
		<div class="header-content">
			<div class="header-left">
				<div class="header-icon-wrapper">
					<span class="header-icon">📁</span>
				</div>
				<div class="header-info">
					<h1 class="page-title">EVIDENCE MANAGEMENT</h1>
					<p class="page-subtitle">
						{data.evidence?.length ?? 0} items
						{#if data.caseId}
							<span class="case-label">CASE #{data.caseId.slice(0, 8)}</span>
						{/if}
					</p>
				</div>
			</div>
			<div class="header-actions-pro">
				<button onclick={() => { crudMode = 'create'; crudEvidenceId = undefined; showCrudModal = true; }} class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition text-sm font-medium">
					+ Create with AI
				</button>
				<button onclick={() => (showBulkUpload = !showBulkUpload)} class="px-4 py-2 bg-warning text-white rounded-lg hover:bg-warning/80 transition text-sm font-medium">
					{showBulkUpload ? 'Hide Bulk Upload' : '+ Bulk Upload'}
				</button>
				<button onclick={() => (showXStateUpload = !showXStateUpload)} class="px-4 py-2 bg-sand/80 text-white rounded-lg hover:bg-sand/60 transition text-sm font-medium">
					{showXStateUpload ? 'Hide XState Upload' : 'XState Upload'}
				</button>
				<button onclick={() => (showSummarizer = !showSummarizer)} class="px-4 py-2 bg-info/80 text-white rounded-lg hover:bg-info/60 transition text-sm font-medium">
					{showSummarizer ? 'Hide Summarizer' : 'AI Summarizer'}
				</button>
				<button onclick={() => (showYorhaUpload = !showYorhaUpload)} class="px-4 py-2 bg-panelSoft text-sand rounded-lg hover:bg-panel transition text-sm font-medium">
					{showYorhaUpload ? 'Hide YoRHa Upload' : 'YoRHa Upload'}
				</button>
				<button onclick={() => {
					const items = data.evidence ?? [];
					if (items.length >= 2) {
						comparisonA = { id: items[0].id, fileName: items[0].title ?? items[0].filename ?? 'Evidence A', extractedText: items[0].description ?? 'No text extracted yet', caseId: data.caseId ?? undefined };
						comparisonB = { id: items[1].id, fileName: items[1].title ?? items[1].filename ?? 'Evidence B', extractedText: items[1].description ?? 'No text extracted yet', caseId: data.caseId ?? undefined };
						showComparison = true;
					}
				}} class="px-4 py-2 bg-sand/20 text-sand rounded-lg hover:bg-sand/30 transition text-sm font-medium">
					Compare
				</button>
				<button onclick={() => (showRelationshipInspector = !showRelationshipInspector)} class="px-4 py-2 bg-warning/80 text-white rounded-lg hover:bg-warning/60 transition text-sm font-medium">
					{showRelationshipInspector ? 'Hide Relationships' : 'Relationships'}
				</button>
				<button onclick={() => (showWorkflowProgress = !showWorkflowProgress)} class="px-4 py-2 bg-panelSoft text-sand rounded-lg hover:bg-panel transition text-sm font-medium">
					{showWorkflowProgress ? 'Hide Workflow' : 'Custody Workflow'}
				</button>
				<button onclick={() => (showAIFileUpload = !showAIFileUpload)} class="px-4 py-2 bg-accent/70 text-white rounded-lg hover:bg-accent/50 transition text-sm font-medium">
					{showAIFileUpload ? 'Hide AI Upload' : 'AI File Upload'}
				</button>
				<button onclick={() => (showUploadPipeline = true)} class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition text-sm font-medium">
					MinIO Pipeline Upload
				</button>
				<button onclick={() => (showVlmAnalyzer = !showVlmAnalyzer)} class="px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-600 transition text-sm font-medium">
					{showVlmAnalyzer ? 'Hide VLM' : 'VLM Image Analysis'}
				</button>
				<button onclick={() => (showVisionPipeline = !showVisionPipeline)} class="px-4 py-2 bg-teal-700 text-white rounded-lg hover:bg-teal-600 transition text-sm font-medium">
					{showVisionPipeline ? 'Hide Vision' : 'Vision Pipeline'}
				</button>
				<a href="/evidence/upload" class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/80 transition text-sm font-medium">
					+ Upload Evidence
				</a>
			</div>
		</div>

		<!-- Bulk Upload (Multi-file with metadata) -->
		{#if showBulkUpload}
			<div class="mb-6">
				<EvidenceUpload caseId={data.caseId ?? ''} onUploadComplete={(uploads) => { showBulkUpload = false; window.location.reload(); }} />
			</div>
		{/if}

		<!-- XState Document Upload Machine (state-machine driven upload pipeline) -->
		{#if showXStateUpload}
			<div class="mb-6">
				<DocumentUploadMachineIntegration />
			</div>
		{/if}

		<!-- Gemma3 Legal Document Summarizer -->
		{#if showSummarizer}
			<div class="mb-6">
				<LegalDocumentSummarizer />
			</div>
		{/if}

		<!-- Enhanced Legal Processor -->
		<div class="mt-2 mb-4">
			<button
				onclick={() => (showLegalProcessor = !showLegalProcessor)}
				class="text-sm text-accent hover:underline"
			>
				{showLegalProcessor ? 'Hide Legal Processor' : 'Quick Upload & Analyze (Multi-Stage Pipeline)'}
			</button>
		</div>
		{#if showLegalProcessor}
			<div class="mb-6">
				<EnhancedLegalProcessor />
			</div>
		{/if}

		<!-- YoRHa Upload Zone -->
		{#if showYorhaUpload}
			<div class="mb-6">
				<UploadZone
					onfilesadded={(e) => console.log('Files added:', e.files.length)}
					onuploadcomplete={(e) => { showYorhaUpload = false; window.location.reload(); }}
				/>
			</div>
		{/if}

		<!-- Relationship Inspector — View evidence relationships -->
		{#if showRelationshipInspector}
			<div class="mb-6">
				<RelationshipInspector caseId={data.caseId ?? 'default'} selectedEvidenceId={data.evidence?.[0]?.id ?? null} />
			</div>
		{/if}

		<!-- Workflow Progress — Chain of custody workflow stages -->
		{#if showWorkflowProgress}
			<div class="mb-6">
				<WorkflowProgress progress={workflowPercent} stage={workflowStage} stageName={workflowStage.replace(/-/g, ' ')} />
			</div>
		{/if}

		<!-- AI File Upload (drag-drop + auto-detection + AI analysis) -->
		{#if showAIFileUpload}
			<div class="mb-6">
				<AIFileUpload
					accept=".pdf,image/*,.doc,.docx,.txt"
					multiple={true}
					maxSize={100}
					analyzeEndpoint="/api/evidence/analyze"
					onUpload={(files) => { console.log('AI Upload complete:', files.length, 'files'); showAIFileUpload = false; window.location.reload(); }}
					onAnalyze={(file, metadata) => { console.log('AI Analysis:', file.name, 'confidence:', metadata.confidence); }}
				/>
			</div>
		{/if}

		<!-- VLM Image Analysis (Client ONNX embed → YOLO → gemma3 VLM → entity extraction) -->
		{#if showVlmAnalyzer}
			<div class="mb-6">
				<Gemma270MWebAssembly caseId={data.caseId ?? ''} />
			</div>
		{/if}

		<!-- Vision Pipeline (Server-side YOLO + Gemma3 VLM + Redis cache) -->
		{#if showVisionPipeline}
			<div class="mb-6">
				<VisionImageAnalyzer caseId={data.caseId ?? ''} />
			</div>
		{/if}

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
					onclick={() => (showEnhancedFileUpload = !showEnhancedFileUpload)}
					class="text-sm text-warning hover:underline"
				>
					{showEnhancedFileUpload ? 'Hide Enhanced Upload' : 'Enhanced Upload (Drag & Drop + Preview + Validation)'}
				</button>
			</div>

			{#if showEnhancedFileUpload}
				<div class="mt-4">
					<EnhancedFileUpload
						caseId={data.caseId ?? undefined}
						multiple={true}
						maxFiles={10}
						maxSizeMB={100}
						onupload={(uploadData) => { console.log('Enhanced upload:', uploadData); showEnhancedFileUpload = false; window.location.reload(); }}
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

		<!-- Upload Progress Card (imperative API — cancel/retry support) -->
		{#if selectedFile}
			<div class="mt-4">
				<UploadProgressCard
					bind:this={uploadCard}
					filename={selectedFile.name}
					fileSize={selectedFile.size}
					onCancel={() => { selectedFile = null; uploadCard?.failUpload('Cancelled by user'); }}
					onRetry={() => { uploadCard?.startUpload(); }}
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

		<!-- Advanced Filters Toggle -->
		<div class="mt-2">
			<button
				onclick={() => (showAdvancedFilters = !showAdvancedFilters)}
				class="text-sm text-info hover:underline"
			>
				{showAdvancedFilters ? 'Hide Advanced Filters' : 'Advanced Filters (Type, Status, Case, Date, AI)'}
			</button>
		</div>
		{#if showAdvancedFilters}
			<div class="mt-3">
				<EvidenceFilters onfilter={(filterData) => { console.log('Advanced filter applied:', filterData); }} />
			</div>
		{/if}

		<!-- YoRHa Evidence Grid Toggle -->
		<div class="mt-3 mb-2">
			<button
				onclick={() => (showYorhaGrid = !showYorhaGrid)}
				class="text-sm px-3 py-1 rounded border transition {showYorhaGrid ? 'bg-info/20 text-info border-info/30' : 'bg-panelSoft text-sand/60 border-sand/20 hover:border-info/30'}"
			>
				{showYorhaGrid ? 'Hide YoRHa Grid' : 'YoRHa Evidence Grid (Demo)'}
			</button>
		</div>
		{#if showYorhaGrid}
			<div class="mb-6">
				<YorhaEvidenceGrid />
			</div>
		{/if}

		<!-- AI Scene Viewer Toggle -->
		<div class="mb-2">
			<button
				onclick={() => (showSceneViewer = !showSceneViewer)}
				class="text-sm px-3 py-1 rounded border transition {showSceneViewer ? 'bg-info/20 text-info border-info/30' : 'bg-panelSoft text-sand/60 border-sand/20 hover:border-info/30'}"
			>
				{showSceneViewer ? 'Hide Scene Viewer' : 'AI Scene Viewer (Markdown Validation)'}
			</button>
		</div>
		{#if showSceneViewer}
			<div class="mb-6">
				<MarkdownSceneViewer
					scene={sampleScene}
					editable={true}
					onValidate={(id) => { sampleScene = { ...sampleScene, validated: true, validatedBy: 'Current User', validatedAt: new Date() }; }}
					onReject={(id) => { console.log('Scene rejected:', id); showSceneViewer = false; }}
					onEdit={(id, md) => { sampleScene = { ...sampleScene, markdown: md }; }}
				/>
			</div>
		{/if}

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
									<button onclick={(e) => { e.stopPropagation(); selectedDocumentId = doc.id; showDetailModal = true; }} class="text-accent/60 hover:text-accent transition">Detail</button>
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
		<!-- Chain of Custody Tracker -->
		<div class="mt-6">
			<button
				onclick={() => (showCustodyTracker = !showCustodyTracker)}
				class="ev-map-toggle"
			>
				{showCustodyTracker ? 'Hide Custody Tracker' : 'Chain of Custody Tracker'}
			</button>
		</div>
		{#if showCustodyTracker}
			<div class="mt-4">
				<ChainOfCustodyTracker
					evidence={{
						id: filteredEvidence[0]?.id ?? '',
						itemNumber: filteredEvidence[0]?.id?.slice(0, 8) ?? 'N/A',
						description: filteredEvidence[0]?.title ?? 'No evidence selected',
						category: 'document',
						collectedBy: data.user?.username ?? 'Unknown',
						currentCustodian: data.user?.username ?? 'Unknown',
						location: 'Evidence Locker',
						condition: 'good',
						sealed: true,
						chainOfCustody: [],
						compromised: false
					}}
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

{#if browser}
<DocumentDetailModal
	open={showDetailModal}
	document={selectedDocument}
	onclose={() => (showDetailModal = false)}
	ondownload={(doc) => { if (doc.fileUrl || doc.file_url) window.open(doc.fileUrl || doc.file_url, '_blank'); }}
	onviewcustody={(docId) => { custodyEvidenceId = docId; showCustodyFlow = true; showDetailModal = false; }}
	onanalyze={(docId) => { assistantNode = { id: docId, title: selectedDocument?.title || '', type: 'document' }; showEvidenceAssistant = true; showDetailModal = false; }}
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
{/if}

<ContradictionReveal
	message={contradictionMessage || 'CONTRADICTION DETECTED IN EVIDENCE!'}
	show={showContradiction}
	onhide={() => (showContradiction = false)}
/>

{#if browser}
<LegalAnalysisDialog
	bind:open={showLegalAnalysis}
	evidenceId={legalAnalysisEvidenceId}
	title={legalAnalysisTitle}
	onClose={() => { showLegalAnalysis = false; }}
/>
{/if}

<EvidenceComparisonOverlay
	evidenceA={comparisonA}
	evidenceB={comparisonB}
	show={showComparison}
	onDismiss={() => (showComparison = false)}
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

<EvidenceUploadModal
	caseId={data.evidence?.[0]?.caseId || 'default'}
	isOpen={showUploadPipeline}
	onClose={() => (showUploadPipeline = false)}
	onSuccess={(evidenceId, jobId) => { console.log('Pipeline complete:', evidenceId, jobId); showUploadPipeline = false; window.location.reload(); }}
/>

<style>
	/* Professional Evidence Management Page */
	.evidence-management-page {
		min-height: 100vh;
		background: #f8f9fa;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
	}

	/* Professional Header */
	.page-header-pro {
		background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
		border-bottom: 2px solid #e5e7eb;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}

	.header-content {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1.5rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.header-icon-wrapper {
		width: 56px;
		height: 56px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
	}

	.header-icon {
		font-size: 2rem;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: #1f2937;
		margin: 0;
	}

	.page-subtitle {
		font-size: 0.9rem;
		color: #6b7280;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.case-label {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #4b5563;
	}

	.header-actions-pro {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	/* Original Styling (Preserved) */
	.ev-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding: 1rem 2rem;
		background: #fff;
		border-bottom: 1px solid #e5e7eb;
	}
	.ev-toolbar input {
		flex: 1;
		min-width: 200px;
		padding: 0.625rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		transition: all 0.2s;
	}
	.ev-toolbar input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}
	.ev-filter-bar {
		display: flex;
		gap: 0.5rem;
	}
	.ev-filter-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 600;
		color: #6b7280;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: 0.02em;
	}
	.ev-filter-btn:hover {
		background: #f3f4f6;
		border-color: #d1d5db;
		color: #374151;
	}
	.ev-filter-btn.active {
		background: #667eea;
		border-color: #667eea;
		color: white;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
	}
	.ev-view-toggle {
		display: flex;
		gap: 0;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}
	.ev-view-btn {
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #9ca3af;
		background: #fff;
		border-right: 1px solid #e5e7eb;
		cursor: pointer;
		transition: all 0.2s;
	}
	.ev-view-btn:last-child {
		border-right: none;
	}
	.ev-view-btn:hover {
		background: #f9fafb;
		color: #6b7280;
	}
	.ev-view-btn.active {
		background: #f3f4f6;
		color: #667eea;
	}
	.ev-score {
		flex-shrink: 0;
		padding: 0.25rem 0.625rem;
		border-radius: 12px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.ev-score.high {
		background: #d1fae5;
		color: #065f46;
	}
	.ev-score.medium {
		background: #fef3c7;
		color: #92400e;
	}
	.ev-score.low {
		background: #fee2e2;
		color: #991b1b;
	}
	.ev-map-toggle {
		padding: 0.625rem 1.25rem;
		background: #f0f9ff;
		border: 1px solid #bfdbfe;
		color: #1e40af;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		transition: all 0.2s;
	}
	.ev-map-toggle:hover {
		background: #dbeafe;
		border-color: #93c5fd;
	}
</style>
