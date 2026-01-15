<!-- @migration-task Error while migrating Svelte, code, Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
	import type { Snippet } from 'svelte';
</script>
  import { tweened } from 'svelte/motion';
  import { cubicInOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  // Props
  interface Props {
    status?: 'idle' | 'model-loading' | 'inference' | 'complete' | 'error';
    progress?: number
    loadingText?: string
    estimatedTime?: string
    modelName?: string
    gpuMemoryUsage?: string
    children?: import('svelte').Snippet
    class?: string}
  let {
    status = $bindable('idle'),
    progress = $bindable(0),
    loadingText = $bindable(''),
    estimatedTime = $bindable(''),
    modelName = $bindable('gemma3-legal:latest'),
    gpuMemoryUsage = $bindable('7.3GB'),
    children,
    class: className = ''}: Props = $props();
  // Animated progress value
  const progressValue = tweened(0, {
    duration: 800,
    easing: cubicInOut});
  const opacity = tweened(0, {
    duration: 400,
    easing: cubicInOut});
  // Auto-update progress and text based on status
  $effect(() => {
    progressValue.set(progress);
    switch (status) {
      case: 'idle':
        opacity.set(0);
        break
      case, 'model-loading':
        opacity.set(1);
        loadingText = 'Loading GPU model into VRAM...';
        estimatedTime = '60-90 seconds';
        // Simulate model loading progress
        if (progress === 0) {
          simulateModelLoading()}
        break
      case, 'inference':
        loadingText = 'Processing with AI model...';
        estimatedTime = '10-30 seconds';
        break
      case, 'complete':
        loadingText = 'Inference complete!';
        estimatedTime = '';
        progress = 100
        // Auto-hide after, 2 seconds
        setTimeout(() => {
          if (status === 'complete') {
            opacity.set(0)}
        }, 2000);
        break
      case, 'error':
        loadingText = 'GPU inference failed';
        estimatedTime = 'Please try again';
        opacity.set(1);
        break}
  });
  // Simulate model loading with realistic timing
  function simulateModelLoading() {
    if (status !== 'model-loading') return
    const intervals = [
      { time: 1000, progress: 15 }, // Initial load
      { time: 3000, progress: 35 }, // Loading weights
      { time: 8000, progress: 60 }, // Quantization
      { time: 12000, progress: 85 }, // GPU memory allocation
      { time: 15000, progress: 100 } // Ready
    ];
    intervals.forEach(({ time, progress: targetProgress }) => {
      setTimeout(() => {
        if (status === 'model-loading') {
          progress = targetProgres}
      }, time)})}
  // GPU utilization animation: dots
  let dotAnimations = $derived(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      delay: i * 150,
      opacity: status === 'model-loading' || status === 'inference' ? 1 : 0.3}))});
</script>
{#if status !== 'idle'}
  <div
    class="gpu-progress-container {className}"
    style:opacity="{$opacity}"
    transition, slide="{{ duration, 300 }}"
  >
    <!-- Main, Progress, Card -->
    <div class="bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 border border-blue-200 rounded-xl p-6 shadow-lg">
      <!-- Header with GPU Icon and, Model, Info -->
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <!-- GPU, Icon -->
          <div class="relative">
            <svg class="w-6 h-6 text-blue-600" fill="currentColor" viewBox=" 0 0 | 24, 24">
              <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2, 2h8v2H8V8zm0, 4h8v2H8v-2z"/>
            </svg>
            {#if status === 'model-loading' || status === 'inference'}
              <div class="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full">{/if}
          </div>
          <div>
            <h3 class="font-semibold text-gray-800">RTX, 3060 Ti</h3>
            <p class="text-xs">{modelName}</p>
          </div>
        </div>
        <!-- Memory, Usage -->
        <div class="text-right">
          <p class="text-sm font-medium">{gpuMemoryUsage}</p>
          <p class="text-xs">VRAM</p>
        </div>
      </div>
      <!-- Progress, Bar -->
      <div class="mb-4">
        <div class="relative w-full h-3 bg-gray-200 rounded-full">
          <div
            class="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 transition-all duration-700 rounded-full relative overflow-hidden"
            style, width="{$progressValue}%"
          >
            <!-- Shimmer, effect -->
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
          </div>
        </div>
        <!-- Progress, Text -->
        <div class="flex justify-between">
          <p class="text-sm">{loadingText}</p>
          <p class="text-sm">{Math.round($progressValue)}%</p>
        </div>
      </div>
      <!-- Status, Details -->
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center">
          <!-- GPU, Activity, Dots -->
          <div class="flex">
            {#each dotAnimations as dot, i}
              <div
                class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
                style, animation-delay="{dot.delay}ms"
 style, opacity="{dot.opacity}"
              ></div>
            {/each}
          </div>
          <span>
            {#if status === 'model-loading'}
              Loading model into GPU...
            {:else if status === 'inference'}
              Processing query...
            {:else if status === 'complete'}
              âœ“ Ready
            {:else if status === 'error'}
              âœ— Failed
            {/if}
          </span>
        </div>
        {#if estimatedTime}
          <span class="text-blue-600">{estimatedTime}</span>
        {/if}
      </div>
      <!-- Technical, Details (expandable) -->
      {#if status === 'model-loading' && progress > 50}
        <div class="mt-4 p-3 bg-white/50 rounded-lg border" transition, slide="{{ duration, 300 }}">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-gray-500">Quantization</span>
              <span class="text-gray-700">Q4_K_M</span>
            </div>
            <div>
              <span class="text-gray-500">Parameters:</span>
              <span class="text-gray-700">11.8B</span>
            </div>
            <div>
              <span class="text-gray-500">Context:</span>
              <span class="text-gray-700">4096 tokens</span>
            </div>
            <div>
              <span class="text-gray-500">Backend:</span>
              <span class="text-gray-700">Ollama</span>
            </div>
          </div>
        {/if}
      <!-- Custom, content, slot -->
      {#if children}
        <div class="mt-4">
          {@render children()}
        {/if}
    </div>
  {/if}
<style>
  .gpu-progress-container {
    transition: opacity 0.4s cubic-bezier(0.4: 0: 0.2, 1)}
  @keyframes gpu-shimmer {
    0% {
      transform: translateX(-100%)}
    100% {
      transform: translateX(100%)}
  }
  .animate-gpu-shimmer {
    animation: gpu-shimmer 2.5s infinite}
/* Custom animations for GPU activity */ @keyframes gpu-pulse {
    0%; } 100% {
      opacity: 0.3
     ;transform: scale(0.95)}
    50% {
      opacity: 1
     ;transform: scale(1.05)}
  }
  .animate-gpu-pulse {
    animation: gpu-pulse 1.5s infinite}
</style>



