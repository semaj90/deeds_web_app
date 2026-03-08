<script lang="ts">
	import { browser } from '$app/environment';
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

	let { data }: { data: PageData } = $props();
	let showRecall = $state(true);
	let evidenceRecallRef: EvidenceRecall | undefined = $state();
	let showReportGenerator = $state(false);
	let showEvidenceCards = $state(false);
	let showEvidenceStats = $state(false);
	let showRichCards = $state(false);
	let showRagDocuments = $state(false);

	const sampleEvidenceItems: any[] = [
		{ id: 'ev-001', file_name: 'Contract_Agreement_2024.pdf', evidence_type: 'document', file_type: 'application/pdf', file_size: 2_400_000, uploaded_at: new Date(Date.now() - 86400000 * 5), ai_summary: 'Employment agreement with non-compete clause. Contains liability provisions in Section 4.', tags: ['contract', 'employment'], ai_tags: ['legal-binding', 'non-compete'] },
		{ id: 'ev-002', file_name: 'Scene_Photo_001.jpg', evidence_type: 'photograph', file_type: 'image/jpeg', file_size: 3_800_000, uploaded_at: new Date(Date.now() - 86400000 * 2), ai_summary: 'Exterior photograph showing property boundary markers.', tags: ['property', 'boundary'], ai_tags: ['geolocation', 'outdoor'] },
		{ id: 'ev-003', file_name: 'Witness_Deposition.docx', evidence_type: 'testimony', file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size: 156_000, uploaded_at: new Date(Date.now() - 86400000), tags: ['witness', 'deposition'] },
	];
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
		{ eventType: 'analysis', userId: 'ai-system', timestamp: new Date(Date.now() - 86400000).toISOString(), details: { aiAnalysis: { riskLevel: 'low' }, models: ['gemma3-legal'] } },
	];
</script>

<div class="report-section" style="padding-bottom: 0;">
	<div style="display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; margin-bottom: 1rem;">
		<div style="flex: 1;">
			<div style="font-size: 0.95rem; font-weight: 600; color: #d6d3d1;">Evidence Library</div>
			<div style="font-size: 0.8rem; color: #78716c; margin-top: 0.25rem;">Upload and manage case evidence. Below are demo components and sample data.</div>
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
		<EvidenceAnalysisDashboard caseId={data.caseId} />
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
			{#each sampleEvidenceItems as item (item.id)}
				<div class="grid-item">
					<EvidenceCard
						evidence={item}
						onAskAI={(ev) => { console.log('Ask AI about:', ev.file_name); }}
						onDelete={(id) => { console.log('Delete evidence:', id); }}
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
			{#each sampleEvidenceItems as item (item.id)}
				<RichEvidenceCard
					evidence={{
						id: item.id,
						userId: 'system',
						title: item.file_name,
						filename: item.file_name,
						originalName: item.file_name,
						mimeType: item.file_type,
						description: item.ai_summary ?? '',
						type: item.evidence_type === 'photograph' ? 'image' : 'document',
						evidenceType: item.evidence_type,
						tags: item.tags ?? [],
						createdAt: item.uploaded_at?.toISOString?.() ?? '',
						uploadedAt: item.uploaded_at?.toISOString?.() ?? '',
						updatedAt: new Date().toISOString(),
						fileSize: item.file_size,
						path: `/evidence/${item.id}`,
						bucket: 'evidence',
						metadata: { format: item.file_type, size: item.file_size }
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

{#if browser && showEvidenceModal}
	<EvidenceModal item={selectedEvidence} bind:open={showEvidenceModal} onSave={(updated) => { selectedEvidence = updated; showEvidenceModal = false; }} />
{/if}

<style>
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
	}
</style>
