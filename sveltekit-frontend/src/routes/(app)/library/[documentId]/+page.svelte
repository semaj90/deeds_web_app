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

	const STATUS_COLOR: Record<string, string> = {
		complete: 'text-green-400',
		failed: 'text-red-400',
		queued: 'text-sand/40',
		extracting: 'text-blue-400',
		structuring: 'text-blue-400',
		chunking: 'text-yellow-400',
		embedding: 'text-purple-400',
		graphing: 'text-teal-400',
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
	<div class="p-8 text-center text-red-400">{data.loadError}</div>
{:else if data.document}
	{@const doc = data.document}
	<div class="p-6 text-sand">
		<!-- Header -->
		<div class="mb-6 pb-5 border-b border-sand/10">
			<div class="flex items-start justify-between gap-4">
				<div>
					<div class="flex items-center gap-2 mb-1.5">
						{#if doc.jurisdiction}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-700/30 font-mono">
								{doc.jurisdiction.code.toUpperCase()}
							</span>
						{/if}
						{#if doc.corpusType}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-sand/8 text-sand/50">
								{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}
							</span>
						{/if}
						{#if doc.isOfficial}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-950/60 text-green-400">✓ Official</span>
						{/if}
						<span class="text-[10px] {STATUS_COLOR[doc.processingStatus] ?? ''}">
							{doc.processingStatus}
						</span>
					</div>
					<h1 class="text-2xl font-bold text-sand">{doc.title}</h1>
					{#if doc.citation}
						<p class="text-sm text-sand/50 font-mono mt-0.5">{doc.citation}</p>
					{/if}
				</div>

				<a
					href="/library/{doc.id}/reader"
					class="shrink-0 px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent/90 transition-colors"
				>
					Open Reader →
				</a>
			</div>

			<!-- Metadata bar -->
			<div class="flex items-center gap-6 mt-4 text-xs text-sand/40">
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
					<a href={doc.officialUrl} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">
						Official source ↗
					</a>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-[1fr_280px] gap-6">
			<!-- TOC preview -->
			<div>
				<h2 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-3">Table of Contents</h2>
				{#if data.toc.length === 0}
					{#if doc.processingStatus === 'complete'}
						<p class="text-sand/30 text-sm">No sections detected.</p>
					{:else}
						<p class="text-sand/30 text-sm">Indexing in progress…</p>
					{/if}
				{:else}
					<TocTree
						nodes={tocTree}
						onSelect={(id) => goto(`/library/${doc.id}/reader?node=${id}`)}
					/>
					{#if data.toc.length >= 40}
						<a
							href="/library/{doc.id}/reader"
							class="text-xs text-accent/60 hover:text-accent text-center py-2 block mt-2"
						>
							View full table of contents in reader →
						</a>
					{/if}
				{/if}
			</div>

			<!-- Right: Quick info -->
			<div class="flex flex-col gap-4">
				<div class="panel rounded-lg border border-sand/10 p-4">
					<h3 class="text-xs font-semibold text-sand/50 uppercase tracking-wider mb-3">Document Info</h3>
					<dl class="flex flex-col gap-2 text-xs">
						{#if doc.jurisdiction}
							<div class="flex justify-between">
								<dt class="text-sand/40">Jurisdiction</dt>
								<dd class="text-sand/70">{doc.jurisdiction.name}</dd>
							</div>
						{/if}
						{#if doc.corpusType}
							<div class="flex justify-between">
								<dt class="text-sand/40">Type</dt>
								<dd class="text-sand/70">{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-sand/40">Status</dt>
							<dd class="{STATUS_COLOR[doc.processingStatus] ?? ''}">{doc.processingStatus}</dd>
						</div>
						{#if doc.createdAt}
							<div class="flex justify-between">
								<dt class="text-sand/40">Added</dt>
								<dd class="text-sand/70">{new Date(doc.createdAt).toLocaleDateString()}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<a
					href="/library/{doc.id}/reader"
					class="block w-full py-3 rounded-lg border border-accent/30 text-center text-sm text-accent hover:bg-accent/10 transition-colors"
				>
					Open Reader
				</a>
				<a
					href="/library"
					class="block w-full py-2 rounded text-center text-xs text-sand/40 hover:text-sand/70 transition-colors"
				>
					← Back to Library
				</a>
			</div>
		</div>
	</div>
{/if}
