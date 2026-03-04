<script lang="ts">
	/**
	 * Route Tree View - NES Edition
	 * Hierarchical tree visualization of all routes
	 */

	interface TreeNode {
		name: string;
		path: string;
		type: 'group' | 'page' | 'api' | 'server' | 'layout';
		children: TreeNode[];
		count: number;
	}

	let {
		routes = []
	}: {
		routes: any[];
	} = $props();

	let expandedNodes = $state(new Set<string>());
	let searchQuery = $state('');

	function buildTree(routes: any[]): TreeNode[] {
		const root: TreeNode = {
			name: 'routes',
			path: '',
			type: 'group',
			children: [],
			count: 0
		};

		// Build tree structure from route paths
		for (const route of routes) {
			const parts = route.path.split('/').filter((p: string) => p);
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				let child = current.children.find((c: TreeNode) => c.name === part);

				if (!child) {
					const isLast = i === parts.length - 1;
					child = {
						name: part,
						path: '/' + parts.slice(0, i + 1).join('/'),
						type: isLast ? (route.type === 'api' ? 'api' : 'page') : 'group',
						children: [],
						count: 0
					};
					current.children.push(child);
				}

				if (i === parts.length - 1) {
					child.count = 1;
				}

				current = child;
			}
		}

		// Calculate counts recursively
		function calculateCounts(node: TreeNode): number {
			if (node.children.length === 0) {
				return node.count;
			}
			node.count = node.children.reduce((sum, child) => sum + calculateCounts(child), 0);
			return node.count;
		}

		calculateCounts(root);

		return root.children;
	}

	let treeNodes = $derived(buildTree(routes));

	function toggleNode(path: string) {
		if (expandedNodes.has(path)) {
			expandedNodes.delete(path);
		} else {
			expandedNodes.add(path);
		}
		expandedNodes = expandedNodes;
	}

	function expandAll() {
		const allPaths = new Set<string>();
		function collectPaths(nodes: TreeNode[]) {
			for (const node of nodes) {
				if (node.children.length > 0) {
					allPaths.add(node.path);
					collectPaths(node.children);
				}
			}
		}
		collectPaths(treeNodes);
		expandedNodes = allPaths;
	}

	function collapseAll() {
		expandedNodes = new Set();
	}

	function getNodeIcon(type: string): string {
		switch (type) {
			case 'group': return '📁';
			case 'page': return '📄';
			case 'api': return '⚙️';
			case 'server': return '🔧';
			case 'layout': return '📐';
			default: return '•';
		}
	}

	function getNodeColor(type: string): string {
		switch (type) {
			case 'group': return '#ffaa33';
			case 'page': return '#33ff33';
			case 'api': return '#3399ff';
			case 'server': return '#ff33ff';
			case 'layout': return '#ffff33';
			default: return '#999';
		}
	}
</script>

