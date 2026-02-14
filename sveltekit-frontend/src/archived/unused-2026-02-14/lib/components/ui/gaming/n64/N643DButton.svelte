<!--
  N64 3D Button Component
  Advanced 3D styling with texture filtering
-->
<script lang="ts">
  import { Button } from 'bits-ui';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface Props {
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    form?: string;
    name?: string;
    value?: string;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    meshComplexity?: 'low' | 'medium' | 'high';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableParticles?: boolean;
    glowIntensity?: number;
    perspective?: number;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;

    class?: string;
    children?: import('svelte').Snippet;

    // Events
    onclick?: (e: MouseEvent) => void;
    onmouseenter?: (e: MouseEvent) => void;
    onmouseleave?: (e: MouseEvent) => void;
    onfocus?: (e: FocusEvent) => void;
    onblur?: (e: FocusEvent) => void;
  }

  let {
    type = 'button',
    disabled = false,
    loading = false,
    form,
    name,
    value,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    renderOptions = {},
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableLighting = true,
    enableReflections = false,
    enableParticles = false,
    glowIntensity = 0.5,
    perspective = 1000,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,

    class: className = '',
    children,

    onclick,
    onmouseenter,
    onmouseleave,
    onfocus,
    onblur
  }: Props = $props();

  let isPressed = $state(false);
  let isHovered = $state(false);

  const effectiveRenderOptions = {
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    ...renderOptions
  };

  function handleClick(e: MouseEvent) {
      if (disabled || loading) return;
      isPressed = true;
      onclick?.(e);
      setTimeout(() => isPressed = false, 150);
  }

</script>

<Button.Root
  {type}
  {disabled}
  {form}
  {name}
  {value}
  onclick={handleClick}
  onmouseenter={(e) => { isHovered = true; onmouseenter?.(e); }}
  onmouseleave={(e) => { isHovered = false; onmouseleave?.(e); }}
  onfocus={onfocus}
  onblur={onblur}
  class="n64-3d-button {variant} {materialType} {className}"
  data-loading={loading}
  data-pressed={isPressed}
  style="
    --perspective: {perspective}px;
    --rot-x: {rotationX}deg;
    --rot-y: {rotationY}deg;
    --rot-z: {rotationZ}deg;
    --glow: {glowIntensity};
  "
>
  {#if loading}
    <div class="spinner"></div>
  {:else if children}
    {@render children()}
  {/if}

  {#if enableLighting}
    <div class="lighting-overlay"></div>
  {/if}
</Button.Root>

<style>
  :global(.n64-3d-button) {
    position: relative;
    padding: 12px 24px;
    font-family: 'Rajdhani', sans-serif;
    text-transform: uppercase;
    font-weight: bold;
    color: white;
    background: #4a90e2;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transform-style: preserve-3d;
    perspective: var(--perspective);
    transform: rotateX(var(--rot-x)) rotateY(var(--rot-y)) rotateZ(var(--rot-z));
    transition: transform 0.1s, box-shadow 0.2s;
    box-shadow: 0 4px 0 #2d5aa0, 0 8px 10px rgba(0,0,0,0.3);
  }

  :global(.n64-3d-button:active), :global(.n64-3d-button[data-pressed="true"]) {
    transform: rotateX(var(--rot-x)) rotateY(var(--rot-y)) rotateZ(var(--rot-z)) translateY(4px);
    box-shadow: 0 0 0 #2d5aa0, 0 4px 6px rgba(0,0,0,0.3);
  }

  :global(.n64-3d-button:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
    filter: grayscale(1);
    transform: none !important;
    box-shadow: none !important;
  }

  .lighting-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 100%);
    pointer-events: none;
    border-radius: 4px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
