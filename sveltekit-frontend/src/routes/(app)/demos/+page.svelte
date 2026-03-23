<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/ui/Icon.svelte';
	import DiamondModal from '$lib/components/ui/DiamondModal.svelte';

	type DemoCategory = 'ai' | 'visualization' | 'gaming' | 'ui' | 'system';

	interface Demo {
		href: string;
		label: string;
		description: string;
		icon: string;
		lines?: number;
		category: DemoCategory;
	}

	const categoryMeta: Record<DemoCategory, { label: string; color: string; icon: string }> = {
		ai: { label: 'AI & ML', color: '#60a5fa', icon: 'brain' },
		visualization: { label: 'Visualization', color: '#a78bfa', icon: 'eye' },
		gaming: { label: 'Gaming & Retro', color: '#f59e0b', icon: 'gamepad-2' },
		ui: { label: 'UI Components', color: '#34d399', icon: 'layout' },
		system: { label: 'System & Cache', color: '#f87171', icon: 'server' },
	};

	const demos: Demo[] = [
		{ href: '/demos/webgpu-memory-palace', label: 'WebGPU Memory Palace', description: 'GPU-accelerated 3D legal knowledge visualization with WGSL shaders, force-directed layout, and WebGPU-to-CPU fallback.', icon: 'box', lines: 354, category: 'visualization' },
		{ href: '/demos/vector-search', label: 'Vector Intelligence', description: 'Semantic search with pgvector embeddings, filtering, sorting, batch selection, CSV export, and similarity metrics.', icon: 'brain', lines: 370, category: 'ai' },
		{ href: '/demos/retro-recommendations', label: 'Retro Recommendations', description: 'NES-style AI recommendations with category filters, sort controls, signal tokens, and multi-modal scoring.', icon: 'sparkles', lines: 350, category: 'gaming' },
		{ href: '/demos/cache', label: 'Cache Architecture', description: 'Multi-layer cache system demonstrating LokiJS, Redis, and PostgreSQL tiers with real-time statistics.', icon: 'database', lines: 612, category: 'system' },
		{ href: '/demos/bits-ui', label: 'Bits UI Showcase', description: 'Comprehensive bits-ui v2 component showcase: Dialog, Select, Input, and headless patterns for legal AI.', icon: 'layout', lines: 267, category: 'ui' },
		{ href: '/demos/nes-elements', label: 'NES Elements', description: 'Full NES.css HTML element catalogue styled with retro gaming theme and pixel-perfect rendering.', icon: 'gamepad-2', lines: 233, category: 'gaming' },
		{ href: '/demos/gpu-cache', label: 'GPU Cache Integration', description: 'Multi-tier cache visualization across L0 through L4 with GPU compute metrics and hit-rate analysis.', icon: 'cpu', lines: 150, category: 'system' },
		{ href: '/demos/bento-dashboard', label: 'Bento Dashboard', description: 'Premium Bento Box dashboard layout with UnoCSS, Svelte 5 Runes, and glassmorphic widgets.', icon: 'layout-dashboard', lines: 349, category: 'ui' },
		{ href: '/demos/icons', label: 'Icon System', description: 'Dynamic icon loading via UnoCSS presetIcons with container component showcase and accessibility testing.', icon: 'image', lines: 65, category: 'ui' },
		{ href: '/demos/ace-pipeline', label: 'ACE Pipeline', description: 'ACE Context Bubble and RAG Pipeline Chart with confidence scoring and self-evaluation metrics.', icon: 'git-branch', lines: 188, category: 'ai' },
		{ href: '/demos/case-scoring', label: 'Case Scoring', description: 'AI case risk scoring dashboard with dynamic factors, confidence metrics, priority filtering, and risk visualization.', icon: 'shield', lines: 543, category: 'ai' },
		{ href: '/demos/document-summarizer', label: 'Document Summarizer', description: 'AI-powered legal document summarization for contracts, judgments, briefs, and statutes with quality metrics.', icon: 'file-text', lines: 786, category: 'ai' },
		{ href: '/demos/knowledge-graph', label: 'Knowledge Graph', description: 'D3.js force-directed provenance graph with entity relationships, interactive nodes, and RAG source validation.', icon: 'git-merge', lines: 280, category: 'visualization' },
		{ href: '/demos/rag-documents', label: 'RAG Documents', description: 'Multi-document card grid with search, view modes, file sizes, embedding model info, and document management.', icon: 'file-stack', lines: 427, category: 'ai' },
		{ href: '/demos/phantom-code-lab', label: 'Phantom Code Lab', description: 'Extracted phantom files, wired system map, and 5-point audit reference for safe file archival workflows.', icon: 'ghost', lines: 165, category: 'system' },
		{ href: '/demos/spotlight', label: 'Spotlight Overlay', description: 'Interactive CSS spotlight with box-shadow cutout technique, configurable padding, and pulse glow animation.', icon: 'scan', lines: 210, category: 'ui' },
		{ href: '/demos/keyboard-shortcuts', label: 'Keyboard Shortcuts', description: 'Live key detection, shortcut reference grid, category filters, and press history from the onboarding wizard.', icon: 'keyboard', lines: 195, category: 'ui' },
		{ href: '/demos/particles', label: 'Particle System', description: 'Canvas particle system with ambient, celebration, snow, and fireflies presets plus CSS-only variant.', icon: 'sparkles', lines: 245, category: 'visualization' },
		{ href: '/demos/smart-positioning', label: 'Smart Positioning', description: 'Adaptive tooltip placement algorithm with directional fallback chain and resize-aware auto-cycle mode.', icon: 'move', lines: 220, category: 'ui' },
		{ href: '/demos/agentic-errors', label: 'Agentic Error Analysis', description: 'AI-powered error clustering, pattern detection, and auto-fix suggestions with confidence scoring.', icon: 'bug', lines: 300, category: 'ai' },
		{ href: '/demos/evidence-canvas', label: 'Evidence Canvas', description: 'Interactive evidence visualization canvas with drag-and-drop nodes and relationship mapping.', icon: 'pen-tool', lines: 280, category: 'visualization' },
		{ href: '/demos/investigate', label: 'Investigation Board', description: 'AI investigation assistant with evidence linking, timeline analysis, and person-of-interest connections.', icon: 'search', lines: 250, category: 'ai' },
		{ href: '/demos/memory-palace', label: 'Memory Palace', description: 'Spatial memory visualization for legal knowledge using rooms, shelves, and mnemonic associations.', icon: 'home', lines: 320, category: 'visualization' },
		{ href: '/demos/nes-routes', label: 'NES Route Map', description: 'Retro NES-style route visualization with pixel art styling and interactive navigation map.', icon: 'map', lines: 200, category: 'gaming' },
		{ href: '/demos/nier-showcase', label: 'NieR:Automata UI', description: 'YoRHa-inspired UI components: diamond modals, CRT effects, terminal output, and system diagnostics.', icon: 'monitor', lines: 350, category: 'gaming' },
		{ href: '/demos/yorha-icons', label: 'YoRHa Icon System', description: 'Celestial showcase of 12 monochrome legal SVG icons with interactive size, stroke, and glow controls.', icon: 'star', lines: 290, category: 'ui' },
		{ href: '/demos/svelte5-components', label: 'Svelte 5 Components', description: 'Runes-based UI component showcase: Card, Tabs, Input, Avatar, Badge, Progress, and Dialog patterns.', icon: 'component', lines: 180, category: 'ui' },
		{ href: '/demos/page-layouts', label: 'Page Layouts', description: 'Split/dark/warm layout modes with settings panel, tab navigation, and micro-interaction previews.', icon: 'columns', lines: 250, category: 'ui' },
		{ href: '/demos/unified-dashboard', label: 'Unified Dashboard', description: 'Full sidebar navigation dashboard with command palette, collapsible nav, and section-based content routing.', icon: 'layout-dashboard', lines: 300, category: 'ui' },
	];

	const showcases: Demo[] = [
		{ href: '/demos/bits-ui', label: 'Bits UI Showcase', description: 'Headless Bits UI v2 patterns for dialogs, selects, inputs, and polished legal-AI interface primitives.', icon: 'layout', category: 'ui' },
		{ href: '/evidence-canvas-demo', label: 'Evidence Canvas Demo', description: '11 visualization engines including Canvas, Fabric.js, D3.js, provenance graph, and AI similarity.', icon: 'pen-tool', category: 'visualization' },
		{ href: '/evidence-library', label: 'Evidence Library', description: 'Evidence analysis with custody timeline, police reports, stats panel, and RAG document grid.', icon: 'library', category: 'ai' },
		{ href: '/citations', label: 'Citations & KB Search', description: 'Legal glossary, statutes, and precedents with RAG semantic search and pgvector cosine ranking.', icon: 'scroll', category: 'ai' },
		{ href: '/cases', label: 'Case Management', description: 'Full CRUD with overview, evidence manager, AI document drafting, and case scoring integration.', icon: 'folder', category: 'ai' },
		{ href: '/demos/nier-showcase', label: 'NieR Showcase', description: 'YoRHa UI suite: CommandCenter, Terminal, SystemStatus, Dialogs, DiamondModal, and NES CRT.', icon: 'monitor', category: 'gaming' },
		{ href: '/system-status', label: 'System Status', description: 'System health dashboard with StatusCards, SystemStatusPanel, and SystemOverview.', icon: 'activity', category: 'system' },
		{ href: '/admin/ai-dashboard', label: 'AI Dashboard', description: '35+ AI components: RAG pipeline, ONNX/Ollama chat, source validation, and case intake wizard.', icon: 'brain', category: 'ai' },
		{ href: '/admin/dev-tools', label: 'Dev Tools', description: 'Cache dashboard, Redis stats, NES memory banks, GPU metrics, and knowledge base seeder.', icon: 'wrench', category: 'system' },
		{ href: '/legal-corpus', label: 'Legal Corpus', description: 'Statute browser, legal glossary, and precedent search with jurisdiction filters and semantic ranking.', icon: 'book-open', category: 'ai' },
	];

	let viewMode = $state<'grid' | 'graph'>('grid');
	let selectedDemo = $state<Demo | null>(null);
	let modalOpen = $state(false);
	let filterCategory = $state<DemoCategory | null>(null);
	let svgContainer = $state<SVGSVGElement | null>(null);
	let graphDrawn = $state(false);

	const allDemos = $derived([...demos, ...showcases]);
	const filteredDemos = $derived(filterCategory ? demos.filter(d => d.category === filterCategory) : demos);
	const filteredShowcases = $derived(filterCategory ? showcases.filter(d => d.category === filterCategory) : showcases);
	const totalLines = $derived(demos.reduce((s, d) => s + (d.lines || 0), 0));

	const categoryCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const d of allDemos) {
			counts[d.category] = (counts[d.category] || 0) + 1;
		}
		return counts;
	});

	function openPreview(demo: Demo) {
		selectedDemo = demo;
		modalOpen = true;
	}

	function launchDemo() {
		if (selectedDemo) {
			window.location.href = selectedDemo.href;
		}
	}

	// D3 force graph
	$effect(() => {
		if (viewMode === 'graph' && browser && svgContainer && !graphDrawn) {
			drawGraph();
		}
	});

	async function drawGraph() {
		const d3 = await import('d3');
		if (!svgContainer) return;

		const width = svgContainer.clientWidth || 900;
		const height = 520;

		d3.select(svgContainer).selectAll('*').remove();

		const svg = d3.select(svgContainer)
			.attr('width', width)
			.attr('height', height)
			.attr('viewBox', `0 0 ${width} ${height}`);

		// Subtle radial gradient background
		const defs = svg.append('defs');
		const radialGrad = defs.append('radialGradient').attr('id', 'graph-bg');
		radialGrad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(212,199,163,0.03)');
		radialGrad.append('stop').attr('offset', '100%').attr('stop-color', 'transparent');
		svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#graph-bg)');

		interface GraphNode extends d3.SimulationNodeDatum {
			id: string;
			label: string;
			category: DemoCategory;
			color: string;
			radius: number;
			demo: Demo;
			isShowcase: boolean;
		}

		interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
			source: string | GraphNode;
			target: string | GraphNode;
		}

		const nodes: GraphNode[] = allDemos.map((d, i) => ({
			id: d.href,
			label: d.label,
			category: d.category,
			color: categoryMeta[d.category].color,
			radius: Math.max(10, Math.min(22, (d.lines || 200) / 30)),
			demo: d,
			isShowcase: i >= demos.length,
		}));

		const links: GraphLink[] = [];
		const byCategory: Record<string, GraphNode[]> = {};
		for (const n of nodes) {
			(byCategory[n.category] ??= []).push(n);
		}
		for (const group of Object.values(byCategory)) {
			for (let i = 0; i < group.length - 1; i++) {
				links.push({ source: group[i].id, target: group[i + 1].id });
			}
		}

		const categories = Object.keys(categoryMeta) as DemoCategory[];
		const catCenters: Record<string, { x: number; y: number }> = {};
		categories.forEach((cat, i) => {
			const angle = (i / categories.length) * 2 * Math.PI - Math.PI / 2;
			catCenters[cat] = {
				x: width / 2 + Math.cos(angle) * (width * 0.25),
				y: height / 2 + Math.sin(angle) * (height * 0.28),
			};
		});

		// Glow filter for nodes
		const glow = defs.append('filter').attr('id', 'node-glow');
		glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
		glow.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', (d) => d);

		const simulation = d3.forceSimulation(nodes as any)
			.force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(50).strength(0.25))
			.force('charge', d3.forceManyBody().strength(-100))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius((d: any) => d.radius + 6))
			.force('cluster', () => {
				for (const node of nodes) {
					const target = catCenters[node.category];
					if (target) {
						node.vx! += (target.x - node.x!) * 0.012;
						node.vy! += (target.y - node.y!) * 0.012;
					}
				}
			});

		// Links with gradient
		const link = svg.append('g')
			.selectAll('line')
			.data(links)
			.join('line')
			.attr('stroke', 'rgba(212, 199, 163, 0.08)')
			.attr('stroke-width', 1);

		// Category labels
		svg.append('g')
			.selectAll('text')
			.data(categories)
			.join('text')
			.attr('x', (d) => catCenters[d].x)
			.attr('y', (d) => catCenters[d].y - (height * 0.2))
			.attr('text-anchor', 'middle')
			.attr('font-size', '9px')
			.attr('font-family', "'JetBrains Mono', monospace")
			.attr('font-weight', '600')
			.attr('letter-spacing', '0.12em')
			.attr('fill', (d) => categoryMeta[d].color)
			.attr('opacity', 0.5)
			.text((d) => categoryMeta[d].label.toUpperCase());

		// Nodes
		const node = svg.append('g')
			.selectAll('g')
			.data(nodes)
			.join('g')
			.style('cursor', 'pointer')
			.on('click', (_event: MouseEvent, d: GraphNode) => {
				openPreview(d.demo);
			});

		// Outer glow circle
		node.append('circle')
			.attr('r', (d) => d.radius + 3)
			.attr('fill', 'none')
			.attr('stroke', (d) => d.color)
			.attr('stroke-width', 0.5)
			.attr('opacity', 0.15)
			.attr('filter', 'url(#node-glow)');

		node.append('circle')
			.attr('r', (d) => d.radius)
			.attr('fill', (d) => d.color + '18')
			.attr('stroke', (d) => d.color)
			.attr('stroke-width', (d) => d.isShowcase ? 2 : 1.5)
			.attr('stroke-dasharray', (d) => d.isShowcase ? '4,3' : 'none');

		node.append('title')
			.text((d) => `${d.label}\n${d.demo.description}`);

		node.append('text')
			.attr('text-anchor', 'middle')
			.attr('dominant-baseline', 'central')
			.attr('font-size', (d) => Math.max(9, d.radius * 0.75) + 'px')
			.attr('font-weight', '700')
			.attr('fill', (d) => d.color)
			.attr('opacity', 0.85)
			.text((d) => d.label.charAt(0));

		// Tooltip
		const tooltip = svg.append('g').attr('opacity', 0).attr('pointer-events', 'none');
		const tooltipBg = tooltip.append('rect')
			.attr('rx', 5)
			.attr('fill', 'rgba(10,10,8,0.92)')
			.attr('stroke', 'rgba(212,199,163,0.15)')
			.attr('stroke-width', 1);
		const tooltipText = tooltip.append('text')
			.attr('fill', 'rgba(212,199,163,0.9)')
			.attr('font-size', '10px')
			.attr('font-weight', '500')
			.attr('font-family', "'JetBrains Mono', monospace");

		node.on('mouseenter', (_event: MouseEvent, d: GraphNode) => {
			tooltipText.text(d.label);
			const bbox = (tooltipText.node() as SVGTextElement)?.getBBox();
			if (bbox) {
				tooltipBg
					.attr('x', bbox.x - 8)
					.attr('y', bbox.y - 4)
					.attr('width', bbox.width + 16)
					.attr('height', bbox.height + 8);
			}
			tooltip
				.attr('transform', `translate(${d.x! + d.radius + 10}, ${d.y!})`)
				.attr('opacity', 1);

			// Highlight hovered node
			d3.select(_event.currentTarget as Element).select('circle:nth-child(2)')
				.attr('stroke-width', 2.5)
				.attr('fill', (n: any) => n.color + '30');
		}).on('mouseleave', (_event: MouseEvent) => {
			tooltip.attr('opacity', 0);
			d3.select(_event.currentTarget as Element).select('circle:nth-child(2)')
				.attr('stroke-width', (n: any) => n.isShowcase ? 2 : 1.5)
				.attr('fill', (n: any) => n.color + '18');
		});

		const drag = d3.drag()
			.on('start', (event, d) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on('drag', (event, d) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on('end', (event, d) => {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});

		node.call(drag);

		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);
			node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
		});

		graphDrawn = true;
	}
