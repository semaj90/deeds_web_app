<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, slide, scale } from 'svelte/transition';
	import SwarmManifoldVisualizer from '$lib/components/webgpu/SwarmManifoldVisualizer.svelte';

	let query = $state('Perform deep research into precedent for AI corporate liability in autonomous torts.');
	let lastRun = $state<any>(null);
	let running = $state(false);
	let error = $state<string | null>(null);

	let activeClusterIds = $derived(lastRun?.activeClusterIds || []);

	async function triggerRun() {
		running = true;
		error = null;
		lastRun = null;
		try {
			const res = await fetch('/api/research/deep', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, writeToObsidian: true }),
				signal: AbortSignal.timeout(180_000)
			});
			if (!res.ok) {
				const body = await res.json();
				throw new Error(body.error || `HTTP error! status: ${res.status}`);
			}
			lastRun = await res.json();
		} catch (e: any) {
			console.error('Subagent run failed', e);
			error = e.message;
		} finally {
			running = false;
		}
	}

	function getFamilyColor(family: string) {
		const colors: any = {
			'Research': '#818cf8', // Indigo
			'Evidence': '#34d399', // Emerald
			'Codebase': '#a855f7', // Purple
			'Graph': '#fbbf24',    // Amber
			'VectorCluster': '#f472b6', // Pink
			'Memory': '#10b981',   // Teal
			'Batch': '#6366f1',    // Blue
			'Repair': '#ef4444',   // Red
			'LegalCase': '#fb923c', // Orange
			'Simulation': '#22d3ee', // Cyan
			'GPUPerformance': '#84cc16', // Lime
			'UIDiagnostics': '#94a3b8' // Slate
		};
		return colors[family] || '#64748b';
	}
</script>

<svelte:head>
	<title>TRACE Subagent Swarm | Deeds AI</title>
</svelte:head>

