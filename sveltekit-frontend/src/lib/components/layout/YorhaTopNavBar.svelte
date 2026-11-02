<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { DropdownMenu, Tooltip } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { authStore } from '$lib/stores/auth-store.svelte.js';

	interface Props {
		user?: {
			id?: string;
			email?: string;
			firstName?: string | null;
			lastName?: string | null;
			role?: string;
			avatarUrl?: string | null;
		} | null;
		devBypass?: boolean;
		onOpenCommandPalette?: () => void;
		onOpenShortcuts?: () => void;
		onOpenAuthModal?: () => void;
	}

	let {
		user = null,
		devBypass = false,
		onOpenCommandPalette,
		onOpenShortcuts,
		onOpenAuthModal
	}: Props = $props();

	let searchQuery = $state('');
	let searchOpen = $state(false);
	let isSearching = $state(false);
	let sidebarCollapsed = $state(true);
	let avatarBroken = $state(false);
	let highlightedIndex = $state(-1);
	let searchVariant = $state<'pill' | 'architectural'>('pill');

	interface SearchHit {
		id: string;
		title: string;
		snippet: string;
		href: string;
		kind: string;
		score: number;
	}

	interface LowRankRec {
		id: string;
		title: string;
		href: string;
		kind: string;
		leverageScore: number;
	}

	interface FabricStatus {
		ok: boolean;
		authority: {
			version: string;
			pgvectorReady: boolean;
			bitmapScanEnabled: boolean;
			counts: { cases: number; evidence: number; legalDocuments: number };
		};
		outbox: { pending: number; projected: number };
		lanes: {
			sidecar8095: { status: 'online' | 'standby'; role: string };
			turbovecSimd: { status: 'online' | 'standby'; role: string };
			stagingSynthesis: { status: 'ready'; codecs: string[] };
			qdrantFanout: { status: 'online' | 'standby'; role: string };
			latentLowRank: { status: 'ready'; dims: string; policy: string };
			gpuSimtCache: { status: 'ready' | 'standby'; backends: string[] };
		};
	}

	const quickDirectory: SearchHit[] = [
		{ id: 'nav-cases', title: 'All Cases Ledger', snippet: 'Master docket & PostgreSQL 18 case dossiers', href: '/cases', kind: 'route', score: 1 },
		{ id: 'nav-active', title: 'Active Investigations', snippet: 'Open prosecution binders & priority dockets', href: '/active-cases', kind: 'route', score: 0.98 },
		{ id: 'nav-evidence', title: 'Evidence Intake & Outbox', snippet: 'SHA-256 ingest & 768-D vector outbox', href: '/evidence', kind: 'route', score: 0.96 },
		{ id: 'nav-vault', title: 'Evidence Library Vault', snippet: 'Admitted exhibits & chain-of-custody records', href: '/evidence-library', kind: 'route', score: 0.95 },
		{ id: 'nav-citations', title: 'Citations & Precedents', snippet: 'Statutory citator & linked case authorities', href: '/citations', kind: 'route', score: 0.94 },
		{ id: 'nav-corpus', title: 'Legal Corpus & Statutes', snippet: 'Annotated codes, statutes & regulatory text', href: '/legal-corpus', kind: 'route', score: 0.93 },
		{ id: 'nav-library', title: 'Legal Reference Library', snippet: 'Treatises, commentary & glossary lexicon', href: '/library', kind: 'route', score: 0.92 },
		{ id: 'nav-search', title: 'Global Hybrid Search Studio', snippet: 'RAG + KAG + BM25 + 768-D full search workspace', href: '/global-search', kind: 'route', score: 0.91 },
		{ id: 'nav-courtroom', title: '3D Courtroom Simulation', snippet: 'Adversarial trial simulation & story cues', href: '/demos/courtroom-sim', kind: 'route', score: 0.9 },
		{ id: 'nav-ai', title: 'AI & GPU Fabric Dashboard', snippet: 'Ornith :8090, TurboVec SIMD & SIMT cache status', href: '/admin/ai-dashboard', kind: 'route', score: 0.89 }
	];

	let backendHits = $state<SearchHit[]>([]);
	let recentSeeds = $state<SearchHit[]>([]);
	let lowRankRecs = $state<LowRankRec[]>([]);
	let searchLatencyMs = $state<number | null>(null);
	let fabricStatus = $state<FabricStatus | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let searchContainerEl = $state<HTMLDivElement | null>(null);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	const topNavLinks = [
		{ label: 'Cases', href: '/cases', exact: false },
		{ label: 'Evidence', href: '/evidence', exact: false },
		{ label: 'Citations', href: '/citations', exact: false },
		{ label: 'Library', href: '/library', exact: false },
		{ label: 'Corpus', href: '/analysis-center', exact: false }
	];

	const activeUser = $derived(authStore.user ?? user);
	const displayName = $derived.by(() => {
		if (activeUser?.firstName && activeUser?.lastName) {
			return `${activeUser.firstName} ${activeUser.lastName}`;
		}
		if (activeUser?.firstName) return activeUser.firstName;
		if (activeUser?.email) return activeUser.email.split('@')[0];
		return devBypass ? 'Chief Counsel' : 'Guest Counsel';
	});

	const displayRole = $derived.by(() => {
		if (activeUser?.role) return `${activeUser.role.toUpperCase()} · PG18`;
		return devBypass ? 'PROSECUTOR · DEV' : 'SIGN IN';
	});

	const matchedRoutes = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return quickDirectory.slice(0, 4);
		return quickDirectory
			.filter(
				(item) =>
					item.title.toLowerCase().includes(q) ||
					item.snippet.toLowerCase().includes(q) ||
					item.href.toLowerCase().includes(q)
			)
			.slice(0, 3);
	});

	const combinedHits = $derived.by(() => {
		const q = searchQuery.trim();
		if (q.length === 0) {
			return [...recentSeeds.slice(0, 3), ...quickDirectory.slice(0, 4)];
		}
		const seen = new Set<string>();
		const merged: SearchHit[] = [];
		for (const hit of [...backendHits, ...matchedRoutes]) {
			const key = `${hit.kind}:${hit.href}`;
			if (!seen.has(key)) {
				seen.add(key);
				merged.push(hit);
			}
		}
		return merged.slice(0, 8);
	});

	// Keep navbar input synced if user navigates to /global-search?q=...
	$effect(() => {
		if (page.url.pathname === '/global-search') {
			const urlQ = page.url.searchParams.get('q') ?? '';
			if (urlQ && searchQuery !== urlQ && !searchOpen) {
				searchQuery = urlQ;
			}
		}
	});

	function isNavActive(href: string, exact = false): boolean {
		const path = page.url.pathname;
		if (href === '/cases' && (path.startsWith('/cases') || path.startsWith('/active-cases'))) return true;
		if (href === '/evidence' && (path.startsWith('/evidence') || path.startsWith('/evidence-library'))) return true;
		if (href === '/library' && (path.startsWith('/library') || path.startsWith('/legal-corpus'))) return true;
		return exact ? path === href : path === href || path.startsWith(href + '/');
	}

	function toggleSidebar() {
		if (!browser) return;
		window.dispatchEvent(new CustomEvent('yorha:toggle-sidebar'));
	}

	function triggerCommandPalette() {
		if (onOpenCommandPalette) {
			onOpenCommandPalette();
		} else if (browser) {
			window.dispatchEvent(new CustomEvent('yorha:open-command-palette'));
		}
	}

	function triggerShortcuts() {
		if (onOpenShortcuts) {
			onOpenShortcuts();
		} else if (browser) {
			window.dispatchEvent(new CustomEvent('yorha:open-shortcuts'));
		}
	}

	function triggerAuthModal() {
		if (onOpenAuthModal) {
			onOpenAuthModal();
		} else if (browser) {
			window.dispatchEvent(new CustomEvent('yorha:open-auth-modal'));
		}
	}

	async function loadFabricStatus() {
		try {
			const res = await fetch('/api/search/fabric', { signal: AbortSignal.timeout(5000) });
			if (res.ok) {
				fabricStatus = await res.json();
			}
		} catch {
			// non-fatal telemetry fetch
		}
	}

	async function preloadRecentCases() {
		if (recentSeeds.length > 0) return;
		try {
			const res = await fetch('/api/search/fabric', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'a', limit: 3, includeLowRankRecommendations: true }),
				signal: AbortSignal.timeout(4000)
			});
			if (res.ok) {
				const payload = await res.json();
				const caseHits = (payload.hits ?? []).filter((h: SearchHit) => h.kind === 'case').slice(0, 3);
				if (caseHits.length > 0) {
					recentSeeds = caseHits;
				}
			}
		} catch {
			// optional seed
		}
	}

	async function runHybridSearch(q: string) {
		const trimmed = q.trim();
		if (trimmed.length < 1) {
			backendHits = [];
			lowRankRecs = [];
			searchLatencyMs = null;
			return;
		}
		isSearching = true;
		try {
			const res = await fetch('/api/search/fabric', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: trimmed, limit: 6, includeLowRankRecommendations: true }),
				signal: AbortSignal.timeout(8000)
			});
			if (res.ok) {
				const payload = await res.json();
				backendHits = payload.hits ?? [];
				lowRankRecs = payload.lowRankRecommendations ?? [];
				searchLatencyMs = payload.telemetry?.latencyMs ?? null;
			}
		} catch {
			// degrade gracefully to instant route directory matches
		} finally {
			isSearching = false;
		}
	}

	function handleSearchInput(value: string) {
		searchQuery = value;
		highlightedIndex = -1;
		searchOpen = true;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (value.trim().length >= 1) {
			debounceTimer = setTimeout(() => {
				void runHybridSearch(value);
			}, 180);
		} else {
			backendHits = [];
			lowRankRecs = [];
			searchLatencyMs = null;
		}
	}

	function selectHit(hit: SearchHit) {
		searchOpen = false;
		highlightedIndex = -1;
		void goto(hit.href);
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			searchOpen = false;
			highlightedIndex = -1;
			searchInputEl?.blur();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			searchOpen = true;
			const max = combinedHits.length - 1;
			highlightedIndex = max >= 0 ? Math.min(max, highlightedIndex + 1) : -1;
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(-1, highlightedIndex - 1);
			return;
		}
		if (e.key === 'Enter' && highlightedIndex >= 0 && combinedHits[highlightedIndex]) {
			e.preventDefault();
			selectHit(combinedHits[highlightedIndex]);
		}
	}

	function handleSearchSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (highlightedIndex >= 0 && combinedHits[highlightedIndex]) {
			selectHit(combinedHits[highlightedIndex]);
			return;
		}
		const q = searchQuery.trim();
		searchOpen = false;
		highlightedIndex = -1;
		if (q) {
			void goto(`/global-search?q=${encodeURIComponent(q)}`);
		} else {
			void goto('/global-search');
		}
	}

	onMount(() => {
		const syncSidebar = (ev?: Event) => {
			const detail = (ev as CustomEvent<{ collapsed?: boolean }>)?.detail;
			if (detail && typeof detail.collapsed === 'boolean') {
				sidebarCollapsed = detail.collapsed;
			} else {
				const el = document.querySelector('.yorha-sidebar');
				sidebarCollapsed = el ? el.classList.contains('collapsed') : true;
			}
		};
		syncSidebar();
		window.addEventListener('yorha:sidebar-state', syncSidebar);

		const handleDocClick = (ev: MouseEvent) => {
			if (searchContainerEl && !searchContainerEl.contains(ev.target as Node)) {
				searchOpen = false;
			}
		};
		const handleSlashShortcut = (ev: KeyboardEvent) => {
			if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
				const tag = (ev.target as HTMLElement)?.tagName;
				if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(ev.target as HTMLElement)?.isContentEditable) {
					ev.preventDefault();
					searchInputEl?.focus();
					searchOpen = true;
					void preloadRecentCases();
				}
			}
		};
		document.addEventListener('mousedown', handleDocClick);
		window.addEventListener('keydown', handleSlashShortcut);

		void loadFabricStatus();

		return () => {
			window.removeEventListener('yorha:sidebar-state', syncSidebar);
			document.removeEventListener('mousedown', handleDocClick);
			window.removeEventListener('keydown', handleSlashShortcut);
		};
	});
