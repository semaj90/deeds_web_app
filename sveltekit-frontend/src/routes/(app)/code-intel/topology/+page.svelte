<script lang="ts">
	import { onMount } from 'svelte';

	// Topo class IDs match topology-byte-mapper.ts TOPO_CLASS enum (bits 0-3 of topo_byte)
	const TOPO_LABELS: Record<number, string> = {
		0: 'unclassified',
		1: 'api-route',
		2: 'database-schema',
		3: 'trace-retrieval',
		4: 'graph-gpu-topology',
		5: 'legal-evidence',
		6: 'test-audit-devtool',
		7: 'ui-component',
	};

	const TOPO_COLORS: Record<number, string> = {
		0: '#94a3b8',
		1: '#f97316',
		2: '#3b82f6',
		3: '#a855f7',
		4: '#22c55e',
		5: '#ef4444',
		6: '#eab308',
		7: '#ec4899',
	};

	const TOPO_GLYPHS: Record<number, string> = {
		0: '○',
		1: '⊳',
		2: '⊞',
		3: '⊛',
		4: '⬡',
		5: '⚖',
		6: '⊹',
		7: '⬜',
	};

	let snapshot = $state<any>(null);
	let nodes = $state<any[]>([]);
	let selectedNode = $state<any>(null);
	let loading = $state(true);
	let colorMode = $state<'type' | 'topo' | 'authority'>('topo');

	// Neighborhood search state
	let filteredView = $state<any[] | null>(null);
	let filterLabel = $state<string | null>(null);
	let neighborSearching = $state(false);
	let neighborResults = $state<Array<{ id: string; label?: string }>>([]);

	const displayNodes = $derived(filteredView ?? nodes);

	const presentClasses = $derived(
		[...new Set(nodes.map((n) => topoClassFromByte(n.topo_byte ?? n.topoByte)))].sort()
	);

	async function loadTopology() {
		try {
			const res = await fetch('/api/code-intel/topology');
			const data = await res.json();
			snapshot = data.snapshot;
			nodes = data.nodes ?? [];
		} catch (e) {
			console.error('Failed to load topology', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadTopology();
	});

	function selectNode(node: any) {
		selectedNode = node;
		neighborResults = [];
	}

	function topoClassFromByte(topoByte: number | null | undefined): number {
		if (topoByte == null) return 0;
		return topoByte & 0x0f;
	}

	function getTypeColor(type: string): string {
		switch (type) {
			case 'directory':     return '#818cf8';
			case 'file':          return '#34d399';
			case 'cluster':       return '#a855f7';
			case 'wiki_note':     return '#f472b6';
			case 'research_note': return '#fbbf24';
			default:              return '#94a3b8';
		}
	}

	function getTopoColor(topoByte: number | null | undefined): string {
		return TOPO_COLORS[topoClassFromByte(topoByte)] ?? TOPO_COLORS[0];
	}

	/** Authority heat: 0.0 → cold blue, 0.5 → purple, 1.0 → gold. */
	function getAuthorityColor(score: number | null | undefined): string {
		const s = Math.max(0, Math.min(1, score ?? 0));
		if (s < 0.33) {
			const t = s / 0.33;
			return `rgb(${Math.round(30 + t * 138)},${Math.round(64 + t * 21)},${Math.round(175 + t * 72)})`;
		} else if (s < 0.67) {
			const t = (s - 0.33) / 0.34;
			return `rgb(${Math.round(168 + t * 81)},${Math.round(85 + t * 30)},${Math.round(247 - t * 225)})`;
		} else {
			const t = (s - 0.67) / 0.33;
			return `rgb(${Math.round(249 - t * 4)},${Math.round(115 + t * 43)},${Math.round(22 - t * 11)})`;
		}
	}

	function nodeColor(node: any): string {
		if (colorMode === 'authority') return getAuthorityColor(node.graph_authority_score);
		if (colorMode === 'topo')      return getTopoColor(node.topo_byte ?? node.topoByte);
		return getTypeColor(node.metadata?.type || 'file');
	}

	function authorityScale(node: any): number {
		if (colorMode !== 'authority') return 1;
		return 1 + (node.graph_authority_score ?? 0) * 0.6;
	}

	function topoLabel(node: any): string {
		return node.topo_class ?? TOPO_LABELS[topoClassFromByte(node.topo_byte ?? node.topoByte)] ?? 'unclassified';
	}

	function topoGlyph(node: any): string {
		return TOPO_GLYPHS[topoClassFromByte(node.topo_byte ?? node.topoByte)] ?? '○';
	}

	function fmtScore(v: number | null | undefined): string {
		if (v == null) return '—';
		return v.toFixed(3);
	}

	function qdrantFlag(node: any, key: string): boolean {
		try { return Boolean((node.qdrant_payload as Record<string, unknown>)?.[key]); }
		catch { return false; }
	}

	// ── Neighborhood search actions ────────────────────────────────────────────

	/** Filter canvas to nodes sharing the same GPU/SOM cluster key. */
	function filterBySomCluster() {
		const key = selectedNode?.cluster_key;
		if (!key) return;
		filteredView = nodes.filter((n) => n.cluster_key === key);
		filterLabel = `SOM cluster: ${key}`;
	}

	/** Filter canvas to nodes within a spatial radius (~8% of canvas extent). */
	function filterByManifoldRegion() {
		if (!selectedNode) return;
		const r = 0.08;
		const sx = selectedNode.x ?? 0.5;
		const sy = selectedNode.y ?? 0.5;
		filteredView = nodes.filter((n) => {
			const dx = (n.x ?? 0.5) - sx;
			const dy = (n.y ?? 0.5) - sy;
			return Math.sqrt(dx * dx + dy * dy) < r;
		});
		filterLabel = `Adjacent region (r≈${Math.round(r * 100)}% of canvas)`;
	}

	function clearFilter() {
		filteredView = null;
		filterLabel = null;
	}

	/** Fetch ego-graph neighbors for the selected node via the traverse API. */
	async function searchNearNode() {
		if (!selectedNode) return;
		neighborSearching = true;
		neighborResults = [];
		try {
			const nodeId = encodeURIComponent(selectedNode.stable_key);
			const res = await fetch(`/api/graph/traverse?nodeId=${nodeId}&mode=ego`);
			if (res.ok) {
				const data = await res.json();
				neighborResults = (data.nodes ?? data.edges ?? []).slice(0, 20);
			}
		} catch (e) {
			console.error('[topology] Neighbor search failed:', e);
		} finally {
			neighborSearching = false;
		}
	}
</script>

<svelte:head>
	<title>Topology Explorer | Code Intel</title>
</svelte:head>

<div class="topology-explorer">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>4D Codebase Topology</h1>
		<p class="subtitle">Neural Map: X/Y (Graph) | Z (Abstraction) | T (Time)</p>
	</header>

	{#if loading}
		<div class="loading">Loading neural atlas...</div>
	{:else}
		<div class="explorer-layout">
			<div class="viewport card">
				<!-- Color-mode toggle -->
				<div class="mode-bar">
					<button
						class="mode-btn"
						class:active={colorMode === 'topo'}
						onclick={() => { colorMode = 'topo'; }}
					>Topo Class</button>
					<button
						class="mode-btn"
						class:active={colorMode === 'authority'}
						onclick={() => { colorMode = 'authority'; }}
					>Authority Heat</button>
					<button
						class="mode-btn"
						class:active={colorMode === 'type'}
						onclick={() => { colorMode = 'type'; }}
					>Node Type</button>
				</div>

				<!-- Topo-class legend -->
				{#if colorMode === 'topo'}
					<div class="legend">
						{#each presentClasses as cls}
							<div class="legend-item">
								<span class="legend-dot" style:background={TOPO_COLORS[cls]}></span>
								<span class="legend-glyph">{TOPO_GLYPHS[cls]}</span>
								<span class="legend-label">{TOPO_LABELS[cls]}</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Authority heat scale -->
				{#if colorMode === 'authority'}
					<div class="legend authority-legend">
						<div class="auth-gradient"></div>
						<div class="auth-scale-labels">
							<span>0.0</span><span>0.5</span><span>1.0</span>
						</div>
						<div class="legend-label">Graph Authority Score</div>
					</div>
				{/if}

				<!-- Active filter status bar -->
				{#if filterLabel}
					<div class="filter-bar">
						<span class="filter-label">{filterLabel} — {displayNodes.length} node{displayNodes.length === 1 ? '' : 's'}</span>
						<button class="filter-clear" onclick={clearFilter}>✕ Clear</button>
					</div>
				{/if}

				<div class="canvas">
					{#each displayNodes as node}
						<button
							class="node"
							class:selected={selectedNode?.stable_key === node.stable_key}
							style:left="{node.x * 100}%"
							style:top="{node.y * 100}%"
							style:--node-color={nodeColor(node)}
							style:--z-scale={1 + (node.z || 0) * 0.2}
							style:--auth-scale={authorityScale(node)}
							title="{node.stable_key} · {topoLabel(node)}{node.graph_authority_score != null ? ` · auth=${fmtScore(node.graph_authority_score)}` : ''}"
							onclick={() => selectNode(node)}
						>
							<div class="dot"></div>
							<span class="label">{node.stable_key.split('/').pop()}</span>
						</button>
					{/each}
				</div>
			</div>

			<aside class="inspector card">
				{#if selectedNode}
					<div class="inspector-content">
						<h2>Node Inspector</h2>
						<div class="id">{selectedNode.stable_key}</div>

						<!-- Topo class badge -->
						<div
							class="topo-badge"
							style:background={getTopoColor(selectedNode.topo_byte ?? selectedNode.topoByte) + '33'}
							style:border-color={getTopoColor(selectedNode.topo_byte ?? selectedNode.topoByte)}
						>
							<span class="topo-glyph">{topoGlyph(selectedNode)}</span>
							<span class="topo-name">{topoLabel(selectedNode)}</span>
							{#if (selectedNode.topo_byte ?? selectedNode.topoByte) != null}
								<span class="topo-byte">0x{((selectedNode.topo_byte ?? selectedNode.topoByte) & 0xff).toString(16).padStart(2, '0')}</span>
							{/if}
						</div>

						<!-- Graph authority score bar -->
						{#if selectedNode.graph_authority_score != null}
							<div class="authority-row">
								<span class="lab">Graph Authority</span>
								<div class="authority-bar-wrap">
									<div
										class="authority-bar"
										style:width="{(selectedNode.graph_authority_score * 100).toFixed(1)}%"
										style:background={getAuthorityColor(selectedNode.graph_authority_score)}
									></div>
								</div>
								<span class="authority-val">{fmtScore(selectedNode.graph_authority_score)}</span>
							</div>
						{/if}

						<div class="meta-grid">
							<div class="meta-item">
								<span class="lab">Node Type</span>
								<span class="val">{selectedNode.metadata?.type || 'unknown'}</span>
							</div>
							<div class="meta-item">
								<span class="lab">Abstraction (Z)</span>
								<span class="val">{selectedNode.z?.toFixed(2) ?? '—'}</span>
							</div>
							<div class="meta-item">
								<span class="lab">Time (T)</span>
								<span class="val">{selectedNode.t?.toFixed(2) ?? '—'}</span>
							</div>
							<div class="meta-item">
								<span class="lab">Cluster</span>
								<span class="val">{selectedNode.cluster_key || 'none'}</span>
							</div>
							{#if selectedNode.som_cluster != null}
								<div class="meta-item">
									<span class="lab">SOM Cluster</span>
									<span class="val">{selectedNode.som_cluster}</span>
								</div>
							{/if}
							{#if selectedNode.tensor_affinity_score != null}
								<div class="meta-item">
									<span class="lab">Tensor Affinity</span>
									<span class="val">{fmtScore(selectedNode.tensor_affinity_score)}</span>
								</div>
							{/if}
							{#if selectedNode.manifold4_x != null}
								<div class="meta-item manifold">
									<span class="lab">Manifold4</span>
									<span class="val mono">[{fmtScore(selectedNode.manifold4_x)}, {fmtScore(selectedNode.manifold4_y)}, {fmtScore(selectedNode.manifold4_z)}, {fmtScore(selectedNode.manifold4_w)}]</span>
								</div>
							{/if}
						</div>

						<!-- ACE / Qdrant usage flags -->
						<div class="usage-flags">
							<span
								class="flag"
								class:active={qdrantFlag(selectedNode, 'llm_synthesis_used')}
								title="Used in an ACE synthesis response"
							>LLM Used</span>
							<span
								class="flag"
								class:active={qdrantFlag(selectedNode, 'ace_cache_hit')}
								title="Returned from the ACE Redis code cache"
							>Cache Hit</span>
						</div>

						{#if selectedNode.metadata?.tags}
							<div class="tags">
								{#each selectedNode.metadata.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}

						<div class="actions">
							<button class="action-btn" onclick={searchNearNode} disabled={neighborSearching}>
								{neighborSearching ? 'Searching…' : '⊛ Search near this node'}
							</button>
							<button
								class="action-btn secondary"
								onclick={filterBySomCluster}
								disabled={!selectedNode.cluster_key}
								title={selectedNode.cluster_key ? `Filter to cluster ${selectedNode.cluster_key}` : 'No cluster assigned'}
							>
								⬡ Show same SOM cluster
							</button>
							<button class="action-btn secondary" onclick={filterByManifoldRegion}>
								⊞ Show adjacent manifold region
							</button>
							{#if selectedNode.cluster_key}
								<a href="/code-intel/clusters/{selectedNode.cluster_key}" class="action-btn link-btn">
									Inspect Cluster
								</a>
							{/if}
						</div>

						{#if neighborResults.length > 0}
							<div class="neighbor-results">
								<h3>Ego-graph neighbors ({neighborResults.length})</h3>
								<ul>
									{#each neighborResults as nb}
										<li>
											<button
												class="nb-btn"
												onclick={() => {
													const match = nodes.find(
														(n) => n.stable_key === (nb.id ?? nb.label)
													);
													if (match) selectNode(match);
												}}
											>
												{nb.label ?? nb.id ?? '—'}
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{:else}
					<div class="empty-state">Select a node to inspect its topology class and properties</div>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style>
	.topology-explorer {
		padding: 2rem;
		height: 100vh;
		display: flex;
		flex-direction: column;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header { margin-bottom: 2rem; flex-shrink: 0; }

	nav a {
		color: #818cf8;
		text-decoration: none;
		font-size: 0.875rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	h1 {
		font-size: 2rem;
		background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle { color: #64748b; font-size: 0.875rem; }

	.explorer-layout {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 2rem;
		flex-grow: 1;
		min-height: 0;
	}

	.viewport {
		position: relative;
		overflow: hidden;
		background: #0f172a;
		border: 1px solid #1e293b;
		cursor: grab;
	}

	/* ── Color mode toggle ──────────────────────────────── */
	.mode-bar {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		gap: 4px;
		background: #1e293bcc;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 4px;
		backdrop-filter: blur(4px);
	}

	.mode-btn {
		background: none;
		border: none;
		color: #64748b;
		font-size: 0.75rem;
		padding: 0.25rem 0.6rem;
		border-radius: 5px;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s, color 0.15s;
	}

	.mode-btn.active {
		background: #334155;
		color: #e2e8f0;
	}

	/* ── Legends ────────────────────────────────────────── */
	.legend {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: #0f172acc;
		border: 1px solid #1e293b;
		border-radius: 8px;
		padding: 8px 10px;
		backdrop-filter: blur(4px);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.65rem;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-glyph { color: #64748b; width: 12px; text-align: center; }
	.legend-label  { color: #94a3b8; font-size: 0.65rem; }

	.authority-legend { gap: 6px; }

	.auth-gradient {
		width: 120px;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to right, #1e40af, #a855f7, #f59e0b);
	}

	.auth-scale-labels {
		display: flex;
		justify-content: space-between;
		width: 120px;
		font-size: 0.6rem;
		color: #64748b;
	}

	/* ── Filter status bar ─────────────────────────────── */
	.filter-bar {
		position: absolute;
		top: 3rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: #1e293bcc;
		border: 1px solid #818cf8;
		border-radius: 8px;
		padding: 4px 10px;
		backdrop-filter: blur(4px);
		font-size: 0.75rem;
		color: #a5b4fc;
	}

	.filter-label { flex: 1; white-space: nowrap; }

	.filter-clear {
		background: none;
		border: none;
		color: #818cf8;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0 4px;
	}

	.filter-clear:hover { color: #fff; }

	/* ── Canvas + nodes ─────────────────────────────────── */
	.canvas {
		position: absolute;
		width: 200%;
		height: 200%;
		left: -50%;
		top: -50%;
	}

	.node {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		transform: scale(calc(var(--z-scale) * var(--auth-scale, 1)));
		transition: transform 0.2s;
		z-index: 1;
	}

	.node:hover, .node.selected {
		z-index: 100;
		transform: scale(calc(var(--z-scale) * var(--auth-scale, 1) * 1.5));
	}

	.dot {
		width: 12px;
		height: 12px;
		background: var(--node-color);
		border-radius: 50%;
		box-shadow: 0 0 10px var(--node-color);
	}

	.node.selected .dot {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.label {
		font-size: 0.625rem;
		color: #94a3b8;
		margin-top: 4px;
		white-space: nowrap;
		opacity: 0.5;
	}

	.node:hover .label, .node.selected .label {
		opacity: 1;
		color: #fff;
	}

	/* ── Inspector ──────────────────────────────────────── */
	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
	}

	.inspector { overflow-y: auto; }

	h2 { font-size: 1.25rem; margin-bottom: 1.5rem; color: #94a3b8; }

	.id {
		font-family: monospace;
		font-size: 0.75rem;
		background: #0f172a;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		word-break: break-all;
	}

	.topo-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 1px solid;
		border-radius: 8px;
		padding: 6px 10px;
		margin-bottom: 1rem;
		font-size: 0.8rem;
	}

	.topo-glyph { font-size: 1rem; }
	.topo-name  { font-weight: 600; flex: 1; }
	.topo-byte  { font-family: monospace; font-size: 0.7rem; color: #64748b; }

	/* ── Authority score bar ────────────────────────────── */
	.authority-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 1.25rem;
	}

	.authority-row .lab { font-size: 0.75rem; color: #64748b; flex-shrink: 0; }

	.authority-bar-wrap {
		flex: 1;
		height: 6px;
		background: #0f172a;
		border-radius: 3px;
		overflow: hidden;
	}

	.authority-bar {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s;
	}

	.authority-val {
		font-family: monospace;
		font-size: 0.75rem;
		color: #e2e8f0;
		flex-shrink: 0;
		min-width: 36px;
		text-align: right;
	}

	/* ── Meta grid ──────────────────────────────────────── */
	.meta-grid {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.meta-item {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.meta-item.manifold { flex-direction: column; gap: 0.25rem; }
	.meta-item.manifold .val { font-size: 0.7rem; }

	.lab  { color: #64748b; font-size: 0.875rem; flex-shrink: 0; }
	.val  { font-weight: 600; font-size: 0.875rem; }
	.mono { font-family: monospace; }

	/* ── ACE usage flags ────────────────────────────────── */
	.usage-flags {
		display: flex;
		gap: 6px;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.flag {
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 99px;
		border: 1px solid #334155;
		color: #475569;
	}

	.flag.active {
		border-color: #22c55e;
		color: #22c55e;
		background: #22c55e18;
	}

	/* ── Tags ───────────────────────────────────────────── */
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.tag {
		background: #334155;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	/* ── Actions ────────────────────────────────────────── */
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.action-btn {
		background: #818cf8;
		color: #fff;
		border: none;
		padding: 0.75rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		text-decoration: none;
		display: block;
		font-family: inherit;
		font-size: 0.875rem;
	}

	.action-btn.secondary {
		background: #334155;
		color: #94a3b8;
	}

	.action-btn:hover { filter: brightness(1.1); }

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		filter: none;
	}

	/* ── Neighbor results panel ────────────────────────── */
	.neighbor-results {
		margin-top: 1.25rem;
		border-top: 1px solid #334155;
		padding-top: 1rem;
	}

	.neighbor-results h3 {
		font-size: 0.8rem;
		color: #64748b;
		margin: 0 0 0.5rem;
	}

	.neighbor-results ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.nb-btn {
		background: none;
		border: none;
		color: #a5b4fc;
		cursor: pointer;
		font-size: 0.72rem;
		font-family: monospace;
		text-align: left;
		padding: 2px 4px;
		border-radius: 4px;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nb-btn:hover {
		background: #334155;
		color: #fff;
	}

	.loading, .empty-state {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		text-align: center;
		font-style: italic;
	}
</style>