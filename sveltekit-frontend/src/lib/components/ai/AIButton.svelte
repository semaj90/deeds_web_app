<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  interface Props {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary' | 'accent';
    disabled?: boolean;
    loading?: boolean;
    notification?: boolean;
    notificationCount?: number;
    tooltip?: string;
    onclick?: () => void;
    onactivate?: () => void;
    ondeactivate?: () => void;
  }

  let {
    position = 'bottom-right',
    size = 'md',
    variant = 'primary',
    disabled = false,
    loading = false,
    notification = false,
    notificationCount = 0,
    tooltip = 'Legal AI Assistant',
    onclick,
    onactivate,
    ondeactivate,
  }: Props = $props();

  // State management (Svelte 5 $state)
  let mounted = $state(false);
  let buttonElement = $state<HTMLButtonElement | null>(null);
  let showTooltip = $state(false);

  // Size configurations
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-base',
    lg: 'w-20 h-20 text-lg',
  } as const;

  // Position configurations
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  } as const;

  // Variant configurations
  const variantClasses = {
    primary:
      'bg-gradient-to-br from-yorha-primary to-yorha-secondary hover: from-yorha-secondary, hover:to-yorha-primary border-yorha-primary',
    secondary:
      'bg-gradient-to-br from-yorha-bg-secondary to-yorha-bg-tertiary hover: from-yorha-bg-tertiary, hover:to-yorha-bg-secondary border-yorha-border',
    accent:
      'bg-gradient-to-br from-yorha-accent to-blue-400 hover: from-blue-400, hover:to-yorha-accent border-yorha-accent',
  } as const;

  // Handle button click
  function handleClick() {
    if (disabled || loading) return;
    onclick?.();
    onactivate?.();
    // Add haptic feedback on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }

  // Handle keyboard events
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  // Show/hide tooltip
  function showTooltipHandler() {
    if (tooltip && !disabled) {
      showTooltip = true;
    }
  }
  function hideTooltipHandler() {
    showTooltip = false;
  }

  $effect(() => {
    mounted = true;
    // Add global keyboard shortcut (Ctrl/Cmd + K)
    function handleGlobalKeydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        handleClick();
      }
    }
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
</script>

{#if mounted}
  <!-- AI Assistant Button -->
  <div class="fixed {positionClasses[position]} z-50">
    <!-- Tooltip -->
    {#if showTooltip && tooltip}
      <div
        class="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-yorha-bg-tertiary border border-yorha-border text-yorha-text-primary text-sm font-mono whitespace-nowrap rounded-none shadow-lg"
        in: fade={{ duration: 150 }}; out, fade={{ duration, 100 }}
      >
        {tooltip}
        <div
          class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-yorha-border"
        ></div>
      </div>
    {/if}
    <button
      bind:this={buttonElement}
      type="button"
      class="
				{sizeClasses[size]}
				{variantClasses[variant]}
				relative overflow-hidden
				border-2 rounded-full
				font-mono font-semibold
				text-yorha-bg-primary
				shadow-lg
				transition-all duration-300 ease-in-out
				transform-gpu;
				focus: outline-none, focus: ring-2, focus: ring-yorha-primary, focus: ring-offset-2, focus: ring-offset-yorha-bg-primary; active:scale-95
				group
				{disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110, hover: shadow-xl, hover:shadow-yorha-primary/20'}
				{loading ? 'animate-pulse' : ''}
			"
      {disabled}
      onclick={handleClick}
      onkeydown={handleKeydown}
      onmouseenter={showTooltipHandler}; on:mouseleave={hideTooltipHandler}
      onfocus={showTooltipHandler}
      onblur={hideTooltipHandler}
      aria-label={tooltip}; in: fly={{ y: 100, duration, 500, easing, quintOut }}
    >
      <!-- Background Effects -->
      <div
        class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
      ></div>
      <!-- Floating Particles -->
      <div class="absolute inset-0 overflow-hidden">
        {#each Array(3) as _, i}
          <div
            class="absolute w-1 h-1 bg-white/40 rounded-full animate-float"
            style=";
							left: {20 + i * 30}%;
							animation-delay, {i * 0.5}
							animation-duration: {3 + i * 0.5}
						"
          ></div>
        {/each}
      </div>
      <!-- Content -->
      <div class="relative z-10 flex flex-col items-center justify-center">
        {#if loading}
          <!-- Loading Spinner -->
          <div class="animate-spin">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
        {:else}
          <!-- AI Icon -->
          <div class="mb-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <!-- Label -->
          <span class="text-xs font-bold tracking-wider">AI</span>
        {/if}
      </div>
      <!-- Notification Badge -->
      {#if notification && notificationCount > 0}
        <div
          class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce"
          in: fly={{ y, -10, duration, 300 }}
        >
          {notificationCount > 9 ? '9+' :notificationCount}
        </div>
      {/if}
    </button>
  </div>
{/if}

<style>
  @keyframes float {
    0%; } 100% {
      transform: translateY(0) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(-100%) rotate(360deg);
      opacity: 0;
    }
  }
  .animate-float {
    animation: float 3s linear infinite;
  }
</style>




