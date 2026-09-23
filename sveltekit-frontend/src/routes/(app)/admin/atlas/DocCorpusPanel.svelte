<script lang="ts">
	import type { DocIntelligenceStudioSnapshotV1, DocSearchResult } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';

	let {
		snapshot = null,
		search = null,
		query = ''
	}: { snapshot?: DocIntelligenceStudioSnapshotV1 | null; search?: DocSearchResult | null; query?: string } = $props();

	const issueCount = $derived(snapshot?.issues.length ?? 0);
	const yes = (value: boolean | null | undefined) => (value ? 'yes' : 'no');
	const badgeClass = (badge: string) =>
		badge === 'CANONICAL_POSTGRES' ? 'border-[#7fae6b] text-[#a8d394]' : 'border-[#5c594c] text-[#d1cdb8]';
	const cell = 'border border-[#3f3e37] bg-[#23221c] px-3 py-2';
	const label = 'text-[#a39f90] font-bold uppercase';
	const value = 'mt-1 text-[#efede4] font-mono';
</script>

<!-- Documentation Intelligence: server-rendered from DocIntelligenceStudioSnapshotV1; every section is native <details> and the search form is a plain GET, so it all works without JS. -->
<section id="docs-corpus" class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/40 space-y-3" aria-labelledby="docs-corpus-title" data-testid="docs-corpus-panel">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 id="docs-corpus-title" class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider">// Documentation Intelligence</h3>
			<p class="mt-1 text-[0.62rem] text-[#5c594c] leading-relaxed">Canonical owner: PostgreSQL <code>atlas_external_doc_*</code>. Local captures are reference-only and are never shown as admitted.</p>
		</div>
		<span class="px-2 py-1 border border-[#5c594c] bg-[#1c1b18] text-[0.6rem] font-bold uppercase tracking-wider text-[#d1cdb8]" data-testid="docs-corpus-status">
			{snapshot ? `${snapshot.validation.status} · PG ${snapshot.canonicalCorpus.status}` : 'SNAPSHOT_UNAVAILABLE'}
		</span>
	</div>

	{#if snapshot}
		<details open class="text-[0.62rem]" data-testid="docs-overview">
			<summary class="cursor-pointer text-[#a39f90] font-bold uppercase">Overview</summary>
			<dl class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
				<div class={cell}><dt class={label}>Manifest sources</dt><dd class={value}>{snapshot.manifestSources.length}</dd></div>
				<div class={cell}><dt class={label}>Local pages · {snapshot.localCorpus.authority}</dt><dd class={value}>{snapshot.localCorpus.pageCount}</dd></div>
				<div class={cell}><dt class={label}>Admitted pages / chunks · {snapshot.canonicalCorpus.authority}</dt><dd class={value}>{snapshot.canonicalCorpus.pageCount ?? '—'} / {snapshot.canonicalCorpus.chunkCount ?? '—'}</dd></div>
				<div class={cell}><dt class={label}>Last local capture</dt><dd class={value}>{snapshot.localCorpus.capturedAt?.slice(0, 10) ?? '—'}</dd></div>
			</dl>
			{#if snapshot.canonicalCorpus.status !== 'PRESENT'}
				<p class="mt-2 text-[#d8b26a]" data-testid="docs-canonical-note">Canonical corpus is {snapshot.canonicalCorpus.status}: no page shown here has been admitted to PostgreSQL.</p>
			{/if}
		</details>

		<details open class="text-[0.62rem]" data-testid="docs-versions">
			<summary class="cursor-pointer text-[#a39f90] font-bold uppercase">Versions &amp; freshness</summary>
			<dl class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
				<div class={cell}><dt class={label}>SvelteKit / Svelte</dt><dd class={value}>{snapshot.runtimeVersions.svelteKit ?? '—'} / {snapshot.runtimeVersions.svelte ?? '—'}</dd></div>
				<div class={cell}><dt class={label}>Bits UI</dt><dd class={value}>{snapshot.runtimeVersions.bitsUi ?? '—'}</dd></div>
				<div class={cell}><dt class={label}>Drizzle ORM / Kit</dt><dd class={value}>{snapshot.runtimeVersions.drizzleOrm ?? '—'} / {snapshot.runtimeVersions.drizzleKit ?? '—'}</dd></div>
				<div class={cell}><dt class={label}>PostgreSQL / pgvector</dt><dd class={value}>{snapshot.runtimeVersions.postgres?.split(' ')[0] ?? '—'} / {snapshot.runtimeVersions.pgvector ?? '—'}</dd></div>
			</dl>
			<table class="mt-2 w-full text-left" aria-label="Documentation freshness against runtime versions">
				<thead class="text-[#a39f90] uppercase"><tr><th class="py-1">Source</th><th>Runtime</th><th>Doc version</th><th>Qualification</th><th>Status</th><th>Pages</th></tr></thead>
				<tbody class="text-[#d1cdb8] font-mono">
					{#each snapshot.versionDrift as row (row.sourceId)}
						<tr class="border-t border-[#3f3e37]"><td class="py-1">{row.sourceId}</td><td>{row.runtimeVersion ?? '—'}</td><td>{row.capturedDocVersion ?? '—'}</td><td>{row.qualification}</td><td>{row.status}</td><td>{row.pages}</td></tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-1 text-[#5c594c]">Advisory only: dependencies are never changed to match documentation.</p>
		</details>

		<details open class="text-[0.62rem]" data-testid="docs-database">
			<summary class="cursor-pointer text-[#a39f90] font-bold uppercase">Database capability</summary>
			<dl class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
				<div class={cell}><dt class={label}>FTS / GIN</dt><dd class={value}>{yes(snapshot.ftsCapability.available)} · {snapshot.ftsCapability.ginIndexes.length} GIN{snapshot.ftsCapability.searchVectorGenerated ? ' · generated tsvector' : ''}</dd></div>
				<div class={cell}><dt class={label}>Vector / HNSW</dt><dd class={value}>{snapshot.vectorCapability.columnType ?? '—'} · hnsw {yes(snapshot.vectorCapability.hnswIndex)}{snapshot.vectorCapability.opclass ? ` (${snapshot.vectorCapability.opclass})` : ''} · halfvec {yes(snapshot.vectorCapability.halfvecType)}</dd></div>
				<div class={cell}><dt class={label}>AIO · {snapshot.aioCapability.level}</dt><dd class={value}>io_method {snapshot.aioCapability.ioMethod ?? '—'} · pg_aios {yes(snapshot.aioCapability.pgAiosAvailable)} · io conc {snapshot.aioCapability.effectiveIoConcurrency ?? '—'}/{snapshot.aioCapability.maintenanceIoConcurrency ?? '—'}</dd></div>
				<div class={cell}><dt class={label}>Bitmap scans</dt><dd class={value}>CAPABILITY {yes(snapshot.bitmapCapability.capability)} · PLANNER_SELECTED {yes(snapshot.bitmapCapability.plannerSelected)} · PRODUCTION_OBSERVED {snapshot.bitmapCapability.productionObserved}</dd></div>
			</dl>
			<p class="mt-1 text-[#5c594c]">Capability is not proof that any production query used AIO or a bitmap scan.</p>
		</details>

		<details open class="text-[0.62rem]" data-testid="docs-analysis">
			<summary class="cursor-pointer text-[#a39f90] font-bold uppercase">Analysis readiness</summary>
			<dl class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
				<div class={cell}><dt class={label}>ast-grep / symbols · {snapshot.symbolIndexStatus.authority}</dt><dd class={value}>{snapshot.symbolIndexStatus.result === 'AST_GREP_DOC_SYMBOL_MAPPING_PROVEN' ? 'PROVEN' : 'INCOMPLETE'} · {snapshot.symbolIndexStatus.symbols ?? '—'} symbols</dd></div>
				<div class={cell}><dt class={label}>LangExtract · {snapshot.langExtractStatus.authority}</dt><dd class={value}>{snapshot.langExtractStatus.result === 'LANGEXTRACT_DOC_EVIDENCE_JOIN_READY' ? 'JOIN READY' : 'JOIN BLOCKED'} · {snapshot.langExtractStatus.documents} docs</dd></div>
				<div class={cell}><dt class={label}>Analysis contract · {snapshot.analysisStatus.authority}</dt><dd class={value}>{snapshot.analysisStatus.result === 'EXTERNAL_DOC_ANALYSIS_CONTRACT_READY' ? 'READY' : 'INVALID'} · Ornith {snapshot.analysisStatus.ornithSummary}</dd></div>
				<div class={cell}><dt class={label}>DOC-06A handoff</dt><dd class={value}>{snapshot.admissionHandoff ? snapshot.admissionHandoff.result : 'NO_REPORT'}</dd></div>
			</dl>
			{#if snapshot.admissionHandoff && snapshot.admissionHandoff.blockers.length}
				<ul class="mt-1 list-disc pl-4 font-mono text-[#d1cdb8]">
					{#each snapshot.admissionHandoff.blockers as blocker (blocker.code)}<li>{blocker.code}{blocker.count ? ` ×${blocker.count}` : ''}</li>{/each}
				</ul>
			{/if}
		</details>

		{#if issueCount > 0}
			<details class="text-[0.62rem] text-[#d1cdb8]">
				<summary class="cursor-pointer">{issueCount} validation issue{issueCount === 1 ? '' : 's'}</summary>
				<ul class="mt-1 list-disc pl-4 font-mono">
					{#each snapshot.issues as issue (issue.code + issue.detail)}<li>{issue.code}: {issue.detail}</li>{/each}
				</ul>
			</details>
		{/if}
	{:else}
		<p class="text-[0.62rem] text-[#a39f90]" data-testid="docs-corpus-unavailable">The documentation intelligence snapshot could not be loaded.</p>
	{/if}

	<form method="GET" action="/admin/atlas#docs-corpus" class="flex gap-2" role="search">
		<input type="search" name="docq" value={query} minlength="2" maxlength="300" placeholder="Search docs: halfvec, io_method, bitmap heap…" aria-label="Search documentation corpus" class="flex-1 px-2 py-1 bg-[#23221c] border border-[#5c594c] text-[0.7rem] text-[#efede4]" />
		<button type="submit" class="px-3 py-1 border border-[#5c594c] text-[0.6rem] font-bold uppercase text-[#d1cdb8]">Search</button>
	</form>

	{#if search}
		<p class="text-[0.6rem] text-[#a39f90]" data-testid="docs-search-mode">
			{search.hits.length} result{search.hits.length === 1 ? '' : 's'} for “{search.query}” · {search.mode}{search.postgresNote ? ` · ${search.postgresNote}` : ''}{search.mode === 'LOCAL_LEXICAL' ? ' · NONCANONICAL' : ''}
		</p>
		<ul class="space-y-2" data-testid="docs-search-results">
			{#each search.hits as hit (hit.url + hit.excerpt.slice(0, 40))}
				<li class="border border-[#3f3e37] bg-[#23221c] px-3 py-2 text-[0.62rem]">
					<div class="flex flex-wrap items-center gap-2">
						<strong class="text-[#efede4]">{hit.title}</strong>
						<span class="px-1.5 py-0.5 border text-[0.55rem] font-bold uppercase {badgeClass(hit.badge)}">{hit.badge}</span>
						<span class="text-[#a39f90] font-mono">{hit.provider ?? '—'} / {hit.product ?? hit.sourceId}{hit.productVersion ? ` @ ${hit.productVersion}` : ''} · {hit.authorityClass}{hit.revision ? ` · ${hit.revision}` : ''}</span>
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
