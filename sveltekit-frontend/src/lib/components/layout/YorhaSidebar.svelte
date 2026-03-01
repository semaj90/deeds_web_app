<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	let collapsed = $state(false);
	let currentTime = $state(new Date().toLocaleString());

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
		{ label: 'EVIDENCE', icon: 'fingerprint', href: '/evidence' },
		{ label: 'EVIDENCE LIBRARY', icon: 'library', href: '/evidence-library' },
		{ label: 'CITATIONS', icon: 'scroll-text', href: '/citations' },
		{ label: 'PERSONS OF INTEREST', icon: 'users', href: '/persons-of-interest' },
		{ label: 'ANALYSIS CENTER', icon: 'search', href: '/analysis-center' },
		{ label: 'GLOBAL SEARCH', icon: 'scan-search', href: '/global-search' },
		{ label: 'AI DASHBOARD', icon: 'brain', href: '/ai-dashboard' },
		{ label: 'TERMINAL', icon: 'terminal', href: '/terminal' },
		{ label: 'MEMORY PALACE', icon: 'landmark', href: '/memory-palace' },
		{ label: 'ALL ROUTES', icon: 'map', href: '/all-routes' },
		{ label: 'DEMOS', icon: 'gamepad-2', href: '/demos' },
	];

	// Admin/System navigation items
	const adminItems = [
		{ label: 'ADMIN', icon: 'shield', href: '/admin' },
		{ label: 'SYSTEM CONFIG', icon: 'settings', href: '/system-configuration' },
		{ label: 'AST TOPOLOGY', icon: 'network', href: '/ast-topology' },
		{ label: 'GPU GRAPH', icon: 'share-2', href: '/gpu-evidence-graph' },
		{ label: 'ERROR BRAIN', icon: 'bug', href: '/error-brain' },
		{ label: 'AGENTIC ERRORS', icon: 'bot', href: '/agentic-errors' },
		{ label: 'CODEBASE INDEX', icon: 'database', href: '/codebase-index' },
	];

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	// Persist collapse state
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem('yorha-sidebar-collapsed');
			if (saved !== null) collapsed = saved === 'true';
		}
	});

	$effect(() => {
		if (browser && collapsed !== undefined) {
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
			onclick={() => collapsed = !collapsed}
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
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
		background: #b8b5a8;
		border-right: 2px solid #000;
		display: flex;
		flex-direction: column;
		z-index: 1000;
		transition: width 0.3s ease;
		font-family: 'JetBrains Mono', monospace;
		color: #000;
	}

	.yorha-sidebar.collapsed {
		width: 60px;
	}

	/* Header */
	.sidebar-header {
		padding: 1.5rem 1rem;
		border-bottom: 2px solid #000;
		position: relative;
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
	}

	.subtitle {
		font-size: 0.625rem;
		margin: 0.25rem 0 0 0;
		opacity: 0.7;
		letter-spacing: 0.05em;
	}

	.collapse-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.5rem;
		width: 24px;
		height: 24px;
		border: 1px solid #000;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.collapse-btn:hover {
		background: rgba(0, 0, 0, 0.1);
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
		padding: 0.75rem 1rem;
		margin: 0.125rem 0.5rem;
		text-decoration: none;
		color: #000;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 1px solid transparent;
		transition: all 0.2s;
		position: relative;
	}

	.collapsed .nav-item {
		justify-content: center;
		padding: 0.75rem 0.5rem;
	}

	.nav-item:hover {
		background: rgba(0, 0, 0, 0.05);
		border-color: #000;
	}

	.nav-item.active {
		background: rgba(0, 0, 0, 0.1);
		border-color: #000;
	}

	.admin-item {
		opacity: 0.7;
	}

	.admin-item:hover,
	.admin-item.active {
		opacity: 1;
	}

	.nav-label {
		flex: 1;
		white-space: nowrap;
	}

	.nav-spacer {
		flex: 1;
		min-height: 1rem;
	}

	.section-divider {
		padding: 0.5rem 1rem;
		margin-top: 0.5rem;
		border-top: 1px solid rgba(0, 0, 0, 0.15);
	}

	.section-label {
		font-size: 0.625rem;
		font-weight: 700;
		opacity: 0.5;
		letter-spacing: 0.1em;
	}

	/* Footer */
	.sidebar-footer {
		padding: 1rem;
		border-top: 2px solid #000;
		font-size: 0.625rem;
		opacity: 0.8;
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
		background: #22c55e;
	}

	.status-text {
		font-weight: 500;
	}

	.system-status {
		margin-bottom: 0.25rem;
	}

	.timestamp {
		opacity: 0.6;
		font-size: 0.5625rem;
	}

	/* Scrollbar */
	.sidebar-nav::-webkit-scrollbar {
		width: 4px;
	}

	.sidebar-nav::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.05);
	}

	.sidebar-nav::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 2px;
	}

	.sidebar-nav::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.3);
	}
</style>