<div class="subagent-dashboard">
	<header class="header" in:fade={{ duration: 800 }}>
		<nav><a href="/code-intel" class="back-link">← Return to Knowledge Atlas</a></nav>
		<div class="title-group">
			<h1>TRACE <span class="accent">Subagent Swarm</span></h1>
			<p class="subtitle">DAG-Driven Orchestration: High-Performance Retrieval & Synthesis</p>
		</div>
	</header>
    
    <div class="manifold-wrapper" in:fade={{ delay: 400 }}>
        <SwarmManifoldVisualizer {activeClusterIds} width={900} height={320} />
    </div>

	<section class="mission-input card glass" in:slide={{ delay: 200 }}>
		<div class="input-wrapper">
			<label for="query">Mission Objective</label>
			<textarea 
				id="query" 
				bind:value={query} 
				placeholder="Define the research or analysis objective..."
				disabled={running}
			></textarea>
		</div>
		<button class="run-btn" disabled={running || !query} onclick={triggerRun}>
			{#if running}
				<span class="pulse"></span> Initializing Neural Swarm...
			{:else}
				Launch Deep Research Mission
			{/if}
		</button>
		{#if error}
			<p class="error-msg" transition:fade>{error}</p>
		{/if}
	</section>

	{#if lastRun}
		<div class="results-container" in:fade>
			<section class="dag-view card glass">
				<div class="section-header">
					<h2>Mission Execution Log</h2>
					<div class="runtime-tag">
						{lastRun.plan?.runtime?.backend || 'Hermes'} • {lastRun.plan?.runtime?.weightQuant || 'RotorQuant'}
					</div>
				</div>

				<div class="timeline">
					{#each lastRun.plan?.steps || [] as step, i}
						<div 
							class="agent-card" 
							in:scale={{ delay: i * 100, start: 0.95 }}
							style:border-left-color={getFamilyColor(step.family || 'Research')}
						>
							<div class="card-header">
								<div class="name-group">
									<span class="family">{step.family || 'Research'}</span>
									<span class="name">{step.name.replace(/_/g, ' ')}</span>
								</div>
								<span class="status">Success</span>
							</div>
							<div class="card-body">
								<p class="desc">{step.description || 'Executing autonomous sub-task...'}</p>
							</div>
						</div>
					{/each}
				</div>
				
				<div class="mission-footer">
					<div class="run-id">Mission ID: <code>{lastRun.artifacts?.missionId?.slice(0, 8) || 'N/A'}</code></div>
					<div class="total">Mission Complete</div>
				</div>
			</section>

			<section class="synthesis card glass" in:slide={{ delay: 400 }}>
				<h2>Mission Synthesis</h2>
				<div class="answer-prose">
					{lastRun.answer}
				</div>
				{#if lastRun.artifacts?.obsidianPath}
					<div class="artifact-link">
						<span class="icon">📄</span>
						Persisted to: <code>{lastRun.artifacts.obsidianPath}</code>
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background: #020617;
		background-image: 
			radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.1) 0, transparent 50%),
			radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.1) 0, transparent 50%);
		background-attachment: fixed;
	}

	.subagent-dashboard {
		padding: 3rem 2rem;
		max-width: 900px;
		margin: 0 auto;
		color: #e2e8f0;
		font-family: 'Outfit', sans-serif;
	}

    .manifold-wrapper { margin-bottom: 2rem; }

	.header { margin-bottom: 3rem; }
	.back-link { 
		color: #818cf8; 
		text-decoration: none; 
		font-size: 0.875rem; 
		font-weight: 500;
		transition: color 0.2s;
	}
	.back-link:hover { color: #a5b4fc; }

	.title-group { margin-top: 1rem; }
	h1 { font-size: 2.5rem; color: #f8fafc; font-weight: 800; letter-spacing: -0.025em; }
	.accent { 
		background: linear-gradient(135deg, #818cf8 0%, #a855f7 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.subtitle { color: #94a3b8; font-size: 1.125rem; margin-top: 0.5rem; }

	.card {
		background: rgba(30, 41, 59, 0.5);
		border: 1px solid rgba(51, 65, 85, 0.5);
		border-radius: 24px;
		padding: 2rem;
		margin-bottom: 2rem;
	}

	.glass {
		backdrop-filter: blur(12px);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	.input-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	label { font-size: 0.875rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
	
	textarea {
		background: rgba(15, 23, 42, 0.8);
		border: 1px solid #334155;
		border-radius: 12px;
		padding: 1rem;
		color: #f8fafc;
		font-family: inherit;
		font-size: 1rem;
		min-height: 100px;
		resize: vertical;
		transition: border-color 0.2s;
	}
	textarea:focus { outline: none; border-color: #6366f1; }

	.run-btn {
		width: 100%;
		background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
		color: #fff;
		border: none;
		padding: 1.25rem;
		border-radius: 16px;
		font-weight: 700;
		font-size: 1.125rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
	}

	.run-btn:hover:not(:disabled) { 
		transform: translateY(-2px);
		box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.4);
	}
	.run-btn:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }

	.error-msg { color: #ef4444; font-size: 0.875rem; margin-top: 1rem; font-weight: 500; }

	.pulse {
		width: 12px;
		height: 12px;
		background: #fff;
		border-radius: 50%;
		animation: pulse 1.5s infinite;
		margin-right: 0.5rem;
	}

	@keyframes pulse {
		0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
		70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }
		100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	h2 { font-size: 1.5rem; color: #f8fafc; font-weight: 700; }
	
	.runtime-tag {
		background: rgba(30, 41, 59, 0.8);
		padding: 0.5rem 1rem;
		border-radius: 99px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #94a3b8;
		border: 1px solid #334155;
	}

	.timeline {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1.25rem;
	}

	.agent-card {
		background: rgba(15, 23, 42, 0.6);
		padding: 1.25rem;
		border-radius: 16px;
		border-left: 4px solid #64748b;
		transition: transform 0.2s;
	}
	.agent-card:hover { transform: translateY(-4px); }

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.name-group { display: flex; flex-direction: column; }
	.family { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; }
	.name { font-weight: 600; color: #f8fafc; font-size: 0.9375rem; margin-top: 0.25rem; }
	.status { font-size: 0.625rem; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 800; text-transform: uppercase; }

	.desc { font-size: 0.8125rem; color: #94a3b8; line-height: 1.4; }

	.mission-footer {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid #334155;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.run-id code { background: #0f172a; padding: 0.25rem 0.5rem; border-radius: 4px; color: #818cf8; }
	.total { font-weight: 700; color: #10b981; text-transform: uppercase; font-size: 0.875rem; letter-spacing: 0.1em; }

	.answer-prose {
		line-height: 1.8;
		color: #cbd5e1;
		font-size: 1.125rem;
		white-space: pre-wrap;
	}

	.artifact-link {
		margin-top: 2rem;
		background: rgba(99, 102, 241, 0.1);
		border: 1px solid rgba(99, 102, 241, 0.2);
		padding: 1rem;
		border-radius: 12px;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
	}
	.artifact-link code { color: #a5b4fc; }
</style>
