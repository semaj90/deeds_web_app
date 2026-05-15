<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	// --- types ---
	interface AnalyticsData {
		period: string;
		cases: { total: number; active: number; closed: number; recentCreated: number };
		evidence: { total: number; recentUploaded: number; casesWithEvidence: number; withFiles: number };
		errorBrain: { totalErrors: number; fixed: number; affectedFiles: number; recentErrors: number; fixRate: number };
		personsOfInterest: { total: number; critical: number; high: number; active: number };
		system: Record<string, string | number>;
	}

	interface DashboardStats {
		activeCases: number;
		totalEvidence: number;
		personsOfInterest: number;
		totalCitations: number;
		savedCitations: number;
		knowledgeBase: { glossary: number; statutes: number; precedents: number; total: number };
	}

	interface InfraStatus {
		services: Record<string, { status: string; latencyMs?: number }>;
		overall: string;
		[key: string]: unknown;
	}

	interface CacheStats {
		hits: number;
		misses: number;
		hitRate: number;
		totalKeys: number;
		memoryUsed: string;
		[key: string]: unknown;
	}

	// --- state ---
	let analytics = $state<AnalyticsData | null>(null);
	let dashStats = $state<DashboardStats | null>(null);
	let infraStatus = $state<InfraStatus | null>(null);
	let cacheStats = $state<CacheStats | null>(null);
	let loading = $state(true);
	let errors = $state<string[]>([]);

	// --- fetch helpers ---
	async function fetchJson<T>(url: string): Promise<T | null> {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	onMount(async () => {
		const [a, d, infra, cache] = await Promise.all([
			fetchJson<AnalyticsData>('/api/yorha/analytics?period=30d'),
			fetchJson<DashboardStats>('/api/dashboard/stats'),
			fetchJson<InfraStatus>('/api/infrastructure/status'),
			fetchJson<CacheStats>('/api/cache/stats'),
		]);

		analytics = a;
		dashStats = d;
		infraStatus = infra;
		cacheStats = cache;
		loading = false;

		if (!a) errors.push('Analytics unavailable');
		if (!d) errors.push('Dashboard stats unavailable');

		await tick();
		renderCharts();
	});

	// --- D3 sparkline / donut rendering ---
	function renderCharts() {
		if (typeof window === 'undefined') return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		import('d3').then((d3: any) => {
			renderDonut(d3, '#case-donut', getCaseDonutData());
			renderDonut(d3, '#error-donut', getErrorDonutData());
			renderDonut(d3, '#poi-donut', getPoiDonutData());
			renderBarChart(d3, '#kb-bars', getKbBarData());
			renderServiceHealth(d3, '#service-health', getServiceData());
		});
	}

	function getCaseDonutData() {
		if (!analytics) return [];
		return [
			{ label: 'Active', value: analytics.cases.active, color: '#60a5fa' },
			{ label: 'Closed', value: analytics.cases.closed, color: '#4ade80' },
			{ label: 'Other', value: Math.max(0, analytics.cases.total - analytics.cases.active - analytics.cases.closed), color: '#525045' },
		].filter(d => d.value > 0);
	}

	function getErrorDonutData() {
		if (!analytics) return [];
		const unfixed = analytics.errorBrain.totalErrors - analytics.errorBrain.fixed;
		return [
			{ label: 'Fixed', value: analytics.errorBrain.fixed, color: '#4ade80' },
			{ label: 'Open', value: Math.max(0, unfixed), color: '#f87171' },
		].filter(d => d.value > 0);
	}

	function getPoiDonutData() {
		if (!analytics) return [];
		return [
			{ label: 'Critical', value: analytics.personsOfInterest.critical, color: '#f87171' },
			{ label: 'High', value: analytics.personsOfInterest.high, color: '#fbbf24' },
			{ label: 'Other', value: Math.max(0, analytics.personsOfInterest.total - analytics.personsOfInterest.critical - analytics.personsOfInterest.high), color: '#525045' },
		].filter(d => d.value > 0);
	}

	function getKbBarData() {
		if (!dashStats) return [];
		return [
			{ label: 'Glossary', value: dashStats.knowledgeBase.glossary, color: '#60a5fa' },
			{ label: 'Statutes', value: dashStats.knowledgeBase.statutes, color: '#a78bfa' },
			{ label: 'Precedents', value: dashStats.knowledgeBase.precedents, color: '#34d399' },
			{ label: 'Citations', value: dashStats.totalCitations, color: '#fbbf24' },
		];
	}

	function getServiceData(): Array<{ name: string; status: string; latency?: number }> {
		if (!infraStatus) return [];
		const services = infraStatus.services ?? infraStatus;
		const result: Array<{ name: string; status: string; latency?: number }> = [];
		const serviceMap: Record<string, string> = {
			redis: 'Redis', qdrant: 'Qdrant', ollama: 'Ollama',
			grpc: 'gRPC', gpu: 'GPU', langExtract: 'LangExtract',
		};
		for (const [key, display] of Object.entries(serviceMap)) {
			const svc = (services as Record<string, unknown>)[key];
			if (svc && typeof svc === 'object' && svc !== null) {
				const s = svc as { status?: string; latencyMs?: number };
				result.push({ name: display, status: s.status ?? 'unknown', latency: s.latencyMs });
			} else if (typeof svc === 'string') {
				result.push({ name: display, status: svc });
			}
		}
		return result;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function renderDonut(d3: any, selector: string, data: Array<{ label: string; value: number; color: string }>) {
		const el = document.querySelector(selector);
		if (!el || data.length === 0) return;
		el.innerHTML = '';

		const size = 120, radius = size / 2, inner = radius * 0.55;
		const svg = d3.select(selector).append('svg')
			.attr('width', size).attr('height', size)
			.append('g').attr('transform', `translate(${radius},${radius})`);

		const pie = d3.pie().value((d: any) => d.value).sort(null);
		const arc = d3.arc()
			.innerRadius(inner).outerRadius(radius - 2);

		svg.selectAll('path')
			.data(pie(data))
			.enter().append('path')
			.attr('d', arc)
			.attr('fill', d => d.data.color)
			.attr('stroke', '#1a1917')
			.attr('stroke-width', 1.5);

		// Center total
		const total = data.reduce((s, d) => s + d.value, 0);
		svg.append('text')
			.attr('text-anchor', 'middle').attr('dy', '-0.1em')
			.attr('fill', '#d4c7a3').attr('font-size', '1.2rem').attr('font-weight', '700')
			.text(total.toLocaleString());
		svg.append('text')
			.attr('text-anchor', 'middle').attr('dy', '1.2em')
			.attr('fill', 'rgba(212,199,163,0.5)').attr('font-size', '0.55rem')
			.text('TOTAL');
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function renderBarChart(d3: any, selector: string, data: Array<{ label: string; value: number; color: string }>) {
		const el = document.querySelector(selector);
		if (!el || data.length === 0) return;
		el.innerHTML = '';

		const w = 220, h = 120, margin = { top: 8, right: 8, bottom: 28, left: 8 };
		const innerW = w - margin.left - margin.right;
		const innerH = h - margin.top - margin.bottom;

		const svg = d3.select(selector).append('svg')
			.attr('width', w).attr('height', h)
			.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

		const x = d3.scaleBand().domain(data.map(d => d.label)).range([0, innerW]).padding(0.3);
		const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) ?? 1]).range([innerH, 0]);

		svg.selectAll('rect')
			.data(data).enter().append('rect')
			.attr('x', d => x(d.label) ?? 0).attr('y', d => y(d.value))
			.attr('width', x.bandwidth()).attr('height', d => innerH - y(d.value))
			.attr('fill', d => d.color).attr('rx', 3);

		// Value labels
		svg.selectAll('.val')
			.data(data).enter().append('text')
			.attr('x', d => (x(d.label) ?? 0) + x.bandwidth() / 2)
			.attr('y', d => y(d.value) - 4)
			.attr('text-anchor', 'middle').attr('fill', '#d4c7a3').attr('font-size', '0.6rem')
			.text(d => d.value.toLocaleString());

		// Axis labels
		svg.selectAll('.lbl')
			.data(data).enter().append('text')
			.attr('x', d => (x(d.label) ?? 0) + x.bandwidth() / 2)
			.attr('y', innerH + 16)
			.attr('text-anchor', 'middle').attr('fill', 'rgba(212,199,163,0.6)').attr('font-size', '0.5rem')
			.text(d => d.label);
	}

	function renderServiceHealth(_d3: any, selector: string, data: Array<{ name: string; status: string; latency?: number }>) {
		const el = document.querySelector(selector);
		if (!el || data.length === 0) return;
		el.innerHTML = '';

		for (const svc of data) {
			const row = document.createElement('div');
			row.className = 'svc-row';
			const color = svc.status === 'up' ? '#4ade80' : svc.status === 'degraded' ? '#fbbf24' : '#f87171';
			row.innerHTML = `
				<span class="svc-dot" style="background:${color}"></span>
				<span class="svc-name">${svc.name}</span>
				<span class="svc-status" style="color:${color}">${svc.status}</span>
				${svc.latency != null ? `<span class="svc-latency">${svc.latency}ms</span>` : ''}
			`;
			el.appendChild(row);
		}
	}

	// --- admin nav links ---
	const adminLinks = [
		{ href: '/admin/ai-dashboard', label: 'AI Dashboard', icon: 'brain', desc: 'Operator + Lab consoles' },
		{ href: '/admin/codebase-index', label: 'Codebase Index', icon: 'database', desc: 'Qdrant/Postgres browser' },
		{ href: '/admin/codebase-graph', label: 'Codebase Graph', icon: 'git-branch', desc: 'Import dependency graph' },
		{ href: '/admin/case-graph', label: 'Case Graph', icon: 'git-fork', desc: 'D3 case/evidence/person relationships' },
		{ href: '/admin/error-brain', label: 'Error Brain', icon: 'bug', desc: 'AI error diagnosis' },
		{ href: '/admin/cache', label: 'Cache Monitor', icon: 'hard-drive', desc: 'Redis + GPU buffers' },
		{ href: '/admin/topology', label: 'Topology', icon: 'network', desc: 'Interactive dependency view' },
		{ href: '/admin/dev-tools', label: 'Dev Tools', icon: 'wrench', desc: '13+ tool tabs' },
		{ href: '/admin/knowledge-search', label: 'Knowledge Search', icon: 'search', desc: 'Semantic search + tags' },
		{ href: '/admin/library', label: 'Legal Library', icon: 'book-open', desc: 'Document ingestion' },
		{ href: '/admin/phase89', label: 'Phase 89', icon: 'flask-conical', desc: 'Cluster analysis' },
		{ href: '/admin/kag-notebook', label: 'KAG Notebook', icon: 'notebook-pen', desc: 'Knowledge notebook' },
		{ href: '/admin/search-intelligence', label: 'Contextual Assistant', icon: 'bot', desc: 'GraphRAG + DenseRAG chat' },
		{ href: '/admin/all-routes', label: 'All Routes', icon: 'route', desc: 'Route health ops' },
		{ href: '/admin/face-gallery', label: 'Face Gallery', icon: 'scan-face', desc: 'POI face matching + GRPO reranker + QLoRA synths' },
		{ href: '/admin/observability', label: 'Observability', icon: 'activity', desc: 'Graph/search/ACE spine health' },
	];
