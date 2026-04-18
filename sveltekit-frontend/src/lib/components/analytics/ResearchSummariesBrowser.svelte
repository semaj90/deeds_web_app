<script lang="ts">
/**
 * ResearchSummariesBrowser — unified paginated browser for all research_summaries content.
 *
 * Features:
 *  - Filter bar: source chips, pipeline, entity tags, sort, page size
 *  - Cursor-based (keyset) pagination — O(1) per page, no OFFSET
 *  - "Did You Mean" suggestions from pg_trgm (top 100, own pagination)
 *  - Fuse.js instant top-3-5 hits from current page (no extra fetch)
 *  - Page state cached server-side in Redis (30 min per user+filter fingerprint)
 *  - Reset to page 1 when any filter changes
 *  - "Save as Citation" — promotes a summary to the citations table
 *  - "Related" panel — HNSW nearest-neighbor from pgvector embedding
 */
import Fuse from 'fuse.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
	id:              string;
	source:          string;
	pipeline:        string;
	entityType:      string;
	query:           string;
	title:           string | null;
	url:             string | null;
	collection:      string | null;
	citationLabel:   string | null;
	summary:         string;
	entityTags:      string[];
	relevanceScore:  number;
	savedCitationId: string | null;
	createdAt:       string;
}

interface FuseEntry { id: string; title: string; query: string; tags: string }

interface BrowsePage {
	summaries:   Summary[];
	nextCursor:  string | null;
	prevCursor:  string | null;
	total:       number;
	page:        number;
	totalPages:  number;
	didYouMean:  string[];
	fuseIndex:   FuseEntry[];
	topTags:     string[];
}

// ── State ─────────────────────────────────────────────────────────────────────

const SOURCES   = ['all', 'web', 'corpus', 'document', 'image', 'video', 'report', 'note', 'case'];
const PIPELINES = ['all', 'ace', 'rag', 'kag', 'dag', 'codebase'];
const PAGE_SIZES = [10, 25, 50, 100];

let source    = $state('all');
let pipeline  = $state('all');
let sortBy    = $state<'relevance' | 'date'>('relevance');
let limit     = $state(25);
let query     = $state('');
let activeTags = $state<string[]>([]);

// Response state
let data      = $state<BrowsePage | null>(null);
let loading   = $state(false);
let error     = $state('');

// Fuse.js
let fuse      = $state<Fuse<FuseEntry> | null>(null);
let fuseHits  = $state<FuseEntry[]>([]);
let fuseQuery = $state('');

// DYM
let dymQuery  = $state('');
let dymOpen   = $state(false);

// Pagination cursor
let cursor    = $state<string | null>(null);

// Tag autocomplete
let tagInput  = $state('');
let allTags   = $state<string[]>([]);

// Save-as-citation per-card state
let savingId   = $state<string | null>(null);  // ID currently being saved
let savedIds   = $state<Record<string, string>>({}); // summaryId → citationId

// Related-panel per-card state
let relatedOpenId   = $state<string | null>(null);
let relatedLoading  = $state(false);
let relatedItems    = $state<Summary[]>([]);

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPage(newCursor: string | null = null) {
	loading = true;
	error   = '';
	try {
		const params = new URLSearchParams({
			source,
			pipeline,
			sortBy,
			limit: String(limit),
			...(query         && { query }),
			...(activeTags.length && { tags: activeTags.join(',') }),
			...(newCursor     && { cursor: newCursor }),
		});
		const res = await fetch(`/api/analytics/research-summaries?${params}`);
		if (!res.ok) throw new Error(await res.text());
		data   = await res.json() as BrowsePage;
		// Rebuild Fuse.js index from current page
		if (data.fuseIndex.length) {
			fuse = new Fuse(data.fuseIndex, {
				keys: ['title', 'query', 'tags'],
				threshold: 0.35,
				minMatchCharLength: 2,
			});
		}
		// Populate tag list first time
		if (!allTags.length && data.topTags.length) allTags = data.topTags;
	} catch (e) {
		error = (e as Error).message;
	} finally {
		loading = false;
	}
}

// Reset to page 1 whenever a filter changes
function resetAndFetch() {
	cursor = null;
	fetchPage(null);
}

$effect(() => { fetchPage(); });

// Fuse.js real-time search on current page
$effect(() => {
	if (!fuseQuery || !fuse) { fuseHits = []; return; }
	fuseHits = fuse.search(fuseQuery).slice(0, 5).map(r => r.item);
});

