<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	const resolvePath = (p: string) => (base ? `${base}${p}` : p);
	import type { PageData } from './$types';
	import EvidenceAnalysisDashboard from '$lib/components/dashboard/EvidenceAnalysisDashboard.svelte';
	import PoliceReportGenerator from '$lib/components/yorha/PoliceReportGenerator.svelte';
	import CustodyTimeline from '$lib/components/legal/CustodyTimeline.svelte';
	import EvidenceModal from '$lib/components/modals/EvidenceModal.svelte';
	import EvidenceCard from '$lib/components/EvidenceCard.svelte';
	import RichEvidenceCard from '$lib/components/evidence/EvidenceCard.svelte';
	import LazyLoader from '$lib/components/LazyLoader.svelte';
	import EvidenceStats from '$lib/components/yorha/evidence/EvidenceStats.svelte';
	import RagDocumentGrid from '$lib/components/rag/RagDocumentGrid.svelte';
	import ExpandGrid from '$lib/components/ui/ExpandGrid.svelte';
	import { createViewTracker } from '$lib/utils/tracking';
	import EvidenceRecall from '$lib/components/evidence/EvidenceRecall.svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';


	let { data }: { data: PageData } = $props();
	let showRecall = $state(true);
	let evidenceRecallRef: EvidenceRecall | undefined = $state();
	let showReportGenerator = $state(false);
	let showEvidenceCards = $state(false);
	let showEvidenceStats = $state(false);
	let showRichCards = $state(false);
	let showRagDocuments = $state(false);

	// svelte-ignore state_referenced_locally
	let evidenceItems = $state(data.evidenceItems || []);

	// Synchronize with server data when it changes
	$effect(() => {
		evidenceItems = data.evidenceItems || [];
	});

	let showTimeline = $state(false);
	let showEvidenceModal = $state(false);
	let selectedEvidence = $state<any>({ jsonData: { title: '', description: '', tags: [] } });
	let viewTracker = $state<ReturnType<typeof createViewTracker> | null>(null);

	// Track evidence views with auto-duration + record to recall history
	$effect(() => {
		if (showEvidenceModal && selectedEvidence?.id) {
			viewTracker = createViewTracker(
				selectedEvidence.id,
				data.caseId,
				'evidence-library'
			);
			// Record to Evidence Recall history
			evidenceRecallRef?.recordAccess({
				evidenceId: selectedEvidence.id,
				title: selectedEvidence.jsonData?.title ?? selectedEvidence.file_name ?? 'Evidence',
				caseId: data.caseId,
				evidenceType: selectedEvidence.evidence_type ?? 'document',
				action: 'viewed',
				timestamp: Date.now()
			});
		} else if (!showEvidenceModal && viewTracker) {
			viewTracker.complete();
			viewTracker = null;
		}
	});

	const sampleCustodyEvents = [
		{ eventType: 'intake', userId: 'officer-1', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), details: { hashMatch: true, originalHash: 'a1b2c3d4e5f6' } },
		{ eventType: 'verification', userId: 'forensics-lab', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), details: { integrityStatus: 'verified', verificationResults: { aiAnalysisScore: 0.97 } } },
		{ eventType: 'analysis', userId: 'ai-system', timestamp: new Date(Date.now() - 86400000).toISOString(), details: { aiAnalysis: { riskLevel: 'low' }, models: ['ornith-1.5-9b'] } },
	];
</script>

