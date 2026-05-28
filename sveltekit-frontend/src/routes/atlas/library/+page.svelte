<script lang="ts">
	import type { PageData } from './$types.js';
	import type { AtlasCardSummary } from '$lib/types/atlas.js';
	import NesAtlasCard from '$lib/components/atlas/NesAtlasCard.svelte';
	import NesAtlasModal from '$lib/components/atlas/NesAtlasModal.svelte';
	import AtlasShaderBackdrop from '$lib/components/atlas/AtlasShaderBackdrop.svelte';

	const { data }: { data: PageData } = $props();

	// ── Reactive state ─────────────────────────────────────────────────────────
	let selectedId = $state<string | null>(data.selectedId);
	let cards = $state<AtlasCardSummary[]>(data.cards);
	let loading = $state(false);
	let searchQuery = $state('');
	let filterKind = $state<'all' | 'rag' | 'cluster'>('all');

	// ── Derived / filtered cards ──────────────────────────────────────────────
	const filteredCards = $derived(() => {
		let list = cards;
		if (filterKind !== 'all') list = list.filter((c) => c.kind === filterKind);
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(c) =>
					c.title.toLowerCase().includes(q) ||
					c.summary.toLowerCase().includes(q) ||
					c.featureLabel.toLowerCase().includes(q) ||
					c.tags.some((t) => t.toLowerCase().includes(q))
			);
		}
		return list;
	});

	// ── Card selection ─────────────────────────────────────────────────────────
	function openCard(card: AtlasCardSummary) {
		selectedId = card.id;
		// Update URL without full navigation (shallow)
		const u = new URL(window.location.href);
		u.searchParams.set('card', card.id);
		history.replaceState({}, '', u.toString());
	}

	function closeModal() {
		selectedId = null;
		const u = new URL(window.location.href);
		u.searchParams.delete('card');
		history.replaceState({}, '', u.toString());
	}

	// ── Load more ──────────────────────────────────────────────────────────────
	async function loadMore() {
		loading = true;
		try {
			const nextOffset = data.offset + data.limit;
			const res = await fetch(`/api/atlas/cards?limit=${data.limit}&offset=${nextOffset}`);
			const json = await res.json();
			if (json.ok) cards = [...cards, ...(json.cards ?? [])];
		} catch (e) {
			console.error('loadMore failed:', e);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Atlas Library — Deeds AI</title>
	<meta
		name="description"
		content="Browse the Atlas Library — RAG and cluster cards from the codebase knowledge graph."
	/>
	<link
		rel="preconnect"
		href="https://fonts.googleapis.com"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<!-- Decorative shader background (WebGPU or Canvas 2D fallback) -->
<AtlasShaderBackdrop />

<!-- Page shell -->
<div class="library-shell">
	<!-- ── Header ────────────────────────────────────────────────────────────── -->
	<header class="library-header">
		<h1 class="library-title">
			<span class="title-bracket">[</span>
			Atlas Library
			<span class="title-bracket">]</span>
		</h1>
		<p class="library-subtitle">
			{cards.length} cards · v<code>{data.versionHash.slice(0, 8)}</code>
		</p>
	</header>

	<!-- ── Toolbar ────────────────────────────────────────────────────────────── -->
	<section class="library-toolbar" aria-label="Filters">
		<input
			id="atlas-search"
			class="nes-input"
			type="search"
			placeholder="Search cards…"
			bind:value={searchQuery}
			aria-label="Search atlas cards"
		/>

		<div class="kind-filters" role="group" aria-label="Filter by kind">
			{#each (['all', 'rag', 'cluster'] as const) as kind (kind)}
				<button
					class="kind-btn"
					class:kind-btn--active={filterKind === kind}
					onclick={() => { filterKind = kind; }}
					aria-pressed={filterKind === kind}
				>
					{kind === 'all' ? 'All' : kind === 'rag' ? '📄 RAG' : '🗂 Cluster'}
				</button>
			{/each}
		</div>
	</section>

	<!-- ── Grid ──────────────────────────────────────────────────────────────── -->
	<main class="library-grid" id="atlas-card-grid">
		{#if filteredCards().length === 0}
			<div class="library-empty">
				<span class="blink">█</span>
				{searchQuery ? 'No cards match your search.' : 'No cards found in the library.'}
			</div>
		{:else}
			{#each filteredCards() as card (card.id)}
				<NesAtlasCard
					{card}
					selected={selectedId === card.id}
					onclick={openCard}
				/>
			{/each}
		{/if}
	</main>

	<!-- ── Load more ─────────────────────────────────────────────────────────── -->
	{#if !searchQuery && cards.length >= data.limit}
		<footer class="library-footer">
			<button
				class="nes-btn-load"
				onclick={loadMore}
				disabled={loading}
				aria-busy={loading}
			>
				{loading ? '…' : '▼ Load more'}
			</button>
		</footer>
	{/if}
</div>

<!-- ── Detail modal ───────────────────────────────────────────────────────────── -->
<NesAtlasModal cardId={selectedId} onclose={closeModal} />

<style>
	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}
	.blink { animation: blink 1s step-start infinite; }

	:global(body) {
		background: #050d1a;
		color: #e2e8f0;
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.library-shell {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}

	/* ── Header ── */
	.library-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.library-title {
		font-family: 'Press Start 2P', monospace;
		font-size: clamp(1rem, 3vw, 1.6rem);
		color: #4ade80;
		text-shadow: 0 0 20px rgba(74, 222, 128, 0.4);
		margin: 0 0 0.5rem;
	}

	.title-bracket { color: #166534; }

	.library-subtitle {
		font-family: monospace;
		font-size: 0.8rem;
		color: #64748b;
		margin: 0;
	}

	.library-subtitle code {
		color: #94a3b8;
		background: #0f172a;
		padding: 0.1rem 0.35rem;
		border: 1px solid #1e293b;
	}

	/* ── Toolbar ── */
	.library-toolbar {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.nes-input {
		flex: 1;
		min-width: 200px;
		background: #0f172a;
		border: 2px solid #334155;
		color: #e2e8f0;
		font-family: monospace;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		outline: none;
		transition: border-color 120ms;
	}
	.nes-input:focus { border-color: #4ade80; }
	.nes-input::placeholder { color: #475569; }

	.kind-filters { display: flex; gap: 0.4rem; }

	.kind-btn {
		font-family: monospace;
		font-size: 0.75rem;
		background: #0f172a;
		border: 2px solid #334155;
		color: #94a3b8;
		padding: 0.4rem 0.75rem;
		cursor: pointer;
		transition: all 80ms;
	}
	.kind-btn:hover { border-color: #4ade80; color: #e2e8f0; }
	.kind-btn--active { border-color: #4ade80; color: #4ade80; background: #052e16; }

	/* ── Grid ── */
	.library-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.25rem;
	}

	.library-empty {
		grid-column: 1 / -1;
		text-align: center;
		color: #475569;
		font-family: 'Press Start 2P', monospace;
		font-size: 0.7rem;
		padding: 4rem 0;
	}

	/* ── Footer ── */
	.library-footer { display: flex; justify-content: center; margin-top: 2.5rem; }

	.nes-btn-load {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.65rem;
		background: #0f172a;
		border: 3px solid #4ade80;
		box-shadow: 4px 4px 0 #166534;
		color: #4ade80;
		padding: 0.6rem 1.5rem;
		cursor: pointer;
		transition: transform 80ms, box-shadow 80ms;
	}
	.nes-btn-load:hover:not(:disabled) {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 #166534;
	}
	.nes-btn-load:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
