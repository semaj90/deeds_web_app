<script lang="ts">
	import { onMount } from 'svelte';

	let runs = $state<any[]>([]);
	let selectedRunId = $state<string | null>(null);
	let runDetail = $state<any>(null);
	let loading = $state(true);
	let detailLoading = $state(false);

	async function loadRuns() {
		try {
			const res = await fetch('/api/code-intel/retrieval-runs');
			runs = await res.json();
		} catch (e) {
			console.error('Failed to load runs', e);
		} finally {
			loading = false;
		}
	}

	async function selectRun(id: string) {
		selectedRunId = id;
		detailLoading = true;
		try {
			const res = await fetch(`/api/code-intel/retrieval-runs/${id}`);
			runDetail = await res.json();
		} catch (e) {
			console.error('Failed to load run detail', e);
		} finally {
			detailLoading = false;
		}
	}

	onMount(() => {
		loadRuns();
	});

	function getStepStatus(step: string) {
		// Mock logic based on run metadata
		return 'completed';
	}
</script>

<svelte:head>
	<title>Retrieval Trace | Code Intel</title>
</svelte:head>

<div class="retrieval-trace">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>TRACE Retrieval Timeline</h1>
		<p class="subtitle">Deep visibility into the Triage-Retrieve-Align-Compose-Encode loop.</p>
	</header>

	{#if loading}
		<div class="loading">Fetching neural archives...</div>
	{:else}
		<div class="layout">
			<aside class="run-list card">
				<h2>Recent TRACE Runs</h2>
				<div class="runs">
					{#each runs as run}
						<button 
							class="run-item" 
							class:active={selectedRunId === run.id}
							onclick={() => selectRun(run.id)}
						>
							<div class="query">{run.query.slice(0, 40)}...</div>
							<div class="meta">{new Date(run.createdAt).toLocaleTimeString()}</div>
						</button>
					{/each}
				</div>
			</aside>

			<main class="trace-view">
				{#if detailLoading}
					<div class="loading">Reconstructing retrieval steps...</div>
				{:else if runDetail}
					<div class="timeline">
						<!-- Step 1: Triage -->
						<div class="step card">
							<div class="step-header">
								<span class="step-num">1</span>
								<h3>Triage</h3>
								<span class="status">Success</span>
							</div>
							<div class="step-body">
								<p><strong>Intent:</strong> {runDetail.run.metadata?.intent || 'General Query'}</p>
								<div class="tags">
									{#each (runDetail.run.metadata?.tags || ['codebase_search']) as tag}
										<span class="tag">{tag}</span>
									{/each}
								</div>
							</div>
						</div>

						<!-- Step 2: Retrieve -->
						<div class="step card">
							<div class="step-header">
								<span class="step-num">2</span>
								<h3>Retrieve</h3>
							</div>
							<div class="step-body">
								<div class="sources">
									<div class="source-item">
										<span class="label">Clusters:</span>
										<span class="val">{runDetail.run.metadata?.clustersUsed || 0} used</span>
									</div>
									<div class="source-item">
										<span class="label">Lenses:</span>
										<span class="val">{runDetail.run.metadata?.lensesUsed || 0} active</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Step 3: Align -->
						<div class="step card">
							<div class="step-header">
								<span class="step-num">3</span>
								<h3>Align</h3>
							</div>
							<div class="step-body">
								<p>Reranked based on trust signals and audit weights.</p>
								{#if runDetail.run.metadata?.researchProvenance}
									<div class="provenance">Research Grounded: {runDetail.run.metadata.researchProvenance}</div>
								{/if}
							</div>
						</div>

						<!-- Step 4: Compose -->
						<div class="step card">
							<div class="step-header">
								<span class="step-num">4</span>
								<h3>Compose</h3>
							</div>
							<div class="step-body">
								<p class="preview">{runDetail.run.metadata?.summary || 'Answer generated via Gemma4.'}</p>
							</div>
						</div>

						<!-- Step 5: Encode -->
						<div class="step card">
							<div class="step-header">
								<span class="step-num">5</span>
								<h3>Encode</h3>
							</div>
							<div class="step-body">
								{#each runDetail.audits as audit}
									<div class="audit-summary" class:accepted={audit.decision === 'accepted'}>
										<strong>{audit.decision.toUpperCase()}</strong>
										<span class="gain">Gain: {audit.gainScore?.toFixed(2)}</span>
										<p>{audit.reasoning}</p>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<div class="empty-state">Select a retrieval run to view the trace</div>
				{/if}
			</main>
		</div>
	{/if}
</div>

<style>
	.retrieval-trace {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header { margin-bottom: 2rem; }
	nav a { color: #818cf8; text-decoration: none; font-size: 0.875rem; display: block; margin-bottom: 0.5rem; }

	h1 { font-size: 2rem; color: #f8fafc; }
	.subtitle { color: #64748b; font-size: 1rem; }

	.layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 2rem;
	}

	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.run-list {
		height: calc(100vh - 200px);
		overflow-y: auto;
	}

	h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; }

	.run-item {
		width: 100%;
		background: #0f172a;
		border: 1px solid #1e293b;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 0.75rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
	}

	.run-item:hover { border-color: #818cf8; }
	.run-item.active { background: #1e293b; border-color: #818cf8; box-shadow: 0 0 10px #818cf844; }

	.query { color: #f8fafc; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; }
	.meta { color: #64748b; font-size: 0.75rem; }

	.timeline {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.step-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		border-bottom: 1px solid #334155;
		padding-bottom: 0.75rem;
	}

	.step-num {
		background: #818cf8;
		color: #fff;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.75rem;
	}

	h3 { font-size: 1.125rem; color: #f8fafc; flex-grow: 1; }
	.status { font-size: 0.75rem; color: #10b981; font-weight: 600; }

	.tags { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.tag { background: #334155; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; color: #94a3b8; }

	.source-item { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; }
	.val { color: #818cf8; font-weight: 600; }

	.preview { font-size: 0.875rem; color: #cbd5e1; line-height: 1.5; font-style: italic; }

	.audit-summary {
		background: #0f172a;
		padding: 0.75rem;
		border-radius: 8px;
		border-left: 4px solid #ef4444;
	}

	.audit-summary.accepted { border-left-color: #10b981; }
	.gain { color: #f59e0b; margin-left: 1rem; }

	.empty-state {
		height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		font-style: italic;
	}
</style>
