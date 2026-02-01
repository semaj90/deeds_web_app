<script lang="ts">
  import { AlertCircle, Brain, CheckCircle, Clock, Cpu, XCircle, Zap } from 'lucide-svelte';
  import { onDestroy } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { tweened } from 'svelte/motion';

  interface Props {
    isLoading?: boolean;
    title?: string;
    description?: string;
    progress?: number;
    status?: 'loading' | 'success' | 'error' | 'warning';
    showProgress?: boolean;
    showEstimate?: boolean;
    estimatedTime?: number;
    operation?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'overlay' | 'inline' | 'modal';
  }

  let {
    isLoading = false,
    title = 'Processing...',
    description = '',
    progress = 0,
    status = 'loading',
    showProgress = true,
    showEstimate = false,
    estimatedTime = 0,
    operation = 'ai',
    size = 'md',
    variant = 'inline'
  }: Props = $props();

  const progressTween = tweened(0, { duration: 300, easing: cubicOut });
  let startTime = Date.now();
  let elapsedTime = $state<number>(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    progressTween.set(progress);
  });

  const sizeClasses: Record<string, string> = {
    sm: 'text-sm p-3',
    md: 'text-base p-4',
    lg: 'text-lg p-6'
  };

  const iconSizes: Record<string, string> = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  function getOperationIcon(op: string) {
    switch (op) {
      case 'ai': return Brain;
      case 'gpu': return Zap;
      case 'cpu': return Cpu;
      case 'upload': return CheckCircle;
      default: return Brain;
    }
  }

  function getStatusIcon(st: string) {
    switch (st) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'warning': return AlertCircle;
      default: return getOperationIcon(operation);
    }
  }

  function getStatusColor(st: string): string {
    switch (st) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'loading':
        switch (operation) {
          case 'ai': return 'text-blue-400';
          case 'gpu': return 'text-purple-400';
          case 'cpu': return 'text-orange-400';
          case 'upload': return 'text-green-400';
          default: return 'text-blue-400';
        }
      default: return 'text-gray-400';
    }
  }

  function formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  }

  function updateElapsedTime() {
    elapsedTime = (Date.now() - startTime) / 1000;
  }

  $effect(() => {
    if (isLoading) {
      if (!intervalId) {
        startTime = Date.now();
        intervalId = setInterval(updateElapsedTime, 100);
      }
    } else {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  });

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
</script>

{#if isLoading || status !== 'loading'}
  <div class="ai-loading-component {variant} {sizeClasses[size]}">
    <div class="flex items-start gap-3">
      <!-- Icon -->
      <div class="flex-shrink-0">
        {#if status === 'loading'}
          <div class="relative">
            {@const OperationIcon = getOperationIcon(operation)}
            <OperationIcon class="{iconSizes[size]} {getStatusColor(status)} animate-pulse" />
            {#if operation === 'ai' || operation === 'gpu'}
              <div class="absolute -inset-1 rounded-full border-2 border-current opacity-20 animate-spin border-r-transparent"></div>
            {/if}
          </div>
        {:else}
          {@const StatusIcon = getStatusIcon(status)}
          <StatusIcon class="{iconSizes[size]} {getStatusColor(status)}" />
        {/if}
      </div>

      <!-- Content -->
      <div class="flex-1">
        <h3 class="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>

        {#if description}
          <p class="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        {/if}

        {#if showProgress && status === 'loading'}
          <div class="mt-3">
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Progress</span>
              <span>{Math.round($progressTween)}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="h-2 rounded-full transition-all duration-300 {operation === 'ai' ? 'bg-blue-500' : operation === 'gpu' ? 'bg-purple-500' : operation === 'cpu' ? 'bg-orange-500' : 'bg-green-500'}"
                style="width: {$progressTween}%"
              ></div>
            </div>
          </div>
        {/if}

        {#if isLoading && (showEstimate || elapsedTime > 0)}
          <div class="mt-2 flex items-center gap-4 text-xs text-gray-500">
            {#if elapsedTime > 0}
              <span class="flex items-center gap-1">
                <Clock class="w-3 h-3" />
                Elapsed: {formatTime(elapsedTime)}
              </span>
            {/if}
            {#if showEstimate && estimatedTime > 0}
              <span>ETA: {formatTime(estimatedTime - elapsedTime)}</span>
            {/if}
          </div>
        {/if}

        {#if operation && status === 'loading'}
          <div class="mt-2">
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium {operation === 'ai' ? 'bg-blue-100 text-blue-800 dark: bg-blue-900, dark:text-blue-200' : operation === 'gpu' ? 'bg-purple-100 text-purple-800 dark: bg-purple-900, dark:text-purple-200' : operation === 'cpu' ? 'bg-orange-100 text-orange-800 dark: bg-orange-900, dark:text-orange-200' : 'bg-green-100 text-green-800 dark: bg-green-900, dark:text-green-200'}">
              {operation.toUpperCase()} Processing
            </span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .ai-loading-component {
    background: var(--bg-secondary, #1a1a2e);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.5rem;
  }

  .ai-loading-component.overlay {
    position: fixed;, inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 50;, display: flex;
    align-items: center;
    justify-content: center;
  }

  .ai-loading-component.modal {
    background: transparent;
  }
</style>