</script>

<div class="admin-overview">
	<header class="overview-header">
		<div>
			<p class="eyebrow">Admin Console</p>
			<h1>System Overview</h1>
			<p class="subtitle">Unified dashboard — cases, evidence, AI health, and knowledge base at a glance.</p>
		</div>
		{#if analytics}
			<div class="period-badge">
				<Icon name="calendar" class="w-3.5 h-3.5" />
				{analytics.period} window
			</div>
		{/if}
	</header>

	{#if loading}
		<div class="loading-grid">
			{#each Array(6) as _}
				<div class="skeleton-card"></div>
			{/each}
		</div>
	{:else}
		<!-- Metric cards row -->
		<section class="metric-cards">
			<div class="metric-card">
				<div class="metric-icon cases"><Icon name="briefcase" class="w-5 h-5" /></div>
				<div class="metric-body">
					<span class="metric-value">{analytics?.cases.total ?? dashStats?.activeCases ?? 0}</span>
					<span class="metric-label">Total Cases</span>
					<span class="metric-sub">{analytics?.cases.active ?? dashStats?.activeCases ?? 0} active</span>
				</div>
				<div id="case-donut" class="donut-slot"></div>
			</div>

			<div class="metric-card">
				<div class="metric-icon evidence"><Icon name="file-text" class="w-5 h-5" /></div>
				<div class="metric-body">
					<span class="metric-value">{analytics?.evidence.total ?? dashStats?.totalEvidence ?? 0}</span>
					<span class="metric-label">Evidence Items</span>
					<span class="metric-sub">{analytics?.evidence.recentUploaded ?? 0} recent</span>
				</div>
			</div>

			<div class="metric-card">
				<div class="metric-icon errors"><Icon name="bug" class="w-5 h-5" /></div>
				<div class="metric-body">
					<span class="metric-value">{analytics?.errorBrain.totalErrors ?? 0}</span>
					<span class="metric-label">Error Brain</span>
					<span class="metric-sub fix-rate">{analytics?.errorBrain.fixRate ?? 100}% fix rate</span>
				</div>
				<div id="error-donut" class="donut-slot"></div>
			</div>

			<div class="metric-card">
				<div class="metric-icon pois"><Icon name="users" class="w-5 h-5" /></div>
				<div class="metric-body">
					<span class="metric-value">{analytics?.personsOfInterest.total ?? dashStats?.personsOfInterest ?? 0}</span>
					<span class="metric-label">Persons of Interest</span>
					<span class="metric-sub">{analytics?.personsOfInterest.critical ?? 0} critical</span>
				</div>
				<div id="poi-donut" class="donut-slot"></div>
			</div>
		</section>

		<!-- Charts row -->
		<section class="charts-row">
			<div class="chart-panel">
				<h3><Icon name="book-open" class="w-4 h-4" /> Knowledge Base</h3>
				<div id="kb-bars" class="chart-container"></div>
				{#if dashStats}
					<p class="chart-total">{dashStats.knowledgeBase.total.toLocaleString()} total entries · {dashStats.savedCitations.toLocaleString()} saved citations</p>
				{/if}
			</div>

			<div class="chart-panel">
				<h3><Icon name="activity" class="w-4 h-4" /> Service Health</h3>
				<div id="service-health" class="service-health-container"></div>
			</div>

			{#if cacheStats}
				<div class="chart-panel">
					<h3><Icon name="hard-drive" class="w-4 h-4" /> Cache Performance</h3>
					<div class="cache-metrics">
						<div class="cache-stat">
							<span class="cache-val">{typeof cacheStats.hitRate === 'number' ? cacheStats.hitRate.toFixed(1) : '—'}%</span>
							<span class="cache-lbl">Hit Rate</span>
						</div>
						<div class="cache-stat">
							<span class="cache-val">{cacheStats.totalKeys?.toLocaleString() ?? '—'}</span>
							<span class="cache-lbl">Keys</span>
						</div>
						<div class="cache-stat">
							<span class="cache-val">{cacheStats.memoryUsed ?? '—'}</span>
							<span class="cache-lbl">Memory</span>
						</div>
					</div>
				</div>
			{/if}
		</section>

		<!-- Admin navigation grid -->
		<section class="nav-section">
			<h2>Admin Tools</h2>
			<div class="nav-grid">
				{#each adminLinks as link}
					<a class="nav-card" href={link.href}>
						<div class="nav-icon"><Icon name={link.icon} class="w-5 h-5" /></div>
						<div class="nav-body">
							<span class="nav-label">{link.label}</span>
							<span class="nav-desc">{link.desc}</span>
						</div>
						<Icon name="chevron-right" class="w-4 h-4 nav-arrow" />
					</a>
				{/each}
			</div>
		</section>

		{#if errors.length > 0}
			<div class="error-banner">
				{#each errors as err}
					<p>{err}</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.admin-overview {
		min-height: 100vh;
		margin: -2.5rem;
		padding: 2.5rem;
		background:
			radial-gradient(circle at top left, rgba(96, 165, 250, 0.08), transparent 32%),
			radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.06), transparent 28%),
			#0e0d0b;
		color: rgb(212 199 163);
	}

	.overview-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.48);
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 1;
		color: rgba(245, 240, 223, 0.96);
	}

	.subtitle {
		margin: 0.8rem 0 0;
		max-width: 52rem;
		color: rgba(212, 199, 163, 0.72);
		font-size: 0.98rem;
		line-height: 1.6;
	}

	.period-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.75rem;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 6px;
		color: #93c5fd;
		white-space: nowrap;
	}

	/* Skeleton loading */
	.loading-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}

	.skeleton-card {
		height: 140px;
		border-radius: 12px;
		background: linear-gradient(90deg, rgba(82,80,69,0.3) 25%, rgba(82,80,69,0.5) 50%, rgba(82,80,69,0.3) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
	}

	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	/* Metric cards */
	.metric-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.metric-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		background: rgba(30, 29, 25, 0.7);
		border: 1px solid rgba(82, 80, 69, 0.35);
		border-radius: 12px;
		transition: border-color 0.2s;
	}

	.metric-card:hover {
		border-color: rgba(96, 165, 250, 0.3);
	}

	.metric-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 42px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.metric-icon.cases { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
	.metric-icon.evidence { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.metric-icon.errors { background: rgba(248, 113, 113, 0.15); color: #f87171; }
	.metric-icon.pois { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

	.metric-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.metric-value {
		font-size: 1.6rem;
		font-weight: 700;
		color: rgba(245, 240, 223, 0.95);
		line-height: 1;
	}

	.metric-label {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.6);
		margin-top: 0.3rem;
	}

	.metric-sub {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.45);
		margin-top: 0.15rem;
	}

	.metric-sub.fix-rate { color: #4ade80; }

	.donut-slot {
		flex-shrink: 0;
		width: 120px;
		height: 120px;
	}

	/* Charts row */
	.charts-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.chart-panel {
		padding: 1.25rem;
		background: rgba(30, 29, 25, 0.7);
		border: 1px solid rgba(82, 80, 69, 0.35);
		border-radius: 12px;
	}

	.chart-panel h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.8);
		font-weight: 600;
	}

	.chart-container {
		display: flex;
		justify-content: center;
	}

	.chart-total {
		margin: 0.75rem 0 0;
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.45);
		text-align: center;
	}

	/* Service health */
	.service-health-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	:global(.svc-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0;
		font-size: 0.78rem;
	}

	:global(.svc-dot) {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	:global(.svc-name) {
		flex: 1;
		color: rgba(212, 199, 163, 0.8);
	}

	:global(.svc-status) {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.svc-latency) {
		font-size: 0.62rem;
		color: rgba(212, 199, 163, 0.4);
		min-width: 3rem;
		text-align: right;
	}

	/* Cache metrics */
	.cache-metrics {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
	}

	.cache-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.cache-val {
		font-size: 1.4rem;
		font-weight: 700;
		color: rgba(245, 240, 223, 0.95);
	}

	.cache-lbl {
		font-size: 0.62rem;
		color: rgba(212, 199, 163, 0.45);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	/* Admin nav */
	.nav-section {
		margin-top: 0.5rem;
	}

	.nav-section h2 {
		font-size: 1rem;
		color: rgba(212, 199, 163, 0.7);
		margin: 0 0 1rem;
		font-weight: 600;
	}

	.nav-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}

	.nav-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.9rem 1.1rem;
		background: rgba(30, 29, 25, 0.5);
		border: 1px solid rgba(82, 80, 69, 0.25);
		border-radius: 10px;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.2s, background 0.2s;
	}

	.nav-card:hover {
		border-color: rgba(96, 165, 250, 0.35);
		background: rgba(30, 29, 25, 0.8);
	}

	.nav-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: rgba(96, 165, 250, 0.1);
		color: #93c5fd;
		flex-shrink: 0;
	}

	.nav-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.nav-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(245, 240, 223, 0.9);
	}

	.nav-desc {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.45);
		margin-top: 0.1rem;
	}

	:global(.nav-arrow) {
		color: rgba(212, 199, 163, 0.2);
		flex-shrink: 0;
	}

	.nav-card:hover :global(.nav-arrow) {
		color: rgba(96, 165, 250, 0.6);
	}

	/* Error banner */
	.error-banner {
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		border-radius: 8px;
		font-size: 0.75rem;
		color: rgba(248, 113, 113, 0.8);
	}

	.error-banner p { margin: 0.25rem 0; }
</style>