</script>

<Tooltip.Provider delayDuration={150}>
	<header class="yorha-top-navbar" data-testid="yorha-top-navbar">
		<div class="navbar-gold-filament" aria-hidden="true"></div>

		<div class="navbar-inner">
			<!-- Left Zone: Sidebar Minimize Toggle + Compact Brand + Section Links -->
			<div class="navbar-left-zone">
				<Tooltip.Root delayDuration={150}>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								onclick={toggleSidebar}
								class="navbar-rail-toggle"
								data-unstyled
								aria-label={sidebarCollapsed ? 'Expand navigation rail' : 'Minimize navigation rail'}
							>
								<Icon name={sidebarCollapsed ? 'yorha-panel-open' : 'yorha-panel-close'} size={13} />
							</button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content side="bottom" sideOffset={6} class="navbar-tooltip">
							{sidebarCollapsed ? 'Expand sidebar drawer' : 'Minimize sidebar to slim icon rail'}
						</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>

				<a href="/dashboard" class="navbar-brand-link">
					<span class="navbar-brand-stack">
						<span class="navbar-brand-title">YORHA LAW</span>
						<span class="navbar-brand-sub">LEX ET IUSTITIA</span>
					</span>
				</a>

				{#if devBypass}
					<span class="navbar-dev-pill" title="DEV_BYPASS_AUTH=true active">DEV</span>
				{/if}

				<nav class="navbar-links" aria-label="Primary sections">
					{#each topNavLinks as item (item.href)}
						{@const active = isNavActive(item.href, item.exact)}
						<a
							href={item.href}
							class={['navbar-link', active && 'navbar-link-active']}
							aria-current={active ? 'page' : undefined}
						>
							<span>{item.label}</span>
							{#if active}
								<span class="navbar-link-bar" aria-hidden="true"></span>
							{/if}
						</a>
					{/each}
				</nav>
			</div>

			<!-- Center Zone: Globally Accessible Hybrid BM25 + 768-D Search Bar -->
			<div class="navbar-center-zone" bind:this={searchContainerEl}>
				<form
					onsubmit={handleSearchSubmit}
					class={['navbar-search-pill', searchVariant === 'architectural' && 'navbar-search-architectural']}
					role="search"
					data-testid="yorha-global-search-form"
				>
					<Icon name="search" size={13} class="navbar-search-icon shrink-0" />
					<input
						bind:this={searchInputEl}
						type="search"
						value={searchQuery}
						oninput={(e) => handleSearchInput((e.currentTarget as HTMLInputElement).value)}
						onfocus={() => {
							searchOpen = true;
							void preloadRecentCases();
						}}
						onkeydown={handleSearchKeydown}
						placeholder="Search cases, evidence, statutes, 768-D… ( / )"
						aria-label="Global legal search across cases, evidence, and statutes"
						data-testid="yorha-global-search-input"
						class="navbar-search-input"
					/>
					{#if searchQuery}
						<button
							type="button"
							data-unstyled
							onclick={() => {
								handleSearchInput('');
								searchInputEl?.focus();
							}}
							class="navbar-clear-btn"
							aria-label="Clear search query"
						>
							✕
						</button>
					{/if}
					<button
						type="button"
						onclick={triggerCommandPalette}
						class="navbar-kbd-btn"
						data-unstyled
						title="Open Command Palette (Ctrl+K)"
					>
						Ctrl K
					</button>
				</form>

				{#if searchOpen}
					<div
						class={['navbar-search-popover', searchVariant === 'architectural' && 'navbar-search-popover-architectural']}
						role="region"
						aria-label="Global hybrid search results"
						data-testid="yorha-global-search-popover"
					>
						<div class="popover-arcana-inner" aria-hidden="true"></div>
						<div class="popover-header">
							<span class="popover-header-label">
								<Icon name="yorha-network" size={11} />
								<span>
									{searchQuery.trim()
										? (searchVariant === 'architectural' ? 'ARCHITECTURAL TRI-MODAL RRF · PG18 + BM25 + 768-D' : 'HYBRID RRF · PG18 + BM25 + 768-D')
										: 'QUICK JUMP & RECENT DOSSIERS'}
								</span>
							</span>
							<div class="flex items-center gap-2">
								<span class="popover-header-meta">
									{isSearching
										? 'SCANNING…'
										: searchLatencyMs !== null
											? `${searchLatencyMs}ms`
											: '↑↓ ENTER'}
								</span>
								<button
									type="button"
									data-unstyled
									onclick={() => (searchVariant = searchVariant === 'pill' ? 'architectural' : 'pill')}
									class="popover-variant-pill"
									title="Switch Search Style: Pill vs Architectural HUD"
								>
									{searchVariant === 'pill' ? '◈ HUD' : '● Pill'}
								</button>
							</div>
						</div>
						{#if searchVariant === 'architectural'}
							<div class="popover-hud-telemetry-strip">
								<div class="grid grid-cols-3 gap-1 text-[9.5px] font-mono">
									<div class="p-1 rounded bg-[#201B16] border border-[#3E3328] text-center">
										<span class="text-[#8C7D6D] block">PG18 FTS</span>
										<span class="text-[#FFE59A] font-bold">B-TREE #1</span>
									</div>
									<div class="p-1 rounded bg-[#201B16] border border-[#3E3328] text-center">
										<span class="text-[#8C7D6D] block">BM25 OUTBOX</span>
										<span class="text-[#93C5FD] font-bold">SCORE 4.82</span>
									</div>
									<div class="p-1 rounded bg-[#201B16] border border-[#3E3328] text-center">
										<span class="text-[#8C7D6D] block">768-D COSINE</span>
										<span class="text-[#A7F3D0] font-bold">0.892 SIM</span>
									</div>
								</div>
							</div>
						{/if}

						{#if combinedHits.length > 0}
							<div class="popover-section">
								{#each combinedHits as hit, idx (hit.id + hit.kind + idx)}
									<a
										href={hit.href}
										onclick={(e) => {
											e.preventDefault();
											selectHit(hit);
										}}
										onmouseenter={() => (highlightedIndex = idx)}
										class={['popover-hit-row', highlightedIndex === idx && 'popover-hit-active']}
									>
										<div class="min-w-0 flex-1">
											<p class="popover-hit-title truncate">{hit.title}</p>
											<p class="popover-hit-sub truncate">{hit.snippet}</p>
										</div>
										<span class="popover-kind-chip">{hit.kind}</span>
									</a>
								{/each}
							</div>
						{:else if !isSearching}
							<div class="px-3 py-3 text-center text-xs font-mono text-[#7F7565]">
								Press Enter to run full corpus &amp; vector search for "{searchQuery}"
							</div>
						{/if}

						{#if lowRankRecs.length > 0}
							<div class="popover-lowrank-box">
								<div class="popover-lowrank-title">
									<span>✦ EWIN TANG LOW-RANK LEVERAGE PICKS</span>
									<span>64-D FP16</span>
								</div>
								<div class="flex flex-wrap gap-1.5 mt-1.5">
									{#each lowRankRecs as rec (rec.id + rec.title)}
										<a
											href={rec.href}
											onclick={() => (searchOpen = false)}
											class="popover-lowrank-pill"
										>
											<span class="truncate max-w-[165px]">{rec.title}</span>
											<span class="text-[#C8A24A]">{rec.leverageScore.toFixed(2)}</span>
										</a>
									{/each}
								</div>
							</div>
						{/if}

						<div class="popover-footer">
							<button
								type="button"
								data-unstyled
								onclick={() => {
									searchOpen = false;
									triggerCommandPalette();
								}}
								class="popover-footer-link"
							>
								Command Palette (Ctrl+K)
							</button>
							<a
								href={searchQuery.trim()
									? `/global-search?q=${encodeURIComponent(searchQuery.trim())}`
									: '/global-search'}
								onclick={() => (searchOpen = false)}
								class="popover-footer-link text-[#67140F] font-bold"
							>
								Open Global Search Studio →
							</a>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right Zone: Ornith :8090 Quick Pill + User Profile Avatar Menu -->
			<div class="navbar-right-zone">
				<button
					type="button"
					data-unstyled
					onclick={() => {
						if (browser) window.dispatchEvent(new CustomEvent('yorha:open-chat'));
					}}
					class="navbar-counsel-btn hidden md:inline-flex"
					title="Open Contextual AI Counsel (Ornith :8090)"
				>
					<span class="navbar-counsel-dot" aria-hidden="true"></span>
					<span>AI :8090</span>
				</button>

				<!-- User Profile Portrait + Role Dropdown (Bits UI v2) -->
				<DropdownMenu.Root onOpenChange={(open) => { if (open) void loadFabricStatus(); }}>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								data-unstyled
								class="navbar-profile-trigger"
								aria-label="User profile and production fabric status"
							>
								<div class="navbar-avatar-ring">
									{#if activeUser?.avatarUrl && !avatarBroken}
										<img
											src={activeUser.avatarUrl}
											alt={displayName}
											onerror={() => (avatarBroken = true)}
											class="w-full h-full object-cover rounded-full"
										/>
									{:else}
										<svg viewBox="0 0 40 40" class="w-full h-full" aria-hidden="true">
											<defs>
												<linearGradient id="counselBg" x1="0" y1="0" x2="0" y2="1">
													<stop offset="0%" stop-color="#1E2434" />
													<stop offset="100%" stop-color="#0B0D13" />
												</linearGradient>
											</defs>
											<circle cx="20" cy="20" r="20" fill="url(#counselBg)" />
											<circle cx="20" cy="15" r="6.2" fill="#E5C77B" opacity="0.92" />
											<path d="M9 35 C10 26.5, 30 26.5, 31 35" fill="#67140F" stroke="#E5C77B" stroke-width="1.2" />
											<path d="M16 27 L20 33 L24 27" fill="none" stroke="#F6F3EF" stroke-width="1.1" />
										</svg>
									{/if}
									<span class="navbar-avatar-dot" aria-hidden="true"></span>
								</div>

								<div class="navbar-profile-meta hidden sm:flex">
									<span class="navbar-profile-name">{displayName}</span>
									<span class="navbar-profile-role">
										<span>{displayRole}</span>
										<span aria-hidden="true">▾</span>
									</span>
								</div>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>

					<DropdownMenu.Portal>
						<DropdownMenu.Content sideOffset={6} align="end" class="navbar-profile-menu">
							<div class="profile-menu-header">
								<p class="text-xs font-bold uppercase tracking-wider text-[#F6F3EF] truncate">{displayName}</p>
								<p class="text-[10.5px] font-mono text-[#E5C77B] truncate mt-0.5">
									{activeUser?.email ?? (devBypass ? 'dev-bypass@yorha.legal' : 'Unauthenticated session')}
								</p>
							</div>

							<div class="profile-fabric-box">
								<div class="flex items-center justify-between mb-1.5">
									<span class="text-[9.5px] font-mono uppercase tracking-[0.15em] text-[#E5C77B]">
										✦ PRODUCTION FABRIC MATRIX
									</span>
									<span class="text-[9.5px] font-mono text-[#86EFAC] whitespace-nowrap">
										{fabricStatus?.ok ? `PG ${fabricStatus.authority.version.split(' ')[0]}` : 'PG18 · 768-D'}
									</span>
								</div>

								<div class="space-y-1 text-[10px] font-mono">
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">PG18 AIO · GIN · B-Tree</span>
										<span class="text-[#86EFAC]">{fabricStatus?.authority.pgvectorReady !== false ? '● 768-D' : 'STANDBY'}</span>
									</div>
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">Sidecar :8095 (CST · NX)</span>
										<span class={fabricStatus?.lanes.sidecar8095.status === 'online' ? 'text-[#86EFAC]' : 'text-[#E5C77B]'}>
											{fabricStatus?.lanes.sidecar8095.status?.toUpperCase() ?? 'READY'}
										</span>
									</div>
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">TurboVec AVX2/512 · FSM</span>
										<span class={fabricStatus?.lanes.turbovecSimd.status === 'online' ? 'text-[#86EFAC]' : 'text-[#E5C77B]'}>
											{fabricStatus?.lanes.turbovecSimd.status?.toUpperCase() ?? 'SIMD'}
										</span>
									</div>
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">MsgPack · CouchDB · DuckDB</span>
										<span class="text-[#86EFAC]">FP16 TAGS</span>
									</div>
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">Qdrant BM25 + content</span>
										<span class={fabricStatus?.lanes.qdrantFanout.status === 'online' ? 'text-[#86EFAC]' : 'text-[#E5C77B]'}>
											{fabricStatus?.lanes.qdrantFanout.status?.toUpperCase() ?? 'HYBRID'}
										</span>
									</div>
									<div class="fabric-row">
										<span class="text-[#DBCFC5]">AE 64-D · Ewin Tang · cuTile</span>
										<span class="text-[#E5C77B]">SIMT CACHE</span>
									</div>
								</div>
							</div>

							<DropdownMenu.Separator class="h-px bg-white/10 my-1" />

							<DropdownMenu.Group>
								<DropdownMenu.Item onSelect={() => goto('/admin/ai-dashboard')} class="profile-menu-item">
									<Icon name="yorha-ai-assistant" size={14} />
									<span>AI &amp; GPU Cache Telemetry</span>
								</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => goto('/admin/codebase-index')} class="profile-menu-item">
									<Icon name="yorha-network" size={14} />
									<span>PG18 · Qdrant Vector Ledger</span>
								</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => goto('/system-configuration')} class="profile-menu-item">
									<Icon name="yorha-regulation" size={14} />
									<span>System &amp; Profile Settings</span>
								</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={triggerShortcuts} class="profile-menu-item">
									<Icon name="yorha-glossary" size={14} />
									<span>Keyboard Shortcuts (?)</span>
								</DropdownMenu.Item>
							</DropdownMenu.Group>

							<DropdownMenu.Separator class="h-px bg-white/10 my-1" />

							<DropdownMenu.Group>
								{#if activeUser}
									<DropdownMenu.Item
										onSelect={async () => {
											await authStore.logout();
											goto('/login');
										}}
										class="profile-menu-item text-[#FCA5A5]"
									>
										<Icon name="yorha-warning" size={14} />
										<span>Sign Out</span>
									</DropdownMenu.Item>
								{:else}
									<DropdownMenu.Item
										onSelect={triggerAuthModal}
										class="profile-menu-item text-[#E5C77B]"
									>
										<Icon name="yorha-subject" size={14} />
										<span>Sign In / Operator Session</span>
									</DropdownMenu.Item>
								{/if}
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			</div>
		</div>
	</header>
</Tooltip.Provider>

<style>
	.yorha-top-navbar {
		position: sticky;
		top: 0;
		z-index: 950;
		height: var(--shell-navbar-h, 46px);
		background: rgba(252, 249, 244, 0.94);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid #E4DACD;
		box-shadow: 0 4px 18px -10px rgba(72, 61, 54, 0.12);
		color: #1E1A17;
		font-family: 'Inter', 'InterLocal', system-ui, -apple-system, 'Segoe UI', sans-serif;
	}

	.navbar-gold-filament {
		position: absolute;
		inset: 0 0 auto 0;
		height: 2px;
		background: linear-gradient(90deg, #F6C1C8 0%, #FFE59A 35%, #B97F62 70%, #B7E1D1 100%);
		opacity: 0.85;
		pointer-events: none;
	}

	.navbar-inner {
		height: 100%;
		width: 100%;
		padding: 0 0.95rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(250px, 440px) minmax(0, 1fr);
		align-items: center;
		gap: 0.75rem;
	}

	.navbar-left-zone {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		height: 100%;
		justify-self: start;
	}

	.navbar-rail-toggle {
		width: 30px;
		height: 30px;
		border-radius: 9999px;
		background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
		border: 1px solid #C9BCAB;
		color: #FFE59A;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		box-shadow: 0 2px 8px -2px rgba(72, 61, 54, 0.24);
		transition: all 0.15s ease;
	}
	.navbar-rail-toggle:hover {
		background: linear-gradient(180deg, #7A5A4A 0%, #5C493F 100%);
		border-color: #FFE59A;
		color: #FFFFFF;
	}

	.navbar-brand-link {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		line-height: 1;
		flex-shrink: 0;
	}

	.navbar-brand-stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.navbar-brand-title {
		font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
		font-size: 0.92rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: #2B221E;
		white-space: nowrap;
	}

	.navbar-brand-sub {
		margin-top: 2px;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.5rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: #7A5A4A;
		white-space: nowrap;
	}

	.navbar-dev-pill {
		padding: 2px 7px;
		border-radius: 9999px;
		background: #FCECEF;
		border: 1px solid #E8A7B1;
		color: #9E4754;
		font-size: 0.55rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		flex-shrink: 0;
	}

	/* Compact Left Section Links */
	.navbar-links {
		display: none;
		align-items: center;
		gap: 0.85rem;
		height: 100%;
		margin-left: 0.45rem;
		min-width: 0;
		overflow: hidden;
	}
	@media (min-width: 1180px) {
		.navbar-links {
			display: flex;
		}
	}

	.navbar-link {
		position: relative;
		height: 100%;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		font-family: 'Inter', 'InterLocal', system-ui, -apple-system, sans-serif;
		font-size: 0.69rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #483D36;
		text-decoration: none;
		transition: color 0.15s ease;
	}
	.navbar-link:hover {
		color: #9E4754;
	}
	.navbar-link-active {
		color: #231E1B;
		font-weight: 700;
	}

	.navbar-link-bar {
		position: absolute;
		bottom: 4px;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, #D47A85, #FFE59A);
		border-radius: 9999px;
	}

	/* Center Zone — Soft Full-Pill Search Bar Dead-Center */
	.navbar-center-zone {
		position: relative;
		width: 100%;
		max-width: 440px;
		justify-self: center;
	}

	.navbar-search-pill {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		height: 33px;
		width: 100%;
		padding: 0 0.35rem 0 0.85rem;
		border-radius: 9999px;
		background: #FFFFFF;
		border: 1px solid #E2D5C5;
		box-shadow: 0 3px 10px -4px rgba(72, 61, 54, 0.08);
		transition: all 0.16s ease;
	}
	.navbar-search-pill:focus-within {
		background: #FFFFFF;
		border-color: #B97F62;
		box-shadow: 0 0 0 3px rgba(255, 229, 154, 0.45);
	}

	:global(.navbar-search-icon) {
		color: #8C7365;
	}

	.navbar-search-input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		backdrop-filter: none;
		font-family: 'Inter', 'InterLocal', system-ui, -apple-system, sans-serif;
		font-size: 0.78rem;
		font-weight: 400;
		color: #231E1B;
		outline: none;
	}
	.navbar-search-input:focus {
		box-shadow: none;
		outline: none;
	}
	.navbar-search-input::placeholder {
		color: #9A897B;
	}
	.navbar-search-input::-webkit-search-cancel-button,
	.navbar-search-input::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
		display: none;
	}

	.navbar-clear-btn {
		width: 19px;
		height: 19px;
		border-radius: 9999px;
		border: none;
		background: #F4ECE1;
		color: #5C493F;
		font-size: 0.6rem;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}
	.navbar-clear-btn:hover {
		background: #D47A85;
		color: #FFFFFF;
	}

	.navbar-kbd-btn {
		height: 23px;
		padding: 0 0.58rem;
		border-radius: 9999px;
		background: #FFF3CC;
		border: 1px solid #EDD282;
		color: #483D36;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		white-space: nowrap;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.14s ease;
	}
	.navbar-kbd-btn:hover {
		background: #FFE59A;
		border-color: #B97F62;
		color: #1F1B18;
	}

	/* Centered Hybrid Search Popover — Soft Bento Botanical Card */
	.navbar-search-popover {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: min(490px, calc(100vw - 1.5rem));
		background: linear-gradient(180deg, #FFFCF9 0%, #FAF4EC 100%);
		border: 1px solid #DFD3C3;
		border-radius: 20px;
		box-shadow: 0 20px 44px -12px rgba(72, 61, 54, 0.24);
		overflow: hidden;
		z-index: 9990;
	}

	.popover-arcana-inner {
		position: absolute;
		inset: 5px;
		border: 1px solid rgba(185, 127, 98, 0.22);
		border-radius: 15px;
		pointer-events: none;
	}

	.popover-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.52rem 0.95rem;
		background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
		color: #FFE59A;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		font-variant-numeric: tabular-nums;
	}
	.popover-header-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 600;
	}
	.popover-header-meta {
		color: #FFF1E6;
	}

	.popover-section {
		max-height: 256px;
		overflow-y: auto;
		padding: 0.45rem;
	}

	.popover-hit-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.72rem;
		border-radius: 12px;
		text-decoration: none;
		transition: background 0.12s ease;
	}
	.popover-hit-row:hover,
	.popover-hit-active {
		background: #F5EDE2;
	}
	.popover-hit-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 600;
		color: #231E1B;
	}
	.popover-hit-sub {
		margin: 1px 0 0 0;
		font-size: 0.68rem;
		color: #7A5A4A;
	}
	.popover-kind-chip {
		padding: 2px 8px;
		border-radius: 9999px;
		background: #FFF3CC;
		border: 1px solid #EDD282;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #483D36;
		flex-shrink: 0;
	}

	.popover-lowrank-box {
		padding: 0.48rem 0.85rem;
		background: #FAF3E8;
		border-top: 1px solid #E6DACB;
	}
	.popover-lowrank-title {
		display: flex;
		justify-content: space-between;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.59rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		color: #7A5A4A;
	}
	.popover-lowrank-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 3px 10px;
		border-radius: 9999px;
		background: #231E1B;
		border: 1px solid #5C493F;
		color: #FFF7EE;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
		text-decoration: none;
	}

	.popover-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.48rem 0.9rem;
		background: #F6EFE5;
		border-top: 1px solid #E2D5C5;
	}
	.popover-footer-link {
		border: none;
		background: transparent;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		color: #5C493F;
		text-decoration: none;
		cursor: pointer;
	}
	.popover-footer-link:hover {
		color: #9E4754;
		text-decoration: underline;
	}

	/* Right Zone — Airy Soft Pill Cluster (no rigid polygon clip) */
	.navbar-right-zone {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 100%;
		padding: 0;
		background: transparent;
		border: none;
		justify-self: end;
		flex-shrink: 0;
	}

	.navbar-counsel-btn {
		align-items: center;
		gap: 0.4rem;
		height: 30px;
		padding: 0 0.78rem;
		border-radius: 9999px;
		background: #231E1B;
		border: 1px solid #483D36;
		color: #FFF7EE;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		box-shadow: 0 4px 12px -4px rgba(35, 30, 27, 0.24);
		transition: all 0.15s ease;
	}
	.navbar-counsel-btn:hover {
		background: #483D36;
		border-color: #B97F62;
		color: #FFE59A;
	}

	.navbar-counsel-dot {
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		background: #B7E1D1;
		box-shadow: 0 0 6px rgba(183, 225, 209, 0.9);
	}

	/* Compact Profile Avatar Trigger */
	.navbar-profile-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.16rem 0.58rem 0.16rem 0.18rem;
		border-radius: 9999px;
		background: #FFFFFF;
		border: 1px solid #E2D5C5;
		box-shadow: 0 2px 8px -3px rgba(72, 61, 54, 0.08);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.navbar-profile-trigger:hover {
		background: #FFF9F2;
		border-color: #B97F62;
		box-shadow: 0 4px 12px -3px rgba(185, 127, 98, 0.2);
	}

	.navbar-avatar-ring {
		position: relative;
		width: 27px;
		height: 27px;
		border-radius: 9999px;
		padding: 1.5px;
		background: linear-gradient(135deg, #E5C77B 0%, #7A1B18 100%);
		flex-shrink: 0;
	}

	.navbar-avatar-dot {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		background: #22C55E;
		border: 1.5px solid #F6F3EF;
	}

	.navbar-profile-meta {
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.15;
		padding-right: 0.15rem;
	}

	.navbar-profile-name {
		font-size: 0.72rem;
		font-weight: 600;
		color: #1E1A17;
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.navbar-profile-role {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.58rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		color: #665C50;
	}

	/* Bits UI Profile Dropdown Content */
	:global(.navbar-profile-menu) {
		z-index: 9996;
		width: 282px;
		padding: 0.45rem;
		border-radius: 8px;
		background: linear-gradient(180deg, #121622 0%, #0B0D13 100%);
		border: 1px solid rgba(200, 162, 74, 0.55);
		box-shadow: 0 18px 38px rgba(0, 0, 0, 0.6);
		color: #F6F3EF;
	}

	.profile-menu-header {
		padding: 0.45rem 0.55rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.profile-fabric-box {
		margin: 0.4rem 0.2rem;
		padding: 0.5rem 0.55rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid rgba(200, 162, 74, 0.24);
	}

	.fabric-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	:global(.profile-menu-item) {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.55rem;
		border-radius: 5px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.68rem;
		color: #E9E4E0;
		cursor: pointer;
		outline: none;
		transition: background 0.12s ease;
	}
	:global(.profile-menu-item:hover),
	:global(.profile-menu-item[data-highlighted]) {
		background: rgba(200, 162, 74, 0.16);
		color: #FFF0BE;
	}

	:global(.navbar-tooltip) {
		z-index: 9996;
		padding: 0.3rem 0.55rem;
		border-radius: 4px;
		background: #0B0D13;
		border: 1px solid rgba(200, 162, 74, 0.6);
		color: #F6F3EF;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.63rem;
	}

	/* ── Architectural HUD Variant Styles ───────────────────────── */
	.navbar-search-architectural {
		border-radius: 6px !important;
		background: linear-gradient(180deg, #1C1814 0%, #12100E 100%) !important;
		border: 1px solid rgba(212, 175, 55, 0.45) !important;
		box-shadow: 0 0 14px rgba(212, 175, 55, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
	}
	.navbar-search-architectural .navbar-search-input {
		color: #FAF4EC !important;
		font-family: monospace !important;
	}
	.navbar-search-architectural .navbar-search-input::placeholder {
		color: #8C7D6D !important;
	}
	:global(.navbar-search-architectural .navbar-search-icon) {
		color: #FFE59A !important;
	}
	.navbar-search-architectural .navbar-kbd-btn {
		background: #2A2117 !important;
		border: 1px solid rgba(212, 175, 55, 0.35) !important;
		color: #FFE59A !important;
		border-radius: 4px !important;
	}

	.navbar-search-popover-architectural {
		border-radius: 8px !important;
		background: #141210 !important;
		border: 1px solid rgba(212, 175, 55, 0.4) !important;
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), 0 0 24px rgba(212, 175, 55, 0.12) !important;
	}
	.navbar-search-popover-architectural .popover-arcana-inner {
		border: 1px solid rgba(212, 175, 55, 0.22) !important;
		border-radius: 6px !important;
	}
	.navbar-search-popover-architectural .popover-header {
		background: linear-gradient(180deg, #262019 0%, #1A1612 100%) !important;
		border-bottom: 1px solid rgba(212, 175, 55, 0.35) !important;
		color: #FFE59A !important;
	}
	.popover-variant-pill {
		font-size: 9.5px;
		font-family: monospace;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 4px;
		background: #362E25;
		color: #FFE59A;
		border: 1px solid rgba(212, 175, 55, 0.35);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.popover-variant-pill:hover {
		background: #4A3E31;
		color: #FFFFFF;
	}
	.popover-hud-telemetry-strip {
		padding: 6px 12px;
		background: #181512;
		border-bottom: 1px solid #2B231B;
	}
	.navbar-search-popover-architectural .popover-hit-row {
		border-radius: 4px !important;
	}
	.navbar-search-popover-architectural .popover-hit-row:hover,
	.navbar-search-popover-architectural .popover-hit-active {
		background: #231E18 !important;
		border-left: 2px solid #FFE59A;
	}
	.navbar-search-popover-architectural .popover-hit-title {
		color: #FAF4EC !important;
	}
	.navbar-search-popover-architectural .popover-hit-sub {
		color: #8C7D6D !important;
	}
	.navbar-search-popover-architectural .popover-kind-chip {
		background: #251F19 !important;
		border: 1px solid #3E3224 !important;
		color: #FFE59A !important;
	}
	.navbar-search-popover-architectural .popover-lowrank-box {
		background: #161310 !important;
		border-top: 1px solid #2B231B !important;
	}
	.navbar-search-popover-architectural .popover-lowrank-title {
		color: #FFE59A !important;
	}
	.navbar-search-popover-architectural .popover-lowrank-pill {
		background: #201A14 !important;
		border: 1px solid #3B3023 !important;
		color: #FAF4EC !important;
	}
	.navbar-search-popover-architectural .popover-footer {
		background: #100E0C !important;
		border-top: 1px solid #241D17 !important;
	}
	.navbar-search-popover-architectural .popover-footer-link {
		color: #FFE59A !important;
	}

</style>
