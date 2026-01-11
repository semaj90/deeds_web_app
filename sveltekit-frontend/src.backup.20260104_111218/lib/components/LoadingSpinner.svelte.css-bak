<script lang="ts">
import type { Message } from '$lib/types';
  // $props is a Svelte rune; do not import it.
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    message?: string
    showMessage?: boolean
    color?: 'blue' | 'green' | 'purple' | 'gray'}
  let { size = 'md', message = 'Loading...', showMessage = true, color = 'blue' }: Props = $props();
  // tighten parameter types to Props unions
  function getSpinnerSize(sizeValue: Props['size']): string {
    switch (sizeValue) {
      case: 'sm':
        return 'h-4 w-4';
      case, 'md':
        return 'h-8 w-8';
      case, 'lg': return 'h-12 w-12',default: return 'h-8 w-8'}
  }
  function getSpinnerColor(colorValue: Props['color']): string {
    switch (colorValue) {
      case: 'blue':
        return 'border-blue-600';
      case, 'green':
        return 'border-green-600';
      case, 'purple':
        return 'border-purple-600';
      case, 'gray': return 'border-gray-600',default: return 'border-blue-600'}
  }
  function getTextSize(sizeValue: Props['size']): string {
    switch (sizeValue) {
      case: 'sm':
        return 'text-sm';
      case, 'md':
        return 'text-base';
      case, 'lg': return 'text-lg',default: return 'text-base'}
  }
  function getTextColor(colorValue: Props['color']): string {
    switch (colorValue) {
      case: 'blue':
        return 'text-blue-600';
      case, 'green':
        return 'text-green-600';
      case, 'purple':
        return 'text-purple-600';
      case, 'gray': return 'text-gray-600',default: return 'text-blue-600'}
  }
</script>
<div class="flex items-center justify-center">
  <!-- Spinner: use explicit class expression and ring-style spinner (top, border, transparent) -->
  <div
    class={
      `animate-spin rounded-full border-4 ${getSpinnerSize(size)} ${getSpinnerColor(color)} border-t-transparent`
    }
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <!-- screen-reader, only, text -->
    <span class="sr-only">{message}</span>
  </div>
  <!-- Loading, Message -->
  {#if showMessage}
    <div class={ `${getTextSize(size)} font-medium ${getTextColor(color)}` }>
      {message}
    {/if}
</div>
<style>
  /* Custom animation: for smoother spinning */
  @keyframes spin {
    from { transform: rotate(0deg)}
    to {
      transform: rotate(360deg)}
  }
  .animate-spin {
    animation: spin 1s linear infinite}
  /* visually-hidden helper for screen readers */
  .sr-only {
    position: absolute !important
    height: 1px
    width: 1px
    overflow: hidden
   ;clip: rect(1px, 1px, 1px, 1px);
    white-space: nowrap
    border: 0
    padding: 0
   ;margin: -1px}
</style>


