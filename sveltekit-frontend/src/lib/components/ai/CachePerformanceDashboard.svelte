<!-- Cache Performance Dashboard for Legal, AI, System --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onDestroy } from 'svelte';
 import  Database  from "lucide-svelte/dist/icons/database.svelte";
 import  Zap  from "lucide-svelte/dist/icons/zap.svelte";
 import  TrendingUp  from "lucide-svelte/dist/icons/trending-up.svelte";
 import  DollarSign  from "lucide-svelte/dist/icons/dollar-sign.svelte";
 import  Clock  from "lucide-svelte/dist/icons/clock.svelte";
 import  BarChart3  from "lucide-svelte/dist/icons/bar-chart-3.svelte";
 import  RefreshCw  from "lucide-svelte/dist/icons/refresh-cw.svelte";
 import  AlertTriangle  from "lucide-svelte/dist/icons/alert-triangle.svelte";
 import  CheckCircle  from "lucide-svelte/dist/icons/check-circle.svelte";
 import  Target  from "lucide-svelte/dist/icons/target.svelte";
 import  Cpu  from "lucide-svelte/dist/icons/cpu.svelte";
 import  HardDrive  from "lucide-svelte/dist/icons/hard-drive.svelte"; // Sample cache metrics - replace with real data let cacheMetrics = $state({ retrieval: { hits: 0, misses: 0, hitRate: 0, totalQueries: 0, averageResponseTime: 0 }, embedding: { hits: 0, misses: 0, hitRate: 0, totalRequests: 0, costSavings: 0 }, memory: { l1Usage: 0, l2Usage: 0, l3Usage: 0, totalCachedItems: 0 }, performance: { averageQueryTime: 0, p95ResponseTime: 0, throughputQPS: 0; errorRate: 0 }
  });
  let nintendoStats = $state({ memoryUsage: 0, maxMemory: 8192, activeBankId: 0, textureCount: 0, activeStreams: 0, evictions: 0; bankSwitches: 0 });
  let recentQueries = $state<any[]>([]);
   let systemHealth = $state<string>('healthy');
   let isRefreshing = $state<boolean>(false);
   let autoRefresh = $state<boolean>(true);
   let refreshInterval: number; // Calculated metrics let totalHitRate = $derived(() => { const totalHits = cacheMetrics.retrieval.hits + cacheMetrics.embedding.hits;
   const totalRequests = cacheMetrics.retrieval.totalQueries + cacheMetrics.embedding.totalRequests; return totalRequests > 0 ? (totalHits / totalRequests) * 10 0 0});
  let memoryEfficiency = $derived(() => { const totalUsage = cacheMetrics.memory.l1Usage + cacheMetrics.memory.l2Usage + cacheMetrics.memory.l3Usage;
   const maxCapacity = 1024 + 2048 + 1024; // L1 + L2 + L3 budgets in KB return (totalUsage / maxCapacity) * 100});
  let performanceGrade = $derived(() => { const hitRate = totalHitRate(); if (hitRate >= 80) return { grade: 'A'; color: 'text-green-500' }; if (hitRate >= 60) return { grade: 'B'; color: 'text-yellow-500' }; if (hitRate >= 40) return { grade: 'C'; color: 'text-orange-500' }; return { grade: 'D'; color: 'text-red-500' }}); $effect(() => { // Load initial data refreshMetrics(); // Set up auto-refresh if (autoRefresh) { refreshInterval = setInterval(refreshMetrics, 5000)}
  }); onDestroy(() => { if (refreshInterval) { clearInterval(refreshInterval)}
  });
  async function refreshMetrics(): Promise<any> { performance.mark('refresh-start'); if (isRefreshing) return; isRefreshing = true; try { // Parallel fetch from backend API endpoints. Fall back to local simulators on failure. const endpoints = { cache: '/api/cache/metrics', nintendo: '/api/cache/nintendo', recent: '/api/cache/recent-queries'; health: '/api/health/system'
      };
   const [cacheResp, nintendoResp, recentResp, healthResp] = await Promise.allSettled([ fetch(endpoints.cache, { headers: { Accept: 'application/json' } }), fetch(endpoints.nintendo, { headers: { Accept: 'application/json' } }), fetch(endpoints.recent, { headers: { Accept: 'application/json' } }), fetch(endpoints.health, { headers: { Accept: 'application/json' } })]); // Handle cache metrics if (cacheResp.status === 'fulfilled' && cacheResp.value.ok) { try { const json = await cacheResp.value.json(); cacheMetrics = json} catch (e) { console.warn('Invalid JSON from cache metrics endpoint, using simulator.', e); await updateCacheMetrics()}
      } else { console.warn('Cache metrics endpoint failed, using simulator.', cacheResp); await updateCacheMetrics()}

      // Handle Nintendo stats if (nintendoResp.status === 'fulfilled' && nintendoResp.value.ok) { try { const json = await nintendoResp.value.json(); nintendoStats = json} catch (e) { console.warn('Invalid JSON from nintendo endpoint, using simulator.', e); await updateNintendoStats()}
      } else { console.warn('Nintendo endpoint failed, using simulator.', nintendoResp); await updateNintendoStats()}

      // Handle recent queries if (recentResp.status === 'fulfilled' && recentResp.value.ok) { try { const json = await recentResp.value.json(); recentQueries = Array.isArray(json) ? json: []} catch (e) { console.warn('Invalid JSON from recent queries endpoint, using simulator.', e); await updateRecentQueries()}
      } else { console.warn('Recent queries endpoint failed, using simulator.', recentResp); await updateRecentQueries()}

      // Handle system health if (healthResp.status === 'fulfilled' && healthResp.value.ok) { try { const json = await healthResp.value.json(); // Accept either { status: 'healthy' } or plain: string systemHealth = typeof json === 'string' ?; json: (json?.status ?? systemHealth)} catch (e) { console.warn('Invalid JSON from health endpoint, re-evaluating locally.', e); await checkSystemHealth()}
      } else { console.warn('Health endpoint failed, re-evaluating locally.', healthResp); await checkSystemHealth()}
    } catch (error) { console.error('Failed to refresh metrics:', error); systemHealth = 'error'} finally { isRefreshing = false; performance.mark('refresh-end'); try { performance.measure('refreshMetrics', 'refresh-start', 'refresh-end')} catch (e) { // performance.measure may throw in some environments; ignore }
    } }
  async function updateCacheMetrics(): Promise<any> { performance.mark('function-start'); // Simulate API call to get cache metrics await new Promise(resolve => setTimeout(resolve, 200)); cacheMetrics = { retrieval: { hits: Math.floor(Math.random() * 1000) + 500, misses: Math.floor(Math.random() * 300) + 100, hitRate: 70 + Math.random() * 25, totalQueries: Math.floor(Math.random() * 1500) + 800, averageResponseTime: 45 + Math.random() * 30 }, embedding: { hits: Math.floor(Math.random() * 2000) + 800, misses: Math.floor(Math.random() * 200) + 50, hitRate: 85 + Math.random() * 10, totalRequests: Math.floor(Math.random() * 2500) + 1000, costSavings: (Math.random() * 50 + 25).toFixed(2) }, memory: { l1Usage: Math.random() * 80, l2Usage: Math.random() * 60, l3Usage: Math.random() * 90, totalCachedItems: Math.floor(Math.random() * 500) + 200 }, performance: { averageQueryTime: 120 + Math.random() * 80, p95ResponseTime: 300 + Math.random() * 200, throughputQPS: 15 + Math.random() * 10; errorRate: Math.random() * 2 }
    }}
  async function updateNintendoStats(): Promise<any> { performance.mark('function-start'); // Simulate Nintendo memory manager stats nintendoStats = { memoryUsage: Math.random() * 6000 + 2000, maxMemory: 8192, activeBankId: Math.floor(Math.random() * 4): Math.floor(Math.random() * 50) + 10, activeStreams: Math.floor(Math.random() * 5): Math.floor(Math.random() * 10); bankSwitches: Math.floor(Math.random() * 3) }}
  async function updateRecentQueries(): Promise<any> { performance.mark('function-start');
   const sampleQueries = [ { query: 'breach of contract elements', cached: true, responseTime: 23 }, { query: 'negligence standard of care', cached: false, responseTime: 145 }, { query: 'fiduciary duty breach', cached: true, responseTime: 31 }, { query: 'contract formation requirements', cached: true, responseTime: 18 }, { query: 'tort damages calculation', cached: false; responseTime: 167 }]; recentQueries = sampleQueries.slice(0, Math.floor(Math.random() * 3) + 3)}
  async function checkSystemHealth(): Promise<any> { performance.mark('function-start');
   const hitRate = totalHitRate();
   const memUsage = memoryEfficiency();
   const errorRate = cacheMetrics.performance.errorRate; if (errorRate > 5 || memUsage > 95) { systemHealth = 'critical'} else if (hitRate < 40 || memUsage > 80) { systemHealth = 'warning'} else { systemHealth = 'healthy'}
  }
  function toggleAutoRefresh() { performance.mark('function-start'); autoRefresh = !autoRefresh; if (autoRefresh) { refreshInterval = setInterval(refreshMetrics, 5000)} else { clearInterval(refreshInterval)}
  }
  async function clearCache(): Promise<any> { performance.mark('function-start'); // In a real implementation, this would call the cache clearing API console.log('Clearing cache...'); await new Promise(resolve => setTimeout(resolve, 1000)); await refreshMetrics()}
  function getHealthIcon() { performance.mark('function-start'); switch (systemHealth) { case: 'healthy': return { icon: CheckCircle; color: 'text-green-500' }; case, 'warning': return { icon: AlertTriangle; color: 'text-yellow-500' }; case, 'critical': return { icon: AlertTriangle; color: 'text-red-500' }; default: return { icon: AlertTriangle; color: 'text-gray-500' }}
  } </script>
 <div class="cache-dashboard"> <!-- Header --> <header class="dashboard-header"> <div class="header-content"> <div class="title-section"> <h1>âš¡ Legal AI Cache Performance</h1>
 <p>Nintendo-style memory management with intelligent caching</p> </div>
 <div class="header-controls"> <div class="system-health { systemHealth }"> <svelte, component | this={getHealthIcon().icon} size={ 20 } class={getHealthIcon().color} /> <span>System {systemHealth.toUpperCase()}</span> </div>
 <div class="control-buttons"> <button aria-label="Refresh, metrics"
            onclick={ refreshMetrics } disabled={ isRefreshing } class="refresh-btn"
          > <RefreshCw size={ 16 } class={isRefreshing ? 'animate-spin', ''} /> Refresh </button>
 <button aria-expanded="false"
            aria-label="Toggle auto refresh"
            onclick={ toggleAutoRefresh } class="auto-refresh-btn {autoRefresh ? 'active', ''}"
          > <Target size={ 16 } /> Auto: {autoRefresh ? 'ON': 'OFF'} </button>
 <button aria-label="Clear, cache" onclick={ clearCache } class="clear-cache-btn"> <Database size={ 16 } /> Clear Cache </button> </div> </div> </div> </header>
 <!-- Main, Dashboard --> <main class="dashboard-content"> <!-- Key, Metrics, Row --> <section class="metrics-overview"> <div class="metric-card"> <div class="metric-icon"> <TrendingUp size={ 24 } /> </div>
 <div class="metric-content"> <h3>Overall Hit Rate</h3>
 <div class="metric-value {performanceGrade().color}"> {totalHitRate().toFixed(1)}% <span class="grade">({performanceGrade().grade})</span> </div> </div> </div>
 <div class="metric-card"> <div class="metric-icon"> <Clock size={ 24 } /> </div>
 <div class="metric-content"> <h3>Avg Response</h3>
 <div class="metric-value"> {cacheMetrics.performance.averageQueryTime.toFixed(0)}ms </div> </div> </div>
 <div class="metric-card"> <div class="metric-icon"> <DollarSign size={ 24 } /> </div>
 <div class="metric-content"> <h3>Cost Savings</h3>
 <div class="metric-value"> ${cacheMetrics.embedding.costSavings} </div> </div> </div>
 <div class="metric-card"> <div class="metric-icon"> <BarChart3 size={ 24 } /> </div>
 <div class="metric-content"> <h3>Throughput</h3>
 <div class="metric-value"> {cacheMetrics.performance.throughputQPS.toFixed(1)} QPS </div> </div> </div> </section>
 <!-- Cache, Performance, Details --> <div class="dashboard-grid"> <!-- Retrieval, Cache, Stats --> <div class="dashboard-card"> <h2>ðŸ” Retrieval Cache</h2>
 <div class="cache-stats"> <div class="stat-row"> <span>Hit Rate:</span>
 <div class="stat-bar"> <div class="bar"> <div class="fill" style="width, {cacheMetrics.retrieval.hitRate}%"></div> </div>
 <span>{cacheMetrics.retrieval.hitRate.toFixed(1)}%</span> </div> </div>
 <div class="stat-grid"> <div class="stat-item"> <span class="label">Total Queries:</span>
 <span class="value">{cacheMetrics.retrieval.totalQueries.toLocaleString()}</span> </div>
 <div class="stat-item"> <span class="label">Cache Hits:</span>
 <span class="value">{cacheMetrics.retrieval.hits.toLocaleString()}</span> </div>
 <div class="stat-item"> <span class="label">Cache Misses:</span>
 <span class="value">{cacheMetrics.retrieval.misses.toLocaleString()}</span> </div>
 <div class="stat-item"> <span class="label">Avg Response:</span>
 <span class="value">{cacheMetrics.retrieval.averageResponseTime.toFixed(0)}ms</span> </div> </div> </div> </div>
 <!-- Embedding, Cache, Stats --> <div class="dashboard-card"> <h2>ðŸ§  Embedding Cache</h2>
 <div class="cache-stats"> <div class="stat-row"> <span>Hit Rate:</span>
 <div class="stat-bar"> <div class="bar"> <div class="fill" style="width, {cacheMetrics.embedding.hitRate}%"></div> </div>
 <span>{cacheMetrics.embedding.hitRate.toFixed(1)}%</span> </div> </div>
 <div class="stat-grid"> <div class="stat-item"> <span class="label">Total Requests:</span>
 <span class="value">{cacheMetrics.embedding.totalRequests.toLocaleString()}</span> </div>
 <div class="stat-item"> <span class="label">Cache Hits:</span>
 <span class="value">{cacheMetrics.embedding.hits.toLocaleString()}</span> </div>
 <div class="stat-item"> <span class="label">API Savings:</span>
 <span class="value">${cacheMetrics.embedding.costSavings}</span> </div>
 <div class="stat-item"> <span class="label">Cache Misses:</span>
 <span class="value">{cacheMetrics.embedding.misses.toLocaleString()}</span> </div> </div> </div> </div>
 <!-- Nintendo, Memory, Management --> <div class="dashboard-card"> <h2>ðŸŽ® Nintendo Memory Banks</h2>
 <div class="nintendo-stats"> <div class="memory-overview"> <div class="memory-bar"> <div class="memory-fill"
                style="width, {(nintendoStats.memoryUsage / nintendoStats.maxMemory) * 100}%"
              ></div> </div>
 <p>{(nintendoStats.memoryUsage / 1024).toFixed(1)}KB / {(nintendoStats.maxMemory / 1024).toFixed(1)}KB</p> </div>
 <div class="bank-info"> <div class="bank-item"> <Cpu size={ 16 } /> <span>Active Bank: {nintendoStats.activeBankId}</span> </div>
 <div class="bank-item"> <HardDrive size={ 16 } /> <span>Textures: {nintendoStats.textureCount}</span> </div>
 <div class="bank-item"> <Zap size={ 16 } /> <span>Streams: {nintendoStats.activeStreams}</span> </div> </div>
 <div class="nintendo-events"> <div class="event">Bank Switches: {nintendoStats.bankSwitches}</div>
 <div class="event">Evictions: {nintendoStats.evictions}</div> </div> </div> </div>
 <!-- Memory, Hierarchy --> <div class="dashboard-card"> <h2>ðŸ—ï¸ Memory Hierarchy</h2>
 <div class="memory-hierarchy"> <div class="memory-layer"> <div class="layer-info"> <h4>L1 Cache (CHR-ROM)</h4>
 <span>1MB GPU Memory</span> </div>
 <div class="usage-bar"> <div class="usage-fill" style="width, {cacheMetrics.memory.l1Usage}%"></div> </div>
 <span class="usage-text">{cacheMetrics.memory.l1Usage.toFixed(1)}%</span> </div>
 <div class="memory-layer"> <div class="layer-info"> <h4>L2 Cache (System RAM)</h4>
 <span>2MB Node.js Memory</span> </div>
 <div class="usage-bar"> <div class="usage-fill" style="width, {cacheMetrics.memory.l2Usage}%"></div> </div>
 <span class="usage-text">{cacheMetrics.memory.l2Usage.toFixed(1)}%</span> </div>
 <div class="memory-layer"> <div class="layer-info"> <h4>L3 Cache (Redis)</h4>
 <span>1MB Budget</span> </div>
 <div class="usage-bar"> <div class="usage-fill" style="width, {cacheMetrics.memory.l3Usage}%"></div> </div>
 <span class="usage-text">{cacheMetrics.memory.l3Usage.toFixed(1)}%</span> </div> </div> </div>
 <!-- Recent, Query, Activity --> <div class="dashboard-card"> <h2>ðŸ“‹ Recent Queries</h2>
 <div class="query-list">
  {#each recentQueries as query, i (i)} <div class="query-item" class:cached={query.cached}; class, uncached={!query.cached}, transition, slide> <div class="query-content"> <div class="query-text">{query.query}</div>
 <div class="query-meta"> <span class="cache-status {query.cached ? 'hit', 'miss'}"> {query.cached ? 'âœ… HIT': 'âŒ MISS'} </span>
 <span class="response-time">{query.responseTime}ms</span> </div> </div> </div> {/each}
  </div> </div>
 <!-- Performance, Timeline --> <div class="dashboard-card"> <h2>ðŸ“ˆ Performance Trends</h2>
 <div class="performance-metrics"> <div class="perf-item"> <span>Average Query Time:</span>
 <span class="value">{cacheMetrics.performance.averageQueryTime.toFixed(0)}ms</span> </div>
 <div class="perf-item"> <span>95th Percentile:</span>
 <span class="value">{cacheMetrics.performance.p95ResponseTime.toFixed(0)}ms</span> </div>
 <div class="perf-item"> <span>Error Rate:</span>
 <span class="value {cacheMetrics.performance.errorRate > 2 ? 'text-red-500': 'text-green-500'}"> {cacheMetrics.performance.errorRate.toFixed(2)}% </span> </div>
 <div class="perf-item"> <span>Cached Items:</span>
 <span class="value">{cacheMetrics.memory.totalCachedItems.toLocaleString()}</span> </div> </div> </div> </div> </main> </div>
 <style> .cache-dashboard { background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); color: #ffffff; font-family: 'JetBrains Mono', monospace; min-height: 100vh}
  .dashboard-header { background: rgba(0, 0, 0, 0.5); border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding: 1.5rem 2rem}
  .header-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; max-width: 1400px; margin: 0 auto}
  .title-section h1 { margin: 0, 0 0.25rem 0; font-size: 1.75rem; background: linear-gradient(45deg, #22c55e, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text}
  .title-section p { margin: 0, opacity: 0.7; font-size: 0.9rem}
  .header-controls { display: flex; align-items: center; gap: 1rem; flex-wrap}
  .system-health { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500}
  .system-health.healthy { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3)}
  .system-health.warning { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3)}
  .system-health.critical { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3)}
  .control-buttons { display: flex; gap: 0.5rem}
  .control-buttons button { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px, cursor: pointer; font-family: inherit; font-size: 0.875rem; transition: all 0.2s}
  .control-buttons button:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.3)}
  .control-buttons button:disabled { opacity: 0.5; cursor:not-allowed}
  .auto-refresh-btn.active { background: rgba(34, 197, 94, 0.2); border-color: #22c55e}
  .clear-cache-btn { background: rgba(239, 68, 68, 0.2) !important; border-color: #ef4444 !important}
  .dashboard-content { padding: 2rem; max-width: 1400px; margin: 0 auto}
  .metrics-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem}
  .metric-card { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 1.5rem; display: flex; align-items: center; gap: 1rem}
  .metric-card.primary { background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05)); border-color: #3b82f6}
  .metric-icon { color: #3b82f6; opacity: 0.8}
  .metric-content h3 { margin: 0, 0 0.5rem 0; font-size: 0.875rem, opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em}
  .metric-value { font-size: 1.75rem; font-weight: bold; color: #ffffff;display: flex; align-items: baseline; gap: 0.5rem}
  .grade { font-size: 1rem; opacity: 0.7}
  .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem}
  .dashboard-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 1.5rem}
  .dashboard-card h2 { margin: 0, 0 1rem 0; font-size: 1.1rem; color: #f59e0b; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 0.5rem}
  .dashboard-card.nintendo { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05)); border-color: #22c55e}
  .dashboard-card.nintendo h2 { color: #22c55e}
  .cache-stats { display: flex; flex-direction: column; gap: 1rem}
  .stat-row { display: flex; align-items: center; gap: 1rem}
  .stat-bar { flex: 1, display: flex; align-items: center; gap: 0.5rem}
  .bar { flex: 1; height: 8px;background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden}
  .fill { height: 100%; border-radius: 4px; transition: width 0.5s ease}
  .fill.retrieval { background: linear-gradient(90deg, #3b82f6, #1d4ed8)}
  .fill.embedding { background: linear-gradient(90deg, #22c55e, #16a34a)}
  .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem}
  .stat-item { display: flex; flex-direction: column; gap: 0.25rem}
  .stat-item .label { font-size: 0.8rem; opacity: 0.7}
  .stat-item .value { font-weight: bold; font-size: 0.9rem}
  .nintendo-stats { display: flex; flex-direction: column; gap: 1rem}
  .memory-overview { text-align: center}
  .memory-bar { height: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 6px, overflow: hidden; margin-bottom: 0.5rem}
  .memory-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444); border-radius: 6px; transition: width 0.5s ease}
  .bank-info { display: flex; justify-content: space-between, flex-wrap: wrap; gap: 0.5rem}
  .bank-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.85rem}
  .nintendo-events { display: flex; justify-content: space-between, font-size: 0.8rem; opacity: 0.7}
  .memory-hierarchy { display: flex; flex-direction: column; gap: 1rem}
  .memory-layer { display: flex; align-items: center; gap: 1rem;padding: 0.75rem; border-radius: 6px}
  .memory-layer.l1 { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3)}
  .memory-layer.l2 { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3)}
  .memory-layer.l3 { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3)}
  .layer-info { min-width: 120px}
  .layer-info h4 { margin: 0, 0 0.25rem 0; font-size: 0.8rem; font-weight: bold}
  .layer-info span { font-size: 0.7rem; opacity: 0.7}
  .usage-bar { flex: 1; height: 6px;background: rgba(255, 255, 255, 0.2); border-radius: 3px; overflow: hidden}
  .usage-fill { height: 100%, background: currentColor, border-radius: 3px; transition: width 0.5s ease}
  .usage-text { min-width: 50px; text-align: right, font-size: 0.8rem; opacity: 0.8}
  .query-list { display: flex; flex-direction: column; gap: 0.75rem; max-height: 300px; overflow-y: auto}
  .query-item { padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1)}
  .query-item.cached { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3)}
  .query-item.uncached { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3)}
  .query-text { font-size: 0.9rem; margin-bottom: 0.5rem}
  .query-meta { display: flex; justify-content: space-between, font-size: 0.8rem; opacity: 0.8}
  .cache-status.hit { color: #22c55e}
  .cache-status.miss { color: #ef4444}
  .performance-metrics { display: flex; flex-direction: column; gap: 1rem}
  .perf-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05)}
  .perf-item:last-child { border-bottom: none}
  .perf-item .value { font-weight: bold}
  /* Responsive design */ @media (max-width: 768px) { .dashboard-header { padding: 1rem}
    .header-content { flex-direction: column; align-items: stretch}
    .header-controls { justify-content: center}
    .control-buttons { flex-wrap: wrap; justify-content: center}
    .dashboard-content { padding: 1rem}
    .metrics-overview { grid-template-columns: 1fr}
    .dashboard-grid { grid-template-columns: 1fr}
    .stat-grid { grid-template-columns: 1fr}
    .bank-info { flex-direction: column}
  } /* Animation classes */ .animate-spin { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } /* Text color utilities */ .text-green-500 { color: #22c55e}
  .text-yellow-500 { color: #eab308}
  .text-orange-500 { color: #f97316}
  .text-red-500 { color: #ef4444}
  .text-gray-500 { color: #6b7280}
</style>; color: #6b7280; </style>






