<!--
 NES 8-Bit Container Component - Svelte 5 + UnoCSS
 Retro gaming-style container with CRT effects
-->
<script lang="ts">
 import type { Snippet } from 'svelte';

 interface Props {
 enableScanlines?: boolean;
 enableCRTEffect?: boolean;
 enableVignette?: boolean;
 class?: string;
 children?: Snippet;
 }

 let {
 enableScanlines = true,
 enableCRTEffect = true,
 enableVignette = true,
 class: className = '',
 children
 }: Props = $props();
</script>

<div class="nes-container relative {className}">
 <!-- Main content -->
 <div class="relative z-10">
 {#if children}
 {@render children()}
 {/if}
 </div>

 <!-- Scanlines overlay -->
 {#if enableScanlines}
 <div class="scanlines absolute inset-0 pointer-events-none z-20"></div>
 {/if}

 <!-- CRT curvature effect -->
 {#if enableCRTEffect}
 <div class="crt-effect absolute inset-0 pointer-events-none z-30"></div>
 {/if}

 <!-- Vignette effect -->
 {#if enableVignette}
 <div class="vignette absolute inset-0 pointer-events-none z-40"></div>
 {/if}
</div>

<style>
 .nes-container {
 background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
 min-height: 100%;
 }

 .scanlines {
 background: repeating-linear-gradient(
 0deg,
 transparent,
 transparent 2px,
 rgba(0, 0, 0, 0.15) 2px,
 rgba(0, 0, 0, 0.15) 4px
 );
 opacity: 0.4;
 }

 .crt-effect {
 background: radial-gradient(
 ellipse at center,
 transparent 0%,
 transparent 70%,
 rgba(0, 0, 0, 0.1) 100%
 );
 }

 .vignette {
 background: radial-gradient(
 ellipse at center,
 transparent 50%,
 rgba(0, 0, 0, 0.4) 100%
 );
 }

 /* Reduced motion support */
 @media (prefers-reduced-motion: reduce) {
 .scanlines,
 .crt-effect,
 .vignette {
 display: none;
 }
 }
</style>


