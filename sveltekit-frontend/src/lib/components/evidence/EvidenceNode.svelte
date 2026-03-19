<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	type EvidenceNodeType = { id: string, x: number;
	y: number;
		evidenceType: string;
	title: string;
	confidence?: number;
	description?: string;
	metadata?: Record<string, any>;
	};

	let {
	node,
	isSelected = false,
	isHighlighted = false,
	isPendingLinkSource = false,
	linkMode = false,
	onSelect,
	onMove,
	onLink,
	onDragStart,
	onDragEnd
	}: {
		node: EvidenceNodeType;
	isSelected?: boolean;
	isHighlighted?: boolean;
	isPendingLinkSource?: boolean;
	linkMode?: boolean;
		onSelect: (data: { nodeId: string, multiSelect: boolean }) => void;
	onMove: (data: { nodeId: string, x: number, y: number }) => void;
	onLink?: (data: { nodeId: string }) => void;
	onDragStart?: (data: { nodeId: string, x: number, y: number }) => void;
	onDragEnd?: (data: { nodeId: string, x: number, y: number }) => void;
	} = $props();

	let isDragging = $state(false);
	let dragStart = $state({ x: 0, y: 0 });
	let element: HTMLElement;

	function handleMouseDown(event: MouseEvent) {
	if (event.button !== 0) return;

	isDragging = true;
	dragStart = { x: event.clientX - node.x, y: event.clientY - node.y };

	onDragStart?.({ nodeId: node.id, x: node.x, y: node.y });
	onSelect({
	nodeId: node.id,
	multiSelect: event.ctrlKey || event.metaKey,
	});

	event.preventDefault();
	}

	function handleMouseMove(event: MouseEvent) {
	if (!isDragging) return;

	const newX = event.clientX - dragStart.x;
	const newY = event.clientY - dragStart.y;

	onMove({
	nodeId: node.id,
	x: newX,
	y: newY,
	});
	}

	function handleMouseUp() {
	if (isDragging) {
		onDragEnd?.({ nodeId: node.id, x: node.x, y: node.y });
	}
	isDragging = false;
	}

	function getNodeTypeColor(evidenceType: string): string {
	const colors: Record<string, string> = {
	audio: '#3b82f6',
	video: '#10b981',
	document: '#f59e0b',
	photo: '#ef4444',
	physical: '#8b5cf6',
	digital: '#06b6d4',
	witness_statement: '#ec4899',
	forensic: '#14b8a6',
	other: '#6b7280',
	};
	return colors[evidenceType] ?? colors.other;
	}

	function getNodeTypeIcon(evidenceType: string): string {
	const icons: Record<string, string> = {
	audio: 'headphones',
	video: 'video',
	document: 'file-text',
	photo: 'camera',
	physical: 'package',
	digital: 'monitor',
	witness_statement: 'eye',
	forensic: 'microscope',
	other: 'life-buoy',
	};
	return icons[evidenceType] ?? icons.other;
	}
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<!-- Node Element -->
<div
	bind:this={element}
	class="retro-node"
	class:selected={isSelected}
	class:highlighted={isHighlighted}
	class:pending-link={isPendingLinkSource}
	class:dragging={isDragging}
	role="button"
	tabindex="0"
	style="
	left: {node.x}px;
	top: {node.y}px;
	--node-color: {getNodeTypeColor(node.evidenceType)};
	"
	onmousedown={handleMouseDown}
