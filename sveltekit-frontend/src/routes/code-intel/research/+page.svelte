<script lang="ts">
	import { onMount } from 'svelte';

	let researchStats = $state<any[]>([]);
	let loading = $state(true);

	async function loadResearch() {
		try {
			const res = await fetch('/api/code-intel/research-memory');
			researchStats = await res.json();
		} catch (e) {
			console.error('Failed to load research memory', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadResearch();
	});

	function getTierColor(tier: string) {
		switch (tier) {
			case 'official_or_primary': return '#10b981';
			case 'trusted_community': return '#3b82f6';
			case 'unverified': return '#f59e0b';
			default: return '#64748b';
		}
	}
</script>

<svelte:head>
	<title>Research Provenance | Code Intel</title>
</svelte:head>

<div class="research-dashboard">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>Research Provenance</h1>
		<p class="subtitle">Cross-lane evidence grounding (Internal Truth ↔ External Evidence)</p>
	</header>

	{#if loading}
		<div class="loading">Tracing provenance across the hypergraph...</div>
	{:else}
		<div class="grid">
			<section class="card summary-card">
				<h2>External Memory Loop</h2>
				<div class="stat-grid">
					<div class="stat-box">
						<div class="num">{researchStats.filter(r => r.decision === 'accepted').length}</div>
						<div class="lab">Encoded Notes</div>
					</div>
					<div class="stat-box">
						<div class="num">
							{(researchStats.reduce((acc, r) => acc + (r.gainScore || 0), 0) / (researchStats.length || 1)).toFixed(2)}
						</div>
						<div class="lab">Avg Gain</div>
					</div>
				</div>
			</section>

			<section class="card notes-card">
				<h2>Research Encoded in Wiki</h2>
				<div class="notes-list">
					{#each researchStats as research}
						<div class="research-item" style:border-left-color={getTierColor(research.metadata?.tier)}>
							<div class="item-header">
								<span class="topic">{research.query.slice(0, 50)}...</span>
								<span class="badge" style:background={getTierColor(research.metadata?.tier) + '22'} style:color={getTierColor(research.metadata?.tier)}>
									{research.metadata?.tier || 'unknown'}
								</span>
							</div>
							<div class="meta">
								<span class="gain">Gain: {research.gainScore?.toFixed(2)}</span>
								<span class="date">{new Date(research.createdAt).toLocaleDateString()}</span>
							</div>
							<p class="reasoning">{research.reasoning}</p>
							{#if research.metadata?.linkedFiles?.length > 0}
								<div class="links">
									<strong>Linked Code:</strong>
									{#each research.metadata.linkedFiles as file}
										<span class="file-tag">{file.split('/').pop()}</span>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<p class="empty">No external research has been encoded yet.</p>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.research-dashboard {
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
		background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
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

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
	}

	.stat-box {
		background: #0f172a;
		padding: 1.5rem;
		border-radius: 12px;
		text-align: center;
	}

	.num { font-size: 2rem; font-weight: 700; color: #10b981; }
	.lab { font-size: 0.875rem; color: #64748b; margin-top: 0.5rem; }

	.research-item {
		background: #0f172a;
		padding: 1.25rem;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		border-left: 5px solid #64748b;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.topic { font-weight: 600; font-size: 1.125rem; color: #f8fafc; }
	
	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.meta {
		display: flex;
		gap: 1.5rem;
		font-size: 0.875rem;
		color: #64748b;
		margin-bottom: 0.75rem;
	}

	.reasoning {
		font-size: 0.9375rem;
		color: #cbd5e1;
		line-height: 1.5;
		margin-bottom: 1rem;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.875rem;
	}

	.file-tag {
		background: #1e293b;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		color: #818cf8;
		border: 1px solid #334155;
	}

	.empty {
		text-align: center;
		color: #64748b;
		padding: 3rem 0;
	}
</style>
