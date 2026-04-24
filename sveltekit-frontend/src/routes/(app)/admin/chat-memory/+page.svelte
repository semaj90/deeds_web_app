<script lang="ts">
	// ── Types ─────────────────────────────────────────────────────────────────

	type RecalledHit = {
		id: string | number;
		sessionId: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: number;
		score: number;
	};

	type SearchResponse = {
		query: string;
		hits: RecalledHit[];
		timings: { embedMs: number; recallMs: number; totalMs: number };
		params: { scoreThreshold: number; limit: number; excludeSessionId: string | null };
		error?: string;
	};

	type RecentSession = {
		chatId: string;
		title: string | null;
		lastMessageAt: string | null;
		messageCount: number;
	};

	type CollectionStats = {
		pointsCount: number;
		indexedVectorsCount: number;
		status: string;
		vectorDim: number | null;
		vectorName: string | null;
		sampleRecent: Array<{
			sessionId: string;
			role: string;
			content: string;
			timestamp: number;
		}>;
		recentSessions?: RecentSession[];
		error?: string;
	};

	type Settings = {
		enabled: boolean;
		scoreThreshold: number;
	};

	type BackfillEvent =
		| { event: 'start'; data: { candidates: number; dryRun: boolean; limit: number; since: string | null } }
		| { event: 'progress'; data: { processed: number; skipped: number; failed: number; total: number } }
		| { event: 'complete'; data: { processed: number; skipped: number; failed: number; total?: number; dryRun?: boolean } }
		| { event: 'error'; data: { message: string } };

	// ── State ─────────────────────────────────────────────────────────────────

	let query = $state('');
	let scoreThreshold = $state(0.5);
	let limit = $state(10);
	let excludeSession = $state('');
	let loading = $state(false);
	let searchResult = $state<SearchResponse | null>(null);
	let searchError = $state<string | null>(null);

	let stats = $state<CollectionStats | null>(null);
	let statsLoading = $state(false);

	// Runtime settings (Redis-backed)
	let settings = $state<Settings | null>(null);
	let settingsSaving = $state(false);
	let settingsError = $state<string | null>(null);

	// Backfill state
	let backfillRunning = $state(false);
	let backfillDryRun = $state(true);
	let backfillLimit = $state(500);
	let backfillProgress = $state<{
		candidates: number;
		processed: number;
		skipped: number;
		failed: number;
		total: number;
		dryRun: boolean;
		status: 'idle' | 'running' | 'complete' | 'error';
		error?: string;
	}>({
		candidates: 0,
		processed: 0,
		skipped: 0,
		failed: 0,
		total: 0,
		dryRun: true,
		status: 'idle',
	});

	// ── Actions ───────────────────────────────────────────────────────────────

	async function runSearch() {
		if (!query.trim()) {
			searchError = 'Enter a query to search for.';
			return;
		}
		loading = true;
		searchError = null;
		try {
			const params = new URLSearchParams({
				q: query,
				scoreThreshold: String(scoreThreshold),
				limit: String(limit),
			});
			if (excludeSession.trim()) params.set('excludeSessionId', excludeSession.trim());
			const res = await fetch(`/api/chat/memory/search?${params}`);
			const data = (await res.json()) as SearchResponse;
			if (!res.ok || data.error) {
				searchError = data.error ?? `HTTP ${res.status}`;
				searchResult = null;
			} else {
				searchResult = data;
			}
		} catch (e) {
			searchError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function refreshStats() {
		statsLoading = true;
		try {
			const res = await fetch('/api/chat/memory/search?stats=1');
			const data = (await res.json()) as CollectionStats;
			stats = data;
		} catch (e) {
			stats = { error: (e as Error).message } as CollectionStats;
		} finally {
			statsLoading = false;
		}
	}

	async function loadSettings() {
		settingsError = null;
		try {
			const res = await fetch('/api/chat/memory/settings');
			if (!res.ok) {
				settingsError = `HTTP ${res.status}`;
				return;
			}
			settings = (await res.json()) as Settings;
		} catch (e) {
			settingsError = (e as Error).message;
		}
	}

	async function saveSettings(patch: Partial<Settings>) {
		if (settingsSaving) return;
		settingsSaving = true;
		settingsError = null;
		try {
			const res = await fetch('/api/chat/memory/settings', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				settingsError = data.error ?? `HTTP ${res.status}`;
				return;
			}
			settings = (await res.json()) as Settings;
		} catch (e) {
			settingsError = (e as Error).message;
		} finally {
			settingsSaving = false;
		}
	}

	function toggleEnabled() {
		if (!settings || settingsSaving) return;
		void saveSettings({ enabled: !settings.enabled });
	}

	async function commitThreshold(v: number) {
		if (!settings) return;
		void saveSettings({ scoreThreshold: v });
	}

	async function runBackfill() {
		if (backfillRunning) return;
		backfillRunning = true;
		backfillProgress = {
			candidates: 0,
			processed: 0,
			skipped: 0,
			failed: 0,
			total: 0,
			dryRun: backfillDryRun,
			status: 'running',
		};

		try {
			const params = new URLSearchParams({
				limit: String(backfillLimit),
				...(backfillDryRun ? { dryRun: '1' } : {}),
			});
			const res = await fetch(`/api/chat/memory/backfill?${params}`, { method: 'POST' });
			if (!res.ok || !res.body) {
				backfillProgress = { ...backfillProgress, status: 'error', error: `HTTP ${res.status}` };
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const blocks = buffer.split('\n\n');
				buffer = blocks.pop() ?? '';
				for (const block of blocks) {
					const parsed = parseSse(block);
					if (!parsed) continue;
					handleBackfillEvent(parsed);
				}
			}
		} catch (e) {
			backfillProgress = {
				...backfillProgress,
				status: 'error',
				error: (e as Error).message,
			};
		} finally {
			backfillRunning = false;
			// Refresh stats once backfill finishes (only if not error)
			if (backfillProgress.status !== 'error') {
				void refreshStats();
			}
		}
	}

	function parseSse(block: string): BackfillEvent | null {
		const lines = block.split('\n');
		let event = '';
		let data = '';
		for (const line of lines) {
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) data = line.slice(5).trim();
		}
		if (!event || !data) return null;
		try {
			return { event, data: JSON.parse(data) } as BackfillEvent;
		} catch {
			return null;
		}
	}

	function handleBackfillEvent(evt: BackfillEvent) {
		if (evt.event === 'start') {
			backfillProgress = {
				...backfillProgress,
				candidates: evt.data.candidates,
				total: evt.data.candidates,
				dryRun: evt.data.dryRun,
			};
		} else if (evt.event === 'progress') {
			backfillProgress = {
				...backfillProgress,
				processed: evt.data.processed,
				skipped: evt.data.skipped,
				failed: evt.data.failed,
				total: evt.data.total,
			};
		} else if (evt.event === 'complete') {
			backfillProgress = {
				...backfillProgress,
				processed: evt.data.processed,
				skipped: evt.data.skipped,
				failed: evt.data.failed,
				total: evt.data.total ?? backfillProgress.total,
				status: 'complete',
			};
		} else if (evt.event === 'error') {
			backfillProgress = {
				...backfillProgress,
				status: 'error',
				error: evt.data.message,
			};
		}
	}

	function formatTimestamp(ts: number): string {
		if (!ts) return '—';
		return new Date(ts).toLocaleString();
	}

	function scoreColor(score: number): string {
		if (score >= 0.8) return 'text-green-400';
		if (score >= 0.65) return 'text-emerald-400';
		if (score >= 0.5) return 'text-amber-400';
		return 'text-red-400';
	}

	function roleBadge(role: string): string {
		if (role === 'user') return 'bg-sky-900 text-sky-200';
		if (role === 'assistant') return 'bg-violet-900 text-violet-200';
		return 'bg-stone-800 text-stone-300';
	}

	// Auto-load stats + settings on mount
	$effect(() => {
		void refreshStats();
		void loadSettings();
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void runSearch();
		}
	}
</script>

<svelte:head>
	<title>Chat Memory Inspector — Admin</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-6">
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-stone-100">Chat Memory Inspector</h1>
		<p class="mt-1 text-sm text-stone-400">
			Semantic recall over past chat sessions via the Qdrant <code class="rounded bg-stone-800 px-1 py-0.5">chat_messages</code> collection.
			Used by ACE's context-assembler to surface prior conversations relevant to the current query.
		</p>
	</header>

	<!-- Runtime Settings -->
	<section class="mb-6 rounded-lg border border-stone-700 bg-stone-900 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-stone-300">Runtime Settings</h2>
			<span class="text-xs text-stone-500">Applies to all sessions within 5s of save.</span>
		</div>

		{#if !settings}
			<p class="text-sm text-stone-500">Loading…</p>
		{:else}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Enable toggle -->
				<div class="flex items-center justify-between rounded border border-stone-800 bg-stone-950 p-3">
					<div>
						<div class="text-sm font-medium text-stone-100">Chat Memory Recall</div>
						<div class="mt-0.5 text-xs text-stone-500">
							{settings.enabled
								? 'ACE injects relevant past-session messages into the system prompt.'
								: 'Disabled — ACE skips the Qdrant lookup entirely.'}
						</div>
					</div>
					<button
						onclick={toggleEnabled}
						disabled={settingsSaving}
						aria-label="Toggle chat memory recall"
						class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 {settings.enabled ? 'bg-emerald-600' : 'bg-stone-700'}"
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.enabled ? 'translate-x-6' : 'translate-x-1'}"
						></span>
					</button>
				</div>

				<!-- Score threshold -->
				<div class="rounded border border-stone-800 bg-stone-950 p-3">
					<div class="mb-2 flex items-center justify-between">
						<label for="threshold-slider" class="text-sm font-medium text-stone-100">
							Default Score Threshold
						</label>
						<span class="font-mono text-sm text-stone-300">
							{settings.scoreThreshold.toFixed(2)}
						</span>
					</div>
					<input
						id="threshold-slider"
						type="range"
						min="0.3"
						max="0.95"
						step="0.05"
						bind:value={settings.scoreThreshold}
						onchange={() => commitThreshold(settings!.scoreThreshold)}
						disabled={settingsSaving || !settings.enabled}
						class="w-full"
					/>
					<div class="mt-1 flex justify-between text-[10px] text-stone-600">
						<span>loose (0.3)</span>
						<span>balanced (0.65)</span>
						<span>strict (0.95)</span>
					</div>
				</div>
			</div>

			{#if settingsError}
				<div class="mt-3 rounded border border-red-900 bg-red-950 p-2 text-xs text-red-300">
					{settingsError}
				</div>
			{/if}
		{/if}
	</section>

	<!-- Collection Stats -->
	<section class="mb-6 rounded-lg border border-stone-700 bg-stone-900 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-stone-300">Collection</h2>
			<button
				onclick={refreshStats}
				disabled={statsLoading}
				class="rounded bg-stone-800 px-3 py-1 text-xs text-stone-200 hover:bg-stone-700 disabled:opacity-50"
			>
				{statsLoading ? 'Loading…' : 'Refresh'}
			</button>
		</div>

		{#if !stats}
			<p class="text-sm text-stone-500">Loading…</p>
		{:else if stats.error}
			<p class="text-sm text-red-400">Error: {stats.error}</p>
		{:else}
			<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
				<div>
					<div class="text-xs uppercase text-stone-500">Points</div>
					<div class="font-mono text-lg text-stone-100">{stats.pointsCount.toLocaleString()}</div>
				</div>
				<div>
					<div class="text-xs uppercase text-stone-500">Indexed</div>
					<div class="font-mono text-lg text-stone-100">{stats.indexedVectorsCount.toLocaleString()}</div>
				</div>
				<div>
					<div class="text-xs uppercase text-stone-500">Status</div>
					<div class="font-mono text-lg {stats.status === 'green' ? 'text-green-400' : 'text-amber-400'}">{stats.status}</div>
				</div>
				<div>
					<div class="text-xs uppercase text-stone-500">Vector</div>
					<div class="font-mono text-lg text-stone-100">
						{stats.vectorName ?? '—'} <span class="text-stone-500">({stats.vectorDim ?? '?'}d)</span>
					</div>
				</div>
			</div>

			{#if stats.sampleRecent?.length}
				<details class="mt-3">
					<summary class="cursor-pointer text-xs text-stone-400 hover:text-stone-200">Recent samples ({stats.sampleRecent.length})</summary>
					<ul class="mt-2 space-y-1 text-xs">
						{#each stats.sampleRecent as s}
							<li class="rounded border border-stone-800 bg-stone-950 p-2">
								<div class="flex items-center gap-2 text-stone-500">
									<span class="rounded px-1.5 py-0.5 text-[10px] {roleBadge(s.role)}">{s.role}</span>
									<span class="font-mono">{s.sessionId}</span>
									<span>{formatTimestamp(s.timestamp)}</span>
								</div>
								<div class="mt-1 text-stone-200">{s.content}</div>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
	</section>

	<!-- Backfill -->
	<section class="mb-6 rounded-lg border border-stone-700 bg-stone-900 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-stone-300">Backfill</h2>
			<span class="text-xs text-stone-500">
				Re-embed existing Postgres <code class="rounded bg-stone-800 px-1 py-0.5">chat_messages</code> → Qdrant
			</span>
		</div>

		<div class="grid grid-cols-3 gap-3">
			<div>
				<label for="backfill-limit" class="mb-1 block text-xs text-stone-400">Limit</label>
				<input
					id="backfill-limit"
					type="number"
					min="1"
					max="5000"
					bind:value={backfillLimit}
					disabled={backfillRunning}
					class="w-full rounded border border-stone-700 bg-stone-950 p-1.5 text-sm text-stone-100 focus:border-sky-500 focus:outline-none disabled:opacity-50"
				/>
			</div>
			<div class="flex items-end">
				<label class="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
					<input
						type="checkbox"
						bind:checked={backfillDryRun}
						disabled={backfillRunning}
						class="h-4 w-4 rounded border-stone-600 bg-stone-950 text-sky-600 focus:ring-sky-500 disabled:opacity-50"
					/>
					Dry run (preview only)
				</label>
			</div>
			<div class="flex items-end">
				<button
					onclick={runBackfill}
					disabled={backfillRunning}
					class="w-full rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{backfillRunning ? 'Running…' : backfillDryRun ? 'Preview Backfill' : 'Run Backfill'}
				</button>
			</div>
		</div>

		{#if backfillProgress.status !== 'idle'}
			<div class="mt-4 rounded border border-stone-800 bg-stone-950 p-3">
				<div class="mb-2 flex items-center justify-between text-xs">
					<span class="text-stone-400">
						{backfillProgress.status === 'running'
							? 'Running'
							: backfillProgress.status === 'complete'
								? backfillProgress.dryRun
									? 'Preview complete'
									: 'Backfill complete'
								: 'Error'}
						{backfillProgress.dryRun ? '(dry-run)' : ''}
					</span>
					<span class="font-mono text-stone-500">
						{backfillProgress.processed + backfillProgress.skipped + backfillProgress.failed}
						/ {backfillProgress.total || backfillProgress.candidates}
					</span>
				</div>

				<!-- Progress bar -->
				{#if backfillProgress.total > 0}
					<div class="mb-3 h-2 overflow-hidden rounded-full bg-stone-800">
						<div
							class="h-full bg-amber-500 transition-all"
							style:width="{Math.min(100, ((backfillProgress.processed + backfillProgress.skipped + backfillProgress.failed) / backfillProgress.total) * 100)}%"
						></div>
					</div>
				{/if}

				<div class="grid grid-cols-3 gap-3 text-xs">
					<div>
						<div class="text-stone-500">Processed</div>
						<div class="font-mono text-lg text-emerald-400">{backfillProgress.processed}</div>
					</div>
					<div>
						<div class="text-stone-500">Skipped</div>
						<div class="font-mono text-lg text-stone-400">{backfillProgress.skipped}</div>
					</div>
					<div>
						<div class="text-stone-500">Failed</div>
						<div class="font-mono text-lg {backfillProgress.failed > 0 ? 'text-red-400' : 'text-stone-400'}">
							{backfillProgress.failed}
						</div>
					</div>
				</div>

				{#if backfillProgress.error}
					<div class="mt-2 text-xs text-red-400">Error: {backfillProgress.error}</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Search Console -->
	<section class="mb-6 rounded-lg border border-stone-700 bg-stone-900 p-4">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-300">Search</h2>

		<div class="space-y-3">
			<div>
				<label for="query-input" class="mb-1 block text-xs text-stone-400">Query</label>
				<textarea
					id="query-input"
					bind:value={query}
					onkeydown={handleKeydown}
					placeholder="What do you want to recall? (Ctrl+Enter to search)"
					rows="2"
					class="w-full rounded border border-stone-700 bg-stone-950 p-2 text-sm text-stone-100 placeholder-stone-600 focus:border-sky-500 focus:outline-none"
				></textarea>
			</div>

			<div class="grid grid-cols-3 gap-3">
				<div>
					<label for="score-input" class="mb-1 block text-xs text-stone-400">
						Score threshold: <span class="font-mono text-stone-200">{scoreThreshold.toFixed(2)}</span>
					</label>
					<input
						id="score-input"
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={scoreThreshold}
						class="w-full"
					/>
				</div>

				<div>
					<label for="limit-input" class="mb-1 block text-xs text-stone-400">Limit</label>
					<input
						id="limit-input"
						type="number"
						min="1"
						max="20"
						bind:value={limit}
						class="w-full rounded border border-stone-700 bg-stone-950 p-1.5 text-sm text-stone-100 focus:border-sky-500 focus:outline-none"
					/>
				</div>

				<div>
					<label for="exclude-input" class="mb-1 block text-xs text-stone-400">Exclude session</label>
					{#if stats?.recentSessions?.length}
						<select
							id="exclude-input"
							bind:value={excludeSession}
							class="w-full rounded border border-stone-700 bg-stone-950 p-1.5 text-sm text-stone-100 focus:border-sky-500 focus:outline-none"
						>
							<option value="">(none — search all sessions)</option>
							{#each stats.recentSessions as session}
								<option value={session.chatId}>
									{session.title ?? session.chatId.slice(0, 24)} · {session.messageCount} msgs
								</option>
							{/each}
						</select>
					{:else}
						<input
							id="exclude-input"
							type="text"
							bind:value={excludeSession}
							placeholder="optional session id"
							class="w-full rounded border border-stone-700 bg-stone-950 p-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-sky-500 focus:outline-none"
						/>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-3">
				<button
					onclick={runSearch}
					disabled={loading || !query.trim()}
					class="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{loading ? 'Searching…' : 'Search'}
				</button>
				{#if searchResult}
					<div class="text-xs text-stone-500">
						{searchResult.hits.length} hit{searchResult.hits.length === 1 ? '' : 's'}
						· embed {searchResult.timings.embedMs}ms
						· recall {searchResult.timings.recallMs}ms
					</div>
				{/if}
			</div>

			{#if searchError}
				<div class="rounded border border-red-900 bg-red-950 p-2 text-sm text-red-300">
					{searchError}
				</div>
			{/if}
		</div>
	</section>

	<!-- Results -->
	{#if searchResult && !searchResult.error}
		<section class="rounded-lg border border-stone-700 bg-stone-900 p-4">
			<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-300">
				Results for <span class="font-mono text-stone-100">"{searchResult.query}"</span>
			</h2>

			{#if searchResult.hits.length === 0}
				<p class="text-sm text-stone-500">
					No hits above threshold {searchResult.params.scoreThreshold.toFixed(2)}. Try lowering it
					or rephrasing the query.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each searchResult.hits as hit}
						<li class="rounded border border-stone-800 bg-stone-950 p-3">
							<div class="mb-1 flex items-center gap-3 text-xs">
								<span class="font-mono text-base font-bold {scoreColor(hit.score)}">
									{hit.score.toFixed(3)}
								</span>
								<span class="rounded px-1.5 py-0.5 {roleBadge(hit.role)}">{hit.role}</span>
								<span class="font-mono text-stone-500">{hit.sessionId}</span>
								<span class="text-stone-500">{formatTimestamp(hit.timestamp)}</span>
							</div>
							<div class="whitespace-pre-wrap text-sm text-stone-100">{hit.content}</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
