<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let workflowBusy = false;
	let workflowStatus = '';

	const board = () => data.dailyGraphifyBoard;

	async function queueWorkflow(taskId: string) {
		workflowBusy = true;
		workflowStatus = '';

		try {
			const response = await fetch('/api/phase89/workflow', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ taskId, dryRun: false }),
			});
			const payload = await response.json().catch(() => null);
			workflowStatus = response.ok
				? `Queued ${taskId}${payload?.result?.queuedRoutes?.length ? ` for ${payload.result.queuedRoutes.join(', ')}` : ''}`
				: payload?.error ?? 'Workflow queue failed';
		} catch (error) {
			workflowStatus = error instanceof Error ? error.message : 'Workflow queue failed';
		} finally {
			workflowBusy = false;
		}
	}
</script>

<div class="ai-dashboard-hub">
	<header class="hub-header">
		<div>
			<p class="eyebrow">Admin AI Surfaces</p>
			<h1>AI Dashboard</h1>
			<p class="subtitle">The mixed panel page has been split into route-specific surfaces for operator workflows and lab tooling.</p>
		</div>
		<div class="status-chip">
			<Icon name="split-square-horizontal" class="w-4 h-4" />
			Route split active
		</div>
	</header>

	<section class="hub-grid">
		<a class="hub-card operator" href="/admin/ai-dashboard/operator">
			<div class="card-topline">Production Operator</div>
			<h2>Operator Console</h2>
			<p>Active route-backed workflows for chat, retrieval review, intake, search, and model control.</p>
			<span class="card-link">Open operator route</span>
		</a>

		<a class="hub-card lab" href="/admin/ai-dashboard/lab">
			<div class="card-topline">Experimental + Demo</div>
			<h2>Lab Console</h2>
			<p>Validation, image analysis, GPU-heavy investigation tools, training telemetry, and architecture demos.</p>
			<span class="card-link">Open lab route</span>
		</a>

		<a class="hub-card assistant" href="/admin/search-intelligence">
			<div class="card-topline">Contextual Chat</div>
			<h2>Assistant Console</h2>
			<p>DenseRAG + GraphRAG query fusion for admin search, topology, and evidence-aware support.</p>
			<span class="card-link">Open contextual assistant</span>
		</a>

		<a class="hub-card lab" href="/admin/atlas">
			<div class="card-topline">Retrieval Telemetry</div>
			<h2>Atlas Studio</h2>
			<p>CHR97 fast-path, Qdrant fallback, Redis cache, and sourceRefs in one operator surface.</p>
			<span class="card-link">Open atlas studio</span>
		</a>

		<a class="hub-card infrastructure" href="/admin/graphify-readiness">
			<div class="card-topline">Infrastructure Status</div>
			<h2>Graphify Readiness</h2>
			<p>Lane-by-lane pipeline status: core structural, optional enrichment, and gated integrations.</p>
			<span class="card-link">Open readiness dashboard</span>
		</a>
	</section>

	<section class="board-shell">
		<div class="board-header">
			<div>
				<p class="eyebrow">Daily Graphify</p>
				<h2>Kanban Task Board</h2>
				<p class="subtitle compact">
					Promoted recommendation work flows into the daily board. Review-required proposals remain visible but do not become tasks.
				</p>
			</div>
			<div class="board-meta">
				<div>
					<span class="meta-label">Collection</span>
					<strong>{board().collection}</strong>
				</div>
				<div>
					<span class="meta-label">Updated</span>
					<strong>{new Date(board().generated).toLocaleString()}</strong>
				</div>
			</div>
		</div>

		<div class="board-grid">
			{#each board().columns as column}
				<div class="priority-column">
					<div class="column-head">
						<h3>{column.label}</h3>
						<span>{column.tasks.length}</span>
					</div>

					{#if column.tasks.length === 0}
						<p class="empty-state">No tasks.</p>
					{:else}
						{#each column.tasks as task}
							<article class="task-card">
								<div class="task-topline">
									<span>{task.id}</span>
									{#if task.status}
										<span class="task-status">{task.status}</span>
									{/if}
								</div>
								<h4>{task.label}</h4>
								{#if task.gate}
									<p>{task.gate}</p>
								{/if}
								{#if task.blockedBy?.length}
									<div class="chip-row">
										{#each task.blockedBy as blocker}
											<span class="chip">blocked by {blocker}</span>
										{/each}
									</div>
								{/if}
								{#if task.script}
									<div class="task-actions">
										<button
											class="workflow-button"
											type="button"
											on:click={() => queueWorkflow(task.id)}
											disabled={workflowBusy}
										>
											<Icon name="play" class="w-3.5 h-3.5" />
											Queue validation
										</button>
									</div>
								{/if}
							</article>
						{/each}
					{/if}
				</div>
			{/each}
		</div>

		<div class="board-footer">
			<div class="footer-card">
				<span class="meta-label">Promotion</span>
				<strong>{board().recommendationPromotion.promotedCount}/{board().recommendationPromotion.proposalCount} promoted</strong>
			</div>
			<div class="footer-card">
				<span class="meta-label">Review Required</span>
				<strong>{board().recommendationPromotion.reviewRequiredCount}</strong>
			</div>
			<div class="footer-card">
				<span class="meta-label">Warnings</span>
				<strong>{board().warnings.length ? board().warnings.join(', ') : 'none'}</strong>
			</div>
			<div class="footer-card workflow-card">
				<span class="meta-label">Workflow</span>
				<strong>{workflowStatus || 'Board-driven validation queued from task cards'}</strong>
			</div>
		</div>
	</section>
</div>

<style>
	.ai-dashboard-hub {
		min-height: 100vh;
		margin: -2.5rem;
		padding: 2.5rem;
		background:
			radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 32%),
			radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.08), transparent 28%),
			#0e0d0b;
		color: rgb(212 199 163);
	}

	.hub-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.48);
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 1;
		color: rgba(245, 240, 223, 0.96);
	}

	.subtitle {
		margin: 0.8rem 0 0;
		max-width: 52rem;
		color: rgba(212, 199, 163, 0.72);
		font-size: 0.98rem;
		line-height: 1.6;
	}

	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 999px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		background: rgba(96, 165, 250, 0.1);
		color: #93c5fd;
		padding: 0.55rem 0.9rem;
		font-size: 0.78rem;
		white-space: nowrap;
	}

	.hub-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.board-shell {
		margin-top: 2rem;
		padding: 1.25rem;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 18px;
		background: rgba(14, 15, 18, 0.82);
		box-shadow: 0 20px 44px rgba(0, 0, 0, 0.22);
	}

	.board-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	.compact {
		max-width: 56rem;
		font-size: 0.92rem;
	}

	.board-meta {
		display: grid;
		gap: 0.75rem;
		min-width: 14rem;
	}

	.board-meta strong {
		display: block;
		margin-top: 0.2rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.meta-label {
		display: block;
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.52);
	}

	.board-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.9rem;
	}

	.priority-column {
		min-height: 240px;
		padding: 0.95rem;
		border-radius: 14px;
		background: rgba(19, 21, 25, 0.76);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.column-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.column-head h3 {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.column-head span {
		font-size: 0.78rem;
		color: #93c5fd;
	}

	.task-card {
		padding: 0.9rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.08);
		margin-bottom: 0.75rem;
	}

	.task-topline {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.52);
		margin-bottom: 0.35rem;
	}

	.task-status {
		color: #93c5fd;
	}

	.task-card h4 {
		margin: 0;
		font-size: 0.96rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.task-card p {
		margin: 0.35rem 0 0;
		font-size: 0.84rem;
		color: rgba(212, 199, 163, 0.72);
		line-height: 1.5;
	}

	.task-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.7rem;
	}

	.workflow-button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(96, 165, 250, 0.24);
		background: rgba(96, 165, 250, 0.08);
		color: #bfdbfe;
		border-radius: 10px;
		padding: 0.5rem 0.75rem;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.workflow-button:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.6rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 0.22rem 0.52rem;
		border-radius: 999px;
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.18);
		font-size: 0.68rem;
		color: #bfdbfe;
	}

	.empty-state {
		margin: 0;
		color: rgba(212, 199, 163, 0.45);
		font-size: 0.84rem;
	}

	.board-footer {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-top: 0.9rem;
	}

	.footer-card {
		padding: 0.85rem 0.95rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.workflow-card strong {
		line-height: 1.4;
	}

	.hub-card {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-height: 240px;
		padding: 1.35rem;
		border-radius: 18px;
		text-decoration: none;
		color: inherit;
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(19, 21, 25, 0.86);
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
		transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
	}

	.hub-card:hover {
		transform: translateY(-3px);
	}

	.hub-card.operator:hover {
		border-color: rgba(34, 197, 94, 0.28);
		background: rgba(19, 25, 21, 0.92);
	}

	.hub-card.lab:hover {
		border-color: rgba(245, 158, 11, 0.28);
		background: rgba(25, 21, 17, 0.92);
	}

	.hub-card.assistant:hover {
		border-color: rgba(96, 165, 250, 0.28);
		background: rgba(17, 22, 28, 0.92);
	}

	.hub-card.infrastructure:hover {
		border-color: rgba(168, 85, 247, 0.28);
		background: rgba(24, 20, 28, 0.92);
	}

	.card-topline {
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.5);
	}

	h2 {
		margin: 0;
		font-size: 1.4rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.hub-card p {
		margin: 0;
		color: rgba(212, 199, 163, 0.7);
		line-height: 1.65;
	}

	.card-link {
		margin-top: auto;
		font-size: 0.82rem;
		color: #93c5fd;
	}

	@media (max-width: 720px) {
		.hub-header {
			flex-direction: column;
		}
	}
</style>
