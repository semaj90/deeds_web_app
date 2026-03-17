<script lang="ts">
	import LegalDocumentDrafting from '$lib/components/ai/LegalDocumentDrafting.svelte';
	import EvidenceManager from '$lib/components/evidence/EvidenceManager.svelte';
	import SimilarCasesPanel from '$lib/components/legal/SimilarCasesPanel.svelte';
	import NesModal from '$lib/components/nes/NesModal.svelte';
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	type TabId = 'overview' | 'evidence' | 'persons' | 'ai' | 'reports';

	let { data, isModal = false, onClose = () => {} } = $props<{
		data: any;
		isModal?: boolean;
		onClose?: () => void;
	}>();

	let activeTab = $state<TabId>('overview');
	let showDraftingTool = $state(false);
	let showEvidenceManager = $state(false);
	let showNotesModal = $state(false);

	let errorSummary = $state<any>(null);
	let consolidationStatus = $state<any>(null);
	let loadingDiagnostics = $state(false);
	let isExportingPacket = $state(false);
	let exportPacketError = $state<string | null>(null);

	// Reasoning chain state
	let isGeneratingReasoning = $state(false);
	let reasoningChain = $state<any>(null);
	let reasoningError = $state<string | null>(null);

	// Key points generation state
	let generatingKeyPointsFor = $state<Set<string>>(new Set());
	let isGeneratingAllKeyPoints = $state(false);
	let keyPointsBatchResult = $state<any>(null);

	// POI summary generation state
	let generatingSummaryFor = $state<Set<string>>(new Set());

	// Local mutable copies for optimistic updates
	let localEvidence = $state<Array<any>>([]);
	let localPersons = $state<Array<any>>([]);

	$effect(() => {
		localEvidence = [...(data.evidence ?? [])];
		localPersons = [...(data.persons ?? [])];
	});

	$effect(() => {
		loadDiagnostics();
	});

	async function loadDiagnostics() {
		loadingDiagnostics = true;
		try {
			const [errRes, consRes] = await Promise.allSettled([
				fetch('/api/errors/summary'),
				fetch('/api/consolidation/status')
			]);

			if (errRes.status === 'fulfilled' && errRes.value.ok) {
				const json = await errRes.value.json();
				errorSummary = {
					totalErrors: json.total ?? 0,
					byRoute: json.byRoute ?? json.routes ?? {}
				};
			}

			if (consRes.status === 'fulfilled' && consRes.value.ok) {
				const json = await consRes.value.json();
				consolidationStatus = {
					status: json.status ?? 'idle',
					lastRun: json.lastRun ?? json.last_run,
					clusterCount: json.clusterCount ?? json.cluster_count
				};
			}
		} catch (err) {
			console.error('[CaseOverview] diagnostics error', err);
		} finally {
			loadingDiagnostics = false;
		}
	}

	async function handleExportPacket() {
		const caseId = data.caseData?.id ?? data.caseId;
		if (!caseId) return;
		isExportingPacket = true;
		exportPacketError = null;
		try {
			const res = await fetch(`/api/cases/${caseId}/export/pdf`, { method: 'POST' });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Export failed' }));
				exportPacketError = err.error || 'Export failed';
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `case-${caseId}-packet.html`;
			document.body.appendChild(a);
			a.click();
			setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
		} catch (err) {
			exportPacketError = 'Network error during export';
			console.error('[CaseOverview] export error', err);
		} finally {
			isExportingPacket = false;
		}
	}

	async function generateReasoningChain() {
		const caseId = data.caseData?.id ?? data.caseId;
		if (!caseId) return;
		isGeneratingReasoning = true;
		reasoningError = null;

		try {
			const res = await fetch(`/api/cases/${caseId}/reasoning-chain`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					summary: data.caseData?.narrative ?? data.caseData?.title ?? 'Case analysis',
					keyFacts: [data.caseData?.who, data.caseData?.what, data.caseData?.when, data.caseData?.where].filter(Boolean),
					jurisdiction: data.caseData?.jurisdiction ?? undefined
				})
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Generation failed' }));
				reasoningError = err.error || 'Generation failed';
				return;
			}
			const result = await res.json();
			if (result.success) {
				reasoningChain = result.chain;
			} else {
				reasoningError = result.error || 'Unknown error';
			}
		} catch {
			reasoningError = 'Network error';
		} finally {
			isGeneratingReasoning = false;
		}
	}

	async function generateKeyPoints(evidenceId: string) {
		generatingKeyPointsFor = new Set([...generatingKeyPointsFor, evidenceId]);
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/key-points`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId: data.caseId })
			});
			if (res.ok) {
				const result = await res.json();
				if (result.keyPoints?.length) {
					localEvidence = localEvidence.map(e =>
						e.id === evidenceId ? { ...e, keyPoints: result.keyPoints } : e
					);
				}
			}
		} catch {
			// Silent fail
		} finally {
			const next = new Set(generatingKeyPointsFor);
			next.delete(evidenceId);
			generatingKeyPointsFor = next;
		}
	}

	async function generateAllKeyPoints() {
		const caseId = data.caseData?.id ?? data.caseId;
		if (!caseId) return;
		isGeneratingAllKeyPoints = true;
		keyPointsBatchResult = null;
		try {
			const res = await fetch(`/api/cases/${caseId}/key-points`, { method: 'POST' });
			if (res.ok) {
				const result = await res.json();
				keyPointsBatchResult = { generated: result.generated, total: result.total };
				if (result.generated > 0) {
					// In a real app we might trigger a global refresh, but for now we'll just update local state if we fetch more
				}
			}
		} catch {
			// Silent fail
		} finally {
			isGeneratingAllKeyPoints = false;
		}
	}

	async function generatePoiSummary(poiId: string) {
		generatingSummaryFor = new Set([...generatingSummaryFor, poiId]);
		try {
			const res = await fetch(`/api/persons-of-interest/${poiId}/summary`, {
				method: 'POST'
			});
			if (res.ok) {
				const result = await res.json();
				if (result.summary) {
					localPersons = localPersons.map(p =>
						p.id === poiId ? { ...p, aiSummary: result.summary } : p
					);
				}
			}
		} catch {
			// Silent fail
		} finally {
			const next = new Set(generatingSummaryFor);
			next.delete(poiId);
			generatingSummaryFor = next;
		}
	}

	import { pushState } from '$app/navigation';

	function openDocumentModal(e: MouseEvent, id: string) {
		if (e.metaKey || e.ctrlKey) return;
		e.preventDefault();
		pushState(window.location.pathname, {
			showDocumentModal: true,
			documentId: id
		});
	}

	function setTab(tab: TabId) {
		activeTab = tab;
	}

	function getTabClass(tab: TabId): string {
		return [
			'px-4 py-2.5 rounded-t-xl transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2',
			activeTab === tab
				? 'border-amber-500 text-sand bg-panelSoft'
				: 'border-transparent text-sand/40 hover:text-sand/70'
		].join(' ');
	}
</script>

<div class="flex flex-col h-full {isModal ? 'bg-panel border border-sand/10 rounded-xl overflow-hidden shadow-2xl' : 'bg-panel'}">
	<!-- Top bar -->
	<header class="border-b border-sand/10 px-6 py-5 flex items-center justify-between gap-4 bg-panel/50 backdrop-blur-md">
		<div class="flex items-center gap-4">
			<div class="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
				<Icon name="briefcase" size={20} />
			</div>
			<div>
				<div class="flex items-center gap-2 mb-0.5">
					<h1 class="text-xl font-bold text-sand leading-tight">
						Case #{data.caseData?.id ?? data.caseId}
					</h1>
					<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sand/10 text-sand/60 border border-sand/20">
						{data.caseData?.status ?? 'Draft'}
					</span>
				</div>
				<p class="text-sm text-sand/50 font-medium">
					{data.caseData?.title ?? 'Untitled case'}
				</p>
			</div>
		</div>

		<section class="flex items-center gap-3">
			{#if isModal}
				<button
					onclick={onClose}
					class="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all text-sand/40 hover:text-sand border border-transparent hover:border-sand/10"
					aria-label="Close"
				>
					<Icon name="x" size={20} />
				</button>
			{:else}
				<div class="px-4 py-2 rounded-xl border border-sand/10 bg-panelSoft/50 flex items-center gap-2.5">
					<span class="relative flex h-2 w-2">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 {errorSummary && errorSummary.totalErrors > 0 ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
						<span class="relative inline-flex rounded-full h-2 w-2 {errorSummary && errorSummary.totalErrors > 0 ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
					</span>
					<span class="text-xs font-bold text-sand/70 uppercase tracking-widest">
						Errors: {errorSummary?.totalErrors ?? '0'}
					</span>
				</div>

				<button
					class="px-4 py-2 rounded-xl border border-sand/10 bg-panelSoft hover:bg-white/5 transition-all text-xs font-bold text-sand/70 flex items-center gap-2 uppercase tracking-widest"
					onclick={() => (showNotesModal = true)}
				>
					<Icon name="notebook-pen" size={14} />
					Notes
				</button>

				<button
					class="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all text-xs font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-widest"
					disabled={isExportingPacket}
					onclick={handleExportPacket}
				>
					<Icon name="download" size={14} />
					{isExportingPacket ? 'Exporting...' : 'Export PDF'}
				</button>
			{/if}
		</section>
	</header>

	<!-- Tabs -->
	<nav class="flex gap-1 px-6 pt-4 border-b border-sand/10 bg-panel/30">
		{#each [
			{ id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
			{ id: 'evidence', label: 'Evidence', icon: 'file-text' },
			{ id: 'persons', label: 'Persons', icon: 'users' },
			{ id: 'ai', label: 'AI Insights', icon: 'sparkles' },
			{ id: 'reports', label: 'Reports', icon: 'clipboard-list' }
		] as tab}
			{@const t = tab.id as TabId}
			<button
				class={getTabClass(t)}
				onclick={() => setTab(t)}
			>
				<Icon name={tab.icon} size={14} />
				{tab.label}
			</button>
		{/each}
	</nav>

	<!-- Content -->
	<main class="flex-1 overflow-y-auto p-6 space-y-6">
		{#if activeTab === 'overview'}
			<section class="grid gap-6 lg:grid-cols-[1fr_300px]">
				<div class="space-y-6">
					<div class="rounded-2xl border border-sand/10 bg-panelSoft/30 p-6 space-y-4">
						<div class="flex items-center justify-between">
							<h2 class="text-xs font-bold text-sand uppercase tracking-widest flex items-center gap-2">
								<Icon name="align-left" size={14} class="text-amber-500" />
								Narrative Analysis
							</h2>
						</div>
						<p class="text-sm text-sand/70 leading-relaxed font-medium">
							{data.caseData?.narrative ?? 'No narrative captured yet.'}
						</p>

						<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-sand/5">
							{#each ['WHO', 'WHAT', 'WHEN', 'WHERE', 'WHY', 'HOW'] as factual}
								<div class="space-y-1">
									<p class="text-[10px] font-bold text-sand/30 uppercase tracking-tighter">{factual}</p>
									<p class="text-xs font-semibold text-sand/80">{data.caseData?.[factual.toLowerCase()] ?? '—'}</p>
								</div>
							{/each}
						</div>
					</div>

					{#if data.caseData?.id || data.caseId}
						<div class="rounded-2xl border border-sand/10 bg-panelSoft/30 overflow-hidden">
							<div class="px-6 py-4 border-b border-sand/10 flex items-center justify-between bg-panel/50">
								<h2 class="text-xs font-bold text-sand uppercase tracking-widest flex items-center gap-2">
									<Icon name="link" size={14} class="text-amber-500" />
									Precedent & Similar Cases
								</h2>
								<span class="text-[10px] font-bold text-sand/40">VECTOR MATCH</span>
							</div>
							<div class="p-4">
								<SimilarCasesPanel
									caseId={data.caseData?.id ?? data.caseId}
									limit={5}
									class="h-[400px]"
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="space-y-6">
					<div class="rounded-2xl border border-sand/10 bg-panelSoft/30 p-6 space-y-5">
						<h2 class="text-xs font-bold text-sand uppercase tracking-widest flex items-center gap-2">
							<Icon name="bar-chart-3" size={14} class="text-amber-500" />
							Inventory
						</h2>

						<div class="space-y-4">
							<div class="flex items-center justify-between p-3 rounded-xl bg-panel/40 border border-sand/5">
								<div class="flex items-center gap-3">
									<div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
										<Icon name="file-text" size={16} />
									</div>
									<span class="text-xs font-bold text-sand/60">Evidence</span>
								</div>
								<span class="text-lg font-bold text-sand">{data.evidence?.length ?? 0}</span>
							</div>

							<div class="flex items-center justify-between p-3 rounded-xl bg-panel/40 border border-sand/5">
								<div class="flex items-center gap-3">
									<div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
										<Icon name="users" size={16} />
									</div>
									<span class="text-xs font-bold text-sand/60">Persons</span>
								</div>
								<span class="text-lg font-bold text-sand">{data.persons?.length ?? 0}</span>
							</div>
						</div>
					</div>

					<div class="rounded-2xl border border-sand/10 bg-panelSoft/30 p-6 space-y-4">
						<h2 class="text-xs font-bold text-sand uppercase tracking-widest flex items-center gap-2">
							<Icon name="info" size={14} class="text-amber-500" />
							Timeline
						</h2>
						<p class="text-xs text-sand/40 italic">Timeline feature coming soon...</p>
					</div>
				</div>
			</section>
		{:else if activeTab === 'evidence'}
			<section class="space-y-6">
				<div class="flex items-center justify-between">
					<h2 class="text-xs font-bold text-sand uppercase tracking-widest flex items-center gap-2">
						<Icon name="file-text" size={14} class="text-amber-500" />
						Case Evidence Index
					</h2>
				</div>

				{#if localEvidence?.length}
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each localEvidence as item (item.id)}
							<button
								class="text-left group rounded-2xl border border-sand/10 bg-panelSoft/30 hover:bg-white/5 p-4 transition-all hover:border-sand/20 cursor-pointer"
								onclick={(e) => openDocumentModal(e, item.id)}
							>
								<div class="flex items-start justify-between gap-4 mb-3">
									<div class="w-10 h-10 rounded-xl bg-sand/5 group-hover:bg-sand/10 flex items-center justify-center text-sand/40 group-hover:text-sand/80 transition-colors">
										<Icon name="file" size={20} />
									</div>
									<div class="px-2 py-0.5 rounded bg-sand/5 border border-sand/10 text-[9px] font-bold text-sand/40 uppercase tracking-widest">
										{item.mimeType?.split('/')[1] ?? 'DOC'}
									</div>
								</div>
								<h3 class="text-sm font-bold text-sand group-hover:text-amber-400 transition-colors truncate mb-1">
									{item.label ?? item.filename}
								</h3>
								<p class="text-[10px] font-bold text-sand/30 uppercase tracking-widest">
									ID: {item.id.slice(0, 8)}...
								</p>
							</button>
						{/each}
					</div>
				{:else}
					<div class="py-12 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl border border-dashed border-sand/10 bg-panelSoft/10">
						<Icon name="file-x" size={40} class="text-sand/20" />
						<p class="text-sm font-bold text-sand/30 uppercase tracking-widest">No evidence attached yet.</p>
					</div>
				{/if}
			</section>
		{:else}
			<div class="py-20 flex flex-col items-center justify-center text-center space-y-4">
				<Icon name="construction" size={48} class="text-amber-500/20" />
				<div class="space-y-1">
					<h3 class="text-lg font-bold text-sand/80 uppercase tracking-widest">Module Under Construction</h3>
					<p class="text-xs text-sand/40 font-medium">This section is currently being architected for the Legal Corpus v2.0</p>
				</div>
			</div>
		{/if}
	</main>
</div>

{#if data.caseData?.id || data.caseId}
	<NesModal
		open={showNotesModal}
		title="Case Notes — #{data.caseData?.id ?? data.caseId}"
		onClose={() => (showNotesModal = false)}
		widthClass="w-[1100px]"
	>
		<CaseNotesEditor
			caseId={data.caseData?.id ?? data.caseId}
			onClose={() => (showNotesModal = false)}
		/>
	</NesModal>
{/if}

<style>
	/* Any additional overrides if needed, but mostly using UnoCSS classes */
	:global(.lucide) {
		stroke-width: 2.5px;
	}
</style>
