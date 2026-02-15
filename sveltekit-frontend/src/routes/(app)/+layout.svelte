<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
	let sidebarOpen = $state(true);

	const navItems = [
		{ href: '/dashboard', icon: '📊', label: 'DASHBOARD' },
		{ href: '/cases', icon: '📁', label: 'CASES' },
		{ href: '/evidence', icon: '🔬', label: 'EVIDENCE' },
		{ href: '/citations', icon: '📜', label: 'CITATIONS' },
		{ href: '/persons-of-interest', icon: '👤', label: 'PERSONS OF INTEREST' },
		{ href: '/analysis-center', icon: '🔍', label: 'ANALYSIS CENTER' },
		{ href: '/global-search', icon: '🔎', label: 'GLOBAL SEARCH' },
		{ href: '/evidence-library', icon: '📚', label: 'EVIDENCE LIBRARY' },
		{ href: '/ai-dashboard', icon: '🧠', label: 'AI DASHBOARD' },
		{ href: '/command-center', icon: '📡', label: 'COMMAND CENTER' },
		{ href: '/all-routes', icon: '🗺️', label: 'ALL ROUTES' },
		{ href: '/terminal', icon: '💻', label: 'TERMINAL' },
	];

	const adminItems = [
		{ href: '/admin', icon: '🔐', label: 'ADMIN' },
		{ href: '/system-configuration', icon: '⚙️', label: 'SYSTEM CONFIG' },
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard';
		return path.startsWith(href);
	}
</script>

{#if data.devBypass}
	<div class="bg-warning text-black px-4 py-1.5 text-center text-xs font-mono tracking-wider">
		DEV MODE: Authentication bypassed (DEV_BYPASS_AUTH=true)
	</div>
{/if}

<div class="app-shell">
	<!-- Sidebar -->
	<aside class="sidebar" class:collapsed={!sidebarOpen}>
		<div class="sidebar-header">
			<div class="font-bold text-xl tracking-widest text-sand">YORHA</div>
			<div class="text-sm font-semibold tracking-wide text-sand/80">DETECTIVE</div>
			<div class="text-[10px] uppercase tracking-widest text-sand/40 mt-1">Investigation Interface</div>
		</div>

		<nav class="sidebar-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href)}
				>
					<span class="nav-icon">{item.icon}</span>
					{#if sidebarOpen}
						<span class="nav-label">{item.label}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			{#each adminItems as item}
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href)}
				>
					<span class="nav-icon">{item.icon}</span>
					{#if sidebarOpen}
						<span class="nav-label">{item.label}</span>
					{/if}
				</a>
			{/each}

			<button
				class="nav-link toggle-btn"
				onclick={() => sidebarOpen = !sidebarOpen}
			>
				<span class="nav-icon">{sidebarOpen ? '◀' : '▶'}</span>
				{#if sidebarOpen}
					<span class="nav-label">COLLAPSE</span>
				{/if}
			</button>
		</div>

		{#if sidebarOpen}
			<div class="version-block">
				<div class="text-sand/30 text-[10px]">YoRHa Detective v2.0</div>
				{#if data.user}
					<div class="text-sand/50 text-xs mt-1">{data.user.username ?? data.user.email ?? 'Agent'}</div>
				{/if}
			</div>
		{/if}
	</aside>

	<!-- Main Content -->
	<main class="main-content">
		{@render children?.()}
	</main>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
		background: #d4c9a9;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		color: #0f0f0f;
	}

	.sidebar {
		width: 260px;
		background: #2a2016;
		color: #f8f0d9;
		display: flex;
		flex-direction: column;
		border-right: 3px solid #0f0f0f;
		transition: width 0.2s ease;
		overflow: hidden;
	}

	.sidebar.collapsed {
		width: 56px;
	}

	.sidebar-header {
		padding: 1.25rem 1rem;
		border-bottom: 2px solid #0f0f0f;
		white-space: nowrap;
	}

	.sidebar.collapsed .sidebar-header {
		padding: 1rem 0.5rem;
		text-align: center;
	}

	.sidebar-nav {
		flex: 1;
		padding: 0.5rem 0;
		overflow-y: auto;
	}

	.nav-link {
		display: flex;
		align-items: center;
		padding: 0.625rem 1rem;
		color: #f8f0d9;
		text-decoration: none;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.5px;
		border-left: 3px solid transparent;
		transition: all 0.15s ease;
		white-space: nowrap;
		cursor: pointer;
		background: none;
		border-top: none;
		border-right: none;
		border-bottom: none;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}

	.sidebar.collapsed .nav-link {
		padding: 0.625rem 0;
		justify-content: center;
		border-left: none;
	}

	.nav-link:hover {
		background: #1a160f;
		border-left-color: #f8f0d9;
	}

	.sidebar.collapsed .nav-link:hover {
		border-left-color: transparent;
		background: #1a160f;
	}

	.nav-link.active {
		background: #12100c;
		border-left-color: #f8f0d9;
	}

	.nav-icon {
		flex-shrink: 0;
		width: 1.25rem;
		text-align: center;
		margin-right: 0.75rem;
	}

	.sidebar.collapsed .nav-icon {
		margin-right: 0;
	}

	.nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sidebar-footer {
		border-top: 2px solid #0f0f0f;
		padding: 0.5rem 0;
	}

	.toggle-btn {
		color: #8a7a5a;
		font-size: 0.7rem;
	}

	.toggle-btn:hover {
		color: #f8f0d9;
	}

	.version-block {
		padding: 0.75rem 1rem;
		border-top: 1px solid #1a160f;
		text-align: right;
	}

	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-x: hidden;
	}

	@media (max-width: 768px) {
		.sidebar {
			position: fixed;
			z-index: 50;
			height: 100vh;
		}

		.sidebar.collapsed {
			width: 0;
			border-right: none;
		}

		.main-content {
			width: 100%;
		}
	}
</style>
