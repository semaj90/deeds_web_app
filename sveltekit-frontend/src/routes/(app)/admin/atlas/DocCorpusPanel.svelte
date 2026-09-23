<script lang="ts">
	import type { DocCorpusStudioSnapshotV1, DocSearchResult } from '$lib/server/atlas/docs/doc-corpus-studio-read.js';

	let {
		snapshot = null,
		search = null,
		query = ''
	}: { snapshot?: DocCorpusStudioSnapshotV1 | null; search?: DocSearchResult | null; query?: string } = $props();

	const issueCount = $derived(snapshot?.validation.issues.length ?? 0);
	const badgeClass = (badge: string) =>
		badge === 'CANONICAL' ? 'border-[#7fae6b] text-[#a8d394]' : 'border-[#5c594c] text-[#d1cdb8]';
</script>

<!-- Documentation Corpus: server-rendered from DocCorpusStudioSnapshotV1; the search form is a plain GET so it works without JS. -->
<section id="docs-corpus" class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/40 space-y-3" aria-labelledby="docs-corpus-title" data-testid="docs-corpus-panel">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 id="docs-corpus-title" class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider">// Documentation Corpus</h3>
			<p class="mt-1 text-[0.62rem] text-[#5c594c] leading-relaxed">Canonical owner: PostgreSQL <code>atlas_external_doc_*</code>. Local captures are reference-only.</p>
		</div>
		<span class="px-2 py-1 border border-[#5c594c] bg-[#1c1b18] text-[0.6rem] font-bold uppercase tracking-wider text-[#d1cdb8]" data-testid="docs-corpus-status">
			{snapshot ? `${snapshot.validation.status} · PG ${snapshot.postgresCorpus.status}` : 'SNAPSHOT_UNAVAILABLE'}
		</span>
	</div>

	{#if snapshot}
		<dl class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[0.62rem]">
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">Drizzle ORM / Kit</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.runtimeVersions.drizzleOrm ?? '—'} / {snapshot.runtimeVersions.drizzleKit ?? '—'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">PostgreSQL</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.runtimeVersions.postgres?.split(' ')[0] ?? '—'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">pgvector</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.runtimeVersions.pgvector ?? '—'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">Last local capture</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.localCorpus.capturedAt?.slice(0, 10) ?? '—'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">Postgres pages / chunks</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.postgresCorpus.pageCount ?? '—'} / {snapshot.postgresCorpus.chunkCount ?? '—'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">AIO mode</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.capabilities.aio.ioMethod ?? '—'} · pg_aios {snapshot.capabilities.aio.pgAiosAvailable ? 'yes' : 'no'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">Bitmap capability</dt><dd class="mt-1 text-[#efede4] font-mono">can {snapshot.capabilities.bitmap.plannerCanGenerateBitmap ? 'yes' : 'no'} · picked {snapshot.capabilities.bitmap.plannerSelectedBitmap ? 'yes' : 'no'}</dd></div>
			<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2"><dt class="text-[#a39f90] font-bold uppercase">halfvec / HNSW / FTS</dt><dd class="mt-1 text-[#efede4] font-mono">{snapshot.capabilities.halfvec ? 'yes' : 'no'} / {snapshot.capabilities.hnsw ? 'yes' : 'no'} / {snapshot.postgresCorpus.ftsAvailable ? 'yes' : 'no'}</dd></div>
		</dl>

		<table class="w-full text-[0.62rem] text-left" aria-label="Pinned source freshness">
			<thead class="text-[#a39f90] uppercase"><tr><th class="py-1">Source</th><th>Status</th><th>Version qualification</th><th>Runtime</th><th>Captures</th></tr></thead>
			<tbody class="text-[#d1cdb8] font-mono">
				{#each snapshot.coverage as row (row.group)}
					<tr class="border-t border-[#3f3e37]"><td class="py-1">{row.group}</td><td>{row.status}</td><td>{row.bestQualification ?? '—'}</td><td>{row.runtimeCompatibility}</td><td>{row.captures}</td></tr>
				{/each}
			</tbody>
		</table>

		{#if issueCount > 0}
			<details class="text-[0.62rem] text-[#d1cdb8]">
				<summary class="cursor-pointer">{issueCount} validation issue{issueCount === 1 ? '' : 's'}</summary>
				<ul class="mt-1 list-disc pl-4 font-mono">
					{#each snapshot.validation.issues as issue (issue.code + issue.detail)}<li>{issue.code}: {issue.detail}</li>{/each}
				</ul>
			</details>
		{/if}
	{:else}
		<p class="text-[0.62rem] text-[#a39f90]" data-testid="docs-corpus-unavailable">The documentation corpus snapshot could not be loaded.</p>
	{/if}

	<form method="GET" action="/admin/atlas#docs-corpus" class="flex gap-2" role="search">
		<input type="search" name="docq" value={query} minlength="2" maxlength="300" placeholder="Search docs: halfvec, io_method, bitmap heap…" aria-label="Search documentation corpus" class="flex-1 px-2 py-1 bg-[#23221c] border border-[#5c594c] text-[0.7rem] text-[#efede4]" />
		<button type="submit" class="px-3 py-1 border border-[#5c594c] text-[0.6rem] font-bold uppercase text-[#d1cdb8]">Search</button>
	</form>

	{#if search}
		<p class="text-[0.6rem] text-[#a39f90]" data-testid="docs-search-mode">
			{search.hits.length} result{search.hits.length === 1 ? '' : 's'} for “{search.query}” · {search.mode}{search.postgresNote ? ` · ${search.postgresNote}` : ''}
		</p>
		<ul class="space-y-2" data-testid="docs-search-results">
			{#each search.hits as hit (hit.url + hit.excerpt.slice(0, 40))}
				<li class="border border-[#3f3e37] bg-[#23221c] px-3 py-2 text-[0.62rem]">
					<div class="flex flex-wrap items-center gap-2">
						<strong class="text-[#efede4]">{hit.title}</strong>
						<span class="px-1.5 py-0.5 border text-[0.55rem] font-bold uppercase {badgeClass(hit.badge)}">{hit.badge}</span>
						<span class="text-[#a39f90] font-mono">{hit.sourceId}{hit.productVersion ? ` @ ${hit.productVersion}` : ''} · {hit.authorityClass}{hit.revision ? ` · ${hit.revision}` : ''}</span>
					</div>
					<p class="mt-1 text-[#d1cdb8] leading-relaxed">{hit.excerpt}</p>
					{#if hit.url}<a href={hit.url} class="text-[#a39f90] underline break-all" rel="noreferrer noopener">{hit.url}</a>{/if}
				</li>
			{:else}
				<li class="text-[#a39f90]">No matching documentation.</li>
			{/each}
		</ul>
	{/if}
</section>
