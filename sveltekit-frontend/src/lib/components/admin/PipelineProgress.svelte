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

	const completedCount = $derived(
		stages.filter((s) => s.status === 'done' || s.status === 'cached').length
	);
	const overallProgress = $derived(Math.round((completedCount / STAGES.length) * 100));

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
			const pct = Number(payload.pct ?? 0);
			updateStage('ast_embed', {
				status: 'running',
				progress: Math.max(5, pct),
				message: `scanning (${payload.filesFound ?? 0} files)`
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

	async function runOrchestrate(opts: { summarize: boolean; deepResearch: boolean }) {
		if (running) return;
		resetStages();
		running = true;
		abortController = new AbortController();

		try {
			const res = await fetch('/api/codebase-index/orchestrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortController.signal,
				body: JSON.stringify({
					stages: STAGES.map((s) => s.id),
					summarize: opts.summarize,
					deepResearch: opts.deepResearch,
					exportWiki: true
				})
			});

			if (!res.ok || !res.body) {
				throw new Error(`HTTP ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				// Parse SSE frames (event: X\ndata: Y\n\n)
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
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// Mark current running stage as error
			const running_idx = stages.findIndex((s) => s.status === 'running');
			if (running_idx !== -1) {
				stages[running_idx] = {
					...stages[running_idx],
					status: 'error',
					message: msg
				};
			}
		} finally {
			running = false;
			abortController = null;
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
				onclick={() => runOrchestrate({ summarize: true, deepResearch: false })}
				disabled={running}
				class="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Run (no research)
			</button>
			<button
				onclick={() => runOrchestrate({ summarize: true, deepResearch: true })}
				disabled={running}
				class="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Run full (with research)
			</button>
			{#if running}
				<button
					onclick={cancel}
					class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
				>
					Cancel
				</button>
			{/if}
		</div>
	</div>

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
