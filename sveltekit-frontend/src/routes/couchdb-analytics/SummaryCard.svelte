<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface Summary {
		file_path: string; summary: string;
		key_entities: string[]; llm_provider: string;
		generated_at: string;
		metadata?: { error_count: number;
			classes: string[]; functions: string[];
			language: string; lines_of_code: number;
		};
	}

	let summaries = $state<Summary[]>([]);
	let loading = $state(true);
	let selectedSummary = $state<Summary | null>(null);
	let filterProvider = $state<string>('all');
	let searchQuery = $state('');

	async function loadSummaries() {
		loading = true;
		try {
			const params = new URLSearchParams({ limit: '50' });
			if (filterProvider !== 'all') {
				params.append('provider', filterProvider);
			}

			const response = await fetch(`${apiBase}/summaries?${params}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			summaries = await response.json();
		} catch (err) {
			console.error('Failed to load summaries:', err);
		} finally {
			loading = false;
		}
	}

	const filteredSummaries = $derived(
		summaries.filter(s =>
			s.file_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
			s.summary.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	onMount(() => {
		loadSummaries();
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}
</script>

<div class="summary-card-container">
	<div class="controls">
		<div class="search-box">
			<span class="search-icon">🔍</span>
			<input
				type="text"
				placeholder="Search summaries..."
				bind:value={searchQuery}
			/>
		</div>

		<select bind:value={filterProvider} onchange={() => loadSummaries()}>
			<option value="all">All Providers</option>
			<option value="gemma3-legal:latest">Gemma3 Legal</option>
			<option value="gpt-4">GPT-4</option>
			<option value="claude">Claude</option>
		</select>
	</div>

	{#if loading}
		<div class="loading">Loading summaries...</div>
	{:else if filteredSummaries.length === 0}
		<div class="empty-state">
			<p>No summaries found</p>
			<p class="hint">Generate summaries using: <code>python backend/scripts/generate_summaries.py --limit 10</code></p>
		</div>
	{:else}
		<div class="summary-grid">
			{#each filteredSummaries as summary}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="summary-item"
					role="button"
					tabindex="0"
					onclick={() => selectedSummary = summary}
					onkeydown={(e) => e.key === 'Enter' && (selectedSummary = summary)}
				>
					<div class="file-path">📄 {summary.file_path}</div>
					<div class="summary-preview">{summary.summary.substring(0, 150)}...</div>

					{#if summary.key_entities.length > 0}
						<div class="entities">
							{#each summary.key_entities.slice(0, 3) as entity}
								<span class="entity-tag">{entity}</span>
							{/each}
							{#if summary.key_entities.length > 3}
								<span class="entity-tag more">+{summary.key_entities.length - 3}</span>
							{/if}
						</div>
					{/if}

					<div class="meta">
						<span class="provider">🤖 {summary.llm_provider}</span>
						{#if summary.metadata}
							<span class="loc">📏 {summary.metadata.lines_of_code} LOC</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Detail Modal -->
	{#if selectedSummary}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-overlay" role="dialog" aria-modal="true" tabindex="0" onclick={() => selectedSummary = null} onkeydown={(e) => e.key === 'Escape' && (selectedSummary = null)}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<h3>{selectedSummary.file_path}</h3>
					<button class="close-btn" onclick={() => selectedSummary = null}>✕</button>
				</div>

				<div class="modal-body">
					<div class="summary-full">{selectedSummary.summary}</div>

					{#if selectedSummary.key_entities.length > 0}
						<div class="section">
							<h4>Key Entities</h4>
							<div class="entities-full">
								{#each selectedSummary.key_entities as entity}
									<span class="entity-tag">{entity}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedSummary.metadata}
						<div class="section">
							<h4>Metadata</h4>
							<table>
								<tbody>
									<tr><td>Language</td><td>{selectedSummary.metadata.language}</td></tr>
									<tr><td>Lines of Code</td><td>{selectedSummary.metadata.lines_of_code}</td></tr>
									<tr><td>Classes</td><td>{selectedSummary.metadata.classes.length}</td></tr>
									<tr><td>Functions</td><td>{selectedSummary.metadata.functions.length}</td></tr>
									<tr><td>Error Count</td><td>{selectedSummary.metadata.error_count}</td></tr>
								</tbody>
							</table>
						</div>
					{/if}

					<div class="section">
						<h4>Generation Info</h4>
						<p><strong>Provider:</strong> {selectedSummary.llm_provider}</p>
						<p><strong>Generated:</strong> {formatDate(selectedSummary.generated_at)}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.summary-card-container {
		height: 100%;
	}

	.controls {
		display: flex; gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.search-box {
		flex: 1; position: relative;
	}

	.search-icon {
		position: absolute; left: 12px;
		top: 50%; transform: translateY(-50%);
	}

	.search-box input {
		width: 100%; padding: 0.75rem 0.75rem 0.75rem 2.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.875rem;
	}

	select {
		padding: 0.75rem 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.875rem; cursor: pointer;
	}

	.loading, .empty-state {
		text-align: center; padding: 3rem;
		color: #6b7280;
	}

	.empty-state .hint {
		margin-top: 1rem;
		font-size: 0.875rem;
	}

	.empty-state code {
		background: #f3f4f6; padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: monospace;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1rem;
		max-height: 600px;
		overflow-y: auto;
	}

	.summary-item {
		border: 2px solid #e5e7eb;
		border-radius: 8px; padding: 1rem;
		cursor: pointer; transition: all 0.2s;
	}

	.summary-item:hover {
		border-color: #667eea;
		box-shadow: 0 4px 6px rgba(102, 126, 234, 0.1);
		transform: translateY(-2px);
	}

	.file-path {
		font-weight: 600; color: #1f2937;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}

	.summary-preview {
		font-size: 0.875rem; color: #4b5563;
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	.entities {
		display: flex;
		flex-wrap: wrap; gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.entity-tag {
		background: #ede9fe; color: #6d28d9;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.entity-tag.more {
		background: #f3f4f6; color: #6b7280;
	}

	.meta {
		display: flex; gap: 1rem;
		font-size: 0.75rem; color: #6b7280;
	}

	.modal-overlay {
		position: fixed; top: 0;
		left: 0; right: 0;
		bottom: 0; background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000; padding: 2rem;
	}

	.modal-content {
		background: white;
		border-radius: 12px;
		max-width: 800px; width: 100%;
		max-height: 80vh; overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 1.5rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0; color: #1f2937;
		font-size: 1.25rem;
	}

	.close-btn {
		background: none; border: none;
		font-size: 1.5rem; cursor: pointer;
		color: #6b7280; width: 32px;
		height: 32px; display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.summary-full {
		line-height: 1.6; color: #374151;
		margin-bottom: 1.5rem;
		white-space: pre-wrap;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section h4 {
		margin: 0 0 0.75rem 0;
		color: #1f2937;
		font-size: 1rem;
	}

	.entities-full {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	table {
		width: 100%;
		font-size: 0.875rem;
	}

	table td {
		padding: 0.5rem 0;
		border-bottom: 1px solid #e5e7eb;
	}

	table td:first-child {
		font-weight: 600; color: #6b7280;
		width: 40%;
	}
</style>




