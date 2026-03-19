<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import BridgeActions from './BridgeActions.svelte';

	interface Props {
		children: import('svelte').Snippet;
		title?: string;
		subtitle?: string;
		showInspector?: boolean;
		showTimeline?: boolean;
		inspector?: import('svelte').Snippet;
		timeline?: import('svelte').Snippet;
	}

	let {
		children,
		title = 'Investigation',
		subtitle = '',
		showInspector = false,
		showTimeline = false,
		inspector,
		timeline,
	}: Props = $props();

	// Investigation-mode navigation (rendered as toolbar, not sidebar)
	const navItems = [
		{ label: 'EVIDENCE', icon: 'fingerprint', href: '/evidence' },
		{ label: 'ANALYSIS', icon: 'search', href: '/analysis-center' },
		{ label: 'CASES', icon: 'folder', href: '/cases' },
		{ label: 'PERSONS', icon: 'users', href: '/persons-of-interest' },
	];

	let inspectorCollapsed = $state(false);

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="inv-shell">
	<!-- Top Toolbar -->
	<header class="inv-toolbar">
		<div class="toolbar-left">
			<div class="toolbar-title">
				<span class="title-icon">◆</span>
				<span class="title-text">{title}</span>
				{#if subtitle}
					<span class="title-divider">│</span>
					<span class="title-sub">{subtitle}</span>
				{/if}
			</div>
		</div>

		<nav class="toolbar-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="toolbar-link"
					class:active={isActive(item.href)}
				>
					<Icon name={item.icon} size={12} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="toolbar-right">
			<BridgeActions context="investigation" compact />
			<span class="toolbar-divider">│</span>
			<a href="/library" class="mode-switch-btn" title="Switch to Research Mode">
				<Icon name="book-open" size={12} />
				<span>RESEARCH</span>
			</a>
			{#if inspector}
				<button
					class="inspector-toggle"
					onclick={() => inspectorCollapsed = !inspectorCollapsed}
					title={inspectorCollapsed ? 'Show Inspector' : 'Hide Inspector'}
				>
					<Icon name={inspectorCollapsed ? 'panel-right-open' : 'panel-right-close'} size={12} />
				</button>
			{/if}
		</div>
	</header>

	<!-- Main Workspace -->
	<div class="inv-workspace-layout" class:has-inspector={showInspector && !inspectorCollapsed && inspector}>
		<!-- Canvas / Main Work Area -->
		<main class="inv-canvas">
			{@render children()}
		</main>

		<!-- Right Inspector Panel (optional) -->
		{#if showInspector && !inspectorCollapsed && inspector}
			<aside class="inv-inspector-panel">
				<div class="inspector-header">
					<span class="inspector-label">INSPECTOR</span>
					<button
						class="inspector-close"
						onclick={() => inspectorCollapsed = true}
					>
						<Icon name="x" size={12} />
					</button>
				</div>
				<div class="inspector-content">
					{@render inspector()}
				</div>
			</aside>
		{/if}
	</div>

	<!-- Bottom Timeline Strip (optional) -->
	{#if showTimeline && timeline}
		<div class="inv-timeline-strip">
			{@render timeline()}
		</div>
	{/if}
</div>

<style>
	.inv-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: #d4c9a9;
		color: #1a1a1a;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
	}

	/* ─── Toolbar ─── */
	.inv-toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 1rem;
		height: 42px;
		background: #1a1a1a;
		color: #c4b998;
		border-bottom: 2px solid #333;
		flex-shrink: 0;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.title-icon {
		color: #c4a35a;
	}

	.title-text {
		font-weight: 600;
		color: #e8e0cc;
	}

	.title-divider {
		color: #555;
	}

	.title-sub {
		color: #8a8272;
	}

	/* ─── Nav Tabs ─── */
	.toolbar-nav {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: 1rem;
	}

	.toolbar-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #8a8272;
		text-decoration: none;
		transition: all 0.15s ease;
		border-bottom: 2px solid transparent;
	}

	.toolbar-link:hover {
		color: #e8e0cc;
		background: rgba(255, 255, 255, 0.04);
	}

	.toolbar-link.active {
		color: #c4a35a;
		border-bottom-color: #c4a35a;
	}

	/* ─── Toolbar Right ─── */
	.toolbar-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mode-switch-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #8a8272;
		text-decoration: none;
		border: 1px solid #444;
		transition: all 0.15s ease;
	}

	.mode-switch-btn:hover {
		color: #faf9f6;
		background: #333;
		border-color: #666;
	}

	.inspector-toggle {
		display: flex;
		align-items: center;
		padding: 0.25rem;
		background: none;
		border: 1px solid #444;
		color: #8a8272;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.inspector-toggle:hover {
		color: #e8e0cc;
		border-color: #666;
	}

	.toolbar-divider {
		color: #444;
		font-size: 0.75rem;
		user-select: none;
	}

	/* ─── Workspace Layout ─── */
	.inv-workspace-layout {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr;
		min-height: 0;
	}

	.inv-workspace-layout.has-inspector {
		grid-template-columns: 1fr 320px;
	}

	.inv-canvas {
		overflow-y: auto;
		padding: 1rem;
	}

	/* ─── Inspector ─── */
	.inv-inspector-panel {
		background: #1a1a1a;
		border-left: 2px solid #333;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.inspector-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid #333;
	}

	.inspector-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #a89f7c;
	}

	.inspector-close {
		display: flex;
		padding: 0.125rem;
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
	}

	.inspector-close:hover {
		color: #e8e0cc;
	}

	.inspector-content {
		flex: 1;
		overflow-y: auto;
		color: #e8e0cc;
	}

	/* ─── Timeline ─── */
	.inv-timeline-strip {
		height: 48px;
		background: #1a1a1a;
		border-top: 2px solid #333;
		display: flex;
		align-items: center;
		padding: 0 1rem;
		color: #8a8272;
		font-size: 0.625rem;
		flex-shrink: 0;
	}
</style>
