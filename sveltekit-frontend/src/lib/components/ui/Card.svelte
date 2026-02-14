<!--
 Card Component - Svelte 5 + UnoCSS
 Flexible card container with variants
-->
<script lang="ts">
 import type { Snippet } from 'svelte';

 interface Props {
 variant?: 'default' | 'elevated' | 'outlined' | 'ghost';
 padding?: 'none' | 'sm' | 'md' | 'lg';
 class?: string;
 children?: Snippet;
 }

 let {
 variant = 'default',
 padding = 'md',
 class: className = '',
 children
 }: Props = $props();

 const variantStyles = {
 default: 'bg-panelSoft/50 b b-gray-700',
 elevated: 'bg-panelSoft shadow-lg shadow-black/20 b b-gray-600',
 outlined: 'bg-transparent b-2 b-gray-600',
 ghost: 'bg-panelSoft/20'
 };

 const paddingStyles = {
 none: '',
 sm: 'p-3',
 md: 'p-4',
 lg: 'p-6'
 };
</script>

<div class="rounded-lg {variantStyles[variant]} {paddingStyles[padding]} {className}">
 {#if children}
 {@render children()}
 {/if}
</div>


