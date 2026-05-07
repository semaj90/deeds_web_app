<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	// ── Types ─────────────────────────────────────────────────────────────────

	type WorkerResult = {
		domain:        string;
		chunkCount:    number;
		summary:       string;
		keyInsights:   string[];
		relevantPaths: string[];
		source:        string;
		cached:        boolean;
		durationMs:    number;
	};

	type StreamState = 'idle' | 'planning' | 'working' | 'merging' | 'done' | 'error';

	// ── State ─────────────────────────────────────────────────────────────────

	let query        = $state('');
	let limitPerWorker = $state(12);
	let persist      = $state(true);
	let compact      = $state(true);

	let streamState  = $state<StreamState>('idle');
	let domains      = $state<string[]>([]);
	let workers      = $state<WorkerResult[]>([]);
	let mergeInfo    = $state<{ domainCount: number; totalChunks: number } | null>(null);
	let result       = $state<{
		supervisorSummary: string;
		keyFindings:       string[];
		actionItems:       string[];
		totalChunks:       number;
		totalDurationMs:   number;
		persistedId:       string | null;
	} | null>(null);
	let errorMsg     = $state<string | null>(null);
	let abortCtrl    = $state<AbortController | null>(null);
	let assistResult = $state<{ ok: boolean; totalMs: number; cacheHit: boolean } | null>(null);
	let assistLoading = $state(false);
	let elapsedMs     = $state(0);
	let timerRef      = $state<ReturnType<typeof setInterval> | null>(null);

	// ── Derived ─────────────────────────────────────────────────────────────────

	let elapsedDisplay = $derived(
		elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`
	);

	let workerProgress = $derived(
		domains.length > 0 ? `${workers.length}/${domains.length}` : '0/0'
	);

	let isRunning = $derived(
		streamState === 'planning' || streamState === 'working' || streamState === 'merging'
	);

	// ── Actions ───────────────────────────────────────────────────────────────

	function reset() {
		domains    = [];
		workers    = [];
		mergeInfo  = null;
		result     = null;
		errorMsg   = null;
		stopTimer();
	}

	function startTimer() {
		stopTimer();
		const t0 = performance.now();
		elapsedMs = 0;
		timerRef = setInterval(() => { elapsedMs = Math.round(performance.now() - t0); }, 100);
	}

	function stopTimer() {
		if (timerRef) { clearInterval(timerRef); timerRef = null; }
	}

	async function startStream() {
		if (!query.trim() || isRunning) return;

		reset();
		streamState = 'planning';
		startTimer();

		const ctrl = new AbortController();
		abortCtrl  = ctrl;

		try {
			const res = await fetch('/api/research/concurrent-deep/stream', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({
					query: query.trim(),
					limitPerWorker,
					persist,
					compact,
				}),
				signal: ctrl.signal,
			});

			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => 'Stream failed');
				errorMsg    = text;
				streamState = 'error';
				return;
			}

			const reader  = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer    = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Parse SSE frames from buffer
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';  // keep incomplete line

				let currentEvent = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith('data: ') && currentEvent) {
						try {
							const data = JSON.parse(line.slice(6));
							handleEvent(currentEvent, data);
						} catch { /* skip malformed JSON */ }
						currentEvent = '';
					}
				}
			}

			// Stream ended — ensure terminal state
			// handleEvent sets 'done'/'error' via complete/error SSE events;
			// if stream closed without either, force done.
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if ((streamState as StreamState) !== 'done' && (streamState as StreamState) !== 'error') {
				streamState = 'done';
			}
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				streamState = 'idle';
			} else {
				errorMsg    = (err as Error).message ?? 'Stream failed';
				streamState = 'error';
			}
		} finally {
			abortCtrl = null;
			stopTimer();
		}
	}

	function handleEvent(event: string, data: Record<string, unknown>) {
		switch (event) {
			case 'plan':
				domains     = (data.domains ?? []) as string[];
				streamState = 'working';
				break;

			case 'worker':
				workers = [...workers, data as unknown as WorkerResult];
				break;

			case 'merging':
				mergeInfo   = data as { domainCount: number; totalChunks: number };
				streamState = 'merging';
				break;

			case 'complete':
				result = {
					supervisorSummary: (data.supervisorSummary ?? '') as string,
					keyFindings:       (data.keyFindings ?? []) as string[],
					actionItems:       (data.actionItems ?? []) as string[],
					totalChunks:       (data.totalChunks ?? 0) as number,
					totalDurationMs:   (data.totalDurationMs ?? 0) as number,
					persistedId:       (data.persistedId ?? null) as string | null,
				};
				streamState = 'done';
				break;

			case 'error':
				errorMsg    = (data.message ?? 'Unknown error') as string;
				streamState = 'error';
				break;
		}
	}

	function cancelStream() {
		abortCtrl?.abort();
		abortCtrl   = null;
		streamState = 'idle';
		stopTimer();
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	function sourceColor(source: string): string {
		switch (source) {
			case 'qdrant':   return '#4ade80';
			case 'cache':    return '#60a5fa';
			case 'degraded': return '#f87171';
			default:         return '#9ca3af';
		}
	}

	function domainIcon(domain: string): string {
		const map: Record<string, string> = {
			'api-routes':     'route',
			'state-machines': 'workflow',
			'database':       'database',
			'error-patterns': 'alert-triangle',
			'ml-inference':   'brain',
			'auth':           'shield',
			'cache':          'hard-drive',
			'rag-pipeline':   'git-branch',
			'ui-components':  'layout',
			'graph-db':       'network',
			'general':        'search',
		};
		return map[domain] ?? 'search';
	}

	/** Forward completed research to claude-assist (compact defaults). */
	async function sendToClaudeAssist() {
		if (!result || !query.trim()) return;
		assistLoading = true;
		assistResult  = null;
		try {
			const res = await fetch('/api/codebase-index/claude-assist', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query.trim(),
					compact: true,
					compactContext: true,
					preferCachedResearch: true,
					limitPerWorker,
				}),
				signal: AbortSignal.timeout(120_000)
			});
			if (res.ok) {
				const data = await res.json();
				assistResult = {
					ok: true,
					totalMs: data.timing?.totalMs ?? 0,
					cacheHit: data.cache?.hit ?? false,
				};
			} else {
				assistResult = { ok: false, totalMs: 0, cacheHit: false };
			}
		} catch {
			assistResult = { ok: false, totalMs: 0, cacheHit: false };
		} finally {
			assistLoading = false;
		}
	}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════
     QUERY INPUT
═══════════════════════════════════════════════════════════════════════ -->
<div class="lr-panel">
	<div class="lr-input-row">
		<input
			type="text"
			class="lr-query"
			placeholder="Research query — e.g. 'How does the RAG pipeline handle cache misses?'"
			bind:value={query}
			onkeydown={(e) => { if (e.key === 'Enter') startStream(); }}
			disabled={isRunning}
		/>
		<div class="lr-opts">
			<label class="lr-opt">
				<span class="lr-opt-label">Hits/worker</span>
				<input type="number" min={3} max={30} bind:value={limitPerWorker} class="lr-num" disabled={isRunning} />
			</label>
			<label class="lr-opt">
				<input type="checkbox" bind:checked={persist} disabled={isRunning} />
				<span class="lr-opt-label">Persist</span>
			</label>
			<label class="lr-opt">
				<input type="checkbox" bind:checked={compact} disabled={isRunning} />
				<span class="lr-opt-label">Compact</span>
			</label>
		</div>
		{#if isRunning}
			<button class="lr-btn lr-btn-cancel" onclick={cancelStream}>
				<Icon name="x" class="w-3.5 h-3.5" /> Cancel
			</button>
		{:else}
			<button class="lr-btn lr-btn-start" onclick={startStream} disabled={!query.trim()}>
				<Icon name="play" class="w-3.5 h-3.5" /> Stream
			</button>
		{/if}
	</div>

	<!-- ── Status bar ──────────────────────────────────────────────────── -->
	{#if streamState !== 'idle'}
		<div class="lr-status">
			<span class="lr-elapsed">{elapsedDisplay}</span>
			{#if streamState === 'planning'}
				<span class="lr-status-dot pulse" style="background:#a78bfa"></span>
				Planning domains…
			{:else if streamState === 'working'}
				<span class="lr-status-dot pulse" style="background:#4ade80"></span>
				Workers running — {workerProgress} complete
			{:else if streamState === 'merging'}
				<span class="lr-status-dot pulse" style="background:#f59e0b"></span>
				Supervisor merging {mergeInfo?.domainCount ?? 0} domains ({mergeInfo?.totalChunks ?? 0} chunks)…
			{:else if streamState === 'done'}
				<span class="lr-status-dot" style="background:#4ade80"></span>
				Complete — {result?.totalChunks ?? 0} chunks in {((result?.totalDurationMs ?? 0) / 1000).toFixed(1)}s
				{#if result?.persistedId}
					<span class="lr-persisted-id">
						<Icon name="database" class="w-3 h-3" />
						{result.persistedId.slice(0, 8)}…
					</span>
				{/if}
			{:else if streamState === 'error'}
				<span class="lr-status-dot" style="background:#f87171"></span>
				Error: {errorMsg}
			{/if}
		</div>
	{/if}

	<!-- ── Domain plan ─────────────────────────────────────────────────── -->
	{#if domains.length > 0}
		<div class="lr-domains">
			{#each domains as d}
				<span class="lr-domain-tag" class:done={workers.some(w => w.domain === d)}>
					<Icon name={domainIcon(d)} class="w-3 h-3" />
					{d}
				</span>
			{/each}
		</div>
	{/if}

	<!-- ── Worker cards ────────────────────────────────────────────────── -->
	{#if workers.length > 0}
		<div class="lr-workers">
			{#each workers as w}
				<div class="lr-worker-card">
					<div class="lr-worker-hdr">
						<Icon name={domainIcon(w.domain)} class="w-3.5 h-3.5" />
						<span class="lr-worker-domain">{w.domain}</span>
						<span class="lr-worker-meta">
							{w.chunkCount} chunks · {w.durationMs}ms ·
							<span style="color:{sourceColor(w.source)}">{w.source}</span>
							{#if w.cached}
								<span class="lr-cache-badge">cached</span>
							{/if}
						</span>
					</div>
					<p class="lr-worker-summary">{w.summary}</p>
					{#if w.keyInsights.length > 0}
						<ul class="lr-insights">
							{#each w.keyInsights.slice(0, 4) as insight}
								<li>{insight}</li>
							{/each}
						</ul>
					{/if}
					{#if w.relevantPaths.length > 0}
						<div class="lr-paths">
							{#each w.relevantPaths.slice(0, 5) as p}
								<code class="lr-path">{p}</code>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── Supervisor summary ──────────────────────────────────────────── -->
	{#if result}
		<div class="lr-result">
			<h3 class="lr-result-title">
				<Icon name="sparkles" class="w-4 h-4" style="color:#f59e0b" /> Supervisor Summary
			</h3>
			<p class="lr-result-text">{result.supervisorSummary}</p>

			{#if result.keyFindings.length > 0}
				<h4 class="lr-sub-title">Key Findings</h4>
				<ul class="lr-findings">
					{#each result.keyFindings as f}
						<li>{f}</li>
					{/each}
				</ul>
			{/if}

			{#if result.actionItems.length > 0}
				<h4 class="lr-sub-title">Action Items</h4>
				<ul class="lr-actions">
					{#each result.actionItems as a}
						<li>{a}</li>
					{/each}
				</ul>
			{/if}

			<!-- Send to Claude Assist -->
			<div class="lr-assist-row">
				<button
					class="lr-btn lr-btn-assist"
					onclick={sendToClaudeAssist}
					disabled={assistLoading}
				>
					<Icon name="send" class="w-3.5 h-3.5" />
					{assistLoading ? 'Sending…' : 'Send to Claude Assist'}
				</button>
				{#if assistResult}
					<span class="lr-assist-badge" class:ok={assistResult.ok} class:fail={!assistResult.ok}>
						{assistResult.ok
							? `✓ ${assistResult.totalMs}ms${assistResult.cacheHit ? ' (cached)' : ''}`
							: '✗ failed'}
					</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
/* ── Layout ──────────────────────────────────────────────────────────────── */
.lr-panel {
	display: flex; flex-direction: column; gap: 0.75rem;
}

/* ── Input row ───────────────────────────────────────────────────────────── */
.lr-input-row {
	display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
}
.lr-query {
	flex: 1; min-width: 240px; height: 2rem; padding: 0 0.75rem;
	font-size: 0.78rem; font-family: inherit;
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 5px;
	color: #d4c7a3; outline: none;
}
.lr-query:focus { border-color: #7c6ff7; }
.lr-query::placeholder { color: #6b7280; }
.lr-opts {
	display: flex; align-items: center; gap: 0.75rem;
}
.lr-opt {
	display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: #9ca3af;
	cursor: pointer;
}
.lr-opt-label { user-select: none; }
.lr-num {
	width: 3rem; height: 1.5rem; padding: 0 0.3rem; text-align: center;
	font-size: 0.7rem; font-family: inherit;
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	color: #d4c7a3; outline: none;
}
.lr-btn {
	display: inline-flex; align-items: center; gap: 0.3rem;
	height: 2rem; padding: 0 0.85rem;
	font-size: 0.75rem; font-weight: 600; font-family: inherit;
	border: 1px solid; border-radius: 5px; cursor: pointer;
	transition: background 0.15s, border-color 0.15s;
}
.lr-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.lr-btn-start {
	background: #4ade8018; border-color: #4ade8044; color: #4ade80;
}
.lr-btn-start:hover:not(:disabled) { background: #4ade8028; }
.lr-btn-cancel {
	background: #f8717118; border-color: #f8717144; color: #f87171;
}
.lr-btn-cancel:hover { background: #f8717128; }

/* ── Status bar ──────────────────────────────────────────────────────────── */
.lr-status {
	display: flex; align-items: center; gap: 0.4rem;
	font-size: 0.72rem; color: #9ca3af; padding: 0.35rem 0.5rem;
	background: #1a1914; border: 1px solid #2d2b24; border-radius: 5px;
}
.lr-elapsed {
	font-size: 0.68rem; font-weight: 600; color: #a78bfa;
	font-family: 'JetBrains Mono', monospace; margin-right: 0.4rem;
	min-width: 3.5rem; text-align: right;
}
.lr-status-dot {
	width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.lr-status-dot.pulse {
	animation: lr-pulse 1.2s ease-in-out infinite;
}
@keyframes lr-pulse {
	0%, 100% { opacity: 1; }
	50%      { opacity: 0.3; }
}
.lr-persisted-id {
	display: inline-flex; align-items: center; gap: 0.2rem; margin-left: auto;
	font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
	color: #60a5fa; background: #60a5fa0d; padding: 0.1rem 0.4rem;
	border-radius: 3px; border: 1px solid #60a5fa22;
}

/* ── Domain tags ─────────────────────────────────────────────────────────── */
.lr-domains {
	display: flex; gap: 0.35rem; flex-wrap: wrap;
}
.lr-domain-tag {
	display: inline-flex; align-items: center; gap: 0.25rem;
	font-size: 0.68rem; padding: 0.2rem 0.55rem;
	background: #2d2b24; color: #9ca3af; border-radius: 4px;
	border: 1px solid #3d3b34; transition: all 0.2s;
}
.lr-domain-tag.done {
	color: #4ade80; border-color: #4ade8044; background: #4ade800d;
}

/* ── Worker cards ────────────────────────────────────────────────────────── */
.lr-workers {
	display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.5rem;
}
.lr-worker-card {
	padding: 0.65rem 0.75rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 6px;
}
.lr-worker-hdr {
	display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.4rem;
}
.lr-worker-domain {
	font-size: 0.75rem; font-weight: 600; color: #d4c7a3;
}
.lr-worker-meta {
	margin-left: auto; font-size: 0.65rem; color: #6b7280;
}
.lr-cache-badge {
	display: inline-block; padding: 0 0.3rem; margin-left: 0.25rem;
	font-size: 0.6rem; border-radius: 3px;
	color: #60a5fa; background: #60a5fa12; border: 1px solid #60a5fa22;
}
.lr-worker-summary {
	font-size: 0.72rem; color: #d4c7a3; line-height: 1.5;
	margin: 0 0 0.35rem; white-space: pre-wrap; word-break: break-word;
}
.lr-insights {
	margin: 0; padding-left: 1rem; font-size: 0.68rem; color: #9ca3af; line-height: 1.6;
}
.lr-insights li::marker { color: #4ade8088; }
.lr-paths {
	display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.35rem;
}
.lr-path {
	font-size: 0.62rem; padding: 0.1rem 0.4rem;
	background: #2d2b24; border-radius: 3px; color: #a78bfa;
	font-family: 'JetBrains Mono', monospace; word-break: break-all;
}

/* ── Supervisor result ───────────────────────────────────────────────────── */
.lr-result {
	padding: 0.75rem; background: #13120f;
	border: 1px solid #f59e0b33; border-radius: 6px;
}
.lr-result-title {
	display: flex; align-items: center; gap: 0.35rem;
	font-size: 0.82rem; font-weight: 700; color: #d4c7a3; margin: 0 0 0.5rem;
}
.lr-result-text {
	font-size: 0.74rem; color: #d4c7a3; line-height: 1.65;
	margin: 0 0 0.5rem; white-space: pre-wrap; word-break: break-word;
}
.lr-sub-title {
	font-size: 0.72rem; font-weight: 600; color: #9ca3af; margin: 0.65rem 0 0.3rem;
}
.lr-findings, .lr-actions {
	margin: 0; padding-left: 1rem; font-size: 0.7rem; color: #d4c7a3; line-height: 1.6;
}
.lr-findings li::marker { color: #f59e0b88; }
.lr-actions li::marker { color: #60a5fa88; }

/* ── Claude Assist row ───────────────────────────────────────────────────── */
.lr-assist-row {
	display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;
}
.lr-btn-assist {
	background: #a78bfa18; border-color: #a78bfa44; color: #a78bfa;
}
.lr-btn-assist:hover:not(:disabled) { background: #a78bfa28; }
.lr-assist-badge {
	font-size: 0.68rem; padding: 0.15rem 0.5rem; border-radius: 4px;
}
.lr-assist-badge.ok {
	color: #4ade80; background: #4ade800d; border: 1px solid #4ade8022;
}
.lr-assist-badge.fail {
	color: #f87171; background: #f871710d; border: 1px solid #f8717122;
}
</style>
