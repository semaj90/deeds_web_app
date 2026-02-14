<script lang="ts">
  import { onMount } from 'svelte';
  import { scale, fly, fade } from 'svelte/transition';
  import Bot from '@lucide/svelte/icons/bot';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Brain from '@lucide/svelte/icons/brain';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Settings from '@lucide/svelte/icons/settings';

  interface Props {
    isVisible?: boolean;
    onToggle?: () => void;
    onSettingsClick?: () => void;
    isConnected?: boolean;
    aiMode?: 'idle' | 'thinking' | 'active';
  }

  let {
    isVisible = $bindable(true),
    onToggle = () => {},
    onSettingsClick = () => {},
    isConnected = true,
    aiMode = $bindable('idle')
  }: Props = $props();

  let isExpanded = $state(false);
  let isHovered = $state(false);
  let pulseAnimation = $state(true);

  const pulseClasses: Record<string, string> = {
    idle: 'animate-pulse',
    thinking: 'animate-bounce',
    active: 'animate-ping'
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'thinking': return 'text-warning';
      case 'active': return 'text-accent';
      default: return 'text-info/80';
    }
  };

  const quickActions = [
    { id: 'analyze', label: 'Analyze Case', icon: Brain, color: 'hover:bg-info/20' },
    { id: 'search', label: 'Search Evidence', icon: MessageCircle, color: 'hover:bg-info/20' },
    { id: 'assist', label: 'AI Assistant', icon: Sparkles, color: 'hover:bg-accent/20' }
  ];

  const handleQuickAction = (actionId: string) => {
    console.log(`Quick action triggered: ${actionId}`);
    aiMode = 'thinking';
    setTimeout(() => {
      aiMode = 'active';
      setTimeout(() => { aiMode = 'idle'; }, 2000);
    }, 1000);
    onToggle();
  };

  onMount(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const resetExpanded = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isHovered) isExpanded = false;
      }, 3000);
    };
    if (isExpanded) resetExpanded();
    return () => clearTimeout(timeoutId);
  });
</script>

{#if isVisible}
  <div
    class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2"
    role="region"
    aria-label="AI Assistant Controls"
  >
    {#if isExpanded}
      <div
        class="flex flex-col gap-2 mb-2"
        in:fly={{ y: 20, duration: 200, delay: 100 }}
        out:fly={{ y: 20, duration: 150 }}
      >
        {#each quickActions as action, index}
          <button
            onclick={() => handleQuickAction(action.id)}
            class="group relative flex items-center gap-3 px-4 py-3 bg-panel/95 backdrop-blur-md border border-sand/20/50 rounded-2xl hover:border-sand/30/50 transition-all duration-200 {action.color}"
            in:scale={{ duration: 200, delay: index * 50, start: 0.8 }}
            aria-label={action.label}
          >
            <div class="relative">
              <svelte:component this={action.icon} class="w-5 h-5 text-sand/40 group-hover:text-white transition-colors" />
              <div class="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity">
                <svelte:component this={action.icon} class="w-5 h-5 text-white blur-sm" />
              </div>
            </div>
            <span class="text-sm font-medium text-sand/40 group-hover:text-white whitespace-nowrap">
              {action.label}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if isExpanded}
      <button
        onclick={onSettingsClick}
        class="p-3 bg-panelSoft/90 backdrop-blur-md border border-sand/30/50 rounded-xl hover:bg-panelSoft/90 hover:border-sand/30/50 transition-all duration-200 group"
        in:scale={{ duration: 200, delay: 300 }}
        aria-label="AI Assistant Settings"
      >
        <Settings class="w-5 h-5 text-sand/40 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
      </button>
    {/if}

    <button
      onclick={() => isExpanded = !isExpanded}
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
      class="relative group p-4 bg-gradient-to-br from-panel via-panelSoft to-panel border-2 border-sand/30/50 rounded-full shadow-2xl hover:border-sand/30/70 hover:shadow-info/20 transition-all duration-300 transform hover:scale-105 active:scale-95 {aiMode === 'active' ? 'shadow-accent/30 border-accent/60/70' : ''}"
      class:animate-pulse={aiMode === 'idle' && pulseAnimation}
      class:animate-bounce={aiMode === 'thinking'}
      aria-label={isExpanded ? 'Close AI Menu' : 'Open AI Assistant'}
      aria-expanded={isExpanded}
    >
      <div class="absolute inset-0 rounded-full bg-gradient-to-br from-info/20 via-info/20 to-accent/20 opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-xl"></div>

      {#if isConnected}
        <div class="absolute inset-0 rounded-full border-2 border-accent/60/30 {pulseClasses[aiMode]}"></div>
      {:else}
        <div class="absolute inset-0 rounded-full border-2 border-danger/60/50 animate-pulse"></div>
      {/if}

      <div class="relative flex items-center justify-center w-12 h-12">
        {#if isExpanded}
          <ChevronUp class="w-6 h-6 {getModeColor(aiMode)} transition-all duration-300 group-hover:scale-110" />
        {:else}
          <div class="relative">
            <Bot class="w-7 h-7 {getModeColor(aiMode)} transition-all duration-300 group-hover:scale-110" />
            {#if aiMode === 'thinking' || aiMode === 'active'}
              <div class="absolute -top-1 -right-1 w-3 h-3 bg-current rounded-full {pulseClasses[aiMode]}"></div>
            {/if}
            <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full {isConnected ? 'bg-accent/80' : 'bg-danger/80'} {isConnected ? 'animate-pulse' : 'animate-ping'}"></div>
          </div>
        {/if}
      </div>

      <div class="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
        <div class="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-transparent -translate-y-full group-hover:translate-y-full transition-transform duration-1000"></div>
      </div>

      {#if isHovered && !isExpanded}
        <div
          class="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-2 bg-panel/95 backdrop-blur-md border border-sand/30/50 rounded-lg text-sm text-sand/40 whitespace-nowrap"
          in:fade={{ duration: 200 }}
          role="tooltip"
        >
          {isConnected ? 'AI Assistant Ready' : 'AI Disconnected'}
          <div class="absolute top-1/2 -translate-y-1/2 left-full w-0 h-0 border-l-4 border-l-panel border-y-4 border-y-transparent"></div>
        </div>
      {/if}
    </button>
  </div>
{/if}

<style>
  @keyframes scanner {
    0%, 100% { transform: translateY(-100%); }
    50% { transform: translateY(100%); }
  }

  .glow-blue { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
  .glow-green { box-shadow: 0 0 20px rgba(34, 197, 94, 0.5); }
  .glow-purple { box-shadow: 0 0 20px rgba(168, 85, 247, 0.5); }
</style>