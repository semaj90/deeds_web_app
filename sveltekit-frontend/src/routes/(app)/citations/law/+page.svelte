<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Law Citation Pages</title>
</svelte:head>

<div class="cl-page">
	<div class="cl-container">
		<div class="cl-panel">
			<div class="cl-header">
				<div class="cl-header-top">
					<div>
						<p class="cl-overline">Corpus Citation Pages</p>
						<h1 class="cl-h1">Search law citations across ingested PDF chunks</h1>
						<p class="cl-desc">
							This view indexes citation labels from constitutions, statutes, regulations, and bills in the legal corpus, then turns each citation into a dedicated page with chunk evidence.
						</p>
					</div>
					<a href="/citations" class="cl-back-btn">
						<Icon name="arrow-left" />
						Back to Citations
					</a>
				</div>

				<form method="GET" class="cl-search-form">
					<div class="cl-search-wrapper">
						<Icon name="search" class="cl-search-icon" />
						<input
							name="q"
							type="search"
							value={data.query}
							placeholder="Search citation labels, headings, or chunk text"
							class="cl-search-input"
						/>
					</div>
					<button class="cl-search-btn">Search Citation Pages</button>
				</form>

				<div class="cl-pills">
					<span class="cl-pill">{data.citations.length} citation page{data.citations.length === 1 ? '' : 's'}</span>
					<span class="cl-pill">Law corpus only</span>
					<span class="cl-pill">Chunks linked to source documents</span>
				</div>
			</div>

			<div class="cl-body">
				{#if data.loadError}
					<div class="cl-error">{data.loadError}</div>
				{:else if data.citations.length === 0}
					<div class="cl-empty">
						<Icon name="search-x" class="cl-empty-icon" />
						<p class="cl-empty-title">No law citations matched</p>
						<p class="cl-empty-desc">Try a broader section reference like <code class="cl-code">&sect; 1030</code>, <code class="cl-code">Art.</code>, or a heading keyword.</p>
					</div>
				{:else}
					<div class="cl-grid">
						{#each data.citations as citation}
							<a
								href="/citations/law/{encodeURIComponent(citation.citationLabel)}"
								class="cl-card"
							>
								<div class="cl-card-top">
									<div class="cl-card-text">
										<p class="cl-card-label">{citation.citationLabel}</p>
										{#if citation.sampleHeading}
											<p class="cl-card-heading">{citation.sampleHeading}</p>
										{/if}
									</div>
									<Icon name="arrow-up-right" class="cl-card-arrow" />
								</div>

								<div class="cl-card-stats">
									<div class="cl-card-stat">
										<p class="cl-card-stat-label">Documents</p>
										<p class="cl-card-stat-value">{citation.documentCount}</p>
									</div>
									<div class="cl-card-stat">
										<p class="cl-card-stat-label">Nodes</p>
										<p class="cl-card-stat-value">{citation.nodeCount}</p>
									</div>
									<div class="cl-card-stat">
										<p class="cl-card-stat-label">Chunks</p>
										<p class="cl-card-stat-value">{citation.chunkCount}</p>
									</div>
								</div>

								{#if citation.documents.length > 0}
									<div class="cl-card-docs">
										{#each citation.documents.slice(0, 4) as document}
											<span class="cl-doc-pill">{document.title}</span>
										{/each}
										{#if citation.documents.length > 4}
											<span class="cl-doc-pill cl-doc-more">+{citation.documents.length - 4} more</span>
										{/if}
									</div>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* ── Page ── */
	.cl-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 2.5rem;
	}

	.cl-page :global(h1), .cl-page :global(h2), .cl-page :global(h3), .cl-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.cl-page :global(a) { color: inherit; border-bottom: none; }
	.cl-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.cl-page :global(input), .cl-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.cl-page :global([class*="panel"]), .cl-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }
	.cl-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem 1.5rem;
	}

	/* ── Panel ── */
	.cl-panel {
		border-radius: 1rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}

	/* ── Header ── */
	.cl-header {
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding: 1.25rem 1.5rem;
	}
	.cl-header-top {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	@media (min-width: 1024px) {
		.cl-header-top {
			flex-direction: row;
			align-items: flex-end;
			justify-content: space-between;
		}
	}
	.cl-overline {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.24em;
		color: rgba(212, 199, 163, 0.4);
	}
	.cl-h1 {
		margin: 0.25rem 0 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
	}
	.cl-desc {
		margin-top: 0.5rem;
		max-width: 48rem;
		font-size: 0.8rem;
		line-height: 1.5rem;
		color: rgba(212, 199, 163, 0.4);
	}
	.cl-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.12);
		background: rgba(0, 0, 0, 0.2);
		color: rgba(212, 199, 163, 0.7);
		font-size: 0.85rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.15s;
	}
	.cl-back-btn:hover { background: rgba(212, 199, 163, 0.06); color: rgba(212, 199, 163, 0.9); }

	/* ── Search ── */
	.cl-search-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}
	@media (min-width: 768px) {
		.cl-search-form { flex-direction: row; }
	}
	.cl-search-wrapper { position: relative; flex: 1; }
	:global(.cl-search-icon) {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1rem;
		height: 1rem;
		color: rgba(212, 199, 163, 0.25);
		pointer-events: none;
	}
	.cl-search-input {
		width: 100%;
		height: 2.75rem;
		padding: 0 1rem 0 2.5rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.85rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.cl-search-input::placeholder { color: rgba(212, 199, 163, 0.25); }
	.cl-search-input:focus { border-color: rgba(96, 165, 250, 0.5); }
	.cl-search-btn {
		padding: 0.625rem 1rem;
		border-radius: 0.75rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		color: rgba(96, 165, 250, 0.95);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}
	.cl-search-btn:hover { background: rgba(96, 165, 250, 0.25); }

	/* ── Pills ── */
	.cl-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.cl-pill {
		border-radius: 9999px;
		background: rgba(212, 199, 163, 0.06);
		padding: 0.25rem 0.75rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
	}

	/* ── Body ── */
	.cl-body { padding: 1.5rem; }

	/* ── Error ── */
	.cl-error {
		border-radius: 0.75rem;
		border: 1px solid rgba(248, 113, 113, 0.15);
		background: rgba(248, 113, 113, 0.06);
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		color: #f87171;
	}

	/* ── Empty ── */
	.cl-empty {
		border-radius: 0.875rem;
		border: 1px dashed rgba(212, 199, 163, 0.12);
		background: rgba(0, 0, 0, 0.15);
		padding: 2.5rem 1.5rem;
		text-align: center;
	}
	:global(.cl-empty-icon) {
		width: 2.5rem;
		height: 2.5rem;
		color: rgba(212, 199, 163, 0.2);
		margin: 0 auto;
	}
	.cl-empty-title {
		margin-top: 1rem;
		font-size: 1.125rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.7);
	}
	.cl-empty-desc {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.4);
	}
	.cl-code {
		font-size: 0.75rem;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		background: rgba(212, 199, 163, 0.06);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	/* ── Grid ── */
	.cl-grid {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 1024px) {
		.cl-grid { grid-template-columns: 1fr 1fr; }
	}

	/* ── Card ── */
	.cl-card {
		display: block;
		border-radius: 0.875rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.2);
		padding: 1.25rem;
		text-decoration: none;
		transition: all 0.2s;
	}
	.cl-card:hover {
		border-color: rgba(96, 165, 250, 0.3);
		transform: translateY(-2px);
		box-shadow: 0 18px 50px -40px rgba(96, 165, 250, 0.25);
	}
	.cl-card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.cl-card-text { min-width: 0; }
	.cl-card-label {
		font-size: 1.125rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
	}
	.cl-card-heading {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
	}
	:global(.cl-card-arrow) {
		width: 1.25rem;
		height: 1.25rem;
		color: rgba(212, 199, 163, 0.2);
		flex-shrink: 0;
	}

	/* ── Card stats ── */
	.cl-card-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-top: 1rem;
		text-align: center;
	}
	.cl-card-stat {
		border-radius: 0.75rem;
		background: rgba(0, 0, 0, 0.15);
		padding: 0.75rem;
	}
	.cl-card-stat-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: rgba(212, 199, 163, 0.35);
	}
	.cl-card-stat-value {
		margin-top: 0.5rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}

	/* ── Doc pills ── */
	.cl-card-docs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.cl-doc-pill {
		border-radius: 9999px;
		background: rgba(96, 165, 250, 0.08);
		padding: 0.25rem 0.75rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: rgba(96, 165, 250, 0.8);
		border: 1px solid rgba(96, 165, 250, 0.15);
	}
	.cl-doc-more {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.45);
		border-color: rgba(212, 199, 163, 0.08);
	}
</style>
