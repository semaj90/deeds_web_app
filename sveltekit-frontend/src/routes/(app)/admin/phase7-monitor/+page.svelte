<script lang="ts">
  import { onMount } from 'svelte';

  interface Phase7Metrics {
    total_summaries: number;
    recent_5min: number;
    summaries_per_min: number;
    bitfrost_keys: number;
    bitfrost_terms: number;
    llm_concurrency: number;
    queue_depth: number;
    redis_status: 'connected' | 'disconnected';
    postgres_status: 'connected' | 'disconnected';
    gemma4_status: 'connected' | 'disconnected';
    last_update: string;
  }

  let metrics: Phase7Metrics | null = null;
  let refreshInterval = 5000;
  let autoRefresh = true;
  let history: Array<{ time: string; rate: number }> = [];

  async function fetchMetrics() {
    try {
      const response = await fetch('/api/admin/phase7-metrics');
      if (response.ok) {
        const data = await response.json();
        metrics = data;

        // Track history for sparkline
        if (data.summaries_per_min !== undefined) {
          history = [...history.slice(-59), { time: new Date().toLocaleTimeString(), rate: data.summaries_per_min }];
        }
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }

  onMount(() => {
    fetchMetrics();

    const timer = setInterval(() => {
      if (autoRefresh) fetchMetrics();
    }, refreshInterval);

    return () => clearInterval(timer);
  });

  function formatNumber(n: number | undefined) {
    if (n === undefined) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function getStatusColor(status: string) {
    return status === 'connected' ? 'text-green-600' : 'text-red-600';
  }

  function getThroughputTrend() {
    if (history.length < 2) return '→';
    const recent = history.slice(-5);
    const avg = recent.reduce((a, b) => a + b.rate, 0) / recent.length;
    const current = recent[recent.length - 1]?.rate ?? 0;
    return current > avg ? '↗' : current < avg ? '↘' : '→';
  }
</script>

<svelte:head>
  <title>Phase 7 Monitor</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-8">
  <header class="mb-8">
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-5xl font-bold text-slate-900">Phase 7 Monitor</h1>
        <p class="text-lg text-slate-600 mt-2">Gemma4 Summarization Pipeline — Real-time Throughput</p>
      </div>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" bind:checked={autoRefresh} class="w-4 h-4" />
          Auto Refresh
        </label>
        <button
          onclick={() => fetchMetrics()}
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Refresh
        </button>
      </div>
    </div>
  </header>

  {#if metrics}
    <div class="grid grid-cols-4 gap-4 mb-8">
      <!-- Total Summaries -->
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
        <div class="text-sm font-semibold text-slate-500 uppercase">Total Summaries</div>
        <div class="text-4xl font-bold text-slate-900 mt-2">{formatNumber(metrics.total_summaries)}</div>
        <div class="text-xs text-slate-500 mt-2">of 40,754 (8.6%)</div>
        <div class="mt-4 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            class="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={`width: ${((metrics.total_summaries || 0) / 40754) * 100}%`}
          />
        </div>
      </div>

      <!-- Throughput -->
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
        <div class="text-sm font-semibold text-slate-500 uppercase">Throughput (Last 5m)</div>
        <div class="text-4xl font-bold text-slate-900 mt-2">
          {(metrics.summaries_per_min || 0).toFixed(1)}
          <span class="text-2xl text-green-600 ml-2">{getThroughputTrend()}</span>
        </div>
        <div class="text-xs text-slate-500 mt-2">{metrics.recent_5min} summaries / 5 min</div>
      </div>

      <!-- BitFrost Cache -->
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
        <div class="text-sm font-semibold text-slate-500 uppercase">BitFrost Cache</div>
        <div class="text-4xl font-bold text-slate-900 mt-2">{formatNumber(metrics.bitfrost_keys)}</div>
        <div class="text-xs text-slate-500 mt-2">{formatNumber(metrics.bitfrost_terms)} terms indexed</div>
        <div class="mt-4">
          <span class="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
            L1-L3 Active
          </span>
        </div>
      </div>

      <!-- ETA to Completion -->
      <div class="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
        <div class="text-sm font-semibold text-slate-500 uppercase">ETA (at current rate)</div>
        <div class="text-3xl font-bold text-slate-900 mt-2">
          {#if metrics.summaries_per_min > 0}
            {Math.ceil((40754 - metrics.total_summaries) / (metrics.summaries_per_min * 60))} hrs
          {:else}
            —
          {/if}
        </div>
        <div class="text-xs text-slate-500 mt-2">
          {Math.ceil((40754 - metrics.total_summaries) / (metrics.summaries_per_min || 1))} summaries remaining
        </div>
      </div>
    </div>

    <!-- Service Status -->
    <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
      <h2 class="text-lg font-bold text-slate-900 mb-4">Service Status</h2>
      <div class="grid grid-cols-4 gap-4">
        <div class="flex items-center gap-3">
          <div
            class={`w-3 h-3 rounded-full ${metrics.postgres_status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <div>
            <div class="text-sm font-medium text-slate-900">Postgres</div>
            <div class={`text-xs font-medium ${getStatusColor(metrics.postgres_status)}`}>{metrics.postgres_status}</div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div
            class={`w-3 h-3 rounded-full ${metrics.redis_status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <div>
            <div class="text-sm font-medium text-slate-900">Valkey</div>
            <div class={`text-xs font-medium ${getStatusColor(metrics.redis_status)}`}>{metrics.redis_status}</div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div
            class={`w-3 h-3 rounded-full ${metrics.gemma4_status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <div>
            <div class="text-sm font-medium text-slate-900">Gemma4</div>
            <div class={`text-xs font-medium ${getStatusColor(metrics.gemma4_status)}`}>{metrics.gemma4_status}</div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full bg-blue-500" />
          <div>
            <div class="text-sm font-medium text-slate-900">Concurrency</div>
            <div class="text-xs font-medium text-blue-600">{metrics.llm_concurrency} / 2 active</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="bg-white rounded-xl shadow-lg p-6">
      <h2 class="text-lg font-bold text-slate-900 mb-4">Last Update</h2>
      <div class="text-sm text-slate-600">{metrics.last_update}</div>
    </div>
  {:else}
    <div class="flex justify-center items-center h-96">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p class="text-slate-600">Loading metrics...</p>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
