<script lang="ts">
	interface Props {
		caseId: string;
	}

	let { caseId }: Props = $props();

	// Placeholder for similar cases logic
	let similarCases = $state<Array<{ id: string; title: string }>>([]);
</script>

<div class="similar-cases-panel">
	<h3>Similar Cases</h3>
	<div class="cases-list">
		{#if similarCases.length === 0}
			<p class="no-cases">No similar cases found for case {caseId}</p>
		{:else}
			{#each similarCases as caseItem}
				<div class="case-item">
					<h4>{caseItem.title}</h4>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.similar-cases-panel {
		padding: 1rem;
		border: 1px solid var(--border-color, #ddd);
		border-radius: 0.5rem;
	}

	.cases-list {
		margin-top: 0.5rem;
	}

	.no-cases {
		color: var(--text-secondary, #666);
		font-style: italic;
	}

	.case-item {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border-light, #eee);
	}
</style>
