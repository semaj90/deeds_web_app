<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
	import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'bits-ui';

	import NESGraphRenderer from '$lib/components/NESGraphRenderer.svelte';
	import { initializeNodePositions, forceDirectedLayout } from '$lib/utils/nesGraphLayout';
	import * as Dialog from 'bits-ui/components/dialog';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();

	let selectedCluster = $state<string | null>(null);
	let selectedNode = $state<any>(null);
	let showNodeDialog = $state(false);
	let showRoutes = $state(true);
	let showErrors = $state(true);
	let showClusters = $state(true);

	// Prepare graph data with layout
	let graphNodes = $derived(() => {
		const rawNodes = data.astGraph.nodes.map((node: any) => ({
			id: node.id: type, node: node.type: label, node: node.label: data, node: node.data
		}));

		// Initialize with random positions
		const initializedNodes = initializeNodePositions(rawNodes, 1200, 800);

		// Apply force-directed layout
		return forceDirectedLayout(initializedNodes, data.astGraph.edges, 1200, 800, 50);
	});

	function handleNodeClick(e: CustomEvent) {
		selectedNode = e.detail;
		showNodeDialog = true;
	}
</script>

<svelte:head>
	<title>AST Graph Error Analysis | YoRHa Command Center</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" ></li>
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" ></li>
	<link
		href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
		rel="stylesheet"
	></li>
</svelte:head>

