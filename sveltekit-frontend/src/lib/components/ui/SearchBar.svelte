<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		placeholder?: string;
		value?: string;
		showAdvancedFilters?: boolean;
		onsearch?: (searchTerm: string) => void;
		onfilter?: (filters: { type?: string; dateRange?: { from: string; to: string } }) => void;
	}

	let {
		placeholder = 'Search legal documents and cases...',
		value = $bindable(''),
		showAdvancedFilters = false,
		onsearch,
		onfilter,
	}: Props = $props();

	let selectedType = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function debouncedSearch(searchTerm: string) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => onsearch?.(searchTerm), 300);
	}

	$effect(() => {
		if (value !== undefined) {
			debouncedSearch(value);
		}
	});

	function handleFilterChange() {
		onfilter?.({
			type: selectedType || undefined,
			dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : undefined,
		});
	}

	function clearFilters() {
		selectedType = '';
		dateFrom = '';
		dateTo = '';
		handleFilterChange();
	}
</script>

<div class="flex gap-2 items-center w-full max-w-[600px]">
	<div class="relative flex-1">
		<Icon name="search" size={16} />
		<input
			type="text"
			{placeholder}
			bind:value
			class="w-full pl-10 pr-4 py-3 border border-sand/20 rounded-lg text-sm bg-panelSoft text-sand outline-none focus:border-info"
			aria-label="Search"
		/>
	</div>

	{#if showAdvancedFilters}
		<div class="flex gap-2 items-center mt-2">
			<select bind:value={selectedType} onchange={handleFilterChange} class="px-2 py-1 border border-sand/20 rounded bg-panelSoft text-sand text-sm">
				<option value="">All types</option>
				<option value="case">Case</option>
				<option value="document">Document</option>
			</select>
			<label class="text-sm text-sand/60">
				From
				<input type="date" bind:value={dateFrom} onchange={handleFilterChange} class="px-2 py-1 border border-sand/20 rounded bg-panelSoft text-sand text-sm" />
			</label>
			<label class="text-sm text-sand/60">
				To
				<input type="date" bind:value={dateTo} onchange={handleFilterChange} class="px-2 py-1 border border-sand/20 rounded bg-panelSoft text-sand text-sm" />
			</label>
			<button type="button" onclick={clearFilters} class="px-3 py-1 border border-sand/20 rounded text-sm text-sand/60 hover:text-sand">
				Clear
			</button>
		</div>
	{/if}
</div>