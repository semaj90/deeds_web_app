<!-- EvidenceTheoryBoard.svelte — Game-style Detective Mode evidence board -->
<!-- Drag-connect nodes, confidence % bubbles, theory hypothesis panel -->
<script lang="ts">
	interface EvidenceNode {
		id: string;
		label: string;
		type: 'document' | 'testimony' | 'forensic' | 'photo' | 'financial' | 'digital';
		x: number;
		y: number;
		confidence: number;
		summary?: string;
	}

	interface Connection {
		id: string;
		from: string;
		to: string;
		strength: number;
		label?: string;
	}

	interface Theory {
		id: string;
		title: string;
		confidence: number;
		supportCount: number;
		contradictCount: number;
	}

	interface Props {
		caseId?: string;
		caseName?: string;
	}

	let { caseId = '', caseName = 'Case Analysis' }: Props = $props();

	// --- State ---
	let nodes = $state<EvidenceNode[]>([
		{ id: 'n1', label: 'Police Report', type: 'document', x: 180, y: 200, confidence: 92, summary: 'Initial incident report filed by Officer Martinez' },
		{ id: 'n2', label: 'Witness — J. Doe', type: 'testimony', x: 440, y: 140, confidence: 67, summary: 'Eyewitness account, partial visibility' },
		{ id: 'n3', label: 'DNA Analysis', type: 'forensic', x: 380, y: 360, confidence: 98, summary: 'Lab results confirm subject match' },
		{ id: 'n4', label: 'CCTV Footage', type: 'photo', x: 660, y: 220, confidence: 85, summary: 'Parking lot camera, timestamp verified' },
		{ id: 'n5', label: 'Bank Records', type: 'financial', x: 200, y: 440, confidence: 91, summary: 'Transaction history shows wire transfers' },
		{ id: 'n6', label: 'Phone Metadata', type: 'digital', x: 600, y: 420, confidence: 78, summary: 'Cell tower pings establish proximity' },
	]);

	let connections = $state<Connection[]>([
		{ id: 'c1', from: 'n1', to: 'n2', strength: 72, label: 'Timeline match' },
		{ id: 'c2', from: 'n1', to: 'n3', strength: 95, label: 'Subject link' },
		{ id: 'c3', from: 'n4', to: 'n6', strength: 63, label: 'Proximity' },
		{ id: 'c4', from: 'n3', to: 'n5', strength: 48, label: 'Financial motive' },
	]);

	let theories = $state<Theory[]>([
		{ id: 't1', title: 'Premeditated Act — Financial Motive', confidence: 74, supportCount: 4, contradictCount: 1 },
		{ id: 't2', title: 'Opportunity — Wrong Place, Wrong Time', confidence: 31, contradictCount: 3, supportCount: 1 },
	]);

	let selectedNode = $state<EvidenceNode | null>(null);
	let draggingNode = $state<EvidenceNode | null>(null);
	let connectingFrom = $state<EvidenceNode | null>(null);
	let showTheoryPanel = $state(true);
	let mousePos = $state({ x: 0, y: 0 });
	let svgRef = $state<SVGSVGElement | null>(null);
	let selectedNodeConnections = $derived.by(() => {
		if (!selectedNode) {
			return [] as Connection[];
		}

		return connections.filter((connection) => connection.from === selectedNode.id || connection.to === selectedNode.id);
	});

	const CANVAS_W = 900;
	const CANVAS_H = 600;
	const NODE_R = 32;

	const TYPE_COLORS: Record<string, string> = {
		document: '#60a5fa',
		testimony: '#c084fc',
		forensic: '#34d399',
		photo: '#fbbf24',
		financial: '#f87171',
		digital: '#22d3ee',
	};

	const TYPE_ICONS: Record<string, string> = {
		document: '📄',
		testimony: '👤',
		forensic: '🔬',
		photo: '📷',
		financial: '💰',
		digital: '📱',
	};

	function strengthColor(s: number): string {
		if (s >= 80) return '#34d399';
		if (s >= 50) return '#fbbf24';
		return '#f87171';
	}

	function confidenceBg(c: number): string {
		if (c >= 85) return 'rgba(52,211,153,0.15)';
		if (c >= 60) return 'rgba(251,191,36,0.15)';
		return 'rgba(248,113,113,0.15)';
	}

	function getNodeById(id: string) {
		return nodes.find((n) => n.id === id);
	}

	// --- Drag ---
	function handleSvgMouseDown(node: EvidenceNode, e: MouseEvent) {
		if (connectingFrom) {
			// Complete connection
			if (connectingFrom.id !== node.id) {
				const exists = connections.some(
					(c) =>
						(c.from === connectingFrom!.id && c.to === node.id) ||
						(c.from === node.id && c.to === connectingFrom!.id)
				);
				if (!exists) {
					connections = [
						...connections,
						{
							id: `c${Date.now()}`,
							from: connectingFrom.id,
							to: node.id,
							strength: 50,
							label: 'New link',
						},
					];
				}
			}
			connectingFrom = null;
			return;
		}
		e.stopPropagation();
		draggingNode = node;
		selectedNode = node;
	}

	function handleSvgMouseMove(e: MouseEvent) {
		if (!svgRef) return;
		const rect = svgRef.getBoundingClientRect();
		mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

		if (draggingNode) {
			const scaleX = CANVAS_W / rect.width;
			const scaleY = CANVAS_H / rect.height;
			draggingNode.x = Math.max(NODE_R, Math.min(CANVAS_W - NODE_R, (e.clientX - rect.left) * scaleX));
			draggingNode.y = Math.max(NODE_R, Math.min(CANVAS_H - NODE_R, (e.clientY - rect.top) * scaleY));
		}
	}

	function handleSvgMouseUp() {
		draggingNode = null;
	}

	function startConnect(node: EvidenceNode, e: MouseEvent) {
		e.stopPropagation();
		connectingFrom = node;
	}

	function removeConnection(conn: Connection) {
		connections = connections.filter((c) => c.id !== conn.id);
	}

	function addTheory() {
		theories = [
			...theories,
			{
				id: `t${Date.now()}`,
				title: 'New Hypothesis',
				confidence: 50,
				supportCount: 0,
				contradictCount: 0,
			},
		];
	}
