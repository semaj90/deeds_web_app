<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Svelte5Tabs from '$lib/components/ui/tabs/Svelte5Tabs.svelte';
	import Svelte5TabPanel from '$lib/components/ui/tabs/Svelte5TabPanel.svelte';
	import EvidenceAssistant from '$lib/components/evidence/EvidenceAssistant.svelte';
	import ContextualEvidenceChatModal from '$lib/components/ai/ContextualEvidenceChatModal.svelte';
	import LegalDocumentSummarizer from '$lib/components/ai/LegalDocumentSummarizer.svelte';
	import Gemma270MWebAssembly from '$lib/components/ai/Gemma270MWebAssembly.svelte';
	import VisionImageAnalyzer from '$lib/components/evidence/VisionImageAnalyzer.svelte';
	import ContradictionReveal from '$lib/components/yorha/ContradictionReveal.svelte';
	import LegalAnalysisDialog from '$lib/components/LegalAnalysisDialog.svelte';
	import EvidenceReportSummary from '$lib/components/legal/EvidenceReportSummary.svelte';
	import type { EvidenceReport } from '$lib/components/legal/EvidenceReportSummary.svelte';

	let {
		open = $bindable(false),
		evidence = [],
		caseId = '',
		user = null
	}: {
		open?: boolean;
		evidence?: any[];
		caseId?: string;
		user?: any;
	} = $props();

	let activeTab = $state('assistant');
	let assistantNode = $state<{ id: string; title: string; type: string; description?: string; confidence?: number; metadata?: Record<string, unknown> }>({ id: '', title: '', type: 'document' });
	let showAssistant = $state(false);
	let showContradiction = $state(false);
	let contradictionMessage = $state('');
	let showLegalAnalysis = $state(false);
	let legalAnalysisEvidenceId = $state('');
	let legalAnalysisTitle = $state('Legal Analysis');
	let showReportSummary = $state(false);
	let reportEvidenceId = $state('');
	let reportData = $state<EvidenceReport | null>(null);
	let isLoadingReport = $state(false);

	const tabs = [
		{ id: 'assistant', label: 'AI Assistant' },
		{ id: 'chat', label: 'Evidence Chat' },
		{ id: 'summarizer', label: 'Summarizer' },
		{ id: 'vlm', label: 'Image Analysis' },
		{ id: 'vision', label: 'Vision Pipeline' }
	];

	export function analyzeEvidence(doc: any) {
		assistantNode = {
			id: doc.id,
			title: doc.title || doc.fileName || '',
			type: doc.fileType?.includes('pdf') ? 'document' : doc.fileType?.startsWith('image') ? 'person' : 'other',
			description: doc.description
		};
		showAssistant = true;
		activeTab = 'assistant';
		open = true;
	}

	export function showLegalAnalysisFor(id: string, title: string) {
		legalAnalysisEvidenceId = id;
		legalAnalysisTitle = `Legal Analysis: ${title}`;
		showLegalAnalysis = true;
	}

	export async function loadReport(evidenceId: string) {
		isLoadingReport = true;
		reportEvidenceId = evidenceId;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/report`);
			if (res.ok) {
				reportData = await res.json();
			} else {
				const doc = evidence.find((e: any) => e.id === evidenceId);
				reportData = {
					id: evidenceId,
					title: doc?.title ?? doc?.fileName ?? 'Evidence Report',
					type: 'document_analysis',
					status: 'pending',
					priority: 'medium',
					createdAt: doc?.createdAt ?? new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					analyst: { name: user?.username ?? user?.email ?? 'System', credentials: 'AI-Assisted', department: 'Digital Forensics' },
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
</script>

{#if open}
	<div class="drawer-backdrop" onclick={() => (open = false)} role="presentation"></div>
	<aside class="drawer">
		<div class="drawer-header">
			<h3 class="drawer-title">
				<Icon name="bot" class="w-4 h-4" />
				AI Tools
			</h3>
			<button type="button" class="drawer-close" onclick={() => (open = false)}>
				<Icon name="x" class="w-4 h-4" />
			</button>
		</div>

		<div class="drawer-body">
			{#if showReportSummary && reportData}
				<div class="report-section">
					<div class="report-header">
						<h4 class="report-title">Evidence Report</h4>
						<button type="button" class="report-close" onclick={() => { showReportSummary = false; reportData = null; }}>
							<Icon name="x" class="w-3.5 h-3.5" />
						</button>
					</div>
					<EvidenceReportSummary
						evidenceId={reportEvidenceId}
						{caseId}
						{reportData}
						allowExport={true}
					/>
				</div>
			{:else}
				<Svelte5Tabs {tabs} bind:value={activeTab} variant="underline">
					<Svelte5TabPanel value="assistant">
						<EvidenceAssistant
							node={assistantNode}
							bind:open={showAssistant}
							onupdate={(detail) => {
								if (detail.updates.description?.toLowerCase().includes('contradict')) {
									contradictionMessage = `Contradiction found in ${detail.nodeId}: ${detail.updates.description}`;
									showContradiction = true;
								}
							}}
						/>
					</Svelte5TabPanel>

					<Svelte5TabPanel value="chat">
						<ContextualEvidenceChatModal
							defaultCaseId={caseId}
							title="Evidence AI Assistant"
						/>
					</Svelte5TabPanel>

					<Svelte5TabPanel value="summarizer">
						<LegalDocumentSummarizer />
					</Svelte5TabPanel>

					<Svelte5TabPanel value="vlm">
						<Gemma270MWebAssembly {caseId} />
					</Svelte5TabPanel>

					<Svelte5TabPanel value="vision">
						<VisionImageAnalyzer {caseId} />
					</Svelte5TabPanel>
				</Svelte5Tabs>
			{/if}
		</div>
	</aside>
{/if}

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

<style>
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.3);
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 41;
		width: min(480px, 90vw);
		background: #0d0e14;
		border-left: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		animation: slideIn 0.2s ease-out;
	}
	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.drawer-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.8);
		margin: 0;
	}
	.drawer-close {
		padding: 0.375rem;
		border-radius: 6px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.drawer-close:hover {
		color: rgba(212, 199, 163, 0.7);
		background: rgba(255, 255, 255, 0.06);
	}
	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem;
	}
	.report-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.report-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.report-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.8);
		margin: 0;
	}
	.report-close {
		padding: 0.25rem;
		border-radius: 4px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.report-close:hover {
		color: rgba(212, 199, 163, 0.7);
		background: rgba(255, 255, 255, 0.06);
	}
	@keyframes slideIn {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}
</style>
