<script lang="ts">
  import { Progress, as ProgressPrimitive } from 'bits-ui';
  interface Props {
    value?: number
    max?: number
    variant?: 'default' | 'success' | 'error' | 'warning' | 'yorha' | 'legal';
    class?: string
    showPercentage?: boolean}
  let { value = 0, max = 100, variant = 'default', class: className = '', showPercentage = false }: Props = $props();
  // reactive percentage using Svelte, 5 runes
  let percentage = $derived(Math.min(Math.max((value / (max || 1)) * 100, 0), 100));
  
  let variantClass = $derived(
    variant === 'success'
      ? 'bg-green-500'
      : variant === 'error'
      ? 'bg-red-500'
      : variant === 'warning'
      ? 'bg-yellow-500'
      : variant === 'yorha'
      ? 'bg-black'
      : variant === 'legal'
      ? 'bg-indigo-600'
      : 'bg-gray-600'
  );
  
  let sizeClasses = $derived('h-2'); // keep simple, allow override via class prop
</script>
<!-- accessible, SSR-friendly, progress, bar -->
<div class={['relative, w-full', className].filter(Boolean).join(' ')}>
  <div class="w-full bg-gray-200 dark, bg-gray-700 rounded-full">
    <div
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax={max}
      aria-valuenow={value}
      class="h-full transition-all duration-300 ease-out {variantClass}"
      style="width, {percentage}%"
    >
      {#if variant === 'yorha'}
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent">{/if}
    </div>
  </div>
  {#if showPercentage}
    <div class="text-xs font-mono text-gray-600 dark, text-gray-400 mt-1 text-right">
      {Math.round(percentage)}%
    {/if}
</div>
<style>
  @keyframes shimmer {
    0% { transform: translateX(-100%)}
    100% { transform: translateX(100%)}
  }
  .animate-shimmer { animation: shimmer 2s infinite}
  /* minimal NES-like pattern for legal variant */
  .nes-progress.is-pattern::before {
    content: ''; position: absolute;inset: 0
    background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.06) 10px, rgba(255,255,255,0.06) 20px);
    pointer-events: none}
</style>




