<script lang="ts">
	import type { AtlasCardSummary } from '$lib/types/atlas.js';

	interface Props {
		card: AtlasCardSummary;
		selected?: boolean;
		onclick?: (card: AtlasCardSummary) => void;
	}

	const { card, selected = false, onclick }: Props = $props();

	const kindColor = $derived(card.kind === 'rag' ? '#4ec9b0' : '#ce9178');
	const kindLabel = $derived(card.kind === 'rag' ? 'RAG' : 'Cluster');
	const shortSummary = $derived(
		card.summary.length > 140 ? card.summary.slice(0, 140) + '…' : card.summary
	);
	const displayTags = $derived(card.tags.slice(0, 3));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
	id="atlas-card-{card.id}"
	class="nes-card"
	class:nes-card--selected={selected}
	onclick={() => onclick?.(card)}
	role="button"
	tabindex="0"
	aria-pressed={selected}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onclick?.(card)}
>
	<header class="nes-card__header">
		<span class="nes-card__kind" style="color: {kindColor}">[{kindLabel}]</span>
		<h3 class="nes-card__title">{card.title}</h3>
	</header>

	<p class="nes-card__feature">{card.featureLabel}</p>
	<p class="nes-card__summary">{shortSummary}</p>

	{#if displayTags.length}
		<footer class="nes-card__tags">
			{#each displayTags as tag (tag)}
				<span class="nes-tag">{tag}</span>
			{/each}
			{#if card.tags.length > 3}
				<span class="nes-tag nes-tag--more">+{card.tags.length - 3}</span>
			{/if}
		</footer>
	{/if}
</article>

<style>
	.nes-card {
		background: #1a1a2e;
		border: 3px solid #4ade80;
		box-shadow: 4px 4px 0 #166534, inset 0 0 0 1px #052e16;
		padding: 1rem 1.125rem;
		cursor: pointer;
		transition: transform 80ms ease, box-shadow 80ms ease;
		outline: none;
		/* NES pixel-font feel */
		image-rendering: pixelated;
	}

	.nes-card:hover,
	.nes-card:focus-visible {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 #166534, inset 0 0 0 1px #052e16;
	}

	.nes-card--selected {
		border-color: #facc15;
		box-shadow: 4px 4px 0 #854d0e, inset 0 0 0 1px #422006;
	}

	.nes-card__header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}

	.nes-card__kind {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.nes-card__title {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.65rem;
		color: #e2e8f0;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nes-card__feature {
		font-family: monospace;
		font-size: 0.7rem;
		color: #94a3b8;
		margin: 0 0 0.5rem;
	}

	.nes-card__summary {
		font-size: 0.75rem;
		color: #cbd5e1;
		line-height: 1.5;
		margin: 0 0 0.75rem;
	}

	.nes-card__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.nes-tag {
		font-family: monospace;
		font-size: 0.65rem;
		background: #0f172a;
		border: 1px solid #334155;
		color: #7dd3fc;
		padding: 0.1rem 0.4rem;
	}

	.nes-tag--more {
		color: #94a3b8;
		border-color: #1e293b;
	}
</style>
