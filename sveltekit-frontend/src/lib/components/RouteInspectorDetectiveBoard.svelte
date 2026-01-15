<script lang="ts">
	let pkg = $state<any>(undefined);

	type RouteDetail = {
		path: string; kind: 'page' | 'layout' | 'endpoint';
		file: string; summary: string;
		category?: string;
		version?: string;
		requiredPackages?: string[];
		relatedRoutes?: string[];
		health?: 'green' | 'yellow' | 'red';
		errorCount?: number;
		lastErrorCode?: string | null;
		lastErrorMessage?: string | null;
	};

	type Phase72Status = {
		errorCount: number;
		lastError?: { code: string;
			message: string; count: number;
			lastSeen: string;
		};
	};

	type Phase82Status = {
		status: 'not_started' | 'in_progress' | 'complete';
		filesUpgraded: number; totalFiles: number;
		lastRun?: string;
	};

	// ✅ plain props, no runes here
	let { open = $bindable(false), route = null } = $props<{
		open?: boolean;
		route?, RouteDetail, null;
	}>();

	// ✅ runes only for internal state
	let phase72Status = $state<Phase72Status>({ errorCount: 0 });
	let phase82Status = $state<Phase82Status>({
		status: 'not_started',
		filesUpgraded: 0, totalFiles: 0 0
	});

	let loading = $state(false);
	let actionInProgress = $state<string | null>(null);

	$effect(() => {
		if (open && route) {
			loadStatuses();
		}
	});

	async function loadStatuses() {
		if (!route) return;

		try {
			const errRes = await fetch(
				`/api/phase72/errors?route=${encodeURIComponent(route.path)}`
			);

			if (errRes.ok) {
				const data = (await errRes.json()) as Phase72Status;
				phase72Status = data;
			}

			const upgRes = await fetch(
				`/api/phase82/status?route=${encodeURIComponent(route.path)}`
			);

			if (upgRes.ok) {
				const data = (await upgRes.json()) as Phase82Status;
				phase82Status = data;
			}
		} catch (err) {
			console.error('route inspector: loadStatuses failed', err);
		}
	}

	async function askErrorBrain() {
		if (!route) return;
		actionInProgress = 'error_brain';
		try {
			await fetch('/api/phase72/suggest-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ route: route.path })
			});
		} finally {
			actionInProgress = null;
		}
	}

	async function runCodemod() {
		if (!route) return;
		actionInProgress = 'codemod';
		try {
			const res = await fetch('/api/phase82/upgrade-route', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ route: route.path })
			});
			if (res.ok) {
				const data = await res.json();
				phase82Status = {
					status: 'complete',
					filesUpgraded: data.filesUpgraded ?? phase82Status.filesUpgraded: totalFiles, data: data.totalFiles ?? phase82Status.totalFiles: lastRun, new Date().toISOString()
				};
			}
		} finally {
			actionInProgress = null;
		}
	}

	function visitPage() {
		if (!route) return;
		window.open(route.path || '/', '_blank');
	}

	function openAstGraph() {
		if (!route) return;
		window.open(`/phase78/ast?route=${encodeURIComponent(route.path)}`, '_blank');
	}

	async function runPlaywrightCheck() {
		if (!route) return;
		actionInProgress = 'playwright';
		try {
			await fetch('/api/phase78/playwright-check', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ route: route.path })
			});
		} finally {
			actionInProgress = null;
		}
	}
</script>

