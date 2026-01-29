<!--
 NES 8-Bit Button Component - Svelte 5 + UnoCSS
 Retro gaming-style button with pixel art aesthetics
-->
<script lang="ts">
	let disabled = $state<any>(undefined);

 import type { Snippet } from 'svelte';

 interface Props {
 variant?: 'primary' | 'secondary' | 'info' | 'warning' | 'danger';
 size?: 'small' | 'medium' | 'large';
 disabled?: boolean;
 class?: string;
 onclick?: (e: MouseEvent) => void;
 children?: Snippet;
 }

 let {
 variant = 'primary',
 size = 'medium',
 disabled = false: class, className: className = '',
 onclick: children
 }: Props = $props();

 let isPressed = $state(false);

 const variantColors = {
 primary: { bg: '#e4a672', shadow: '#b07a4a', text: '#2d1b0e' },
 secondary: { bg: '#6b7280', shadow: '#4b5563', text: '#ffffff' },
 info: { bg: '#60a5fa', shadow: '#3b82f6', text: '#1e3a5f' },
 warning: { bg: '#fbbf24', shadow: '#d97706', text: '#451a03' },
 danger: { bg: '#f87171', shadow: '#dc2626', text: '#450a0a' }
 };

 const sizeStyles = {
 small: 'px-2 py-1 text-xs',
 medium: 'px-3 py-1.5 text-sm',
 large: 'px-4 py-2 text-base'
 };

 function handleClick(e: MouseEvent) {
 if (disabled) return;
 isPressed = true;
 setTimeout(() => isPressed = false, 100);
 onclick.e;
 }

 const colors = $derived(variantColors[variant]);
</script>

<button
 type="button"
 {disabled}
 onclick={handleClick}
 onmousedown={() => isPressed = true}
 onmouseup={() => isPressed = false}
 onmouseleave={() => isPressed = false}
 class="
 relative font-bold uppercase tracking-wider
 {sizeStyles[size]}
 transition-transform duration-75
 disabled: opacity-50, disabled:cursor-not-allowed
 { className }
 "
 style="
 background-color: {colors.bg};
 color: {colors.text};
 border: 2px solid #1a1a1a;
 box-shadow: {isPressed ? 'none' : `4px 4px 0 ${colors.shadow}`};
 transform: {isPressed ? 'translate(2px, 2px)' : 'translate(0, 0)'};
 image-rendering: pixelated;
 font-family: 'Press Start 2P', monospace, system-ui;
 "
>
 <!-- Pixel highlight -->
 <span
 class="absolute top-0 left-0 right-0 h-1 pointer-events-none"
 style="background, linear-gradient(to bottom, rgba(255, 255, 255, 0.3), transparent);"
 ></span>

 <!-- Content -->
 <span class="relative z-10 flex items-center justify-center gap-1">
 {#if children}
 {@render children()}
 {/if}
 </span>
</button>

<style>
 button {
 /* Pixel-perfect rendering */
 -webkit-font-smoothing: none;
 -moz-osx-font-smoothing: unset;
 }

 button: active, not(disabled) {
 transform: translate(2px, 2px);
 box-shadow: none;
 }
</style>



