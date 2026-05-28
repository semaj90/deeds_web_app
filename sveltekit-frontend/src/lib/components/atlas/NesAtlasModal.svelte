<script lang="ts">
	import type { AtlasCardDetail } from '$lib/types/atlas.js';

	interface Props {
		cardId: string | null;
		onclose?: () => void;
	}

	const { cardId, onclose }: Props = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let detail = $state<AtlasCardDetail | null>(null);
	let similar = $state<unknown[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// ── Fetch when cardId changes ──────────────────────────────────────────────
	$effect(() => {
		if (!cardId) {
			detail = null;
			similar = [];
			error = null;
			return;
		}
		loading = true;
		error = null;

		fetch(`/api/atlas/cards/${encodeURIComponent(cardId)}`)
			.then((r) => r.json())
			.then((data) => {
				if (data.ok) {
					detail = data.card as AtlasCardDetail;
					similar = data.similarCards ?? [];
				} else {
					error = data.error ?? 'Unknown error';
				}
			})
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	// ── Escape key dismiss ─────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if cardId}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => onclose?.()} aria-hidden="true"></div>

	<dialog
		class="nes-modal"
		open
		aria-modal="true"
		aria-label="Atlas card detail"
	>
		<header class="nes-modal__header">
			<span class="nes-modal__title">
				{#if detail}
					{detail.kind === 'rag' ? '📄' : '🗂'} {detail.title ?? cardId}
				{:else}
					Loading…
				{/if}
			</span>
			<button class="nes-modal__close" onclick={() => onclose?.()} aria-label="Close modal">✕</button>
		</header>

		<div class="nes-modal__body">
			{#if loading}
				<div class="nes-modal__spinner">
					<span class="blink">█</span> Loading card data…
				</div>
			{:else if error}
				<p class="nes-modal__error">⚠ {error}</p>
			{:else if detail}
				<dl class="nes-modal__meta">
					<dt>Feature</dt><dd>{detail.featureLabel}</dd>
					{#if detail.filePath}
						<dt>Path</dt><dd class="mono">{detail.filePath}</dd>
					{/if}
					{#if detail.clusterId !== undefined}
						<dt>Cluster</dt><dd>#{detail.clusterId} — {detail.centroidLabel}</dd>
					{/if}
					<dt>Created</dt>
					<dd>{new Date(detail.createdAt).toLocaleDateString()}</dd>
				</dl>

				<section class="nes-modal__section">
					<h4>Summary</h4>
					<p>{detail.summary}</p>
				</section>

				{#if detail.tags?.length || detail.topTags?.length}
					<section class="nes-modal__section">
						<h4>Tags</h4>
						<div class="tag-row">
							{#each (detail.tags ?? detail.topTags ?? []) as tag (tag)}
								<span class="nes-tag">{tag}</span>
							{/each}
						</div>
					</section>
				{/if}

				{#if similar.length}
					<section class="nes-modal__section">
						<h4>Similar (Qdrant)</h4>
						<ul class="similar-list">
							{#each similar as item, i (i)}
								<li class="similar-item">{JSON.stringify(item).slice(0, 120)}…</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</div>
	</dialog>
{/if}

<style>
	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	.blink { animation: blink 1s step-start infinite; }

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		z-index: 40;
	}

	.nes-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 50;
		background: #0f172a;
		border: 4px solid #4ade80;
		box-shadow: 8px 8px 0 #166534;
		max-width: min(90vw, 680px);
		width: 100%;
		max-height: 85vh;
		overflow-y: auto;
		padding: 0;
		margin: 0; /* override dialog default centering */
	}

	.nes-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 2px solid #1e3a2f;
		background: #0a1628;
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.nes-modal__title {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.7rem;
		color: #4ade80;
	}

	.nes-modal__close {
		background: none;
		border: 2px solid #4ade80;
		color: #4ade80;
		font-size: 1rem;
		cursor: pointer;
		padding: 0.1rem 0.5rem;
		line-height: 1;
		transition: background 80ms;
	}
	.nes-modal__close:hover { background: #166534; }

	.nes-modal__body {
		padding: 1rem 1.25rem;
	}

	.nes-modal__spinner {
		font-family: monospace;
		color: #94a3b8;
		font-size: 0.85rem;
	}

	.nes-modal__error {
		color: #f87171;
		font-family: monospace;
		font-size: 0.85rem;
	}

	.nes-modal__meta {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2rem 0.75rem;
		font-size: 0.78rem;
		margin-bottom: 1rem;
	}

	.nes-modal__meta dt {
		color: #64748b;
		font-family: 'Press Start 2P', monospace;
		font-size: 0.55rem;
		align-self: center;
	}

	.nes-modal__meta dd {
		color: #e2e8f0;
		margin: 0;
	}

	.mono { font-family: monospace; font-size: 0.75rem; word-break: break-all; }

	.nes-modal__section {
		margin-top: 1rem;
		border-top: 1px solid #1e293b;
		padding-top: 0.75rem;
	}

	.nes-modal__section h4 {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.6rem;
		color: #4ade80;
		margin: 0 0 0.5rem;
	}

	.nes-modal__section p {
		font-size: 0.8rem;
		color: #cbd5e1;
		line-height: 1.6;
		margin: 0;
	}

	.tag-row {
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

	.similar-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.similar-item {
		font-family: monospace;
		font-size: 0.7rem;
		color: #94a3b8;
		border-left: 2px solid #334155;
		padding-left: 0.5rem;
	}
</style>
