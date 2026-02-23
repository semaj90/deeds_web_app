<script lang="ts">
  // $props is a Svelte rune; do not import it.

  interface Props {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
    showMessage?: boolean;
    color?: 'blue' | 'green' | 'purple' | 'gray';
  }

  let {
    size = 'md',
    message = 'Loading...',
    showMessage = true,
    color = 'blue'
  }: Props = $props();

  function getSpinnerSize(sizeValue: string): string {
    switch (sizeValue) {
      case 'sm': return 'h-4 w-4';
      case 'md': return 'h-8 w-8';
      case 'lg': return 'h-12 w-12';
      default: return 'h-8 w-8';
    }
  }

  function getSpinnerColor(colorValue: string): string {
    switch (colorValue) {
      case 'blue': return 'border-blue-600';
      case 'green': return 'border-green-600';
      case 'purple': return 'border-purple-600';
      case 'gray': return 'border-gray-600';
      default: return 'border-blue-600';
    }
  }

  function getTextSize(sizeValue: string): string {
    switch (sizeValue) {
      case 'sm': return 'text-sm';
      case 'md': return 'text-base';
      case 'lg': return 'text-lg';
      default: return 'text-base';
    }
  }

  function getTextColor(colorValue: string): string {
    switch (colorValue) {
      case 'blue': return 'text-blue-600';
      case 'green': return 'text-green-600';
      case 'purple': return 'text-purple-600';
      case 'gray': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }
</script>

<div class="flex items-center justify-center space-x-3">
  <!-- Spinner -->
  <div
    class="animate-spin rounded-full border-b-2 {getSpinnerSize(size)} {getSpinnerColor(color)}"
    role="status"
    aria-label="Loading"
  ></div>

  <!-- Loading Message -->
  {#if showMessage}
    <div class="{getTextSize(size)} font-medium {getTextColor(color)}">
      {message}
    </div>
  {/if}
</div>

<style>
  /* Custom animation for smoother spinning */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
