<script lang="ts">
	type TimelineEvent = {
		id: string;
		eventType: string;
		pipeline: string;
		sessionId: string;
		signal: string | null;
		grpoReward: number | null;
		pipelineWeightAfter: number | null;
		triggeredRebuild: boolean;
		hyperedgeHash: string | null;
		payload: Record<string, unknown>;
		createdAt: string;
	};

	type Payload = {
		id?: string;
		summary?: string;
		tags?: string[];
		files?: string[];
		confidence?: number;
		patchResult?: string;
		needsDeepResearch?: boolean;
		source_file?: string;
		ingested_at?: string;
	};

	const EVENT_TYPES = [
		{ value: '', label: 'All event types' },
		{ value: 'agent_run_ingested', label: 'Agent runs' },
		{ value: 'error_ingested',     label: 'Errors' },
		{ value: 'research',           label: 'Research' },
		{ value: 'summary',            label: 'Summaries' },
		{ value: 'feedback',           label: 'Feedback' },
		{ value: 'rl_adapt',           label: 'RL adapt' },
		{ value: 'tool_call',          label: 'Tool calls' },
		{ value: 'citation',           label: 'Citations' },
	];

	const PIPELINES = [
		{ value: '', label: 'All pipelines' },
		{ value: 'kag', label: 'kag' },
		{ value: 'ace', label: 'ace' },
		{ value: 'rag', label: 'rag' },
		{ value: 'dag', label: 'dag' },
		{ value: 'codebase', label: 'codebase' },
	];

	let events     = $state<TimelineEvent[]>([]);
	let loading    = $state(false);
	let error      = $state<string | null>(null);
	let nextCursor = $state<string | null>(null);

	let eventType    = $state('agent_run_ingested');
	let pipeline     = $state('');
	let sessionId    = $state('');
	let textFilter   = $state('');
	let expanded     = $state<Set<string>>(new Set());

	async function load_page(cursor?: string) {
		loading = true;
		error   = null;
		try {
			const params = new URLSearchParams({ limit: '50' });
			if (cursor)    params.set('cursor',    cursor);
			if (eventType) params.set('eventType', eventType);
			if (pipeline)  params.set('pipeline',  pipeline);
			if (sessionId) params.set('sessionId', sessionId);
			const res = await fetch(`/api/analytics/context-timeline?${params}`, {
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json() as { events: TimelineEvent[]; nextCursor: string | null };
			events       = cursor ? [...events, ...(d.events ?? [])] : (d.events ?? []);
			nextCursor   = d.nextCursor ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void eventType; void pipeline; void sessionId;
		void load_page();
	});

	let filtered = $derived(
		textFilter.trim()
			? events.filter(e => {
					const needle = textFilter.toLowerCase();
					const p = e.payload as Payload;
					return (
						(p.summary?.toLowerCase().includes(needle)) ||
						(p.id?.toLowerCase().includes(needle)) ||
						(p.tags?.some(t => t.toLowerCase().includes(needle))) ||
						(p.files?.some(f => f.toLowerCase().includes(needle))) ||
						e.sessionId.toLowerCase().includes(needle)
					);
			  })
			: events
	);

	function toggle(id: string) {
		const next = new Set(expanded);
		next.has(id) ? next.delete(id) : next.add(id);
		expanded = next;
	}

	function badgeClass(eventType: string): string {
		switch (eventType) {
			case 'agent_run_ingested': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
			case 'error_ingested':     return 'bg-red-500/20 text-red-300 border-red-500/40';
			case 'research':           return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
			case 'summary':            return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
			case 'feedback':           return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
			case 'rl_adapt':           return 'bg-pink-500/20 text-pink-300 border-pink-500/40';
			case 'tool_call':          return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
			case 'citation':           return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
			default:                   return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
		}
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleString(undefined, {
			month:  '2-digit', day:    '2-digit',
			hour:   '2-digit', minute: '2-digit', second: '2-digit',
		});
	}

	function confidenceColor(c?: number): string {
		if (c === undefined) return 'text-gray-500';
		if (c >= 0.8) return 'text-emerald-400';
		if (c >= 0.5) return 'text-amber-400';
		return 'text-red-400';
	}
</script>

<svelte:head>
	<title>Memory Inspector — Admin</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100 p-6">
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-white">Memory Inspector</h1>
			<p class="mt-1 text-sm text-gray-400">
				Read-side view of <code class="text-gray-300">context_timeline</code> — agent runs, errors, research, RL signals.
				Source: JSONL ingested via <code class="text-gray-300">kag.ingest_memory_directory</code>.
			</p>
		</div>
		<button
			onclick={() => load_page()}
			disabled={loading}
			class="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 border border-gray-600 flex-shrink-0"
		>
			{loading ? 'Loading…' : '↺ Refresh'}
		</button>
	</div>

	{#if error}
		<div class="mb-4 rounded p-3 bg-red-900/40 border border-red-600/50 text-red-300 text-sm">
			❌ {error}
		</div>
	{/if}

	<div class="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
		<select
			bind:value={eventType}
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-3 py-2 text-sm"
		>
			{#each EVENT_TYPES as t (t.value)}
				<option value={t.value}>{t.label}</option>
			{/each}
		</select>
		<select
			bind:value={pipeline}
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-3 py-2 text-sm"
		>
			{#each PIPELINES as p (p.value)}
				<option value={p.value}>{p.label}</option>
			{/each}
		</select>
		<input
			bind:value={sessionId}
			placeholder="Session ID (exact match)"
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-3 py-2 text-sm"
		/>
		<input
			bind:value={textFilter}
			placeholder="Search summary / id / tags / files"
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-3 py-2 text-sm"
		/>
	</div>

	<div class="mb-3 flex items-center justify-between text-xs text-gray-500">
		<span>{filtered.length} of {events.length} events</span>
		{#if textFilter && filtered.length !== events.length}
			<span class="text-amber-400">Local filter active — paginate to widen DB results</span>
		{/if}
	</div>

	{#if filtered.length === 0 && !loading}
		<div class="rounded-lg border border-gray-700 bg-gray-900 p-12 text-center text-gray-500">
			No events match. Try widening the filters, or run
			<code class="text-gray-300">kag.ingest_memory_directory</code> to flush
			<code class="text-gray-300">memory/ingest/pending/</code>.
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		{#each filtered as event (event.id)}
			{@const isOpen = expanded.has(event.id)}
			{@const p = event.payload as Payload}
			<div class="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
				<button
					onclick={() => toggle(event.id)}
					class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-800/60"
				>
					<span class="text-gray-500 text-xs font-mono w-3">{isOpen ? '▼' : '▶'}</span>
					<span class="text-xs px-2 py-0.5 rounded-full border {badgeClass(event.eventType)} flex-shrink-0">
						{event.eventType}
					</span>
					<span class="text-xs text-gray-500 font-mono flex-shrink-0">{event.pipeline}</span>
					<span class="flex-1 truncate text-sm text-gray-200">
						{p.summary ?? p.id ?? '(no summary)'}
					</span>
					{#if p.confidence !== undefined}
						<span class="text-xs font-mono {confidenceColor(p.confidence)} flex-shrink-0">
							{p.confidence.toFixed(2)}
						</span>
					{/if}
					<span class="text-xs text-gray-500 font-mono flex-shrink-0">{fmtTime(event.createdAt)}</span>
				</button>

				{#if isOpen}
					<div class="border-t border-gray-700 px-4 py-3 space-y-3 text-sm">
						{#if p.id}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">ID</span>
								<code class="text-gray-300 text-xs">{p.id}</code>
							</div>
						{/if}
						{#if p.summary}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Summary</span>
								<span class="text-gray-200">{p.summary}</span>
							</div>
						{/if}
						{#if p.tags?.length}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Tags</span>
								<div class="flex flex-wrap gap-1">
									{#each p.tags as tag (tag)}
										<span class="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-600">{tag}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if p.files?.length}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Files</span>
								<div class="flex flex-col gap-0.5">
									{#each p.files as file (file)}
										<code class="text-gray-300 text-xs">{file}</code>
									{/each}
								</div>
							</div>
						{/if}
						{#if p.patchResult}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Patch</span>
								<span class="text-xs px-2 py-0.5 rounded {p.patchResult === 'passed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">
									{p.patchResult}
								</span>
							</div>
						{/if}
						{#if p.needsDeepResearch}
							<div class="flex gap-2 items-center">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Status</span>
								<span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠ deep research required</span>
							</div>
						{/if}
						{#if p.source_file}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Source</span>
								<code class="text-gray-500 text-xs">{p.source_file}</code>
							</div>
						{/if}
						{#if event.grpoReward !== null}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">RL reward</span>
								<span class="text-xs font-mono {event.grpoReward >= 0 ? 'text-emerald-400' : 'text-red-400'}">
									{event.grpoReward.toFixed(4)}
								</span>
							</div>
						{/if}
						{#if event.hyperedgeHash}
							<div class="flex gap-2">
								<span class="text-gray-500 text-xs uppercase tracking-wider w-20 flex-shrink-0">Hyperedge</span>
								<code class="text-gray-300 text-xs">{event.hyperedgeHash}</code>
							</div>
						{/if}
						<details class="text-xs">
							<summary class="cursor-pointer text-gray-500 hover:text-gray-300">Raw payload</summary>
							<pre class="mt-2 p-3 rounded bg-gray-950 border border-gray-800 text-gray-400 overflow-x-auto">{JSON.stringify(event.payload, null, 2)}</pre>
						</details>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if nextCursor}
		<div class="mt-6 flex justify-center">
			<button
				onclick={() => load_page(nextCursor!)}
				disabled={loading}
				class="px-4 py-2 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 border border-gray-600"
			>
				{loading ? 'Loading…' : 'Load more'}
			</button>
		</div>
	{/if}
</div>