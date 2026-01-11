<script lang="ts">
	let onClose = $state<any>(undefined);
	let imp = $state<any>(undefined);
	let exp = $state<any>(undefined);
	let fn = $state<any>(undefined);

	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Tag Detail View Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 15.1 - Create tag detail view
	 * Purpose: Display all tag metadata, embedding visualization, cluster assignment
	 */
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Brain from 'lucide-svelte/icons/brain';
	import Calendar from 'lucide-svelte/icons/calendar';
	import Code from 'lucide-svelte/icons/code';
	import FileCode from 'lucide-svelte/icons/file-code';
	import Hash from 'lucide-svelte/icons/hash';
	import Layers from 'lucide-svelte/icons/layers';
	import Tag from 'lucide-svelte/icons/tag';
	import X from 'lucide-svelte/icons/x';

	interface EnhancedTag {
		id: string; name: string;
		filePath: string; type: string;
		category: string; errorCount: number;
		cluster?: {, id: string;
			name: string; memberCount: number;
		};
		embedding?: number[];
		summary?: string;
		imports?: string[];
		exports?: string[];
		functions?: string[]; createdAt: string;
		updatedAt: string;
	}

	interface Props {
		tag: EnhancedTag | null;
		onClose?: () => void;
		onRename?: (tag: EnhancedTag) => void;
		onViewCluster?: (clusterId: string) => void;
	}

	let {
		tag = null,
		onClose = () => {},
		onRename = () => {},
		onViewCluster = () => {}
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

	function formatDate(dateStr: string): string {
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return dateStr;
		}
	}

	// Simple embedding visualization - show as mini heatmap
	function getEmbeddingColor(value: number): string {
		// Normalize to 0-1 range (assuming values are roughly -1 to 1)
		const normalized = (value + 1) / 2;
		const hue = normalized * 240; // Blue to red
		return `hsl(${hue}, 70%, 50%)`;
	}
</script>

