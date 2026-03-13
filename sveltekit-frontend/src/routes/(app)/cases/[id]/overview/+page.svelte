<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import LegalDocumentDrafting from '$lib/components/ai/LegalDocumentDrafting.svelte';
	import EvidenceManager from '$lib/components/evidence/EvidenceManager.svelte';
	import SimilarCasesPanel from '$lib/components/legal/SimilarCasesPanel.svelte';
	import NesModal from '$lib/components/nes/NesModal.svelte';
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	type TabId = 'overview' | 'evidence' | 'persons' | 'ai' | 'reports';

	type ErrorSummary = {
		totalErrors: number;
		byRoute?: Record<string, number>;
	};

	type ConsolidationStatus = {
		status: 'idle' | 'running' | 'complete' | 'error';
		lastRun?: string;
		clusterCount?: number;
	};

	let { data } = $props<{ data: PageData }>();

	let activeTab = $state<TabId>('overview');
	let showDraftingTool = $state(false);
	let showEvidenceManager = $state(false);
	let showNotesModal = $state(false);

	let errorSummary = $state<ErrorSummary | null>(null);
	let consolidationStatus = $state<ConsolidationStatus | null>(null);
	let loadingDiagnostics = $state(false);
	let isExportingPacket = $state(false);
	let exportPacketError = $state<string | null>(null);

	// Reasoning chain state
	let isGeneratingReasoning = $state(false);
	let reasoningChain = $state<{ steps: Array<{ name: string; content: string; confidence: number; durationMs: number }>; overallConfidence: number } | null>(null);
	let reasoningError = $state<string | null>(null);

	// Key points generation state
	let generatingKeyPointsFor = $state<Set<string>>(new Set());
	let isGeneratingAllKeyPoints = $state(false);
	let keyPointsBatchResult = $state<{ generated: number; total: number } | null>(null);

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
		if (!browser) return;
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
				// Reload evidence key points
				if (result.generated > 0) {
					const reloadRes = await fetch(`/api/cases/${caseId}/key-points`).catch(() => null);
					// Trigger a page-level data refresh by re-fetching evidence
					for (const item of localEvidence) {
						if (!item.keyPoints?.length) {
							const kpRes = await fetch(`/api/evidence/${item.id}/key-points`).catch(() => null);
							if (kpRes?.ok) {
								const kpData = await kpRes.json();
								if (kpData.keyPoints?.length) {
									localEvidence = localEvidence.map(e =>
										e.id === item.id ? { ...e, keyPoints: kpData.keyPoints } : e
									);
								}
							}
						}
					}
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

	function setTab(tab: TabId) {
		activeTab = tab;
	}
</script>

<div class="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col">
	<!-- Top bar -->
	<header class="border-b border-neutral-800 px-6 py-4 flex items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<div class="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/50 flex items-center justify-center text-xs font-semibold">
				AI
			</div>
			<div>
				<h1 class="text-xl font-semibold leading-tight">
					Case #{data.caseData?.id ?? data.caseId}
				</h1>
				<p class="text-xs text-neutral-400 line-clamp-1">
					{data.caseData?.title ?? 'Untitled case'} • {data.caseData?.status ?? 'Draft'}
				</p>
			</div>
		</div>

		<!-- Diagnostics mini-panel (Phase 72 / AST) -->
		<section class="flex items-center gap-4 text-xs">
			<div class="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900/60 flex items-center gap-2">
				<span class="inline-flex h-2 w-2 rounded-full {errorSummary && errorSummary.totalErrors > 0 ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
				<span class="font-medium">
					Errors:
					{#if errorSummary}
						{errorSummary.totalErrors}
					{:else}
						–
					{/if}
				</span>
				{#if loadingDiagnostics}
					<span class="text-neutral-500">scanning…</span>
				{/if}
			</div>

			<div class="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900/60 flex items-center gap-2">
				<span class="inline-flex h-2 w-2 rounded-full
					{consolidationStatus?.status === 'complete' ? 'bg-emerald-400'
					: consolidationStatus?.status === 'running' ? 'bg-sky-400'
					: consolidationStatus?.status === 'error' ? 'bg-rose-400'
					: 'bg-neutral-500'}"></span>
				<span class="font-medium">
					Phase 72 graph:
					{consolidationStatus?.status ?? 'idle'}
				</span>
				{#if consolidationStatus?.clusterCount}
					<span class="text-neutral-500">
						{consolidationStatus.clusterCount} clusters
					</span>
				{/if}
			</div>

			<button
				class="px-3 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors text-xs"
				disabled={loadingDiagnostics}
				onclick={loadDiagnostics}
			>
				Refresh
			</button>

			<button
				class="px-3 py-2 rounded-lg border border-sky-700 bg-sky-500/10 hover:bg-sky-500/20 transition-colors text-xs text-sky-300 flex items-center gap-1.5"
				onclick={() => (showNotesModal = true)}
			>
				<Icon name="notebook-pen" size={14} />
				Quick Notes
			</button>

			<button
				class="px-3 py-2 rounded-lg border border-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-xs text-emerald-300 flex items-center gap-1.5"
				disabled={isExportingPacket}
				onclick={handleExportPacket}
			>
				<Icon name="download" size={14} />
				{isExportingPacket ? 'Exporting...' : 'Export PDF'}
			</button>
			{#if exportPacketError}
				<span class="text-rose-400 text-xs">{exportPacketError}</span>
			{/if}
		</section>
	</header>

	<!-- Tabs -->
	<nav class="case-tab-bar">
		{#each [
			{ id: 'overview', label: 'Overview' },
			{ id: 'evidence', label: 'Evidence' },
			{ id: 'persons', label: 'Persons' },
			{ id: 'ai', label: 'AI' },
			{ id: 'reports', label: 'Reports' }
		] as tab}
			{@const t = tab.id as TabId}
			<button
				class="case-tab"
				class:active={activeTab === t}
				onclick={() => setTab(t)}
			>
				{tab.label}
			</button>
		{/each}
	</nav>

	<!-- Content -->
	<main class="flex-1 px-6 py-4 space-y-4">
		{#if activeTab === 'overview'}
			<section class="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<!-- Left, narrative / summary -->
				<div class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3">
					<h2 class="text-sm font-semibold text-neutral-100">Narrative</h2>
					<p class="text-sm text-neutral-300 whitespace-pre-line">
						{data.caseData?.narrative ?? 'No narrative captured yet.'}
					</p>

					<div class="grid gap-2 text-xs text-neutral-300 md:grid-cols-3">
						<div>
							<p class="text-neutral-500">WHO</p>
							<p>{data.caseData?.who ?? '—'}</p>
						</div>
						<div>
							<p class="text-neutral-500">WHAT</p>
							<p>{data.caseData?.what ?? '—'}</p>
						</div>
						<div>
							<p class="text-neutral-500">WHEN</p>
							<p>{data.caseData?.when ?? '—'}</p>
						</div>
						<div>
							<p class="text-neutral-500">WHERE</p>
							<p>{data.caseData?.where ?? '—'}</p>
						</div>
						<div>
							<p class="text-neutral-500">WHY</p>
							<p>{data.caseData?.why ?? '—'}</p>
						</div>
						<div>
							<p class="text-neutral-500">HOW</p>
							<p>{data.caseData?.how ?? '—'}</p>
						</div>
					</div>
				</div>

				<!-- Right, quick stats -->
				<div class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3 text-sm">
					<h2 class="text-sm font-semibold text-neutral-100">Quick stats</h2>
					<p class="text-neutral-300">
						Evidence items: <span class="font-semibold">{data.evidence?.length ?? 0}</span>
					</p>
					<p class="text-neutral-300">
						Persons of interest: <span class="font-semibold">{data.persons?.length ?? 0}</span>
					</p>
					<p class="text-neutral-400 text-xs">
						Use the <span class="font-semibold">canvas</span> view for the full evidence board.
					</p>
				</div>
			</section>

			<!-- Similar Cases Section -->
			{#if data.caseData?.id || data.caseId}
				<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 overflow-hidden">
					<div class="px-4 py-3 border-b border-neutral-800">
						<h2 class="text-sm font-semibold text-neutral-100">Similar Cases</h2>
						<p class="text-xs text-neutral-400 mt-1">
							AI-powered similarity analysis using multi-modal ranking (vector, tags, topics, graph, user preferences)
						</p>
					</div>
					<div class="p-4">
						<SimilarCasesPanel
							caseId={data.caseData?.id ?? data.caseId}
							limit={5}
							class="h-[500px]"
						/>
					</div>
				</section>
			{/if}
		{:else if activeTab === 'evidence'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
				<h2 class="text-sm font-semibold mb-3">Evidence</h2>
				{#if localEvidence?.length}
					<div class="space-y-2 text-sm">
						{#each localEvidence as item (item.id)}
							<div class="px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-800">
								<div class="flex items-center justify-between gap-4">
									<div class="min-w-0">
										<p class="font-medium truncate">{item.label ?? item.filename}</p>
										<p class="text-xs text-neutral-500 truncate">
											{item.type ?? 'document'} • {item.mimeType ?? 'unknown'}
										</p>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										{#if !item.keyPoints?.length}
											<button
												class="px-2 py-1 rounded border border-emerald-700/50 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-[10px] text-emerald-300 flex items-center gap-1"
												disabled={generatingKeyPointsFor.has(item.id)}
												onclick={() => generateKeyPoints(item.id)}
											>
												<Icon name="sparkles" size={10} />
												{generatingKeyPointsFor.has(item.id) ? 'Generating...' : 'Key Points'}
											</button>
										{/if}
										<span class="text-[10px] uppercase tracking-wide text-neutral-500">
											{item.status ?? 'indexed'}
										</span>
									</div>
								</div>
								{#if item.keyPoints?.length}
									<ul class="mt-2 space-y-0.5">
										{#each item.keyPoints as point}
											<li class="text-xs text-neutral-400 flex items-start gap-1.5">
												<span class="text-emerald-400 mt-0.5 shrink-0">•</span>
												<span>{point}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-neutral-400">No evidence attached yet.</p>
				{/if}
			</section>

			<div class="mt-4">
				<button
					class="px-3 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors text-xs"
					onclick={() => (showEvidenceManager = !showEvidenceManager)}
				>
					{showEvidenceManager ? 'Hide Evidence Manager' : 'Evidence Manager'}
				</button>
			</div>
			{#if showEvidenceManager}
				<div class="mt-3">
					<EvidenceManager caseId={data.caseData?.id?.toString()} />
				</div>
			{/if}
		{:else if activeTab === 'persons'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
				<h2 class="text-sm font-semibold mb-3">Persons of Interest</h2>
				{#if localPersons?.length}
					<div class="grid gap-3 md:grid-cols-2">
						{#each localPersons as person (person.id)}
							<div class="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 space-y-1 text-sm">
								<p class="font-medium">{person.name ?? 'Unknown'}</p>
								<p class="text-xs text-neutral-500">
									{person.role ?? 'Person of interest'} • Risk: {person.riskScore ?? '—'}
								</p>
								{#if person.aiSummary}
									<p class="text-xs text-neutral-300 mt-1 leading-relaxed">{person.aiSummary}</p>
								{:else}
									<button
										class="mt-1 px-2 py-1 rounded border border-emerald-700/50 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-[10px] text-emerald-300 flex items-center gap-1"
										disabled={generatingSummaryFor.has(person.id)}
										onclick={() => generatePoiSummary(person.id)}
									>
										<Icon name="sparkles" size={10} />
										{generatingSummaryFor.has(person.id) ? 'Generating...' : 'Generate Summary'}
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-neutral-400">No persons of interest recorded yet.</p>
				{/if}
			</section>
		{:else if activeTab === 'ai'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3 text-sm">
				<h2 class="text-sm font-semibold">AI analysis</h2>
				<p class="text-neutral-400">
					AI-powered document drafting and case analysis via Gemma3 legal model.
				</p>

				<div class="flex items-center gap-2 flex-wrap">
					<button
						class="px-3 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors text-xs"
						onclick={() => (showDraftingTool = !showDraftingTool)}
					>
						{showDraftingTool ? 'Hide Document Drafting' : 'Legal Document Drafting'}
					</button>
					<button
						class="px-3 py-2 rounded-lg border border-amber-700 bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-xs text-amber-300 flex items-center gap-1.5"
						disabled={isGeneratingReasoning}
						onclick={generateReasoningChain}
					>
						<Icon name="brain" size={14} />
						{isGeneratingReasoning ? 'Generating...' : 'Legal Reasoning Chain'}
					</button>
					<button
						class="px-3 py-2 rounded-lg border border-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-xs text-emerald-300 flex items-center gap-1.5"
						disabled={isGeneratingAllKeyPoints}
						onclick={generateAllKeyPoints}
					>
						<Icon name="list" size={14} />
						{isGeneratingAllKeyPoints ? 'Generating...' : 'Generate Evidence Key Points'}
					</button>
				</div>

				{#if keyPointsBatchResult}
					<div class="text-xs text-emerald-400">
						Generated key points for {keyPointsBatchResult.generated}/{keyPointsBatchResult.total} evidence items
					</div>
				{/if}
			</section>
			{#if showDraftingTool}
				<div class="mt-3">
					<LegalDocumentDrafting />
				</div>
			{/if}

			{#if reasoningError}
				<div class="rounded-xl border border-rose-800/30 bg-rose-950/20 p-4 text-rose-300 text-xs">
					{reasoningError}
				</div>
			{/if}

			{#if reasoningChain}
				<section class="rounded-xl border border-amber-800/30 bg-amber-950/10 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold text-amber-200">Legal Reasoning Chain</h3>
						<span class="text-xs px-2 py-1 rounded-full border border-amber-700/50 text-amber-300">
							{Math.round(reasoningChain.overallConfidence * 100)}% confidence
						</span>
					</div>

					{#each reasoningChain.steps as step, i}
						<div class="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-1">
							<div class="flex items-center justify-between">
								<h4 class="text-xs font-semibold text-neutral-200">
									Step {i + 1}: {step.name}
								</h4>
								<span class="text-[10px] text-neutral-500">
									{step.durationMs}ms • {Math.round(step.confidence * 100)}%
								</span>
							</div>
							<p class="text-xs text-neutral-300 whitespace-pre-line">{step.content}</p>
						</div>
					{/each}
				</section>
			{/if}
		{:else if activeTab === 'reports'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-4 text-sm">
				<!-- Header with Actions -->
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold">Reports & Documents</h2>
					<div class="flex items-center gap-2">
						<a
							href="/reports/new?caseId={data.caseId}"
							class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-xs"
						>
							<Icon name="plus" class="w-3 h-3" />
							<span>New Report</span>
						</a>
						<a
							href="/cases/{data.caseId}/reports"
							class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition-colors text-xs"
						>
							<Icon name="folder-open" class="w-3 h-3" />
							<span>View All</span>
						</a>
					</div>
				</div>

				<!-- Quick Actions -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
					<a
						href="/cases/{data.caseId}/reports"
						class="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 hover:border-accent/30 hover:bg-neutral-800/50 transition-all group"
					>
						<Icon name="scale" class="w-5 h-5 text-accent mt-0.5" />
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-neutral-100 group-hover:text-accent transition-colors">
								Charging Memorandum
							</div>
							<div class="text-xs text-neutral-400 mt-0.5">
								AI-generated charging recommendation with legal analysis
							</div>
						</div>
					</a>

					<a
						href="/cases/{data.caseId}/reports"
						class="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 hover:border-accent/30 hover:bg-neutral-800/50 transition-all group"
					>
						<Icon name="file-text" class="w-5 h-5 text-accent mt-0.5" />
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-neutral-100 group-hover:text-accent transition-colors">
								Discovery List
							</div>
							<div class="text-xs text-neutral-400 mt-0.5">
								Comprehensive inventory of evidence and materials
							</div>
						</div>
					</a>

					<a
						href="/cases/{data.caseId}/reports"
						class="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 hover:border-accent/30 hover:bg-neutral-800/50 transition-all group"
					>
						<Icon name="presentation" class="w-5 h-5 text-accent mt-0.5" />
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-neutral-100 group-hover:text-accent transition-colors">
								Hearing Preparation
							</div>
							<div class="text-xs text-neutral-400 mt-0.5">
								Arguments, exhibits, and witness examination notes
							</div>
						</div>
					</a>

					<a
						href="/cases/{data.caseId}/reports"
						class="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 hover:border-accent/30 hover:bg-neutral-800/50 transition-all group"
					>
						<Icon name="book-open" class="w-5 h-5 text-accent mt-0.5" />
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-neutral-100 group-hover:text-accent transition-colors">
								Legal Memorandum
							</div>
							<div class="text-xs text-neutral-400 mt-0.5">
								Research memo on legal issues and precedents
							</div>
						</div>
					</a>
				</div>

				<!-- Info -->
				<div class="flex items-start gap-2 p-3 rounded-lg border border-blue-800/30 bg-blue-950/20 text-blue-300 text-xs">
					<Icon name="info" class="w-4 h-4 mt-0.5 shrink-0" />
					<div>
						<strong>TipTap Editor with AI Assistant:</strong> All reports use the TipTap rich text editor with integrated AI assistance powered by Ollama gemma3-legal. Generate content, get suggestions, and refine your legal documents in real-time.
					</div>
				</div>
			</section>
		{/if}
	</main>
</div>

<!-- NES Notes Modal (SSR-safe — no bits-ui Dialog) -->
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
	.case-tab-bar {
		display: flex;
		gap: 4px;
		padding: 1rem 1.5rem 0;
		border-bottom: 1px solid #262626;
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	.case-tab {
		padding: 0.5rem 1rem;
		border-radius: 0.5rem 0.5rem 0 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		font-weight: 500;
		color: #a3a3a3;
		background: rgba(38, 38, 38, 0.4);
		cursor: pointer;
		transition: all 0.15s;
	}
	.case-tab:hover {
		color: #f5f5f5;
		background: #262626;
	}
	.case-tab.active {
		border-bottom-color: #34d399;
		color: #6ee7b7;
		background: #171717;
	}
</style>
