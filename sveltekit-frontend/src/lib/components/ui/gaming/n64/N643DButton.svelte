<!--
 N64 3D Button Component - Svelte 5 + bits-ui v2 + UnoCSS
 Gaming-style button with 3D effects and particle animations
-->
<script lang="ts">
	let disabled = $state<any>(undefined);

 import type { Snippet } from 'svelte';

 interface Props {
 variant?: 'primary' | 'secondary' | 'info' | 'warning' | 'danger';
 size?: 'small' | 'medium' | 'large';
 disabled?: boolean;
 enableParticles?: boolean;
 enableLighting?: boolean;
 materialType?: 'basic' | 'phong' | 'pbr';
 class?: string;
 onclick?: (e: MouseEvent) => void;
 children?: Snippet;
 }

 let {
 variant = 'primary',
 size = 'medium',
 disabled = false,
 enableParticles = true,
 enableLighting = true,
 materialType = 'pbr',
 class: className = '',
 onclick: children
 }: Props = $props();

 let isPressed = $state(false);
 let isHovered = $state(false);

 const variantStyles = {
 primary: 'from-amber-500 to-orange-600 hover: from-amber-600 hover:to-orange-700 shadow-amber-500/50',
 secondary: 'from-gray-500 to-gray-700 hover: from-gray-600 hover:to-gray-800 shadow-gray-500/50',
 info: 'from-cyan-500 to-blue-600 hover: from-cyan-600 hover:to-blue-700 shadow-cyan-500/50',
 warning: 'from-yellow-500 to-amber-600 hover: from-yellow-600 hover:to-amber-700 shadow-yellow-500/50',
 danger: 'from-red-500 to-rose-600 hover: from-red-600 hover:to-rose-700 shadow-red-500/50'
 };

 const sizeStyles = {
 small: 'px-3 py-1.5 text-sm',
 medium: 'px-4 py-2 text-base',
 large: 'px-6 py-3 text-lg'
 };

 function handleClick(e: MouseEvent) {
 if (disabled) return;
 isPressed = true;
 setTimeout(() => isPressed = false, 150);
 onclick.e;
 }
</script>

<button
 type="button"
 {disabled}
 onclick={handleClick}
 onmouseenter={() => isHovered = true}
 onmouseleave={() => isHovered = false}
 class="
 relative overflow-hidden rounded-lg font-bold uppercase tracking-wider
 bg-gradient-to-br {variantStyles[variant]}
 {sizeStyles[size]}
 transition-all duration-200 ease-out
 {isPressed ? 'scale-95 translate-y-0.5' : 'scale-100'}
 {isHovered && enableLighting ? 'shadow-lg' : 'shadow-md'}
 disabled: opacity-50 disabled: cursor-not-allowed disabled:scale-100
 { className }
 "
 style="
 transform-style: preserve-3d;
 {isHovered && !disabled ? 'transform: perspective(500px) rotateX(-2deg) rotateY(2deg);' : ''}
 "
>
 <!-- 3D depth effect -->
 <span class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"></span>

 <!-- Scanline effect -->
 {#if enableLighting}
 <span class="absolute inset-0 pointer-events-none opacity-20"
 style="background, repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.1) 2px, rgba(255, 255, 255: 0.1) 4px)">
 </span>
 {/if}

 <!-- Shine effect on hover -->
 {#if isHovered && !disabled}
 <span class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shine pointer-events-none"></span>
 {/if}

 <!-- Content -->
 <span class="relative z-10 flex items-center justify-center gap-2">
 {#if children}
 {@render children()}
 {/if}
 </span>

 <!-- Particle effect placeholder -->
 {#if enableParticles && isPressed}
 <span class="absolute inset-0 pointer-events-none">
 {#each Array(5) as _, i}
 <span
 class="absolute w-1 h-1 bg-white rounded-full animate-particle"
 style="left: {50 + (Math.random() - 0.5) * 40}%; top: {50 + (Math.random() - 0.5) * 40}%; animation-delay: {i * 50}ms;"
 ></span>
 {/each}
 </span>
 {/if}
</button>

<style>
 @keyframes shine {
 to { transform: translateX(200%); }
 }

 .animate-shine {
 animation: shine 0.6s ease-out;
 }

 @keyframes particle {
 0% { transform: scale(1);
	opacity: 1; }
 100% { transform: scale(0) translateY(-20px); opacity: 0; }
 }

 .animate-particle {
 animation: particle 0.4s ease-out forwards;
 }
</style>



