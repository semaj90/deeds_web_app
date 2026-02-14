<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    type?: 'menu' | 'info' | 'stats' | 'inventory' | 'battle' | 'magic';
    borderStyle?: 'classic' | 'modern' | 'minimal';
    glowEffect?: boolean;
    animated?: boolean;
    transparent?: boolean;
    children?: import('svelte').Snippet;
  }

  let {
    title = '',
    type = 'menu',
    borderStyle = 'classic',
    glowEffect = false,
    animated = true,
    transparent = false,
    children
  }: Props = $props();

  const typeColors = {
    menu: 'from-panel/95 to-slate-900/95 border-info/80',
    info: 'from-blue-800/95 to-blue-900/95 border-info/80',
    stats: 'from-green-800/95 to-green-900/95 border-accent/80',
    inventory: 'from-amber-800/95 to-amber-900/95 border-warning/80',
    battle: 'from-danger/95 to-danger/95 border-danger/80',
    magic: 'from-purple-800/95 to-purple-900/95 border-info/80'
  };

  const glowColors = {
    menu: 'shadow-info/30',
    info: 'shadow-info/30',
    stats: 'shadow-accent/30',
    inventory: 'shadow-warning/30',
    battle: 'shadow-danger/30',
    magic: 'shadow-info/30'
  };
</script>

<div
  class="ff-container relative bg-gradient-to-br {transparent ? 'from-transparent to-transparent border-opacity-40' : typeColors[type]} border-2 {glowEffect ? `shadow-2xl ${glowColors[type]}` : 'shadow-lg'} {animated ? 'transition-all duration-300 hover:shadow-xl' : ''} {borderStyle === 'classic' ? 'ff-corners-classic' : borderStyle === 'modern' ? 'rounded-lg' : ''}"
>
  <!-- FF-Style Corner Accents -->
  {#if borderStyle === 'classic'}
    <div class="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2"></div>
    <div class="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2"></div>
    <div class="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2"></div>
    <div class="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2"></div>
  {/if}

  <!-- Title Bar -->
  {#if title}
    <div class="relative px-4 py-2 bg-gradient-to-r from-black/40 to-transparent border-b border-white/20">
      <h3 class="text-sm font-bold text-white uppercase tracking-wider text-shadow-lg">
        {title}
      </h3>
      <!-- FF-Style Title Decoration -->
      <div class="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-1 bg-gradient-to-r from-warning to-warning rounded-full animate-pulse"></div>
    </div>
  {/if}

  <!-- Content Area -->
  <div class="p-4">
    {@render children?.()}
  </div>

  <!-- FF-Style Animated Border Lines -->
  {#if animated}
    <div class="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
    <div class="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse delay-1000"></div>
  {/if}
</div>

<style>
  .ff-container {
    backdrop-filter: blur(8px);
  }

  .ff-corners-classic {
    clip-path: polygon(
      0% 8px,
      8px 0%,
      calc(100% - 8px) 0%,
      100% 8px,
      100% calc(100% - 8px),
      calc(100% - 8px) 100%,
      8px 100%,
      0% calc(100% - 8px)
    );
  }

  .text-shadow-lg {
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  }

  /* Subtle background pattern */
  .ff-container::before { content: '';
		position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
    pointer-events: none;
  }
</style>
