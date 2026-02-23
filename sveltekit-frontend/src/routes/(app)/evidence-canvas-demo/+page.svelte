<script lang="ts">
	import CanvasEditor from '$lib/components/CanvasEditor.svelte';
	import FabricCanvas from '$lib/components/canvas/FabricCanvas.svelte';
	import EvidenceCanvasEditor from '$lib/components/canvas/EvidenceCanvasEditor.svelte';
	import RecursiveEvidenceVisualization from '$lib/components/canvas/RecursiveEvidenceVisualization.svelte';
	import ProvenanceGraph from '$lib/components/source-validation/ProvenanceGraph.svelte';
	import EvidenceBoard from '$lib/components/evidence/EvidenceBoard.svelte';
	import CanvasBoard from '$lib/components/yorha/_simulations/CanvasBoard.svelte';
	import YoRHaEvidenceBoard from '$lib/components/yorha/EvidenceBoard.svelte';

	let activeView = $state<'canvas-editor' | 'fabric' | 'evidence-canvas' | 'recursive' | 'provenance' | 'evidence-board' | 'canvas-board' | 'yorha-board'>('canvas-editor');
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
			icon: '🎨'
		},
		'fabric': {
			title: 'Fabric.js Canvas',
			desc: 'Low-level Fabric.js integration with grid snapping, object manipulation, and state serialization. Supports collaborative editing workflows.',
			tech: ['Fabric.js', 'Grid Snap', 'JSON Serialization'],
			icon: '🧵'
		},
		'evidence-canvas': {
			title: 'Evidence-Specific Canvas',
			desc: 'Purpose-built canvas for legal evidence visualization with AI tag overlays, file type detection, and case-specific evidence linking.',
			tech: ['Canvas 2D', 'AI Tags', 'Evidence Pipeline', 'Qdrant'],
			icon: '🔍'
		},
		'recursive': {
			title: 'Recursive Evidence Hierarchy',
			desc: 'Hierarchical evidence chain viewer with tree, radial, and force-directed layout modes. Visualizes parent-child evidence relationships and chain of custody.',
			tech: ['Tree Layout', 'Radial Layout', 'Force-Directed', 'Canvas 2D'],
			icon: '🌳'
		},
		'provenance': {
			title: 'Knowledge Provenance Graph',
			desc: 'D3.js force-directed graph showing the platform tech stack as a knowledge graph. Interactive with drag, zoom, and typed relationship legends.',
			tech: ['D3.js v7', 'SVG Force Simulation', 'Arrow Markers', 'Collision Detection'],
			icon: '🕸'
		},
		'evidence-board': {
			title: 'Evidence Relationship Board',
			desc: 'Canvas-based evidence relationship board with drag-and-drop nodes, connection lines, and spatial evidence organization for case analysis.',
			tech: ['Canvas API', 'Drag & Drop', 'Relationship Mapping', '$derived()'],
			icon: '📋'
		},
		'canvas-board': {
			title: 'YoRHa Canvas Board',
			desc: 'Interactive drawing canvas with YoRHa-styled color palette, brush/eraser tools, adjustable brush size, and device pixel ratio support for crisp rendering.',
			tech: ['Canvas 2D', 'Drawing Tools', 'YoRHa Palette', 'DPR Scaling'],
			icon: '🖌'
		},
		'yorha-board': {
			title: 'YoRHa Evidence Network',
			desc: 'SVG-based evidence node graph with API-backed connections. Drag nodes to rearrange, click to inspect, auto-loads from /api/yorha/evidence endpoints.',
			tech: ['SVG', 'API Fetch', 'Drag & Drop', '$props()'],
			icon: '🔗'
		}
	};

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

