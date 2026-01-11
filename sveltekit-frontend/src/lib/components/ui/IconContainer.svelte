<script lang="ts">
 import type { ComponentType } from 'svelte';
 import { onMount } from 'svelte';

 interface Props {
 icon: ComponentType;
 class?: string;
 size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
 }

 let { icon: Icon, class: className, className = '', size = 'md' }: Props = $props();

 // Base size classes for different breakpoints
 const sizeClasses = {
 xs: 'h-3 w-3',
 sm: 'h-4 w-4',
 md: 'h-5 w-5',
 lg: 'h-6 w-6',
 xl: 'h-8 w-8',
 '2xl': 'h-10 w-10'
 };

 // Container query responsive classes
 const responsiveClasses = `
 @container (min-width: 640px) { @apply h-6 w-6; }
 @container (min-width: 768px) { @apply h-7 w-7; }
 @container (min-width: 1024px) { @apply h-8 w-8; }
 @container (min-width: 1280px) { @apply h-10 w-10; }
 `;

 let containerRef: HTMLElement;

 onMount(() => {
 // Apply container query styles dynamically
 if (containerRef) {
 const style = document.createElement('style');
 style.textContent = `
 .icon-container-${size} {
 container-type: inline-size;
 ${responsiveClasses}
 }
 `;
 document.head.appendChild(style);
 }
 });
</script>

<div
 bind:this={containerRef}
 class="icon-container icon-container-{size} {sizeClasses[size]} { className }"
>
 <Icon class="h-full w-full" />
</div>

<style>
 .icon-container {
 container-type: inline-size;
 }

 /* Container query responsive sizing */
 @container (min-width: 640px) {
 .icon-container-xs { @apply h-4 w-4; }
 .icon-container-sm { @apply h-5 w-5; }
 .icon-container-md { @apply h-6 w-6; }
 .icon-container-lg { @apply h-7 w-7; }
 .icon-container-xl { @apply h-9 w-9; }
 .icon-container-2xl { @apply h-11 w-11; }
 }

 @container (min-width: 768px) {
 .icon-container-xs { @apply h-5 w-5; }
 .icon-container-sm { @apply h-6 w-6; }
 .icon-container-md { @apply h-7 w-7; }
 .icon-container-lg { @apply h-8 w-8; }
 .icon-container-xl { @apply h-10 w-10; }
 .icon-container-2xl { @apply h-12 w-12; }
 }

 @container (min-width: 1024px) {
 .icon-container-xs { @apply h-6 w-6; }
 .icon-container-sm { @apply h-7 w-7; }
 .icon-container-md { @apply h-8 w-8; }
 .icon-container-lg { @apply h-9 w-9; }
 .icon-container-xl { @apply h-11 w-11; }
 .icon-container-2xl { @apply h-14 w-14; }
 }

 @container (min-width: 1280px) {
 .icon-container-xs { @apply h-7 w-7; }
 .icon-container-sm { @apply h-8 w-8; }
 .icon-container-md { @apply h-9 w-9; }
 .icon-container-lg { @apply h-10 w-10; }
 .icon-container-xl { @apply h-12 w-12; }
 .icon-container-2xl { @apply h-16 w-16; }
 }
</style>
