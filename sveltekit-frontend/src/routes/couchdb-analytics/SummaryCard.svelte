<script lang="ts">
	// Migrated to $effect

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface Summary {
		file_path: string;
		summary: string;
		key_entities: string[];
		llm_provider: string;
		generated_at: string;
		metadata?: {
			error_count: number;
			classes: string[];
			functions: string[];
			language: string;
			lines_of_code: number;
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

	$effect(() => {

		loadSummaries();
	
});

	function getProviderBadgeClass(provider: string) {
		if (provider.includes('gemini')) return 'is-success';
		if (provider.includes('gpt')) return 'is-primary';
		if (provider.includes('claude')) return 'is-warning';
		return 'is-dark';
	}
</script>

<div class="summary-list">
	<div class="controls">
		<input
			type="text"
			class="nes-input"
			placeholder="Search files..."
			bind:value={searchQuery}
		/>

		<div class="nes-select">
			<select bind:value={filterProvider} onchange={loadSummaries}>
				<option value="all">All Providers</option>
				<option value="gemini">Gemini</option>
				<option value="gpt">GPT-4</option>
				<option value="claude">Claude</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading summaries...</div>
	{:else}
		<div class="grid">
			{#each filteredSummaries as summary}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="nes-container is-rounded with-title summary-card" onclick={() => selectedSummary = summary}>
					<p class="title">{summary.llm_provider}</p>
					<div class="card-content">
						<h4>{summary.file_path.split('/').pop()}</h4>
						<p class="preview">{summary.summary.substring(0, 100)}...</p>
						<div class="tags">
							{#each summary.key_entities.slice(0, 3) as entity}
								<span class="nes-badge is-splited">
									<span class="is-dark">#</span>
									<span class="is-primary">{entity}</span>
								</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedSummary}
	<div class="modal-overlay" onclick={() => selectedSummary = null} role="presentation">
		<div class="modal-content nes-container is-rounded" onclick={(e) => e.stopPropagation()} role="presentation">
			<div class="modal-header">
				<h3>{selectedSummary.file_path}</h3>
				<button class="close-btn" onclick={() => selectedSummary = null}>✕</button>
			</div>

			<div class="modal-body">
				<div class="section">
					<h4>Summary ({selectedSummary.llm_provider})</h4>
					<p class="summary-full">{selectedSummary.summary}</p>
				</div>

				<div class="section">
					<h4>Key Entities</h4>
					<div class="entities-full">
						{#each selectedSummary.key_entities as entity}
							<span class="nes-badge">
								<span class="is-primary">{entity}</span>
							</span>
						{/each}
					</div>
				</div>

				{#if selectedSummary.metadata}
					<div class="section">
						<h4>Metadata</h4>
						<table>
							<tbody>
								<tr>
									<td>Language</td>
									<td>{selectedSummary.metadata.language}</td>
								</tr>
								<tr>
									<td>Lines</td>
									<td>{selectedSummary.metadata.lines_of_code}</td>
								</tr>
								<tr>
									<td>Complexity</td>
									<td>{selectedSummary.metadata.classes.length} classes, {selectedSummary.metadata.functions.length} functions</td>
								</tr>
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.summary-list {
		margin-top: 2rem;
	}

	.controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.summary-card {
		cursor: pointer;
		transition: transform 0.2s;
	}

	.summary-card:hover {
		transform: translateY(-4px);
	}

	.card-content h4 {
		margin-bottom: 0.5rem;
		word-break: break-all;
	}

	.preview {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 1rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 2rem;
	}

	.modal-content {
		background: white;
		width: 100%;
		max-width: 800px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0;
		color: #1f2937;
		font-size: 1.25rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #6b7280;
		width: 32px;
		height: 32px;
		display: flex;
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
		line-height: 1.6;
		color: #374151;
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
		flex-wrap: wrap;
		gap: 0.5rem;
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
		font-weight: 600;
		color: #6b7280;
		width: 40%;
	}
</style>