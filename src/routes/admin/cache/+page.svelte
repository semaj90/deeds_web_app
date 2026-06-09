<script lang="ts">
    import { onMount } from 'svelte';
    import type { GPUBufferPoolMetrics } from '$lib/types/gpu-metrics';

    export let data: { gpuPool?: { acquired: number; hits: number; hitRate: number; pooledBuffers: string[]; pooledBytes: number } };

    /** @type {GPUBufferPoolMetrics | undefined} */
    let gpuStats: GPUBufferPoolMetrics | undefined = undefined;

    // Use a reactive block or onMount to fetch data from the new API endpoint.
    async function loadStats() {
        try {
            const response = await fetch('/api/cache/stats');
            if (!response.ok) {
                throw new Error(`Failed to fetch cache stats: ${response.statusText}`);
            }
            const data = await response.json();

            // Assuming the API returns a structure where gpuPool is available
            gpuStats = data.gpuPool;

        } catch (e) {
            console.error("Error loading GPU cache stats:", e);
            gpuStats = undefined; // Keep it undefined on failure
        }
    }

    onMount(loadStats);
</script>

<div class="space-y-6">
    <h2 class="text-xl font-semibold border-b pb-2">GPU Compute Cache Metrics (Phase 100B)</h2>
    
    {#if gpuStats}
        <div class="grid grid-cols-3 gap-4 p-4 border rounded bg-gray-50">
            <!-- Metric Card: Acquired -->
            <div>
                <p class="text-sm text-gray-500">Total Acquisitions</p>
                <p class="text-2xl font-bold">{gpuStats.acquired}</p>
            </div>

            <!-- Metric Card: Hits -->
            <div>
                <p class="text-sm text-gray-500">Cache Hits</p>
                <p class="text-2xl font-bold">{gpuStats.hits}</p>
            </div>

            <!-- Metric Card: Hit Rate -->
            <div>
                <p class="text-sm text-gray-500">Hit Rate</p>
                <p class="text-2xl font-bold">{Math.round(gpuStats.hitRate * 100)}%</p>
            </div>
        </div>

        <!-- Detailed Metrics Section -->
        <div class="space-y-3">
            <h3 class="font-semibold pt-4">Buffer Pool Details</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p class="text-gray-600">Total Pooled Bytes:</p>
                    <code class="font-mono">{gpuStats.pooledBytes} bytes</code>
                </div>
                <div>
                    <p class="text-gray-600">Pooled Buffers Count:</p>
                    <code class="font-mono">{gpuStats.pooledBuffers.length} items</code>
                </div>
            </div>

            <div class="pt-4 border-t">
                <h3 class="font-semibold mb-2">Buffer IDs (Sample)</h3>
                <pre class="bg-gray-100 p-3 rounded text-sm overflow-x-auto max-h-48">{gpuStats.pooledBuffers.join(', ')}</pre>
            </div>
        </div>

    {:else if typeof gpuStats === 'undefined' && !data?.gpuPool}
        <p class="text-yellow-600">Loading cache statistics... Please wait a moment or check the API endpoint manually.</p>
    {:else}
        <p class="text-red-500">Failed to load GPU metrics. Check the network console for errors, or ensure the API route is active.</p>
    {/if}
</div>