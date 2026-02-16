<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from './$types';

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

	let errorSummary = $state<ErrorSummary | null>(null);
	let consolidationStatus = $state<ConsolidationStatus | null>(null);
	let loadingDiagnostics = $state(false);

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
		{:else if activeTab === 'evidence'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
				<h2 class="text-sm font-semibold mb-3">Evidence</h2>
				{#if data.evidence?.length}
					<div class="space-y-2 text-sm">
						{#each data.evidence as item}
							<div class="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-800">
								<div class="min-w-0">
									<p class="font-medium truncate">{item.label ?? item.filename}</p>
									<p class="text-xs text-neutral-500 truncate">
										{item.type ?? 'document'} • {item.mimeType ?? 'unknown'}
									</p>
								</div>
								<span class="text-[10px] uppercase tracking-wide text-neutral-500">
									{item.status ?? 'indexed'}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-neutral-400">No evidence attached yet.</p>
				{/if}
			</section>
		{:else if activeTab === 'persons'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
				<h2 class="text-sm font-semibold mb-3">Persons of Interest</h2>
				{#if data.persons?.length}
					<div class="grid gap-3 md:grid-cols-2">
						{#each data.persons as person}
							<div class="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3 space-y-1 text-sm">
								<p class="font-medium">{person.name ?? 'Unknown'}</p>
								<p class="text-xs text-neutral-500">
									{person.role ?? 'Person of interest'} • Risk: {person.riskScore ?? '—'}
								</p>
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
					This tab will surface AI suggestions, risk analysis, and Phase 72 error insights for this case.
				</p>
				<p class="text-xs text-neutral-500">
					Hook this into your existing Gemma3 legal analysis endpoints and Phase 72 error vectors.
				</p>
			</section>
		{:else if activeTab === 'reports'}
			<section class="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 space-y-3 text-sm">
				<h2 class="text-sm font-semibold">Reports</h2>
				<p class="text-neutral-400">
					Use the dedicated reports page to generate and edit charging memos, discovery lists, and hearing prep.
				</p>
			</section>
		{/if}
	</main>
</div>

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
