<script lang="ts">
	import { base } from '$app/paths';
	const resolvePath = (p: string) => (base ? `${base}${p}` : p);
	import type { RouteId } from '$app/types';
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Tooltip } from 'bits-ui';

	// Slim 56px icon-only rail by default, with top-button hover-peek & click-to-pin
	let collapsed = $state(true);
	let hoverPeek = $state(false);
	let hoverIntentTimer: ReturnType<typeof setTimeout> | null = null;
	let narrowViewport = $state(false);
	let mobileExpanded = $state(false);
	let layoutCollapsed = $derived(narrowViewport ? !mobileExpanded : collapsed);
	let visibleCollapsed = $derived(layoutCollapsed && !hoverPeek);
	let currentTime = $state(new Date().toLocaleString());

	interface NavigationItem {
		label: string;
		shortLabel: string;
		icon: string;
		href: RouteId;
		exact?: boolean;
		description?: string;
		chip?: string;
		category?: string;
	}

	const ANALYSIS_ROUTES = ['/audio-analysis/', '/video-analysis/', '/document-analysis/'];
	let isAnalysisRoute = $derived(ANALYSIS_ROUTES.some((r) => page.url.pathname.startsWith(r)));
	let wasAnalysisRoute = false;

	function clearHoverTimer() {
		if (hoverIntentTimer) {
			clearTimeout(hoverIntentTimer);
			hoverIntentTimer = null;
		}
	}

	function handleTopButtonMouseEnter() {
		if (narrowViewport || !collapsed) return;
		clearHoverTimer();
		hoverIntentTimer = setTimeout(() => {
			hoverPeek = true;
		}, 110);
	}

	function handleSidebarMouseLeave() {
		clearHoverTimer();
		if (hoverPeek) {
			hoverPeek = false;
		}
	}

	function toggleCollapse() {
		clearHoverTimer();
		if (narrowViewport) {
			mobileExpanded = !mobileExpanded;
			hoverPeek = false;
		} else if (collapsed && hoverPeek) {
			// Pin open when clicking top button during hover-peek
			collapsed = false;
			hoverPeek = false;
		} else {
			collapsed = !collapsed;
			hoverPeek = false;
		}
	}

	onMount(() => {
		const viewport = window.matchMedia('(max-width: 768px)');
		const updateViewport = () => {
			narrowViewport = viewport.matches;
			mobileExpanded = false;
		};
		updateViewport();
		viewport.addEventListener('change', updateViewport);

		// Restore persisted collapse state if explicitly set; otherwise default to minimized rail (true)
		const saved = localStorage.getItem('yorha-sidebar-collapsed-v2');
		if (saved !== null) {
			collapsed = saved === 'true';
		} else {
			collapsed = true;
		}

		const handleExternalToggle = () => {
			toggleCollapse();
		};
		window.addEventListener('yorha:toggle-sidebar', handleExternalToggle);

		return () => {
			viewport.removeEventListener('change', updateViewport);
			window.removeEventListener('yorha:toggle-sidebar', handleExternalToggle);
		};
	});

	// Broadcast collapse state so YorhaTopNavBar stays synchronized
	$effect(() => {
		if (!browser) return;
		window.dispatchEvent(
			new CustomEvent('yorha:sidebar-state', {
				detail: { collapsed: visibleCollapsed }
			})
		);
	});

	$effect(() => {
		if (!browser) return;
		const currentIsAnalysis = isAnalysisRoute;
		if (currentIsAnalysis && !wasAnalysisRoute) {
			collapsed = true;
		} else if (!currentIsAnalysis && wasAnalysisRoute) {
			const saved = localStorage.getItem('yorha-sidebar-collapsed-v2');
			collapsed = saved !== null ? saved === 'true' : true;
		}
		wasAnalysisRoute = currentIsAnalysis;
	});

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

	const primaryItems: NavigationItem[] = [
		{
			label: 'DASHBOARD',
			shortLabel: 'HOME',
			icon: 'layout-dashboard',
			href: '/dashboard',
			description: 'Investigation overview, active case metrics & live PG18 telemetry',
			chip: 'CORE',
			category: 'COMMAND // OVERVIEW'
		},
		{
			label: 'COMMAND CENTER',
			shortLabel: 'RADAR',
			icon: 'radio',
			href: '/command-center',
			description: 'Real-time situational radar, mission dispatch & tactical event feed',
			chip: 'LIVE',
			category: 'COMMAND // TACTICAL'
		}
	];

	const navGroups: { label: string; icon: string; items: NavigationItem[] }[] = [
		{
			label: 'CASEWORK',
			icon: 'folder-open',
			items: [
				{
					label: 'ACTIVE CASES',
					shortLabel: 'ACTIVE',
					icon: 'folder-open',
					href: '/active-cases',
					description: 'Open investigation dossiers, prosecution binders & priority leads',
					chip: 'LEAD',
					category: 'CASEWORK // OPEN'
				},
				{
					label: 'ALL CASES',
					shortLabel: 'CASES',
					icon: 'yorha-law-book',
					href: '/cases',
					description: 'Master case ledger, court dossiers & 768-D indexed records',
					chip: 'CASE',
					category: 'CASEWORK // ARCHIVE'
				},
				{
					label: 'PERSONS OF INTEREST',
					shortLabel: 'SUBJECT',
					icon: 'yorha-subject',
					href: '/persons-of-interest',
					description: 'Subject dossiers, aliases, threat assessment & tactical intel',
					chip: 'POI',
					category: 'CASEWORK // TARGETS'
				}
			]
		},
		{
			label: 'EVIDENCE & LAW',
			icon: 'book-open',
			items: [
				{
					label: 'EVIDENCE INTAKE',
					shortLabel: 'EVIDENCE',
					icon: 'yorha-evidence',
					href: '/evidence',
					description: 'Multimodal document ingest, exhibit analysis & outbox vector sync',
					chip: 'INGEST',
					category: 'EVIDENCE & LAW // INTAKE'
				},
				{
					label: 'EVIDENCE LIBRARY',
					shortLabel: 'VAULT',
					icon: 'library',
					href: '/evidence-library',
					description: 'Admitted courtroom exhibits, forensic vault & chain-of-custody proofs',
					chip: 'VAULT',
					category: 'EVIDENCE & LAW // VAULT'
				},
				{
					label: 'CITATIONS',
					shortLabel: 'CITATIONS',
					icon: 'yorha-citation',
					href: '/citations',
					description: 'Jurisprudential precedents, cross-case citations & legal citator graph',
					chip: 'CITE',
					category: 'EVIDENCE & LAW // CITATOR'
				},
				{
					label: 'LEGAL CORPUS',
					shortLabel: 'CORPUS',
					icon: 'yorha-precedent',
					href: '/legal-corpus',
					description: 'Statutory corpora, annotated penal codes & regulatory frameworks',
					chip: 'CODE',
					category: 'EVIDENCE & LAW // STATUTES'
				},
				{
					label: 'LEGAL LIBRARY',
					shortLabel: 'LIBRARY',
					icon: 'library-big',
					href: '/library',
					exact: true,
					description: 'Digital law treatises, legal commentary & reference jurisprudence',
					chip: 'LIB',
					category: 'EVIDENCE & LAW // TREATISE'
				},
				{
					label: 'GLOSSARY',
					shortLabel: 'LEXICON',
					icon: 'yorha-glossary',
					href: '/library/glossary',
					description: 'Statutory definitions, legal taxonomy & terms of art lexicon',
					chip: 'LEX',
					category: 'EVIDENCE & LAW // TAXONOMY'
				}
			]
		},
		{
			label: 'SEARCH & AI',
			icon: 'brain',
			items: [
				{
					label: 'GLOBAL SEARCH',
					shortLabel: 'SEARCH',
					icon: 'scan-search',
					href: '/global-search',
					description: 'Hybrid BM25 + EmbeddingGemma 768-D + Ewin Tang 64-D search',
					chip: 'RRF',
					category: 'SEARCH & AI // RETRIEVAL'
				},
				{
					label: 'ANALYSIS CENTER',
					shortLabel: 'ANALYSIS',
					icon: 'yorha-network',
					href: '/analysis-center',
					description: 'Forensic narrative extraction, timeline reconstruction & NLP insights',
					chip: 'NLP',
					category: 'SEARCH & AI // ANALYSIS'
				},
				{
					label: 'AI DASHBOARD',
					shortLabel: 'AI OPS',
					icon: 'yorha-ai-assistant',
					href: '/admin/ai-dashboard',
					description: 'Ornith 1.5 9B telemetry, TurboVec SIMD & GPU SIMT cache metrics',
					chip: 'AI',
					category: 'SEARCH & AI // METRICS'
				},
				{
					label: 'TERMINAL',
					shortLabel: 'SHELL',
					icon: 'terminal',
					href: '/terminal',
					description: 'Direct interactive shell, legal query REPL & CLI diagnostics',
					chip: 'CLI',
					category: 'SEARCH & AI // SHELL'
				},
				{
					label: 'MEMORY PALACE',
					shortLabel: 'PALACE',
					icon: 'landmark',
					href: '/demos/memory-palace',
					description: 'Spatial knowledge topology, 3D evidence clusters & semantic coordinates',
					chip: '3D',
					category: 'SEARCH & AI // TOPOLOGY'
				}
			]
		},
		{
			label: 'SIMULATIONS & DEMOS',
			icon: 'flask-conical',
			items: [
				{
					label: 'FICTIONAL CASES',
					shortLabel: 'MOCK',
					icon: 'flask-conical',
					href: '/fictional-cases',
					description: 'Procedural test cases, synthetic evidence fixtures & sandbox trials',
					chip: 'MOCK',
					category: 'SIMULATIONS // LAB'
				},
				{
					label: 'SIMULATION',
					shortLabel: 'TRIAL',
					icon: 'scale',
					href: '/simulation',
					description: 'Adversarial courtroom simulation, AI strategies & turn resolution',
					chip: 'SIM',
					category: 'SIMULATIONS // ADVERSARIAL'
				},
				{
					label: 'COURTROOM SIM',
					shortLabel: '3D SIM',
					icon: 'gavel',
					href: '/demos/courtroom-sim',
					description: 'Interactive 3D courtroom trial with GPU characters & story cues',
					chip: '3D',
					category: 'SIMULATIONS // 3D TRIAL'
				},
				{
					label: 'DEMOS',
					shortLabel: 'DEMOS',
					icon: 'gamepad-2',
					href: '/demos',
					exact: true,
					description: 'Component catalog, interactive widgets & architectural proofs',
					chip: 'LAB',
					category: 'SIMULATIONS // SHOWCASE'
				}
			]
		}
	];

	const adminItems: NavigationItem[] = [
		{
			label: 'ADMIN OVERVIEW',
			shortLabel: 'ADMIN',
			icon: 'yorha-integrity',
			href: '/admin',
			exact: true,
			description: 'System gatekeepers, authentication status & administrative overview',
			chip: 'SEC',
			category: 'SYSTEM // CONTROL'
		},
		{
			label: 'SYSTEM CONFIG',
			shortLabel: 'CONFIG',
			icon: 'settings',
			href: '/system-configuration',
			description: 'Service endpoints, runtime flags & environment orchestration',
			chip: 'CONF',
			category: 'SYSTEM // CONFIG'
		},
		{
			label: 'LIBRARY INGEST',
			shortLabel: 'INGEST',
			icon: 'book-plus',
			href: '/admin/library',
			description: 'Corpus chunking pipeline, batch tokenization & vector synchronization',
			chip: 'SYNC',
			category: 'SYSTEM // INGEST'
		},
		{
			label: 'AST TOPOLOGY',
			shortLabel: 'AST :8095',
			icon: 'yorha-network',
			href: '/admin/ast-topology',
			description: 'Python :8095 Tree-sitter CST, AST-grep & NetworkX graph observations',
			chip: 'AST',
			category: 'SYSTEM // PARSER'
		},
		{
			label: 'GPU GRAPH',
			shortLabel: 'GPU SIMT',
			icon: 'share-2',
			href: '/admin/gpu-evidence-graph',
			description: 'PyTorch ATen / cuTile SIMT cache & cuGraph topology projections',
			chip: 'GPU',
			category: 'SYSTEM // COMPUTE'
		},
		{
			label: 'ERROR BRAIN',
			shortLabel: 'HEAL',
			icon: 'bug',
			href: '/admin/error-brain',
			description: 'Self-healing error analytics, diagnostic receipts & crash intelligence',
			chip: 'HEAL',
			category: 'SYSTEM // DIAGNOSTICS'
		},
		{
			label: 'AGENTIC ERRORS',
			shortLabel: 'AGENTS',
			icon: 'bot',
			href: '/demos/agentic-errors',
			description: 'OpenCode autonomous error loop, verified claims & patch telemetry',
			chip: 'AUTO',
			category: 'SYSTEM // AGENTS'
		},
		{
			label: 'CODEBASE INDEX',
			shortLabel: 'PG18 DB',
			icon: 'database',
			href: '/admin/codebase-index',
			description: 'PostgreSQL 18 AIO/GIN/B-Tree canonical embeddings & MsgPack FP16',
			chip: '768D',
			category: 'SYSTEM // VECTORS'
		}
	];

	function isActive(href: string, exact = false): boolean {
		return page.url.pathname === href || (!exact && page.url.pathname.startsWith(href + '/'));
	}

	$effect(() => {
		if (browser && !isAnalysisRoute && collapsed !== undefined) {
			localStorage.setItem('yorha-sidebar-collapsed-v2', String(collapsed));
		}
	});
