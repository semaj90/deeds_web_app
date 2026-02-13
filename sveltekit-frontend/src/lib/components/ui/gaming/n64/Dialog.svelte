<!--
  N64 Dialog Component
  Advanced 3D modal with atmospheric depth
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface Props {
    open?: boolean;
    title?: string;
    description?: string;
    closeOnEscape?: boolean;
    closeOnOutsideClick?: boolean;
    preventClose?: boolean;
    portal?: boolean;
    portalTarget?: string;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    animationStyle?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    meshComplexity?: 'low' | 'medium' | 'high' | 'ultra';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableAtmosphere?: boolean;
    enableBackdropBlur?: boolean;
    dialogDepth?: number;
    perspective?: number;
    entranceAnimation?: 'zoom' | 'slide-up' | 'slide-down' | 'fade' | 'portal';
    enableParticles?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;
    atmosphereIntensity?: number;
    maxWidth?: string;
    maxHeight?: string;
    fullscreen?: boolean;
    class?: string;

    // Slots
    header?: Snippet;
    footer?: Snippet;
    children?: Snippet;

    // Events
    onclose?: () => void;
  }

  let {
    open = $bindable(false),
    title,
    description,
    closeOnEscape = true,
    closeOnOutsideClick = true,
    preventClose = false,
    portal = true,
    portalTarget = 'body',

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    animationStyle = 'smooth',
    renderOptions = {},
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = true,
    enableFog = true,
    enableLighting = true,
    enableReflections = true,
    enableAtmosphere = true,
    enableBackdropBlur = true,
    dialogDepth = 32,
    perspective = 1200,
    entranceAnimation = 'portal',
    enableParticles = true,
    glowIntensity = 0.6,
    enableSpatialAudio = true,
    atmosphereIntensity = 0.4,
    maxWidth = '90vw',
    maxHeight = '90vh',
    fullscreen = false,
    header,
    footer,
    children,
    class: className = '',

    onclose
  }: Props = $props();

  let dialogElement = $state<HTMLElement | null>(null);

  const effectiveRenderOptions = {
    ...N64_TEXTURE_PRESETS.highQuality,
    ...renderOptions
  };

  function closeDialog() {
      if (preventClose) return;
      open = false;
      onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape' && closeOnEscape) {
          closeDialog();
      }
  }

  function handleBackdropClick(e: MouseEvent) {
      if (closeOnOutsideClick && e.target === e.currentTarget) {
          closeDialog();
      }
  }

  // Effect to lock body scroll
  $effect(() => {
    if (typeof document !== 'undefined') {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
  });

</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="n64-dialog-backdrop"
    class:blur={enableBackdropBlur}
    role="button"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    aria-label="Close dialog"
  >
    <div
      bind:this={dialogElement}
      class="n64-dialog {materialType} mesh-{meshComplexity} entrance-{entranceAnimation} {className}"
      class:fullscreen
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      style="
        --dialog-max-width: {maxWidth};
        --dialog-max-height: {maxHeight};
        --dialog-depth: {dialogDepth}px;
        --perspective: {perspective}px;
        --glow-intensity: {glowIntensity};
      "
      onclick={(e) => e.stopPropagation()}
    >
      {#if title || header}
        <div class="dialog-header">
          {#if header}
            {@render header()}
          {:else if title}
            <h2 id="dialog-title">{title}</h2>
          {/if}

          {#if !preventClose}
            <button class="close-button" onclick={closeDialog} aria-label="Close">×</button>
          {/if}
        </div>
      {/if}

      {#if description}
        <div class="dialog-description">{description}</div>
      {/if}

      <div class="dialog-content">
        {#if children}
            {@render children()}
        {/if}
      </div>

      {#if footer}
        <div class="dialog-footer">
            {@render footer()}
        </div>
      {/if}

      {#if enableLighting}
        <div class="lighting-overlay"></div>
      {/if}

      {#if enableAtmosphere}
        <div class="atmosphere-overlay"></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .n64-dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    perspective: 1000px;
  }

  .n64-dialog-backdrop.blur {
    backdrop-filter: blur(5px);
  }

  .n64-dialog {
    background: #2d3748;
    color: white;
    border: 1px solid #4a5568;
    border-radius: 8px;
    width: 100%;
    max-width: var(--dialog-max-width);
    max-height: var(--dialog-max-height);
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    transform-style: preserve-3d;
    font-family: 'Rajdhani', sans-serif;
  }

  .n64-dialog.entrance-portal {
    animation: portalIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  @keyframes portalIn {
    from { transform: scale(0.8) rotateX(10deg); opacity: 0; }
    to { transform: scale(1) rotateX(0deg); opacity: 1; }
  }

  .dialog-header {
    padding: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dialog-title {
      margin: 0;
      font-size: 1.25em;
      text-transform: uppercase;
  }

  .close-button {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.5);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
  }

  .close-button:hover {
      color: white;
  }

  .dialog-description {
      padding: 0 16px 8px;
      color: rgba(255,255,255,0.7);
      font-size: 0.9em;
  }

  .dialog-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .dialog-footer {
    padding: 16px;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .lighting-overlay, .atmosphere-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: 8px;
  }

  .lighting-overlay {
    background: linear-gradient(135deg, rgba(255,255,255,0.05), transparent);
  }

  .atmosphere-overlay {
      box-shadow: inset 0 0 50px rgba(0,0,0,0.2);
  }
</style>
