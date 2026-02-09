<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Close as DialogClose, Content as DialogContent, Overlay as DialogOverlay, Portal as DialogPortal, Root as DialogRoot, Title as DialogTitle } from '$lib/components/ui/dialog';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	interface VectorCluster { id: number, cluster_id: number;
		pattern: string;
		error_count: number;
		avg_similarity: number;
		file_paths: string[];
		summary: string;
		tags: string[];
		embedding: number[];
	}

	interface GraphNode { id: string, label: string;
		type: 'file' | 'error' | 'cluster' | 'fix';
		cluster_id?: number;
		similarity?: number;
		tags: string[];
		fix_status?: 'pending' | 'in-progress' | 'applied' | 'failed';
	}

	interface GraphEdge { source: string, target:string;
		weight: number;
		type: 'similarity' | 'dependency' | 'fix-attempt';
	}

	let clusters = $state<VectorCluster[]>([]);
	let selectedCluster = $state<VectorCluster | null>(null);
	let similarClusters = $state<VectorCluster[]>([]);
	let searchQuery = $state('');
	let searchResults = $state<VectorCluster[]>([]);
	let loading = $state(true);
	let detailsOpen = $state(false);
	let fixDialogOpen = $state(false);
	let agenticFixStatus = $state<string>('');

	// Graph visualization state
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let selectedNode = $state<GraphNode | null>(null);

	async function loadClusters() {
		try {
			loading = true;
			const response = await fetch('/api/phase89/clusters');
			if (!response.ok) throw new Error('Failed to load clusters');
			const data = await response.json();
			clusters = data.clusters || [];
			buildGraph(clusters);
		} catch (e) {
			console.error('Error loading clusters:', e);
		} finally {
			loading = false;
		}
	}

	function buildGraph(clusterData: VectorCluster[]) {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];

		// Create cluster nodes
		for (const cluster of clusterData) {
			nodes.push({
				id: `cluster-${cluster.cluster_id}`,
				label: cluster.pattern.substring(0, 30),
				type: 'cluster',
				cluster_id: cluster.cluster_id,
				tags: cluster.tags || []
			});

			for (const filePath of cluster.file_paths || []) {
				const fileId = `file-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
				if (!nodes.find((n) => n.id === fileId)) {
					nodes.push({
						id: fileId,
						label: filePath.split('/').pop() || filePath,
						type: 'file',
						tags: []
					});
				}

				edges.push({
					source: `cluster-${cluster.cluster_id}`,
					target:fileId,
					weight: cluster.avg_similarity || 0.5,
					type: 'similarity'
				});
			}
		}

		graphNodes = nodes;
		graphEdges = edges;
	}

	async function performVectorSearch() {
		if (!searchQuery.trim()) return;

		try {
			const response = await fetch('/api/phase89/vector-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
				query: searchQuery,
					limit: 10,
					threshold: 0.7
				})
			});

			if (!response.ok) throw new Error('Vector search failed');
			const data = await response.json();
			searchResults = data.results || [];
		} catch (e) {
			console.error('Search error:', e);
		}
	}

	async function findSimilarClusters(cluster: VectorCluster) {
		try {
			const response = await fetch('/api/phase89/similar-clusters', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
				cluster_id: cluster.cluster_id,
					embedding: cluster.embedding,
					limit: 5
				})
			});

			if (!response.ok) throw new Error('Failed to find similar clusters');
			const data = await response.json();
			similarClusters = data.similar || [];
		} catch (e) {
			console.error('Error finding similar clusters:', e);
		}
	}

	async function initiateAgenticFix(cluster: VectorCluster) {
		try {
			agenticFixStatus = 'Starting agentic fix pipeline...';
			fixDialogOpen = true;

			const response = await fetch('/api/phase89/agentic-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
					cluster_id: cluster.cluster_id,
					pattern: cluster.pattern,
					file_paths: cluster.file_paths,
					context: {
					summary: cluster.summary,
						tags: cluster.tags,
						similar_clusters: similarClusters.map((c) => c.pattern)
					}
				})
			});

            if (!response.body) throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                agenticFixStatus = text;
            }
        } catch (e) {
            console.error(e);
            agenticFixStatus = 'Error: ' + String(e);
        }
    }
</script>

<div class="codebase-graph">
    <!-- Graph visualization Placeholder -->
    <div class="graph-container">
        <h3>Graph Visualization</h3>
        <p>{graphNodes.length} nodes, {graphEdges.length} edges</p>

        <div class="nodes-list">
            {#each graphNodes.slice(0, 50) as node}
                <div class="node-item" class:cluster={node.type === 'cluster'}>
                    <span class="node-label">{node.label}</span>
                    <span class="node-type">{node.type}</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .codebase-graph { padding: 2rem;
		background: #0f0f1a;
        color: #e0e0e0;
        min-height: 100vh;
    }
    .graph-container {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.2);
    }
    .nodes-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.5rem;
        margin-top: 1rem;
    }
    .node-item { padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        font-size: 0.8rem;
    }
    .node-item.cluster {
        border-left: 3px solid #00d4ff;
    }
</style>
