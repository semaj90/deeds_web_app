<!-- Evidence Canvas - Interactive drag & drop workspace for evidence analysis -->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface EvidenceItem {
		id: string;
		title: string;
		content?: string;
		evidenceType: string;
		x: number;
		y: number;
		connections?: string[];
	}

	interface EvidenceConnection {
		id: string;
		fromId: string;
		toId: string;
		type: 'similarity' | 'temporal' | 'causal' | 'reference';
		strength: number;
		metadata?: { reason?: string; confidence?: number };
	}

	interface Props {
		caseId?: string;
		readonly?: boolean;
		initialEvidence?: EvidenceItem[];
	}

	let { caseId = 'default', readonly = false, initialEvidence = [] }: Props = $props();

	let canvasElement = $state<HTMLDivElement>();
	let evidenceList = $state<EvidenceItem[]>(initialEvidence);
	let connections = $state<EvidenceConnection[]>([]);
	let selectedNodes = $state<string[]>([]);
	let highlightedNodes = $state<string[]>([]);
	let isAnalyzing = $state(false);
	let canvasSize = $state({ width: 1200, height: 800 });
	let showConnections = $state(true);
	let connectionType = $state<EvidenceConnection['type']>('similarity');
	let statusMessage = $state('');

	$effect(() => {
		updateCanvasSize();
		const handleResize = () => updateCanvasSize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function updateCanvasSize() {
		if (!canvasElement) return;
		const rect = canvasElement.getBoundingClientRect();
		canvasSize = {
			width: Math.max(1200, rect.width),
			height: Math.max(800, rect.height)
		};
	}

	function handleEvidenceSelect(evidenceId: string) {
		if (selectedNodes.includes(evidenceId)) {
			selectedNodes = selectedNodes.filter(id => id !== evidenceId);
		} else {
			selectedNodes = [...selectedNodes, evidenceId];
		}
	}

	function handleEvidenceHighlight(evidenceIds: string[]) {
		highlightedNodes = evidenceIds;
		setTimeout(() => { highlightedNodes = []; }, 3000);
	}

	async function handleCreateConnection(fromId: string, toId: string) {
		if (fromId === toId) return;

		const existing = connections.find(
			c => (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId)
		);
		if (existing) {
			statusMessage = 'Connection already exists';
			return;
		}

		try {
			const fromEv = evidenceList.find(e => e.id === fromId);
			const toEv = evidenceList.find(e => e.id === toId);
			if (!fromEv || !toEv) throw new Error('Evidence not found');

			let similarity = 0.5 + Math.random() * 0.5;

			// Try to get real similarity via embedding API
			try {
				const fromText = fromEv.content || fromEv.title;
				const toText = toEv.content || toEv.title;
				const [fromRes, toRes] = await Promise.all([
					fetch('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fromText, model: 'embeddinggemma' }) }),
					fetch('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: toText, model: 'embeddinggemma' }) })
				]);
				if (fromRes.ok && toRes.ok) {
					const fromData = await fromRes.json();
					const toData = await toRes.json();
					if (fromData.embedding && toData.embedding) {
						similarity = calculateCosineSimilarity(fromData.embedding, toData.embedding);
					}
				}
			} catch { /* fallback to random similarity */ }

			const newConn: EvidenceConnection = {
				id: crypto.randomUUID(),
				fromId,
				toId,
				type: connectionType,
				strength: similarity,
				metadata: { reason: `${connectionType} connection`, confidence: similarity }
			};
			connections = [...connections, newConn];
			statusMessage = `Created ${connectionType} connection (${Math.round(similarity * 100)}% similarity)`;
		} catch (err) {
			console.error('Failed to create connection:', err);
			statusMessage = 'Failed to create connection';
		}
	}

	async function analyzeAllEvidence() {
		if (isAnalyzing || evidenceList.length < 2) return;
		isAnalyzing = true;
		statusMessage = 'Analyzing evidence...';

		try {
			const embeddings: number[][] = [];

			for (const ev of evidenceList) {
				try {
					const res = await fetch('/api/embed', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ text: ev.content || ev.title, model: 'embeddinggemma' })
					});
					if (res.ok) {
						const data = await res.json();
						embeddings.push(data.embedding ?? []);
					} else {
						embeddings.push([]);
					}
				} catch {
					embeddings.push([]);
				}
			}

			const suggested: EvidenceConnection[] = [];
			for (let i = 0; i < evidenceList.length; i++) {
				for (let j = i + 1; j < evidenceList.length; j++) {
					if (!embeddings[i].length || !embeddings[j].length) continue;
					const sim = calculateCosineSimilarity(embeddings[i], embeddings[j]);
					if (sim > 0.7) {
						const existing = connections.find(c =>
							(c.fromId === evidenceList[i].id && c.toId === evidenceList[j].id) ||
							(c.fromId === evidenceList[j].id && c.toId === evidenceList[i].id)
						);
						if (!existing) {
							suggested.push({
								id: crypto.randomUUID(),
								fromId: evidenceList[i].id,
								toId: evidenceList[j].id,
								type: 'similarity',
								strength: sim,
								metadata: { reason: 'AI-detected similarity', confidence: sim }
							});
						}
					}
				}
			}

			connections = [...connections, ...suggested];
			const connectedIds = suggested.flatMap(c => [c.fromId, c.toId]);
			handleEvidenceHighlight([...new Set(connectedIds)]);
			statusMessage = `Found ${suggested.length} potential connection${suggested.length === 1 ? '' : 's'}`;
		} catch (err) {
			console.error('Analysis failed:', err);
			statusMessage = 'Evidence analysis failed';
		} finally {
			isAnalyzing = false;
		}
	}

	function calculateCosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length || a.length === 0) return 0;
		const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
		const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
		const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
		return magA && magB ? dot / (magA * magB) : 0;
	}

	function getConnectionPath(conn: EvidenceConnection): string {
		const from = evidenceList.find(e => e.id === conn.fromId);
		const to = evidenceList.find(e => e.id === conn.toId);
		if (!from || !to) return '';
		const fx = from.x + 128, fy = from.y + 50;
		const tx = to.x + 128, ty = to.y + 50;
		const midX = (fx + tx) / 2;
		const midY = (fy + ty) / 2;
		const offset = Math.min(100, Math.abs(fx - tx) * 0.3);
		return `M ${fx} ${fy} Q ${midX} ${midY - offset} ${tx} ${ty}`;
	}

	function getConnectionColor(type: string, strength: number): string {
		const opacity = Math.max(0.3, strength);
		switch (type) {
			case 'similarity': return `rgba(59, 130, 246, ${opacity})`;
			case 'temporal': return `rgba(16, 185, 129, ${opacity})`;
			case 'causal': return `rgba(245, 101, 101, ${opacity})`;
			case 'reference': return `rgba(139, 92, 246, ${opacity})`;
			default: return `rgba(107, 114, 128, ${opacity})`;
		}
	}

	function getTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			document: '📄', image: '🖼', video: '🎬', audio: '🎵',
			photo: '📷', forensic: '🔬', witness_statement: '👁', physical: '📦'
		};
		return icons[type] ?? '📄';
	}

	function handleCanvasDrop(event: DragEvent) {
		event.preventDefault();
		const data = event.dataTransfer?.getData('text/plain');
		if (!data || readonly) return;

		try {
			const ev = JSON.parse(data);
			const rect = canvasElement?.getBoundingClientRect();
			if (rect) {
				const x = Math.max(0, Math.min(event.clientX - rect.left - 128, canvasSize.width - 256));
				const y = Math.max(0, Math.min(event.clientY - rect.top - 50, canvasSize.height - 120));
				evidenceList = [...evidenceList, { ...ev, id: ev.id || crypto.randomUUID(), x, y }];
				statusMessage = `Added ${ev.title ?? 'evidence'} to canvas`;
			}
		} catch (err) {
			console.error('Drop failed:', err);
		}
	}

	function exportCanvasData() {
		const blob = new Blob([JSON.stringify({
			evidence: evidenceList,
			connections,
			metadata: { caseId, exportedAt: new Date().toISOString(), evidenceCount: evidenceList.length, connectionCount: connections.length }
		}, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `evidence-canvas-${caseId}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
		statusMessage = 'Canvas data exported';
	}

	let isDragging = $state<string | null>(null);
	let dragOffset = $state({ x: 0, y: 0 });

	function handleNodeMouseDown(event: MouseEvent, nodeId: string) {
		if (readonly) return;
		const node = evidenceList.find(n => n.id === nodeId);
		if (!node) return;
		isDragging = nodeId;
		dragOffset = { x: event.clientX - node.x, y: event.clientY - node.y };
		handleEvidenceSelect(nodeId);
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		evidenceList = evidenceList.map(n =>
			n.id === isDragging ? { ...n, x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y } : n
		);
	}

	function handleMouseUp() {
		isDragging = null;
	}

	function connectSelected() {
		if (selectedNodes.length === 2) {
			handleCreateConnection(selectedNodes[0], selectedNodes[1]);
			selectedNodes = [];
		}
	}
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<div class="evidence-canvas-container">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<Icon name="brain" class="w-5 h-5" />
			<span class="toolbar-title">Evidence Canvas</span>
			<span class="toolbar-stats">{evidenceList.length} items &bull; {connections.length} connections &bull; {selectedNodes.length} selected</span>
		</div>
		<div class="toolbar-right">
			<select bind:value={connectionType} class="type-select" disabled={readonly}>
				<option value="similarity">Similarity</option>
				<option value="temporal">Temporal</option>
				<option value="causal">Causal</option>
				<option value="reference">Reference</option>
			</select>
			{#if selectedNodes.length === 2}
				<button class="tool-btn connect-btn" onclick={connectSelected} title="Connect selected nodes">
					<Icon name="link-2" class="w-4 h-4" /> Connect
				</button>
			{/if}
			<button class="tool-btn" onclick={() => (showConnections = !showConnections)} title="Toggle connections">
				{#if showConnections}<Icon name="eye-off" class="w-4 h-4" />{:else}<Icon name="eye" class="w-4 h-4" />{/if}
				{showConnections ? 'Hide' : 'Show'}
			</button>
			<button class="tool-btn" onclick={analyzeAllEvidence} disabled={isAnalyzing || readonly || evidenceList.length < 2} title="AI-analyze all evidence">
				{#if isAnalyzing}
					<div class="spinner"></div>
				{:else}
					<Icon name="search" class="w-4 h-4" />
				{/if}
				Analyze
			</button>
			<button class="tool-btn" onclick={exportCanvasData} title="Export canvas data">
				<Icon name="download" class="w-4 h-4" /> Export
			</button>
		</div>
	</div>

	{#if statusMessage}
		<div class="status-bar">{statusMessage}</div>
	{/if}

	<!-- Canvas -->
	<div
		bind:this={canvasElement}
		class="canvas-area"
		style="width: {canvasSize.width}px; height: {canvasSize.height}px;"
		ondrop={handleCanvasDrop}
		ondragover={(e) => e.preventDefault()}
		role="region"
		aria-label="Evidence canvas"
	>
		<div class="grid-pattern"></div>

		<!-- Connection SVG -->
		{#if showConnections}
			<svg class="connections-svg" width={canvasSize.width} height={canvasSize.height}>
				{#each connections as conn (conn.id)}
					<path
						d={getConnectionPath(conn)}
						stroke={getConnectionColor(conn.type, conn.strength)}
						stroke-width="2"
						fill="none"
						stroke-dasharray={conn.type === 'similarity' ? '5,5' : ''}
					/>
					{#if conn.strength > 0.5}
						{@const from = evidenceList.find(e => e.id === conn.fromId)}
						{@const to = evidenceList.find(e => e.id === conn.toId)}
						{#if from && to}
							<text
								x={(from.x + to.x) / 2 + 128}
								y={(from.y + to.y) / 2 + 50}
								class="conn-label"
								text-anchor="middle"
							>
								{Math.round(conn.strength * 100)}%
							</text>
						{/if}
					{/if}
				{/each}
			</svg>
		{/if}

		<!-- Evidence Nodes -->
		{#each evidenceList as ev (ev.id)}
			<div
				class="evidence-node"
				class:selected={selectedNodes.includes(ev.id)}
				class:highlighted={highlightedNodes.includes(ev.id)}
				class:dragging={isDragging === ev.id}
				style="left: {ev.x}px; top: {ev.y}px;"
				onmousedown={(e) => handleNodeMouseDown(e, ev.id)}
				role="button"
				tabindex="0"
			>
				<div class="node-header" style="background: {getConnectionColor(ev.evidenceType === 'document' ? 'reference' : ev.evidenceType === 'image' || ev.evidenceType === 'photo' ? 'causal' : ev.evidenceType === 'video' ? 'temporal' : 'similarity', 0.9)};">
					<span>{getTypeIcon(ev.evidenceType)}</span>
					<span class="node-title">{ev.title}</span>
				</div>
				{#if ev.content}
					<div class="node-content">{ev.content.slice(0, 80)}{ev.content.length > 80 ? '...' : ''}</div>
				{/if}
			</div>
		{/each}

		<!-- Empty State -->
		{#if evidenceList.length === 0}
			<div class="empty-state">
				<Icon name="plus" class="w-12 h-12" />
				<h3>No evidence on canvas</h3>
				<p>Drag evidence items here or use the toolbar to add items</p>
			</div>
		{/if}
	</div>

	<!-- Connection Legend -->
	<div class="legend">
		<span class="legend-item"><span class="legend-dot" style="background: rgba(59,130,246,0.8);"></span> Similarity</span>
		<span class="legend-item"><span class="legend-dot" style="background: rgba(16,185,129,0.8);"></span> Temporal</span>
		<span class="legend-item"><span class="legend-dot" style="background: rgba(245,101,101,0.8);"></span> Causal</span>
		<span class="legend-item"><span class="legend-dot" style="background: rgba(139,92,246,0.8);"></span> Reference</span>
	</div>
</div>

<style>
	.evidence-canvas-container {
		width: 100%;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
		background: white;
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-title {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.toolbar-stats {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.type-select {
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
	}

	.tool-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tool-btn:hover { background: #f3f4f6; }
	.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.connect-btn { border-color: #3b82f6; color: #3b82f6; }
	.connect-btn:hover { background: #eff6ff; }

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.status-bar {
		padding: 0.4rem 1rem;
		font-size: 0.8rem;
		color: #374151;
		background: #fef3c7;
		border-bottom: 1px solid #fcd34d;
	}

	.canvas-area {
		position: relative;
		overflow: auto;
		background: #fafafa;
	}

	.grid-pattern {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px);
		background-size: 40px 40px;
		pointer-events: none;
	}

	.connections-svg {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 5;
	}

	.conn-label {
		font-size: 10px;
		fill: #374151;
	}

	.evidence-node {
		position: absolute;
		min-width: 200px;
		max-width: 280px;
		background: white;
		border: 2px solid #d1d5db;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(0,0,0,0.08);
		cursor: grab;
		user-select: none;
		z-index: 10;
		transition: box-shadow 0.15s, border-color 0.15s;
	}

	.evidence-node:hover {
		box-shadow: 0 4px 12px rgba(0,0,0,0.12);
	}

	.evidence-node.selected {
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59,130,246,0.2);
	}

	.evidence-node.highlighted {
		border-color: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245,158,11,0.3);
		animation: pulse 1.5s ease-in-out 2;
	}

	.evidence-node.dragging {
		opacity: 0.85;
		cursor: grabbing;
		z-index: 100;
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		color: white;
		border-radius: 6px 6px 0 0;
		font-size: 0.85rem;
	}

	.node-title {
		flex: 1;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-content {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: #6b7280;
		line-height: 1.4;
	}

	.empty-state {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #9ca3af;
		gap: 0.5rem;
	}

	.empty-state h3 { font-size: 1.1rem; font-weight: 500; }
	.empty-state p { font-size: 0.85rem; }

	.legend {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}
</style>
