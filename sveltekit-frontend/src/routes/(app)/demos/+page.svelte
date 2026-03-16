<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Demo {
		href: string;
		label: string;
		description: string;
		icon: string;
		lines?: number;
	}

	const demos: Demo[] = [
		{ href: '/demos/webgpu-memory-palace', label: 'WebGPU Memory Palace', description: 'GPU-accelerated 3D legal knowledge visualization: WGSL shaders, force-directed layout, 7-bit compression, WebGPU→CPU fallback', icon: 'box', lines: 354 },
		{ href: '/demos/vector-search', label: 'Vector Intelligence Demo', description: 'Semantic search with pgvector embeddings: filtering, sorting, batch selection, CSV export, similarity metrics', icon: 'brain', lines: 370 },
		{ href: '/demos/retro-recommendations', label: 'Retro Recommendation Engine', description: 'NES-style AI recommendations: category filters, sort controls, signal tokens, multi-modal confidence scoring', icon: 'sparkles', lines: 350 },
		{ href: '/demos/cache', label: 'Cache Demo', description: 'Multi-layer cache system: LokiJS + Redis + PostgreSQL with real-time stats', icon: 'database', lines: 612 },
		{ href: '/demos/bits-ui', label: 'Bits UI Demo', description: 'Comprehensive bits-ui v2 Dialog, Select, Input showcase for legal AI', icon: 'layout', lines: 267 },
		{ href: '/demos/nes-elements', label: 'NES Elements Showcase', description: 'All NES.css HTML elements styled with retro gaming theme', icon: 'gamepad-2', lines: 233 },
		{ href: '/demos/gpu-cache', label: 'GPU Cache Integration', description: 'Multi-tier cache visualization (L0-L4) with GPU metrics', icon: 'cpu', lines: 150 },
		{ href: '/demos/icons', label: 'Icon Container Demo', description: 'Dynamic icon loading and container component showcase', icon: 'image', lines: 65 },
		{ href: '/demos/ace-pipeline', label: 'ACE Pipeline Demo', description: 'ACE Context Bubble + RAG Pipeline Chart with confidence scoring', icon: 'git-branch', lines: 188 },
		{ href: '/demos/case-scoring', label: 'Case Scoring Dashboard', description: 'AI case risk scoring: dynamic factors, confidence metrics, priority filtering, risk-level visualization', icon: 'shield', lines: 543 },
		{ href: '/demos/document-summarizer', label: 'Legal Document Summarizer', description: 'AI summarization for contracts, judgments, briefs, statutes: quality metrics, compression ratios, key points', icon: 'file-text', lines: 786 },
		{ href: '/demos/knowledge-graph', label: 'Knowledge Graph', description: 'D3.js force-directed provenance graph: entity relationships, interactive nodes, RAG source validation', icon: 'git-merge', lines: 280 },
		{ href: '/demos/rag-documents', label: 'RAG Document Grid', description: 'Multi-document card grid: search, grid/list views, file sizes, embedding model info, document management', icon: 'file-stack', lines: 427 },
		{ href: '/demos/phantom-code-lab', label: 'Phantom Code Lab', description: 'Extracted phantom files + wired system map. 5-point audit reference. Cartridge pipeline stats.', icon: 'ghost', lines: 165 },
		{ href: '/demos/spotlight', label: 'Spotlight Overlay', description: 'Interactive CSS spotlight with box-shadow cutout technique. Configurable padding, border-radius, pulse glow.', icon: 'scan', lines: 210 },
		{ href: '/demos/keyboard-shortcuts', label: 'Keyboard Shortcuts', description: 'Live key detection, shortcut reference grid, category filters, press history — from the onboarding wizard.', icon: 'keyboard', lines: 195 },
		{ href: '/demos/particles', label: 'Particle Animation', description: 'Canvas particle system with 4 presets (ambient, celebration, snow, fireflies) + CSS-only wizard variant.', icon: 'sparkles', lines: 245 },
		{ href: '/demos/smart-positioning', label: 'Smart Card Positioning', description: 'Adaptive tooltip placement: below → above → right → left → center. Resize-aware with auto-cycle mode.', icon: 'move', lines: 220 },
	];

	const showcases: Demo[] = [
		{ href: '/evidence-canvas-demo', label: 'Evidence Canvas Demo', description: '11 visualization engines: Canvas, Fabric.js, D3.js, provenance graph, draggable nodes, AI similarity', icon: 'pen-tool' },
		{ href: '/evidence-library', label: 'Evidence Library', description: 'Evidence analysis with custody timeline, police reports, stats panel, RAG document grid', icon: 'library' },
		{ href: '/citations', label: 'Citations & KB Search', description: 'Legal glossary, statutes, precedents — RAG semantic + full-text + prefix search with pgvector cosine ranking', icon: 'scroll' },
		{ href: '/cases', label: 'Case Management', description: 'CRUD with overview, evidence manager, AI document drafting, persons of interest, case scoring', icon: 'folder' },
		{ href: '/nier-showcase', label: 'NieR Showcase', description: 'YoRHa UI: CommandCenter, Terminal, SystemStatus, Dialogs, DiamondModal, NES CRT', icon: 'monitor' },
		{ href: '/system-status', label: 'System Status', description: 'System health dashboard: StatusCards, SystemStatusPanel, SystemOverview', icon: 'activity' },
		{ href: '/ai-dashboard', label: 'AI Dashboard', description: '35+ AI components: RAG pipeline, ONNX/Ollama chat, source validation, case intake wizard', icon: 'brain' },
		{ href: '/admin/dev-tools', label: 'Dev Tools', description: 'Cache dashboard, Redis stats, NES memory banks, GPU metrics, embeddings, knowledge base seeder', icon: 'wrench' },
	];
