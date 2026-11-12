<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const lanes = $derived([
		{ key: 'todo', title: 'To do', tasks: data.todo },
		{ key: 'in_progress', title: 'In progress', tasks: data.inProgress },
		{ key: 'done', title: 'Done', tasks: data.done },
	]);

	const shown = $derived(data.todo.length + data.inProgress.length + data.done.length);
</script>

<svelte:head>
	<title>Atlas Task Board</title>
</svelte:head>

<main class="board-page">
	<header>
		<a href="/admin/atlas">Back to Atlas Studio</a>
		<h1>Atlas Task Board</h1>
		<p class="note">
			Review tickets and OpenSpec candidates. Agent dispatch requires a validated worker.
		</p>
		<p class="counts">Showing {shown} of {data.total} tickets</p>
		{#if data.error}
			<p class="error" role="alert">Board unavailable: {data.error}</p>
		{/if}
	</header>

	<section class="events" aria-labelledby="quick-hit-heading">
		<h2 id="quick-hit-heading">Quick-Hit recommendations</h2>
		{#if data.previewStatus === 'MISSING'}
			<p class="empty">No Quick-Hit review preview is available.</p>
		{:else if data.previewStatus === 'INVALID'}
			<p class="error" role="alert">The Quick-Hit preview could not be validated.</p>
		{/if}
		{#each data.recommendations as recommendation (`${recommendation.sourceRef}:${recommendation.sourceLine}`)}
			<article class="card">
				<h3>{recommendation.taskText}</h3>
				<p><code>{recommendation.sourceRef}:{recommendation.sourceLine}</code></p>
				{#if !recommendation.current}
					<p class="error">Source changed. Refresh this recommendation before review.</p>
				{:else}
					<p>Declared revision {recommendation.sourceRevision ?? 'Unresolved'}</p>
					{#if recommendation.ticketId}
						<a href={`?ticket=${encodeURIComponent(recommendation.ticketId)}#ticket-details`}>
							{recommendation.ticketStatus === 'VERIFIED_TICKET' ? 'View revision-verified ticket' : 'View matching ticket'}
						</a>
						{#if recommendation.ticketStatus === 'MATCHED_UNREVISIONED'}
							<p class="note">Ticket identity and source locator match, but its source revision is missing. Review only; provenance is unverified.</p>
						{/if}
					{:else if recommendation.identityStatus === 'UNRESOLVED'}
						<p>No verified task identity.</p>
					{:else if recommendation.ticketStatus === 'TICKET_LOOKUP_UNAVAILABLE'}
						<p>Ticket lookup is temporarily unavailable.</p>
					{:else}
						<p>No verified matching ticket.</p>
					{/if}
					<details>
						<summary>Acceptance gates and blockers</summary>
						<ul>
							{#each recommendation.acceptanceGates as gate}<li>{gate}</li>{/each}
							{#each recommendation.blockers as blocker}<li>{blocker}</li>{/each}
						</ul>
					</details>
				{/if}
			</article>
		{:else}
			{#if data.previewStatus === 'AVAILABLE'}<p class="empty">No eligible recommendations in this preview.</p>{/if}
		{/each}
	</section>

	{#if data.selected || data.selectionError}
		<section class="events" id="ticket-details" aria-labelledby="ticket-heading">
			<h2 id="ticket-heading">Ticket details</h2>
			{#if data.selectionError}<p class="error" role="alert">{data.selectionError}</p>{/if}
			{#if data.selected}
				<h3>{data.selected.title}</h3>
				<p><code>{data.selected.taskId}</code> · {data.selected.status}</p>
				<p>Priority {data.selected.priority ?? 'Unspecified'} · Owner {data.selected.owner ?? 'Unassigned'}</p>
				<p>Source revision {data.selected.sourceRevision ?? 'Unresolved'}</p>
				<ul>{#each data.selected.sourceRefs as sourceRef}<li><code>{sourceRef}</code></li>{/each}</ul>
				<h4>Recorded block reasons</h4>
				<ul>
					{#each data.selected.dispatchBlockers as blocker}<li>{blocker}</li>
					{:else}<li>No block reasons in the recent ticket events.</li>{/each}
				</ul>
				<h4>Execution receipts</h4>
				<ul>
					{#each data.selected.receipts as receipt}
						<li><code>{receipt.receiptId}</code> · Run {receipt.runId} · {receipt.success ? 'Passed' : 'Failed'}</li>
					{:else}<li>No receipts in the recent ticket attempts.</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section class="lanes" aria-label="Ticket lanes">
		{#each lanes as lane (lane.key)}
			<div class="lane">
				<h2>{lane.title} <span class="badge">{lane.tasks.length}</span></h2>
				{#each lane.tasks as task (task.taskId)}
					<article class="card" data-status={task.status}>
						<h3><a href={`?ticket=${encodeURIComponent(task.taskId)}#ticket-details`}>{task.featureLabel}</a></h3>
						<p class="meta">
							<code>{task.taskId}</code>
							<span class="status">{task.status}</span>
							<span>Priority {task.priority ?? 'Unspecified'}</span>
							<span>{task.assignee ?? 'Unassigned'}</span>
						</p>
						{#if task.sourceRefs.length > 0}
							<ul class="refs">
								{#each task.sourceRefs.slice(0, 3) as sourceRef (sourceRef)}
									<li><code>{sourceRef}</code></li>
								{/each}
								{#if task.sourceRefs.length > 3}
									<li>+{task.sourceRefs.length - 3} more</li>
								{/if}
							</ul>
						{/if}
						{#if task.validationCommand}
							<p class="cmd"><code>{task.validationCommand}</code></p>
						{/if}
						<p class="attempts">
							attempts {task.attemptCount ?? 0}, failures {task.failureCount ?? 0}
						</p>
					</article>
				{:else}
					<p class="empty">No tickets.</p>
				{/each}
			</div>
		{/each}
	</section>

	{#if data.invalid.length > 0}
		<section class="invalid">
			<h2>Rows failing schema ({data.invalid.length})</h2>
			<ul>
				{#each data.invalid as row (row.taskId)}
					<li><code>{row.taskId}</code>: {row.issues.join('; ')}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="events">
		<h2>Recent events</h2>
		<ul>
			{#each data.events as event (`${event.taskId}:${event.eventType}:${event.createdAt}`)}
				<li>
					<time>{event.createdAt}</time>
					<span>{event.eventType}</span>
					<code>{event.taskId}</code>
				</li>
			{:else}
				<li class="empty">No events.</li>
			{/each}
		</ul>
	</section>
</main>

<style>
	.card a, header a { text-decoration: underline; text-underline-offset: 0.2em; }
	.card code, #ticket-details code { overflow-wrap: anywhere; }
	.board-page {
		padding: 16px;
		display: grid;
		gap: 16px;
	}
	.note,
	.counts,
	.empty,
	.meta,
	.attempts {
		font-size: 0.85rem;
		opacity: 0.8;
	}
	.error {
		color: #b42318;
	}
	.lanes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 16px;
		align-items: start;
	}
	.lane {
		display: grid;
		gap: 8px;
	}
	.badge {
		font-size: 0.75rem;
		padding: 0 6px;
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.2);
	}
	.card {
		padding: 10px;
		border: 1px solid rgba(127, 127, 127, 0.35);
		border-radius: 6px;
		display: grid;
		gap: 4px;
	}
	.card[data-status='failed'] {
		border-color: #b42318;
	}
	.card h3 {
		font-size: 0.95rem;
		margin: 0;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
	}
	.refs {
		margin: 0;
		padding-left: 16px;
		font-size: 0.8rem;
	}
	.cmd,
	.attempts {
		margin: 0;
		word-break: break-all;
	}
	.events ul,
	.invalid ul {
		padding-left: 16px;
		font-size: 0.85rem;
	}
</style>
