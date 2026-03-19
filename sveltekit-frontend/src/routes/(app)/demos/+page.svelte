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
		{ href: '/demos/agentic-errors', label: 'Agentic Error Analysis', description: 'AI-powered error clustering, pattern detection, and auto-fix suggestions with confidence scoring.', icon: 'bug', lines: 300 },
		{ href: '/demos/evidence-canvas', label: 'Evidence Canvas', description: 'Interactive evidence visualization canvas with drag-and-drop nodes and relationship mapping.', icon: 'pen-tool', lines: 280 },
		{ href: '/demos/investigate', label: 'Investigation Board', description: 'AI investigation assistant: evidence linking, timeline analysis, person-of-interest connections.', icon: 'search', lines: 250 },
		{ href: '/demos/memory-palace', label: 'Memory Palace', description: 'Spatial memory visualization for legal knowledge: rooms, shelves, and mnemonic associations.', icon: 'home', lines: 320 },
		{ href: '/demos/nes-routes', label: 'NES Route Map', description: 'Retro NES-style route visualization with pixel art styling and interactive navigation.', icon: 'map', lines: 200 },
		{ href: '/demos/nier-showcase', label: 'NieR:Automata UI', description: 'YoRHa-inspired UI components: diamond modals, CRT effects, terminal output, system diagnostics.', icon: 'monitor', lines: 350 },
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
		{ href: '/legal-corpus', label: 'Legal Corpus', description: 'Statute browser, legal glossary, precedent search — jurisdiction/category filters, pgvector semantic ranking', icon: 'book-open' },
	];
</script>

<div class="demos-page">
	<header class="demos-header">
		<div class="demos-header-left">
			<div class="demos-icon-badge">
				<Icon name="flask-conical" />
			</div>
			<div>
				<h1 class="demos-title">Demo Components</h1>
				<p class="demos-subtitle">Clean Svelte 5 demo components wired to routes for testing and showcase.</p>
			</div>
		</div>
		<div class="demos-stats">
			<span class="demos-stat">
				<Icon name="sparkles" />
				<strong>{demos.length}</strong> Demos
			</span>
			<span class="demos-stat-divider"></span>
			<span class="demos-stat">
				<Icon name="layout-grid" />
				<strong>{showcases.length}</strong> Showcases
			</span>
			<span class="demos-stat-divider"></span>
			<span class="demos-stat total">
				<Icon name="layers" />
				<strong>{demos.length + showcases.length}</strong> Total
			</span>
		</div>
	</header>

	<section class="demos-section">
		<h2 class="demos-section-title">
			<Icon name="sparkles" size={16} />
			New Demos
			<span class="demos-section-count">{demos.length}</span>
		</h2>
		<div class="demos-grid">
			{#each demos as demo}
				<a href={demo.href} class="demo-card">
					<div class="demo-card-header">
						<div class="demo-card-icon">
							<Icon name={demo.icon} size={18} />
						</div>
						<span class="demo-card-label">{demo.label}</span>
						{#if demo.lines}
							<span class="demo-card-lines">{demo.lines}L</span>
						{/if}
					</div>
					<p class="demo-card-desc">{demo.description}</p>
				</a>
			{/each}
		</div>
	</section>

	<section class="demos-section">
		<h2 class="demos-section-title showcase">
			<Icon name="layout-grid" size={16} />
			Showcase Routes
			<span class="demos-section-count">{showcases.length}</span>
		</h2>
		<div class="demos-grid">
			{#each showcases as demo}
				<a href={demo.href} class="demo-card showcase">
					<div class="demo-card-header">
						<div class="demo-card-icon showcase">
							<Icon name={demo.icon} size={18} />
						</div>
						<span class="demo-card-label">{demo.label}</span>
					</div>
					<p class="demo-card-desc">{demo.description}</p>
				</a>
			{/each}
		</div>
	</section>
</div>

<style>
	.demos-page {
		max-width: 64rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	/* Header */
	.demos-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}
	.demos-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}
	.demos-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(250, 204, 21, 0.12), rgba(251, 146, 60, 0.12));
		border: 1px solid rgba(250, 204, 21, 0.25);
		color: rgba(250, 204, 21, 0.9);
		flex-shrink: 0;
	}
	.demos-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		line-height: 1.3;
	}
	.demos-subtitle {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.4);
		margin-top: 0.125rem;
	}
	.demos-stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
	}
	.demos-stat {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.demos-stat strong {
		color: rgba(212, 199, 163, 0.85);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.demos-stat.total strong {
		color: rgba(250, 204, 21, 0.85);
	}
	.demos-stat-divider {
		width: 1px;
		height: 1rem;
		background: rgba(212, 199, 163, 0.12);
	}

	/* Section */
	.demos-section {
		margin-bottom: 2rem;
	}
	.demos-section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.8);
		margin: 0 0 1rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.1);
	}
	.demos-section-title.showcase {
		color: rgba(52, 211, 153, 0.8);
		border-color: rgba(52, 211, 153, 0.15);
	}
	.demos-section-count {
		margin-left: auto;
		font-size: 0.625rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.3);
		background: rgba(212, 199, 163, 0.06);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
	}

	/* Cards Grid */
	.demos-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}
	.demo-card {
		display: block;
		padding: 0.875rem;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		text-decoration: none;
		color: inherit;
		transition: all 0.15s ease;
	}
	.demo-card:hover {
		border-color: rgba(96, 165, 250, 0.35);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	.demo-card.showcase {
		border-color: rgba(52, 211, 153, 0.15);
	}
	.demo-card.showcase:hover {
		border-color: rgba(52, 211, 153, 0.4);
	}

	.demo-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.demo-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.8);
		flex-shrink: 0;
	}
	.demo-card-icon.showcase {
		background: rgba(52, 211, 153, 0.1);
		border-color: rgba(52, 211, 153, 0.15);
		color: rgba(52, 211, 153, 0.8);
	}
	.demo-card-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		flex: 1;
	}
	.demo-card-lines {
		font-size: 0.625rem;
		color: rgba(212, 199, 163, 0.3);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.demo-card-desc {
		font-size: 0.6875rem;
		line-height: 1.5;
		color: rgba(212, 199, 163, 0.45);
		margin: 0;
	}
</style>
