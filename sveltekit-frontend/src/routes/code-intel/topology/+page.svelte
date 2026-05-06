<script lang="ts">
	import { onMount } from 'svelte';

	let snapshot = $state<any>(null);
	let nodes = $state<any[]>([]);
	let selectedNode = $state<any>(null);
	let loading = $state(true);

	async function loadTopology() {
		try {
			const res = await fetch('/api/code-intel/topology');
			const data = await res.json();
			snapshot = data.snapshot;
			nodes = data.nodes;
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

	function getNodeColor(type: string) {
		switch (type) {
			case 'directory': return '#818cf8';
			case 'file': return '#34d399';
			case 'cluster': return '#a855f7';
			case 'wiki_note': return '#f472b6';
			case 'research_note': return '#fbbf24';
			default: return '#94a3b8';
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
				<div class="canvas">
					{#each nodes as node}
						<button 
							class="node" 
							class:selected={selectedNode?.stable_key === node.stable_key}
							style:left="{node.x * 100}%" 
							style:top="{node.y * 100}%"
							style:--node-color={getNodeColor(node.metadata?.type || 'file')}
							style:--z-scale={1 + (node.z || 0) * 0.2}
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
						
						<div class="meta-grid">
							<div class="meta-item">
								<span class="lab">Type</span>
								<span class="val">{selectedNode.metadata?.type || 'unknown'}</span>
							</div>
							<div class="meta-item">
								<span class="lab">Abstraction (Z)</span>
								<span class="val">{selectedNode.z?.toFixed(2)}</span>
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
					<div class="empty-state">Select a node to inspect its properties</div>
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

	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
	}

	.inspector {
		overflow-y: auto;
	}

	h2 { font-size: 1.25rem; margin-bottom: 1.5rem; color: #94a3b8; }

	.id {
		font-family: monospace;
		font-size: 0.75rem;
		background: #0f172a;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		word-break: break-all;
	}

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

	.action-btn:hover {
		filter: brightness(1.1);
	}

	.empty-state {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		text-align: center;
		font-style: italic;
	}
</style>
