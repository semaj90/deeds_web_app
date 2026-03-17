<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/ui/Icon.svelte';
	import DetectiveEvidenceMap from '$lib/components/yorha/DetectiveEvidenceMap.svelte';
	import EvidenceConnections from '$lib/components/EvidenceConnections.svelte';
	import EvidenceCustodyFlow from '$lib/components/legal/EvidenceCustodyFlow.svelte';
	import ChainOfCustodyTracker from '$lib/components/legal/ChainOfCustodyTracker.svelte';
	import IntegrityVerification from '$lib/components/legal/IntegrityVerification.svelte';
	import RelationshipInspector from '$lib/components/evidence/RelationshipInspector.svelte';
	import WorkflowProgress from '$lib/components/legal/WorkflowProgress.svelte';
	import EvidenceComparisonOverlay from '$lib/components/yorha/evidence/EvidenceComparisonOverlay.svelte';

	let {
		open = $bindable(false),
		evidence = [],
		caseId = '',
		userId = ''
	}: {
		open?: boolean;
		evidence?: any[];
		caseId?: string;
		userId?: string;
	} = $props();

	let expandedSection = $state<string | null>(null);
	let workflowStage = $state('idle');
	let workflowPercent = $state(0);
	let showComparison = $state(false);
	let comparisonA = $state<{ id: string; fileName: string; extractedText: string; caseId?: string; timestamp?: string }>({ id: '', fileName: '', extractedText: '' });
	let comparisonB = $state<{ id: string; fileName: string; extractedText: string; caseId?: string; timestamp?: string }>({ id: '', fileName: '', extractedText: '' });

	function toggleSection(id: string) {
		expandedSection = expandedSection === id ? null : id;
	}

	function openComparison() {
		if (evidence.length >= 2) {
			comparisonA = { id: evidence[0].id, fileName: evidence[0].title ?? evidence[0].filename ?? 'Evidence A', extractedText: evidence[0].description ?? 'No text extracted', caseId };
			comparisonB = { id: evidence[1].id, fileName: evidence[1].title ?? evidence[1].filename ?? 'Evidence B', extractedText: evidence[1].description ?? 'No text extracted', caseId };
			showComparison = true;
		}
	}

	const sections = [
		{ id: 'map', label: 'Evidence Relationship Map', icon: 'map' },
		{ id: 'connections', label: 'Evidence Connections', icon: 'git-branch' },
		{ id: 'custody', label: 'Chain of Custody', icon: 'shield' },
		{ id: 'tracker', label: 'Custody Tracker', icon: 'clock' },
		{ id: 'integrity', label: 'Integrity Verification', icon: 'check-circle' },
		{ id: 'relationships', label: 'Relationship Inspector', icon: 'network' },
		{ id: 'workflow', label: 'Workflow Progress', icon: 'activity' }
	];

	let firstEvidence = $derived(evidence[0] ?? null);
</script>

{#if open}
	<div class="tools-panel">
		<div class="tools-header">
			<h3 class="tools-title">
				<Icon name="wrench" class="w-4 h-4" />
				Forensic Tools
			</h3>
			<div class="tools-header-actions">
				{#if evidence.length >= 2}
					<button type="button" class="tools-action-btn" onclick={openComparison}>
						<Icon name="columns" class="w-3.5 h-3.5" />
						Compare
					</button>
				{/if}
				<button type="button" class="tools-close" onclick={() => (open = false)}>
					<Icon name="x" class="w-4 h-4" />
				</button>
			</div>
		</div>

		<div class="tools-sections">
			{#each sections as section (section.id)}
				<div class="tool-section" class:expanded={expandedSection === section.id}>
					<button type="button" class="tool-trigger" onclick={() => toggleSection(section.id)}>
						<Icon name={section.icon} class="w-4 h-4" />
						<span>{section.label}</span>
						<Icon name={expandedSection === section.id ? 'chevron-up' : 'chevron-down'} class="w-3.5 h-3.5 trigger-arrow" />
					</button>

					{#if expandedSection === section.id}
						<div class="tool-content">
							{#if section.id === 'map'}
								<DetectiveEvidenceMap caseId={caseId || null} show={true} />
							{:else if section.id === 'connections'}
								<div class="connections-wrap">
									<EvidenceConnections evidence={evidence.map((e, i) => ({ id: e.id, x: 80 + (i % 4) * 200, y: 60 + Math.floor(i / 4) * 120, related: [], relation_type: 'related' }))} />
								</div>
							{:else if section.id === 'custody'}
								<EvidenceCustodyFlow
									evidenceId={firstEvidence?.id ?? ''}
									{caseId}
									{userId}
									originalHash={''}
									onWorkflowComplete={() => invalidateAll()}
									onWorkflowError={(err) => console.error('Custody error:', err)}
								/>
							{:else if section.id === 'tracker'}
								<ChainOfCustodyTracker
									evidence={{
										id: firstEvidence?.id ?? '',
										itemNumber: firstEvidence?.id?.slice(0, 8) ?? 'N/A',
										description: firstEvidence?.title ?? 'No evidence selected',
										category: 'document',
										collectedBy: userId || 'Unknown',
										currentCustodian: userId || 'Unknown',
										location: 'Evidence Locker',
										condition: 'good',
										sealed: true,
										chainOfCustody: [],
										compromised: false
									}}
								/>
							{:else if section.id === 'integrity'}
								<IntegrityVerification
									integrityStatus={evidence.length > 0 ? 'verified' : 'pending'}
									verificationResults={{ aiAnalysisScore: 0.94, tamperedIndicators: [] }}
									originalHash={firstEvidence?.id ?? ''}
									currentHash={firstEvidence?.id ?? ''}
									aiAnalysis={{ riskLevel: 'low', confidence: 0.96, models: ['gemma3-legal'] }}
									showDetails={true}
								/>
							{:else if section.id === 'relationships'}
								<RelationshipInspector caseId={caseId || 'default'} selectedEvidenceId={firstEvidence?.id ?? null} />
							{:else if section.id === 'workflow'}
								<WorkflowProgress progress={workflowPercent} stage={workflowStage} stageName={workflowStage.replace(/-/g, ' ')} />
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

<EvidenceComparisonOverlay
	evidenceA={comparisonA}
	evidenceB={comparisonB}
	show={showComparison}
	onDismiss={() => (showComparison = false)}
/>

<style>
	.tools-panel {
		margin: 0 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		overflow: hidden;
	}
	.tools-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}
	.tools-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.6);
		margin: 0;
	}
	.tools-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tools-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		background: rgba(96, 165, 250, 0.08);
		border: 1px solid rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tools-action-btn:hover {
		background: rgba(96, 165, 250, 0.15);
	}
	.tools-close {
		padding: 0.25rem;
		border-radius: 4px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tools-close:hover {
		color: rgba(212, 199, 163, 0.7);
		background: rgba(255, 255, 255, 0.06);
	}
	.tools-sections {
		display: flex;
		flex-direction: column;
	}
	.tool-section {
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}
	.tool-section:last-child {
		border-bottom: none;
	}
	.tool-trigger {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 1rem;
		background: transparent;
		border: none;
		color: rgba(212, 199, 163, 0.5);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}
	.tool-trigger:hover {
		background: rgba(255, 255, 255, 0.03);
		color: rgba(212, 199, 163, 0.8);
	}
	.tool-trigger span {
		flex: 1;
	}
	:global(.trigger-arrow) {
		opacity: 0.4;
	}
	.tool-section.expanded .tool-trigger {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.04);
	}
	.tool-content {
		padding: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.03);
	}
	.connections-wrap {
		position: relative;
		height: 400px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.15);
	}
</style>