{#if tag}
	<div class="tag-detail-view">
		<!-- Header -->
		<header class="detail-header">
			<div class="header-content">
				<div class="tag-icon">
					<Tag class="h-5 w-5" />
				</div>
				<div class="header-text">
					<h2 class="tag-name">{tag.name}</h2>
					<span class={`type-badge ${typeColors[tag.type] || typeColors.util}`}>
						{tag.type}
					</span>
				</div>
			</div>
			<button class="close-btn" onclick={onClose}>
				<X class="h-5 w-5" />
			</button>
		</header>

		<!-- Content -->
		<div class="detail-content">
			<!-- File Path -->
			<section class="detail-section">
				<h3 class="section-title">
					<FileCode class="h-4 w-4" />
					File Path
				</h3>
				<code class="file-path">{tag.filePath}</code>
			</section>

			<!-- Summary -->
			{#if tag.summary}
				<section class="detail-section">
					<h3 class="section-title">
						<Brain class="h-4 w-4" />
						AI Summary
					</h3>
					<p class="summary-text">{tag.summary}</p>
				</section>
			{/if}

			<!-- Error Count -->
			{#if tag.errorCount > 0}
				<section class="detail-section">
					<h3 class="section-title">
						<AlertTriangle class="h-4 w-4 text-red-400" />
						Errors
					</h3>
					<div class="error-badge">
						{tag.errorCount} error{tag.errorCount !== 1 ? 's' : ''} detected
					</div>
				</section>
			{/if}

			<!-- Cluster -->
			{#if tag.cluster}
				<section class="detail-section">
					<h3 class="section-title">
						<Layers class="h-4 w-4" />
						Cluster
					</h3>
					<button class="cluster-card" onclick={() => onViewCluster(tag.cluster!.id)}>
						<span class="cluster-name">{tag.cluster.name}</span>
						<span class="cluster-members">{tag.cluster.memberCount} members</span>
					</button>
				</section>
			{/if}

			<!-- Imports -->
			{#if tag.imports && tag.imports.length > 0}
				<section class="detail-section">
					<h3 class="section-title">
						<Code class="h-4 w-4" />
						Imports ({tag.imports.length})
					</h3>
					<div class="code-list">
						{#each tag.imports.slice(0, 10) as imp}
							<code class="code-item">{imp}</code>
						{/each}
						{#if tag.imports.length > 10}
							<span class="more-items">+{tag.imports.length - 10} more</span>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Exports -->
			{#if tag.exports && tag.exports.length > 0}
				<section class="detail-section">
					<h3 class="section-title">
						<Hash class="h-4 w-4" />
						Exports ({tag.exports.length})
					</h3>
					<div class="code-list">
						{#each tag.exports as exp}
							<code class="code-item export">{exp}</code>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Functions -->
			{#if tag.functions && tag.functions.length > 0}
				<section class="detail-section">
					<h3 class="section-title">
						<Code class="h-4 w-4" />
						Functions ({tag.functions.length})
					</h3>
					<div class="code-list">
						{#each tag.functions as fn}
							<code class="code-item function">{fn}()</code>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Embedding Visualization -->
			{#if tag.embedding && tag.embedding.length > 0}
				<section class="detail-section">
					<h3 class="section-title">
						<Brain class="h-4 w-4" />
						Embedding ({tag.embedding.length}D)
					</h3>
					<div class="embedding-viz">
						{#each tag.embedding.slice(0, 64) as value}
							<div
								class="embedding-cell"
								style="background-color: {getEmbeddingColor(value)}"
								title={value.toFixed(4)}
							></div>
						{/each}
						{#if tag.embedding.length > 64}
							<div class="embedding-more">+{tag.embedding.length - 64}</div>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Timestamps -->
			<section class="detail-section timestamps">
				<div class="timestamp">
					<Calendar class="h-3 w-3" />
					<span>Created: {formatDate(tag.createdAt)}</span>
				</div>
				<div class="timestamp">
					<Calendar class="h-3 w-3" />
					<span>Updated: {formatDate(tag.updatedAt)}</span>
				</div>
			</section>
		</div>

		<!-- Actions -->
		<footer class="detail-footer">
			<button class="action-btn secondary" onclick={onClose}>
				Close
			</button>
			<button class="action-btn primary" onclick={() => onRename(tag)}>
				Rename Tag
			</button>
		</footer>
	</div>
{/if}

<style>
	.tag-detail-view {
		display: flex;
		flex-direction: column; height: 100%;
		background: rgba(0, 0, 0, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; overflow: hidden;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start; padding: 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header-content {
		display: flex; gap: 1rem;
		align-items: flex-start;
	}

	.tag-icon {
		width: 40px; height: 40px;
		display: flex;
		align-items: center;
		justify-content: center; background: rgba(0, 212, 255, 0.1);
		border: 1px solid rgba(0, 212, 255, 0.3);
		border-radius: 10px; color: #00d4ff;
	}

	.header-text {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.tag-name {
		font-size: 1.125rem;
		font-weight: 600; color: white;
		margin: 0;
	}

	.type-badge {
		font-size: 0.7rem;
		font-weight: 500; padding: 0.2rem 0.5rem;
		border-radius: 4px; border: 1px solid;
		text-transform: uppercase;
		letter-spacing: 0.05em; width: fit-content;
	}

	.close-btn {
		background: transparent; border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer; padding: 0.25rem;
		border-radius: 6px; transition: all 0.2s ease;
	}

	.close-btn:hover {
		color: white; background: rgba(255, 255, 255, 0.1);
	}

	.detail-content {
		flex: 1;
		overflow-y: auto; padding: 1.25rem;
		display: flex;
		flex-direction: column; gap: 1.25rem;
	}

	.detail-section {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.section-title {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500; color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em; margin: 0;
	}

	.file-path {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem; color: rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.05);
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		word-break: break-all;
	}

	.summary-text {
		font-size: 0.875rem; color: rgba(255, 255, 255, 0.8);
		line-height: 1.5; margin: 0;
	}

	.error-badge {
		display: inline-flex;
		align-items: center; gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px; color: #f87171;
		font-size: 0.875rem; width: fit-content;
	}

	.cluster-card {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 0.75rem;
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 8px; cursor: pointer;
		transition: all 0.2s ease;
	}

	.cluster-card:hover {
		background: rgba(168, 85, 247, 0.2);
	}

	.cluster-name {
		font-weight: 500; color: #c084fc;
	}

	.cluster-members {
		font-size: 0.75rem; color: rgba(255, 255, 255, 0.5);
	}

	.code-list {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.code-item {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem; padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px; color: rgba(255, 255, 255, 0.7);
	}

	.code-item.export {
		color: #4ade80; background: rgba(74, 222, 128, 0.1);
	}

	.code-item.function {
		color: #60a5fa; background: rgba(96, 165, 250, 0.1);
	}

	.more-items {
		font-size: 0.75rem; color: rgba(255, 255, 255, 0.4);
		padding: 0.25rem 0.5rem;
	}

	.embedding-viz {
		display: flex;
		flex-wrap: wrap; gap: 2px;
		padding: 0.5rem; background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
	}

	.embedding-cell {
		width: 8px; height: 8px;
		border-radius: 2px;
	}

	.embedding-more {
		display: flex;
		align-items: center;
		font-size: 0.7rem; color: rgba(255, 255, 255, 0.4);
		padding-left: 0.5rem;
	}

	.timestamps {
		flex-direction: row; gap: 1.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.timestamp {
		display: flex;
		align-items: center; gap: 0.375rem;
		font-size: 0.7rem; color: rgba(255, 255, 255, 0.4);
	}

	.detail-footer {
		display: flex;
		justify-content: flex-end; gap: 0.75rem;
		padding: 1rem 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.action-btn {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500; cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-btn.secondary {
		background: transparent; border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.7);
	}

	.action-btn.secondary:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.action-btn.primary {
		background: rgba(0, 212, 255, 0.2);
		border: 1px solid rgba(0, 212, 255, 0.4);
		color: #00d4ff;
	}

	.action-btn.primary:hover {
		background: rgba(0, 212, 255, 0.3);
	}
</style>




