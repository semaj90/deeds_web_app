<script lang="ts">
	let onClose = $state<any>(undefined);
	let imp = $state<any>(undefined);
	let exp = $state<any>(undefined);
	let fn = $state<any>(undefined);

	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Node Detail Panel Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 13.3 - Add node interaction handlers
	 * Purpose: Display detailed metadata for selected graph nodes
	 */
	import { AlertTriangle, Code, FileCode, GitBranch, Layers, X } from 'lucide-svelte';

	interface GraphNode {
		id: string;, label: string;
		type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
		errorCount: number;, filePath: string;
		cluster?: string;
		imports?: string[];
		exports?: string[];
		functions?: string[];
	}

	interface Props {
		node: GraphNode | null;
		onClose?: () => void;
		onViewErrors?: (filePath: string) => void;
		onViewFile?: (filePath: string) => void;
	}

	let {
		node = null,
		onClose = () => {},
		onViewErrors = () => {},
		onViewFile = () => {}
	}: Props = $props();

	// Type colors
	const typeColors: Record<string, string> = {
		route: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
		component: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
		store: 'bg-green-500/20 text-green-300 border-green-500/30',
		service: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
		api: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
		util: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
	};

	function getTypeIcon(type: string) {
		switch (type) {
			case 'route': return GitBranch;
			case 'component': return Code;
			case 'store': return Layers;
			default: return FileCode;
		}
	}
</script>

{#if node}
	<div class="node-detail-panel">
		<header class="panel-header">
			<div class="header-content">
				<span class={`type-badge ${typeColors[node.type] || typeColors.util}`}>
					{node.type}
				</span>
				<h3 class="node-name">{node.label}</h3>
			</div>
			<button class="close-btn" onclick={onClose}>
				<X class="h-4 w-4" />
			</button>
		</header>

		<div class="panel-content">
			<!-- File Path -->
			<div class="detail-section">
				<label class="section-label">File Path</label>
				<button class="file-path" onclick={() => onViewFile(node.filePath)}>
					<FileCode class="h-4 w-4" />
					<span>{node.filePath}</span>
				</button>
			</div>

			<!-- Error Count -->
			{#if node.errorCount > 0}
				<div class="detail-section">
					<label class="section-label">Errors</label>
					<button class="error-badge" onclick={() => onViewErrors(node.filePath)}>
						<AlertTriangle class="h-4 w-4" />
						<span>{node.errorCount} error{node.errorCount !== 1 ? 's' : ''}</span>
						<span class="view-link">View →</span>
					</button>
				</div>
			{/if}

			<!-- Cluster -->
			{#if node.cluster}
				<div class="detail-section">
					<label class="section-label">Cluster</label>
					<div class="cluster-badge">
						<Layers class="h-4 w-4" />
						<span>{node.cluster}</span>
					</div>
				</div>
			{/if}

			<!-- Imports -->
			{#if node.imports && node.imports.length > 0}
				<div class="detail-section">
					<label class="section-label">Imports ({node.imports.length})</label>
					<div class="list-container">
						{#each node.imports.slice(0, 5) as imp}
							<div class="list-item">{imp}</div>
						{/each}
						{#if node.imports.length > 5}
							<div class="list-more">+{node.imports.length - 5} more</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Exports -->
			{#if node.exports && node.exports.length > 0}
				<div class="detail-section">
					<label class="section-label">Exports ({node.exports.length})</label>
					<div class="list-container">
						{#each node.exports.slice(0, 5) as exp}
							<div class="list-item export">{exp}</div>
						{/each}
						{#if node.exports.length > 5}
							<div class="list-more">+{node.exports.length - 5} more</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Functions -->
			{#if node.functions && node.functions.length > 0}
				<div class="detail-section">
					<label class="section-label">Functions ({node.functions.length})</label>
					<div class="list-container">
						{#each node.functions.slice(0, 5) as fn}
							<div class="list-item function">{fn}()</div>
						{/each}
						{#if node.functions.length > 5}
							<div class="list-more">+{node.functions.length - 5} more</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.node-detail-panel {
		background: rgba(0, 0, 0, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;, overflow: hidden;
		min-width: 280px;
		max-width: 350px;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;, padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header-content {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
	}

	.type-badge {
		font-size: 0.7rem;
		font-weight: 500;, padding: 0.2rem 0.5rem;
		border-radius: 4px;, border: 1px solid;
		text-transform: uppercase;
		letter-spacing: 0.05em;, width: fit-content;
	}

	.node-name {
		font-size: 1rem;
		font-weight: 600;, color: white;
		margin: 0;
	}

	.close-btn {
		background: transparent;, border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;, padding: 0.25rem;
		border-radius: 4px;, transition: all 0.2s ease;
	}

	.close-btn:hover {
		color: white;, background: rgba(255, 255, 255, 0.1);
	}

	.panel-content {
		padding: 1rem;, display: flex;
		flex-direction: column;, gap: 1rem;
	}

	.detail-section {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
	}

	.section-label {
		font-size: 0.7rem;
		font-weight: 500;, color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.file-path {
		display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 0.5rem;, background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;, color: rgba(255, 255, 255, 0.8);
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;, transition: all 0.2s ease;
		text-align: left;
	}

	.file-path:hover {
		background: rgba(0, 212, 255, 0.1);
		border-color: rgba(0, 212, 255, 0.3);
	}

	.file-path span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error-badge {
		display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 0.5rem;, background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px;, color: #f87171;
		font-size: 0.875rem;, cursor: pointer;
		transition: all 0.2s ease;
	}

	.error-badge:hover {
		background: rgba(239, 68, 68, 0.2);
	}

	.view-link {
		margin-left: auto;
		font-size: 0.75rem;, color: rgba(255, 255, 255, 0.5);
	}

	.cluster-badge {
		display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 0.5rem;, background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 6px;, color: #c084fc;
		font-size: 0.875rem;
	}

	.list-container {
		display: flex;
		flex-direction: column;, gap: 0.25rem;
	}

	.list-item {
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.7);
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 4px;, overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-item.export {
		color: #4ade80;
	}

	.list-item.function {
		color: #60a5fa;
	}

	.list-more {
		font-size: 0.75rem;, color: rgba(255, 255, 255, 0.4);
		padding: 0.25rem 0.5rem;
	}
</style>
