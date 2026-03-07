<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Case } from '$lib/types/api';
  import  Input  from "$lib/components/ui/input/Input.svelte";
  import * as Select from '$lib/components/ui/select.svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { Search, Filter, SortAsc, SortDesc  } from 'lucide-svelte';
  interface Props {
    cases: Case[];
    filteredCases: Case[];
    searchQuery: string;
    statusFilter: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }
  let { cases = [],
    filteredCases = [],
    searchQuery = '',
    statusFilter = 'all',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = $props<Props>();
  // Simple Case Filters Component - TODO: Enhance with full functionality
  //
  // 🚀 ENHANCEMENT ROADMAP (See: /ENHANCED_FEATURES_TODO.md)
  // ========================================================
  // 1. ADVANCED FILTERING - Date ranges, assignees, priorities, tags
  // 2. FUZZY SEARCH - Fuse.js integration for intelligent text search
  // 3. REAL-TIME UPDATES - WebSocket integration for live case updates
  // 4. FILTER PERSISTENCE - URL params and localStorage integration
  // 5. EXPORT FEATURES - CSV/PDF export of filtered results
  // 6. BULK ACTIONS - Multi-select and batch operations
  //
  // 📋 WIRING REQUIREMENTS:
  // - Dependencies: fuse.js, date-fns, file-saver
  // - Stores: URL state management, user preferences
  // - Services: ExportService, NotificationService
  // - Components: DateRangePicker, MultiSelect, BulkActionBar
  // TODO: Enhanced filter interface
  // interface AdvancedFilters {
  //   status: string[]
  //   dateRange: { start: Date end: Date }
  //   assignee: string[]
  //   priority: ['high', 'medium', 'low']
  //   tags: string[]
  //   evidenceCount: { min: number max: number }
  //   hasAttachments: boolean
  //   lastActivityDays: number
  // }
  $effect(() => {
    // TODO: IMPLEMENT ADVANCED FILTERING LOGIC
    // =======================================
    // 1. Debounced search with fuzzy matching
    // 2. Complex multi-criteria filtering
    // 3. Date range filtering with smart presets
    // 4. Tag-based filtering with autocomplete
    // 5. Assignee filtering with user lookup
    // 6. Priority and status combination filtering
    //
    // ENHANCEMENT: Replace with Fuse.js fuzzy search
    // const fuse = new Fuse(cases, {
    //   keys: ['title', 'description', 'tags', 'assignee.name'],
    //   threshold: 0.3,
    //   includeScore: true
    // })
    // Simple filtering logic (STUB)
    filteredCases = cases.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchQuery && !c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    // TODO: IMPLEMENT ADVANCED SORTING
    // ===============================
    // 1. Multi-column sorting
    // 2. Custom sort functions for complex types
    // 3. Stable sorting preservation
    // 4. Sort direction indicators in UI
    // Simple sorting (STUB)
    filteredCases.sort((a, b) => {
      const aVal = a[sortBy as keyof Case];
      const bVal = b[sortBy as keyof Case];
      const compare = aVal > bVal ? 1 : -1;
      return sortOrder === 'asc' ? compare : -compar;
    });
  });
</script>
<div class="flex flex-wrap gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border">
  <div class="flex items-center gap-2 flex-1 min-w-[200px]">
    <Search class="w-4 h-4 text-gray-500" />
    <Input;
      bind:value={searchQuery}
      placeholder="Search cases..."
      class="flex-1"
    />
  </div>
  <div class="flex items-center gap-2">
    <Filter class="w-4 h-4 text-gray-500" />
    <Select bind:value={statusFilter}>
      <Select.Trigger class="w-[140px]">
        <Select.Value placeholder="Status" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">All Statuses</Select.Item>
        <Select.Item value="active">Active</Select.Item>
        <Select.Item value="pending">Pending</Select.Item>
        <Select.Item value="closed">Closed</Select.Item>
      </Select.Content>
    </Select>
  </div>
  <div class="flex items-center gap-2">
    <Select bind:value={sortBy}>
      <Select.Trigger class="w-[130px]">
        <Select.Value placeholder="Sort by" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="createdAt">Created Date</Select.Item>
        <Select.Item value="title">Title</Select.Item>
        <Select.Item value="status">Status</Select.Item>
      </Select.Content>
    </Select>
  </div>
  <Button
    variant="ghost"
    size="sm"
    class="bits-btn"
    onclick={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
  >
    {#if sortOrder === 'asc'}
      <SortAsc class="w-4 h-4 mr-2" />
      Ascending
    {:else}
      <SortDesc class="w-4 h-4 mr-2" />
      Descending
    {/if}
</div>
<style>
  /* @unocss-include */
  .case-filters {
    margin-bottom: 1rem;
}
  .filter-row {
    display: flex;
    gap: 1rem;
    align-items: center;
}
  .search-input {
    flex: 1; padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
}
  .filter-select {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
}
</style>