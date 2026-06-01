<script lang="ts">
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let searchQuery = $state('');
	let inputRef = $state<HTMLInputElement>();
	let activeTab = $state(0);
	let selectedIndex = $state(0);

	// Tab definitions — NieR-style top nav
	const tabs = [
		{ label: 'NAVIGATE', icon: 'compass' },
		{ label: 'CASES', icon: 'folder-open' },
		{ label: 'EVIDENCE', icon: 'fingerprint' },
		{ label: 'SEARCH', icon: 'scan-search' },
		{ label: 'LEGAL', icon: 'scale' },
		{ label: 'AI', icon: 'brain' },
		{ label: 'SYSTEM', icon: 'settings' },
	];

	// Navigation items per tab
	const tabItems: Record<number, { label: string; desc: string; icon: string; href?: string; action?: string }[]> = {
		0: [
			{ label: 'Dashboard', desc: 'Overview and analytics home', icon: 'layout-dashboard', href: '/dashboard' },
			{ label: 'Command Center', desc: 'Central operations hub', icon: 'radio', href: '/command-center' },
			{ label: 'Active Cases', desc: 'Currently open investigations', icon: 'folder-open', href: '/active-cases' },
			{ label: 'Evidence Library', desc: 'Browse all evidence files', icon: 'library', href: '/evidence-library' },
			{ label: 'Legal Corpus', desc: 'Statutes and legal documents', icon: 'book-open', href: '/legal-corpus' },
			{ label: 'Legal Library', desc: 'Full legal reference library', icon: 'library-big', href: '/library' },
			{ label: 'Glossary', desc: 'Legal terminology reference', icon: 'book-open-text', href: '/library/glossary' },
			{ label: 'Citations', desc: 'Citation collections and exports', icon: 'scroll-text', href: '/citations' },
			{ label: 'Persons of Interest', desc: 'POI profiles and tracking', icon: 'users', href: '/persons-of-interest' },
			{ label: 'Analysis Center', desc: 'Deep analysis tools', icon: 'search', href: '/analysis-center' },
			{ label: 'Global Search', desc: 'Platform-wide search', icon: 'scan-search', href: '/global-search' },
			{ label: 'AI Dashboard', desc: 'AI model status and tools', icon: 'brain', href: '/admin/ai-dashboard' },
			{ label: 'Terminal', desc: 'AI assistant terminal', icon: 'terminal', href: '/terminal' },
			{ label: 'Memory Palace', desc: 'Knowledge graph visualization', icon: 'landmark', href: '/memory-palace' },
			{ label: 'All Routes', desc: 'Full application route map', icon: 'map', href: '/admin/all-routes' },
			{ label: 'Demos', desc: 'Feature demonstrations', icon: 'gamepad-2', href: '/demos' },
		],
		1: [
			{ label: 'New Case', desc: 'Create a new investigation case', icon: 'file-plus', href: '/cases/new' },
			{ label: 'Active Cases', desc: 'View open investigations', icon: 'folder-open', href: '/active-cases' },
			{ label: 'All Cases', desc: 'Browse all case records', icon: 'folder', href: '/cases' },
			{ label: 'Case Similarity', desc: 'Find related cases via AI', icon: 'git-compare', href: '/analysis-center' },
			{ label: 'Reports', desc: 'Generate case reports', icon: 'file-text', href: '/reports' },
		],
		2: [
			{ label: 'Evidence Upload', desc: 'Upload new evidence files', icon: 'upload', href: '/evidence' },
			{ label: 'Evidence Library', desc: 'Browse all evidence items', icon: 'library', href: '/evidence-library' },
			{ label: 'Evidence Manage', desc: 'Manage evidence metadata', icon: 'settings', href: '/evidence/manage' },
			{ label: 'GPU Evidence Graph', desc: 'GPU-accelerated evidence graph', icon: 'share-2', href: '/admin/gpu-evidence-graph' },
		],
		3: [
			{ label: 'Global Search', desc: 'Search across all data sources', icon: 'scan-search', href: '/global-search' },
			{ label: 'Legal Corpus Search', desc: 'Search statutes and law', icon: 'book-open', href: '/legal-corpus' },
			{ label: 'Codebase Index', desc: 'Search the codebase', icon: 'database', href: '/codebase-index' },
			{ label: 'Analysis Center', desc: 'Advanced search and analysis', icon: 'search', href: '/analysis-center' },
		],
		4: [
			{ label: 'Legal Corpus', desc: 'Browse statutes and regulations', icon: 'book-open', href: '/legal-corpus' },
			{ label: 'Legal Library', desc: 'Full legal reference library', icon: 'library-big', href: '/library' },
			{ label: 'Glossary', desc: 'Legal terminology definitions', icon: 'book-open-text', href: '/library/glossary' },
			{ label: 'Citations', desc: 'Manage citation collections', icon: 'scroll-text', href: '/citations' },
		],
		5: [
			{ label: 'AI Dashboard', desc: 'Model status and inference metrics', icon: 'brain', href: '/admin/ai-dashboard' },
			{ label: 'Terminal', desc: 'AI assistant chat terminal', icon: 'terminal', href: '/terminal' },
			{ label: 'Recommendations', desc: 'AI-powered recommendations', icon: 'sparkles', href: '/recommendations' },
			{ label: 'Synthesis', desc: 'AI document synthesis', icon: 'wand-2', href: '/analysis-center' },
		],
		6: [
			{ label: 'System Config', desc: 'Application configuration', icon: 'settings', href: '/system-configuration' },
			{ label: 'Admin Panel', desc: 'Administration dashboard', icon: 'shield', href: '/admin' },
			{ label: 'Dev Tools', desc: 'Developer utilities', icon: 'code', href: '/admin/dev-tools' },
			{ label: 'AST Topology', desc: 'Abstract syntax tree viewer', icon: 'network', href: '/admin/ast-topology' },
			{ label: 'Error Brain', desc: 'Error analysis system', icon: 'bug', href: '/admin/error-brain' },
			{ label: 'Agentic Errors', desc: 'AI-detected error patterns', icon: 'bot', href: '/agentic-errors' },
		],
	};

	// Filtered items based on search
	let currentItems = $derived.by(() => {
		const items = tabItems[activeTab] ?? [];
		if (!searchQuery.trim()) return items;
		const q = searchQuery.toLowerCase();
		const allItems = Object.values(tabItems).flat();
		return allItems.filter(
			(item) =>
				item.label.toLowerCase().includes(q) ||
				item.desc.toLowerCase().includes(q)
		);
	});

	let selectedItem = $derived(currentItems[selectedIndex] ?? null);

	$effect(() => {
		activeTab;
		searchQuery;
		selectedIndex = 0;
	});

	$effect(() => {
		if (open && inputRef) {
			searchQuery = '';
			activeTab = 0;
			selectedIndex = 0;
			setTimeout(() => inputRef?.focus(), 50);
		}
	});

	function handleClose() {
		open = false;
	}

	function handleNavigate(href?: string) {
		if (href) {
			goto(href);
			handleClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
			return;
		}
		if (e.key === 'ArrowDown' || (e.key === 's' && !isInputFocused(e))) {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
		}
		if (e.key === 'ArrowUp' || (e.key === 'w' && !isInputFocused(e))) {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			if (selectedItem) handleNavigate(selectedItem.href);
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			if (e.shiftKey) {
				activeTab = (activeTab - 1 + tabs.length) % tabs.length;
			} else {
				activeTab = (activeTab + 1) % tabs.length;
			}
		}
		const num = parseInt(e.key);
		if (num >= 1 && num <= tabs.length && !isInputFocused(e)) {
			activeTab = num - 1;
		}
	}

	function isInputFocused(e: KeyboardEvent): boolean {
		const tag = (e.target as HTMLElement)?.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA';
	}

	let currentPath = $derived(page.url.pathname);
