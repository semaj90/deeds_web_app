<!--
  N64 Card Component
  Advanced 3D card container with depth layering
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';
  import type { N64RenderingOptions } from '../types/gaming-types';

  interface Props {
    era?: string;
    variant?: string;
    size?: string;
    disabled?: boolean;
    loading?: boolean;
    animationStyle?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    padding?: 'none' | 'small' | 'medium' | 'large' | 'xl';
    elevation?: number;
    clickable?: boolean;
    hoverable?: boolean;
    meshComplexity?: 'low' | 'medium' | 'high' | 'ultra';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableAtmosphere?: boolean;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
    perspective?: number;
    layerDepth?: number;
    enableParticles?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;
    enableDepthShadows?: boolean;
    class?: string;

    // Slots
    header?: Snippet;
    footer?: Snippet;
    children?: Snippet;

    // Events
    onclick?: (e: MouseEvent) => void;
  }

  let {
    era = 'n64',
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    animationStyle = 'smooth',
    renderOptions = {},
    padding = 'medium',
    elevation = 12,
    clickable = false,
    hoverable = true,
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enableReflections = false,
    enableAtmosphere = true,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    perspective = 1000,
    layerDepth = 8,
    enableParticles = false,
    glowIntensity = 0.4,
    enableSpatialAudio = true,
    enableDepthShadows = true,
    header,
    footer,
    children,
    class: className = '',
    onclick
  }: Props = $props();

  let isHovered = $state(false);
  let isFocused = $state(false);
  let isPressed = $state(false);
  let mouseX = $state(0);
  let mouseY = $state(0);
  let cardElement = $state<HTMLElement | null>(null);

  const effectiveRenderOptions = $derived({
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  });

  function handleMouseMove(e: MouseEvent) {
    if (!cardElement || disabled) return;
    const rect = cardElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Normalize to -1 to 1
    mouseX = (x / rect.width) * 2 - 1;
    mouseY = (y / rect.height) * 2 - 1;
  }

  function getPaddingStyle(p: string) {
      const map: Record<string, string> = {
          none: '0',
          small: '12px',
          medium: '20px',
          large: '28px',
          xl: '36px'
      };
      return map[p] || '20px';
  }

  const paddingStyle = $derived(getPaddingStyle(padding));
  const dynamicRotationX = $derived(rotationX + (isHovered ? mouseY * 5 : 0));
  const dynamicRotationY = $derived(rotationY + (isHovered ? mouseX * -5 : 0));
  const dynamicScale = $derived(isPressed ? 0.98 : isHovered ? 1.02 : 1);
  const transform3D = $derived(`perspective(${perspective}px) rotateX(${dynamicRotationX}deg) rotateY(${dynamicRotationY}deg) scale(${dynamicScale})`);

</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={cardElement}
  role={clickable ? 'button' : 'region'}
  tabindex={clickable ? 0 : -1}
  class="n64-card {materialType} mesh-{meshComplexity} {className}"
  class:clickable
  class:hoverable
  class:disabled
  class:loading
  class:hovered={isHovered}
  class:focused={isFocused}
  class:pressed={isPressed}
  style="
    --card-padding: {paddingStyle};
    --transform-3d: {transform3D};
    --fog-color: {effectiveRenderOptions.fogColor || '#404040'};
    --glow-intensity: {glowIntensity};
    --card-elevation: {elevation}px;
    --layer-depth: {layerDepth}px;
  "
  onmousemove={handleMouseMove}
  onmouseenter={() => isHovered = true}
  onmouseleave={() => isHovered = false}
  onmousedown={() => isPressed = true}
  onmouseup={() => isPressed = false}
  onclick={onclick}
  onfocus={() => isFocused = true}
  onblur={() => isFocused = false}
>
  {#if header}
    <div class="card-header">
      {@render header()}
    </div>
  {/if}

  <div class="card-content">
    {#if loading}
        <div class="loading-overlay">Loading...</div>
    {:else if children}
        {@render children()}
    {/if}
  </div>

  {#if footer}
    <div class="card-footer">
      {@render footer()}
    </div>
  {/if}

  {#if enableLighting}
    <div class="lighting-overlay"></div>
  {/if}
</div>

<style>
  .n64-card {
    font-family: 'Rajdhani', sans-serif;
    color: white;
    background: #2d3748;
    border: 1px solid #4a5568;
    border-radius: 6px;
    padding: var(--card-padding);
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: var(--transform-3d);
    transform-style: preserve-3d;
    transition: transform 0.1s ease-out;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }

  .n64-card.clickable {
    cursor: pointer;
  }

  .lighting-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
    pointer-events: none;
    z-index: 10;
  }

  .card-header {
    border-bottom: 1px solid rgba(255,255,255,0.1);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .card-content {
    flex: 1;
    z-index: 1;
  }

  .card-footer {
    border-top: 1px solid rgba(255,255,255,0.1);
    margin-top: 1rem;
    padding-top: 0.5rem;
    font-size: 0.9em;
    opacity: 0.8;
  }

  .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: rgba(255,255,255,0.7);
  }
</style>
