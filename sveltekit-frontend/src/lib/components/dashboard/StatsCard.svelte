<!--
  StatsCard Component - YoRHa Detective Style
  Displays a metric with icon, value, and optional trend indicator

  Usage:
    <StatsCard
      icon="gavel"
      label="Active Cases"
      value={12}
      trend={5.2}
      trendLabel="vs last month"
    />
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		icon: string;
		label: string;
		value: number | string;
		trend?: number;
		trendLabel?: string;
		variant?: 'default' | 'success' | 'warning' | 'error';
		loading?: boolean;
	}

	let {
		icon,
		label,
		value,
		trend = undefined,
		trendLabel = 'vs last period',
		variant = 'default',
		loading = false
	}: Props = $props();

	function getVariantColor(v: typeof variant): string {
		switch (v) {
			case 'success': return 'border-green-500/30 bg-green-500/5';
			case 'warning': return 'border-yellow-500/30 bg-yellow-500/5';
			case 'error': return 'border-red-500/30 bg-red-500/5';
			default: return 'border-sand-6 bg-panel-soft';
		}
	}

	function getTrendColor(t: number): string {
		return t >= 0 ? 'text-green-400' : 'text-red-400';
	}

	function getTrendIcon(t: number): string {
		return t >= 0 ? 'trending-up' : 'trending-down';
	}
</script>

<div class="stats-card {getVariantColor(variant)}">
	<div class="stats-header">
		<div class="stats-icon-wrapper">
			<Icon name={icon} class="stats-icon" />
		</div>
		<div class="stats-label">{label}</div>
	</div>

	<div class="stats-content">
		{#if loading}
			<div class="stats-value-skeleton"></div>
		{:else}
			<div class="stats-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
		{/if}

		{#if trend !== undefined && !loading}
			<div class="stats-trend">
				<Icon name={getTrendIcon(trend)} class="trend-icon {getTrendColor(trend)}" />
				<span class="trend-value {getTrendColor(trend)}">
					{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
				</span>
				<span class="trend-label">{trendLabel}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.stats-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid;
		border-radius: 0.5rem;
		transition: all 0.2s;
		min-height: 120px;
	}

	.stats-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border-color: var(--accent);
	}

	.stats-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.stats-icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		background: var(--accent-soft);
		border-radius: 0.375rem;
	}

	.stats-icon {
		width: 1rem;
		height: 1rem;
		color: var(--accent);
	}

	.stats-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--sand-11);
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.stats-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stats-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--sand-12);
		line-height: 1;
		font-family: 'JetBrains Mono', monospace;
	}

	.stats-value-skeleton {
		height: 2rem;
		width: 60%;
		background: linear-gradient(90deg, var(--sand-4) 25%, var(--sand-5) 50%, var(--sand-4) 75%);
		background-size: 200% 100%;
		animation: skeleton-loading 1.5s ease-in-out infinite;
		border-radius: 0.25rem;
	}

	@keyframes skeleton-loading {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.stats-trend {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
	}

	.trend-icon {
		width: 0.875rem;
		height: 0.875rem;
	}

	.trend-value {
		font-weight: 600;
	}

	.trend-label {
		color: var(--sand-10);
		margin-left: 0.25rem;
	}
</style>