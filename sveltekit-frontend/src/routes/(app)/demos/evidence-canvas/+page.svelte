<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import CanvasEditor from '$lib/components/CanvasEditor.svelte';
	import FabricCanvas from '$lib/components/canvas/FabricCanvas.svelte';
	import EvidenceCanvasEditor from '$lib/components/canvas/EvidenceCanvasEditor.svelte';
	import RecursiveEvidenceVisualization from '$lib/components/canvas/RecursiveEvidenceVisualization.svelte';
	import ProvenanceGraph from '$lib/components/source-validation/ProvenanceGraph.svelte';
	import EvidenceBoard from '$lib/components/evidence/EvidenceBoard.svelte';
	import CanvasBoard from '$lib/components/yorha/_simulations/CanvasBoard.svelte';
	import YoRHaEvidenceBoard from '$lib/components/yorha/EvidenceBoard.svelte';
	import DraggableEvidenceNode from '$lib/components/evidence/DraggableEvidenceNode.svelte';
	import EvidenceNode from '$lib/components/evidence/EvidenceNode.svelte';
	import EvidenceConnections from '$lib/components/evidence/EvidenceConnections.svelte';
	import EvidenceBoardToolbar from '$lib/components/evidence/EvidenceBoardToolbar.svelte';
	import EvidenceCanvas from '$lib/components/evidence/EvidenceCanvas.svelte';

	let activeView = $state<'canvas-editor' | 'fabric' | 'evidence-canvas' | 'recursive' | 'provenance' | 'evidence-board' | 'canvas-board' | 'yorha-board' | 'draggable-nodes' | 'node-graph' | 'ai-canvas'>('canvas-editor');
	let showSidebar = $state(true);
	let selectedEvidenceId = $state<string | null>(null);
	let canvasWidth = $derived(showSidebar ? 920 : 1200);

	// Rich sample evidence data
	const sampleEvidence = [
		{ id: 'ev-001', title: 'Crime Scene Photos (Set A)', evidenceType: 'image' },
		{ id: 'ev-002', title: 'Witness Statement - Sarah Johnson', evidenceType: 'document' },
		{ id: 'ev-003', title: 'Surveillance Footage (Cam 3, 22:15-23:45)', evidenceType: 'video' },
		{ id: 'ev-004', title: 'Forensic Report #2024-A1 — Ballistics', evidenceType: 'document' },
		{ id: 'ev-005', title: 'Phone Records (Jan 15 - Mar 20)', evidenceType: 'document' },
		{ id: 'ev-006', title: 'DNA Analysis Results — CODIS Match', evidenceType: 'document' },
		{ id: 'ev-007', title: 'Autopsy Report — Medical Examiner', evidenceType: 'document' },
		{ id: 'ev-008', title: 'Financial Records — First National', evidenceType: 'document' }
	];

	const sampleCitations = [
		{ id: 'cit-001', source: 'People v. Martinez (2023) 45 Cal.4th 712' },
		{ id: 'cit-002', source: 'PC 187(a) - Murder in the First Degree' },
		{ id: 'cit-003', source: 'Evidence Code 352 - Probative vs. Prejudicial' },
		{ id: 'cit-004', source: 'Brady v. Maryland, 373 U.S. 83 (1963)' },
		{ id: 'cit-005', source: 'Daubert v. Merrell Dow, 509 U.S. 579 (1993)' }
	];

	// Evidence items for EvidenceCanvasEditor
	const canvasEvidenceItems = sampleEvidence.map(e => ({
		id: e.id,
		caseId: 'CASE-2024-001',
		title: e.title,
		description: `Primary ${e.evidenceType} evidence — Chain of custody verified`,
		evidenceType: e.evidenceType,
		fileName: `${e.id}.${e.evidenceType === 'image' ? 'jpg' : e.evidenceType === 'video' ? 'mp4' : 'pdf'}`,
		aiTags: ['forensic', 'primary', e.evidenceType, 'chain-verified']
	}));

	// D3 Knowledge Provenance Graph — maps tech stack + evidence relationships
	const graphEntities = [
		'SvelteKit 2', 'Svelte 5 Runes', 'Drizzle ORM 0.44', 'PostgreSQL 16',
		'Qdrant Vector DB', 'Ollama gemma3-legal', 'WebGPU', 'ONNX Runtime',
		'Fabric.js', 'D3.js v7', 'Canvas API', 'IndexedDB + LokiJS',
		'Redis Cache', 'RabbitMQ', 'Evidence Pipeline', 'RAG Pipeline'
	];

	const graphRelationships = [
		{ from: 'SvelteKit 2', to: 'Svelte 5 Runes', type: 'USES' },
		{ from: 'SvelteKit 2', to: 'Drizzle ORM 0.44', type: 'DEPENDS_ON' },
		{ from: 'Drizzle ORM 0.44', to: 'PostgreSQL 16', type: 'DEPENDS_ON' },
		{ from: 'SvelteKit 2', to: 'Qdrant Vector DB', type: 'USES' },
		{ from: 'Evidence Pipeline', to: 'Ollama gemma3-legal', type: 'USES' },
		{ from: 'Evidence Pipeline', to: 'Qdrant Vector DB', type: 'DEPENDS_ON' },
		{ from: 'Evidence Pipeline', to: 'RabbitMQ', type: 'USES' },
		{ from: 'RAG Pipeline', to: 'Qdrant Vector DB', type: 'DEPENDS_ON' },
		{ from: 'RAG Pipeline', to: 'Ollama gemma3-legal', type: 'USES' },
		{ from: 'ONNX Runtime', to: 'WebGPU', type: 'USES' },
		{ from: 'Fabric.js', to: 'Canvas API', type: 'IMPLEMENTS' },
		{ from: 'D3.js v7', to: 'SvelteKit 2', type: 'IMPLEMENTS' },
		{ from: 'IndexedDB + LokiJS', to: 'Redis Cache', type: 'REFERENCES' },
		{ from: 'Svelte 5 Runes', to: 'IndexedDB + LokiJS', type: 'HAS_FEATURE' },
		{ from: 'SvelteKit 2', to: 'Redis Cache', type: 'USES' }
	];

	// View metadata
	const views: Record<string, { title: string; desc: string; tech: string[]; icon: string }> = {
		'canvas-editor': {
			title: 'Evidence Canvas Editor',
			desc: 'Full-featured evidence canvas with drag-and-drop placement, evidence-citation linking, and interactive node editing. Built for constructing visual case narratives.',
			tech: ['Canvas API', 'Drag & Drop', '$state()', '$effect()'],
			icon: 'pen-tool'
		},
		'fabric': {
			title: 'Fabric.js Canvas',
			desc: 'Low-level Fabric.js integration with grid snapping, object manipulation, and state serialization. Supports collaborative editing workflows.',
			tech: ['Fabric.js', 'Grid Snap', 'JSON Serialization'],
			icon: 'layers'
		},
		'evidence-canvas': {
			title: 'Evidence-Specific Canvas',
			desc: 'Purpose-built canvas for legal evidence visualization with AI tag overlays, file type detection, and case-specific evidence linking.',
			tech: ['Canvas 2D', 'AI Tags', 'Evidence Pipeline', 'Qdrant'],
			icon: 'search'
		},
		'recursive': {
			title: 'Recursive Evidence Hierarchy',
			desc: 'Hierarchical evidence chain viewer with tree, radial, and force-directed layout modes. Visualizes parent-child evidence relationships and chain of custody.',
			tech: ['Tree Layout', 'Radial Layout', 'Force-Directed', 'Canvas 2D'],
			icon: 'git-fork'
		},
		'provenance': {
			title: 'Knowledge Provenance Graph',
			desc: 'D3.js force-directed graph showing the platform tech stack as a knowledge graph. Interactive with drag, zoom, and typed relationship legends.',
			tech: ['D3.js v7', 'SVG Force Simulation', 'Arrow Markers', 'Collision Detection'],
			icon: 'share-2'
		},
		'evidence-board': {
			title: 'Evidence Relationship Board',
			desc: 'Canvas-based evidence relationship board with drag-and-drop nodes, connection lines, and spatial evidence organization for case analysis.',
			tech: ['Canvas API', 'Drag & Drop', 'Relationship Mapping', '$derived()'],
			icon: 'clipboard'
		},
		'canvas-board': {
			title: 'YoRHa Canvas Board',
			desc: 'Interactive drawing canvas with YoRHa-styled color palette, brush/eraser tools, adjustable brush size, and device pixel ratio support for crisp rendering.',
			tech: ['Canvas 2D', 'Drawing Tools', 'YoRHa Palette', 'DPR Scaling'],
			icon: 'palette'
		},
		'yorha-board': {
			title: 'YoRHa Evidence Network',
			desc: 'SVG-based evidence node graph with API-backed connections. Drag nodes to rearrange, click to inspect, auto-loads from /api/yorha/evidence endpoints.',
			tech: ['SVG', 'API Fetch', 'Drag & Drop', '$props()'],
			icon: 'link'
		},
		'draggable-nodes': {
			title: 'Draggable Evidence Nodes',
			desc: 'Interactive draggable evidence nodes with AI analysis, metadata display, connection indicators, and real-time position updates. Each node represents an evidence item with type-specific icons.',
			tech: ['Drag & Drop', 'AI Analysis', '$bindable()', 'Lucide Icons'],
			icon: 'grip'
		},
		'node-graph': {
			title: 'Evidence Node Graph',
			desc: 'Interactive node-based evidence graph with typed nodes (audio/video/document/photo/forensic), confidence badges, canvas-drawn connections with strength indicators, and a board toolbar for actions.',
			tech: ['Canvas 2D', 'EvidenceNode', 'EvidenceConnections', 'Toolbar'],
			icon: 'microscope'
		},
		'ai-canvas': {
			title: 'AI Evidence Canvas',
			desc: 'Drag-and-drop evidence workspace with AI-powered cosine similarity analysis via embeddinggemma, connection types (similarity/temporal/causal/reference), SVG path connections, and JSON export.',
			tech: ['SVG Paths', 'embeddinggemma', 'Cosine Similarity', 'Drag & Drop'],
			icon: 'brain'
		}
	};

	// Node graph data — EvidenceNode + EvidenceConnections
	const now = new Date().toISOString();
	let nodeGraphNodes = $state([
		{ id: 'ev-001', x: 50, y: 30, evidenceType: 'document', title: 'Forensic Report #2024-A1', confidence: 0.95, description: 'Ballistics analysis confirming weapon match', caseId: 'CASE-2024-001', canvasPosition: { x: 50, y: 30 }, uploadedAt: now, updatedAt: now },
		{ id: 'ev-002', x: 320, y: 30, evidenceType: 'photo', title: 'Crime Scene Photos (Set A)', confidence: 0.88, description: 'Exterior and interior scene documentation', caseId: 'CASE-2024-001', canvasPosition: { x: 320, y: 30 }, uploadedAt: now, updatedAt: now },
		{ id: 'ev-003', x: 50, y: 250, evidenceType: 'witness_statement', title: 'Witness Statement — S. Johnson', confidence: 0.72, description: 'Eyewitness account of events at 22:15', caseId: 'CASE-2024-001', canvasPosition: { x: 50, y: 250 }, uploadedAt: now, updatedAt: now },
		{ id: 'ev-004', x: 320, y: 250, evidenceType: 'video', title: 'Surveillance Footage (Cam 3)', confidence: 0.91, description: 'Building entrance camera, 22:00-23:45', caseId: 'CASE-2024-001', canvasPosition: { x: 320, y: 250 }, uploadedAt: now, updatedAt: now },
		{ id: 'ev-005', x: 590, y: 140, evidenceType: 'forensic', title: 'DNA Analysis — CODIS Match', confidence: 0.99, description: 'Confirmed match to suspect in CODIS database', metadata: { lab: 'State Crime Lab', method: 'STR Analysis' }, caseId: 'CASE-2024-001', canvasPosition: { x: 590, y: 140 }, uploadedAt: now, updatedAt: now },
	]);

	const nodeGraphConnections = [
		{ id: 'c1', caseId: 'CASE-2024-001', fromEvidenceId: 'ev-001', toEvidenceId: 'ev-005', connectionType: 'corroborates', label: 'Ballistics → DNA', notes: 'Weapon matched to DNA evidence', strength: 0.92, isVisible: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
		{ id: 'c2', caseId: 'CASE-2024-001', fromEvidenceId: 'ev-002', toEvidenceId: 'ev-004', connectionType: 'temporal', label: 'Scene ↔ Footage', notes: 'Photos match footage timestamp', strength: 0.85, isVisible: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
		{ id: 'c3', caseId: 'CASE-2024-001', fromEvidenceId: 'ev-003', toEvidenceId: 'ev-004', connectionType: 'references', label: 'Witness ↔ Video', notes: 'Witness timeline aligns with video', strength: 0.65, isVisible: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
		{ id: 'c4', caseId: 'CASE-2024-001', fromEvidenceId: 'ev-001', toEvidenceId: 'ev-002', connectionType: 'supports', label: 'Report → Photos', notes: 'Report references scene photos', strength: 0.78, isVisible: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
	];

	let currentView = $derived(views[activeView]);

	// Platform architecture info for sidebar
	const architecture = {
		client: [
			{ name: 'Svelte 5 Runes', status: 'active', detail: '$state / $derived / $effect / $props' },
			{ name: 'WebGPU + ONNX', status: 'active', detail: 'gemma 270M quantized (418MB)' },
			{ name: 'IndexedDB + LokiJS', status: 'active', detail: '7-day TTL + 5-10min in-memory' },
			{ name: 'Canvas API', status: 'active', detail: '6 visualization engines' },
			{ name: 'D3.js v7', status: 'active', detail: 'Force-directed + SVG rendering' }
		],
		server: [
			{ name: 'SvelteKit 2 SSR', status: 'active', detail: 'adapter-node for Docker' },
			{ name: 'Drizzle ORM 0.44', status: 'active', detail: '70+ tables, pgvector' },
			{ name: 'Redis Cache', status: 'active', detail: 'Configurable TTL, cross-request' },
			{ name: 'Qdrant Vector DB', status: 'active', detail: '768-dim, 6 collections' },
			{ name: 'Ollama LLM', status: 'active', detail: 'gemma3-legal + embeddinggemma' }
		],
		pipeline: [
			{ name: 'Evidence Pipeline', status: 'active', detail: '8 stages: upload → embedding' },
			{ name: 'RAG Pipeline', status: 'active', detail: 'Qdrant search → LLM generation' },
			{ name: 'KAG Pipeline', status: 'active', detail: 'Schema validation + W3C checks' },
			{ name: 'RabbitMQ', status: 'active', detail: '7 queues, 5 exchanges' },
			{ name: 'FastMCP', status: 'active', detail: '9 agentic tools' }
		]
	};
</script>

<div class="ec-page">
	<!-- Header -->
	<header class="ec-header">
		<div class="ec-header-left">
			<div class="ec-icon-badge">
				<Icon name="monitor" />
			</div>
			<div>
				<h1 class="ec-title">Evidence Canvas</h1>
				<p class="ec-subtitle">11 visualization engines — Canvas API, Fabric.js, D3.js, SVG, YoRHa, Evidence Network, Node Graph, AI Canvas</p>
			</div>
		</div>
		<div class="ec-stats">
			<span class="ec-stat"><Icon name="file-search" size={13} /> <strong>{sampleEvidence.length}</strong> Evidence</span>
			<span class="ec-stat-divider"></span>
			<span class="ec-stat"><Icon name="scale" size={13} /> <strong>{sampleCitations.length}</strong> Citations</span>
			<span class="ec-stat-divider"></span>
			<span class="ec-stat"><Icon name="share-2" size={13} /> <strong>{graphEntities.length}</strong> Entities</span>
			<span class="ec-stat-divider"></span>
			<span class="ec-stat"><Icon name="link" size={13} /> <strong>{graphRelationships.length}</strong> Relations</span>
		</div>
	</header>

	<!-- View Toggle Bar -->
	<div class="ec-view-bar">
		{#each Object.entries(views) as [key, view] (key)}
			<button
				onclick={() => (activeView = key as typeof activeView)}
				class="ec-view-btn {activeView === key ? 'active' : ''}"
			>
				<Icon name={view.icon} size={14} />
				{view.title.split(' ').slice(0, 2).join(' ')}
			</button>
		{/each}
		<div class="ec-view-bar-spacer"></div>
		<button
			onclick={() => (showSidebar = !showSidebar)}
			class="ec-view-btn panel-toggle"
		>
			<Icon name={showSidebar ? 'panel-right-close' : 'panel-right-open'} size={14} />
			{showSidebar ? 'Hide' : 'Show'} Panel
		</button>
	</div>

	<!-- Description Bar -->
	<div class="ec-desc-bar">
		<div class="ec-desc-left">
			<h2 class="ec-desc-title"><Icon name={currentView.icon} size={18} /> {currentView.title}</h2>
			<p class="ec-desc-text">{currentView.desc}</p>
		</div>
		<div class="ec-desc-tags">
			{#each currentView.tech as tech}
				<span class="ec-tag">{tech}</span>
			{/each}
		</div>
	</div>

	<!-- Main Content -->
	<div class="ec-content">
		<!-- Canvas Area -->
		<div class="ec-canvas-area">
			{#if activeView === 'canvas-editor'}
				<div class="ec-canvas-frame">
					<CanvasEditor
						canvasState={null}
						reportId="demo-report-001"
						evidence={sampleEvidence}
						citationPoints={sampleCitations}
						save={async (state) => { console.log('Canvas state saved:', state); }}
					/>
				</div>
			{:else if activeView === 'fabric'}
				<div class="ec-canvas-frame">
					<FabricCanvas
						width={canvasWidth}
						height={600}
						caseId="CASE-2024-001"
						readOnly={false}
						gridEnabled={true}
						snapToGrid={true}
						onSave={async (data) => { console.log('Fabric canvas saved:', data); }}
					/>
				</div>
			{:else if activeView === 'evidence-canvas'}
				<div class="ec-canvas-frame">
					<EvidenceCanvasEditor
						reportId="demo-report-001"
						evidence={canvasEvidenceItems}
						width={canvasWidth}
						height={600}
					/>
				</div>
			{:else if activeView === 'recursive'}
				<div class="ec-canvas-frame">
					<RecursiveEvidenceVisualization
						caseId="CASE-2024-001"
						width={canvasWidth}
						height={600}
						enableInteraction={true}
						showMetrics={true}
					/>
				</div>
			{:else if activeView === 'provenance'}
				<div class="ec-canvas-frame">
					<ProvenanceGraph
						validationId="demo-validation-001-abcdef1234567890"
						entities={graphEntities}
						relationships={graphRelationships}
						width={canvasWidth}
						height={600}
					/>
				</div>
			{:else if activeView === 'evidence-board'}
				<div class="ec-canvas-frame">
					<EvidenceBoard caseId="CASE-2024-001" />
				</div>
			{:else if activeView === 'canvas-board'}
				<div class="ec-canvas-frame">
					<CanvasBoard
						width={canvasWidth}
						height={600}
						enableDrawing={true}
						showToolbar={true}
						onClose={() => (activeView = 'canvas-editor')}
					/>
				</div>
			{:else if activeView === 'yorha-board'}
				<div class="ec-canvas-frame">
					<YoRHaEvidenceBoard caseId="CASE-2024-001" />
				</div>
			{:else if activeView === 'node-graph'}
				<div class="ec-canvas-toolbar">
					<EvidenceBoardToolbar onAction={(action) => console.log('Board action:', action)} />
				</div>
				<div class="ec-canvas-frame node-graph" style="min-height: 500px; position: relative;">
					<EvidenceConnections nodes={nodeGraphNodes} connections={nodeGraphConnections} />
					{#each nodeGraphNodes as node (node.id)}
						<EvidenceNode
							{node}
							isSelected={selectedEvidenceId === node.id}
							onSelect={({ nodeId }) => (selectedEvidenceId = selectedEvidenceId === nodeId ? null : nodeId)}
							onMove={({ nodeId, x, y }) => { nodeGraphNodes = nodeGraphNodes.map(n => n.id === nodeId ? { ...n, x, y } : n); }}
							onLink={({ nodeId }) => console.log('Link from:', nodeId)}
						/>
					{/each}
				</div>
			{:else if activeView === 'draggable-nodes'}
				<div class="ec-canvas-frame" style="min-height: 500px;">
					<p class="ec-canvas-hint">Drag evidence nodes to rearrange. Click to select, use Analyze to run AI analysis.</p>
					<div class="relative" style="height: 450px;">
						{#each sampleEvidence as item, i (item.id)}
							<DraggableEvidenceNode
								evidence={{
									id: item.id,
									title: item.title,
									type: item.evidenceType === 'image' ? 'image' : item.evidenceType === 'video' ? 'video' : 'document',
									x: 60 + (i % 4) * 220,
									y: 40 + Math.floor(i / 4) * 180,
									connections: i > 0 ? [sampleEvidence[i - 1].id] : [],
									tags: ['case-001', 'primary']
								}}
								selected={selectedEvidenceId === item.id}
								onSelect={(id) => (selectedEvidenceId = selectedEvidenceId === id ? null : id)}
								onAnalyze={(id) => console.log('Analyze evidence:', id)}
							/>
						{/each}
					</div>
				</div>
			{:else if activeView === 'ai-canvas'}
				<div class="ec-canvas-frame no-pad">
					<EvidenceCanvas
						caseId="CASE-2024-001"
						initialEvidence={sampleEvidence.map((e, i) => ({
							id: e.id,
							title: e.title,
							evidenceType: e.evidenceType,
							content: `Primary ${e.evidenceType} evidence — Chain of custody verified`,
							x: 50 + (i % 3) * 300,
							y: 40 + Math.floor(i / 3) * 160
						}))}
					/>
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		{#if showSidebar}
			<div class="ec-sidebar">
				<!-- Evidence Items Panel -->
				<div class="ec-sidebar-panel">
					<h3 class="ec-panel-title"><Icon name="file-search" size={14} /> Evidence ({sampleEvidence.length})</h3>
					<div class="ec-panel-list">
						{#each sampleEvidence as item (item.id)}
							<button
								onclick={() => (selectedEvidenceId = selectedEvidenceId === item.id ? null : item.id)}
								class="ec-evidence-item {selectedEvidenceId === item.id ? 'selected' : ''}"
							>
								<div class="ec-evidence-item-inner">
									<Icon name={item.evidenceType === 'image' ? 'image' : item.evidenceType === 'video' ? 'video' : 'file-text'} size={14} />
									<div class="ec-evidence-item-text">
										<p class="ec-evidence-item-title">{item.title}</p>
										<p class="ec-evidence-item-id">{item.id}</p>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- Citations Panel -->
				<div class="ec-sidebar-panel">
					<h3 class="ec-panel-title"><Icon name="scale" size={14} /> Citations ({sampleCitations.length})</h3>
					<div class="ec-panel-citations">
						{#each sampleCitations as cit (cit.id)}
							<div class="ec-citation-item">
								<span class="ec-citation-id">[{cit.id}]</span>
								<span class="ec-citation-source">{cit.source}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Architecture Panel -->
				<div class="bg-panelSoft rounded-lg p-4 border border-sand/10">
					<h3 class="text-sm font-semibold text-sand mb-3">Platform Architecture</h3>

					<div class="space-y-3">
						<div>
							<h4 class="text-[10px] font-bold text-accent uppercase tracking-wider mb-1.5">Client</h4>
							{#each architecture.client as item}
								<div class="flex items-center justify-between text-[11px] py-0.5">
									<span class="text-sand/80">{item.name}</span>
									<span class="text-accent/70">{item.detail}</span>
								</div>
							{/each}
						</div>

						<div>
							<h4 class="text-[10px] font-bold text-info uppercase tracking-wider mb-1.5">Server</h4>
							{#each architecture.server as item}
								<div class="flex items-center justify-between text-[11px] py-0.5">
									<span class="text-sand/80">{item.name}</span>
									<span class="text-info/70">{item.detail}</span>
								</div>
							{/each}
						</div>

						<div>
							<h4 class="text-[10px] font-bold text-warning uppercase tracking-wider mb-1.5">Pipeline</h4>
							{#each architecture.pipeline as item}
								<div class="flex items-center justify-between text-[11px] py-0.5">
									<span class="text-sand/80">{item.name}</span>
									<span class="text-warning/70">{item.detail}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Tech Stack Footer -->
	<div class="ec-footer">
		<h3 class="ec-footer-title"><Icon name="cpu" size={14} /> Full Tech Stack</h3>
		<div class="ec-footer-tags">
			{#each ['Svelte 5 Runes', 'SvelteKit 2', 'Drizzle ORM 0.44', 'PostgreSQL 16 + pgvector', 'Qdrant (768-dim)', 'Ollama gemma3-legal', 'Redis Cache', 'RabbitMQ', 'WebGPU + ONNX', 'IndexedDB + LokiJS', 'Fabric.js', 'D3.js v7', 'Canvas 2D', 'SVG Force', 'XState v5', 'FastMCP (9 tools)'] as tech}
				<span class="ec-footer-tag">{tech}</span>
			{/each}
		</div>
	</div>
</div>

<style>
	.ec-page {
		max-width: 90rem;
		margin: 0 auto;
		padding: 1.5rem 1rem;
	}

	/* Header */
	.ec-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}
	.ec-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}
	.ec-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(167, 139, 250, 0.12));
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
		flex-shrink: 0;
	}
	.ec-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		line-height: 1.3;
	}
	.ec-subtitle {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.4);
		margin-top: 0.125rem;
		max-width: 36rem;
	}
	.ec-stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
	}
	.ec-stat {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.ec-stat strong {
		color: rgba(212, 199, 163, 0.85);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.ec-stat-divider {
		width: 1px;
		height: 1rem;
		background: rgba(212, 199, 163, 0.12);
	}

	/* View Toggle Bar */
	.ec-view-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.75rem;
		align-items: center;
	}
	.ec-view-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.6);
	}
	.ec-view-btn:hover {
		background: rgba(212, 199, 163, 0.1);
		color: rgba(212, 199, 163, 0.85);
	}
	.ec-view-btn.active {
		background: rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.95);
		border-color: rgba(96, 165, 250, 0.3);
		box-shadow: 0 0 8px rgba(96, 165, 250, 0.1);
	}
	.ec-view-btn.panel-toggle {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.4);
	}
	.ec-view-bar-spacer {
		flex: 1;
	}

	/* Description Bar */
	.ec-desc-bar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.12);
		border-radius: 0.5rem;
	}
	.ec-desc-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
	}
	.ec-desc-text {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.5);
		margin-top: 0.25rem;
	}
	.ec-desc-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		flex-shrink: 0;
	}
	.ec-tag {
		padding: 0.125rem 0.5rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
		font-size: 0.6875rem;
		border-radius: 9999px;
		white-space: nowrap;
	}

	/* Main Content Layout */
	.ec-content {
		display: flex;
		gap: 1.25rem;
	}
	.ec-canvas-area {
		flex: 1;
		min-width: 0;
	}
	.ec-canvas-frame {
		background: rgba(20, 22, 28, 0.8);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
		padding: 1rem;
		position: relative;
	}
	.ec-canvas-frame.no-pad {
		padding: 0;
		overflow: hidden;
	}
	.ec-canvas-frame.node-graph {
		margin-top: 0.5rem;
	}
	.ec-canvas-toolbar {
		background: rgba(20, 22, 28, 0.6);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}
	.ec-canvas-hint {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.4);
		margin-bottom: 0.75rem;
	}

	/* Sidebar */
	.ec-sidebar {
		width: 340px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.ec-sidebar-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
		padding: 0.875rem;
	}
	.ec-panel-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.75rem 0;
	}
	.ec-panel-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 240px;
		overflow-y: auto;
	}
	.ec-evidence-item {
		width: 100%;
		text-align: left;
		padding: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		color: inherit;
	}
	.ec-evidence-item:hover {
		border-color: rgba(212, 199, 163, 0.2);
		background: rgba(212, 199, 163, 0.04);
	}
	.ec-evidence-item.selected {
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(96, 165, 250, 0.06);
	}
	.ec-evidence-item-inner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(212, 199, 163, 0.6);
	}
	.ec-evidence-item-text {
		min-width: 0;
	}
	.ec-evidence-item-title {
		font-size: 0.6875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.85);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ec-evidence-item-id {
		font-size: 0.5625rem;
		color: rgba(212, 199, 163, 0.3);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		margin: 0;
	}

	/* Citations Panel */
	.ec-panel-citations {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.ec-citation-item {
		padding: 0.375rem 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.375rem;
		font-size: 0.6875rem;
	}
	.ec-citation-id {
		color: rgba(96, 165, 250, 0.8);
		font-weight: 600;
	}
	.ec-citation-source {
		color: rgba(212, 199, 163, 0.5);
		margin-left: 0.25rem;
	}

	/* Footer */
	.ec-footer {
		margin-top: 1.5rem;
		padding: 0.875rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
	}
	.ec-footer-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.8);
		margin: 0 0 0.5rem 0;
	}
	.ec-footer-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.ec-footer-tag {
		padding: 0.25rem 0.5rem;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 0.25rem;
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.5);
	}
</style>
