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

	// Colors match the user-defined label-to-color mapping
	const TOPO_COLORS: Record<number, string> = {
		0: '#94a3b8', // unclassified — neutral slate
		1: '#f97316', // api-route — orange (HTTP/route feel)
		2: '#3b82f6', // database-schema — blue (data)
		3: '#a855f7', // trace-retrieval — purple (vector/retrieval)
		4: '#22c55e', // graph-gpu-topology — green (GPU/compute)
		5: '#ef4444', // legal-evidence — red (legal/evidence)
		6: '#eab308', // test-audit-devtool — yellow (tests/CI)
		7: '#ec4899', // ui-component — pink (UI/frontend)
	};

	// Glyphs for the legend and inspector
	const TOPO_GLYPHS: Record<number, string> = {
		0: '○',
		1: '⊳', // route arrow
		2: '⊞', // database grid
		3: '⊛', // retrieval star
		4: '⬡', // GPU hexagon
		5: '⚖', // legal scale
		6: '⊹', // test/audit cross
		7: '⬜', // UI square
	};

	let snapshot = $state<any>(null);
	let nodes = $state<any[]>([]);
	let selectedNode = $state<any>(null);
	let loading = $state(true);
	let colorMode = $state<'type' | 'topo'>('topo');

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
	}

	/** Extract topoClass from topoByte (bits 0-3). */
	function topoClassFromByte(topoByte: number | null | undefined): number {
		if (topoByte == null) return 0;
		return topoByte & 0x0f;
	}

	/** Color by node structural type (original behaviour). */
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

	/** Color by topoLabel (topo_byte bits 0-3). */
	function getTopoColor(topoByte: number | null | undefined): string {
		return TOPO_COLORS[topoClassFromByte(topoByte)] ?? TOPO_COLORS[0];
	}

	/** Resolve the CSS color for a node based on the active color mode. */
	function nodeColor(node: any): string {
		if (colorMode === 'topo') return getTopoColor(node.topo_byte ?? node.topoByte);
		return getTypeColor(node.metadata?.type || 'file');
	}

	function topoLabel(node: any): string {
		return TOPO_LABELS[topoClassFromByte(node.topo_byte ?? node.topoByte)] ?? 'unclassified';
	}

	function topoGlyph(node: any): string {
		return TOPO_GLYPHS[topoClassFromByte(node.topo_byte ?? node.topoByte)] ?? '○';
	}

	// Unique topo classes present in the loaded node set (for legend)
	const presentClasses = $derived(
		[...new Set(nodes.map((n) => topoClassFromByte(n.topo_byte ?? n.topoByte)))].sort()
	);
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
					>By Topo Class</button>
					<button
						class="mode-btn"
						class:active={colorMode === 'type'}
						onclick={() => { colorMode = 'type'; }}
					>By Node Type</button>
				</div>

				<!-- Topo-class legend (only in topo mode) -->
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

				<div class="canvas">
					{#each nodes as node}
						<button
							class="node"
							class:selected={selectedNode?.stable_key === node.stable_key}
							style:left="{node.x * 100}%"
							style:top="{node.y * 100}%"
							style:--node-color={nodeColor(node)}
							style:--z-scale={1 + (node.z || 0) * 0.2}
							title="{node.stable_key} · {topoLabel(node)}"
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
						</div>

						{#if selectedNode.metadata?.tags}
							<div class="tags">
								{#each selectedNode.metadata.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}

						<div class="actions">
							<button class="action-btn">View Code</button>
							{#if selectedNode.cluster_key}
								<a href="/code-intel/clusters/{selectedNode.cluster_key}" class="action-btn link-btn">
									Inspect Cluster
								</a>
							{/if}
							<button class="action-btn secondary">View Lenses</button>
						</div>
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
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle { color: #64748b; font-size: 0.875rem; }

	.explorer-layout {
		display: grid;
		grid-template-columns: 1fr 350px;
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

	/* ── Topo-class legend ──────────────────────────────── */
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
	.legend-label { color: #94a3b8; }

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
		transform: scale(var(--z-scale));
		transition: transform 0.2s, z-index 0.2s;
		z-index: 1;
	}

	.node:hover, .node.selected {
		z-index: 100;
		transform: scale(calc(var(--z-scale) * 1.5));
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
		margin-bottom: 1.25rem;
		font-size: 0.8rem;
	}

	.topo-glyph { font-size: 1rem; }
	.topo-name  { font-weight: 600; flex: 1; }
	.topo-byte  { font-family: monospace; font-size: 0.7rem; color: #64748b; }

	.meta-grid {
		display: grid;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.meta-item {
		display: flex;
		justify-content: space-between;
	}

	.lab { color: #64748b; font-size: 0.875rem; }
	.val { font-weight: 600; }

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
	}

	.action-btn.secondary {
		background: #334155;
		color: #94a3b8;
	}

	.action-btn:hover { filter: brightness(1.1); }

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
