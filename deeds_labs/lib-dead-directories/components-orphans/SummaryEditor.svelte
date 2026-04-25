<script lang="ts">
	interface Summary {
		id?: string;
		caseId?: string;
		text?: string;
		holding?: string;
		citations?: Array<{
			code: string;
			title: string;
			jurisdiction: string;
		}>;
		version?: number;
		createdAt?: string;
		updatedAt?: string;
	}

	interface Props {
		summary: Summary;
		onupdate: (event: CustomEvent<Summary>) => void;
	}

	let { summary, onupdate }: Props = $props();
</script>

<div class="summary-editor">
	<h3>Summary</h3>
	<div class="summary-content">
		{#if summary}
			<p>{summary.text || 'No summary text available'}</p>
		{/if}
	</div>
</div>

<style>
	.summary-editor {
		padding: 1rem;
		border: 1px solid var(--border-color, #ddd);
		border-radius: 0.5rem;
	}

	.summary-content {
		margin-top: 0.5rem;
	}
</style>
