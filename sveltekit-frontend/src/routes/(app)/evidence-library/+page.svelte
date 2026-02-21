<script lang="ts">
	import type { PageData } from './$types';
	import EvidenceAnalysisDashboard from '$lib/components/dashboard/EvidenceAnalysisDashboard.svelte';
	import PoliceReportGenerator from '$lib/components/yorha/PoliceReportGenerator.svelte';

	let { data }: { data: PageData } = $props();
	let showReportGenerator = $state(false);
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
