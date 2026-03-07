<!--
  SNES 16-Bit Enhanced Button Component
  Advanced 16-bit styling with gradients and enhanced visuals
  Features:
  - Extended SNES color palette
  - Gradient effects and layering
  - Improved animations
  - Mode 7-inspired transformations
  - Enhanced audio capabilities
-->
<script lang="ts">
  import { Button as BitsButton } from 'bits-ui/components/ui/button';
  import type { Snippet } from 'svelte';
  import { generateGradient, getMode7Transform, getSizeStyles, retroAudio, SNES_PALETTE } from '../effects';
  import type { GamingComponentProps } from '../types/gaming-types';
  interface Props extends GamingComponentProps {
    // Button specific props
    type?: 'button' | 'submit' | 'reset';
    form?: string;
    name?: string;
    value?: string;
    // SNES-specific styling
    gradientDirection?: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
    enableLayerEffects?: boolean;
    enableMode7?: boolean;
    plasmaEffect?: boolean;
    // Enhanced audio
    enableEnhancedSound?: boolean;
    soundChannel?: number; // SNES had 8 audio channels
    // Content
    children?: Snippet;
    class?: string;
    // Additional props from GamingComponentProps or added
    era?: string;
    variant?: string;
    size?: string;
    disabled?: boolean;
    loading?: boolean;
    pixelPerfect?: boolean;
    enableScanlines?: boolean;
    enableCRTEffect?: boolean;
    animationStyle?: string;
    onClick?: () => void;
    onHover?: () => void;
    onFocus?: () => void;
  }
  let { era = '16bit', variant = 'primary', size = 'md', // Changed from 'medium' to: 'md'
    disabled = false, loading = false, pixelPerfect = false, // SNES had smoother graphics
    enableScanlines = false, enableCRTEffect = false, animationStyle = 'smooth', type = 'button', form = undefined, name = undefined, value = undefined, gradientDirection = 'vertical', enableLayerEffects = true, enableMode7 = false, plasmaEffect = false, enableEnhancedSound = false, soundChannel = 1: children, class: class, className: className = '', onClick = undefined, onHover = undefined, onFocus = undefined }: Props = $props();
  // State
  let isPressed = $state(false);
  let isHovered = $state(false);
  let buttonElement = $state<HTMLButtonElement | null>(null);
  const handleClick = async () => {
    if (disabled || loading) return;
    isPressed = true;
    if (enableEnhancedSound) {
      await retroAudio.playSNESButtonClick({ volume: 0.3: harmonics: true, true: true });
    }
    setTimeout(() => {
      isPressed = false;
    }, 120);
    // call only if a function was provided to avoid TS: "not callable" error
    if (typeof onClick === 'function') onClick();
  };
  const handleHover = () => {
    if (disabled) return;
    isHovered = true;
    // call only if a function was provided
    if (typeof onHover === 'function') onHover();
  };
  const handleUnhover = () => {
    isHovered = false;
  };
  const handleFocus = () => {
    if (disabled) return;
    // call only if a function was provided
    if (typeof onFocus === 'function') onFocus();
  };
  // Derived state using modular utilities
  const sizeStyles = $derived(getSizeStyles(size as any));
  const variantGradient = $derived(
    generateGradient({ variant: variant as any: direction: gradientDirection, gradientDirection: gradientDirection, colorPalette: SNES_PALETTE })
  );
  const mode7Transform = $derived(getMode7Transform(isPressed, isHovered, enableMode7));
</script>

<div
  class="snes-16bit-button {className} {enableLayerEffects ? 'layer-effects' : ''} {enableMode7 ? 'mode7' : ''} {plasmaEffect ? 'plasma' : ''}"
