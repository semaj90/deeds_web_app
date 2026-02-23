<script lang="ts">
	import { parseCartridge, type ParsedCartridge } from '$lib/shared/chr97-reader.js';
	import { quantizeFloat32ToUint8 } from '$lib/shared/quantize.js';
	import type { QuantizedEmbedding } from '$lib/shared/embedding-types';
	import { NESMemoryArchitecture, type MemoryStats } from '$lib/memory/nes-memory-architecture.js';
	import { runeToLegalDocument } from '$lib/memory/rune-to-legal-doc.js';
	import { GPU_CONFIG } from '$lib/config/env.js';
	import { NES_PALETTE } from '$lib/themes/retro-console-palettes.js';

	interface PageData {
		cases: Array<{ id: string; title: string; status: string }>;
		user: { id: string } | null;
		loadError: string | null;
	}

	let { data }: { data: PageData } = $props();

	// ── State ────────────────────────────────────────────────────────────
	let selectedCaseId = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let cartridge = $state<ParsedCartridge | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<Array<{ index: number; score: number }>>([]);
	let searching = $state(false);
	let selectedRune = $state<number | null>(null);
	let runeTexts: string[] = [];
	let canvas: HTMLCanvasElement | undefined = $state();

	// ── NES Memory State ─────────────────────────────────────────────────
	let nesMemory = $state<NESMemoryArchitecture | null>(null);
	let nesStats = $state<MemoryStats | null>(null);
	let nesBanks = $state<Array<{ name: string; size: number; used: number; docs: number }>>([]);

	// ── Derived ──────────────────────────────────────────────────────────
	let runeCount = $derived(cartridge?.runes.length ?? 0);
	let hasCartridge = $derived(cartridge !== null);
	let highlightSet = $derived(new Set(searchResults.map(r => r.index)));

	// ── NES palette colors for canvas ────────────────────────────────────
	const nesColors = [
		...NES_PALETTE.colors.accent,
		NES_PALETTE.colors.primary,
		NES_PALETTE.colors.secondary,
		NES_PALETTE.colors.tertiary,
		NES_PALETTE.colors.evidence,
		NES_PALETTE.colors.classification,
		NES_PALETTE.colors.confidence,
		NES_PALETTE.colors.priority,
	];

	// ── NES Memory lifecycle ─────────────────────────────────────────────
	$effect(() => {
		const mem = new NESMemoryArchitecture();
		mem.startVBlankCycle();
		nesMemory = mem;
		return () => {
			mem.stopVBlankCycle();
			nesMemory = null;
		};
	});

	// ── Periodic NES stats refresh ───────────────────────────────────────
	$effect(() => {
		if (!nesMemory) return;
		updateNESStats();
		const id = setInterval(updateNESStats, 2000);
		return () => clearInterval(id);
	});

	function updateNESStats() {
		if (!nesMemory) return;
		nesStats = nesMemory.getMemoryStats();
		const banks = nesMemory.getBanks();
		nesBanks = Array.from(banks.entries()).map(([name, bank]) => ({
			name,
			size: bank.size,
			used: bank.used,
			docs: bank.documents.size,
		}));
	}

	// ── Populate NES memory from cartridge ────────────────────────────────
	async function populateNESMemory(cart: ParsedCartridge) {
		if (!nesMemory) return;
		nesMemory.clear();

		for (let i = 0; i < cart.runes.length; i++) {
			const rune = cart.runes[i];
			const tensor = i < cart.tensors.length ? cart.tensors[i] : undefined;
			const doc = runeToLegalDocument(rune, tensor, {
				caseId: selectedCaseId,
				embeddingDim: cart.metadata.embeddingDim,
				collections: cart.metadata.collections,
				sources: cart.metadata.sources,
			});

			const buf = new ArrayBuffer(doc.size);
			await nesMemory.allocateDocument(doc, buf);
		}

		updateNESStats();
	}

	// ── Load cartridge from API ──────────────────────────────────────────
	async function loadCartridge() {
		if (!selectedCaseId) return;
		loading = true;
		error = null;
		cartridge = null;
		searchResults = [];
		selectedRune = null;
		runeTexts = [];

		try {
			const res = await fetch('/api/cartridge/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId: selectedCaseId }),
			});

			if (!res.ok) {
				const errBody = await res.json().catch(() => ({ error: res.statusText }));
				throw new Error(errBody.error ?? `HTTP ${res.status}`);
			}

			const blob = await res.arrayBuffer();
			const bytes = new Uint8Array(blob);

			// Parse the CH-ROM97 binary
			cartridge = parseCartridge(bytes);

			// Extract rune texts from metadata sources
			runeTexts = cartridge.metadata.sources;

			// Populate NES memory banks from parsed runes
			await populateNESMemory(cartridge);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load cartridge';
		} finally {
			loading = false;
		}
	}

	// ── Search: embed query → cosine similarity vs rune tensors ──────────
	async function handleSearch() {
		if (!searchQuery.trim() || !cartridge) return;
		searching = true;
		searchResults = [];

		try {
			// Embed the search query client-side via ONNX
			const { embedText } = await import('$lib/ai/client-embed.js');
			const queryVec = await embedText(searchQuery);
			if (!queryVec || queryVec.length === 0) {
				throw new Error('Embedding failed — model may not be loaded');
			}

			// Quantize query vector
			const queryQuant = quantizeFloat32ToUint8(new Float32Array(queryVec));

			// Compare against all rune tensors
			const scores: Array<{ index: number; score: number }> = [];

			for (let i = 0; i < cartridge.tensors.length; i++) {
				const runeQuant = quantizeFloat32ToUint8(cartridge.tensors[i]);
				const score = quantizedCosine(queryQuant, runeQuant);
				if (score > 0.3) {
					scores.push({ index: i, score });
				}
			}

			scores.sort((a, b) => b.score - a.score);
			searchResults = scores.slice(0, 20);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Search failed';
		} finally {
			searching = false;
		}
	}

	function quantizedCosine(a: QuantizedEmbedding, b: QuantizedEmbedding): number {
		let dot = 0, normA = 0, normB = 0;
		const len = Math.min(a.data.length, b.data.length);
		for (let i = 0; i < len; i++) {
			const va = a.data[i] / a.scale + a.offset;
			const vb = b.data[i] / b.scale + b.offset;
			dot += va * vb;
			normA += va * va;
			normB += vb * vb;
		}
		const denom = Math.sqrt(normA) * Math.sqrt(normB);
		return denom === 0 ? 0 : dot / denom;
	}

	// ── Canvas rendering ─────────────────────────────────────────────────
	$effect(() => {
		if (!canvas || !cartridge) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);

		// NES pixel-perfect rendering
		if (GPU_CONFIG.nesPixelPerfect) {
			ctx.imageSmoothingEnabled = false;
		}

		// NES palette background
		ctx.fillStyle = NES_PALETTE.colors.background;
		ctx.fillRect(0, 0, w, h);

		const runes = cartridge.runes;
		if (runes.length === 0) return;

		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const r of runes) {
			if (r.manifold[0] < minX) minX = r.manifold[0];
			if (r.manifold[0] > maxX) maxX = r.manifold[0];
			if (r.manifold[1] < minY) minY = r.manifold[1];
			if (r.manifold[1] > maxY) maxY = r.manifold[1];
		}

		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;
		const pad = 40;

		for (let i = 0; i < runes.length; i++) {
			const r = runes[i];
			const x = pad + ((r.manifold[0] - minX) / rangeX) * (w - 2 * pad);
			const y = pad + ((r.manifold[1] - minY) / rangeY) * (h - 2 * pad);

			const isHighlight = highlightSet.has(i);
			const isSelected = selectedRune === i;

			ctx.beginPath();
			ctx.arc(x, y, isSelected ? 8 : isHighlight ? 6 : 3, 0, Math.PI * 2);
			ctx.fillStyle = isHighlight ? NES_PALETTE.colors.warning : nesColors[r.clusterId % nesColors.length];
			ctx.globalAlpha = isHighlight ? 1 : 0.7;
			ctx.fill();

			if (isSelected) {
				ctx.strokeStyle = NES_PALETTE.colors.foreground;
				ctx.lineWidth = 2;
				ctx.stroke();
			}

			ctx.globalAlpha = 1;
		}

		if (selectedRune !== null && selectedRune < runes.length) {
			const r = runes[selectedRune];
			const x = pad + ((r.manifold[0] - minX) / rangeX) * (w - 2 * pad);
			const y = pad + ((r.manifold[1] - minY) / rangeY) * (h - 2 * pad);

			ctx.fillStyle = NES_PALETTE.colors.foreground;
			ctx.font = '12px monospace';
			ctx.fillText(`Rune #${r.id} (cluster ${r.clusterId})`, x + 12, y - 8);
		}
	});

	function handleCanvasClick(e: MouseEvent) {
		if (!canvas || !cartridge) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const w = canvas.width;
		const h = canvas.height;

		const runes = cartridge.runes;
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const r of runes) {
			if (r.manifold[0] < minX) minX = r.manifold[0];
			if (r.manifold[0] > maxX) maxX = r.manifold[0];
			if (r.manifold[1] < minY) minY = r.manifold[1];
			if (r.manifold[1] > maxY) maxY = r.manifold[1];
		}
		const rangeX = maxX - minX || 1;
		const rangeY = maxY - minY || 1;
		const pad = 40;

		let closest = -1;
		let closestDist = 15;

		for (let i = 0; i < runes.length; i++) {
			const r = runes[i];
			const x = pad + ((r.manifold[0] - minX) / rangeX) * (w - 2 * pad);
			const y = pad + ((r.manifold[1] - minY) / rangeY) * (h - 2 * pad);
			const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
			if (dist < closestDist) {
				closestDist = dist;
				closest = i;
			}
		}

		selectedRune = closest >= 0 ? closest : null;
	}

	function bankFillColor(pct: number): string {
		if (pct > 85) return NES_PALETTE.colors.error;
		if (pct > 60) return NES_PALETTE.colors.warning;
		return NES_PALETTE.colors.success;
	}