</script>

{#snippet collapsedNavItem(item: NavigationItem, category?: string)}
	{@const active = isActive(item.href, item.exact)}
	<Tooltip.Root delayDuration={90}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<a
					href={resolvePath(item.href)}
					{...props}
					class="rail-tile"
					class:active
					aria-label={item.label}
					aria-current={active ? 'page' : undefined}
				>
					{#if active}
						<span class="rail-star-tl" aria-hidden="true">✦</span>
					{/if}
					<Icon name={item.icon} size={16} />
				</a>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Portal>
			<Tooltip.Content side="right" sideOffset={12} class="yorha-tooltip-content z-[9999]">
				<div class="yorha-tactical-hud">
					<div class="hud-notch-tl" aria-hidden="true"></div>
					<div class="hud-notch-tr" aria-hidden="true"></div>
					<div class="hud-notch-bl" aria-hidden="true"></div>
					<div class="hud-notch-br" aria-hidden="true"></div>

					<div class="hud-top">
						<div class="hud-icon-box">
							<Icon name={item.icon} size={15} />
						</div>
						<div class="hud-title-col">
							<span class="hud-category font-mono">{category ?? item.category ?? 'LEGAL AI // YORHA'}</span>
							<h4 class="hud-title">{item.label}</h4>
						</div>
						{#if item.chip}
							<span class="hud-chip font-mono">{item.chip}</span>
						{/if}
					</div>

					{#if item.description}
						<p class="hud-desc">{item.description}</p>
					{/if}

					<div class="hud-footer font-mono">
						<span class="hud-route">{item.href}</span>
						<span class="hud-status" class:active-status={active}>
							{active ? '● ACTIVE' : '▷ STANDBY'}
						</span>
					</div>
				</div>
				<Tooltip.Arrow class="hud-tooltip-arrow" />
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={90} skipDelayDuration={200}>
	<aside
		class="yorha-sidebar"
		class:collapsed={layoutCollapsed}
		class:hover-peek={layoutCollapsed && hoverPeek}
		onmouseleave={handleSidebarMouseLeave}
		data-testid="yorha-sidebar"
		data-yorha-sidebar
	>
		<!-- Architectural Crest Header (44px flush-aligned with YorhaTopNavBar) -->
		<div class="sidebar-header">
			{#if visibleCollapsed}
				<button
					type="button"
					data-unstyled
					data-testid="sidebar-top-toggle"
					class="rail-top-toggle"
					onmouseenter={handleTopButtonMouseEnter}
					onmouseleave={clearHoverTimer}
					onclick={toggleCollapse}
					title="Hover to preview · Click to expand sidebar"
					aria-label="Expand sidebar"
				>
					<span class="rail-crest-glyph" aria-hidden="true">
						<svg viewBox="0 0 36 40" class="w-6 h-6">
							<path
								d="M3 4 H33 V20 C33 29.5 18 36.5 18 36.5 C18 36.5 3 29.5 3 20 Z"
								fill="#67140F"
								stroke="#E5C77B"
								stroke-width="1.8"
							/>
							<text x="11" y="16" fill="#F6F3EF" font-size="5.2" font-family="Georgia, serif" font-weight="bold">VE</text>
							<text x="20" y="16" fill="#F6F3EF" font-size="5.2" font-family="Georgia, serif" font-weight="bold">RI</text>
							<text x="13.5" y="25.5" fill="#E5C77B" font-size="5.4" font-family="Georgia, serif" font-weight="bold">TAS</text>
						</svg>
					</span>
					<span class="rail-open-glyph" aria-hidden="true">
						<Icon name="yorha-panel-open" size={15} />
					</span>
				</button>
			{:else}
				<a href={resolvePath('/dashboard')} class="expanded-brand">
					<div class="expanded-crest-mini">
						<Icon name="yorha-integrity" size={14} />
					</div>
					<div class="min-w-0">
						<div class="title">YORHA LAW</div>
						<div class="subtitle">LEX ET IUSTITIA</div>
					</div>
				</a>

				<button
					type="button"
					data-unstyled
					data-testid="sidebar-top-toggle"
					class="collapse-btn"
					onmouseenter={() => {
						if (hoverPeek && layoutCollapsed) return;
					}}
					onclick={() => {
						if (hoverPeek) {
							// Clicking pin while peeking pins it open; clicking close minimizes
							collapsed = false;
							hoverPeek = false;
						} else {
							toggleCollapse();
						}
					}}
					title={hoverPeek ? 'Pin sidebar open' : 'Minimize sidebar'}
					aria-label={hoverPeek ? 'Pin sidebar open' : 'Minimize sidebar'}
				>
					{#if hoverPeek}
						<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9.5 2.5L13.5 6.5L10.5 7.5L7.5 10.5L6.5 13.5L2.5 9.5L5.5 8.5L8.5 5.5L9.5 2.5Z" />
							<path d="M2.5 13.5L5.5 10.5" />
						</svg>
					{:else}
						<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="2" y="2.5" width="12" height="11" rx="2" />
							<line x1="6" y1="2.5" x2="6" y2="13.5" />
							<path d="M10.5 6.2L8.5 8L10.5 9.8" />
						</svg>
					{/if}
				</button>
			{/if}
		</div>

		<!-- Navigation -->
		<nav class="sidebar-nav" aria-label="Main navigation">
			{#each primaryItems as item (item.href)}
				{#if visibleCollapsed}
					{@render collapsedNavItem(item, item.category)}
				{:else}
					<a
						href={resolvePath(item.href)}
						class="nav-item"
						class:active={isActive(item.href, item.exact)}
					>
						<Icon name={item.icon} size={14} />
						<span class="nav-label">{item.label}</span>
					</a>
				{/if}
			{/each}

			{#each navGroups as group (group.label)}
				{#if visibleCollapsed}
					<div class="rail-divider" aria-hidden="true"></div>
					{#each group.items as item (item.href)}
						{@render collapsedNavItem(item, group.label)}
					{/each}
				{:else}
					<details class="nav-group" open={group.items.some((item) => isActive(item.href, item.exact))}>
						<summary class="nav-group-heading">
							<Icon name={group.icon} size={13} />
							<span>{group.label}</span>
							<Icon name="chevron-down" size={12} class="nav-group-chevron" />
						</summary>
						{#each group.items as item (item.href)}
							<a
								href={resolvePath(item.href)}
								class="nav-item nav-child"
								class:active={isActive(item.href, item.exact)}
							>
								<Icon name={item.icon} size={14} />
								<span class="nav-label">{item.label}</span>
							</a>
						{/each}
					</details>
				{/if}
			{/each}

			{#if visibleCollapsed}
				<div class="rail-divider" aria-hidden="true"></div>
				{#each adminItems as item (item.href)}
					{@render collapsedNavItem(item, 'SYSTEM')}
				{/each}
			{:else}
				<details class="nav-group system-group" open={adminItems.some((item) => isActive(item.href, item.exact))}>
					<summary class="nav-group-heading">
						<Icon name="settings" size={13} />
						<span>SYSTEM</span>
						<Icon name="chevron-down" size={12} class="nav-group-chevron" />
					</summary>
					{#each adminItems as item (item.href)}
						<a
							href={resolvePath(item.href)}
							class="nav-item admin-item nav-child"
							class:active={isActive(item.href, item.exact)}
						>
							<Icon name={item.icon} size={14} />
							<span class="nav-label">{item.label}</span>
						</a>
					{/each}
				</details>
			{/if}
		</nav>

		<!-- Footer Rail / Drawer Controls -->
		{#if visibleCollapsed}
			<div class="rail-footer">
				<button
					type="button"
					data-unstyled
					class="collapse-btn rail-footer-btn"
					onclick={toggleCollapse}
					title="Expand full navigation drawer"
					aria-label="Expand sidebar"
				>
					<Icon name="yorha-panel-open" size={14} />
				</button>
			</div>
		{:else}
			<div class="sidebar-footer">
				<div class="status-indicator">
					<span class="status-dot online"></span>
					<span class="status-text">PG18 · 768-D READY</span>
				</div>
				<div class="system-status">Fabric: Operational</div>
				<div class="timestamp">{currentTime}</div>
			</div>
		{/if}
	</aside>
</Tooltip.Provider>

<style>
	.yorha-sidebar {
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: var(--shell-sidebar-w, 224px);
		background: linear-gradient(180deg, #FFFCF9 0%, #FAF3E9 58%, #F4EBE0 100%);
		border-right: 1px solid #E2D5C5;
		display: flex;
		flex-direction: column;
		z-index: 1000;
		transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s ease;
		font-family: 'Inter', 'InterLocal', system-ui, -apple-system, 'Segoe UI', sans-serif;
		color: #2B241F;
		box-shadow:
			inset -1px 0 0 rgba(255, 255, 255, 0.8),
			6px 0 24px -14px rgba(72, 61, 54, 0.12);
	}

	.yorha-sidebar.collapsed {
		width: var(--shell-sidebar-rail-w, 56px);
	}

	.yorha-sidebar.collapsed.hover-peek {
		width: var(--shell-sidebar-w, 224px);
		z-index: 1250;
		border-radius: 0 20px 20px 0;
		box-shadow:
			inset -1px 0 0 rgba(255, 255, 255, 0.8),
			20px 0 48px -10px rgba(72, 61, 54, 0.28);
	}

	/* Header — 46px height aligns pixel-for-pixel with YorhaTopNavBar */
	.sidebar-header {
		height: var(--shell-navbar-h, 46px);
		padding: 0 0.65rem;
		border-bottom: 1px solid #E2D5C5;
		background: linear-gradient(180deg, #FFFCF9 0%, #FAF4EC 100%);
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		position: relative;
	}

	.collapsed:not(.hover-peek) .sidebar-header {
		padding: 0;
		justify-content: center;
	}

	.rail-top-toggle {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 34px;
		border-radius: 12px;
		border: 1px solid transparent;
		background: transparent;
		color: #5C493F;
		cursor: pointer;
		padding: 0;
		transition: all 0.16s ease;
	}

	.rail-crest-glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.14s ease, transform 0.14s ease;
	}

	.rail-open-glyph {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transform: scale(0.85);
		transition: opacity 0.14s ease, transform 0.14s ease;
	}

	.rail-top-toggle:hover {
		background: #483D36;
		border-color: #C9BCAB;
		color: #FFE59A;
		box-shadow: 0 4px 12px -3px rgba(72, 61, 54, 0.35);
	}

	.rail-top-toggle:hover .rail-crest-glyph {
		opacity: 0;
		transform: scale(0.85);
	}

	.rail-top-toggle:hover .rail-open-glyph {
		opacity: 1;
		transform: scale(1);
	}

	.expanded-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		min-width: 0;
	}

	.expanded-crest-mini {
		width: 28px;
		height: 28px;
		border-radius: 10px;
		background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
		border: 1px solid #C9BCAB;
		color: #FFE59A;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.title {
		font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
		font-size: 0.84rem;
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: 0.09em;
		color: #2B241F;
	}

	.subtitle {
		font-size: 0.52rem;
		margin-top: 2px;
		color: #7A5A4A;
		letter-spacing: 0.18em;
		font-weight: 600;
	}

	.collapse-btn {
		width: 28px;
		height: 28px;
		border: 1px solid #DFD2C2;
		background: #FFFFFF;
		color: #5C493F;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		padding: 0;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	.collapse-btn:hover {
		background: #483D36;
		border-color: #C9BCAB;
		color: #FFE59A;
	}

	/* Navigation */
	.sidebar-nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0.45rem 0;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.collapsed:not(.hover-peek) .sidebar-nav {
		align-items: center;
		gap: 0.25rem;
		padding: 0.48rem 0.25rem;
	}

	/* Slim 56px Icon-Only Soft Bento Rail Tile */
	.rail-tile {
		position: relative;
		width: 38px;
		height: 36px;
		padding: 0;
		border-radius: 12px;
		border: 1px solid transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		color: #5C493F;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.rail-tile:hover {
		background: #F4EAE0;
		border-color: #DFCFC0;
		color: #231E1B;
	}

	.rail-tile.active {
		background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
		border-color: #C9BCAB;
		color: #FFE59A;
		box-shadow: 0 5px 14px -4px rgba(72, 61, 54, 0.36);
	}

	.rail-star-tl {
		position: absolute;
		top: 3px;
		right: 4px;
		font-size: 6.5px;
		line-height: 1;
		color: #FFE59A;
	}

	.rail-divider {
		width: 32px;
		height: 1px;
		margin: 0.2rem 0;
		background: linear-gradient(90deg, transparent, #DFD2C2, transparent);
		flex-shrink: 0;
	}

	/* Expanded Drawer Pill Items */
	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.48rem 0.85rem;
		margin: 2px 0.55rem;
		text-decoration: none;
		color: #483D36;
		font-size: 0.69rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 1px solid transparent;
		border-radius: 9999px;
		transition: all 0.14s ease;
		position: relative;
	}

	.nav-item:hover {
		background: #F4EAE0;
		border-color: #E2D4C4;
		color: #231E1B;
	}

	.nav-item.active {
		background: linear-gradient(90deg, #5C493F 0%, #483D36 100%);
		border-color: #C9BCAB;
		color: #FFF7EE;
		box-shadow: 0 4px 12px -4px rgba(72, 61, 54, 0.32);
	}

	.nav-group {
		margin: 0.15rem 0.35rem;
	}

	.nav-group-heading {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2rem;
		padding: 0.38rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 5px;
		color: #7F7565;
		cursor: pointer;
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		list-style: none;
		text-transform: uppercase;
		user-select: none;
	}

	.nav-group-heading::-webkit-details-marker {
		display: none;
	}

	.nav-group-heading:hover {
		background: rgba(185, 166, 153, 0.22);
		color: #2A2520;
	}

	.nav-group-chevron {
		margin-left: auto;
		transition: transform 0.15s ease;
	}

	.nav-group[open] .nav-group-chevron {
		transform: rotate(180deg);
	}

	.nav-child {
		margin-left: 0.35rem;
		padding-left: 0.8rem;
	}

	.system-group {
		margin-top: 0.35rem;
		padding-top: 0.3rem;
		border-top: 1px solid rgba(185, 166, 153, 0.5);
	}

	.nav-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Footers */
	.rail-footer {
		padding: 0.5rem 0;
		border-top: 1px solid #B9A699;
		background: #ECE5DC;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.rail-footer-btn {
		width: 34px;
		height: 30px;
	}

	.sidebar-footer {
		padding: 0.75rem 0.9rem;
		border-top: 1px solid #B9A699;
		background: #ECE5DC;
		font-size: 0.6rem;
		flex-shrink: 0;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.15rem;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #7F7565;
	}

	.status-dot.online {
		background: #15803D;
		box-shadow: 0 0 5px rgba(21, 128, 61, 0.45);
	}

	.status-text {
		font-weight: 700;
		color: #141312;
		letter-spacing: 0.06em;
	}

	.system-status {
		color: #5A5248;
		margin-bottom: 0.1rem;
	}

	.timestamp {
		color: #7F7565;
		font-size: 0.52rem;
		font-variant-numeric: tabular-nums;
	}

	/* Slim Scrollbar */
	.sidebar-nav::-webkit-scrollbar {
		width: 3px;
	}
	.sidebar-nav::-webkit-scrollbar-track {
		background: transparent;
	}
	.sidebar-nav::-webkit-scrollbar-thumb {
		background: rgba(127, 117, 101, 0.32);
		border-radius: 999px;
	}

	/* ═══ YoRHa Tactical Hover HUD Tooltip (Celestial Obsidian) ═══ */
	:global(.yorha-tooltip-content) {
		z-index: 9999;
		outline: none;
		pointer-events: none;
		animation: yorha-hud-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes yorha-hud-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateX(-4px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateX(0);
		}
	}

	.yorha-tactical-hud {
		position: relative;
		width: 262px;
		background: linear-gradient(160deg, #131621 0%, #0B0D13 100%);
		border: 1px solid #C8A24A;
		border-radius: 6px;
		padding: 0.72rem 0.82rem;
		box-shadow:
			0 14px 36px rgba(0, 0, 0, 0.65),
			inset 0 0 0 1px rgba(229, 199, 123, 0.16);
		color: #F6F3EF;
	}

	.hud-notch-tl,
	.hud-notch-tr,
	.hud-notch-bl,
	.hud-notch-br {
		position: absolute;
		width: 5px;
		height: 5px;
		pointer-events: none;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #E5C77B; border-left: 2px solid #E5C77B; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #E5C77B; border-right: 2px solid #E5C77B; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #E5C77B; border-left: 2px solid #E5C77B; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #E5C77B; border-right: 2px solid #E5C77B; }

	.hud-top {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.35rem;
	}

	.hud-icon-box {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #67140F;
		border: 1px solid #E5C77B;
		border-radius: 4px;
		color: #E5C77B;
		flex-shrink: 0;
	}

	.hud-title-col {
		flex: 1;
		min-width: 0;
	}

	.hud-category {
		display: block;
		font-size: 0.55rem;
		color: #B9A699;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		line-height: 1.1;
		margin-bottom: 0.12rem;
	}

	.hud-title {
		margin: 0;
		font-size: 0.76rem;
		font-weight: 700;
		color: #F6F3EF;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.2;
	}

	.hud-chip {
		font-size: 0.54rem;
		padding: 2px 5px;
		background: rgba(200, 162, 74, 0.18);
		color: #E5C77B;
		border: 1px solid rgba(229, 199, 123, 0.45);
		border-radius: 3px;
		font-weight: 700;
		letter-spacing: 0.06em;
		flex-shrink: 0;
	}

	.hud-desc {
		margin: 0.32rem 0 0.48rem;
		font-size: 0.7rem;
		line-height: 1.45;
		color: #DBCFC5;
	}

	.hud-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.38rem;
		border-top: 1px solid rgba(200, 162, 74, 0.22);
		font-size: 0.58rem;
		gap: 0.5rem;
	}

	.hud-route {
		color: #B9A699;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hud-status {
		color: #B9A699;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.hud-status.active-status {
		color: #86EFAC;
		font-weight: 700;
	}

	:global(.hud-tooltip-arrow) {
		fill: #0B0D13;
	}
</style>
