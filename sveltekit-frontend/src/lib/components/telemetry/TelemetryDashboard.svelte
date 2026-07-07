<script lang="ts">
  import { onMount } from 'svelte';

  interface ToolMetrics {
    tool_name: string;
    call_count: number;
    success_count: number;
    error_count: number;
    avg_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    success_rate: number;
    last_error: string | null;
  }

  interface DispatcherMetrics {
    node_id: string;
    call_count: number;
    avg_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
  }

  interface ImplementationCluster {
    cluster_id: string;
    tool_name: string;
    feature_id: string;
    files: { path: string; type: string }[];
    tests: { path: string; passing: number; total: number }[];
    metrics: {
      total_calls: number;
      success_rate: number;
      avg_duration_ms: number;
      error_count: number;
    };
    confidence: number;
  }

  let toolMetrics = $state<ToolMetrics[]>([]);
  let dispatcherMetrics = $state<DispatcherMetrics[]>([]);
  let implementationClusters = $state<ImplementationCluster[]>([]);
  let loading = $state(true);
  let selectedTool = $state<string | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      // Fetch aggregated MCP tool telemetry
      const toolRes = await fetch('/api/telemetry/aggregated-mcp-tools');
      const toolData = await toolRes.json();
      toolMetrics = Object.entries(toolData.tools || {}).map(([name, data]: any) => ({
        tool_name: name,
        ...data
      }));

      // Fetch implementation clusters
      const clusterRes = await fetch('/api/telemetry/implementation-clusters');
      const clusterData = await clusterRes.json();
      implementationClusters = clusterData.clusters || [];

      loading = false;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      loading = false;
    }
  });

  function selectTool(toolName: string) {
    selectedTool = selectedTool === toolName ? null : toolName;
  }

  function getHealthColor(successRate: number): string {
    if (successRate >= 0.95) return 'text-green-600';
    if (successRate >= 0.9) return 'text-yellow-600';
    return 'text-red-600';
  }

  function formatMs(ms: number): string {
    return ms.toFixed(1) + 'ms';
  }
</script>

<div class="space-y-6 p-6">
  <!-- Header -->
  <div>
    <h1 class="text-3xl font-bold">Telemetry Dashboard</h1>
    <p class="text-gray-600 mt-1">Real-time MCP tool metrics and implementation clusters</p>
  </div>

  {#if loading}
    <div class="text-center text-gray-500">Loading telemetry data...</div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded p-4 text-red-800">
      Error: {error}
    </div>
  {:else}
    <!-- Tool Metrics Table -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-xl font-semibold">MCP Tool Metrics</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-6 py-3 text-left font-semibold text-gray-700">Tool</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">Calls</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">Success Rate</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">P50</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">P95</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">Errors</th>
              <th class="px-6 py-3 text-center font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each toolMetrics as metric (metric.tool_name)}
              <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-6 py-4 font-mono text-gray-900">{metric.tool_name}</td>
                <td class="px-6 py-4 text-center text-gray-700">{metric.call_count}</td>
                <td class="px-6 py-4 text-center {getHealthColor(metric.success_rate)} font-semibold">
                  {(metric.success_rate * 100).toFixed(1)}%
                </td>
                <td class="px-6 py-4 text-center text-gray-700">{formatMs(metric.p50_duration_ms)}</td>
                <td class="px-6 py-4 text-center text-gray-700">{formatMs(metric.p95_duration_ms)}</td>
                <td class="px-6 py-4 text-center">
                  <span class={metric.error_count > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                    {metric.error_count}
                  </span>
                </td>
                <td class="px-6 py-4 text-center">
                  <button
                    onclick={() => selectTool(metric.tool_name)}
                    class="text-blue-600 hover:text-blue-800 underline"
                  >
                    {selectedTool === metric.tool_name ? 'Hide' : 'Show'}
                  </button>
                </td>
              </tr>
              {#if selectedTool === metric.tool_name}
                <tr class="bg-blue-50 border-b border-gray-200">
                  <td colspan="7" class="px-6 py-4">
                    <div class="space-y-2">
                      <p class="text-sm text-gray-700">
                        <span class="font-semibold">Average duration:</span> {formatMs(metric.avg_duration_ms)}
                      </p>
                      {#if metric.last_error}
                        <p class="text-sm text-red-700">
                          <span class="font-semibold">Last error:</span> {metric.last_error}
                        </p>
                      {/if}
                      <p class="text-sm text-gray-600">
                        {metric.success_count} succeeded, {metric.error_count} failed out of {metric.call_count} calls
                      </p>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Implementation Clusters -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-xl font-semibold">Implementation Clusters</h2>
      </div>
      <div class="space-y-4 p-6">
        {#if implementationClusters.length === 0}
          <p class="text-gray-500">No implementation clusters found</p>
        {:else}
          {#each implementationClusters as cluster (cluster.cluster_id)}
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex justify-between items-start mb-3">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">{cluster.tool_name}</h3>
                  <p class="text-sm text-gray-600">{cluster.feature_id}</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold {getHealthColor(cluster.metrics.success_rate)}">
                    {(cluster.metrics.success_rate * 100).toFixed(0)}%
                  </p>
                  <p class="text-xs text-gray-500">confidence: {(cluster.confidence * 100).toFixed(0)}%</p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p class="text-xs font-semibold text-gray-500 uppercase">Metrics</p>
                  <ul class="text-sm text-gray-700 space-y-1">
                    <li>{cluster.metrics.total_calls} calls</li>
                    <li>{cluster.metrics.error_count} errors</li>
                    <li>Avg: {formatMs(cluster.metrics.avg_duration_ms)}</li>
                  </ul>
                </div>
                <div>
                  <p class="text-xs font-semibold text-gray-500 uppercase">Files</p>
                  <ul class="text-sm text-gray-700 space-y-1">
                    {#each cluster.files.slice(0, 3) as file}
                      <li class="font-mono text-xs">{file.path}</li>
                    {/each}
                    {#if cluster.files.length > 3}
                      <li class="text-gray-500">+{cluster.files.length - 3} more</li>
                    {/if}
                  </ul>
                </div>
              </div>

              <div>
                <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Tests</p>
                <div class="space-y-1">
                  {#each cluster.tests as test}
                    <p class="text-sm">
                      <span class="font-mono">{test.path}</span>
                      <span class="text-green-600 font-semibold">{test.passing}/{test.total}</span>
                    </p>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Alert Summary -->
    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 class="font-semibold text-yellow-900">Alerts</h3>
      <ul class="mt-2 space-y-1 text-sm text-yellow-800">
        {#each toolMetrics.filter(t => t.success_rate < 0.95) as tool}
          <li>⚠️ {tool.tool_name} has success rate {(tool.success_rate * 100).toFixed(1)}%</li>
        {/each}
        {#each toolMetrics.filter(t => t.p95_duration_ms > 200) as tool}
          <li>⚠️ {tool.tool_name} P95 latency is {formatMs(tool.p95_duration_ms)}</li>
        {/each}
        {#if toolMetrics.filter(t => t.success_rate < 0.95).length === 0 && toolMetrics.filter(t => t.p95_duration_ms > 200).length === 0}
          <li>✅ All systems operational</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
