<script lang="ts">
	import { goto } from '$app/navigation';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let now = $state(new Date());

	$effect(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 30_000);

		return () => clearInterval(timer);
	});

	let metrics = $derived({
		totalCases: data.metrics?.totalCases ?? 0,
		activeCases: data.metrics?.activeCases ?? 0,
		evidenceProcessed: data.metrics?.evidenceProcessed ?? 0
	});

	let serviceEntries = $derived.by(() =>
		Object.entries(data.serviceHealth ?? {})
			.filter(([key]) => key !== 'overall')
			.map(([service, status]) => ({
				service,
				online: Boolean(status)
			}))
	);

	let overallStatus = $derived.by(() => String(data.serviceHealth?.overall ?? 'unknown'));
	let onlineServiceCount = $derived.by(() => serviceEntries.filter((entry) => entry.online).length);
	let offlineServices = $derived.by(() => serviceEntries.filter((entry) => !entry.online));
	let heroSummary = $derived.by(() => {
		if (overallStatus === 'healthy') {
			return 'All linked systems are nominal. Route active investigations through intake, retrieval, and AI-assisted analysis from a single console.';
		}

		if (overallStatus === 'degraded') {
			return 'The command grid remains online, but one or more linked services need attention before high-volume routing.';
		}

		return 'Health telemetry is incomplete. Use the service rail to confirm dependencies before dispatching new work.';
	});

	const quickActions = [
		{ icon: 'gavel', label: 'Open Cases', detail: 'Review and create case files', href: '/cases' },
		{ icon: 'upload', label: 'Evidence Intake', detail: 'Upload and process evidence', href: '/evidence' },
		{ icon: 'search', label: 'Global Search', detail: 'Cross-case lookup and retrieval', href: '/global-search' },
		{ icon: 'bar-chart-2', label: 'Analytics', detail: 'Review trends and system metrics', href: '/dashboard' }
	] as const;

	const modules = [
		{ icon: 'terminal', title: 'AI Chat Console', detail: 'Open the 9S terminal-style assistant interface.', href: '/terminal' },
		{ icon: 'folders', title: 'Codebase Ops', detail: 'Open the codebase command-center tools and graphs.', href: '/command-center/codebase' },
		{ icon: 'shield', title: 'System Configuration', detail: 'Inspect infrastructure settings and operational state.', href: '/system-configuration' },
		{ icon: 'cpu', title: 'Analysis Center', detail: 'Jump into investigative analysis workflows.', href: '/analysis-center' }
	] as const;

	let statusFeed = $derived.by(() => {
		const timestamp = formatTime(now);
		const degradedServices = serviceEntries.filter((entry) => !entry.online);
		const items = [
			{
				level: overallStatus,
				title: 'System State',
				message:
					overallStatus === 'healthy'
						? 'All core services report operational.'
						: overallStatus === 'degraded'
							? 'One or more subsystems need attention.'
							: 'Health telemetry incomplete or unavailable.',
				timestamp
			},
			{
				level: degradedServices.length > 0 ? 'warning' : 'info',
				title: 'Service Matrix',
				message:
					degradedServices.length > 0
						? `${degradedServices.map((entry) => entry.service).join(', ')} flagged offline.`
						: `${onlineServiceCount}/${serviceEntries.length} services responding.`,
				timestamp
			},
			{
				level: 'info',
				title: 'Case Load',
				message: `${metrics.activeCases} active cases and ${metrics.evidenceProcessed} evidence items in active rotation.`,
				timestamp
			},
			{
				level: 'info',
				title: 'Operator',
				message: data.user?.email ? `Console bound to ${data.user.email}.` : 'Guest session attached to command console.',
				timestamp
			}
		];

		return items;
	});

	function formatTime(date: Date) {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function openRoute(path: string) {
		goto(path);
	}

	function serviceLabel(service: string) {
		return service.replace(/[-_]/g, ' ').toUpperCase();
	}

	function overallClass(status: string) {
		if (status === 'healthy') return 'status-chip status-chip--ok';
		if (status === 'degraded') return 'status-chip status-chip--warn';
		return 'status-chip status-chip--error';
	}

	function feedClass(level: string) {
		if (level === 'healthy') return 'feed-item feed-item--ok';
		if (level === 'warning' || level === 'degraded') return 'feed-item feed-item--warn';
		if (level === 'error') return 'feed-item feed-item--error';
		return 'feed-item';
	}
</script>

<svelte:head>
	<title>Command Center - YoRHa Legal AI</title>
</svelte:head>

<div class="command-shell">
	<div class="command-shell__glow"></div>

	<div class="command-frame">
		<header class="command-header">
			<div class="command-header__title">
				<div class="command-icon">
					<Icon name="terminal" size={20} />
				</div>
				<div>
					<p class="command-kicker">YoRHa Ops Grid</p>
					<h1>&gt;_ COMMAND CENTER</h1>
					<p class="command-subtitle">
						Operator {data.user?.email ?? 'guest'} · updated {formatTime(now)}
					</p>
				</div>
			</div>

			<div class="command-header__actions">
				<div class={overallClass(overallStatus)}>
					<span class="status-dot"></span>
					{overallStatus.toUpperCase()}
				</div>
				<button class="header-action" onclick={() => openRoute('/terminal')}>
					<Icon name="message-square" size={14} />
					AI CHAT
				</button>
				<button class="header-action" onclick={() => openRoute('/command-center/codebase')}>
					<Icon name="folders" size={14} />
					CODEBASE
				</button>
			</div>
		</header>

		<main class="command-main">
			<section class="hero-grid">
				<section class="surface-panel surface-panel--brief">
					<div class="surface-panel__header">
						<div>
							<p class="surface-kicker">Command Brief</p>
							<h2>Operational Routing</h2>
						</div>
						<div class:surface-badge--alert={offlineServices.length > 0} class="surface-badge">
							{offlineServices.length > 0 ? 'ATTN REQUIRED' : 'CLEAR TO ROUTE'}
						</div>
					</div>

					<p class="hero-copy">{heroSummary}</p>

					<div class="signal-strip">
						<div class="signal-chip">
							<span class="signal-chip__label">ACTIVE CASES</span>
							<strong>{metrics.activeCases}</strong>
							<span>{metrics.totalCases} total investigations on record</span>
						</div>

						<div class="signal-chip signal-chip--emerald">
							<span class="signal-chip__label">EVIDENCE INDEX</span>
							<strong>{metrics.evidenceProcessed}</strong>
							<span>Objects available for retrieval and analysis</span>
						</div>

						<div class="signal-chip signal-chip--amber">
							<span class="signal-chip__label">SERVICE RAIL</span>
							<strong>{onlineServiceCount}/{serviceEntries.length}</strong>
							<span>{offlineServices.length > 0 ? `${offlineServices.length} flagged for review` : 'No outages reported'}</span>
						</div>
					</div>

					<div class="command-line">
						<span class="command-line__prompt">route://ops</span>
						<span>
							{#if offlineServices.length > 0}
								Review {offlineServices.map((entry) => serviceLabel(entry.service)).join(', ')} before dispatching high-volume analysis jobs.
							{:else}
								Dispatch evidence intake, cross-case retrieval, or AI chat from the directive deck below.
							{/if}
						</span>
					</div>
				</section>

				<section class="surface-panel surface-panel--snapshot">
					<div class="surface-panel__header">
						<div>
							<p class="surface-kicker">Snapshot</p>
							<h2>Live Console State</h2>
						</div>
						<div class="surface-badge surface-badge--neutral">LIVE</div>
					</div>

					<div class="snapshot-grid">
						<div class="snapshot-card">
							<span class="snapshot-card__label">OPERATOR</span>
							<strong class="snapshot-card__value">{data.user?.email ?? 'guest session'}</strong>
							<p>Active console identity</p>
						</div>

						<div class="snapshot-card">
							<span class="snapshot-card__label">SYSTEM MODE</span>
							<strong class="snapshot-card__value">{overallStatus === 'healthy' ? 'nominal' : overallStatus}</strong>
							<p>Telemetry updated at {formatTime(now)}</p>
						</div>

						<div class="snapshot-card">
							<span class="snapshot-card__label">ATTENTION</span>
							<strong class:snapshot-card__value--warn={offlineServices.length > 0} class="snapshot-card__value">
								{offlineServices.length > 0 ? offlineServices.map((entry) => serviceLabel(entry.service)).join(' / ') : 'none'}
							</strong>
							<p>{offlineServices.length > 0 ? 'Degraded subsystems identified' : 'All monitored services reporting'}</p>
						</div>
					</div>
				</section>
			</section>

			<section class="metric-grid">
				<article class="metric-card">
					<div class="metric-card__header">
						<span>CASE FILES</span>
						<Icon name="gavel" size={16} />
					</div>
					<div class="metric-card__value">{metrics.totalCases}</div>
					<p>Total tracked investigations</p>
				</article>

				<article class="metric-card">
					<div class="metric-card__header">
						<span>ACTIVE CASES</span>
						<Icon name="activity" size={16} />
					</div>
					<div class="metric-card__value metric-card__value--emerald">{metrics.activeCases}</div>
					<p>Currently in operational rotation</p>
				</article>

				<article class="metric-card">
					<div class="metric-card__header">
						<span>EVIDENCE</span>
						<Icon name="file-text" size={16} />
					</div>
					<div class="metric-card__value metric-card__value--blue">{metrics.evidenceProcessed}</div>
					<p>Indexed evidence objects</p>
				</article>

				<article class="metric-card">
					<div class="metric-card__header">
						<span>SERVICES</span>
						<Icon name="cpu" size={16} />
					</div>
					<div class="metric-card__value metric-card__value--amber">{onlineServiceCount}/{serviceEntries.length}</div>
					<p>Subsystems responding</p>
				</article>
			</section>

			<section class="ops-layout">
				<div class="ops-layout__main">
					<section class="surface-panel surface-panel--quick-actions quick-actions-panel" data-panel="quick-actions">
						<div class="surface-panel__header">
							<div>
								<p class="surface-kicker">Directives</p>
								<h2>Priority Routes</h2>
							</div>
							<div class="surface-badge surface-badge--neutral">4 ROUTES</div>
						</div>

						<div class="action-grid">
							{#each quickActions as action}
								<button class="action-card action-button" data-action={action.label} onclick={() => openRoute(action.href)}>
									<div class="action-card__icon">
										<Icon name={action.icon} size={16} />
									</div>
									<div class="action-card__body">
										<strong class="action-label">{action.label}</strong>
										<span>{action.detail}</span>
									</div>
									<Icon name="arrow-right" size={14} class="action-card__arrow" />
								</button>
							{/each}
						</div>
					</section>

					<section class="surface-panel surface-panel--search">
						<div class="surface-panel__header">
							<div>
								<p class="surface-kicker">Indexed Lookup</p>
								<h2>Codebase Search</h2>
							</div>
							<div class="surface-badge surface-badge--neutral">CTRL/CMD + K</div>
						</div>
						<p class="search-copy">
							Open the indexed command palette or jump directly into the codebase explorer.
						</p>
						<div class="search-actions">
							<button class="header-action" onclick={() => openRoute('/command-center/codebase')}>
								<Icon name="folders" size={14} />
								OPEN CODEBASE OPS
							</button>
							<button class="header-action" onclick={() => openRoute('/terminal')}>
								<Icon name="bot" size={14} />
								OPEN AI CHAT
							</button>
						</div>
					</section>
				</div>

				<div class="ops-layout__side">
					<section class="surface-panel">
					<div class="surface-panel__header">
						<div>
							<p class="surface-kicker">Live Matrix</p>
							<h2>Service Health</h2>
						</div>
						<div class="surface-badge">{onlineServiceCount} ONLINE</div>
					</div>

					<div class="service-list">
						{#each serviceEntries as entry}
							<div class="service-row">
								<div class="service-row__name">
									<span class:service-indicator--offline={!entry.online} class="service-indicator"></span>
									{serviceLabel(entry.service)}
								</div>
								<div class:service-state--offline={!entry.online} class="service-state">
									{entry.online ? 'ONLINE' : 'OFFLINE'}
								</div>
							</div>
						{/each}
					</div>
					</section>

					<section class="surface-panel">
					<div class="surface-panel__header">
						<div>
							<p class="surface-kicker">Mission Feed</p>
							<h2>Operations Log</h2>
						</div>
						<div class="surface-badge surface-badge--neutral">AUTO</div>
					</div>

					<div class="feed-list">
						{#each statusFeed as item}
							<div class={feedClass(item.level)}>
								<div class="feed-item__meta">
									<span>{item.title}</span>
									<span>{item.timestamp}</span>
								</div>
								<p>{item.message}</p>
							</div>
						{/each}
					</div>
					</section>
					<section class="surface-panel surface-panel--modules">
					<div class="surface-panel__header">
						<div>
							<p class="surface-kicker">Linked Consoles</p>
							<h2>Launch Modules</h2>
						</div>
						<div class="surface-badge">SYNCED</div>
					</div>

					<div class="module-list">
						{#each modules as module}
							<button class="module-card" onclick={() => openRoute(module.href)}>
								<div class="module-card__header">
									<div class="module-card__icon">
										<Icon name={module.icon} size={16} />
									</div>
									<strong>{module.title}</strong>
								</div>
								<p>{module.detail}</p>
							</button>
						{/each}
					</div>
					</section>
				</div>
			</section>
		</main>
	</div>

	<CodebaseSearch />
</div>

<style>
	:global(body) {
		background: #0c0a09;
	}

	.command-shell {
		position: relative;
		min-height: 100vh;
		padding: 1.25rem;
		background:
			radial-gradient(circle at top, rgba(22, 101, 52, 0.14), transparent 24%),
			radial-gradient(circle at 86% 10%, rgba(180, 83, 9, 0.08), transparent 18%),
			linear-gradient(180deg, #13100f 0%, #0d0b0a 52%, #080707 100%);
		color: #e7e5e4;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
	}

	.command-shell__glow {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background:
			linear-gradient(90deg, rgba(16, 185, 129, 0.03), transparent 18%, transparent 82%, rgba(59, 130, 246, 0.03)),
			repeating-linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.012) 0,
				rgba(255, 255, 255, 0.012) 1px,
				transparent 1px,
				transparent 4px
			);
	}

	.command-frame {
		position: relative;
		z-index: 1;
		max-width: 1460px;
		margin: 0 auto;
		display: grid;
		gap: 1.1rem;
	}

	.command-header,
	.surface-panel,
	.metric-card {
		background: linear-gradient(180deg, rgba(27, 24, 22, 0.94), rgba(20, 18, 17, 0.9));
		border: 1px solid rgba(87, 83, 78, 0.72);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.26), inset 0 1px 0 rgba(16, 185, 129, 0.07);
		backdrop-filter: blur(10px);
	}

	.command-header {
		position: relative;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.15rem 1.3rem;
		border-radius: 0.85rem;
	}

	.command-header::after {
		content: '';
		position: absolute;
		left: 1.3rem;
		right: 1.3rem;
		bottom: 0;
		height: 1px;
		background: linear-gradient(90deg, rgba(16, 185, 129, 0.42), rgba(59, 130, 246, 0.12), transparent);
	}

	.command-header__title {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.command-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.85rem;
		border: 1px solid rgba(16, 185, 129, 0.35);
		background: rgba(6, 78, 59, 0.2);
		color: #34d399;
	}

	.command-kicker,
	.surface-kicker {
		margin: 0 0 0.35rem;
		font-size: 0.72rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: #6ee7b7;
	}

	h1,
	h2 {
		margin: 0;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	h1 {
		font-size: clamp(1.35rem, 2vw, 2rem);
		color: #fafaf9;
	}

	h2 {
		font-size: 1rem;
		color: #f5f5f4;
	}

	.command-subtitle {
		margin: 0.45rem 0 0;
		font-size: 0.82rem;
		color: #a8a29e;
	}

	.command-header__actions,
	.search-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.header-action,
	.action-card,
	.module-card {
		cursor: pointer;
		transition: border-color 0.18s ease, transform 0.18s ease, color 0.18s ease, background 0.18s ease;
	}

	.header-action {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.64rem 0.9rem;
		border-radius: 0.68rem;
		border: 1px solid rgba(87, 83, 78, 0.74);
		background: rgba(12, 10, 9, 0.84);
		color: #d6d3d1;
		font: inherit;
		font-size: 0.76rem;
		letter-spacing: 0.12em;
	}

	.header-action:hover,
	.action-card:hover,
	.module-card:hover {
		border-color: rgba(52, 211, 153, 0.65);
		transform: translateY(-1px);
	}

	.status-chip,
	.surface-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.52rem 0.76rem;
		border-radius: 999px;
		font-size: 0.74rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		border: 1px solid rgba(87, 83, 78, 0.7);
	}

	.status-chip--ok {
		color: #86efac;
		background: rgba(20, 83, 45, 0.28);
		border-color: rgba(34, 197, 94, 0.35);
	}

	.status-chip--warn {
		color: #facc15;
		background: rgba(133, 77, 14, 0.24);
		border-color: rgba(234, 179, 8, 0.35);
	}

	.status-chip--error {
		color: #fca5a5;
		background: rgba(127, 29, 29, 0.24);
		border-color: rgba(239, 68, 68, 0.35);
	}

	.status-dot,
	.service-indicator {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: #34d399;
		box-shadow: 0 0 10px rgba(52, 211, 153, 0.6);
	}

	.command-main {
		display: grid;
		gap: 1.1rem;
	}

	.hero-grid,
	.metric-grid,
	.panel-grid,
	.ops-layout,
	.ops-layout__main,
	.ops-layout__side {
		display: grid;
		gap: 0.9rem;
	}

	.hero-grid {
		grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.95fr);
	}

	.metric-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.ops-layout {
		grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.88fr);
		align-items: start;
	}

	.panel-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.metric-card,
	.surface-panel {
		border-radius: 0.85rem;
	}

	.metric-card {
		padding: 0.95rem 1rem;
	}

	.metric-card__header,
	.service-row,
	.feed-item__meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.metric-card__header {
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		color: #a8a29e;
	}

	.metric-card__value {
		margin: 0.95rem 0 0.4rem;
		font-size: clamp(1.8rem, 4vw, 2.5rem);
		font-weight: 800;
		color: #f5f5f4;
	}

	.metric-card__value--emerald {
		color: #6ee7b7;
	}

	.metric-card__value--blue {
		color: #5eead4;
	}

	.metric-card__value--amber {
		color: #fcd34d;
	}

	.metric-card p,
	.search-copy,
	.action-card__body span,
	.module-card p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
		color: #a8a29e;
	}

	.surface-panel {
		padding: 1rem;
	}

	.surface-panel--brief {
		border-color: rgba(16, 185, 129, 0.24);
		background:
			linear-gradient(180deg, rgba(22, 26, 23, 0.96), rgba(16, 18, 17, 0.92)),
			radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 38%);
	}

	.surface-panel--snapshot {
		background:
			linear-gradient(180deg, rgba(28, 24, 21, 0.96), rgba(18, 17, 18, 0.92)),
			radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 36%);
	}

	.surface-panel--quick-actions {
		border-color: rgba(16, 185, 129, 0.28);
	}

	.surface-panel--modules {
		border-color: rgba(96, 165, 250, 0.18);
	}

	.surface-panel__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.85rem;
	}

	.surface-badge {
		color: #6ee7b7;
		background: rgba(6, 78, 59, 0.2);
		border-color: rgba(16, 185, 129, 0.25);
	}

	.surface-badge--alert {
		color: #fcd34d;
		background: rgba(133, 77, 14, 0.24);
		border-color: rgba(245, 158, 11, 0.35);
	}

	.surface-badge--neutral {
		color: #cbd5e1;
		background: rgba(30, 41, 59, 0.35);
		border-color: rgba(100, 116, 139, 0.35);
	}

	.service-list,
	.feed-list,
	.module-list {
		display: grid;
		gap: 0.65rem;
	}

	.hero-copy {
		margin: 0;
		max-width: 60ch;
		font-size: 0.93rem;
		line-height: 1.75;
		color: #d6d3d1;
	}

	.signal-strip,
	.snapshot-grid {
		display: grid;
		gap: 0.7rem;
	}

	.signal-strip {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 1.05rem;
	}

	.signal-chip,
	.snapshot-card {
		padding: 0.82rem 0.9rem;
		border-radius: 0.78rem;
		border: 1px solid rgba(87, 83, 78, 0.6);
		background: rgba(12, 10, 9, 0.74);
	}

	.signal-chip {
		display: grid;
		gap: 0.3rem;
	}

	.signal-chip--emerald {
		border-color: rgba(16, 185, 129, 0.22);
	}

	.signal-chip--amber {
		border-color: rgba(245, 158, 11, 0.24);
	}

	.signal-chip__label,
	.snapshot-card__label {
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #a8a29e;
	}

	.signal-chip strong,
	.snapshot-card__value {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: #fafaf9;
	}

	.signal-chip span:last-child,
	.snapshot-card p {
		font-size: 0.8rem;
		line-height: 1.55;
		color: #a8a29e;
		margin: 0;
	}

	.snapshot-card__value--warn {
		color: #fcd34d;
	}

	.command-line {
		margin-top: 1rem;
		padding: 0.82rem 0.95rem;
		border-radius: 0.78rem;
		border: 1px dashed rgba(16, 185, 129, 0.25);
		background: rgba(6, 78, 59, 0.1);
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
		font-size: 0.85rem;
		line-height: 1.65;
		color: #d6d3d1;
	}

	.command-line__prompt {
		flex: none;
		color: #6ee7b7;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.service-row,
	.feed-item,
	.action-card,
	.module-card {
		padding: 0.82rem 0.9rem;
		border-radius: 0.72rem;
		border: 1px solid rgba(87, 83, 78, 0.62);
		background: rgba(12, 10, 9, 0.78);
	}

	.service-row__name {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		color: #e7e5e4;
	}

	.service-indicator--offline {
		background: #f87171;
		box-shadow: 0 0 10px rgba(248, 113, 113, 0.55);
	}

	.service-state {
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		color: #86efac;
	}

	.service-state--offline {
		color: #fca5a5;
	}

	.feed-item {
		border-left: 2px solid rgba(148, 163, 184, 0.35);
	}

	.feed-item--ok {
		border-left-color: rgba(34, 197, 94, 0.65);
	}

	.feed-item--warn {
		border-left-color: rgba(234, 179, 8, 0.65);
	}

	.feed-item--error {
		border-left-color: rgba(239, 68, 68, 0.65);
	}

	.feed-item__meta {
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #a8a29e;
		margin-bottom: 0.45rem;
	}

	.feed-item p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.55;
		color: #e7e5e4;
	}

	.action-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.action-card {
		display: grid;
		grid-template-columns: auto auto;
		grid-template-areas:
			'icon arrow'
			'body body';
		align-items: start;
		gap: 0.85rem;
		width: 100%;
		min-height: 8rem;
		text-align: left;
		font: inherit;
		color: inherit;
		background:
			linear-gradient(180deg, rgba(11, 14, 12, 0.92), rgba(13, 10, 9, 0.82)),
			radial-gradient(circle at top left, rgba(16, 185, 129, 0.07), transparent 45%);
	}

	.action-card__icon,
	.module-card__icon {
		grid-area: icon;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.62rem;
		border: 1px solid rgba(16, 185, 129, 0.24);
		background: rgba(6, 78, 59, 0.18);
		color: #6ee7b7;
	}

	.action-card__body,
	.module-card__header {
		grid-area: body;
		display: grid;
		gap: 0.28rem;
	}

	.action-card__body strong,
	.module-card__header strong {
		font-size: 0.92rem;
		letter-spacing: 0.08em;
		color: #fafaf9;
	}

	.action-card__arrow {
		grid-area: arrow;
		justify-self: end;
		width: 1.85rem;
		height: 1.85rem;
		padding: 0.32rem;
		border-radius: 999px;
		border: 1px solid rgba(16, 185, 129, 0.24);
		background: rgba(6, 78, 59, 0.12);
		color: #6ee7b7;
	}

	.module-list {
		grid-template-columns: 1fr;
		gap: 0.7rem;
	}

	.module-card {
		text-align: left;
		font: inherit;
		color: inherit;
	}

	.module-card__header {
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 0.7rem;
	}

	.surface-panel--search {
		display: grid;
		gap: 1rem;
	}

	@media (max-width: 1100px) {
		.hero-grid,
		.ops-layout {
			grid-template-columns: 1fr;
		}

		.signal-strip,
		.metric-grid,
		.panel-grid,
		.module-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 820px) {
		.command-shell {
			padding: 1rem;
		}

		.command-header,
		.command-header__title,
		.command-header__actions,
		.signal-strip,
		.metric-grid,
		.panel-grid,
		.ops-layout,
		.ops-layout__main,
		.ops-layout__side,
		.module-list,
		.action-grid,
		.action-card {
			grid-template-columns: 1fr;
		}

		.command-header,
		.command-header__title,
		.command-header__actions {
			display: grid;
		}

		.action-card {
			text-align: left;
			grid-template-areas:
				'icon'
				'body';
			min-height: auto;
		}

		.action-card__arrow {
			display: none;
		}

		.command-line {
			flex-direction: column;
		}
	}
</style>
