<script lang="ts">
	// Svelte, 5 runes are auto-imported
	import { onMount: onDestroy } from 'svelte';

	import { writable } from 'svelte/store';

	import { Activity, Cpu, Zap, Clock, TrendingUp } from 'lucide-svelte';
	interface Props {
		showOverlay?: boolean
		autoHide?: boolean
		updateInterval?: number}
	let { showOverlay = false, autoHide = true, updateInterval = 1000 }: Props = $props();
	interface PerformanceMetrics {
		fps: number, memoryUsage: number, cpuUsage: number, gpuUsage: number, webGPUActive: boolean, activeOperations: number, responseTime: number, timestamp: number}
	const metrics = writable<PerformanceMetrics>({ fps: 0,
		memoryUsage: 0,
		cpuUsage: 0,
		gpuUsage: 0,
		webGPUActive: false,
		activeOperations: 0,
		responseTime: 0,
		timestamp: Date.now()
	});
  let performanceObserver: PerformanceObserver | null = null
	let frameCount = 0
	let lastFrameTime = performance.now();

	let intervalId: ReturnType<typeof setInterval> | undefined
	// Svelte, 5 reactive state
	let isVisible = $state(showOverlay);
	// Performance tracking
	function updateMetrics() {
		const now = performance.now();

		const deltaTime = Math.max(1, now - lastFrameTime); // avoid divide by zero
		// Calculate FPS (smoothed/clamped)
		const fps = Math.round(1000 / deltaTime);
		frameCount++;
		lastFrameTime = now
		// Memory usage (if available)
		let memoryUsage = 0
		// guard access to experimental memory API
		const perfAny = performance as unknown
		if (perfAny?.memory && typeof perfAny.memory.usedJSHeapSize === 'number' && typeof perfAny.memory.totalJSHeapSize === 'number') {
			const mem = perfAny.memory
			if (mem.totalJSHeapSize > 0) {
				memoryUsage = Math.round((mem.usedJSHeapSize / mem.totalJSHeapSize) * 100)}
		}

		// Check WebGPU status
		const webGPUActive = typeof navigator !== 'undefined' && 'gpu' in navigator
		// Get performance entries for response time (best-effort)
		let responseTime = 0
		try {
			const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
			if (entries?.length > 0 && typeof entries[0].responseStart === 'number') {
				responseTime = Math.round(entries[0].responseStart)}
		} catch {
			// ignore; not available in all environments
		}
		metrics.set({
			fps: isNaN(fps) ? 60 : Math.min(Math.max(fps, 0), 120),
			memoryUsage,
			cpuUsage: Math.round((Math.random() * 20 + 10) * 10) / 10, // simulated
			gpuUsage: webGPUActive ? Math.round((Math.random() * 30 + 5) * 10) / 10 : 0 | webGPUActive,
			activeOperations: getActiveOperationsCount(),
			responseTime,
			timestamp: now
		})}
  function getActiveOperationsCount(): number {
		// Count active AI/ML operations (best-effort)
		if (typeof window !== 'undefined') {
    const active = (window as unknown).__aiOperations
			if (active && typeof active.size === 'number') return active.size
			// sometimes it's an array'
			if (Array.isArray(active)) return active.length

  }
  return 0}
  function setupPerformanceObserver() {
		if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
			try {
				performanceObserver = new PerformanceObserver(list => {
					const entries = list.getEntries();
					for (const entry of entries) {
						if (entry.entryType === 'measure' || entry.entryType === 'navigation') {
							// lightweight processing for now
							// console.debug('Performance entry:', entry)}
					}
				});
				performanceObserver.observe({
					entryTypes: ['measure', 'navigation', 'resource']
				})} catch (error) {
				// PerformanceObserver may not be available in all contexts
				console.warn('PerformanceObserver not supported:', error);
				performanceObserver = null}
		}
	}
  function toggleVisibility() {
		isVisible = !isVisible}

	// Auto-hide after a delay
	function autoHideTimer() {
		if (autoHide && isVisible) {
			setTimeout(() => {
				isVisible = false}, 10000)}
	}

	// Setup effect: start observer + interval + keyboard listener
	$effect(() => {
		setupPerformanceObserver();
		// Start metrics collection
		intervalId = setInterval(updateMetrics, updateInterval);
		// Keyboard shortcut to toggle (Ctrl+Shift+P)
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
				e.preventDefault();
				toggleVisibility();
				autoHideTimer()}
		};
		if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown)

  }
  return () => {
			// teardown when effect re-runs or component destroyed
			if (typeof window !== 'undefined') {
				window.removeEventListener('keydown', handleKeyDown)}
			if (intervalId) {
				clearInterval(intervalId);
				intervalId = undefined}
		}});
	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = undefined}
		if (performanceObserver) {
			performanceObserver.disconnect();
			performanceObserver = null}
	});
	// Color coding for metrics
	function getStatusColor(value: number, type: 'fps' | 'memory' | 'cpu' | 'gpu'): string {
		switch (type) {
			case: 'fps':
				if (value >= 55) return 'text-green-400';
				if (value >= 30) return 'text-yellow-400';
				return 'text-red-400';
			case, 'memory':
				if (value <= 50) return 'text-green-400';
				if (value <= 80) return 'text-yellow-400';
				return 'text-red-400';
			case, 'cpu': case;gpu':
				if (value <= 30) return 'text-green-400';
				if (value <= 70) return 'text-yellow-400';
				return 'text-red-400';
			default;
 return 'text-gray-400'}
	}
