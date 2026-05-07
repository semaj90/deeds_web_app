<script lang="ts">
	import { onMount } from 'svelte';

	let lastRun = $state<any>(null);
	let running = $state(false);

	async function triggerRun() {
		running = true;
		try {
			const res = await fetch('/api/trace/subagents/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: 'Test full TRACE DAG execution',
					filePaths: ['src/lib/server/ai/gemma4-agent.ts', 'src/lib/server/indexer/karpathy-hook.ts']
				}),
				signal: AbortSignal.timeout(120_000)
			});
			lastRun = await res.json();
		} catch (e) {
			console.error('Subagent run failed', e);
		} finally {
			running = false;
		}
	}

	function getAgentColor(name: string) {
		const colors: any = {
			ontology_sortation: '#818cf8',
			chunk_stream_indexing: '#34d399',
			cluster_mapping: '#a855f7',
			ranking: '#fbbf24',
			llm_synthesis: '#f472b6',
			memory_encoding: '#10b981',
			topology_update: '#6366f1'
		};
		return colors[name] || '#64748b';
	}
</script>

<svelte:head>
	<title>Subagent Swarm | Code Intel</title>
</svelte:head>

<div class="subagent-dashboard">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>TRACE Subagent Swarm</h1>
		<p class="subtitle">Modular Intelligence DAG: Research, Ontology, Indexing, and Synthesis</p>
	</header>

	<section class="controls card">
		<button class="run-btn" disabled={running} onclick={triggerRun}>
			{#if running} Initializing Swarm... {:else} Trigger Intelligence Run {/if}
		</button>
	</section>

	{#if lastRun}
		<section class="dag-view card">
			<h2>Execution Timeline</h2>
			<div class="timeline">
				{#each lastRun.results as result}
					<div class="agent-card" style:border-left-color={getAgentColor(result.agent)}>
						<div class="card-header">
							<span class="name">{result.agent.replace(/_/g, ' ')}</span>
							<span class="status" class:failed={result.status === 'failed'}>{result.status}</span>
						</div>
						<div class="card-body">
							<div class="duration">{result.durationMs}ms</div>
							{#if result.error}
								<div class="error">{result.error}</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			<div class="total">Total Duration: {lastRun.totalDurationMs}ms</div>
		</section>
	{/if}
</div>

<style>
	.subagent-dashboard {
		padding: 2rem;
		max-width: 800px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header { margin-bottom: 2rem; }
	nav a { color: #818cf8; text-decoration: none; font-size: 0.875rem; display: block; margin-bottom: 0.5rem; }

	h1 { font-size: 2rem; color: #f8fafc; }
	.subtitle { color: #64748b; font-size: 1rem; }

	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.run-btn {
		width: 100%;
		background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
		color: #fff;
		border: none;
		padding: 1rem;
		border-radius: 12px;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		transition: transform 0.2s;
	}

	.run-btn:hover:not(:disabled) { transform: translateY(-2px); }
	.run-btn:disabled { opacity: 0.6; cursor: not-allowed; }

	h2 { font-size: 1.25rem; margin-bottom: 1.5rem; color: #94a3b8; text-transform: uppercase; }

	.timeline {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.agent-card {
		background: #0f172a;
		padding: 1rem;
		border-radius: 12px;
		border-left: 4px solid #64748b;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.name { font-weight: 600; text-transform: capitalize; color: #f8fafc; }
	.status { font-size: 0.75rem; color: #10b981; font-weight: 700; text-transform: uppercase; }
	.status.failed { color: #ef4444; }

	.duration { font-size: 0.875rem; color: #64748b; }
	.error { font-size: 0.75rem; color: #ef4444; margin-top: 0.5rem; }

	.total {
		margin-top: 2rem;
		text-align: right;
		color: #94a3b8;
		font-weight: 600;
	}
</style>