>
	<!-- Node Header -->
	<div class="node-header">
		<div class="header-row">
			<span class="node-icon">
				<Icon name={getNodeTypeIcon(node.evidenceType)} size={14} />
			</span>
			<span class="node-type-tag" style="color: {getNodeTypeColor(node.evidenceType)}">[{node.evidenceType.toUpperCase()}]</span>
			{#if node.confidence}
				<span class="confidence-val" style="color: {node.confidence >= 0.7 ? '#80ff80' : node.confidence >= 0.4 ? '#ffc040' : '#ff6040'}">
					{Math.round(node.confidence * 100)}%
				</span>
			{/if}
		</div>
		<div class="node-title">{node.title}</div>
	</div>

	<!-- Node Content -->
	<div class="node-content">
		{#if node.description}
			<p class="node-desc">{node.description}</p>
		{/if}

		{#if node.metadata && Object.keys(node.metadata).length > 0}
			<div class="node-meta">
				{#each Object.entries(node.metadata) as [key, value]}
					<div class="meta-row">
						<span class="meta-key">{key}:</span>
						<span class="meta-val">{value}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Node Actions -->
	<div class="node-actions">
		{#if linkMode}
			<button
				class="action-btn"
				class:active-link={isPendingLinkSource}
				onclick={() => onLink?.({ nodeId: node.id })}
			>
				<Icon name="link" size={12} />
				{isPendingLinkSource ? 'SOURCE' : 'LINK'}
			</button>
		{:else}
			<button class="action-btn" onclick={() => onSelect({ nodeId: node.id, multiSelect: false })}>
				<Icon name="search" size={12} />
				INSPECT
			</button>
		{/if}
	</div>

	<!-- Color stripe at bottom -->
	<div class="node-stripe" style="background: {getNodeTypeColor(node.evidenceType)}"></div>
</div>

<style>
	.retro-node {
		position: absolute;
		min-width: 200px;
		max-width: 280px;
		background: #3a3832;
		border: 2px solid #5a5848;
		cursor: move;
		user-select: none;
		z-index: 10;
		font-family: "Courier New", monospace;
		box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.25);
		transition: box-shadow 0.15s;
	}

	.retro-node:hover {
		border-color: #7a7860;
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.3);
	}

	.retro-node.selected {
		border-color: #c0b870;
		box-shadow: 0 0 0 2px rgba(192, 184, 112, 0.3), 3px 3px 0 rgba(0, 0, 0, 0.25);
	}

	.retro-node.highlighted {
		border-color: #60a5fa;
		box-shadow: 0 0 12px rgba(96, 165, 250, 0.5), 3px 3px 0 rgba(0, 0, 0, 0.25);
		animation: pulse-highlight 2s infinite;
	}

	.retro-node.pending-link {
		border-color: #c04040;
		box-shadow: 0 0 0 2px rgba(192, 64, 64, 0.3), 3px 3px 0 rgba(0, 0, 0, 0.25);
		animation: pulse-link 2s infinite;
	}

	.retro-node.dragging {
		opacity: 0.85;
		z-index: 100;
		box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.35);
	}

	/* Header */
	.node-header {
		padding: 8px 10px 6px;
		border-bottom: 1px solid #4a4838;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.node-icon {
		color: #8a8870;
	}

	.node-type-tag {
		font-size: 0.55rem;
		letter-spacing: 1px;
		text-transform: uppercase;
	}

	.confidence-val {
		margin-left: auto;
		font-size: 0.65rem;
		font-weight: 700;
	}

	.node-title {
		font-size: 0.75rem;
		color: #e8e4c8;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Content */
	.node-content {
		padding: 6px 10px;
	}

	.node-desc {
		margin: 0 0 4px 0;
		font-size: 0.65rem;
		color: #9a9880;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.node-meta {
		border-top: 1px solid #4a4838;
		padding-top: 4px;
		margin-top: 4px;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.6rem;
		margin-bottom: 2px;
	}

	.meta-key {
		color: #7a7860;
	}

	.meta-val {
		color: #b8b49a;
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Actions */
	.node-actions {
		padding: 5px 10px;
		border-top: 1px solid #4a4838;
		display: flex;
		justify-content: flex-end;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		font-family: "Courier New", monospace;
		font-size: 0.55rem;
		letter-spacing: 0.5px;
		background: #4a4838;
		border: 1px solid #5a5848;
		color: #b8b49a;
		cursor: pointer;
		text-transform: uppercase;
	}
	.action-btn:hover {
		background: #5a5848;
		color: #e8e4c8;
	}
	.action-btn.active-link {
		background: #5a2020;
		border-color: #8a2020;
		color: #ffa0a0;
	}

	/* Bottom color stripe */
	.node-stripe {
		height: 3px;
		width: 100%;
	}

	@keyframes pulse-link {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	@keyframes pulse-highlight {
		0%, 100% { box-shadow: 0 0 12px rgba(96, 165, 250, 0.5), 3px 3px 0 rgba(0, 0, 0, 0.25); }
		50% { box-shadow: 0 0 20px rgba(96, 165, 250, 0.8), 3px 3px 0 rgba(0, 0, 0, 0.25); }
	}
</style>