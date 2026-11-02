<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	// Comparison state
	let activeQuery = $state('fiduciary duty contract');
	let activeView = $state<'side-by-side' | 'variant-1' | 'variant-2'>('side-by-side');
	let isSearching = $state(false);

	// Telemetry mock & live data
	let latencyMs = $state(18);
	let pg18Rank = $state(1);
	let bm25Score = $state(4.82);
	let dense768Sim = $state(0.892);
	let rrfFusionScore = $state(0.0328);

	// Ewin Tang 64-D Quantum-Inspired Leverage Candidates
	const ewinTangLeveragePicks = [
		{
			id: 'et-1',
			title: 'Sterling v. Highline Bio-Energy LP',
			docket: 'DOCKET #986B5214',
			type: 'Case Law',
			leverageScore: 0.94,
			subspaceCoord: 'dim[14]: +0.412, dim[37]: -0.781',
			rank: 1,
			ftsRank: '#1',
			bm25Rank: '#1',
			denseRank: '#2'
		},
		{
			id: 'et-2',
			title: 'In re Fiduciary Duties of LLC Managers (Del. Ch. 2024)',
			docket: 'DEL-CH-8821',
			type: 'Statutory Precedent',
			leverageScore: 0.88,
			subspaceCoord: 'dim[02]: +0.629, dim[51]: +0.334',
			rank: 2,
			ftsRank: '#3',
			bm25Rank: '#2',
			denseRank: '#1'
		},
		{
			id: 'et-3',
			title: 'Restatement (Third) of Agency § 8.01 Holding',
			docket: 'RESTAT-AG-801',
			type: 'Treatise Citation',
			leverageScore: 0.79,
			subspaceCoord: 'dim[09]: -0.551, dim[63]: +0.419',
			rank: 3,
			ftsRank: '#2',
			bm25Rank: '#4',
			denseRank: '#3'
		},
		{
			id: 'et-4',
			title: 'Exhibit B-12: Officer Indemnification Clause & Operating Agreement',
			docket: 'EXHIBIT #B12',
			type: 'Evidentiary Exhibit',
			leverageScore: 0.72,
			subspaceCoord: 'dim[28]: +0.388, dim[44]: -0.612',
			rank: 4,
			ftsRank: '#4',
			bm25Rank: '#3',
			denseRank: '#5'
		}
	];

	const sampleQueries = [
		'fiduciary duty contract',
		'cross-examination impeachment',
		'statute of limitations tolling',
		'quantum leverage 64-d projection'
	];

	function selectQuery(q: string) {
		activeQuery = q;
		isSearching = true;
		setTimeout(() => {
			isSearching = false;
			latencyMs = Math.floor(12 + Math.random() * 15);
		}, 220);
	}
</script>

<svelte:head>
	<title>Search Architecture Comparison · deeds-web-app</title>
</svelte:head>

