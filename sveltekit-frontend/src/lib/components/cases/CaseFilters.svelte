<script lang="ts">
  import type { Case } from '$lib/types';
  import { Input } from "$lib/components/ui/input";
  import { Select } from "bits-ui";
import Button from '$lib/components/ui/Button.svelte';
  import Search from 'lucide-svelte/icons/search';
  import Filter from 'lucide-svelte/icons/filter';
  import SortAsc from 'lucide-svelte/icons/sort-asc';
  import SortDesc from 'lucide-svelte/icons/sort-desc';

  interface Props {
    cases?: Case[];
    filteredCases?: Case[];
    searchQuery?: string;
    statusFilter?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  let {
    cases = [],
    filteredCases = $bindable([]),
    searchQuery = $bindable(''),
    statusFilter = $bindable('all'),
    sortBy = $bindable('createdAt'),
    sortOrder = $bindable('desc')
  }: Props = $props();

  $effect(() => {
    let result = cases;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortBy as keyof Case];
      const bVal = b[sortBy as keyof Case];

      // Handle potentially undefined values safely
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      const compare = aVal > bVal ? 1 : -1;
      return sortOrder === 'asc' ? compare : -compare;
    });

    filteredCases = result;
  });

  function toggleSortOrder() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  }
</script>

<div class="flex flex-wrap gap-4 p-4 bg-white dark:bg-panelSoft rounded-lg shadow-sm">
  <div class="flex items-center gap-2 flex-1">
    <Search class="w-4 h-4 text-muted-foreground" />
    <Input
      bind:value={searchQuery}
      placeholder="Search cases..."
      class="flex-1"
    />
  </div>

  <div class="flex items-center gap-2">
    <Filter class="w-4 h-4 text-muted-foreground" />
    <Select.Root bind:value={statusFilter} type="single">
      <Select.Trigger class="w-[140px]">
        {#if statusFilter === 'all'}
          All Statuses
        {:else if statusFilter === 'active'}
          Active
        {:else if statusFilter === 'pending'}
          Pending
        {:else if statusFilter === 'closed'}
          Closed
        {:else}
          {statusFilter}
        {/if}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">All Statuses</Select.Item>
        <Select.Item value="active">Active</Select.Item>
        <Select.Item value="pending">Pending</Select.Item>
        <Select.Item value="closed">Closed</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>

  <div class="flex items-center gap-2">
    <Select.Root bind:value={sortBy} type="single">
      <Select.Trigger class="w-[140px]">
        {#if sortBy === 'createdAt'}
          Created Date
        {:else if sortBy === 'title'}
          Title
        {:else if sortBy === 'status'}
          Status
        {:else}
          {sortBy}
        {/if}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="createdAt">Created Date</Select.Item>
        <Select.Item value="title">Title</Select.Item>
        <Select.Item value="status">Status</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>

  <Button
    variant="ghost"
    size="sm"
    class="gap-2"
    onclick={toggleSortOrder}
  >
    {#if sortOrder === 'asc'}
      <SortAsc class="w-4 h-4" />
      Ascending
    {:else}
      <SortDesc class="w-4 h-4" />
      Descending
    {/if}
  </Button>
</div>

<style>
  /* Minimal local styles, relying on Tailwind/UnoCSS */
</style>
