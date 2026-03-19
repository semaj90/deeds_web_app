<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TocTree from '$lib/components/legal/TocTree.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	const CORPUS_LABELS: Record<string, string> = {
		constitution: 'Constitution',
		statute: 'Statute',
		regulation: 'Regulation',
		bill: 'Bill',
		case: 'Case Law',
		glossary: 'Glossary',
		treatise: 'Treatise',
		other: 'Other',
	};

	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel?: string | null;
		nodePath: string;
		depth: number;
		children?: TocNode[];
	}

	const tocTree = $derived.by(() => {
		const nodes: TocNode[] = data.toc.map((n: Record<string, unknown>) => ({
			id: n.id as string,
			parentId: n.parent_id as string | null,
			nodeType: n.node_type as string,
			heading: n.heading as string,
			citationLabel: n.citation_label as string | null,
			nodePath: n.node_path as string,
			depth: n.depth as number,
			children: [],
		}));

		const map = new Map(nodes.map((n) => [n.id, n]));
		const roots: TocNode[] = [];
		for (const n of nodes) {
			if (n.parentId && map.has(n.parentId)) {
				map.get(n.parentId)!.children!.push(n);
			} else {
				roots.push(n);
			}
		}
		return roots;
	});
</script>

<svelte:head>
	<title>{data.document?.title ?? 'Document'} — Legal Library</title>
</svelte:head>

