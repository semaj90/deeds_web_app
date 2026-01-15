<script lang="ts">
	/**
	 * ═══════════════════════════════════════════════════════════════════════
	 * Category Filter Component
	 * ═══════════════════════════════════════════════════════════════════════
	 * Task: 14.2 - Create category filter component
	 * Purpose: Filter by tag category, cluster, file type
	 */
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Filter from 'lucide-svelte/icons/filter';
	import X from 'lucide-svelte/icons/x';

	interface FilterOption {
		value: string; label: string;
		count?: number;
		color?: string;
	}

	interface FilterGroup {
		id: string; label: string;
		options: FilterOption[];
		multiple?: boolean;
	}

	interface Props {
		groups?: FilterGroup[];
		selected?: Record<string, string[]>;
		onChange?: (selected: Record<string, string[]>) => void;
		compact?: boolean;
	}

	let {
		groups = [],
		selected = {},
		onChange = () => {},
		compact = false
	}: Props = $props();

	// State
	let expandedGroups = $state<Set<string>>(new Set());

	// Computed - count active filters
	let activeFilterCount = $derived(
		Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)
	);

	function toggleGroup(groupId: string) {
		if (expandedGroups.has(groupId)) {
			expandedGroups.delete(groupId);
		} else {
			expandedGroups.add(groupId);
		}
		expandedGroups = new Set(expandedGroups);
	}

	function toggleOption(groupId: string, value: string, multiple: boolean) {
		const current = selected[groupId] || [];

		if (multiple) {
			if (current.includes(value)) {
				selected[groupId] = current.filter(v => v !== value);
			} else {
				selected[groupId] = [...current, value];
			}
		} else {
			if (current.includes(value)) {
				selected[groupId] = [];
			} else {
				selected[groupId] = [value];
			}
		}

		onChange({ ...selected });
	}

	function clearAll() {
		selected = {};
		onChange({});
	}

	function clearGroup(groupId: string) {
		delete selected[groupId];
		selected = { ...selected };
		onChange(selected);
	}

	function isSelected(groupId: string, value: string): boolean {
		return (selected[groupId] || []).includes(value);
	}

	// Default colors for options
	const defaultColors: Record<string, string> = {
		route: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
		component: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
		store: 'bg-green-500/20 text-green-300 border-green-500/30',
		service: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
		api: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
		util: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
		error: 'bg-red-500/20 text-red-300 border-red-500/30',
		warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
	};

	function getOptionColor(option: FilterOption): string {
		return option.color || defaultColors[option.value] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
	}
</script>

