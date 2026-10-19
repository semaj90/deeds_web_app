<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let workflowBusy = $state(false);
	let workflowStatus = $state('');
	let showAllRuntimeErrors = $state(false);
	let showTop100Tasks = $state(false);
	let runtimeErrorOverride = $state<PageData['runtimeErrorPriorities'] | null>(null);
	const runtimeErrorPriorities = $derived(runtimeErrorOverride ?? data.runtimeErrorPriorities);
	let runtimeErrorsRefreshing = $state(false);
	let runtimeErrorsRefreshFailed = $state(false);
	let runtimeErrorsUpdatedAt = $state(new Date().toISOString());

	$effect(() => {
		if (data.runtimeErrorPriorities.status) runtimeErrorOverride = null;
	});

	async function refreshRuntimeErrors() {
		if (runtimeErrorsRefreshing || document.visibilityState !== 'visible') return;
		runtimeErrorsRefreshing = true;
		try {
			const response = await fetch('/api/admin/ai-dashboard/runtime-errors', {
				headers: { accept: 'application/json' },
				cache: 'no-store',
			});
			if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
			const report = (await response.json()) as typeof runtimeErrorPriorities;
			if (
				(report.status === 'AVAILABLE' || report.status === 'UNAVAILABLE') &&
				Array.isArray(report.top10) && Array.isArray(report.top100)
			) {
				runtimeErrorOverride = report;
				runtimeErrorsUpdatedAt = new Date().toISOString();
				runtimeErrorsRefreshFailed = false;
			}
		} catch {
			runtimeErrorsRefreshFailed = true;
		} finally {
			runtimeErrorsRefreshing = false;
		}
	}

	onMount(() => {
		const interval = window.setInterval(() => void refreshRuntimeErrors(), 15_000);
		return () => window.clearInterval(interval);
	});

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
				<h2>Daily Diagnostic Board</h2>
				<p class="subtitle compact">
					File-backed diagnostic proposals, separate from PostgreSQL Kanban tasks and the
					<a href="/admin/atlas/task-sources">OpenSpec source index</a>.
					Proposals do not authorize execution; reviewed recommendations remain in their own lanes.
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
				<div>
					<span class="meta-label">Board Source</span>
					<strong>{board().boardSource}</strong>
				</div>
			</div>
		</div>

		<section class="runtime-errors" aria-labelledby="runtime-errors-title">
			<div class="ledger-head">
				<div>
					<h3 id="runtime-errors-title">Runtime error priority</h3>
					<p class="subtitle compact">Diagnostic-only, grouped from the last 30 days across client error events and unresolved server error logs. Severity, repeat count, and recency form a heuristic score; these are not Kanban tasks or verified Graphify findings.</p>
				</div>
				<div class="runtime-error-controls" aria-label="Runtime error ranking size">
					<button type="button" aria-pressed={!showAllRuntimeErrors} onclick={() => (showAllRuntimeErrors = false)}>Top 10</button>
					<button type="button" aria-pressed={showAllRuntimeErrors} onclick={() => (showAllRuntimeErrors = true)}>Top 100</button>
					<button type="button" disabled={runtimeErrorsRefreshing} onclick={() => void refreshRuntimeErrors()}>
						{runtimeErrorsRefreshing ? 'Refreshing…' : 'Refresh'}
					</button>
				</div>
			</div>
			<p class="runtime-error-refresh" aria-live="polite">
				{runtimeErrorsRefreshFailed ? 'Refresh failed; showing last loaded results.' : `Updated ${new Date(runtimeErrorsUpdatedAt).toLocaleTimeString()} · auto-refresh 15s`}
			</p>
			{#if runtimeErrorPriorities.status === 'UNAVAILABLE'}
				<p class="empty-state">Runtime error ranking is unavailable; the task board remains usable.</p>
			{:else if runtimeErrorPriorities.top100.length === 0}
				<p class="empty-state">No client/runtime errors were reported in the last 30 days.</p>
			{:else}
				<p class="runtime-error-count">Showing {showAllRuntimeErrors ? runtimeErrorPriorities.top100.length : runtimeErrorPriorities.top10.length} of up to {runtimeErrorPriorities.total} ranked groups.</p>
				<div class="runtime-error-list">
					{#each (showAllRuntimeErrors ? runtimeErrorPriorities.top100 : runtimeErrorPriorities.top10) as item, index (item.fingerprint)}
						<article class="runtime-error-card">
							<div class="task-topline"><span>#{index + 1} · {item.source} · {item.kind}/{item.severity}</span><span class="task-status">score {item.priorityScore}</span></div>
							<h4>{item.routePath}</h4>
							<p>{item.message}</p>
							<div class="chip-row"><span class="chip">{item.occurrences} occurrences</span><span class="chip">last seen {new Date(item.lastSeen).toLocaleString()}</span></div>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<section class="task-priority-preview" aria-labelledby="task-priority-title">
			<div class="ledger-head">
				<div>
					<h3 id="task-priority-title">Daily task priority</h3>
					<p class="subtitle compact">Read-only ranking from explicit board P0–P3 labels; score is a label mapping, not a learned importance or Graphify confidence. Blockers remain visible and this view does not queue or promote tasks.</p>
				</div>
				<div class="runtime-error-controls" aria-label="Daily task ranking size">
					<button type="button" aria-pressed={!showTop100Tasks} onclick={() => (showTop100Tasks = false)}>Top 10</button>
					<button type="button" aria-pressed={showTop100Tasks} onclick={() => (showTop100Tasks = true)}>Top 100</button>
				</div>
			</div>
			<p class="runtime-error-count">Showing {Math.min(showTop100Tasks ? 100 : 10, data.dailyGraphifyTaskPriorities.length)} of {data.dailyGraphifyTaskPriorities.length} file-backed daily board tasks · source: {board().boardSource}</p>
			{#if data.dailyGraphifyTaskPriorities.length === 0}
				<p class="empty-state">No daily board tasks are available to rank.</p>
			{:else}
				<div class="runtime-error-list">
					{#each data.dailyGraphifyTaskPriorities.slice(0, showTop100Tasks ? 100 : 10) as task (task.taskId)}
						<article class="runtime-error-card">
							<div class="task-topline"><span>#{task.rank} · {task.taskId} · {task.priority}</span><span class="task-status">priority score {task.priorityScore}</span></div>
							<h4>{task.label}</h4>
							<p>Status: {task.status ?? 'unspecified'}{task.blockedBy.length ? ` · blocked by ${task.blockedBy.join(', ')}` : ''}</p>
							{#if task.sourceRef}<p>{task.sourceRef}</p>{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>

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
								{#if task.reason_codes.length}
									<div class="chip-row" aria-label="Task reason codes">
										{#each task.reason_codes as reasonCode}
											<span class="chip">{reasonCode}</span>
										{/each}
									</div>
								{/if}
								{#if task.evidence_refs.length}
									<details class="task-evidence">
										<summary>Evidence ({task.evidence_refs.length})</summary>
										<ul>
											{#each task.evidence_refs as evidenceRef}
												<li>{evidenceRef}</li>
											{/each}
										</ul>
									</details>
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
											onclick={() => queueWorkflow(task.id)}
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

		<div class="temporal-lane">
			<div class="ledger-head">
				<h3>Temporal recommendations</h3>
				<span>{board().temporalRecommendations.length}</span>
			</div>
			{#if board().temporalRecommendations.length === 0}
				<p class="empty-state">No temporal recommendations loaded.</p>
			{:else}
				<div class="temporal-grid">
					{#each board().temporalRecommendations as rec}
						<article class="temporal-card">
							<div class="task-topline">
								<span>#{rec.rank} · {rec.taskId}</span>
								<span class="task-status">{rec.status ?? 'READY'}</span>
							</div>
							<h4>{rec.title}</h4>
							<p>{rec.intent ?? 'workflow recommendation'} · {new Date(rec.updatedAt).toLocaleString()}</p>
							{#if rec.sourceRef}
								<p>{rec.sourceRef}</p>
							{/if}
							{#if rec.recommendedCommands.length}
								<div class="chip-row">
									{#each rec.recommendedCommands.slice(0, 3) as command}
										<span class="chip">{command}</span>
									{/each}
								</div>
							{/if}
							{#if rec.verificationCommands.length}
								<div class="chip-row">
									{#each rec.verificationCommands.slice(0, 2) as command}
										<span class="chip">{command}</span>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<div class="recommendation-ledger">
			<div class="ledger-column">
				<div class="ledger-head">
					<h3>Promoted recommendations</h3>
					<span>{board().promotedRecommendations.length}</span>
				</div>
				{#if board().promotedRecommendations.length === 0}
					<p class="empty-state">No promoted recommendations.</p>
				{:else}
					{#each board().promotedRecommendations as rec}
						<article class="ledger-card promoted">
							<div class="task-topline">
								<span>{rec.recommendation_id}</span>
								<span class="task-status">PROMOTE</span>
							</div>
							<h4>{rec.title ?? rec.source_ref ?? rec.recommendation_id}</h4>
							<p>
								{rec.tree_node_id ?? 'tree_node_id unavailable'}
							</p>
							{#if rec.reason_codes.length}
								<div class="chip-row">
									{#each rec.reason_codes as reason}
										<span class="chip">{reason}</span>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				{/if}
			</div>

			<div class="ledger-column">
				<div class="ledger-head">
					<h3>Review required</h3>
					<span>{board().reviewRequiredRecommendations.length}</span>
				</div>
				{#if board().reviewRequiredRecommendations.length === 0}
					<p class="empty-state">No review-required recommendations.</p>
				{:else}
					{#each board().reviewRequiredRecommendations as rec}
						<article class="ledger-card review">
							<div class="task-topline">
								<span>{rec.recommendation_id}</span>
								<span class="task-status">REVIEW</span>
							</div>
							<h4>{rec.title ?? rec.source_ref ?? rec.recommendation_id}</h4>
							<p>
								{rec.tree_node_id ?? 'tree_node_id unavailable'}
							</p>
							{#if rec.reason_codes.length}
								<div class="chip-row">
									{#each rec.reason_codes as reason}
										<span class="chip">{reason}</span>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				{/if}
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

	.runtime-errors {
		margin: 0 0 1rem;
		padding: 1rem;
		border: 1px solid rgba(245, 158, 11, 0.18);
		border-radius: 14px;
		background: rgba(245, 158, 11, 0.035);
	}

	.runtime-error-controls {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.runtime-error-controls button {
		padding: 0.4rem 0.7rem;
		border: 1px solid rgba(212, 199, 163, 0.18);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		cursor: pointer;
	}

	.runtime-error-controls button[aria-pressed='true'] {
		border-color: rgba(245, 158, 11, 0.55);
		background: rgba(245, 158, 11, 0.12);
	}

	.runtime-error-controls button:disabled {
		cursor: wait;
		opacity: 0.65;
	}

	.runtime-error-count {
		margin: 0 0 0.65rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.65);
	}

	.runtime-error-refresh {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.5);
	}

	.runtime-error-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
		gap: 0.55rem;
		max-height: 34rem;
		overflow: auto;
	}

	.runtime-error-card {
		min-width: 0;
		padding: 0.7rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.16);
	}

	.runtime-error-card h4,
	.runtime-error-card p {
		overflow-wrap: anywhere;
	}

	.runtime-error-card h4 {
		margin: 0.35rem 0;
		font-size: 0.86rem;
	}

	.runtime-error-card p {
		display: -webkit-box;
		margin: 0 0 0.45rem;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.72);
	}

	.compact {
		max-width: 56rem;
		font-size: 0.92rem;
	}

	.board-meta {
		display: grid;
		max-width: 100%;
		gap: 0.75rem;
		min-width: 14rem;
	}

	.board-meta strong {
		display: block;
		overflow-wrap: anywhere;
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
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: 0.9rem;
	}

	.priority-column {
		min-width: 0;
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
		min-width: 0;
		padding: 0.9rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.08);
		margin-bottom: 0.75rem;
	}

	.task-topline {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.52);
		margin-bottom: 0.35rem;
	}

	.task-topline > span:first-child {
		min-width: 0;
		flex: 1 1 12rem;
		overflow-wrap: anywhere;
	}

	.task-status {
		flex-shrink: 0;
		color: #93c5fd;
	}

	.task-card h4 {
		margin: 0;
		text-transform: none;
		letter-spacing: normal;
		overflow-wrap: anywhere;
		line-height: 1.5;
		font-size: 0.96rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.task-card p {
		margin: 0.35rem 0 0;
		font-size: 0.84rem;
		color: rgba(212, 199, 163, 0.72);
		line-height: 1.5;
	}

	.task-evidence {
		margin-top: 0.6rem;
		font-size: 0.76rem;
		color: rgba(212, 199, 163, 0.72);
	}

	.task-evidence summary {
		cursor: pointer;
		color: #bfdbfe;
	}

	.task-evidence ul {
		padding-left: 1rem;
		margin: 0.45rem 0 0;
	}

	.task-evidence li {
		margin-top: 0.35rem;
		overflow-wrap: anywhere;
		line-height: 1.45;
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
		max-width: 100%;
		overflow-wrap: anywhere;
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

	.recommendation-ledger {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.9rem;
		margin-top: 1rem;
	}

	.temporal-lane {
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.temporal-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.85rem;
		margin-top: 0.8rem;
	}

	.temporal-card {
		padding: 0.95rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(96, 165, 250, 0.12);
	}

	.ledger-column {
		padding: 0.95rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.ledger-head {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.ledger-head h3 {
		margin: 0;
		font-size: 0.92rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.ledger-head span {
		font-size: 0.78rem;
		color: #93c5fd;
	}

	.ledger-card {
		padding: 0.85rem;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.08);
		margin-bottom: 0.65rem;
	}

	.ledger-card.promoted {
		border-color: rgba(34, 197, 94, 0.18);
	}

	.ledger-card.review {
		border-color: rgba(245, 158, 11, 0.18);
	}

	.ledger-card h4 {
		margin: 0;
		font-size: 0.94rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.ledger-card p {
		margin: 0.35rem 0 0;
		font-size: 0.84rem;
		color: rgba(212, 199, 163, 0.72);
		line-height: 1.5;
	}

	.footer-card {
		padding: 0.85rem 0.95rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.footer-card strong {
		display: block;
		min-width: 0;
		overflow-wrap: anywhere;
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
		.ai-dashboard-hub {
			margin: 0;
			padding: 1rem;
		}

		.board-header {
			flex-direction: column;
		}

		.board-meta {
			min-width: 0;
		}

		.board-shell, .priority-column, .task-card {
			padding: 0.65rem;
		}

		.hub-header {
			flex-direction: column;
		}
	}
</style>
