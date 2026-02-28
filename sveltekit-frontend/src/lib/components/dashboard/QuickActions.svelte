<!--
  QuickActions Component - YoRHa Detective Style
  Quick action buttons panel with icons

  Usage:
    <QuickActions
      actions={[
        { id: 'new-case', icon: 'gavel', label: 'New Case', onClick: () => goto('/cases/new') },
        { id: 'upload', icon: 'upload', label: 'Upload Evidence', onClick: () => goto('/evidence') }
      ]}
    />
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export interface QuickAction {
		id: string;
		icon: string;
		label: string;
		description?: string;
		variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
		disabled?: boolean;
		onClick: () => void;
	}

	interface Props {
		actions?: QuickAction[];
		title?: string;
		layout?: 'grid' | 'list';
		compact?: boolean;
	}

	let {
		actions = [],
		title = 'Quick Actions',
		layout = 'grid',
		compact = false
	}: Props = $props();

	function getVariantClass(variant: QuickAction['variant']): string {
		switch (variant) {
			case 'primary': return 'action-primary';
			case 'success': return 'action-success';
			case 'warning': return 'action-warning';
			case 'danger': return 'action-danger';
			default: return 'action-default';
		}
	}
</script>

<div class="quick-actions-panel">
	<div class="actions-header">
		<div class="actions-title-wrapper">
			<Icon name="zap" class="title-icon" />
			<h3 class="actions-title">{title}</h3>
		</div>
	</div>

	<div class="actions-content {layout === 'grid' ? 'actions-grid' : 'actions-list'} {compact ? 'actions-compact' : ''}">
		{#each actions as action (action.id)}
			<button
				class="action-button {getVariantClass(action.variant)}"
				onclick={action.onClick}
				disabled={action.disabled}
			>
				<div class="action-icon-wrapper">
					<Icon name={action.icon} class="action-icon" />
				</div>
				<div class="action-content">
					<div class="action-label">{action.label}</div>
					{#if action.description && !compact}
						<div class="action-description">{action.description}</div>
					{/if}
				</div>
				<Icon name="chevron-right" class="action-arrow" />
			</button>
		{/each}

		{#if actions.length === 0}
			<div class="no-actions">
				<Icon name="zap-off" class="no-actions-icon" />
				<p class="no-actions-text">No quick actions available</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.quick-actions-panel {
		display: flex;
		flex-direction: column;
		background: var(--panel-soft);
		border: 1px solid var(--sand-6);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.actions-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid var(--sand-6);
		background: var(--sand-2);
	}

	.actions-title-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--accent);
	}

	.actions-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--sand-12);
		text-transform: uppercase;
		letter-spacing: 0.025em;
		margin: 0;
	}

	.actions-content {
		padding: 0.75rem;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.actions-compact .action-button {
		padding: 0.75rem;
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--sand-2);
		border: 1px solid var(--sand-6);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		width: 100%;
		font-family: inherit;
	}

	.action-button:hover:not(:disabled) {
		background: var(--sand-3);
		border-color: var(--accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.action-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: var(--accent-soft);
		border-radius: 0.375rem;
		flex-shrink: 0;
	}

	.action-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--accent);
	}

	.action-content {
		flex: 1;
		min-width: 0;
	}

	.action-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--sand-12);
		margin-bottom: 0.125rem;
	}

	.action-description {
		font-size: 0.75rem;
		color: var(--sand-10);
		line-height: 1.3;
	}

	.action-arrow {
		width: 1rem;
		height: 1rem;
		color: var(--sand-9);
		flex-shrink: 0;
		transition: transform 0.2s;
	}

	.action-button:hover:not(:disabled) .action-arrow {
		transform: translateX(4px);
	}

	/* Variant styles */
	.action-primary .action-icon-wrapper {
		background: rgba(59, 130, 246, 0.1);
	}

	.action-primary .action-icon {
		color: #3b82f6;
	}

	.action-primary:hover:not(:disabled) {
		border-color: #3b82f6;
	}

	.action-success .action-icon-wrapper {
		background: rgba(34, 197, 94, 0.1);
	}

	.action-success .action-icon {
		color: #22c55e;
	}

	.action-success:hover:not(:disabled) {
		border-color: #22c55e;
	}

	.action-warning .action-icon-wrapper {
		background: rgba(245, 158, 11, 0.1);
	}

	.action-warning .action-icon {
		color: #f59e0b;
	}

	.action-warning:hover:not(:disabled) {
		border-color: #f59e0b;
	}

	.action-danger .action-icon-wrapper {
		background: rgba(239, 68, 68, 0.1);
	}

	.action-danger .action-icon {
		color: #ef4444;
	}

	.action-danger:hover:not(:disabled) {
		border-color: #ef4444;
	}

	.no-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
	}

	.no-actions-icon {
		width: 3rem;
		height: 3rem;
		color: var(--sand-8);
		margin-bottom: 1rem;
	}

	.no-actions-text {
		font-size: 0.875rem;
		color: var(--sand-10);
		margin: 0;
	}
</style>