</script>

<div class="demos-page">
	<!-- Subtle grain overlay -->
	<div class="grain-overlay"></div>

	<header class="page-header">
		<div class="header-top">
			<div class="header-brand">
				<div class="brand-badge">
					<Icon name="flask-conical" size={20} />
				</div>
				<div class="brand-text">
					<h1 class="brand-title">Component Lab</h1>
					<p class="brand-sub">Interactive demo components &middot; Svelte 5 &middot; D3.js</p>
				</div>
			</div>
			<div class="header-actions">
				<div class="view-toggle">
					<button class="toggle-btn" class:active={viewMode === 'grid'} onclick={() => { viewMode = 'grid'; }}>
						<Icon name="layout-grid" size={13} />
						Grid
					</button>
					<button class="toggle-btn" class:active={viewMode === 'graph'} onclick={() => { viewMode = 'graph'; graphDrawn = false; }}>
						<Icon name="git-merge" size={13} />
						Graph
					</button>
				</div>
			</div>
		</div>
		<div class="header-stats">
			<div class="stat-item">
				<span class="stat-value">{demos.length}</span>
				<span class="stat-label">Demos</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat-item">
				<span class="stat-value">{showcases.length}</span>
				<span class="stat-label">Showcases</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat-item">
				<span class="stat-value">{totalLines.toLocaleString()}</span>
				<span class="stat-label">Lines</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat-item accent">
				<span class="stat-value">{allDemos.length}</span>
				<span class="stat-label">Total</span>
			</div>
		</div>
	</header>

	<!-- Category Filters -->
	<nav class="filter-bar">
		<button class="filter-chip" class:active={!filterCategory} onclick={() => filterCategory = null}>
			All
		</button>
		{#each Object.entries(categoryMeta) as [key, meta]}
			<button
				class="filter-chip"
				class:active={filterCategory === key}
				onclick={() => filterCategory = filterCategory === key ? null : key as DemoCategory}
				style="--chip-color: {meta.color}"
			>
				<span class="filter-dot" style="background: {meta.color}"></span>
				{meta.label}
				<span class="filter-count">{categoryCounts[key] || 0}</span>
			</button>
		{/each}
	</nav>

	{#if viewMode === 'graph'}
		<section class="graph-panel">
			<div class="graph-header">
				<span class="graph-title">Dependency Graph</span>
				<span class="graph-hint">Click to preview &middot; Drag to rearrange &middot; Node size = lines of code</span>
			</div>
			<svg bind:this={svgContainer} class="graph-canvas"></svg>
			<div class="graph-legend">
				{#each Object.entries(categoryMeta) as [, meta]}
					<span class="legend-item">
						<span class="legend-dot" style="background: {meta.color}"></span>
						{meta.label}
					</span>
				{/each}
				<span class="legend-item">
					<span class="legend-line solid"></span>
					Demo
				</span>
				<span class="legend-item">
					<span class="legend-line dashed"></span>
					Showcase
				</span>
			</div>
		</section>
	{:else}
		{#if filteredDemos.length > 0}
			<section class="card-section">
				<div class="section-head">
					<div class="section-indicator"></div>
					<h2 class="section-title">Demos</h2>
					<span class="section-count">{filteredDemos.length}</span>
				</div>
				<div class="card-grid">
					{#each filteredDemos as demo}
						<button class="card" onclick={() => openPreview(demo)} style="--card-accent: {categoryMeta[demo.category].color}">
							<div class="card-top">
								<div class="card-icon">
									<Icon name={demo.icon} size={16} />
								</div>
								<div class="card-title-area">
									<span class="card-name">{demo.label}</span>
									{#if demo.lines}
										<span class="card-loc">{demo.lines} LOC</span>
									{/if}
								</div>
							</div>
							<p class="card-desc">{demo.description}</p>
							<div class="card-bottom">
								<span class="card-tag">
									<span class="tag-dot"></span>
									{categoryMeta[demo.category].label}
								</span>
								<span class="card-arrow">
									<Icon name="arrow-right" size={12} />
								</span>
							</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if filteredShowcases.length > 0}
			<section class="card-section">
				<div class="section-head showcase">
					<div class="section-indicator showcase"></div>
					<h2 class="section-title">Showcase Routes</h2>
					<span class="section-count">{filteredShowcases.length}</span>
				</div>
				<div class="card-grid">
					{#each filteredShowcases as demo}
						<button class="card showcase" onclick={() => openPreview(demo)} style="--card-accent: {categoryMeta[demo.category].color}">
							<div class="card-top">
								<div class="card-icon showcase-icon">
									<Icon name={demo.icon} size={16} />
								</div>
								<div class="card-title-area">
									<span class="card-name">{demo.label}</span>
								</div>
							</div>
							<p class="card-desc">{demo.description}</p>
							<div class="card-bottom">
								<span class="card-tag">
									<span class="tag-dot"></span>
									{categoryMeta[demo.category].label}
								</span>
								<span class="card-arrow">
									<Icon name="arrow-right" size={12} />
								</span>
							</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<!-- NES Diamond Modal Preview -->
<DiamondModal bind:open={modalOpen} title={selectedDemo?.label ?? ''} palette="nes" size="medium">
	{#if selectedDemo}
		<div class="modal-body">
			<div class="modal-meta-row">
				<span class="modal-category" style="color: {categoryMeta[selectedDemo.category].color}; border-color: {categoryMeta[selectedDemo.category].color}40; background: {categoryMeta[selectedDemo.category].color}10">
					<Icon name={categoryMeta[selectedDemo.category].icon} size={12} />
					{categoryMeta[selectedDemo.category].label}
				</span>
				{#if selectedDemo.lines}
					<span class="modal-loc">{selectedDemo.lines} lines of code</span>
				{/if}
			</div>
			<p class="modal-desc">{selectedDemo.description}</p>
			<div class="modal-route">
				<Icon name="route" size={12} />
				<code>{selectedDemo.href}</code>
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<div class="modal-actions">
			<button class="btn-secondary" onclick={() => modalOpen = false}>Close</button>
			<button class="btn-primary" onclick={launchDemo}>
				<Icon name="external-link" size={14} />
				Launch Demo
			</button>
		</div>
	{/snippet}
</DiamondModal>

<style>
	/* ================================================================
	   PAGE SHELL
	   ================================================================ */
	.demos-page {
		position: relative;
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 2.5rem;
	}

	.grain-overlay {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 0;
		opacity: 0.025;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px;
	}

	/* Reset root layout globals */
	.demos-page :global(h1),
	.demos-page :global(h2),
	.demos-page :global(h3),
	.demos-page :global(p) {
		color: inherit;
		text-transform: none;
		letter-spacing: normal;
		font-family: inherit;
		margin: 0;
	}
	.demos-page :global(a) {
		color: inherit;
		border-bottom: none;
	}
	.demos-page :global(button) {
		text-transform: none;
		letter-spacing: normal;
		border: none;
		background: none;
		box-shadow: none;
		padding: 0;
		font-weight: inherit;
	}

	/* Content centering */
	.demos-page > :global(*) {
		position: relative;
		z-index: 1;
		max-width: 68rem;
		margin-left: auto;
		margin-right: auto;
	}

	/* ================================================================
	   HEADER
	   ================================================================ */
	.page-header {
		margin-bottom: 1.75rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}
	.header-brand {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}
	.brand-badge {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(250, 204, 21, 0.1), rgba(251, 146, 60, 0.08));
		border: 1px solid rgba(250, 204, 21, 0.15);
		color: rgba(250, 204, 21, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.brand-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.92);
		letter-spacing: 0.02em;
	}
	.brand-sub {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.3);
		margin-top: 0.125rem;
		letter-spacing: 0.01em;
	}
	.header-stats {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
	}
	.stat-value {
		font-size: 1rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.75);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}
	.stat-label {
		font-size: 0.5625rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.stat-item.accent .stat-value {
		color: rgba(250, 204, 21, 0.8);
	}
	.stat-divider {
		width: 1px;
		height: 1.5rem;
		background: rgba(212, 199, 163, 0.08);
	}

	/* ================================================================
	   VIEW TOGGLE
	   ================================================================ */
	.view-toggle {
		display: flex;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 3px;
		gap: 2px;
	}
	.toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.4);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.toggle-btn:hover {
		color: rgba(212, 199, 163, 0.7);
	}
	.toggle-btn.active {
		color: rgba(212, 199, 163, 0.9);
		background: rgba(212, 199, 163, 0.08);
	}

	/* ================================================================
	   FILTER BAR
	   ================================================================ */
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 2rem;
		max-width: 68rem;
		margin-left: auto;
		margin-right: auto;
		position: relative;
		z-index: 1;
	}
	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.4);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 9999px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.filter-chip:hover {
		color: rgba(212, 199, 163, 0.7);
		border-color: rgba(212, 199, 163, 0.15);
		background: rgba(212, 199, 163, 0.03);
	}
	.filter-chip.active {
		color: var(--chip-color, rgba(212, 199, 163, 0.9));
		border-color: color-mix(in srgb, var(--chip-color, #d4c7a3) 30%, transparent);
		background: color-mix(in srgb, var(--chip-color, #d4c7a3) 8%, transparent);
	}
	.filter-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		opacity: 0.7;
	}
	.filter-count {
		font-size: 0.5625rem;
		opacity: 0.5;
		font-variant-numeric: tabular-nums;
	}

	/* ================================================================
	   GRAPH VIEW
	   ================================================================ */
	.graph-panel {
		max-width: 68rem;
		margin-left: auto;
		margin-right: auto;
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.75rem;
		background: rgba(0, 0, 0, 0.15);
		overflow: hidden;
		position: relative;
		z-index: 1;
	}
	.graph-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.graph-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.6);
		letter-spacing: 0.02em;
	}
	.graph-hint {
		font-size: 0.625rem;
		color: rgba(212, 199, 163, 0.25);
	}
	.graph-canvas {
		width: 100%;
		height: 520px;
		display: block;
	}
	.graph-legend {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.625rem 1.25rem;
		border-top: 1px solid rgba(212, 199, 163, 0.06);
		flex-wrap: wrap;
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.625rem;
		color: rgba(212, 199, 163, 0.35);
	}
	.legend-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		opacity: 0.7;
	}
	.legend-line {
		width: 14px;
		height: 0;
		border-top: 2px solid rgba(212, 199, 163, 0.3);
	}
	.legend-line.dashed {
		border-top-style: dashed;
	}

	/* ================================================================
	   CARD SECTIONS
	   ================================================================ */
	.card-section {
		margin-bottom: 2.5rem;
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 1rem;
		padding-bottom: 0.625rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.section-indicator {
		width: 3px;
		height: 14px;
		border-radius: 2px;
		background: rgba(96, 165, 250, 0.6);
	}
	.section-indicator.showcase {
		background: rgba(52, 211, 153, 0.6);
	}
	.section-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.7);
		letter-spacing: 0.02em;
	}
	.section-head.showcase .section-title {
		color: rgba(52, 211, 153, 0.7);
	}
	.section-count {
		margin-left: auto;
		font-size: 0.625rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.2);
		background: rgba(212, 199, 163, 0.04);
		padding: 0.125rem 0.625rem;
		border-radius: 9999px;
		font-variant-numeric: tabular-nums;
	}

	/* ================================================================
	   CARDS
	   ================================================================ */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
		gap: 0.625rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		padding: 1rem 1rem 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.07);
		border-left: 3px solid var(--card-accent, rgba(96, 165, 250, 0.4));
		border-radius: 0.5rem;
		background: linear-gradient(135deg, rgba(20, 19, 16, 0.6), rgba(25, 24, 20, 0.4));
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.card:hover {
		border-color: rgba(212, 199, 163, 0.12);
		background: linear-gradient(135deg, rgba(25, 24, 20, 0.8), rgba(30, 29, 24, 0.6));
		transform: translateY(-2px);
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(212, 199, 163, 0.04);
	}
	.card:hover .card-arrow {
		opacity: 0.6;
		transform: translateX(2px);
	}
	.card.showcase {
		border-left-color: rgba(52, 211, 153, 0.4);
	}

	.card-top {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		margin-bottom: 0.5rem;
	}
	.card-icon {
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--card-accent, #60a5fa) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--card-accent, #60a5fa) 12%, transparent);
		color: var(--card-accent, rgba(96, 165, 250, 0.8));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.card-icon.showcase-icon {
		background: rgba(52, 211, 153, 0.08);
		border-color: rgba(52, 211, 153, 0.12);
		color: rgba(52, 211, 153, 0.8);
	}
	.card-title-area {
		flex: 1;
		min-width: 0;
	}
	.card-name {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.88);
		line-height: 1.3;
	}
	.card-loc {
		font-size: 0.5625rem;
		color: rgba(212, 199, 163, 0.25);
		font-family: 'JetBrains Mono', monospace;
		letter-spacing: 0.02em;
		margin-top: 0.125rem;
		display: block;
	}
	.card-desc {
		font-size: 0.6875rem;
		line-height: 1.55;
		color: rgba(212, 199, 163, 0.38);
		flex: 1;
		display: -webkit-box;
		line-clamp: 3;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.625rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(212, 199, 163, 0.04);
	}
	.card-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.5625rem;
		font-weight: 500;
		color: var(--card-accent, rgba(212, 199, 163, 0.4));
		letter-spacing: 0.03em;
		opacity: 0.7;
	}
	.tag-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--card-accent, rgba(212, 199, 163, 0.4));
		opacity: 0.6;
	}
	.card-arrow {
		color: rgba(212, 199, 163, 0.2);
		opacity: 0;
		transition: all 0.2s;
	}

	/* ================================================================
	   MODAL
	   ================================================================ */
	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.modal-meta-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.modal-category {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.3rem 0.875rem;
		border: 1px solid;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}
	.modal-loc {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		font-family: 'JetBrains Mono', monospace;
	}
	.modal-desc {
		font-size: 0.9375rem;
		line-height: 1.75;
		color: rgba(255, 255, 255, 0.75);
	}
	.modal-route {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 0.5rem;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.75rem;
	}
	.modal-route code {
		color: rgba(255, 255, 255, 0.55);
		font-family: 'JetBrains Mono', monospace;
	}
	.modal-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		width: 100%;
	}
	.btn-secondary {
		padding: 0.5rem 1.25rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-secondary:hover {
		color: rgba(255, 255, 255, 0.8);
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.04);
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #fff;
		background: linear-gradient(135deg, rgba(138, 43, 226, 0.45), rgba(30, 144, 255, 0.45));
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-primary:hover {
		background: linear-gradient(135deg, rgba(138, 43, 226, 0.65), rgba(30, 144, 255, 0.65));
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(138, 43, 226, 0.25);
	}
</style>
