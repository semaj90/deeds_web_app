<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();

	const groupedChunks = $derived.by(() =>
		Object.values(
			data.detail.chunks.reduce<Record<string, { documentId: string; documentTitle: string; corpusType: string | null; jurisdiction: { code: string | null; name: string | null } | null; officialUrl: string | null; chunks: typeof data.detail.chunks }>>((acc, chunk) => {
				const key = chunk.documentId;
				if (!acc[key]) {
					acc[key] = {
						documentId: chunk.documentId,
						documentTitle: chunk.documentTitle,
						corpusType: chunk.corpusType,
						jurisdiction: chunk.jurisdiction,
						officialUrl: chunk.officialUrl,
						chunks: [],
					};
				}

				acc[key].chunks.push(chunk);
				return acc;
			}, {})
		)
	);
</script>

<svelte:head>
	<title>{data.detail.citationLabel} — Law Citation Page</title>
</svelte:head>

<div class="min-h-full bg-[#f5f7fb] text-slate-900">
	<div class="mx-auto max-w-[1450px] p-4 md:p-6">
		<div class="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)]">
			<div class="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_52%,#eef4ff_100%)] px-6 py-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
							<a href="/citations" class="hover:text-slate-700">Citations</a>
							<span>›</span>
							<a href="/citations/law" class="hover:text-slate-700">Law Citation Pages</a>
							<span>›</span>
							<span class="text-slate-700">{data.detail.citationLabel}</span>
						</div>
						<p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Law Citation Page</p>
						<h1 class="mt-1 text-2xl font-semibold text-slate-900">{data.detail.citationLabel}</h1>
						<p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
							This page groups every ingested chunk currently linked to this citation label across constitutions, statutes, regulations, and bills.
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<a href="/citations/law" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
							<Icon name="arrow-left" class="h-4 w-4" />
							Back to Search
						</a>
					</div>
				</div>

				<div class="mt-5 grid gap-3 md:grid-cols-3">
					<div class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
						<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Documents</p>
						<p class="mt-2 text-2xl font-semibold text-slate-900">{data.detail.documentCount}</p>
					</div>
					<div class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
						<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Nodes</p>
						<p class="mt-2 text-2xl font-semibold text-slate-900">{data.detail.nodeCount}</p>
					</div>
					<div class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
						<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Chunks</p>
						<p class="mt-2 text-2xl font-semibold text-slate-900">{data.detail.chunkCount}</p>
					</div>
				</div>
			</div>

			<div class="grid gap-5 px-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
				<aside class="space-y-4">
					<div class="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
						<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
							<Icon name="library-big" class="h-3.5 w-3.5" />
							Source Documents
						</div>
						<ul class="mt-4 space-y-3">
							{#each data.detail.documents as document}
								<li class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
									<a href="/library/{document.documentId}" class="block text-sm font-semibold text-blue-700 hover:text-blue-900">
										{document.title}
									</a>
									<div class="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
										{#if document.corpusType}
											<span class="rounded-full bg-slate-100 px-2 py-1">{document.corpusType}</span>
										{/if}
										{#if document.jurisdiction?.name}
											<span class="rounded-full bg-slate-100 px-2 py-1">{document.jurisdiction.name}</span>
										{/if}
									</div>
									{#if document.officialUrl}
										<a href={document.officialUrl} target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
											Official source
											<Icon name="arrow-up-right" class="h-3 w-3" />
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					</div>

					<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
						<div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
							<Icon name="network" class="h-3.5 w-3.5" />
							Node References
						</div>
						<ul class="mt-4 space-y-2">
							{#each data.detail.nodes.slice(0, 12) as node}
								<li class="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
									<a href="/library/{node.documentId}/node/{node.nodeId}" class="font-medium text-blue-700 hover:text-blue-900">
										{node.heading ?? node.citationLabel}
									</a>
									{#if node.nodePath}
										<p class="mt-1 font-mono text-[11px] text-slate-500">{node.nodePath}</p>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</aside>

				<section class="space-y-4">
					{#each groupedChunks as group}
						<div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
							<div class="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
								<div>
									<a href="/library/{group.documentId}" class="text-lg font-semibold text-blue-700 hover:text-blue-900">
										{group.documentTitle}
									</a>
									<div class="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
										{#if group.corpusType}
											<span class="rounded-full bg-slate-100 px-2 py-1">{group.corpusType}</span>
										{/if}
										{#if group.jurisdiction?.name}
											<span class="rounded-full bg-slate-100 px-2 py-1">{group.jurisdiction.name}</span>
										{/if}
									</div>
								</div>
								<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{group.chunks.length} chunk{group.chunks.length === 1 ? '' : 's'}</span>
							</div>

							<div class="mt-4 space-y-3">
								{#each group.chunks as chunk}
									<article class="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
										<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
											<a href="/library/{chunk.documentId}/node/{chunk.nodeId}" class="font-semibold text-blue-700 hover:text-blue-900">
												{chunk.heading ?? chunk.citationLabel}
											</a>
											{#if chunk.nodePath}
												<span class="font-mono">{chunk.nodePath}</span>
											{/if}
											{#if chunk.pageStart}
												<span>p. {chunk.pageStart}</span>
											{/if}
										</div>
										<p class="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{chunk.content}</p>
									</article>
								{/each}
							</div>
						</div>
					{/each}
				</section>
			</div>
		</div>
	</div>
</div>