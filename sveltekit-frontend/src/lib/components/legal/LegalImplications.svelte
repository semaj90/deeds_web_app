<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Implication {
		title: string;
		description: string;
		icon: string;
		status: string;
	}

	let { node, implications = [] }: {
		node: any;
		implications?: Implication[];
	} = $props();

	const items = $derived(implications.length > 0 ? implications : [
		{ title: 'Compliance Risk', description: 'Organizations must ensure compliance with this legal provision to avoid potential liability.', icon: 'shield-alert', status: 'high' },
		{ title: 'Legal Authority', description: 'This provision establishes binding legal standards within its jurisdiction.', icon: 'lock', status: 'medium' },
		{ title: 'Interpretation', description: 'Key terms remain subject to judicial interpretation and evolving case law.', icon: 'help-circle', status: 'low' },
	]);
</script>

<div class="implications-panel">
	<div class="section-header">
		<Icon name="activity" size={18} class="text-accent" />
		<h3>Implications</h3>
	</div>

	<div class="implications-list">
		{#each items as item}
			<div class="implication-item">
				<div class="status-indicator">
					<Icon name={item.icon} size={16} class="text-accent" />
				</div>
				<div class="item-content">
					<h4 class="item-title">
						{item.title}: <span class="item-desc">{item.description}</span>
					</h4>
				</div>
			</div>
		{/each}
	</div>

	<div class="uncertainty-box">
		<div class="box-header">
			<Icon name="alert-triangle" size={16} class="text-orange-400" />
			<h4>Legal Uncertainty</h4>
		</div>
		<p class="box-text">
			Key legal terms in this provision may be subject to evolving judicial interpretation. Consult authoritative sources for the most current analysis.
		</p>
		<div class="box-footer">
			<span>Accurate summary?</span>
			<div class="feedback-btns">
				<button class="feedback-btn"><Icon name="thumbs-up" size={12} /></button>
				<button class="feedback-btn"><Icon name="thumbs-down" size={12} /></button>
			</div>
		</div>
	</div>
</div>

<style>
	.implications-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		padding: 1.5rem;
		height: 100%;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.section-header h3 {
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #e0e0e0;
	}

	.implications-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.implication-item {
		display: grid;
		grid-template-columns: 24px 1fr;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.item-title {
		font-size: 0.8125rem;
		font-weight: 700;
		color: #e0e0e8;
		line-height: 1.5;
	}

	.item-desc {
		font-weight: 400;
		color: rgba(255, 255, 255, 0.5);
	}

	.uncertainty-box {
		margin-top: auto;
		background: rgba(251, 146, 60, 0.05);
		border: 1px solid rgba(251, 146, 60, 0.2);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.box-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.box-header h4 {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: #fb923c;
	}

	.box-text {
		font-size: 0.75rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.6);
	}

	.box-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(251, 146, 60, 0.1);
		font-size: 0.6875rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.feedback-btns {
		display: flex;
		gap: 0.5rem;
	}

	.feedback-btn {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 2px;
		transition: color 0.15s;
	}

	.feedback-btn:hover {
		color: #e0e0e0;
	}
</style>