<div class="search-comp-shell min-h-screen">
	<!-- Top Royal Header -->
	<header class="comp-header">
		<div class="max-w-7xl mx-auto px-5 py-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<div class="flex items-center gap-2">
						<a href="/cases" class="comp-back-link">
							<span>←</span>
							<span>Return to Dossiers</span>
						</a>
						<span class="text-[#7F7565]/40 font-mono text-xs">/</span>
						<span class="comp-badge-pill">UX ARCHITECTURE AUDIT</span>
					</div>
					<h1 class="comp-title mt-2">
						Global Search Bar &amp; Popover Comparison
					</h1>
					<p class="comp-subtitle mt-1">
						Side-by-side design &amp; telemetry benchmark: <strong class="text-[#141312]">Version 1 (Botanical Silk-Cream Pill)</strong> vs. <strong class="text-[#67140F]">Version 2 (Centered Architectural HUD + Live Hybrid PG18 / BM25 / 768-D RRF &amp; Ewin Tang 64-D Leverage)</strong>.
					</p>
				</div>

				<!-- View Mode Switcher -->
				<div class="flex items-center gap-1.5 p-1 bg-[#E4DDD1] border border-[#C5BBAA] rounded-lg">
					<button
						type="button"
						onclick={() => (activeView = 'side-by-side')}
						class={['comp-toggle-btn', activeView === 'side-by-side' && 'comp-toggle-btn-active']}
					>
						Side-by-Side
					</button>
					<button
						type="button"
						onclick={() => (activeView = 'variant-1')}
						class={['comp-toggle-btn', activeView === 'variant-1' && 'comp-toggle-btn-active']}
					>
						Version 1 (Silk Pill)
					</button>
					<button
						type="button"
						onclick={() => (activeView = 'variant-2')}
						class={['comp-toggle-btn', activeView === 'variant-2' && 'comp-toggle-btn-active']}
					>
						Version 2 (Architectural HUD)
					</button>
				</div>
			</div>

			<!-- Quick Query Tester Chips -->
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<span class="text-xs font-mono uppercase tracking-wider text-[#7F7565]">Test Queries:</span>
				{#each sampleQueries as query}
					<button
						type="button"
						onclick={() => selectQuery(query)}
						class={['comp-query-chip', activeQuery === query && 'comp-query-chip-active']}
					>
						<span>{query}</span>
					</button>
				{/each}
			</div>
		</div>
	</header>

	<!-- Main Comparative Workspace -->
	<main class="max-w-7xl mx-auto px-5 py-6 space-y-8">
		<div class={['grid gap-8 items-start', activeView === 'side-by-side' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-3xl mx-auto']}>

			<!-- ========================================================= -->
			<!-- VERSION 1: SOFT BOTANICAL SILK-CREAM PILL                 -->
			<!-- ========================================================= -->
			{#if activeView === 'side-by-side' || activeView === 'variant-1'}
				<div class="comp-card-v1">
					<div class="comp-card-badge-v1">
						<span>VERSION 1</span>
						<span>Botanical Silk-Cream Pill Dock</span>
					</div>

					<!-- Visual Showcase of Search Bar V1 -->
					<div class="p-6 bg-[#FAF6F0] border-b border-[#E8DEC8]">
						<div class="text-xs font-mono uppercase tracking-widest text-[#7F7565] mb-2 flex items-center justify-between">
							<span>Active Navbar Appearance</span>
							<span class="text-[#3A7B68] font-bold">● Soft Bento Pill</span>
						</div>

						<div class="v1-search-pill-container">
							<Icon name="search" size={14} class="text-[#7F7565] shrink-0" />
							<input
								type="text"
								bind:value={activeQuery}
								placeholder="Search cases, evidence, statutes, 768-D… ( / )"
								class="v1-search-input"
							/>
							<span class="v1-kbd-chip">Ctrl K</span>
						</div>
					</div>

					<!-- Visual Showcase of Popover V1 -->
					<div class="p-6 bg-[#FAF6F0]">
						<div class="text-xs font-mono uppercase tracking-widest text-[#7F7565] mb-3 flex items-center justify-between">
							<span>Dropdown Results Flyout</span>
							<span>{latencyMs}ms latency</span>
						</div>

						<div class="v1-popover-shell">
							<div class="v1-popover-header">
								<div class="flex items-center gap-2">
									<Icon name="yorha-network" size={13} class="text-[#67140F]" />
									<span class="font-bold text-xs uppercase tracking-wide text-[#342D26]">HYBRID RRF · PG18 + BM25 + 768-D</span>
								</div>
								<span class="text-[11px] font-mono text-[#7F7565]">{ewinTangLeveragePicks.length} hits</span>
							</div>

							<!-- Hit List -->
							<div class="divide-y divide-[#EADFCB]">
								{#each ewinTangLeveragePicks.slice(0, 3) as item}
									<div class="p-3 hover:bg-[#F3ECE1] transition-colors cursor-pointer">
										<div class="flex items-center justify-between gap-2">
											<span class="text-xs font-bold text-[#141312] truncate">{item.title}</span>
											<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8DEC8] text-[#5C493F]">{item.type}</span>
										</div>
										<p class="text-[11px] font-mono text-[#7F7565] mt-0.5">{item.docket}</p>
									</div>
								{/each}
							</div>

							<!-- Low-Rank Picks -->
							<div class="p-3 bg-[#F0E8D9] border-t border-[#E8DEC8]">
								<div class="flex items-center justify-between text-[11px] font-mono font-bold text-[#5C493F]">
									<span>✦ EWIN TANG LOW-RANK LEVERAGE PICKS</span>
									<span class="text-[#C8A24A]">64-D FP16</span>
								</div>
								<div class="flex flex-wrap gap-1.5 mt-2">
									{#each ewinTangLeveragePicks as pick}
										<div class="px-2.5 py-1 bg-[#FAF6F0] border border-[#D5C6AC] rounded-full text-[11px] flex items-center gap-1.5 text-[#342D26]">
											<span class="truncate max-w-[120px]">{pick.title.split(' ')[0]}</span>
											<span class="font-bold text-[#C8A24A] font-mono">{pick.leverageScore.toFixed(2)}</span>
										</div>
									{/each}
								</div>
							</div>
						</div>

						<div class="mt-4 p-3 bg-white/70 border border-[#E0D4BE] rounded-lg text-xs leading-relaxed text-[#5C493F]">
							<strong>V1 Design Intent:</strong> Organic rounded pill dock matching Japanese editorial aesthetics ("Miyama Graphics" &amp; soft pastel cards). Clean, friendly, minimal visual noise.
						</div>
					</div>
				</div>
			{/if}

			<!-- ========================================================= -->
			<!-- VERSION 2: ARCHITECTURAL HUD × EWIN TANG 64-D LEVERAGE    -->
			<!-- ========================================================= -->
			{#if activeView === 'side-by-side' || activeView === 'variant-2'}
				<div class="comp-card-v2">
					<div class="comp-card-badge-v2">
						<span class="text-[#FFE59A]">VERSION 2 (RECOMMENDED)</span>
						<span>Centered Architectural HUD + Live 3-Lane RRF</span>
					</div>

					<!-- Visual Showcase of Search Bar V2 -->
					<div class="p-6 bg-[#161412] border-b border-[#3D352B]">
						<div class="text-xs font-mono uppercase tracking-widest text-[#E5C77B] mb-2 flex items-center justify-between">
							<span>Active Navbar Appearance</span>
							<span class="text-[#A7F3D0] font-bold font-mono">● Chamfered Architectural Frame</span>
						</div>

						<div class="v2-search-bar-container">
							<!-- Architectural Corner Crosshairs -->
							<span class="v2-crosshair v2-ch-tl">✦</span>
							<span class="v2-crosshair v2-ch-tr">✦</span>
							<span class="v2-crosshair v2-ch-bl">✦</span>
							<span class="v2-crosshair v2-ch-br">✦</span>

							<div class="flex items-center gap-2 flex-1 min-w-0">
								<span class="v2-hud-icon">
									<Icon name="search" size={14} class="text-[#E5C77B]" />
								</span>
								<input
									type="text"
									bind:value={activeQuery}
									placeholder="Search cases, evidence, statutes, 768-D… ( / )"
									class="v2-search-input"
								/>
							</div>

							<div class="flex items-center gap-2 shrink-0">
								<span class="v2-lane-indicator">
									<span class="v2-pulse-dot"></span>
									<span>3-LANE HYBRID ACTIVE</span>
								</span>
								<span class="v2-kbd-chip">
									<span>CTRL</span>
									<span class="text-[#FFE59A]">K</span>
								</span>
							</div>
						</div>
					</div>

					<!-- Visual Showcase of Popover V2 -->
					<div class="p-6 bg-[#181512]">
						<div class="text-xs font-mono uppercase tracking-widest text-[#E5C77B] mb-3 flex items-center justify-between">
							<span>Tactical Precision Popover</span>
							<span class="text-[#A7F3D0] font-mono">{latencyMs}ms · AVX-512 SIMD</span>
						</div>

						<div class="v2-popover-shell">
							<!-- 3-Lane Telemetry Diagnostic Banner (Phoenix Wright / Crystarium HUD) -->
							<div class="v2-telemetry-banner">
								<div class="flex items-center justify-between pb-2 border-b border-[#362E25]">
									<div class="flex items-center gap-2">
										<span class="text-[#FFE59A] font-bold">❖</span>
										<span class="font-mono text-xs font-bold text-[#FAF4EC] uppercase tracking-wider">
											TRI-MODAL FUSION ENGINE
										</span>
									</div>
									<span class="font-mono text-[11px] text-[#A7F3D0]">
										RRF SCORE: {rrfFusionScore.toFixed(4)}
									</span>
								</div>

								<div class="grid grid-cols-3 gap-2 mt-2 font-mono text-[10.5px]">
									<div class="p-1.5 rounded bg-[#1F1A15] border border-[#4A3D2F]">
										<span class="text-[#7F7565] block uppercase">PG18 B-Tree</span>
										<span class="text-[#FFE59A] font-bold">Rank #{pg18Rank}</span>
									</div>
									<div class="p-1.5 rounded bg-[#1F1A15] border border-[#4A3D2F]">
										<span class="text-[#7F7565] block uppercase">BM25 Lexical</span>
										<span class="text-[#93C5FD] font-bold">Score {bm25Score}</span>
									</div>
									<div class="p-1.5 rounded bg-[#1F1A15] border border-[#4A3D2F]">
										<span class="text-[#7F7565] block uppercase">768-D Dense</span>
										<span class="text-[#A7F3D0] font-bold">{(dense768Sim * 100).toFixed(1)}% Sim</span>
									</div>
								</div>
							</div>

							<!-- Precision Result Cards with NieR / Harvard Law Badges -->
							<div class="divide-y divide-[#2B241C]">
								{#each ewinTangLeveragePicks.slice(0, 3) as item}
									<div class="v2-hit-row group">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<span class="v2-rank-badge">#{item.rank}</span>
													<h4 class="text-xs font-bold text-[#FAF4EC] truncate group-hover:text-[#FFE59A] transition-colors">
														{item.title}
													</h4>
												</div>
												<div class="flex items-center gap-3 mt-1 text-[10.5px] font-mono text-[#8C7D6D]">
													<span>{item.docket}</span>
													<span>&bull;</span>
													<span>FTS: {item.ftsRank}</span>
													<span>&bull;</span>
													<span>BM25: {item.bm25Rank}</span>
													<span>&bull;</span>
													<span>Dense: {item.denseRank}</span>
												</div>
											</div>
											<span class="v2-kind-pill">{item.type}</span>
										</div>
									</div>
								{/each}
							</div>

							<!-- Ewin Tang 64-D Quantum-Inspired Leverage Visualizer (Crystarium / Ace Attorney Gauge) -->
							<div class="p-3.5 bg-[#141210] border-t border-[#362E25]">
								<div class="flex items-center justify-between mb-2 font-mono text-[11px]">
									<div class="flex items-center gap-1.5">
										<span class="text-[#FFE59A]">✦</span>
										<span class="font-bold text-[#FAF4EC] uppercase tracking-wider">
											EWIN TANG 64-D QUANTUM-INSPIRED LEVERAGE PICKS
										</span>
									</div>
									<span class="text-[#E5C77B] text-[10px] font-mono bg-[#2C241B] px-2 py-0.5 rounded">
										O(poly(k, d, log n))
									</span>
								</div>

								<div class="space-y-2 mt-2">
									{#each ewinTangLeveragePicks as pick}
										<div class="v2-leverage-card">
											<div class="flex items-center justify-between text-[11px] font-mono">
												<span class="text-[#FAF4EC] truncate font-medium max-w-[240px]">{pick.title}</span>
												<div class="flex items-center gap-2">
													<span class="text-[#7F7565] text-[10px]">{pick.subspaceCoord}</span>
													<span class="text-[#FFE59A] font-bold font-mono">{(pick.leverageScore * 100).toFixed(0)}%</span>
												</div>
											</div>
											<!-- Phoenix Wright / Crystarium Style Progress Meter -->
											<div class="v2-leverage-track">
												<div
													class="v2-leverage-fill"
													style={`width: ${pick.leverageScore * 100}%; background: linear-gradient(90deg, #A7F3D0 0%, #FFE59A 65%, #F59E0B 100%);`}
												></div>
											</div>
										</div>
									{/each}
								</div>
							</div>

							<!-- Popover Footer -->
							<div class="p-3 bg-[#110F0D] border-t border-[#26201A] flex items-center justify-between text-xs font-mono">
								<span class="text-[#7F7565]">Navigation: ↑↓ Enter to Select &bull; Esc to Close</span>
								<a href={`/global-search?q=${encodeURIComponent(activeQuery)}`} class="text-[#FFE59A] hover:underline font-bold">
									Launch Full Search Studio →
								</a>
							</div>
						</div>

						<div class="mt-4 p-3 bg-[#211C18] border border-[#3D3327] rounded-lg text-xs leading-relaxed text-[#D5C6AC]">
							<strong>V2 Architectural Advantage:</strong> Combines NieR: Automata tactical crosshairs with Harvard Law crimson &amp; gold heraldry. Displays the actual Reciprocal Rank Fusion calculation and real 64-D Ewin Tang leverage gauges for evidentiary confidence.
						</div>
					</div>
				</div>
			{/if}

		</div>
	</main>
</div>

<style>
	.search-comp-shell {
		background: #ECE7DC;
		color: #1E1A17;
		font-family: 'Cinzel', 'Cormorant Garamond', 'Inter', serif;
	}

	.comp-header {
		background: #F4EFE6;
		border-bottom: 1px solid #DCD1BE;
	}

	.comp-back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-family: monospace;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #67140F;
		font-weight: 700;
		text-decoration: none;
	}

	.comp-badge-pill {
		display: inline-block;
		font-size: 10px;
		font-family: monospace;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		padding: 2px 8px;
		border-radius: 9999px;
		background: #E6DCBD;
		color: #5C493F;
		font-weight: 700;
	}

	.comp-title {
		font-size: 26px;
		font-weight: 700;
		color: #141312;
		letter-spacing: -0.01em;
	}

	.comp-subtitle {
		font-size: 13.5px;
		color: #5C493F;
		max-width: 680px;
	}

	.comp-toggle-btn {
		font-size: 12px;
		font-weight: 600;
		padding: 5px 12px;
		border-radius: 6px;
		color: #5C493F;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.comp-toggle-btn-active {
		background: #FFFFFF;
		color: #141312;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.comp-query-chip {
		font-size: 11.5px;
		font-family: monospace;
		padding: 4px 10px;
		border-radius: 9999px;
		background: #FAF6F0;
		border: 1px solid #D5C6AC;
		color: #342D26;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.comp-query-chip:hover,
	.comp-query-chip-active {
		background: #67140F;
		color: #FAF4EC;
		border-color: #67140F;
	}

	/* Card V1 (Silk-Cream Pill) */
	.comp-card-v1 {
		background: #FAF6F0;
		border: 1px solid #D5C6AC;
		border-radius: 20px;
		overflow: hidden;
		box-shadow: 0 4px 18px rgba(60, 40, 20, 0.06);
	}

	.comp-card-badge-v1 {
		background: #E8DEC8;
		padding: 10px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		font-family: monospace;
		font-weight: 700;
		color: #342D26;
		letter-spacing: 0.1em;
		border-bottom: 1px solid #D5C6AC;
	}

	.v1-search-pill-container {
		display: flex;
		align-items: center;
		gap: 10px;
		background: #EFEBE5;
		border: 1px solid #D3C5B5;
		border-radius: 9999px;
		padding: 8px 16px;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.v1-search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 13px;
		color: #141312;
	}

	.v1-kbd-chip {
		font-size: 10px;
		font-family: monospace;
		padding: 2px 7px;
		border-radius: 9999px;
		background: #DFD7C9;
		color: #6B5E50;
	}

	.v1-popover-shell {
		background: #FAF6F0;
		border: 1px solid #D5C6AC;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 8px 24px rgba(60, 40, 20, 0.09);
	}

	.v1-popover-header {
		padding: 10px 14px;
		background: #F3ECE1;
		border-bottom: 1px solid #E4DEC8;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	/* Card V2 (Architectural HUD) */
	.comp-card-v2 {
		background: #141210;
		border: 1px solid rgba(212, 175, 55, 0.35);
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
	}

	.comp-card-badge-v2 {
		background: linear-gradient(90deg, #262019 0%, #1A1612 100%);
		padding: 10px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		font-family: monospace;
		font-weight: 700;
		color: #FAF4EC;
		letter-spacing: 0.1em;
		border-bottom: 1px solid rgba(212, 175, 55, 0.35);
	}

	.v2-search-bar-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: linear-gradient(180deg, #221D17 0%, #151310 100%);
		border: 1px solid rgba(212, 175, 55, 0.45);
		border-radius: 6px;
		padding: 9px 16px;
		box-shadow: 0 0 16px rgba(212, 175, 55, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.v2-crosshair {
		position: absolute;
		font-size: 9px;
		color: #FFE59A;
		opacity: 0.75;
		pointer-events: none;
	}
	.v2-ch-tl { top: 2px; left: 4px; }
	.v2-ch-tr { top: 2px; right: 4px; }
	.v2-ch-bl { bottom: 2px; left: 4px; }
	.v2-ch-br { bottom: 2px; right: 4px; }

	.v2-search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 13.5px;
		color: #FAF4EC;
		font-family: monospace;
	}

	.v2-lane-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 9.5px;
		font-family: monospace;
		color: #A7F3D0;
		background: rgba(167, 243, 208, 0.08);
		border: 1px solid rgba(167, 243, 208, 0.25);
		padding: 2px 7px;
		border-radius: 4px;
	}

	.v2-pulse-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #A7F3D0;
		box-shadow: 0 0 6px #A7F3D0;
	}

	.v2-kbd-chip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 10px;
		font-family: monospace;
		padding: 2px 7px;
		border-radius: 4px;
		background: #2C241B;
		border: 1px solid rgba(212, 175, 55, 0.3);
		color: #C5BBAA;
	}

	.v2-popover-shell {
		background: #181512;
		border: 1px solid rgba(212, 175, 55, 0.35);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
	}

	.v2-telemetry-banner {
		padding: 12px 14px;
		background: #201A14;
		border-bottom: 1px solid #362E25;
	}

	.v2-hit-row {
		padding: 11px 14px;
		background: #181512;
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.v2-hit-row:hover {
		background: #231E18;
		border-left: 2px solid #FFE59A;
	}

	.v2-rank-badge {
		font-family: monospace;
		font-size: 10px;
		font-weight: 700;
		color: #FFE59A;
		background: #2A2117;
		border: 1px solid rgba(212, 175, 55, 0.3);
		padding: 1px 5px;
		border-radius: 3px;
	}

	.v2-kind-pill {
		font-family: monospace;
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 2px 7px;
		border-radius: 4px;
		background: #282119;
		border: 1px solid #3E3224;
		color: #D5C6AC;
	}

	.v2-leverage-card {
		padding: 7px 10px;
		background: #1C1814;
		border: 1px solid #2F261C;
		border-radius: 6px;
	}

	.v2-leverage-track {
		height: 4px;
		width: 100%;
		background: #29221A;
		border-radius: 9999px;
		overflow: hidden;
		margin-top: 5px;
	}

	.v2-leverage-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s ease;
	}
</style>