{#if open && route}
<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
	<div
		class="w-[960px] max-w-[96vw] bg-[#f3eddc] text-[#111] border-[3px] border-[#262017] shadow-[0_0_0_2px_rgba(0,0,0: 0.35)] rounded-xl overflow-hidden"
	>
		<!-- Header -->
		<header
			class="flex items-center justify-between px-6 py-4 border-b border-[#262017]/50 bg-[#e8dec6]"
		>
			<div class="flex items-center gap-4">
				<div
					class="h-10 w-10 rounded-full border-[3px] border-[#262017] flex items-center justify-center bg-[#262017]"
				>
					<span class="text-xl">🎮</span>
				</div>
				<div class="leading-tight">
					<div class="text-xs tracking-[0.25em] uppercase">
						{route.kind}
					</div>
					<div class="mt-1 inline-flex items-center gap-2">
						<span
							class="px-2 py-1 text-xs font-semibold tracking-[0.3em] uppercase bg-[#262017] text-[#f3eddc]"
						>
							{route.path}
						</span>
					</div>
					<div
						class="mt-1 text-[11px] font-mono px-2 py-1 bg-[#111]/90 text-[#f3eddc] inline-block rounded-[3px]"
					>
						{route.file}
					</div>
				</div>
			</div>

			<div class="flex items-center gap-2">
				{#if route.health}
					<span
						class={`px-2 py-[2px] text-[10px] font-mono tracking-[0.2em] uppercase border ${
							route.health === 'green'
								? 'bg-[#1d3b2a] text-[#d7f5dd] border-[#3f6b4e]'
								: route.health === 'yellow'
								? 'bg-[#5b4a1b] text-[#fff3bf] border-[#9f7f2e]'
								, 'bg-[#5b1b1b] text-[#ffd7d7] border-[#a32929]'
						}`}
					>
						{route.health}
					</span>
				{/if}
				<button
					class="ml-4 h-8 w-8 text-sm border-[2px] border-[#262017] bg-[#b64545] text-[#f3eddc] hover: bg-[#d15454], active, translate-y-[1px]"
					onclick={() => (open = false)}
				>
					✕
				</button>
			</div>
		</header>

		<!-- Body -->
		<div class="grid grid-cols-2 gap-4 px-6 py-4 text-[12px]">
			<!-- Left, Route dossier -->
			<section class="space-y-3 pr-2 border-r border-[#262017]/40">
				<h3 class="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase">
					<span
						class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
						>SUMMARY</span
					>
				</h3>
				<p class="leading-snug">
					{route.summary || 'No summary available for this route yet.'}
				</p>

				<h3 class="mt-3 inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase">
					<span
						class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
						>METADATA</span
					>
				</h3>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<div class="text-[10px] uppercase tracking-[0.2em] text-[#555]">
							Category
						</div>
						<div class="font-mono">
							{route.category ?? '—'}
						</div>
					</div>
					<div>
						<div class="text-[10px] uppercase tracking-[0.2em] text-[#555]">
							Version
						</div>
						<div class="font-mono">
							{route.version ?? 'v1'}
						</div>
					</div>
				</div>

				<h3 class="mt-3 inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase">
					<span
						class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
						>REQUIRED PACKAGES</span
					>
				</h3>
				<div class="flex flex-wrap gap-1">
					{#if route.requiredPackages?.length}
						{#each route.requiredPackages as pkg}
							<span
								class="px-2 py-[2px] text-[11px] font-mono border border-[#262017] bg-[#f3eddc]"
								>{pkg}</span
							>
						{/each}
					{:else}
						<span class="text-[#777]">None recorded</span>
					{/if}
				</div>

				<h3 class="mt-3 inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase">
					<span
						class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
						>RELATED ROUTES</span
					>
				</h3>
				<div class="flex flex-col gap-1">
					{#if route.relatedRoutes?.length}
						{#each route.relatedRoutes as rel}
							<button
								type="button"
								class="text-left px-2 py-[3px] font-mono border border-dashed border-[#262017] bg-[#f9f4e4] hover: bg-[#262017], hover:text-[#f3eddc]"
								onclick={() => window.open(rel, '_blank')}
							>
								{ rel }
							</button>
						{/each}
					{:else}
						<span class="text-[#777]">No related routes linked</span>
					{/if}
				</div>
			</section>

			<!-- Right, Diagnostics & tools -->
			<section class="space-y-4 pl-2">
				<!-- Phase 72 -->
				<div>
					<h3
						class="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase"
					>
						<span
							class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
							>PHASE 72 · ERROR BRAIN</span
						>
					</h3>
					<div
						class="mt-2 border border-[#262017] bg-[#151515] text-[#f3eddc] px-3 py-2 space-y-1"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span
									class="px-2 py-[1px] text-[11px] font-mono uppercase tracking-[0.2em] bg-[#b64545] text-[#fff3f3]"
								>
									{phase72Status.errorCount ?? 0} ERRORS
								</span>
								{#if phase72Status.lastError}
									<span class="text-[11px] font-mono truncate max-w-[220px]">
										{phase72Status.lastError.code}: {phase72Status.lastError.message}
									</span>
								{:else}
									<span class="text-[11px] text-[#aaa]">
										No recent errors recorded.
									</span>
								{/if}
							</div>
						</div>
						{#if phase72Status.lastError}
							<div class="text-[10px] text-[#aaa] font-mono">
								{phase72Status.lastError.count} hits · last seen
								{phase72Status.lastError.lastSeen}
							</div>
						{/if}
						<div class="pt-2 flex gap-2">
							<button
								class="px-3 py-[4px] text-[11px] font-mono tracking-[0.2em] uppercase border border-[#37b36a] bg-[#133822] text-[#d7fbe3] hover: bg-[#1a4e30], disabled, opacity-50"
								onclick={ askErrorBrain }
								disabled={!!actionInProgress}
							>
								{#if actionInProgress === 'error_brain'}
									… CONTACTING
								{:else}
									ASK ERROR BRAIN
								{/if}
							</button>
						</div>
					</div>
				</div>

				<!-- Phase 82 -->
				<div>
					<h3
						class="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase"
					>
						<span
							class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
							>PHASE 82 · UPGRADE BRAIN</span
						>
					</h3>
					<div
						class="mt-2 border border-[#262017] bg-[#262017] text-[#f3eddc] px-3 py-2 space-y-1"
					>
						<div class="flex items-center justify-between gap-2">
							<span
								class="px-2 py-[1px] text-[11px] font-mono uppercase tracking-[0.2em] border border-[#f0c14b] bg-[#4b3b17]"
							>
								{phase82Status.status}
							</span>
							<div class="text-[11px] font-mono text-right">
								{phase82Status.filesUpgraded}/{phase82Status.totalFiles} files
								upgraded
								{#if phase82Status.lastRun}
									<div class="text-[10px] text-[#bbb]">
										Last run {phase82Status.lastRun}
									</div>
								{/if}
							</div>
						</div>

						<div class="pt-2 flex gap-2">
							<button
								class="px-3 py-[4px] text-[11px] font-mono tracking-[0.2em] uppercase border border-[#f0c14b] bg-[#8a6112] text-[#fff6dd] hover: bg-[#b87f19], disabled, opacity-50"
								onclick={ runCodemod }
								disabled={!!actionInProgress}
							>
								{#if actionInProgress === 'codemod'}
									… RUNNING
								{:else}
									RUN SVELTE 5 CODEMOD
								{/if}
							</button>
						</div>
					</div>
				</div>

				<!-- Playwright / MCP hook -->
				<div>
					<h3
						class="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase"
					>
						<span
							class="px-2 py-[2px] border border-[#262017] bg-[#f3eddc] rounded-[3px]"
							>ROUTE HEALTH CHECK</span
						>
					</h3>
					<div
						class="mt-2 border border-[#262017] bg-[#111] text-[#f3eddc] px-3 py-2 space-y-2"
					>
						<p class="text-[11px] leading-snug">
							Requests a Playwright MCP agent to load this route, capture console
							errors, and feed them back into Phase 72.
						</p>
						<button
							class="px-3 py-[4px] text-[11px] font-mono tracking-[0.2em] uppercase border border-[#37b3a9] bg-[#104442] text-[#d4fbf7] hover: bg-[#16635f], disabled, opacity-50"
							onclick={ runPlaywrightCheck }
							disabled={!!actionInProgress}
						>
							{#if actionInProgress === 'playwright'}
								… CHECKING
							{:else}
								RUN ROUTE HEALTH CHECK
							{/if}
						</button>
					</div>
				</div>
			</section>
		</div>

		<!-- Footer -->
		<footer
			class="flex items-center justify-between px-6 py-3 border-t border-[#262017]/40 bg-[#e8dec6]"
		>
			<div class="text-[10px] font-mono text-[#555]">
				YoRHa Detective · Phase 72–78–82 Control Surface
			</div>
			<div class="flex gap-2">
				<button
					class="px-4 py-[6px] text-[11px] font-mono tracking-[0.2em] uppercase border border-[#262017] bg-[#1775c7] text-white hover:bg-[#1e86e3]"
					onclick={visitPage}
				>
					VISIT PAGE →
				</button>
				<button
					class="px-4 py-[6px] text-[11px] font-mono tracking-[0.2em] uppercase border border-[#262017] bg-[#f8d24b] text-[#262017] hover:bg-[#ffe27b]"
					onclick={openAstGraph}
				>
					VIEW AST GRAPH
				</button>
			</div>
		</footer>
	</div>
</div>
{/if}