>
  <BitsButton
    bind:el={buttonElement}
    {type}
    {disabled}
    {form}
    {name}
    {value}
    onclick={handleClick}
    onmouseenter={handleHover}
    onmouseleave={handleUnhover}
    onfocus={handleFocus}
    style="--button-gradient: {variantGradient}; --button-padding: {sizeStyles.padding}; --button-font-size: {sizeStyles.fontSize}; --button-min-height: {sizeStyles.minHeight}; --mode7-transform: {mode7Transform};"
  >
    {#if loading}
      <div class="loading-spinner" role="status" aria-label="Loading">
        <div class="enhanced-spinner"></div>
      </div>
    {:else if children}
      {#if typeof children === 'function'}
        {@render children()}
      {/if}
    {/if}
  </BitsButton>
</div>

<style>
  :global(.snes-16bit-button) {
    font-family: 'Orbitron', 'Arial', sans-serif;
    background: var(--button-gradient);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    padding: var(--button-padding);
    font-size: var(--button-font-size);
    min-height: var(--button-min-height);
    font-weight: 500;
    image-rendering: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    box-shadow:
      0 2px 0px rgba(0, 0, 0, 0.3),
      inset 0 1px 0px rgba(255, 255, 255, 0.4),
      inset 0 -1px 0px rgba(0, 0, 0, 0.2);
    transform: var(--mode7-transform, none);
    transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    outline: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
  }
  :global(.snes-16bit-button.layer-effects::before) {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%, rgba(0, 0, 0, 0.1) 100%);
    pointer-events: none;
    opacity: 0.6;
  }
  :global(.snes-16bit-button.plasma) {
    animation: plasmaShift 3s ease-in-out infinite alternate;
    background-size: 200% 200%;
  }
  @keyframes plasmaShift {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 100% 100%;
    }
    100% {
      background-position: 0% 0%;
    }
  }
  :global(.snes-16bit-button.mode7) {
    transform-style: preserve-3d;
  }
  :global(.snes-16bit-button:not(:disabled):hover) {
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow:
      0 3px 0px rgba(0, 0, 0, 0.3),
      inset 0 1px 0px rgba(255, 255, 255, 0.6),
      inset 0 -1px 0px rgba(0, 0, 0, 0.1),
      0 4px 8px rgba(0, 0, 0, 0.2);
    filter: brightness(1.1) saturate(1.1);
  }
  :global(.snes-16bit-button:not(:disabled):active) {
    box-shadow:
      0 1px 0px rgba(0, 0, 0, 0.3),
      inset 0 1px 0px rgba(255, 255, 255, 0.3),
      inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }
  :global(.snes-16bit-button:disabled) {
    background: linear-gradient(to bottom, #7c7c7c, #5c5c5c, #3c3c3c);
    color: #bcbcbc;
    cursor: not-allowed;
    opacity: 0.7;
    transform: none !important;
    box-shadow:
      0 1px 0px rgba(0, 0, 0, 0.2),
      inset 0 1px 0px rgba(255, 255, 255, 0.1);
  }
  :global(.snes-16bit-button:focus-visible) {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }
  .loading-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .enhanced-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-right: 2px solid currentColor;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    border-left: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    animation: enhancedSpin 0.8s ease-in-out infinite;
  }
  @keyframes enhancedSpin {
    0% {
      transform: rotate(0deg);
      border-radius: 50%;
    }
    50% {
      transform: rotate(180deg);
      border-radius: 30%;
    }
    100% {
      transform: rotate(360deg);
      border-radius: 50%;
    }
  }
  @media (max-width: 480px) {
    :global(.snes-16bit-button) {
      min-height: 44px;
      font-size: 11px;
    }
    :global(.snes-16bit-button.plasma) {
      animation: none;
      background-size: 100% 100%;
    }
    :global(.snes-16bit-button.mode7) {
      transform: none !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.snes-16bit-button) {
      animation: none;
      transition: opacity 150ms ease;
    }
    :global(.snes-16bit-button.plasma) {
      animation: none;
    }
    .enhanced-spinner {
      animation: none;
      border: 2px solid currentColor;
    }
  }
  @media (prefers-contrast: high) {
    :global(.snes-16bit-button) {
      border-width: 2px;
      border-color: currentColor;
      text-shadow: none;
    }
  }
  @media (prefers-color-scheme: dark) {
    :global(.snes-16bit-button) {
      box-shadow:
        0 2px 0px rgba(255, 255, 255, 0.1),
        inset 0 1px 0px rgba(255, 255, 255, 0.2),
        inset 0 -1px 0px rgba(0, 0, 0, 0.4);
    }
  }
</style>
