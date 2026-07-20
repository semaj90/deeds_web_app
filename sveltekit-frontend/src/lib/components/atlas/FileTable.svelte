<script lang="ts">
  import type { FileLabel } from '$lib/server/atlas/contracts/file-understanding.js';

  interface Props {
    files: FileLabel[];
    loading?: boolean;
    onSelect?: (file: FileLabel) => void;
  }

  const { files = [], loading = false, onSelect }: Props = $props();

  let sortBy = $state<keyof FileLabel>('app_criticality');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let filterPurpose = $state<string | null>(null);
  let filterCriticality = $state<string | null>(null);

  // Sorted and filtered files
  const displayFiles = $derived.by(() => {
    let result = [...files];

    if (filterPurpose) {
      result = result.filter((f) => f.file_purpose === filterPurpose);
    }

    if (filterCriticality) {
      result = result.filter((f) => f.app_criticality === filterCriticality);
    }

    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  });

  // Quick stats
  const stats = $derived.by(() => {
    return {
      total: files.length,
      coreFiles: files.filter((f) => f.file_purpose === 'core').length,
      highRisk: files.filter((f) => f.app_criticality === 'high_risk').length,
      lowCoverage: files.filter((f) => f.test_coverage_pct === 0).length,
      avgConfidence: (files.reduce((sum, f) => sum + f.confidence, 0) / files.length || 0).toFixed(2),
    };
  });

  function toggleSort(column: keyof FileLabel) {
    if (sortBy === column) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortDir = 'desc';
    }
  }

  function getCriticalityColor(criticality: string) {
    return {
      core: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950',
      high_risk: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950',
      mid_tier: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950',
      optional: 'text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-950',
      experimental: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950',
    }[criticality] || '';
  }

  function getThoroughnessBar(level: number) {
    const filled = Math.min(level, 5);
    return '█'.repeat(filled) + '░'.repeat(5 - filled);
  }
</script>

<div class="space-y-4">
  <!-- Stats Bar -->
  <div class="grid grid-cols-5 gap-2 text-sm">
    <div class="bg-blue-50 dark:bg-blue-950 p-3 rounded">
      <p class="text-neutral-500 dark:text-neutral-400">Total</p>
      <p class="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
    </div>
    <div class="bg-red-50 dark:bg-red-950 p-3 rounded">
      <p class="text-neutral-500 dark:text-neutral-400">Core Files</p>
      <p class="text-lg font-bold text-red-600 dark:text-red-400">{stats.coreFiles}</p>
    </div>
    <div class="bg-orange-50 dark:bg-orange-950 p-3 rounded">
      <p class="text-neutral-500 dark:text-neutral-400">High Risk</p>
      <p class="text-lg font-bold text-orange-600 dark:text-orange-400">{stats.highRisk}</p>
    </div>
    <div class="bg-yellow-50 dark:bg-yellow-950 p-3 rounded">
      <p class="text-neutral-500 dark:text-neutral-400">Low Coverage</p>
      <p class="text-lg font-bold text-yellow-600 dark:text-yellow-400">{stats.lowCoverage}</p>
    </div>
    <div class="bg-purple-50 dark:bg-purple-950 p-3 rounded">
      <p class="text-neutral-500 dark:text-neutral-400">Avg Confidence</p>
      <p class="text-lg font-bold text-purple-600 dark:text-purple-400">{stats.avgConfidence}</p>
    </div>
  </div>

  <!-- Quick Filters -->
  <div class="flex gap-2 flex-wrap">
    <button
      class={`px-3 py-1 rounded text-sm font-medium transition ${
        filterPurpose === 'core'
          ? 'bg-red-600 text-white'
          : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'
      }`}
      onclick={() => (filterPurpose = filterPurpose === 'core' ? null : 'core')}
    >
      Core Only
    </button>
    <button
      class={`px-3 py-1 rounded text-sm font-medium transition ${
        filterCriticality === 'high_risk'
          ? 'bg-orange-600 text-white'
          : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'
      }`}
      onclick={() => (filterCriticality = filterCriticality === 'high_risk' ? null : 'high_risk')}
    >
      High Risk
    </button>
    <button
      class={`px-3 py-1 rounded text-sm font-medium transition ${
        filterPurpose === 'test'
          ? 'bg-blue-600 text-white'
          : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'
      }`}
      onclick={() => (filterPurpose = filterPurpose === 'test' ? null : 'test')}
    >
      Test Files
    </button>
    <button
      class={`px-3 py-1 rounded text-sm font-medium transition ${
        filterPurpose === 'deprecated'
          ? 'bg-neutral-600 text-white'
          : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'
      }`}
      onclick={() => (filterPurpose = filterPurpose === 'deprecated' ? null : 'deprecated')}
    >
      Deprecated
    </button>
  </div>

  <!-- Table -->
  <div class="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded">
    <table class="w-full text-sm">
      <thead class="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <tr>
          <th class="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">
            File
          </th>
          <th class="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onclick={() => toggleSort('file_purpose')}
          >
            Purpose {sortBy === 'file_purpose' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onclick={() => toggleSort('thoroughness')}
          >
            Thorough {sortBy === 'thoroughness' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onclick={() => toggleSort('app_criticality')}
          >
            Criticality {sortBy === 'app_criticality' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 text-center font-semibold text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onclick={() => toggleSort('test_coverage_pct')}
          >
            Coverage % {sortBy === 'test_coverage_pct' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">
            Method
          </th>
          <th class="px-4 py-3 text-right font-semibold text-neutral-600 dark:text-neutral-400">
            Confidence
          </th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          <tr>
            <td colspan="7" class="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
              Loading files...
            </td>
          </tr>
        {:else if displayFiles.length === 0}
          <tr>
            <td colspan="7" class="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
              No files match the selected filters
            </td>
          </tr>
        {:else}
          {#each displayFiles as file (file.packet_key)}
            <tr
              class="border-b border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer transition"
              onclick={() => onSelect?.(file)}
            >
              <td class="px-4 py-3 font-mono text-xs truncate max-w-xs">
                {file.source_ref}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100">
                  {file.file_purpose}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap font-mono text-xs">
                {getThoroughnessBar(file.thoroughness)}
                <span class="text-neutral-500 dark:text-neutral-400 ml-1">{file.thoroughness}/5</span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span class={`px-2 py-1 rounded text-xs font-medium ${getCriticalityColor(file.app_criticality)}`}>
                  {file.app_criticality}
                </span>
              </td>
              <td class="px-4 py-3 text-center font-medium">
                {#if file.test_coverage_pct === 0}
                  <span class="text-red-600 dark:text-red-400">0%</span>
                {:else if file.test_coverage_pct < 50}
                  <span class="text-yellow-600 dark:text-yellow-400">{file.test_coverage_pct}%</span>
                {:else}
                  <span class="text-green-600 dark:text-green-400">{file.test_coverage_pct}%</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                {file.method}
              </td>
              <td class="px-4 py-3 text-right font-medium">
                {file.confidence.toFixed(2)}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  table tbody tr:last-child {
    border-bottom: none;
  }
</style>