</script>

<div class="board-root">
	<!-- Header bar -->
	<div class="board-header">
		<div class="board-title">
			<span class="title-icon">🔍</span>
			<span class="title-text">DETECTIVE MODE — EVIDENCE BOARD</span>
		</div>
		<div class="header-controls">
			<span class="case-tag">{caseName || caseId || 'UNASSIGNED'}</span>
			<button class="header-btn" onclick={() => (showTheoryPanel = !showTheoryPanel)}>
				{showTheoryPanel ? '◀ HIDE THEORY' : '▶ SHOW THEORY'}
			</button>
			<button class="header-btn warn" onclick={() => (connectingFrom = connectingFrom ? null : (selectedNode || nodes[0])!)}>
				{connectingFrom ? '✕ CANCEL LINK' : '🔗 LINK MODE'}
			</button>
		</div>
	</div>

	<div class="board-body">
		<!-- SVG Evidence Map -->
		<div class="canvas-area">
			{#if connectingFrom}
				<div class="connect-hint">
					CONNECTING FROM <strong>{connectingFrom.label}</strong> — click target node
				</div>
			{/if}

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				bind:this={svgRef}
				viewBox="0 0 {CANVAS_W} {CANVAS_H}"
				class="board-svg"
				onmousemove={handleSvgMouseMove}
				onmouseup={handleSvgMouseUp}
				onmouseleave={handleSvgMouseUp}
			>
				<!-- Grid dots -->
				<defs>
					<pattern id="grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
						<circle cx="20" cy="20" r="1" fill="rgba(212,199,163,0.08)" />
					</pattern>
				</defs>
				<rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid-dots)" />

				<!-- Connections -->
				{#each connections as conn}
					{@const fromN = getNodeById(conn.from)}
					{@const toN = getNodeById(conn.to)}
					{#if fromN && toN}
						{@const midX = (fromN.x + toN.x) / 2}
						{@const midY = (fromN.y + toN.y) / 2}
						<line
							x1={fromN.x} y1={fromN.y}
							x2={toN.x} y2={toN.y}
							stroke={strengthColor(conn.strength)}
							stroke-width="2"
							stroke-opacity="0.5"
							stroke-dasharray={conn.strength < 50 ? '6,4' : 'none'}
						/>
						<!-- Confidence bubble on connection -->
						<circle cx={midX} cy={midY} r="16" fill="#0e0d0b" stroke={strengthColor(conn.strength)} stroke-width="1.5" />
						<text x={midX} y={midY + 4} text-anchor="middle" fill={strengthColor(conn.strength)} font-size="10" font-family="monospace" font-weight="bold">
							{conn.strength}%
						</text>
						{#if conn.label}
							<text x={midX} y={midY - 20} text-anchor="middle" fill="rgba(212,199,163,0.4)" font-size="9" font-family="monospace">
								{conn.label}
							</text>
						{/if}
					{/if}
				{/each}

				<!-- Connecting line preview -->
				{#if connectingFrom}
					<line
						x1={connectingFrom.x} y1={connectingFrom.y}
						x2={mousePos.x * (CANVAS_W / (svgRef?.getBoundingClientRect().width || CANVAS_W))}
						y2={mousePos.y * (CANVAS_H / (svgRef?.getBoundingClientRect().height || CANVAS_H))}
						stroke="#60a5fa"
						stroke-width="2"
						stroke-dasharray="8,4"
						stroke-opacity="0.6"
					/>
				{/if}

				<!-- Nodes -->
				{#each nodes as node}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g class="evidence-node" onmousedown={(e) => handleSvgMouseDown(node, e)}>
						<!-- Selection ring -->
						{#if selectedNode?.id === node.id}
							<circle cx={node.x} cy={node.y} r={NODE_R + 8} fill="none" stroke={TYPE_COLORS[node.type]} stroke-width="2" stroke-dasharray="4,3" opacity="0.6">
								<animateTransform attributeName="transform" type="rotate" from="0 {node.x} {node.y}" to="360 {node.x} {node.y}" dur="8s" repeatCount="indefinite" />
							</circle>
						{/if}

						<!-- Outer glow -->
						<circle cx={node.x} cy={node.y} r={NODE_R + 3} fill={TYPE_COLORS[node.type]} opacity="0.1" />

						<!-- Main circle -->
						<circle
							cx={node.x} cy={node.y} r={NODE_R}
							fill="#0e0d0b"
							stroke={TYPE_COLORS[node.type]}
							stroke-width={selectedNode?.id === node.id ? 2.5 : 1.5}
						/>

						<!-- Type icon -->
						<text x={node.x} y={node.y + 5} text-anchor="middle" font-size="18" fill="white">
							{TYPE_ICONS[node.type]}
						</text>

						<!-- Label below -->
						<text x={node.x} y={node.y + NODE_R + 16} text-anchor="middle" fill="rgba(212,199,163,0.7)" font-size="10" font-family="monospace" class="node-label">
							{node.label}
						</text>

						<!-- Confidence badge -->
						<circle cx={node.x + NODE_R - 4} cy={node.y - NODE_R + 4} r="12" fill="#0e0d0b" stroke={strengthColor(node.confidence)} stroke-width="1.5" />
						<text x={node.x + NODE_R - 4} y={node.y - NODE_R + 8} text-anchor="middle" fill={strengthColor(node.confidence)} font-size="8" font-family="monospace" font-weight="bold">
							{node.confidence}
						</text>

						<!-- Connect handle -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx={node.x + NODE_R + 2}
							cy={node.y}
							r="6"
							fill={TYPE_COLORS[node.type]}
							opacity="0.3"
							class="connect-handle"
							onmousedown={(e) => startConnect(node, e)}
						/>
					</g>
				{/each}
			</svg>
		</div>

		<!-- Theory / Inspector side panel -->
		{#if showTheoryPanel}
			<div class="theory-panel">
				<div class="theory-header">
					<span class="theory-title">⚖ CASE THEORIES</span>
					<button class="theory-add-btn" onclick={addTheory}>+ ADD</button>
				</div>

				<div class="theory-list">
					{#each theories as theory}
						<div class="theory-card" style="border-left-color: {strengthColor(theory.confidence)}">
							<div class="theory-card-title">{theory.title}</div>
							<div class="theory-bar-row">
								<div class="theory-bar-bg">
									<div class="theory-bar-fill" style="width: {theory.confidence}%; background: {strengthColor(theory.confidence)}"></div>
								</div>
								<span class="theory-pct">{theory.confidence}%</span>
							</div>
							<div class="theory-stats">
								<span class="stat-support">▲ {theory.supportCount} supports</span>
								<span class="stat-contradict">▼ {theory.contradictCount} contradicts</span>
							</div>
						</div>
					{/each}
				</div>

				<!-- Selected node inspector -->
				{#if selectedNode}
					<div class="inspector">
						<div class="inspector-title">
							<span>{TYPE_ICONS[selectedNode.type]}</span>
							<span>{selectedNode.label}</span>
						</div>
						<div class="inspector-row">
							<span class="inspector-label">TYPE</span>
							<span class="inspector-value" style="color: {TYPE_COLORS[selectedNode.type]}">{selectedNode.type.toUpperCase()}</span>
						</div>
						<div class="inspector-row">
							<span class="inspector-label">CONFIDENCE</span>
							<span class="inspector-value" style="background: {confidenceBg(selectedNode.confidence)}; padding: 2px 8px; border-radius: 4px;">
								{selectedNode.confidence}%
							</span>
						</div>
						{#if selectedNode.summary}
							<div class="inspector-summary">{selectedNode.summary}</div>
						{/if}
						<div class="inspector-connections">
							<span class="inspector-label">LINKS ({selectedNodeConnections.length})</span>
							{#each selectedNodeConnections as conn}
								{@const otherNode = getNodeById(conn.from === selectedNode?.id ? conn.to : conn.from)}
								{#if otherNode}
									<div class="inspector-link">
										<span style="color: {TYPE_COLORS[otherNode.type]}">{otherNode.label}</span>
										<span class="link-strength" style="color: {strengthColor(conn.strength)}">{conn.strength}%</span>
										<button class="link-remove" onclick={() => removeConnection(conn)}>✕</button>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.board-root {
		display: flex;
		flex-direction: column;
		height: 680px;
		background: #0e0d0b;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 8px;
		overflow: hidden;
		font-family: 'Courier New', monospace;
		color: rgba(212, 199, 163, 0.85);
	}

	/* Header */
	.board-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		background: rgba(212, 199, 163, 0.04);
		border-bottom: 1px solid rgba(212, 199, 163, 0.1);
	}
	.board-title { display: flex; align-items: center; gap: 8px; }
	.title-icon { font-size: 18px; }
	.title-text { font-size: 11px; letter-spacing: 0.15em; font-weight: 700; text-transform: uppercase; }
	.header-controls { display: flex; gap: 8px; align-items: center; }
	.case-tag {
		padding: 3px 10px;
		background: rgba(96, 165, 250, 0.08);
		border: 1px solid rgba(96, 165, 250, 0.3);
		border-radius: 4px;
		font-size: 9px;
		letter-spacing: 0.1em;
		color: #60a5fa;
	}
	.header-btn {
		padding: 4px 12px;
		background: rgba(212, 199, 163, 0.06);
		border: 1px solid rgba(212, 199, 163, 0.15);
		border-radius: 4px;
		font-size: 9px;
		letter-spacing: 0.08em;
		color: rgba(212, 199, 163, 0.7);
		cursor: pointer;
		font-family: inherit;
	}
	.header-btn:hover { background: rgba(212, 199, 163, 0.12); }
	.header-btn.warn { border-color: rgba(251, 191, 36, 0.3); color: #fbbf24; }
	.header-btn.warn:hover { background: rgba(251, 191, 36, 0.1); }

	/* Body layout */
	.board-body { display: flex; flex: 1; overflow: hidden; }

	/* Canvas area */
	.canvas-area { flex: 1; position: relative; background: #0a0908; }
	.connect-hint {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		padding: 4px 16px;
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.3);
		border-radius: 4px;
		font-size: 10px;
		color: #60a5fa;
		z-index: 2;
		letter-spacing: 0.08em;
	}
	.board-svg {
		width: 100%;
		height: 100%;
		cursor: grab;
	}
	.board-svg:active { cursor: grabbing; }

	.evidence-node { cursor: pointer; }
	.evidence-node:hover circle:first-child { opacity: 0.2 !important; }
	:global(.node-label) { pointer-events: none; user-select: none; }
	.connect-handle { cursor: crosshair; transition: opacity 0.15s; }
	.connect-handle:hover { opacity: 0.8 !important; }

	/* Theory side panel */
	.theory-panel {
		width: 280px;
		min-width: 280px;
		background: rgba(212, 199, 163, 0.02);
		border-left: 1px solid rgba(212, 199, 163, 0.1);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	.theory-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}
	.theory-title { font-size: 10px; letter-spacing: 0.12em; font-weight: 700; }
	.theory-add-btn {
		padding: 2px 10px;
		background: rgba(52, 211, 153, 0.08);
		border: 1px solid rgba(52, 211, 153, 0.3);
		border-radius: 3px;
		color: #34d399;
		font-size: 9px;
		cursor: pointer;
		font-family: inherit;
	}
	.theory-add-btn:hover { background: rgba(52, 211, 153, 0.15); }

	/* Theory cards */
	.theory-list { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
	.theory-card {
		padding: 10px 12px;
		background: rgba(212, 199, 163, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-left: 3px solid;
		border-radius: 4px;
	}
	.theory-card-title { font-size: 11px; font-weight: 600; margin-bottom: 6px; }
	.theory-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
	.theory-bar-bg {
		flex: 1;
		height: 6px;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}
	.theory-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
	.theory-pct { font-size: 10px; font-weight: 700; min-width: 32px; text-align: right; }
	.theory-stats { display: flex; gap: 12px; font-size: 9px; }
	.stat-support { color: #34d399; }
	.stat-contradict { color: #f87171; }

	/* Inspector */
	.inspector {
		margin: 8px;
		padding: 12px;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.15);
		border-radius: 6px;
	}
	.inspector-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 700;
		margin-bottom: 8px;
		padding-bottom: 6px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}
	.inspector-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}
	.inspector-label { font-size: 9px; letter-spacing: 0.1em; color: rgba(212, 199, 163, 0.4); }
	.inspector-value { font-size: 10px; font-weight: 600; }
	.inspector-summary {
		margin-top: 6px;
		padding: 6px 8px;
		background: rgba(212, 199, 163, 0.03);
		border-radius: 4px;
		font-size: 10px;
		line-height: 1.4;
		color: rgba(212, 199, 163, 0.6);
	}
	.inspector-connections { margin-top: 8px; }
	.inspector-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 3px 0;
		font-size: 10px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.04);
	}
	.link-strength { font-weight: 700; font-size: 9px; }
	.link-remove {
		background: none;
		border: none;
		color: rgba(248, 113, 113, 0.5);
		cursor: pointer;
		font-size: 10px;
		padding: 0 4px;
	}
	.link-remove:hover { color: #f87171; }
</style>