</script>

<div class="memory-palace">
	<header class="palace-header">
		<h1>Memory Palace</h1>
		<p>CH-ROM97 Evidence Cartridge Viewer</p>
	</header>

	{#if data.loadError && data.cases.length === 0}
		<div class="notice">{data.loadError}</div>
	{:else}
		<div class="controls">
			<select bind:value={selectedCaseId} disabled={loading}>
				<option value="">Select a case...</option>
				{#each data.cases as c (c.id)}
					<option value={c.id}>{c.title} ({c.status})</option>
				{/each}
			</select>
			<button onclick={loadCartridge} disabled={!selectedCaseId || loading}>
				{loading ? 'Loading...' : 'Load Cartridge'}
			</button>
		</div>

		{#if error}
			<div class="error-box">{error}</div>
		{/if}

		{#if hasCartridge}
			<div class="stats-bar">
				<span>{runeCount} runes</span>
				<span>{cartridge?.metadata.embeddingDim}-dim embeddings</span>
				<span>{cartridge?.metadata.sources.length} sources</span>
				<span>{cartridge?.header.version === 256 ? 'v1.0' : `v${cartridge?.header.version}`}</span>
			</div>

			<!-- NES Memory Bank Utilization -->
			{#if nesBanks.length > 0}
				<div class="nes-banks">
					<h3>NES Memory Banks</h3>
					{#each nesBanks as bank}
						{@const pct = bank.size > 0 ? Math.round((bank.used / bank.size) * 100) : 0}
						<div class="bank-row">
							<span class="bank-name">{bank.name}</span>
							<div class="bank-bar">
								<div class="bank-fill" style="width: {pct}%; background: {bankFillColor(pct)}" />
							</div>
							<span class="bank-pct">{pct}%</span>
							<span class="bank-docs">{bank.docs} docs</span>
						</div>
					{/each}
					{#if nesStats}
						<div class="nes-summary">
							<span>{nesStats.documentCount} total docs</span>
							<span>{nesStats.bankSwitches} bank switches</span>
							<span>{nesStats.garbageCollections} GC cycles</span>
						</div>
					{/if}
				</div>
			{/if}

			<div class="search-bar">
				<input
					type="text"
					placeholder="Search evidence chunks..."
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && handleSearch()}
					disabled={searching}
				/>
				<button onclick={handleSearch} disabled={searching || !searchQuery.trim()}>
					{searching ? 'Searching...' : 'Search'}
				</button>
				{#if searchResults.length > 0}
					<span class="result-count">{searchResults.length} matches</span>
				{/if}
			</div>

			<div class="canvas-container">
				<canvas bind:this={canvas} width={800} height={500} onclick={handleCanvasClick}></canvas>
			</div>

			{#if selectedRune !== null && cartridge}
				{@const rune = cartridge.runes[selectedRune]}
				<div class="detail-panel">
					<h3>Rune #{rune.id}</h3>
					<dl>
						<dt>Cluster</dt><dd>{rune.clusterId}</dd>
						<dt>Manifold</dt><dd>[{rune.manifold.map(v => v.toFixed(3)).join(', ')}]</dd>
						<dt>Quant4</dt><dd>[{rune.quant4.join(', ')}]</dd>
						<dt>Graph Degree</dt><dd>{rune.graphDegree}</dd>
					</dl>
					{#if searchResults.find(r => r.index === selectedRune)}
						<div class="score-badge">
							Score: {searchResults.find(r => r.index === selectedRune)?.score.toFixed(3)}
						</div>
					{/if}
				</div>
			{/if}

			{#if searchResults.length > 0}
				<div class="results-list">
					<h3>Search Results</h3>
					{#each searchResults as result (result.index)}
						<button
							class="result-row"
							class:active={selectedRune === result.index}
							onclick={() => (selectedRune = result.index)}
						>
							<span class="rune-id">#{result.index}</span>
							<span class="rune-score">{result.score.toFixed(3)}</span>
							<span class="rune-cluster">cluster {cartridge?.runes[result.index]?.clusterId}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.memory-palace { padding: 2rem; font-family: 'Source Sans 3', sans-serif; max-width: 1200px; margin: 0 auto; }
	.palace-header { margin-bottom: 2rem; border-bottom: 3px solid var(--yorha-crimson, #8b4513); padding-bottom: 1rem; }
	.palace-header h1 { margin: 0; font-size: 1.75rem; font-weight: bold; }
	.palace-header p { margin: 0.25rem 0 0; color: #888; font-size: 0.875rem; }
	.controls { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
	.controls select { flex: 1; padding: 0.5rem; border: 2px solid #d4a574; border-radius: 4px; font-size: 0.9rem; }
	.controls button { padding: 0.5rem 1.5rem; background: #8b4513; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
	.controls button:disabled { opacity: 0.5; cursor: not-allowed; }
	.notice { padding: 1rem; background: #fff3e0; border: 1px solid #ff9800; border-radius: 4px; color: #e65100; }
	.error-box { padding: 0.75rem; background: #ffebee; border: 1px solid #ef5350; border-radius: 4px; color: #c62828; margin-bottom: 1rem; }
	.stats-bar { display: flex; gap: 1.5rem; padding: 0.75rem 1rem; background: #f5f1e8; border: 1px solid #d4a574; border-radius: 4px; margin-bottom: 1rem; font-size: 0.85rem; font-weight: 600; }
	.search-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
	.search-bar input { flex: 1; padding: 0.5rem 0.75rem; border: 2px solid #d4a574; border-radius: 4px; font-size: 0.9rem; }
	.search-bar button { padding: 0.5rem 1rem; background: #2e7d32; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
	.search-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
	.result-count { font-size: 0.85rem; color: #2e7d32; font-weight: 600; }
	.canvas-container { border: 2px solid #333; border-radius: 4px; overflow: hidden; margin-bottom: 1rem; }
	.canvas-container canvas { display: block; width: 100%; height: auto; cursor: crosshair; }
	.detail-panel { background: #f5f1e8; border: 2px solid #d4a574; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; }
	.detail-panel h3 { margin: 0 0 0.75rem; font-size: 1rem; }
	.detail-panel dl { display: grid; grid-template-columns: 120px 1fr; gap: 0.25rem 1rem; margin: 0; font-size: 0.85rem; }
	.detail-panel dt { font-weight: 600; color: #666; }
	.detail-panel dd { margin: 0; font-family: monospace; }
	.score-badge { margin-top: 0.75rem; display: inline-block; padding: 0.25rem 0.75rem; background: #ffeb3b; border-radius: 3px; font-weight: 700; font-size: 0.85rem; }
	.results-list { border: 1px solid #ddd; border-radius: 4px; max-height: 300px; overflow-y: auto; }
	.results-list h3 { margin: 0; padding: 0.5rem 0.75rem; background: #f5f5f5; border-bottom: 1px solid #ddd; font-size: 0.9rem; }
	.result-row { display: flex; gap: 1rem; padding: 0.5rem 0.75rem; border: none; border-bottom: 1px solid #eee; background: white; width: 100%; cursor: pointer; text-align: left; font-size: 0.85rem; }
	.result-row:hover { background: #f5f1e8; }
	.result-row.active { background: #fff3e0; border-left: 3px solid #ff9800; }
	.rune-id { font-weight: 700; min-width: 40px; }
	.rune-score { font-family: monospace; color: #2e7d32; font-weight: 600; }
	.rune-cluster { color: #888; }

	/* NES Memory Banks */
	.nes-banks { background: #1a1a1a; border: 2px solid #333; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; }
	.nes-banks h3 { margin: 0 0 0.75rem; font-size: 0.9rem; color: #ccc; font-family: monospace; }
	.bank-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.8rem; font-family: monospace; }
	.bank-name { min-width: 120px; color: #aaa; }
	.bank-bar { flex: 1; height: 12px; background: #333; border-radius: 2px; overflow: hidden; }
	.bank-fill { height: 100%; transition: width 0.3s ease; border-radius: 2px; }
	.bank-pct { min-width: 36px; text-align: right; color: #ccc; }
	.bank-docs { min-width: 50px; text-align: right; color: #888; }
	.nes-summary { display: flex; gap: 1.5rem; padding-top: 0.5rem; border-top: 1px solid #333; margin-top: 0.5rem; font-size: 0.75rem; color: #888; font-family: monospace; }
</style>