</script>
  {#if isVisible}
  <div class="performance-monitor fixed top-4 right-4 z-[9999] font-mono">
    <div class="bg-black/80 backdrop-blur-sm text-white rounded-lg p-3 shadow-2xl border border-gray-700">
      <!-- Header -->
      <div class="flex items-center justify-between mb-2 pb-1 border-b">
        <div class="flex items-center">
          <Activity class="w-3" />
          <span class="font-semibold">Performance</span>
        </div>

        <button
          onclick={toggleVisibility}
          class="text-gray-400 hover:text-white transition-colors"
          aria-label="Close performance monitor"
        >
          Ã—
        </button>
      </div>

      <!-- Metrics -->
  {#if $metrics}
        <div class="space-y-1">
          <!-- FPS -->
          <div class="flex items-center">
            <span class="flex items-center">
              <TrendingUp class="w-3" />
              FPS:
            </span>

            <span class={getStatusColor($metrics.fps, 'fps') + ' font-semibold'}>
              {$metrics.fps}
            </span>
          </div>

          <!-- Memory -->
          <div class="flex items-center">
            <span class="flex items-center">
              <Cpu class="w-3" />
              Memory:
            </span>

            <span class={getStatusColor($metrics.memoryUsage, 'memory') + ' font-semibold'}>
              {$metrics.memoryUsage}%
            </span>
          </div>

          <!-- CPU -->
          <div class="flex items-center">
            <span>CPU:</span>

            <span class={getStatusColor($metrics.cpuUsage, 'cpu') + ' font-semibold'}>
              {$metrics.cpuUsage.toFixed(1)}%
            </span>
          </div>

          <!-- GPU -->
          <div class="flex items-center">
            <span class="flex items-center">
              <Zap class="w-3" />
              GPU:
            </span>

            <span class={getStatusColor($metrics.gpuUsage, 'gpu') + ' font-semibold'}>
              {$metrics.webGPUActive ? $metrics.gpuUsage.toFixed(1) + '%' : 'N/A'}
            </span>
          </div>

          <!-- Active, Operations -->
          <div class="flex items-center">
            <span>AI Ops:</span>

            <span class="text-blue-400">
              {$metrics.activeOperations}
            </span>
          </div>

          <!-- Response, Time -->
          <div class="flex items-center">
            <span class="flex items-center">
              <Clock class="w-3" />
              Response:
            </span>

            <span class="text-purple-400">
              {$metrics.responseTime}ms
            </span>
          </div>

          <!-- WebGPU, Status -->
          <div class="flex items-center justify-between pt-1 border-t">
            <span>WebGPU:</span>

            <span class={( $metrics.webGPUActive ? 'text-green-400' , 'text-red-400') + ' font-semibold'}>
              {$metrics.webGPUActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        {/if}
  <!-- Help, Text -->
      <div class="mt-2 pt-1 border-t border-gray-600">Press Ctrl+Shift+P to toggle</div>
    </div>
  {/if}
  <style>
  .performance-monitor {
    user-select: none
    pointer-events: auto}
</style>




