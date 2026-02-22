<script lang="ts">
	import type { PageData } from './$types';
	import EvidenceAnalysisDashboard from '$lib/components/dashboard/EvidenceAnalysisDashboard.svelte';
	import PoliceReportGenerator from '$lib/components/yorha/PoliceReportGenerator.svelte';
	import CustodyTimeline from '$lib/components/legal/CustodyTimeline.svelte';
	import EvidenceModal from '$lib/components/modals/EvidenceModal.svelte';

	let { data }: { data: PageData } = $props();
	let showReportGenerator = $state(false);
	let showTimeline = $state(false);
	let showEvidenceModal = $state(false);
	let selectedEvidence = $state<any>({ jsonData: { title: '', description: '', tags: [] } });

	const sampleCustodyEvents = [
		{ eventType: 'intake', userId: 'officer-1', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), details: { hashMatch: true, originalHash: 'a1b2c3d4e5f6' } },
		{ eventType: 'verification', userId: 'forensics-lab', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), details: { integrityStatus: 'verified', verificationResults: { aiAnalysisScore: 0.97 } } },
		{ eventType: 'analysis', userId: 'ai-system', timestamp: new Date(Date.now() - 86400000).toISOString(), details: { aiAnalysis: { riskLevel: 'low' }, models: ['gemma3-legal'] } },
	];
</script>

<EvidenceAnalysisDashboard caseId={data.caseId} />

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
</div>
{#if showTimeline}
	<div class="report-container">
		<CustodyTimeline events={sampleCustodyEvents} currentStage="analysis" />
	</div>
{/if}

<EvidenceModal item={selectedEvidence} bind:open={showEvidenceModal} onSave={(updated) => { selectedEvidence = updated; showEvidenceModal = false; }} />

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
