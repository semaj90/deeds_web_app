<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Stage {
    stageId: number;
    name: string;
    script: string;
    critical: boolean;
    gate?: string;
  }

  interface Metrics {
    last_run: string;
    duration_seconds: number;
    successful_stages: number;
    failed_stages: number;
    cache_hit_rate: number;
    packets_processed: number;
  }

  let stages: Stage[] = [];
  let metrics: Metrics | null = null;
  let loading = $state(true);
  let executing = $state(false);
  let selectedStage: number | null = $state(null);

  onMount(async () => {
    try {
      const [statusRes, metricsRes] = await Promise.all([
        fetch('/api/admin/graphify/status'),
        fetch('/api/admin/graphify/metrics'),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        stages = statusData.stages || [];
      }

      if (metricsRes.ok) {
        metrics = await metricsRes.json();
      }
    } catch (err) {
      console.error('Failed to load graphify status:', err);
    } finally {
      loading = false;
    }
  });

  async function executeStage(stageId: number) {
    executing = true;
    selectedStage = stageId;

    try {
      const res = await fetch('/api/admin/graphify/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, skipGateValidation: false }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log(`Stage ${stageId} executed:`, result);
        alert(`Stage ${result.stageName} executed successfully`);

        // Refresh metrics
        const metricsRes = await fetch('/api/admin/graphify/metrics');
        if (metricsRes.ok) {
          metrics = await metricsRes.json();
        }
      } else {
        const error = await res.json();
        alert(`Failed to execute stage: ${error.error}`);
      }
    } catch (err) {
      console.error('Execution error:', err);
      alert('Error executing stage');
    } finally {
      executing = false;
      selectedStage = null;
    }
  }

  function getStageStatus(stageId: number) {
    // In production, fetch from Redis or DB
    return 'pending';
  }

  function getCriticalColor(critical: boolean) {
    return critical ? 'text-danger' : 'text-info';
  }

  function getMetricsColor(value: number, threshold: number) {
    if (value === 0) return 'text-gray-500';
    return value >= threshold ? 'text-green-600' : 'text-yellow-600';
  }
</script>

<div class="min-h-screen bg-panel p-6">
  <div class="mx-auto max-w-6xl">
    {/* Header */}
    <div class="mb-8 border-b border-panel-soft pb-4">
      <h1 class="flex items-center gap-2 text-3xl font-bold">
        <Icon name="activity" />
        Graphify Control Panel
      </h1>
      <p class="mt-2 text-sm text-gray-600">Manage daily codebase intelligence pipeline</p>
    </div>

    {/* Metrics Summary */}
    {#if metrics}
      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded border border-panel-soft bg-panel-soft p-4">
          <p class="text-xs font-semibold uppercase text-gray-500">Last Run</p>
          <p class="mt-2 font-mono text-sm">{metrics.last_run === 'never' ? 'Never' : new Date(metrics.last_run).toLocaleString()}</p>
        </div>

        <div class="rounded border border-panel-soft bg-panel-soft p-4">
          <p class="text-xs font-semibold uppercase text-gray-500">Duration</p>
          <p class={`mt-2 font-mono text-sm ${getMetricsColor(metrics.duration_seconds, 300)}`}>
            {metrics.duration_seconds}s
          </p>
        </div>

        <div class="rounded border border-panel-soft bg-panel-soft p-4">
          <p class="text-xs font-semibold uppercase text-gray-500">Success Rate</p>
          <p class="mt-2 font-mono text-sm">
            {metrics.successful_stages}/{metrics.successful_stages + metrics.failed_stages}
          </p>
        </div>

        <div class="rounded border border-panel-soft bg-panel-soft p-4">
          <p class="text-xs font-semibold uppercase text-gray-500">Cache Hit Rate</p>
          <p class={`mt-2 font-mono text-sm ${getMetricsColor(metrics.cache_hit_rate, 0.7)}`}>
            {metrics.cache_hit_rate.toFixed(1)}%
          </p>
        </div>
      </div>
    {/if}

    {/* Stages Table */}
    {#if loading}
      <p class="text-center text-gray-500">Loading stages...</p>
    {:else if stages.length === 0}
      <p class="text-center text-gray-500">No stages configured</p>
    {:else}
      <div class="rounded border border-panel-soft bg-panel-soft overflow-hidden">
        <table class="w-full text-sm">
          <thead class="border-b border-panel bg-panel p-3">
            <tr>
              <th class="px-4 py-2 text-left font-semibold">Stage</th>
              <th class="px-4 py-2 text-left font-semibold">Name</th>
              <th class="px-4 py-2 text-left font-semibold">Type</th>
              <th class="px-4 py-2 text-left font-semibold">Gate</th>
              <th class="px-4 py-2 text-left font-semibold">Status</th>
              <th class="px-4 py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each stages as stage (stage.stageId)}
              <tr class="border-b border-panel-soft hover:bg-panel">
                <td class="px-4 py-3">
                  <code class="text-xs font-mono">{stage.stageId}</code>
                </td>
                <td class="px-4 py-3">{stage.name}</td>
                <td class="px-4 py-3">
                  <span class={`inline-block rounded px-2 py-1 text-xs font-semibold ${getCriticalColor(stage.critical)}`}>
                    {stage.critical ? 'Critical' : 'Optional'}
                  </span>
                </td>
                <td class="px-4 py-3 font-mono text-xs">
                  {stage.gate ? stage.gate : '—'}
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex gap-1">
                    <Icon name="circle-dot" class="text-yellow-500" />
                    {getStageStatus(stage.stageId)}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={executing && selectedStage === stage.stageId}
                    onclick={() => executeStage(stage.stageId)}
                  >
                    {executing && selectedStage === stage.stageId ? (
                      <>
                        <Icon name="loader-circle" class="animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Icon name="play-circle" />
                        Run
                      </>
                    )}
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {/* Footer */}
    <div class="mt-8 border-t border-panel-soft pt-4 text-xs text-gray-500">
      <p>Last updated: {new Date().toLocaleString()}</p>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: var(--color-bg, white);
  }
</style>
