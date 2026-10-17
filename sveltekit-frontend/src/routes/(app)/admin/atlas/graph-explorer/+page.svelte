<script lang="ts">
	import { Tabs } from 'bits-ui';

	type ViewKind = 'STRUCTURAL' | 'DOMAIN' | 'KNOWLEDGE' | 'TIMELINE' | 'HYPERGRAPH';
	type Span = { startByte: number; endByte: number; startLine?: number; endLine?: number };
	type GNode = {
		id: string;
		type: string;
		label: string;
		packetKey: string | null;
		sourceRef: string | null;
		hop: number;
		properties: Record<string, unknown>;
		sourceRevision?: string | null;
		span?: Span | null;
		qualification?: string;
		evidenceRefs?: string[];
		temporal?: { workspaceEventId: string | null; taskId: string | null; worktreeId: string | null; recordedAt: string | null } | null;
	};
	type GEdge = {
		id: string;
		source: string;
		target: string;
		type: string;
		confidence: number;
		qualification?: string;
		evidenceRefs?: string[];
		sourceRevision?: string | null;
		span?: Span | null;
	};
	type Packet = { nodes: GNode[]; edges: GEdge[]; truncated: boolean; maxNodes: number; workspaceRevision?: string | null };
	type Rejected = { eventId: string; sequence: string; reason: string };
	type GraphResponse = { ok: boolean; view: ViewKind | null; packet: Packet | null; rejected: Rejected[]; degraded: boolean; reason: string | null };

	const VIEWS: ViewKind[] = ['STRUCTURAL', 'DOMAIN', 'KNOWLEDGE', 'TIMELINE', 'HYPERGRAPH'];

	let view = $state<ViewKind>('DOMAIN');
	let query = $state('');
	let taskId = $state('');
	let limit = $state(100);
	let pending = $state(false);
	let response = $state<GraphResponse | null>(null);
	let fetchError = $state<string | null>(null);
	let selectedId = $state<string | null>(null);

	const packet = $derived(response?.packet ?? null);
	const nodesById = $derived(new Map((packet?.nodes ?? []).map((n) => [n.id, n])));
	const selected = $derived(selectedId ? (nodesById.get(selectedId) ?? null) : null);
	const grouped = $derived.by(() => {
		const map = new Map<string, GNode[]>();
		for (const n of packet?.nodes ?? []) {
			const list = map.get(n.type) ?? [];
			list.push(n);
			map.set(n.type, list);
		}
		return [...map.entries()];
	});
	// Bidirectional navigation: every edge is listed from both endpoints.
	const neighbors = $derived.by(() => {
		if (!selected || !packet) return [] as Array<{ edge: GEdge; other: GNode | undefined; direction: 'out' | 'in' }>;
		return packet.edges
			.filter((e) => e.source === selected.id || e.target === selected.id)
			.map((e) => {
				const out = e.source === selected.id;
				return { edge: e, other: nodesById.get(out ? e.target : e.source), direction: out ? ('out' as const) : ('in' as const) };
			});
	});
	const qualificationCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const e of packet?.edges ?? []) {
			const key = e.qualification ?? 'UNSPECIFIED';
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return Object.entries(counts);
	});

	async function load(activeView: ViewKind) {
		pending = true;
		fetchError = null;
		selectedId = null;
		try {
			const params = new URLSearchParams({ view: activeView, limit: String(limit) });
			if (query.trim()) params.set('q', query.trim());
			if (activeView === 'TIMELINE' && taskId.trim()) params.set('taskId', taskId.trim());
			const res = await fetch(`/api/admin/atlas/graph-views?${params}`);
			response = (await res.json()) as GraphResponse;
		} catch (err) {
			response = null;
			fetchError = err instanceof Error ? err.message : String(err);
		} finally {
			pending = false;
		}
	}

	// Re-load when the active tab changes; search and limit load on submit.
	$effect(() => {
		const activeView = view;
		load(activeView);
	});
</script>

