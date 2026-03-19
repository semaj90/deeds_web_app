<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import BridgeActions from './BridgeActions.svelte';

	interface Props {
		children: import('svelte').Snippet;
		title?: string;
		subtitle?: string;
		showSidebar?: boolean;
	}

	let { children, title = 'Legal Library', subtitle = '', showSidebar = true }: Props = $props();

	// Research-mode navigation items
	const navItems = [
		{ label: 'Documents', icon: 'file-text', href: '/library' },
		{ label: 'Glossary', icon: 'book-open-text', href: '/library/glossary' },
		{ label: 'State Corpus', icon: 'landmark', href: '/library/corpus' },
		{ label: 'Legal Corpus', icon: 'scale', href: '/legal-corpus' },
		{ label: 'Citations', icon: 'scroll-text', href: '/citations' },
	];

	function isActive(href: string): boolean {
		if (href === '/library') {
			return page.url.pathname === '/library' || (
				page.url.pathname.startsWith('/library/') &&
				!page.url.pathname.startsWith('/library/glossary') &&
				!page.url.pathname.startsWith('/library/corpus')
			);
		}
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="research-shell" class:no-sidebar={!showSidebar}>
	{#if showSidebar}
		<aside class="research-sidebar">
			<div class="sidebar-brand">
				<div class="brand-icon">
					<Icon name="scale" size={20} />
				</div>
				<div class="brand-text">
					<h2 class="brand-title">Legal Research</h2>
					<p class="brand-subtitle">Read · Search · Analyze</p>
				</div>
			</div>

			<nav class="sidebar-nav">
				{#each navItems as item}
					<a
						href={item.href}
						class="nav-link"
						class:active={isActive(item.href)}
					>
						<Icon name={item.icon} size={16} />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="sidebar-bridge">
				<BridgeActions context="research" />
			</div>

			<div class="sidebar-footer">
				<a href="/evidence" class="mode-switch" title="Switch to Investigation Mode">
					<Icon name="fingerprint" size={14} />
					<span>Investigation Mode</span>
					<Icon name="arrow-right" size={12} />
				</a>
			</div>
		</aside>
	{/if}

	<div class="research-main">
		{#if title}
			<header class="research-header">
				<div>
					<h1 class="research-title">{title}</h1>
					{#if subtitle}
						<p class="research-subtitle">{subtitle}</p>
					{/if}
				</div>
			</header>
		{/if}

		<div class="research-content">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.research-shell {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		min-height: 100vh;
		background: #131519;
		color: rgba(212, 199, 163, 0.9);
		font-family: 'Inter', system-ui, sans-serif;
	}

	.research-shell.no-sidebar {
		grid-template-columns: 1fr;
	}

	/* ─── Sidebar ─── */
	.research-sidebar {
		background: rgba(0, 0, 0, 0.3);
		border-right: 1px solid rgba(212, 199, 163, 0.08);
		display: flex;
		flex-direction: column;
		height: 100vh;
		position: sticky;
		top: 0;
	}

	.sidebar-brand {
		padding: 1.25rem 1rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.brand-icon {
		width: 36px;
		height: 36px;
		background: rgba(96, 165, 250, 0.12);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(96, 165, 250, 0.9);
		flex-shrink: 0;
	}

	.brand-title {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
		color: rgba(212, 199, 163, 0.9);
		letter-spacing: -0.01em;
	}

	.brand-subtitle {
		font-size: 0.6875rem;
		margin: 0;
		color: rgba(212, 199, 163, 0.35);
	}

	/* ─── Nav ─── */
	.sidebar-nav {
		flex: 1;
		padding: 0.5rem;
		overflow-y: auto;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		color: rgba(212, 199, 163, 0.45);
		text-decoration: none;
		transition: all 0.15s ease;
		margin-bottom: 2px;
	}

	.nav-link:hover {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.8);
	}

	.nav-link.active {
		background: rgba(96, 165, 250, 0.12);
		color: rgba(96, 165, 250, 0.95);
		font-weight: 500;
	}

	.sidebar-bridge {
		padding: 0.5rem;
		border-top: 1px solid rgba(212, 199, 163, 0.08);
	}

	/* ─── Mode Switch ─── */
	.sidebar-footer {
		padding: 0.75rem;
		border-top: 1px solid rgba(212, 199, 163, 0.08);
	}

	.mode-switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.45);
		text-decoration: none;
		background: rgba(212, 199, 163, 0.04);
		transition: all 0.15s ease;
	}

	.mode-switch:hover {
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.9);
	}

	.mode-switch :global(svg:last-child) {
		margin-left: auto;
	}

	/* ─── Main Content ─── */
	.research-main {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.research-header {
		padding: 1.5rem 2rem 0;
	}

	.research-title {
		font-size: 1.375rem;
		font-weight: 600;
		margin: 0;
		color: rgba(212, 199, 163, 0.95);
		letter-spacing: -0.02em;
	}

	.research-subtitle {
		font-size: 0.8125rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.25rem 0 0;
	}

	.research-content {
		flex: 1;
		padding: 1.5rem 2rem 2rem;
	}
</style>