{#if data.loadError}
	<div class="ld-error-page">{data.loadError}</div>
{:else if data.document}
	{@const doc = data.document}
	<div class="ld-page">
		<!-- Header -->
		<div class="ld-header">
			<div class="ld-header-top">
				<div>
					<div class="ld-badge-row">
						{#if doc.jurisdiction}
							<span class="ld-badge ld-badge-blue">{doc.jurisdiction.code.toUpperCase()}</span>
						{/if}
						{#if doc.corpusType}
							<span class="ld-badge ld-badge-neutral">{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</span>
						{/if}
						{#if doc.isOfficial}
							<span class="ld-badge ld-badge-green">Official</span>
						{/if}
						<span class="ld-status ld-status-{doc.processingStatus}">{doc.processingStatus}</span>
					</div>
					<h1 class="ld-h1">{doc.title}</h1>
					{#if doc.citation}
						<p class="ld-citation">{doc.citation}</p>
					{/if}
				</div>

				<a href="/library/{doc.id}/reader" class="ld-open-reader">
					Open Reader &rarr;
				</a>
			</div>

			<!-- Metadata bar -->
			<div class="ld-meta-bar">
				{#if doc.pageCount}
					<span>{doc.pageCount} pages</span>
				{/if}
				{#if doc.wordCount}
					<span>{doc.wordCount.toLocaleString()} words</span>
				{/if}
				{#if doc.nodeCount}
					<span>{doc.nodeCount} sections</span>
				{/if}
				{#if doc.chunkCount}
					<span>{doc.chunkCount} indexed chunks</span>
				{/if}
				{#if doc.effectiveDate}
					<span>Effective {new Date(doc.effectiveDate).toLocaleDateString()}</span>
				{/if}
				{#if doc.officialUrl}
					<a href={doc.officialUrl} target="_blank" rel="noopener noreferrer" class="ld-official-link">
						Official source
						<Icon name="external-link" />
					</a>
				{/if}
			</div>
		</div>

		<div class="ld-body-grid">
			<!-- TOC preview -->
			<div>
				<h2 class="ld-section-label">Table of Contents</h2>
				{#if data.toc.length === 0}
					{#if doc.processingStatus === 'complete'}
						<p class="ld-muted-text">No sections detected.</p>
					{:else}
						<p class="ld-muted-text">Indexing in progress&hellip;</p>
					{/if}
				{:else}
					<TocTree
						nodes={tocTree}
						onSelect={(id) => goto(`/library/${doc.id}/reader?node=${id}`)}
					/>
					{#if data.toc.length >= 40}
						<a href="/library/{doc.id}/reader" class="ld-view-full">
							View full table of contents in reader &rarr;
						</a>
					{/if}
				{/if}
			</div>

			<!-- Right: Quick info -->
			<div class="ld-info-col">
				<div class="ld-info-card">
					<h3 class="ld-section-label">Document Info</h3>
					<dl class="ld-info-dl">
						{#if doc.jurisdiction}
							<div class="ld-info-row">
								<dt>Jurisdiction</dt>
								<dd>{doc.jurisdiction.name}</dd>
							</div>
						{/if}
						{#if doc.corpusType}
							<div class="ld-info-row">
								<dt>Type</dt>
								<dd>{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</dd>
							</div>
						{/if}
						<div class="ld-info-row">
							<dt>Status</dt>
							<dd class="ld-status ld-status-{doc.processingStatus}">{doc.processingStatus}</dd>
						</div>
						{#if doc.createdAt}
							<div class="ld-info-row">
								<dt>Added</dt>
								<dd>{new Date(doc.createdAt).toLocaleDateString()}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<a href="/library/{doc.id}/reader" class="ld-cta-reader">Open Reader</a>
				<a href="/library" class="ld-back-link">&larr; Back to Library</a>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Error / page ── */
	.ld-error-page {
		padding: 2rem;
		text-align: center;
		color: #f87171;
	}
	.ld-page {
		padding: 1.5rem 2.5rem;
		margin: -2.5rem;
		min-height: 100vh;
		background: #0e0d0b;
		color: rgba(212, 199, 163, 0.9);
	}
	.ld-page :global(h1), .ld-page :global(h2), .ld-page :global(h3), .ld-page :global(h4), .ld-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.ld-page :global(a) { color: inherit; border-bottom: none; }
	.ld-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.ld-page :global(input), .ld-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.ld-page :global(.panel), .ld-page :global(.card), .ld-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.ld-header {
		margin-bottom: 1.5rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}
	.ld-header-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.ld-badge-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}
	.ld-badge {
		font-size: 0.6rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.ld-badge-blue {
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
		border: 1px solid rgba(96, 165, 250, 0.2);
	}
	.ld-badge-neutral {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.4);
	}
	.ld-badge-green {
		background: rgba(52, 211, 153, 0.1);
		color: #34d399;
	}
	.ld-h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}
	.ld-citation {
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.4);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		margin-top: 0.125rem;
	}
	.ld-open-reader {
		flex-shrink: 0;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		color: rgba(96, 165, 250, 0.95);
		font-size: 0.85rem;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}
	.ld-open-reader:hover { background: rgba(96, 165, 250, 0.25); }

	/* ── Status colors ── */
	.ld-status { font-size: 0.6rem; }
	.ld-status-complete { color: #34d399; }
	.ld-status-failed { color: #f87171; }
	.ld-status-queued { color: rgba(212, 199, 163, 0.35); }
	.ld-status-extracting,
	.ld-status-structuring { color: rgba(96, 165, 250, 0.9); }
	.ld-status-chunking { color: #fbbf24; }
	.ld-status-embedding { color: rgba(168, 85, 247, 0.9); }
	.ld-status-graphing { color: rgba(20, 184, 166, 0.9); }

	/* ── Meta bar ── */
	.ld-meta-bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-top: 1rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.3);
	}
	.ld-official-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: rgba(96, 165, 250, 0.7);
		text-decoration: none;
		transition: color 0.15s;
	}
	.ld-official-link:hover { color: rgba(96, 165, 250, 1); text-decoration: underline; }

	/* ── Body grid ── */
	.ld-body-grid {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 1.5rem;
	}

	/* ── Section label ── */
	.ld-section-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.45);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		margin: 0 0 0.75rem;
	}
	.ld-muted-text { font-size: 0.85rem; color: rgba(212, 199, 163, 0.25); }
	.ld-view-full {
		display: block;
		text-align: center;
		padding: 0.5rem 0;
		margin-top: 0.5rem;
		font-size: 0.7rem;
		color: rgba(96, 165, 250, 0.5);
		text-decoration: none;
		transition: color 0.15s;
	}
	.ld-view-full:hover { color: rgba(96, 165, 250, 0.9); }

	/* ── Info column ── */
	.ld-info-col {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.ld-info-card {
		border-radius: 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.2);
		padding: 1rem;
	}
	.ld-info-dl {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.7rem;
	}
	.ld-info-row {
		display: flex;
		justify-content: space-between;
	}
	.ld-info-row dt { color: rgba(212, 199, 163, 0.3); }
	.ld-info-row dd { color: rgba(212, 199, 163, 0.6); }

	/* ── CTA links ── */
	.ld-cta-reader {
		display: block;
		width: 100%;
		padding: 0.75rem 0;
		border-radius: 0.5rem;
		border: 1px solid rgba(96, 165, 250, 0.25);
		text-align: center;
		font-size: 0.85rem;
		color: rgba(96, 165, 250, 0.9);
		text-decoration: none;
		transition: background 0.15s;
	}
	.ld-cta-reader:hover { background: rgba(96, 165, 250, 0.08); }
	.ld-back-link {
		display: block;
		width: 100%;
		padding: 0.5rem 0;
		border-radius: 0.25rem;
		text-align: center;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.3);
		text-decoration: none;
		transition: color 0.15s;
	}
	.ld-back-link:hover { color: rgba(212, 199, 163, 0.6); }
</style>
