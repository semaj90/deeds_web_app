<script lang="ts">
/**
 * Cache Monitoring Widget
 *
 * Real-time LLM cache performance monitoring
 * Fetches from /api/admin/cache-stats every 10 seconds
 */

import { onMount } from 'svelte';
import Icon from '$lib/components/ui/Icon.svelte';

interface CacheStats {
  success: boolean;
  timestamp: string;
  l1_redis: {
    totalKeys: number;
    llmCacheKeys: number;
    memoryMB: string;
    usedMemoryMB: string;
    hitRate: string;
    keyspaceHits: number;
    keyspaceMisses: number;
  };
  samples: Array<{
    key: string;
    sizeBytes: number;
    ttlSeconds: number;
    expiresIn: string;
  }>;
  performance: {
    expectedHitRate: string;
    avgCacheLatency: string;
    avgColdLatency: string;
    speedup: string;
  };
  recommendations: string[];
}

let stats = $state<CacheStats | null>(null);
let loading = $state(true);
let error = $state<string | null>(null);
let lastUpdated = $state<Date | null>(null);
let intervalId: number | null = null;

async function fetchStats() {
  try {
    const response = await fetch('/api/admin/cache-stats');

    if (!response.ok) {
      if (response.status === 401) {
        error = 'Unauthorized - Admin access required';
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      stats = data;
      lastUpdated = new Date();
      error = null;
    } else {
      error = data.error || 'Failed to fetch cache stats';
    }
  } catch (err) {
    console.error('[CacheMonitoringWidget] Fetch error:', err);
    error = err instanceof Error ? err.message : 'Network error';
  } finally {
    loading = false;
  }
}

onMount(() => {
  // Initial fetch
  fetchStats();

  // Poll every 10 seconds
  intervalId = window.setInterval(fetchStats, 10_000);

  // Cleanup on unmount
  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  };
});

function getHitRateColor(hitRate: string): string {
  const rate = parseFloat(hitRate);
  if (rate >= 90) return 'text-green-400';
  if (rate >= 70) return 'text-yellow-400';
  if (rate >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getRecommendationIcon(rec: string): string {
  if (rec.includes('✅')) return 'check-circle';
  if (rec.includes('⚠️')) return 'alert-triangle';
  if (rec.includes('📊')) return 'bar-chart';
  if (rec.includes('💾')) return 'database';
  if (rec.includes('🔥')) return 'flame';
  return 'info';
}
</script>

<div class="cache-widget">
  <div class="widget-header">
    <h3>
      <Icon name="zap" class="inline w-4 h-4 mr-2" />
      Redis L1 Cache Monitor
    </h3>
    {#if lastUpdated}
      <span class="text-xs text-gray-500">
        Updated {lastUpdated.toLocaleTimeString()}
      </span>
    {/if}
  </div>

  {#if loading && !stats}
    <div class="loading-state">
      <Icon name="loader-2" class="animate-spin w-6 h-6" />
      <p>Loading cache stats...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <Icon name="alert-circle" class="w-6 h-6 text-red-400" />
      <p>{error}</p>
    </div>
  {:else if stats}
    <!-- Main Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Hit Rate</div>
        <div class="stat-value {getHitRateColor(stats.l1_redis.hitRate)}">
          {stats.l1_redis.hitRate}
        </div>
        <div class="stat-subtitle">{stats.performance.expectedHitRate}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Cache Keys</div>
        <div class="stat-value">{stats.l1_redis.llmCacheKeys}</div>
        <div class="stat-subtitle">{stats.l1_redis.totalKeys} total keys</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Memory Usage</div>
        <div class="stat-value">{stats.l1_redis.usedMemoryMB}MB</div>
        <div class="stat-subtitle">LLM: {stats.l1_redis.memoryMB}MB</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Speedup</div>
        <div class="stat-value text-green-400">{stats.performance.speedup}</div>
        <div class="stat-subtitle">{stats.performance.avgCacheLatency} avg</div>
      </div>
    </div>

    <!-- Performance Details -->
    <div class="performance-section">
      <h4>Performance</h4>
      <div class="performance-grid">
        <div class="perf-item">
          <span class="label">Hits</span>
          <span class="value text-green-400">{stats.l1_redis.keyspaceHits.toLocaleString()}</span>
        </div>
        <div class="perf-item">
          <span class="label">Misses</span>
          <span class="value text-yellow-400">{stats.l1_redis.keyspaceMisses.toLocaleString()}</span>
        </div>
        <div class="perf-item">
          <span class="label">Cache Latency</span>
          <span class="value">{stats.performance.avgCacheLatency}</span>
        </div>
        <div class="perf-item">
          <span class="label">Cold Latency</span>
          <span class="value">{stats.performance.avgColdLatency}</span>
        </div>
      </div>
    </div>

    <!-- Recommendations -->
    {#if stats.recommendations.length > 0}
      <div class="recommendations-section">
        <h4>Recommendations</h4>
        <ul class="recommendations-list">
          {#each stats.recommendations as rec}
            <li>
              <Icon name={getRecommendationIcon(rec)} class="inline w-4 h-4 mr-2" />
              {rec}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Sample Keys (collapsed by default) -->
    {#if stats.samples.length > 0}
      <details class="samples-section">
        <summary>Sample Cache Keys ({stats.samples.length})</summary>
        <div class="samples-list">
          {#each stats.samples as sample}
            <div class="sample-item">
              <code class="sample-key">{sample.key}</code>
              <span class="sample-meta">
                {(sample.sizeBytes / 1024).toFixed(1)}KB • {sample.expiresIn}
              </span>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  {/if}
</div>

<style>
  .cache-widget {
    background: var(--panel-bg, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    padding: 1.5rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .widget-header h3 {
    font-size: 0.875rem;
    color: var(--text-primary, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    gap: 0.75rem;
    color: var(--text-secondary, #64748b);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    background: var(--card-bg, #0f172a);
    border: 1px solid var(--border-color, #1e293b);
    border-radius: 6px;
    padding: 1rem;
    text-align: center;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #e2e8f0);
    margin-bottom: 0.25rem;
  }

  .stat-subtitle {
    font-size: 0.7rem;
    color: var(--text-tertiary, #475569);
  }

  .performance-section,
  .recommendations-section {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--card-bg, #0f172a);
    border: 1px solid var(--border-color, #1e293b);
    border-radius: 6px;
  }

  .performance-section h4,
  .recommendations-section h4 {
    font-size: 0.75rem;
    color: var(--text-secondary, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem 0;
  }

  .performance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
  }

  .perf-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }

  .perf-item .label {
    color: var(--text-secondary, #64748b);
  }

  .perf-item .value {
    color: var(--text-primary, #e2e8f0);
    font-weight: 600;
  }

  .recommendations-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .recommendations-list li {
    font-size: 0.75rem;
    color: var(--text-primary, #e2e8f0);
    padding: 0.5rem;
    background: var(--bg-tertiary, #1e293b);
    border-radius: 4px;
  }

  .samples-section {
    margin-top: 1rem;
  }

  .samples-section summary {
    font-size: 0.75rem;
    color: var(--text-secondary, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .samples-section summary:hover {
    background: var(--card-bg, #0f172a);
  }

  .samples-list {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sample-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: var(--card-bg, #0f172a);
    border: 1px solid var(--border-color, #1e293b);
    border-radius: 4px;
    font-size: 0.7rem;
  }

  .sample-key {
    color: var(--text-accent, #60a5fa);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sample-meta {
    color: var(--text-tertiary, #475569);
    margin-left: 0.5rem;
    white-space: nowrap;
  }
</style>
