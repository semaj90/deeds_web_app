<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let clusterKey = $derived(page.params.clusterKey);
	let details = $state<any>(null);
	let lenses = $state<any[]>([]);
	let loading = $state(true);
	let activeLens = $state('purpose');

	async function loadClusterData() {
		loading = true;
		try {
			const [dRes, lRes] = await Promise.all([
				fetch(`/api/code-intel/clusters/${clusterKey}`),
				fetch(`/api/code-intel/clusters/${clusterKey}/lenses`)
			]);
			details = await dRes.json();
			lenses = await lRes.json();
		} catch (e) {
			console.error('Failed to load cluster details', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadClusterData();
	});

	let currentLensContent = $derived(
		lenses.find(l => l.lens_type === activeLens)?.summary_long || 
		lenses.find(l => l.lens_type === activeLens)?.summary_short ||
		'No summary available for this lens.'
	);
</script>

<svelte:head>
	<title>Cluster: {clusterKey} | Code Intel</title>
</svelte:head>

<div class="cluster-drilldown">
	<header class="header">
		<nav><a href="/code-intel">← Back to Atlas</a></nav>
		<h1>Cluster: <span class="highlight">{details?.cluster?.label || clusterKey}</span></h1>
		<div class="meta">
			<span class="count">{details?.cluster?.memberCount || 0} members</span>
			<span class="score">Avg Score: {details?.cluster?.avgScore?.toFixed(2)}</span>
		</div>
	</header>

	{#if loading}
		<div class="loading">Drilling into semantic neighborhood...</div>
	{:else}
		<div class="layout">
			<aside class="sidebar">
				<section class="card lens-selector">
					<h2>Summary Lenses</h2>
					<p class="desc">Multi-perspective architectural views of this cluster.</p>
					<div class="lens-list">
						{#each ['purpose', 'api_surface', 'risk', 'dependencies', 'retrieval_role'] as lens}
							<button 
								class="lens-btn" 
								class:active={activeLens === lens}
								onclick={() => activeLens = lens}
							>
								{lens.replace('_', ' ')}
							</button>
						{/each}
					</div>
				</section>

				<section class="card tags-card">
					<h2>Cluster Tags</h2>
					<div class="tags">
						{#each (details?.cluster?.tags || []) as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				</section>
			</aside>

			<main class="main-content">
				<section class="card lens-content">
					<h2>{activeLens.replace('_', ' ').toUpperCase()}</h2>
					<div class="content-body">
						{currentLensContent}
					</div>
				</section>

				<section class="card members-card">
					<h2>Member Artifacts</h2>
					<div class="members-table">
						<div class="row header-row">
							<span>Path</span>
							<span>Score</span>
							<span>Tags</span>
						</div>
						{#each (details?.members || []) as member}
							<div class="row">
								<span class="path">{member.filePath || member.stableKey}</span>
								<span class="score">{member.membershipScore?.toFixed(2)}</span>
								<div class="tags-mini">
									{#each (member.tags || []).slice(0, 3) as tag}
										<span class="tag-mini">{tag}</span>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			</main>
		</div>
	{/if}
</div>

<style>
	.cluster-drilldown {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

	.header { margin-bottom: 2rem; }
	
	nav a {
		color: #818cf8;
		text-decoration: none;
		font-size: 0.875rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	h1 { font-size: 2.5rem; color: #f8fafc; }
	.highlight { color: #a855f7; }

	.meta {
		display: flex;
		gap: 2rem;
		color: #64748b;
		margin-top: 0.5rem;
	}

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
		margin-bottom: 2rem;
	}

	h2 { font-size: 1.125rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }

	.desc { font-size: 0.875rem; color: #64748b; margin-bottom: 1.5rem; }

	.lens-list { display: flex; flex-direction: column; gap: 0.5rem; }

	.lens-btn {
		background: #0f172a;
		border: 1px solid #1e293b;
		color: #94a3b8;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
		text-transform: capitalize;
		transition: all 0.2s;
	}

	.lens-btn:hover { background: #1e293b; color: #f8fafc; }
	.lens-btn.active { background: #818cf8; color: #fff; border-color: #818cf8; }

	.tags { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.tag { background: #0f172a; color: #818cf8; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; border: 1px solid #1e293b; }

	.content-body {
		font-size: 1.125rem;
		line-height: 1.6;
		color: #cbd5e1;
		white-space: pre-wrap;
	}

	.members-table { width: 100%; }
	.row { display: grid; grid-template-columns: 2fr 80px 1fr; padding: 0.75rem 0; border-bottom: 1px solid #334155; align-items: center; }
	.header-row { color: #64748b; font-size: 0.875rem; font-weight: 600; }
	.path { font-family: monospace; font-size: 0.875rem; color: #818cf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.score { color: #f59e0b; font-weight: 700; text-align: center; }

	.tags-mini { display: flex; gap: 0.25rem; }
	.tag-mini { background: #0f172a; font-size: 0.625rem; padding: 0.1rem 0.4rem; border-radius: 4px; color: #64748b; }
</style>