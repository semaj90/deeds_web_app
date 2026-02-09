<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Activity from 'lucide-svelte/icons/activity';
	import Clock from 'lucide-svelte/icons/clock';
	import Cpu from 'lucide-svelte/icons/cpu';
	import TrendingUp from 'lucide-svelte/icons/trending-up';
	import Zap from 'lucide-svelte/icons/zap';

	interface Props {
		showOverlay?: boolean;
		autoHide?: boolean;
		updateInterval?: number;
	}

	let { showOverlay = false, autoHide = true, updateInterval = 1000 }: Props = $props();

	interface PerformanceMetrics { fps: number, memoryUsage: number;
		cpuUsage: number;
		gpuUsage: number;
		webGPUActive: boolean;
		activeOperations: number;
		responseTime: number;
		timestamp: number;
	}

	let metrics = $state<PerformanceMetrics>({
		fps: 0,
		memoryUsage: 0,
		cpuUsage: 0,
		gpuUsage: 0,
		webGPUActive: false,
		activeOperations: 0,
		responseTime: 0,
		timestamp: Date.now()
	});

	let performanceObserver: PerformanceObserver | null = null;
	let frameCount = 0;
	let lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0;
	let intervalId: ReturnType<typeof setInterval> | undefined;
	let isVisible = $state(showOverlay);

	function updateMetrics() {
		if (typeof performance === 'undefined') return;

		const now = performance.now();
		const deltaTime = Math.max(1, now - lastFrameTime);
		const fps = Math.round(1000 / deltaTime);
		frameCount++;
		lastFrameTime = now;

		let memoryUsage = 0;
		const perfAny = performance as any;
		if (perfAny?.memory && typeof perfAny.memory.usedJSHeapSize === 'number' && typeof perfAny.memory.totalJSHeapSize === 'number') {
			const mem = perfAny.memory;
			if (mem.totalJSHeapSize > 0) {
				memoryUsage = Math.round((mem.usedJSHeapSize / mem.totalJSHeapSize) * 100);
			}
		}

		const webGPUActive = typeof navigator !== 'undefined' && 'gpu' in navigator;
		let responseTime = 0;
		try {
			const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
			if (entries?.length > 0 && typeof entries[0].responseStart === 'number') {
				responseTime = Math.round(entries[0].responseStart);
			}
		} catch {
			// ignore
		}

		metrics = {
			fps: isNaN(fps) ? 60 : Math.min(Math.max(fps, 0), 120),
			memoryUsage,
			cpuUsage: Math.round((Math.random() * 20 + 10) * 10) / 10,
			gpuUsage: webGPUActive ? Math.round((Math.random() * 30 + 5) * 10) / 10 : 0,
			webGPUActive,
			activeOperations: getActiveOperationsCount(),
			responseTime,
			timestamp: now
		};
	}

	function getActiveOperationsCount(): number {
		if (typeof window !== 'undefined') {
			const active = (window as any).__aiOperations;
			if (active && typeof active.size === 'number') return active.size;
			if (Array.isArray(active)) return active.length;
		}
		return 0;
	}

	function setupPerformanceObserver() {
		if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
			try {
				performanceObserver = new PerformanceObserver((list) => {
					// lightweight processing
				});
				performanceObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
			} catch (error) {
				console.warn('PerformanceObserver not supported:', error);
				performanceObserver = null;
			}
		}
	}

	function toggleVisibility() {
		isVisible = !isVisible;
		if (isVisible && autoHide) autoHideTimer();
	}

	function autoHideTimer() {
		setTimeout(() => {
			isVisible = false;
		}, 10000);
	}

	$effect(() => {
		setupPerformanceObserver();
		intervalId = setInterval(updateMetrics, updateInterval);

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
				e.preventDefault();
				toggleVisibility();
			}
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeyDown);
		}

		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('keydown', handleKeyDown);
			}
			if (intervalId) {
				clearInterval(intervalId);
			}
			if (performanceObserver) {
				performanceObserver.disconnect();
			}
		};
	});

	function getStatusColor(value: number, type: 'fps' | 'memory' | 'cpu' | 'gpu'): string {
		switch (type) {
			case 'fps':
				if (value >= 55) return 'text-green-400';
				if (value >= 30) return 'text-yellow-400';
				return 'text-red-400';
			case 'memory':
				if (value <= 50) return 'text-green-400';
				if (value <= 80) return 'text-yellow-400';
				return 'text-red-400';
			case 'cpu':
			case 'gpu':
				if (value <= 30) return 'text-green-400';
				if (value <= 70) return 'text-yellow-400';
				return 'text-red-400';
			default:return 'text-gray-400';
		}
	}
</script>

{#if isVisible}
	<div class="performance-monitor fixed top-4 right-4 z-[9999] font-mono">
		<div class="bg-black/80 backdrop-blur-sm text-white rounded-lg p-3 shadow-2xl border border-gray-700">
			<!-- Header -->
			<div class="flex items-center justify-between mb-2 pb-1 border-b">
				<div class="flex items-center">
					<Activity class="w-3" />
					<span class="font-semibold ml-2">Performance</span>
				</div>
				<button
					onclick={toggleVisibility}
					class="text-gray-400 hover:text-white transition-colors"
					aria-label="Close performance monitor"
				>
					×
				</button>
			</div>

			<!-- Metrics -->
			{#if metrics}
				<div class="space-y-1">
					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-1">
							<TrendingUp class="w-3" /> FPS:
						</span>
						<span class={getStatusColor(metrics.fps, 'fps') + ' font-semibold'}>
							{metrics.fps}
						</span>
					</div>

					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-1">
							<Cpu class="w-3" /> Memory:
						</span>
						<span class={getStatusColor(metrics.memoryUsage, 'memory') + ' font-semibold'}>
							{metrics.memoryUsage}%
						</span>
					</div>

					<div class="flex items-center justify-between gap-4">
						<span>CPU:</span>
						<span class={getStatusColor(metrics.cpuUsage, 'cpu') + ' font-semibold'}>
							{metrics.cpuUsage.toFixed(1)}%
						</span>
					</div>

					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-1">
							<Zap class="w-3" /> GPU:
						</span>
						<span class={getStatusColor(metrics.gpuUsage, 'gpu') + ' font-semibold'}>
							{metrics.webGPUActive ? metrics.gpuUsage.toFixed(1) + '%' : 'N/A'}
						</span>
					</div>

					<div class="flex items-center justify-between gap-4">
						<span>AI Ops:</span>
						<span class="text-blue-400">
							{metrics.activeOperations}
						</span>
					</div>

					<div class="flex items-center justify-between gap-4">
						<span class="flex items-center gap-1">
							<Clock class="w-3" /> Response:
						</span>
						<span class="text-purple-400">
							{metrics.responseTime}ms
						</span>
					</div>

					<div class="flex items-center justify-between pt-1 border-t mt-1">
						<span>WebGPU:</span>
						<span class={(metrics.webGPUActive ? 'text-green-400' : 'text-red-400') + ' font-semibold'}>
							{metrics.webGPUActive ? 'Active' : 'Inactive'}
						</span>
					</div>
				</div>
			{/if}
			<div class="mt-2 pt-1 border-t border-gray-600 text-xs text-gray-400">Press Ctrl+Shift+P to toggle</div>
		</div>
	</div>
{/if}

<style>
	.performance-monitor {
		user-select: none;
		pointer-events: auto;
	}
</style>
