<script lang="ts">
	// VlmTagModal — clickable tag chip that opens an HTML5 <dialog> showing
	// the tag's description, hit count, and example references from the DB.

	interface TagChip {
		/** Postgres UUID — if provided, fetches by ID (increments hit_count) */
		id?: string;
		/** Tag text displayed on the chip */
		name: string;
	}

	interface VlmTag {
		id: string;
		name: string;
		description: string | null;
		examples: string[] | null;
		source: string;
		hitCount: number;
		createdAt: string;
	}

	let { id, name }: TagChip = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let tag       = $state<VlmTag | null>(null);
	let loading   = $state(false);
	let error     = $state<string | null>(null);

	async function openModal() {
		error   = null;
		loading = true;
		dialogEl?.showModal();

		try {
			const url = id
				? `/api/evidence/tags/${encodeURIComponent(id)}`
				: `/api/evidence/tags?name=${encodeURIComponent(name)}`;
			const res  = await fetch(url);
			const data = await res.json();
			tag = (data.tag as VlmTag) ?? null;
		} catch {
			error = 'Could not load tag details.';
		} finally {
			loading = false;
		}
	}

	function closeModal() {
		dialogEl?.close();
		tag   = null;
		error = null;
	}

	function handleBackdropClick(e: MouseEvent) {
		const rect = dialogEl?.getBoundingClientRect();
		if (!rect) return;
		const outside =
			e.clientX < rect.left ||
			e.clientX > rect.right ||
			e.clientY < rect.top  ||
			e.clientY > rect.bottom;
		if (outside) closeModal();
	}
</script>

<!-- Tag chip -->
<button
	type="button"
	class="tag-chip"
	onclick={openModal}
	title="Click to view tag details"
>
	{name}
</button>

<!-- Native HTML5 dialog -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="vlm-tag-dialog"
	onclick={handleBackdropClick}
>
	<article class="vlm-tag-content">
		<header class="vlm-tag-header">
			<h3 class="vlm-tag-title">
				<span class="vlm-tag-icon">🏷</span>
				{tag?.name ?? name}
			</h3>
			<button type="button" class="vlm-close-btn" onclick={closeModal} aria-label="Close">✕</button>
		</header>

		{#if loading}
			<p class="vlm-loading">Loading…</p>
		{:else if error}
			<p class="vlm-error">{error}</p>
		{:else if tag}
			{#if tag.description}
				<p class="vlm-description">{tag.description}</p>
			{:else}
				<p class="vlm-empty">No description available.</p>
			{/if}

			<dl class="vlm-meta">
				<div class="vlm-meta-row">
					<dt>Source</dt>
					<dd><span class="vlm-source-badge">{tag.source}</span></dd>
				</div>
				<div class="vlm-meta-row">
					<dt>Searches matched</dt>
					<dd>{tag.hitCount.toLocaleString()}</dd>
				</div>
			</dl>

			{#if tag.examples && tag.examples.length > 0}
				<section class="vlm-examples">
					<h4>Examples</h4>
					<ul>
						{#each tag.examples.slice(0, 6) as ex}
							<li>{ex}</li>
						{/each}
					</ul>
				</section>
			{/if}
		{:else}
			<p class="vlm-empty">Tag not found in registry.</p>
		{/if}
	</article>
</dialog>

<style>
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.55rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid var(--color-border, #3a3a3a);
		background: var(--color-tag-bg, #1e293b);
		color: var(--color-tag-text, #94a3b8);
		transition: background 0.15s, color 0.15s;
		line-height: 1.4;
	}
	.tag-chip:hover {
		background: var(--color-tag-hover-bg, #334155);
		color: var(--color-tag-hover-text, #e2e8f0);
	}

	.vlm-tag-dialog {
		border: 1px solid var(--color-border, #3a3a3a);
		border-radius: 0.75rem;
		padding: 0;
		max-width: 28rem;
		width: calc(100vw - 2rem);
		background: var(--color-panel, #0f172a);
		color: var(--color-text, #e2e8f0);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
	}
	.vlm-tag-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(2px);
	}

	.vlm-tag-content {
		padding: 1.25rem;
	}

	.vlm-tag-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.vlm-tag-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
		color: var(--color-accent, #38bdf8);
	}
	.vlm-tag-icon {
		font-size: 1.1rem;
	}
	.vlm-close-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted, #64748b);
		font-size: 1rem;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 0.25rem;
		transition: color 0.15s;
	}
	.vlm-close-btn:hover {
		color: var(--color-text, #e2e8f0);
	}

	.vlm-description {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--color-text-secondary, #cbd5e1);
		margin: 0 0 1rem;
	}
	.vlm-empty,
	.vlm-loading {
		font-size: 0.8rem;
		color: var(--color-muted, #64748b);
		margin: 0.5rem 0 1rem;
	}
	.vlm-error {
		font-size: 0.8rem;
		color: var(--color-danger, #f87171);
		margin: 0.5rem 0 1rem;
	}

	.vlm-meta {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0 0 0.75rem;
		padding: 0.75rem;
		background: var(--color-panel-soft, #1e293b);
		border-radius: 0.5rem;
		font-size: 0.8rem;
	}
	.vlm-meta-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.vlm-meta dt {
		color: var(--color-muted, #64748b);
	}
	.vlm-meta dd {
		margin: 0;
		font-weight: 500;
		color: var(--color-text, #e2e8f0);
	}
	.vlm-source-badge {
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 9999px;
		background: var(--color-accent-soft, #0c4a6e);
		color: var(--color-accent, #38bdf8);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.vlm-examples {
		margin-top: 0.5rem;
	}
	.vlm-examples h4 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted, #64748b);
		margin: 0 0 0.4rem;
	}
	.vlm-examples ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.vlm-examples li {
		font-size: 0.78rem;
		color: var(--color-text-secondary, #94a3b8);
		font-family: ui-monospace, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
