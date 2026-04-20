<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export const ssr = false;

	// ── Types ────────────────────────────────────────────────────────────────

	interface PoiPhoto {
		id: string;
		thumbnailUrl: string | null;
		caption: string | null;
		uploadedAt: string;
		faceEmbedding: unknown;
	}

	interface PoiEntry {
		id: string;
		name: string | null;
		status: string | null;
		threatLevel: string | null;
		photos: PoiPhoto[];
		selected: boolean;
	}

	interface RerankResult {
		poiId: string;
		name: string;
		status: string | null;
		threatLevel: string | null;
		thumbnailUrl: string | null;
		pass1Score: number;
		pass2Score: number;
		pass2Reasoning: string;
		grpoReward: number;
		hasEmbedding: boolean;
	}

	interface SynthResult {
		count: number;
		persisted: number;
		mode: string;
		message: string;
		examples: Array<{ instruction: string; input: string; output: string }>;
	}

	// ── State ────────────────────────────────────────────────────────────────

	let pois = $state<PoiEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let refPoiId = $state<string | null>(null);
	let rerankResults = $state<RerankResult[]>([]);
	let rerankLoading = $state(false);
	let rerankPasses = $state<1 | 2 | 3>(3);
	let rerankError = $state<string | null>(null);
	let rerankRefName = $state('');

	let synthMode = $state<'description' | 'compare' | 'adversarial'>('description');
	let synthLimit = $state(30);
	let synthLoading = $state(false);
	let synthResult = $state<SynthResult | null>(null);
	let synthError = $state<string | null>(null);

	let searchQuery = $state('');
	let selectedPoiIds = $state<Set<string>>(new Set());

	// ── Load POIs + photos ───────────────────────────────────────────────────

	async function loadGallery() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/persons-of-interest?limit=100');
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();
			const rawPois: Array<{ id: string; name: string | null; status: string | null; threatLevel: string | null }> = data.persons ?? data.items ?? data ?? [];

			// Fetch photos for each POI (parallel, cap at 20 concurrently)
			const batchSize = 20;
			const withPhotos: PoiEntry[] = [];
			for (let i = 0; i < rawPois.length; i += batchSize) {
				const batch = rawPois.slice(i, i + batchSize);
				const results = await Promise.all(
					batch.map(async (p) => {
						try {
							const pr = await fetch(`/api/persons-of-interest/${p.id}/photos`);
							const pd = pr.ok ? await pr.json() : { photos: [] };
							return { ...p, photos: pd.photos ?? [], selected: false };
						} catch {
							return { ...p, photos: [], selected: false };
						}
					})
				);
				withPhotos.push(...results);
			}
			pois = withPhotos;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load POIs';
		} finally {
			loading = false;
		}
	}

	// ── GRPO Face Rerank ─────────────────────────────────────────────────────

	async function runRerank() {
		if (!refPoiId) return;
		rerankLoading = true;
		rerankError = null;
		rerankResults = [];
		try {
			const body: Record<string, unknown> = { passes: rerankPasses, limit: 20 };
			if (selectedPoiIds.size > 0) body.candidateIds = [...selectedPoiIds];
			const res = await fetch(`/api/persons-of-interest/${refPoiId}/face-rerank`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
			const data = await res.json();
			rerankResults = data.results ?? [];
			rerankRefName = data.refName ?? '';
		} catch (e) {
			rerankError = e instanceof Error ? e.message : 'Rerank failed';
		} finally {
			rerankLoading = false;
		}
	}

	// ── QLoRA Synthesis ──────────────────────────────────────────────────────

	async function runSynth() {
		synthLoading = true;
		synthError = null;
		synthResult = null;
		try {
			const body: Record<string, unknown> = {
				mode: synthMode,
				limit: synthLimit,
			};
			if (selectedPoiIds.size > 0) body.poiIds = [...selectedPoiIds];
			const res = await fetch('/api/persons/face-synth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
			synthResult = await res.json();
		} catch (e) {
			synthError = e instanceof Error ? e.message : 'Synthesis failed';
		} finally {
			synthLoading = false;
		}
	}

	async function downloadSynth() {
		const body: Record<string, unknown> = { mode: synthMode, limit: synthLimit, download: true };
		if (selectedPoiIds.size > 0) body.poiIds = [...selectedPoiIds];
		const res = await fetch('/api/persons/face-synth', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) return;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `face-synth-${synthMode}-${Date.now()}.jsonl`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	function toggleSelect(id: string) {
		const s = new Set(selectedPoiIds);
		s.has(id) ? s.delete(id) : s.add(id);
		selectedPoiIds = s;
	}

	function threatColor(level: string | null) {
		switch (level) {
			case 'critical': return '#ef4444';
			case 'high': return '#f97316';
			case 'medium': return '#eab308';
			default: return '#6b7280';
		}
	}

	function pctBar(v: number) {
		return `${Math.round(v * 100)}%`;
	}

	const filteredPois = $derived(
		pois.filter(
			(p) =>
				!searchQuery ||
				(p.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.id.startsWith(searchQuery)
		)
	);

	// Load on mount
	$effect(() => { loadGallery(); });
</script>

<div class="face-gallery">
	<header class="gallery-header">
		<div>
			<p class="eyebrow">Admin · POI Intelligence</p>
			<h1>Face Gallery</h1>
			<p class="subtitle">
				gemma4 VLM multi-pass GRPO reranker · 768-dim face embeddings · QLoRA synth
			</p>
		</div>
		<div class="header-actions">
			<Button onclick={loadGallery} disabled={loading}>
				<Icon name="refresh-cw" class="w-4 h-4" />
				Refresh
			</Button>
			<a href="/admin/persons-of-interest" class="btn-link">
				<Icon name="users" class="w-4 h-4" />
				All POIs
			</a>
		</div>
	</header>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<div class="gallery-layout">
		<!-- ── Left: POI Grid ───────────────────────────────────────────── -->
		<section class="poi-panel">
			<div class="panel-header">
				<h2>Persons of Interest</h2>
				<span class="count-badge">{filteredPois.length}</span>
				<input
					class="search-input"
					placeholder="Search name or ID…"
					bind:value={searchQuery}
				/>
			</div>

			{#if loading}
				<div class="loading-grid">
					{#each Array(12) as _}
						<div class="skeleton-card"></div>
					{/each}
				</div>
			{:else}
				<div class="poi-grid">
					{#each filteredPois as poi (poi.id)}
						<button
							class="poi-card {selectedPoiIds.has(poi.id) ? 'selected' : ''} {refPoiId === poi.id ? 'ref-selected' : ''}"
							onclick={() => toggleSelect(poi.id)}
						>
							<div class="poi-photo-strip">
								{#if poi.photos.length > 0}
									{#each poi.photos.slice(0, 3) as photo (photo.id)}
										<img
											src={photo.thumbnailUrl ?? '/placeholder-poi.png'}
											alt={poi.name ?? 'POI'}
											class="poi-thumb"
											loading="lazy"
										/>
									{/each}
								{:else}
									<div class="no-photo">
										<Icon name="user" class="w-8 h-8 opacity-30" />
									</div>
								{/if}
							</div>
							<div class="poi-info">
								<span class="poi-name">{poi.name ?? 'Unknown'}</span>
								<span class="poi-meta">
									{poi.photos.length} photo{poi.photos.length !== 1 ? 's' : ''}
									{#if poi.threatLevel}
										· <span style:color={threatColor(poi.threatLevel)}>{poi.threatLevel}</span>
									{/if}
								</span>
							</div>
							{#if selectedPoiIds.has(poi.id)}
								<div class="select-badge">
									<Icon name="check-circle" class="w-4 h-4" />
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			{#if selectedPoiIds.size > 0}
				<div class="selection-bar">
					<span>{selectedPoiIds.size} selected</span>
					<button class="clear-btn" onclick={() => (selectedPoiIds = new Set())}>
						Clear
					</button>
				</div>
			{/if}
		</section>

		<!-- ── Right: Tools Panel ───────────────────────────────────────── -->
		<aside class="tools-panel">

			<!-- GRPO Face Reranker -->
			<div class="tool-card">
				<h3>
					<Icon name="scan-face" class="w-4 h-4" />
					GRPO Face Reranker
				</h3>
				<p class="tool-desc">
					3-pass: embedding cosine → gemma4 VLM reasoning → GRPO reward fusion
				</p>

				<label class="field-label" for="ref-poi">Reference POI (match against this face)</label>
				<select id="ref-poi" class="select-field" bind:value={refPoiId}>
					<option value={null}>— select reference POI —</option>
					{#each pois as p (p.id)}
						<option value={p.id}>{p.name ?? p.id.slice(0, 8)} ({p.photos.length} photos)</option>
					{/each}
				</select>

				<div class="pass-selector">
					<span class="field-label">Passes</span>
					{#each ([1, 2, 3] as const) as n}
						<button
							class="pass-btn {rerankPasses === n ? 'active' : ''}"
							onclick={() => (rerankPasses = n)}
						>
							{n === 1 ? 'Embed only' : n === 2 ? 'Embed + VLM' : 'Full GRPO'}
						</button>
					{/each}
				</div>

				{#if selectedPoiIds.size > 0}
					<p class="hint">
						Restricting to {selectedPoiIds.size} selected candidates.
					</p>
				{/if}

				<Button
					onclick={runRerank}
					disabled={rerankLoading || !refPoiId}
					class="w-full mt-2"
				>
					{#if rerankLoading}
						<Icon name="loader-2" class="w-4 h-4 animate-spin" />
						Running…
					{:else}
						<Icon name="zap" class="w-4 h-4" />
						Run Reranker
					{/if}
				</Button>

				{#if rerankError}
					<p class="error-text">{rerankError}</p>
				{/if}

				{#if rerankResults.length > 0}
					<div class="rerank-results">
						<h4>Matches for <strong>{rerankRefName}</strong></h4>
						{#each rerankResults.slice(0, 8) as r, i (r.poiId)}
							<div class="result-row">
								<span class="rank">#{i + 1}</span>
								{#if r.thumbnailUrl}
									<img src={r.thumbnailUrl} alt={r.name} class="result-thumb" />
								{:else}
									<div class="result-thumb-placeholder">
										<Icon name="user" class="w-5 h-5 opacity-30" />
									</div>
								{/if}
								<div class="result-info">
									<strong>{r.name}</strong>
									<div class="score-bars">
										<span class="score-label">GRPO</span>
										<div class="score-bar">
											<div class="score-fill grpo" style:width={pctBar(r.grpoReward)}></div>
										</div>
										<span class="score-pct">{Math.round(r.grpoReward * 100)}%</span>
									</div>
									{#if rerankPasses >= 2}
										<div class="score-bars">
											<span class="score-label">VLM</span>
											<div class="score-bar">
												<div class="score-fill vlm" style:width={pctBar(r.pass2Score)}></div>
											</div>
											<span class="score-pct">{Math.round(r.pass2Score * 100)}%</span>
										</div>
									{/if}
									{#if r.pass2Reasoning}
										<p class="reasoning">{r.pass2Reasoning}</p>
									{/if}
								</div>
								<a
									href="/persons-of-interest/{r.poiId}"
									class="view-link"
									title="View POI"
								>
									<Icon name="external-link" class="w-3.5 h-3.5" />
								</a>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- QLoRA Synth -->
			<div class="tool-card">
				<h3>
					<Icon name="brain-circuit" class="w-4 h-4" />
					QLoRA llm_synths
				</h3>
				<p class="tool-desc">
					Generate synthetic face identity training pairs for gemma4 adapter fine-tuning.
					Writes to <code>qlora_examples</code>.
				</p>

				<label class="field-label">Mode</label>
				<div class="mode-selector">
					{#each (['description', 'compare', 'adversarial'] as const) as m}
						<button
							class="mode-btn {synthMode === m ? 'active' : ''}"
							onclick={() => (synthMode = m)}
							title={m === 'description' ? 'Describe each face' : m === 'compare' ? 'Positive + negative pairs' : 'Hard negatives'}
						>
							{m}
						</button>
					{/each}
				</div>

				<label class="field-label" for="synth-limit">
					Limit <span class="muted">({synthLimit} pairs)</span>
				</label>
				<input
					id="synth-limit"
					type="range"
					min="5"
					max="200"
					step="5"
					bind:value={synthLimit}
					class="range-input"
				/>

				<div class="synth-actions">
					<Button onclick={runSynth} disabled={synthLoading}>
						{#if synthLoading}
							<Icon name="loader-2" class="w-4 h-4 animate-spin" />
							Generating…
						{:else}
							<Icon name="sparkles" class="w-4 h-4" />
							Generate
						{/if}
					</Button>
					<Button onclick={downloadSynth} disabled={synthLoading} variant="outline">
						<Icon name="download" class="w-4 h-4" />
						JSONL
					</Button>
				</div>

				{#if synthError}
					<p class="error-text">{synthError}</p>
				{/if}

				{#if synthResult}
					<div class="synth-result">
						<p class="synth-summary">{synthResult.message}</p>
						{#if synthResult.examples.length > 0}
							<details class="preview-details">
								<summary>Preview ({synthResult.examples.length} examples)</summary>
								<div class="examples-list">
									{#each synthResult.examples.slice(0, 5) as ex, i}
										<div class="example-item">
											<p class="ex-instruction"><strong>Instruction:</strong> {ex.instruction}</p>
											<p class="ex-output"><strong>Output:</strong> {ex.output.slice(0, 200)}{ex.output.length > 200 ? '…' : ''}</p>
										</div>
										{#if i < 4}<hr />{/if}
									{/each}
								</div>
							</details>
						{/if}
					</div>
				{/if}
			</div>

		</aside>
	</div>
</div>

<style>
	.face-gallery {
		padding: 1.5rem 2rem;
		max-width: 1600px;
		margin: 0 auto;
		font-family: var(--font-sans, system-ui);
	}

	.gallery-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}

	.eyebrow {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted, #9ca3af);
		margin-bottom: 0.25rem;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}

	.subtitle {
		font-size: 0.8rem;
		color: var(--color-muted, #9ca3af);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--color-border, #374151);
		border-radius: 0.375rem;
		font-size: 0.825rem;
		color: inherit;
		text-decoration: none;
		transition: background 0.15s;
	}

	.btn-link:hover {
		background: var(--color-surface, #1f2937);
	}

	.error-banner {
		background: #450a0a;
		color: #fca5a5;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	/* ── Layout ── */
	.gallery-layout {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 1.5rem;
		align-items: start;
	}

	@media (max-width: 1100px) {
		.gallery-layout { grid-template-columns: 1fr; }
	}

	/* ── POI Panel ── */
	.poi-panel {
		background: var(--color-surface, #111827);
		border: 1px solid var(--color-border, #1f2937);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.panel-header h2 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.count-badge {
		background: var(--color-accent, #3b82f6);
		color: white;
		border-radius: 9999px;
		padding: 0.1rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.search-input {
		margin-left: auto;
		padding: 0.35rem 0.65rem;
		border: 1px solid var(--color-border, #374151);
		border-radius: 0.375rem;
		background: var(--color-bg, #0f172a);
		color: inherit;
		font-size: 0.8rem;
		width: 200px;
	}

	.poi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		max-height: 72vh;
		overflow-y: auto;
	}

	.loading-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
	}

	.skeleton-card {
		height: 160px;
		border-radius: 0.5rem;
		background: var(--color-surface, #1f2937);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	.poi-card {
		background: var(--color-surface, #1f2937);
		border: 2px solid transparent;
		border-radius: 0.5rem;
		padding: 0;
		cursor: pointer;
		transition: border-color 0.15s, transform 0.1s;
		position: relative;
		overflow: hidden;
		text-align: left;
	}

	.poi-card:hover { border-color: var(--color-accent, #3b82f6); transform: scale(1.02); }
	.poi-card.selected { border-color: var(--color-accent, #3b82f6); background: #1e3a5f; }
	.poi-card.ref-selected { border-color: #a855f7; background: #2d1b4e; }

	.poi-photo-strip {
		display: flex;
		height: 100px;
		overflow: hidden;
		background: #0f172a;
	}

	.poi-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		flex: 1;
		min-width: 0;
	}

	.no-photo {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted, #6b7280);
	}

	.poi-info {
		padding: 0.4rem 0.5rem;
	}

	.poi-name {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.poi-meta {
		font-size: 0.7rem;
		color: var(--color-muted, #9ca3af);
	}

	.select-badge {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		color: var(--color-accent, #3b82f6);
	}

	.selection-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: var(--color-accent, #1d4ed8);
		border-radius: 0.375rem;
		margin-top: 0.75rem;
		font-size: 0.825rem;
	}

	.clear-btn {
		background: none;
		border: none;
		color: #bfdbfe;
		cursor: pointer;
		font-size: 0.8rem;
		text-decoration: underline;
	}

	/* ── Tools Panel ── */
	.tools-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.tool-card {
		background: var(--color-surface, #111827);
		border: 1px solid var(--color-border, #1f2937);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.tool-card h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.tool-desc {
		font-size: 0.775rem;
		color: var(--color-muted, #9ca3af);
		margin: 0 0 0.75rem;
	}

	.field-label {
		display: block;
		font-size: 0.775rem;
		font-weight: 600;
		color: var(--color-muted, #9ca3af);
		margin-bottom: 0.3rem;
		margin-top: 0.5rem;
	}

	.select-field {
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--color-border, #374151);
		border-radius: 0.375rem;
		background: var(--color-bg, #0f172a);
		color: inherit;
		font-size: 0.8rem;
	}

	.pass-selector, .mode-selector {
		display: flex;
		gap: 0.35rem;
		margin: 0.4rem 0;
		flex-wrap: wrap;
	}

	.pass-btn, .mode-btn {
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--color-border, #374151);
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s;
	}

	.pass-btn.active, .mode-btn.active {
		background: var(--color-accent, #3b82f6);
		border-color: var(--color-accent, #3b82f6);
		color: white;
	}

	.hint {
		font-size: 0.75rem;
		color: #60a5fa;
		margin: 0.25rem 0;
	}

	.error-text {
		color: #f87171;
		font-size: 0.775rem;
		margin-top: 0.4rem;
	}

	/* ── Rerank results ── */
	.rerank-results {
		margin-top: 1rem;
		border-top: 1px solid var(--color-border, #1f2937);
		padding-top: 0.75rem;
	}

	.rerank-results h4 {
		font-size: 0.825rem;
		margin: 0 0 0.5rem;
	}

	.result-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--color-border, #1f2937);
	}

	.rank {
		font-size: 0.7rem;
		color: var(--color-muted, #9ca3af);
		min-width: 1.5rem;
		padding-top: 0.15rem;
	}

	.result-thumb {
		width: 36px;
		height: 36px;
		border-radius: 0.25rem;
		object-fit: cover;
		flex-shrink: 0;
	}

	.result-thumb-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 0.25rem;
		background: #1f2937;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.result-info {
		flex: 1;
		min-width: 0;
	}

	.result-info strong {
		display: block;
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.score-bars {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.2rem;
	}

	.score-label {
		font-size: 0.65rem;
		color: var(--color-muted, #6b7280);
		min-width: 2.5rem;
	}

	.score-bar {
		flex: 1;
		height: 6px;
		background: #1f2937;
		border-radius: 9999px;
		overflow: hidden;
	}

	.score-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s;
	}

	.score-fill.grpo { background: #a855f7; }
	.score-fill.vlm  { background: #3b82f6; }

	.score-pct {
		font-size: 0.65rem;
		color: var(--color-muted, #9ca3af);
		min-width: 2rem;
		text-align: right;
	}

	.reasoning {
		font-size: 0.7rem;
		color: var(--color-muted, #9ca3af);
		margin: 0.2rem 0 0;
		line-height: 1.4;
	}

	.view-link {
		color: var(--color-muted, #6b7280);
		padding: 0.2rem;
		flex-shrink: 0;
	}

	.view-link:hover { color: var(--color-accent, #60a5fa); }

	/* ── Synth ── */
	.range-input {
		width: 100%;
		margin: 0.35rem 0;
		accent-color: var(--color-accent, #3b82f6);
	}

	.synth-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.synth-result {
		margin-top: 0.75rem;
		border-top: 1px solid var(--color-border, #1f2937);
		padding-top: 0.75rem;
	}

	.synth-summary {
		font-size: 0.8rem;
		color: #86efac;
		margin: 0 0 0.5rem;
	}

	.preview-details summary {
		font-size: 0.775rem;
		cursor: pointer;
		color: var(--color-muted, #9ca3af);
	}

	.examples-list {
		margin-top: 0.5rem;
		font-size: 0.75rem;
	}

	.example-item { padding: 0.4rem 0; }

	.ex-instruction {
		margin: 0 0 0.2rem;
		color: var(--color-muted, #9ca3af);
	}

	.ex-output {
		margin: 0;
		line-height: 1.5;
	}

	.muted { color: var(--color-muted, #9ca3af); }

	.examples-list hr {
		border: none;
		border-top: 1px solid var(--color-border, #1f2937);
		margin: 0.4rem 0;
	}
</style>
