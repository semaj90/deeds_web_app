<script lang="ts">
	// Pipeline Progress Panel
	// Wires to POST /api/codebase-index/orchestrate (SSE stream)
	// Renders a progress bar per stage + live status, timings, errors.

	interface StageState {
		id: string;
		label: string;
		status: 'pending' | 'running' | 'done' | 'error' | 'cached';
		progress: number; // 0-100
		message: string;
		durationMs?: number;
	}

	const STAGES: Array<{ id: string; label: string }> = [
		{ id: 'ast_embed', label: '1. AST + Embed' },
		{ id: 'cluster_assign', label: '2. Cluster Assign (k=20)' },
		{ id: 'som_topology', label: '3. SOM Topology' },
		{ id: 'neo4j_sync', label: '4. Neo4j Sync' },
		{ id: 'pagerank', label: '5. PageRank (GPU)' },
		{ id: 'summarize', label: '6. Summarize (TurboQuant)' },
		{ id: 'tag', label: '7. Karpathy Tags' },
		{ id: 'wiki_export', label: '8. Wiki Export' },
		{ id: 'hypergraph_4d', label: '9. Hypergraph 4D' },
		{ id: 'deep_research', label: '10. Deep Research' }
	];

	let stages = $state<StageState[]>(
		STAGES.map((s) => ({ ...s, status: 'pending', progress: 0, message: '' }))
	);
	let running = $state(false);
	let runId = $state<string | null>(null);
	let totalMs = $state(0);
	let abortController: AbortController | null = null;

	// ── Run options (user-toggleable) ─────────────────────────────────────
	let enabledStages = $state<Record<string, boolean>>({
		ast_embed: true,
		cluster_assign: true,
		som_topology: false,
		neo4j_sync: false,
		pagerank: false,
		summarize: true,
		tag: false,
		wiki_export: false,
		hypergraph_4d: false,
		deep_research: false
	});
	let scope = $state<'all' | 'lib' | 'routes' | 'workspace'>('lib');
	let fileLimit = $state<number | ''>(100);
	let resumeFromCache = $state(true);
	let multiPass = $state(false);
	let passCount = $state(3);

	// ── Live cache stats (passive fetch, non-blocking) ────────────────────
	let cacheStats = $state<{
		turbo: number;
		summary: number;
		research: number;
		totalMB: number;
	} | null>(null);

	async function refreshCacheStats() {
		// Two sources:
		//   /api/cache/exact-match/stats — Redis memory totals (totalKeys, memoryUsedMB)
		//   /api/cache/stats?pattern=X  — per-pattern key counts (if route exists)
		// Fall back gracefully if the count endpoint is absent.
		try {
			const summary = await fetch('/api/cache/exact-match/stats', {
				signal: AbortSignal.timeout(3000)
			})
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null);

			const counts = await Promise.all([
				countKeys('turbo:*'),
				countKeys('summary:cluster:*'),
				countKeys('research_bundle:*')
			]);

			cacheStats = {
				turbo: counts[0],
				summary: counts[1],
				research: counts[2],
				totalMB: Number(summary?.stats?.memoryUsedMB ?? 0)
			};
		} catch {
			/* non-fatal */
		}
	}

	async function countKeys(pattern: string): Promise<number> {
		try {
			const res = await fetch(`/api/cache/stats?pattern=${encodeURIComponent(pattern)}`, {
				signal: AbortSignal.timeout(2000)
			});
			if (!res.ok) return 0;
			const data = (await res.json()) as { count?: number; keys?: unknown[] };
			return Number(data.count ?? data.keys?.length ?? 0);
		} catch {
			return 0;
		}
	}

	const completedCount = $derived(
		stages.filter((s) => s.status === 'done' || s.status === 'cached').length
	);
	const overallProgress = $derived(Math.round((completedCount / STAGES.length) * 100));
	const selectedStageIds = $derived(STAGES.filter((s) => enabledStages[s.id]).map((s) => s.id));

	function resetStages() {
		stages = STAGES.map((s) => ({
			...s,
			status: 'pending' as const,
			progress: 0,
			message: ''
		}));
		totalMs = 0;
		runId = null;
	}

	function updateStage(id: string, patch: Partial<StageState>) {
		const idx = stages.findIndex((s) => s.id === id);
		if (idx === -1) return;
		stages[idx] = { ...stages[idx], ...patch };
	}

	function handleEvent(evt: string, payload: Record<string, unknown>) {
		if (evt === 'started') {
			runId = String(payload.runId ?? '');
			const cached = (payload.cachedStages as string[]) ?? [];
			for (const stageId of cached) {
				updateStage(stageId, { status: 'cached', progress: 100, message: 'cached' });
			}
			return;
		}
		if (evt === 'complete') {
			totalMs = Number(payload.totalDurationMs ?? 0);
			// Mark any still-running stages as done
			for (const s of stages) {
				if (s.status === 'running') updateStage(s.id, { status: 'done', progress: 100 });
			}
			return;
		}

		const stageId = String(payload.stage ?? '');
		if (!stageId) return;

		// Map scan -> ast_embed (scan is a sub-step of ast_embed)
		const mappedId = stageId === 'scan' || stageId === 'embed' ? 'ast_embed' : stageId;

		if (evt === 'stage') {
			const step = String(payload.step ?? '');
			if (step === 'cached') {
				updateStage(mappedId, {
					status: 'cached',
					progress: 100,
					message: 'cached',
					durationMs: Number(payload.durationMs ?? 0)
				});
			} else if (step === 'started') {
				updateStage(mappedId, { status: 'running', progress: 5, message: 'started' });
			} else if (step === 'done') {
				updateStage(mappedId, {
					status: 'done',
					progress: 100,
					message: 'done',
					durationMs: Number(payload.durationMs ?? 0)
				});
			} else if (step === 'error') {
				updateStage(mappedId, {
					status: 'error',
					progress: 100,
					message: String(payload.error ?? 'error')
				});
			} else if (step === 'skipped') {
				updateStage(mappedId, {
					status: 'done',
					progress: 100,
					message: 'skipped',
					durationMs: 0
				});
			}
			return;
		}

		if (evt === 'scan_progress') {
			// Server sends pct: null during scan (files still being discovered).
			// Use filesFound as a visual proxy — grows monotonically, capped at 40%
			// so chunk/embed phases can advance the bar further.
			const rawPct = payload.pct;
			const filesFound = Number(payload.filesFound ?? 0);
			const progress =
				typeof rawPct === 'number' && rawPct >= 0
					? Math.max(5, rawPct)
					: Math.min(40, 5 + Math.floor(filesFound / 50));
			updateStage('ast_embed', {
				status: 'running',
				progress,
				message: `scanning (${filesFound} files found)`
			});
			return;
		}

		if (evt === 'chunk_progress') {
			// Server-reported pct (files processed / total files). Map 0-100 → 40-70
			// so the bar visibly advances through chunk phase between scan (≤40%)
			// and embed (≥80%).
			const pct = Number(payload.pct ?? 0);
			updateStage('ast_embed', {
				status: 'running',
				progress: 40 + Math.min(30, Math.round(pct * 0.3)),
				message: `chunking (${payload.filesProcessed ?? 0}/${payload.totalFiles ?? '?'}, ${payload.chunksTotal ?? 0} chunks)`
			});
			return;
		}

		if (evt === 'chunk_done') {
			updateStage('ast_embed', {
				status: 'running',
				progress: 75,
				message: `chunked ${payload.chunksTotal ?? '?'} chunks`
			});
			return;
		}
		if (evt === 'embed_done') {
			updateStage('ast_embed', {
				status: 'done',
				progress: 100,
				message: `embedded ${payload.embeddedTotal ?? '?'}`,
				durationMs: Number(payload.durationMs ?? 0)
			});
			return;
		}

		if (evt.endsWith('_started')) {
			updateStage(mappedId, { status: 'running', progress: 10, message: evt });
			return;
		}
		if (evt.endsWith('_done')) {
			updateStage(mappedId, {
				status: 'done',
				progress: 100,
				message: 'done',
				durationMs: Number(payload.durationMs ?? 0)
			});
		}
	}

	async function streamOrchestrate(
		body: Record<string, unknown>,
		signal: AbortSignal
	): Promise<void> {
		const res = await fetch('/api/codebase-index/orchestrate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal,
			body: JSON.stringify(body)
		});
		if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split('\n\n');
			buffer = frames.pop() ?? '';
			for (const frame of frames) {
				const lines = frame.split('\n');
				let evtName = 'message';
				let data = '';
				for (const line of lines) {
					if (line.startsWith('event:')) evtName = line.slice(6).trim();
					else if (line.startsWith('data:')) data += line.slice(5).trim();
				}
				if (!data) continue;
				try {
					handleEvent(evtName, JSON.parse(data));
				} catch {
					/* non-JSON frame — skip */
				}
			}
		}
	}

	async function runOrchestrate() {
		if (running) return;
		resetStages();
		running = true;
		abortController = new AbortController();

		const baseBody = {
			stages: selectedStageIds,
			summarize: enabledStages.summarize,
			deepResearch: enabledStages.deep_research,
			exportWiki: enabledStages.wiki_export,
			scope,
			indexFileLimit: typeof fileLimit === 'number' && fileLimit > 0 ? fileLimit : undefined,
			resume: resumeFromCache
		};

		try {
			if (multiPass && passCount > 1) {
				// Split file budget across passes, each with its own runId suffix so
				// cache keys stay distinct and Redis cache hits are visible per pass.
				const limit =
					typeof fileLimit === 'number' && fileLimit > 0
						? Math.max(1, Math.floor(fileLimit / passCount))
						: undefined;
				const passes = Array.from({ length: passCount }, (_, i) => ({
					...baseBody,
					indexFileLimit: limit,
					runId: `admin-pass-${Date.now()}-${i}`
				}));
				// Concurrent fan-out — SSE streams merged, per-stage bars advance as
				// any pass completes each stage. Promise.all waits for all to finish.
				await Promise.all(passes.map((body) => streamOrchestrate(body, abortController!.signal)));
			} else {
				await streamOrchestrate(baseBody, abortController.signal);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const running_idx = stages.findIndex((s) => s.status === 'running');
			if (running_idx !== -1) {
				stages[running_idx] = { ...stages[running_idx], status: 'error', message: msg };
			}
		} finally {
			running = false;
			abortController = null;
			refreshCacheStats();
		}
	}

	function cancel() {
		abortController?.abort();
	}

	function barColor(status: StageState['status']): string {
		switch (status) {
			case 'done':
				return 'bg-green-500';
			case 'cached':
				return 'bg-cyan-500';
			case 'running':
				return 'bg-orange-500';
			case 'error':
				return 'bg-red-500';
			default:
				return 'bg-slate-600';
		}
	}

	function statusBadge(status: StageState['status']): string {
		switch (status) {
			case 'done':
				return 'text-green-400';
			case 'cached':
				return 'text-cyan-400';
			case 'running':
				return 'text-orange-400';
			case 'error':
				return 'text-red-400';
			default:
				return 'text-slate-500';
		}
	}
</script>

<section class="mb-8 rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur">
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold text-slate-100">Pipeline Progress</h2>
			<p class="text-xs text-slate-400">
				{#if runId}
					runId: <code class="text-orange-400">{runId}</code>
				{:else}
					POST /api/codebase-index/orchestrate (SSE)
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				onclick={runOrchestrate}
				disabled={running || selectedStageIds.length === 0}
				class="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{running ? 'Running…' : `Run (${selectedStageIds.length} stages)`}
			</button>
			{#if running}
				<button
					onclick={cancel}
					class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
				>
					Cancel
				</button>
			{/if}
			<button
				onclick={refreshCacheStats}
				disabled={running}
				class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50"
				title="Refresh Redis cache stats"
			>
				🔄 Cache
			</button>
		</div>
	</div>

	<!-- Options panel -->
	<details class="mb-4 rounded-lg border border-slate-700 bg-slate-900/30 p-3" open>
		<summary class="cursor-pointer text-sm font-medium text-slate-300">
			Options — stages · scope · multi-pass · cache
		</summary>

		<div class="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
			<!-- Scope -->
			<div>
				<div class="mb-1 text-xs text-slate-400">Scope</div>
				<select
					bind:value={scope}
					disabled={running}
					class="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50"
				>
					<option value="lib">lib/ (recommended)</option>
					<option value="routes">routes/</option>
					<option value="all">all (lib + routes)</option>
					<option value="workspace">workspace (full repo)</option>
				</select>
			</div>

			<!-- File limit -->
			<div>
				<div class="mb-1 text-xs text-slate-400">File limit (blank = unlimited)</div>
				<input
					type="number"
					min="1"
					max="10000"
					bind:value={fileLimit}
					disabled={running}
					placeholder="100"
					class="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50"
				/>
			</div>

			<!-- Multi-pass -->
			<div>
				<div class="mb-1 flex items-center gap-2 text-xs text-slate-400">
					<label class="flex cursor-pointer items-center gap-1">
						<input
							type="checkbox"
							bind:checked={multiPass}
							disabled={running}
							class="accent-orange-500"
						/>
						Multi-pass (parallel)
					</label>
				</div>
				<input
					type="number"
					min="2"
					max="10"
					bind:value={passCount}
					disabled={running || !multiPass}
					class="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50"
					title="File limit split across N concurrent passes"
				/>
			</div>
		</div>

		<!-- Stage checkboxes -->
		<div class="mt-4">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-xs text-slate-400">Enabled stages ({selectedStageIds.length}/{STAGES.length})</span>
				<div class="flex gap-2 text-xs">
					<button
						type="button"
						disabled={running}
						onclick={() => { for (const s of STAGES) enabledStages[s.id] = true; }}
						class="text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
					>
						all
					</button>
					<span class="text-slate-600">·</span>
					<button
						type="button"
						disabled={running}
						onclick={() => { for (const s of STAGES) enabledStages[s.id] = false; }}
						class="text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
					>
						none
					</button>
					<span class="text-slate-600">·</span>
					<button
						type="button"
						disabled={running}
						onclick={() => {
							const fast = ['ast_embed', 'cluster_assign', 'summarize'];
							for (const s of STAGES) enabledStages[s.id] = fast.includes(s.id);
						}}
						class="text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
					>
						fast (1,2,6)
					</button>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-1 lg:grid-cols-5">
				{#each STAGES as stage (stage.id)}
					<label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-slate-800/50">
						<input
							type="checkbox"
							bind:checked={enabledStages[stage.id]}
							disabled={running}
							class="accent-orange-500"
						/>
						<span class="truncate text-slate-300">{stage.label}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Resume + Cache stats -->
		<div class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
			<label class="flex cursor-pointer items-center gap-2 text-slate-400">
				<input type="checkbox" bind:checked={resumeFromCache} disabled={running} class="accent-cyan-500" />
				Resume from cached stages (skip if already complete)
			</label>
			{#if cacheStats}
				<div class="flex gap-3 text-slate-500">
					<span>turbo:<span class="text-cyan-400">{cacheStats.turbo}</span></span>
					<span>summary:<span class="text-cyan-400">{cacheStats.summary}</span></span>
					<span>research:<span class="text-cyan-400">{cacheStats.research}</span></span>
					{#if cacheStats.totalMB > 0}
						<span>redis:<span class="text-cyan-400">{cacheStats.totalMB.toFixed(1)}MB</span></span>
					{/if}
				</div>
			{:else}
				<span class="text-slate-600">cache stats: click 🔄 Cache</span>
			{/if}
		</div>
	</details>

	<!-- Overall progress -->
	<div class="mb-6">
		<div class="mb-1 flex items-center justify-between text-xs text-slate-400">
			<span>Overall: {completedCount}/{STAGES.length} stages</span>
			<span>
				{overallProgress}%
				{#if totalMs > 0}
					· {(totalMs / 1000).toFixed(1)}s total
				{/if}
			</span>
		</div>
		<div class="h-2 overflow-hidden rounded-full bg-slate-700">
			<div
				class="h-full bg-gradient-to-r from-orange-500 to-purple-500 transition-all duration-300"
				style="width: {overallProgress}%"
			></div>
		</div>
	</div>

	<!-- Per-stage bars -->
	<div class="grid gap-3">
		{#each stages as stage (stage.id)}
			<div class="flex items-center gap-3">
				<div class="w-48 shrink-0 text-sm text-slate-300">{stage.label}</div>
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
					<div
						class="h-full transition-all duration-200 {barColor(stage.status)}"
						style="width: {stage.progress}%"
					></div>
				</div>
				<div class="w-32 shrink-0 text-right text-xs {statusBadge(stage.status)}">
					{stage.status}
					{#if stage.durationMs}
						<span class="text-slate-500"> ({(stage.durationMs / 1000).toFixed(1)}s)</span>
					{/if}
				</div>
				<div class="w-48 shrink-0 truncate text-xs text-slate-500">{stage.message}</div>
			</div>
		{/each}
	</div>
</section>