<div class="tree-view">
	<!-- Header -->
	<div class="tree-header">
		<div class="tree-title">
			<span class="title-text">ROUTE TREE HIERARCHY</span>
			<span class="route-count">{routes.length} routes</span>
		</div>
		<div class="tree-controls">
			<button class="control-btn" onclick={expandAll}>
				[+] EXPAND ALL
			</button>
			<button class="control-btn" onclick={collapseAll}>
				[-] COLLAPSE ALL
			</button>
		</div>
	</div>

	<!-- Legend -->
	<div class="tree-legend">
		<span class="legend-item"><span style="color: {getNodeColor('group')}">{getNodeIcon('group')}</span> Folder</span>
		<span class="legend-item"><span style="color: {getNodeColor('page')}">{getNodeIcon('page')}</span> Page</span>
		<span class="legend-item"><span style="color: {getNodeColor('api')}">{getNodeIcon('api')}</span> API</span>
		<span class="legend-item"><span style="color: {getNodeColor('server')}">{getNodeIcon('server')}</span> Server</span>
		<span class="legend-item"><span style="color: {getNodeColor('layout')}">{getNodeIcon('layout')}</span> Layout</span>
	</div>

	<!-- Tree -->
	<div class="tree-container">
		{#snippet renderNode(node: TreeNode, depth: number)}
			<div class="tree-node" style="padding-left: {depth * 1.5}rem">
				{#if node.children.length > 0}
					<!-- Expandable Node -->
					<button
						class="node-toggle"
						onclick={() => toggleNode(node.path)}
					>
						<span class="toggle-icon">
							{expandedNodes.has(node.path) ? '[-]' : '[+]'}
						</span>
						<span class="node-icon" style="color: {getNodeColor(node.type)}">
							{getNodeIcon(node.type)}
						</span>
						<span class="node-name" style="color: {getNodeColor(node.type)}">
							{node.name}
						</span>
						<span class="node-count">[{node.count}]</span>
					</button>

					{#if expandedNodes.has(node.path)}
						<div class="node-children">
							{#each node.children as child}
								{@render renderNode(child, depth + 1)}
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Leaf Node -->
					<div class="node-leaf">
						<span class="leaf-spacer"></span>
						<span class="node-icon" style="color: {getNodeColor(node.type)}">
							{getNodeIcon(node.type)}
						</span>
						<span class="node-name" style="color: {getNodeColor(node.type)}">
							{node.name}
						</span>
						<span class="node-path">{node.path}</span>
					</div>
				{/if}
			</div>
		{/snippet}

		{#if treeNodes.length === 0}
			<div class="empty-state">
				<p>NO ROUTES FOUND</p>
			</div>
		{:else}
			{#each treeNodes as node}
				{@render renderNode(node, 0)}
			{/each}
		{/if}
	</div>
</div>

<style>
	/* ── Tree View Container ── */
	.tree-view {
		background: #0c0c0c;
		border: 1px solid #ffaa33;
		font-family: 'Courier New', 'Consolas', monospace;
		color: #33ff33;
	}

	/* ── Header ── */
	.tree-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #1a1000;
		border-bottom: 1px solid #ffaa33;
	}

	.tree-title {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.title-text {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #ffaa33;
	}

	.route-count {
		font-size: 0.75rem;
		color: #ffcc66;
		background: rgba(255, 170, 51, 0.1);
		padding: 0.2rem 0.5rem;
		border: 1px solid #ffaa33;
	}

	.tree-controls {
		display: flex;
		gap: 0.5rem;
	}

	.control-btn {
		background: none;
		border: 1px solid #ffaa33;
		color: #ffaa33;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.control-btn:hover {
		background: rgba(255, 170, 51, 0.2);
	}

	/* ── Legend ── */
	.tree-legend {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: #111;
		border-bottom: 1px solid #664400;
		font-size: 0.7rem;
	}

	.legend-item {
		color: #999;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	/* ── Tree Container ── */
	.tree-container {
		max-height: 600px;
		overflow-y: auto;
		padding: 0.5rem 0;
	}

	/* ── Tree Node ── */
	.tree-node {
		margin: 0.1rem 0;
	}

	.node-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.3rem 0.5rem;
		background: none;
		border: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}

	.node-toggle:hover {
		background: rgba(255, 170, 51, 0.1);
	}

	.toggle-icon {
		font-weight: bold;
		color: #ffaa33;
		flex-shrink: 0;
		width: 28px;
	}

	.node-icon {
		flex-shrink: 0;
		width: 20px;
	}

	.node-name {
		flex: 1;
		font-weight: bold;
	}

	.node-count {
		flex-shrink: 0;
		font-size: 0.7rem;
		color: #996600;
	}

	/* ── Leaf Node ── */
	.node-leaf {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
	}

	.leaf-spacer {
		width: 28px;
		flex-shrink: 0;
	}

	.node-path {
		font-size: 0.7rem;
		color: #666;
		margin-left: auto;
	}

	/* ── Node Children ── */
	.node-children {
		border-left: 1px solid #664400;
		margin-left: 1rem;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #664400;
		margin: 1rem;
	}

	.empty-state p {
		margin: 0.5rem 0;
		color: #996600;
	}

	/* ── Scrollbar ── */
	.tree-container::-webkit-scrollbar {
		width: 8px;
	}

	.tree-container::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.tree-container::-webkit-scrollbar-thumb {
		background: #ffaa33;
		border-radius: 4px;
	}
</style>
