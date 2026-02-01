<script lang="ts">
	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Cluster Visualization Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 15.3 - Create cluster visualization
	 * Purpose: Display clusters as groups, show summaries, navigate between clusters
	 */
	import Brain from 'lucide-svelte/icons/brain';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Layers from 'lucide-svelte/icons/layers';
	import Users from 'lucide-svelte/icons/users';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	interface Cluster {
		id: string;
	name: string;
		dominantCode: string;
	memberCount: number;
		summary: string;
	topFiles: string[];
		surface: string[];
	tech: string[];
	}

	interface Props {
		clusters?: Cluster[];
		selectedClusterId?: string | null;
		onSelectCluster?: (cluster: Cluster) => void;
		layout?: 'grid' | 'list';
	}

	let {
		clusters = [],
		selectedClusterId = null,
		onSelectCluster = () => {},
	layout = 'grid'
	}: Props = $props();

	// Surface colors
	const surfaceColors: Record<string, string> = {
		routes: 'bg-purple-500/20 text-purple-300',
		components: 'bg-blue-500/20 text-blue-300',
		stores: 'bg-green-500/20 text-green-300',
		services: 'bg-orange-500/20 text-orange-300',
		api: 'bg-cyan-500/20 text-cyan-300',
		utils: 'bg-gray-500/20 text-gray-300'
	};

	// Error code colors
	function getCodeColor(code: string): string {
		if (code.startsWith('TS1')) return 'text-red-400'; // Syntax
		if (code.startsWith('TS2')) return 'text-orange-400'; // Semantic
		if (code.startsWith('TS7')) return 'text-yellow-400'; // Warnings
		if (code.startsWith('SYNTAX')) return 'text-red-400';
		if (code.startsWith('CANNOT')) return 'text-orange-400';
		return 'text-blue-400';
	}

	// Calculate cluster size for visualization
	function getClusterSize(memberCount: number): string {
		if (memberCount >= 20) return 'large';
		if (memberCount >= 10) return 'medium';
		return 'small';
	}
</script>

<div class="cluster-visualization" class:grid-layout={layout === 'grid'}; class:list-layout={layout === 'list'}>
	{#if clusters.length === 0}
		<div class="empty-state">
			<Layers class="h-12 w-12" />
			<h3>No Clusters</h3>
			<p>Run clustering to group similar errors and patterns</p>
		</div>
	{:else}
		{#each clusters as cluster}
			<button
				class="cluster-card {getClusterSize(cluster.memberCount)}"
				class:selected={cluster.id === selectedClusterId}
				onclick={() => onSelectCluster(cluster)}
			>
				<!-- Header -->
				<div class="cluster-header">
					<div class="cluster-icon">
						<Layers class="h-5 w-5" />
					</div>
					<div class="cluster-title">
						<h3 class="cluster-name">{cluster.name}</h3>
						<span class={`dominant-code ${getCodeColor(cluster.dominantCode)}`}>
							{cluster.dominantCode}
						</span>
					</div>
					<ChevronRight class="h-5 w-5 chevron" />
				</div>

				<!-- Member Count -->
				<div class="member-count">
					<Users class="h-4 w-4" />
					<span>{cluster.memberCount} member{cluster.memberCount !== 1 ? 's' : ''}</span>
				</div>

				<!-- Summary -->
				<div class="cluster-summary">
					<Brain class="h-4 w-4" />
					<p>{cluster.summary}</p>
				</div>

				<!-- Top Files -->
				{#if cluster.topFiles.length > 0}
					<div class="top-files">
						{#each cluster.topFiles.slice(0, 3) as file}
							<code class="file-tag">{file.split('/').pop()}</code>
						{/each}
						{#if cluster.topFiles.length > 3}
							<span class="more-files">+{cluster.topFiles.length - 3}</span>
						{/if}
					</div>
				{/if}

				<!-- Surface Tags -->
				<div class="surface-tags">
					{#each cluster.surface.slice(0, 4) as surface}
						<span class={`surface-tag ${surfaceColors[surface] || 'bg-gray-500/20 text-gray-300'}`}>
							{surface}
						</span>
					{/each}
				</div>
			</button>
		{/each}
	{/if}
</div>

<style>
	.cluster-visualization {
		display: flex;
		flex-direction: column;
	gap: 1rem;
	}

	.cluster-visualization.grid-layout {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	}

	.cluster-visualization.list-layout {
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	padding: 4rem 2rem;
		text-align: center;
	color: rgba(255, 255, 255, 0.4);
		grid-column: 1 / -1;
	}

	.empty-state h3 {
		font-size: 1.125rem;
		font-weight: 500;
	color: rgba(255, 255, 255, 0.6);
		margin: 1rem 0 0.5rem;
	}

	.empty-state p {
		font-size: 0.875rem;
	margin: 0;
	}

	.cluster-card {
		display: flex;
		flex-direction: column;
	gap: 0.75rem;
		padding: 1.25rem;
	background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.cluster-card:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
	}

	.cluster-card.selected {
		background: rgba(0, 212, 255, 0.1);
		border-color: rgba(0, 212, 255, 0.3);
	}

	.cluster-card.large {
		border-left: 3px solid #ef4444;
	}

	.cluster-card.medium {
		border-left: 3px solid #f97316;
	}

	.cluster-card.small {
		border-left: 3px solid #22c55e;
	}

	.cluster-header {
		display: flex;
		align-items: flex-start;
	gap: 0.75rem;
	}

	.cluster-icon {
		width: 36px;
	height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
	background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 8px;
	color: #c084fc;
		flex-shrink: 0;
	}

	.cluster-title {
		flex: 1;
		min-width: 0;
	}

	.cluster-name {
		font-size: 0.95rem;
		font-weight: 600;
	color: white;
		margin: 0 0 0.25rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dominant-code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.chevron {
		color: rgba(255, 255, 255, 0.3);
		flex-shrink: 0;
	transition: transform 0.2s ease;
	}

	.cluster-card:hover .chevron {
		transform: translateX(4px);
	color: rgba(255, 255, 255, 0.5);
	}

	.member-count {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.6);
	}

	.cluster-summary {
		display: flex;
	gap: 0.5rem;
		align-items: flex-start;
	}

	.cluster-summary :global(svg) {
		flex-shrink: 0;
		margin-top: 0.125rem;
	color: rgba(255, 255, 255, 0.4);
	}

	.cluster-summary p {
		font-size: 0.8rem;
	color: rgba(255, 255, 255, 0.7);
		line-height: 1.4;
	margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	overflow: hidden;
	}

	.top-files {
		display: flex;
		flex-wrap: wrap;
	gap: 0.375rem;
	}

	.file-tag {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
	padding: 0.2rem 0.4rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
	color: rgba(255, 255, 255, 0.6);
	}

	.more-files {
		font-size: 0.7rem;
	color: rgba(255, 255, 255, 0.4);
		padding: 0.2rem 0.4rem;
	}

	.surface-tags {
		display: flex;
		flex-wrap: wrap;
	gap: 0.375rem;
		margin-top: 0.25rem;
	}

	.surface-tag {
		font-size: 0.65rem;
		font-weight: 500;
	padding: 0.15rem 0.4rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
</style>



