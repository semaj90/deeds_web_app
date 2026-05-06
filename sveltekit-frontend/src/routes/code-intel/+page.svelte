<script lang="ts">
	import { onMount } from 'svelte';

	let health = $state<any>(null);
	let latestStats = $state<any>(null);
	let memoryGains = $state<any[]>([]);
	let clusters = $state<any[]>([]);
	let loading = $state(true);

	async function loadData() {
		try {
			const [hRes, sRes, mRes, cRes] = await Promise.all([
				fetch('/api/code-intel/health'),
				fetch('/api/code-intel/latest-index'),
				fetch('/api/code-intel/memory-gain'),
				fetch('/api/code-intel/clusters')
			]);

			health = await hRes.json();
			latestStats = await sRes.json();
			memoryGains = await mRes.json();
			clusters = await cRes.json();
		} catch (e) {
			console.error('Failed to load code intel data', e);
		} finally {
			loading = false;
		}
	}

	async function runHealthCheck() {
		try {
			const res = await fetch('/api/code-intel/health');
			health = await res.json();
		} catch (e) {
			console.error('Health check failed', e);
		}
	}

	async function createClaudePlan() {
		try {
			const res = await fetch('/api/code-intel/claude-plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ goal: 'Improve codebase intelligence pipeline', scope: 'full' })
			});
			const plan = await res.json();
			console.log('[code-intel] Claude plan:', plan);
		} catch (e) {
			console.error('Plan generation failed', e);
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Code Intelligence Dashboard | Deeds</title>
</svelte:head>

<div class="intel-dashboard">
	<header class="header">
		<h1>Codebase Intelligence Atlas</h1>
		<div class="header-actions">
			<button class="nav-btn smoke-btn" onclick={runHealthCheck}>Run Smoke Test</button>
			<a href="/code-intel/subagents" class="nav-btn">Subagent Swarm</a>
			<a href="/code-intel/research" class="nav-btn">Research Provenance</a>
			<div class="status-badge" class:healthy={health?.status === 'healthy'}>
				{health?.status || 'Unknown'}
			</div>
		</div>
	</header>

	{#if loading}
		<div class="loading">Analyzing neural patterns...</div>
	{:else}
		<div class="summary-strip card">
			<div class="sum-item">
				<span class="sum-val">{health?.memoryGain?.totalDecisions || 0}</span>
				<span class="sum-lab">Knowledge Events</span>
			</div>
			<div class="sum-item">
				<span class="sum-val">{health?.clusters || 0}</span>
				<span class="sum-lab">Semantic Clusters</span>
			</div>
			<div class="sum-item">
				<span class="sum-val">{health?.totalTraceRuns || 0}</span>
				<span class="sum-lab">TRACE Executions</span>
			</div>
			<div class="sum-item">
				<span class="sum-val">{health?.memoryGain?.averageGainScore || '0.00'}</span>
				<span class="sum-lab">Avg Information Gain</span>
			</div>
		</div>

		<div class="grid">
			<!-- System Health -->
			<section class="card health-card">
				<h2>System Infrastructure</h2>
				<div class="health-grid">
					{#each Object.entries(health?.checks || {}) as [service, status]}
						<div class="health-item">
							<span class="service">{service}</span>
							<span class="status" class:ok={status === 'ok'}>{status}</span>
						</div>
					{/each}
				</div>
				<div class="action-footer">
					<button class="action-btn" onclick={createClaudePlan}>Generate Claude Plan</button>
				</div>
			</section>

			<!-- Latest Index Stats -->
			<section class="card stats-card">
				<h2>Latest Index Run</h2>
				{#if latestStats}
					<div class="stat-row">
						<span class="label">Run ID:</span>
						<span class="value">{latestStats.runId}</span>
					</div>
					<div class="stat-row">
						<span class="label">Completed:</span>
						<span class="value">{new Date(latestStats.createdAt).toLocaleString()}</span>
					</div>
					<div class="stat-grid">
						<div class="stat-box">
							<div class="num">{latestStats.metadata?.filesSeen || 0}</div>
							<div class="lab">Files</div>
						</div>
						<div class="stat-box">
							<div class="num">{latestStats.metadata?.chunksCreated || 0}</div>
							<div class="lab">Chunks</div>
						</div>
						<div class="stat-box">
							<div class="num">{latestStats.metadata?.wikiNotes || 0}</div>
							<div class="lab">Wiki Notes</div>
						</div>
					</div>
				{:else}
					<p>No index runs recorded yet.</p>
				{/if}
				<div class="action-footer">
					<a href="/code-intel/topology" class="link-text">Open Topology Explorer →</a>
				</div>
			</section>

			<!-- Memory Gain Stats -->
			<section class="card memory-card">
				<h2>Neural Learning Feed</h2>
				<div class="memory-list">
					{#each memoryGains.slice(0, 5) as gain}
						<div class="memory-item" class:rejected={gain.decision === 'rejected'}>
							<div class="item-header">
								<span class="topic">{gain.query.slice(0, 40)}...</span>
								<span class="score">+{gain.gainScore?.toFixed(2)}</span>
							</div>
							<div class="reason">{gain.reasoning}</div>
						</div>
					{/each}
				</div>
				<div class="action-footer">
					<a href="/code-intel/memory" class="link-text">View Quality Audit →</a>
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.intel-dashboard {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.nav-btn {
		text-decoration: none;
		background: #334155;
		color: #f8fafc;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		transition: background 0.2s;
	}

	.nav-btn:hover {
		background: #475569;
	}

	h1 {
		font-size: 2.5rem;
		background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.status-badge {
		padding: 0.5rem 1rem;
		border-radius: 20px;
		background: #ef444422;
		color: #ef4444;
		border: 1px solid #ef444444;
		font-weight: 600;
	}

	.status-badge.healthy {
		background: #10b98122;
		color: #10b981;
		border: 1px solid #10b98144;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 2rem;
	}

	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 16px;
		padding: 1.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 1.5rem;
		color: #94a3b8;
		border-bottom: 1px solid #334155;
		padding-bottom: 0.5rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.label { color: #64748b; }
	.value { font-weight: 600; }

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.stat-box {
		background: #0f172a;
		padding: 1rem;
		border-radius: 12px;
		text-align: center;
	}

	.num { font-size: 1.5rem; font-weight: 700; color: #818cf8; }
	.lab { font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-top: 0.25rem; }

	.memory-list, .cluster-list {
		margin-top: 1.5rem;
	}

	h3 { font-size: 1rem; color: #64748b; margin-bottom: 1rem; }

	.memory-item, .cluster-item {
		background: #0f172a;
		padding: 1rem;
		border-radius: 12px;
		margin-bottom: 1rem;
		border-left: 4px solid #10b981;
	}

	.memory-item.rejected {
		border-left-color: #ef4444;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.topic, .name { font-weight: 600; color: #f8fafc; }
	.score, .count { font-size: 0.875rem; color: #64748b; }

	.reason { font-size: 0.875rem; color: #94a3b8; }
</style>
