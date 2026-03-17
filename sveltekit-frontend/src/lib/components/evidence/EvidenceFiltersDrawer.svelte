<script lang="ts">
	import EvidenceFilters from '$lib/components/yorha/evidence/EvidenceFilters.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { AdvancedEvidenceFilters } from './evidence-utils.js';

	let {
		open = $bindable(false),
		onFilter
	}: {
		open?: boolean;
		onFilter?: (filters: AdvancedEvidenceFilters) => void;
	} = $props();
</script>

{#if open}
	<div class="filters-panel">
		<div class="filters-header">
			<h3 class="filters-title">
				<Icon name="sliders-horizontal" class="w-4 h-4" />
				Advanced Filters
			</h3>
			<button type="button" class="filters-close" onclick={() => (open = false)}>
				<Icon name="x" class="w-4 h-4" />
			</button>
		</div>
		<div class="filters-body">
			<EvidenceFilters onfilter={(f) => onFilter?.(f)} />
		</div>
	</div>
{/if}

<style>
	.filters-panel {
		margin: 0 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		overflow: hidden;
	}
	.filters-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}
	.filters-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.6);
		margin: 0;
	}
	.filters-close {
		padding: 0.25rem;
		border-radius: 4px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.filters-close:hover {
		color: rgba(212, 199, 163, 0.7);
		background: rgba(255, 255, 255, 0.06);
	}
	.filters-body {
		padding: 1rem;
	}
</style>