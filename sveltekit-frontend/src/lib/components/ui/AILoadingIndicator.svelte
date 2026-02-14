<script lang="ts">
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Brain from 'lucide-svelte/icons/brain';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Clock from 'lucide-svelte/icons/clock';
  import Cpu from 'lucide-svelte/icons/cpu';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import Zap from 'lucide-svelte/icons/zap';
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
      default:return Brain;
    }
  }

  function getStatusIcon(st: string) {
    switch (st) {
      case 'success': return CheckCircle;
      case 'error': return XCircle;
      case 'warning': return AlertCircle;
      default:return getOperationIcon(operation);
    }
  }

  function getStatusColor(st: string): string {
    switch (st) {
      case 'success': return 'text-accent';
      case 'error': return 'text-danger/80';
      case 'warning': return 'text-warning';
      case 'loading':
        switch (operation) {
          case 'ai': return 'text-info/80';
          case 'gpu': return 'text-info/80';
          case 'cpu': return 'text-warning';
          case 'upload': return 'text-accent';
          default:return 'text-info/80';
        }
      default:return 'text-sand/40';
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

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  });
</script>

{#if isLoading || status !== 'loading'}
  <div class="ai-loading-component {variant} {sizeClasses[size]}">
    <div class="flex items-start gap-3">
      <!-- Icon -->
      <div class="flex-shrink-0">
        {#if status === 'loading'}
          {@const OperationIcon = getOperationIcon(operation)}
          <div class="relative">
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
        <h3 class="font-semibold text-sand dark:text-sand/20">{title}</h3>

        {#if description}
          <p class="text-sm text-sand/60 dark:text-sand/40">{description}</p>
        {/if}

        {#if showProgress && status === 'loading'}
          <div class="mt-3">
            <div class="flex items-center justify-between text-xs text-sand/60 dark:text-sand/40">
              <span>Progress</span>
              <span>{Math.round($progressTween)}%</span>
            </div>
            <div class="w-full bg-sand/10 dark:bg-panelSoft rounded-full h-2">
              <div
                class="h-2 rounded-full transition-all duration-300 {operation === 'ai' ? 'bg-info' : operation === 'gpu' ? 'bg-info' : operation === 'cpu' ? 'bg-warning' : 'bg-accent'}"
                style="width: {$progressTween}%"
              ></div>
            </div>
          </div>
        {/if}

        {#if isLoading && (showEstimate || elapsedTime > 0)}
          <div class="mt-2 flex items-center gap-4 text-xs text-sand/60">
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
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium {operation === 'ai' ? 'bg-info/10 text-info dark: bg-info/20 dark:text-info/40' : operation === 'gpu' ? 'bg-info/10 text-info dark: bg-info/20 dark:text-info/40' : operation === 'cpu' ? 'bg-warning/10 text-warning dark: bg-warning/20 dark:text-warning/40' : 'bg-accent/10 text-accent dark: bg-accent/20 dark:text-accent/40'}">
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

  .ai-loading-component.overlay { position: fixed;
		inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 50;
	display: flex;
    align-items: center;
    justify-content: center;
  }

  .ai-loading-component.modal {
    background: transparent;
  }
</style>
