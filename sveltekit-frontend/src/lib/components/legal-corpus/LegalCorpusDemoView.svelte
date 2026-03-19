<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { DemoModel } from '$lib/adapters/legal-corpus';

	let { model, onCitationClick }: { model: DemoModel; onCitationClick?: (cite: DemoModel['topCitations'][number]) => void } = $props();
</script>

<div class="demo-page">
	<!-- Header -->
	<header class="demo-header">
		<div class="demo-breadcrumb">
			<a href="/legal-corpus">Legal Corpus</a>
			<span class="sep">/</span>
			<span class="current">{model.title}</span>
		</div>
	</header>

	<!-- Title + Stats -->
	<div class="demo-title-block">
		<h1>
			{model.title}
			{#if model.section}
				<span class="section-tag">§ {model.section}</span>
			{/if}
		</h1>
		<div class="demo-meta">
			{#if model.jurisdiction}
				<span class="meta-pill">{model.jurisdiction}</span>
			{/if}
			{#if model.category}
				<span class="meta-pill">{model.category}</span>
			{/if}
		</div>
	</div>

	<!-- Quick Stats Bar -->
	<div class="stats-bar">
		<div class="stat">
			<Icon name="file-text" size={14} />
			<span class="stat-count">{model.stats.chunks}</span>
			<span class="stat-label">Sections</span>
		</div>
		<div class="stat">
			<Icon name="scale" size={14} />
			<span class="stat-count">{model.stats.precedents}</span>
			<span class="stat-label">Precedents</span>
		</div>
		<div class="stat">
			<Icon name="folder" size={14} />
			<span class="stat-count">{model.stats.caseLinks}</span>
			<span class="stat-label">Cases</span>
		</div>
		<div class="stat">
			<Icon name="book-text" size={14} />
			<span class="stat-count">{model.stats.glossaryTerms}</span>
			<span class="stat-label">Terms</span>
		</div>
		<div class="stat">
			<Icon name="git-branch" size={14} />
			<span class="stat-count">{model.stats.relatedStatutes}</span>
			<span class="stat-label">Related</span>
		</div>
	</div>

	<!-- Two Column: Summary + Citations -->
	<div class="demo-grid">
		<!-- Summary -->
		<div class="demo-card">
			<h2><Icon name="sparkles" size={15} /> Summary</h2>
			<p class="summary-text">{model.summary}{model.summary.length >= 500 ? '...' : ''}</p>

			{#if model.topSections.length > 0}
				<h3>Top Sections</h3>
				<div class="sections-list">
					{#each model.topSections as chunk}
						<div class="section-item">
							<span class="section-idx">§ {chunk.chunkIndex + 1}</span>
							<p>{chunk.content.slice(0, 200)}{chunk.content.length > 200 ? '...' : ''}</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Right Column: Citations + Glossary -->
		<div class="demo-right">
			{#if model.topCitations.length > 0}
				<div class="demo-card">
					<h2><Icon name="scale" size={15} /> Key Citations</h2>
					{#each model.topCitations as cite}
						<button class="cite-row" onclick={() => onCitationClick?.(cite)}>
							<strong>{cite.title}</strong>
							<div class="cite-meta">
								{#if cite.court}<span>{cite.court}</span>{/if}
								{#if cite.citation}<span class="cite-ref">{cite.citation}</span>{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}

			{#if model.glossaryPreview.length > 0}
				<div class="demo-card">
					<h2><Icon name="book-text" size={15} /> Glossary Preview</h2>
					{#each model.glossaryPreview as term}
						<div class="glossary-row">
							<strong>{term.term}</strong>
							<p>{term.definition.slice(0, 120)}{term.definition.length > 120 ? '...' : ''}</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.demo-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
	}

	.demo-header {
		margin-bottom: 1rem;
	}

	.demo-breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: #9ca3af;
	}
	.demo-breadcrumb a {
		color: #c4752b;
		text-decoration: none;
	}
	.demo-breadcrumb a:hover { text-decoration: underline; }
	.sep { color: #d1d5db; }
	.current { color: #4a4238; font-weight: 500; }

	.demo-title-block {
		margin-bottom: 1rem;
	}
	.demo-title-block h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #2a2520;
		margin: 0 0 0.5rem 0;
		line-height: 1.3;
	}
	.section-tag {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		background: rgba(196, 117, 43, 0.12);
		color: #c4752b;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.85rem;
		vertical-align: middle;
		margin-left: 0.35rem;
	}
	.demo-meta {
		display: flex;
		gap: 0.5rem;
	}
	.meta-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: #e8e2d6;
		color: #4a4238;
		border: 1px solid rgba(42, 37, 32, 0.1);
	}

	.stats-bar {
		display: flex;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: #faf7f0;
		border: 1px solid rgba(42, 37, 32, 0.1);
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.stat {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #4a4238;
		font-size: 0.8rem;
	}
	.stat-count {
		font-weight: 700;
		color: #c4752b;
	}
	.stat-label {
		color: #9ca3af;
		font-size: 0.72rem;
	}

	.demo-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 900px) {
		.demo-grid { grid-template-columns: 1fr; }
	}

	.demo-card {
		background: #faf7f0;
		border: 1px solid rgba(42, 37, 32, 0.12);
		border-radius: 0.5rem;
		padding: 1.25rem;
		margin-bottom: 1rem;
	}
	.demo-card h2 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #2a2520;
		margin: 0 0 0.75rem 0;
	}
	.demo-card h3 {
		font-size: 0.78rem;
		font-weight: 600;
		color: #4a4238;
		margin: 1rem 0 0.5rem 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.summary-text {
		font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
		font-size: 0.95rem;
		line-height: 1.7;
		color: rgba(42, 37, 32, 0.85);
	}

	.sections-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.section-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.06);
	}
	.section-idx {
		flex-shrink: 0;
		color: #c4752b;
		font-family: monospace;
		font-weight: 600;
		font-size: 0.8rem;
	}
	.section-item p {
		font-size: 0.82rem;
		color: rgba(42, 37, 32, 0.7);
		line-height: 1.5;
		margin: 0;
	}

	.demo-right {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.cite-row {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.5rem;
		margin: 0 -0.5rem;
		border: none;
		border-bottom: 1px solid rgba(42, 37, 32, 0.06);
		background: none;
		cursor: pointer;
		border-radius: 0.25rem;
		transition: background 0.15s;
	}
	.cite-row:hover {
		background: rgba(196, 117, 43, 0.08);
	}
	.cite-row strong {
		font-size: 0.82rem;
		color: #2a2520;
	}
	.cite-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #9ca3af;
		margin-top: 0.15rem;
	}
	.cite-ref {
		font-family: monospace;
		color: #c4752b;
		font-size: 0.68rem;
	}

	.glossary-row {
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.06);
	}
	.glossary-row strong {
		font-size: 0.8rem;
		color: #c4752b;
	}
	.glossary-row p {
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.6);
		margin: 0.15rem 0 0 0;
		line-height: 1.4;
	}
</style>
