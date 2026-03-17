<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Law Citation Pages</title>
</svelte:head>

<div class="min-h-full bg-[#f5f7fb] text-slate-900">
	<div class="mx-auto max-w-[1400px] p-4 md:p-6">
		<div class="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)]">
			<div class="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_52%,#eef4ff_100%)] px-6 py-5">
				<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Corpus Citation Pages</p>
						<h1 class="mt-1 text-2xl font-semibold text-slate-900">Search law citations across ingested PDF chunks</h1>
						<p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
							This view indexes citation labels from constitutions, statutes, regulations, and bills in the legal corpus, then turns each citation into a dedicated page with chunk evidence.
						</p>
					</div>
					<a
						href="/citations"
						class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
					>
						<Icon name="arrow-left" class="h-4 w-4" />
						Back to Citations
					</a>
				</div>

				<form method="GET" class="mt-5 flex flex-col gap-3 md:flex-row">
					<div class="relative flex-1">
						<Icon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<input
							name="q"
							type="search"
							value={data.query}
							placeholder="Search citation labels, headings, or chunk text"
							class="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
						/>
					</div>
					<button class="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
						Search Citation Pages
					</button>
				</form>

				<div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
					<span class="rounded-full bg-slate-100 px-3 py-1">{data.citations.length} citation page{data.citations.length === 1 ? '' : 's'}</span>
					<span class="rounded-full bg-slate-100 px-3 py-1">Law corpus only</span>
					<span class="rounded-full bg-slate-100 px-3 py-1">Chunks linked to source documents</span>
				</div>
			</div>

			<div class="px-6 py-6">
				{#if data.loadError}
					<div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{data.loadError}</div>
				{:else if data.citations.length === 0}
					<div class="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
						<Icon name="search-x" class="mx-auto h-10 w-10 text-slate-300" />
						<p class="mt-4 text-lg font-medium text-slate-800">No law citations matched</p>
						<p class="mt-2 text-sm text-slate-500">Try a broader section reference like <span class="font-mono">§ 1030</span>, <span class="font-mono">Art.</span>, or a heading keyword.</p>
					</div>
				{:else}
					<div class="grid gap-4 lg:grid-cols-2">
						{#each data.citations as citation}
							<a
								href="/citations/law/{encodeURIComponent(citation.citationLabel)}"
								class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_18px_50px_-40px_rgba(37,99,235,0.45)]"
							>
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0">
										<p class="text-lg font-semibold text-slate-900">{citation.citationLabel}</p>
										{#if citation.sampleHeading}
											<p class="mt-1 text-sm text-slate-500">{citation.sampleHeading}</p>
										{/if}
									</div>
									<Icon name="arrow-up-right" class="h-5 w-5 shrink-0 text-slate-300" />
								</div>

								<div class="mt-4 grid grid-cols-3 gap-2 text-center">
									<div class="rounded-2xl bg-slate-50 px-3 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Documents</p>
										<p class="mt-2 text-lg font-semibold text-slate-900">{citation.documentCount}</p>
									</div>
									<div class="rounded-2xl bg-slate-50 px-3 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nodes</p>
										<p class="mt-2 text-lg font-semibold text-slate-900">{citation.nodeCount}</p>
									</div>
									<div class="rounded-2xl bg-slate-50 px-3 py-3">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Chunks</p>
										<p class="mt-2 text-lg font-semibold text-slate-900">{citation.chunkCount}</p>
									</div>
								</div>

								{#if citation.documents.length > 0}
									<div class="mt-4 flex flex-wrap gap-2">
										{#each citation.documents.slice(0, 4) as document}
											<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
												{document.title}
											</span>
										{/each}
										{#if citation.documents.length > 4}
											<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">+{citation.documents.length - 4} more</span>
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