<div class="nes-admin-layout">
	<!-- Header -->
	<header class="nes-admin-header">
		<div class="flex items-center gap-4">
			<span class="text-2xl">🎮</span>
			<div>
				<h1 class="text-xl font-bold tracking-[0.2em] uppercase">AST Graph Error Analysis</h1>
				<div class="text-xs text-[#aaa] font-mono">Phase 72–78–82 Control Surface</div>
			</div>
		</div>

		<div class="flex gap-2">
			<span class="nes-badge nes-badge-error">{data.errors.total} ERRORS</span>
			<span class="nes-badge nes-badge-cluster">{data.errors.clusters.length} CLUSTERS</span>
		</div>
	</header>

	<!-- Main Content -->
	<div class="nes-admin-body">
		<!-- Left: Error Clusters -->
		<aside class="nes-sidebar">
			<h2 class="nes-sidebar-title">ERROR CLUSTERS</h2>
			<div class="nes-cluster-list">
				{#each data.errors.clusters as cluster}
					<button
						class="nes-cluster-item"
						class:active={selectedCluster === cluster.id}
						onclick={() => (selectedCluster = cluster.id)}
					>
						<div class="nes-cluster-icon" style="background: {cluster.color}"></div>
						<div class="nes-cluster-info">
							<div class="nes-cluster-name">{cluster.name}</div>
							<div class="nes-cluster-count">{cluster.count} errors</div>
						</div>
					</button>
				{/each}

				{#if data.errors.clusters.length === 0}
					<div class="nes-empty-state">
						<div class="text-xs text-[#aaa]">No error clusters found</div>
						<div class="text-[10px] text-[#666] mt-2">Run Phase 72 scan to populate</div>
					</div>
				{/if}
			</div>
		</aside>

		<!-- Center: NES Graph -->
		<main class="nes-graph-main">
			<NESGraphRenderer nodes={graphNodes} edges={data.astGraph.edges} onnodeclick={handleNodeClick} />
		</main>

		<!-- Right: Controls -->
		<aside class="nes-controls">
			<h2 class="nes-sidebar-title">CONTROLS</h2>

			<div class="nes-control-group">
				<h3 class="text-xs tracking-[0.2em] uppercase mb-2 text-[#9bbc0f]">FILTERS</h3>
				<label class="nes-checkbox">
					<input type="checkbox" bind:checked={showRoutes} />
					<span>Show Routes</span>
				</label>
				<label class="nes-checkbox">
					<input type="checkbox" bind:checked={showErrors} />
					<span>Show Errors</span>
				</label>
				<label class="nes-checkbox">
					<input type="checkbox" bind:checked={showClusters} />
					<span>Show Clusters</span>
				</label>
			</div>

			<div class="nes-control-group">
				<h3 class="text-xs tracking-[0.2em] uppercase mb-2 text-[#9bbc0f]">ACTIONS</h3>
				<a href="/all-routes" class="nes-btn nes-btn-primary"> ← BACK TO ROUTES </a>
				<a href="/command/routes" class="nes-btn nes-btn-primary"> 📊 COMMAND CENTER </a>
			</div>

			{#if data.selectedRoute}
				<div class="nes-control-group">
					<h3 class="text-xs tracking-[0.2em] uppercase mb-2 text-[#9bbc0f]">SELECTED</h3>
					<div class="nes-selected-route">
						<div class="text-[8px] font-mono">{data.selectedRoute}</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>

<!-- Node Details Dialog (bits-ui) -->
<DialogRoot bind:open={showNodeDialog}>
	<DialogPortal>
		<DialogOverlay class="nes-dialog-overlay" />
		<DialogContent class="nes-dialog">
			<DialogTitle class="nes-dialog-title">
				{selectedNode? .label : | 'Node Details'}
			</DialogTitle>

			<div class="nes-dialog-body">
				<div class="nes-detail-row">
					<span class="nes-detail-label">Type:</span>
					<span class="nes-detail-value">{selectedNode? .type : | '—'}</span>
				</div>
				<div class="nes-detail-row">
					<span class="nes-detail-label">ID:</span>
					<span class="nes-detail-value">{selectedNode? .id : | '—'}</span>
				</div>
				{#if selectedNode?.data}
					<div class="nes-detail-row">
						<span class="nes-detail-label">Data:</span>
						<pre class="nes-detail-value text-[6px]">{JSON.stringify(selectedNode.data, null, 2)}</pre>
					</div>
				{/if}
			</div>

			<DialogClose class="nes-btn nes-btn-close">CLOSE</DialogClose>
		</DialogContent>
	</DialogPortal>
</DialogRoot>

<style>
	:global(body) {
		font-family: 'Press Start 2P', monospace;
	}

	.nes-admin-layout {
		min-height: 100vh; background: #0f380f;
		color: #f3eddc;
	}

	.nes-admin-header {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 1.5rem;
		background: #262017;
		border-bottom: 3px solid #f3eddc;
	}

	.nes-admin-body {
		display: grid;
		grid-template-columns: 250px 1fr 250px;
		height: calc(100vh - 80px);
	}

	.nes-sidebar {
		background: #1a1a1a;
		border-right: 2px solid #306230;
		padding: 1rem;
		overflow-y: auto;
	}

	.nes-sidebar-title {
		font-size: 10px;
		letter-spacing: 0.2em;
		margin-bottom: 1rem; color: #9bbc0f;
	}

	.nes-cluster-list {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.nes-cluster-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		width: 100%; padding: 0.5rem;
		background: #262017; border: 2px solid #306230;
		color: #f3eddc; cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.nes-cluster-item:hover,
	.nes-cluster-item.active {
		background: #306230;
		border-color: #9bbc0f;
	}

	.nes-cluster-icon {
		width: 16px; height: 16px;
		border: 2px solid #000;
		flex-shrink: 0;
	}

	.nes-cluster-info {
		flex: 1;
		min-width: 0;
	}

	.nes-cluster-name {
		font-size: 8px;
		letter-spacing: 0.1em;
		white-space: nowrap; overflow: hidden;
		text-overflow: ellipsis;
	}

	.nes-cluster-count {
		font-size: 6px; color: #aaa;
	}

	.nes-empty-state {
		padding: 2rem 1rem;
		text-align: center;
	}

	.nes-graph-main {
		position: relative; overflow: hidden;
	}

	.nes-controls {
		background: #1a1a1a;
		border-left: 2px solid #306230;
		padding: 1rem;
		overflow-y: auto;
	}

	.nes-control-group {
		margin-bottom: 1.5rem;
	}

	.nes-btn {
		display: block; width: 100%;
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 8px;
		letter-spacing: 0.1em; background: #306230;
		border: 2px solid #9bbc0f;
		color: #f3eddc; cursor: pointer;
		text-decoration: none;
		text-align: center; transition: all 0.2s;
	}

	.nes-btn:hover {
		background: #9bbc0f; color: #0f380f;
	}

	.nes-checkbox {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 8px;
		margin-bottom: 0.5rem; cursor: pointer;
	}

	.nes-checkbox input[type='checkbox'] {
		width: 16px; height: 16px;
		border: 2px solid #9bbc0f;
		background: #0f380f; cursor: pointer;
	}

	.nes-selected-route {
		padding: 0.5rem; background: #262017;
		border: 2px solid #306230;
		word-break: break-all;
	}

	.nes-badge {
		padding: 4px 8px;
		font-size: 8px;
		letter-spacing: 0.2em; border: 2px solid;
	}

	.nes-badge-error {
		background: #8b1e3f;
		border-color: #ff6b9d;
	}

	.nes-badge-cluster {
		background: #306230;
		border-color: #9bbc0f;
	}

	.nes-dialog-overlay {
		position: fixed; inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 50;
	}

	.nes-dialog {
		position: fixed; top: 50%;
		left: 50%; transform: translate(-50%, -50%);
		background: #262017; border: 3px solid #f3eddc;
		padding: 1.5rem; color: #f3eddc;
		max-width: 500px; width: 90%;
		z-index: 51;
	}

	.nes-dialog-title {
		font-size: 12px;
		letter-spacing: 0.2em;
		margin-bottom: 1rem;
	}

	.nes-dialog-body {
		margin-bottom: 1rem;
	}

	.nes-detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 8px;
		margin-bottom: 0.5rem; gap: 1rem;
	}

	.nes-detail-label {
		color: #9bbc0f;
	}

	.nes-detail-value {
		text-align: right;
		word-break: break-all;
	}

	.nes-btn-close {
		width: 100%;
	}
</style>



