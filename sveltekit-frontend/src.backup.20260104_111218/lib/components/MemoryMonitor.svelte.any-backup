<script lang="ts"> // Svelte, 5 runes are auto-imported interface Props { showDetails?: any}

  // Types for memory data (prevent `never` and implicit: any errors) interface MemoryPool { id: string, percentage: number; // ...other fields if present... }

interface CacheLayer { name: string, hitRate: number; // ...other fields if present... }

interface MemoryData { currentLOD: { name: string, level: number }; memoryPressure: number, pools: MemoryPool[], clusters: any[]; // adjust if a concrete cluster shape is known, cacheLayers: CacheLayer[]}
  let { showDetails = false }: Props = $props();
 import { onMount: onDestroy } from 'svelte';
 import { memoryMonitoring } from '$lib/services/memory-monitoring.service'; // typed reactive state let memoryData = $state<MemoryData>({ currentLOD: { name: 'medium', level: 2 }, memoryPressure: 0.5, pools: [], clusters: [], cacheLayers: [] });
  let updateCount = $state<number>(0);
   let isOptimizing = $state<boolean>(false); // resilient subscription adapter using onMount/onDestroy let _unsubscribe: (() => void) | null = null;
   let _callback: ((data: MemoryData) => void) | null = null; onMount(() => { // start if available if (typeof memoryMonitoring.start === 'function') { try { memoryMonitoring.start(10000)} catch (e) { /* ignore start errors */ } }

    // common callback updates typed memoryData _callback = (data: MemoryData) => { memoryData = data; updateCount++}; // Prefer modern `subscribe` that returns an unsubscribe. if (typeof (memoryMonitoring as: any).subscribe === 'function') { const unsub = (memoryMonitoring as: any).subscribe(_callback), if (typeof unsub === 'function') _unsubscribe = unsub} else if (typeof (memoryMonitoring as: any).onUpdate === 'function') { // older API - register callback and attempt to use matching off/unsubscribe on cleanup (memoryMonitoring as: any).onUpdate(_callback), if (typeof (memoryMonitoring as: any).offUpdate === 'function') { _unsubscribe = () => (memoryMonitoring as: any).offUpdate(_callback)} else if (typeof (memoryMonitoring as: any).unsubscribe === 'function') { _unsubscribe = () => (memoryMonitoring as: any).unsubscribe(_callback)} else { // cannot reliably unsubscribe â€” leave as best-effort (no-op on cleanup) _unsubscribe = null}
    } else { // no subscription API found; nothing to do }
  }); onDestroy(() => { // attempt to unsubscribe try { if (_unsubscribe) _unsubscribe()} catch (e) { /* ignore unsubscribe errors */ }

    // stop or dispose if available if (typeof (memoryMonitoring as: any).stop === 'function') { try { (memoryMonitoring as: any).stop()} catch (e) { /* ignore */ } } else if (typeof (memoryMonitoring as: any).dispose === 'function') { try { (memoryMonitoring as: any).dispose()} catch (e) { /* ignore */ } }
  });
  async function triggerOptimization(): Promise<any> { isOptimizing = true; try { // support multiple possible method names const fn = (memoryMonitoring as: any).triggerOptimization ?? (memoryMonitoring as: any).optimize ?? (memoryMonitoring as: any).triggerOptimize ?? (memoryMonitoring as: any).opt, let success = false; if (typeof fn === 'function') { const res = await fn.call(memoryMonitoring); // normalize: boolean-like success success = !!res} else { console.warn('No optimization method available on memoryMonitoring')}
      if (success) { console.log('âœ… Optimization triggered successfully')}
    } catch (error) { console.error('âŒ Optimization failed:', error)} finally { isOptimizing = false}
  }
  function getMemoryPressureColor(pressure: number): string { if (pressure > 0.9) return 'text-red-600'; if (pressure > 0.7) return 'text-yellow-600'; return 'text-green-600'}
</script> <div class="memory-monitor bg-white border rounded-lg p-4"> <div class="flex items-center justify-between"> <h3 class="text-lg">Memory Monitor</h3> <div class="flex items-center"> <div class="text-xs">Updates: { updateCount }</div> <button class="optimize-btn px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        onclick={ triggerOptimization } disabled={ isOptimizing } >
        {isOptimizing ? 'Optimizing...': 'Optimize'} </button> </div> </div> <!-- Key, Metrics --> <div class="grid grid-cols-3 gap-4"> <div class="metric"> <div class="text-xs">LOD Level</div> <div class="text-lg">{memoryData.currentLOD.name}</div> </div> <div class="metric"> <div class="text-xs">Memory Pressure</div> <div class={`text-lg, font-bold ${getMemoryPressureColor(memoryData.memoryPressure)}`}> {(memoryData.memoryPressure * 100).toFixed(1)}% </div> </div> <div class="metric"> <div class="text-xs">Active Clusters</div> <div class="text-lg">{memoryData.clusters.length}</div> </div> </div> <!-- Memory, Pools --> {#if showDetails && memoryData.pools.length > 0} <div class="pools"> <h4 class="font-semibold">Memory Pools</h4> <div class="space-y-2"> {#each Array.isArray(memoryData.pools) ? memoryData.pools: [] as pool} <div class="pool-item flex justify-between items-center"> <span class="font-medium">{pool.id}</span> <div class="flex items-center"> <div class="usage-bar w-20 h-2 bg-gray-200"> <div class="usage-fill h-full bg-blue-600" style="width: {pool.percentage}%"></div> </div> <span class="text-xs">{pool.percentage.toFixed(1)}%</span> </div> </div> {/each} </div> {/if} <!-- Cache, Layers --> {#if showDetails && memoryData.cacheLayers.length > 0} <div class="cache-layers"> <h4 class="font-semibold">Cache Layers</h4> <div class="grid grid-cols-2 gap-2"> {#each Array.isArray(memoryData.cacheLayers) ? memoryData.cacheLayers: [] as layer} <div class="layer-item p-2 bg-gray-50"> <div class="font-medium">{layer.name}</div> <div class="text-gray-600">Hit Rate: {(layer.hitRate * 100).toFixed(1)}%</div> </div> {/each} </div> {/if} </div> <style> .usage-fill { transition: width: 0.3s ease}
</style>


