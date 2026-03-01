<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	let collapsed = $state(false);
	let currentTime = $state(new Date().toLocaleString());

	// Update time every minute
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

	// Sidebar navigation items
	const navItems = [
		{ label: 'COMMAND CENTER', icon: 'home', href: '/dashboard', hasSubmenu: false },
		{ label: 'ACTIVE CASES', icon: 'folder', href: '/cases', hasSubmenu: true },
		{ label: 'EVIDENCE', icon: 'target', href: '/evidence', hasSubmenu: true },
		{ label: 'PERSONS OF INTEREST', icon: 'users', href: '/persons-of-interest', hasSubmenu: false },
		{ label: 'ANALYSIS', icon: 'bar-chart-2', href: '/analysis-center', hasSubmenu: true },
		{ label: 'GLOBAL SEARCH', icon: 'search', href: '/global-search', hasSubmenu: false },
		{ label: 'TERMINAL', icon: 'terminal', href: '/terminal', hasSubmenu: false }
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
		{#each navItems as item}
			<a
				href={item.href}
				class="nav-item"
				class:active={isActive(item.href)}
			>
				<Icon name={item.icon} size={14} />
				{#if !collapsed}
					<span class="nav-label">{item.label}</span>
					{#if item.hasSubmenu}
						<Icon name="chevron-right" size={12} class="submenu-arrow" />
					{/if}
				{/if}
			</a>
		{/each}

		<!-- Spacer -->
		<div class="nav-spacer"></div>

		<!-- System Config -->
		<a href="/system-configuration" class="nav-item" class:active={isActive('/system-configuration')}>
			<Icon name="settings" size={14} />
			{#if !collapsed}
				<span class="nav-label">SYSTEM CONFIG</span>
			{/if}
		</a>
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

	.nav-label {
		flex: 1;
		white-space: nowrap;
	}

	.submenu-arrow {
		opacity: 0.5;
	}

	.nav-spacer {
		flex: 1;
		min-height: 1rem;
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