// Scroll highlighted card into view
function scrollToHit(id: string) {
	document.getElementById(`rs-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// DYM select
function applyDym(suggestion: string) {
	query   = suggestion;
	dymOpen = false;
	resetAndFetch();
}

function toggleTag(tag: string) {
	activeTags = activeTags.includes(tag)
		? activeTags.filter(t => t !== tag)
		: [...activeTags, tag];
	resetAndFetch();
}

// ── Save as Citation ──────────────────────────────────────────────────────────

async function saveAsCitation(row: Summary) {
	if (savingId === row.id) return;
	savingId = row.id;
	try {
		const res = await fetch('/api/analytics/research-summaries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'save_citation', summaryId: row.id }),
		});
		if (!res.ok) throw new Error(await res.text());
		const json = await res.json() as { citationId: string };
		savedIds = { ...savedIds, [row.id]: json.citationId };
		// Patch local page data so button updates immediately
		if (data) {
			data = {
				...data,
				summaries: data.summaries.map(s =>
					s.id === row.id ? { ...s, savedCitationId: json.citationId } : s
				),
			};
		}
	} catch { /* non-fatal */ } finally {
		savingId = null;
	}
}

// ── Related panel (HNSW nearest-neighbor) ────────────────────────────────────

async function toggleRelated(id: string) {
	if (relatedOpenId === id) {
		relatedOpenId = null;
		relatedItems  = [];
		return;
	}
	relatedOpenId  = id;
	relatedItems   = [];
	relatedLoading = true;
	try {
		const res = await fetch(`/api/analytics/research-summaries/${id}?mode=similar&limit=5`);
		if (!res.ok) throw new Error(await res.text());
		const json = await res.json() as { similar: Summary[] };
		relatedItems = json.similar ?? [];
	} catch {
		relatedItems = [];
	} finally {
		relatedLoading = false;
	}
}

const SOURCE_COLORS: Record<string, string> = {
	web:      'bg-blue-100 text-blue-800',
	corpus:   'bg-purple-100 text-purple-800',
	document: 'bg-amber-100 text-amber-800',
	image:    'bg-green-100 text-green-800',
	video:    'bg-red-100 text-red-800',
	report:   'bg-indigo-100 text-indigo-800',
	note:     'bg-teal-100 text-teal-800',
	case:     'bg-orange-100 text-orange-800',
};

function scoreBar(score: number) {
	return `${Math.round(score * 100)}%`;
}
</script>

<div class="flex flex-col gap-4 min-h-0">

	<!-- ── Filter bar ──────────────────────────────────────────────────────── -->
	<div class="bg-panel border border-panel-soft rounded-lg p-3 flex flex-col gap-3">

		<!-- Row 1: source chips + pipeline + sort + page size -->
		<div class="flex flex-wrap items-center gap-2">

			<!-- Source chips -->
			{#each SOURCES as s}
				<button
					class="px-2 py-0.5 rounded-full text-xs font-medium border transition-colors
						{source === s
							? 'bg-accent text-white border-accent'
							: 'border-panel-soft text-sand-11 hover:border-accent hover:text-accent'}"
					onclick={() => { source = s; resetAndFetch(); }}
				>{s}</button>
			{/each}

			<div class="w-px h-4 bg-panel-soft mx-1"></div>

			<!-- Pipeline -->
			<select
				class="text-xs bg-panel border border-panel-soft rounded px-2 py-0.5 text-sand-12"
				bind:value={pipeline}
				onchange={resetAndFetch}
			>
				{#each PIPELINES as p}<option value={p}>{p}</option>{/each}
			</select>

			<!-- Sort -->
			<select
				class="text-xs bg-panel border border-panel-soft rounded px-2 py-0.5 text-sand-12"
				bind:value={sortBy}
				onchange={resetAndFetch}
			>
				<option value="relevance">By relevance</option>
				<option value="date">By date</option>
			</select>

			<!-- Page size -->
			<select
				class="text-xs bg-panel border border-panel-soft rounded px-2 py-0.5 text-sand-12"
				bind:value={limit}
				onchange={resetAndFetch}
			>
				{#each PAGE_SIZES as n}<option value={n}>{n} / page</option>{/each}
			</select>
		</div>

		<!-- Row 2: Fuse search | DYM query | active tag chips -->
		<div class="flex flex-wrap items-center gap-2">

			<!-- Fuse.js instant search (client-side, current page only) -->
			<div class="relative">
				<input
					class="text-xs bg-app-bg border border-panel-soft rounded px-2 py-1 w-44 text-sand-12 placeholder-sand-9"
					placeholder="Quick find (this page)"
					bind:value={fuseQuery}
				/>
				{#if fuseHits.length}
					<div class="absolute top-full left-0 z-20 mt-1 w-72 bg-panel border border-panel-soft rounded shadow-lg">
						{#each fuseHits as hit}
							<button
								class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 truncate"
								onclick={() => scrollToHit(hit.id)}
							>{hit.title}</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- DYM full-text query (server pg_trgm) -->
			<div class="relative">
				<input
					class="text-xs bg-app-bg border border-panel-soft rounded px-2 py-1 w-52 text-sand-12 placeholder-sand-9"
					placeholder="Did you mean… (search)"
					bind:value={dymQuery}
					onfocus={() => { dymOpen = true; if (dymQuery !== query) { query = dymQuery; resetAndFetch(); } }}
					onblur={() => setTimeout(() => { dymOpen = false; }, 150)}
					oninput={() => { query = dymQuery; resetAndFetch(); }}
				/>
				{#if dymOpen && data?.didYouMean?.length}
					<div class="absolute top-full left-0 z-20 mt-1 w-72 bg-panel border border-panel-soft rounded shadow-lg max-h-52 overflow-y-auto">
						<p class="px-3 py-1 text-xs text-sand-9 font-medium uppercase tracking-wide">Did you mean?</p>
						{#each data.didYouMean as s}
							<button
								class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 truncate"
								onclick={() => applyDym(s)}
							>{s}</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Active tag chips -->
			{#each activeTags as tag}
				<button
					class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"
					onclick={() => toggleTag(tag)}
				>{tag} <span class="opacity-60">×</span></button>
			{/each}

			<!-- Tag autocomplete -->
			{#if allTags.length}
				<div class="relative">
					<input
						class="text-xs bg-app-bg border border-panel-soft rounded px-2 py-1 w-32 text-sand-12 placeholder-sand-9"
						placeholder="+ tag filter"
						bind:value={tagInput}
					/>
					{#if tagInput}
						<div class="absolute top-full left-0 z-20 mt-1 w-48 bg-panel border border-panel-soft rounded shadow-lg max-h-40 overflow-y-auto">
							{#each allTags.filter(t => t.includes(tagInput) && !activeTags.includes(t)).slice(0, 10) as t}
								<button
									class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10"
									onclick={() => { toggleTag(t); tagInput = ''; }}
								>{t}</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- ── Pagination bar ─────────────────────────────────────────────────── -->
	{#if data}
		<div class="flex items-center justify-between text-xs text-sand-10">
			<span>
				{data.total.toLocaleString()} result{data.total !== 1 ? 's' : ''}
				&nbsp;·&nbsp;
				Page {data.page} of {data.totalPages}
			</span>
			<div class="flex items-center gap-2">
				<button
					class="px-2 py-0.5 rounded border border-panel-soft text-xs disabled:opacity-40 hover:border-accent hover:text-accent transition-colors"
					disabled={!data.prevCursor}
					onclick={() => fetchPage(data!.prevCursor)}
				>← Prev</button>
				<button
					class="px-2 py-0.5 rounded border border-panel-soft text-xs disabled:opacity-40 hover:border-accent hover:text-accent transition-colors"
					disabled={!data.nextCursor}
					onclick={() => fetchPage(data!.nextCursor)}
				>Next →</button>
			</div>
		</div>
	{/if}

	<!-- ── Results ────────────────────────────────────────────────────────── -->
	{#if loading}
		<div class="flex justify-center py-12">
			<span class="animate-spin i-lucide-loader-2 text-2xl text-accent"></span>
		</div>
	{:else if error}
		<div class="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
	{:else if data?.summaries.length === 0}
		<div class="text-center py-12 text-sand-9 text-sm">No summaries found. Try changing the filters or run a web crawl.</div>
	{:else if data}
		<div class="grid grid-cols-1 gap-3">
			{#each data.summaries as row (row.id)}
				<div
					id="rs-{row.id}"
					class="bg-panel border border-panel-soft rounded-lg p-4 flex flex-col gap-2
						{fuseHits.some(h => h.id === row.id) ? 'ring-2 ring-accent' : ''}"
				>
					<!-- Header -->
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-2 flex-wrap min-w-0">
							<span class="px-1.5 py-0.5 rounded text-xs font-medium {SOURCE_COLORS[row.source] ?? 'bg-sand-3 text-sand-11'}">
								{row.source}
							</span>
							<span class="text-xs text-sand-9 capitalize">{row.pipeline}</span>
							{#if row.citationLabel}
								<span class="text-xs text-sand-9 truncate">{row.citationLabel}</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<!-- Relevance bar -->
							<div class="flex items-center gap-1">
								<div class="w-16 h-1.5 rounded-full bg-panel-soft overflow-hidden">
									<div
										class="h-full rounded-full bg-accent"
										style="width: {scoreBar(row.relevanceScore)}"
									></div>
								</div>
								<span class="text-xs text-sand-9">{Math.round(row.relevanceScore * 100)}%</span>
							</div>

							<!-- Save as Citation -->
							{#if row.savedCitationId || savedIds[row.id]}
								<a
									href="/citations/{row.savedCitationId ?? savedIds[row.id]}"
									class="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 border border-green-200 hover:bg-green-200 transition-colors"
								>
									<span class="i-lucide-bookmark-check text-xs"></span>
									Saved
								</a>
							{:else}
								<button
									class="flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-panel-soft text-sand-10 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
									disabled={savingId === row.id}
									onclick={() => saveAsCitation(row)}
								>
									{#if savingId === row.id}
										<span class="animate-spin i-lucide-loader-2 text-xs"></span>
									{:else}
										<span class="i-lucide-bookmark text-xs"></span>
									{/if}
									Save citation
								</button>
							{/if}

							<!-- Related toggle -->
							<button
								class="flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors
									{relatedOpenId === row.id
										? 'border-accent text-accent bg-accent/5'
										: 'border-panel-soft text-sand-10 hover:border-accent hover:text-accent'}"
								onclick={() => toggleRelated(row.id)}
							>
								<span class="i-lucide-git-branch text-xs"></span>
								Related
							</button>
						</div>
					</div>

					<!-- Title / query -->
					<div class="flex flex-col gap-0.5">
						{#if row.title}
							<p class="font-medium text-sm text-sand-12 leading-snug">{row.title}</p>
						{/if}
						<p class="text-xs text-sand-9 truncate">
							{row.url
								? row.url.replace(/^https?:\/\//, '').slice(0, 80)
								: row.query.slice(0, 80)}
						</p>
					</div>

					<!-- Summary -->
					<p class="text-sm text-sand-11 leading-relaxed line-clamp-3">{row.summary}</p>

					<!-- Tags + date -->
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div class="flex flex-wrap gap-1">
							{#each row.entityTags.slice(0, 6) as tag}
								<button
									class="px-1.5 py-0.5 rounded text-xs bg-panel-soft text-sand-10 hover:bg-accent/10 hover:text-accent transition-colors"
									onclick={() => toggleTag(tag)}
								>{tag}</button>
							{/each}
						</div>
						<span class="text-xs text-sand-8 shrink-0">
							{new Date(row.createdAt).toLocaleDateString()}
						</span>
					</div>

					<!-- ── Related panel ────────────────────────────────────────────── -->
					{#if relatedOpenId === row.id}
						<div class="mt-1 border-t border-panel-soft pt-3 flex flex-col gap-2">
							<p class="text-xs font-medium text-sand-10 uppercase tracking-wide">Similar summaries (vector)</p>
							{#if relatedLoading}
								<div class="flex items-center gap-2 text-xs text-sand-9">
									<span class="animate-spin i-lucide-loader-2"></span>
									Searching HNSW index…
								</div>
							{:else if relatedItems.length === 0}
								<p class="text-xs text-sand-9">No similar summaries found (embedding may be missing).</p>
							{:else}
								{#each relatedItems as rel}
									<div class="flex items-start gap-2 p-2 rounded bg-panel-soft/50 border border-panel-soft">
										<span class="px-1 py-0.5 rounded text-xs font-medium shrink-0 {SOURCE_COLORS[rel.source] ?? 'bg-sand-3 text-sand-11'}">
											{rel.source}
										</span>
										<div class="flex flex-col gap-0.5 min-w-0 flex-1">
											<p class="text-xs font-medium text-sand-12 truncate">{rel.title ?? rel.query.slice(0, 60)}</p>
											<p class="text-xs text-sand-10 line-clamp-2">{rel.summary}</p>
										</div>
										<button
											class="shrink-0 text-xs text-sand-9 hover:text-accent transition-colors"
											onclick={() => scrollToHit(rel.id)}
										>↑ jump</button>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── Bottom pagination ──────────────────────────────────────────────── -->
	{#if data && (data.nextCursor || data.prevCursor)}
		<div class="flex items-center justify-center gap-4 pt-2">
			<button
				class="px-3 py-1 rounded border border-panel-soft text-xs disabled:opacity-40 hover:border-accent hover:text-accent transition-colors"
				disabled={!data.prevCursor}
				onclick={() => fetchPage(data!.prevCursor)}
			>← Previous page</button>
			<span class="text-xs text-sand-9">Page {data.page} / {data.totalPages}</span>
			<button
				class="px-3 py-1 rounded border border-panel-soft text-xs disabled:opacity-40 hover:border-accent hover:text-accent transition-colors"
				disabled={!data.nextCursor}
				onclick={() => fetchPage(data!.nextCursor)}
			>Next page →</button>
		</div>
	{/if}
</div>
