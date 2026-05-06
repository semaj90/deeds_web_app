<script lang="ts">
	import { onMount } from 'svelte';

	let stats = $state<any[]>([]);
	let nearMisses = $state<any[]>([]);
	let allAudits = $state<any[]>([]);
	let loading = $state(true);

	async function loadData() {
		try {
			const [sRes, nRes, aRes] = await Promise.all([
				fetch('/api/code-intel/memory-gain/stats'),
				fetch('/api/code-intel/memory-gain/rejected'),
				fetch('/api/code-intel/memory-gain')
			]);
			stats = await sRes.json();
			nearMisses = await nRes.json();
			allAudits = await aRes.json();
		} catch (e) {
			console.error('Failed to load memory gain data', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Memory Quality (TRACE) | Code Intel</title>
</svelte:head>

<div class="memory-dashboard">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>Neural Quality Audit</h1>
		<p class="subtitle">TRACE Information Gain Analysis (Accepted vs. Rejected Synthesis)</p>
	</header>

	{#if loading}
		<div class="loading">Auditing memory decisions...</div>
	{:else}
		<div class="grid">
			<section class="card stats-card">
				<h2>Performance by Category</h2>
				<div class="stats-table">
					<div class="row header-row">
						<span>Type</span>
						<span>Count</span>
						<span>Avg Gain</span>
					</div>
					{#each stats as s}
						<div class="row">
							<span>{s.memoryType || 'synthesis'}</span>
							<span>{s.count}</span>
							<span class="gain">{(s.avgGain || 0).toFixed(2)}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="card near-misses">
				<h2>Rejected "Near Misses"</h2>
				<p class="desc">High-gain synthesis that failed to meet the stable threshold.</p>
				<div class="miss-list">
					{#each nearMisses as miss}
						<div class="miss-item">
							<div class="item-header">
								<span class="topic">{miss.query.slice(0, 50)}...</span>
								<span class="score">{miss.gainScore?.toFixed(2)}</span>
							</div>
							<div class="reason">{miss.reasoning}</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="card audit-trail">
				<h2>Full Decision Audit</h2>
				<div class="audit-list">
					{#each allAudits as audit}
						<div class="audit-item" class:accepted={audit.decision === 'accepted'}>
							<div class="item-header">
								<span class="decision">{audit.decision.toUpperCase()}</span>
								<span class="date">{new Date(audit.createdAt).toLocaleTimeString()}</span>
							</div>
							<div class="query">{audit.query}</div>
							<div class="reason">{audit.reasoning}</div>
							<div class="scores">
								<span>Acc: {audit.accuracyScore || '0.0'}</span>
								<span>Den: {audit.densityScore || '0.0'}</span>
								<span>Clarity: {audit.clarityScore || '0.0'}</span>
								<span>Novelty: {audit.noveltyScore || '0.0'}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.memory-dashboard {
		padding: 2rem;
		max-width: 1000px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header {
		margin-bottom: 2rem;
	}

	nav a {
		color: #818cf8;
		text-decoration: none;
		font-size: 0.875rem;
		display: block;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle {
		color: #64748b;
		font-size: 1rem;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
	}

	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 1.5rem;
		color: #94a3b8;
	}

	.stats-table {
		width: 100%;
	}

	.row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		padding: 0.75rem 0;
		border-bottom: 1px solid #334155;
	}

	.header-row {
		color: #64748b;
		font-size: 0.875rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.gain { color: #818cf8; font-weight: 600; }

	.desc { color: #64748b; margin-bottom: 1rem; font-size: 0.875rem; }

	.miss-item, .audit-item {
		background: #0f172a;
		padding: 1rem;
		border-radius: 12px;
		margin-bottom: 1rem;
		border-left: 4px solid #ef4444;
	}

	.audit-item.accepted {
		border-left-color: #10b981;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.topic, .decision { font-weight: 600; color: #f8fafc; }
	.score { color: #f59e0b; font-weight: 700; }
	.date { font-size: 0.75rem; color: #64748b; }

	.reason, .query { font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem; }
	.query { color: #cbd5e1; font-weight: 500; }

	.scores {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: #64748b;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid #1e293b;
	}
</style>