<div class="max-w-[1440px] mx-auto px-4 py-8">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold text-sand mb-2">Evidence Canvas Demo</h1>
		<p class="text-sand/60 text-lg">8 visualization engines — Canvas API, Fabric.js, D3.js, SVG, YoRHa Drawing, Evidence Network</p>
		<div class="mt-2 flex items-center gap-4 text-sm text-sand/40">
			<span>{sampleEvidence.length} evidence items</span>
			<span>{sampleCitations.length} citations</span>
			<span>{graphEntities.length} graph entities</span>
			<span>{graphRelationships.length} relationships</span>
		</div>
	</div>

	<!-- View Toggle Bar -->
	<div class="flex flex-wrap gap-2 mb-4">
		{#each Object.entries(views) as [key, view] (key)}
			<button
				onclick={() => (activeView = key as typeof activeView)}
				class="px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5
					{activeView === key ? 'bg-accent text-white shadow-md' : 'bg-panelSoft text-sand hover:bg-panel'}"
			>
				<span>{view.icon}</span>
				{view.title.split(' ').slice(0, 2).join(' ')}
			</button>
		{/each}
		<div class="ml-auto">
			<button
				onclick={() => (showSidebar = !showSidebar)}
				class="px-3 py-2 rounded-lg text-xs bg-panelSoft text-sand hover:bg-panel transition"
			>
				{showSidebar ? 'Hide Panel' : 'Show Panel'}
			</button>
		</div>
	</div>

	<!-- Description Bar -->
	<div class="mb-6 p-3 bg-info/5 border border-info/20 rounded-lg">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold text-sand">{currentView.icon} {currentView.title}</h2>
				<p class="text-sm text-sand/60 mt-1">{currentView.desc}</p>
			</div>
			<div class="flex flex-wrap gap-1.5 shrink-0">
				{#each currentView.tech as tech}
					<span class="px-2 py-0.5 bg-info/10 text-info text-xs rounded-full whitespace-nowrap">{tech}</span>
				{/each}
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex gap-6">
		<!-- Canvas Area -->
		<div class="flex-1 min-w-0">
			{#if activeView === 'canvas-editor'}
				<div class="bg-white rounded-lg shadow p-6">
					<CanvasEditor
						canvasState={null}
						reportId="demo-report-001"
						evidence={sampleEvidence}
						citationPoints={sampleCitations}
						save={async (state) => { console.log('Canvas state saved:', state); }}
					/>
				</div>
			{:else if activeView === 'fabric'}
				<div class="bg-white rounded-lg shadow p-6">
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
				<div class="bg-white rounded-lg shadow p-6">
					<EvidenceCanvasEditor
						reportId="demo-report-001"
						evidence={canvasEvidenceItems}
						width={canvasWidth}
						height={600}
					/>
				</div>
			{:else if activeView === 'recursive'}
				<div class="bg-white rounded-lg shadow p-6">
					<RecursiveEvidenceVisualization
						caseId="CASE-2024-001"
						width={canvasWidth}
						height={600}
						enableInteraction={true}
						showMetrics={true}
					/>
				</div>
			{:else if activeView === 'provenance'}
				<div class="bg-white rounded-lg shadow p-6">
					<ProvenanceGraph
						validationId="demo-validation-001-abcdef1234567890"
						entities={graphEntities}
						relationships={graphRelationships}
						width={canvasWidth}
						height={600}
					/>
				</div>
			{:else if activeView === 'evidence-board'}
				<div class="bg-white rounded-lg shadow p-6">
					<EvidenceBoard caseId="CASE-2024-001" />
				</div>
			{:else if activeView === 'canvas-board'}
				<div class="bg-white rounded-lg shadow p-6">
					<CanvasBoard
						width={canvasWidth}
						height={600}
						enableDrawing={true}
						showToolbar={true}
						onClose={() => (activeView = 'canvas-editor')}
					/>
				</div>
			{:else if activeView === 'yorha-board'}
				<div class="bg-white rounded-lg shadow p-6">
					<YoRHaEvidenceBoard caseId="CASE-2024-001" />
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		{#if showSidebar}
			<div class="w-[340px] shrink-0 space-y-4">
				<!-- Evidence Items Panel -->
				<div class="bg-white rounded-lg shadow p-4">
					<h3 class="text-sm font-semibold text-gray-900 mb-3">Evidence ({sampleEvidence.length})</h3>
					<div class="space-y-1.5 max-h-[240px] overflow-y-auto">
						{#each sampleEvidence as item (item.id)}
							<button
								onclick={() => (selectedEvidenceId = selectedEvidenceId === item.id ? null : item.id)}
								class="w-full text-left p-2 rounded border text-sm transition
									{selectedEvidenceId === item.id ? 'border-accent bg-accent/5' : 'border-gray-100 hover:border-gray-200'}"
							>
								<div class="flex items-center gap-2">
									<span>{item.evidenceType === 'image' ? '🖼' : item.evidenceType === 'video' ? '🎬' : '📄'}</span>
									<div class="min-w-0">
										<p class="font-medium text-gray-800 truncate text-xs">{item.title}</p>
										<p class="text-[10px] text-gray-400">{item.id}</p>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- Citations Panel -->
				<div class="bg-white rounded-lg shadow p-4">
					<h3 class="text-sm font-semibold text-gray-900 mb-3">Citations ({sampleCitations.length})</h3>
					<div class="space-y-1.5">
						{#each sampleCitations as cit (cit.id)}
							<div class="p-2 border border-gray-100 rounded text-xs">
								<span class="text-blue-600 font-medium">[{cit.id}]</span>
								<span class="text-gray-500 ml-1">{cit.source}</span>
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
	<div class="mt-8 p-4 bg-panelSoft rounded-lg border border-sand/10">
		<h3 class="text-sm font-semibold text-sand mb-2">Full Tech Stack</h3>
		<div class="flex flex-wrap gap-2 text-xs text-sand/60">
			{#each ['Svelte 5 Runes', 'SvelteKit 2', 'Drizzle ORM 0.44', 'PostgreSQL 16 + pgvector', 'Qdrant (768-dim)', 'Ollama gemma3-legal', 'Redis Cache', 'RabbitMQ', 'WebGPU + ONNX', 'IndexedDB + LokiJS', 'Fabric.js', 'D3.js v7', 'Canvas 2D', 'SVG Force', 'XState v5', 'FastMCP (9 tools)'] as tech}
				<span class="px-2 py-1 bg-panel rounded">{tech}</span>
			{/each}
		</div>
	</div>
</div>