<div class="app-bg p-6 flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Graph Explorer</h1>
		<p class="text-sm opacity-70">
			Read-only structural, domain, knowledge and timeline views over one identity space.
			Only edges with a source span are marked structurally proven; classifier and LLM links
			stay <code>PROPOSED</code>.
		</p>
	</div>

	<Tabs.Root bind:value={view}>
		<Tabs.List class="flex gap-2">
			{#each VIEWS as v (v)}
				<Tabs.Trigger value={v} class="btn-base">{v}</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	<form
		class="flex gap-2 flex-wrap"
		onsubmit={(e) => {
			e.preventDefault();
			load(view);
		}}
	>
		<input class="border rounded px-2 py-1 flex-1" placeholder="Search symbol, keyword, domain" bind:value={query} />
		{#if view === 'TIMELINE'}
			<input class="border rounded px-2 py-1" placeholder="Task ID" bind:value={taskId} />
		{/if}
		<select class="border rounded px-2 py-1" bind:value={limit}>
			<option value={50}>50</option>
			<option value={100}>100</option>
			<option value={200}>200</option>
		</select>
		<button class="btn-primary" type="submit" disabled={pending}>{pending ? 'Loading…' : 'Search'}</button>
	</form>

	{#if fetchError}
		<div class="panel p-3 border border-danger">Request failed: {fetchError}</div>
	{/if}

	{#if response && response.degraded}
		<div class="panel p-3 border border-warning">
			<strong>{response.view ?? view} view unavailable.</strong>
			<code>{response.reason}</code>
			{#if response.reason === 'TEMPORAL_TABLES_ABSENT'}
				— the workspace event tables are not deployed yet, so no timeline can be shown.
			{:else if response.reason === 'LOADER_NOT_CONFIGURED'}
				— no data source is wired for this view yet.
			{/if}
		</div>
	{/if}

	{#if packet}
		<div class="flex gap-4 flex-wrap text-sm">
			<span>{packet.nodes.length} nodes</span>
			<span>{packet.edges.length} edges</span>
			{#if packet.truncated}<span class="text-warning">truncated at {packet.maxNodes} nodes</span>{/if}
			{#each qualificationCounts as [q, count] (q)}
				<span class="qual" data-q={q}>{q} {count}</span>
			{/each}
		</div>

		<div class="grid-two">
			<div class="panel p-4 flex flex-col gap-3 list">
				{#each grouped as [type, list] (type)}
					<div>
						<h2 class="text-sm font-medium opacity-70 mb-1">{type} ({list.length})</h2>
						<ul class="flex flex-col gap-1">
							{#each list as n (n.id)}
								<li>
									<button class="node-row" class:active={n.id === selectedId} onclick={() => (selectedId = n.id)}>
										<span class="qual" data-q={n.qualification ?? 'UNSPECIFIED'}>{n.qualification ?? '—'}</span>
										<span>{n.label}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
				{#if packet.nodes.length === 0}
					<p class="text-sm opacity-70">No nodes returned.</p>
				{/if}
			</div>

			<div class="panel p-4 flex flex-col gap-2">
				{#if selected}
					<h2 class="text-lg font-medium">{selected.label}</h2>
					<dl class="text-sm flex flex-col gap-1">
						<div><dt class="opacity-60">Type</dt><dd>{selected.type}</dd></div>
						<div>
							<dt class="opacity-60">Qualification</dt>
							<dd><span class="qual" data-q={selected.qualification ?? 'UNSPECIFIED'}>{selected.qualification ?? 'UNSPECIFIED'}</span></dd>
						</div>
						{#if selected.sourceRef}<div><dt class="opacity-60">source_ref</dt><dd><code>{selected.sourceRef}</code></dd></div>{/if}
						{#if selected.packetKey}<div><dt class="opacity-60">packet_key</dt><dd><code>{selected.packetKey}</code></dd></div>{/if}
						{#if selected.sourceRevision}<div><dt class="opacity-60">source revision</dt><dd><code>{selected.sourceRevision}</code></dd></div>{/if}
						{#if selected.span}<div><dt class="opacity-60">span</dt><dd>bytes {selected.span.startByte}–{selected.span.endByte}</dd></div>{/if}
						{#if selected.temporal}
							<div><dt class="opacity-60">task / worktree</dt><dd>{selected.temporal.taskId ?? '—'} / {selected.temporal.worktreeId ?? '—'}</dd></div>
						{/if}
						{#if selected.evidenceRefs?.length}
							<div><dt class="opacity-60">evidence</dt><dd><code>{selected.evidenceRefs.join(', ')}</code></dd></div>
						{/if}
					</dl>

					<h3 class="text-sm font-medium mt-2">Neighbors ({neighbors.length})</h3>
					<ul class="flex flex-col gap-1">
						{#each neighbors as nb (nb.edge.id)}
							<li class="text-sm flex gap-2 items-baseline">
								<span class="tag">{nb.direction === 'out' ? '→' : '←'} {nb.edge.type}</span>
								<span class="qual" data-q={nb.edge.qualification ?? 'UNSPECIFIED'}>{nb.edge.qualification ?? '—'}</span>
								{#if nb.other}
									{@const otherId = nb.other.id}
									<button class="link-btn" onclick={() => (selectedId = otherId)}>{nb.other.label}</button>
								{:else}
									<span class="opacity-60">(outside this page)</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm opacity-70">Select a node to see its source, revision, evidence and neighbors.</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if response && response.rejected.length > 0}
		<div class="panel p-4">
			<h2 class="text-lg font-medium mb-2">Rejected events ({response.rejected.length})</h2>
			<ul class="text-sm flex flex-col gap-1">
				{#each response.rejected as r (r.eventId + r.sequence)}
					<li>#{r.sequence} <code>{r.eventId}</code> — {r.reason}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<p class="text-xs opacity-60">
		Not yet available: guided dependency tours, worktree revision comparison, affected-test impact and paginated expansion.
	</p>
</div>

<style>
	.grid-two {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 1rem;
	}
	@media (max-width: 800px) {
		.grid-two {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.list {
		max-height: 70vh;
		overflow: auto;
	}
	.node-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		width: 100%;
		text-align: left;
		padding: 0.15rem 0.25rem;
		border-radius: 0.25rem;
	}
	.node-row:hover,
	.node-row.active {
		background: rgba(127, 127, 127, 0.15);
	}
	.link-btn {
		text-decoration: underline;
	}
	.qual {
		font-size: 0.7rem;
		padding: 0 0.35rem;
		border-radius: 0.25rem;
		border: 1px solid currentColor;
		white-space: nowrap;
	}
	.qual[data-q='PROPOSED'] { color: #b45309; }
	.qual[data-q='STRUCTURAL_PROVEN'] { color: #15803d; }
	.qual[data-q='EVENT_CHAIN_VERIFIED'] { color: #0f766e; }
	.qual[data-q='HUMAN_REVIEWED'] { color: #1d4ed8; }
	.qual[data-q='STALE'] { color: #6b7280; }
	.qual[data-q='REJECTED'] { color: #b91c1c; }
</style>
