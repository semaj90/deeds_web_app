<script lang="ts">
  type ProgressVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'yorha' | 'legal';
  type ProgressSize = 'sm' | 'default' | 'lg';

  interface Props {
    value?: number;
    max?: number;
    variant?: ProgressVariant;
    size?: ProgressSize;
    showPercentage?: boolean;
    class?: string;
  }

  let {
    value = 0,
    max = 100,
    variant = 'default',
    size = 'default',
    showPercentage = false,
    class: className = ''
  }: Props = $props();

  let percentage = $derived(Math.min(Math.max((value / max) * 100, 0), 100));

  // Enhanced theming with NES.css compatibility
  let variantClasses = $derived(
    variant === 'success'
      ? 'bg-accent nes-progress is-success'
      : variant === 'error'
        ? 'bg-danger nes-progress is-error'
        : variant === 'warning'
          ? 'bg-warning nes-progress is-warning'
          : variant === 'info'
            ? 'bg-info nes-progress is-primary'
            : variant === 'yorha'
              ? 'bg-black nes-progress is-dark'
              : variant === 'legal'
                ? 'bg-info nes-progress is-pattern'
                : 'bg-sand/20 nes-progress'
  );

  let sizeClasses = $derived(
    size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-4' : 'h-2.5'
  );

  let containerClasses = $derived(
    variant === 'yorha'
      ? 'nes-container is-dark with-title'
      : variant === 'legal'
        ? 'nes-container with-title'
        : ''
  );
</script>

<div class="relative {className}">
  <div class="w-full bg-sand/10 dark:bg-panelSoft rounded-full">
    <div
      class="h-full transition-all duration-300 {variantClasses} {sizeClasses}"
      style="width: {percentage}%"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin="0"
      aria-valuemax={max}
      aria-label="Upload progress"
    >
      {#if variant === 'yorha'}
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      {/if}
    </div>
  </div>
  {#if showPercentage}
    <div class="text-xs font-mono text-sand/60 dark:text-sand/40 mt-1 text-right">
      {Math.round(percentage)}%
    </div>
  {/if}
</div>

<style>
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .animate-shimmer {
    animation: shimmer 2s infinite;
  }

  /* NES.css integration for legal/yorha variants */
  .nes-progress {
    position: relative;
    border-radius: 0;
  }

  .nes-progress.is-pattern::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 10px,
      rgba(255, 255, 255, 0.1) 10px,
      rgba(255, 255, 255, 0.1) 20px
    );
    pointer-events: none;
  }
</style>
