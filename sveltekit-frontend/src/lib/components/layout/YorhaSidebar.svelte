<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	let collapsed = $state(false);
	let userToggledManually = $state(false);
	let currentTime = $state(new Date().toLocaleString());

	// Analysis routes need maximum workspace — auto-collapse on entry
	const ANALYSIS_ROUTES = ['/audio-analysis/', '/video-analysis/', '/document-analysis/'];
	let isAnalysisRoute = $derived(ANALYSIS_ROUTES.some(r => page.url.pathname.startsWith(r)));

	$effect(() => {
		if (!browser) return;
		if (isAnalysisRoute && !userToggledManually) {
			collapsed = true;
		} else if (!isAnalysisRoute) {
			// Restore persisted state when leaving analysis routes
			userToggledManually = false;
			const saved = localStorage.getItem('yorha-sidebar-collapsed');
			if (saved !== null) collapsed = saved === 'true';
		}
	});

	// Update time every second
	$effect(() => {
		if (!browser) return;
		const interval = setInterval(() => {
			currentTime = new Date().toLocaleString('en-US', {
				month: '2-digit',
				day: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});
		}, 1000);
		return () => clearInterval(interval);
	});

	// Main navigation items (merged from both sidebars)
	const navItems = [
		{ label: 'DASHBOARD', icon: 'layout-dashboard', href: '/dashboard' },
		{ label: 'COMMAND CENTER', icon: 'radio', href: '/command-center' },
		{ label: 'ACTIVE CASES', icon: 'folder-open', href: '/active-cases' },
		{ label: 'CASES', icon: 'folder', href: '/cases' },
		{ label: 'EVIDENCE', icon: 'fingerprint-pattern', href: '/evidence' },
		{ label: 'EVIDENCE LIBRARY', icon: 'library', href: '/evidence-library' },
		{ label: 'CITATIONS', icon: 'scroll-text', href: '/citations' },
		{ label: 'LEGAL CORPUS', icon: 'book-open', href: '/legal-corpus' },
		{ label: 'FICTIONAL CASES', icon: 'flask-conical', href: '/fictional-cases' },
		{ label: 'SIMULATION', icon: 'scale', href: '/simulation' },
		{ label: 'COURTROOM SIM', icon: 'gavel', href: '/demos/courtroom-sim' },
		{ label: 'LEGAL LIBRARY', icon: 'library-big', href: '/library' },
		{ label: 'GLOSSARY', icon: 'book-open-text', href: '/library/glossary' },
		{ label: 'PERSONS OF INTEREST', icon: 'users', href: '/persons-of-interest' },
		{ label: 'ANALYSIS CENTER', icon: 'search', href: '/analysis-center' },
		{ label: 'GLOBAL SEARCH', icon: 'scan-search', href: '/global-search' },
		{ label: 'AI DASHBOARD', icon: 'brain', href: '/admin/ai-dashboard' },
		{ label: 'TERMINAL', icon: 'terminal', href: '/terminal' },
		{ label: 'MEMORY PALACE', icon: 'landmark', href: '/memory-palace' },
		{ label: 'ALL ROUTES', icon: 'map', href: '/admin/all-routes' },
		{ label: 'DEMOS', icon: 'gamepad-2', href: '/demos' },
	];

	// Admin/System navigation items
	const adminItems = [
		{ label: 'ADMIN', icon: 'shield', href: '/admin' },
		{ label: 'SYSTEM CONFIG', icon: 'settings', href: '/system-configuration' },
		{ label: 'LIBRARY INGEST', icon: 'book-plus', href: '/admin/library' },
		{ label: 'AST TOPOLOGY', icon: 'network', href: '/admin/ast-topology' },
		{ label: 'GPU GRAPH', icon: 'share-2', href: '/admin/gpu-evidence-graph' },
		{ label: 'ERROR BRAIN', icon: 'bug', href: '/admin/error-brain' },
		{ label: 'AGENTIC ERRORS', icon: 'bot', href: '/agentic-errors' },
		{ label: 'CODEBASE INDEX', icon: 'database', href: '/codebase-index' },
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	// Persist collapse state (only on non-analysis routes)
	$effect(() => {
		if (browser && !isAnalysisRoute && collapsed !== undefined) {
			localStorage.setItem('yorha-sidebar-collapsed', String(collapsed));
		}
	});
</script>

<aside class="yorha-sidebar" class:collapsed>
	<!-- Header -->
	<div class="sidebar-header">
		<div class="branding">
			<h1 class="title">YORHA<br/>DETECTIVE</h1>
			<p class="subtitle">Investigation Interface</p>
		</div>
		<button
			class="collapse-btn"
			onclick={() => { collapsed = !collapsed; userToggledManually = true; }}
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<Icon name={collapsed ? 'yorha-panel-open' : 'yorha-panel-close'} size={16} />
		</button>
	</div>

	<!-- Navigation -->
	<nav class="sidebar-nav">
		<!-- Main Navigation -->
		{#each navItems as item}
			<a
				href={item.href}
				class="nav-item"
				class:active={isActive(item.href)}
				aria-label={collapsed ? item.label : undefined}
				title={collapsed ? item.label : undefined}
			>
				<Icon name={item.icon} size={14} />
				{#if !collapsed}
					<span class="nav-label">{item.label}</span>
				{/if}
			</a>
		{/each}

		<!-- Spacer -->
		<div class="nav-spacer"></div>

		<!-- Admin Section -->
		<div class="section-divider">
			{#if !collapsed}
				<span class="section-label">SYSTEM</span>
			{/if}
		</div>

		{#each adminItems as item}
			<a
				href={item.href}
				class="nav-item admin-item"
				class:active={isActive(item.href)}
				aria-label={collapsed ? item.label : undefined}
				title={collapsed ? item.label : undefined}
			>
				<Icon name={item.icon} size={14} />
				{#if !collapsed}
					<span class="nav-label">{item.label}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Footer Status -->
	{#if !collapsed}
		<div class="sidebar-footer">
			<div class="status-indicator">
				<span class="status-dot online"></span>
				<span class="status-text">Online</span>
			</div>
			<div class="system-status">System: Operational</div>
			<div class="timestamp">{currentTime}</div>
		</div>
	{/if}
</aside>

<style>
	.yorha-sidebar {
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: 210px;
		background: rgba(16, 14, 10, 0.72);
		border-right: none;
		display: flex;
		flex-direction: column;
		z-index: 1000;
		transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
		font-family: 'JetBrains Mono', monospace;
		color: rgba(232, 228, 200, 0.95);
		backdrop-filter: blur(32px) saturate(1.4);
		-webkit-backdrop-filter: blur(32px) saturate(1.4);
		box-shadow:
			12px 0 40px rgba(0, 0, 0, 0.4);
	}

	.yorha-sidebar.collapsed {
		width: 60px;
	}

	/* Header */
	.sidebar-header {
		padding: 1.5rem 1rem;
		border-bottom: 1px solid rgba(138, 133, 94, 0.1);
		position: relative;
		background: transparent;
	}

	.branding {
		opacity: 1;
		transition: opacity 0.2s;
	}

	.collapsed .branding {
		opacity: 0;
		pointer-events: none;
	}

	.title {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #ece6cb;
	}

	.subtitle {
		font-size: 0.625rem;
		margin: 0.25rem 0 0 0;
		color: rgba(200, 195, 160, 0.65);
		letter-spacing: 0.05em;
	}

	.collapse-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.5rem;
		width: 24px;
		height: 24px;
		border: none;
		background: rgba(216, 212, 184, 0.06);
		color: rgba(232, 228, 200, 0.85);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		padding: 0;
		border-radius: 0.45rem;
	}

	.collapse-btn:hover {
		background: rgba(216, 212, 184, 0.12);
		color: #f0edd4;
	}

	/* Navigation */
	.sidebar-nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0;
		overflow-y: auto;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		margin: 1px 0.5rem;
		text-decoration: none;
		color: rgba(232, 228, 200, 0.88);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 1px solid transparent;
		border-radius: 0.7rem;
		transition: all 0.15s;
		position: relative;
	}

	.collapsed .nav-item {
		justify-content: center;
		padding: 0.6rem 0.5rem;
	}

	.nav-item:hover {
		background: rgba(216, 212, 184, 0.1);
		color: #f5f1db;
	}

	.nav-item.active {
		background: rgba(216, 212, 184, 0.1);
		color: #f7f2df;
		box-shadow:
			inset 3px 0 0 #c4b78f;
	}

	.collapsed .nav-item.active {
		box-shadow:
			inset 0 -2px 0 #c4b78f,
			inset 0 1px 0 rgba(255, 255, 255, 0.03);
	}

	.admin-item {
		opacity: 0.85;
	}

	.admin-item:hover,
	.admin-item.active {
		opacity: 1;
	}

	.nav-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nav-spacer {
		flex: 1;
		min-height: 1rem;
	}

	.section-divider {
		padding: 0.5rem 1rem;
		margin-top: 0.5rem;
		border-top: 1px solid rgba(138, 133, 94, 0.08);
	}

	.section-label {
		font-size: 0.5625rem;
		font-weight: 700;
		color: rgba(200, 195, 160, 0.68);
		letter-spacing: 0.1em;
	}

	/* Footer */
	.sidebar-footer {
		padding: 1rem;
		border-top: 1px solid rgba(138, 133, 94, 0.08);
		font-size: 0.625rem;
		opacity: 1;
		background: transparent;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #666;
	}

	.status-dot.online {
		background: #4ade80;
		box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
		animation: statusPulse 3s ease-in-out infinite;
	}

	@keyframes statusPulse {
		0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.3); }
		50% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.55); }
	}

	.status-text {
		font-weight: 500;
		color: #ece6cb;
	}

	.system-status {
		margin-bottom: 0.25rem;
		color: rgba(200, 195, 160, 0.72);
	}

	.timestamp {
		color: rgba(200, 195, 160, 0.52);
		font-size: 0.5rem;
		font-variant-numeric: tabular-nums;
	}

	/* Scrollbar */
	.sidebar-nav::-webkit-scrollbar {
		width: 4px;
	}

	.sidebar-nav::-webkit-scrollbar-track {
		background: transparent;
	}

	.sidebar-nav::-webkit-scrollbar-thumb {
		background: rgba(138, 133, 94, 0.24);
		border-radius: 999px;
	}

	.sidebar-nav::-webkit-scrollbar-thumb:hover {
		background: rgba(170, 164, 126, 0.38);
	}
</style>