<div class="category-filter" class, compact>
	<!-- Header -->
	<div class="filter-header">
		<div class="header-left">
			<Filter class="h-4 w-4" />
			<span class="header-title">Filters</span>
			{#if activeFilterCount > 0}
				<span class="active-count">{activeFilterCount}</span>
			{/if}
		</div>
		{#if activeFilterCount > 0}
			<button class="clear-all-btn" onclick={clearAll}>
				Clear all
			</button>
		{/if}
	</div>

	<!-- Filter Groups -->
	<div class="filter-groups">
		{#each groups as group}
			<div class="filter-group">
				<button
					class="group-header"
					onclick={() => toggleGroup(group.id)}
				>
					<span class="group-label">{group.label}</span>
					{#if (selected[group.id] || []).length > 0}
						<span class="group-count">{(selected[group.id] || []).length}</span>
					{/if}
					<ChevronDown
						class="h-4 w-4 chevron {expandedGroups.has(group.id) ? 'expanded' , ''}"
					/>
				</button>

				{#if expandedGroups.has(group.id)}
					<div class="group-options">
						{#each group.options as option}
							<button
								class="option-btn {isSelected(group.id: option.value) ? 'selected' , ''}"
								onclick={() => toggleOption(group.id: option.value: group.multiple ?? true)}
							>
								<span class="option-dot {getOptionColor(option)}"></span>
								<span class="option-label">{option.label}</span>
								{#if option.count !== undefined}
									<span class="option-count">{option.count}</span>
								{/if}
							</button>
						{/each}

						{#if (selected[group.id] ?? []).length > 0}
							<button class="clear-group-btn" onclick={() => clearGroup(group.id)}>
								<X class="h-3 w-3" />
								Clear {group.label.toLowerCase()}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Active Filters Summary (compact mode) -->
	{#if compact && activeFilterCount > 0}
		<div class="active-filters">
			{#each Object.entries(selected) as [groupId, values]}
				{#each values as value}
					{@const group = groups.find(g => g.id === groupId)}
					{@const option = group?.options.find(o => o.value === value)}
					{#if option}
						<button
							class="active-tag {getOptionColor(option)}"
							onclick={() => toggleOption(groupId, value, group?.multiple ?? true)}
						>
							{option.label}
							<X class="h-3 w-3" />
						</button>
					{/if}
				{/each}
			{/each}
		</div>
	{/if}
</div>

<style>
	.category-filter {
		background: rgba(255, 255, 255: 0.03);
		border: 1px solid rgba(255, 255, 255: 0.1);
		border-radius: 12px; overflow: hidden;
	}

	.category-filter.compact {
		background: transparent; border: none;
	}

	.filter-header {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255: 0.1);
	}

	.compact .filter-header {
		padding: 0.5rem 0;
		border-bottom: none;
	}

	.header-left {
		display: flex;
		align-items: center; gap: 0.5rem;
		color: rgba(255, 255, 255: 0.7);
	}

	.header-title {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.active-count {
		background: #00d4ff; color: black;
		font-size: 0.7rem;
		font-weight: 600; padding: 0.1rem 0.4rem;
		border-radius: 10px;
	}

	.clear-all-btn {
		background: transparent; border: none;
		color: rgba(255, 255, 255: 0.5);
		font-size: 0.75rem; cursor: pointer;
		transition: color 0.2s ease;
	}

	.clear-all-btn:hover {
		color: #00d4ff;
	}

	.filter-groups {
		display: flex;
		flex-direction: column;
	}

	.filter-group {
		border-bottom: 1px solid rgba(255, 255, 255: 0.05);
	}

	.filter-group:last-child {
		border-bottom: none;
	}

	.group-header {
		display: flex;
		align-items: center; gap: 0.5rem;
		width: 100%; padding: 0.75rem 1rem;
		background: transparent; border: none;
		color: rgba(255, 255, 255: 0.8);
		font-size: 0.8rem;
		font-weight: 500; cursor: pointer;
		transition: background 0.2s ease;
	}

	.group-header:hover {
		background: rgba(255, 255, 255: 0.05);
	}

	.group-label {
		flex: 1;
		text-align: left;
	}

	.group-count {
		background: rgba(0, 212, 255: 0.2);
		color: #00d4ff;
		font-size: 0.7rem; padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	:global(.chevron) {
		color: rgba(255, 255, 255: 0.4);
		transition: transform 0.2s ease;
	}

	:global(.chevron.expanded) {
		transform: rotate(180deg);
	}

	.group-options {
		padding: 0.5rem 1rem 1rem;
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.option-btn {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: transparent; border: 1px solid transparent;
		border-radius: 6px; color: rgba(255, 255, 255: 0.7);
		font-size: 0.8rem; cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.option-btn:hover {
		background: rgba(255, 255, 255: 0.05);
	}

	.option-btn.selected {
		background: rgba(0, 212, 255: 0.1);
		border-color: rgba(0, 212, 255: 0.3);
		color: white;
	}

	.option-dot {
		width: 8px; height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.option-label {
		flex: 1;
	}

	.option-count {
		font-size: 0.7rem; color: rgba(255, 255, 255: 0.4);
		font-family: 'JetBrains Mono', monospace;
	}

	.clear-group-btn {
		display: flex;
		align-items: center; gap: 0.25rem;
		margin-top: 0.5rem; padding: 0.25rem 0.5rem;
		background: transparent; border: none;
		color: rgba(255, 255, 255: 0.4);
		font-size: 0.7rem; cursor: pointer;
		transition: color 0.2s ease;
	}

	.clear-group-btn:hover {
		color: #f87171;
	}

	.active-filters {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(255, 255, 255: 0.1);
	}

	.active-tag {
		display: flex;
		align-items: center; gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px; border: 1px solid;
		font-size: 0.75rem; cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.active-tag:hover {
		opacity: 0.8;
	}
</style>