</script>

{#if open}
	<div
		class="intel-backdrop"
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
		transition:fade={{ duration: 200 }}
	>
		<!-- Subtle grid pattern (evidence board style) -->
		<div class="grid-overlay"></div>

		<div class="intel-frame" transition:scale={{ duration: 280, start: 0.94, easing: cubicOut }}>

			<!-- ═══ TOP: Tab Bar ═══ -->
			<nav class="intel-tabs">
				{#each tabs as tab, i}
					<button
						class="intel-tab"
						class:active={activeTab === i}
						onclick={() => { activeTab = i; selectedIndex = 0; }}
					>
						<Icon name={tab.icon} size={13} />
						<span class="tab-label">{tab.label}</span>
						{#if activeTab === i}
							<div class="tab-indicator"></div>
						{/if}
					</button>
				{/each}

				<div class="tab-search">
					<Icon name="search" size={14} />
					<input
						bind:this={inputRef}
						bind:value={searchQuery}
						type="text"
						class="search-input"
						placeholder="Search all..."
					/>
				</div>
			</nav>

			<!-- ═══ MIDDLE: Split Panel ═══ -->
			<div class="intel-body">

				<!-- LEFT: Item list (corpus sidebar style) -->
				<div class="intel-list">
					<div class="list-header">
						<span class="list-title">
							{searchQuery ? 'SEARCH RESULTS' : tabs[activeTab].label}
						</span>
						<span class="list-count">{currentItems.length} ITEMS</span>
					</div>
					<div class="list-scroll">
						{#each currentItems as item, i}
							<button
								class="list-item"
								class:selected={selectedIndex === i}
								class:current={item.href === currentPath}
								onclick={() => { selectedIndex = i; }}
								ondblclick={() => handleNavigate(item.href)}
							>
								<div class="item-marker">
									{#if item.href === currentPath}
										<span class="marker-current"></span>
									{:else if selectedIndex === i}
										<span class="marker-select"></span>
									{/if}
								</div>
								<Icon name={item.icon} size={14} />
								<span class="item-label">{item.label}</span>
								{#if item.href === currentPath}
									<span class="item-badge">CURRENT</span>
								{/if}
							</button>
						{/each}
						{#if currentItems.length === 0}
							<div class="list-empty">
								No results found
							</div>
						{/if}
					</div>
				</div>

				<!-- RIGHT: Detail panel (research/parchment style) -->
				<div class="intel-detail">
					{#if selectedItem}
						<div class="detail-content" in:fade={{ duration: 120 }}>
							<div class="detail-header">
								<div class="detail-icon-wrap">
									<Icon name={selectedItem.icon} size={32} />
								</div>
								<div>
									<h2 class="detail-title">{selectedItem.label}</h2>
									<p class="detail-desc">{selectedItem.desc}</p>
								</div>
							</div>

							<div class="detail-meta">
								<div class="meta-row">
									<span class="meta-label">Route</span>
									<span class="meta-value">{selectedItem.href ?? 'N/A'}</span>
								</div>
								<div class="meta-row">
									<span class="meta-label">Category</span>
									<span class="meta-value">{tabs[activeTab].label}</span>
								</div>
								<div class="meta-row">
									<span class="meta-label">Status</span>
									<span class="meta-value" class:status-viewing={selectedItem.href === currentPath}>
										{selectedItem.href === currentPath ? 'VIEWING' : 'AVAILABLE'}
									</span>
								</div>
							</div>

							<button
								class="detail-action"
								onclick={() => handleNavigate(selectedItem?.href)}
							>
								<Icon name="arrow-right" size={14} />
								{selectedItem.href === currentPath ? 'CURRENT PAGE' : 'NAVIGATE'}
							</button>
						</div>
					{:else}
						<div class="detail-empty">
							<Icon name="monitor" size={28} />
							<span>Select an item to view details</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- ═══ BOTTOM: Status Bar ═══ -->
			<footer class="intel-status">
				<div class="status-left">
					<span class="status-location">
						<Icon name="map-pin" size={11} />
						{currentPath}
					</span>
					<span class="status-sep">|</span>
					<span class="status-items">{currentItems.length} items</span>
				</div>
				<div class="status-right">
					<kbd>W</kbd><kbd>S</kbd> Select
					<span class="status-sep">|</span>
					<kbd>Enter</kbd> Navigate
					<span class="status-sep">|</span>
					<kbd>Tab</kbd> Switch Tab
					<span class="status-sep">|</span>
					<kbd>Esc</kbd> Close
				</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	/* ═══════════════════════════════════════════════════════════
	   WARM PALETTE — blending Legal Corpus parchment,
	   Evidence Board dark tactical cards, and YoRHa gold/beige
	   ═══════════════════════════════════════════════════════════ */

	/* ═══ FULL-SCREEN BACKDROP ═══ */
	.intel-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background:
			radial-gradient(ellipse at top, rgba(196, 165, 90, 0.08), transparent 50%),
			radial-gradient(ellipse at bottom right, rgba(212, 147, 75, 0.06), transparent 40%),
			rgba(10, 8, 6, 0.92);
		backdrop-filter: blur(24px) saturate(1.1);
	}

	/* Evidence board grid pattern */
	.grid-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			repeating-linear-gradient(
				0deg,
				rgba(196, 183, 143, 0.02),
				rgba(196, 183, 143, 0.02) 1px,
				transparent 1px,
				transparent 40px
			),
			repeating-linear-gradient(
				90deg,
				rgba(196, 183, 143, 0.02),
				rgba(196, 183, 143, 0.02) 1px,
				transparent 1px,
				transparent 40px
			);
		opacity: 0.7;
	}

	/* ═══ MAIN FRAME ═══ */
	.intel-frame {
		position: relative;
		width: calc(100vw - 4rem);
		height: calc(100vh - 4rem);
		max-width: 1400px;
		max-height: 900px;
		display: flex;
		flex-direction: column;
		border-radius: 2px;
		border: 1px solid rgba(196, 183, 143, 0.28);
		background: linear-gradient(180deg, rgba(26, 23, 18, 0.98) 0%, rgba(18, 16, 12, 0.99) 100%);
		box-shadow:
			0 0 0 1px rgba(196, 183, 143, 0.06),
			0 40px 80px -20px rgba(0, 0, 0, 0.75),
			0 0 120px rgba(0, 0, 0, 0.35),
			inset 0 1px 0 rgba(232, 224, 200, 0.06);
		overflow: hidden;
	}

	/* Top accent line — warm gold gradient */
	.intel-frame::before {
		content: '';
		position: absolute;
		top: 0;
		left: 2rem;
		right: 2rem;
		height: 1px;
		background: linear-gradient(90deg,
			transparent,
			rgba(196, 165, 90, 0.65) 20%,
			rgba(212, 147, 75, 0.5) 50%,
			rgba(196, 165, 90, 0.65) 80%,
			transparent
		);
		z-index: 1;
	}

	/* ═══ TAB BAR ═══ */
	.intel-tabs {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0 0.5rem;
		height: 44px;
		min-height: 44px;
		border-bottom: 1px solid rgba(138, 133, 94, 0.22);
		background: linear-gradient(180deg, rgba(33, 29, 22, 0.96) 0%, rgba(23, 20, 15, 0.98) 100%);
	}

	.intel-tab {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.85rem;
		height: 100%;
		background: none;
		border: none;
		border-radius: 0;
		color: rgba(200, 195, 160, 0.46);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
		box-shadow: none;
	}

	.intel-tab::before {
		display: none;
	}

	.intel-tab:hover {
		color: rgba(232, 228, 200, 0.78);
		background: rgba(196, 183, 143, 0.06);
		transform: none;
		box-shadow: none;
	}

	.intel-tab.active {
		color: rgba(236, 230, 203, 0.92);
		background: rgba(196, 183, 143, 0.08);
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 0.5rem;
		right: 0.5rem;
		height: 2px;
		background: linear-gradient(90deg, #c4b78f, #d4934b);
		border-radius: 1px 1px 0 0;
	}

	.tab-label {
		white-space: nowrap;
	}

	.tab-search {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.75rem;
		height: 28px;
		border: 1px solid rgba(138, 133, 94, 0.22);
		border-radius: 2px;
		color: rgba(200, 195, 160, 0.46);
		background: rgba(0, 0, 0, 0.2);
	}

	.search-input {
		width: 140px;
		background: none;
		border: none;
		outline: none;
		color: rgba(232, 228, 200, 0.88);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6875rem;
		padding: 0;
		box-shadow: none;
	}

	.search-input::placeholder {
		color: rgba(168, 159, 124, 0.42);
	}

	.search-input:focus {
		box-shadow: none;
	}

	/* ═══ SPLIT BODY ═══ */
	.intel-body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	/* ═══ LEFT: List Panel — dark sidebar like YoRHa ═══ */
	.intel-list {
		width: 340px;
		min-width: 340px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(138, 133, 94, 0.18);
		background: rgba(18, 16, 12, 0.6);
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(138, 133, 94, 0.14);
		background: rgba(33, 29, 22, 0.5);
	}

	.list-title {
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: rgba(196, 183, 143, 0.72);
		text-transform: uppercase;
	}

	.list-count {
		font-size: 0.5625rem;
		color: rgba(200, 195, 160, 0.36);
		letter-spacing: 0.06em;
	}

	.list-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 0.25rem 0;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.6rem 0.75rem;
		background: none;
		border: none;
		border-radius: 0;
		color: rgba(232, 228, 200, 0.62);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: all 0.1s ease;
		text-transform: none;
		letter-spacing: 0;
		box-shadow: none;
		border-left: 2px solid transparent;
	}

	.list-item::before {
		display: none;
	}

	.list-item:hover {
		background: rgba(196, 183, 143, 0.06);
		color: rgba(240, 237, 212, 0.88);
		transform: none;
		box-shadow: none;
	}

	.list-item.selected {
		background: linear-gradient(90deg, rgba(196, 183, 143, 0.12) 0%, rgba(196, 183, 143, 0.02) 100%);
		color: rgba(247, 242, 223, 0.95);
		border-left-color: #c4b78f;
	}

	.list-item.current {
		color: rgba(212, 147, 75, 0.88);
	}

	.item-marker {
		width: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.marker-select {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #c4b78f;
		box-shadow: 0 0 6px rgba(196, 183, 143, 0.4);
	}

	.marker-current {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #d4934b;
		box-shadow: 0 0 6px rgba(212, 147, 75, 0.4);
	}

	.item-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-badge {
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: rgba(212, 147, 75, 0.72);
		padding: 0.1rem 0.4rem;
		border: 1px solid rgba(212, 147, 75, 0.22);
		border-radius: 2px;
		background: rgba(212, 147, 75, 0.08);
	}

	.list-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 120px;
		color: rgba(200, 195, 160, 0.32);
		font-size: 0.75rem;
	}

	/* ═══ RIGHT: Detail Panel — research/parchment meets evidence board ═══ */
	.intel-detail {
		flex: 1;
		display: flex;
		flex-direction: column;
		background:
			radial-gradient(ellipse at top right, rgba(196, 165, 90, 0.04), transparent 60%),
			rgba(20, 18, 14, 0.4);
		min-width: 0;
	}

	.detail-content {
		flex: 1;
		padding: 2rem 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.detail-header {
		display: flex;
		align-items: flex-start;
		gap: 1.25rem;
	}

	.detail-icon-wrap {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(138, 133, 94, 0.28);
		border-radius: 2px;
		background: linear-gradient(135deg, rgba(196, 183, 143, 0.1) 0%, rgba(212, 147, 75, 0.06) 100%);
		color: rgba(196, 183, 143, 0.72);
		flex-shrink: 0;
	}

	.detail-title {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #ece6cb;
		margin: 0;
		text-transform: uppercase;
	}

	.detail-desc {
		font-size: 0.8125rem;
		color: rgba(200, 195, 160, 0.56);
		margin: 0.35rem 0 0 0;
		line-height: 1.5;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 0;
		border: 1px solid rgba(138, 133, 94, 0.14);
		border-radius: 2px;
		overflow: hidden;
	}

	.meta-row {
		display: flex;
		align-items: center;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid rgba(138, 133, 94, 0.1);
	}

	.meta-row:last-child {
		border-bottom: none;
	}

	.meta-label {
		width: 100px;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(200, 195, 160, 0.42);
	}

	.meta-value {
		flex: 1;
		font-size: 0.75rem;
		color: rgba(232, 228, 200, 0.78);
		font-family: 'JetBrains Mono', monospace;
	}

	.status-viewing {
		color: #4ade80;
	}

	.detail-action {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.25rem;
		background: linear-gradient(135deg, rgba(196, 165, 90, 0.16) 0%, rgba(212, 147, 75, 0.1) 100%);
		border: 1px solid rgba(196, 183, 143, 0.28);
		border-radius: 2px;
		color: #c4b78f;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: none;
	}

	.detail-action::before {
		display: none;
	}

	.detail-action:hover {
		background: linear-gradient(135deg, rgba(196, 165, 90, 0.24) 0%, rgba(212, 147, 75, 0.16) 100%);
		border-color: rgba(196, 183, 143, 0.42);
		transform: none;
		box-shadow: 0 0 16px rgba(196, 165, 90, 0.08);
	}

	.detail-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: rgba(200, 195, 160, 0.24);
		font-size: 0.75rem;
	}

	/* ═══ STATUS BAR ═══ */
	.intel-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1rem;
		height: 32px;
		min-height: 32px;
		border-top: 1px solid rgba(138, 133, 94, 0.18);
		background: linear-gradient(180deg, rgba(26, 23, 18, 0.96) 0%, rgba(18, 16, 12, 0.98) 100%);
		font-size: 0.5625rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(200, 195, 160, 0.38);
	}

	.status-left,
	.status-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-location {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: rgba(212, 147, 75, 0.56);
	}

	.status-sep {
		color: rgba(138, 133, 94, 0.24);
	}

	.intel-status kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 16px;
		padding: 0 0.3rem;
		font-size: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		border-radius: 2px;
		background: rgba(196, 183, 143, 0.08);
		border: 1px solid rgba(138, 133, 94, 0.2);
		color: rgba(200, 195, 160, 0.56);
	}

	/* ═══ SCROLLBAR ═══ */
	.list-scroll::-webkit-scrollbar {
		width: 4px;
	}

	.list-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.list-scroll::-webkit-scrollbar-thumb {
		background: rgba(138, 133, 94, 0.24);
		border-radius: 2px;
	}

	.list-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(170, 164, 126, 0.38);
	}

	/* ═══ Responsive ═══ */
	@media (max-width: 900px) {
		.intel-frame {
			width: calc(100vw - 1rem);
			height: calc(100vh - 1rem);
		}

		.intel-list {
			width: 240px;
			min-width: 240px;
		}

		.tab-label {
			display: none;
		}

		.intel-tab {
			padding: 0 0.6rem;
		}
	}
</style>