</script>

<div class="max-w-4xl mx-auto py-8 px-6">
	<div class="mb-8">
		<h1 class="text-2xl font-bold m-0 mb-1">Demo Components</h1>
		<p class="text-sm opacity-50 m-0">Clean Svelte 5 demo components wired to routes for testing and showcase.</p>
	</div>

	<section class="mb-8">
		<h2 class="flex items-center gap-2 text-base font-semibold m-0 mb-3 pb-2 border-b border-sand-dark">
			<Icon name="sparkles" size={16} />
			New Demos
		</h2>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
			{#each demos as demo}
				<a href={demo.href} class="block p-3.5 border border-sand-dark rounded-lg bg-panel-soft no-underline text-inherit hover:border-accent hover:-translate-y-px transition-all">
					<div class="flex items-center gap-2 mb-1.5">
						<Icon name={demo.icon} size={18} />
						<span class="text-sm font-semibold flex-1">{demo.label}</span>
						{#if demo.lines}
							<span class="text-[11px] opacity-40 font-mono">{demo.lines}L</span>
						{/if}
					</div>
					<p class="text-xs leading-relaxed opacity-60 m-0">{demo.description}</p>
				</a>
			{/each}
		</div>
	</section>

	<section class="mb-8">
		<h2 class="flex items-center gap-2 text-base font-semibold m-0 mb-3 pb-2 border-b border-sand-dark">
			<Icon name="layout-grid" size={16} />
			Showcase Routes
		</h2>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
			{#each showcases as demo}
				<a href={demo.href} class="block p-3.5 border border-green-500/20 rounded-lg bg-panel-soft no-underline text-inherit hover:border-green-500/50 hover:-translate-y-px transition-all">
					<div class="flex items-center gap-2 mb-1.5">
						<Icon name={demo.icon} size={18} />
						<span class="text-sm font-semibold flex-1">{demo.label}</span>
					</div>
					<p class="text-xs leading-relaxed opacity-60 m-0">{demo.description}</p>
				</a>
			{/each}
		</div>
	</section>
</div>
