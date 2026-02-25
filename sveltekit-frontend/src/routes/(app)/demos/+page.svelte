<script lang="ts">
	const demos = [
		{ href: '/demos/cache', label: 'Cache Demo', description: 'Multi-layer cache system: LokiJS + Redis + PostgreSQL with real-time stats', lines: 612 },
		{ href: '/demos/bits-ui', label: 'Bits UI Demo', description: 'Comprehensive bits-ui v2 Dialog, Select, Input showcase for legal AI', lines: 267 },
		{ href: '/demos/nes-elements', label: 'NES Elements Showcase', description: 'All NES.css HTML elements styled with retro gaming theme', lines: 233 },
		{ href: '/demos/gpu-cache', label: 'GPU Cache Integration', description: 'Multi-tier cache visualization (L0-L4) with GPU metrics', lines: 150 },
		{ href: '/demos/icons', label: 'Icon Container Demo', description: 'Dynamic icon loading and container component showcase', lines: 65 },
		{ href: '/demos/ace-pipeline', label: 'ACE Pipeline Demo', description: 'ACE Context Bubble + RAG Pipeline Chart — expandable pipeline metadata with confidence scoring', lines: 188 },
	];

	const existingDemos = [
		{ href: '/evidence-canvas-demo', label: 'Evidence Canvas Demo', description: '11 visualization engines: CanvasEditor, FabricCanvas, EvidenceCanvasEditor, RecursiveVisualization, ProvenanceGraph, EvidenceBoard, CanvasBoard, YoRHa EvidenceBoard, DraggableNodes, Node Graph, AI Canvas (embeddinggemma cosine similarity)' },
		{ href: '/evidence-library', label: 'Evidence Library', description: 'Evidence analysis dashboard with Rich Evidence Cards, custody timeline, police report generator, stats panel, and modal viewer' },
		{ href: '/nier-showcase', label: 'NieR Showcase', description: 'YoRHa UI showcase: CommandCenter, Terminal, SystemStatus, Dialogs, DiamondModal, BitsUI, DetectiveForm, NES CRT' },
		{ href: '/system-status', label: 'System Status', description: 'System health dashboard: StatusCards, SystemStatusPanel, SystemOverview, YoRHaSystemStatus' },
		{ href: '/ai-dashboard', label: 'AI Dashboard', description: 'Full AI inference demo: 20+ components, RAG pipeline chart, ACE context bubbles, ONNX/Ollama chat, source validation' },
		{ href: '/admin/dev-tools', label: 'Dev Tools (Cache Tab)', description: 'CachePerformanceDashboard + CacheMonitor + CacheDemo — real-time Redis stats, NES memory banks, cache CRUD operations' },
	];
</script>

<div style="max-width: 900px; margin: 0 auto; padding: 2rem;">
	<h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem;">Demo Components</h1>
	<p style="color: #6b7280; margin-bottom: 2rem;">Clean Svelte 5 demo components wired to routes for testing and showcase.</p>

	<h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem;">New Demos</h2>
	<div style="display: grid; gap: 1rem; margin-bottom: 2rem;">
		{#each demos as demo}
			<a href={demo.href} style="display: block; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; text-decoration: none; color: inherit; transition: border-color 0.2s, box-shadow 0.2s;">
				<div style="display: flex; justify-content: space-between; align-items: center;">
					<strong style="color: #2563eb;">{demo.label}</strong>
					<span style="font-size: 0.75rem; color: #9ca3af;">{demo.lines} lines</span>
				</div>
				<p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem;">{demo.description}</p>
			</a>
		{/each}
	</div>

	<h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem;">Existing Demo Routes</h2>
	<div style="display: grid; gap: 1rem;">
		{#each existingDemos as demo}
			<a href={demo.href} style="display: block; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; text-decoration: none; color: inherit;">
				<strong style="color: #059669;">{demo.label}</strong>
				<p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem;">{demo.description}</p>
			</a>
		{/each}
	</div>
</div>