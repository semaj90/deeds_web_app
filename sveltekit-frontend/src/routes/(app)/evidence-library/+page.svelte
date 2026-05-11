<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
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
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';


	let { data }: { data: PageData } = $props();
	let showRecall = $state(true);
	let evidenceRecallRef: EvidenceRecall | undefined = $state();
	let showReportGenerator = $state(false);
	let showEvidenceCards = $state(false);
	let showEvidenceStats = $state(false);
	let showRichCards = $state(false);
	let showRagDocuments = $state(false);

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
		{ eventType: 'analysis', userId: 'ai-system', timestamp: new Date(Date.now() - 86400000).toISOString(), details: { aiAnalysis: { riskLevel: 'low' }, models: ['gemma4-legal'] } },
	];
</script>

<div class="evidence-library-page">
<div class="report-section" style="padding-bottom: 0;">
	<div style="display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; margin-bottom: 1rem;">
		<div style="flex: 1;">
			<div style="font-size: 0.95rem; font-weight: 600; color: var(--t-text, #d6d3d1);">Evidence Library</div>
			<div style="font-size: 0.8rem; color: var(--t-text-muted, #78716c); margin-top: 0.25rem;">
				Total Items: {evidenceItems.length}
				{#if data.caseId} | Case: {data.caseId} {/if}
			</div>

		</div>
		<a href="/evidence/upload" style="padding: 0.5rem 1rem; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; text-decoration: none; white-space: nowrap; transition: background 0.2s;">
			Upload Evidence
		</a>
	</div>
</div>

<div class="report-section">
	<button
		class="report-toggle"
		style="border-color: #8b5cf6; color: #8b5cf6; background: rgba(139,92,246,0.15);"
		onclick={() => (showEvidenceStats = !showEvidenceStats)}
	>
		{showEvidenceStats ? 'Hide Evidence Stats' : 'Evidence Processing Stats'}
	</button>
</div>
{#if showEvidenceStats}
	<div class="report-container">
		<EvidenceStats />
	</div>
{/if}

<LazyLoader placeholderHeight="400px" loadingText="Loading Evidence Dashboard...">
	{#snippet children()}
		<EvidenceAnalysisDashboard 
	caseId={data.caseId} 
	onUpload={(item) => {
		// Local update for instant feedback
		evidenceItems = [item, ...evidenceItems];
	}}
/>

	{/snippet}
</LazyLoader>

<div class="report-section">
	<button
		class="report-toggle"
		onclick={() => (showReportGenerator = !showReportGenerator)}
	>
		{showReportGenerator ? 'Hide Report Generator' : 'Generate Police Report'}
	</button>
</div>
{#if showReportGenerator}
	<div class="report-container">
		<PoliceReportGenerator caseId={data.caseId || null} />
	</div>
{/if}

<div class="report-section">
	<button
		class="report-toggle"
		onclick={() => (showTimeline = !showTimeline)}
	>
		{showTimeline ? 'Hide Custody Timeline' : 'Chain of Custody Timeline'}
	</button>
	<button
		class="report-toggle"
		style="margin-left: 0.5rem; border-color: #60a5fa; color: #60a5fa; background: rgba(59,130,246,0.15);"
		onclick={() => { selectedEvidence = { jsonData: { title: 'Sample Evidence', description: 'Evidence item from library', tags: ['forensic', 'digital'] } }; showEvidenceModal = true; }}
	>
		View Evidence Detail
	</button>
	<button
		class="report-toggle"
		style="margin-left: 0.5rem; border-color: #a78bfa; color: #a78bfa; background: rgba(167,139,250,0.15);"
		onclick={() => (showRecall = !showRecall)}
	>
		{showRecall ? 'Hide Recall' : 'Evidence Recall'}
	</button>
</div>
{#if showRecall}
	<div class="report-container">
		<EvidenceRecall
			bind:this={evidenceRecallRef}
			maxItems={10}
			onSelect={(item) => {
				selectedEvidence = { id: item.evidenceId, jsonData: { title: item.title, description: '', tags: [] } };
				showEvidenceModal = true;
			}}
		/>
	</div>
{/if}
{#if showTimeline}
	<div class="report-container">
		<CustodyTimeline events={sampleCustodyEvents} currentStage="analysis" />
	</div>
{/if}

<div class="report-section">
	<button
		class="report-toggle"
		style="border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.15);"
		onclick={() => (showEvidenceCards = !showEvidenceCards)}
	>
		{showEvidenceCards ? 'Hide Evidence Cards' : 'Evidence Card Gallery'}
	</button>
</div>
{#if showEvidenceCards}
	<div class="report-container">
		<ExpandGrid columns={1} expandedColumns={3} gap="1rem" expandOnHover={true}>
			{#each evidenceItems as item (item.id)}
				<div class="grid-item" in:fly={{ y: 20, duration: 400, delay: 100, easing: quintOut }}>
					<EvidenceCard
						evidence={{
							...item,
							file_name: item.fileName || item.title,
							evidence_type: item.evidenceType || item.type,
							file_type: item.fileType || item.mimeType,
							file_size: item.fileSize,
							uploaded_at: item.uploadedAt ? new Date(item.uploadedAt) : new Date(item.createdAt),
							ai_summary: item.aiSummary || item.summary || item.description
						}}
						onAskAI={(ev) => { goto('/global-search?q=' + encodeURIComponent(ev.file_name ?? '')); }}
						onDelete={async (id) => { 
							const res = await fetch('/api/evidence/' + id, { method: 'DELETE' });
							if (res.ok) {
								evidenceItems = evidenceItems.filter(i => i.id !== id);
							}
						}}
					/>
				</div>
			{/each}


		</ExpandGrid>
	</div>
{/if}

<div class="report-section">
	<button
		class="report-toggle"
		style="border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.15);"
		onclick={() => (showRichCards = !showRichCards)}
	>
		{showRichCards ? 'Hide Rich Cards' : 'Rich Evidence Cards'}
	</button>
</div>
{#if showRichCards}
	<div class="report-container">
		<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
			{#each evidenceItems as item (item.id)}
				<RichEvidenceCard
					evidence={{
						id: item.id,
						caseId: item.caseId,
						title: item.title,
						description: item.aiSummary || item.summary || item.description || '',
						evidenceType: item.evidenceType,
						fileName: item.fileName,
						fileUrl: item.fileUrl || `/evidence/${item.id}`,
						mimeType: item.fileType || item.mimeType,
						sizeBytes: item.fileSize,
						tags: Array.isArray(item.tags) ? item.tags : [],
						canvasPosition: { x: 0, y: 0 },
						metadata: {
							...(item.metadata || {}),
							createdAt:  item.createdAt,
							uploadedAt: item.uploadedAt || item.createdAt,
							updatedAt:  item.updatedAt  || item.createdAt,
							uploadedBy: item.uploadedBy
						}
					}}
					showCompare={true}
					expandOnHover={true}
				/>
			{/each}

		</div>
	</div>
{/if}

<div class="report-section">
	<button
		class="report-toggle"
		style="border-color: #06b6d4; color: #06b6d4; background: rgba(6,182,212,0.15);"
		onclick={() => (showRagDocuments = !showRagDocuments)}
	>
		{showRagDocuments ? 'Hide RAG Documents' : 'RAG Document Grid'}
	</button>
</div>
{#if showRagDocuments}
	<div class="report-container">
		<RagDocumentGrid />
	</div>
{/if}
</div>

{#if browser && showEvidenceModal}
	<EvidenceModal item={selectedEvidence} bind:open={showEvidenceModal} onSave={(updated) => { selectedEvidence = updated; showEvidenceModal = false; }} />
{/if}

<style>
	.evidence-library-page {
		min-height: 100vh;
		background: var(--t-bg, #0a0a0a);
		color: var(--t-text, #e0e0e0);
	}

	.report-section {
		padding: 1rem 2rem;
	}

	.report-toggle {
		padding: 0.6rem 1.2rem;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid #10b981;
		color: #10b981;
		border-radius: 4px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.report-toggle:hover {
		background: rgba(16, 185, 129, 0.25);
	}

	.report-container {
		padding: 0 2rem 2rem;
		background: rgba(23, 23, 23, 0.4);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		margin: 0 2rem 2rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}

</style>
