<script lang="ts">
	/**
	 * Legal Corpus Search — Command Palette for Legal Knowledge Base
	 *
	 * Searches across 4 sources in parallel:
	 *   1. Glossary terms (pgvector semantic + full-text + prefix)
	 *   2. Statutes (pgvector semantic + full-text)
	 *   3. Legal precedents (pgvector semantic + full-text)
	 *   4. Tags (Qdrant semantic via embeddinggemma)
	 *
	 * Keyboard shortcut: Ctrl+L to toggle.
	 * Uses native <dialog> (same pattern as CodebaseSearch).
	 */

	import Icon from '$lib/components/ui/Icon.svelte';

	let query = $state('');
	let isLoading = $state(false);
	let isOpen = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let dialogEl: HTMLDialogElement | undefined;
	let timing = $state(0);

	interface LegalResult {
		id: string;
		title: string;
		description: string;
		category: string;
		source: 'glossary' | 'statute' | 'precedent' | 'tag';
		similarity: number;
		matchType?: string;
		meta?: Record<string, string>;
	}

	let results = $state<LegalResult[]>([]);

	let groupedResults = $derived.by(() => {
		const groups: Record<string, LegalResult[]> = {};
		for (const r of results) {
			const key = r.source === 'glossary' ? 'Glossary'
				: r.source === 'statute' ? 'Statutes'
				: r.source === 'precedent' ? 'Precedents'
				: 'Tags';
			(groups[key] ??= []).push(r);
		}
		return groups;
	});

	let resultCount = $derived(results.length);

	function open() {
		isOpen = true;
		dialogEl?.showModal();
		setTimeout(() => {
			const input = dialogEl?.querySelector('input');
			input?.focus();
		}, 50);
	}

	function close() {
		isOpen = false;
		dialogEl?.close();
		query = '';
		results = [];
	}

	async function search(q: string) {
		if (q.length < 2) {
			results = [];
			return;
		}

		isLoading = true;
		const start = performance.now();

		try {
			const body = JSON.stringify({ query: q, limit: 10 });
			const headers = { 'Content-Type': 'application/json' };

			// Search all 4 sources in parallel
			const [glossaryRes, statuteRes, precedentRes, tagRes] = await Promise.allSettled([
				fetch('/api/glossary/search', { method: 'POST', headers, body }),
				fetch('/api/statutes/search', { method: 'POST', headers, body }),
				fetch('/api/precedents/search', { method: 'POST', headers, body }),
				fetch(`/api/tags/search?q=${encodeURIComponent(q)}&limit=10`)
			]);

			const merged: LegalResult[] = [];

			// Glossary results
			if (glossaryRes.status === 'fulfilled' && glossaryRes.value.ok) {
				const data = await glossaryRes.value.json();
				for (const r of data.results ?? []) {
					merged.push({
						id: r.id,
						title: r.term,
						description: r.definition?.slice(0, 120) + (r.definition?.length > 120 ? '...' : ''),
						category: r.category ?? 'general',
						source: 'glossary',
						similarity: r.similarity ?? 0,
						matchType: r.matchType,
						meta: r.jurisdiction ? { jurisdiction: r.jurisdiction } : undefined
					});
				}
			}

			// Statute results
			if (statuteRes.status === 'fulfilled' && statuteRes.value.ok) {
				const data = await statuteRes.value.json();
				for (const r of data.results ?? []) {
					merged.push({
						id: r.id,
						title: r.section ? `${r.section} — ${r.title}` : r.title,
						description: r.content?.slice(0, 120) + (r.content?.length > 120 ? '...' : ''),
						category: r.category ?? 'statute',
						source: 'statute',
						similarity: r.similarity ?? 0,
						matchType: r.matchType,
						meta: { jurisdiction: r.jurisdiction ?? 'Unknown' }
					});
				}
			}

			// Precedent results
			if (precedentRes.status === 'fulfilled' && precedentRes.value.ok) {
				const data = await precedentRes.value.json();
				for (const r of data.results ?? []) {
					merged.push({
						id: r.id,
						title: r.title,
						description: r.summary?.slice(0, 120) + (r.summary?.length > 120 ? '...' : ''),
						category: r.court ?? 'court',
						source: 'precedent',
						similarity: r.similarity ?? 0,
						matchType: r.matchType,
						meta: {
							citation: r.citation ?? '',
							court: r.court ?? ''
						}
					});
				}
			}

			// Tag results
			if (tagRes.status === 'fulfilled' && tagRes.value.ok) {
				const data = await tagRes.value.json();
				for (const r of data.results ?? []) {
					merged.push({
						id: r.id ?? r.tag_id ?? '',
						title: r.name ?? r.tag ?? '',
						description: r.description ?? '',
						category: 'tag',
						source: 'tag',
						similarity: r.score ?? 0
					});
				}
			}

			results = merged;
			timing = Math.round(performance.now() - start);
		} catch {
			results = [];
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		const q = query;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => search(q), 300);
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
			e.preventDefault();
			if (isOpen) close();
			else open();
		}
		if (e.key === 'Escape' && isOpen) {
			close();
		}
	}

	function sourceBadge(source: string): string {
		switch (source) {
			case 'glossary': return 'lcs-badge-glossary';
			case 'statute': return 'lcs-badge-statute';
			case 'precedent': return 'lcs-badge-precedent';
			case 'tag': return 'lcs-badge-tag';
			default: return 'lcs-badge-tag';
		}
	}

	function sourceIcon(source: string): string {
		switch (source) {
			case 'glossary': return 'book-open';
			case 'statute': return 'scale';
			case 'precedent': return 'landmark';
			case 'tag': return 'tag';
			default: return 'search';
		}
	}

	function navigate(result: LegalResult) {
		close();
		if (result.source === 'glossary' || result.source === 'statute' || result.source === 'precedent') {
			window.location.href = `/citations?q=${encodeURIComponent(result.title)}`;
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<dialog
	bind:this={dialogEl}
	class="lcs-dialog"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="lcs-container">
		<div class="lcs-header">
			<Icon name="scroll" size={18} />
			<input
				type="text"
				bind:value={query}
				placeholder="Search legal corpus... glossary, statutes, precedents, tags"
				class="lcs-input"
			/>
			{#if isLoading}
				<div class="lcs-spinner"></div>
			{/if}
			<kbd class="lcs-kbd">Ctrl+L</kbd>
		</div>

		<div class="lcs-results">
			{#if query.length < 2}
				<div class="lcs-hint">
					<p>Type 2+ characters to search the legal knowledge base</p>
					<p class="lcs-hint-sub">
						Try: "habeas corpus" · "robbery" · "Miranda" · "due process"
					</p>
					<div class="lcs-hint-sources">
						<span><Icon name="book-open" size={12} /> Glossary (60 terms)</span>
						<span><Icon name="scale" size={12} /> Statutes (25 codes)</span>
						<span><Icon name="landmark" size={12} /> Precedents (20 cases)</span>
						<span><Icon name="tag" size={12} /> Tags (Qdrant semantic)</span>
					</div>
				</div>
			{:else if !isLoading && resultCount === 0 && query.length >= 2}
				<div class="lcs-empty">
					No results for "{query}"
					<p class="lcs-hint-sub">Seed the knowledge base via Dev Tools → Knowledge Base tab</p>
				</div>
			{:else}
				{#each Object.entries(groupedResults) as [group, items]}
					<div class="lcs-group">
						<div class="lcs-group-label">{group} ({items.length})</div>
						{#each items as result}
							<button
								class="lcs-item"
								onclick={() => navigate(result)}
							>
								<div class="lcs-item-header">
									<Icon name={sourceIcon(result.source)} size={14} />
									<span class="lcs-item-title">{result.title}</span>
									<span class="lcs-badge {sourceBadge(result.source)}">{result.source}</span>
									{#if result.similarity > 0}
										<span class="lcs-score">{(result.similarity * 100).toFixed(0)}%</span>
									{/if}
								</div>
								{#if result.description}
									<div class="lcs-item-desc">{result.description}</div>
								{/if}
								{#if result.meta}
									<div class="lcs-item-meta">
										{#each Object.entries(result.meta).filter(([,v]) => v) as [key, value]}
											<span class="lcs-meta-tag">{key}: {value}</span>
										{/each}
										{#if result.matchType}
											<span class="lcs-meta-tag">{result.matchType}</span>
										{/if}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			{/if}
		</div>

		{#if resultCount > 0}
			<div class="lcs-footer">
				<span>{resultCount} results across {Object.keys(groupedResults).length} sources</span>
				<span class="lcs-timing">{timing}ms</span>
			</div>
		{/if}
	</div>
</dialog>

<style>
	.lcs-dialog {
		position: fixed;
		top: 8vh;
		left: 50%;
		transform: translateX(-50%);
		width: 92%;
		max-width: 680px;
		max-height: 80vh;
		padding: 0;
		border: 1px solid rgba(212, 199, 163, 0.25);
		border-radius: 12px;
		background: rgb(30 27 20 / 0.97);
		color: #d4c7a3;
		backdrop-filter: blur(16px);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.lcs-dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
	}
	.lcs-container {
		display: flex;
		flex-direction: column;
		max-height: 80vh;
	}
	.lcs-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.15);
	}
	.lcs-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #d4c7a3;
		font-size: 15px;
		font-family: 'JetBrains Mono', monospace;
		outline: none;
	}
	.lcs-input::placeholder { color: rgba(212, 199, 163, 0.35); }
	.lcs-spinner {
		width: 18px; height: 18px;
		border: 2px solid rgba(212, 199, 163, 0.2);
		border-top-color: #4ade80;
		border-radius: 50%;
		animation: lcs-spin 0.6s linear infinite;
	}
	@keyframes lcs-spin { to { transform: rotate(360deg); } }
	.lcs-kbd {
		padding: 2px 6px;
		border: 1px solid rgba(212, 199, 163, 0.25);
		border-radius: 4px;
		font-size: 10px;
		color: rgba(212, 199, 163, 0.5);
		font-family: monospace;
		white-space: nowrap;
	}
	.lcs-results {
		overflow-y: auto;
		max-height: 60vh;
		padding: 8px 0;
	}
	.lcs-hint, .lcs-empty {
		padding: 28px 16px;
		text-align: center;
		color: rgba(212, 199, 163, 0.5);
		font-size: 14px;
	}
	.lcs-hint-sub { font-size: 12px; margin-top: 6px; opacity: 0.6; }
	.lcs-hint-sources {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
		margin-top: 16px;
		font-size: 11px;
		opacity: 0.5;
	}
	.lcs-hint-sources span {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.lcs-group { padding: 4px 0; }
	.lcs-group-label {
		padding: 4px 16px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(212, 199, 163, 0.4);
	}
	.lcs-item {
		display: block;
		width: 100%;
		padding: 10px 16px;
		text-align: left;
		background: transparent;
		border: none;
		color: #d4c7a3;
		cursor: pointer;
		transition: background 0.1s;
		font-family: 'JetBrains Mono', monospace;
	}
	.lcs-item:hover { background: rgba(212, 199, 163, 0.08); }
	.lcs-item-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 3px;
	}
	.lcs-item-title {
		font-weight: 600;
		font-size: 13px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lcs-badge {
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.lcs-badge-glossary { background: rgba(99, 179, 237, 0.15); color: #63b3ed; }
	.lcs-badge-statute { background: rgba(72, 187, 120, 0.15); color: #48bb78; }
	.lcs-badge-precedent { background: rgba(237, 137, 54, 0.15); color: #ed8936; }
	.lcs-badge-tag { background: rgba(159, 122, 234, 0.15); color: #9f7aea; }
	.lcs-score {
		font-size: 11px;
		color: rgba(212, 199, 163, 0.4);
		font-family: monospace;
	}
	.lcs-item-desc {
		font-size: 12px;
		color: rgba(212, 199, 163, 0.55);
		line-height: 1.4;
		margin-left: 20px;
	}
	.lcs-item-meta {
		display: flex;
		gap: 6px;
		margin-top: 4px;
		margin-left: 20px;
		flex-wrap: wrap;
	}
	.lcs-meta-tag {
		padding: 1px 5px;
		border-radius: 3px;
		font-size: 10px;
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.5);
	}
	.lcs-footer {
		display: flex;
		justify-content: space-between;
		padding: 8px 16px;
		border-top: 1px solid rgba(212, 199, 163, 0.15);
		font-size: 11px;
		color: rgba(212, 199, 163, 0.4);
	}
	.lcs-timing { font-family: monospace; }
</style>
