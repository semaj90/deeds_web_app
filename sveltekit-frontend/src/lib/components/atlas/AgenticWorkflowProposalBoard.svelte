<script lang="ts">
	import {
		AgenticWorkflowProposalBoardV1Schema,
		agenticWorkflowProposalBoardV1
	} from '$lib/atlas/agentic-workflow-proposals-v1.js';

	let { board: boardInput = agenticWorkflowProposalBoardV1 }: { board?: unknown } = $props();
	const validatedBoard = $derived(AgenticWorkflowProposalBoardV1Schema.safeParse(boardInput));

	function statusLabel(status: string): string {
		return status.replaceAll('_', ' ');
	}
</script>

{#if !validatedBoard.success}
	<section class="workflow-board workflow-board--unavailable" role="alert" aria-label="Proposal board unavailable">
		<p class="workflow-board__authority">PROPOSAL DATA UNAVAILABLE</p>
		<p>The workflow board is hidden because its data did not pass validation.</p>
	</section>
{:else}
<section class="workflow-board" aria-labelledby="workflow-board-title">
	<header class="workflow-board__header">
		<div>
			<p class="workflow-board__eyebrow">PARENT ATLAS / PROPOSAL LANES</p>
			<h2 id="workflow-board-title">Four cooperating workflows</h2>
			<p>Evidence → taxonomy → recommendations → independent verification</p>
		</div>
		<span class="workflow-board__authority">PROPOSAL ONLY · NO LIVE STATUS</span>
	</header>

	<div class="workflow-board__grid">
		{#each validatedBoard.data.lanes as lane, index (lane.id)}
			<article class="workflow-card" aria-labelledby="workflow-{lane.id}">
				<div class="workflow-card__topline">
					<span class="workflow-card__index">{String(index + 1).padStart(2, '0')}</span>
					<span class="workflow-card__status" data-status={lane.status} role="status" aria-label="Evidence status: {statusLabel(lane.status)}">{statusLabel(lane.status)}</span>
				</div>
				<h3 id="workflow-{lane.id}">{lane.title}</h3>
				<p class="workflow-card__maturity" data-maturity={lane.maturity}>Implementation maturity: {statusLabel(lane.maturity)}</p>
				<p class="workflow-card__summary">{lane.summary}</p>

				<div class="workflow-card__details">
					<div>
						<span class="workflow-card__label">Algorithm / owner</span>
						<code>{lane.algorithmRevision}</code>
					</div>
					<div>
						<span class="workflow-card__label">Workspace revision</span>
						<code>{lane.workspaceRevision ?? 'UNBOUND — no revision receipt'}</code>
					</div>
					<div>
						<span class="workflow-card__label">Execution receipt</span>
						<time>{lane.receiptAt ?? 'None recorded'}</time>
					</div>
				</div>

				<div class="workflow-card__blockers">
					<h4>Open gates</h4>
					<ul>
						{#each lane.blockers as blocker (blocker)}
							<li>{blocker}</li>
						{/each}
					</ul>
				</div>

				<details class="workflow-card__sources">
					<summary>Evidence references ({lane.sourceRefs.length})</summary>
					{#if lane.sourceRefs.length}
						<ul>
							{#each lane.sourceRefs as sourceRef (sourceRef)}
								<li><code>{sourceRef}</code></li>
							{/each}
						</ul>
					{:else}
						<p>No source references recorded.</p>
					{/if}
				</details>
			</article>
		{/each}
	</div>

	<p class="workflow-board__note">This board is a static, Zod-validated audit view. It does not query services, dispatch agents, promote identities, or authorize writes.</p>
</section>
{/if}

<style>
	.workflow-board { color: #e8e6dc; }
	.workflow-board__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
	.workflow-board__eyebrow, .workflow-card__label { color: #b8aa78; font: 600 0.68rem/1.4 ui-monospace, monospace; letter-spacing: 0.12em; text-transform: uppercase; }
	.workflow-board h2 { margin: 0.35rem 0; font-size: clamp(1.25rem, 2vw, 1.8rem); }
	.workflow-board__header p:last-child { margin: 0; color: #9aa3ad; }
	.workflow-board__authority { border: 1px solid #796b42; color: #e5ce83; padding: 0.45rem 0.65rem; font: 600 0.65rem/1.3 ui-monospace, monospace; white-space: nowrap; }
	.workflow-board__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
	.workflow-card { min-width: 0; display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border: 1px solid #303744; border-top: 2px solid #b8aa78; background: #111722; }
	.workflow-card__topline { display: flex; align-items: center; justify-content: space-between; }
	.workflow-card__index { color: #6c7784; font: 0.7rem ui-monospace, monospace; }
	.workflow-card__status { color: #e5ce83; font: 600 0.65rem ui-monospace, monospace; letter-spacing: 0.08em; }
	.workflow-card__status[data-status='BLOCKED'], .workflow-card__status[data-status='CONFLICTED'] { color: #e2a3a3; }
	.workflow-card__status[data-status='UNVERIFIED'] { color: #a9c9df; }
	.workflow-card__status[data-status='PROPOSED'] { color: #a8d2b6; }
	.workflow-card__maturity { margin: -0.55rem 0 0; color: #8994a0; font: 0.65rem/1.4 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.04em; }
	.workflow-card h3 { margin: 0; font-size: 1rem; }
	.workflow-card__summary { margin: 0; min-height: 3.2em; color: #bbc2ca; line-height: 1.55; }
	.workflow-card__details { display: grid; gap: 0.55rem; }
	.workflow-card__details > div { display: grid; gap: 0.18rem; }
	.workflow-card__details code, .workflow-card__details time, .workflow-card__sources code { color: #d5d8dc; font: 0.72rem/1.45 ui-monospace, monospace; overflow-wrap: anywhere; }
	.workflow-card__blockers h4 { margin: 0 0 0.35rem; color: #d2c798; font: 600 0.68rem ui-monospace, monospace; text-transform: uppercase; }
	.workflow-card__blockers ul, .workflow-card__sources ul { margin: 0; padding-left: 1.15rem; color: #aeb7c1; font-size: 0.78rem; line-height: 1.5; }
	.workflow-card__blockers li + li, .workflow-card__sources li + li { margin-top: 0.25rem; }
	.workflow-card__sources summary { color: #aeb7c1; cursor: pointer; font-size: 0.75rem; }
	.workflow-card__sources ul { padding-top: 0.4rem; }
	.workflow-board__note { margin: 1rem 0 0; color: #8994a0; font-size: 0.72rem; }
	@media (max-width: 760px) {
		.workflow-board__header { flex-direction: column; }
		.workflow-board__grid { grid-template-columns: minmax(0, 1fr); }
	}
	@media (prefers-reduced-motion: reduce) {
		.workflow-card { scroll-behavior: auto; }
	}
</style>
