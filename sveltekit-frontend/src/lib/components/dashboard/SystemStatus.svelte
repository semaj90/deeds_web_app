<!--
  SystemStatus Component - YoRHa Detective Style
  Real-time system status notifications panel

  Usage:
    <SystemStatus
      alerts={[
        { id: '1', type: 'info', message: 'All systems operational', timestamp: '12:34' },
        { id: '2', type: 'warning', message: 'High memory usage', timestamp: '12:30' }
      ]}
      onDismiss={(id) => console.log('Dismissed', id)}
    />
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export type AlertType = 'info' | 'warning' | 'error' | 'success';

	export interface Alert {
		id: string;
		type: AlertType;
		message: string;
		timestamp: string;
		dismissed?: boolean;
	}

	interface Props {
		alerts?: Alert[];
		title?: string;
		maxHeight?: string;
		showTimestamps?: boolean;
		onDismiss?: (id: string) => void;
	}

	let {
		alerts = [],
		title = 'System Status',
		maxHeight = '400px',
		showTimestamps = true,
		onDismiss = undefined
	}: Props = $props();

	let visibleAlerts = $derived(alerts.filter(a => !a.dismissed));

	function getAlertIcon(type: AlertType): string {
		switch (type) {
			case 'error': return 'circle-alert';
			case 'warning': return 'triangle-alert';
			case 'success': return 'circle-check';
			case 'info': return 'info';
		}
	}

	function getAlertColor(type: AlertType): string {
		switch (type) {
			case 'error': return 'alert-error';
			case 'warning': return 'alert-warning';
			case 'success': return 'alert-success';
			case 'info': return 'alert-info';
		}
	}

	function handleDismiss(id: string) {
		onDismiss?.(id);
	}
</script>

<div class="system-status-panel">
	<div class="status-header">
		<div class="status-title-wrapper">
			<Icon name="activity" class="title-icon" />
			<h3 class="status-title">{title}</h3>
		</div>
		<div class="status-badge">
			{#if visibleAlerts.length === 0}
				<span class="badge-success">ALL CLEAR</span>
			{:else if visibleAlerts.some(a => a.type === 'error')}
				<span class="badge-error">{visibleAlerts.filter(a => a.type === 'error').length} ERRORS</span>
			{:else if visibleAlerts.some(a => a.type === 'warning')}
				<span class="badge-warning">{visibleAlerts.filter(a => a.type === 'warning').length} WARNINGS</span>
			{:else}
				<span class="badge-info">{visibleAlerts.length} NOTICES</span>
			{/if}
		</div>
	</div>

	<!-- Plain scrollable div - bits-ui ScrollArea has TDZ bug with Svelte 5.46.0 -->
	<div class="status-content status-viewport" style="max-height: {maxHeight}; overflow-y: auto;">
		{#if visibleAlerts.length === 0}
			<div class="no-alerts">
				<Icon name="circle-check" class="no-alerts-icon" />
				<p class="no-alerts-text">All systems operational</p>
				<p class="no-alerts-subtext">No active alerts</p>
			</div>
		{:else}
			<div class="alerts-list">
				{#each visibleAlerts as alert (alert.id)}
					<div class="alert-item {getAlertColor(alert.type)}">
						<Icon name={getAlertIcon(alert.type)} class="alert-icon" />
						<div class="alert-content">
							<p class="alert-message">{alert.message}</p>
							{#if showTimestamps}
								<span class="alert-timestamp">{alert.timestamp}</span>
							{/if}
						</div>
						{#if onDismiss}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => handleDismiss(alert.id)}
								class="alert-dismiss-btn"
							>
								<Icon name="x" class="dismiss-icon" />
							</Button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.system-status-panel {
		display: flex;
		flex-direction: column;
		background: var(--panel-soft);
		border: 1px solid var(--sand-6);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid var(--sand-6);
		background: var(--sand-2);
	}

	.status-title-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--accent);
	}

	.status-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--sand-12);
		text-transform: uppercase;
		letter-spacing: 0.025em;
		margin: 0;
	}

	.status-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', monospace;
	}

	.badge-success {
		color: #22c55e;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.badge-error {
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.badge-warning {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.badge-info {
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.status-content {
		flex: 1;
		min-height: 200px;
	}

	.status-viewport {
		height: 100%;
		padding: 0.75rem;
		scrollbar-width: thin;
		scrollbar-color: var(--sand-8) var(--sand-4);
	}

	.status-viewport::-webkit-scrollbar {
		width: 8px;
	}

	.status-viewport::-webkit-scrollbar-track {
		background: var(--sand-4);
		border-radius: 4px;
	}

	.status-viewport::-webkit-scrollbar-thumb {
		background: var(--sand-8);
		border-radius: 4px;
	}

	.status-viewport::-webkit-scrollbar-thumb:hover {
		background: var(--sand-10);
	}

	.no-alerts {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
	}

	.no-alerts-icon {
		width: 3rem;
		height: 3rem;
		color: #22c55e;
		margin-bottom: 1rem;
	}

	.no-alerts-text {
		font-size: 1rem;
		font-weight: 600;
		color: var(--sand-12);
		margin: 0 0 0.25rem 0;
	}

	.no-alerts-subtext {
		font-size: 0.875rem;
		color: var(--sand-10);
		margin: 0;
	}

	.alerts-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.alert-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid;
		transition: all 0.2s;
	}

	.alert-item:hover {
		transform: translateX(4px);
	}

	.alert-info {
		background: rgba(59, 130, 246, 0.05);
		border-color: rgba(59, 130, 246, 0.2);
	}

	.alert-info .alert-icon {
		color: #3b82f6;
	}

	.alert-warning {
		background: rgba(245, 158, 11, 0.05);
		border-color: rgba(245, 158, 11, 0.2);
	}

	.alert-warning .alert-icon {
		color: #f59e0b;
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.05);
		border-color: rgba(239, 68, 68, 0.2);
	}

	.alert-error .alert-icon {
		color: #ef4444;
	}

	.alert-success {
		background: rgba(34, 197, 94, 0.05);
		border-color: rgba(34, 197, 94, 0.2);
	}

	.alert-success .alert-icon {
		color: #22c55e;
	}

	.alert-icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.alert-content {
		flex: 1;
		min-width: 0;
	}

	.alert-message {
		font-size: 0.875rem;
		color: var(--sand-12);
		margin: 0 0 0.25rem 0;
		line-height: 1.4;
	}

	.alert-timestamp {
		font-size: 0.75rem;
		color: var(--sand-10);
		font-family: 'JetBrains Mono', monospace;
	}

	.alert-dismiss-btn {
		flex-shrink: 0;
		padding: 0.25rem;
		opacity: 0.6;
		transition: opacity 0.2s;
	}

	.alert-dismiss-btn:hover {
		opacity: 1;
	}

	.dismiss-icon {
		width: 1rem;
		height: 1rem;
	}
</style>
