<!-- EvidenceImageSearch.svelte
     Drop an image → Gemma4 VLM caption → embeddinggemma → Qdrant ANN → ranked results
     Thumbs up/down tags Qdrant payload + fires GRPO reward signal.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface SearchHit {
		id: string | number;
		score: number;
		rawScore: number;
		tagBoost: number;
		payload: Record<string, unknown>;
		matchedTags: string[];
	}

	interface Props {
		caseId?: string;
		collection?: string;
		onselect?: (hit: SearchHit) => void;
	}

	let { caseId, collection = 'evidence_items', onselect }: Props = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let dragOver    = $state(false);
	let searching   = $state(false);
	let imageFile   = $state<File | null>(null);
	let previewUrl  = $state<string | null>(null);
	let caption     = $state('');
	let tags        = $state<string[]>([]);
	let hits        = $state<SearchHit[]>([]);
	let durationMs  = $state(0);
	let model       = $state('');
	let errorMsg    = $state('');
	let feedback    = $state<Record<string, boolean | null>>({});
	let activeTag   = $state<string | null>(null);
	let inputEl     = $state<HTMLInputElement | undefined>(undefined);

	// ── Derived ────────────────────────────────────────────────────────────────
	let filteredHits = $derived(
		activeTag
			? hits.filter(h => (h.payload.tags as string[] ?? []).includes(activeTag!))
			: hits
	);

	// ── Image pick / drag-drop ─────────────────────────────────────────────────
	function pickFile(file: File) {
		if (!file.type.startsWith('image/')) {
			errorMsg = 'Please drop an image file (JPEG, PNG, WebP)';
			return;
		}
		imageFile  = file;
		previewUrl = URL.createObjectURL(file);
		errorMsg   = '';
		hits       = [];
		caption    = '';
		tags       = [];
		search();
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) pickFile(file);
	}

	function onInputChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) pickFile(file);
	}

	// ── Search ─────────────────────────────────────────────────────────────────
	async function search() {
		if (!imageFile) return;
		searching = true;
		errorMsg  = '';

		const form = new FormData();
		form.append('image', imageFile);
		if (caseId) form.append('caseId', caseId);

		const params = new URLSearchParams({ collection, limit: '10' });
		if (caseId) params.set('caseId', caseId);

		try {
			const res  = await fetch(`/api/evidence/search-by-image?${params}`, {
				method: 'POST',
				body:   form,
			});
			const data = await res.json() as {
				hits?: SearchHit[];
				results?: SearchHit[];
				caption?: string;
				description?: string;
				suggestedTags?: string[];
				imageTags?: string[];
				model?: string;
				durationMs?: number;
				error?: string;
			};

			if (!res.ok) {
				errorMsg = data.error ?? `Search failed (${res.status})`;
				return;
			}

			// Support both image-search.ts shape (hits) and existing +server.ts shape (results)
			hits      = data.hits ?? (data.results as SearchHit[] | undefined) ?? [];
			caption   = data.caption ?? data.description ?? '';
			tags      = data.suggestedTags ?? data.imageTags ?? [];
			model     = data.model ?? '';
			durationMs = data.durationMs ?? 0;
			feedback  = {};
		} catch (e) {
			errorMsg = String(e);
		} finally {
			searching = false;
		}
	}

	// ── Feedback ───────────────────────────────────────────────────────────────
	async function sendFeedback(hit: SearchHit, approved: boolean) {
		feedback = { ...feedback, [String(hit.id)]: approved };
		await fetch('/api/evidence/search-by-image/feedback', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({
				pointId:    hit.id,
				collection,
				approved,
				query:      caption,
			}),
		}).catch(() => {});
	}

	// ── Helpers ────────────────────────────────────────────────────────────────
	function scoreColor(s: number) {
		if (s >= 0.75) return 'text-green-400';
		if (s >= 0.50) return 'text-yellow-400';
		return 'text-orange-400';
	}

	function formatScore(s: number) {
		return (s * 100).toFixed(1) + '%';
	}

	function payloadTitle(p: Record<string, unknown>): string {
		return String(p.title ?? p.fileName ?? p.name ?? p.id ?? 'Evidence');
	}

	function payloadType(p: Record<string, unknown>): string {
		return String(p.evidenceType ?? p.type ?? '');
	}

	function payloadDate(p: Record<string, unknown>): string {
		const d = p.createdAt ?? p.uploadedAt ?? p.date;
		if (!d) return '';
		try { return new Date(String(d)).toLocaleDateString(); } catch { return ''; }
	}
</script>