<div class="evidence-library-page">
	<header class="library-header">
		<div>
			<p class="eyebrow">CASEWORK · EVIDENCE</p>
			<h1>Evidence Library</h1>
			<p class="library-subtitle">
				{evidenceItems.length} item{evidenceItems.length === 1 ? '' : 's'}
				{#if data.caseId}<span>Case {data.caseId}</span>{/if}
			</p>
		</div>
		<a href={resolvePath('/evidence/upload')} class="upload-link">Upload evidence</a>
	</header>

	<section class="primary-workspace" aria-label="Evidence analysis">
		<LazyLoader placeholderHeight="400px" loadingText="Loading evidence workspace...">
			<EvidenceAnalysisDashboard
				caseId={data.caseId}
				onUpload={(item) => { evidenceItems = [item, ...evidenceItems]; }}
			/>
		</LazyLoader>
	</section>

	<section class="supporting-tools" aria-label="Additional evidence tools">
		<div class="section-heading">
			<div><p class="eyebrow">SUPPORTING WORKFLOWS</p><h2>Case tools</h2></div>
			<p>Optional views and records for reviewing this matter.</p>
		</div>

		<div class="tool-groups">
			<details class="tool-group">
				<summary><span><strong>Reports &amp; custody</strong><small>Generate a report or preview a sample custody timeline.</small></span><span class="group-count">2 tools</span></summary>
				<div class="group-body">
					<button class="report-toggle" onclick={() => (showReportGenerator = !showReportGenerator)}>{showReportGenerator ? 'Close report generator' : 'Generate police report'}</button>
					<button class="report-toggle" onclick={() => (showTimeline = !showTimeline)}>{showTimeline ? 'Hide sample timeline' : 'Preview sample custody timeline'}</button>
					{#if showReportGenerator}<div class="report-container"><PoliceReportGenerator caseId={data.caseId || null} /></div>{/if}
					{#if showTimeline}<div class="report-container"><CustodyTimeline events={sampleCustodyEvents} currentStage="analysis" /></div>{/if}
				</div>
			</details>

			<details class="tool-group">
				<summary><span><strong>History &amp; diagnostics</strong><small>Revisit recently viewed evidence and inspect processing health.</small></span><span class="group-count">2 tools</span></summary>
				<div class="group-body">
					<button class="report-toggle" onclick={() => (showRecall = !showRecall)}>{showRecall ? 'Hide evidence history' : 'Show evidence history'}</button>
					<button class="report-toggle" onclick={() => (showEvidenceStats = !showEvidenceStats)}>{showEvidenceStats ? 'Hide processing stats' : 'View processing stats'}</button>
					{#if showRecall}<div class="report-container"><EvidenceRecall bind:this={evidenceRecallRef} maxItems={10} onSelect={(item) => { selectedEvidence = { id: item.evidenceId, jsonData: { title: item.title, description: '', tags: [] } }; showEvidenceModal = true; }} /></div>{/if}
					{#if showEvidenceStats}<div class="report-container"><EvidenceStats /></div>{/if}
				</div>
			</details>

			<details class="tool-group">
				<summary><span><strong>Explore &amp; organize</strong><small>Alternative card views and retrieval-oriented document browsing.</small></span><span class="group-count">3 views</span></summary>
				<div class="group-body">
					<button class="report-toggle" onclick={() => (showEvidenceCards = !showEvidenceCards)}>{showEvidenceCards ? 'Hide evidence gallery' : 'Evidence card gallery'}</button>
					<button class="report-toggle" onclick={() => (showRichCards = !showRichCards)}>{showRichCards ? 'Hide rich cards' : 'Rich evidence cards'}</button>
					<button class="report-toggle" onclick={() => (showRagDocuments = !showRagDocuments)}>{showRagDocuments ? 'Hide document browser' : 'RAG document browser'}</button>
					{#if showEvidenceCards}<div class="report-container"><ExpandGrid columns={1} expandedColumns={3} gap="1rem" expandOnHover={true}>{#each evidenceItems as item (item.id)}<div class="grid-item" in:fly={{ y: 20, duration: 400, delay: 100, easing: quintOut }}><EvidenceCard evidence={{ ...item, file_name: item.fileName || item.title, evidence_type: item.evidenceType || item.type, file_type: item.fileType || item.mimeType, file_size: item.fileSize, uploaded_at: item.uploadedAt ? new Date(item.uploadedAt) : new Date(item.createdAt), ai_summary: item.aiSummary || item.summary || item.description }} onAskAI={(ev) => { goto(resolvePath(`/global-search?q=${encodeURIComponent(ev.file_name ?? '')}`)); }} onDelete={async (id) => { const res = await fetch('/api/evidence/' + id, { method: 'DELETE' }); if (res.ok) evidenceItems = evidenceItems.filter((entry) => entry.id !== id); }} /></div>{/each}</ExpandGrid></div>{/if}
					{#if showRichCards}<div class="report-container"><div class="rich-card-grid">{#each evidenceItems as item (item.id)}<RichEvidenceCard evidence={{ id: item.id, caseId: item.caseId, title: item.title, description: item.aiSummary || item.summary || item.description || '', evidenceType: item.evidenceType, fileName: item.fileName, fileUrl: item.fileUrl || `/evidence/${item.id}`, mimeType: item.fileType || item.mimeType, sizeBytes: item.fileSize, tags: Array.isArray(item.tags) ? item.tags : [], canvasPosition: { x: 0, y: 0 }, metadata: { ...(item.metadata || {}), createdAt: item.createdAt, uploadedAt: item.uploadedAt || item.createdAt, updatedAt: item.updatedAt || item.createdAt, uploadedBy: item.uploadedBy } }} showCompare={true} expandOnHover={true} />{/each}</div></div>{/if}
					{#if showRagDocuments}<div class="report-container"><RagDocumentGrid /></div>{/if}
				</div>
			</details>
		</div>
	</section>
</div>

{#if browser && showEvidenceModal}
	<EvidenceModal item={selectedEvidence} bind:open={showEvidenceModal} onSave={(updated) => { selectedEvidence = updated; showEvidenceModal = false; }} />
{/if}

<style>
	.evidence-library-page {
		--library-ink: #29211e;
		--library-muted: #77685d;
		--library-line: #e5d7c1;
		--library-paper: #fffaf1;
		min-height: 100%;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: clamp(1rem, 2vw, 2rem);
		background: linear-gradient(145deg, #fbf6ec 0%, #f4ead8 100%);
		color: var(--library-ink);
	}

	.library-header, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.library-header { padding-bottom: 1.25rem; border-bottom: 1px solid var(--library-line); margin-bottom: 1.25rem; }
	.eyebrow { margin: 0 0 0.35rem; color: #8a6b42; font: 600 0.65rem/1.3 'JetBrains Mono', monospace; letter-spacing: 0.12em; }
	.library-header h1, .section-heading h2 { margin: 0; color: var(--library-ink); font-family: Georgia, 'Times New Roman', serif; }
	.library-header h1 { font-size: clamp(1.65rem, 3vw, 2.2rem); }
	.library-subtitle, .section-heading > p { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.45rem 0 0; color: var(--library-muted); font-size: 0.82rem; }
	.library-subtitle span { border-left: 1px solid var(--library-line); padding-left: 0.75rem; }
	.upload-link { flex: 0 0 auto; padding: 0.65rem 1rem; border: 1px solid #6d272c; border-radius: 6px; background: #7b252b; color: #fff8e9; font-size: 0.82rem; font-weight: 600; text-decoration: none; transition: background 0.15s ease, transform 0.15s ease; }
	.upload-link:hover { background: #642027; transform: translateY(-1px); }
	.primary-workspace, .supporting-tools, .tool-group { min-width: 0; }
	.supporting-tools { margin-top: 2rem; }
	.section-heading { align-items: end; padding-bottom: 0.75rem; }
	.section-heading h2 { font-size: 1.35rem; }
	.section-heading > p { margin: 0; }
	.tool-groups { display: grid; gap: 0.65rem; }
	.tool-group { border: 1px solid var(--library-line); border-radius: 10px; background: rgba(255, 250, 241, 0.78); box-shadow: 0 3px 10px rgba(77, 49, 32, 0.035); }
	.tool-group > summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; cursor: pointer; list-style: none; }
	.tool-group > summary::-webkit-details-marker { display: none; }
	.tool-group > summary::after { content: '+'; color: #7b252b; font-size: 1.15rem; }
	.tool-group[open] > summary::after { content: '−'; }
	.tool-group summary strong, .tool-group summary small { display: block; }
	.tool-group summary strong { color: var(--library-ink); font-size: 0.9rem; }
	.tool-group summary small { margin-top: 0.2rem; color: var(--library-muted); font-size: 0.75rem; }
	.group-count { color: #8a6b42; font: 600 0.65rem 'JetBrains Mono', monospace; white-space: nowrap; }
	.group-body { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.85rem 1rem 1rem; border-top: 1px solid var(--library-line); }

	.report-toggle {
		padding: 0.5rem 0.75rem;
		background: var(--library-paper);
		border: 1px solid #d8c7aa;
		color: #5d4236;
		border-radius: 6px;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.report-toggle:hover { background: #f4ead8; border-color: #bca16f; }
	.report-toggle:focus-visible, .upload-link:focus-visible, .tool-group summary:focus-visible { outline: 2px solid #8a6b42; outline-offset: 2px; }
	.report-container {
		flex: 1 1 100%;
		min-width: 0;
		padding: 1rem;
		background: rgba(255, 253, 248, 0.72);
		border: 1px solid var(--library-line);
		border-radius: 8px;
		margin-top: 0.5rem;
	}
	.rich-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 1rem; }
	@media (max-width: 640px) {
		.evidence-library-page { padding: 1rem; }
		.library-header { align-items: flex-start; }
		.upload-link { padding: 0.55rem 0.7rem; }
		.section-heading { align-items: flex-start; flex-direction: column; gap: 0.25rem; }
		.group-body { flex-direction: column; align-items: stretch; }
	}
</style>
