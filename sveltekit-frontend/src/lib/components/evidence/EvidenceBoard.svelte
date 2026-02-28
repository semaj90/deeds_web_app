<script lang="ts">

	import Icon from '$lib/components/ui/Icon.svelte';
	import EvidenceConnections from './EvidenceConnections.svelte';
	import EvidenceNode from './EvidenceNode.svelte';
	import RelationshipInspector from './RelationshipInspector.svelte';
	import BoardSearchOverlay from './BoardSearchOverlay.svelte';
	import BoardMinimap from './BoardMinimap.svelte';
	import { boardHistory, createMoveCommand, createBulkMoveCommand, createDeleteNodeCommand, createAddConnectionCommand, createDeleteConnectionCommand } from './board-history.svelte.js';
	import { loadLayout, scheduleSave, flushSave, type BoardLayout } from './board-persistence.svelte.js';

	// Define types locally to avoid importing server schema in browser
	type EvidenceNodeType = { id: string, caseId: string;
	title: string;
	description?: string;
		evidenceType: string;
	fileType?: string;
	fileName?: string;
	fileUrl?: string;
		canvasPosition: { x: number; y: number };
	uploadedBy?: number;
		uploadedAt: string;
	updatedAt: string;
		x: number;
	y: number };

	type EvidenceConnection = { id: string, caseId: string;
	fromEvidenceId: string;
		toEvidenceId: string;
	connectionType: string;
	label?: string;
	notes?: string;
		strength: number;
	isVisible: boolean;
	createdBy?: number;
		createdAt: string;
	updatedAt: string };
	type BoardMode = 'grid' | 'free' | 'magnetic';

	let { caseId, initialNodes = [], initialConnections = [] }: {
		caseId: string;
	initialNodes?: EvidenceNodeType[];
	initialConnections?: EvidenceConnection[]
	} = $props();

	// Board state — Svelte 5 runes (no writable stores)
	let nodes = $state<EvidenceNodeType[]>(initialNodes);
	let connections = $state<EvidenceConnection[]>(initialConnections);
	let boardMode = $state<BoardMode>('grid');
	let linkMode = $state(false);
	let selectedNodes = $state<Set<string>>(new Set());
	let pendingLinkSource: string | null = $state(null);
	let selectedEvidenceForInspector = $state<string | null>(null);
	let selectedRelationshipType = $state('supports');
	let activeCaseId = $state<string | null>(caseId ?? null);
	let showCategories = $state(true);

	// ── Viewport state (zoom/pan) ──────────────────────────────
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });

	// ── Selection rectangle ────────────────────────────────────
	let selectionRect = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
	let isSelecting = $state(false);

	// ── Search + Minimap ───────────────────────────────────────
	let showSearch = $state(false);
	let showMinimap = $state(true);
	let highlightedNodes = $state<Set<string>>(new Set());

	// ── Drag tracking for undo ─────────────────────────────────
	let dragStartPositions = $state<Map<string, { x: number; y: number }>>(new Map());

	// ── Debounced PATCH ────────────────────────────────────────
	let patchTimers = new Map<string, ReturnType<typeof setTimeout>>();

	// Relationship types for the selector
	const relationshipTypes = [
	{ value: 'supports', label: 'Supports' },
		{ value: 'contradicts', label: 'Contradicts' },
		{ value: 'same_person', label: 'Same Person' },
		{ value: 'timeline', label: 'Timeline' },
		{ value: 'chain_of_custody', label: 'Chain of Custody' },
		{ value: 'corroborates', label: 'Corroborates' },
		{ value: 'alibi', label: 'Alibi' },
		{ value: 'motive', label: 'Motive' },
		{ value: 'opportunity', label: 'Opportunity' },
		{ value: 'means', label: 'Means' },
		{ value: 'witness_statement', label: 'Witness Statement' },
		{ value: 'physical_evidence', label: 'Physical Evidence' },
		{ value: 'digital_evidence', label: 'Digital Evidence' },
		{ value: 'circumstantial', label: 'Circumstantial' },
		{ value: 'direct_evidence', label: 'Direct Evidence' },
		{ value: 'hearsay', label: 'Hearsay' },
		{ value: 'privileged', label: 'Privileged' },
		{ value: 'inadmissible', label: 'Inadmissible' }
	];

	// Category summary from nodes
	let categoryStats = $derived.by(() => {
		const stats = new Map<string, number>();
		for (const node of nodes) {
			const type = node.evidenceType || 'other';
			stats.set(type, (stats.get(type) ?? 0) + 1);
		}
		return Array.from(stats.entries()).map(([type, count]) => ({ type, count }));
	});

	function getCategoryColor(type: string): string {
		const colors: Record<string, string> = {
			document: '#f59e0b',
			photo: '#ef4444',
			video: '#10b981',
			audio: '#3b82f6',
			physical: '#8b5cf6',
			digital: '#06b6d4',
			witness_statement: '#ec4899',
			forensic: '#14b8a6',
			other: '#6b7280',
		};
		return colors[type] ?? colors.other;
	}

	function getCategoryLabel(type: string): string {
		const labels: Record<string, string> = {
			document: 'Document',
			photo: 'Photo',
			video: 'Video',
			audio: 'Audio',
			physical: 'Physical',
			digital: 'Digital',
			witness_statement: 'Witness',
			forensic: 'Forensic',
			other: 'Other',
		};
		return labels[type] ?? type;
	}

	// Grid snapping
	const GRID_SIZE = 50;
	function snapToGrid(x: number, y: number): { x: number, y: number } {
	return {
	x: Math.round(x / GRID_SIZE) * GRID_SIZE,
	y: Math.round(y / GRID_SIZE) * GRID_SIZE,
	};
	}

	// Magnetic mode physics
	async function applyMagneticForces() {
	try {
	const response = await fetch('/api/evidence/ai/magnetize', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
	nodes, connections,
	caseId,
	}),
	});

	const { forces } = await response.json();

	nodes = nodes.map(node => {
	const force = forces.find((f: any) => f.id === node.id);
	if (force) {
	return {
	...node,
	x: node.x + force.dx,
	y: node.y + force.dy,
	};
	}
	return node;
	});
	notifyMutation();
	} catch (error) {
	console.error('Failed to apply magnetic forces:', error);
	}
	}

	// Node selection
	function selectNode(nodeId: string, multiSelect: boolean = false) {
	const newSelection = new Set(selectedNodes);
	if (multiSelect) {
	if (newSelection.has(nodeId)) {
	newSelection.delete(nodeId);
	} else {
	newSelection.add(nodeId);
	}
	} else {
	newSelection.clear();
	newSelection.add(nodeId);
	}
	selectedNodes = newSelection;

	if (!multiSelect) {
	selectedEvidenceForInspector = nodeId;
	}
	}

	// ── Viewport-aware move (accounts for zoom/pan) ────────────
	function applyNodePosition(nodeId: string, x: number, y: number) {
		nodes = nodes.map(n => n.id === nodeId ? { ...n, x, y } : n);
	}

	// Node movement (debounced PATCH)
	function moveNode(nodeId: string, newX: number, newY: number) {
	if (boardMode === 'grid') {
	const snapped = snapToGrid(newX, newY);
	newX = snapped.x;
	newY = snapped.y;
	}

	applyNodePosition(nodeId, newX, newY);

	// Debounced PATCH to server (2s)
	if (patchTimers.has(nodeId)) clearTimeout(patchTimers.get(nodeId)!);
	patchTimers.set(nodeId, setTimeout(() => {
		fetch(`/api/evidence/nodes/${nodeId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ x: newX, y: newY }),
		});
		patchTimers.delete(nodeId);
	}, 2000));
	}

	// ── Drag callbacks for undo ────────────────────────────────
	function handleNodeDragStart(data: { nodeId: string; x: number; y: number }) {
		const newMap = new Map(dragStartPositions);
		newMap.set(data.nodeId, { x: data.x, y: data.y });
		dragStartPositions = newMap;
	}

	function handleNodeDragEnd(data: { nodeId: string; x: number; y: number }) {
		const startPos = dragStartPositions.get(data.nodeId);
		if (startPos && (startPos.x !== data.x || startPos.y !== data.y)) {
			boardHistory.push(createMoveCommand(
				data.nodeId, startPos.x, startPos.y, data.x, data.y,
				applyNodePosition
			));
			notifyMutation();
		}
		const newMap = new Map(dragStartPositions);
		newMap.delete(data.nodeId);
		dragStartPositions = newMap;
	}

	// Create connection between selected nodes
	async function createConnection() {
	const selected = Array.from(selectedNodes);
	if (selected.length === 2) {
	try {
	const response = await fetch('/api/evidence/connections', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
	fromNodeId: selected[0],
	toNodeId: selected[1],
	caseId,
	strength: 0.5,
	}),
	});

	const newConnection = await response.json();
	connections = [...connections, newConnection];
	boardHistory.push(createAddConnectionCommand(
		newConnection,
		(c: any) => { connections = [...connections, c]; },
		(id: string) => { connections = connections.filter(c => c.id !== id); }
	));
	selectedNodes = new Set();
	notifyMutation();
	} catch (error) {
	console.error('Failed to create connection:', error);
	}
	}
	}

	// Create relationship between evidence items
	async function createRelationship(fromEvidenceId: string, toEvidenceId: string, relationshipType: string = selectedRelationshipType) {
	try {
	const response = await fetch('/api/evidence/relationships', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
	caseId,
	fromEvidenceId,
	toEvidenceId,
	relationshipType,
	strength: 'medium',
	label: relationshipType.replace('_', ' ')
	}),
	});

	if (response.ok) {
	const newRelationship = await response.json();
	console.log('Relationship created:', newRelationship);
	pendingLinkSource = null;
	} else {
	const error = await response.json();
	console.error('Failed to create relationship:', error);
	}
	} catch (error) {
	console.error('Error creating relationship:', error);
	}
	}

	// Handle link mode node selection
	function handleLinkClick(nodeId: string) {
	if (!linkMode) return;

	if (!pendingLinkSource) {
	pendingLinkSource = nodeId;
	selectNode(nodeId, false);
	} else if (pendingLinkSource === nodeId) {
	pendingLinkSource = null;
	selectedNodes = new Set();
	} else {
	createRelationship(pendingLinkSource, nodeId);
	selectedNodes = new Set();
	}
	}

	// Delete selected nodes (with undo)
	async function deleteSelectedNodes() {
	const selected = Array.from(selectedNodes);
	const deletedNodes = nodes.filter(n => selected.includes(n.id));

	for (const node of deletedNodes) {
		boardHistory.push(createDeleteNodeCommand(
			node,
			(n: any) => { nodes = [...nodes, n]; },
			(id: string) => { nodes = nodes.filter(nd => nd.id !== id); }
		));
	}

	for (const nodeId of selected) {
	try {
	await fetch(`/api/evidence/nodes/${nodeId}`, { method: 'DELETE' });
	} catch (error) {
	console.error('Failed to delete node:', error);
	}
	}

	nodes = nodes.filter(node => !selected.includes(node.id));
	selectedNodes = new Set();
	notifyMutation();
	}

	// Mode change handler
	function changeMode(newMode: BoardMode) {
	boardMode = newMode;
	if (newMode === 'magnetic') {
	applyMagneticForces();
	}
	}

	// ── Zoom handlers ──────────────────────────────────────────
	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const delta = event.deltaY > 0 ? -0.1 : 0.1;
		const newZoom = Math.max(0.1, Math.min(3, zoom + delta));

		// Zoom toward cursor position
		const rect = canvasElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		const scaleChange = newZoom / zoom;
		panX = mouseX - (mouseX - panX) * scaleChange;
		panY = mouseY - (mouseY - panY) * scaleChange;
		zoom = newZoom;
	}

	function zoomIn() { zoom = Math.min(3, zoom + 0.2); }
	function zoomOut() { zoom = Math.max(0.1, zoom - 0.2); }
	function zoomFit() { zoom = 1; panX = 0; panY = 0; }

	// ── Pan handlers (Alt+click drag) ──────────────────────────
	function handleCanvasMouseDown(event: MouseEvent) {
		// Alt+click starts panning
		if (event.altKey) {
			isPanning = true;
			panStart = { x: event.clientX - panX, y: event.clientY - panY };
			event.preventDefault();
			return;
		}

		// Left-click on empty canvas starts selection rectangle
		if (event.button === 0 && event.target === canvasElement) {
			const rect = canvasElement.getBoundingClientRect();
			const x = (event.clientX - rect.left - panX) / zoom;
			const y = (event.clientY - rect.top - panY) / zoom;
			selectionRect = { startX: x, startY: y, endX: x, endY: y };
			isSelecting = true;

			if (!event.ctrlKey && !event.metaKey) {
				selectedNodes = new Set();
			}
		}
	}

	function handleCanvasMouseMove(event: MouseEvent) {
		if (isPanning) {
			panX = event.clientX - panStart.x;
			panY = event.clientY - panStart.y;
			return;
		}

		if (isSelecting && selectionRect) {
			const rect = canvasElement.getBoundingClientRect();
			selectionRect = {
				...selectionRect,
				endX: (event.clientX - rect.left - panX) / zoom,
				endY: (event.clientY - rect.top - panY) / zoom
			};
		}
	}

	function handleCanvasMouseUp() {
		if (isPanning) {
			isPanning = false;
			return;
		}

		if (isSelecting && selectionRect) {
			// Select nodes inside the rectangle
			const minX = Math.min(selectionRect.startX, selectionRect.endX);
			const maxX = Math.max(selectionRect.startX, selectionRect.endX);
			const minY = Math.min(selectionRect.startY, selectionRect.endY);
			const maxY = Math.max(selectionRect.startY, selectionRect.endY);

			const newSelection = new Set(selectedNodes);
			for (const node of nodes) {
				if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
					newSelection.add(node.id);
				}
			}
			selectedNodes = newSelection;
			selectionRect = null;
			isSelecting = false;
		}
	}

	// ── Keyboard shortcuts ─────────────────────────────────────
	function handleKeyDown(event: KeyboardEvent) {
		// Ctrl+Z / Cmd+Z = undo
		if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
			event.preventDefault();
			boardHistory.undo();
			notifyMutation();
			return;
		}
		// Ctrl+Shift+Z / Ctrl+Y = redo
		if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || event.key === 'y')) {
			event.preventDefault();
			boardHistory.redo();
			notifyMutation();
			return;
		}
		// Ctrl+F / Cmd+F = search
		if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
			event.preventDefault();
			showSearch = !showSearch;
			if (!showSearch) highlightedNodes = new Set();
			return;
		}
		// Delete = delete selected
		if (event.key === 'Delete' && selectedNodes.size > 0) {
			event.preventDefault();
			deleteSelectedNodes();
			return;
		}
		// Escape = clear selection / close search
		if (event.key === 'Escape') {
			if (showSearch) {
				showSearch = false;
				highlightedNodes = new Set();
			} else {
				selectedNodes = new Set();
				selectionRect = null;
				isSelecting = false;
			}
			return;
		}
	}

	function handleToolbarAction(action: string) {
	switch (action) {
	case 'analyze':
	applyMagneticForces();
	break;
	case 'attach':
	console.log('attach selected nodes', Array.from(selectedNodes));
	break;
	case 'pin':
	console.log('pin selected nodes', Array.from(selectedNodes));
	break;
	case 'connect':
	linkMode = !linkMode;
	pendingLinkSource = null;
	selectedNodes = new Set();
	break;
	case 'exportPacket':
	if (caseId || activeCaseId) {
	const target = caseId || activeCaseId;
	window.location.href = `/api/cases/${target}/export/packet`;
	}
	break;
	case 'delete':
	deleteSelectedNodes();
	break;
	case 'undo':
	boardHistory.undo();
	notifyMutation();
	break;
	case 'redo':
	boardHistory.redo();
	notifyMutation();
	break;
	case 'search':
	showSearch = !showSearch;
	if (!showSearch) highlightedNodes = new Set();
	break;
	case 'zoomIn':
	zoomIn();
	break;
	case 'zoomOut':
	zoomOut();
	break;
	case 'zoomFit':
	zoomFit();
	break;
	case 'toggleMinimap':
	showMinimap = !showMinimap;
	break;
	default: break;
	}
	}

	// ── Persistence ────────────────────────────────────────────
	function notifyMutation() {
		scheduleSave({
			caseId,
			nodes,
			connections,
			viewport: { zoom, panX, panY },
			timestamp: Date.now()
		});
	}

	// ── Search highlight handler ───────────────────────────────
	function handleSearchHighlight(nodeIds: Set<string>) {
		highlightedNodes = nodeIds;
	}

	function handleSearchNavigate(nodeId: string) {
		const node = nodes.find(n => n.id === nodeId);
		if (!node) return;
		// Pan to center the node in view
		const rect = canvasElement?.getBoundingClientRect();
		if (!rect) return;
		panX = rect.width / 2 - node.x * zoom;
		panY = rect.height / 2 - node.y * zoom;
		selectNode(nodeId, false);
		showSearch = false;
		highlightedNodes = new Set();
	}

	// ── Minimap navigation ─────────────────────────────────────
	function handleMinimapNavigate(x: number, y: number) {
		const rect = canvasElement?.getBoundingClientRect();
		if (!rect) return;
		panX = rect.width / 2 - x * zoom;
		panY = rect.height / 2 - y * zoom;
	}

	let canvasElement: HTMLDivElement;

	// ── Load persisted layout on mount ─────────────────────────
	$effect(() => {
		if (typeof window === 'undefined') return;

		// Only load from IndexedDB if no server-provided nodes
		if (initialNodes.length === 0) {
			loadLayout(caseId).then(layout => {
				if (layout) {
					nodes = layout.nodes;
					connections = layout.connections;
					zoom = layout.viewport.zoom;
					panX = layout.viewport.panX;
					panY = layout.viewport.panY;
				}
			});
		}

		// Save on beforeunload
		const handleBeforeUnload = () => flushSave();
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	$effect(() => {
	const magneticInterval = setInterval(() => {
	if (boardMode === 'magnetic') {
	applyMagneticForces();
	}
	}, 2000);

	return () => clearInterval(magneticInterval);
	});

	// Selection rect dimensions for rendering
	let selectionRectStyle = $derived.by(() => {
		if (!selectionRect) return '';
		const x = Math.min(selectionRect.startX, selectionRect.endX);
		const y = Math.min(selectionRect.startY, selectionRect.endY);
		const w = Math.abs(selectionRect.endX - selectionRect.startX);
		const h = Math.abs(selectionRect.endY - selectionRect.startY);
		return `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="retro-board-container">
	<!-- Scanline overlay -->
	<div class="scanlines"></div>

	<!-- Header -->
	<div class="retro-header">
		<div class="header-left">
			<div class="header-icon">
				<Icon name="layout-grid" size={18} />
			</div>
			<div class="header-text">
				<h1 class="header-title">EVIDENCE BOARD</h1>
				<p class="header-subtitle">Connections. Evidence. Detail all life.</p>
			</div>
		</div>
		<div class="header-right">
			<div class="header-actions">
				<!-- Undo/Redo -->
				<button class="retro-btn outline" onclick={() => handleToolbarAction('undo')} disabled={!boardHistory.canUndo} title="Undo (Ctrl+Z)">
					<Icon name="undo-2" size={14} />
				</button>
				<button class="retro-btn outline" onclick={() => handleToolbarAction('redo')} disabled={!boardHistory.canRedo} title="Redo (Ctrl+Shift+Z)">
					<Icon name="redo-2" size={14} />
				</button>

				<span class="header-sep">|</span>

				<!-- Zoom -->
				<button class="retro-btn outline" onclick={() => handleToolbarAction('zoomOut')} title="Zoom Out">
					<Icon name="zoom-out" size={14} />
				</button>
				<span class="zoom-level">{Math.round(zoom * 100)}%</span>
				<button class="retro-btn outline" onclick={() => handleToolbarAction('zoomIn')} title="Zoom In">
					<Icon name="zoom-in" size={14} />
				</button>
				<button class="retro-btn outline" onclick={() => handleToolbarAction('zoomFit')} title="Fit to View">
					<Icon name="maximize-2" size={14} />
				</button>

				<span class="header-sep">|</span>

				<!-- Search -->
				<button class="retro-btn outline" onclick={() => handleToolbarAction('search')} title="Search (Ctrl+F)">
					<Icon name="search" size={14} />
				</button>

				<!-- Minimap toggle -->
				<button class="retro-btn outline" class:active={showMinimap} onclick={() => handleToolbarAction('toggleMinimap')} title="Toggle Minimap">
					<Icon name="map" size={14} />
				</button>

				<span class="header-sep">|</span>

				<button class="retro-btn outline" onclick={() => handleToolbarAction('connect')}>
					<Icon name="link" size={14} />
					CONNECT
				</button>
				<button class="retro-btn outline" onclick={() => handleToolbarAction('attach')}>
					+ ADD EVIDENCE
				</button>
				<button class="retro-btn filled" onclick={() => showCategories = !showCategories}>
					<Icon name="book-open" size={14} />
					LIBRARY
				</button>
				<button class="retro-btn accent" onclick={() => handleToolbarAction('analyze')}>
					<Icon name="sparkles" size={14} />
					ANALYZE
				</button>
			</div>
		</div>
	</div>

	<!-- Category Badges Panel (top-right overlay) -->
	{#if showCategories && categoryStats.length > 0}
		<div class="category-panel">
			{#each categoryStats as cat}
				<div class="category-badge">
					<span class="category-label">{getCategoryLabel(cat.type)}</span>
					<span class="category-count" style="background: {getCategoryColor(cat.type)}">{cat.count}</span>
				</div>
			{/each}
			<button class="category-toggle" onclick={() => showCategories = false}>
				<Icon name="x" size={12} />
			</button>
		</div>
	{/if}

	<!-- Search Overlay -->
	{#if showSearch}
		<BoardSearchOverlay
			{nodes}
			onHighlight={handleSearchHighlight}
			onNavigate={handleSearchNavigate}
			onClose={() => { showSearch = false; highlightedNodes = new Set(); }}
		/>
	{/if}

	<!-- Secondary Toolbar -->
	<div class="retro-toolbar">
		<div class="toolbar-left">
			<div class="mode-buttons">
				<button
					class="mode-btn"
					class:active={boardMode === 'grid'}
					onclick={() => changeMode('grid')}
					title="Grid Mode"
				>
					<Icon name="grid-3x3" size={14} />
				</button>
				<button
					class="mode-btn"
					class:active={boardMode === 'free'}
					onclick={() => changeMode('free')}
					title="Free Mode"
				>
					<Icon name="move" size={14} />
				</button>
				<button
					class="mode-btn"
					class:active={boardMode === 'magnetic'}
					onclick={() => changeMode('magnetic')}
					title="Magnetic AI"
				>
					<Icon name="magnet" size={14} />
				</button>
			</div>

			{#if linkMode}
				<div class="link-mode-indicator">
					<span class="link-label">LINK MODE</span>
					<select
						bind:value={selectedRelationshipType}
						class="retro-select"
					>
						{#each relationshipTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
					<button class="retro-btn-sm danger" onclick={() => { linkMode = false; pendingLinkSource = null; selectedNodes = new Set(); }}>
						EXIT
					</button>
				</div>
			{/if}
		</div>

		<div class="toolbar-right">
			<span class="mode-label">
				{boardMode === 'grid' ? 'Grid' : boardMode === 'free' ? 'Free' : 'Magnetic AI'}
				Mode
			</span>
			<span class="separator">|</span>
			<span class="node-count">{nodes.length} Items</span>
			<span class="separator">|</span>
			<span class="connection-count">{connections.length} Connected</span>

			{#if boardHistory.lastAction}
				<span class="separator">|</span>
				<span class="last-action">{boardHistory.lastAction}</span>
			{/if}

			{#if selectedNodes.size > 0}
				<span class="separator">|</span>
				<span class="selected-count">{selectedNodes.size} Selected</span>
				<button class="retro-btn-sm" onclick={createConnection} disabled={selectedNodes.size !== 2}>
					CONNECT
				</button>
				<button class="retro-btn-sm danger" onclick={deleteSelectedNodes}>
					DELETE
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content Area -->
	<div class="board-main-content">
		<!-- Board Canvas -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="retro-canvas"
			class:grid-mode={boardMode === 'grid'}
			class:magnetic-mode={boardMode === 'magnetic'}
			class:panning={isPanning}
			bind:this={canvasElement}
			onwheel={handleWheel}
			onmousedown={handleCanvasMouseDown}
			onmousemove={handleCanvasMouseMove}
			onmouseup={handleCanvasMouseUp}
		>
			<!-- Zoom/Pan transform wrapper -->
			<div class="viewport-transform" style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0;">
				<!-- Connections Layer -->
				<EvidenceConnections connections={connections} nodes={nodes} />
				{#each nodes as evidenceNode (evidenceNode.id)}
					<EvidenceNode
						node={evidenceNode}
						isSelected={selectedNodes.has(evidenceNode.id)}
						isHighlighted={highlightedNodes.has(evidenceNode.id)}
						isPendingLinkSource={pendingLinkSource === evidenceNode.id}
						linkMode={linkMode}
						onSelect={(data) => selectNode(data.nodeId, data.multiSelect)}
						onMove={(data) => moveNode(data.nodeId, data.x, data.y)}
						onLink={(data) => handleLinkClick(data.nodeId)}
						onDragStart={handleNodeDragStart}
						onDragEnd={handleNodeDragEnd}
					/>
				{/each}

				<!-- Selection rectangle -->
				{#if selectionRect && selectionRectStyle}
					<div class="selection-rect" style={selectionRectStyle}></div>
				{/if}
			</div>

			{#if nodes.length === 0}
				<div class="empty-state">
					<Icon name="file-question" size={32} />
					<p class="empty-title">NO EVIDENCE LOADED</p>
					<p class="empty-desc">Add evidence items to begin investigation</p>
				</div>
			{/if}

			<!-- Minimap -->
			{#if showMinimap && nodes.length > 0}
				<BoardMinimap
					{nodes}
					viewport={{ zoom, panX, panY }}
					canvasWidth={canvasElement?.clientWidth ?? 800}
					canvasHeight={canvasElement?.clientHeight ?? 600}
					getCategoryColor={getCategoryColor}
					onNavigate={handleMinimapNavigate}
				/>
			{/if}
		</div>

		<!-- Relationship Inspector -->
		<RelationshipInspector {caseId} selectedEvidenceId={selectedEvidenceForInspector} />
	</div>
</div>

<style>
	/* === RETRO EVIDENCE BOARD === */
	.retro-board-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #b0ab8a;
		font-family: "Courier New", monospace;
		position: relative;
		overflow: hidden;
	}

	.scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 3px,
			rgba(0, 0, 0, 0.03) 3px,
			rgba(0, 0, 0, 0.03) 6px
		);
		pointer-events: none;
		z-index: 50;
	}

	/* Header */
	.retro-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background: #c8c3a0;
		border-bottom: 3px solid #8a855e;
		position: relative;
		z-index: 10;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-icon {
		width: 36px;
		height: 36px;
		background: #f0edd4;
		border: 2px solid #8a855e;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #4a4630;
	}

	.header-text {
		display: flex;
		flex-direction: column;
	}

	.header-title {
		font-family: "Press Start 2P", "Courier New", monospace;
		font-size: 1.1rem;
		color: #2a2618;
		margin: 0;
		letter-spacing: 3px;
		text-shadow: 1px 1px 0 rgba(255,255,255,0.3);
	}

	.header-subtitle {
		font-size: 0.65rem;
		color: #6b654a;
		margin: 2px 0 0 0;
		letter-spacing: 0.5px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.header-actions {
		display: flex;
		gap: 4px;
		align-items: center;
		flex-wrap: wrap;
	}

	.header-sep {
		color: #8a855e;
		font-size: 0.8rem;
		margin: 0 2px;
	}

	.zoom-level {
		font-family: "Courier New", monospace;
		font-size: 0.6rem;
		color: #4a4630;
		min-width: 36px;
		text-align: center;
	}

	/* Retro Buttons */
	.retro-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		font-family: "Press Start 2P", "Courier New", monospace;
		font-size: 0.5rem;
		letter-spacing: 1px;
		cursor: pointer;
		border: 2px solid;
		transition: all 0.1s;
		text-transform: uppercase;
	}

	.retro-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.retro-btn.outline {
		background: #e8e4c8;
		border-color: #8a855e;
		color: #4a4630;
	}
	.retro-btn.outline:hover:not(:disabled) {
		background: #f0edd4;
		border-color: #6b654a;
	}
	.retro-btn.outline.active {
		background: #4a4630;
		color: #f0edd4;
	}

	.retro-btn.filled {
		background: #6b654a;
		border-color: #4a4630;
		color: #f0edd4;
	}
	.retro-btn.filled:hover {
		background: #7d7658;
	}

	.retro-btn.accent {
		background: #3a6e3a;
		border-color: #2a5a2a;
		color: #d4f0d4;
	}
	.retro-btn.accent:hover {
		background: #4a7e4a;
	}

	/* Category Panel */
	.category-panel {
		position: absolute;
		top: 65px;
		right: 20px;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: #f0edd4;
		border: 2px solid #8a855e;
		padding: 8px;
		min-width: 180px;
	}

	.category-badge {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 3px 6px;
		font-size: 0.65rem;
		color: #4a4630;
		letter-spacing: 0.5px;
	}

	.category-label {
		font-weight: 600;
		text-transform: uppercase;
	}

	.category-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 18px;
		padding: 0 6px;
		font-size: 0.6rem;
		font-weight: 700;
		color: white;
		border-radius: 2px;
	}

	.category-toggle {
		align-self: flex-end;
		background: none;
		border: 1px solid #8a855e;
		color: #6b654a;
		cursor: pointer;
		padding: 2px;
		margin-top: 2px;
	}
	.category-toggle:hover {
		background: #e8e4c8;
	}

	/* Secondary Toolbar */
	.retro-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 16px;
		background: #c0bb98;
		border-bottom: 2px solid #8a855e;
		position: relative;
		z-index: 10;
		gap: 12px;
		flex-wrap: wrap;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.65rem;
		color: #4a4630;
	}

	.mode-buttons {
		display: flex;
		gap: 2px;
	}

	.mode-btn {
		width: 30px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #d8d4b8;
		border: 2px solid #8a855e;
		color: #6b654a;
		cursor: pointer;
		transition: all 0.1s;
	}
	.mode-btn:hover {
		background: #e8e4c8;
	}
	.mode-btn.active {
		background: #4a4630;
		color: #f0edd4;
		border-color: #2a2618;
	}

	.link-mode-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		background: #3a1a1a;
		border: 2px solid #8a2020;
		color: #ffa0a0;
	}

	.link-label {
		font-family: "Press Start 2P", "Courier New", monospace;
		font-size: 0.45rem;
		letter-spacing: 1px;
		animation: blink 1.5s step-end infinite;
	}

	.retro-select {
		padding: 2px 6px;
		font-family: "Courier New", monospace;
		font-size: 0.7rem;
		background: #2a1a1a;
		color: #ffa0a0;
		border: 1px solid #8a2020;
		min-width: 110px;
	}

	.retro-btn-sm {
		padding: 3px 8px;
		font-family: "Courier New", monospace;
		font-size: 0.6rem;
		background: #d8d4b8;
		border: 1px solid #8a855e;
		color: #4a4630;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.retro-btn-sm:hover {
		background: #e8e4c8;
	}
	.retro-btn-sm:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.retro-btn-sm.danger {
		background: #5a2020;
		border-color: #8a2020;
		color: #ffa0a0;
	}
	.retro-btn-sm.danger:hover {
		background: #6a2a2a;
	}

	.mode-label {
		font-weight: 600;
	}
	.separator {
		color: #8a855e;
	}
	.node-count, .connection-count {
		opacity: 0.8;
	}
	.last-action {
		font-style: italic;
		opacity: 0.6;
	}
	.selected-count {
		font-weight: 600;
		color: #c0b870;
	}

	/* Main Content */
	.board-main-content {
		flex: 1;
		display: flex;
		position: relative;
	}

	/* Canvas - Graph Paper Background */
	.retro-canvas {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #b8b49a;
		cursor: default;
	}

	.retro-canvas.panning {
		cursor: grab;
	}

	.retro-canvas.grid-mode {
		background-image:
			linear-gradient(rgba(138, 133, 94, 0.35) 1px, transparent 1px),
			linear-gradient(90deg, rgba(138, 133, 94, 0.35) 1px, transparent 1px);
		background-size: 50px 50px;
	}

	.retro-canvas.magnetic-mode {
		background-image:
			linear-gradient(rgba(138, 133, 94, 0.2) 1px, transparent 1px),
			linear-gradient(90deg, rgba(138, 133, 94, 0.2) 1px, transparent 1px);
		background-size: 50px 50px;
		box-shadow: inset 0 0 80px rgba(58, 110, 58, 0.15);
	}

	/* Viewport transform wrapper */
	.viewport-transform {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	/* Selection rectangle */
	.selection-rect {
		position: absolute;
		border: 2px dashed #4a90d9;
		background: rgba(74, 144, 217, 0.1);
		pointer-events: none;
		z-index: 40;
	}

	/* Empty State */
	.empty-state {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: #6b654a;
		z-index: 6;
	}

	.empty-title {
		font-family: "Press Start 2P", "Courier New", monospace;
		font-size: 0.7rem;
		margin: 12px 0 6px;
		letter-spacing: 1px;
	}

	.empty-desc {
		font-size: 0.7rem;
		opacity: 0.7;
		margin: 0;
	}

	@keyframes blink {
		50% { opacity: 0.3; }
	}
</style>