<div class="flex flex-col gap-4 w-full">

	<!-- Drop zone -->
	<div
		role="button"
		tabindex="0"
		aria-label="Drop image to search"
		class="relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors min-h-[160px]
		       {dragOver ? 'border-accent bg-accent/10' : 'border-panel hover:border-accent/60'}"
		ondragover={(e) => { e.preventDefault(); dragOver = true; }}
		ondragleave={() => { dragOver = false; }}
		ondrop={onDrop}
		onclick={() => inputEl?.click()}
		onkeydown={(e) => e.key === 'Enter' && inputEl?.click()}
	>
		<input
			bind:this={inputEl}
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			class="sr-only"
			onchange={onInputChange}
		/>

		{#if previewUrl}
			<img
				src={previewUrl}
				alt="Search preview"
				class="max-h-32 max-w-full rounded object-contain"
			/>
			{#if !searching}
				<span class="text-xs text-gray-400">Drop a new image to replace</span>
			{/if}
		{:else}
			<Icon name="image" class="w-10 h-10 text-gray-500" />
			<p class="text-sm text-gray-400 text-center">
				Drop an image or <span class="text-accent underline">browse</span><br />
				<span class="text-xs text-gray-500">Gemma4 VLM → embeddinggemma → Qdrant</span>
			</p>
		{/if}

		{#if searching}
			<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-app-bg/70 backdrop-blur-sm">
				<div class="flex flex-col items-center gap-2">
					<div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
					<span class="text-xs text-gray-400">Captioning + searching…</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Error -->
	{#if errorMsg}
		<p class="text-sm text-red-400 flex items-center gap-1">
			<Icon name="alert-circle" class="w-4 h-4" />
			{errorMsg}
		</p>
	{/if}

	<!-- Caption + tags -->
	{#if caption}
		<div class="rounded-md bg-panel p-3 text-sm space-y-2">
			<div class="flex items-start gap-2">
				<Icon name="eye" class="w-4 h-4 text-accent mt-0.5 shrink-0" />
				<p class="text-gray-300 leading-snug">{caption}</p>
			</div>
			{#if tags.length}
				<div class="flex flex-wrap gap-1 pt-1">
					{#each tags as tag}
						<button
							class="px-2 py-0.5 rounded text-xs border transition-colors
							       {activeTag === tag
							         ? 'bg-accent text-white border-accent'
							         : 'border-panel text-gray-400 hover:border-accent/60'}"
							onclick={() => { activeTag = activeTag === tag ? null : tag; }}
						>
							{tag}
						</button>
					{/each}
					{#if activeTag}
						<button
							class="px-2 py-0.5 rounded text-xs text-gray-500 hover:text-gray-300"
							onclick={() => { activeTag = null; }}
						>
							✕ clear
						</button>
					{/if}
				</div>
			{/if}
			<div class="flex items-center gap-3 text-xs text-gray-500 pt-1 border-t border-panel">
				<span>{hits.length} results</span>
				{#if durationMs}<span>{durationMs}ms</span>{/if}
				{#if model}<span class="truncate max-w-[140px]">{model}</span>{/if}
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if filteredHits.length}
		<div class="grid grid-cols-1 gap-2">
			{#each filteredHits as hit (hit.id)}
				{@const fb = feedback[String(hit.id)]}
				<div
					role="button"
					tabindex="0"
					class="panel rounded-lg p-3 flex gap-3 items-start hover:bg-panel/60 transition-colors cursor-pointer
					       {fb === false ? 'opacity-40' : ''}"
					onclick={() => { if (fb !== false) onselect?.(hit); }}
					onkeydown={(e) => e.key === 'Enter' && fb !== false && onselect?.(hit)}
				>
					<!-- Score badge -->
					<div class="shrink-0 w-12 text-center">
						<span class="text-lg font-mono font-bold {scoreColor(hit.score)}">
							{formatScore(hit.score)}
						</span>
						{#if hit.tagBoost > 0}
							<div class="text-xs text-accent">+tag</div>
						{/if}
					</div>

					<!-- Payload info -->
					<div class="flex-1 min-w-0 space-y-1">
						<p class="text-sm font-medium text-gray-200 truncate">{payloadTitle(hit.payload)}</p>
						<div class="flex items-center gap-2 flex-wrap">
							{#if payloadType(hit.payload)}
								<Badge variant="secondary" class="text-xs">{payloadType(hit.payload)}</Badge>
							{/if}
							{#if payloadDate(hit.payload)}
								<span class="text-xs text-gray-500">{payloadDate(hit.payload)}</span>
							{/if}
						</div>
						{#if hit.matchedTags.length}
							<div class="flex gap-1 flex-wrap">
								{#each hit.matchedTags.slice(0, 4) as t}
									<span class="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">{t}</span>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Feedback buttons -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div class="shrink-0 flex gap-1" onclick={(e) => e.stopPropagation()} role="group" aria-label="Feedback">
						<button
							class="p-1.5 rounded hover:bg-green-500/20 transition-colors {fb === true ? 'text-green-400' : 'text-gray-500'}"
							title="Relevant result"
							onclick={() => sendFeedback(hit, true)}
						>
							<Icon name="thumbs-up" class="w-4 h-4" />
						</button>
						<button
							class="p-1.5 rounded hover:bg-red-500/20 transition-colors {fb === false ? 'text-red-400' : 'text-gray-500'}"
							title="Not relevant"
							onclick={() => sendFeedback(hit, false)}
						>
							<Icon name="thumbs-down" class="w-4 h-4" />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{:else if caption && !searching}
		<p class="text-sm text-gray-500 text-center py-4">No matches found{activeTag ? ` for tag "${activeTag}"` : ''}.</p>
	{/if}

</div>
